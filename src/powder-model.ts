/**
 * Coefficients of the calibrated POWDER_SNEH model (METODIKA §4), copied from
 * data/model/powder-model.json as written by `npm run model` on 4 Oct 2026. A test checks that the
 * two agree, so a re-fit after a season is a copy here plus a bump of `version`.
 *
 * The page embeds this with the rest of the configuration, so a browser refresh computes the same
 * probabilities as the generator did.
 */

/** Coefficients linear in the lead time: value at leadRefH plus slope per day, lead clamped to [0, maxLeadH]. */
export interface PowderLaw {
  leadRefH: number;
  minLeadH: number;
  maxLeadH: number;
  h00: number; h01: number;
  h10: number; h11: number;
  a0: number; a1: number;
  b0: number; b1: number;
  c0: number; c1: number;
  d0: number; d1: number;
}

export const POWDER_MODEL = {
  /** Bumped with every re-fit; recorded in the snapshot. */
  version: 1,
  fittedOn: "2026-10-04",
  /** POWDER_SNEH = at least this much new snow in the 24 h window. */
  thresholdCm: 15,
  /** The window ends at this local hour of the ski day and starts 24 h earlier (lifts open at 9). */
  windowHour: 9,
  /**
   * Hours from a model run's initialisation to its availability on Open-Meteo, so the lead time
   * counts from when the forecast could be read, as in the backtest (IFS as calibrated there;
   * the others from meta.json on 3-4 Oct 2026). Without run metadata the fetch time stands in.
   */
  publishDelayH: { ecmwf_ifs: 7, icon_d2: 1.5, geosphere_arome_austria: 3.5, ecmwf_ifs025: 10.5 } as Record<string, number>,
  /**
   * Two-part distribution of the 24 h new snow Y given the page rule's amount x (cm) at the top:
   * P(Y > 0) = Phi(h0 + h1 sqrt x); sqrt Y | Y > 0 ~ Normal(a + b sqrt x, c + d sqrt x) truncated at 0.
   * One law per Open-Meteo model id; a horizon whose model has no law gets no probability.
   */
  laws: {
    /** ECMWF IFS 9 km: single runs 00z/12z of winters 2024/25 and 2025/26 at 6 stations; lead 23-131 h. */
    ecmwf_ifs: { leadRefH: 23, minLeadH: 23, maxLeadH: 131, h00: -1.339, h01: 0, h10: 0.896, h11: 0, a0: 1.419, a1: 0, b0: 0.57, b1: -0.032, c0: 0.891, c1: 0, d0: 0, d1: 0 },
    /** ICON-D2: Historical Forecast 2022/23-2025/26 at 14 stations (lead 0) and Previous Runs one day ahead; lead 0-47 h. */
    icon_d2: { leadRefH: 0, minLeadH: 0, maxLeadH: 47, h00: -1.594, h01: 0, h10: 1.7, h11: 0, a0: 0.933, a1: 0, b0: 0.875, b1: -0.086, c0: 0.727, c1: 0, d0: 0, d1: 0 },
  } as Record<string, PowderLaw>,
  /**
   * When the probability becomes a POWDER flag. The owner left the cost ratio N (a missed powder
   * day against a wasted trip) open on 4 Oct 2026, so this is a default, not a measurement: with the
   * resorts a short drive from home a wasted trip is cheap and a missed day expensive, N = 4, and the
   * decision-theory threshold is p* = 1 / (N + 1) = 0.2. Out of sample (data/model/REPORT.md) that
   * catches 3 of 4 powder days a day ahead at the price of about 2.7 false alerts per station and
   * season. One number to change.
   */
  alert: { costRatioN: 4, minProb: 0.2 },
  /** Stage of a flagged day by its offset from the first ski day (brief of 3 Oct 2026): ALERT D0-D+1, POZOR D+2-D+3, VÝHĽAD D+4-D+9. */
  stages: [
    { maxDayOffset: 1, stage: "alert" },
    { maxDayOffset: 3, stage: "pozor" },
    { maxDayOffset: 9, stage: "vyhlad" },
  ] as { maxDayOffset: number; stage: "alert" | "pozor" | "vyhlad" }[],
};

export type PowderModel = typeof POWDER_MODEL;
