/**
 * Downloads the archived forecasts the backtest needs (npm run backtest:fetch), cached by URL in
 * ~/.cache/ztlzdrf like the truth. Nothing here touches the repository.
 *
 * Phases (--only=a,b):
 *   single  ECMWF IFS 9 km complete runs (Single Runs API, from 2024-03-14): every 00z and 12z run
 *           of the archived winters at the verification stations, 144 h, with the station height as
 *           `elevation` so temperature is downscaled the way the page does it.
 *   prev    Previous Runs API: ICON-D2 (N = 1), ICON-EU (N = 1..4), IFS 0.25° (N = 1..7, no snowfall),
 *           GFS (N = 1..3), month by month at the verification stations.
 *   hist    Historical Forecast API (no lead time): IFS 9 km winters 2016/17 → and ICON-D2 2022/23 →
 *           at every point (28), for the physics of step 3 and as the "lead → 0" baseline.
 *
 * Open-Meteo counts a request with several points, more than 10 variables or more than 14 days as
 * several calls against the 10 000 / day limit; the phases are sized so that `single` + `prev` fit
 * into one day and `hist` into another. A 429 stops the run cleanly (exit code 2) - re-run later,
 * the cache keeps what was downloaded.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { CACHE_DIR, fetchJsonCached, readDerived, stats, writeDerived } from "./lib/cache.js";
import { addDays } from "./lib/season.js";
import type { Point } from "./lib/points.js";

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.slice(2).split("="); return [k, v ?? "true"]; }));
const only = new Set((args.only ?? "single,prev,hist").split(","));
/** Winters as start years. */
const winters = (args.winters ?? "2024,2025").split(",").map(Number);
const limit = args.limit ? Number(args.limit) : Infinity;

const TODAY = new Date().toISOString().slice(0, 10);
const points: Point[] = readDerived<Point[]>("points.json") ?? (() => { throw new Error("points.json chýba – spusti npm run truth:fetch"); })();

/** Stations with truth that the forecasts are verified against (see METODIKA 3.9). */
const VERIFY_IDS = ["geosphere:20020", "geosphere:122", "geosphere:186", "geosphere:15715", "ehyd:123133", "lwd:2900265", "lwd:2900240"];
const verifyPoints = VERIFY_IDS.map((id) => { const p = points.find((x) => x.id === id); if (!p) throw new Error(`bod ${id} chýba v points.json`); return p; });

const SINGLE_VARS = ["temperature_2m", "precipitation", "snowfall", "wet_bulb_temperature_2m", "wind_gusts_10m"];
const HIST_VARS = ["temperature_2m", "precipitation", "snowfall", "wet_bulb_temperature_2m", "dew_point_2m", "relative_humidity_2m", "wind_speed_10m", "wind_gusts_10m", "cloud_cover_low", "sunshine_duration", "freezing_level_height"];

interface OmPoint { latitude: number; longitude: number; elevation: number; hourly: Record<string, (number | null)[]> & { time: number[] } }

function coordQuery(pts: Point[]): string {
  return `latitude=${pts.map((p) => p.latitude).join(",")}&longitude=${pts.map((p) => p.longitude).join(",")}&elevation=${pts.map((p) => p.elevation).join(",")}`;
}

const round2 = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);

function isLimit(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return /429|limit exceeded|Too Many/i.test(m);
}

