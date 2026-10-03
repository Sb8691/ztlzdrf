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
import { PAGE_RULE, RAW_MODEL, amount24Cm, crpsCm, hurdleAtLead, hurdleCrpsCm, hurdleNll, hurdleProbAtLeast, minimize, probAtLeast, tobitNll, type HurdleLaw, type HurdleParams, type ModelHour, type PhysicsParams, type SpreadParams } from "./lib/powder-model.js";

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.slice(2).split("="); return [k, v ?? "true"]; }));
const only = new Set((args.only ?? "physics,explore,lead,law,blend").split(","));

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

interface FcCase { M: string; station: string; elevation: number; lead: number; label: string; hours: ModelHour[]; obs: number; hs: number | null; manual: boolean; season: string; raw: number; /** Second model's hours for the blend test. */ hours2?: ModelHour[] }

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
// Uncertainty by lead time: two distribution families around the physics amount
// ---------------------------------------------------------------------------

/** Physics candidates carried into the probabilistic stage (censored family); the two-part family uses the page rule. */
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

type Family = "tobit" | "hurdle";
type Dist = { kind: "tobit"; sp: SpreadParams } | { kind: "hurdle"; hp: HurdleParams };
const FAMILY_NAMES: Record<Family, string> = { tobit: "cenzurované normálne", hurdle: "dvojdielne" };
const probOf = (dist: Dist, x: number): number => (dist.kind === "tobit" ? probAtLeast(x, EVENT_CM, dist.sp) : hurdleProbAtLeast(x, EVENT_CM, dist.hp));
const crpsOf = (dist: Dist, x: number, y: number): number => (dist.kind === "tobit" ? crpsCm(x, y, dist.sp) : hurdleCrpsCm(x, y, dist.hp));
const distText = (dist: Dist): string => (dist.kind === "tobit" ? `a ${f2(dist.sp.a)}, b ${f2(dist.sp.b)}, c ${f2(dist.sp.c)}, d ${f2(dist.sp.d)}` : `h0 ${f2(dist.hp.h0)}, h1 ${f2(dist.hp.h1)}, a ${f2(dist.hp.a)}, b ${f2(dist.hp.b)}, c ${f2(dist.hp.c)}, d ${f2(dist.hp.d)}`);

function fitSpread(xy: { x: number; y: number }[], start: SpreadParams = { a: 0, b: 1, c: 0.8, d: 0.1 }, fixClim = false): SpreadParams {
  const f = ([a, b, c, d]: number[]) => (c < 0.05 || d < 0 || d > 2 ? Infinity : tobitNll(xy, { a, b, c, d }));
  const r = minimize(f, [start.a, fixClim ? 0 : start.b, start.c, fixClim ? 0 : start.d], [0.2, fixClim ? 0 : 0.2, 0.2, fixClim ? 0 : 0.05], { rounds: 80, minStep: 1e-3 });
  return { a: r.x[0], b: r.x[1], c: r.x[2], d: r.x[3] };
}

/** Two-part fit: probit hurdle on every case, truncated normal on the wet ones (the two likelihoods add, so they are fitted apart). */
function fitHurdle(xy: { x: number; y: number }[], fixClim = false): HurdleParams {
  const dry = minimize(([h0, h1]) => hurdleNll(xy, { h0, h1, a: 0, b: 1, c: 1, d: 0 }).dry, [0, fixClim ? 0 : 0.8], [0.2, fixClim ? 0 : 0.1], { rounds: 80, minStep: 1e-3 });
  const wet = xy.filter((k) => k.y > 0);
  const w = minimize(([a, b, c, d]) => (c < 0.05 || d < 0 || d > 2 ? Infinity : hurdleNll(wet, { h0: 0, h1: 0, a, b, c, d }).wet), [0.3, fixClim ? 0 : 1, 1.2, fixClim ? 0 : 0.05], [0.2, fixClim ? 0 : 0.1, 0.2, fixClim ? 0 : 0.05], { rounds: 80, minStep: 1e-3 });
  return { h0: dry.x[0], h1: dry.x[1], a: w.x[0], b: w.x[1], c: w.x[2], d: w.x[3] };
}
const fitDist = (family: Family, xy: { x: number; y: number }[]): Dist => (family === "tobit" ? { kind: "tobit", sp: fitSpread(xy) } : { kind: "hurdle", hp: fitHurdle(xy) });

interface ProbCase { c: FcCase; x: number; prob: number; crps: number; crpsClim: number }
interface ProbScores { n: number; events: number; bss: Interval; brier: number | null; crps: number; crpsClim: number; crpss: Interval; reliability: ReturnType<typeof reliability>; meanProbEvent: number; meanProbNone: number; auc: number | null }

type ScoredCase = Case & { crps: number; crpsClim: number };
function toCases(pc: ProbCase[]): ScoredCase[] {
  return pc.map(({ c, x, prob, crps, crpsClim }) => { const cl = climatology(c.station, Number(c.M.slice(5, 7)), c.season); return { day: c.M, station: c.station, obs: c.obs, fc: x, prob, clim: cl.p, climMean: cl.mean, crps, crpsClim }; });
}

