/**
 * Step 1 of the calibrated powder model (npm run truth): from the derived files that
 * scripts/truth-fetch.ts leaves in ~/.cache/ztlzdrf/derived, build one daily truth table, count
 * independent >= 15 cm storms per season, describe the climatology and measure how far the truth
 * sources agree with each other. Writes data/truth/{storms,summary}.json (small, versioned) and
 * ~/.cache/ztlzdrf/derived/truth-daily.json (the full table, reproducible), and prints the tables
 * that METODIKA.md quotes.
 *
 * Day convention: a measurement day M is the 24 h ending at the morning observation of M (06 UTC).
 * Daily sources stamp that window differently - eHYD and GeoSphere by its start day, snow-depth
 * analyses by the day of the depth - so every daily source is first aligned against INCA hourly
 * precipitation summed over the same windows (the best of a -1/0/+1 day shift wins, and the
 * evidence is printed), then mapped onto M.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { CACHE_DIR, readDerived, writeDerived } from "./lib/cache.js";
import { OPERATING_FROM, OPERATING_TO, addDays, inOperatingWindow, seasonOf } from "./lib/season.js";
import { EHYD_STATIONS, GEOSPHERE_STATIONS, LWD_STATIONS, type Point } from "./lib/points.js";

const THRESHOLD_CM = 15;
const COVER_CM = 30;
const BOOT = 2000;
const OUT_DIR = new URL("../data/truth/", import.meta.url);

type Daily = Map<string, number | null>;
interface Series {
  id: string;
  label: string;
  source: "ehyd" | "geosphere" | "geosphere-auto" | "snowgrid" | "lwd";
  kind: "newSnow" | "deltaHS";
  station: string;
  elevation: number;
  pointId: string;
  /** New snow (cm) per measurement day M. */
  value: Daily;
  /** Snow depth (cm) on the morning of M, from the same instrument where there is one. */
  hs: Daily;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

interface GsDaily { series: Record<string, { timestamps: string[]; values: Record<string, (number | null)[]> }> }
interface GridDaily { points: Point[]; series: Record<string, { pixel: [number, number]; timestamps: string[]; values: Record<string, (number | null)[]> }> }
interface EhydFile { stamps: string[]; values: (number | null)[]; header: Record<string, string> }
interface Ehyd { hzb: number; name: string; elevation: number; files: Record<string, EhydFile | string> }
interface Lwd { id: number; name: string; elevation: number; fields: string[]; stamps: string[]; rows: (number | null)[][] }

const must = <T>(name: string): T => {
  const d = readDerived<T>(name);
  if (!d) throw new Error(`${name} chýba – spusti najprv npm run truth:fetch`);
  return d;
};

const points = must<Point[]>("points.json");
const gsDaily = must<GsDaily>("geosphere-daily.json");
const gsHourly = must<GsDaily>("geosphere-hourly.json");
const snowgrid = must<GridDaily>("snowgrid-daily.json");
const spartacus = must<GridDaily>("spartacus-daily.json");
const inca = readDerived<GridDaily>("inca-hourly.json");
const ehyd = EHYD_STATIONS.map((s) => readDerived<Ehyd>(`ehyd-${s.hzb}.json`)).filter((x): x is Ehyd => x !== null);
const lwd = LWD_STATIONS.map((s) => readDerived<Lwd>(`lwd-${s.id}.json`)).filter((x): x is Lwd => x !== null);

const day = (stamp: string): string => stamp.slice(0, 10);

/** GeoSphere's -1 means "none" for precipitation and snow (documented for sh/shneu); keep nulls. */
const noneToZero = (v: number | null): number | null => (v === null ? null : v < 0 ? 0 : v);

function columnByDay(timestamps: string[], values: (number | null)[], fix: (v: number | null) => number | null = (v) => v): Daily {
  const m: Daily = new Map();
  timestamps.forEach((t, i) => m.set(day(t), fix(values[i] ?? null)));
  return m;
}

/** Hourly values keyed by "YYYY-MM-DDTHH" (UTC). */
function columnByHour(timestamps: string[], values: (number | null)[]): Map<string, number | null> {
  const m = new Map<string, number | null>();
  timestamps.forEach((t, i) => m.set(t.slice(0, 13), values[i] ?? null));
  return m;
}

/** Sum of an hourly "preceding hour" quantity over (w 06 UTC, w+1 06 UTC]. Null if any hour is missing. */
function window24(hourly: Map<string, number | null>, w: string, pick?: (h: string) => boolean): number | null {
  let sum = 0;
  const next = addDays(w, 1);
  for (let h = 7; h <= 30; h++) {
    const key = h < 24 ? `${w}T${String(h).padStart(2, "0")}` : `${next}T${String(h - 24).padStart(2, "0")}`;
    const v = hourly.get(key);
    if (v === null || v === undefined) return null;
    if (!pick || pick(key)) sum += v;
  }
  return sum;
}

