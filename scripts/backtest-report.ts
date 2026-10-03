/**
 * Step 2 of the calibrated powder model (npm run backtest): for every measurement day of the
 * archived winters and every lead time, use only forecasts that were published by then, and score
 * climatology, the raw model snowfall and today's page rule against the station truth of step 1.
 *
 * Event: POWDER_SNEH = 24 h new snow >= 15 cm on measurement day M (window (M-1 06 UTC, M 06 UTC]).
 * Primary sample: operating window (1 Dec - 15 Apr) and snow cover >= 30 cm on the morning of M;
 * the secondary sample takes every winter day with truth. Climatology is leave-one-season-out from
 * the long truth series. Intervals: moving-block bootstrap over days (10-day blocks, all stations of
 * a day together), 1000 replicates.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { readDerived } from "./lib/cache.js";
import type { Point } from "./lib/points.js";
import { OPERATING_FROM, OPERATING_TO, addDays, inOperatingWindow, seasonOf } from "./lib/season.js";
import { bootstrapBlocks, scores, type Case, type Interval, type Scores } from "./lib/verify.js";

const THRESHOLD = 15;
const COVER = 30;
/** Hours from an IFS run's initialisation to its availability on Open-Meteo (6.5 h measured once). */
const IFS_DELAY_H = 7;
const SNOW_PER_MM = 0.7;
const SNOW_MAX_TEMP = 1;
const OUT_DIR = new URL("../data/backtest/", import.meta.url);
const HOUR = 3600;

// ---------------------------------------------------------------------------
// Truth
// ---------------------------------------------------------------------------

interface TruthTable { columns: { id: string; label: string; elevation: number; pointId: string }[]; dates: string[]; newSnowCm: (number | null)[][]; hsCm: (number | null)[][] }
const truth: TruthTable = readDerived<TruthTable>("truth-daily.json") ?? (() => { throw new Error("truth-daily.json chýba – spusti npm run truth"); })();
const points = readDerived<Point[]>("points.json") ?? [];
const col = (id: string) => truth.columns.findIndex((c) => c.id === id);

/** Verification stations: truth columns in order of preference, and the long series for climatology. */
const STATIONS: { id: string; name: string; truth: string[]; clim: string }[] = [
  { id: "geosphere:20020", name: "Villacher Alpe 2140 m (ručne)", truth: ["geosphere:20020:manual"], clim: "geosphere:20020:manual" },
  { id: "geosphere:122", name: "Kanzelhöhe 1520 m (ručne, automat)", truth: ["geosphere:122:manual", "geosphere:122:auto"], clim: "geosphere:122:manual" },
  { id: "geosphere:186", name: "Flattnitz 1437 m (ručne, automat)", truth: ["geosphere:186:manual", "geosphere:186:auto"], clim: "geosphere:186:manual" },
  { id: "geosphere:15715", name: "Katschberg 1635 m (automat)", truth: ["geosphere:15715:auto"], clim: "geosphere:122:manual" },
  { id: "ehyd:123133", name: "eHYD Turracher Höhe 1777 m (ručne, do 2023)", truth: ["ehyd:123133:manual"], clim: "ehyd:123133:manual" },
  { id: "lwd:2900265", name: "LWD Turracherhoehe 1795 m (automat, 2025/26)", truth: ["lwd:2900265:auto"], clim: "ehyd:123133:manual" },
  { id: "lwd:2900240", name: "LWD Falkert 1886 m (automat, 2025/26)", truth: ["lwd:2900240:auto"], clim: "ehyd:123133:manual" },
];

interface Obs { obs: number; hs: number | null }
const obsByStation = new Map<string, Map<string, Obs>>();
for (const st of STATIONS) {
  const idx = st.truth.map(col).filter((i) => i >= 0);
  const m = new Map<string, Obs>();
  truth.dates.forEach((d, k) => {
    for (const i of idx) {
      const v = truth.newSnowCm[i][k];
      if (v !== null) { m.set(d, { obs: v, hs: truth.hsCm[i][k] }); return; }
    }
  });
  obsByStation.set(st.id, m);
}

