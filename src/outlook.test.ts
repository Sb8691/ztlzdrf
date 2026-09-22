import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { OUTLOOK } from "./config.js";
import { addDays, daysBetween, formatDayLabelLong, formatRunTick, formatShortDate, isIsoDate, localDateOf, localMidnightMs, toLocalWallClock } from "./time.js";
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
  snapshotsFor,
  summarizeDay,
  sunTimesFor,
  trendFor,
  windowDates,
  type MemberDayStats,
} from "./outlook-core.js";
import { chanceOf10, horizonWords, plainDay, trendWords, weatherWords } from "./outlook-plain.js";
import { PALETTE, buildChanceSparkline } from "./charts.js";
import { buildEvolutionPanels, renderOutlookHtml, renderOutlookPng } from "./outlook-dashboard.js";
import type { HourEvaluation, OutlookDaySummary, OutlookDigestDay, OutlookHistory, OutlookRunEntry, WeatherPoint } from "./types.js";

/** Words the plain layer must never use - they belong to the technical details only. */
const PLAIN_BANNED = ["beh", "p50", "p90", "ensembl", "UTC", "p. b.", "%", "členov", "GOOD", "ECMWF", "GEFS", "ICON", "AIFS"];
/** Non-breaking space the plain layer puts between a number and its unit / "z 10". */
const NB = " ";
const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

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
  assert.equal(formatDayLabelLong("2026-10-01"), "štvrtok 1.10.");
  assert.equal(formatDayLabelLong("2026-10-04"), "nedeľa 4.10.");
  assert.equal(formatShortDate("2026-09-22"), "22.9.");
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

function mkRun(model: string, runAt: string, p: Record<string, number>, fetchedAt = runAt): OutlookRunEntry {
  return {
    model,
    runAt,
    runAtSource: "meta",
    fetchedAt,
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
  assert.equal(digest.today, "2026-09-23");
  assert.equal(digest.days.length, 4);
  assert.equal(digest.days[0].status, "GOOD");
  assert.equal(digest.days[0].past, false);
  assert.equal(digest.days[0].trend?.deltaPct, 35);
  assert.equal(digest.days[0].rhMinP50, 60);
  assert.equal(digest.days[0].windMaxP50, 12);
  assert.deepEqual(
    digest.days[0].byModel.map((m) => [m.model, m.pPaintable]),
    [
      ["ecmwf_ifs025", 0.65],
      ["gfs05", 0.5],
    ]
  );
  assert.equal(digest.days[3].status, "BAD");
  // A day behind "today" is flagged, never shown as a forecast.
  const later = buildDigest(history, OUTLOOK, Date.UTC(2026, 9, 2, 8))!;
  assert.deepEqual(later.days.map((d) => d.past), [true, false, false, false]);
  assert.equal(buildDigest(history, OUTLOOK, Date.UTC(2026, 9, 5, 12)), null);
  assert.equal(buildDigest(emptyHistory(OUTLOOK, WINDOW), OUTLOOK, now), null);
});

