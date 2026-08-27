/**
 * Sunrise/sunset via the standard low-precision solar position algorithm (Astronomy Answers /
 * "sunrise equation"; the same formulation used by the widely-used suncalc.js library), accurate to
 * within roughly a minute - plenty for "don't recommend painting in the dark". No external API
 * needed. All intermediate math is in UTC; callers convert to local wall-clock for display.
 */

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLIQUITY = RAD * 23.4397;

function toJulian(date: Date): number {
  return date.getTime() / DAY_MS - 0.5 + J1970;
}

function fromJulian(j: number): Date {
  return new Date((j + 0.5 - J1970) * DAY_MS);
}

function toDays(date: Date): number {
  return toJulian(date) - J2000;
}

function solarMeanAnomaly(d: number): number {
  return RAD * (357.5291 + 0.98560028 * d);
}

function eclipticLongitude(M: number): number {
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = RAD * 102.9372;
  return M + C + P + Math.PI;
}

function declination(l: number): number {
  return Math.asin(Math.sin(l) * Math.sin(OBLIQUITY));
}

function julianCycle(d: number, lw: number): number {
  return Math.round(d - 0.0009 - lw / (2 * Math.PI));
}

function approxTransit(Ht: number, lw: number, n: number): number {
  return 0.0009 + (Ht + lw) / (2 * Math.PI) + n;
}

function solarTransitJ(ds: number, M: number, L: number): number {
  return J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
}

function hourAngle(h: number, phi: number, dec: number): number {
  return Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));
}

const SUNRISE_SUNSET_ANGLE = -0.833 * RAD;

export interface SunTimes {
  /** null when the sun never rises/sets that day at this latitude (polar night/midnight sun) -
   * not a realistic case for Zedlitzdorf, but handled rather than producing NaN. */
  sunrise: Date | null;
  sunset: Date | null;
}

/** Sunrise/sunset for the calendar day (UTC) containing `date`, at the given lat/lon (degrees,
 * east-positive longitude). Pass a UTC instant already snapped to local noon-ish for the day you
 * want - callers in this codebase pass a wall-clock local date's noon converted to UTC. */
export function sunTimesUtc(date: Date, latitude: number, longitude: number): SunTimes {
  const lw = RAD * -longitude;
  const phi = RAD * latitude;
  const d = toDays(date);
  const n = julianCycle(d, lw);
  const dsNoon = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(dsNoon);
  const L = eclipticLongitude(M);
  const dec = declination(L);

  const cosH = (Math.sin(SUNRISE_SUNSET_ANGLE) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  if (cosH > 1 || cosH < -1) {
    return { sunrise: null, sunset: null };
  }

  const Jnoon = solarTransitJ(dsNoon, M, L);
  const w0 = hourAngle(SUNRISE_SUNSET_ANGLE, phi, dec);
  const Jset = solarTransitJ(approxTransit(w0, lw, n), M, L);
  const Jrise = Jnoon - (Jset - Jnoon);

  return { sunrise: fromJulian(Jrise), sunset: fromJulian(Jset) };
}

/**
 * Sunrise/sunset for each local calendar day (in `timeZone`) touched by [startMs, endMs], keyed by
 * that day's "YYYY-MM-DD" local date string. Computing per-day (rather than once) matters because
 * the chart window spans several calendar days and day length changes noticeably across even a
 * 3-4 day span in Austria.
 */
export function sunTimesForRange(
  startMs: number,
  endMs: number,
  latitude: number,
  longitude: number,
  timeZone: string
): Map<string, SunTimes> {
  const result = new Map<string, SunTimes>();
  const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });

  for (let ms = startMs - DAY_MS; ms <= endMs + DAY_MS; ms += DAY_MS) {
    const localDateStr = dayFmt.format(new Date(ms));
    if (result.has(localDateStr)) continue;
    // Noon UTC on the matching calendar date is an adequate anchor for this algorithm's precision.
    const [y, m, day] = localDateStr.split("-").map(Number);
    const noonUtc = new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
    result.set(localDateStr, sunTimesUtc(noonUtc, latitude, longitude));
  }
  return result;
}
