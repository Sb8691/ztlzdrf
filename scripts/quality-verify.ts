/**
 * Steps 6b and 6c of the day-quality work (npm run quality, METODIKA §4.5 / §5.4): what the archive
 * can say about powder quality, cloud and inversions, and whether a "good day" is better predicted
 * directly than as a product of its parts. Station truth and forecasts come from scripts/lib/hourly.ts.
 *
 *   6b  temperature during snowfall (dry / moist / wet bands) and the gust in the powder window
 *       (D-1 09:00 -> D 09:00), model against station on days both call snowy;
 *   6c  inversion at 13:00 (top warmer than the valley) and a sunny top above a grey valley on
 *       station pairs; whether low cloud and humidity add to the overcast forecast;
 *   6d  the page's "good" day (no rain, gust <= 40 km/h, >= 1 h sun) as a probability: direct
 *       logistic on the three model values against the product of calibrated components.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { SKI_CONFIG } from "../src/config.js";
import { fitLogistic, fitLogisticMulti, logisticMultiProb, logisticProb } from "./lib/calibrate.js";
import { HOUR, STATIONS, addDays, histGetters, liftStamps, loadTruth, powderStamps, prevGetters, singleRuns, type Getter, type Station } from "./lib/hourly.js";
import { TZ } from "./lib/hourly.js";
import { inOperatingWindow, seasonOf } from "./lib/season.js";
import { auc as aucOf, bootstrapBlocks, reliability, scores, type Case, type Interval } from "./lib/verify.js";
import { localTimeMs } from "../src/ski-core.js";

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.slice(2).split("="); return [k, v ?? "true"]; }));
/** Sections: snowtemp, gust, inversion, sunnytop, overcast, good, curves. */
const only = new Set((args.only ?? "snowtemp,gust,inversion,sunnytop,overcast,good,curves").split(","));
const T0 = Date.now();
const cfg = SKI_CONFIG;
const R = cfg.rules;
const OUT_DIR = new URL("../data/quality/", import.meta.url);
const SNOW_DAY_MM = 7; // ~5 cm by the page rule
const DRY_C = -4, WET_C = -1;

const truth = loadTruth();
const truthGet = new Map<string, Getter>();
for (const st of STATIONS) { const g = truth.getter(st); if (g) truthGet.set(st.key, g); }

// ---------------------------------------------------------------------------
// Forecast instances: one (source, station, date) with a getter
// ---------------------------------------------------------------------------

interface Instance { source: string; label: string; station: Station; date: string; get: Getter }
const instances: Instance[] = [];
const dates: string[] = [];
for (let d = truth.firstDay; d <= truth.lastDay; d = addDays(d, 1)) if (inOperatingWindow(d)) dates.push(d);

for (const model of ["ecmwf_ifs", "icon_d2"]) {
  const getters = histGetters(model);
  if (!getters) continue;
  for (const st of STATIONS) { const get = getters(st); if (!get || !truthGet.has(st.key)) continue; for (const date of dates) instances.push({ source: `hist:${model}`, label: "0 h", station: st, date, get }); }
}
{
  const prev = prevGetters();
  if (prev) for (const st of STATIONS) { const get = prev.getter(st); if (!get || !truthGet.has(st.key)) continue; for (const date of dates) if (date >= prev.firstDay && date <= prev.lastDay) instances.push({ source: "prev:icon_d2", label: "1 d", station: st, date, get }); }
}
for (const run of singleRuns()) {
  const firstDate = new Date(run.time0 * 1000).toISOString().slice(0, 10);
  for (let k = 0; k <= 6; k++) {
    const date = addDays(firstDate, k);
    const lift = liftStamps(date), pw = powderStamps(date);
    const open = lift[0] - HOUR;
    if (pw[0] < run.time0 + HOUR || open < run.publishedSec || lift[lift.length - 1] > run.lastStamp) continue;
    const lead = Math.round((open - run.publishedSec) / HOUR / 12) * 12;
    if (![12, 24, 48, 72].includes(lead)) continue;
    for (const st of STATIONS) { const get = run.getter(st); if (!get || !truthGet.has(st.key)) continue; instances.push({ source: "single:ecmwf_ifs", label: `${lead} h`, station: st, date, get }); }
  }
}
const SOURCE_NAMES: Record<string, string> = { "hist:ecmwf_ifs": "IFS 9 km, Historical Forecast", "hist:icon_d2": "ICON-D2, Historical Forecast", "prev:icon_d2": "ICON-D2, previous runs", "single:ecmwf_ifs": "IFS 9 km, celé behy 00z/12z" };
const sourceOrder = (a: string, b: string) => Object.keys(SOURCE_NAMES).indexOf(a.split("|")[0]) - Object.keys(SOURCE_NAMES).indexOf(b.split("|")[0]) || a.localeCompare(b, undefined, { numeric: true });

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

