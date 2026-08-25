export type ModelId =
  | "icon_seamless"
  | "gfs_seamless"
  | "ecmwf_ifs025"
  | "gem_seamless"
  | "meteofrance_seamless";

export interface HourlySeries {
  /** Local wall-clock timestamps in LOCATION.timezone, e.g. "2026-08-29T08:00" (no UTC offset). */
  time: string[];
  /** Precipitation in mm for the preceding hour, aligned index-for-index with `time`. Open-Meteo returns null at the edge of a model's actual horizon. */
  precipitation: (number | null)[];
}

export type HourlyByModel = Record<ModelId, HourlySeries>;

export type WindowPhase = "pred-schnutie" | "malovanie" | "schnutie";

export interface ModelWindowSummary {
  model: ModelId;
  maxHourlyMm: number;
  totalMm: number;
  hoursCovered: number;
  hoursExpected: number;
  dry: boolean;
}

export interface WindowFailure {
  model: ModelId;
  time: string;
  phase: WindowPhase;
  precipitationMm: number;
}

export interface WindowResult {
  candidateStart: string;
  windowStart: string;
  windowEnd: string;
  ok: boolean;
  perModel: ModelWindowSummary[];
  /** Every hour where precipitation reached the threshold, across all models - the reasons `ok` is false. */
  failures: WindowFailure[];
}
