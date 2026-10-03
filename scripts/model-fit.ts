/**
 * Step 3 of the calibrated powder model (npm run model): fit and select the amount model on the
 * archives of steps 1 and 2 (METODIKA §4). Nothing here touches the network.
 *
 * Phases (--only=a,b):
 *   physics  lead 0 (Historical Forecast IFS 9 km 2016/17 ->, ICON-D2 2022/23 ->) at every station
 *            with truth: candidate ways of turning hourly model output into 24 h new snow, fitted and
 *            scored leave-one-season-out. Objective: mean squared error on the square-root scale.
 *   lead     the uncertainty model: a censored normal on the square-root scale around the physics
 *            amount, by lead time, from the IFS single runs of winters 2024/25 and 2025/26 (cross-
 *            validated winter against winter) and at lead 0 from the long archive (leave-one-season-out).
 *   blend    IFS + ICON-D2 weights at one day ahead, kept only when cross-validation improves.
 *
 * Output: data/model/REPORT.md, data/model/powder-model.json (the coefficients the page will embed).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { readDerived, writeDerived } from "./lib/cache.js";
import type { Point } from "./lib/points.js";
import { addDays, inOperatingWindow, seasonOf } from "./lib/season.js";
import { auc as aucOf, bootstrapBlocks, reliability, scores, type Case, type Interval } from "./lib/verify.js";
import { PAGE_RULE, RAW_MODEL, amount24Cm, crpsCm, minimize, probAtLeast, tobitNll, type ModelHour, type PhysicsParams, type SpreadParams } from "./lib/powder-model.js";

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.slice(2).split("="); return [k, v ?? "true"]; }));
const only = new Set((args.only ?? "physics,lead,blend").split(","));

const THRESHOLD = 15;
const COVER = 30;
const IFS_DELAY_H = 7;
const HOUR = 3600;
const OUT_DIR = new URL("../data/model/", import.meta.url);

// ---------------------------------------------------------------------------
// Truth: one observation per point and measurement day (manual new snow first, then automatic ΔHS)
// ---------------------------------------------------------------------------

interface TruthTable { columns: { id: string; label: string; source: string; kind: string; elevation: number; pointId: string }[]; dates: string[]; newSnowCm: (number | null)[][]; hsCm: (number | null)[][] }
const truth: TruthTable = readDerived<TruthTable>("truth-daily.json") ?? (() => { throw new Error("truth-daily.json chýba – spusti npm run truth"); })();
const points: Point[] = readDerived<Point[]>("points.json") ?? (() => { throw new Error("points.json chýba – spusti npm run truth:fetch"); })();

/** Negative automatic ΔHS (settling, melt) is read as no new snow. */
interface Obs { obs: number; hs: number | null; manual: boolean }
const obsByPoint = new Map<string, Map<string, Obs>>();
const stationName = new Map<string, string>();
for (const pointId of new Set(truth.columns.filter((c) => !c.id.startsWith("snowgrid:")).map((c) => c.pointId))) {
  const cols = truth.columns.map((c, i) => ({ c, i })).filter(({ c }) => c.pointId === pointId && !c.id.startsWith("snowgrid:"))
    .sort((a, b) => Number(b.c.kind === "newSnow") - Number(a.c.kind === "newSnow"));
  const m = new Map<string, Obs>();
  truth.dates.forEach((d, k) => {
    for (const { c, i } of cols) {
      const v = truth.newSnowCm[i][k];
      if (v !== null) { m.set(d, { obs: v, hs: truth.hsCm[i][k], manual: c.kind === "newSnow" }); return; }
    }
  });
  obsByPoint.set(pointId, m);
  stationName.set(pointId, cols[0].c.label.replace(/,\s*(ručne|ΔHS automat)$/, ""));
}
const elevationOf = (pointId: string): number => points.find((p) => p.id === pointId)?.elevation ?? truth.columns.find((c) => c.pointId === pointId)!.elevation;

/** Fit sample: winter days; manual new snow at any cover, automatic ΔHS only on a cover >= 30 cm. */
const inFitSample = (M: string, o: Obs): boolean => { const mo = Number(M.slice(5, 7)); return (mo >= 11 || mo <= 4) && (o.manual || (o.hs !== null && o.hs >= COVER)); };
/** Primary sample of step 2: operating window and cover >= 30 cm. */
const inPrimary = (M: string, o: Obs): boolean => inOperatingWindow(M) && o.hs !== null && o.hs >= COVER;

