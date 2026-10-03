import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SKI_CONFIG } from "./config.js";
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
  assert.match(metaUrl(cfg, "now"), /^https:\/\/api\.open-meteo\.com\/data\/geosphere_arome_austria\//);
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