/** Snow-weighted mean temperature over the stamps (weights = precipitation where T <= snow limit); null below `minMm` of snow or on a gap. */
function snowTemp(get: Getter, stamps: number[], minMm: number): { tw: number; snowMm: number } | null {
  let w = 0, tw = 0;
  for (const s of stamps) {
    const p = get("precipitation", s), t = get("temperature_2m", s);
    if (p == null || t == null) return null;
    if (Math.round(t * 1000) / 1000 <= R.snowMaxTempC && p > 0) { w += p; tw += p * t; }
  }
  return w >= minMm ? { tw: tw / w, snowMm: w } : null;
}
function maxOver(get: Getter, v: string, stamps: number[]): number | null {
  let m = -Infinity;
  for (const s of stamps) { const x = get(v, s); if (x == null) return null; m = Math.max(m, x); }
  return m;
}
function sumOver(get: Getter, v: string, stamps: number[], scale = 1): number | null {
  let acc = 0;
  for (const s of stamps) { const x = get(v, s); if (x == null) return null; acc += x * scale; }
  return acc;
}
function meanOver(get: Getter, v: string, stamps: number[]): number | null {
  const s = sumOver(get, v, stamps);
  return s === null ? null : s / stamps.length;
}
function rainOver(get: Getter, stamps: number[]): number | null {
  let acc = 0;
  for (const s of stamps) { const p = get("precipitation", s), t = get("temperature_2m", s); if (p == null || t == null) return null; if (Math.round(t * 1000) / 1000 > R.snowMaxTempC) acc += p; }
  return acc;
}
const band = (t: number) => (t <= DRY_C ? "suchý" : t <= WET_C ? "vlhší" : "mokrý");

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

interface QCase extends Case { season: string; g: number[]; det: boolean }
const f2 = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? "–" : x.toFixed(2).replace(".", ","));
const f1 = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? "–" : x.toFixed(1).replace(".", ","));
const ci = (b: Interval) => `${f2(b.est)} (${f2(b.lo)}–${f2(b.hi)})`;
const lines: string[] = [];
const say = (s = "") => { lines.push(s); console.log(s); if (s.startsWith("###")) console.error(`   [${((Date.now() - T0) / 1000).toFixed(0)} s]`); };

/** Event climatology by station and month from the other seasons of the same cases. */
function withClimatology(cases: QCase[]): QCase[] {
  const key = (c: QCase) => `${c.station}|${c.day.slice(5, 7)}`;
  const groups = new Map<string, QCase[]>();
  for (const c of cases) { const k = key(c); groups.set(k, [...(groups.get(k) ?? []), c]); }
  const byStation = new Map<string, QCase[]>();
  for (const c of cases) byStation.set(c.station, [...(byStation.get(c.station) ?? []), c]);
  return cases.map((c) => {
    const others = (groups.get(key(c)) ?? []).filter((k) => k.season !== c.season);
    const pool = others.length >= 20 ? others : (byStation.get(c.station) ?? []).filter((k) => k.season !== c.season);
    const p = pool.length ? pool.filter((k) => k.obs >= 1).length / pool.length : 0.1;
    return { ...c, clim: p };
  });
}

/** Deterministic yes/no plus a logistic probability fitted leave-one-season-out on g (one input with a non-negative slope, several without). */
function evaluate(raw: QCase[]): { n: number; events: number; climRate: number; det: ReturnType<typeof scores>; bssDet: Interval; cal: ReturnType<typeof scores>; bssCal: Interval; auc: number | null; rel: ReturnType<typeof reliability>; fit: unknown } | null {
  if (raw.length < 60) return null;
  const cases = withClimatology(raw);
  const det = cases.map((c) => ({ ...c, prob: c.det ? 1 : 0 }));
  const sDet = scores(det, 1);
  const k = cases[0].g.length;
  const seasons = [...new Set(cases.map((c) => c.season))];
  const cal: Case[] = [];
  for (const s of seasons) {
    const train = cases.filter((c) => c.season !== s);
    const test = cases.filter((c) => c.season === s);
    if (k === 1) { const fit = fitLogistic(train.map((c) => ({ g: c.g[0], y: c.obs >= 1 ? 1 : 0 }))); for (const c of test) cal.push({ ...c, prob: logisticProb(c.g[0], fit) }); }
    else { const fit = fitLogisticMulti(train.map((c) => ({ g: c.g, y: c.obs >= 1 ? 1 : 0 })), k); for (const c of test) cal.push({ ...c, prob: logisticMultiProb(c.g, fit) }); }
  }
  const sCal = scores(cal, 1);
  const guard = (x: Case[]) => { const r = scores(x, 1); return r.events >= 5 ? r.bss : null; };
  const bssDet = bootstrapBlocks(det, guard); bssDet.est = sDet.bss;
  const bssCal = bootstrapBlocks(cal, guard, 10, 1000, 13); bssCal.est = sCal.bss;
  const pos = cases.filter((c) => c.obs >= 1), neg = cases.filter((c) => c.obs < 1);
  const fitAll = k === 1 ? fitLogistic(cases.map((c) => ({ g: c.g[0], y: c.obs >= 1 ? 1 : 0 }))) : fitLogisticMulti(cases.map((c) => ({ g: c.g, y: c.obs >= 1 ? 1 : 0 })), k);
  // One input: the value itself ranks; several: the in-sample curve (AUC is rank-only, the skill numbers above are out of sample).
  const score = (c: QCase) => (k === 1 ? c.g[0] : logisticMultiProb(c.g, fitAll as { a: number; b: number[] }));
  return { n: cases.length, events: pos.length, climRate: cases.reduce((a, c) => a + c.clim, 0) / cases.length, det: sDet, bssDet, cal: sCal, bssCal, auc: aucOf(pos.map(score), neg.map(score)), rel: reliability(cal, 1), fit: fitAll };
}
const relText = (rel: ReturnType<typeof reliability>) => rel.filter((b) => b.n >= 20).map((b) => `${f2(b.meanProb)}→${f2(b.obsFreq)} (${b.n})`).join(", ") || "–";
const groupBy = <T>(list: T[], key: (x: T) => string): Map<string, T[]> => { const m = new Map<string, T[]>(); for (const x of list) m.set(key(x), [...(m.get(key(x)) ?? []), x]); return m; };
const results: Record<string, unknown> = {};