/** Leave-one-season-out climatology of the event and of the amount, by station and month, on the primary filter. */
const climCache = new Map<string, { p: number; mean: number }>();
function climatology(st: typeof STATIONS[number], month: number, season: string): { p: number; mean: number } {
  const key = `${st.id}|${month}|${season}`;
  const hit = climCache.get(key);
  if (hit) return hit;
  const i = col(st.clim);
  let n = 0, ev = 0, sum = 0;
  truth.dates.forEach((d, k) => {
    if (Number(d.slice(5, 7)) !== month || seasonOf(d) === season || !inOperatingWindow(d)) return;
    const v = truth.newSnowCm[i][k], hs = truth.hsCm[i][k];
    if (v === null || hs === null || hs < COVER) return;
    n++; sum += v; if (v >= THRESHOLD) ev++;
  });
  const out = { p: n ? ev / n : 0.05, mean: n ? sum / n : 2 };
  climCache.set(key, out);
  return out;
}

// ---------------------------------------------------------------------------
// Forecast windows
// ---------------------------------------------------------------------------

/** Unix seconds of the window end (M 06 UTC) and its 24 hourly stamps (M-1 07:00 .. M 06:00 UTC). */
function windowStamps(M: string): { end: number; stamps: number[] } {
  const [y, mo, d] = M.split("-").map(Number);
  const end = Date.UTC(y, mo - 1, d, 6) / 1000;
  return { end, stamps: Array.from({ length: 24 }, (_, k) => end - (23 - k) * HOUR) };
}

/** 24 h sums from hourly columns: raw model snowfall, and today's rule (precipitation x 0.7 where T <= 1 °C). */
function sums(get: (v: string, stamp: number) => number | null | undefined, stamps: number[], vars: { snow?: string; precip: string; temp: string }): { snow: number | null; rule: number | null } {
  let snow = 0, rule = 0, snowOk = !!vars.snow, ruleOk = true;
  for (const s of stamps) {
    const p = get(vars.precip, s), t = get(vars.temp, s);
    if (p === null || p === undefined || t === null || t === undefined) ruleOk = false;
    else if (t <= SNOW_MAX_TEMP) rule += p * SNOW_PER_MM;
    if (vars.snow) { const sn = get(vars.snow, s); if (sn === null || sn === undefined) snowOk = false; else snow += sn; }
  }
  return { snow: snowOk ? Math.round(snow * 100) / 100 : null, rule: ruleOk ? Math.round(rule * 100) / 100 : null };
}

interface Fc { M: string; station: string; lead: number; label: string; snow: number | null; rule: number | null }
const forecasts: Record<string, Fc[]> = {};
const push = (source: string, fc: Fc) => (forecasts[source] ??= []).push(fc);

// A. ECMWF IFS 9 km single runs (exact lead from publication to window end).
interface RunFile { points: Point[]; vars: string[]; runs: { init: string; time0: number; hours: number; data: Record<string, (number | null)[][]> }[] }
const singleFiles = [2024, 2025].map((y) => readDerived<RunFile>(`single-ecmwf_ifs-${y}.json`)).filter((x): x is RunFile => x !== null);
for (const file of singleFiles) {
  for (const run of file.runs) {
    const published = run.time0 + IFS_DELAY_H * HOUR;
    // Windows this run can cover: stamps within [time0 + 1 h, time0 + (hours - 1) h].
    const firstEnd = run.time0 + 24 * HOUR, lastEnd = run.time0 + (run.hours - 1) * HOUR;
    for (let end = Math.ceil(firstEnd / 86400) * 86400 + 6 * HOUR; end <= lastEnd; end += 86400) {
      if (end - 23 * HOUR < run.time0 + HOUR || end <= published) continue;
      const M = new Date(end * 1000).toISOString().slice(0, 10);
      const { stamps } = windowStamps(M);
      file.points.forEach((p, pi) => {
        const get = (v: string, s: number) => run.data[v]?.[pi]?.[(s - run.time0) / HOUR];
        const r = sums(get, stamps, { snow: "snowfall", precip: "precipitation", temp: "temperature_2m" });
        const lead = Math.round((end - published) / HOUR);
        push("ecmwf_ifs:single", { M, station: p.id, lead, label: `${lead} h`, snow: r.snow, rule: r.rule });
      });
    }
  }
}

