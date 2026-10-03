import test from "node:test";
import assert from "node:assert/strict";
import { auc, bootstrapBlocks, scores, type Case } from "./verify.js";

const mk = (day: string, obs: number, fc: number | null, clim = 0.1, prob?: number): Case => ({ day, station: "s", obs, fc, clim, climMean: 2, prob });

test("skóre: Brier a BSS proti klimatológii, POD/FAR/CSI, bias a MAE", () => {
  const cases = [mk("2025-01-01", 20, 18), mk("2025-01-02", 0, 0), mk("2025-01-03", 16, 5), mk("2025-01-04", 3, 20)];
  const s = scores(cases, 15);
  assert.equal(s.n, 4);
  assert.equal(s.events, 2);
  assert.equal(s.hits, 1);
  assert.equal(s.misses, 1);
  assert.equal(s.falseAlarms, 1);
  assert.equal(s.pod, 0.5);
  assert.equal(s.far, 0.5);
  assert.equal(s.csi, 1 / 3);
  assert.equal(s.brier, 0.5);
  // climatology 0.1: (0.9^2 + 0.1^2 + 0.9^2 + 0.1^2) / 4 = 0.41
  assert.ok(Math.abs((s.brierClim ?? 0) - 0.41) < 1e-9);
  assert.ok(Math.abs((s.bss ?? 0) - (1 - 0.5 / 0.41)) < 1e-9);
  assert.equal(s.bias, (18 - 20 + 0 + 5 - 16 + 20 - 3) / 4);
  assert.equal(s.mae, (2 + 0 + 11 + 17) / 4);
});

test("AUC: dokonalé poradie 1, obrátené 0, remízy pol", () => {
  assert.equal(auc([5, 6], [1, 2]), 1);
  assert.equal(auc([1, 2], [5, 6]), 0);
  assert.equal(auc([3], [3]), 0.5);
  assert.equal(auc([], [1]), null);
});

test("pravdepodobnostná predpoveď používa prob namiesto prahu", () => {
  const s = scores([mk("2025-01-01", 20, 10, 0.1, 0.8), mk("2025-01-02", 0, 10, 0.1, 0.2)], 15);
  assert.ok(Math.abs((s.brier ?? 0) - (0.04 + 0.04) / 2) < 1e-9);
  assert.equal(s.hits, 1);
  assert.equal(s.falseAlarms, 0);
});

test("blokový bootstrap je deterministický a obaľuje odhad", () => {
  const cases: Case[] = [];
  for (let i = 0; i < 120; i++) cases.push(mk(`2025-01-${String((i % 28) + 1).padStart(2, "0")}`.replace("2025-01", i < 28 ? "2025-01" : i < 56 ? "2025-02" : i < 84 ? "2025-03" : i < 112 ? "2025-04" : "2025-05"), i % 7 === 0 ? 20 : 0, i % 7 === 0 ? 18 : 1));
  const a = bootstrapBlocks(cases, (c) => scores(c, 15).pod, 10, 200);
  const b = bootstrapBlocks(cases, (c) => scores(c, 15).pod, 10, 200);
  assert.deepEqual(a, b);
  assert.equal(a.est, 1);
  assert.ok(a.lo !== null && a.hi !== null && a.lo <= 1 && a.hi <= 1);
});
