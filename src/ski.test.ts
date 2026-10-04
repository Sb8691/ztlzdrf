import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SKI_CONFIG } from "./config.js";
import { clientBundle, clientRender, renderSkiPage } from "./ski-page.js";
import { readSnapshot } from "./ski.js";
import {
  HOUR_MS,
  addDays,
  buildSkiSnapshot,
  firstSkiDate,
  horizonDates,
  horizonUrl,
  judgeDay,
  localDateOf,
  localMidnightMs,
  localTimeMs,
  metaUrl,
  parsePoints,
  percentile,
  powderLawAt,
  powderProbAtLeast,
  powderQuantileCm,
  powderWindow,
  publishedAtMs,
  requestDates,
  requestPoints,
  resolveRun,
  summarizeEnsemble,
} from "./ski-core.js";

/*
 * The algorithm behind the ski page. These tests pin the boundaries that decide a verdict: which
 * hours a lift day covers, where rain turns into snow, which side of each threshold a value lands
 * on, and what missing data does to a verdict and to a percentage.
 */

type Cfg = typeof SKI_CONFIG;
type Hour = { temp: number | null; precip: number | null; gust: number | null; sun: number | null };
/** Fills one point's hour: point index (2r = top, 2r+1 = base), member index, stamp. */
type Fill = (point: number, member: number, ms: number) => Partial<Hour>;

const cfg: Cfg = SKI_CONFIG;
const tz = cfg.timezone;
const DAY = "2027-01-15";

/** A calm, cold, sunny hour - a "good" day unless a test changes something. */
const NICE: Hour = { temp: -5, precip: 0, gust: 10, sun: 3600 };

/**
 * An Open-Meteo multi-point response (a list, one entry per requested point, unixtime stamps) from
 * local midnight `from` to local midnight after `to`. Members > 1 makes it an ensemble response:
 * control unsuffixed, then _member01...
 */
function response(from: string, to: string, fill: Fill = () => ({}), members = 1, points = 2 * cfg.resorts.length) {
  const times: number[] = [];
  for (let t = localMidnightMs(from, tz); t < localMidnightMs(addDays(to, 1), tz); t += HOUR_MS) times.push(t);
  return Array.from({ length: points }, (_, p) => {
    const hourly: Record<string, (number | null)[]> = { time: times.map((t) => t / 1000) };
    for (let m = 0; m < members; m++) {
      const s = m === 0 ? "" : `_member${String(m).padStart(2, "0")}`;
      const hours = times.map((t) => ({ ...NICE, ...fill(p, m, t) }));
      hourly[`temperature_2m${s}`] = hours.map((h) => h.temp);
      hourly[`precipitation${s}`] = hours.map((h) => h.precip);
      hourly[`wind_gusts_10m${s}`] = hours.map((h) => h.gust);
      hourly[`sunshine_duration${s}`] = hours.map((h) => h.sun);
    }
    return {
      latitude: 46.9,
      longitude: 13.9,
      elevation: 1500,
      hourly_units: { time: "unixtime", temperature_2m: "°C", precipitation: "mm", wind_gusts_10m: "km/h", sunshine_duration: "s" },
      hourly,
    };
  });
}

/** Judge resort 0 on DAY from a response built with `fill`. */
function judge(fill: Fill, from = addDays(DAY, -3)) {
  const points = parsePoints(response(from, DAY, fill), "test");
  const idx = new Map(points[0].timesMs.map((t, i) => [t, i] as const));
  return judgeDay(points[0].members[0], points[1].members[0], DAY, cfg, idx);
}

const at = (hour: number, date = DAY) => localTimeMs(date, hour, tz);
const TOP = 0;
const BASE = 1;

