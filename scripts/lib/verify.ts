/**
 * Verification statistics shared by the backtest and later by the prospective evaluation.
 * All functions are pure; the bootstrap uses a seeded generator so reports are reproducible.
 */

export interface Case {
  /** Measurement day (ISO date) - the block key for the bootstrap. */
  day: string;
  station: string;
  /** Observed 24 h new snow (cm). */
  obs: number;
  /** Forecast amount (cm), or null when the source could not produce one. */
  fc: number | null;
  /** Forecast probability of the event, for probabilistic sources; deterministic ones use fc >= threshold. */
  prob?: number;
  /** Climatological probability of the event for this day/station (out-of-season reference). */
  clim: number;
  /** Climatological mean amount (cm) for the MAE baseline. */
  climMean: number;
}

export interface Scores {
  n: number;
  events: number;
  bias: number | null;
  mae: number | null;
  maeClim: number | null;
  brier: number | null;
  brierClim: number | null;
  bss: number | null;
  pod: number | null;
  far: number | null;
  csi: number | null;
  auc: number | null;
  hits: number;
  misses: number;
  falseAlarms: number;
}

export function scores(cases: Case[], threshold: number): Scores {
  const c = cases.filter((x) => x.fc !== null);
  const n = c.length;
  if (!n) return { n: 0, events: 0, bias: null, mae: null, maeClim: null, brier: null, brierClim: null, bss: null, pod: null, far: null, csi: null, auc: null, hits: 0, misses: 0, falseAlarms: 0 };
  let bias = 0, mae = 0, maeClim = 0, brier = 0, brierClim = 0, hits = 0, misses = 0, fa = 0, events = 0;
  for (const x of c) {
    const f = x.fc as number;
    bias += f - x.obs;
    mae += Math.abs(f - x.obs);
    maeClim += Math.abs(x.climMean - x.obs);
    const o = x.obs >= threshold ? 1 : 0;
    const p = x.prob ?? (f >= threshold ? 1 : 0);
    brier += (p - o) ** 2;
    brierClim += (x.clim - o) ** 2;
    events += o;
    if (o && p >= 0.5) hits++;
    else if (o) misses++;
    else if (p >= 0.5) fa++;
  }
  const pos = c.filter((x) => x.obs >= threshold).map((x) => x.prob ?? (x.fc as number));
  const neg = c.filter((x) => x.obs < threshold).map((x) => x.prob ?? (x.fc as number));
  return {
    n,
    events,
    bias: bias / n,
    mae: mae / n,
    maeClim: maeClim / n,
    brier: brier / n,
    brierClim: brierClim / n,
    bss: brierClim > 0 ? 1 - brier / brierClim : null,
    pod: hits + misses ? hits / (hits + misses) : null,
    far: hits + fa ? fa / (hits + fa) : null,
    csi: hits + misses + fa ? hits / (hits + misses + fa) : null,
    auc: auc(pos, neg),
    hits,
    misses,
    falseAlarms: fa,
  };
}

/** Mann-Whitney AUC: P(score of an event day > score of a non-event day), ties count half. */
export function auc(pos: number[], neg: number[]): number | null {
  if (!pos.length || !neg.length) return null;
  const sortedNeg = [...neg].sort((a, b) => a - b);
  let sum = 0;
  for (const p of pos) {
    // count neg < p and neg == p
    let lo = 0, hi = sortedNeg.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sortedNeg[mid] < p) lo = mid + 1; else hi = mid; }
    const below = lo;
    let hi2 = sortedNeg.length;
    let lo2 = lo;
    while (lo2 < hi2) { const mid = (lo2 + hi2) >> 1; if (sortedNeg[mid] <= p) lo2 = mid + 1; else hi2 = mid; }
    sum += below + 0.5 * (lo2 - below);
  }
  return sum / (pos.length * neg.length);
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

export interface Interval { est: number | null; lo: number | null; hi: number | null }

/**
 * Moving-block bootstrap over measurement days: consecutive days (all stations of a day together)
 * are resampled in blocks of `blockDays`, which keeps storm and spatial correlation inside blocks.
 */
export function bootstrapBlocks(cases: Case[], stat: (c: Case[]) => number | null, blockDays = 10, reps = 1000, seed = 7): Interval {
  const est = stat(cases);
  const days = [...new Set(cases.map((c) => c.day))].sort();
  if (days.length < 3 * blockDays) return { est, lo: null, hi: null };
  const byDay = new Map<string, Case[]>();
  for (const c of cases) byDay.set(c.day, [...(byDay.get(c.day) ?? []), c]);
  const nBlocks = Math.ceil(days.length / blockDays);
  const r = rng(seed);
  const vals: number[] = [];
  for (let b = 0; b < reps; b++) {
    const sample: Case[] = [];
    for (let k = 0; k < nBlocks; k++) {
      const start = Math.floor(r() * (days.length - blockDays + 1));
      for (let i = start; i < start + blockDays; i++) sample.push(...(byDay.get(days[i]) ?? []));
    }
    const v = stat(sample);
    if (v !== null && Number.isFinite(v)) vals.push(v);
  }
  vals.sort((a, b) => a - b);
  const q = (p: number) => vals.length ? vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] : null;
  return { est, lo: q(0.025), hi: q(0.975) };
}

/** Reliability table: forecast probability bins vs observed frequency. */
export function reliability(cases: Case[], threshold: number, edges = [0, 0.05, 0.15, 0.3, 0.5, 0.7, 0.9, 1.0001]): { bin: string; n: number; meanProb: number; obsFreq: number }[] {
  const out: { bin: string; n: number; meanProb: number; obsFreq: number }[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const inBin = cases.filter((c) => { const p = c.prob ?? ((c.fc ?? -1) >= threshold ? 1 : 0); return p >= edges[i] && p < edges[i + 1]; });
    if (!inBin.length) continue;
    out.push({ bin: `${edges[i].toFixed(2)}–${Math.min(1, edges[i + 1]).toFixed(2)}`, n: inBin.length, meanProb: inBin.reduce((a, c) => a + (c.prob ?? ((c.fc ?? -1) >= threshold ? 1 : 0)), 0) / inBin.length, obsFreq: inBin.filter((c) => c.obs >= threshold).length / inBin.length });
  }
  return out;
}