say("## Krok 6b/6c – kvalita powderu, oblak a inverzie, dobrý deň priamo");
say("");
say(`Pravda: hodinové dáta automatov GeoSphere (${STATIONS.map((s) => `${s.name} ${s.elevation} m`).join(", ")}), zimy ${seasonOf(truth.firstDay)}–${seasonOf(truth.lastDay)}, sezóna prevádzky. Zdroje ako v §5.3; IFS celé behy len predstihy 12/24/48/72 h. „det.“ = áno/nie modelu na uvedenom prahu, „kal.“ = logistická kalibrácia fitovaná bez testovanej sezóny; BSS proti klimatológii stanice a mesiaca z ostatných sezón; CI blokový bootstrap po dňoch.`);

// ---------------------------------------------------------------------------
// 6b1 temperature during snowfall
// ---------------------------------------------------------------------------
if (only.has("snowtemp")) {
say("");
say(`### 6b – teplota počas sneženia v powder okne (D−1 09:00 → D 09:00): dni, keď stanica aj model majú ≥ ${SNOW_DAY_MM} mm snehovej vody`);
say("");
say(`Pásma (predpoklad z literatúry, nefitujú sa): suchý ≤ ${DRY_C} °C, vlhší ${DRY_C}…${WET_C} °C, mokrý > ${WET_C} °C, podľa priemeru teploty váženého snehom.`);
say("");
say("| Zdroj | Predstih | n dní | bias T [°C] | MAE T [°C] | zhoda pásma | P(stanica suchý │ model suchý) | P(stanica mokrý │ model mokrý) | podiel dní suchý (stanica / model) |");
say("|---|---|---|---|---|---|---|---|---|");
{
  const rows: { source: string; label: string; st: string; dT: number; bs: string; bm: string }[] = [];
  for (const inst of instances) {
    if (inst.station.group !== "hory") continue;
    const stamps = powderStamps(inst.date);
    const a = snowTemp(truthGet.get(inst.station.key)!, stamps, SNOW_DAY_MM), b = snowTemp(inst.get, stamps, SNOW_DAY_MM);
    if (!a || !b) continue;
    rows.push({ source: inst.source, label: inst.label, st: inst.station.key, dT: b.tw - a.tw, bs: band(a.tw), bm: band(b.tw) });
  }
  const out: Record<string, unknown> = {};
  for (const [key, g] of [...groupBy(rows, (r) => `${r.source}|${r.label}`)].sort(([a], [b]) => sourceOrder(a, b))) {
    if (g.length < 30) continue;
    const bias = g.reduce((s, r) => s + r.dT, 0) / g.length, mae = g.reduce((s, r) => s + Math.abs(r.dT), 0) / g.length;
    const agree = g.filter((r) => r.bs === r.bm).length / g.length;
    const md = g.filter((r) => r.bm === "suchý"), mw = g.filter((r) => r.bm === "mokrý");
    const [source, label] = key.split("|");
    out[key] = { n: g.length, bias, mae, agree, dryGivenDry: md.length ? md.filter((r) => r.bs === "suchý").length / md.length : null, wetGivenWet: mw.length ? mw.filter((r) => r.bs === "mokrý").length / mw.length : null };
    say(`| ${SOURCE_NAMES[source]} | ${label} | ${g.length} | ${f2(bias)} | ${f2(mae)} | ${f2(agree)} | ${md.length ? `${f2(md.filter((r) => r.bs === "suchý").length / md.length)} (${md.length})` : "–"} | ${mw.length ? `${f2(mw.filter((r) => r.bs === "mokrý").length / mw.length)} (${mw.length})` : "–"} | ${f2(g.filter((r) => r.bs === "suchý").length / g.length)} / ${f2(md.length / g.length)} |`);
  }
  results.snowTemp = out;
}
}