function probScores(pc: ProbCase[]): ProbScores {
  const cases = toCases(pc);
  const s = scores(cases, THRESHOLD);
  const bss = bootstrapBlocks(cases, (x) => { const r = scores(x, THRESHOLD); return r.events >= 5 ? r.bss : null; });
  bss.est = s.bss;
  const meanCrps = (list: { crps: number }[]) => list.reduce((a, k) => a + k.crps, 0) / list.length;
  const meanCrpsClim = (list: { crpsClim: number }[]) => list.reduce((a, k) => a + k.crpsClim, 0) / list.length;
  const crpss = bootstrapBlocks(cases, (x) => { const list = x as ScoredCase[]; const cc = meanCrpsClim(list); return cc > 0 ? 1 - meanCrps(list) / cc : null; }, 10, 1000, 12);
  const crps = meanCrps(pc), crpsClim = meanCrpsClim(pc);
  crpss.est = crpsClim > 0 ? 1 - crps / crpsClim : null;
  const ev = pc.filter((k) => k.c.obs >= THRESHOLD), none = pc.filter((k) => k.c.obs < THRESHOLD);
  return { n: s.n, events: s.events, bss, brier: s.brier, crps, crpsClim, crpss, reliability: reliability(cases, THRESHOLD), meanProbEvent: ev.length ? ev.reduce((a, k) => a + k.prob, 0) / ev.length : NaN, meanProbNone: none.length ? none.reduce((a, k) => a + k.prob, 0) / none.length : NaN, auc: s.auc };
}

/** A fitted stage: the amount a case gets and its distribution at a lead. */
interface Fitted { amount: (c: FcCase) => number; dist: (leadH: number) => Dist }

/** Out-of-sample probabilities: every case of a held-out fold is scored with a stage fitted on the other folds. The climatological reference is the unconditional two-part distribution fitted on the same training set. */
function cvGeneric(cases: FcCase[], folds: (c: FcCase) => string, fit: (train: FcCase[], fold: string) => Fitted): { pc: ProbCase[]; perFold: Record<string, Fitted> } {
  const keys = [...new Set(cases.map(folds))].sort();
  const pc: ProbCase[] = [];
  const perFold: Record<string, Fitted> = {};
  for (const fold of keys) {
    const train = cases.filter((c) => folds(c) !== fold);
    if (train.length < 50) continue;
    const f = fit(train, fold);
    const clim = fitHurdle(train.map((c) => ({ x: 0, y: c.obs })), true);
    perFold[fold] = f;
    for (const c of cases) {
      if (folds(c) !== fold) continue;
      const x = f.amount(c), dist = f.dist(c.lead);
      pc.push({ c, x, prob: probOf(dist, x), crps: crpsOf(dist, x, c.obs), crpsClim: hurdleCrpsCm(0, c.obs, clim) });
    }
  }
  return { pc, perFold };
}

/** One distribution per lead class, physics of the fold. */
function crossValidate(cases: FcCase[], model: string, variantId: string, family: Family, folds: (c: FcCase) => string): { pc: ProbCase[]; perFold: Record<string, Dist> } {
  const dists: Record<string, Dist> = {};
  const { pc } = cvGeneric(cases, folds, (train, fold) => {
    const p = physicsFor(model, variantId, fold);
    const dist = fitDist(family, train.map((c) => ({ x: amount24Cm(c.hours, c.elevation, p), y: c.obs })));
    dists[fold] = dist;
    return { amount: (c) => amount24Cm(c.hours, c.elevation, p), dist: () => dist };
  });
  return { pc, perFold: dists };
}

const ciText = (b: Interval) => `${f2(b.est)} (${f2(b.lo)}–${f2(b.hi)})`;

interface LeadRow { source: string; model: string; variant: string; family: Family; lead: number; label: string; primary: ProbScores; fit: ProbScores; all: Dist }
const leadRows: LeadRow[] = [];

function reportProb(title: string, groups: { source: string; model: string; label: string; lead: number; cases: FcCase[]; folds: (c: FcCase) => string }[]): void {
  say("");
  say(`### ${title}`);
  say("");
  say("| Zdroj | Predstih | Rodina | Fyzika | n | udalostí | **BSS** (95 % CI) | CRPSS (95 % CI) | CRPS / klim. [cm] | AUC | p̄ pri udalosti | p̄ inak | parametre (fit na všetkom) |");
  say("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const g of groups) {
    const fitCases = g.cases.filter((c) => inFitSample(c.M, { obs: c.obs, hs: c.hs, manual: c.manual }));
    if (fitCases.length < 100) continue;
    const combos: [Family, string][] = (["tobit", "hurdle"] as Family[]).flatMap((family) => CARRY.map((v): [Family, string] => [family, v]));
    for (const [family, variantId] of combos) {
      const { pc } = crossValidate(fitCases, g.model, variantId, family, g.folds);
      if (!pc.length) continue;
      const prim = pc.filter((k) => inPrimary(k.c.M, { obs: k.c.obs, hs: k.c.hs, manual: k.c.manual }));
      const ps = probScores(prim), fs = probScores(pc);
      const all = fitDist(family, fitCases.map((c) => ({ x: amount24Cm(c.hours, c.elevation, physicsFor(g.model, variantId, "")), y: c.obs })));
      leadRows.push({ source: g.source, model: g.model, variant: variantId, family, lead: g.lead, label: g.label, primary: ps, fit: fs, all });
      say(`| ${g.source} | ${g.label} | ${FAMILY_NAMES[family]} | ${variantId} | ${ps.n} | ${ps.events} | **${ciText(ps.bss)}** | ${ciText(ps.crpss)} | ${f2(ps.crps)} / ${f2(ps.crpsClim)} | ${f3(ps.auc)} | ${f2(ps.meanProbEvent)} | ${f3(ps.meanProbNone)} | ${distText(all)} |`);
    }
  }
}

