export type ModelId =
  | "icon_seamless"
  | "gfs_seamless"
  | "ecmwf_ifs025"
  | "gem_seamless"
  | "meteofrance_seamless";

export interface HourlySeries {
  /** Local wall-clock timestamps in LOCATION.timezone, e.g. "2026-08-29T08:00" (no UTC offset). */
  time: string[];
  /** Precipitation in mm for the preceding hour, aligned index-for-index with `time`. */
  precipitation: number[];
}

export type HourlyByModel = Record<ModelId, HourlySeries>;

export interface ModelWindowSummary {
  model: ModelId;
  maxHourlyMm: number;
  totalMm: number;
}

export interface WindowResult {
  candidateStart: string;
  windowStart: string;
  windowEnd: string;
  ok: boolean;
  perModel: ModelWindowSummary[];
}
