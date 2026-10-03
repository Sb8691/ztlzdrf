export const LOCATION = {
  name: "Zedlitzdorf 74, Gnesau (Feldkirchen, Kärnten, Rakúsko)",
  latitude: 46.7998317,
  longitude: 13.9201988,
  timezone: "Europe/Vienna",
};

/**
 * The painting window the main page is about (src/window-core.js, src/window-page.ts): a fixed set
 * of local calendar days, every hour of which is a candidate start for one 8h coat.
 *
 * Everything the algorithm needs lives here, so moving the window or switching the monitored period
 * from 24h to 48h is a config change, never a code change. The request dates are derived from these
 * numbers too: the last start (end 23:00) plus applicationHours + postApplicationHours decides how
 * far past the window the forecast has to reach.
 *
 * The two thresholds are a deliberately transparent filter over ensemble scenarios, NOT a drying
 * model and not a manufacturer guarantee: SEFRA Novalux Holztec 80.0 asks for >= 7 C air and
 * substrate and <= 15 % wood moisture, and wood moisture is something only a meter can tell us.
 * 0.2 mm over the whole window is this algorithm's working tolerance for "effectively dry", not a
 * statement that such a shower leaves the coat unharmed.
 */
export const PAINT_WINDOW = {
  /** Local calendar dates, inclusive. Displayed 1 Oct 00:00 -> 6 Oct 00:00 local. */
  start: "2026-10-01",
  end: "2026-10-05",
  /**
   * One coat is 8h of work, but it does not have to happen in one go - 3h one day and 5h another is
   * fine, so the length of a single session is what the reader picks; this is only the default.
   * Each session carries its own watch period: whatever was just coated needs those hours, so a
   * shorter session is judged over a correspondingly shorter window.
   */
  applicationHours: 8,
  postApplicationHours: 24,
  /** Painting only happens between these local hours, so a session must fit inside them: the
   * earliest start is workDayStartHour and the latest end is workDayEndHour. With 8h that leaves
   * starts 08:00-11:00; with 3h it leaves 08:00-16:00. */
  workDayStartHour: 8,
  workDayEndHour: 19,
  minimumAirTemperatureC: 7,
  maximumWindowPrecipitationMm: 0.2,
  /** Explicitly chosen model (no "auto" seamless blend), for both the charts and the members. */
  model: "ecmwf_ifs025",
  /** Open-Meteo data domain for the ensemble's run metadata (last_run_initialisation_time). */
  metaDomain: "ecmwf_ifs025_ensemble",
  modelLabel: "ECMWF IFS 0,25°",
  /** Verified live 2026-09-23 against the product schema: `temperature_2m` (control) plus
   * `_member01..._member50`. The expected count is what the denominator is built from - members are
   * discovered from the response by pattern, but a response that does not carry all of them yields
   * "not enough data" rather than a quietly smaller denominator. */
  expectedEnsembleMembers: 51,
  /** A generator run reuses a snapshot younger than this instead of re-fetching (the CI job runs
   * the generator and the e-mail minutes apart, and a cache must never pose as a new model run). */
  serverMinRefreshMinutes: 20,
  /** The open page refreshes itself at most this often, and only while it is actually visible. */
  clientRefreshMinutes: 60,
};

export type PaintWindowConfig = typeof PAINT_WINDOW;

/** What the page, the generator and the tests all hand to src/window-core.js - the painting window
 * plus the place it is about. Embedded verbatim in the published page, so the browser recomputes a
 * refresh with exactly the settings the snapshot was built with. */
export const WINDOW_CONFIG = {
  ...PAINT_WINDOW,
  latitude: LOCATION.latitude,
  longitude: LOCATION.longitude,
  timezone: LOCATION.timezone,
};

export type WindowConfig = typeof WINDOW_CONFIG;

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
  /** Local calendar dates, inclusive - kept in step with PAINT_WINDOW above, which is what the site
   * and the e-mail are actually about now. */
  window: { start: PAINT_WINDOW.start, end: PAINT_WINDOW.end },
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
  /** Plain-language layer (src/outlook-plain.ts): P(rain day) at or above `rainLikely` reads as
   * "dážď", at or above `rainPossible` as "možno prehánky", below as "sucho". The cold/humid
   * qualifiers reuse PAINTING_RULES.temperature.preferredMin and humidity.preferredMax. */
  plain: { rainLikely: 0.5, rainPossible: 0.3 },
};

export type OutlookConfig = typeof OUTLOOK;

/**
 * The ski-conditions page (src/ski-core.js): four resorts, each judged at its lowest lift valley
 * station ("base") and its highest lift top station ("top").
 *
 * Station positions are the OpenStreetMap aerialway nodes and the heights are those of the lift
 * stations (lift-world.info, cross-checked against EU-DEM/SRTM/ASTER/Copernicus on 2026-10-03) -
 * not the resorts' marketing ranges, which quote nearby summits no lift reaches (Falkert 2308 m,
 * Hochrindl Kruckenspitz 1886 m). The base is the lowest lift because that is where rain and soft
 * snow show first.
 *
 * Snow report links go to the resort's own lift/piste status where one exists, else to bergfex
 * (Falkert has none; Hochrindl's own page only links to bergfex).
 */
