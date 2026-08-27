import { LOCATION } from "./config.js";
import type { WeatherPoint } from "./types.js";

/*
 * GeoSphere Austria integration summary (verified live against the API, 2026-08-27):
 *
 *   Current endpoint:     https://dataset.api.hub.geosphere.at/v1/timeseries/{historical,forecast}/...
 *   Past leg model:       INCA analysis (inca-v1-1h-1km) - observed/analyzed, not a forecast.
 *   Future leg model:     AROME (nwp-v2-1h-1km) - deterministic NWP.
 *   Ensemble model:       ensemble-v2-1h-1km, GeoSphere's C-LAEF-class AlpeAdria ensemble product.
 *   Grid resolution:      1km for all three datasets.
 *   Forecast horizon:     61h per reference_time cycle for both AROME and the ensemble; cycles
 *                         every 3h. Real availability from "now" is therefore ~52-58h, not a flat
 *                         60h - fetchWeatherWindow returns whatever is actually available and never
 *                         pads the tail.
 *   Update frequency:     AROME/ensemble: new cycle every 3h. INCA: hourly, ~1h analysis latency
 *                         (the most recent hour before "now" may be absent).
 *   Variables downloaded: INCA: RR (precip mm), T2M (°C), GL (radiation W/m²), RH2M (%),
 *                         TD2M (dew point °C), UU/VV (wind components, m/s).
 *                         AROME: tp (precip mm), 2t (°C), ssrd (radiation W/m²), 2r (%),
 *                         10u/10v (wind components, m/s), 10fg (gust, m/s). No dew point field -
 *                         computed from 2t/2r via calculateDewPoint (see painting.ts).
 *                         Ensemble: tp_p10/tp_p50/tp_p90 (precip amount percentiles, mm) - amount
 *                         percentiles, NOT an exceedance probability; see painting.ts's
 *                         rainProbabilityBand for how a probability band is derived from these
 *                         without inventing precision the ensemble doesn't support.
 */

const FORECAST_BASE = "https://dataset.api.hub.geosphere.at/v1/timeseries/forecast";
const HISTORICAL_BASE = "https://dataset.api.hub.geosphere.at/v1/timeseries/historical";
const AROME_DATASET = "nwp-v2-1h-1km";
const INCA_DATASET = "inca-v1-1h-1km";
const ENSEMBLE_DATASET = "ensemble-v2-1h-1km";

interface GeoSphereResponse {
  timestamps: string[];
  features: [{ properties: { parameters: Record<string, { data: (number | null)[] }> } }];
}

function toLocalWallClock(isoUtc: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(isoUtc));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Formats a Date as the naive "YYYY-MM-DDTHH:MM" (UTC) string GeoSphere's start/end params expect. */
function toUtcParam(d: Date): string {
  return d.toISOString().slice(0, 16);
}

