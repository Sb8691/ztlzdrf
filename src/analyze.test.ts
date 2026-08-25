import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateInterval, findPaintWindows, pickCandidateStarts } from "./analyze.js";
import type { HourlyByModel } from "./types.js";

const OPTS = { preDryHours: 24, paintHours: 12, postDryHours: 24, rainThresholdMm: 0.1 };

/** Builds an hourly series of `hours` consecutive hours starting at `startIso`, all with `mm` precipitation. */
function series(startIso: string, hours: number, mm: number) {
  const time: string[] = [];
  const precipitation: number[] = [];
  const start = new Date(startIso).getTime();
  for (let i = 0; i < hours; i++) {
    time.push(new Date(start + i * 3600_000).toISOString());
    precipitation.push(mm);
  }
  return { time, precipitation };
}

test("marks window ok when every model is fully dry", () => {
  const start = "2026-08-29T08:00:00.000Z";
  const hourlyByModel: HourlyByModel = {
    icon_seamless: series("2026-08-27T00:00:00.000Z", 96, 0),
    gfs_seamless: series("2026-08-27T00:00:00.000Z", 96, 0),
  } as HourlyByModel;

  const [result] = findPaintWindows(hourlyByModel, [start], OPTS);
  assert.equal(result.ok, true);
});

test("marks window not ok when one model rains inside the post-paint drying period", () => {
  const start = "2026-08-29T08:00:00.000Z";
  const dry = series("2026-08-27T00:00:00.000Z", 96, 0);
  const rainy = series("2026-08-27T00:00:00.000Z", 96, 0);
  // 2026-08-29T22:00Z falls inside the 24h drying period after a 08:00+12h=20:00 paint end.
  const rainHourIndex = rainy.time.findIndex((t) => t === "2026-08-29T22:00:00.000Z");
  assert.ok(rainHourIndex >= 0, "test setup: rain hour must exist in series");
  rainy.precipitation[rainHourIndex] = 0.5;

  const hourlyByModel = { icon_seamless: dry, gfs_seamless: rainy } as HourlyByModel;

  const [result] = findPaintWindows(hourlyByModel, [start], OPTS);
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, [
    {
      model: "gfs_seamless",
      time: "2026-08-29T22:00:00.000Z",
      phase: "schnutie",
      precipitationMm: 0.5,
    },
  ]);
});

test("classifies failures by phase (pred-schnutie / malovanie / schnutie)", () => {
  const start = "2026-08-29T08:00:00.000Z";
  const rainy = series("2026-08-27T00:00:00.000Z", 96, 0);
  // Pre-dry phase: 2026-08-28T10:00Z is before the 08:00 start.
  rainy.precipitation[rainy.time.indexOf("2026-08-28T10:00:00.000Z")] = 0.3;
  // Painting phase: 2026-08-29T14:00Z is within [start, start+12h).
  rainy.precipitation[rainy.time.indexOf("2026-08-29T14:00:00.000Z")] = 0.4;

  const hourlyByModel = { icon_seamless: rainy } as HourlyByModel;
  const [result] = findPaintWindows(hourlyByModel, [start], OPTS);

  const phases = result.failures.map((f) => f.phase).sort();
  assert.deepEqual(phases, ["malovanie", "pred-schnutie"]);
});

test("trace precipitation below the threshold still counts as dry", () => {
  const start = "2026-08-29T08:00:00.000Z";
  const hourlyByModel: HourlyByModel = {
    icon_seamless: series("2026-08-27T00:00:00.000Z", 96, 0.05),
  } as HourlyByModel;

  const [result] = findPaintWindows(hourlyByModel, [start], OPTS);
  assert.equal(result.ok, true);
});

test("marks window not ok when forecast doesn't fully cover it", () => {
  const start = "2026-08-29T08:00:00.000Z";
  // Only 40 hours of data - window needs 60 hours (24 + 12 + 24).
  const hourlyByModel: HourlyByModel = {
    icon_seamless: series("2026-08-28T00:00:00.000Z", 40, 0),
  } as HourlyByModel;

  const [result] = findPaintWindows(hourlyByModel, [start], OPTS);
  assert.equal(result.ok, false);
});

test("aggregateInterval computes min/median/max across all reporting models (1h buckets)", () => {
  const t = "2026-08-29T08:00:00.000Z";
  const ms = new Date(t).getTime();
  const hourlyByModel: HourlyByModel = {
    icon_seamless: { time: [t], precipitation: [1] },
    gfs_seamless: { time: [t], precipitation: [3] },
    ecmwf_ifs025: { time: [t], precipitation: [2] },
  } as HourlyByModel;

  const [point] = aggregateInterval(hourlyByModel, ms, ms + 1, 1, (s, i) => s.precipitation[i]);
  assert.deepEqual(point, { time: t, ms, min: 1, median: 2, max: 3 });
});

test("aggregateInterval ignores missing models and omits hours with zero reporting models (1h buckets)", () => {
  const t1 = "2026-08-29T08:00:00.000Z";
  const t2 = "2026-08-29T09:00:00.000Z";
  const ms1 = new Date(t1).getTime();
  const ms2 = new Date(t2).getTime();
  const hourlyByModel: HourlyByModel = {
    icon_seamless: { time: [t1, t2], precipitation: [1, null] },
    gfs_seamless: { time: [t1, t2], precipitation: [null, null] },
  } as HourlyByModel;

  const points = aggregateInterval(hourlyByModel, ms1, ms2 + 1, 1, (s, i) => s.precipitation[i]);
  assert.deepEqual(points, [{ time: t1, ms: ms1, min: 1, median: 1, max: 1 }]);
});

test("aggregateInterval sums each model's hours within a bucket before taking min/median/max", () => {
  const t1 = "2026-08-29T08:00:00.000Z";
  const t2 = "2026-08-29T09:00:00.000Z";
  const ms1 = new Date(t1).getTime();
  const hourlyByModel: HourlyByModel = {
    icon_seamless: { time: [t1, t2], precipitation: [1, 1] }, // sums to 2
    gfs_seamless: { time: [t1, t2], precipitation: [2, 3] }, // sums to 5
  } as HourlyByModel;

  const points = aggregateInterval(hourlyByModel, ms1, ms1 + 2 * 3600_000, 2, (s, i) => s.precipitation[i]);
  assert.deepEqual(points, [{ time: t1, ms: ms1, min: 2, median: 3.5, max: 5 }]);
});

test("pickCandidateStarts keeps only configured weekday/hour slots", () => {
  const times = [
    "2026-08-27T08:00", // Thursday 08:00 - not a candidate
    "2026-08-28T08:00", // Friday 08:00 - candidate
    "2026-08-29T08:00", // Saturday 08:00 - candidate
    "2026-08-29T09:00", // Saturday 09:00 - not a candidate
    "2026-08-30T08:00", // Sunday 08:00 - candidate
  ];

  const picked = pickCandidateStarts(times);
  assert.deepEqual(picked, ["2026-08-28T08:00", "2026-08-29T08:00", "2026-08-30T08:00"]);
});