test("snapshotsFor: what the card showed at the end of each local day", () => {
  const history = syntheticHistory();
  // 22.9. ends with R1 (12Z) on the card, 23.9. (today, 08Z) already shows R2.
  const snaps = snapshotsFor(history, OUTLOOK, "2026-10-01", Date.UTC(2026, 8, 23, 8));
  assert.deepEqual(
    snaps.map((s) => [s.date, s.status, s.pPaintable, s.model]),
    [
      ["2026-09-22", "MARGINAL", 0.4, "ecmwf_ifs025"],
      ["2026-09-23", "GOOD", 0.65, "ecmwf_ifs025"],
    ]
  );
  assert.deepEqual(
    snapshotsFor(history, OUTLOOK, "2026-10-04", Date.UTC(2026, 8, 23, 8)).map((s) => s.status),
    ["BAD", "BAD"]
  );
  // "Today" is always the newest stored run (what the card shows via latestRunFor), whatever its
  // fetchedAt says - outlook.ts stores runs stamped later than the instant it captured as "now".
  // (A real history never holds a run fetched after "now"; the fixture does, hence 0.65 = R2.)
  assert.deepEqual(
    snapshotsFor(history, OUTLOOK, "2026-10-01", Date.UTC(2026, 8, 22, 6)).map((s) => [s.date, s.pPaintable]),
    [["2026-09-22", 0.65]]
  );
  const justFetched = mergeHistory(history, [mkRun("ecmwf_ifs025", "2026-09-23T12:00:00.000Z", { "2026-10-01": 0.72 }, "2026-09-23T23:13:20.000Z")]).history;
  const nowBeforeStamp = Date.UTC(2026, 8, 23, 23, 13, 19);
  const digest = buildDigest(justFetched, OUTLOOK, nowBeforeStamp)!;
  assert.equal(digest.days[0].snapshots.at(-1)?.pPaintable, digest.days[0].pPaintable);

  // CI timing: the 00z run lands at 11:13Z, the 12z run at 23:13Z = 01:13 local the next day, so the
  // day's last point must show the 00z run and the 12z run belongs to the following day.
  const ci = mergeHistory(emptyHistory(OUTLOOK, WINDOW), [
    mkRun("ecmwf_ifs025", R0, { "2026-10-01": 0.3 }, "2026-09-22T11:13:00.000Z"),
    mkRun("ecmwf_ifs025", R1, { "2026-10-01": 0.65 }, "2026-09-22T23:13:00.000Z"),
  ]).history;
  assert.deepEqual(
    snapshotsFor(ci, OUTLOOK, "2026-10-01", Date.UTC(2026, 8, 23, 8)).map((s) => [s.date, s.pPaintable]),
    [
      ["2026-09-22", 0.3],
      ["2026-09-23", 0.65],
    ]
  );
  // Later that morning the 00z run is stored and takes over today's point.
  const ciNext = mergeHistory(ci, [mkRun("ecmwf_ifs025", R2, { "2026-10-01": 0.5 }, "2026-09-23T11:13:00.000Z")]).history;
  assert.deepEqual(
    snapshotsFor(ciNext, OUTLOOK, "2026-10-01", Date.UTC(2026, 8, 23, 12)).map((s) => s.pPaintable),
    [0.3, 0.5]
  );
  assert.deepEqual(snapshotsFor(emptyHistory(OUTLOOK, WINDOW), OUTLOOK, "2026-10-01", Date.UTC(2026, 8, 23, 8)), []);
});

function digestDay(o: Partial<OutlookDigestDay> = {}): OutlookDigestDay {
  return {
    date: "2026-10-01",
    past: false,
    status: "GOOD",
    pPaintable: 0.627,
    pPossible: 0.745,
    pRain: 0.235,
    precipP50: 0,
    precipP90: 6.9,
    tMaxP50: 18.3,
    tMinP50: 11,
    goodRunP50: 4,
    rhMinP50: 57,
    windMaxP50: 6,
    trend: null,
    snapshots: [],
    byModel: [],
    ...o,
  };
}