const relText = (s: ProbScores) => s.reliability.map((b) => `${b.bin}: n ${b.n}, p̄ ${f2(b.meanProb)}, pozorované ${f2(b.obsFreq)}`).join("; ");

function phaseLead(): void {
  if (!Object.keys(physicsResult).length) physicsResult = readDerived<Record<string, PhysicsFit>>("model-physics.json") ?? (() => { throw new Error("model-physics.json chýba – spusti fázu physics"); })();
  say("");
  say("## Krok 3b – neistota podľa predstihu");
  say("");
  say(`Dve rodiny okolo úhrnu z fyziky x (cm): **cenzurované normálne** √Y ~ N(a + b·√x, c + d·√x) cenzurované v nule, a **dvojdielne** P(Y > 0) = Φ(h0 + h1·√x), √Y | Y > 0 ~ N(a + b·√x, c + d·√x) orezané v nule. P(≥ 15 cm) = P(Y ≥ ${EVENT_CM}). Parametre spoločné pre stanice, fit maximálnou vierohodnosťou. Overenie mimo vzorky: pri predstihu 0 leave-one-season-out, pri predstihoch zo single runs zima proti zime (fit 2024/25 → test 2025/26 a naopak); fyzika v každom folde fitovaná bez testovanej sezóny. Skóre na primárnej vzorke (sezóna prevádzky, pokrývka ≥ 30 cm); CRPSS = 1 − CRPS / CRPS nepodmieneného dvojdielneho rozdelenia fitovaného na tréningu; BSS proti LOSO klimatológii po mesiacoch ako v kroku 2.`);

  const bySeason = (c: FcCase) => c.season;
  reportProb("Predstih 0 (Historical Forecast), LOSO", [
    { source: "IFS 9 km hist", model: "ecmwf_ifs", label: "0 h", lead: 0, cases: histCases("ecmwf_ifs"), folds: bySeason },
    { source: "ICON-D2 hist", model: "icon_d2", label: "0 h", lead: 0, cases: histCases("icon_d2"), folds: bySeason },
  ]);
  const single = singleCases();
  const leads = [...new Set(single.map((c) => c.lead))].sort((a, b) => a - b);
  reportProb("IFS 9 km celé behy 00z/12z, podľa predstihu, zima proti zime", leads.map((L) => ({ source: "IFS 9 km single", model: "ecmwf_ifs", label: `${L} h`, lead: L, cases: single.filter((c) => c.lead === L), folds: bySeason })));
  reportProb("ICON-D2 Previous Runs (pred 1 dňom), zima proti zime", [{ source: "ICON-D2 prev", model: "icon_d2", label: "1 d (24–47 h)", lead: 36, cases: prevCases("icon_d2", 1), folds: bySeason }]);

  say("");
  say("### Dráha parametrov s predstihom (fit na oboch zimách; predstih 0 na celom archíve), fyzika = pravidlo");
  say("");
  say("| Rodina | Predstih | parametre | BSS primárna | CRPSS primárna |");
  say("|---|---|---|---|---|");
  for (const family of ["tobit", "hurdle"] as Family[]) {
    for (const r of leadRows.filter((r) => r.variant === "rule" && r.family === family && r.model === "ecmwf_ifs").sort((a, b) => a.lead - b.lead)) {
      say(`| ${FAMILY_NAMES[family]} | ${r.label} | ${distText(r.all)} | ${f2(r.primary.bss.est)} | ${f2(r.primary.crpss.est)} |`);
    }
  }
  say("");
  say("### Spoľahlivosť (reliability), fyzika = pravidlo, primárna vzorka");
  for (const r of leadRows.filter((r) => r.variant === "rule" && (r.lead === 0 || r.lead === leads[0] || r.lead === 71))) {
    say("");
    say(`${r.source} ${r.label}, ${FAMILY_NAMES[r.family]}: ${relText(r.primary)}`);
  }
  writeDerived("model-lead.json", leadRows);
}

// ---------------------------------------------------------------------------
// Lead law: two-part coefficients linear in the lead time, one fit over all leads
// ---------------------------------------------------------------------------

