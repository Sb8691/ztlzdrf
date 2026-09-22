import { LOCATION, type OutlookModel } from "./config.js";
import type { WeatherPoint } from "./types.js";
import { toLocalWallClock } from "./time.js";
import { calculateDewPoint } from "./geosphere.js";

/*
 * Open-Meteo Ensemble API integration (verified live 2026-09-22):
 *
 *   Endpoint:   https://ensemble-api.open-meteo.com/v1/ensemble - free for non-commercial use, no
 *               key, one request per model. `timeformat=unixtime` makes `hourly.time` UTC epoch
 *               seconds (the local `time` label is derived here, never parsed back).
 *   Members:    the base variable (e.g. `precipitation`) is the control run, `_member01..NN` the
 *               perturbed members - 51 for ECMWF IFS/AIFS ENS, 31 for GEFS. A model whose horizon
 *               does not reach the requested dates answers HTTP 200 with all-null columns, not an
 *               error, so "no coverage" has to be detected from the data.
 *   Units:      mm, °C, %, km/h, W/m² - the same as WeatherPoint, no conversion needed.
 *   Run meta:   https://ensemble-api.open-meteo.com/data/{domain}/static/meta.json exposes the
 *               last run's initialisation time and the last timestamp it reaches
 *               (`data_end_time`). ECMWF's 06z/18z ENS cycles only run 144h, so beyond that the
 *               API still serves the previous 00z/12z run's hours - effectiveRunAt() accounts for
 *               that so a snapshot is labelled with the run its numbers actually come from.
 */

const ENSEMBLE_BASE = "https://ensemble-api.open-meteo.com/v1/ensemble";
const META_BASE = "https://ensemble-api.open-meteo.com/data";

const HOURLY_VARS = [
  "precipitation",
  "temperature_2m",
  "relative_humidity_2m",
  "dew_point_2m",
  "wind_speed_10m",
  "wind_gusts_10m",
  "shortwave_radiation",
] as const;

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
}

/** fetch + JSON with a per-attempt timeout and exponential backoff. Retries network errors,
 * timeouts, 429 and 5xx; any other 4xx is a caller bug and fails immediately. */
export async function fetchJson<T>(url: string | URL, opts: FetchOptions = {}): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const retries = opts.retries ?? 3;
  const backoffMs = opts.backoffMs ?? 1500;
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return (await res.json()) as T;
      const body = (await res.text()).slice(0, 200);
      const err = new Error(`${res.status} ${res.statusText} for ${url}: ${body}`);
      if (res.status !== 429 && res.status < 500) throw err;
      lastError = err;
    } catch (err) {
      if (err instanceof Error && /^\d{3} /.test(err.message) && !err.message.startsWith("429") && !/^5\d\d /.test(err.message)) throw err;
      lastError = err;
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, backoffMs * 2 ** attempt));
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export interface RunMeta {
  initAtMs: number;
  availableAtMs: number;
  dataEndMs: number;
  updateIntervalS: number;
}

interface MetaJson {
  last_run_initialisation_time: number;
  last_run_availability_time: number;
  data_end_time: number;
  update_interval_seconds: number;
}

/** Best effort: null when the domain has no metadata (some domains answer 500). */
export async function fetchRunMeta(domain: string | null, opts: FetchOptions = {}): Promise<RunMeta | null> {
  if (!domain) return null;
  try {
    const j = await fetchJson<MetaJson>(`${META_BASE}/${domain}/static/meta.json`, { retries: 1, ...opts });
    if (![j.last_run_initialisation_time, j.data_end_time, j.update_interval_seconds].every(Number.isFinite)) return null;
    return {
      initAtMs: j.last_run_initialisation_time * 1000,
      availableAtMs: (j.last_run_availability_time ?? j.last_run_initialisation_time) * 1000,
      dataEndMs: j.data_end_time * 1000,
      updateIntervalS: j.update_interval_seconds,
    };
  } catch {
    return null;
  }
}

/**
 * The run the window's numbers actually come from. When the latest run's horizon ends before the
 * window (ECMWF 06z/18z ENS: 144h), Open-Meteo still serves the previous cycle's hours there, so
 * the snapshot is attributed to that previous cycle. Without metadata the fetch hour is used and
 * flagged, so dedupe falls back to content comparison (see mergeHistory).
 */