test("plainDay: the mother-readable mapping of a day", () => {
  const day = plainDay(digestDay(), OUTLOOK);
  assert.equal(day.dayLabel, "štvrtok 1.10.");
  assert.equal(day.verdict, "Pravdepodobne áno");
  assert.equal(day.icon, "🟢");
  assert.equal(day.glyph, "sun");
  assert.equal(day.weather, "sucho");
  assert.equal(day.temp, `cez deň okolo 18${NB}°C`);
  assert.equal(day.chance, `áno v 6${NB}z${NB}10 predpovedí`);
  assert.equal(day.trend, "zatiaľ nie je s čím porovnať");
  assert.equal(day.trendArrow, "");
  assert.equal(day.sentence, `štvrtok 1.10.: pravdepodobne áno; sucho; cez deň okolo 18${NB}°C; áno v 6${NB}z${NB}10 predpovedí; zatiaľ nie je s čím porovnať.`);
  for (const token of PLAIN_BANNED) assert.ok(!day.sentence.includes(token), `sentence contains banned "${token}"`);

  const marginal = plainDay(digestDay({ status: "MARGINAL", pPaintable: 0.49, trend: { deltaPct: -12, direction: "down", vsRunAt: R0 } }), OUTLOOK);
  assert.deepEqual([marginal.icon, marginal.verdict, marginal.chance, marginal.trendArrow, marginal.trend], ["🟡", "Neisté", `áno v 4${NB}z${NB}10 predpovedí`, "↓", "od včera horšie"]);
  const bad = plainDay(digestDay({ status: "BAD", pPaintable: 0.255, pRain: 0.35 }), OUTLOOK);
  assert.deepEqual([bad.icon, bad.verdict, bad.weather, bad.glyphEmoji], ["🔴", "Skôr nie", "možno prehánky", "🌦️"]);
  for (const d of [marginal, bad]) for (const token of PLAIN_BANNED) assert.ok(!d.sentence.includes(token), `sentence contains banned "${token}"`);

  // 🟡 owed to the "at least marginal" share says so, otherwise "1 z 10" next to a yellow light reads as a contradiction.
  const possible = plainDay(digestDay({ status: "MARGINAL", pPaintable: 0.1, pPossible: 0.7 }), OUTLOOK);
  assert.equal(possible.chance, `áno v 1${NB}z${NB}10 predpovedí, aspoň čiastočne v 7${NB}z${NB}10`);
  assert.equal(plainDay(digestDay({ status: "BAD", pPaintable: 0.05, pPossible: 0.3 }), OUTLOOK).chance, `áno v žiadnej z${NB}10 predpovedí`);

  assert.equal(plainDay(digestDay({ past: true }), OUTLOOK).sentence, "štvrtok 1.10.: už je za nami.");
  assert.equal(plainDay(digestDay({ pRain: 0.35 }), OUTLOOK).weather, "možno prehánky");
  assert.equal(plainDay(digestDay({ pRain: 0.5 }), OUTLOOK).glyph, "rain");
  assert.equal(plainDay(digestDay({ pRain: 0.5 }), OUTLOOK).weather, "skôr dážď");
  assert.equal(weatherWords(digestDay({ goodRunP50: 2, tMaxP50: 12 }), OUTLOOK), "sucho, ale chladno");
  assert.equal(weatherWords(digestDay({ goodRunP50: 2, rhMinP50: 80 }), OUTLOOK), "sucho, ale vlhko");
  assert.equal(weatherWords(digestDay({ goodRunP50: 2, tMaxP50: 12, rhMinP50: 80 }), OUTLOOK), "sucho, ale chladno a vlhko");
  assert.equal(weatherWords(digestDay({ goodRunP50: 2 }), OUTLOOK), "sucho, ale nie ideálne");
  assert.equal(plainDay(digestDay({ goodRunP50: 2 }), OUTLOOK).glyphEmoji, "🌤️");
});

test("chanceOf10 floors so the count never contradicts the traffic light", () => {
  assert.equal(chanceOf10(0.6), 6);
  assert.equal(chanceOf10(0.59), 5);
  assert.equal(chanceOf10(0.3), 3);
  assert.equal(chanceOf10(0.29), 2);
  assert.equal(chanceOf10(0.96), 9);
  assert.equal(chanceOf10(1), 10);
  assert.equal(chanceOf10(0), 0);
  // The guarantee must hold for whatever thresholds the config carries.
  assert.ok(Number.isInteger(OUTLOOK.dayStatus.good * 10) && Number.isInteger(OUTLOOK.dayStatus.marginal * 10));
  for (let i = 0; i <= 100; i++) {
    const p = i / 100;
    const s = dayStatus({ pPaintable: p, pPossible: 0 }, OUTLOOK.dayStatus);
    assert.equal(chanceOf10(p) >= OUTLOOK.dayStatus.good * 10, s === "GOOD", `p=${p}`);
    assert.equal(chanceOf10(p) >= OUTLOOK.dayStatus.marginal * 10, s !== "BAD", `p=${p}`);
  }
});

test("trendWords and horizonWords", () => {
  const t = (direction: "up" | "down" | "flat") => trendWords({ deltaPct: 0, direction, vsRunAt: R0 });
  assert.deepEqual(t("up"), { arrow: "↑", text: "od včera lepšie", direction: "up" });
  assert.deepEqual(t("down"), { arrow: "↓", text: "od včera horšie", direction: "down" });
  assert.deepEqual(t("flat"), { arrow: "→", text: "od včera bez zmeny", direction: "flat" });
  assert.equal(trendWords(null).text, "zatiaľ nie je s čím porovnať");
  assert.equal(horizonWords({ today: "2026-09-22", window: WINDOW }), "výhľad na 9–12 dní dopredu – ešte sa môže zmeniť");
  assert.equal(horizonWords({ today: "2026-09-30", window: WINDOW }), "výhľad na 1–4 dni dopredu – ešte sa môže zmeniť");
  assert.equal(horizonWords({ today: "2026-10-01", window: WINDOW }), "výhľad na najbližšie dni – ešte sa môže zmeniť");
  assert.equal(horizonWords({ today: "2026-10-04", window: WINDOW }), "výhľad na dnes – ešte sa môže zmeniť");
  assert.equal(horizonWords({ today: "2026-09-30", window: { start: "2026-10-01", end: "2026-10-01" } }), "výhľad na 1 deň dopredu – ešte sa môže zmeniť");
});