type HKey = Exclude<keyof HurdleLaw, "leadRefH" | "minLeadH" | "maxLeadH">;
interface HLawSpec { id: string; name: string; free: HKey[] }
const DRY_KEYS: HKey[] = ["h00", "h01", "h10", "h11"];
const HLAW_SPECS: HLawSpec[] = [
  { id: "h10", name: "h0, h1, b, c lineárne v predstihu; a, d konštantné (10 parametrov)", free: ["h00", "h01", "h10", "h11", "a0", "b0", "b1", "c0", "c1", "d0"] },
  { id: "h9", name: "… d = 0 (9)", free: ["h00", "h01", "h10", "h11", "a0", "b0", "b1", "c0", "c1"] },
  { id: "h8", name: "… h0 konštantné (8)", free: ["h00", "h10", "h11", "a0", "b0", "b1", "c0", "c1"] },
  { id: "h7", name: "… h1 konštantné (7)", free: ["h00", "h10", "a0", "b0", "b1", "c0", "c1"] },
  { id: "h6", name: "… c konštantné: len b klesá s predstihom (6)", free: ["h00", "h10", "a0", "b0", "b1", "c0"] },
  { id: "h5", name: "bez závislosti od predstihu (5)", free: ["h00", "h10", "a0", "b0", "c0"] },
];
const HLAW_STEP: Record<HKey, number> = { h00: 0.2, h01: 0.05, h10: 0.1, h11: 0.05, a0: 0.2, a1: 0.05, b0: 0.1, b1: 0.03, c0: 0.2, c1: 0.05, d0: 0.05, d1: 0.02 };
const HLAW_BASE: Omit<HurdleLaw, "leadRefH" | "minLeadH" | "maxLeadH"> = { h00: -0.3, h01: 0, h10: 0.9, h11: 0, a0: 0.3, a1: 0, b0: 1, b1: 0, c0: 1.2, c1: 0, d0: 0, d1: 0 };

function fitHurdleLaw(train: FcCase[], spec: HLawSpec, physics: PhysicsParams, ref: { leadRefH: number; minLeadH: number; maxLeadH: number }): HurdleLaw {
  const groups = new Map<number, { x: number; y: number }[]>();
  for (const c of train) { const g = groups.get(c.lead) ?? []; g.push({ x: amount24Cm(c.hours, c.elevation, physics), y: c.obs }); groups.set(c.lead, g); }
  const wetGroups = new Map([...groups].map(([L, xy]) => [L, xy.filter((k) => k.y > 0)]));
  const law: HurdleLaw = { ...ref, ...HLAW_BASE };
  const part = (keys: HKey[], gs: Map<number, { x: number; y: number }[]>, which: "dry" | "wet") => {
    if (!keys.length) return;
    const f = (x: number[]) => {
      const trial = { ...law };
      keys.forEach((k, i) => { trial[k] = x[i]; });
      let nll = 0;
      for (const [L, xy] of gs) {
        const hp = hurdleAtLead(trial, L);
        if (which === "wet" && (hp.c < 0.05 || hp.d < 0 || hp.d > 2)) return Infinity;
        nll += hurdleNll(xy, hp)[which];
      }
      return nll;
    };
    const r = minimize(f, keys.map((k) => law[k]), keys.map((k) => HLAW_STEP[k]), { rounds: 120, minStep: 1e-3 });
    keys.forEach((k, i) => { law[k] = Math.round(r.x[i] * 1000) / 1000; });
  };
  part(spec.free.filter((k) => DRY_KEYS.includes(k)), groups, "dry");
  part(spec.free.filter((k) => !DRY_KEYS.includes(k)), wetGroups, "wet");
  return law;
}

interface LawResult { spec: HLawSpec; law: HurdleLaw; pooled: ProbScores; perLead: { lead: number; label: string; scores: ProbScores }[] }
const lawResults: LawResult[] = [];
const lawPcs: Record<string, ProbCase[]> = {};
let chosenLaw: LawResult | null = null;
let d2Law: HurdleLaw | null = null;