/** Month windows [start, end] of a winter (Nov .. Apr), clipped to yesterday. */
function winterMonths(startYear: number): [string, string][] {
  const out: [string, string][] = [];
  for (const [y, m] of [[startYear, 11], [startYear, 12], [startYear + 1, 1], [startYear + 1, 2], [startYear + 1, 3], [startYear + 1, 4]]) {
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const end = addDays(`${m === 12 ? y + 1 : y}-${String((m % 12) + 1).padStart(2, "0")}-01`, -1);
    if (start >= TODAY) break;
    out.push([start, end >= TODAY ? addDays(TODAY, -1) : end]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// single: IFS 9 km runs
// ---------------------------------------------------------------------------

interface RunRecord { init: string; cells: number[]; time0: number; hours: number; data: Record<string, (number | null)[][]> }

async function phaseSingle(): Promise<void> {
  console.log("== Single Runs: ECMWF IFS 9 km, 00z + 12z, 144 h, stations", verifyPoints.map((p) => p.id).join(", "));
  const q = coordQuery(verifyPoints);
  for (const y of winters) {
    const name = `single-ecmwf_ifs-${y}.json`;
    const stored = readDerived<{ runs: RunRecord[]; missing: string[] }>(name);
    const runs = new Map<string, RunRecord>((stored?.runs ?? []).map((r) => [r.init, r]));
    const missing = new Set<string>(stored?.missing ?? []);
    let n = 0;
    const first = `${y}-11-20`, last = `${y + 1}-04-20`;
    for (let d = first; d <= last && d < TODAY; d = addDays(d, 1)) {
      for (const hh of ["00", "12"]) {
        const init = `${d}T${hh}:00`;
        if (runs.has(init) || missing.has(init)) continue;
        if (n >= limit) break;
        const url = `https://single-runs-api.open-meteo.com/v1/forecast?${q}&hourly=${SINGLE_VARS.join(",")}&models=ecmwf_ifs&run=${init}&forecast_days=6&timeformat=unixtime`;
        try {
          const json = await fetchJsonCached<OmPoint | OmPoint[]>(url, { minIntervalMs: 1300, label: `IFS run ${init}`, verbose: false });
          const list = Array.isArray(json) ? json : [json];
          if (list.length !== verifyPoints.length) throw new Error(`${list.length} bodov namiesto ${verifyPoints.length}`);
          const h0 = list[0].hourly;
          const rec: RunRecord = { init, cells: list.map((p) => p.elevation), time0: h0.time[0], hours: h0.time.length, data: {} };
          for (const v of SINGLE_VARS) rec.data[v] = list.map((p) => p.hourly[v].map(round2));
          runs.set(init, rec);
          n++;
          if (n % 25 === 0) { console.log(`   ${init}: ${n} behov v tomto behu, ${runs.size} spolu`); writeDerived(name, { points: verifyPoints, vars: SINGLE_VARS, runs: [...runs.values()].sort((a, b) => a.init.localeCompare(b.init)), missing: [...missing].sort() }); }
        } catch (err) {
          if (isLimit(err)) { writeDerived(name, { points: verifyPoints, vars: SINGLE_VARS, runs: [...runs.values()].sort((a, b) => a.init.localeCompare(b.init)), missing: [...missing].sort() }); console.error(`Limit API: ${err instanceof Error ? err.message : err}`); process.exit(2); }
          if (err instanceof Error && /not available/i.test(err.message)) { missing.add(init); continue; }
          throw err;
        }
      }
    }
    writeDerived(name, { points: verifyPoints, vars: SINGLE_VARS, runs: [...runs.values()].sort((a, b) => a.init.localeCompare(b.init)), missing: [...missing].sort() });
    console.log(`   zima ${y}/${(y + 1) % 100}: ${runs.size} behov uložených, ${missing.size} chýba v archíve`);
  }
}

// ---------------------------------------------------------------------------
// prev: Previous Runs
// ---------------------------------------------------------------------------

const PREV_MODELS: { model: string; days: number[]; vars: string[] }[] = [
  { model: "icon_d2", days: [1], vars: ["snowfall", "precipitation", "temperature_2m"] },
  { model: "icon_eu", days: [1, 2, 3, 4], vars: ["snowfall", "precipitation", "temperature_2m"] },
  { model: "ecmwf_ifs025", days: [1, 2, 3, 4, 5, 6, 7], vars: ["precipitation", "temperature_2m"] },
  { model: "gfs_global", days: [1, 2, 3], vars: ["snowfall", "precipitation", "temperature_2m"] },
];

async function phasePrev(): Promise<void> {
  console.log("== Previous Runs:", PREV_MODELS.map((m) => `${m.model} N=${m.days.join("/")}`).join("; "));
  const q = coordQuery(verifyPoints);
  for (const { model, days, vars } of PREV_MODELS) {
    const name = `prev-${model}.json`;
    const stored = readDerived<{ time: number[]; cells: number[]; data: Record<string, (number | null)[][]> }>(name);
    const time: number[] = stored?.time ?? [];
    const data: Record<string, (number | null)[][]> = stored?.data ?? {};
    let cells: number[] = stored?.cells ?? [];
    const have = new Set(time);
    for (const y of winters) {
      for (const [start, end] of winterMonths(y)) {
        const startTs = Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1, Number(start.slice(8, 10))) / 1000;
        if (have.has(startTs)) continue;
        // Ten variables per request at most: split the N x vars combinations.
        const combos = days.flatMap((n) => vars.map((v) => `${v}_previous_day${n}`));
        const chunks: string[][] = [];
        for (let i = 0; i < combos.length; i += 9) chunks.push(combos.slice(i, i + 9));
        let month: Record<string, (number | null)[][]> = {};
        let monthTime: number[] = [];
        try {
          for (const chunk of chunks) {
            const url = `https://previous-runs-api.open-meteo.com/v1/forecast?${q}&hourly=${chunk.join(",")}&models=${model}&start_date=${start}&end_date=${end}&timeformat=unixtime`;
            const json = await fetchJsonCached<OmPoint | OmPoint[]>(url, { minIntervalMs: 1300, label: `${model} ${start}`, verbose: false });
            const list = Array.isArray(json) ? json : [json];
            if (list.length !== verifyPoints.length) throw new Error(`${list.length} bodov namiesto ${verifyPoints.length}`);
            monthTime = list[0].hourly.time;
            cells = list.map((p) => p.elevation);
            for (const v of chunk) month[v] = list.map((p) => p.hourly[v].map(round2));
          }
        } catch (err) {
          if (isLimit(err)) { writeDerived(name, { points: verifyPoints, model, time, cells, data }); console.error(`Limit API: ${err instanceof Error ? err.message : err}`); process.exit(2); }
          throw err;
        }
        time.push(...monthTime);
        for (const [v, cols] of Object.entries(month)) { data[v] ??= verifyPoints.map(() => []); cols.forEach((c, i) => data[v][i].push(...c)); }
        console.log(`   ${model} ${start}..${end}: ${monthTime.length} h`);
      }
    }
    writeDerived(name, { points: verifyPoints, model, time, cells, data });
  }
}

// ---------------------------------------------------------------------------
// hist: Historical Forecast (no lead)
// ---------------------------------------------------------------------------

async function phaseHist(): Promise<void> {
  const plans: { model: string; firstWinter: number }[] = [{ model: "ecmwf_ifs", firstWinter: 2016 }, { model: "icon_d2", firstWinter: 2022 }];
  const lastWinter = Number(TODAY.slice(5, 7)) >= 8 ? Number(TODAY.slice(0, 4)) : Number(TODAY.slice(0, 4)) - 1;
  console.log("== Historical Forecast at all", points.length, "points:", plans.map((p) => `${p.model} from ${p.firstWinter}/${(p.firstWinter + 1) % 100}`).join("; "));
  const q = coordQuery(points);
  for (const { model, firstWinter } of plans) {
    const name = `hist-${model}.json`;
    const stored = readDerived<{ time: number[]; cells: number[]; data: Record<string, (number | null)[][]> }>(name);
    const time: number[] = stored?.time ?? [];
    const data: Record<string, (number | null)[][]> = stored?.data ?? {};
    let cells: number[] = stored?.cells ?? [];
    const have = new Set(time);
    for (let y = firstWinter; y <= lastWinter; y++) {
      for (const [start, end] of winterMonths(y)) {
        const startTs = Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1, Number(start.slice(8, 10))) / 1000;
        if (have.has(startTs)) continue;
        const chunks = [HIST_VARS.slice(0, 6), HIST_VARS.slice(6)];
        const month: Record<string, (number | null)[][]> = {};
        let monthTime: number[] = [];
        try {
          for (const chunk of chunks) {
            const url = `https://historical-forecast-api.open-meteo.com/v1/forecast?${q}&hourly=${chunk.join(",")}&models=${model}&start_date=${start}&end_date=${end}&timeformat=unixtime`;
            const json = await fetchJsonCached<OmPoint | OmPoint[]>(url, { minIntervalMs: 4500, retries: 4, label: `${model} hist ${start}`, verbose: false });
            const list = Array.isArray(json) ? json : [json];
            if (list.length !== points.length) throw new Error(`${list.length} bodov namiesto ${points.length}`);
            monthTime = list[0].hourly.time;
            cells = list.map((p) => p.elevation);
            for (const v of chunk) month[v] = list.map((p) => (p.hourly[v] ?? monthTime.map(() => null)).map(round2));
          }
        } catch (err) {
          if (isLimit(err)) { writeDerived(name, { points, model, time, cells, data }); console.error(`Limit API: ${err instanceof Error ? err.message : err}`); process.exit(2); }
          throw err;
        }
        time.push(...monthTime);
        for (const [v, cols] of Object.entries(month)) { data[v] ??= points.map(() => []); cols.forEach((c, i) => data[v][i].push(...c)); }
        console.log(`   ${model} ${start}..${end}: ${monthTime.length} h`);
      }
      writeDerived(name, { points, model, time, cells, data });
    }
  }
}

async function main(): Promise<void> {
  mkdirSync(join(CACHE_DIR, "derived"), { recursive: true });
  if (only.has("single")) await phaseSingle();
  if (only.has("prev")) await phasePrev();
  if (only.has("hist")) await phaseHist();
  console.log(`Done: ${stats.network} requests over the network (${(stats.bytes / 1e6).toFixed(1)} MB), ${stats.cached} from cache.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
