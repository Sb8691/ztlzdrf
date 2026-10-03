import test from "node:test";
import assert from "node:assert/strict";
import { PAGE_RULE, RAW_MODEL, amount24Cm, crpsCm, minimize, normalCdf, normalInv, probAtLeast, quantileCm, snowFraction, spreadAt, tobitNll, type ModelHour, type PhysicsParams } from "./powder-model.js";

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