// ---------------------------------------------------------------------------
// 6b2 gust in the powder window
// ---------------------------------------------------------------------------
if (only.has("gust")) for (const [thr, title] of [[35, "sneh sa začína prenášať"], [60, "sfúkané"]] as [number, string][]) {
  say("");
  say(`### 6b – najsilnejší náraz v powder okne > ${thr} km/h (${title}), horské stanice; „snehové dni“ = stanica ≥ ${SNOW_DAY_MM} mm snehovej vody v okne`);
  say("");
  say("| Zdroj | Predstih | vzorka | n | udal. | klim. | POD | FAR | **BSS det.** (CI) | AUC | bias [km/h] | **BSS kal.** (CI) | spoľahlivosť kal. |");
  say("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  const out: Record<string, unknown> = {};
  for (const subset of ["všetky dni", "snehové dni"]) {
    const cases: QCase[] = [];
    for (const inst of instances) {
      if (inst.station.group !== "hory") continue;
      const stamps = powderStamps(inst.date), tg = truthGet.get(inst.station.key)!;
      const a = maxOver(tg, "wind_gusts_10m", stamps), b = maxOver(inst.get, "wind_gusts_10m", stamps);
      if (a === null || b === null) continue;
      if (subset === "snehové dni" && !snowTemp(tg, stamps, SNOW_DAY_MM)) continue;
      cases.push({ day: inst.date, station: `${inst.source}|${inst.label}|${inst.station.key}`, obs: a > thr ? 1 : 0, fc: b, clim: 0, climMean: NaN, season: seasonOf(inst.date), g: [b / 10], det: b > thr });
    }
    for (const [key, g] of [...groupBy(cases, (c) => c.station.split("|").slice(0, 2).join("|"))].sort(([a], [b]) => sourceOrder(a, b))) {
      const fixed = g.map((c) => ({ ...c, station: c.station.split("|")[2] }));
      const r = evaluate(fixed);
      if (!r) continue;
      const [source, label] = key.split("|");
      const bias = fixed.reduce((s, c) => s + (c.fc as number), 0) / fixed.length - 0; // model mean; station mean below
      const stMean = cases.length ? 0 : 0; void stMean; void bias;
      out[`${thr}|${subset}|${key}`] = { n: r.n, events: r.events, bssDet: r.bssDet, bssCal: r.bssCal, auc: r.auc, fit: r.fit };
      say(`| ${SOURCE_NAMES[source]} | ${label} | ${subset} | ${r.n} | ${r.events} | ${f2(r.climRate)} | ${f2(r.det.pod)} | ${f2(r.det.far)} | **${ci(r.bssDet)}** | ${f2(r.auc)} | ${f1(meanDiffGust(key, subset))} | **${ci(r.bssCal)}** | ${relText(r.rel)} |`);
    }
  }
  results[`gust${thr}`] = out;
}
function meanDiffGust(key: string, subset: string): number | null {
  const [source, label] = key.split("|");
  let s = 0, n = 0;
  for (const inst of instances) {
    if (inst.source !== source || inst.label !== label || inst.station.group !== "hory") continue;
    const stamps = powderStamps(inst.date), tg = truthGet.get(inst.station.key)!;
    const a = maxOver(tg, "wind_gusts_10m", stamps), b = maxOver(inst.get, "wind_gusts_10m", stamps);
    if (a === null || b === null) continue;
    if (subset === "snehové dni" && !snowTemp(tg, stamps, SNOW_DAY_MM)) continue;
    s += b - a; n++;
  }
  return n ? s / n : null;
}

// ---------------------------------------------------------------------------
// 6c station pairs: inversion and sunny top above a grey valley (lead 0 only - the valley points exist only in the Historical Forecast)
// ---------------------------------------------------------------------------
const PAIRS: [string, string][] = [["20021", "20105"], ["122", "103"], ["186", "103"]];
const stationOf = (key: string) => STATIONS.find((s) => s.key === key)!;
if (only.has("inversion")) {
say("");
say("### 6c – inverzia o 13:00: vrchol teplejší než údolie (dvojice staníc), predstih 0");
say("");
say("| Zdroj | Dvojica | n | udal. | klim. | POD | FAR | **BSS det.** (CI) | AUC | bias ΔT [°C] | **BSS kal.** (CI) | spoľahlivosť kal. |");
say("|---|---|---|---|---|---|---|---|---|---|---|---|");
{
  const out: Record<string, unknown> = {};
  for (const model of ["ecmwf_ifs", "icon_d2"]) {
    const getters = histGetters(model);
    if (!getters) continue;
    for (const [topKey, valKey] of [...PAIRS, ["all", "all"] as [string, string]]) {
      const cases: QCase[] = [];
      let dsum = 0;
      for (const [tk, vk] of topKey === "all" ? PAIRS : [[topKey, valKey]]) {
        const top = stationOf(tk), val = stationOf(vk);
        const gt = getters(top), gv = getters(val), tt = truthGet.get(tk), tv = truthGet.get(vk);
        if (!gt || !gv || !tt || !tv) continue;
        for (const date of dates) {
          const s = localTimeMs(date, 13, TZ) / 1000;
          const a = tt("temperature_2m", s), b = tv("temperature_2m", s), c = gt("temperature_2m", s), d = gv("temperature_2m", s);
          if (a == null || b == null || c == null || d == null) continue;
          const obs = a - b, fc = c - d;
          dsum += fc - obs;
          cases.push({ day: date, station: `${tk}-${vk}`, obs: obs >= 0 ? 1 : 0, fc, clim: 0, climMean: NaN, season: seasonOf(date), g: [fc], det: fc >= 0 });
        }
      }
      const r = evaluate(cases);
      if (!r) continue;
      const name = topKey === "all" ? "všetky dvojice" : `${stationOf(topKey).name} ${stationOf(topKey).elevation} m – ${stationOf(valKey).name} ${stationOf(valKey).elevation} m`;
      out[`${model}|${topKey}-${valKey}`] = { n: r.n, events: r.events, bssDet: r.bssDet, bssCal: r.bssCal, auc: r.auc, fit: r.fit };
      say(`| ${SOURCE_NAMES[`hist:${model}`]} | ${name} | ${r.n} | ${r.events} | ${f2(r.climRate)} | ${f2(r.det.pod)} | ${f2(r.det.far)} | **${ci(r.bssDet)}** | ${f2(r.auc)} | ${f1(dsum / cases.length)} | **${ci(r.bssCal)}** | ${relText(r.rel)} |`);
    }
  }
  results.inversion = out;
}
}

if (only.has("sunnytop")) {
say("");
say(`### 6c – slnečný vrchol nad sivým údolím: vrchol ≥ 3 h slnka počas lanoviek a údolie < ${R.minSunHours} h (dvojice staníc), predstih 0`);
say("");
say("| Zdroj | Dvojica | n | udal. | klim. | POD | FAR | **BSS det.** (CI) | AUC | **BSS kal.** (slnko hore, dole) (CI) | spoľahlivosť kal. |");
say("|---|---|---|---|---|---|---|---|---|---|---|");
{
  const out: Record<string, unknown> = {};
  for (const model of ["ecmwf_ifs", "icon_d2"]) {
    const getters = histGetters(model);
    if (!getters) continue;
    for (const [topKey, valKey] of [...PAIRS, ["all", "all"] as [string, string]]) {
      const cases: QCase[] = [];
      for (const [tk, vk] of topKey === "all" ? PAIRS : [[topKey, valKey]]) {
        const top = stationOf(tk), val = stationOf(vk);
        const gt = getters(top), gv = getters(val), tt = truthGet.get(tk), tv = truthGet.get(vk);
        if (!gt || !gv || !tt || !tv) continue;
        for (const date of dates) {
          const stamps = liftStamps(date);
          const a = sumOver(tt, "sunshine_duration", stamps, 1 / 3600), b = sumOver(tv, "sunshine_duration", stamps, 1 / 3600), c = sumOver(gt, "sunshine_duration", stamps, 1 / 3600), d = sumOver(gv, "sunshine_duration", stamps, 1 / 3600);
          if (a === null || b === null || c === null || d === null) continue;
          cases.push({ day: date, station: `${tk}-${vk}`, obs: a >= 3 && b < R.minSunHours ? 1 : 0, fc: c - d, clim: 0, climMean: NaN, season: seasonOf(date), g: [c, d], det: c >= 3 && d < R.minSunHours });
        }
      }
      const r = evaluate(cases);
      if (!r) continue;
      const name = topKey === "all" ? "všetky dvojice" : `${stationOf(topKey).name} – ${stationOf(valKey).name}`;
      out[`${model}|${topKey}-${valKey}`] = { n: r.n, events: r.events, bssDet: r.bssDet, bssCal: r.bssCal, auc: r.auc, fit: r.fit };
      say(`| ${SOURCE_NAMES[`hist:${model}`]} | ${name} | ${r.n} | ${r.events} | ${f2(r.climRate)} | ${f2(r.det.pod)} | ${f2(r.det.far)} | **${ci(r.bssDet)}** | ${f2(r.auc)} | **${ci(r.bssCal)}** | ${relText(r.rel)} |`);
    }
  }
  results.sunnyTop = out;
}
}

// ---------------------------------------------------------------------------
// 6c3 overcast: does low cloud / humidity add to sunshine?
// ---------------------------------------------------------------------------
if (only.has("overcast")) {
say("");
say(`### 6c – zamračenie (< ${R.minSunHours} h slnka počas lanoviek): pridajú nízka oblačnosť a vlhkosť k predpovedanému slnku? (Historical Forecast, všetky stanice)`);
say("");
say("| Zdroj | prediktory | n | udal. | **BSS kal.** (CI) | AUC | spoľahlivosť kal. |");
say("|---|---|---|---|---|---|---|");
{
  const out: Record<string, unknown> = {};
  for (const model of ["ecmwf_ifs", "icon_d2"]) {
    const getters = histGetters(model);
    if (!getters) continue;
    const base: { date: string; st: Station; sun: number; cloud: number | null; rh: number | null; obs: number }[] = [];
    for (const st of STATIONS) {
      const g = getters(st), tg = truthGet.get(st.key);
      if (!g || !tg) continue;
      for (const date of dates) {
        const stamps = liftStamps(date);
        const a = sumOver(tg, "sunshine_duration", stamps, 1 / 3600), c = sumOver(g, "sunshine_duration", stamps, 1 / 3600);
        if (a === null || c === null) continue;
        base.push({ date, st, sun: c, cloud: meanOver(g, "cloud_cover_low", stamps), rh: meanOver(g, "relative_humidity_2m", stamps), obs: a < R.minSunHours ? 1 : 0 });
      }
    }
    const variants: [string, (b: typeof base[number]) => number[] | null][] = [
      ["slnko", (b) => [7 - b.sun]],
      ["slnko + nízka oblačnosť", (b) => (b.cloud === null ? null : [7 - b.sun, b.cloud / 100])],
      ["slnko + nízka oblačnosť + vlhkosť", (b) => (b.cloud === null || b.rh === null ? null : [7 - b.sun, b.cloud / 100, b.rh / 100])],
    ];
    for (const [name, gOf] of variants) {
      const cases: QCase[] = [];
      for (const b of base) { const g = gOf(b); if (!g) continue; cases.push({ day: b.date, station: b.st.key, obs: b.obs, fc: b.sun, clim: 0, climMean: NaN, season: seasonOf(b.date), g, det: b.sun < R.minSunHours }); }
      const r = evaluate(cases);
      if (!r) continue;
      out[`${model}|${name}`] = { n: r.n, events: r.events, bssCal: r.bssCal, auc: r.auc, fit: r.fit };
      say(`| ${SOURCE_NAMES[`hist:${model}`]} | ${name} | ${r.n} | ${r.events} | **${ci(r.bssCal)}** | ${f2(r.auc)} | ${relText(r.rel)} |`);
    }
  }
  results.overcastPredictors = out;
}
}

// ---------------------------------------------------------------------------
// 6d direct "good day"
// ---------------------------------------------------------------------------
if (only.has("good")) {
say("");
say(`### Dobrý deň stránky (dážď < ${R.rainFairMm} mm, náraz ≤ ${R.gustFairKmh} km/h, slnko ≥ ${R.minSunHours} h, všetko na jednej stanici), horské stanice: priamo vs. súčin zložiek`);
say("");
say("| Zdroj | Predstih | n | dobrých dní | klim. | **BSS det.** (áno/nie stránky) (CI) | **BSS súčin kalibrovaných zložiek** (CI) | **BSS priama kalibrácia** (CI) | AUC priama | spoľahlivosť priamej |");
say("|---|---|---|---|---|---|---|---|---|---|");
{
  const out: Record<string, unknown> = {};
  interface GCase { date: string; st: Station; season: string; rainM: number; gustM: number; sunM: number; rainS: number; gustS: number; sunS: number }
  const all: Record<string, GCase[]> = {};
  for (const inst of instances) {
    if (inst.station.group !== "hory") continue;
    const stamps = liftStamps(inst.date), tg = truthGet.get(inst.station.key)!;
    const rainM = rainOver(inst.get, stamps), gustM = maxOver(inst.get, "wind_gusts_10m", stamps), sunM = sumOver(inst.get, "sunshine_duration", stamps, 1 / 3600);
    const rainS = rainOver(tg, stamps), gustS = maxOver(tg, "wind_gusts_10m", stamps), sunS = sumOver(tg, "sunshine_duration", stamps, 1 / 3600);
    if ([rainM, gustM, sunM, rainS, gustS, sunS].some((v) => v === null)) continue;
    (all[`${inst.source}|${inst.label}`] ??= []).push({ date: inst.date, st: inst.station, season: seasonOf(inst.date), rainM: rainM!, gustM: gustM!, sunM: sunM!, rainS: rainS!, gustS: gustS!, sunS: sunS! });
  }
  const good = (rain: number, gust: number, sun: number) => rain < R.rainFairMm && gust <= R.gustFairKmh && sun >= R.minSunHours;
  for (const [key, g] of Object.entries(all).sort(([a], [b]) => sourceOrder(a, b))) {
    if (g.length < 60) continue;
    const [source, label] = key.split("|");
    const mk = (gOf: (c: GCase) => number[]): QCase[] => g.map((c) => ({ day: c.date, station: c.st.key, obs: good(c.rainS, c.gustS, c.sunS) ? 1 : 0, fc: 0, clim: 0, climMean: NaN, season: c.season, g: gOf(c), det: good(c.rainM, c.gustM, c.sunM) }));
    const direct = evaluate(mk((c) => [Math.sqrt(c.rainM), c.gustM / 10, 7 - c.sunM]));
    if (!direct) continue;
    // Product of independently calibrated components (each LOSO): P(good) = (1 - p_rain)(1 - p_gust)(1 - p_sunLow).
    const comps: [string, (c: GCase) => number, (c: GCase) => boolean][] = [["rain", (c) => Math.sqrt(c.rainM), (c) => c.rainS >= R.rainFairMm], ["gust", (c) => c.gustM / 10, (c) => c.gustS > R.gustFairKmh], ["sun", (c) => 7 - c.sunM, (c) => c.sunS < R.minSunHours]];
    const seasons = [...new Set(g.map((c) => c.season))];
    const probProduct = new Map<GCase, number>();
    for (const s of seasons) {
      const train = g.filter((c) => c.season !== s), test = g.filter((c) => c.season === s);
      const fits = comps.map(([, gOf, evOf]) => fitLogistic(train.map((c) => ({ g: gOf(c), y: evOf(c) ? 1 : 0 }))));
      for (const c of test) probProduct.set(c, comps.reduce((p, [, gOf], i) => p * (1 - logisticProb(gOf(c), fits[i])), 1));
    }
    const prodCases = withClimatology(mk(() => [0])).map((q, i) => ({ ...q, prob: probProduct.get(g[i])! }));
    const sProd = scores(prodCases, 1);
    const bssProd = bootstrapBlocks(prodCases, (x) => { const r = scores(x, 1); return r.events >= 5 ? r.bss : null; }, 10, 1000, 14); bssProd.est = sProd.bss;
    out[key] = { n: direct.n, good: direct.events, bssDet: direct.bssDet, bssProduct: bssProd, bssDirect: direct.bssCal, fit: direct.fit };
    say(`| ${SOURCE_NAMES[source]} | ${label} | ${direct.n} | ${direct.events} | ${f2(direct.climRate)} | **${ci(direct.bssDet)}** | **${ci(bssProd)}** | **${ci(direct.bssCal)}** | ${f2(direct.auc)} | ${relText(direct.rel)} |`);
  }
  results.goodDay = out;
}
}

mkdirSync(OUT_DIR, { recursive: true });
if (only.size >= 6) {
  writeFileSync(new URL("REPORT.md", OUT_DIR), `${lines.join("\n")}\n`);
  writeFileSync(new URL("quality-verification.json", OUT_DIR), `${JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), bands: { dryC: DRY_C, wetC: WET_C, snowDayMm: SNOW_DAY_MM }, results }, null, 1)}\n`);
  say("");
  say("Zapísané: data/quality/REPORT.md, data/quality/quality-verification.json");
}

/** Snow-temperature bias of each model at lead 0 (the curves section needs it when run alone). */
function snowTempBias(): Record<string, { bias: number }> {
  const out: Record<string, { bias: number }> = {};
  for (const model of ["ecmwf_ifs", "icon_d2"]) {
    let s = 0, n = 0;
    for (const inst of instances) {
      if (inst.source !== `hist:${model}` || inst.station.group !== "hory") continue;
      const stamps = powderStamps(inst.date);
      const a = snowTemp(truthGet.get(inst.station.key)!, stamps, SNOW_DAY_MM), b = snowTemp(inst.get, stamps, SNOW_DAY_MM);
      if (!a || !b) continue;
      s += b.tw - a.tw; n++;
    }
    out[`hist:${model}|0 h`] = { bias: n ? s / n : 0 };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Curves for the page (step 6d): one logistic per component and model from the Historical Forecast
// (lead 0, four winters, six stations - §5.3 shows the curves move little to ~3 days), the inversion
// curve from ICON-D2, and the snow-temperature bias of each model.
// ---------------------------------------------------------------------------
if (only.has("curves")) {
  const curves: Record<string, Record<string, unknown>> = {};
  for (const model of ["ecmwf_ifs", "icon_d2"]) {
    const getters = histGetters(model);
    if (!getters) continue;
    const rows: { st: Station; rainM: number; gustM: number; sunM: number; cloud: number | null; rh: number | null; rainS: number; gustS: number; sunS: number }[] = [];
    for (const st of STATIONS) {
      const g = getters(st), tg = truthGet.get(st.key);
      if (!g || !tg) continue;
      for (const date of dates) {
        const stamps = liftStamps(date);
        const rainM = rainOver(g, stamps), gustM = maxOver(g, "wind_gusts_10m", stamps), sunM = sumOver(g, "sunshine_duration", stamps, 1 / 3600);
        const rainS = rainOver(tg, stamps), gustS = maxOver(tg, "wind_gusts_10m", stamps), sunS = sumOver(tg, "sunshine_duration", stamps, 1 / 3600);
        if ([rainM, gustM, sunM, rainS, gustS, sunS].some((v) => v === null)) continue;
        rows.push({ st, rainM: rainM!, gustM: gustM!, sunM: sunM!, cloud: meanOver(g, "cloud_cover_low", stamps), rh: meanOver(g, "relative_humidity_2m", stamps), rainS: rainS!, gustS: gustS!, sunS: sunS! });
      }
    }
    const mountain = rows.filter((r) => r.st.group === "hory");
    const fit1 = (list: typeof rows, g: (r: typeof rows[number]) => number, ev: (r: typeof rows[number]) => boolean) => fitLogistic(list.map((r) => ({ g: g(r), y: ev(r) ? 1 : 0 })));
    const withCloud = rows.filter((r) => r.cloud !== null && r.rh !== null);
    curves[model] = {
      rainBad: { input: "sqrt(rain mm during lift hours at the base)", ...fit1(rows, (r) => Math.sqrt(r.rainM), (r) => r.rainS >= R.rainBadMm) },
      rainFair: { input: "sqrt(rain mm)", ...fit1(rows, (r) => Math.sqrt(r.rainM), (r) => r.rainS >= R.rainFairMm) },
      gustBad: { input: "max gust km/h / 10 at the top", ...fit1(mountain, (r) => r.gustM / 10, (r) => r.gustS > R.gustBadKmh) },
      gustFair: { input: "max gust km/h / 10", ...fit1(mountain, (r) => r.gustM / 10, (r) => r.gustS > R.gustFairKmh) },
      sunLow: { input: "7 - sunshine hours at the top", ...fit1(rows, (r) => 7 - r.sunM, (r) => r.sunS < R.minSunHours) },
      sunLowCloud: { input: ["7 - sunshine hours", "mean low cloud cover / 100", "mean relative humidity / 100"], ...fitLogisticMulti(withCloud.map((r) => ({ g: [7 - r.sunM, r.cloud! / 100, r.rh! / 100], y: r.sunS < R.minSunHours ? 1 : 0 })), 3), n: withCloud.length },
      n: rows.length,
    };
  }
  // Inversion: ICON-D2 only (IFS has no skill, §5.4).
  const inversion: Record<string, unknown> = {};
  for (const model of ["icon_d2"]) {
    const getters = histGetters(model);
    if (!getters) continue;
    const pairs: { g: number; y: 0 | 1 }[] = [];
    for (const [tk, vk] of PAIRS) {
      const gt = getters(stationOf(tk)), gv = getters(stationOf(vk)), tt = truthGet.get(tk), tv = truthGet.get(vk);
      if (!gt || !gv || !tt || !tv) continue;
      for (const date of dates) {
        const s = localTimeMs(date, 13, TZ) / 1000;
        const a = tt("temperature_2m", s), b = tv("temperature_2m", s), c = gt("temperature_2m", s), d = gv("temperature_2m", s);
        if (a == null || b == null || c == null || d == null) continue;
        pairs.push({ g: c - d, y: a - b >= 0 ? 1 : 0 });
      }
    }
    inversion[model] = { input: "model T(13:00) top - base, °C", ...fitLogistic(pairs), n: pairs.length };
  }
  const snowTemp = (results.snowTemp as Record<string, { bias: number }> | undefined) ?? snowTempBias();
  const model = {
    version: 1,
    generatedAt: new Date().toISOString().slice(0, 10),
    fittedOn: "Historical Forecast lead 0, winters 2022/23-2025/26, six GeoSphere stations, operating window",
    curves,
    inversion,
    snowTemp: { dryC: DRY_C, wetC: WET_C, minSnowCm: SNOW_DAY_MM * R.snowCmPerMm, biasC: { ecmwf_ifs: Math.round(-(snowTemp["hist:ecmwf_ifs|0 h"]?.bias ?? 0) * 10) / 10, icon_d2: Math.round(-(snowTemp["hist:icon_d2|0 h"]?.bias ?? 0) * 10) / 10 } },
  };
  writeFileSync(new URL("quality-model.json", OUT_DIR), `${JSON.stringify(model, null, 1)}\n`);
  say("");
  say(`Krivky pre stránku (predstih 0, štyri zimy): ${Object.entries(curves).map(([m, c]) => `${m}: ${["rainBad", "rainFair", "gustBad", "gustFair", "sunLow"].map((k) => `${k} a ${f2((c[k] as { a: number }).a)}, b ${f2((c[k] as { b: number }).b)}`).join("; ")}; sunLowCloud a ${f2((c.sunLowCloud as { a: number }).a)}, b ${((c.sunLowCloud as { b: number[] }).b).map(f2).join("/")}`).join(" | ")}; inverzia ICON-D2 a ${f2((inversion.icon_d2 as { a: number })?.a)}, b ${f2((inversion.icon_d2 as { b: number })?.b)}; korekcia teploty počas sneženia IFS ${f1(model.snowTemp.biasC.ecmwf_ifs)} °C, ICON-D2 ${f1(model.snowTemp.biasC.icon_d2)} °C. Zapísané: data/quality/quality-model.json`);
}
