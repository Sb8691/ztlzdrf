/**
 * Step 6a of the day-quality work (npm run rules, METODIKA §4.5 / §5.3): the page's own rules -
 * rain at the base, gusts at the top, sunshine - verified hour by hour against GeoSphere stations
 * over the lift day 09:00-16:00, by source and lead time. Each rule is scored as the page applies
 * it (a yes/no at its threshold) and as a calibrated probability (a logistic curve on the model
 * value, fitted out of sample), so step 6d can decide which to carry.
 *
 * Truth: klima-v2-1h of the six automatic stations (rr, tl, ffx, so_h), winters 2022/23 ->; the
 * hourly stamps are "preceding hour" like Open-Meteo's (cross-correlation peaks at lag 0 for rain,
 * sunshine and gusts). Rain at a station = its precipitation in hours above the page's snow limit,
 * the same rule the page applies to the model. Nothing here touches the network.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { SKI_CONFIG } from "../src/config.js";
import { fitLogistic, logisticProb, type Logistic } from "./lib/calibrate.js";
import { HOUR, IFS_DELAY_H, STATIONS, addDays, histGetters, liftStamps, loadTruth, prevGetters, singleRuns, type Getter } from "./lib/hourly.js";
import { inOperatingWindow, seasonOf } from "./lib/season.js";
import { auc as aucOf, bootstrapBlocks, reliability, scores, type Case, type Interval } from "./lib/verify.js";

const cfg = SKI_CONFIG;
const R = cfg.rules;
const OUT_DIR = new URL("../data/rules/", import.meta.url);

// ---------------------------------------------------------------------------
// Truth: lift-day aggregates at the automatic stations (scripts/lib/hourly.ts)
// ---------------------------------------------------------------------------

interface DayValues { rain: number | null; precip: number | null; gust: number | null; sun: number | null }

/** Lift-day aggregates from hourly getters named like Open-Meteo: precipitation (mm), temperature_2m (°C), wind_gusts_10m (km/h), sunshine_duration (s). Each component is null when any of its hours is missing. */
function dayValues(get: Getter, stamps: number[]): DayValues {
  let rain = 0, precip = 0, gust = -Infinity, sun = 0, rainOk = true, gustOk = true, sunOk = true;
  for (const s of stamps) {
    const p = get("precipitation", s), t = get("temperature_2m", s), g = get("wind_gusts_10m", s), su = get("sunshine_duration", s);
    if (p == null || t == null) rainOk = false; else { precip += p; if (Math.round(t * 1000) / 1000 > R.snowMaxTempC) rain += p; }
    if (g == null) gustOk = false; else gust = Math.max(gust, g);
    if (su == null) sunOk = false; else sun += su / 3600;
  }
  return { rain: rainOk ? rain : null, precip: rainOk ? precip : null, gust: gustOk ? gust : null, sun: sunOk ? sun : null };
}

const truth = loadTruth();
const truthDays = new Map<string, Map<string, DayValues>>();
for (const st of STATIONS) {
  const get = truth.getter(st);
  if (!get) continue;
  const m = new Map<string, DayValues>();
  for (let d = truth.firstDay; d <= truth.lastDay; d = addDays(d, 1)) {
    const mo = Number(d.slice(5, 7));
    if (mo > 4 && mo < 11) continue;
    const v = dayValues(get, liftStamps(d));
    if (v.rain !== null || v.gust !== null || v.sun !== null) m.set(d, v);
  }
  truthDays.set(st.key, m);
}

// ---------------------------------------------------------------------------
// Forecast sources
// ---------------------------------------------------------------------------

interface Fc { date: string; station: string; lead: number; label: string; values: DayValues }
const forecasts: Record<string, Fc[]> = {};
const push = (source: string, fc: Fc) => (forecasts[source] ??= []).push(fc);

for (const model of ["ecmwf_ifs", "icon_d2"]) {
  const getters = histGetters(model);
  if (!getters) continue;
  for (const st of STATIONS) {
    const get = getters(st);
    if (!get || !truthDays.has(st.key)) continue;
    for (const date of truthDays.get(st.key)!.keys()) push(`hist:${model}`, { date, station: st.key, lead: 0, label: "0 h", values: dayValues(get, liftStamps(date)) });
  }
}

