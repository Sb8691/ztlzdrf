/**
 * The powder amount model of step 3 (METODIKA §4): pure functions shared by the offline fit
 * (scripts/model-fit.ts) and, from step 4 on, by src/ski-core.js. No imports and no Node API on
 * purpose, so the page can embed an identical copy.
 *
 * Forward model, per station and 24 h window:
 *   1. physics: hourly model output -> new snow in cm. Each hour's precipitation is split into snow
 *      and rain (by the model's own snowfall share, by wet-bulb temperature or by the page's dry
 *      2 m threshold), multiplied by a snow-to-liquid ratio that may rise with cold and fall with
 *      wind, and the 24 h sum is scaled by a station-height factor.
 *   2. uncertainty: the observed amount given the physics amount x and the lead time follows a
 *      normal distribution on the square-root scale, censored at zero (zero snow is a point mass):
 *      sqrt(Y) ~ N(mu, sigma), mu = a + b sqrt(x), sigma = c + d sqrt(x). P(Y >= 15 cm) and any
 *      quantile come from that distribution; lead enters through the four coefficients.
 */

export interface ModelHour {
  /** Precipitation of the hour (mm, liquid equivalent). */
  precip: number;
  /** The model's own snowfall of the hour (cm, Open-Meteo: water equivalent x 0.7). */
  snowfall: number;
  /** 2 m temperature (°C) and wet-bulb temperature (°C, null when the source lacks it). */
  temp: number;
  wetBulb: number | null;
  /** 10 m gust (km/h) or null. */
  gust: number | null;
}

export type Phase = "t2m" | "wetbulb" | "model";

export interface PhysicsParams {
  /** How an hour's precipitation is split into snow and rain. */
  phase: Phase;
  /** t2m / wetbulb: temperature of the 50 % point of the ramp; with phaseHalfWidthC = 0 a hard threshold. */
  phaseMidC: number;
  phaseHalfWidthC: number;
  /** Snow-to-liquid ratio (cm of snow per cm of water): slr0 at 0 °C, + slrPerDeg per °C of frost, clamped. */
  slr0: number;
  slrPerDeg: number;
  slrMin: number;
  slrMax: number;
  /** Wind packing: ratio x (1 - gustK x min(gust, 60) / 60). 0 switches it off. */
  gustK: number;
  /** Station-height factor exp(elevBeta x (z - zRef) / 1000). 0 switches it off. */
  elevBeta: number;
  zRef: number;
  /** Overall multiplier (settling, systematic bias). */
  scale: number;
}

/** Today's page rule (src/config.ts): precipitation x 0.7 cm/mm where T <= 1 °C. */
export const PAGE_RULE: PhysicsParams = { phase: "t2m", phaseMidC: 1, phaseHalfWidthC: 0, slr0: 7, slrPerDeg: 0, slrMin: 7, slrMax: 7, gustK: 0, elevBeta: 0, zRef: 1500, scale: 1 };

/** The model's own snowfall, unchanged. */
export const RAW_MODEL: PhysicsParams = { ...PAGE_RULE, phase: "model" };

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Share of the hour's precipitation that falls as snow, 0..1. */
export function snowFraction(h: ModelHour, p: PhysicsParams): number {
  if (p.phase === "model") return h.precip > 0 ? clamp(h.snowfall / 0.7 / h.precip, 0, 1) : 0;
  const t = p.phase === "wetbulb" && h.wetBulb !== null ? h.wetBulb : h.temp;
  if (p.phaseHalfWidthC <= 0) return t <= p.phaseMidC ? 1 : 0;
  return clamp((p.phaseMidC + p.phaseHalfWidthC - t) / (2 * p.phaseHalfWidthC), 0, 1);
}

/** Snow-to-liquid ratio of the hour. */
export function snowRatio(h: ModelHour, p: PhysicsParams): number {
  let r = clamp(p.slr0 + p.slrPerDeg * Math.max(0, -h.temp), p.slrMin, p.slrMax);
  if (p.gustK > 0 && h.gust !== null) r *= 1 - p.gustK * Math.min(h.gust, 60) / 60;
  return r;
}

/** New snow of one hour (cm) before the station factor. */
export function hourSnowCm(h: ModelHour, p: PhysicsParams): number {
  return h.precip > 0 ? h.precip * snowFraction(h, p) * snowRatio(h, p) / 10 : 0;
}

/** 24 h new snow (cm) at a station of height `elevation` m. */
export function amount24Cm(hours: ModelHour[], elevation: number, p: PhysicsParams): number {
  let s = 0;
  for (const h of hours) s += hourSnowCm(h, p);
  return s * p.scale * (p.elevBeta ? Math.exp(p.elevBeta * (elevation - p.zRef) / 1000) : 1);
}

// ---------------------------------------------------------------------------
// Normal distribution helpers (page-grade accuracy, no dependencies)
// ---------------------------------------------------------------------------

/** Standard normal CDF, absolute error < 1.5e-7 (Abramowitz & Stegun 7.1.26). */
export function normalCdf(z: number): number {
  if (z < -8) return 0;
  if (z > 8) return 1;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const tail = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI) * poly;
  return z >= 0 ? 1 - tail : tail;
}

