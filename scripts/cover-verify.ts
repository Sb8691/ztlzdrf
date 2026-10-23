/**
 * Step 8 (npm run cover, METODIKA §4.7 / §5.5): can the model's snow depth tell whether there is
 * snow to ski on? The page needs a precondition before it judges a day - without one, a warm
 * October afternoon scores as a "fair" ski day.
 *
 * Truth: measured snow depth at the morning observation (06 UTC) from data/truth (manual stations,
 * GeoSphere automats, LWD; SNOWGRID is a model and is left out). Forecast: Historical Forecast
 * `snow_depth` at 06 UTC (hist-snow-<model>.json from `npm run backtest:fetch -- --only=snow`),
 * lead 0 - snow depth changes slowly, so the lead matters little for the question asked here.
 *
 * Event: station depth >= COVER_CM (the cover condition of step 1). Reported per model: the model's
 * own threshold as yes/no, a logistic curve on sqrt(model cm) fitted leave-one-season-out, the
 * conditional frequency per model-depth bin, bias by elevation band, and a comparison of the two
 * models on the days both have. The curves for the page go to data/cover/cover-model.json.
 *
 * The skill reference (step 10d, 23 Oct 2026): the climatology of each series is drawn from its long
 * record since CLIM_FROM_SEASON, same month, without the season being scored - short series take it
 * from a long manual record (CLIM_SOURCE). Before, it came from the pairs alone, and a series whose
 * pairs cover one season (eHYD, LWD) got a constant 0.2 where its true rate is about 0.6, which made
 * the BSS look better than it was. Seasons with fewer than MIN_SEASON_DAYS days are left out, and the
 * bootstrap blocks are BLOCK_DAYS long because a snow cover lasts for weeks.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fitLogistic, logisticProb, type Logistic } from "./lib/calibrate.js";
import { readDerived } from "./lib/cache.js";
import type { Point } from "./lib/points.js";
import { seasonOf } from "./lib/season.js";
import { auc as aucOf, bootstrapBlocks, reliability, scores, type Case, type Interval } from "./lib/verify.js";

const OUT_DIR = new URL("../data/cover/", import.meta.url);
const COVER_CM = 30;
const MODELS = ["icon_d2", "ecmwf_ifs"];
const MODEL_NAMES: Record<string, string> = { icon_d2: "ICON-D2 2,2 km", ecmwf_ifs: "IFS 9 km" };
const WINTER_MONTHS = new Set([11, 12, 1, 2, 3, 4]);
const BINS: [number, number, string][] = [[-1, 0, "0"], [0, 10, "1–10"], [10, 20, "11–20"], [20, 30, "21–30"], [30, 50, "31–50"], [50, 100, "51–100"], [100, Infinity, "> 100"]];
/** The climatology draws on seasons from here on: the recent climate, as the long GeoSphere records begin. */
const CLIM_FROM_SEASON = "1998/99";
/** Series too short for a climatology of their own take it from a long manual record: the same site's
 * where there is one, else the nearby long series scripts/model-fit.ts uses (its CLIM_PROXY). */
const CLIM_SOURCE: Record<string, string> = {
  "geosphere:122:auto": "geosphere:122:manual",
  "geosphere:186:auto": "geosphere:186:manual",
  "geosphere:15715:auto": "geosphere:122:manual",
  "geosphere:20105:auto": "ehyd:114694:manual",
  "geosphere:103:auto": "ehyd:113936:manual",
  "lwd:2900265:auto": "ehyd:123133:manual",
  "lwd:2900240:auto": "ehyd:123133:manual",
};
/** A season with fewer pair days than this (IFS 2024/25 has 8) can neither train nor test a curve. */
const MIN_SEASON_DAYS = 30;
/** Bootstrap block length: a snow cover, and the model's error about it, persist for weeks. */
const BLOCK_DAYS = 60;

interface TruthFile { columns: { id: string; label: string; source: string; kind: string; elevation: number; pointId: string }[]; dates: string[]; hsCm: (number | null)[][] }
interface SeriesFile { points: Point[]; model: string; time: number[]; cells: number[]; data: Record<string, (number | null)[][]> }

const truth: TruthFile = readDerived<TruthFile>("truth-daily.json") ?? (() => { throw new Error("truth-daily.json chýba – spusti npm run truth:fetch a npm run truth"); })();

const f2 = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? "–" : x.toFixed(2).replace(".", ","));
const f1 = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? "–" : x.toFixed(1).replace(".", ","));
const ci = (b: Interval) => `${f2(b.est)} (${f2(b.lo)}–${f2(b.hi)})`;
const lines: string[] = [];
const say = (s = "") => { lines.push(s); console.log(s); };

