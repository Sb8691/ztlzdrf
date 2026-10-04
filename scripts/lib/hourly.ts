/**
 * Hourly station truth and the matching hourly forecasts, shared by the day-quality scripts of
 * step 6 (rules-verify, quality-verify). Everything is read from the cache written by
 * `npm run truth:fetch` and `npm run backtest:fetch`; nothing here touches the network.
 *
 * Getters are named like Open-Meteo's hourly variables (precipitation mm, temperature_2m °C,
 * wind_gusts_10m km/h, sunshine_duration s, relative_humidity_2m %) and take an epoch-second stamp
 * that denotes the preceding hour - the station stamps verified to mean the same (METODIKA §4.5).
 */
import { SKI_CONFIG } from "../../src/config.js";
import { addDays as addDaysCore, localTimeMs } from "../../src/ski-core.js";
import { readDerived } from "./cache.js";
import type { Point } from "./points.js";

export const HOUR = 3600;
export const TZ = SKI_CONFIG.timezone;
/** Hours from an IFS run's initialisation to its availability on Open-Meteo, as in the backtest. */
export const IFS_DELAY_H = 7;

export type Getter = (v: string, stampSec: number) => number | null | undefined;

/** Automatic GeoSphere stations with hourly data (key in the hourly file -> point id in the forecast files). The single runs were fetched for Villacher Alpe's manual station (20020), 23 m above the automatic one. */
export const STATIONS: { key: string; id: string; single: string; name: string; elevation: number; group: "údolie" | "hory" }[] = [
  { key: "103", id: "geosphere:103", single: "", name: "Weitensfeld", elevation: 704, group: "údolie" },
  { key: "20105", id: "geosphere:20105", single: "", name: "Arriach", elevation: 890, group: "údolie" },
  { key: "186", id: "geosphere:186", single: "geosphere:186", name: "Flattnitz", elevation: 1437, group: "hory" },
  { key: "122", id: "geosphere:122", single: "geosphere:122", name: "Kanzelhöhe", elevation: 1520, group: "hory" },
  { key: "15715", id: "geosphere:15715", single: "geosphere:15715", name: "Katschberg", elevation: 1635, group: "hory" },
  { key: "20021", id: "geosphere:20021", single: "geosphere:20020", name: "Villacher Alpe", elevation: 2117, group: "hory" },
];
export type Station = typeof STATIONS[number];

/** Stamps (from, to] hourly, epoch seconds. */
export function stampsBetween(fromSec: number, toSec: number): number[] {
  const out: number[] = [];
  for (let t = fromSec + HOUR; t <= toSec; t += HOUR) out.push(t);
  return out;
}

/** The lift day of `date`: 10:00 .. 16:00 local, each stamp the preceding hour. */
export function liftStamps(date: string): number[] {
  return stampsBetween(localTimeMs(date, SKI_CONFIG.liftOpenHour, TZ) / 1000, localTimeMs(date, SKI_CONFIG.liftCloseHour, TZ) / 1000);
}

/** The POWDER_SNEH window of ski day `date`: 09:00 the day before to 09:00 local. */
export function powderStamps(date: string): number[] {
  return stampsBetween(localTimeMs(addDaysCore(date, -1), SKI_CONFIG.powder.windowHour, TZ) / 1000, localTimeMs(date, SKI_CONFIG.powder.windowHour, TZ) / 1000);
}

export const addDays = addDaysCore;

// ---------------------------------------------------------------------------
// Truth
// ---------------------------------------------------------------------------

interface HourlySeries { timestamps: string[]; values: Record<string, (number | null)[]>; units: Record<string, string> }
const COLUMNS: Record<string, { name: string; scale: number }> = { precipitation: { name: "rr", scale: 1 }, temperature_2m: { name: "tl", scale: 1 }, wind_gusts_10m: { name: "ffx", scale: 3.6 }, wind_speed_10m: { name: "ff", scale: 3.6 }, sunshine_duration: { name: "so_h", scale: 3600 }, relative_humidity_2m: { name: "rf", scale: 1 }, snow_depth: { name: "sh", scale: 1 } };

export interface Truth { getter: (st: Station) => Getter | null; firstDay: string; lastDay: string }

