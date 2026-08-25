import { LOCATION, MODELS, FORECAST_DAYS } from "./config.js";
import type { HourlyByModel } from "./types.js";

const BASE_URL = "https://api.open-meteo.com/v1/forecast";

interface OpenMeteoResponse {
  hourly: { time: string[] } & Record<string, (number | null)[]>;
}

export async function fetchModelForecasts(): Promise<HourlyByModel> {
  const url = new URL(BASE_URL);
  url.searchParams.set("latitude", String(LOCATION.latitude));
  url.searchParams.set("longitude", String(LOCATION.longitude));
  url.searchParams.set("hourly", "precipitation,sunshine_duration");
  url.searchParams.set("models", MODELS.join(","));
  url.searchParams.set("timezone", LOCATION.timezone);
  url.searchParams.set("forecast_days", String(FORECAST_DAYS));

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo request failed: ${res.status} ${res.statusText}`);
  }

  const body = (await res.json()) as OpenMeteoResponse;
  const { time } = body.hourly;

  const result = {} as HourlyByModel;
  for (const model of MODELS) {
    const precipitationKey = `precipitation_${model}`;
    const sunshineKey = `sunshine_duration_${model}`;
    const precipitation = body.hourly[precipitationKey];
    const sunshineSeconds = body.hourly[sunshineKey];
    if (!precipitation) {
      throw new Error(`Missing hourly data for model "${model}" (expected key "${precipitationKey}")`);
    }
    if (!sunshineSeconds) {
      throw new Error(`Missing hourly data for model "${model}" (expected key "${sunshineKey}")`);
    }
    result[model] = { time, precipitation, sunshineSeconds };
  }
  return result;
}