function phaseLaw(): void {
  say("");
  say("## Krok 3c – zákon podľa predstihu (IFS 9 km, dvojdielne rozdelenie, fyzika = dnešné pravidlo)");
  say("");
  say("Namiesto šiestich voľných parametrov na každý predstih jeden fit cez všetky predstihy 23–131 h, koeficienty lineárne v predstihu (dni od 23 h). Overenie zima proti zime; skóre na primárnej vzorke po predstihoch aj zlúčené. Voľba: najjednoduchší zákon do 0,01 CRPSS od najlepšieho.");
  const single = singleCases().filter((c) => inFitSample(c.M, { obs: c.obs, hs: c.hs, manual: c.manual }));
  const leads = [...new Set(single.map((c) => c.lead))].sort((a, b) => a - b);
  const ref = { leadRefH: leads[0], minLeadH: leads[0], maxLeadH: leads[leads.length - 1] };
  const bySeason = (c: FcCase) => c.season;
  for (const spec of HLAW_SPECS) {
    const { pc } = cvGeneric(single, bySeason, (train) => { const law = fitHurdleLaw(train, spec, PAGE_RULE, ref); return { amount: (c) => amount24Cm(c.hours, c.elevation, PAGE_RULE), dist: (L) => ({ kind: "hurdle", hp: hurdleAtLead(law, L) }) }; });
    const prim = pc.filter((k) => inPrimary(k.c.M, { obs: k.c.obs, hs: k.c.hs, manual: k.c.manual }));
    lawPcs[spec.id] = prim;
    const law = fitHurdleLaw(single, spec, PAGE_RULE, ref);
    lawResults.push({ spec, law, pooled: probScores(prim), perLead: leads.map((L) => ({ lead: L, label: `${L} h`, scores: probScores(prim.filter((k) => k.c.lead === L)) })) });
  }
  const perLeadFree = leadRows.filter((r) => r.source === "IFS 9 km single" && r.variant === "rule" && r.family === "hurdle").sort((a, b) => a.lead - b.lead);
  say("");
  say(`| Zákon | ${leads.map((L) => `BSS ${L} h`).join(" | ")} | **BSS zlúčené** (95 % CI) | **CRPSS zlúčené** (95 % CI) |`);
  say(`|---|${leads.map(() => "---").join("|")}|---|---|`);
  say(`| 6 voľných parametrov na predstih (krok 3b) | ${perLeadFree.map((r) => f2(r.primary.bss.est)).join(" | ")} | – | – |`);
  for (const r of lawResults) say(`| ${r.spec.name} | ${r.perLead.map((l) => f2(l.scores.bss.est)).join(" | ")} | **${ciText(r.pooled.bss)}** | **${ciText(r.pooled.crpss)}** |`);
  say("");
  say(`| Zákon | ${leads.map((L) => `CRPSS ${L} h`).join(" | ")} | h00 | h01 | h10 | h11 | a0 | b0 | b1 | c0 | c1 | d0 |`);
  say(`|---|${leads.map(() => "---").join("|")}|---|---|---|---|---|---|---|---|---|---|`);
  say(`| 6 voľných parametrov na predstih (krok 3b) | ${perLeadFree.map((r) => f2(r.primary.crpss.est)).join(" | ")} | | | | | | | | | | |`);
  for (const r of lawResults) say(`| ${r.spec.name} | ${r.perLead.map((l) => f2(l.scores.crpss.est)).join(" | ")} | ${f2(r.law.h00)} | ${f2(r.law.h01)} | ${f2(r.law.h10)} | ${f2(r.law.h11)} | ${f2(r.law.a0)} | ${f2(r.law.b0)} | ${f2(r.law.b1)} | ${f2(r.law.c0)} | ${f2(r.law.c1)} | ${f2(r.law.d0)} |`);
  // Choice: the simplest law within 0.01 CRPSS of the best that keeps the location's lead dependence (b1). A law
  // without any lead dependence scores the same in a two-winter cross-validation, but the free per-lead fits show
  // b falling steadily with lead, and the page extrapolates to leads the sample has few events for.
  const bOf = (r?: LeadRow): number => (r && r.all.kind === "hurdle" ? r.all.hp.b : NaN);
  const best = Math.max(...lawResults.map((r) => r.pooled.crpss.est ?? -Infinity));
  chosenLaw = [...lawResults].reverse().find((r) => r.spec.free.includes("b1") && (r.pooled.crpss.est ?? -Infinity) >= best - 0.01) ?? lawResults[0];
  say("");
  say(`Voľba: **${chosenLaw.spec.name}** – najjednoduchší zákon do 0,01 CRPSS od najlepšieho (${f3(best)}), ktorý zachováva pokles sklonu b s predstihom (voľné fity: b ${f2(bOf(perLeadFree[0]))} pri ${perLeadFree[0]?.label} → ${f2(bOf(perLeadFree[perLeadFree.length - 1]))} pri ${perLeadFree[perLeadFree.length - 1]?.label}); zákon bez závislosti od predstihu má v krížovej validácii dvoch zím rovnaké skóre, ale stránka musí extrapolovať tam, kde má vzorka málo udalostí. Koeficienty (fit na oboch zimách): ${chosenLaw.spec.free.map((k) => `${k} ${f3(chosenLaw!.law[k])}`).join(", ")}; referenčný predstih ${ref.leadRefH} h, platnosť ${ref.minLeadH}–${ref.maxLeadH} h (pod 23 h extrapolácia k predstihu 0, nad 131 h zafixované).`);
  say("");
  say("Brána z kroku 2 (primárna vzorka): pri 23 h BSS surového IFS 0,13 (−0,02–0,27) a pravidla −0,04; pri 71–83 h −0,04 až −0,26; pri predstihu 0 deterministicky 0,28–0,30. Dvojdielny model pri 23 h " + ciText(perLeadFree.find((r) => r.lead === 23)?.primary.bss ?? { est: null, lo: null, hi: null }) + ", pri 71 h " + ciText(perLeadFree.find((r) => r.lead === 71)?.primary.bss ?? { est: null, lo: null, hi: null }) + ", pri 83 h " + ciText(perLeadFree.find((r) => r.lead === 83)?.primary.bss ?? { est: null, lo: null, hi: null }) + ", pri 0 h " + ciText(leadRows.find((r) => r.source === "IFS 9 km hist" && r.variant === "rule" && r.family === "hurdle")?.primary.bss ?? { est: null, lo: null, hi: null }) + ".");
  say("");
  say(`Spoľahlivosť zvoleného zákona (primárna vzorka, všetky predstihy): ${relText(chosenLaw.pooled)}`);
  say("");
  say(`Spoľahlivosť pri 23–47 h: ${relText(probScores(cvGeneric(single.filter((c) => c.lead <= 47), bySeason, (train) => { const law = fitHurdleLaw(train, chosenLaw!.spec, PAGE_RULE, ref); return { amount: (c) => amount24Cm(c.hours, c.elevation, PAGE_RULE), dist: (L) => ({ kind: "hurdle", hp: hurdleAtLead(law, L) }) }; }).pc.filter((k) => inPrimary(k.c.M, { obs: k.c.obs, hs: k.c.hs, manual: k.c.manual }))))}`);

  // Decision table: what an ALERT at probability threshold p* would have meant, per station and season.
  say("");
  say("### Rozhodovacia tabuľka pre prah ALERTu p* (zvolený zákon, primárna vzorka, mimo vzorky)");
  say("");
  say("Prah p* = 1 / (N + 1), kde N = koľkokrát horší je zmeškaný powder deň než zbytočná cesta. Počty na stanicu a sezónu = počty delené počtom dvojíc stanica × sezóna vo vzorke.");
  for (const L of [23, 71]) {
    const pcL = (lawPcs[chosenLaw.spec.id] ?? []).filter((k) => k.c.lead === L);
    const ss = new Set(pcL.map((k) => `${k.c.station}|${k.c.season}`)).size;
    const events = pcL.filter((k) => k.c.obs >= THRESHOLD).length;
    say("");
    say(`Predstih ${L} h (${L === 23 ? "ráno deň vopred" : "tri dni vopred"}): ${pcL.length} staničných dní, ${events} udalostí, ${ss} dvojíc stanica × sezóna.`);
    say("");
    say("| p* (N) | ALERTov | zásahy | falošné | zmeškané | POD | FAR | ALERTov / stanicu a sezónu | falošných / stanicu a sezónu | zmeškaných / stanicu a sezónu |");
    say("|---|---|---|---|---|---|---|---|---|---|");
    for (const [pStar, N] of [[0.1, "9"], [0.15, "5,7"], [0.2, "4"], [0.25, "3"], [0.33, "2"], [0.5, "1"]] as [number, string][]) {
      const alerts = pcL.filter((k) => k.prob >= pStar);
      const hits = alerts.filter((k) => k.c.obs >= THRESHOLD).length, fa = alerts.length - hits, miss = events - hits;
      say(`| ${f2(pStar)} (${N}) | ${alerts.length} | ${hits} | ${fa} | ${miss} | ${f2(events ? hits / events : NaN)} | ${f2(alerts.length ? fa / alerts.length : NaN)} | ${f1(alerts.length / ss)} | ${f1(fa / ss)} | ${f1(miss / ss)} |`);
    }
  }

  const d2 = [...histCases("icon_d2"), ...prevCases("icon_d2", 1)].filter((c) => inFitSample(c.M, { obs: c.obs, hs: c.hs, manual: c.manual }));
  if (d2.length) {
    d2Law = fitHurdleLaw(d2, chosenLaw.spec, PAGE_RULE, { leadRefH: 0, minLeadH: 0, maxLeadH: 47 });
    say("");
    say(`ICON-D2: ten istý tvar zákona cez predstih 0 (${d2.filter((c) => c.lead === 0).length} dní) a 1 deň (${d2.filter((c) => c.lead > 0).length} dní): ${chosenLaw.spec.free.map((k) => `${k} ${f3(d2Law![k])}`).join(", ")} (sklony na deň predstihu); referenčný predstih 0 h, platnosť 0–47 h. Overenie mimo vzorky je v tabuľkách kroku 3b (0 h LOSO, 1 d zima proti zime).`);
  }
}

