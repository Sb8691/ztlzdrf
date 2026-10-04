import test from "node:test";
import assert from "node:assert/strict";
import { PAGE_RULE, RAW_MODEL, amount24Cm, crpsCm, minimize, normalCdf, normalInv, probAtLeast, quantileCm, snowFraction, spreadAt, tobitNll, hurdleAt, hurdleAtLead, hurdleCdf, hurdleCrpsCm, hurdleNll, hurdleProbAtLeast, hurdleQuantileCm, type ModelHour, type PhysicsParams } from "./powder-model.js";

const hour = (precip: number, snowfall: number, temp: number, wetBulb: number | null = temp - 0.8, gust: number | null = 20): ModelHour => ({ precip, snowfall, temp, wetBulb, gust });

test("page rule and raw model reproduce today's sums", () => {
  const hours = [hour(1, 0.7, -3), hour(2, 1.4, 0.5), hour(1, 0, 2), hour(0.5, 0.21, 1.5)];
  // Page rule: 0.7 cm/mm at T <= 1 °C -> 0.7 + 1.4 = 2.1 cm.
  assert.equal(Math.round(amount24Cm(hours, 1800, PAGE_RULE) * 100) / 100, 2.1);
  // Raw model: sum of snowfall = 0.7 + 1.4 + 0 + 0.21 = 2.31 cm.
  assert.equal(Math.round(amount24Cm(hours, 1800, RAW_MODEL) * 100) / 100, 2.31);
});

test("wet-bulb ramp, snow ratio, wind and height factor", () => {
  const p: PhysicsParams = { phase: "wetbulb", phaseMidC: 0.5, phaseHalfWidthC: 1, slr0: 8, slrPerDeg: 0.5, slrMin: 4, slrMax: 16, gustK: 0.3, elevBeta: 0.2, zRef: 1500, scale: 0.9 };
  assert.equal(snowFraction(hour(1, 0, 0, -0.5), p), 1);
  assert.equal(snowFraction(hour(1, 0, 2, 1.5), p), 0);
  assert.equal(snowFraction(hour(1, 0, 1, 0.5), p), 0.5);
  // -4 °C, no wind, 1 mm: ratio 8 + 2 = 10 -> 1.0 cm; x 0.9 x exp(0.2 x 0.5) at 2000 m.
  const a = amount24Cm([hour(1, 0.7, -4, -4.5, 0)], 2000, p);
  assert.ok(Math.abs(a - 1 * 0.9 * Math.exp(0.1)) < 1e-9, String(a));
  // 60 km/h gust packs the ratio by 30 %.
  const b = amount24Cm([hour(1, 0.7, -4, -4.5, 60)], 1500, p);
  assert.ok(Math.abs(b - 0.7 * 0.9) < 1e-9, String(b));
});

test("normal helpers: CDF, inverse and symmetry", () => {
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-9);
  assert.ok(Math.abs(normalCdf(1.959964) - 0.975) < 1e-6);
  assert.ok(Math.abs(normalInv(0.975) - 1.959964) < 1e-6);
  // The CDF is accurate to 1.5e-7, which the inverse magnifies in the tails (1 / pdf): 1e-4 is the honest bound.
  for (const z of [-3, -1.2, 0.3, 2.5]) assert.ok(Math.abs(normalInv(normalCdf(z)) - z) < 1e-4, String(z));
});

test("censored normal: probability, quantiles and likelihood behave", () => {
  const sp = { a: 0, b: 1, c: 0.6, d: 0.1 };
  // Physics says 15 cm -> mu = sqrt(15): P(>= 15) = 0.5 exactly.
  assert.ok(Math.abs(probAtLeast(15, 15, sp) - 0.5) < 1e-9);
  assert.ok(probAtLeast(5, 15, sp) < probAtLeast(10, 15, sp));
  assert.ok(probAtLeast(30, 15, sp) > 0.9);
  // Median of the distribution at x = 9 cm is 9 cm; low quantiles of a dry forecast are zero.
  assert.ok(Math.abs(quantileCm(9, 0.5, sp) - 9) < 1e-9);
  assert.equal(quantileCm(0, 0.1, sp), 0);
  // Likelihood prefers the spread that generated the data.
  const cases = [0, 0, 0.5, 2, 4, 6, 9, 12, 20].map((y) => ({ x: 6, y }));
  const nll = (c: number) => tobitNll(cases, { ...sp, c });
  assert.ok(nll(1.0) < nll(0.2) && nll(1.0) < nll(4));
  // CRPS of a sharp forecast around the observation is small, of a wrong one large.
  assert.ok(crpsCm(10, 10, { a: 0, b: 1, c: 0.1, d: 0 }) < 0.5);
  assert.ok(crpsCm(0, 20, { a: 0, b: 1, c: 0.1, d: 0 }) > 15);
});

test("coordinate search finds the minimum of a bowl", () => {
  const r = minimize(([x, y]) => (x - 1.5) ** 2 + 2 * (y + 0.25) ** 2, [0, 0], [1, 1]);
  assert.ok(Math.abs(r.x[0] - 1.5) < 1e-3 && Math.abs(r.x[1] + 0.25) < 1e-3, JSON.stringify(r));
});

