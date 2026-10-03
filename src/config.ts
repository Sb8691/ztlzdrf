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
  timezone: "Europe/Vienna",
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
