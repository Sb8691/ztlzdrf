import { test } from "node:test";
import assert from "node:assert/strict";
import { OUTLOOK } from "./config.js";
import { addDays, daysBetween, formatRunTick, isIsoDate, localDateOf, localMidnightMs, toLocalWallClock } from "./time.js";
import { effectiveRunAt, responseToMemberPoints, type EnsembleResponse } from "./openmeteo.js";
import {
  buildDigest,
  consensusHourly,
  dayStatus,
  emptyHistory,
  evaluateMemberDays,
  evaluateMemberHours,
  medianSeries,
  mergeHistory,
  quantile,
  quantiles,
  resolveOutlookWindow,
  summarizeDay,
  sunTimesFor,
  trendFor,
  windowDates,
  type MemberDayStats,
} from "./outlook-core.js";
import { buildEvolutionPanels, renderOutlookHtml, renderOutlookPng } from "./outlook-dashboard.js";
import type { HourEvaluation, OutlookDaySummary, OutlookHistory, OutlookRunEntry, WeatherPoint } from "./types.js";

const TZ = "Europe/Vienna";
const HOUR = 3600_000;
/** 2026-10-01T00:00 Europe/Vienna (CEST) = 2026-09-30T22:00Z. */
const DAY1 = 1790805600000;
const WINDOW = { start: "2026-10-01", end: "2026-10-04" };

interface PointOverrides {
  precipitationMm?: number | null;
  temperatureC?: number | null;
  humidityPct?: number | null;
  dewPointC?: number | null;
  windSpeedKmh?: number | null;
}

/** Ideal painting weather unless overridden - mirrors painting.test.ts's fixture. */
function mkPoint(ms: number, o: PointOverrides = {}): WeatherPoint {
  return {
    time: toLocalWallClock(ms, TZ),
    ms,
    precipitationMm: o.precipitationMm === undefined ? 0 : o.precipitationMm,
    temperatureC: o.temperatureC === undefined ? 22 : o.temperatureC,
    humidityPct: o.humidityPct === undefined ? 55 : o.humidityPct,
    dewPointC: o.dewPointC === undefined ? 15 : o.dewPointC,
    windSpeedKmh: o.windSpeedKmh === undefined ? 10 : o.windSpeedKmh,
    windGustKmh: null,
    radiationWm2: 400,
    precipEnsemble: null,
  };
}

function idealSeries(startMs: number, hours: number, override: (ms: number) => PointOverrides = () => ({})): WeatherPoint[] {
  const points: WeatherPoint[] = [];
  for (let i = 0; i < hours; i++) points.push(mkPoint(startMs + i * HOUR, override(startMs + i * HOUR)));
  return points;
}

/** 30 Sep 00:00 .. 5 Oct 23:00 local - the padded fetch range of the real run. */
function paddedSeries(override?: (ms: number) => PointOverrides): WeatherPoint[] {
  return idealSeries(DAY1 - 24 * HOUR, 6 * 24, override);
}

test("time helpers pin the local-midnight boundary of the window", () => {
  assert.equal(toLocalWallClock(DAY1, TZ), "2026-10-01T00:00");
  assert.equal(localDateOf(DAY1 - 1, TZ), "2026-09-30");
  assert.equal(localMidnightMs("2026-10-01", TZ), DAY1);
  assert.equal(localMidnightMs("2026-11-01", TZ), Date.UTC(2026, 9, 31, 23)); // CET after the DST change on 25 Oct
  assert.equal(addDays("2026-09-30", 1), "2026-10-01");
  assert.equal(addDays("2026-10-01", -1), "2026-09-30");
  assert.equal(daysBetween("2026-10-01", "2026-10-04"), 3);
  assert.equal(isIsoDate("2026-02-30"), false);
  assert.equal(isIsoDate("2026-10-01"), true);
  assert.equal(formatRunTick(Date.UTC(2026, 8, 22, 0)), "22.9.");
  assert.equal(formatRunTick(Date.UTC(2026, 8, 22, 12)), "22.9. 12Z");
});