// B. Previous runs: composite "N days ago" forecasts.
interface SeriesFile { points: Point[]; model: string; time: number[]; data: Record<string, (number | null)[][]> }
for (const model of ["icon_d2", "icon_eu", "ecmwf_ifs025", "gfs_global"]) {
  const file = readDerived<SeriesFile>(`prev-${model}.json`);
  if (!file) continue;
  const index = new Map(file.time.map((t, i) => [t, i]));
  const days = [...new Set(Object.keys(file.data).map((k) => Number(/_previous_day(\d+)$/.exec(k)?.[1])))].filter((n) => n > 0).sort((a, b) => a - b);
  const firstDay = new Date(file.time[0] * 1000).toISOString().slice(0, 10), lastDay = new Date(file.time[file.time.length - 1] * 1000).toISOString().slice(0, 10);
  for (let M = addDays(firstDay, 1); M <= lastDay; M = addDays(M, 1)) {
    const { stamps } = windowStamps(M);
    for (const n of days) {
      const hasSnow = `snowfall_previous_day${n}` in file.data;
      file.points.forEach((p, pi) => {
        const get = (v: string, s: number) => { const i = index.get(s); return i === undefined ? undefined : file.data[v]?.[pi]?.[i]; };
        const r = sums(get, stamps, { snow: hasSnow ? `snowfall_previous_day${n}` : undefined, precip: `precipitation_previous_day${n}`, temp: `temperature_2m_previous_day${n}` });
        push(`${model}:prev`, { M, station: p.id, lead: 24 * n + 12, label: `${n} d (${24 * n}–${24 * n + 23} h)`, snow: r.snow, rule: r.rule });
      });
    }
  }
}

// C. Historical forecast (stitched first hours of each run: lead → 0).
for (const model of ["ecmwf_ifs", "icon_d2"]) {
  const file = readDerived<SeriesFile>(`hist-${model}.json`);
  if (!file) continue;
  const index = new Map(file.time.map((t, i) => [t, i]));
  const firstDay = new Date(file.time[0] * 1000).toISOString().slice(0, 10), lastDay = new Date(file.time[file.time.length - 1] * 1000).toISOString().slice(0, 10);
  for (let M = addDays(firstDay, 1); M <= lastDay; M = addDays(M, 1)) {
    const { stamps } = windowStamps(M);
    file.points.forEach((p, pi) => {
      if (!STATIONS.some((s) => s.id === p.id)) return;
      const get = (v: string, s: number) => { const i = index.get(s); return i === undefined ? undefined : file.data[v]?.[pi]?.[i]; };
      const r = sums(get, stamps, { snow: "snowfall", precip: "precipitation", temp: "temperature_2m" });
      push(`${model}:hist`, { M, station: p.id, lead: 0, label: "0 h (zošité behy)", snow: r.snow, rule: r.rule });
    });
  }
}

// ---------------------------------------------------------------------------
// Cases and scores
// ---------------------------------------------------------------------------

type Variant = "snow" | "rule" | "clim";
function cases(source: string, label: string, variant: Variant, primary: boolean, stationFilter?: string): Case[] {
  const out: Case[] = [];
  for (const fc of forecasts[source] ?? []) {
    if (fc.label !== label || (stationFilter && fc.station !== stationFilter)) continue;
    const st = STATIONS.find((s) => s.id === fc.station)!;
    const o = obsByStation.get(fc.station)?.get(fc.M);
    if (!o) continue;
    const month = Number(fc.M.slice(5, 7));
    if (primary) { if (!inOperatingWindow(fc.M) || o.hs === null || o.hs < COVER) continue; }
    else if (month > 4 && month < 11) continue;
    const c = climatology(st, month, seasonOf(fc.M));
    const value = variant === "snow" ? fc.snow : variant === "rule" ? fc.rule : c.mean;
    if (value === null) continue;
    out.push({ day: fc.M, station: fc.station, obs: o.obs, fc: value, prob: variant === "clim" ? c.p : undefined, clim: c.p, climMean: c.mean });
  }
  return out;
}

