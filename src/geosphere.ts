import { LOCATION } from "./config.js";
import type { WeatherPoint } from "./types.js";

const FORECAST_BASE = "https://dataset.api.hub.geosphere.at/v1/timeseries/forecast";
const HISTORICAL_BASE = "https://dataset.api.hub.geosphere.at/v1/timeseries/historical";
const AROME_DATASET = "nwp-v2-1h-1km";
const INCA_DATASET = "inca-v1-1h-1km";

interface GeoSphereResponse {
  timestamps: string[];
  features: [{ properties: { parameters: Record<string, { data: (number | null)[] }> } }];
}

function toLocalWallClock(isoUtc: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(isoUtc));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Formats a Date as the naive "YYYY-MM-DDTHH:MM" (UTC) string GeoSphere's start/end params expect. */
function toUtcParam(d: Date): string {
  return d.toISOString().slice(0, 16);
}

async function fetchDataset(
  baseUrl: string,
  datasetId: string,
  parameters: string[],
  extraParams?: Record<string, string>
): Promise<GeoSphereResponse> {
  const url = new URL(`${baseUrl}/${datasetId}`);
  for (const p of parameters) url.searchParams.append("parameters", p);
  url.searchParams.set("lat_lon", `${LOCATION.latitude},${LOCATION.longitude}`);
  for (const [k, v] of Object.entries(extraParams ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GeoSphere ${datasetId} request failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as GeoSphereResponse;
}

function toPoints(
  response: GeoSphereResponse,
  precipParam: string,
  tempParam: string,
  radiationParam: string,
  humidityParam: string
): WeatherPoint[] {
  const params = response.features[0].properties.parameters;
  const precip = params[precipParam]?.data;
  const temp = params[tempParam]?.data;
  const radiation = params[radiationParam]?.data;
  const humidity = params[humidityParam]?.data;
  if (!precip || !temp || !radiation || !humidity) {
    throw new Error(
      `Missing expected parameters in GeoSphere response for ${precipParam}/${tempParam}/${radiationParam}/${humidityParam}`
    );
  }
  return response.timestamps.map((t, i) => ({
    time: toLocalWallClock(t, LOCATION.timezone),
    ms: new Date(t).getTime(),
    precipitationMm: precip[i] ?? null,
    temperatureC: temp[i] ?? null,
    radiationWm2: radiation[i] ?? null,
    humidityPct: humidity[i] ?? null,
  }));
}

/**
 * Builds a single hourly series spanning [now - pastHours, now + aheadHours): the past leg comes
 * from INCA (GeoSphere's observed 1km/1h analysis, not a forecast), the future leg from AROME.
 * The ~1h INCA latency means the most recent hour before "now" may simply be absent from either
 * leg - left out rather than synthesized, consistent with "null at the edge of the horizon".
 */
export async function fetchWeatherWindow(
  now: Date,
  pastHours: number,
  aheadHours: number
): Promise<WeatherPoint[]> {
  const pastStart = new Date(now.getTime() - pastHours * 3600_000);
  const aheadEnd = new Date(now.getTime() + aheadHours * 3600_000);

  const [inca, arome] = await Promise.all([
    fetchDataset(HISTORICAL_BASE, INCA_DATASET, ["RR", "T2M", "GL", "RH2M"], {
      start: toUtcParam(pastStart),
      end: toUtcParam(now),
    }),
    fetchDataset(FORECAST_BASE, AROME_DATASET, ["tp", "2t", "ssrd", "2r"]),
  ]);

  const pastPoints = toPoints(inca, "RR", "T2M", "GL", "RH2M");
  const futurePoints = toPoints(arome, "tp", "2t", "ssrd", "2r").filter((p) => p.ms <= aheadEnd.getTime());

  const byMs = new Map<number, WeatherPoint>();
  for (const p of [...pastPoints, ...futurePoints]) {
    byMs.set(p.ms, p);
  }

  return [...byMs.values()].sort((a, b) => a.ms - b.ms);
}