async function fetchDataset(
  baseUrl: string,
  datasetId: string,
  parameters: string[],
  extraParams?: Record<string, string>
): Promise<GeoSphereResponse> {
  const url = new URL(`${baseUrl}/${datasetId}`);
  for (const p of parameters) url.searchParams.append("parameters", p);
  url.searchParams.set("lat_lon", `${LOCATION.latitude},${LOCATION.longitude}`);
  for (const [k, v] of Object.entries(extraParams ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GeoSphere ${datasetId} request failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as GeoSphereResponse;
}

function getSeries(response: GeoSphereResponse, param: string): (number | null)[] | undefined {
  return response.features[0].properties.parameters[param]?.data;
}

function windSpeedKmh(u: number | null | undefined, v: number | null | undefined): number | null {
  if (u == null || v == null) return null;
  return Math.sqrt(u * u + v * v) * 3.6;
}

/** Magnus-Tetens dew point approximation - AROME has no dew point field, so forecast-leg dew
 * point is always computed rather than sourced directly (INCA's TD2M is used as-is instead). */
export function calculateDewPoint(tempC: number, relativeHumidityPct: number): number {
  const a = 17.625;
  const b = 243.04;
  const rh = Math.min(100, Math.max(0.01, relativeHumidityPct));
  const alpha = Math.log(rh / 100) + (a * tempC) / (b + tempC);
  return (b * alpha) / (a - alpha);
}

function incaToPoints(response: GeoSphereResponse): WeatherPoint[] {
  const precip = getSeries(response, "RR");
  const temp = getSeries(response, "T2M");
  const radiation = getSeries(response, "GL");
  const humidity = getSeries(response, "RH2M");
  const dewPoint = getSeries(response, "TD2M");
  const u = getSeries(response, "UU");
  const v = getSeries(response, "VV");
  if (!precip || !temp || !radiation || !humidity) {
    throw new Error("Missing expected core parameters in INCA response (RR/T2M/GL/RH2M)");
  }
  return response.timestamps.map((t, i) => ({
    time: toLocalWallClock(t, LOCATION.timezone),
    ms: new Date(t).getTime(),
    precipitationMm: precip[i] ?? null,
    temperatureC: temp[i] ?? null,
    radiationWm2: radiation[i] ?? null,
    humidityPct: humidity[i] ?? null,
    dewPointC: dewPoint?.[i] ?? null,
    windSpeedKmh: windSpeedKmh(u?.[i], v?.[i]),
    windGustKmh: null,
    precipEnsemble: null,
  }));
}

function aromeToPoints(response: GeoSphereResponse): WeatherPoint[] {
  const precip = getSeries(response, "tp");
  const temp = getSeries(response, "2t");
  const radiation = getSeries(response, "ssrd");
  const humidity = getSeries(response, "2r");
  const u = getSeries(response, "10u");
  const v = getSeries(response, "10v");
  const gust = getSeries(response, "10fg");
  if (!precip || !temp || !radiation || !humidity) {
    throw new Error("Missing expected core parameters in AROME response (tp/2t/ssrd/2r)");
  }
  return response.timestamps.map((t, i) => {
    const tempC = temp[i] ?? null;
    const rh = humidity[i] ?? null;
    return {
      time: toLocalWallClock(t, LOCATION.timezone),
      ms: new Date(t).getTime(),
      precipitationMm: precip[i] ?? null,
      temperatureC: tempC,
      radiationWm2: radiation[i] ?? null,
      humidityPct: rh,
      dewPointC: tempC !== null && rh !== null ? calculateDewPoint(tempC, rh) : null,
      windSpeedKmh: windSpeedKmh(u?.[i], v?.[i]),
      windGustKmh: gust?.[i] != null ? gust[i]! * 3.6 : null,
      precipEnsemble: null,
    };
  });
}

/** Merges ensemble tp_p10/p50/p90 percentiles onto the future points that already exist at the
 * matching timestamp - the ensemble is never a standalone source of points, only an enrichment of
 * the AROME future leg (attaching it to hours the deterministic model doesn't cover would imply a
 * false precision the merge can't actually justify). */
function attachEnsemble(points: WeatherPoint[], response: GeoSphereResponse): void {
  const p10 = getSeries(response, "tp_p10");
  const p50 = getSeries(response, "tp_p50");
  const p90 = getSeries(response, "tp_p90");
  if (!p10 || !p50 || !p90) return;
  const byMs = new Map(points.map((p) => [p.ms, p]));
  response.timestamps.forEach((t, i) => {
    const point = byMs.get(new Date(t).getTime());
    if (!point) return;
    const lo = p10[i];
    const mid = p50[i];
    const hi = p90[i];
    if (lo == null || mid == null || hi == null) return;
    point.precipEnsemble = { p10: lo, p50: mid, p90: hi };
  });
}

/**
 * Builds a single hourly series spanning [now - pastHours, now + aheadHours): the past leg comes
 * from INCA (GeoSphere's observed 1km/1h analysis, not a forecast), the future leg from AROME
 * enriched with the ensemble's precipitation percentiles where available. The ~1h INCA latency
 * means the most recent hour before "now" may simply be absent from either leg - left out rather
 * than synthesized, consistent with "null at the edge of the horizon". Likewise, if the requested
 * aheadHours exceeds what AROME/the ensemble actually have available for this cycle, the returned
 * series is simply shorter - never padded with fabricated future hours.
 */
export async function fetchWeatherWindow(now: Date, pastHours: number, aheadHours: number): Promise<WeatherPoint[]> {
  const pastStart = new Date(now.getTime() - pastHours * 3600_000);
  const aheadEnd = new Date(now.getTime() + aheadHours * 3600_000);

  const [inca, arome, ensemble] = await Promise.all([
    fetchDataset(HISTORICAL_BASE, INCA_DATASET, ["RR", "T2M", "GL", "RH2M", "TD2M", "UU", "VV"], {
      start: toUtcParam(pastStart),
      end: toUtcParam(now),
    }),
    fetchDataset(FORECAST_BASE, AROME_DATASET, ["tp", "2t", "ssrd", "2r", "10u", "10v", "10fg"]),
    fetchDataset(FORECAST_BASE, ENSEMBLE_DATASET, ["tp_p10", "tp_p50", "tp_p90"]).catch(() => null),
  ]);

  const pastPoints = incaToPoints(inca);
  const futurePoints = aromeToPoints(arome).filter((p) => p.ms <= aheadEnd.getTime());
  if (ensemble) attachEnsemble(futurePoints, ensemble);

  const byMs = new Map<number, WeatherPoint>();
  for (const p of [...pastPoints, ...futurePoints]) {
    byMs.set(p.ms, p);
  }

  return [...byMs.values()].sort((a, b) => a.ms - b.ms);
}