/** One station-day: measured depth, model depth, both at 06 UTC. */
interface Pair { day: string; season: string; station: string; label: string; elevation: number; source: string; hs: number; model: number }
interface PCase extends Case { season: string; g: number; modelCm: number }

/** Seasons left out per model for having too few days (MIN_SEASON_DAYS), with their day counts. */
const thinSeasons: Record<string, string[]> = {};

function pairsFor(model: string): Pair[] {
  const all = allPairsFor(model);
  const days = new Map<string, Set<string>>();
  for (const p of all) days.set(p.season, (days.get(p.season) ?? new Set()).add(p.day));
  const thin = [...days.entries()].filter(([, d]) => d.size < MIN_SEASON_DAYS);
  thinSeasons[model] = thin.map(([s, d]) => `${s} (${d.size} dní)`);
  return all.filter((p) => !thin.some(([s]) => s === p.season));
}

function allPairsFor(model: string): Pair[] {
  const file = readDerived<SeriesFile>(`hist-snow-${model}.json`);
  if (!file) throw new Error(`hist-snow-${model}.json chýba – spusti npm run backtest:fetch -- --only=snow`);
  const index = new Map(file.time.map((t, i) => [t, i]));
  const col = file.data.snow_depth;
  const out: Pair[] = [];
  truth.columns.forEach((c, j) => {
    if (c.source === "snowgrid") return;
    const pi = file.points.findIndex((p) => p.id === c.pointId);
    if (pi < 0) return;
    const hs = truth.hsCm[j];
    truth.dates.forEach((d, di) => {
      const h = hs[di];
      if (h == null || !WINTER_MONTHS.has(Number(d.slice(5, 7)))) return;
      const stamp = Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)), 6) / 1000;
      const i = index.get(stamp);
      const m = i === undefined ? null : col[pi][i];
      if (m == null) return;
      out.push({ day: d, season: seasonOf(d), station: c.id, label: c.label, elevation: c.elevation, source: c.source, hs: h, model: Math.round(m * 100) });
    });
  });
  return out;
}

const climCache = new Map<string, number | null>();
/**
 * P(depth >= coverCm) at the series' climate source in that calendar month, from every season since
 * CLIM_FROM_SEASON except the one being scored (leave-one-season-out); null with under 60 days.
 */
function climatology(station: string, month: number, season: string, coverCm: number): number | null {
  const key = `${station}|${month}|${season}|${coverCm}`;
  if (climCache.has(key)) return climCache.get(key)!;
  const j = truth.columns.findIndex((c) => c.id === (CLIM_SOURCE[station] ?? station));
  let n = 0, ev = 0;
  if (j >= 0) truth.dates.forEach((d, k) => {
    const s = seasonOf(d);
    if (Number(d.slice(5, 7)) !== month || s === season || s < CLIM_FROM_SEASON) return;
    const h = truth.hsCm[j][k];
    if (h == null) return;
    n++;
    if (h >= coverCm) ev++;
  });
  const p = n >= 60 ? ev / n : null;
  climCache.set(key, p);
  return p;
}

const guard = (x: Case[]) => { const r = scores(x, 1); return r.events >= 5 ? r.bss : null; };

interface Evaluation { n: number; events: number; seasons: string[]; inSample: boolean; noClim: number; climRate: number; det: ReturnType<typeof scores>; bssDet: Interval; cal: ReturnType<typeof scores>; bssCal: Interval; calCases: PCase[]; auc: number | null; rel: ReturnType<typeof reliability>; fit: Logistic; loso: Logistic[] }

/**
 * Yes/no on the model's own depth, and the logistic curve on sqrt(model cm) fitted leave-one-season-out
 * (in-sample, and flagged so, when there is a single season). The curve is fitted on every pair; the
 * scores leave out pairs without a climatology (counted in `noClim`).
 */