function shift(daily: Daily, k: number): Daily {
  const m: Daily = new Map();
  for (const [d, v] of daily) m.set(addDays(d, k), v);
  return m;
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

function pearson(pairs: [number, number][]): number | null {
  const n = pairs.length;
  if (n < 30) return null;
  const mx = pairs.reduce((a, p) => a + p[0], 0) / n;
  const my = pairs.reduce((a, p) => a + p[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pairs) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Deterministic PRNG so the report is reproducible byte for byte. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

/** Season-block bootstrap: resample seasons with replacement, recompute a statistic. */
function bootstrapSeasons<T>(bySeason: Map<string, T>, stat: (blocks: T[]) => number | null, seed = 1): { est: number | null; lo: number | null; hi: number | null } {
  const blocks = [...bySeason.values()];
  const est = stat(blocks);
  if (blocks.length < 3) return { est, lo: null, hi: null };
  const r = rng(seed);
  const vals: number[] = [];
  for (let b = 0; b < BOOT; b++) {
    const sample = Array.from({ length: blocks.length }, () => blocks[Math.floor(r() * blocks.length)]);
    const v = stat(sample);
    if (v !== null && Number.isFinite(v)) vals.push(v);
  }
  vals.sort((a, b) => a - b);
  return { est, lo: quantile(vals, 0.025), hi: quantile(vals, 0.975) };
}

const f1 = (x: number | null | undefined): string => (x === null || x === undefined || !Number.isFinite(x) ? "–" : x.toFixed(1).replace(".", ","));
const f2 = (x: number | null | undefined): string => (x === null || x === undefined || !Number.isFinite(x) ? "–" : x.toFixed(2).replace(".", ","));
const ci = (b: { est: number | null; lo: number | null; hi: number | null }, f = f1): string => `${f(b.est)} (${f(b.lo)}–${f(b.hi)})`;

// ---------------------------------------------------------------------------
// 1. Raw daily columns per source, keyed by the source's own date
// ---------------------------------------------------------------------------

const pointById = new Map(points.map((p) => [p.id, p]));
const snowgridHs = new Map<string, Daily>(); // cm
const snowgridSwe = new Map<string, Daily>();
for (const [pid, s] of Object.entries(snowgrid.series)) {
  snowgridHs.set(pid, columnByDay(s.timestamps, s.values.snow_depth, (v) => (v === null ? null : v * 100)));
  snowgridSwe.set(pid, columnByDay(s.timestamps, s.values.swe_tot));
}
const spartacusRr = new Map<string, Daily>();
const spartacusTx = new Map<string, Daily>();
const spartacusTn = new Map<string, Daily>();
const spartacusSa = new Map<string, Daily>();
for (const [pid, s] of Object.entries(spartacus.series)) {
  spartacusRr.set(pid, columnByDay(s.timestamps, s.values.RR));
  spartacusTx.set(pid, columnByDay(s.timestamps, s.values.TX));
  spartacusTn.set(pid, columnByDay(s.timestamps, s.values.TN));
  spartacusSa.set(pid, columnByDay(s.timestamps, s.values.SA, (v) => (v === null ? null : v / 3600)));
}

/** INCA 24 h sums per window start day, per point: all precipitation and the cold (T2M <= 1 °C) part. */
const incaRr24 = new Map<string, Daily>();
const incaSnow24 = new Map<string, Daily>();
if (inca) {
  for (const [pid, s] of Object.entries(inca.series)) {
    const rr = columnByHour(s.timestamps, s.values.RR);
    const t = columnByHour(s.timestamps, s.values.T2M);
    const days = new Set([...rr.keys()].map((h) => h.slice(0, 10)));
    const all: Daily = new Map(), cold: Daily = new Map();
    for (const w of days) {
      all.set(w, window24(rr, w));
      cold.set(w, window24(rr, w, (h) => { const tv = t.get(h); return tv !== null && tv !== undefined && tv <= 1; }));
    }
    incaRr24.set(pid, all);
    incaSnow24.set(pid, cold);
  }
}

interface RawDaily { id: string; label: string; source: Series["source"]; kind: Series["kind"]; station: string; elevation: number; pointId: string; value: Daily; hsSame: Daily | null }
const raw: RawDaily[] = [];

for (const e of ehyd) {
  const ns = e.files.newSnowDaily as EhydFile | undefined;
  const sh = e.files.snowDepthDaily as EhydFile | undefined;
  if (!ns) continue;
  raw.push({ id: `ehyd:${e.hzb}:manual`, label: `eHYD ${e.name} (${e.elevation} m), ručne`, source: "ehyd", kind: "newSnow", station: e.name, elevation: e.elevation, pointId: `ehyd:${e.hzb}`, value: columnByDay(ns.stamps, ns.values), hsSame: sh ? columnByDay(sh.stamps, sh.values) : null });
}
for (const st of GEOSPHERE_STATIONS) {
  const s = gsDaily.series[String(st.id)];
  if (!s) continue;
  if (st.manual) raw.push({ id: `geosphere:${st.id}:manual`, label: `GeoSphere ${st.name} (${st.elevation} m), ručne`, source: "geosphere", kind: "newSnow", station: st.name, elevation: st.elevation, pointId: `geosphere:${st.id}`, value: columnByDay(s.timestamps, s.values.shneu_manu, noneToZero), hsSame: columnByDay(s.timestamps, s.values.sh_manu, noneToZero) });
}
// Automatic snow depth at 06 UTC from hourly data -> 24 h difference (raw, no settling correction).
for (const st of GEOSPHERE_STATIONS) {
  const s = gsHourly.series[String(st.id)];
  if (!s || !st.auto) continue;
  const sh = columnByHour(s.timestamps, s.values.sh);
  const hs06: Daily = new Map();
  for (const [h, v] of sh) if (h.endsWith("T06")) hs06.set(h.slice(0, 10), noneToZero(v));
  const delta: Daily = new Map();
  for (const [d, v] of hs06) { const p = hs06.get(addDays(d, -1)); delta.set(d, v === null || p === null || p === undefined ? null : v - p); }
  if ([...delta.values()].some((v) => v !== null)) raw.push({ id: `geosphere:${st.id}:auto`, label: `GeoSphere ${st.name} (${st.elevation} m), ΔHS automat`, source: "geosphere-auto", kind: "deltaHS", station: st.name, elevation: st.elevation, pointId: `geosphere:${st.id}`, value: delta, hsSame: hs06 });
}
// LWD: snow depth at 07:00 CET as the median of the seven 10-min values 06:40..07:40, then the 24 h difference.
for (const l of lwd) {
  const hsIdx = l.fields.indexOf("HS");
  const byStamp = new Map<string, number | null>();
  l.stamps.forEach((t, i) => byStamp.set(t.slice(0, 16), l.rows[i]?.[hsIdx] ?? null));
  const hs07: Daily = new Map();
  for (const d of new Set(l.stamps.map(day))) {
    const vals: number[] = [];
    for (const hm of ["06:40", "06:50", "07:00", "07:10", "07:20", "07:30", "07:40"]) { const v = byStamp.get(`${d}T${hm}`); if (v !== null && v !== undefined) vals.push(Math.max(0, v) * 100); }
    if (vals.length >= 4) { vals.sort((a, b) => a - b); hs07.set(d, Math.round(quantile(vals, 0.5) * 10) / 10); } else hs07.set(d, null);
  }
  const delta: Daily = new Map();
  for (const [d, v] of hs07) { const p = hs07.get(addDays(d, -1)); delta.set(d, v === null || p === null || p === undefined ? null : Math.round((v - p) * 10) / 10); }
  raw.push({ id: `lwd:${l.id}:auto`, label: `LWD ${l.name} (${l.elevation} m), ΔHS automat`, source: "lwd", kind: "deltaHS", station: l.name, elevation: l.elevation, pointId: `lwd:${l.id}`, value: delta, hsSame: hs07 });
}
// SNOWGRID: 24 h change of analysed snow depth at every point.
for (const [pid, hs] of snowgridHs) {
  const p = pointById.get(pid)!;
  const delta: Daily = new Map();
  for (const [d, v] of hs) { const prev = hs.get(addDays(d, -1)); delta.set(d, v === null || prev === null || prev === undefined ? null : v - prev); }
  raw.push({ id: `snowgrid:${pid}`, label: `SNOWGRID ΔHS @ ${p.name} (${p.elevation} m)`, source: "snowgrid", kind: "deltaHS", station: p.name, elevation: p.elevation, pointId: pid, value: delta, hsSame: hs });
}

// ---------------------------------------------------------------------------
// 2. Alignment against INCA: which shift k makes value(d) match the window starting d+k?
// ---------------------------------------------------------------------------

const lines: string[] = [];
const say = (s = ""): void => { lines.push(s); console.log(s); };

say("## Zarovnanie dátumov zdrojov proti INCA (korelácia podľa posunu k; okno = (d+k 06 UTC, d+k+1 06 UTC])");
say("");
say("| Zdroj | n | k = −1 | k = 0 | k = +1 | záver |");
say("|---|---|---|---|---|---|");
/** Convention per source family: the window start day w = d + conv, i.e. M = w + 1. */
const convention: Record<string, number> = {};
function alignmentTest(label: string, family: string, daily: Daily, pid: string, cold: boolean, defaultK: number): void {
  const ref = (cold ? incaSnow24 : incaRr24).get(pid);
  if (!ref) { convention[family] ??= defaultK; say(`| ${label} | – | – | – | – | bez INCA → predpoklad k = ${defaultK} |`); return; }
  const r: Record<number, number | null> = {};
  let n = 0;
  for (const k of [-1, 0, 1]) {
    const pairs: [number, number][] = [];
    for (const [d, v] of daily) {
      const w = addDays(d, k);
      const month = Number(d.slice(5, 7));
      if (v === null || month > 4 && month < 11) continue;
      const x = ref.get(w);
      if (x === null || x === undefined) continue;
      pairs.push([v, x]);
    }
    r[k] = pearson(pairs);
    n = pairs.length;
  }
  const best = ([-1, 0, 1] as const).reduce((a, k) => ((r[k] ?? -1) > (r[a] ?? -1) ? k : a), 0 as -1 | 0 | 1);
  convention[family] ??= best;
  say(`| ${label} | ${n} | ${f2(r[-1])} | ${f2(r[0])} | ${f2(r[1])} | k = ${best} (${best === 0 ? "dátum = začiatok okna" : best === -1 ? "dátum = koniec okna" : "posun o deň"}) |`);
}
const ehydTurr = raw.find((r) => r.id === "ehyd:123133:manual");
if (ehydTurr) alignmentTest("eHYD Turracher Höhe nový sneh", "ehyd", ehydTurr.value, "ehyd:123133", true, 0);
const ehydTurrRaw = ehyd.find((e) => e.hzb === 123133);
if (ehydTurrRaw?.files.precipDaily) { const f = ehydTurrRaw.files.precipDaily as EhydFile; alignmentTest("eHYD Turracher Höhe zrážky", "ehyd-rr", columnByDay(f.stamps, f.values), "ehyd:123133", false, 0); }
for (const id of [20020, 122, 186]) {
  const r = raw.find((x) => x.id === `geosphere:${id}:manual`);
  if (r) alignmentTest(`GeoSphere ${r.station} nový sneh`, "geosphere", r.value, r.pointId, true, 0);
}
{ const s = gsDaily.series["122"]; if (s) alignmentTest("GeoSphere Kanzelhöhe zrážky rr", "geosphere-rr", columnByDay(s.timestamps, s.values.rr, noneToZero), "geosphere:122", false, 0); }
{ const r = raw.find((x) => x.id === "snowgrid:ehyd:123133"); if (r) alignmentTest("SNOWGRID ΔHS @ eHYD Turracher", "snowgrid", r.value, "ehyd:123133", true, -1); }
{ const rr = spartacusRr.get("ehyd:123133"); if (rr) alignmentTest("SPARTACUS RR @ eHYD Turracher", "spartacus", rr, "ehyd:123133", false, 0); }
{ const r = raw.find((x) => x.id === "geosphere:186:auto"); if (r) alignmentTest("GeoSphere Flattnitz ΔHS automat (06 UTC)", "geosphere-auto", r.value, r.pointId, true, -1); }
convention["lwd"] = -1; // built from 07:00 depths: the difference on d covers d-1 07:00 .. d 07:00
say("");
say(`Konvencie (k): ${Object.entries(convention).map(([k, v]) => `${k}=${v}`).join(", ")}. Deň merania M = d + k + 1.`);

// ---------------------------------------------------------------------------
// 3. Series on measurement days M
// ---------------------------------------------------------------------------

const series: Series[] = raw.map((r) => {
  const k = convention[r.source === "geosphere-auto" ? "geosphere-auto" : r.source] ?? 0;
  const value = shift(r.value, k + 1);
  // Snow depth on the morning of M. Station depth columns are instantaneous morning readings keyed by
  // their own day, so they need no shift. SNOWGRID's depth is the state at the end of day d (its 24 h
  // change aligns with the window starting d), so the morning of M is the depth of M - 1.
  const hs = r.hsSame ? shift(r.hsSame, r.source === "snowgrid" ? k + 1 : 0) : shift(snowgridHs.get(r.pointId) ?? new Map(), (convention.snowgrid ?? 0) + 1);
  return { id: r.id, label: r.label, source: r.source, kind: r.kind, station: r.station, elevation: r.elevation, pointId: r.pointId, value, hs };
});

// ---------------------------------------------------------------------------
// 4. Storms
// ---------------------------------------------------------------------------

interface Storm { start: string; end: string; days: number; totalCm: number; maxCm: number; hsAfterCm: number | null; season: string }

function qualifyingDays(s: Series, threshold: number, cover: number, operatingOnly: boolean): string[] {
  const out: string[] = [];
  for (const [m, v] of s.value) {
    if (v === null || v < threshold) continue;
    if (operatingOnly && !inOperatingWindow(m)) continue;
    const hs = s.hs.get(m);
    if (cover > 0 && (hs === null || hs === undefined || hs < cover)) continue;
    out.push(m);
  }
  return out.sort();
}

function mergeStorms(days: string[], s: Series): Storm[] {
  const storms: Storm[] = [];
  for (const m of days) {
    const last = storms[storms.length - 1];
    const v = s.value.get(m) ?? 0;
    if (last && addDays(last.end, 1) === m) { last.end = m; last.days++; last.totalCm += v; last.maxCm = Math.max(last.maxCm, v); last.hsAfterCm = s.hs.get(m) ?? null; }
    else storms.push({ start: m, end: m, days: 1, totalCm: v, maxCm: v, hsAfterCm: s.hs.get(m) ?? null, season: seasonOf(m) });
  }
  return storms;
}

/** Seasons in which the series has data on at least `minDays` operating-window days. */
function coveredSeasons(s: Series, minDays = 90): string[] {
  const n = new Map<string, number>();
  for (const [m, v] of s.value) if (v !== null && inOperatingWindow(m)) n.set(seasonOf(m), (n.get(seasonOf(m)) ?? 0) + 1);
  return [...n.entries()].filter(([, c]) => c >= minDays).map(([s]) => s).sort();
}

say("");
say(`## Nezávislé búrky ≥ ${THRESHOLD_CM} cm / 24 h (sezóna prevádzky ${OPERATING_FROM.replace("-", ". ")}. – ${OPERATING_TO.replace("-", ". ")}., pokrývka ráno po sneženi ≥ ${COVER_CM} cm)`);
say("");
say("| Rad | Sezóny s dátami | Dní ≥ 15 cm | Búrok | Búrok / sezónu (95 % CI) | Priemer búrky [cm] | Bez podmienky pokrývky | Celá zima nov–apr |");
say("|---|---|---|---|---|---|---|---|");
const stormCatalogue: Record<string, { label: string; elevation: number; seasons: string[]; storms: Storm[] }> = {};
const seriesSummary: Record<string, unknown>[] = [];
for (const s of series) {
  if (s.source === "snowgrid" && !/^snowgrid:(ehyd|geosphere|lwd):/.test(s.id) && !/:top$/.test(s.pointId)) continue; // bases of resorts are not snow-measurement points
  const seasons = coveredSeasons(s);
  if (!seasons.length) continue;
  const storms = mergeStorms(qualifyingDays(s, THRESHOLD_CM, COVER_CM, true), s).filter((st) => seasons.includes(st.season));
  const bySeason = new Map(seasons.map((se) => [se, storms.filter((st) => st.season === se).length]));
  const rate = bootstrapSeasons(bySeason, (b) => b.reduce((a, x) => a + x, 0) / b.length);
  const noCover = mergeStorms(qualifyingDays(s, THRESHOLD_CM, 0, true), s).filter((st) => seasons.includes(st.season)).length;
  const wholeWinter = mergeStorms(qualifyingDays(s, THRESHOLD_CM, COVER_CM, false), s).filter((st) => seasons.includes(st.season) && (Number(st.end.slice(5, 7)) >= 11 || Number(st.end.slice(5, 7)) <= 4)).length;
  const days = storms.reduce((a, st) => a + st.days, 0);
  const mean = storms.length ? storms.reduce((a, st) => a + st.totalCm, 0) / storms.length : null;
  say(`| ${s.label} | ${seasons.length} (${seasons[0]}–${seasons[seasons.length - 1]}) | ${days} | ${storms.length} | ${ci(rate)} | ${f1(mean)} | ${noCover} | ${wholeWinter} |`);
  stormCatalogue[s.id] = { label: s.label, elevation: s.elevation, seasons, storms };
  seriesSummary.push({ id: s.id, label: s.label, source: s.source, kind: s.kind, elevation: s.elevation, seasons, days15: days, storms15: storms.length, stormsPerSeason: rate, meanStormCm: mean, stormsNoCover: noCover, stormsWholeWinter: wholeWinter });
}

// Regional storms: any manual station >= 15 cm on M (union), merged into one event.
const manual = series.filter((s) => s.kind === "newSnow");
const regionalSeasons = [...new Set(manual.flatMap((s) => coveredSeasons(s)))].sort();
const unionDays = new Map<string, string[]>();
for (const s of manual) for (const m of qualifyingDays(s, THRESHOLD_CM, COVER_CM, true)) unionDays.set(m, [...(unionDays.get(m) ?? []), s.station]);
const regional: (Storm & { stations: string[] })[] = [];
for (const m of [...unionDays.keys()].sort()) {
  const last = regional[regional.length - 1];
  if (last && addDays(last.end, 1) === m) { last.end = m; last.days++; last.stations = [...new Set([...last.stations, ...unionDays.get(m)!])]; }
  else regional.push({ start: m, end: m, days: 1, totalCm: 0, maxCm: 0, hsAfterCm: null, season: seasonOf(m), stations: unionDays.get(m)! });
}
say("");
const regionalBySeason = new Map(regionalSeasons.map((se) => [se, regional.filter((r) => r.season === se).length]));
const regRate = bootstrapSeasons(regionalBySeason, (b) => b.reduce((a, x) => a + x, 0) / b.length);
say(`Regionálne búrky (${manual.length} ručných radov: ${manual.map((s) => s.station).join(", ")}; aspoň jedna stanica ≥ ${THRESHOLD_CM} cm, zlúčené súvislé dni): ${regional.length} v ${regionalSeasons.length} sezónach, ${ci(regRate)} za sezónu; podiel búrok, ktoré zasiahli ≥ 2 stanice: ${f1(100 * regional.filter((r) => r.stations.length >= 2).length / Math.max(1, regional.length))} %.`);
say("");
say("Po sezónach (regionálne búrky): " + regionalSeasons.map((se) => `${se}: ${regionalBySeason.get(se)}`).join(", "));

// Sensitivity: threshold x cover for the two long manual series.
say("");
say("## Citlivosť počtu búrok na prah a podmienku pokrývky (búrky za sezónu)");
say("");
say("| Rad | prah 10 cm | 15 cm | 20 cm | 30 cm | pokrývka 0 | 20 cm | 30 cm | 50 cm |");
say("|---|---|---|---|---|---|---|---|---|");
for (const id of ["ehyd:123133:manual", "geosphere:20020:manual", "geosphere:122:manual", "geosphere:186:manual"]) {
  const s = series.find((x) => x.id === id);
  if (!s) continue;
  const seasons = coveredSeasons(s);
  const per = (thr: number, cov: number): string => f1(mergeStorms(qualifyingDays(s, thr, cov, true), s).filter((st) => seasons.includes(st.season)).length / seasons.length);
  say(`| ${s.label} | ${per(10, COVER_CM)} | ${per(15, COVER_CM)} | ${per(20, COVER_CM)} | ${per(30, COVER_CM)} | ${per(15, 0)} | ${per(15, 20)} | ${per(15, 30)} | ${per(15, 50)} |`);
}

// ---------------------------------------------------------------------------
// 5. Climatology by month and by elevation
// ---------------------------------------------------------------------------

say("");
say("## Klimatológia: podiel dní merania s ≥ 15 cm podľa mesiaca (%, všetky dni) a v sezóne prevádzky s pokrývkou ≥ 30 cm");
say("");
say("| Rad | nov | dec | jan | feb | mar | apr | P(≥15) sezóna prevádzky, pokrývka ≥ 30 cm | medián / 90. perc. úhrnu v dňoch ≥ 1 cm [cm] |");
say("|---|---|---|---|---|---|---|---|---|");
const climatology: Record<string, unknown> = {};
for (const s of manual) {
  const seasons = coveredSeasons(s);
  const byMonth: Record<number, { n: number; hit: number }> = {};
  let n = 0, hit = 0;
  const amounts: number[] = [];
  for (const [m, v] of s.value) {
    if (v === null || !seasons.includes(seasonOf(m))) continue;
    const hs = s.hs.get(m);
    const covered = hs !== null && hs !== undefined && hs >= COVER_CM;
    const mon = Number(m.slice(5, 7));
    if (mon > 4 && mon < 11) continue;
    const b = (byMonth[mon] ??= { n: 0, hit: 0 });
    b.n++;
    if (v >= THRESHOLD_CM) b.hit++;
    if (covered && inOperatingWindow(m)) { n++; if (v >= THRESHOLD_CM) hit++; }
    if (v >= 1) amounts.push(v);
  }
  amounts.sort((a, b) => a - b);
  const pct = (mon: number): string => (byMonth[mon]?.n ? f1((100 * byMonth[mon].hit) / byMonth[mon].n) : "–");
  say(`| ${s.label} | ${pct(11)} | ${pct(12)} | ${pct(1)} | ${pct(2)} | ${pct(3)} | ${pct(4)} | ${f1(n ? (100 * hit) / n : null)} % (n = ${n}) | ${f1(quantile(amounts, 0.5))} / ${f1(quantile(amounts, 0.9))} |`);
  climatology[s.id] = { label: s.label, elevation: s.elevation, byMonth, operating: { n, hit }, amountQuantiles: { p50: quantile(amounts, 0.5), p90: quantile(amounts, 0.9), p99: quantile(amounts, 0.99) } };
}

// ---------------------------------------------------------------------------
// 6. Agreement between truth versions (contingency at >= 15 cm, season-block bootstrap)
// ---------------------------------------------------------------------------

interface Agreement { a: string; b: string; n: number; both: number; onlyA: number; onlyB: number; pod: { est: number | null; lo: number | null; hi: number | null }; far: { est: number | null; lo: number | null; hi: number | null }; corr: number | null; mae: number | null; biasB: number | null }

function agreement(a: Series, b: Series, shiftB = 0, cover = COVER_CM, operatingOnly = true): Agreement | null {
  const bySeason = new Map<string, { both: number; onlyA: number; onlyB: number; n: number }>();
  const pairs: [number, number][] = [];
  for (const [m, va] of a.value) {
    const vb = b.value.get(addDays(m, shiftB));
    if (va === null || vb === null || vb === undefined) continue;
    if (operatingOnly && !inOperatingWindow(m)) continue;
    const hs = a.hs.get(m);
    if (cover > 0 && (hs === null || hs === undefined || hs < cover)) continue;
    const se = seasonOf(m);
    const c = bySeason.get(se) ?? { both: 0, onlyA: 0, onlyB: 0, n: 0 };
    c.n++;
    const ha = va >= THRESHOLD_CM, hb = vb >= THRESHOLD_CM;
    if (ha && hb) c.both++; else if (ha) c.onlyA++; else if (hb) c.onlyB++;
    bySeason.set(se, c);
    pairs.push([va, vb]);
  }
  if (pairs.length < 60) return null;
  const sum = (blocks: { both: number; onlyA: number; onlyB: number }[], k: "both" | "onlyA" | "onlyB") => blocks.reduce((x, y) => x + y[k], 0);
  const pod = bootstrapSeasons(bySeason, (bl) => { const h = sum(bl, "both"), miss = sum(bl, "onlyA"); return h + miss ? h / (h + miss) : null; }, 2);
  const far = bootstrapSeasons(bySeason, (bl) => { const h = sum(bl, "both"), fa = sum(bl, "onlyB"); return h + fa ? fa / (h + fa) : null; }, 3);
  const snowy = pairs.filter(([x, y]) => x >= 1 || y >= 1);
  const mae = snowy.length ? snowy.reduce((s, [x, y]) => s + Math.abs(x - y), 0) / snowy.length : null;
  const biasB = snowy.length ? snowy.reduce((s, [x, y]) => s + (y - x), 0) / snowy.length : null;
  return { a: a.id, b: b.id, n: pairs.length, both: sum([...bySeason.values()], "both"), onlyA: sum([...bySeason.values()], "onlyA"), onlyB: sum([...bySeason.values()], "onlyB"), pod, far, corr: pearson(pairs), mae, biasB };
}

say("");
say(`## Zhoda verzií pravdy pri ≥ ${THRESHOLD_CM} cm (A = referencia; POD = podiel dní A, ktoré má aj B; FAR = podiel dní B, ktoré A nemá; 95 % CI bootstrap po sezónach)`);
say("");
say("| A (referencia) | B | n dní | A∧B | len A | len B | POD | FAR | r | MAE [cm] | bias B−A [cm] |");
say("|---|---|---|---|---|---|---|---|---|---|---|");
const agreements: Agreement[] = [];
const S = (id: string): Series | undefined => series.find((s) => s.id === id);
const pairsToTest: [string, string][] = [
  ["ehyd:123133:manual", "snowgrid:ehyd:123133"],
  ["ehyd:123133:manual", "geosphere:20020:manual"],
  ["ehyd:123133:manual", "geosphere:122:manual"],
  ["ehyd:123133:manual", "geosphere:186:manual"],
  ["geosphere:20020:manual", "snowgrid:geosphere:20020"],
  ["geosphere:122:manual", "snowgrid:geosphere:122"],
  ["geosphere:122:manual", "geosphere:122:auto"],
  ["geosphere:186:manual", "geosphere:186:auto"],
  ["geosphere:186:manual", "snowgrid:geosphere:186"],
  ["geosphere:20020:manual", "geosphere:122:manual"],
  ["geosphere:20020:manual", "geosphere:186:manual"],
  ["geosphere:122:manual", "geosphere:186:manual"],
  ["snowgrid:lwd:2900265", "lwd:2900265:auto"],
  ["snowgrid:lwd:2900240", "lwd:2900240:auto"],
  ["geosphere:20020:manual", "lwd:2900265:auto"],
  ["snowgrid:turracher-hoehe:top", "snowgrid:ehyd:123133"],
  ["snowgrid:turracher-hoehe:top", "snowgrid:lwd:2900265"],
];
for (const e of ehyd) if (e.hzb !== 123133 && e.files.newSnowDaily) pairsToTest.push(["ehyd:123133:manual", `ehyd:${e.hzb}:manual`], [`ehyd:${e.hzb}:manual`, `snowgrid:ehyd:${e.hzb}`]);
for (const [ida, idb] of pairsToTest) {
  const a = S(ida), b = S(idb);
  if (!a || !b) continue;
  const g = agreement(a, b);
  if (!g) continue;
  agreements.push(g);
  say(`| ${a.label} | ${b.label} | ${g.n} | ${g.both} | ${g.onlyA} | ${g.onlyB} | ${ci(g.pod, f2)} | ${ci(g.far, f2)} | ${f2(g.corr)} | ${f1(g.mae)} | ${f1(g.biasB)} |`);
}

// Settling check for automatic depth differences: how much does a +x %/day correction move POD/FAR?
say("");
say("## ΔHS automatov s korekciou na sadanie (ΔHS + 2 % predchádzajúcej výšky): zhoda s ručným meraním na tej istej stanici");
say("");
say("| Stanica | POD surové | POD korigované | FAR surové | FAR korigované |");
say("|---|---|---|---|---|");
for (const id of [122, 186]) {
  const a = S(`geosphere:${id}:manual`), b = S(`geosphere:${id}:auto`);
  if (!a || !b) continue;
  const corrected: Series = { ...b, id: `${b.id}:settled`, value: new Map([...b.value].map(([m, v]) => { const prev = b.hs.get(addDays(m, -1)); return [m, v === null || prev === null || prev === undefined ? null : v + 0.02 * prev]; })) };
  const g0 = agreement(a, b), g1 = agreement(a, corrected);
  if (g0 && g1) say(`| ${a.station} | ${ci(g0.pod, f2)} | ${ci(g1.pod, f2)} | ${ci(g0.far, f2)} | ${ci(g1.far, f2)} |`);
}

// ---------------------------------------------------------------------------
// 7. Lead-time seasons: what the two archived winters offer per station
// ---------------------------------------------------------------------------

say("");
say("## Zimy s archívom predstihu (2024/25, 2025/26): dni a búrky ≥ 15 cm podľa radu");
say("");
say("| Rad | 2024/25 dni / búrky | 2025/26 dni / búrky |");
say("|---|---|---|");
for (const s of series) {
  if (!stormCatalogue[s.id]) continue;
  const st = stormCatalogue[s.id].storms;
  const c = (se: string): string => { const x = st.filter((y) => y.season === se); return x.length || coveredSeasons(s).includes(se) ? `${x.reduce((a, y) => a + y.days, 0)} / ${x.length}` : "–"; };
  if (coveredSeasons(s).includes("2024/25") || coveredSeasons(s).includes("2025/26")) say(`| ${s.label} | ${c("2024/25")} | ${c("2025/26")} |`);
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });
const generated = { generatedAt: new Date().toISOString().slice(0, 10), thresholdCm: THRESHOLD_CM, coverCm: COVER_CM, operating: { from: OPERATING_FROM, to: OPERATING_TO }, conventions: convention };
writeFileSync(new URL("storms.json", OUT_DIR), `${JSON.stringify({ ...generated, series: stormCatalogue, regional: { seasons: regionalSeasons, storms: regional } }, null, 1)}\n`);
writeFileSync(new URL("summary.json", OUT_DIR), `${JSON.stringify({ ...generated, series: seriesSummary, regionalPerSeason: regRate, climatology, agreements }, null, 1)}\n`);
writeFileSync(new URL("REPORT.md", OUT_DIR), `${lines.join("\n")}\n`);
// The full daily table for the backtest, outside git.
const dates = [...new Set(series.flatMap((s) => [...s.value.keys()]))].sort();
const table = { generatedAt: generated.generatedAt, columns: series.map((s) => ({ id: s.id, label: s.label, source: s.source, kind: s.kind, elevation: s.elevation, pointId: s.pointId })), dates, newSnowCm: series.map((s) => dates.map((d) => s.value.get(d) ?? null)), hsCm: series.map((s) => dates.map((d) => s.hs.get(d) ?? null)), spartacus: Object.fromEntries([...spartacusRr.keys()].map((pid) => [pid, { rr: dates.map((d) => spartacusRr.get(pid)!.get(d) ?? null), tx: dates.map((d) => spartacusTx.get(pid)!.get(d) ?? null), tn: dates.map((d) => spartacusTn.get(pid)!.get(d) ?? null), sunH: dates.map((d) => spartacusSa.get(pid)!.get(d) ?? null) }])) };
const p = writeDerived("truth-daily.json", table);
say("");
say(`Zapísané: data/truth/storms.json, data/truth/summary.json, data/truth/REPORT.md; denná tabuľka ${p} (${dates.length} dní × ${series.length} radov). Cache: ${CACHE_DIR}.`);
