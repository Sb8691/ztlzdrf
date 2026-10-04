/**
 * Binary calibration for the day-quality components of step 6 (METODIKA §4.5): a logistic curve
 * P(event) = 1 / (1 + exp(-(a + b g(x)))) on one transformed model value. Two parameters, fitted
 * by maximum likelihood with the same coordinate search as the powder model; nothing else.
 */
import { minimize } from "./powder-model.js";

export interface Logistic { a: number; b: number }

export const logistic = (z: number): number => 1 / (1 + Math.exp(-z));

export function logisticProb(g: number, p: Logistic): number {
  return logistic(p.a + p.b * g);
}

/** Negative log-likelihood of binary outcomes under the curve. */
export function logisticNll(pairs: { g: number; y: 0 | 1 }[], p: Logistic): number {
  let nll = 0;
  for (const k of pairs) {
    const q = Math.min(1 - 1e-9, Math.max(1e-9, logisticProb(k.g, p)));
    nll -= k.y ? Math.log(q) : Math.log(1 - q);
  }
  return nll;
}

/** Maximum-likelihood fit; the slope is kept non-negative because every component here is "more of x, more likely". */
export function fitLogistic(pairs: { g: number; y: 0 | 1 }[], start: Logistic = { a: -2, b: 0.5 }): Logistic {
  if (!pairs.length) return start;
  const r = minimize(([a, b]) => (b < 0 ? Infinity : logisticNll(pairs, { a, b })), [start.a, start.b], [0.5, 0.25], { rounds: 120, minStep: 1e-4 });
  return { a: Math.round(r.x[0] * 1e4) / 1e4, b: Math.round(r.x[1] * 1e4) / 1e4 };
}

export interface LogisticMulti { a: number; b: number[] }

export function logisticMultiProb(g: number[], p: LogisticMulti): number {
  let z = p.a;
  for (let i = 0; i < g.length; i++) z += p.b[i] * g[i];
  return logistic(z);
}

export function logisticMultiNll(pairs: { g: number[]; y: 0 | 1 }[], p: LogisticMulti): number {
  let nll = 0;
  for (const k of pairs) {
    const q = Math.min(1 - 1e-9, Math.max(1e-9, logisticMultiProb(k.g, p)));
    nll -= k.y ? Math.log(q) : Math.log(1 - q);
  }
  return nll;
}

/** Maximum-likelihood fit with several inputs (no sign constraint); for the direct "good day" check and for testing extra predictors. */
export function fitLogisticMulti(pairs: { g: number[]; y: 0 | 1 }[], k: number): LogisticMulti {
  if (!pairs.length) return { a: 0, b: Array(k).fill(0) };
  const r = minimize((x) => logisticMultiNll(pairs, { a: x[0], b: x.slice(1) }), [-1, ...Array(k).fill(0)], [0.5, ...Array(k).fill(0.25)], { rounds: 160, minStep: 1e-4 });
  return { a: Math.round(r.x[0] * 1e4) / 1e4, b: r.x.slice(1).map((v) => Math.round(v * 1e4) / 1e4) };
}