/** Hourly GeoSphere truth (winters 2022/23 ->) as getters per station. */
export function loadTruth(): Truth {
  const file = readDerived<{ series: Record<string, HourlySeries> }>("geosphere-hourly.json");
  if (!file) throw new Error("geosphere-hourly.json chýba – spusti npm run truth:fetch");
  const index = new Map<string, Map<number, number>>();
  let first = "9999", last = "0000";
  for (const [key, s] of Object.entries(file.series)) {
    index.set(key, new Map(s.timestamps.map((t, i) => [Date.parse(t) / 1000, i])));
    if (s.timestamps.length) { first = s.timestamps[0].slice(0, 10) < first ? s.timestamps[0].slice(0, 10) : first; const l = s.timestamps[s.timestamps.length - 1].slice(0, 10); last = l > last ? l : last; }
  }
  return {
    firstDay: first,
    lastDay: last,
    getter: (st) => {
      const s = file.series[st.key], idx = index.get(st.key);
      if (!s || !idx) return null;
      return (v, stamp) => { const i = idx.get(stamp); const c = COLUMNS[v]; if (i === undefined || !c) return undefined; const x = s.values[c.name]?.[i]; return x == null ? null : x * c.scale; };
    },
  };
}

// ---------------------------------------------------------------------------
// Forecasts
// ---------------------------------------------------------------------------

interface SeriesFile { points: Point[]; time: number[]; data: Record<string, (number | null)[][]> }

/** Historical Forecast of a model (lead 0) as getters per station; null when the file is missing. */
export function histGetters(model: string): ((st: Station) => Getter | null) | null {
  const file = readDerived<SeriesFile>(`hist-${model}.json`);
  if (!file) return null;
  const index = new Map(file.time.map((t, i) => [t, i]));
  return (st) => {
    const pi = file.points.findIndex((p) => p.id === st.id);
    if (pi < 0) return null;
    return (v, s) => { const i = index.get(s); return i === undefined ? undefined : file.data[v]?.[pi]?.[i]; };
  };
}

/** ICON-D2 "previous day" composite (lead 24-47 h): precipitation and temperature from prev-icon_d2.json, gusts, sunshine and humidity from prev-icon_d2-rules.json. */
export function prevGetters(): { getter: (st: Station) => Getter | null; firstDay: string; lastDay: string } | null {
  const base = readDerived<SeriesFile>("prev-icon_d2.json"), rules = readDerived<SeriesFile>("prev-icon_d2-rules.json");
  if (!base || !rules) return null;
  const bi = new Map(base.time.map((t, i) => [t, i])), ri = new Map(rules.time.map((t, i) => [t, i]));
  const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
  return {
    firstDay: addDaysCore(day(Math.max(base.time[0], rules.time[0])), 1),
    lastDay: day(Math.min(base.time[base.time.length - 1], rules.time[rules.time.length - 1])),
    getter: (st) => {
      if (!st.single) return null;
      const pb = base.points.findIndex((p) => p.id === st.single), pr = rules.points.findIndex((p) => p.id === st.single);
      if (pb < 0 || pr < 0) return null;
      return (v, s) => {
        if (v === "precipitation" || v === "temperature_2m") { const i = bi.get(s); return i === undefined ? undefined : base.data[`${v}_previous_day1`]?.[pb]?.[i]; }
        const i = ri.get(s); return i === undefined ? undefined : rules.data[`${v}_previous_day1`]?.[pr]?.[i];
      };
    },
  };
}

export interface SingleRun { init: string; time0: number; publishedSec: number; lastStamp: number; getter: (st: Station) => Getter | null }

/** Every archived IFS 9 km run (winters 2024/25 and 2025/26); no sunshine in these files. */
export function singleRuns(): SingleRun[] {
  const out: SingleRun[] = [];
  for (const y of [2024, 2025]) {
    const file = readDerived<{ points: Point[]; runs: { init: string; time0: number; hours: number; data: Record<string, (number | null)[][]> }[] }>(`single-ecmwf_ifs-${y}.json`);
    if (!file) continue;
    for (const run of file.runs) {
      out.push({
        init: run.init,
        time0: run.time0,
        publishedSec: run.time0 + IFS_DELAY_H * HOUR,
        lastStamp: run.time0 + (run.hours - 1) * HOUR,
        getter: (st) => {
          if (!st.single) return null;
          const pi = file.points.findIndex((p) => p.id === st.single);
          if (pi < 0) return null;
          return (v, s) => (v === "sunshine_duration" || v === "relative_humidity_2m" ? null : run.data[v]?.[pi]?.[(s - run.time0) / HOUR]);
        },
      });
    }
  }
  return out;
}
