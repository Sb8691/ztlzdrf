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