// ---------------------------------------------------------------------------
// Blend: IFS 35 h and ICON-D2 one day ahead for the same windows
// ---------------------------------------------------------------------------

let blendResult: { w: number; bss: Interval; crpss: Interval; ifs: ProbScores; d2: ProbScores; n: number; events: number } | null = null;

function phaseBlend(): void {
  say("");
  say("## Krok 3d – kombinácia IFS 9 km (35 h) + ICON-D2 (pred 1 dňom) na tých istých oknách, dvojdielne rozdelenie");
  const d2 = new Map(prevCases("icon_d2", 1).map((c) => [`${c.M}|${c.station}`, c]));
  const paired = singleCases().filter((c) => c.lead === 35 && inFitSample(c.M, { obs: c.obs, hs: c.hs, manual: c.manual })).map((c) => ({ ...c, hours2: d2.get(`${c.M}|${c.station}`)?.hours })).filter((c): c is FcCase & { hours2: ModelHour[] } => !!c.hours2);
  if (paired.length < 100) { say("Málo párov."); return; }
  const bySeason = (c: FcCase) => c.season;
  const x1 = (c: FcCase) => amount24Cm(c.hours, c.elevation, PAGE_RULE), x2 = (c: FcCase) => amount24Cm(c.hours2!, c.elevation, PAGE_RULE);
  /** Weight on a grid (0.1 steps), the two-part distribution refitted for each; the pair with the smallest likelihood wins. */
  const fitW = (train: FcCase[], fixedW: number | null): { w: number; hp: HurdleParams } => {
    let best: { w: number; hp: HurdleParams; nll: number } | null = null;
    for (const w of fixedW === null ? [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] : [fixedW]) {
      const xy = train.map((c) => ({ x: (1 - w) * x1(c) + w * x2(c), y: c.obs }));
      const hp = fitHurdle(xy);
      const n = hurdleNll(xy, hp);
      const nll = n.dry + n.wet;
      if (!best || nll < best.nll) best = { w, hp, nll };
    }
    return best!;
  };
  const run = (fixedW: number | null) => {
    const ws: number[] = [];
    const { pc } = cvGeneric(paired, bySeason, (train) => { const { w, hp } = fitW(train, fixedW); ws.push(w); return { amount: (c) => (1 - w) * x1(c) + w * x2(c), dist: () => ({ kind: "hurdle", hp }) }; });
    return { ws, scores: probScores(pc.filter((k) => inPrimary(k.c.M, { obs: k.c.obs, hs: k.c.hs, manual: k.c.manual }))) };
  };
  const only1 = run(0), only2 = run(1), both = run(null);
  const wAll = fitW(paired, null).w;
  say("");
  say("| Vstup | n | udalostí | **BSS** (95 % CI) | CRPSS (95 % CI) | váha ICON-D2 (po zimách) |");
  say("|---|---|---|---|---|---|");
  say(`| len IFS 35 h | ${only1.scores.n} | ${only1.scores.events} | **${ciText(only1.scores.bss)}** | ${ciText(only1.scores.crpss)} | 0 |`);
  say(`| len ICON-D2 1 d | ${only2.scores.n} | ${only2.scores.events} | **${ciText(only2.scores.bss)}** | ${ciText(only2.scores.crpss)} | 1 |`);
  say(`| vážený priemer úhrnov, váha fitovaná | ${both.scores.n} | ${both.scores.events} | **${ciText(both.scores.bss)}** | ${ciText(both.scores.crpss)} | ${both.ws.map(f2).join(" / ")} (na všetkom ${f2(wAll)}) |`);
  blendResult = { w: Math.round(wAll * 100) / 100, bss: both.scores.bss, crpss: both.scores.crpss, ifs: only1.scores, d2: only2.scores, n: both.scores.n, events: both.scores.events };
}