test("resolveOutlookWindow honours env overrides and rejects nonsense", () => {
  assert.deepEqual(resolveOutlookWindow(OUTLOOK, {}), OUTLOOK.window);
  assert.deepEqual(resolveOutlookWindow(OUTLOOK, { OUTLOOK_START: "2026-10-10", OUTLOOK_END: "2026-10-12" }), { start: "2026-10-10", end: "2026-10-12" });
  assert.throws(() => resolveOutlookWindow(OUTLOOK, { OUTLOOK_START: "10.10.2026" }));
  assert.throws(() => resolveOutlookWindow(OUTLOOK, { OUTLOOK_START: "2026-10-05", OUTLOOK_END: "2026-10-04" }));
  assert.deepEqual(windowDates(WINDOW), ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
});

test("responseToMemberPoints: control + members, unixtime → ms/local label, all-null member dropped", () => {
  const t0 = DAY1 / 1000;
  const res: EnsembleResponse = {
    latitude: 46.75,
    longitude: 14,
    elevation: 1055,
    utc_offset_seconds: 7200,
    hourly_units: {},
    hourly: {
      time: [t0, t0 + 3600, t0 + 7200],
      precipitation: [0, 0.5, null],
      precipitation_member01: [0, 0, 0],
      precipitation_member02: [null, null, null],
      temperature_2m: [10, 12, 14],
      temperature_2m_member01: [11, 13, 15],
      temperature_2m_member02: [null, null, null],
      relative_humidity_2m: [80, 70, 60],
      relative_humidity_2m_member01: [80, 70, 60],
      relative_humidity_2m_member02: [null, null, null],
      wind_speed_10m: [5, 6, 7],
      wind_speed_10m_member01: [5, 6, 7],
      wind_speed_10m_member02: [null, null, null],
      wind_gusts_10m: [null, null, null],
      wind_gusts_10m_member01: [null, null, null],
      wind_gusts_10m_member02: [null, null, null],
      shortwave_radiation: [0, 100, 200],
      shortwave_radiation_member01: [0, 100, 200],
      shortwave_radiation_member02: [null, null, null],
    } as EnsembleResponse["hourly"],
  };
  const members = responseToMemberPoints(res, TZ);
  assert.equal(members.length, 2);
  assert.equal(members[0][0].ms, DAY1);
  assert.equal(members[0][0].time, "2026-10-01T00:00");
  assert.equal(members[0][1].precipitationMm, 0.5);
  assert.equal(members[0][2].precipitationMm, null);
  assert.equal(members[1][0].temperatureC, 11);
  assert.equal(members[0][0].windGustKmh, null);
  // No dew_point column in the response -> Magnus from T/RH (10 °C, 80 % -> ~6.7 °C).
  assert.ok(Math.abs((members[0][0].dewPointC as number) - 6.7) < 0.3);
});

test("effectiveRunAt attributes a short 06z/18z cycle to the previous long run", () => {
  const windowEndMs = localMidnightMs("2026-10-05", TZ);
  const short = { initAtMs: Date.UTC(2026, 8, 22, 6), availableAtMs: 0, dataEndMs: Date.UTC(2026, 8, 28, 9), updateIntervalS: 21600 };
  assert.deepEqual(effectiveRunAt(short, windowEndMs, 0), { runAtMs: Date.UTC(2026, 8, 22, 0), source: "meta" });
  const long = { ...short, initAtMs: Date.UTC(2026, 8, 22, 0), dataEndMs: Date.UTC(2026, 9, 7, 0) };
  assert.deepEqual(effectiveRunAt(long, windowEndMs, 0), { runAtMs: Date.UTC(2026, 8, 22, 0), source: "meta" });
  const fetched = Date.UTC(2026, 8, 22, 11, 17);
  assert.deepEqual(effectiveRunAt(null, windowEndMs, fetched), { runAtMs: Date.UTC(2026, 8, 22, 11), source: "fetch" });
});

test("evaluateMemberDays: ideal member day is paintable with a daylight-long GOOD run", () => {
  const points = paddedSeries();
  const hourly = evaluateMemberHours(points, sunTimesFor(points));
  const [day] = evaluateMemberDays(points, hourly, ["2026-10-01"], OUTLOOK.minGoodHours);
  assert.equal(day.complete, true);
  assert.equal(day.paintable, true);
  assert.ok(day.longestGoodRunH >= 9 && day.longestGoodRunH <= 13, `unexpected GOOD run ${day.longestGoodRunH}`);
  assert.equal(day.precipMm, 0);
  assert.equal(day.tMax, 22);
  assert.equal(day.rhMin, 55);
});

test("evaluateMemberDays: afternoon rain kills the GOOD run but leaves a MARGINAL 'possible' day", () => {
  const rainMs = DAY1 + 14 * HOUR;
  const points = paddedSeries((ms) => (ms === rainMs ? { precipitationMm: 2 } : {}));
  const hourly = evaluateMemberHours(points, sunTimesFor(points));
  const [day] = evaluateMemberDays(points, hourly, ["2026-10-01"], OUTLOOK.minGoodHours);
  assert.equal(day.longestGoodRunH, 0);
  assert.equal(day.paintable, false);
  assert.equal(day.possible, true); // 15:00-18:00 are MARGINAL (recent rain) -> 4 h non-BAD
  assert.equal(day.precipMm, 2);
});

test("evaluateMemberDays: a cool day (12 °C) is possible but not paintable; missing hours make it incomplete", () => {
  const cool = paddedSeries(() => ({ temperatureC: 12, dewPointC: 5 }));
  const hourlyCool = evaluateMemberHours(cool, sunTimesFor(cool));
  const [coolDay] = evaluateMemberDays(cool, hourlyCool, ["2026-10-01"], OUTLOOK.minGoodHours);
  assert.equal(coolDay.paintable, false);
  assert.equal(coolDay.possible, true);

  const gappy = paddedSeries().filter((p) => !(p.time.startsWith("2026-10-02") && Number(p.time.slice(11, 13)) >= 12));
  const hourlyGappy = evaluateMemberHours(gappy, sunTimesFor(gappy));
  const days = evaluateMemberDays(gappy, hourlyGappy, ["2026-10-01", "2026-10-02"], OUTLOOK.minGoodHours);
  assert.equal(days[0].complete, true);
  assert.equal(days[1].complete, false);
});

test("quantile / quantiles interpolate linearly and handle degenerate input", () => {
  const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.equal(quantile(sorted, 0.5), 5.5);
  assert.ok(Math.abs(quantile(sorted, 0.1) - 1.9) < 1e-9);
  assert.ok(Math.abs(quantile(sorted, 0.9) - 9.1) < 1e-9);
  assert.deepEqual(quantiles([3]), { p10: 3, p25: 3, p50: 3, p75: 3, p90: 3 });
  assert.equal(quantiles([]), null);
});

function stats(o: Partial<MemberDayStats>): MemberDayStats {
  return {
    date: "2026-10-01",
    complete: true,
    goodHours: 0,
    longestGoodRunH: 0,
    longestOkRunH: 0,
    precipMm: 0,
    tMax: 15,
    tMin: 5,
    rhMin: 60,
    windMax: 10,
    paintable: false,
    possible: false,
    ...o,
  };
}

test("summarizeDay: member shares, rain share and quantiles; incomplete members excluded", () => {
  const members = [
    stats({ longestGoodRunH: 6, paintable: true, possible: true, precipMm: 0 }),
    stats({ longestGoodRunH: 3, possible: true, precipMm: 2 }),
    stats({ longestGoodRunH: 5, paintable: true, possible: true, precipMm: 0.5 }),
    stats({ longestGoodRunH: 0, precipMm: 0 }),
    stats({ complete: false, paintable: true }),
  ];
  const day = summarizeDay("2026-10-01", members, OUTLOOK.rainDayThresholdMm)!;
  assert.equal(day.n, 4);
  assert.equal(day.pPaintable, 0.5);
  assert.equal(day.pPossible, 0.75);
  assert.equal(day.pRain, 0.25);
  assert.equal(day.goodRun.p50, 4);
  assert.equal(day.precip.p90, 1.6); // 1.55 interpolated, stored at 1 dp
  assert.equal(summarizeDay("2026-10-02", members, 1), null);
});

test("consensusHourly turns member shares into a status series the strip can draw", () => {
  const h = (status: HourEvaluation["status"], isDaylight = true): HourEvaluation => ({ ms: DAY1, status, isDaylight, reasons: [] });
  const members: HourEvaluation[][] = [
    [h("GOOD"), h("GOOD"), h("BAD"), h("BAD", false)],
    [h("GOOD"), h("MARGINAL"), h("MARGINAL"), h("BAD", false)],
    [h("GOOD"), h("BAD"), h("BAD"), h("BAD", false)],
  ];
  const consensus = consensusHourly(members, OUTLOOK.hourConsensus);
  assert.deepEqual(
    consensus.map((c) => c.status),
    ["GOOD", "MARGINAL", "MARGINAL", "BAD"]
  );
  assert.equal(consensus[3].isDaylight, false);
  assert.equal(consensusHourly([], OUTLOOK.hourConsensus).length, 0);
});

test("medianSeries: medians per hour, precipitation as mean with p10/p50/p90 attached", () => {
  const members = [
    idealSeries(DAY1, 2, () => ({ temperatureC: 10, precipitationMm: 0 })),
    idealSeries(DAY1, 2, () => ({ temperatureC: 12, precipitationMm: 0 })),
    idealSeries(DAY1, 2, () => ({ temperatureC: 20, precipitationMm: 3 })),
  ];
  const median = medianSeries(members);
  assert.equal(median.length, 2);
  assert.equal(median[0].temperatureC, 12);
  assert.equal(median[0].precipitationMm, 1);
  assert.deepEqual(median[0].precipEnsemble, { p10: 0, p50: 0, p90: 2.4 });
  assert.equal(median[0].time, "2026-10-01T00:00");
});

test("dayStatus thresholds", () => {
  const cfg = OUTLOOK.dayStatus;
  assert.equal(dayStatus({ pPaintable: 0.6, pPossible: 0.9 }, cfg), "GOOD");
  assert.equal(dayStatus({ pPaintable: 0.3, pPossible: 0.5 }, cfg), "MARGINAL");
  assert.equal(dayStatus({ pPaintable: 0.1, pPossible: 0.7 }, cfg), "MARGINAL");
  assert.equal(dayStatus({ pPaintable: 0.1, pPossible: 0.5 }, cfg), "BAD");
});

function daySummary(date: string, pPaintable: number, extra: Partial<OutlookDaySummary> = {}): OutlookDaySummary {
  const q = (v: number) => ({ p10: v - 1, p25: v - 0.5, p50: v, p75: v + 0.5, p90: v + 1 });
  return {
    date,
    n: 51,
    pPaintable,
    pPossible: Math.min(1, pPaintable + 0.2),
    pRain: 0.3,
    precip: { p10: 0, p25: 0, p50: 0.2, p75: 1, p90: 4 },
    tMax: q(16),
    tMin: q(6),
    goodRun: q(4),
    rhMin: q(60),
    windMax: q(12),
    ...extra,
  };
}

function mkRun(model: string, runAt: string, p: Record<string, number>): OutlookRunEntry {
  return {
    model,
    runAt,
    runAtSource: "meta",
    fetchedAt: runAt,
    members: 51,
    grid: null,
    days: Object.entries(p).map(([date, v]) => daySummary(date, v)),
  };
}

const R0 = "2026-09-22T00:00:00.000Z";
const R1 = "2026-09-22T12:00:00.000Z";
const R2 = "2026-09-23T00:00:00.000Z";

function syntheticHistory(): OutlookHistory {
  const base = emptyHistory(OUTLOOK, WINDOW);
  return mergeHistory(base, [
    mkRun("ecmwf_ifs025", R0, { "2026-10-01": 0.3, "2026-10-02": 0.5, "2026-10-03": 0.2, "2026-10-04": 0.1 }),
    mkRun("ecmwf_ifs025", R1, { "2026-10-01": 0.4, "2026-10-02": 0.45, "2026-10-03": 0.25, "2026-10-04": 0.15 }),
    mkRun("ecmwf_ifs025", R2, { "2026-10-01": 0.65, "2026-10-02": 0.4, "2026-10-03": 0.3, "2026-10-04": 0.1 }),
    mkRun("gfs05", "2026-09-22T06:00:00.000Z", { "2026-10-01": 0.2, "2026-10-02": 0.6, "2026-10-03": 0.2, "2026-10-04": 0.2 }),
    mkRun("gfs05", "2026-09-23T06:00:00.000Z", { "2026-10-01": 0.5, "2026-10-02": 0.6, "2026-10-03": 0.2, "2026-10-04": 0.2 }),
  ]).history;
}

test("mergeHistory: dedupes by (model, run), skips content-identical repeats, sorts, stays idempotent", () => {
  const history = syntheticHistory();
  assert.equal(history.runs.length, 5);
  assert.deepEqual(
    history.runs.map((r) => r.runAt),
    [R0, "2026-09-22T06:00:00.000Z", R1, R2, "2026-09-23T06:00:00.000Z"]
  );
  const again = mergeHistory(history, [mkRun("ecmwf_ifs025", R2, { "2026-10-01": 0.65 })]);
  assert.equal(again.added, 0);
  // A "run" labelled by fetch time with numbers identical to the newest stored run is noise, not a new run.
  const repeat = { ...history.runs.find((r) => r.runAt === R2)!, runAt: "2026-09-23T11:00:00.000Z", runAtSource: "fetch" as const };
  assert.equal(mergeHistory(history, [repeat]).added, 0);
  const fresh = mergeHistory(history, [mkRun("ecmwf_ifs025", "2026-09-23T12:00:00.000Z", { "2026-10-01": 0.7 })]);
  assert.equal(fresh.added, 1);
  assert.equal(history.runs.length, 5, "input history must not be mutated");
});

test("trendFor compares with the newest run at least 24 h older", () => {
  const history = syntheticHistory();
  const trend = trendFor(history, "ecmwf_ifs025", "2026-10-01", R2, OUTLOOK.trend)!;
  assert.equal(trend.vsRunAt, R0);
  assert.equal(trend.deltaPct, 35);
  assert.equal(trend.direction, "up");
  assert.equal(trendFor(history, "ecmwf_ifs025", "2026-10-01", R1, OUTLOOK.trend), null); // only 12 h of history behind R1
  assert.equal(trendFor(history, "ecmwf_ifs025", "2026-10-03", R2, OUTLOOK.trend)!.direction, "up"); // +10 p. b. is exactly the threshold
  assert.equal(trendFor(history, "ecmwf_ifs025", "2026-10-04", R2, OUTLOOK.trend)!.direction, "flat");
  assert.equal(trendFor(history, "ecmwf_ifs025", "2026-10-02", R2, OUTLOOK.trend)!.direction, "down");
});

test("buildDigest: verdicts, model agreement and null once the window is over", () => {
  const history = syntheticHistory();
  const now = Date.UTC(2026, 8, 23, 8);
  const digest = buildDigest(history, OUTLOOK, now)!;
  assert.equal(digest.latestRunAt, R2);
  assert.equal(digest.runCount, 3);
  assert.equal(digest.days.length, 4);
  assert.equal(digest.days[0].status, "GOOD");
  assert.equal(digest.days[0].trend?.deltaPct, 35);
  assert.deepEqual(
    digest.days[0].byModel.map((m) => [m.model, m.pPaintable]),
    [
      ["ecmwf_ifs025", 0.65],
      ["gfs05", 0.5],
    ]
  );
  assert.equal(digest.days[3].status, "BAD");
  assert.equal(buildDigest(history, OUTLOOK, Date.UTC(2026, 9, 5, 12)), null);
  assert.equal(buildDigest(emptyHistory(OUTLOOK, WINDOW), OUTLOOK, now), null);
});

test("outlook page and PNG render from a synthetic history", () => {
  const history = syntheticHistory();
  const now = new Date(Date.UTC(2026, 8, 23, 8));
  const panels = buildEvolutionPanels(history, OUTLOOK, { interactive: true });
  assert.equal(panels.length, 4);
  assert.equal(panels[0].chart.script.includes('CHART_DATA["evo-2026-10-01"]'), true);
  assert.equal((panels[0].chart.svg.match(/<circle /g) ?? []).length, 3 * 3 + 2); // 3 primary series × 3 runs + GEFS × 2 runs

  const digest = buildDigest(history, OUTLOOK, now.getTime());
  const html = renderOutlookHtml(history, digest, null, now, OUTLOOK);
  for (const date of windowDates(WINDOW)) assert.ok(html.includes(`data-chart="evo-${date}"`), `missing panel for ${date}`);
  assert.ok(html.includes("Pravdepodobne áno"));
  assert.ok(html.includes("GEFS"));
  assert.ok(html.includes("<table class=\"data-table\">"));

  const png = renderOutlookPng(history, OUTLOOK)!;
  assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);

  const empty = renderOutlookHtml(emptyHistory(OUTLOOK, WINDOW), null, null, now, OUTLOOK);
  assert.ok(empty.includes("zatiaľ nie je k dispozícii"));
  assert.equal(renderOutlookPng(emptyHistory(OUTLOOK, WINDOW), OUTLOOK), null);
});