function evaluate(pairs: Pair[], coverCm: number): Evaluation | null {
  if (pairs.length < 60) return null;
  const all: PCase[] = pairs.map((p) => ({ day: p.day, station: p.station, obs: p.hs >= coverCm ? 1 : 0, fc: 0, clim: climatology(p.station, Number(p.day.slice(5, 7)), p.season, coverCm) ?? NaN, climMean: NaN, season: p.season, g: Math.sqrt(p.model), modelCm: p.model }));
  const seasons = [...new Set(all.map((c) => c.season))].sort();
  const inSample = seasons.length < 2;
  const calAll: PCase[] = [];
  const loso: Logistic[] = [];
  for (const s of seasons) {
    const train = inSample ? all : all.filter((c) => c.season !== s);
    const fit = fitLogistic(train.map((c) => ({ g: c.g, y: c.obs >= 1 ? 1 : 0 })));
    loso.push(fit);
    for (const c of all) if (c.season === s) calAll.push({ ...c, prob: logisticProb(c.g, fit) });
  }
  const scored = (xs: PCase[]) => xs.filter((c) => Number.isFinite(c.clim));
  const det = scored(all).map((c) => ({ ...c, prob: c.modelCm >= coverCm ? 1 : 0 }));
  const cal = scored(calAll);
  const sDet = scores(det, 1), sCal = scores(cal, 1);
  const bssDet = bootstrapBlocks(det, guard, BLOCK_DAYS); bssDet.est = sDet.bss;
  const bssCal = bootstrapBlocks(cal, guard, BLOCK_DAYS, 1000, 13); bssCal.est = sCal.bss;
  const pos = all.filter((c) => c.obs >= 1), neg = all.filter((c) => c.obs < 1);
  const fit = fitLogistic(all.map((c) => ({ g: c.g, y: c.obs >= 1 ? 1 : 0 })));
  return { n: all.length, events: pos.length, seasons, inSample, noClim: all.length - cal.length, climRate: cal.reduce((a, c) => a + c.clim, 0) / (cal.length || 1), det: sDet, bssDet, cal: sCal, bssCal, calCases: cal, auc: aucOf(pos.map((c) => c.g), neg.map((c) => c.g)), rel: reliability(cal, 1), fit, loso };
}

const relText = (rel: ReturnType<typeof reliability>) => rel.filter((b) => b.n >= 20).map((b) => `${f2(b.meanProb)}→${f2(b.obsFreq)} (${b.n})`).join(", ") || "–";
const band = (e: number) => (e < 1200 ? "údolie < 1 200 m" : e < 1700 ? "1 200–1 700 m" : "> 1 700 m");

const results: Record<string, unknown> = {};
const curves: Record<string, unknown> = {};

say("## Krok 8 – snehová pokrývka: modelová výška snehu proti nameranej");
say("");
say(`Pravda: nameraná výška snehu ráno (06 UTC) – ručné stanice (eHYD do 8/2023, GeoSphere), automaty GeoSphere, LWD; SNOWGRID vynechaný. Model: Historical Forecast \`snow_depth\` o 06 UTC, predstih 0, mesiace nov–apr. Udalosť: stanica ≥ ${COVER_CM} cm (podmienka pokrývky z kroku 1). „det.“ = model ≥ ${COVER_CM} cm ako áno/nie; „kal.“ = logistická krivka na √(model cm), fit bez testovanej sezóny. BSS proti klimatológii radu a mesiaca z jeho dlhého záznamu od ${CLIM_FROM_SEASON} bez testovanej sezóny; krátke rady (automaty, LWD) ju berú z dlhého ručného radu na tom istom mieste alebo z blízkej stanice. CI blokový bootstrap po ${BLOCK_DAYS}-dňových blokoch (pokrývka trvá týždne). Sezóna s menej ako ${MIN_SEASON_DAYS} dňami dvojíc sa vynecháva.`);
say("");