// ---------------------------------------------------------------------------
// The coefficients the page embeds
// ---------------------------------------------------------------------------

interface ClimRow { p: number; mean: number; n: number }
/** Climatology of the event for the page: by month without a cover condition (a cover condition in November
 * keeps only the days right after big storms, see step 1), plus the operating-window rate on days with cover. */
function climatologyTable(): Record<string, { name: string; elevation: number; byMonth: Record<string, ClimRow>; operatingWithCover: ClimRow }> {
  const out: Record<string, { name: string; elevation: number; byMonth: Record<string, ClimRow>; operatingWithCover: ClimRow }> = {};
  const rate = (i: number, keep: (d: string, hs: number | null) => boolean): ClimRow => {
    let n = 0, ev = 0, sum = 0;
    truth.dates.forEach((d, k) => {
      const v = truth.newSnowCm[i][k];
      if (v === null || !keep(d, truth.hsCm[i][k])) return;
      n++; sum += Math.max(0, v); if (v >= THRESHOLD) ev++;
    });
    return { p: n ? Math.round((ev / n) * 1000) / 1000 : 0, mean: n ? Math.round((sum / n) * 100) / 100 : 0, n };
  };
  for (const station of ["geosphere:20020", "ehyd:123133", "geosphere:122", "geosphere:186"]) {
    const i = truth.columns.findIndex((c) => c.id === `${station}:manual`);
    if (i < 0) continue;
    const byMonth: Record<string, ClimRow> = {};
    for (const month of [11, 12, 1, 2, 3, 4]) byMonth[String(month)] = rate(i, (d) => Number(d.slice(5, 7)) === month);
    out[station] = { name: stationName.get(station) ?? station, elevation: elevationOf(station), byMonth, operatingWithCover: rate(i, (d, hs) => inOperatingWindow(d) && hs !== null && hs >= COVER) };
  }
  return out;
}