// ---------------------------------------------------------------------------
// Forecast cases: hourly model output over the 24 h window of a measurement day
// ---------------------------------------------------------------------------

interface FcCase { M: string; station: string; elevation: number; lead: number; label: string; hours: ModelHour[]; obs: number; hs: number | null; manual: boolean; season: string; raw: number }

function windowStamps(M: string): { end: number; stamps: number[] } {
  const [y, mo, d] = M.split("-").map(Number);
  const end = Date.UTC(y, mo - 1, d, 6) / 1000;
  return { end, stamps: Array.from({ length: 24 }, (_, k) => end - (23 - k) * HOUR) };
}

type Getter = (v: string, stamp: number) => number | null | undefined;
function hoursOf(get: Getter, stamps: number[], withWetBulb: boolean, withGust: boolean): ModelHour[] | null {
  const out: ModelHour[] = [];
  for (const s of stamps) {
    const precip = get("precipitation", s), snowfall = get("snowfall", s), temp = get("temperature_2m", s);
    if (precip == null || snowfall == null || temp == null) return null;
    const wb = withWetBulb ? get("wet_bulb_temperature_2m", s) : null;
    const gust = withGust ? get("wind_gusts_10m", s) : null;
    out.push({ precip, snowfall, temp, wetBulb: wb ?? null, gust: gust ?? null });
  }
  return out;
}

function makeCase(M: string, station: string, lead: number, label: string, hours: ModelHour[]): FcCase | null {
  const o = obsByPoint.get(station)?.get(M);
  if (!o) return null;
  return { M, station, elevation: elevationOf(station), lead, label, hours, obs: Math.max(0, o.obs), hs: o.hs, manual: o.manual, season: seasonOf(M), raw: amount24Cm(hours, 0, RAW_MODEL) };
}

interface SeriesFile { points: Point[]; model: string; time: number[]; data: Record<string, (number | null)[][]> }
function histCases(model: string): FcCase[] {
  const file = readDerived<SeriesFile>(`hist-${model}.json`);
  if (!file) return [];
  const index = new Map(file.time.map((t, i) => [t, i]));
  const out: FcCase[] = [];
  const firstDay = new Date(file.time[0] * 1000).toISOString().slice(0, 10), lastDay = new Date(file.time[file.time.length - 1] * 1000).toISOString().slice(0, 10);
  file.points.forEach((p, pi) => {
    if (!obsByPoint.has(p.id)) return;
    const get: Getter = (v, s) => { const i = index.get(s); return i === undefined ? undefined : file.data[v]?.[pi]?.[i]; };
    for (let M = addDays(firstDay, 1); M <= lastDay; M = addDays(M, 1)) {
      if (!obsByPoint.get(p.id)!.has(M)) continue;
      const h = hoursOf(get, windowStamps(M).stamps, true, true);
      if (!h) continue;
      const c = makeCase(M, p.id, 0, "0 h", h);
      if (c) out.push(c);
    }
  });
  return out;
}

interface RunFile { points: Point[]; vars: string[]; runs: { init: string; time0: number; hours: number; data: Record<string, (number | null)[][]> }[] }
function singleCases(): FcCase[] {
  const out: FcCase[] = [];
  for (const y of [2024, 2025]) {
    const file = readDerived<RunFile>(`single-ecmwf_ifs-${y}.json`);
    if (!file) continue;
    for (const run of file.runs) {
      const published = run.time0 + IFS_DELAY_H * HOUR;
      const firstEnd = run.time0 + 24 * HOUR, lastEnd = run.time0 + (run.hours - 1) * HOUR;
      for (let end = Math.ceil(firstEnd / 86400) * 86400 + 6 * HOUR; end <= lastEnd; end += 86400) {
        if (end - 23 * HOUR < run.time0 + HOUR || end <= published) continue;
        const M = new Date(end * 1000).toISOString().slice(0, 10);
        const { stamps } = windowStamps(M);
        const lead = Math.round((end - published) / HOUR);
        file.points.forEach((p, pi) => {
          const get: Getter = (v, s) => run.data[v]?.[pi]?.[(s - run.time0) / HOUR];
          const h = hoursOf(get, stamps, true, true);
          if (!h) return;
          const c = makeCase(M, p.id, lead, `${lead} h`, h);
          if (c) out.push(c);
        });
      }
    }
  }
  return out;
}

