export const LOCATION = {
  name: "Zedlitzdorf 74, Gnesau (Feldkirchen, Kärnten, Rakúsko)",
  latitude: 46.7998317,
  longitude: 13.9201988,
  timezone: "Europe/Vienna",
};

/**
 * Chart/data window: this many hours behind "now" (INCA analysis) and ahead of "now" (AROME
 * forecast + ensemble). The past leg matters because recent rain/overnight humidity determines
 * whether the wood may still be wet; the future leg matters because the coating needs a rain-free
 * curing period after application.
 *
 * 60h ahead is the maximum useful horizon: AROME/the ensemble both publish a 61h forecast_length
 * per reference_time cycle (new cycle every 3h), so the real available horizon from "now" is
 * typically ~52-58h depending on cycle age - a couple of hours short of the full 60h right before a
 * new cycle lands. This is NOT a bug to work around: fetchWeatherWindow simply returns however many
 * hours are actually available (never synthesizes missing tail data), and the painting engine
 * treats "ran out of forecast data" as unknown/unconfirmed rather than assuming clear skies.
 */
export const CHART_WINDOW = {
  pastHours: 24,
  aheadHours: 60,
};

/**
 * Initial decision-support defaults for the painting-suitability engine (src/painting.ts).
 * These are meteorological drying-condition heuristics we chose, NOT manufacturer-certified
 * requirements for any specific paint/stain product - adjust freely once you check the technical
 * datasheet for whatever coating is actually being used.
 */
export const PAINTING_RULES = {
  temperature: {
    min: 10,
    preferredMin: 15,
    preferredMax: 28,
    max: 30,
  },
  humidity: {
    preferredMax: 75,
    absoluteMax: 85,
  },
  dewPointSpread: {
    minimum: 2,
    preferred: 3,
  },
  precipitation: {
    maxDuringApplicationMm: 0,
    minDryHoursBeforePainting: 12,
    minRainFreeHoursAfterPainting: 12,
  },
  wind: {
    preferredMinKmh: 2,
    preferredMaxKmh: 20,
    absoluteMaxKmh: 30,
  },
  /** A manually measured wood moisture reading above this overrides the weather-based estimate to
   * BAD outright; at or below it, the human measurement is trusted over the weather-based
   * LIKELY_WET guess. A common exterior-coating rule of thumb, not a certified spec - check the
   * product datasheet. */
  woodMoisture: {
    maxPercent: 18,
  },
};

/** T - Td (dew point spread) thresholds: below `red` risks surface condensation/dew, above
 * `yellow` is comfortably safe. Kept separate from PAINTING_RULES.dewPointSpread (which drives the
 * pass/fail decision) since this is specifically the display-coloring split from spec section 6. */
export const DEW_POINT_SPREAD_DISPLAY_THRESHOLDS = { red: 2, yellow: 3 };

/** Relative humidity display-coloring thresholds (spec section 7) - a readability aid, not a
 * coating specification. */
export const HUMIDITY_DISPLAY_THRESHOLDS = { green: 75, yellow: 85 };

/** Minimum measurable precipitation, mm/h - below this we treat an hour as effectively dry rather
 * than flagging trace/instrument noise as "rain". Used throughout painting.ts. */
export const RAIN_THRESHOLD_MM = 0.1;

export interface OutlookModel {
  /** Open-Meteo Ensemble API `models=` id. */
  id: string;
  label: string;
  /** Open-Meteo data domain for `.../data/{domain}/static/meta.json` (model run metadata), or null
   * when the domain exposes no usable metadata - the run is then labelled by fetch time. */
  metaDomain: string | null;
  /** Exactly one model is primary: its runs define snapshot identity, its members feed the
   * meteogram and the e-mail/dashboard digest. A failing primary aborts the outlook run. */
  primary?: boolean;
  /** Optional models are expected to have no data for the window at first (short horizon) and
   * simply join the history once they reach it. Never logged as an error. */
  optional?: boolean;
}

/**
 * Medium-range "target window" outlook (src/outlook.ts): watches how the ensemble forecast for a
 * fixed set of days evolves run by run, far beyond the +60h horizon of the daily decision above.
 * Every ensemble member is judged with the same hourly rules (PAINTING_RULES), so "probability of
 * a paintable day" = share of members whose day contains a contiguous GOOD run >= minGoodHours.
 * The window can be overridden per run with OUTLOOK_START / OUTLOOK_END (ISO dates).
 */
export const OUTLOOK = {
  /** Local calendar dates, inclusive. */
  window: { start: "2026-10-01", end: "2026-10-04" },
  /** Days fetched before/after the window so the 12h dry-before and 12h rain-free-after rules have
   * real data at both edges instead of "unknown". */
  paddingDays: 1,
  models: [
    { id: "ecmwf_ifs025", label: "ECMWF IFS ENS", metaDomain: "ecmwf_ifs025_ensemble", primary: true },
    { id: "ecmwf_aifs025", label: "ECMWF AIFS ENS", metaDomain: "ecmwf_aifs025_ensemble" },
    { id: "gfs05", label: "GEFS 0,5°", metaDomain: "ncep_gefs05" },
    { id: "ecmwf_ifs_europe_ensemble", label: "ECMWF IFS ENS 9 km", metaDomain: null, optional: true },
  ] as OutlookModel[],
  /** A member's day counts as paintable when its longest contiguous GOOD run is at least this
   * long (a terrace coat plus a margin), and as "possible" when its longest non-BAD run is. */
  minGoodHours: 4,
  /** A member's day counts as rainy when its precipitation sum reaches this (mm). */
  rainDayThresholdMm: 1.0,
  /** Day verdict from member shares: GOOD when P(paintable) >= good; MARGINAL when P(paintable)
   * >= marginal or P(possible) >= possibleMarginal; BAD otherwise. */
  dayStatus: { good: 0.6, marginal: 0.3, possibleMarginal: 0.6 },
  /** Per-hour consensus for the meteogram strip: share of members GOOD / non-BAD. */
  hourConsensus: { good: 0.6, marginal: 0.3 },
  /** Trend arrow: compare with the newest run at least minAgeHours older; below minDeltaPct
   * (percentage points) the trend is flat. */
  trend: { minDeltaPct: 10, minAgeHours: 24 },
};

export type OutlookConfig = typeof OUTLOOK;
