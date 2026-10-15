/**
 * The snow-cover curve of step 8 (METODIKA §4.7), a copy of data/cover/cover-model.json: the
 * probability that a station measures at least coverCm when ICON-D2 shows the given depth, fitted on
 * four winters at 17 stations (BSS 0.46, AUC 0.95; the test in src/ski.test.ts checks the copy).
 * The IFS 9 km depth verified poorly (two winters, BSS 0.25, station biases of either sign), so the
 * other horizons anchor to ICON-D2's level on the first day and add only their own model's change
 * (src/ski-core.js snowCover). The gate is a display choice, not a measurement.
 */
export const COVER_MODEL = {
  version: 1,
  fittedOn: "2026-10-15",
  /** A ski day needs at least this at the top station (the cover condition of step 1). */
  coverCm: 30,
  /** P(cover) = logistic(a + b * sqrt(model depth in cm)) at the lift opening hour. */
  curves: {
    icon_d2: { a: -6.7266, b: 1.2188 },
  },
  /** The model whose depth carries the level for every horizon. */
  anchor: "icon_d2",
  /** Below this probability the page says "Bez snehu" instead of judging the day. */
  gate: { minProb: 0.5 },
};