test("lead law: linear in days, clamped to the fitted range", () => {
  const law = { leadRefH: 23, a0: -2, a1: -0.2, b0: 1.7, b1: -0.06, c0: 1.5, c1: 0.25, d0: 0.05, d1: 0, minLeadH: 23, maxLeadH: 131 };
  assert.deepEqual(spreadAt(law, 23), { a: -2, b: 1.7, c: 1.5, d: 0.05 });
  const two = spreadAt(law, 71);
  assert.ok(Math.abs(two.a + 2.4) < 1e-9 && Math.abs(two.b - 1.58) < 1e-9 && Math.abs(two.c - 2) < 1e-9);
  assert.deepEqual(spreadAt(law, 200), spreadAt(law, 131));
  // Below the fitted range the law extrapolates towards lead 0 but never below it.
  assert.deepEqual(spreadAt(law, -5), spreadAt(law, 0));
  // Longer lead, less certain: P(>= 15) for a 20 cm forecast falls with lead.
  assert.ok(probAtLeast(20, 14.5, spreadAt(law, 23)) > probAtLeast(20, 14.5, spreadAt(law, 131)));
});

test("two-part model: dry mass, tail probability, quantiles, CDF and likelihood", () => {
  const p = { h0: -0.3, h1: 0.9, a: 0.1, b: 1, c: 1.2, d: 0.1 };
  // Dry forecast: mostly no snow, essentially no chance of 15 cm.
  assert.ok(hurdleAt(0, p).p0 < 0.4);
  assert.ok(hurdleProbAtLeast(0, 15, p) < 0.01);
  // 15 cm forecast: location sqrt(15) + 0.1, so a little over half of the wet cases reach 15 cm.
  const q = hurdleProbAtLeast(15, 15, p);
  assert.ok(q > 0.5 && q < 0.65, String(q));
  assert.ok(hurdleProbAtLeast(5, 15, p) < hurdleProbAtLeast(15, 15, p) && hurdleProbAtLeast(15, 15, p) < hurdleProbAtLeast(30, 15, p));
  // CDF is monotone from the dry mass to one, and the quantile inverts it.
  assert.ok(Math.abs(hurdleCdf(0, 9, p) - (1 - hurdleAt(9, p).p0)) < 1e-9);
  assert.ok(hurdleCdf(5, 9, p) < hurdleCdf(10, 9, p) && hurdleCdf(100, 9, p) > 0.999);
  const med = hurdleQuantileCm(9, 0.5, p);
  assert.ok(Math.abs(hurdleCdf(med, 9, p) - 0.5) < 1e-6, String(med));
  assert.equal(hurdleQuantileCm(0, 0.2, p), 0);
  // Likelihood: the wet part prefers the spread that generated the data, the dry part the right hurdle.
  const cases = [0, 0, 0, 2, 4, 6, 9, 12, 20].map((y) => ({ x: 6, y }));
  const wet = (c: number) => hurdleNll(cases, { ...p, c }).wet;
  assert.ok(wet(1.2) < wet(0.2) && wet(1.2) < wet(5));
  const dry = (h0: number) => hurdleNll(cases, { ...p, h0 }).dry;
  // 6 of 9 wet at sqrt(6) = 2.45: Phi(h0 + 0.9 x 2.45) = 2/3 -> h0 = -1.77.
  assert.ok(dry(-1.77) < dry(0.5) && dry(-1.77) < dry(-4));
  // CRPS: sharp and right is small, dry forecast against 20 cm is large.
  assert.ok(hurdleCrpsCm(10, 10, { h0: 3, h1: 0, a: 0, b: 1, c: 0.1, d: 0 }) < 0.5);
  assert.ok(hurdleCrpsCm(0, 20, { h0: -3, h1: 0, a: 0, b: 1, c: 0.1, d: 0 }) > 15);
});

test("two-part lead law: coefficients move linearly in days and clamp", () => {
  const law = { leadRefH: 23, minLeadH: 23, maxLeadH: 131, h00: -0.3, h01: 0, h10: 0.9, h11: -0.05, a0: 0, a1: 0, b0: 1, b1: -0.05, c0: 1.2, c1: 0.1, d0: 0, d1: 0 };
  assert.deepEqual(hurdleAtLead(law, 23), { h0: -0.3, h1: 0.9, a: 0, b: 1, c: 1.2, d: 0 });
  const two = hurdleAtLead(law, 71);
  assert.ok(Math.abs(two.b - 0.9) < 1e-9 && Math.abs(two.c - 1.4) < 1e-9 && Math.abs(two.h1 - 0.8) < 1e-9);
  assert.deepEqual(hurdleAtLead(law, 500), hurdleAtLead(law, 131));
  assert.ok(hurdleProbAtLeast(20, 15, hurdleAtLead(law, 23)) > hurdleProbAtLeast(20, 15, hurdleAtLead(law, 131)));
});

test("the page's copy of the model (src/ski-core.js) agrees with the library", async () => {
  const core = await import("../../src/ski-core.js");
  const law = { leadRefH: 23, minLeadH: 23, maxLeadH: 131, h00: -1.339, h01: 0, h10: 0.896, h11: 0, a0: 1.419, a1: 0, b0: 0.57, b1: -0.032, c0: 0.891, c1: 0, d0: 0, d1: 0 };
  for (const lead of [0, 23, 71, 131, 200]) {
    const lib = hurdleAtLead(law, lead), page = core.powderLawAt(law, lead);
    assert.deepEqual(page, lib);
    for (const x of [0, 0.5, 3, 10, 20, 45]) {
      assert.ok(Math.abs(core.powderProbAtLeast(x, 15, page) - hurdleProbAtLeast(x, 15, lib)) < 1e-12, `${lead} h, ${x} cm`);
      assert.ok(Math.abs(core.powderQuantileCm(x, 0.9, page) - hurdleQuantileCm(x, 0.9, lib)) < 1e-9);
    }
  }
});