export function normalPdf(z: number): number {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

/** Inverse standard normal CDF (Acklam's rational approximation, relative error ~1e-9). */
export function normalInv(p: number): number {
  if (!(p > 0 && p < 1)) return p <= 0 ? -Infinity : Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const low = 0.02425, high = 1 - low;
  let q: number, r: number;
  if (p < low) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > high) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  q = p - 0.5;
  r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// ---------------------------------------------------------------------------
// Censored normal on the square-root scale
// ---------------------------------------------------------------------------

export interface SpreadParams {
  /** mu = a + b sqrt(x), sigma = c + d sqrt(x), both on the sqrt(cm) scale. */
  a: number;
  b: number;
  c: number;
  d: number;
}

export function location(xCm: number, sp: SpreadParams): { mu: number; sigma: number } {
  const r = Math.sqrt(Math.max(0, xCm));
  return { mu: sp.a + sp.b * r, sigma: Math.max(0.05, sp.c + sp.d * r) };
}

/** P(Y >= thresholdCm | physics amount xCm). */
export function probAtLeast(xCm: number, thresholdCm: number, sp: SpreadParams): number {
  const { mu, sigma } = location(xCm, sp);
  return 1 - normalCdf((Math.sqrt(thresholdCm) - mu) / sigma);
}

/** Quantile q of Y in cm (0 where the censored mass covers q). */
export function quantileCm(xCm: number, q: number, sp: SpreadParams): number {
  const { mu, sigma } = location(xCm, sp);
  const z = mu + sigma * normalInv(q);
  return z <= 0 ? 0 : z * z;
}

/** Negative log-likelihood of observed amounts (cm) under the censored normal; the fitting target. */
export function tobitNll(cases: { x: number; y: number }[], sp: SpreadParams): number {
  let nll = 0;
  for (const k of cases) {
    const { mu, sigma } = location(k.x, sp);
    if (k.y <= 0) {
      const p = normalCdf(-mu / sigma);
      nll -= Math.log(Math.max(p, 1e-12));
    } else {
      const z = (Math.sqrt(k.y) - mu) / sigma;
      nll += 0.5 * z * z + Math.log(sigma) + 0.5 * Math.log(2 * Math.PI);
    }
  }
  return nll;
}

/** CRPS in cm of the censored normal against an observation, by numerical integration over 0..maxCm. */
export function crpsCm(xCm: number, yCm: number, sp: SpreadParams, maxCm = 80, stepCm = 0.25): number {
  const { mu, sigma } = location(xCm, sp);
  let s = 0;
  for (let t = 0; t < maxCm; t += stepCm) {
    const tm = t + stepCm / 2;
    const F = normalCdf((Math.sqrt(tm) - mu) / sigma);
    const H = yCm <= tm ? 1 : 0;
    s += (F - H) * (F - H) * stepCm;
  }
  return s;
}

/** CRPS of a point forecast = absolute error (for comparing deterministic and probabilistic sources). */
export const crpsPoint = (fcCm: number, yCm: number): number => Math.abs(fcCm - yCm);

// ---------------------------------------------------------------------------
// Minimiser: coordinate search with shrinking steps (robust for a handful of parameters)
// ---------------------------------------------------------------------------

export function minimize(f: (x: number[]) => number, x0: number[], steps: number[], opts: { rounds?: number; shrink?: number; minStep?: number } = {}): { x: number[]; value: number; evaluations: number } {
  const rounds = opts.rounds ?? 40, shrink = opts.shrink ?? 0.5, minStep = opts.minStep ?? 1e-4;
  const x = [...x0], step = [...steps];
  let best = f(x), evaluations = 1;
  for (let round = 0; round < rounds; round++) {
    let improved = false;
    for (let i = 0; i < x.length; i++) {
      if (step[i] === 0) continue;
      for (const dir of [1, -1]) {
        const trial = [...x];
        trial[i] += dir * step[i];
        const v = f(trial);
        evaluations++;
        if (Number.isFinite(v) && v < best - 1e-12) { best = v; x[i] = trial[i]; improved = true; break; }
      }
    }
    if (!improved) {
      for (let i = 0; i < step.length; i++) step[i] *= shrink;
      if (Math.max(...step.map(Math.abs)) < minStep) break;
    }
  }
  return { x, value: best, evaluations };
}

// ---------------------------------------------------------------------------
// Lead-time law: the four coefficients move linearly with the lead time
// ---------------------------------------------------------------------------

export interface LeadLaw {
  /** Coefficient value at leadRefH plus slope per day of lead: a = a0 + a1 x (lead - leadRefH) / 24, etc. */
  leadRefH: number;
  a0: number; a1: number;
  b0: number; b1: number;
  c0: number; c1: number;
  d0: number; d1: number;
  /** Leads the law was fitted on; outside it the page extrapolates (clamped to maxLeadH). */
  minLeadH: number;
  maxLeadH: number;
}

/** Spread parameters at a lead time (hours from the run's publication to the end of the 24 h window). */
export function spreadAt(law: LeadLaw, leadH: number): SpreadParams {
  const l = (Math.min(Math.max(leadH, 0), law.maxLeadH) - law.leadRefH) / 24;
  return { a: law.a0 + law.a1 * l, b: law.b0 + law.b1 * l, c: law.c0 + law.c1 * l, d: law.d0 + law.d1 * l };
}