export const SKI_RESORTS = [
  {
    id: "bad-kleinkirchheim",
    name: "Bad Kleinkirchheim / St. Oswald",
    /** Soft hyphen, so the narrow phone table column can break the long word. */
    shortName: "Bad Klein\u00adkirchheim",
    base: { name: "Sonnwiesenbahn I", latitude: 46.8116, longitude: 13.7727, elevation: 1017 },
    top: { name: "Kaiserburgbahn II", latitude: 46.7835, longitude: 13.8267, elevation: 2043 },
    links: {
      snowReport: "https://www.badkleinkirchheim.com/skigebiet/pisten-anlagen/",
      webcam: "https://www.badkleinkirchheim.com/info-kontakt/webcams/",
    },
  },
  {
    id: "falkert",
    name: "Falkert (Heidi Alm)",
    shortName: "Falkert",
    base: { name: "Falkertlift, dolná stanica", latitude: 46.8639, longitude: 13.8323, elevation: 1840 },
    top: { name: "Falkertlift, horná stanica", latitude: 46.8702, longitude: 13.8192, elevation: 2107 },
    links: {
      snowReport: "https://www.bergfex.at/falkert/schneebericht/",
      webcam: "https://www.heidialm.at/de/service/wetter-und-webcams",
    },
  },
  {
    id: "turracher-hoehe",
    name: "Turracher Höhe",
    shortName: "Turracher Höhe",
    base: { name: "Turrachbahn", latitude: 46.9416, longitude: 13.8901, elevation: 1396 },
    top: { name: "Kornockbahn", latitude: 46.9156, longitude: 13.8559, elevation: 2197 },
    links: {
      snowReport: "https://www.turracherhoehe.at/de/winter/bahnen-und-pisten",
      webcam: "https://www.turracherhoehe.at/de/aktuelles/webcams",
    },
  },
  {
    id: "hochrindl",
    name: "Hochrindl",
    shortName: "Hochrindl",
    base: { name: "Sonnenlift", latitude: 46.85, longitude: 13.978, elevation: 1476 },
    top: { name: "Kruckenlift", latitude: 46.8389, longitude: 13.9695, elevation: 1832 },
    links: {
      snowReport: "https://www.bergfex.at/hochrindl/schneebericht/",
      webcam: "https://www.hochrindl.at/webcams/",
    },
  },
];

/**
 * Everything src/ski-core.js needs; embedded verbatim in the published page so a browser refresh
 * recomputes with exactly these settings.
 *
 * One model per horizon, so numbers from different models never sit side by side. The rules are a
 * deliberately transparent filter, not a guarantee: the models know nothing about grooming,
 * snowmaking or whether a resort is open, and their gust is the model cell's 10 m gust, not the
 * summit's.
 */
export const SKI_CONFIG = {
  timezone: LOCATION.timezone,
  /** All four resorts run 09:00-16:00 (official for Bad Kleinkirchheim and Turracher Höhe; bergfex
   * and skiresort for Falkert and Hochrindl). */
  liftOpenHour: 9,
  liftCloseHour: 16,
  resorts: SKI_RESORTS,
  horizons: {
    now: { days: 1, model: "geosphere_arome_austria", metaDomain: "geosphere_arome_austria", label: "GeoSphere AROME 2,5 km", ensemble: false },
    short: { days: 3, model: "ecmwf_ifs", metaDomain: "ecmwf_ifs", label: "ECMWF IFS 9 km", ensemble: false },
    long: {
      days: 10,
      model: "ecmwf_ifs025",
      metaDomain: "ecmwf_ifs025_ensemble",
      label: "ECMWF ENS 0,25°",
      ensemble: true,
      /** Control + 50 members, verified live 2026-10-03. */
      expectedMembers: 51,
    },
  },
  rules: {
    /** At or below this station temperature an hour's precipitation counts as snow, above as rain. */
    snowMaxTempC: 1,
    /** Open-Meteo's own snowfall ratio (7 cm of snow = 10 mm of water), so a cold station's snow
     * equals the API's snowfall field. */
    snowCmPerMm: 0.7,
    /** Fresh snow = the top station's snow in these hours before the lifts open plus the lift day. */
    freshSnowHours: 72,
    /** Fresh snow from here on adds the "prašan" tag; it never makes a day worse. */
    powderCm: 10,
    /** Rain at the base during lift hours: from rainBadMm the day is bad, from rainFairMm fair. */
    rainBadMm: 1,
    rainFairMm: 0.2,
    /** Strongest gust at the top during lift hours: above gustBadKmh lifts may stop (bad), above
     * gustFairKmh it is windy (fair). */
    gustBadKmh: 60,
    gustFairKmh: 40,
    /** At least this share of lift hours with the base above softSnowTempC = soft snow (fair). */
    softSnowTempC: 3,
    softSnowShare: 0.5,
    /** Less sunshine than this during lift hours = overcast, poorer visibility (fair). */
    minSunHours: 1,
  },
  /** A generator run reuses a snapshot younger than this instead of re-fetching. */
  serverMinRefreshMinutes: 20,
  /** The open page refreshes itself at most this often, and only while it is visible. */
  clientRefreshMinutes: 60,
};

export type SkiConfig = typeof SKI_CONFIG;