function prevCases(model: string, n = 1): FcCase[] {
  const file = readDerived<SeriesFile>(`prev-${model}.json`);
  if (!file) return [];
  const index = new Map(file.time.map((t, i) => [t, i]));
  const out: FcCase[] = [];
  const firstDay = new Date(file.time[0] * 1000).toISOString().slice(0, 10), lastDay = new Date(file.time[file.time.length - 1] * 1000).toISOString().slice(0, 10);
  const rename: Record<string, string> = { precipitation: `precipitation_previous_day${n}`, snowfall: `snowfall_previous_day${n}`, temperature_2m: `temperature_2m_previous_day${n}` };
  file.points.forEach((p, pi) => {
    if (!obsByPoint.has(p.id)) return;
    const get: Getter = (v, s) => { const i = index.get(s); const col = rename[v]; return i === undefined || !col ? undefined : file.data[col]?.[pi]?.[i]; };
    for (let M = addDays(firstDay, 1); M <= lastDay; M = addDays(M, 1)) {
      const h = hoursOf(get, windowStamps(M).stamps, false, false);
      if (!h) continue;
      const c = makeCase(M, p.id, 24 * n + 12, `${n} d`, h);
      if (c) out.push(c);
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

const f1 = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? "–" : x.toFixed(1).replace(".", ","));
const f2 = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? "–" : x.toFixed(2).replace(".", ","));
const f3 = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? "–" : x.toFixed(3).replace(".", ","));

const BANDS: [string, number, number][] = [["< 1 200 m", 0, 1200], ["1 200–1 700 m", 1200, 1700], ["1 700–1 950 m", 1700, 1950], ["≥ 1 950 m", 1950, 9999]];

interface DetScores { n: number; events: number; rmseSqrt: number; mae: number; maeSnow: number; bias: number; auc: number | null; pod: number | null; far: number | null; biasBand: Record<string, number | null> }
function detScores(pairs: { c: FcCase; fc: number }[]): DetScores {
  let se = 0, ae = 0, aeSnow = 0, nSnow = 0, bias = 0, events = 0, hits = 0, miss = 0, fa = 0;
  const pos: number[] = [], neg: number[] = [];
  const band: Record<string, { s: number; n: number }> = {};
  for (const { c, fc } of pairs) {
    se += (Math.sqrt(fc) - Math.sqrt(c.obs)) ** 2;
    ae += Math.abs(fc - c.obs);
    if (c.obs >= 1 || c.raw >= 1) { aeSnow += Math.abs(fc - c.obs); nSnow++; }
    bias += fc - c.obs;
    const ev = c.obs >= THRESHOLD;
    if (ev) { events++; pos.push(fc); if (fc >= THRESHOLD) hits++; else miss++; } else { neg.push(fc); if (fc >= THRESHOLD) fa++; }
    const b = BANDS.find(([, lo, hi]) => c.elevation >= lo && c.elevation < hi)![0];
    band[b] ??= { s: 0, n: 0 };
    band[b].s += fc - c.obs; band[b].n++;
  }
  const n = pairs.length;
  return {
    n, events, rmseSqrt: Math.sqrt(se / n), mae: ae / n, maeSnow: nSnow ? aeSnow / nSnow : NaN, bias: bias / n, auc: aucOf(pos, neg),
    pod: hits + miss ? hits / (hits + miss) : null, far: hits + fa ? fa / (hits + fa) : null,
    biasBand: Object.fromEntries(BANDS.map(([b]) => [b, band[b] ? band[b].s / band[b].n : null])),
  };
}

// ---------------------------------------------------------------------------
// Physics: candidate transformations, fitted leave-one-season-out
// ---------------------------------------------------------------------------

type Free = Exclude<keyof PhysicsParams, "phase">;
interface Variant { id: string; name: string; base: PhysicsParams; free: Free[] }
const STEP: Record<Free, number> = { phaseMidC: 0.5, phaseHalfWidthC: 0.5, slr0: 1, slrPerDeg: 0.2, slrMin: 1, slrMax: 1, gustK: 0.1, elevBeta: 0.1, zRef: 100, scale: 0.1 };
const RANGE: Record<Free, [number, number]> = { phaseMidC: [-3, 4], phaseHalfWidthC: [0, 3], slr0: [2, 20], slrPerDeg: [-1, 2], slrMin: [1, 10], slrMax: [5, 30], gustK: [0, 0.9], elevBeta: [-2, 2], zRef: [0, 3000], scale: [0.2, 3] };

const SLR_BASE: Pick<PhysicsParams, "slr0" | "slrPerDeg" | "slrMin" | "slrMax"> = { slr0: 7, slrPerDeg: 0.3, slrMin: 3, slrMax: 20 };
const VARIANTS: Variant[] = [
  { id: "raw", name: "surový `snowfall` modelu", base: RAW_MODEL, free: [] },
  { id: "rule", name: "dnešné pravidlo (zrážky × 0,7 pri T ≤ 1 °C)", base: PAGE_RULE, free: [] },
  { id: "rule-scale", name: "dnešné pravidlo × násobok", base: PAGE_RULE, free: ["scale"] },
  { id: "wb-ramp", name: "fáza z wet-bulb (rampa), 0,7 cm/mm, násobok", base: { ...PAGE_RULE, phase: "wetbulb", phaseMidC: 0.5, phaseHalfWidthC: 1 }, free: ["phaseMidC", "phaseHalfWidthC", "scale"] },
  { id: "t2m-ramp", name: "fáza z T (rampa), 0,7 cm/mm", base: { ...PAGE_RULE, phaseMidC: 0, phaseHalfWidthC: 1.5 }, free: ["phaseMidC", "phaseHalfWidthC"] },
  { id: "model-slr", name: "fáza modelu + pomer sneh/voda podľa T", base: { ...RAW_MODEL, ...SLR_BASE }, free: ["slr0", "slrPerDeg"] },
  { id: "t2m-slr", name: "fáza z T (rampa) + pomer podľa T", base: { ...PAGE_RULE, phaseMidC: 1, phaseHalfWidthC: 1, ...SLR_BASE }, free: ["phaseMidC", "phaseHalfWidthC", "slr0", "slrPerDeg"] },
  { id: "wb-slr", name: "fáza z wet-bulb (rampa) + pomer podľa T", base: { ...PAGE_RULE, phase: "wetbulb", phaseMidC: 0.5, phaseHalfWidthC: 1, ...SLR_BASE }, free: ["phaseMidC", "phaseHalfWidthC", "slr0", "slrPerDeg"] },
  { id: "model-slr-elev", name: "fáza modelu + pomer podľa T + výškový faktor", base: { ...RAW_MODEL, ...SLR_BASE, elevBeta: 0.1 }, free: ["slr0", "slrPerDeg", "elevBeta"] },
  { id: "wb-slr-elev", name: "fáza z wet-bulb + pomer podľa T + výškový faktor", base: { ...PAGE_RULE, phase: "wetbulb", phaseMidC: 0.5, phaseHalfWidthC: 1, ...SLR_BASE, elevBeta: 0.1 }, free: ["phaseMidC", "phaseHalfWidthC", "slr0", "slrPerDeg", "elevBeta"] },
  { id: "wb-slr-elev-gust", name: "… + vietor (nárazy)", base: { ...PAGE_RULE, phase: "wetbulb", phaseMidC: 0.5, phaseHalfWidthC: 1, ...SLR_BASE, elevBeta: 0.1, gustK: 0.1 }, free: ["phaseMidC", "phaseHalfWidthC", "slr0", "slrPerDeg", "elevBeta", "gustK"] },
];

function fitPhysics(cases: FcCase[], v: Variant): PhysicsParams {
  if (!v.free.length) return v.base;
  const objective = (x: number[]): number => {
    const p: PhysicsParams = { ...v.base };
    for (let i = 0; i < v.free.length; i++) {
      const [lo, hi] = RANGE[v.free[i]];
      if (x[i] < lo || x[i] > hi) return Infinity;
      (p as unknown as Record<string, number>)[v.free[i]] = x[i];
    }
    if (p.slrMin > p.slrMax) return Infinity;
    let se = 0;
    for (const c of cases) se += (Math.sqrt(amount24Cm(c.hours, c.elevation, p)) - Math.sqrt(c.obs)) ** 2;
    return se / cases.length;
  };
  const r = minimize(objective, v.free.map((k) => v.base[k] as number), v.free.map((k) => STEP[k]), { rounds: 60, minStep: 0.005 });
  const p: PhysicsParams = { ...v.base };
  v.free.forEach((k, i) => { (p as unknown as Record<string, number>)[k] = Math.round(r.x[i] * 1000) / 1000; });
  return p;
}

/** Leave-one-season-out predictions on the fit sample, plus the parameters fitted on everything. */
function losoPhysics(cases: FcCase[], v: Variant): { pairs: { c: FcCase; fc: number }[]; params: PhysicsParams; perSeason: Map<string, PhysicsParams> } {
  const seasons = [...new Set(cases.map((c) => c.season))].sort();
  const pairs: { c: FcCase; fc: number }[] = [];
  const perSeason = new Map<string, PhysicsParams>();
  for (const s of seasons) {
    const p = v.free.length ? fitPhysics(cases.filter((c) => c.season !== s), v) : v.base;
    perSeason.set(s, p);
    for (const c of cases) if (c.season === s) pairs.push({ c, fc: amount24Cm(c.hours, c.elevation, p) });
  }
  return { pairs, params: fitPhysics(cases, v), perSeason };
}

const lines: string[] = [];
const say = (s = "") => { lines.push(s); console.log(s); };
const paramText = (p: PhysicsParams, free: Free[]) => free.map((k) => `${k} ${f2(p[k] as number)}`).join(", ") || "–";

interface PhysicsFit { params: PhysicsParams; perSeason: Record<string, PhysicsParams>; loso: DetScores; losoPrimary: DetScores; variant: Variant }
let physicsResult: Record<string, PhysicsFit> = {};

function phasePhysics(): void {
  say("## Krok 3a – fyzika pri predstihu 0 (Historical Forecast), leave-one-season-out");
  say("");
  say(`Vzorka fitu: zimné dni nov–apr s pravdou; ručný nový sneh pri akejkoľvek pokrývke, ΔHS automatov len pri pokrývke ≥ ${COVER} cm. Cieľ fitu: stredná kvadratická chyba √úhrnu. Skóre: predpovede mimo sezóny fitu (LOSO), zlúčené. „MAE sneh“ = dni s pozorovaným alebo surovým modelovým úhrnom ≥ 1 cm. Bias podľa výškového pásma stanice.`);
  for (const model of ["ecmwf_ifs", "icon_d2"]) {
    const all = histCases(model).filter((c) => inFitSample(c.M, { obs: c.obs, hs: c.hs, manual: c.manual }));
    if (!all.length) continue;
    const seasons = [...new Set(all.map((c) => c.season))].sort();
    const stations = [...new Set(all.map((c) => c.station))];
    say("");
    say(`### ${model === "ecmwf_ifs" ? "IFS 9 km" : "ICON-D2"}: ${all.length} staničných dní, ${all.filter((c) => c.obs >= THRESHOLD).length} udalostí ≥ ${THRESHOLD} cm, sezóny ${seasons[0]}–${seasons[seasons.length - 1]} (${seasons.length}), ${stations.length} staníc`);
    say("");
    say(`Stanice: ${stations.map((s) => `${stationName.get(s)} ${elevationOf(s)} m (${all.filter((c) => c.station === s).length})`).join("; ")}.`);
    say("");
    say(`| Variant | parametre (fit na všetkom) | RMSE √cm | MAE [cm] | MAE sneh [cm] | bias [cm] | ${BANDS.map(([b]) => `bias ${b}`).join(" | ")} | AUC@15 | POD@15 | FAR@15 |`);
    say(`|---|---|---|---|---|---|${BANDS.map(() => "---").join("|")}|---|---|---|`);
    for (const v of VARIANTS) {
      const t0 = Date.now();
      const { pairs, params, perSeason } = losoPhysics(all, v);
      const s = detScores(pairs);
      const sp = detScores(pairs.filter(({ c }) => inPrimary(c.M, { obs: c.obs, hs: c.hs, manual: c.manual })));
      physicsResult[`${model}:${v.id}`] = { params, perSeason: Object.fromEntries(perSeason), loso: s, losoPrimary: sp, variant: v };
      say(`| ${v.name} | ${paramText(params, v.free)} | ${f3(s.rmseSqrt)} | ${f2(s.mae)} | ${f2(s.maeSnow)} | ${f2(s.bias)} | ${BANDS.map(([b]) => f2(s.biasBand[b])).join(" | ")} | ${f3(s.auc)} | ${f2(s.pod)} | ${f2(s.far)} |`);
      console.error(`   (${v.id}: ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    }
    say("");
    say("Primárna vzorka (sezóna prevádzky, pokrývka ≥ 30 cm) z tých istých LOSO predpovedí:");
    say("");
    say("| Variant | n | udalostí | RMSE √cm | MAE [cm] | MAE sneh [cm] | bias [cm] | AUC@15 | POD@15 | FAR@15 |");
    say("|---|---|---|---|---|---|---|---|---|---|");
    for (const v of VARIANTS) {
      const r = physicsResult[`${model}:${v.id}`];
      const s = r.losoPrimary;
      say(`| ${v.name} | ${s.n} | ${s.events} | ${f3(s.rmseSqrt)} | ${f2(s.mae)} | ${f2(s.maeSnow)} | ${f2(s.bias)} | ${f3(s.auc)} | ${f2(s.pod)} | ${f2(s.far)} |`);
    }
  }
  writeDerived("model-physics.json", physicsResult);
}

// ---------------------------------------------------------------------------
// Uncertainty by lead time: censored normal on the sqrt scale around the physics amount
// ---------------------------------------------------------------------------

/** Physics candidates carried into the probabilistic stage. */
const CARRY = ["rule", "t2m-ramp", "wb-slr-elev"];
/** Event threshold on the continuous scale. Observers report whole centimetres, so 14.5 would be the strict reading; it scored the same as 15 (BSS 0.21 vs 0.22 at 23 h), so the stated threshold is used. */
const EVENT_CM = args.event ? Number(args.event) : 15;

function physicsFor(model: string, variantId: string, holdoutSeason: string): PhysicsParams {
  const fit = physicsResult[`${model}:${variantId}`];
  if (!fit) throw new Error(`fyzika ${model}:${variantId} chýba – spusti fázu physics`);
  return fit.perSeason[holdoutSeason] ?? fit.params;
}

/** Long manual series used for the climatological reference of each station. */
const CLIM_PROXY: Record<string, string> = { "geosphere:15715": "geosphere:122", "lwd:2900265": "ehyd:123133", "lwd:2900240": "ehyd:123133", "geosphere:20105": "ehyd:114694", "geosphere:103": "ehyd:113936" };
const climCache = new Map<string, { p: number; mean: number }>();
function climatology(station: string, month: number, season: string): { p: number; mean: number } {
  const key = `${station}|${month}|${season}`;
  const hit = climCache.get(key);
  if (hit) return hit;
  const colId = `${CLIM_PROXY[station] ?? station}:manual`;
  const i = truth.columns.findIndex((c) => c.id === colId);
  let n = 0, ev = 0, sum = 0;
  if (i >= 0) truth.dates.forEach((d, k) => {
    if (Number(d.slice(5, 7)) !== month || seasonOf(d) === season || !inOperatingWindow(d)) return;
    const v = truth.newSnowCm[i][k], hs = truth.hsCm[i][k];
    if (v === null || hs === null || hs < COVER) return;
    n++; sum += Math.max(0, v); if (v >= THRESHOLD) ev++;
  });
  const out = { p: n ? ev / n : 0.05, mean: n ? sum / n : 2 };
  climCache.set(key, out);
  return out;
}

function fitSpread(xy: { x: number; y: number }[], start: SpreadParams = { a: 0, b: 1, c: 0.8, d: 0.1 }, fixClim = false): SpreadParams {
  const f = ([a, b, c, d]: number[]) => (c < 0.05 || d < 0 || d > 2 ? Infinity : tobitNll(xy, { a, b, c, d }));
  const r = minimize(f, [start.a, fixClim ? 0 : start.b, start.c, fixClim ? 0 : start.d], [0.2, fixClim ? 0 : 0.2, 0.2, fixClim ? 0 : 0.05], { rounds: 80, minStep: 1e-3 });
  return { a: r.x[0], b: r.x[1], c: r.x[2], d: r.x[3] };
}

interface ProbCase { c: FcCase; x: number; prob: number; crps: number; crpsClim: number; sp: SpreadParams }
interface ProbScores { n: number; events: number; bss: Interval; brier: number | null; crps: number; crpsClim: number; crpss: Interval; reliability: ReturnType<typeof reliability>; meanProbEvent: number; meanProbNone: number; auc: number | null }

function toCases(pc: ProbCase[]): Case[] {
  return pc.map(({ c, x, prob }) => { const cl = climatology(c.station, Number(c.M.slice(5, 7)), c.season); return { day: c.M, station: c.station, obs: c.obs, fc: x, prob, clim: cl.p, climMean: cl.mean }; });
}

function probScores(pc: ProbCase[]): ProbScores {
  const cases = toCases(pc);
  const s = scores(cases, THRESHOLD);
  const bss = bootstrapBlocks(cases, (x) => { const r = scores(x, THRESHOLD); return r.events >= 5 ? r.bss : null; });
  bss.est = s.bss;
  const crpsOf = (list: ProbCase[]) => list.reduce((a, k) => a + k.crps, 0) / list.length;
  const crpsClimOf = (list: ProbCase[]) => list.reduce((a, k) => a + k.crpsClim, 0) / list.length;
  const byKey = new Map(pc.map((k) => [`${k.c.M}|${k.c.station}`, k]));
  const crpss = bootstrapBlocks(cases, (x) => { const list = x.map((c) => byKey.get(`${c.day}|${c.station}`)!); const cc = crpsClimOf(list); return cc > 0 ? 1 - crpsOf(list) / cc : null; }, 10, 1000, 12);
  const crps = crpsOf(pc), crpsClim = crpsClimOf(pc);
  crpss.est = crpsClim > 0 ? 1 - crps / crpsClim : null;
  const ev = pc.filter((k) => k.c.obs >= THRESHOLD), none = pc.filter((k) => k.c.obs < THRESHOLD);
  return { n: s.n, events: s.events, bss, brier: s.brier, crps, crpsClim, crpss, reliability: reliability(cases, THRESHOLD), meanProbEvent: ev.length ? ev.reduce((a, k) => a + k.prob, 0) / ev.length : NaN, meanProbNone: none.length ? none.reduce((a, k) => a + k.prob, 0) / none.length : NaN, auc: s.auc };
}

/** Out-of-sample probabilities: folds by season (every case of the held-out season is scored with parameters fitted on the rest). */
function crossValidate(cases: FcCase[], model: string, variantId: string, folds: (c: FcCase) => string, fitWith?: (train: { x: number; y: number }[], fold: string) => SpreadParams): { pc: ProbCase[]; perFold: Record<string, SpreadParams>; climPerFold: Record<string, SpreadParams> } {
  const keys = [...new Set(cases.map(folds))].sort();
  const pc: ProbCase[] = [];
  const perFold: Record<string, SpreadParams> = {}, climPerFold: Record<string, SpreadParams> = {};
  for (const fold of keys) {
    const amount = (c: FcCase) => amount24Cm(c.hours, c.elevation, physicsFor(model, variantId, fold));
    const train = cases.filter((c) => folds(c) !== fold).map((c) => ({ x: amount(c), y: c.obs }));
    if (train.length < 50) continue;
    const sp = fitWith ? fitWith(train, fold) : fitSpread(train);
    const clim = fitSpread(train, { a: 0, b: 0, c: 1, d: 0 }, true);
    perFold[fold] = sp; climPerFold[fold] = clim;
    for (const c of cases) {
      if (folds(c) !== fold) continue;
      const x = amount(c);
      pc.push({ c, x, prob: probAtLeast(x, EVENT_CM, sp), crps: crpsCm(x, c.obs, sp), crpsClim: crpsCm(0, c.obs, clim), sp });
    }
  }
  return { pc, perFold, climPerFold };
}

const spText = (sp: SpreadParams) => `a ${f2(sp.a)}, b ${f2(sp.b)}, c ${f2(sp.c)}, d ${f2(sp.d)}`;
const ciText = (b: Interval) => `${f2(b.est)} (${f2(b.lo)}–${f2(b.hi)})`;

interface LeadRow { source: string; model: string; variant: string; lead: number; label: string; primary: ProbScores; fit: ProbScores; perFold: Record<string, SpreadParams> }
const leadRows: LeadRow[] = [];

function reportProb(title: string, groups: { source: string; model: string; label: string; lead: number; cases: FcCase[]; folds: (c: FcCase) => string }[]): void {
  say("");
  say(`### ${title}`);
  say("");
  say("| Zdroj | Predstih | Fyzika | n | udalostí | **BSS** (95 % CI) | CRPSS (95 % CI) | CRPS / klim. [cm] | AUC | p̄ pri udalosti | p̄ inak | parametre (fit na všetkom) |");
  say("|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const g of groups) {
    const fitCases = g.cases.filter((c) => inFitSample(c.M, { obs: c.obs, hs: c.hs, manual: c.manual }));
    if (fitCases.length < 100) continue;
    for (const variantId of CARRY) {
      const { pc, perFold } = crossValidate(fitCases, g.model, variantId, g.folds);
      if (!pc.length) continue;
      const prim = pc.filter((k) => inPrimary(k.c.M, { obs: k.c.obs, hs: k.c.hs, manual: k.c.manual }));
      const ps = probScores(prim), fs = probScores(pc);
      const all = fitSpread(fitCases.map((c) => ({ x: amount24Cm(c.hours, c.elevation, physicsFor(g.model, variantId, "")), y: c.obs })));
      leadRows.push({ source: g.source, model: g.model, variant: variantId, lead: g.lead, label: g.label, primary: ps, fit: fs, perFold: { ...perFold, all } });
      say(`| ${g.source} | ${g.label} | ${variantId} | ${ps.n} | ${ps.events} | **${ciText(ps.bss)}** | ${ciText(ps.crpss)} | ${f2(ps.crps)} / ${f2(ps.crpsClim)} | ${f3(ps.auc)} | ${f2(ps.meanProbEvent)} | ${f3(ps.meanProbNone)} | ${spText(all)} |`);
    }
  }
}

function phaseLead(): void {
  if (!Object.keys(physicsResult).length) physicsResult = readDerived<Record<string, PhysicsFit>>("model-physics.json") ?? (() => { throw new Error("model-physics.json chýba – spusti fázu physics"); })();
  say("");
  say("## Krok 3b – neistota podľa predstihu: cenzurované normálne rozdelenie na √cm");
  say("");
  say(`Model: √Y ~ N(a + b·√x, c + d·√x) cenzurované v nule, x = úhrn z fyziky (cm). P(≥ 15 cm) = P(Y ≥ ${EVENT_CM}). Parametre a–d spoločné pre stanice, fit maximálnou vierohodnosťou. Overenie mimo vzorky: pri predstihu 0 leave-one-season-out, pri predstihoch zo single runs zima proti zime (fit 2024/25 → test 2025/26 a naopak). Fyzika v každom folde fitovaná bez testovanej sezóny. Skóre na primárnej vzorke (sezóna prevádzky, pokrývka ≥ 30 cm); CRPSS = 1 − CRPS / CRPS klimatologického rozdelenia tej istej rodiny (b = d = 0) fitovaného na tréningu; BSS proti LOSO klimatológii po mesiacoch ako v kroku 2.`);

  const bySeason = (c: FcCase) => c.season;
  // Lead 0 (long archives).
  reportProb("Predstih 0 (Historical Forecast), LOSO", [
    { source: "IFS 9 km hist", model: "ecmwf_ifs", label: "0 h", lead: 0, cases: histCases("ecmwf_ifs"), folds: bySeason },
    { source: "ICON-D2 hist", model: "icon_d2", label: "0 h", lead: 0, cases: histCases("icon_d2"), folds: bySeason },
  ]);
  // IFS single runs by lead class.
  const single = singleCases();
  const leads = [...new Set(single.map((c) => c.lead))].sort((a, b) => a - b);
  reportProb("IFS 9 km celé behy 00z/12z, podľa predstihu, zima proti zime", leads.map((L) => ({ source: "IFS 9 km single", model: "ecmwf_ifs", label: `${L} h`, lead: L, cases: single.filter((c) => c.lead === L), folds: bySeason })));
  // ICON-D2 previous day.
  reportProb("ICON-D2 Previous Runs (pred 1 dňom), zima proti zime", [{ source: "ICON-D2 prev", model: "icon_d2", label: "1 d (24–47 h)", lead: 36, cases: prevCases("icon_d2", 1), folds: bySeason }]);

  // Parameter trajectory with lead for each carried physics.
  say("");
  say("### Dráha parametrov s predstihom (fit na oboch zimách; predstih 0 na celom archíve)");
  say("");
  say("| Fyzika | Predstih | a | b | c | d | BSS primárna | CRPSS primárna |");
  say("|---|---|---|---|---|---|---|---|");
  for (const variantId of CARRY) {
    for (const r of leadRows.filter((r) => r.variant === variantId && r.model === "ecmwf_ifs").sort((a, b) => a.lead - b.lead)) {
      const sp = r.perFold.all;
      say(`| ${variantId} | ${r.label} | ${f2(sp.a)} | ${f2(sp.b)} | ${f2(sp.c)} | ${f2(sp.d)} | ${f2(r.primary.bss.est)} | ${f2(r.primary.crpss.est)} |`);
    }
  }

  // Reliability of the best candidate at 23 h and lead 0.
  say("");
  say("### Spoľahlivosť (reliability) – t2m-ramp");
  for (const pick of leadRows.filter((r) => r.variant === "t2m-ramp" && (r.lead === 0 || r.lead === leads[0] || r.lead === 71))) {
    say("");
    say(`${pick.source} ${pick.label}: ${pick.primary.reliability.map((b) => `${b.bin}: n ${b.n}, p̄ ${f2(b.meanProb)}, pozorované ${f2(b.obsFreq)}`).join("; ")}`);
  }
  writeDerived("model-lead.json", leadRows);
}

mkdirSync(OUT_DIR, { recursive: true });
if (only.has("physics")) phasePhysics();
if (only.has("lead")) phaseLead();
writeFileSync(new URL("REPORT.md", OUT_DIR), `${lines.join("\n")}\n`);
console.log("\nZapísané: data/model/REPORT.md");
