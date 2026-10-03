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

/** eHYD (Hydrographischer Dienst), CC BY 4.0, "Datenquelle: ehyd.gv.at". Files per station are the
 * `file=N` numbers of MessstellenExtraData/nlv as found on 3 Oct 2026. Data end 2023. */
export const EHYD_STATIONS = [
  {
    hzb: 123133,
    name: "Turracher Höhe",
    elevation: 1777,
    // 46°55'11" N, 13°52'46" E (MGI/Bessel; the datum shift is ~0.001°, irrelevant here).
    latitude: 46.9197,
    longitude: 13.8794,
    files: { stammdaten: 1, precipDaily: 2, newSnowDaily: 3, snowDepthDaily: 4, precip5min: 5, tempDaily: 6 },
  },
  {
    hzb: 114652,
    name: "Falkert",
    elevation: 1887,
    latitude: 46.8586,
    longitude: 13.8317,
    files: { stammdaten: 1, precipDaily: 2, tempDaily: 3 },
  },
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
export const LWD_SMET = "https://smet.hydrographie.info";
