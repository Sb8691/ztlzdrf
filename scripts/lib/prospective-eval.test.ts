import test from "node:test";
import assert from "node:assert/strict";
import type { ForecastLogLine } from "../../src/prospective.js";
import { collectCases, decisionTable, meanOf, slotOf } from "./prospective-eval.js";

const ps = (probability: number, forecastCm = 10, leadH = 23) => ({ forecastCm, leadH, probability, medianCm: forecastCm, p90Cm: forecastCm * 2, stage: "alert", alert: probability >= 0.2 });

/** A log line of one run: two stations, the two resorts with LWD proxies, members for the ensemble. */
function line(fetchedAtMs: number, firstDate: string, p: number): ForecastLogLine {
  const days = (n: number, f: (i: number) => Record<string, unknown>) => Array.from({ length: n }, (_, i) => ({ date: addDays(firstDate, i), ...f(i) }));
  return {
    v: 1, fetchedAtMs, firstDate, snapshotVersion: 2, modelVersion: 1,
    horizons: {
      short: { model: "ecmwf_ifs", runAtMs: null, publishedAtMs: null,
        resorts: { falkert: days(3, (i) => ({ powderSnow: ps(p * (i + 1) / 3) })), "turracher-hoehe": days(3, () => ({ powderSnow: null })) },
        stations: { "lwd:2900240": days(3, (i) => ({ powderSnow: ps(p * (i + 1) / 3, 5 * (i + 1), 23 + 24 * i) })), "geosphere:122": days(3, () => ({ powderSnow: ps(0.05) })) } },
      long: { model: "ecmwf_ifs025", runAtMs: null, publishedAtMs: null,
        resorts: { falkert: days(4, (i) => ({ members: i === 0 ? [null, null, null, null] : [0, 10, 20, 30].map((v) => v * i / 3) })) } },
    },
  };
}
function addDays(iso: string, d: number): string { const [y, m, dd] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + d)).toISOString().slice(0, 10); }

const truth = (station: string, date: string) => (station === "lwd:2900240" ? { obs: date.endsWith("02") ? 18 : 3, hs: 50 } : station === "geosphere:122" ? { obs: 0, hs: 10 } : null);
const clim = () => ({ p: 0.05, mean: 2 });

test("slot CI podľa hodiny načítania", () => {
  assert.equal(slotOf(Date.UTC(2027, 0, 15, 4, 13)), "04");
  assert.equal(slotOf(Date.UTC(2027, 0, 15, 10, 40)), "10");
  assert.equal(slotOf(Date.UTC(2027, 0, 15, 16, 13)), "16");
  assert.equal(slotOf(Date.UTC(2027, 0, 15, 22, 0)), "22?");
});

test("prípady: stanice, strediská cez zástupnú stanicu, ansámbel ako podiel členov; deň v triede raz", () => {
  const lines = [line(Date.UTC(2027, 0, 1, 4, 13), "2027-01-01", 0.3), line(Date.UTC(2027, 0, 1, 5, 0), "2027-01-01", 0.9), line(Date.UTC(2027, 0, 2, 4, 13), "2027-01-02", 0.6)];
  const classes = collectCases(lines, truth, clim, 15);
  const keys = [...classes.keys()].sort();
  assert.ok(keys.includes("stations|short|D+0|04") && keys.includes("stations|short|D+2|04") && keys.includes("resorts|short|D+1|04") && keys.includes("ensemble|long|D+1|04"));
  assert.ok(!keys.includes("ensemble|long|D+0|04"), "D0 ansámblu bez okna sa nehodnotí");
  // Station D+0 in slot 04: day 1 (the 05:00 line overrode the 04:13 one) and day 2, two stations each.
  const d0 = classes.get("stations|short|D+0|04")!;
  assert.equal(d0.length, 4);
  assert.equal(d0.find((c) => c.station === "lwd:2900240" && c.day === "2027-01-01")!.prob, 0.3);
  assert.equal(d0.find((c) => c.station === "geosphere:122" && c.day === "2027-01-02")!.hs, 10);
  // D+1 of the 2 Jan run is 3 Jan - no truth beyond what the lookup knows about "...02"? It has, 3 cm.
  const r1 = classes.get("resorts|short|D+1|04")!;
  assert.deepEqual(r1.map((c) => [c.station, c.day, c.obs]), [["falkert", "2027-01-02", 18], ["falkert", "2027-01-03", 3]]);
  // Turracher logs no powderSnow (null) -> no case; ensemble share: members [0, 10, 20, 30]/3*i >= 15.
  assert.ok(!r1.some((c) => c.station === "turracher-hoehe"));
  const e2 = classes.get("ensemble|long|D+2|04")!.find((c) => c.day === "2027-01-03")!;
  assert.equal(e2.prob, 0.25);
});

test("rozhodovacia tabuľka a priemer predstihu", () => {
  const lines = [line(Date.UTC(2027, 0, 1, 4, 13), "2027-01-01", 0.9)];
  const classes = collectCases(lines, truth, clim, 15);
  const st = classes.get("stations|short|D+1|04")!;
  // lwd:2900240 on 2 Jan: prob 0.6, obs 18 -> hit; geosphere:122: prob 0.05, obs 0 -> correct negative.
  assert.deepEqual(decisionTable(st, 15, 0.2), { alerts: 1, hits: 1, falseAlarms: 0, misses: 0, events: 1, pod: 1, far: 0 });
  assert.deepEqual(decisionTable(st, 15, 0.7), { alerts: 0, hits: 0, falseAlarms: 0, misses: 1, events: 1, pod: 0, far: null });
  assert.equal(meanOf(st, (c) => c.leadH), (47 + 23) / 2);
});