const f2 = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? "–" : x.toFixed(2).replace(".", ","));
const f1 = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? "–" : x.toFixed(1).replace(".", ","));
const ci = (b: Interval, f = f2) => `${f(b.est)} (${f(b.lo)}–${f(b.hi)})`;

const lines: string[] = [];
const say = (s = "") => { lines.push(s); console.log(s); };

interface Row { source: string; variant: Variant; label: string; lead: number; primary: boolean; station?: string; scores: Scores; bss: Interval; auc: Interval; pod: Interval; far: Interval; mae: Interval }
const rows: Row[] = [];
function evaluate(source: string, label: string, lead: number, variant: Variant, primary: boolean, station?: string): Row | null {
  const c = cases(source, label, variant, primary, station);
  if (c.length < 30) return null;
  const s = scores(c, THRESHOLD);
  const row: Row = {
    source, variant, label, lead, primary, station, scores: s,
    // Skill needs events in the resample: blocks without any event make BSS degenerate (1 or -inf).
    bss: bootstrapBlocks(c, (x) => { const s = scores(x, THRESHOLD); return s.events >= 5 ? s.bss : null; }),
    auc: bootstrapBlocks(c, (x) => { const s = scores(x, THRESHOLD); return s.events >= 5 ? s.auc : null; }, 10, 1000, 8),
    pod: bootstrapBlocks(c, (x) => scores(x, THRESHOLD).pod, 10, 1000, 9),
    far: bootstrapBlocks(c, (x) => scores(x, THRESHOLD).far, 10, 1000, 10),
    mae: bootstrapBlocks(c, (x) => scores(x, THRESHOLD).mae, 10, 1000, 11),
  };
  // The point estimate is always the full-sample score; only the resamples are guarded.
  row.bss.est = s.bss;
  row.auc.est = s.auc;
  rows.push(row);
  return row;
}

const SOURCE_NAMES: Record<string, string> = { "ecmwf_ifs:single": "IFS 9 km, celé behy 00z/12z", "icon_d2:prev": "ICON-D2, previous runs", "icon_eu:prev": "ICON-EU, previous runs", "ecmwf_ifs025:prev": "IFS 0,25°, previous runs", "gfs_global:prev": "GFS, previous runs", "ecmwf_ifs:hist": "IFS 9 km, Historical Forecast", "icon_d2:hist": "ICON-D2, Historical Forecast" };
const VARIANT_NAMES: Record<Variant, string> = { snow: "surový `snowfall`", rule: "dnešné pravidlo (zrážky × 0,7 pri T ≤ 1 °C)", clim: "klimatológia (LOSO)" };

function labelsOf(source: string): { label: string; lead: number }[] {
  const seen = new Map<string, number>();
  for (const fc of forecasts[source] ?? []) seen.set(fc.label, fc.lead);
  return [...seen.entries()].map(([label, lead]) => ({ label, lead })).sort((a, b) => a.lead - b.lead);
}

say(`## Backtest POWDER_SNEH ≥ ${THRESHOLD} cm / 24 h – len predpovede zverejnené pred koncom okna`);
say("");
const seasonsCovered = [...new Set((forecasts["ecmwf_ifs:single"] ?? []).map((f) => seasonOf(f.M)))].sort();
say(`Zimy s predstihom: ${seasonsCovered.join(", ")}. Stanice: ${STATIONS.map((s) => s.name).join("; ")}. IFS: zverejnenie = inicializácia + ${IFS_DELAY_H} h (predpoklad z jedného merania 6,5 h). Primárna vzorka: sezóna prevádzky ${OPERATING_FROM} – ${OPERATING_TO}, pokrývka ≥ ${COVER} cm; CI = blokový bootstrap po dňoch (10-dňové bloky, všetky stanice dňa spolu).`);