const pointOf = new Map(truth.columns.map((c) => [c.id, c.pointId]));
const allPairs: Record<string, Pair[]> = {};
for (const model of MODELS) {
  const pairs = pairsFor(model);
  allPairs[model] = pairs;
  const ev = evaluate(pairs, COVER_CM);
  say(`### ${MODEL_NAMES[model]}`);
  say("");
  if (!ev) { say(`Málo dvojíc (${pairs.length}).`); say(""); continue; }
  const series = new Set(pairs.map((p) => p.station));
  const places = new Set([...series].map((s) => pointOf.get(s)));
  say(`Dvojíc ${ev.n}, sezóny ${ev.seasons.join(", ")}${thinSeasons[model].length ? ` (vynechané pre málo dní: ${thinSeasons[model].join(", ")})` : ""}, ${series.size} radov na ${places.size} miestach, podiel dní so stanicou ≥ ${COVER_CM} cm ${f2(ev.events / ev.n)}.${ev.noClim ? ` Bez klimatológie (mimo skóre): ${ev.noClim} dvojíc.` : ""}`);
  if (ev.inSample) say(`Len jedna zima: krivka sa nedá overiť mimo vzorky, „kal.“ je fit na tých istých dňoch (optimistické).`);
  say("");
  say("| Prah stanice | n | udalostí | klim. | **BSS det.** (model ≥ prah) (CI) | POD / FAR det. | **BSS kal.** (CI) | AUC | spoľahlivosť kal. |");
  say("|---|---|---|---|---|---|---|---|---|");
  const rows: Record<string, unknown> = {};
  for (const cover of [20, COVER_CM, 50]) {
    const e = cover === COVER_CM ? ev : evaluate(pairs, cover);
    if (!e) continue;
    rows[String(cover)] = { n: e.n, events: e.events, climRate: e.climRate, bssDet: e.bssDet, pod: e.det.pod, far: e.det.far, bssCal: e.bssCal, inSample: e.inSample, auc: e.auc, fit: e.fit };
    say(`| ≥ ${cover} cm | ${e.n} | ${e.events} | ${f2(e.climRate)} | **${ci(e.bssDet)}** | ${f2(e.det.pod)} / ${f2(e.det.far)} | **${ci(e.bssCal)}**${e.inSample ? " (v rámci vzorky)" : ""} | ${f2(e.auc)} | ${relText(e.rel)} |`);
  }
  say("");
  // Conditional frequency per model-depth bin: what the page's gate rests on.
  say(`Podiel dní so stanicou ≥ ${COVER_CM} cm podľa modelovej výšky snehu (všetky stanice / len > 1 700 m / 1 200–1 700 m / údolie):`);
  say("");
  say("| Model [cm] | n | P(stanica ≥ 30) | n > 1 700 m | P | n 1 200–1 700 | P | n údolie | P | medián stanice [cm] |");
  say("|---|---|---|---|---|---|---|---|---|---|");
  const binRows: unknown[] = [];
  for (const [lo, hi, name] of BINS) {
    const inBin = pairs.filter((p) => p.model > lo && p.model <= hi);
    if (!inBin.length) continue;
    const share = (xs: Pair[]) => (xs.length ? f2(xs.filter((p) => p.hs >= COVER_CM).length / xs.length) : "–");
    const hiB = inBin.filter((p) => p.elevation >= 1700), midB = inBin.filter((p) => p.elevation >= 1200 && p.elevation < 1700), valB = inBin.filter((p) => p.elevation < 1200);
    const sorted = inBin.map((p) => p.hs).sort((a, b) => a - b);
    binRows.push({ bin: name, n: inBin.length, p: inBin.filter((p) => p.hs >= COVER_CM).length / inBin.length, nHigh: hiB.length, pHigh: hiB.length ? hiB.filter((p) => p.hs >= COVER_CM).length / hiB.length : null, medianHs: sorted[Math.floor(sorted.length / 2)] });
    say(`| ${name} | ${inBin.length} | ${share(inBin)} | ${hiB.length} | ${share(hiB)} | ${midB.length} | ${share(midB)} | ${valB.length} | ${share(valB)} | ${sorted[Math.floor(sorted.length / 2)]} |`);
  }
  say("");
  // Bias by elevation band and by station; the station's BSS and AUC are those of the pooled curve
  // (fitted without the season scored) on that station's days, against its own climatology.
  say("| Rad | výška | n | sezóny | podiel ≥ 30 | klim. | bias model − stanica [cm] | MAE [cm] | BSS kal. | AUC kal. |");
  say("|---|---|---|---|---|---|---|---|---|---|");
  const byStation = new Map<string, Pair[]>();
  for (const p of pairs) byStation.set(p.station, [...(byStation.get(p.station) ?? []), p]);
  const calBy = new Map<string, PCase[]>();
  for (const c of ev.calCases) calBy.set(c.station, [...(calBy.get(c.station) ?? []), c]);
  const stationRows: unknown[] = [];
  for (const [id, ps] of [...byStation.entries()].sort((a, b) => b[1][0].elevation - a[1][0].elevation)) {
    const cs = calBy.get(id) ?? [];
    const sc = scores(cs, 1);
    const bss = sc.events >= 5 && sc.n - sc.events >= 5 ? sc.bss : null;
    const stAuc = aucOf(cs.filter((c) => c.obs >= 1).map((c) => c.prob!), cs.filter((c) => c.obs < 1).map((c) => c.prob!));
    const clim = cs.length ? cs.reduce((a, c) => a + c.clim, 0) / cs.length : null;
    const bias = ps.reduce((a, p) => a + p.model - p.hs, 0) / ps.length, mae = ps.reduce((a, p) => a + Math.abs(p.model - p.hs), 0) / ps.length;
    stationRows.push({ station: id, elevation: ps[0].elevation, n: ps.length, events: ps.filter((p) => p.hs >= COVER_CM).length, clim, bias, mae, bssCal: bss, auc: stAuc });
    say(`| ${ps[0].label} | ${ps[0].elevation} | ${ps.length} | ${[...new Set(ps.map((p) => p.season))].length} | ${f2(ps.filter((p) => p.hs >= COVER_CM).length / ps.length)} | ${f2(clim)} | ${f1(bias)} | ${f1(mae)} | ${f2(bss)} | ${f2(stAuc)} |`);
  }
  say("");
  const bands = new Map<string, Pair[]>();
  for (const p of pairs) bands.set(band(p.elevation), [...(bands.get(band(p.elevation)) ?? []), p]);
  say("| Pásmo | n | bias [cm] | MAE [cm] | podiel ≥ 30 stanica / model |");
  say("|---|---|---|---|---|");
  for (const [name, ps] of bands) say(`| ${name} | ${ps.length} | ${f1(ps.reduce((a, p) => a + p.model - p.hs, 0) / ps.length)} | ${f1(ps.reduce((a, p) => a + Math.abs(p.model - p.hs), 0) / ps.length)} | ${f2(ps.filter((p) => p.hs >= COVER_CM).length / ps.length)} / ${f2(ps.filter((p) => p.model >= COVER_CM).length / ps.length)} |`);
  say("");
  const curveAt = (cm: number) => logisticProb(Math.sqrt(cm), ev.fit);
  const half = (() => { let lo = 0, hi = 300; for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (curveAt(mid) < 0.5) lo = mid; else hi = mid; } return (lo + hi) / 2; })();
  say(`Krivka na všetkých sezónach: a = ${ev.fit.a.toFixed(3)}, b = ${ev.fit.b.toFixed(3)} na √cm; P(≥ ${COVER_CM} cm) pri modeli 0 / 10 / 20 / 30 / 50 cm = ${[0, 10, 20, 30, 50].map((c) => f2(curveAt(c))).join(" / ")}; P = 0,5 pri ${f1(half)} cm modelu. Fity bez sezón: ${ev.loso.map((f) => `(${f.a.toFixed(2)}, ${f.b.toFixed(2)})`).join(", ")}.`);
  say("");
  results[model] = { n: ev.n, seasons: ev.seasons, thresholds: rows, bins: binRows, stations: stationRows };
  curves[model] = { a: Math.round(ev.fit.a * 1e4) / 1e4, b: Math.round(ev.fit.b * 1e4) / 1e4, n: ev.n, events: ev.events, seasons: ev.seasons, bssCal: ev.bssCal, auc: ev.auc, halfCm: Math.round(half * 10) / 10 };
}

