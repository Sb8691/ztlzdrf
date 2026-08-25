import type { ModelId } from "./types.js";

export const LOCATION = {
  name: "Zedlitzdorf, Gnesau (Feldkirchen, Kärnten, Rakúsko)",
  latitude: 46.79917,
  longitude: 13.92222,
  timezone: "Europe/Vienna",
};

export const MODELS: ModelId[] = [
  "icon_seamless",
  "gfs_seamless",
  "ecmwf_ifs025",
  "gem_seamless",
  "meteofrance_seamless",
];

/** icon_seamless has the shortest horizon (~7.5 days) of the selected models. */
export const FORECAST_DAYS = 7;

/** Also fetch this many days of recent past-actuals (same API call, merged into the hourly arrays). */
export const PAST_DAYS = 2;

/** Rolling window around "now" shown in the dashboard's daily rain chart. */
export const ROLLING_WINDOW = {
  pastDays: 2,
  aheadDays: 2,
};

export const WINDOW = {
  preDryHours: 24,
  paintHours: 6,
  postDryHours: 12,
  rainThresholdMm: 0.1,
};

/** Bucket width for the rain charts (candidate cards + rolling section) - coarser than raw hourly. */
export const RAIN_CHART_INTERVAL_HOURS = 3;

/** Weekday (JS convention: 0 = Sunday .. 6 = Saturday) + hour of candidate painting starts. */
export const CANDIDATE_STARTS = [
  { weekday: 5, hour: 8 }, // Friday 08:00
  { weekday: 6, hour: 8 }, // Saturday 08:00
  { weekday: 0, hour: 8 }, // Sunday 08:00
];

/** Only send an alert if the suitable start is within this many days from now. */
export const ALERT_LOOKAHEAD_DAYS = 5;