function table(primary: boolean): void {
  say("");
  say(`### ${primary ? "Primárna vzorka (sezóna prevádzky, pokrývka ≥ 30 cm)" : "Sekundárna vzorka (všetky zimné dni s pravdou, bez podmienky pokrývky)"} – zlúčené cez stanice`);
  say("");
  say("| Zdroj | Verzia | Predstih | n | udalostí | Brier | Brier klim. | **BSS** (95 % CI) | POD | FAR | CSI | AUC | bias [cm] | MAE / MAE klim. [cm] |");
  say("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const source of Object.keys(SOURCE_NAMES)) {
    if (!forecasts[source]) continue;
    for (const { label, lead } of labelsOf(source)) {
      for (const variant of ["snow", "rule"] as Variant[]) {
        if (variant === "snow" && source === "ecmwf_ifs025:prev") continue;
        const r = evaluate(source, label, lead, variant, primary);
        if (!r) continue;
        const s = r.scores;
        say(`| ${SOURCE_NAMES[source]} | ${VARIANT_NAMES[variant]} | ${label} | ${s.n} | ${s.events} | ${f2(s.brier)} | ${f2(s.brierClim)} | **${ci(r.bss)}** | ${ci(r.pod)} | ${ci(r.far)} | ${f2(s.csi)} | ${ci(r.auc)} | ${f1(s.bias)} | ${f1(s.mae)} / ${f1(s.maeClim)} |`);
      }
    }
  }
  // Climatology itself, on the IFS 23 h sample, as the reference row.
  const ref = labelsOf("ecmwf_ifs:single")[0];
  if (ref) {
    const r = evaluate("ecmwf_ifs:single", ref.label, ref.lead, "clim", primary);
    if (r) say(`| – | ${VARIANT_NAMES.clim} | (vzorka IFS ${ref.label}) | ${r.scores.n} | ${r.scores.events} | ${f2(r.scores.brier)} | ${f2(r.scores.brierClim)} | 0,00 | – | – | – | ${ci(r.auc)} | ${f1(r.scores.bias)} | ${f1(r.scores.mae)} |`);
  }
}
table(true);
table(false);

// Per station at the shortest IFS lead and at ~71 h.
say("");
say("### Podľa stanice – IFS 9 km surový `snowfall`, primárna vzorka");
say("");
say("| Stanica | Predstih | n | udalostí | BSS (95 % CI) | POD | FAR | AUC | bias [cm] | MAE [cm] |");
say("|---|---|---|---|---|---|---|---|---|---|");
const ifsLabels = labelsOf("ecmwf_ifs:single");
for (const st of STATIONS) {
  for (const { label, lead } of ifsLabels.filter((l) => l.lead <= 24 || (l.lead >= 66 && l.lead <= 78))) {
    const r = evaluate("ecmwf_ifs:single", label, lead, "snow", true, st.id);
    if (!r) continue;
    say(`| ${st.name} | ${label} | ${r.scores.n} | ${r.scores.events} | ${ci(r.bss)} | ${ci(r.pod)} | ${ci(r.far)} | ${ci(r.auc)} | ${f1(r.scores.bias)} | ${f1(r.scores.mae)} |`);
  }
}

// Gate summary.
say("");
say("### Brána na zapojenie (porovnanie na tej istej vzorke): BSS surového modelu a dnešného pravidla pri ~20–40 h a ~70–90 h");
say("");
const gate = (lo: number, hi: number) => rows.filter((r) => r.primary && !r.station && r.source === "ecmwf_ifs:single" && r.lead >= lo && r.lead <= hi);
for (const [lo, hi] of [[18, 42], [66, 90]] as const) {
  for (const r of gate(lo, hi)) say(`- ${r.label}, ${VARIANT_NAMES[r.variant]}: BSS ${ci(r.bss)}, AUC ${ci(r.auc)}, n = ${r.scores.n}, udalostí ${r.scores.events}.`);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(new URL("REPORT.md", OUT_DIR), `${lines.join("\n")}\n`);
writeFileSync(new URL("summary.json", OUT_DIR), `${JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), threshold: THRESHOLD, cover: COVER, ifsDelayH: IFS_DELAY_H, seasons: seasonsCovered, stations: STATIONS, rows }, null, 1)}\n`);
say("");
say(`Zapísané: data/backtest/REPORT.md, data/backtest/summary.json. Zdroje: ${Object.entries(forecasts).map(([k, v]) => `${k} ${v.length} predpovedí`).join(", ")}.`);