// The two models against each other on the days both have (the IFS archive is short, so this says
// whether its curve can be trusted and whether it may stand in for the ensemble).
{
  const a = allPairs.icon_d2 ?? [], b = allPairs.ecmwf_ifs ?? [];
  const idx = new Map(b.map((p) => [`${p.station}|${p.day}`, p]));
  const both = a.map((p) => [p, idx.get(`${p.station}|${p.day}`)] as const).filter((x): x is readonly [Pair, Pair] => !!x[1]);
  if (both.length >= 60) {
    say("### ICON-D2 proti IFS 9 km na spoločných dňoch");
    say("");
    const diff = both.map(([x, y]) => y.model - x.model);
    const agree = both.filter(([x, y]) => (x.model >= COVER_CM) === (y.model >= COVER_CM)).length / both.length;
    say(`Dvojíc ${both.length}: IFS − ICON-D2 bias ${f1(diff.reduce((s, v) => s + v, 0) / diff.length)} cm, MAE ${f1(diff.reduce((s, v) => s + Math.abs(v), 0) / diff.length)} cm, zhoda áno/nie na ${COVER_CM} cm ${f2(agree)}.`);
    say("");
    results.crossModel = { n: both.length, biasIfsMinusIcon: diff.reduce((s, v) => s + v, 0) / diff.length, agree };
  }
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(new URL("REPORT.md", OUT_DIR), `${lines.join("\n")}\n`);
writeFileSync(new URL("cover-verification.json", OUT_DIR), `${JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), coverCm: COVER_CM, results }, null, 1)}\n`);
writeFileSync(new URL("cover-model.json", OUT_DIR), `${JSON.stringify({ version: 1, generatedAt: new Date().toISOString().slice(0, 10), fittedOn: "Historical Forecast snow_depth at 06 UTC vs measured depth, winters Nov-Apr, all seasons in the archive", coverCm: COVER_CM, input: "sqrt(model snow depth cm at the top station); fitted at 06 UTC, applied at the lift opening hour", curves }, null, 1)}\n`);
say("Zapísané: data/cover/REPORT.md, data/cover/cover-verification.json, data/cover/cover-model.json");
