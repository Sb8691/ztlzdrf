import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SkiConfig } from "./config.js";
import { fetchJson } from "./fetch-json.js";
import { HORIZON_KEYS, SKI_SNAPSHOT_VERSION, indexByTime, parsePoints, pointsUrl, powderSnow, windowSnowCm } from "./ski-core.js";
import type { SkiSnapshot } from "./ski.js";

/**
 * Step 5 of the powder model (METODIKA §5.2): every generator run that fetched fresh data appends
 * one JSON line to data/prospective/<season>.jsonl, so the 2026/27 season can be verified against
 * station truth exactly as the page saw it - which run, which lead, which probability.
 *
 * Besides the four resorts the line carries the same forecast for the stations that measure new
 * snow, because the resorts' top stations have no truth of their own (step 1). For the ensemble it
 * keeps every member's window sum, the raw material for a lead law beyond day 2 after the season.
 * Nothing here is read by the page.
 */

export const FORECAST_LOG_VERSION = 1;

/** Stations with daily new-snow truth (METODIKA §3.9), coordinates from the operators' metadata. */
export const VERIFICATION_STATIONS = [
  { id: "geosphere:20020", name: "Villacher Alpe (ručná)", latitude: 46.60361, longitude: 13.67333, elevation: 2140 },
  { id: "geosphere:122", name: "Kanzelhöhe", latitude: 46.67722, longitude: 13.90194, elevation: 1520 },
  { id: "geosphere:186", name: "Flattnitz", latitude: 46.94083, longitude: 14.03611, elevation: 1437.2 },
  { id: "geosphere:15715", name: "Katschberg", latitude: 47.06056, longitude: 13.61472, elevation: 1635 },
  { id: "lwd:2900265", name: "LWD Turracherhoehe", latitude: 46.9195, longitude: 13.8731, elevation: 1795 },
  { id: "lwd:2900240", name: "LWD Falkert", latitude: 46.8580627, longitude: 13.8308913, elevation: 1886 },
];

export type HorizonKey = "now" | "short" | "long";
export type Responses = Record<string, { data: unknown; meta: unknown }>;
export type StationResponses = Partial<Record<HorizonKey, unknown>>;

export interface ForecastLogLine {
  v: number;
  fetchedAtMs: number;
  firstDate: string;
  snapshotVersion: number;
  modelVersion: number;
  horizons: Record<string, {
    model: string;
    runAtMs: number | null;
    publishedAtMs: number | null;
    resorts: Record<string, Record<string, unknown>[]>;
    stations?: Record<string, Record<string, unknown>[]>;
  }>;
}

/** "2026-27" for any date from August 2026 to July 2027. */
export function seasonName(isoDate: string): string {
  const y = Number(isoDate.slice(0, 4));
  const start = Number(isoDate.slice(5, 7)) >= 8 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function stationsUrl(cfg: SkiConfig, key: HorizonKey, firstDate: string): string {
  return pointsUrl(cfg, key, firstDate, VERIFICATION_STATIONS);
}

/** The deterministic horizons at the verification stations; sequential like the page's own requests. */
export async function fetchStationResponses(cfg: SkiConfig, firstDate: string): Promise<StationResponses> {
  const out: StationResponses = {};
  for (const key of HORIZON_KEYS as HorizonKey[]) {
    if (cfg.horizons[key].ensemble) continue;
    out[key] = await fetchJson<unknown>(stationsUrl(cfg, key, firstDate), { timeoutMs: 60_000 });
  }
  return out;
}

const tenth = (v: number | null): number | null => (v === null ? null : Math.round(v * 10) / 10);

type Member = { temperature: (number | null)[]; precipitation: (number | null)[] };
type ParsedPoint = { timesMs: number[]; members: Member[] };

/** One line of the log from what the generator has in hand. Station responses are optional - a failed
 * station fetch still leaves the resorts' line. */
export function buildForecastLog(snapshot: SkiSnapshot, responses: Responses, stations: StationResponses | null, cfg: SkiConfig): ForecastLogLine {
  const line: ForecastLogLine = { v: FORECAST_LOG_VERSION, fetchedAtMs: snapshot.fetchedAtMs, firstDate: snapshot.firstDate, snapshotVersion: SKI_SNAPSHOT_VERSION, modelVersion: cfg.powder.version, horizons: {} };
  for (const key of HORIZON_KEYS as HorizonKey[]) {
    const h = snapshot.horizons[key] as { model: string; runAtMs: number | null; publishedAtMs: number | null; dates: string[]; resorts: { id: string; days: Record<string, unknown>[] }[] };
    const ensemble = cfg.horizons[key].ensemble;
    const resorts: Record<string, Record<string, unknown>[]> = {};
    const points = ensemble ? (parsePoints(responses[key].data, h.model) as ParsedPoint[]) : null;
    h.resorts.forEach((r, ri) => {
      resorts[r.id] = r.days.map((d, di) => {
        if (!ensemble) {
          const { date, status, freshSnowCm, rainBaseMm, maxGustKmh, sunHours, powderSnow } = d as Record<string, unknown>;
          return { date, status, freshSnowCm, rainBaseMm, maxGustKmh, sunHours, powderSnow };
        }
        const { date, goodPct, fairPct, badPct, snowCm } = d as Record<string, unknown>;
        const top = points![2 * ri];
        const idx = indexByTime(top.timesMs);
        return { date, goodPct, fairPct, badPct, snowCm, members: top.members.map((m) => tenth(windowSnowCm(m, h.dates[di], cfg, idx))) };
      });
    });
    const entry: ForecastLogLine["horizons"][string] = { model: h.model, runAtMs: h.runAtMs, publishedAtMs: h.publishedAtMs, resorts };
    const raw = stations?.[key];
    if (!ensemble && raw) {
      const law = cfg.powder.laws[h.model] ?? null;
      const publishedMs = h.publishedAtMs ?? snapshot.fetchedAtMs;
      const pts = parsePoints(raw, `${h.model} stanice`) as ParsedPoint[];
      if (pts.length !== VERIFICATION_STATIONS.length) throw new Error(`stanice: ${pts.length} bodov namiesto ${VERIFICATION_STATIONS.length}`);
      entry.stations = {};
      VERIFICATION_STATIONS.forEach((s, si) => {
        const idx = indexByTime(pts[si].timesMs);
        entry.stations![s.id] = h.dates.map((date, di) => ({ date, powderSnow: powderSnow(pts[si].members[0], date, cfg, idx, law, publishedMs, di) }));
      });
    }
    line.horizons[key] = entry;
  }
  return line;
}

/** Appends the line to <dir>/<season>.jsonl unless the file already ends with the same fetch; returns the path and whether it wrote. */
export function appendForecastLog(line: ForecastLogLine, dir: string): { path: string; written: boolean } {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${seasonName(line.firstDate)}.jsonl`);
  if (existsSync(path)) {
    const text = readFileSync(path, "utf8").trimEnd();
    const last = text.slice(text.lastIndexOf("\n") + 1);
    if (last) {
      try {
        if ((JSON.parse(last) as { fetchedAtMs?: number }).fetchedAtMs === line.fetchedAtMs) return { path, written: false };
      } catch {
        // An unreadable last line is appended after, never repaired here.
      }
    }
  }
  appendFileSync(path, `${JSON.stringify(line)}\n`);
  return { path, written: true };
}
