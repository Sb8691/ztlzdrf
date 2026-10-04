/**
 * Season-end verification of the prospective log (npm run verify, METODIKA §5.2): every line that
 * data/prospective/<season>.jsonl collected during the winter, scored against the station truth of
 * `npm run truth` - by horizon, day offset and CI slot, so the numbers describe exactly what the page
 * showed. Nothing is fitted here; the result decides whether src/powder-model.ts stays (§7).
 *
 *   --season=2026-27   which log to read (default: every file in data/prospective)
 *   --log=path         a specific log file (tests, experiments)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { SKI_CONFIG } from "../src/config.js";
import type { ForecastLogLine } from "../src/prospective.js";
import { readDerived } from "./lib/cache.js";
import { collectCases, decisionTable, meanOf, RESORT_PROXY, type LoggedCase } from "./lib/prospective-eval.js";
import { inOperatingWindow, seasonOf } from "./lib/season.js";
import { bootstrapBlocks, reliability, scores, type Interval } from "./lib/verify.js";

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.slice(2).split("="); return [k, v ?? "true"]; }));
const LOG_DIR = new URL("../data/prospective/", import.meta.url);
const COVER = 30;
const cfg = SKI_CONFIG;
const THRESHOLD = cfg.powder.thresholdCm;
const P_STAR = cfg.powder.alert.minProb;

// Log lines.
const files = args.log ? [args.log] : readdirSync(LOG_DIR).filter((f) => f.endsWith(".jsonl") && (!args.season || f.startsWith(args.season))).map((f) => join(LOG_DIR.pathname, f));
const lines: ForecastLogLine[] = [];
for (const f of files) {
  if (!existsSync(f)) continue;
  for (const raw of readFileSync(f, "utf8").split("\n")) {
    if (!raw.trim()) continue;
    try { lines.push(JSON.parse(raw) as ForecastLogLine); } catch { console.warn(`${basename(f)}: nečitateľný riadok preskočený`); }
  }
}
if (!lines.length) { console.log(`Žiadne riadky logu (${files.map((f) => basename(f)).join(", ") || "data/prospective je prázdne"}).`); process.exit(0); }
const seasons = [...new Set(lines.map((l) => seasonOf(l.firstDate)))].sort();
const label = args.season ?? seasons.map((s) => s.replace("/", "-")).join("+");

// Truth.
interface TruthTable { columns: { id: string; kind: string; pointId: string }[]; dates: string[]; newSnowCm: (number | null)[][]; hsCm: (number | null)[][] }
const truth: TruthTable = readDerived<TruthTable>("truth-daily.json") ?? (() => { throw new Error("truth-daily.json chýba – spusti npm run truth:fetch a npm run truth"); })();
const dateIndex = new Map(truth.dates.map((d, i) => [d, i]));
const columnsFor = (station: string) => truth.columns.map((c, i) => ({ c, i })).filter(({ c }) => c.pointId === station && !c.id.startsWith("snowgrid:")).sort((a, b) => Number(b.c.kind === "newSnow") - Number(a.c.kind === "newSnow"));
const lookup = (station: string, date: string) => {
  const k = dateIndex.get(date);
  if (k === undefined) return null;
  for (const { i } of columnsFor(station)) { const v = truth.newSnowCm[i][k]; if (v !== null) return { obs: v, hs: truth.hsCm[i][k] }; }
  return null;
};
const CLIM_PROXY: Record<string, string> = { "geosphere:15715": "geosphere:122", "lwd:2900265": "ehyd:123133", "lwd:2900240": "ehyd:123133" };
const climCache = new Map<string, { p: number; mean: number }>();
const climatology = (station: string, month: number, date: string) => {
  const season = seasonOf(date), key = `${station}|${month}|${season}`;
  const hit = climCache.get(key);
  if (hit) return hit;
  const i = truth.columns.findIndex((c) => c.id === `${CLIM_PROXY[station] ?? station}:manual`);
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
};

const classes = collectCases(lines, lookup, climatology, THRESHOLD);
const f2 = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? "–" : x.toFixed(2).replace(".", ","));
const f1 = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? "–" : x.toFixed(1).replace(".", ","));
const ci = (b: Interval) => `${f2(b.est)} (${f2(b.lo)}–${f2(b.hi)})`;
const out: string[] = [];
const say = (s = "") => { out.push(s); console.log(s); };

say(`## Prospektívne overenie ${label}: ${lines.length} riadkov logu, ${[...new Set(lines.map((l) => l.firstDate))].length} dní s behom, verzia koeficientov ${[...new Set(lines.map((l) => l.modelVersion))].join("/")}`);
say("");
say(`Udalosť ≥ ${THRESHOLD} cm za deň merania; pravda z \`truth-daily.json\` (ručný nový sneh, inak ΔHS automatov o 06 UTC; okno stránky končí o 2 h neskôr). Primárna vzorka: sezóna prevádzky a pokrývka ≥ ${COVER} cm; BSS proti LOSO klimatológii po mesiacoch; CI = blokový bootstrap po dňoch. Prah ALERTu p* = ${f2(P_STAR)}. Triedy = horizont × poradie dňa × slot CI (UTC), deň v triede raz na stanicu.`);

function table(title: string, prefix: string, primary: boolean): void {
  const rows = [...classes.entries()].filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => a.localeCompare(b));
  if (!rows.length) return;
  say("");
  say(`### ${title} – ${primary ? "primárna vzorka" : "všetky dni s pravdou"}`);
  say("");
  say("| Trieda | n | udalostí | predstih [h] | **BSS** (95 % CI) | AUC | MAE mediánu [cm] | bias úhrnu [cm] | ALERTov | zásahy | falošné | zmeškané | spoľahlivosť (p̄ → pozorované) |");
  say("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const [key, all] of rows) {
    const cases = primary ? all.filter((c) => inOperatingWindow(c.day) && c.hs !== null && c.hs >= COVER) : all;
    if (cases.length < 10) continue;
    const s = scores(cases, THRESHOLD);
    const bss = bootstrapBlocks(cases, (x) => { const r = scores(x as LoggedCase[], THRESHOLD); return r.events >= 5 ? r.bss : null; });
    bss.est = s.bss;
    const d = decisionTable(cases, THRESHOLD, P_STAR);
    const rel = reliability(cases, THRESHOLD).filter((b) => b.n >= 5).map((b) => `${f2(b.meanProb)}→${f2(b.obsFreq)} (${b.n})`).join(", ");
    const bias = meanOf(cases, (c) => (c.forecastCm === null ? null : c.forecastCm - c.obs));
    say(`| ${key} | ${s.n} | ${s.events} | ${f1(meanOf(cases, (c) => c.leadH))} | **${ci(bss)}** | ${f2(s.auc)} | ${f2(s.mae)} | ${f2(bias)} | ${d.alerts} | ${d.hits} | ${d.falseAlarms} | ${d.misses} | ${rel || "–"} |`);
  }
}
table("Overovacie stanice (vlastná pravda)", "stations|", true);
table("Overovacie stanice (vlastná pravda)", "stations|", false);
say("");
say(`Strediská proti zástupnej stanici: ${Object.entries(RESORT_PROXY).map(([r, p]) => `${r} → ${p.station}${p.approximate ? " (orientačne, 10–15 km)" : ""}`).join("; ")}.`);
table("Strediská (zástupná pravda)", "resorts|", true);
table("Ansámbel – surový podiel členov ≥ prah, bez kalibrácie (zástupná pravda)", "ensemble|", true);

mkdirSync(LOG_DIR, { recursive: true });
writeFileSync(new URL(`REPORT-${label}.md`, LOG_DIR), `${out.join("\n")}\n`);
writeFileSync(new URL(`summary-${label}.json`, LOG_DIR), `${JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), lines: lines.length, threshold: THRESHOLD, pStar: P_STAR, classes: Object.fromEntries([...classes.entries()].map(([k, v]) => [k, { n: v.length, events: v.filter((c) => c.obs >= THRESHOLD).length }])) }, null, 1)}\n`);
say("");
say(`Zapísané: data/prospective/REPORT-${label}.md, summary-${label}.json`);