test("buildChanceSparkline: bands, dots, direct labels, inline vs. rasterized styling", () => {
  const points = [
    { label: "22.9.", value: 3, status: "MARGINAL" as const },
    { label: "23.9.", value: 4, status: "MARGINAL" as const },
    { label: "dnes", value: 6.5, status: "GOOD" as const, changed: true },
  ];
  const svg = buildChanceSparkline({ ariaLabel: "Vývoj šance", points, thresholds: { good: 6, marginal: 3 }, valueLabel: "6 z 10", inline: true });
  assert.equal((svg.match(/<circle /g) ?? []).length, 3);
  assert.equal((svg.match(/<rect /g) ?? []).length, 3);
  assert.ok(svg.includes('role="img"') && svg.includes('aria-label="Vývoj šance"'));
  assert.ok(svg.includes(">22.9.<") && svg.includes(">dnes<") && svg.includes(">6 z 10<"));
  assert.ok(svg.includes(">áno<") && svg.includes(">neisté<") && svg.includes(">nie<"));
  assert.match(svg, /<path [^>]*class="spark-line"/);
  assert.doesNotMatch(svg, /<path [^>]*stroke:#8a8880/);
  assert.ok(svg.includes('class="chart-marker"'));
  assert.ok(svg.includes(`fill="${PALETTE.statusGood}"`), "newest dot carries the status colour");
  assert.ok(svg.includes("stroke-dasharray:2 2"), "model change is marked with a guide");

  const raster = buildChanceSparkline({ ariaLabel: "x", points, thresholds: { good: 6, marginal: 3 }, valueLabel: "6 z 10", inline: false });
  assert.doesNotMatch(raster, /class="spark-line"/);
  assert.match(raster, new RegExp(`<path [^>]*stroke:${PALETTE.axis}`));

  const single = buildChanceSparkline({ ariaLabel: "x", points: points.slice(2), thresholds: { good: 6, marginal: 3 }, valueLabel: "6 z 10", inline: true });
  assert.equal((single.match(/<circle /g) ?? []).length, 1);
  assert.ok(!single.includes("<path"));
  assert.ok(single.includes(">dnes<"));
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

  // Plain layer first, everything technical under one <details>.
  assert.ok(html.includes("štvrtok 1.10."));
  assert.ok(html.includes(`áno v 6${NB}z${NB}10 predpovedí`));
  assert.ok(html.includes("od včera lepšie"));
  assert.ok(html.includes("Ako to čítať:"));
  assert.ok(html.includes("Výhľad na 8–11 dní dopredu – ešte sa môže zmeniť."));
  assert.ok(html.includes("Podrobnosti pre technika"));
  const plain = html.slice(html.indexOf('<div class="wrap">'), html.indexOf("<details"));
  assert.ok(plain.includes('class="plain-card"') && plain.includes('class="spark-svg"'));
  for (const token of PLAIN_BANNED) assert.ok(!plain.includes(token), `plain layer contains banned "${token}"`);

  // A past day is greyed out without a chance or sparkline; the other three stay forecasts.
  const later = renderOutlookHtml(history, buildDigest(history, OUTLOOK, Date.UTC(2026, 9, 2, 8)), null, new Date(Date.UTC(2026, 9, 2, 8)), OUTLOOK);
  const pastStart = later.indexOf('class="plain-card past"');
  const pastCard = later.slice(pastStart, later.indexOf('class="plain-card"', pastStart));
  assert.ok(pastCard.includes("už je za nami") && !pastCard.includes("z 10") && !pastCard.includes("spark-svg"));
  assert.equal((later.match(/class="plain-card"/g) ?? []).length, 3);

  // The "window over" state names it, keeps the technical details and is stable byte for byte when
  // rendered as of the instant the window closed (outlook.ts does exactly that).
  const closedAt = new Date(localMidnightMs("2026-10-05", TZ));
  const over = renderOutlookHtml(history, null, null, closedAt, OUTLOOK);
  assert.ok(over.includes("už uplynulo") && !over.includes("zatiaľ nie je k dispozícii"));
  assert.ok(over.includes("Podrobnosti pre technika") && over.includes('data-chart="evo-2026-10-01"'));
  assert.ok(over.includes("stav k 05.10.2026 00:00"));
  assert.equal(over, renderOutlookHtml(history, null, null, closedAt, OUTLOOK));

  const png = renderOutlookPng(history, OUTLOOK)!;
  assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);

  const empty = renderOutlookHtml(emptyHistory(OUTLOOK, WINDOW), null, null, now, OUTLOOK);
  assert.ok(empty.includes("zatiaľ nie je k dispozícii") && !empty.includes("<details"));
  assert.equal(renderOutlookPng(emptyHistory(OUTLOOK, WINDOW), OUTLOOK), null);
});

