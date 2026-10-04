import test from "node:test";
import assert from "node:assert/strict";
import { fitLogistic, fitLogisticMulti, logisticMultiProb, logisticNll, logisticProb } from "./calibrate.js";

test("logistic calibration recovers a known curve and refuses a falling slope", () => {
  // Synthetic: P(y) = logistic(-3 + 0.1 g) for g in 0..100, deterministic "coin" by threshold on a hash.
  const pairs: { g: number; y: 0 | 1 }[] = [];
  for (let g = 0; g <= 100; g += 1) {
    const p = 1 / (1 + Math.exp(-(-3 + 0.1 * g)));
    for (let k = 0; k < 20; k++) pairs.push({ g, y: ((g * 7919 + k * 104729) % 1000) / 1000 < p ? 1 : 0 });
  }
  const fit = fitLogistic(pairs);
  assert.ok(Math.abs(fit.a + 3) < 0.4 && Math.abs(fit.b - 0.1) < 0.015, JSON.stringify(fit));
  assert.ok(logisticNll(pairs, fit) <= logisticNll(pairs, { a: -2, b: 0.5 }));
  assert.ok(logisticProb(30, fit) < logisticProb(60, fit));
  // A "the more the less" data set cannot flip the slope negative: it degenerates to the base rate.
  const falling = pairs.map((k) => ({ g: 100 - k.g, y: k.y }));
  assert.equal(fitLogistic(falling).b, 0);
});

test("multi-input logistic recovers two slopes", () => {
  const pairs: { g: number[]; y: 0 | 1 }[] = [];
  for (let i = 0; i < 2000; i++) {
    const g1 = (i % 50) / 10, g2 = ((i * 7) % 40) / 10;
    const p = 1 / (1 + Math.exp(-(-2 + 0.8 * g1 - 0.5 * g2)));
    pairs.push({ g: [g1, g2], y: ((i * 104729) % 1000) / 1000 < p ? 1 : 0 });
  }
  const fit = fitLogisticMulti(pairs, 2);
  assert.ok(Math.abs(fit.a + 2) < 0.4 && Math.abs(fit.b[0] - 0.8) < 0.15 && Math.abs(fit.b[1] + 0.5) < 0.15, JSON.stringify(fit));
  assert.ok(logisticMultiProb([4, 0], fit) > logisticMultiProb([0, 4], fit));
});
