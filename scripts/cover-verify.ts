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
interface PCase extends Case { season: string; g: number }

function pairsFor(model: string): Pair[] {
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

/** Climatology of the event per station and month from the other seasons (fallback: the station's other seasons). */
function withClimatology(cases: PCase[]): PCase[] {
  const key = (c: PCase) => `${c.station}|${c.day.slice(5, 7)}`;
  const groups = new Map<string, PCase[]>(), byStation = new Map<string, PCase[]>();
  for (const c of cases) { groups.set(key(c), [...(groups.get(key(c)) ?? []), c]); byStation.set(c.station, [...(byStation.get(c.station) ?? []), c]); }
  return cases.map((c) => {
    const others = (groups.get(key(c)) ?? []).filter((k) => k.season !== c.season);
    const pool = others.length >= 20 ? others : (byStation.get(c.station) ?? []).filter((k) => k.season !== c.season);
    const p = pool.length ? pool.filter((k) => k.obs >= 1).length / pool.length : 0.2;
    return { ...c, clim: p };
  });
}

const guard = (x: Case[]) => { const r = scores(x, 1); return r.events >= 5 ? r.bss : null; };

interface Evaluation { n: number; events: number; seasons: string[]; climRate: number; det: ReturnType<typeof scores>; bssDet: Interval; cal: ReturnType<typeof scores>; bssCal: Interval; auc: number | null; rel: ReturnType<typeof reliability>; fit: Logistic; loso: Logistic[] }

/** Yes/no on the model's own depth, and the logistic curve on sqrt(model cm) fitted leave-one-season-out. */
function evaluate(pairs: Pair[], coverCm: number): Evaluation | null {
  if (pairs.length < 60) return null;
  const raw: PCase[] = pairs.map((p) => ({ day: p.day, station: p.station, obs: p.hs >= coverCm ? 1 : 0, fc: 0, clim: 0, climMean: NaN, season: p.season, g: Math.sqrt(p.model) }));
  const cases = withClimatology(raw);
  const det = cases.map((c, i) => ({ ...c, prob: pairs[i].model >= coverCm ? 1 : 0 }));
  const seasons = [...new Set(cases.map((c) => c.season))].sort();
  const cal: Case[] = [];
  const loso: Logistic[] = [];
  for (const s of seasons) {
    const train = cases.filter((c) => c.season !== s), test = cases.filter((c) => c.season === s);
    const fit = seasons.length > 1 ? fitLogistic(train.map((c) => ({ g: c.g, y: c.obs >= 1 ? 1 : 0 }))) : fitLogistic(cases.map((c) => ({ g: c.g, y: c.obs >= 1 ? 1 : 0 })));
    loso.push(fit);
    for (const c of test) cal.push({ ...c, prob: logisticProb(c.g, fit) });
  }
  const sDet = scores(det, 1), sCal = scores(cal, 1);
  const bssDet = bootstrapBlocks(det, guard); bssDet.est = sDet.bss;
  const bssCal = bootstrapBlocks(cal, guard, 10, 1000, 13); bssCal.est = sCal.bss;
  const pos = cases.filter((c) => c.obs >= 1), neg = cases.filter((c) => c.obs < 1);
  const fit = fitLogistic(cases.map((c) => ({ g: c.g, y: c.obs >= 1 ? 1 : 0 })));
  return { n: cases.length, events: pos.length, seasons, climRate: cases.reduce((a, c) => a + c.clim, 0) / cases.length, det: sDet, bssDet, cal: sCal, bssCal, auc: aucOf(pos.map((c) => c.g), neg.map((c) => c.g)), rel: reliability(cal, 1), fit, loso };
}

const relText = (rel: ReturnType<typeof reliability>) => rel.filter((b) => b.n >= 20).map((b) => `${f2(b.meanProb)}→${f2(b.obsFreq)} (${b.n})`).join(", ") || "–";
const band = (e: number) => (e < 1200 ? "údolie < 1 200 m" : e < 1700 ? "1 200–1 700 m" : "> 1 700 m");

const results: Record<string, unknown> = {};
const curves: Record<string, unknown> = {};

say("## Krok 8 – snehová pokrývka: modelová výška snehu proti nameranej");
say("");
say(`Pravda: nameraná výška snehu ráno (06 UTC) – ručné stanice (eHYD do 8/2023, GeoSphere), automaty GeoSphere, LWD; SNOWGRID vynechaný. Model: Historical Forecast \`snow_depth\` o 06 UTC, predstih 0, mesiace nov–apr. Udalosť: stanica ≥ ${COVER_CM} cm (podmienka pokrývky z kroku 1). „det.“ = model ≥ ${COVER_CM} cm ako áno/nie; „kal.“ = logistická krivka na √(model cm), fit bez testovanej sezóny; BSS proti klimatológii stanice a mesiaca z ostatných sezón; CI blokový bootstrap po dňoch.`);
say("");

const allPairs: Record<string, Pair[]> = {};
for (const model of MODELS) {
  const pairs = pairsFor(model);
  allPairs[model] = pairs;
  const ev = evaluate(pairs, COVER_CM);
  say(`### ${MODEL_NAMES[model]}`);
  say("");
  if (!ev) { say(`Málo dvojíc (${pairs.length}).`); say(""); continue; }
  say(`Dvojíc ${ev.n}, sezóny ${ev.seasons.join(", ")}, staníc ${new Set(pairs.map((p) => p.station)).size}, podiel dní so stanicou ≥ ${COVER_CM} cm ${f2(ev.events / ev.n)}.`);
  say("");
  say("| Prah stanice | n | udalostí | klim. | **BSS det.** (model ≥ prah) (CI) | POD / FAR det. | **BSS kal.** (CI) | AUC | spoľahlivosť kal. |");
  say("|---|---|---|---|---|---|---|---|---|");
  const rows: Record<string, unknown> = {};
  for (const cover of [20, COVER_CM, 50]) {
    const e = cover === COVER_CM ? ev : evaluate(pairs, cover);
    if (!e) continue;
    rows[String(cover)] = { n: e.n, events: e.events, climRate: e.climRate, bssDet: e.bssDet, pod: e.det.pod, far: e.det.far, bssCal: e.bssCal, auc: e.auc, fit: e.fit };
    say(`| ≥ ${cover} cm | ${e.n} | ${e.events} | ${f2(e.climRate)} | **${ci(e.bssDet)}** | ${f2(e.det.pod)} / ${f2(e.det.far)} | **${ci(e.bssCal)}** | ${f2(e.auc)} | ${relText(e.rel)} |`);
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
  // Bias by elevation band and by station.
  say("| Stanica | výška | n | sezóny | podiel ≥ 30 | bias model − stanica [cm] | MAE [cm] | BSS kal. | AUC |");
  say("|---|---|---|---|---|---|---|---|---|");
  const byStation = new Map<string, Pair[]>();
  for (const p of pairs) byStation.set(p.station, [...(byStation.get(p.station) ?? []), p]);
  const stationRows: unknown[] = [];
  for (const [id, ps] of [...byStation.entries()].sort((a, b) => b[1][0].elevation - a[1][0].elevation)) {
    const e = evaluate(ps, COVER_CM);
    const bias = ps.reduce((a, p) => a + p.model - p.hs, 0) / ps.length, mae = ps.reduce((a, p) => a + Math.abs(p.model - p.hs), 0) / ps.length;
    stationRows.push({ station: id, elevation: ps[0].elevation, n: ps.length, events: ps.filter((p) => p.hs >= COVER_CM).length, bias, mae, bssCal: e?.bssCal.est ?? null, auc: e?.auc ?? null });
    say(`| ${ps[0].label} | ${ps[0].elevation} | ${ps.length} | ${[...new Set(ps.map((p) => p.season))].length} | ${f2(ps.filter((p) => p.hs >= COVER_CM).length / ps.length)} | ${f1(bias)} | ${f1(mae)} | ${e ? f2(e.bssCal.est) : "–"} | ${e ? f2(e.auc) : "–"} |`);
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
writeFileSync(new URL("cover-model.json", OUT_DIR), `${JSON.stringify({ version: 1, generatedAt: new Date().toISOString().slice(0, 10), fittedOn: "Historical Forecast snow_depth at 06 UTC vs measured depth, winters Nov-Apr, all seasons in the archive", coverCm: COVER_CM, input: "sqrt(model snow depth cm at the top station, lift opening hour)", curves }, null, 1)}\n`);
say("Zapísané: data/cover/REPORT.md, data/cover/cover-verification.json, data/cover/cover-model.json");