test("prvý lyžiarsky deň je dnes, kým lanovky bežia, potom zajtra", () => {
  assert.equal(firstSkiDate(at(15, DAY) + 59 * 60_000, cfg), DAY);
  assert.equal(firstSkiDate(at(cfg.liftCloseHour, DAY), cfg), addDays(DAY, 1));
  assert.equal(firstSkiDate(at(0, DAY), cfg), DAY);
  assert.deepEqual(horizonDates(cfg, "now", DAY), [DAY]);
  assert.equal(horizonDates(cfg, "short", DAY).length, 3);
  assert.equal(horizonDates(cfg, "long", DAY).length, 10);
});

test("každé stredisko má dva body, vrchol pred dolnou stanicou, v jednej požiadavke", () => {
  const pts = requestPoints(cfg);
  assert.equal(pts.length, 2 * cfg.resorts.length);
  cfg.resorts.forEach((r, i) => {
    assert.equal(pts[2 * i].resortId, r.id);
    assert.equal(pts[2 * i].role, "top");
    assert.equal(pts[2 * i + 1].role, "base");
    assert.ok(r.top.elevation > r.base.elevation, `${r.name}: vrchol musí byť vyššie ako dolná stanica`);
  });
  const url = new URL(horizonUrl(cfg, "short", DAY));
  assert.equal(url.searchParams.get("elevation"), pts.map((p) => p.elevation).join(","));
  assert.equal(url.searchParams.get("latitude")!.split(",").length, pts.length);
  assert.equal(url.searchParams.get("models"), cfg.horizons.short.model);
  assert.equal(url.searchParams.get("timeformat"), "unixtime");
  assert.match(horizonUrl(cfg, "long", DAY), /^https:\/\/ensemble-api\.open-meteo\.com\/v1\/ensemble\?/);
  assert.match(metaUrl(cfg, "long"), /^https:\/\/ensemble-api\.open-meteo\.com\/data\/ecmwf_ifs025_ensemble\//);
  assert.match(metaUrl(cfg, "now"), /^https:\/\/api\.open-meteo\.com\/data\/dwd_icon_d2\//);
});

test("deterministické horizonty siahajú 72 h pred otvorenie, ansámbel nie; všetky o deň za koniec", () => {
  // One day past the last shown day: end_date stops at 23:00, the closing midnight stamp is the next day's.
  assert.deepEqual(requestDates(cfg, "now", DAY), { startDate: addDays(DAY, -3), endDate: addDays(DAY, 1) });
  assert.deepEqual(requestDates(cfg, "short", DAY), { startDate: addDays(DAY, -3), endDate: addDays(DAY, 3) });
  assert.deepEqual(requestDates(cfg, "long", DAY), { startDate: DAY, endDate: addDays(DAY, 10) });
});

test("lyžiarsky deň sú značky 10:00 až 16:00; 9:00 a 17:00 sa nerátajú", () => {
  const rainAt = (h: number) => judge((p, _m, t) => (t === at(h) ? { temp: 5, precip: 5 } : {}));
  assert.equal(rainAt(cfg.liftOpenHour).status, "good");
  assert.equal(rainAt(cfg.liftOpenHour + 1).status, "bad");
  assert.equal(rainAt(cfg.liftCloseHour).status, "bad");
  assert.equal(rainAt(cfg.liftCloseHour + 1).status, "good");
});

test("dážď alebo sneh rozhoduje teplota stanice: presne 1 °C je ešte sneh", () => {
  const at1 = judge((p, _m, t) => (t === at(12) ? { temp: cfg.rules.snowMaxTempC, precip: 3 } : {}));
  assert.equal(at1.rainBaseMm, 0);
  assert.equal(at1.status, "good");
  const warmer = judge((p, _m, t) => (t === at(12) ? { temp: cfg.rules.snowMaxTempC + 0.1, precip: 3 } : {}));
  assert.equal(warmer.rainBaseMm, 3);
  assert.equal(warmer.status, "bad");
});

test("dážď dole: 1 mm je zlé, 0,2 mm ujde, 0,19 mm je dobré; vrchol sa spomenie, keď prší aj tam", () => {
  const rain = (mm: number, topToo = false) =>
    judge((p, _m, t) => (t === at(12) ? { temp: p === BASE || topToo ? 4 : -2, precip: mm } : {}));
  assert.equal(rain(cfg.rules.rainBadMm).status, "bad");
  assert.match(rain(cfg.rules.rainBadMm).reasons[0], /^dážď dole/);
  assert.match(rain(cfg.rules.rainBadMm, true).reasons[0], /^dážď aj na vrchole/);
  assert.equal(rain(cfg.rules.rainFairMm).status, "fair");
  assert.equal(rain(0.19).status, "good");
});

test("nárazy na vrchole: nad 60 km/h zlé, nad 40 ujde, presne na hranici nie", () => {
  const gust = (kmh: number) => judge((p, _m, t) => (p === TOP && t === at(13) ? { gust: kmh } : {}));
  assert.equal(gust(cfg.rules.gustBadKmh).status, "fair");
  assert.equal(gust(cfg.rules.gustBadKmh + 1).status, "bad");
  assert.equal(gust(cfg.rules.gustFairKmh).status, "good");
  assert.equal(gust(cfg.rules.gustFairKmh + 1).status, "fair");
  assert.equal(gust(cfg.rules.gustBadKmh + 1).maxGustKmh, cfg.rules.gustBadKmh + 1);
});

test("mäkký sneh: aspoň polovica hodín dole nad 3 °C; presne 3 °C sa neráta", () => {
  const warmHours = (n: number, temp = cfg.rules.softSnowTempC + 0.5) =>
    judge((p, _m, t) => (p === BASE && t > at(cfg.liftOpenHour) && t <= at(cfg.liftOpenHour + n) ? { temp } : {}));
  const liftHours = cfg.liftCloseHour - cfg.liftOpenHour;
  assert.equal(warmHours(Math.ceil(liftHours * cfg.rules.softSnowShare)).status, "fair");
  assert.equal(warmHours(Math.ceil(liftHours * cfg.rules.softSnowShare) - 1).status, "good");
  assert.equal(warmHours(liftHours, cfg.rules.softSnowTempC).status, "good");
});

test("menej ako hodina slnka je horšia viditeľnosť, nie zlý deň", () => {
  const sun = (seconds: number) => judge(() => ({ sun: seconds / (cfg.liftCloseHour - cfg.liftOpenHour) }));
  assert.equal(sun(3599).status, "fair");
  assert.equal(sun(3600).status, "good");
  assert.equal(sun(0).reasons.join(), "zamračené, horšia viditeľnosť");
});

test("čerstvý sneh: 72 h pred otvorením a počas dňa; prašan len pridá značku", () => {
  const snowAt = (ms: number, mm: number) => judge((p, _m, t) => (p === TOP && t === ms ? { precip: mm } : {}));
  const tenCm = cfg.rules.powderCm / cfg.rules.snowCmPerMm;
  const inside = snowAt(at(cfg.liftOpenHour) - 71 * HOUR_MS, tenCm);
  assert.equal(inside.freshSnowCm, cfg.rules.powderCm);
  assert.equal(inside.powder, true);
  assert.equal(inside.status, "good");
  assert.equal(snowAt(at(cfg.liftOpenHour) - 72 * HOUR_MS, tenCm).freshSnowCm, 0);
  assert.equal(snowAt(at(12), tenCm - 1).powder, false);
});

test("chýbajúca minulosť nechá čerstvý sneh prázdny, ale verdikt dňa vypočíta", () => {
  const v = judge(() => ({}), DAY);
  assert.equal(v.freshSnowCm, null);
  assert.equal(v.powder, false);
  assert.equal(v.status, "good");
});

test("chýbajúca hodnota počas prevádzky robí verdikt neznámym, nie lepším", () => {
  for (const field of ["temp", "precip", "gust", "sun"] as const) {
    const v = judge((p, _m, t) => (p === TOP && t === at(14) ? { [field]: null } : {}));
    assert.equal(v.status, null, field);
  }
  assert.equal(judge((p, _m, t) => (p === BASE && t === at(14) ? { precip: null } : {})).status, null);
  // A gap outside the lift hours changes nothing.
  assert.equal(judge((p, _m, t) => (p === TOP && t === at(20) ? { gust: null } : {})).status, "good");
});

test("ansámbel: percentá z očakávaného počtu členov, sneh ako p10-p50-p90", () => {
  const expected = cfg.horizons.long.expectedMembers;
  // Members 0-19 get a windy day (bad), 20-29 a breezy one (fair), the rest stay nice. Every member
  // m gets m tenths of a millimetre of snow at the top at 03:00.
  const fill: Fill = (p, m, t) => ({
    ...(p === TOP && t === at(13) ? { gust: m < 20 ? 80 : m < 30 ? 50 : 10 } : {}),
    ...(p === TOP && t === at(3) ? { precip: m / 10 } : {}),
  });
  const points = parsePoints(response(DAY, addDays(DAY, 1), fill, expected), "test");
  const day = summarizeEnsemble(points, cfg, [DAY])[0].days[0];
  assert.equal(day.reason, null);
  assert.equal(day.badPct, Math.round((100 * 20) / expected));
  assert.equal(day.fairPct, Math.round((100 * 10) / expected));
  assert.equal(day.goodPct, Math.round((100 * 21) / expected));
  const snows = Array.from({ length: expected }, (_, m) => (m / 10) * cfg.rules.snowCmPerMm).sort((a, b) => a - b);
  assert.deepEqual(day.snowCm, { p10: percentile(snows, 0.1), p50: percentile(snows, 0.5), p90: percentile(snows, 0.9) });
});

test("neúplný ansámbel ani člen s medzerou sa nevydávajú za celok", () => {
  const expected = cfg.horizons.long.expectedMembers;
  const short = parsePoints(response(DAY, DAY, () => ({}), expected - 1), "test");
  assert.equal(summarizeEnsemble(short, cfg, [DAY])[0].days[0].reason, "members");
  const gap = parsePoints(response(DAY, DAY, (p, m, t) => (m === 7 && t === at(12) ? { temp: null } : {}), expected), "test");
  const day = summarizeEnsemble(gap, cfg, [DAY])[0].days[0];
  assert.equal(day.reason, "horizon");
  assert.equal(day.goodPct, null);
});

test("odpoveď: zoznam aj jeden bod, jednotky sa overujú, chyba API sa hlási", () => {
  const list = response(DAY, DAY);
  assert.equal(parsePoints(list, "t").length, list.length);
  assert.equal(parsePoints(list[0], "t").length, 1);
  assert.deepEqual(parsePoints(list, "t")[0].members.map((m) => m.key), ["control"]);
  const ens = parsePoints(response(DAY, DAY, () => ({}), 3), "t")[0].members.map((m) => m.key);
  assert.deepEqual(ens, ["control", "member01", "member02"]);
  const bad = response(DAY, DAY);
  bad[0].hourly_units.wind_gusts_10m = "m/s";
  assert.throws(() => parsePoints(bad, "t"), /m\/s/);
  assert.throws(() => parsePoints({ error: true, reason: "Parameter X" }, "t"), /Parameter X/);
});

test("čas behu modelu: nový beh, kým siaha dosť ďaleko, inak predchádzajúci", () => {
  const meta = { last_run_initialisation_time: 1_000_000, data_end_time: 2_000_000, update_interval_seconds: 21_600 };
  assert.equal(resolveRun(meta, 2_000_000 * 1000), 1_000_000 * 1000);
  assert.equal(resolveRun(meta, 2_000_001 * 1000), (1_000_000 - 21_600) * 1000);
  assert.equal(resolveRun(null, 0), null);
  assert.equal(resolveRun({ last_run_initialisation_time: 1 }, 0), null);
});

test("snímka sa poskladá zo všetkých troch horizontov a sedí s konfiguráciou", () => {
  const fetchedAtMs = at(10);
  // Exactly the ranges the real requests ask for.
  const range = (key: "now" | "short" | "long") => requestDates(cfg, key, DAY);
  const responses = {
    now: { data: response(range("now").startDate, range("now").endDate), meta: null },
    short: { data: response(range("short").startDate, range("short").endDate), meta: null },
    long: { data: response(range("long").startDate, range("long").endDate, () => ({}), cfg.horizons.long.expectedMembers), meta: null },
  };
  const snap = buildSkiSnapshot(responses, cfg, fetchedAtMs);
  assert.equal(snap.firstDate, DAY);
  assert.deepEqual(snap.horizons.now.dates, [DAY]);
  for (const key of ["now", "short", "long"] as const) {
    const h = snap.horizons[key];
    assert.equal(h.resorts.length, cfg.resorts.length);
    assert.equal(h.dates.length, cfg.horizons[key].days);
    assert.deepEqual(h.resorts.map((r) => r.id), cfg.resorts.map((r) => r.id));
  }
  const nowDay = snap.horizons.now.resorts[0].days[0] as { status: string; freshSnowCm: number | null };
  assert.equal(nowDay.status, "good");
  assert.equal(nowDay.freshSnowCm, 0);
  const shortHourly = (snap.horizons.short.resorts[0] as { hourly: { timesMs: number[] } }).hourly;
  assert.equal(shortHourly.timesMs.length, 72);
  assert.equal(localDateOf(shortHourly.timesMs[0] - HOUR_MS, tz), DAY);
  const longDays = snap.horizons.long.resorts[0].days as { goodPct: number; snowCm: object | null }[];
  assert.equal(longDays[0].goodPct, 100);
  // The last shown day's whole-day snow needs the midnight stamp after it.
  assert.deepEqual(longDays[longDays.length - 1].snowCm, { p10: 0, p50: 0, p90: 0 });
});

test("ski-core.js sa dá vložiť do stránky: žiadne importy", () => {
  const src = readFileSync(fileURLToPath(new URL("./ski-core.js", import.meta.url)), "utf8");
  assert.doesNotMatch(src, /^\s*import\s/m);
  assert.doesNotMatch(src, /\brequire\(/);
});

test("strediská majú odkazy na snehovú správu a webkameru", () => {
  for (const r of cfg.resorts) {
    assert.match(r.links.snowReport, /^https:\/\//, r.name);
    assert.match(r.links.webcam, /^https:\/\//, r.name);
  }
});

// ---------------------------------------------------------------------------
// POWDER_SNEH
// ---------------------------------------------------------------------------

const IFS_LAW = cfg.powder.laws.ecmwf_ifs;

/** The short horizon's first resort on DAY from a response built with `fill`, run metadata optional. */
function shortDay(fill: Fill, meta: object | null = null, fetchedAtMs = at(10)) {
  const range = requestDates(cfg, "short", DAY);
  const points = parsePoints(response(range.startDate, range.endDate, fill), "test");
  const idx = new Map(points[0].timesMs.map((t, i) => [t, i] as const));
  const snap = buildSkiSnapshot({ now: { data: response(requestDates(cfg, "now", DAY).startDate, requestDates(cfg, "now", DAY).endDate, fill), meta: null }, short: { data: response(range.startDate, range.endDate, fill), meta }, long: { data: response(DAY, addDays(DAY, 10), fill, cfg.horizons.long.expectedMembers), meta: null } }, cfg, fetchedAtMs);
  void idx;
  return snap.horizons.short.resorts[0].days[0] as { powderSnow: { forecastCm: number; leadH: number; probability: number; medianCm: number; p90Cm: number } | null };
}

test("POWDER_SNEH: okno je D−1 09:00 → D 09:00 na vrchole, hranice presne", () => {
  const w = powderWindow(DAY, cfg);
  assert.equal(w.startMs, at(cfg.powder.windowHour, addDays(DAY, -1)));
  assert.equal(w.endMs, at(cfg.powder.windowHour, DAY));
  const snowAt = (ms: number) => shortDay((p, _m, t) => (p === TOP && t === ms ? { precip: 10 } : {})).powderSnow!.forecastCm;
  // Stamps are "preceding hour": the 09:00 stamp of D−1 belongs to 08:00-09:00 and is outside, 10:00 inside; 09:00 on D inside, 10:00 outside.
  assert.equal(snowAt(w.startMs), 0);
  assert.equal(snowAt(w.startMs + HOUR_MS), 7);
  assert.equal(snowAt(w.endMs), 7);
  assert.equal(snowAt(w.endMs + HOUR_MS), 0);
  // Rain (above 1 °C) is not snow, a gap makes the whole thing unknown.
  assert.equal(shortDay((p, _m, t) => (p === TOP && t === w.endMs ? { precip: 10, temp: 2 } : {})).powderSnow!.forecastCm, 0);
  assert.equal(shortDay((p, _m, t) => (p === TOP && t === w.endMs ? { precip: null } : {})).powderSnow, null);
});

test("POWDER_SNEH: pravdepodobnosť rastie s úhrnom, klesá s predstihom, zákon sa oreže na fitovaný rozsah", () => {
  const p23 = powderLawAt(IFS_LAW, 23);
  const prob = (x: number, p = p23) => powderProbAtLeast(x, cfg.powder.thresholdCm, p);
  assert.ok(prob(0) < 0.001, String(prob(0)));
  assert.ok(prob(5) < prob(10) && prob(10) < prob(20) && prob(20) < prob(30));
  // The numbers METODIKA §4.1 quotes for the IFS law.
  assert.ok(Math.abs(prob(20) - 0.54) < 0.02, String(prob(20)));
  assert.ok(Math.abs(prob(20, powderLawAt(IFS_LAW, 71)) - 0.41) < 0.02);
  assert.ok(Math.abs(prob(20, powderLawAt(IFS_LAW, 131)) - 0.27) < 0.02);
  assert.deepEqual(powderLawAt(IFS_LAW, 200), powderLawAt(IFS_LAW, IFS_LAW.maxLeadH));
  assert.deepEqual(powderLawAt(IFS_LAW, -3), powderLawAt(IFS_LAW, 0));
  // Median of a 20 cm forecast is near 20 cm a day ahead and lower five days ahead; p90 above the median.
  const med23 = powderQuantileCm(20, 0.5, p23);
  assert.ok(med23 > 14 && med23 < 22, String(med23));
  assert.ok(powderQuantileCm(20, 0.5, powderLawAt(IFS_LAW, 131)) < med23);
  assert.ok(powderQuantileCm(20, 0.9, p23) > med23);
  assert.equal(powderQuantileCm(0, 0.5, p23), 0);
});

test("POWDER_SNEH: predstih z času behu a oneskorenia zverejnenia, bez metadát z času načítania", () => {
  assert.equal(publishedAtMs(1_000 * HOUR_MS, 5_000 * HOUR_MS, 7), 1_007 * HOUR_MS);
  assert.equal(publishedAtMs(null, 5_000 * HOUR_MS, 7), 5_000 * HOUR_MS);
  const endMs = powderWindow(DAY, cfg).endMs;
  // A run initialised 30 h before the window end, published 7 h later: lead 23 h.
  const init = (endMs - 30 * HOUR_MS) / 1000;
  const meta = { last_run_initialisation_time: init, data_end_time: init + 240 * 3600, update_interval_seconds: 21_600 };
  const day = shortDay((p, _m, t) => (p === TOP && t === endMs ? { precip: 20 } : {}), meta);
  assert.equal(day.powderSnow!.leadH, 30 - cfg.powder.publishDelayH.ecmwf_ifs);
  assert.equal(day.powderSnow!.forecastCm, 14);
  // Without metadata the fetch time (10:00 on DAY, an hour after the window closed) stands in.
  assert.equal(shortDay(() => ({}), null, at(10)).powderSnow!.leadH, -1);
});

test("snímka v2: powderSnow na deterministických dňoch, ansámbel bez zákona, konfigurácia sedí s fitom", () => {
  const snap = snapshotFor();
  assert.equal(snap.version, 2);
  assert.equal(snap.horizons.short.powderLaw, "ecmwf_ifs");
  assert.equal(snap.horizons.now.powderLaw, "icon_d2");
  assert.equal(snap.horizons.long.powderLaw, null);
  for (const key of ["now", "short"] as const) {
    for (const r of snap.horizons[key].resorts) for (const d of r.days as { powderSnow: { probability: number } | null }[]) assert.ok(d.powderSnow && d.powderSnow.probability >= 0 && d.powderSnow.probability <= 1);
  }
  for (const d of snap.horizons.long.resorts[0].days as { powderSnow?: unknown }[]) assert.equal(d.powderSnow, undefined);
  const fitted = JSON.parse(readFileSync(join(REPO_ROOT, "data", "model", "powder-model.json"), "utf8"));
  assert.deepEqual(cfg.powder.laws.ecmwf_ifs, fitted.sources.ecmwf_ifs.law);
  assert.deepEqual(cfg.powder.laws.icon_d2, fitted.sources.icon_d2.law);
  assert.equal(cfg.powder.thresholdCm, fitted.event.thresholdCm);
  assert.equal(cfg.rules.snowMaxTempC, fitted.physics.phaseMidC);
  assert.equal(cfg.rules.snowCmPerMm, fitted.physics.slr0 / 10);
});

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

/** A whole snapshot as the generator would build it at 10:00 on DAY, every horizon from `fill`. */
function snapshotFor(fill: Fill = () => ({}), fetchedAtMs = at(10)) {
  const range = (key: "now" | "short" | "long") => requestDates(cfg, key, DAY);
  const data = (key: "now" | "short" | "long", members = 1) => response(range(key).startDate, range(key).endDate, fill, members);
  return buildSkiSnapshot(
    {
      now: { data: data("now"), meta: null },
      short: { data: data("short"), meta: null },
      long: { data: data("long", cfg.horizons.long.expectedMembers), meta: null },
    },
    cfg,
    fetchedAtMs
  );
}

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

/** Only the rendered content - the page also inlines the client code, whose source contains the
 * very class names a whole-page regex would count. */
function mainOf(html: string): string {
  return html.match(/<main id="sk-main">([\s\S]*?)<\/main>/)![1];
}

test("stránka: tri časti, štyri karty, odkazy len na strediská a zdroj dát", () => {
  const page = renderSkiPage(snapshotFor());
  const html = mainOf(page);
  assert.equal([...html.matchAll(/class="sk-section"/g)].length, 3);
  assert.equal([...html.matchAll(/class="sk-card"/g)].length, cfg.resorts.length);
  assert.equal([...html.matchAll(/class="sk-hourly"/g)].length, cfg.resorts.length);
  assert.equal([...html.matchAll(/<tr><th scope="row">/g)].length, cfg.horizons.short.days + cfg.horizons.long.days);
  const allowed = new Set(["https://open-meteo.com/", ...cfg.resorts.flatMap((r) => [r.links.snowReport, r.links.webcam])]);
  const markup = page.replace(/<script type="module">[\s\S]*?<\/script>/, "");
  const hrefs = [...markup.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  for (const href of hrefs) assert.ok(allowed.has(href), `neočakávaný odkaz ${href}`);
  for (const r of cfg.resorts) {
    assert.ok(hrefs.includes(r.links.snowReport), `${r.name}: snehová správa`);
    assert.ok(hrefs.includes(r.links.webcam), `${r.name}: webkamera`);
  }
});

test("vložená snímka sa dá prečítať späť a vložený kód je bez import/export", () => {
  const snap = snapshotFor();
  const html = renderSkiPage(snap);
  const json = html.match(/<script type="application\/json" id="sk-snapshot">([\s\S]*?)<\/script>/)![1];
  assert.deepEqual(JSON.parse(json), JSON.parse(JSON.stringify(snap)));
  assert.doesNotMatch(clientBundle(), /^\s*(import|export)\s/m);
});

test("rovnaká snímka dá bajt po bajte rovnakú stránku; čas načítania je s dátumom", () => {
  const snap = snapshotFor();
  assert.equal(renderSkiPage(snap), renderSkiPage(snap));
  assert.match(renderSkiPage(snap), /id="sk-meta">Načítané 15\.\u00a01\. 10:00/);
  assert.match(clientRender().renderMetaText(snap, at(12)), /Načítané dnes 10:00/);
});

test("neznámy deň je nedostatok dát, prašan sa ukáže a staré dáta sa priznajú", () => {
  const render = clientRender();
  const gap = snapshotFor((p, _m, t) => (p === TOP && t === at(12) ? { gust: null } : {}));
  assert.match(render.renderSki(gap, at(10)), /Nedostatok dát/);
  const powder = snapshotFor((p, _m, t) => (p === TOP && t === at(3) ? { precip: 20 } : {}));
  assert.match(render.renderSki(powder, at(10)), /14\u00a0cm · prašan/);
  const fresh = render.renderSki(snapshotFor(), at(10));
  assert.doesNotMatch(fresh, /staršie/);
  assert.match(render.renderSki(snapshotFor(), at(10, addDays(DAY, 1))), /staršie/);
});

test("medzera v hodinových dátach preruší čiaru grafu, nespojí ju", () => {
  const snap = snapshotFor((p, _m, t) => (p === TOP && t === at(3, addDays(DAY, 1)) ? { temp: null } : {}));
  const html = clientRender().renderSki(snap, at(10));
  const firstTop = html.match(/<path class="sk-line sk-top" d="([^"]+)"/)![1];
  assert.equal(firstTop.split("M").length - 1, 2);
});

function runSkiCli(env: Record<string, string>): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, ["--import", "tsx", "src/ski.ts"], {
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
    encoding: "utf8",
    timeout: 60_000,
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

test("generátor renderuje z uloženej snímky bez siete, len do scratch adresára", () => {
  const dir = mkdtempSync(join(tmpdir(), "ztlzdrf-ski-"));
  mkdirSync(join(dir, "data"));
  writeFileSync(join(dir, "data", "ski.json"), `${JSON.stringify(snapshotFor())}\n`);
  const env = { SKI_DOCS_DIR: dir, SKI_RENDER_ONLY: "true" };
  const first = runSkiCli(env);
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /nič sa nesťahuje/);
  assert.match(first.stdout, /index\.html aktualizovaná/);
  assert.equal([...mainOf(readFileSync(join(dir, "index.html"), "utf8")).matchAll(/class="sk-card"/g)].length, cfg.resorts.length);
  const second = runSkiCli(env);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /index\.html bez zmeny/, "rovnaké dáta nesmú robiť zmenu v gite");
});

test("snímka iného tvaru sa nepoužije", () => {
  const dir = mkdtempSync(join(tmpdir(), "ztlzdrf-ski-"));
  const path = join(dir, "ski.json");
  writeFileSync(path, JSON.stringify({ ...snapshotFor(), version: 0 }));
  assert.equal(readSnapshot(path), null);
  writeFileSync(path, JSON.stringify(snapshotFor()));
  assert.notEqual(readSnapshot(path), null);
  const bad = mkdtempSync(join(tmpdir(), "ztlzdrf-ski-"));
  const r = runSkiCli({ SKI_DOCS_DIR: bad, SKI_RENDER_ONLY: "true" });
  assert.notEqual(r.status, 0, "bez snímky nemá generátor čo vymyslieť");
});