for (const run of singleRuns()) {
  const firstDate = new Date(run.time0 * 1000).toISOString().slice(0, 10);
  for (let k = 0; k <= 7; k++) {
    const date = addDays(firstDate, k);
    const stamps = liftStamps(date);
    const open = stamps[0] - HOUR;
    if (open < run.publishedSec || stamps[stamps.length - 1] > run.lastStamp || stamps[0] < run.time0 + HOUR) continue;
    // Lead classes of 12 h: 09:00 local is 08 UTC in winter and 07 UTC in summer time, which must not split a class.
    const lead = Math.round((open - run.publishedSec) / HOUR / 12) * 12;
    for (const st of STATIONS) {
      const get = run.getter(st);
      if (!get || !truthDays.get(st.key)?.has(date)) continue;
      push("single:ecmwf_ifs", { date, station: st.key, lead, label: `${lead} h`, values: dayValues(get, stamps) });
    }
  }
}

{
  const prev = prevGetters();
  if (prev) {
    for (const st of STATIONS) {
      const get = prev.getter(st);
      if (!get) continue;
      for (const date of truthDays.get(st.key)?.keys() ?? []) {
        if (date < prev.firstDay || date > prev.lastDay) continue;
        push("prev:icon_d2", { date, station: st.key, lead: 36, label: "1 d (24–47 h)", values: dayValues(get, liftStamps(date)) });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Components and scoring
// ---------------------------------------------------------------------------

interface Component { id: string; name: string; pick: (v: DayValues) => number | null; event: (x: number) => boolean; g: (x: number) => number; unit: string; stations: (st: typeof STATIONS[number]) => boolean }
const COMPONENTS: Component[] = [
  { id: "rainBad", name: `dážď počas lanoviek ≥ ${R.rainBadMm} mm (zlý deň)`, pick: (v) => v.rain, event: (x) => x >= R.rainBadMm, g: Math.sqrt, unit: "mm", stations: () => true },
  { id: "rainFair", name: `dážď počas lanoviek ≥ ${R.rainFairMm} mm (ujde)`, pick: (v) => v.rain, event: (x) => x >= R.rainFairMm, g: Math.sqrt, unit: "mm", stations: () => true },
  { id: "gustBad", name: `náraz počas lanoviek > ${R.gustBadKmh} km/h (lanovky môžu stáť)`, pick: (v) => v.gust, event: (x) => x > R.gustBadKmh, g: (x) => x / 10, unit: "km/h", stations: (st) => st.group === "hory" },
  { id: "gustFair", name: `náraz počas lanoviek > ${R.gustFairKmh} km/h (veterno)`, pick: (v) => v.gust, event: (x) => x > R.gustFairKmh, g: (x) => x / 10, unit: "km/h", stations: (st) => st.group === "hory" },
  { id: "sunLow", name: `slnko počas lanoviek < ${R.minSunHours} h (zamračené)`, pick: (v) => v.sun, event: (x) => x < R.minSunHours, g: (x) => 7 - x, unit: "h", stations: () => true },
];

interface RCase extends Case { season: string; g: number; detYes: boolean }

const climCache = new Map<string, number>();
/** Event frequency of the component at the station by month, from the other seasons of the hourly record. */
function climatology(comp: Component, st: typeof STATIONS[number], month: number, season: string): number {
  const key = `${comp.id}|${st.key}|${month}|${season}`;
  const hit = climCache.get(key);
  if (hit !== undefined) return hit;
  let n = 0, ev = 0, nAll = 0, evAll = 0;
  for (const [d, v] of truthDays.get(st.key) ?? []) {
    const x = comp.pick(v);
    if (x === null || seasonOf(d) === season || !inOperatingWindow(d)) continue;
    nAll++; if (comp.event(x)) evAll++;
    if (Number(d.slice(5, 7)) !== month) continue;
    n++; if (comp.event(x)) ev++;
  }
  const p = n >= 20 ? ev / n : nAll ? evAll / nAll : 0.1;
  climCache.set(key, p);
  return p;
}

function casesOf(comp: Component, source: string, label: string): RCase[] {
  const out: RCase[] = [];
  for (const fc of forecasts[source] ?? []) {
    if (fc.label !== label) continue;
    const st = STATIONS.find((s) => s.key === fc.station)!;
    if (!comp.stations(st) || !inOperatingWindow(fc.date)) continue;
    const x = comp.pick(fc.values), t = truthDays.get(fc.station)?.get(fc.date);
    const y = t ? comp.pick(t) : null;
    if (x === null || y === null || y === undefined) continue;
    const month = Number(fc.date.slice(5, 7)), season = seasonOf(fc.date);
    const clim = climatology(comp, st, month, season);
    out.push({ day: fc.date, station: fc.station, obs: y, fc: x, clim, climMean: NaN, season, g: comp.g(x), detYes: comp.event(x) });
  }
  return out;
}

const f2 = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? "–" : x.toFixed(2).replace(".", ","));
const f1 = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? "–" : x.toFixed(1).replace(".", ","));
const ci = (b: Interval) => `${f2(b.est)} (${f2(b.lo)}–${f2(b.hi)})`;
const lines: string[] = [];
const say = (s = "") => { lines.push(s); console.log(s); };

interface Row { comp: string; source: string; label: string; lead: number; n: number; events: number; climRate: number; pod: number | null; far: number | null; bssDet: Interval; auc: number | null; bias: number; mae: number; bssCal: Interval; fit: Logistic; reliability: ReturnType<typeof reliability> }
const rows: Row[] = [];

function evaluate(comp: Component, source: string, label: string, lead: number): Row | null {
  const c = casesOf(comp, source, label);
  if (c.length < 60) return null;
  const ev = (k: RCase) => comp.event(k.obs);
  // Deterministic: the page's yes/no at its threshold.
  const det: Case[] = c.map((k) => ({ ...k, prob: k.detYes ? 1 : 0 }));
  const sDet = scores(det.map((k) => ({ ...k, obs: ev(k as RCase) ? 1 : 0 })), 1);
  // Calibrated: logistic on g(x), fitted leave-one-season-out.
  const seasons = [...new Set(c.map((k) => k.season))];
  const cal: Case[] = [];
  for (const s of seasons) {
    const fit = fitLogistic(c.filter((k) => k.season !== s).map((k) => ({ g: k.g, y: ev(k) ? 1 : 0 })));
    for (const k of c) if (k.season === s) cal.push({ ...k, prob: logisticProb(k.g, fit), obs: ev(k) ? 1 : 0 });
  }
  const sCal = scores(cal, 1);
  const guard = (x: Case[]) => { const r = scores(x, 1); return r.events >= 5 ? r.bss : null; };
  const bssDet = bootstrapBlocks(det.map((k) => ({ ...k, obs: ev(k as RCase) ? 1 : 0 })), guard);
  bssDet.est = sDet.bss;
  const bssCal = bootstrapBlocks(cal, guard, 10, 1000, 13);
  bssCal.est = sCal.bss;
  const pos = c.filter(ev).map((k) => k.g), neg = c.filter((k) => !ev(k)).map((k) => k.g);
  const n = c.length, events = pos.length;
  const row: Row = {
    comp: comp.id, source, label, lead, n, events, climRate: c.reduce((a, k) => a + k.clim, 0) / n,
    pod: sDet.pod, far: sDet.far, bssDet, auc: aucOf(pos, neg), bias: c.reduce((a, k) => a + (k.fc as number) - k.obs, 0) / n, mae: c.reduce((a, k) => a + Math.abs((k.fc as number) - k.obs), 0) / n,
    bssCal, fit: fitLogistic(c.map((k) => ({ g: k.g, y: ev(k) ? 1 : 0 }))), reliability: reliability(cal, 1),
  };
  rows.push(row);
  return row;
}

const SOURCE_NAMES: Record<string, string> = { "hist:ecmwf_ifs": "IFS 9 km, Historical Forecast", "hist:icon_d2": "ICON-D2, Historical Forecast", "single:ecmwf_ifs": "IFS 9 km, celé behy 00z/12z", "prev:icon_d2": "ICON-D2, previous runs" };
function labelsOf(source: string): { label: string; lead: number }[] {
  const seen = new Map<string, number>();
  for (const fc of forecasts[source] ?? []) seen.set(fc.label, fc.lead);
  return [...seen.entries()].map(([label, lead]) => ({ label, lead })).sort((a, b) => a.lead - b.lead);
}

say("## Krok 6a – dnešné pravidlá stránky proti staniciam (lyžiarsky deň 10:00–16:00)");
say("");
say(`Pravda: GeoSphere automaty ${STATIONS.filter((s) => truthDays.has(s.key)).map((s) => `${s.name} ${s.elevation} m`).join(", ")}, hodinovo (rr, tl, ffx, so_h), zimy 2022/23–2025/26, sezóna prevádzky 1. 12. – 15. 4. Dážď na stanici = zrážky v hodinách s T > ${R.snowMaxTempC} °C (to isté pravidlo ako na model). Nárazy sa hodnotia len na horských staniciach (≥ 1 400 m). Zdroje: Historical Forecast (predstih 0), IFS celé behy (predstih = hodiny od zverejnenia behu, +${IFS_DELAY_H} h, do otvorenia lanoviek 09:00), ICON-D2 previous runs (deň vopred). „Deterministicky“ = áno/nie modelu na prahu stránky; „kalibrované“ = logistická krivka na hodnote modelu, fit bez testovanej sezóny. BSS proti klimatológii stanice a mesiaca z ostatných sezón; CI blokový bootstrap po dňoch.`);

for (const comp of COMPONENTS) {
  say("");
  say(`### ${comp.name}`);
  say("");
  say(`| Zdroj | Predstih | n | udalostí | klim. | POD | FAR | **BSS deterministicky** (CI) | AUC | bias [${comp.unit}] | MAE [${comp.unit}] | **BSS kalibrované** (CI) | krivka a, b | spoľahlivosť kalibrovaného (p̄ → pozorované, n) |`);
  say("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const source of Object.keys(SOURCE_NAMES)) {
    for (const { label, lead } of labelsOf(source)) {
      const r = evaluate(comp, source, label, lead);
      if (!r) continue;
      const rel = r.reliability.filter((b) => b.n >= 20).map((b) => `${f2(b.meanProb)}→${f2(b.obsFreq)} (${b.n})`).join(", ");
      say(`| ${SOURCE_NAMES[source]} | ${label} | ${r.n} | ${r.events} | ${f2(r.climRate)} | ${f2(r.pod)} | ${f2(r.far)} | **${ci(r.bssDet)}** | ${f2(r.auc)} | ${f1(r.bias)} | ${f1(r.mae)} | **${ci(r.bssCal)}** | ${f2(r.fit.a)}, ${f2(r.fit.b)} | ${rel || "–"} |`);
    }
  }
}

// Per station at lead 0 (ICON-D2) for the two components the groups differ in.
say("");
say("### Podľa stanice – ICON-D2 Historical Forecast, predstih 0");
say("");
say("| Stanica | zložka | n | udalostí | POD | FAR | BSS det. | AUC | bias | BSS kalibr. |");
say("|---|---|---|---|---|---|---|---|---|---|");
for (const comp of COMPONENTS) {
  for (const st of STATIONS) {
    if (!comp.stations(st)) continue;
    const all = casesOf(comp, "hist:icon_d2", "0 h").filter((k) => k.station === st.key);
    if (all.length < 60) continue;
    const ev = (k: RCase) => comp.event(k.obs);
    const det = scores(all.map((k) => ({ ...k, prob: k.detYes ? 1 : 0, obs: ev(k) ? 1 : 0 })), 1);
    const seasons = [...new Set(all.map((k) => k.season))];
    const cal: Case[] = [];
    for (const s of seasons) { const fit = fitLogistic(all.filter((k) => k.season !== s).map((k) => ({ g: k.g, y: ev(k) ? 1 : 0 }))); for (const k of all) if (k.season === s) cal.push({ ...k, prob: logisticProb(k.g, fit), obs: ev(k) ? 1 : 0 }); }
    const sc = scores(cal, 1);
    say(`| ${st.name} ${st.elevation} m | ${comp.id} | ${all.length} | ${det.events} | ${f2(det.pod)} | ${f2(det.far)} | ${f2(det.bss)} | ${f2(aucOf(all.filter(ev).map((k) => k.g), all.filter((k) => !ev(k)).map((k) => k.g)))} | ${f1(all.reduce((a, k) => a + (k.fc as number) - k.obs, 0) / all.length)} | ${f2(sc.bss)} |`);
  }
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(new URL("REPORT.md", OUT_DIR), `${lines.join("\n")}\n`);
writeFileSync(new URL("rules-verification.json", OUT_DIR), `${JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), thresholds: R, stations: STATIONS, rows: rows.map((r) => ({ ...r, reliability: undefined })) }, null, 1)}\n`);
say("");
say(`Zapísané: data/rules/REPORT.md, data/rules/rules-verification.json. Zdroje: ${Object.entries(forecasts).map(([k, v]) => `${k} ${v.length}`).join(", ")}.`);
