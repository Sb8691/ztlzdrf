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
}
