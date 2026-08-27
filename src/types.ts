export interface WeatherPoint {
  /** Local wall-clock display string in LOCATION.timezone, e.g. "2026-08-26T14:00" - for labels only. */
  time: string;
  /** True UTC epoch milliseconds for this hour - always use this for scaling/comparisons, never re-parse `time`. */
  ms: number;
  /** Precipitation in mm for the preceding hour. Null where neither data source covers the hour. */
  precipitationMm: number | null;
  temperatureC: number | null;
  /** Global (solar) radiation - the sunlight proxy shared by both data sources, in W/m². */
  radiationWm2: number | null;
  /** Relative humidity 2m above ground, in %. */
  humidityPct: number | null;
  /** Dew point 2m above ground, °C. Direct from INCA (TD2M) for past hours; computed via
   * Magnus-Tetens from temperature+humidity for AROME forecast hours, which has no dew point field. */
  dewPointC: number | null;
  /** 10m wind speed, km/h. From INCA (UU/VV components) or AROME (10u/10v components). */
  windSpeedKmh: number | null;
  /** 10m maximum gust in the hour, km/h. Only available from AROME (10fg) - null for historical hours. */
  windGustKmh: number | null;
  /** C-LAEF-class ensemble (ensemble-v2-1h-1km) precipitation percentile spread for this hour, mm.
   * Only ever present for forecast hours the ensemble dataset actually covers - null everywhere else.
   * These are amount percentiles (p10/p50/p90), NOT an exceedance probability - see painting.ts's
   * rainProbabilityBand for how a probability band is derived from them without inventing precision
   * the ensemble doesn't support. */
  precipEnsemble: { p10: number; p50: number; p90: number } | null;
}

export type PaintingStatus = "GOOD" | "MARGINAL" | "BAD";

export interface PaintingWindow {
  startMs: number;
  endMs: number;
  durationHours: number;
}

export interface HourEvaluation {
  ms: number;
  status: PaintingStatus;
  /** True outside [sunrise, sunset) for this point's local day - painting in the dark is always excluded. */
  isDaylight: boolean;
  reasons: string[];
}

/** A manually entered wood moisture reading, since weather data alone can't know actual wood
 * moisture - see evaluatePaintingConditions's `manualWoodMoisture` option. */
export interface WoodMoistureReading {
  percent: number;
  measuredAt: Date;
}

export type TerraceDryingStatus = "LIKELY_WET" | "DRYING" | "LIKELY_DRY";

export interface TerraceDryingEstimate {
  status: TerraceDryingStatus;
  lastRainHoursAgo: number | null;
  rainSinceLastRainMm: number;
  favorableDryingHours: number;
}

export interface RainProbabilityBand {
  /** Lower/upper bound in percent, derived from the ensemble's p10/p50/p90 amount percentiles for
   * the window (a band, not a point estimate - see rainProbabilityBand's doc comment for why). */
  minPct: number;
  maxPct: number;
  label: string;
}

export interface PaintingAssessment {
  status: PaintingStatus;
  /** 0-100, from calculateDryingScore at the current hour - a drying-condition indicator, not a
   * certification of actual wood dryness. */
  score: number;
  reasons: string[];
  warnings: string[];
  bestWindow: PaintingWindow | null;
  /** Suitability per hour across the whole fetched window, for the timeline visualization. */
  hourly: HourEvaluation[];
  terraceDrying: TerraceDryingEstimate;
  manualWoodMoisture: WoodMoistureReading | null;
  metrics: {
    recentRainMm6h: number;
    recentRainMm12h: number;
    recentRainMm24h: number;
    upcomingRainMm6h: number;
    upcomingRainMm12h: number;
    upcomingRainMm24h: number;
    hoursUntilRain: number | null;
    temperatureC: number | null;
    relativeHumidity: number | null;
    dewPointC: number | null;
    dewPointSpreadC: number | null;
    windSpeedKmh: number | null;
    windGustKmh: number | null;
    solarRadiationWm2: number | null;
    dryingScore: number;
    rainProbability12h: RainProbabilityBand | null;
    rainProbability24h: RainProbabilityBand | null;
  };
}
