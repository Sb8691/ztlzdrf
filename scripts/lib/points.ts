/**
 * Where truth is measured and where forecasts are evaluated.
 *
 * Resort lift stations come from src/config.ts. The measuring stations below are the ones the
 * step-0 audit (3 Oct 2026) found usable within reach of the four resorts; their coordinates and
 * heights are from the operators' metadata. GeoSphere station coordinates are filled in from the
 * Data Hub metadata at fetch time.
 */
import { SKI_RESORTS } from "../../src/config.js";

export interface Point {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  elevation: number;
}

export const RESORT_POINTS: Point[] = SKI_RESORTS.flatMap((r) => [
  { ...r.top, id: `${r.id}:top`, name: `${r.name} – ${r.top.name}` },
  { ...r.base, id: `${r.id}:base`, name: `${r.name} – ${r.base.name}` },
]).map(({ id, name, latitude, longitude, elevation }) => ({ id, name, latitude, longitude, elevation }));

/** eHYD (Hydrographischer Dienst), CC BY 4.0, "Datenquelle: ehyd.gv.at". Precipitation/snow stations
 * (NLV) within 25 km of the resorts that measure new snow by hand at 07:00, plus the higher
 * precipitation-only stations for the rain/snow phase. Data end 31 Aug / 31 Dec 2023. Which export files
 * a station offers is read from Messstellen/info at fetch time. Coordinates are the eHYD map points
 * (WebMercator → WGS84). */
export const EHYD_STATIONS = [
  { hzb: 123133, name: "Turracher Höhe", elevation: 1777, latitude: 46.9197, longitude: 13.8794, note: "ručný nový sneh a výška snehu 1998–2023, zrážky aj 5-min, denná T; 1,8 km od Kornockbahn" },
  { hzb: 114652, name: "Falkert", elevation: 1887, latitude: 46.8581, longitude: 13.8309, note: "len zrážky 1985–2023 a denná T; 1,6 km od hornej stanice Falkertlift" },
  { hzb: 114447, name: "St. Oswald", elevation: 1373, latitude: 46.8472, longitude: 13.7647, note: "zrážky 1974–2023 a denná T; dolina pod Falkertom a BKK (fáza zrážok dole)" },
  { hzb: 113332, name: "Innerkrems", elevation: 1567, latitude: 46.9711, longitude: 13.7506, note: "zrážky 1971–2023 a denná T; severne pod Turracher Höhe" },
  { hzb: 113548, name: "Afritz", elevation: 712, latitude: 46.7271, longitude: 13.7947, note: "zrážky 1971–2023 vrátane 5-min, denná T; 6,7 km od dolnej stanice BKK" },
  { hzb: 114694, name: "Maitratten-Sonnleiten", elevation: 976, latitude: 46.7863, longitude: 13.9318, note: "ručný nový sneh a výška snehu 1988–2023; údolie pod Hochrindlom" },
  { hzb: 113936, name: "Sirnitz", elevation: 823, latitude: 46.8229, longitude: 14.0584, note: "ručný nový sneh a výška snehu 1970–2023; údolie pod Hochrindlom" },
  { hzb: 111591, name: "Thomatal", elevation: 1071, latitude: 47.0771, longitude: 13.7337, note: "ručný nový sneh, výška snehu, 5-min zrážky 1970–2023; Lungau, severná strana Nockbergov" },
  { hzb: 115055, name: "Kendlbruck", elevation: 940, latitude: 47.0696, longitude: 13.8817, note: "ručný nový sneh, výška snehu, 5-min zrážky 2006–2023; údolie Mury, sever" },
  { hzb: 113464, name: "Hochegg", elevation: 1026, latitude: 46.7329, longitude: 13.5656, note: "ručný nový sneh a výška snehu 1970–2023; juhozápadne od BKK" },
  { hzb: 114165, name: "Dreifaltigkeit", elevation: 1096, latitude: 46.8038, longitude: 14.2698, note: "ručný nový sneh a výška snehu 1970–2023; Gurktal, východne od Hochrindlu" },
] as const;

/** GeoSphere Austria Data Hub, CC BY 4.0. `manual` = daily hand measurements (shneu_manu,
 * sh_manu at 06 UTC), `auto` = automatic sensors (sh, rr, ffx, so_h; 10-min and hourly too). */
export const GEOSPHERE_STATIONS = [
  { id: 20020, name: "Villacher Alpe (ručná)", elevation: 2140, manual: true, auto: false },
  { id: 20021, name: "Villacher Alpe (automat)", elevation: 2117, manual: false, auto: true },
  { id: 122, name: "Kanzelhöhe", elevation: 1520, manual: true, auto: true },
  { id: 186, name: "Flattnitz", elevation: 1437, manual: true, auto: true },
  { id: 15715, name: "Katschberg", elevation: 1635, manual: false, auto: true },
  { id: 20105, name: "Arriach", elevation: 890, manual: false, auto: true },
  { id: 103, name: "Weitensfeld", elevation: 704, manual: false, auto: true },
] as const;

/** LWD Kärnten stations (10-min SMET from smet.hydrographie.info, rolling 12 months). No published
 * licence: used privately until LWD Kärnten answers; the files stay outside git. */
export const LWD_STATIONS = [
  { id: 2900265, name: "Turracherhoehe", elevation: 1795, latitude: 46.9195, longitude: 13.8731 },
  { id: 2900240, name: "Falkert", elevation: 1886, latitude: 46.8580627, longitude: 13.8308913 },
] as const;

export const GEOSPHERE_HUB = "https://dataset.api.hub.geosphere.at/v1";
export const EHYD_EXTRA = "https://ehyd.gv.at/services/MessstellenExtraData/nlv";
export const EHYD_INFO = "https://ehyd.gv.at/services/Messstellen/info";
export const LWD_SMET = "https://smet.hydrographie.info";