function runOutlookCli(env: Record<string, string>): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, ["--import", "tsx", "src/outlook.ts"], {
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
    encoding: "utf8",
    timeout: 60_000,
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

test("outlook.ts: OUTLOOK_DOCS_DIR + OUTLOOK_RENDER_ONLY render a closed window once, into the scratch dir only", () => {
  const dir = mkdtempSync(join(tmpdir(), "ztlzdrf-outlook-"));
  mkdirSync(join(dir, "outlook"));
  const window = { start: "2026-09-01", end: "2026-09-04" };
  const past = mergeHistory(emptyHistory(OUTLOOK, window), [
    mkRun("ecmwf_ifs025", "2026-08-25T00:00:00.000Z", { "2026-09-01": 0.5, "2026-09-02": 0.6, "2026-09-03": 0.2, "2026-09-04": 0.1 }),
    mkRun("ecmwf_ifs025", "2026-08-26T00:00:00.000Z", { "2026-09-01": 0.7, "2026-09-02": 0.4, "2026-09-03": 0.3, "2026-09-04": 0.2 }),
  ]).history;
  writeFileSync(join(dir, "outlook", "history.json"), JSON.stringify(past));
  const env = { OUTLOOK_DOCS_DIR: dir, OUTLOOK_RENDER_ONLY: "true", OUTLOOK_START: window.start, OUTLOOK_END: window.end };

  const first = runOutlookCli(env);
  assert.equal(first.status, 0, first.stderr);
  assert.ok(first.stdout.includes("Okno skončilo 2026-09-04"), first.stdout);
  const html = readFileSync(join(dir, "outlook.html"), "utf8");
  assert.ok(html.includes("už uplynulo") && html.includes("Podrobnosti pre technika") && html.includes("stav k 05.09.2026 00:00"));
  assert.ok(existsSync(join(dir, "outlook.png")));
  assert.ok(!existsSync(join(dir, "outlook", "history-2026-09-01_2026-09-04.json")), "a matching window must not be archived");

  const second = runOutlookCli(env);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /outlook\.html bez zmeny/, "the closed-window page must be byte-stable across runs");
  assert.equal(readFileSync(join(REPO_ROOT, "docs", "outlook", "history.json"), "utf8").includes('"start": "2026-09-01"'), false, "live docs/ must stay untouched");
});

test("outlook.ts: OUTLOOK_RENDER_ONLY renders the plain layer for an open window without any network", () => {
  const dir = mkdtempSync(join(tmpdir(), "ztlzdrf-outlook-"));
  mkdirSync(join(dir, "outlook"));
  const window = { start: "2030-10-01", end: "2030-10-04" };
  const yesterday = new Date(Date.now() - 86_400_000).toISOString();
  const future = mergeHistory(emptyHistory(OUTLOOK, window), [
    mkRun("ecmwf_ifs025", yesterday, { "2030-10-01": 0.65, "2030-10-02": 0.4, "2030-10-03": 0.3, "2030-10-04": 0.1 }),
  ]).history;
  writeFileSync(join(dir, "outlook", "history.json"), JSON.stringify(future));
  const r = runOutlookCli({ OUTLOOK_DOCS_DIR: dir, OUTLOOK_RENDER_ONLY: "true", OUTLOOK_START: window.start, OUTLOOK_END: window.end });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes("nič sa nesťahuje"), r.stdout);
  const html = readFileSync(join(dir, "outlook.html"), "utf8");
  assert.ok(html.includes('class="plain-card"') && html.includes("Pravdepodobne áno") && html.includes("Podrobnosti pre technika"));
  assert.ok(existsSync(join(dir, "outlook.png")));
});