function writeModel(): void {
  if (!chosenLaw) return;
  const rows = (source: string) => leadRows.filter((r) => r.source === source && r.variant === "rule" && r.family === "hurdle").sort((a, b) => a.lead - b.lead).map((r) => ({ lead: r.lead, label: r.label, n: r.primary.n, events: r.primary.events, bss: r.primary.bss, crpss: r.primary.crpss, auc: r.primary.auc, params: r.all.kind === "hurdle" ? r.all.hp : null }));
  const model = {
    version: 1,
    generatedAt: new Date().toISOString().slice(0, 10),
    event: { thresholdCm: THRESHOLD, continuousThresholdCm: EVENT_CM, window: "24 h ending at the 06 UTC morning observation; the page applies the same model to D-1 09:00 -> D 09:00 at the top station" },
    physics: PAGE_RULE,
    distribution: "two-part: P(Y > 0) = Phi(h0 + h1 sqrt(x)); sqrt(Y) | Y > 0 ~ Normal(a + b sqrt(x), c + d sqrt(x)) truncated at 0; P(Y >= 15) = P(Y > 0) x P(sqrt(Y) >= sqrt(15) | Y > 0); coefficients linear in (lead - leadRefH) / 24 with the lead clamped to [0, maxLeadH]",
    sources: {
      ecmwf_ifs: { label: "ECMWF IFS 9 km", law: chosenLaw.law, lawName: chosenLaw.spec.name, fittedOn: "single runs 00z/12z, winters 2024/25 and 2025/26, 6 stations; publication = init + 7 h", verification: { pooled: { bss: chosenLaw.pooled.bss, crpss: chosenLaw.pooled.crpss, n: chosenLaw.pooled.n, events: chosenLaw.pooled.events }, byLead: chosenLaw.perLead.map((l) => ({ lead: l.lead, n: l.scores.n, events: l.scores.events, bss: l.scores.bss, crpss: l.scores.crpss, auc: l.scores.auc })), perLeadFree: rows("IFS 9 km single"), lead0Hist: rows("IFS 9 km hist") } },
      icon_d2: d2Law ? { label: "ICON-D2", law: d2Law, lawName: `${chosenLaw.spec.name}, through lead 0 (Historical Forecast) and 1 d (Previous Runs)`, fittedOn: "Historical Forecast 2022/23-2025/26 at 14 stations and Previous Runs day 1 at 6 stations", verification: { lead0Hist: rows("ICON-D2 hist"), day1Prev: rows("ICON-D2 prev") } } : null,
    },
    blend: blendResult,
    climatology: { condition: "manual new snow; byMonth without a cover condition, operatingWithCover = 1 Dec - 15 Apr with snow depth >= 30 cm", stations: climatologyTable() },
  };
  writeFileSync(new URL("powder-model.json", OUT_DIR), `${JSON.stringify(model, null, 1)}\n`);
  say("");
  say("Zapísané: data/model/powder-model.json");
}

function phaseExplore(): void {
  say("");
  say("## Empirické podmienené rozdelenie pozorovania podľa predpovedaného úhrnu (fyzika = pravidlo, vzorka fitu)");
  say("");
  say("Dôvod dvojdielneho modelu: pri malých predpovedaných úhrnoch je podiel nulových pozorovaní oveľa vyšší, než dovolí cenzurované normálne rozdelenie s polohou ≈ √x, zatiaľ čo medián pozorovania je ≈ predpoveď.");
  const edges = [0, 0.001, 1, 3, 6, 10, 15, 25, 40, 1e9];
  const q = (v: number[], p: number) => { const a = [...v].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
  const show = (title: string, cases: FcCase[]) => {
    const fit = cases.filter((c) => inFitSample(c.M, { obs: c.obs, hs: c.hs, manual: c.manual }));
    say("");
    say(`${title}: ${fit.length} staničných dní`);
    say("");
    say("| x (pravidlo) [cm] | n | x̄ | ȳ | ȳ/x̄ | podiel y = 0 | q25 | medián | q75 | q90 | P(y ≥ 15) | √ȳ − √x̄ |");
    say("|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (let i = 0; i < edges.length - 1; i++) {
      const rows = fit.map((c) => ({ x: amount24Cm(c.hours, c.elevation, PAGE_RULE), y: c.obs })).filter((r) => r.x >= edges[i] && r.x < edges[i + 1]);
      if (!rows.length) continue;
      const xs = rows.map((r) => r.x), ys = rows.map((r) => r.y);
      const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
      say(`| ${edges[i]}–${edges[i + 1] > 1e8 ? "∞" : edges[i + 1]} | ${rows.length} | ${f1(mx)} | ${f1(my)} | ${f2(mx > 0 ? my / mx : NaN)} | ${f2(ys.filter((y) => y <= 0).length / ys.length)} | ${f1(q(ys, 0.25))} | ${f1(q(ys, 0.5))} | ${f1(q(ys, 0.75))} | ${f1(q(ys, 0.9))} | ${f2(ys.filter((y) => y >= 15).length / ys.length)} | ${f2(Math.sqrt(my) - Math.sqrt(mx))} |`);
    }
  };
  show("IFS hist 0 h", histCases("ecmwf_ifs"));
  const single = singleCases();
  show("IFS single 23 h", single.filter((c) => c.lead === 23));
  show("IFS single 71 h", single.filter((c) => c.lead === 71));
  show("IFS single 131 h", single.filter((c) => c.lead === 131));
  show("ICON-D2 prev 1 d", prevCases("icon_d2", 1));
  show("ICON-D2 hist 0 h", histCases("icon_d2"));
}

mkdirSync(OUT_DIR, { recursive: true });
if (only.has("physics")) phasePhysics();
if (only.has("explore")) phaseExplore();
if (only.has("lead")) phaseLead();
if (only.has("law")) phaseLaw();
if (only.has("blend")) phaseBlend();
if (only.has("law")) writeModel();
writeFileSync(new URL("REPORT.md", OUT_DIR), `${lines.join("\n")}\n`);
console.log("\nZapísané: data/model/REPORT.md");
