import { test } from "node:test";
import assert from "node:assert/strict";
import { findPaintWindows, pickCandidateStarts } from "./analyze.js";
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

test("pickCandidateStarts keeps only configured weekday/hour slots", () => {
  const times = [
    "2026-08-28T08:00", // Friday 08:00 - not a candidate
    "2026-08-29T08:00", // Saturday 08:00 - candidate
    "2026-08-29T09:00", // Saturday 09:00 - not a candidate
    "2026-08-30T08:00", // Sunday 08:00 - candidate
  ];

  const picked = pickCandidateStarts(times);
  assert.deepEqual(picked, ["2026-08-29T08:00", "2026-08-30T08:00"]);
});