export function effectiveRunAt(meta: RunMeta | null, windowEndMs: number, fetchedAtMs: number): { runAtMs: number; source: "meta" | "fetch" } {
  if (!meta) return { runAtMs: Math.floor(fetchedAtMs / 3600_000) * 3600_000, source: "fetch" };
  if (meta.dataEndMs >= windowEndMs - 3600_000) return { runAtMs: meta.initAtMs, source: "meta" };
  return { runAtMs: meta.initAtMs - meta.updateIntervalS * 1000, source: "meta" };
}

export interface EnsembleResponse {
  latitude: number;
  longitude: number;
  elevation: number;
  utc_offset_seconds: number;
  hourly_units: Record<string, string>;
  hourly: { time: number[] } & Record<string, (number | null)[]>;
}

function memberSuffixes(hourly: Record<string, unknown>): string[] {
  return Object.keys(hourly)
    .filter((k) => /^precipitation(_member\d+)?$/.test(k))
    .map((k) => k.slice("precipitation".length))
    .sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)));
}

/** One WeatherPoint[] per ensemble member (control first). Members without a single non-null
 * precipitation/temperature value are dropped - that is how an out-of-horizon model shows up. */
export function responseToMemberPoints(res: EnsembleResponse, timeZone: string): WeatherPoint[][] {
  const h = res.hourly;
  const times = h.time ?? [];
  const members: WeatherPoint[][] = [];
  for (const sfx of memberSuffixes(h)) {
    const col = (name: string): (number | null)[] => h[`${name}${sfx}`] ?? [];
    const precip = col("precipitation");
    const temp = col("temperature_2m");
    const rh = col("relative_humidity_2m");
    const dew = col("dew_point_2m");
    const wind = col("wind_speed_10m");
    const gust = col("wind_gusts_10m");
    const rad = col("shortwave_radiation");
    let anyData = false;
    const points: WeatherPoint[] = times.map((t, i) => {
      const ms = t * 1000;
      const tempC = temp[i] ?? null;
      const rhPct = rh[i] ?? null;
      if (precip[i] != null || tempC !== null) anyData = true;
      const dewPointC = dew[i] ?? (tempC !== null && rhPct !== null ? calculateDewPoint(tempC, rhPct) : null);
      return {
        time: toLocalWallClock(ms, timeZone),
        ms,
        precipitationMm: precip[i] ?? null,
        temperatureC: tempC,
        radiationWm2: rad[i] ?? null,
        humidityPct: rhPct,
        dewPointC,
        windSpeedKmh: wind[i] ?? null,
        windGustKmh: gust[i] ?? null,
        precipEnsemble: null,
      };
    });
    if (anyData) members.push(points);
  }
  return members;
}

export interface EnsembleFetch {
  model: OutlookModel;
  members: WeatherPoint[][];
  grid: { latitude: number; longitude: number; elevation: number };
  fetchedAtMs: number;
}

/** Hourly member series for [startDate, endDate] (local dates, inclusive) from one ensemble model. */
export async function fetchEnsembleMembers(model: OutlookModel, startDate: string, endDate: string, opts: FetchOptions = {}): Promise<EnsembleFetch> {
  const url = new URL(ENSEMBLE_BASE);
  url.searchParams.set("latitude", String(LOCATION.latitude));
  url.searchParams.set("longitude", String(LOCATION.longitude));
  url.searchParams.set("hourly", HOURLY_VARS.join(","));
  url.searchParams.set("models", model.id);
  url.searchParams.set("start_date", startDate);
  url.searchParams.set("end_date", endDate);
  url.searchParams.set("timezone", LOCATION.timezone);
  url.searchParams.set("timeformat", "unixtime");
  const fetchedAtMs = Date.now();
  const res = await fetchJson<EnsembleResponse & { error?: boolean; reason?: string }>(url, opts);
  if (res.error) throw new Error(`Open-Meteo ${model.id}: ${res.reason ?? "unknown error"}`);
  return {
    model,
    members: responseToMemberPoints(res, LOCATION.timezone),
    grid: { latitude: res.latitude, longitude: res.longitude, elevation: res.elevation },
    fetchedAtMs,
  };
}
