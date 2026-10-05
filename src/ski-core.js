/**
 * Everything the ski-conditions page computes, as plain ESM JavaScript with no imports at all.
 *
 * The site is static (GitHub Pages), so the page's refresh button can only re-fetch Open-Meteo from
 * the browser, and the only way to keep one algorithm instead of two is to ship this exact source to
 * the generator, the tests and the page. tsc copies it to dist/ (allowJs); the page renderer
 * inlines it - which is also why it carries its own local-time helpers instead of importing any.
 *
 * Conventions the rest of the code depends on:
 *   - Instants are UTC epoch milliseconds. Local time exists only for labels and day boundaries and
 *     is derived through Intl with an explicit IANA zone.
 *   - Every hourly variable used here is "preceding hour" on Open-Meteo (precipitation sum, gust
 *     maximum, sunshine seconds), so the lift day 09:00-16:00 is the stamps 10:00 ... 16:00. The
 *     temperature at those stamps is instantaneous; using the same stamps keeps one set of hours.
 *   - Missing and zero are different things. A gap never becomes 0 mm, never improves a verdict and
 *     never shrinks a denominator.
 *
 * POWDER_SNEH (step 4 of the powder model, 4 Oct 2026): each deterministic day also carries the
 * calibrated probability of >= 15 cm of new snow in the 24 h to 09:00 at the top station, from the
 * two-part distribution in src/powder-model.ts (fitted in scripts/model-fit.ts, METODIKA §4).
 *
 * What the data can and cannot say (verified live 2026-10-03): Open-Meteo's `elevation=` only
 * re-computes temperature for the given height. Precipitation, gusts and sunshine are the model
 * cell's values, identical for a resort's base and top. So whether a millimetre falls as rain or as
 * snow at a station is decided here, from that station's temperature, and the gust is the cell's
 * 10 m gust - an exposed summit sees more.
 */

export const HOUR_MS = 3_600_000;

export const FORECAST_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
export const ENSEMBLE_ENDPOINT = "https://ensemble-api.open-meteo.com/v1/ensemble";

/** All three horizons ask for exactly these, for every point. */
export const VARS = ["temperature_2m", "precipitation", "wind_gusts_10m", "sunshine_duration"];
/** The deterministic horizons also ask for these (step 6: low cloud and humidity sharpen the overcast
 * probability from ICON-D2); the ensemble does not, and a response without them still parses. */
export const DET_EXTRA_VARS = ["cloud_cover_low", "relative_humidity_2m"];

/** Verified live 2026-10-03 (extras 2026-10-04). Other units are a changed API, not something to convert silently. */
export const EXPECTED_UNITS = {
  temperature_2m: "°C",
  precipitation: "mm",
  wind_gusts_10m: "km/h",
  sunshine_duration: "s",
  cloud_cover_low: "%",
  relative_humidity_2m: "%",
};

export const HORIZON_KEYS = ["now", "short", "long"];

// ---------------------------------------------------------------------------
// Local time (DST-safe, no offset tables)
// ---------------------------------------------------------------------------

const partsCache = new Map();

function formatterFor(timeZone) {
  let f = partsCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    partsCache.set(timeZone, f);
  }
  return f;
}

export function localParts(ms, timeZone) {
  const out = {};
  for (const p of formatterFor(timeZone).formatToParts(new Date(ms))) out[p.type] = p.value;
  return out;
}

/** "YYYY-MM-DD" of an instant in the given zone. */
export function localDateOf(ms, timeZone) {
  const p = localParts(ms, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Pure calendar arithmetic on an ISO date - no zone involved. */
export function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The instant at which the given local wall-clock hour of the given local date begins. */
export function localTimeMs(isoDate, hour, timeZone) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d, hour);
  let ms = target;
  for (let i = 0; i < 4; i++) {
    const p = localParts(ms, timeZone);
    const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
    const diff = asUtc - target;
    if (diff === 0) break;
    ms -= diff;
  }
  return ms;
}

export function localMidnightMs(isoDate, timeZone) {
  return localTimeMs(isoDate, 0, timeZone);
}

/** Sums of one-decimal values accumulate float dust; 3 decimals is far below what the data resolves. */
export function round3(x) {
  return Math.round(x * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Which days, which points, which requests
// ---------------------------------------------------------------------------

/**
 * The first lift day still ahead: today while the lifts are still running, tomorrow once they have
 * closed. Every horizon counts its days from here, so "1 day" is always the next day one can ski.
 */
export function firstSkiDate(nowMs, cfg) {
  const today = localDateOf(nowMs, cfg.timezone);
  return nowMs < localTimeMs(today, cfg.liftCloseHour, cfg.timezone) ? today : addDays(today, 1);
}

/** The local dates a horizon shows. */
export function horizonDates(cfg, key, firstDate) {
  const out = [];
  for (let i = 0; i < cfg.horizons[key].days; i++) out.push(addDays(firstDate, i));
  return out;
}

/**
 * Every resort contributes two points, top first: index 2r is resort r's top station, 2r+1 its
 * base. One request per horizon carries all of them (Open-Meteo answers a list of coordinates with
 * a list of results in the same order).
 */
export function requestPoints(cfg) {
  const out = [];
  for (const r of cfg.resorts) {
    out.push({ resortId: r.id, role: "top", ...r.top });
    out.push({ resortId: r.id, role: "base", ...r.base });
  }
  return out;
}

/**
 * The deterministic horizons also reach back freshSnowHours before the first day's lifts open, so
 * the first day's fresh snow is a real number. The ensemble does not: its days are judged without
 * fresh snow (it never decides a verdict) and it is by far the heaviest response.
 *
 * The end is one day past the last shown day: Open-Meteo's end_date stops at 23:00, and the stamp
 * at the following midnight is the one that closes the last day's 23:00-24:00 hour.
 */
export function requestDates(cfg, key, firstDate) {
  const h = cfg.horizons[key];
  const back = h.ensemble ? 0 : Math.ceil((cfg.rules.freshSnowHours - cfg.liftOpenHour) / 24);
  return { startDate: addDays(firstDate, -back), endDate: addDays(firstDate, h.days) };
}

function withQuery(base, params) {
  const q = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return `${base}?${q}`;
}

export function horizonUrl(cfg, key, firstDate) {
  return pointsUrl(cfg, key, firstDate, requestPoints(cfg));
}

/** The same request as the horizon makes, for any list of points (the prospective log asks for the
 * verification stations this way, so their numbers are produced exactly like the resorts'). */
export function pointsUrl(cfg, key, firstDate, pts) {
  const h = cfg.horizons[key];
  const { startDate, endDate } = requestDates(cfg, key, firstDate);
  return withQuery(h.ensemble ? ENSEMBLE_ENDPOINT : FORECAST_ENDPOINT, {
    latitude: pts.map((p) => p.latitude).join(","),
    longitude: pts.map((p) => p.longitude).join(","),
    elevation: pts.map((p) => p.elevation).join(","),
    models: h.model,
    hourly: [...VARS, ...(h.ensemble ? [] : DET_EXTRA_VARS)].join(","),
    start_date: startDate,
    end_date: endDate,
    timezone: cfg.timezone,
    // Epoch seconds: unambiguous instants in, local labels derived here.
    timeformat: "unixtime",
  });
}

/** Run metadata lives on the same host as the data it describes. */
export function metaUrl(cfg, key) {
  const h = cfg.horizons[key];
  const host = h.ensemble ? "https://ensemble-api.open-meteo.com" : "https://api.open-meteo.com";
  return `${host}/data/${h.metaDomain}/static/meta.json`;
}

/**
 * The model run the numbers come from, or null when the source does not say. Past the data end of
 * the newest run (ECMWF's 06z/18z ensemble stops at 144 h) the API still serves the previous run,
 * so the newest initialisation time would overstate the freshness.
 */
export function resolveRun(meta, lastNeededMs) {
  if (!meta) return null;
  const init = meta.last_run_initialisation_time;
  const dataEnd = meta.data_end_time;
  const interval = meta.update_interval_seconds;
  if (![init, dataEnd, interval].every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  if (dataEnd * 1000 >= lastNeededMs) return init * 1000;
  return (init - interval) * 1000;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** Numbers stay numbers, everything else (including undefined past the horizon) becomes null. */
function column(hourly, name, length) {
  const raw = hourly[name];
  const out = new Array(length);
  for (let i = 0; i < length; i++) {
    const v = Array.isArray(raw) ? raw[i] : undefined;
    out[i] = typeof v === "number" && Number.isFinite(v) ? v : null;
  }
  return out;
}

/**
 * Member suffixes ("" for the control/deterministic run, "_member01" ...) that carry every variable,
 * discovered from the response rather than from a hardcoded list. Control sorts first.
 */
export function memberSuffixes(hourly) {
  let common = null;
  for (const v of VARS) {
    const re = new RegExp(`^${v}(_member\\d+)?$`);
    const found = new Set(Object.keys(hourly).filter((k) => re.test(k)).map((k) => k.slice(v.length)));
    common = common === null ? found : new Set([...common].filter((s) => found.has(s)));
  }
  return [...(common ?? [])].sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)));
}

/**
 * One response (a list of points, or a single object when only one point was asked for) into
 * per-point member series. A deterministic model simply has one member, "control".
 */
export function parsePoints(json, what) {
  if (json && !Array.isArray(json) && json.error) throw new Error(`Open-Meteo (${what}): ${json.reason || "neznáma chyba"}`);
  const list = Array.isArray(json) ? json : [json];
  return list.map((p, n) => {
    if (!p || !p.hourly || !Array.isArray(p.hourly.time)) throw new Error(`Open-Meteo (${what}): bod ${n + 1} bez hodinových dát`);
    const units = p.hourly_units || {};
    for (const v of Object.keys(EXPECTED_UNITS)) {
      const got = units[v];
      if (got && got !== EXPECTED_UNITS[v]) throw new Error(`Open-Meteo (${what}): ${v} prišlo v ${got}, očakávam ${EXPECTED_UNITS[v]}`);
    }
    const h = p.hourly;
    const len = h.time.length;
    return {
      timesMs: h.time.map((t) => t * 1000),
      grid: { latitude: p.latitude, longitude: p.longitude, elevation: p.elevation },
      members: memberSuffixes(h).map((s) => ({
        key: s === "" ? "control" : s.replace(/^_/, ""),
        temperature: column(h, `temperature_2m${s}`, len),
        precipitation: column(h, `precipitation${s}`, len),
        gust: column(h, `wind_gusts_10m${s}`, len),
        sunSeconds: column(h, `sunshine_duration${s}`, len),
        // Optional (deterministic horizons only): all null when the response lacks them.
        lowCloud: column(h, `cloud_cover_low${s}`, len),
        humidity: column(h, `relative_humidity_2m${s}`, len),
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// One day at one resort
// ---------------------------------------------------------------------------

export function indexByTime(timesMs) {
  const idx = new Map();
  for (let i = 0; i < timesMs.length; i++) idx.set(timesMs[i], i);
  return idx;
}

/** Stamps ending each hour in (fromMs, toMs]. */
function stamps(fromMs, toMs) {
  const out = [];
  for (let t = fromMs + HOUR_MS; t <= toMs; t += HOUR_MS) out.push(t);
  return out;
}

/** Snow (cm) that one hour leaves at a station: the cell's precipitation where the station is cold
 * enough, converted with the same ratio Open-Meteo uses for its own snowfall (7 cm = 10 mm). */
export function snowCm(precipMm, tempC, rules) {
  return round3(tempC) <= rules.snowMaxTempC ? precipMm * rules.snowCmPerMm : 0;
}

export function rainMm(precipMm, tempC, rules) {
  return round3(tempC) <= rules.snowMaxTempC ? 0 : precipMm;
}

/**
 * @typedef {{
 *   status: "good" | "fair" | "bad" | null,
 *   reasons: string[],
 *   softSnow: boolean,
 *   powder: boolean,
 *   freshSnowCm: number | null,
 *   rainBaseMm: number | null,
 *   rainTopMm: number | null,
 *   maxGustKmh: number | null,
 *   sunHours: number | null,
 *   baseTemp: { min: number, max: number } | null,
 *   topTemp: { min: number, max: number } | null,
 * }} DayVerdict
 */

/**
 * One lift day at one resort, from one member's top and base series (which share a time axis -
 * they come from the same response).
 *
 * The status is the worst of the rules; null when any lift-hour value it needs is missing. Fresh
 * snow is reported beside it and only ever adds the "prašan" tag - it never makes a day worse, so
 * a missing past (the ensemble does not fetch one) leaves it null without touching the status.
 *
 * @returns {DayVerdict}
 */
export function judgeDay(top, base, date, cfg, idx) {
  const rules = cfg.rules;
  const openMs = localTimeMs(date, cfg.liftOpenHour, cfg.timezone);
  const closeMs = localTimeMs(date, cfg.liftCloseHour, cfg.timezone);
  const lift = stamps(openMs, closeMs);

  let freshSnowCm = 0;
  for (const t of stamps(openMs - rules.freshSnowHours * HOUR_MS, closeMs)) {
    const i = idx.get(t);
    const p = i === undefined ? null : top.precipitation[i];
    const temp = i === undefined ? null : top.temperature[i];
    if (p === null || temp === null) {
      freshSnowCm = null;
      break;
    }
    freshSnowCm += snowCm(p, temp, rules);
  }
  if (freshSnowCm !== null) freshSnowCm = round3(freshSnowCm);

  const empty = {
    status: null,
    reasons: [],
    softSnow: false,
    powder: freshSnowCm !== null && freshSnowCm >= rules.powderCm,
    freshSnowCm,
    rainBaseMm: null,
    rainTopMm: null,
    maxGustKmh: null,
    sunHours: null,
    baseTemp: null,
    topTemp: null,
  };

  let rainBase = 0;
  let rainTop = 0;
  let gust = -Infinity;
  let sunSeconds = 0;
  let softHours = 0;
  const baseT = { min: Infinity, max: -Infinity };
  const topT = { min: Infinity, max: -Infinity };
  for (const t of lift) {
    const i = idx.get(t);
    if (i === undefined) return empty;
    const values = [top.temperature[i], top.precipitation[i], top.gust[i], top.sunSeconds[i], base.temperature[i], base.precipitation[i]];
    if (values.some((v) => v === null)) return empty;
    rainTop += rainMm(top.precipitation[i], top.temperature[i], rules);
    rainBase += rainMm(base.precipitation[i], base.temperature[i], rules);
    gust = Math.max(gust, top.gust[i]);
    sunSeconds += top.sunSeconds[i];
    if (round3(base.temperature[i]) > rules.softSnowTempC) softHours++;
    baseT.min = Math.min(baseT.min, base.temperature[i]);
    baseT.max = Math.max(baseT.max, base.temperature[i]);
    topT.min = Math.min(topT.min, top.temperature[i]);
    topT.max = Math.max(topT.max, top.temperature[i]);
  }
  rainBase = round3(rainBase);
  rainTop = round3(rainTop);
  // Compared in seconds, so an hour short by one second is short - rounding hours would hide it.
  sunSeconds = round3(sunSeconds);
  const sunHours = round3(sunSeconds / 3600);

  const bad = [];
  const fair = [];
  const mm = (x) => String(Math.round(x * 10) / 10).replace(".", ",");
  if (rainBase >= rules.rainBadMm) bad.push(rainTop >= rules.rainBadMm ? `dážď aj na vrchole (${mm(rainTop)} mm)` : `dážď dole (${mm(rainBase)} mm)`);
  else if (rainBase >= rules.rainFairMm) fair.push(`slabý dážď dole (${mm(rainBase)} mm)`);
  if (gust > rules.gustBadKmh) bad.push(`nárazy vetra ${Math.round(gust)} km/h, lanovky môžu stáť`);
  else if (gust > rules.gustFairKmh) fair.push(`veterno (nárazy ${Math.round(gust)} km/h)`);
  const softSnow = softHours / lift.length >= rules.softSnowShare;
  if (softSnow) fair.push(`mäkký sneh dole (nad ${rules.softSnowTempC} °C)`);
  if (sunSeconds < rules.minSunHours * 3600) fair.push("zamračené, horšia viditeľnosť");

  return {
    ...empty,
    status: bad.length ? "bad" : fair.length ? "fair" : "good",
    reasons: [...bad, ...fair],
    softSnow,
    rainBaseMm: rainBase,
    rainTopMm: rainTop,
    maxGustKmh: Math.round(gust),
    sunHours,
    baseTemp: { min: baseT.min, max: baseT.max },
    topTemp: { min: topT.min, max: topT.max },
  };
}

/** Snow (cm) a station gets over one whole local day - the 10-day view's "new snow". Null when any
 * hour of the day is missing. */
export function daySnowCm(point, date, cfg, idx) {
  let sum = 0;
  for (const t of stamps(localMidnightMs(date, cfg.timezone), localMidnightMs(addDays(date, 1), cfg.timezone))) {
    const i = idx.get(t);
    const p = i === undefined ? null : point.precipitation[i];
    const temp = i === undefined ? null : point.temperature[i];
    if (p === null || temp === null) return null;
    sum += snowCm(p, temp, cfg.rules);
  }
  return round3(sum);
}

// ---------------------------------------------------------------------------
// POWDER_SNEH: the 24 h new snow at the top station as a calibrated probability (METODIKA §4)
// ---------------------------------------------------------------------------
//
// The amount x is the page rule summed over the window D-1 09:00 -> D 09:00 (the same rule as
// freshSnowCm, over a different window). The observed amount Y given x follows a two-part
// distribution fitted on station truth: P(Y > 0) = Phi(h0 + h1 sqrt x) and, given snow,
// sqrt Y ~ Normal(a + b sqrt x, c + d sqrt x) truncated at 0. The coefficients move linearly with
// the lead time (hours from the run's publication to the end of the window) and are clamped to the
// range the fit covered. These functions mirror scripts/lib/powder-model.ts; a test keeps them equal.

/** Standard normal CDF, absolute error < 1.5e-7 (Abramowitz & Stegun 7.1.26). */
export function normalCdf(z) {
  if (z < -8) return 0;
  if (z > 8) return 1;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const tail = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI) * poly;
  return z >= 0 ? 1 - tail : tail;
}

/** The law's coefficients at a lead time (hours). */
export function powderLawAt(law, leadH) {
  const l = (Math.min(Math.max(leadH, 0), law.maxLeadH) - law.leadRefH) / 24;
  return { h0: law.h00 + law.h01 * l, h1: law.h10 + law.h11 * l, a: law.a0 + law.a1 * l, b: law.b0 + law.b1 * l, c: law.c0 + law.c1 * l, d: law.d0 + law.d1 * l };
}

/** P(snow at all), and the location and spread of sqrt(Y) given snow, for a forecast amount x (cm). */
export function powderDistribution(xCm, p) {
  const r = Math.sqrt(Math.max(0, xCm));
  return { p0: normalCdf(p.h0 + p.h1 * r), mu: p.a + p.b * r, sigma: Math.max(0.05, p.c + p.d * r) };
}

/** P(Y >= thresholdCm | x). */
export function powderProbAtLeast(xCm, thresholdCm, p) {
  const { p0, mu, sigma } = powderDistribution(xCm, p);
  const below0 = normalCdf(-mu / sigma);
  const tail = 1 - normalCdf((Math.sqrt(thresholdCm) - mu) / sigma);
  return p0 * Math.min(1, tail / Math.max(1e-12, 1 - below0));
}

/** P(Y <= tCm | x). */
export function powderCdf(tCm, xCm, p) {
  const { p0, mu, sigma } = powderDistribution(xCm, p);
  const below0 = normalCdf(-mu / sigma);
  const inner = (normalCdf((Math.sqrt(Math.max(0, tCm)) - mu) / sigma) - below0) / Math.max(1e-12, 1 - below0);
  return 1 - p0 + p0 * Math.min(1, Math.max(0, inner));
}

/** Quantile q of Y in cm (0 while the dry mass covers q), by bisection on the CDF. */
export function powderQuantileCm(xCm, q, p) {
  if (powderCdf(0, xCm, p) >= q) return 0;
  let lo = 0;
  let hi = 200;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (powderCdf(mid, xCm, p) < q) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * When the forecast could first be read: the run's initialisation plus the model's typical delay.
 * Without run metadata the fetch time stands in - it is later than the real publication, so the
 * lead comes out shorter and the probability a little sharper than calibrated.
 */
export function publishedAtMs(runAtMs, fetchedAtMs, delayH) {
  return runAtMs === null || runAtMs === undefined ? fetchedAtMs : runAtMs + (delayH ?? 0) * HOUR_MS;
}

/** The window of ski day `date`: from windowHour the day before to windowHour on the day. */
export function powderWindow(date, cfg) {
  return { startMs: localTimeMs(addDays(date, -1), cfg.powder.windowHour, cfg.timezone), endMs: localTimeMs(date, cfg.powder.windowHour, cfg.timezone) };
}

/** The page rule's snow (cm) at the top over the window; null when any hour is missing. */
export function windowSnowCm(top, date, cfg, idx) {
  const { startMs, endMs } = powderWindow(date, cfg);
  let sum = 0;
  for (const t of stamps(startMs, endMs)) {
    const i = idx.get(t);
    const p = i === undefined ? null : top.precipitation[i];
    const temp = i === undefined ? null : top.temperature[i];
    if (p === null || temp === null) return null;
    sum += snowCm(p, temp, cfg.rules);
  }
  return round3(sum);
}

/** The stage a day belongs to by its offset from the first ski day; null beyond the last stage. */
export function powderStage(dayOffset, cfg) {
  for (const s of cfg.powder.stages) if (dayOffset <= s.maxDayOffset) return s.stage;
  return null;
}

/**
 * @typedef {{
 *   forecastCm: number,
 *   leadH: number,
 *   probability: number,
 *   medianCm: number,
 *   p90Cm: number,
 *   stage: "alert" | "pozor" | "vyhlad" | null,
 *   alert: boolean,
 * }} PowderSnow
 */

/**
 * POWDER_SNEH for one ski day at one resort: the window's forecast amount, the lead time and the
 * calibrated probability of at least cfg.powder.thresholdCm, with the median and 90th percentile of
 * the amount; the day's stage (ALERT / POZOR / VÝHĽAD by its offset from the first ski day) and
 * whether the probability reaches the flag threshold. Null when the model has no law or the window
 * has a gap - a gap never becomes a quiet "no powder".
 *
 * @returns {PowderSnow | null}
 */
export function powderSnow(top, date, cfg, idx, law, publishedMs, dayOffset = 0) {
  if (!law) return null;
  const x = windowSnowCm(top, date, cfg, idx);
  if (x === null) return null;
  const leadH = (powderWindow(date, cfg).endMs - publishedMs) / HOUR_MS;
  const p = powderLawAt(law, leadH);
  const tenth = (v) => Math.round(v * 10) / 10;
  const probability = round3(powderProbAtLeast(x, cfg.powder.thresholdCm, p));
  return {
    forecastCm: x,
    leadH: tenth(leadH),
    probability,
    medianCm: tenth(powderQuantileCm(x, 0.5, p)),
    p90Cm: tenth(powderQuantileCm(x, 0.9, p)),
    stage: powderStage(dayOffset, cfg),
    alert: probability >= cfg.powder.alert.minProb,
  };
}

// ---------------------------------------------------------------------------
// Day quality as probabilities (step 6, METODIKA §4.5)
// ---------------------------------------------------------------------------
//
// The page's yes/no rules verified poorly against stations (rain over-warns, the gust threshold
// has no skill from IFS, overcast under-warns), while a logistic curve on the same model value is
// calibrated. These functions turn the lift-day aggregates into probabilities of the page's own
// events, a probability of a "good" day as the product of its parts (as good as a direct fit on the
// archive), the inversion at 13:00 (ICON-D2 only) and the temperature during the POWDER_SNEH
// snowfall with each model's bias added back.

export const logistic = (z) => 1 / (1 + Math.exp(-z));

/** Probability from a one-input curve {a, b} or a multi-input curve {a, b: []}. */
export function curveProb(curve, g) {
  if (Array.isArray(curve.b)) {
    let z = curve.a;
    for (let i = 0; i < curve.b.length; i++) z += curve.b[i] * g[i];
    return logistic(z);
  }
  return logistic(curve.a + curve.b * g);
}

/**
 * @typedef {{
 *   rainBad: number, rainFair: number, gustBad: number, gustFair: number, sunLow: number, good: number,
 *   inversion: { deltaTC: number, probability: number } | null,
 *   snowTemp: { tC: number, band: "dry" | "moist" | "wet" } | null,
 *   windowGustKmh: number | null,
 * }} DayQuality
 */

/**
 * One lift day at one resort as calibrated probabilities. `base` may be the same series as `top`
 * (a single station), in which case there is no inversion. Null when the model has no curves or a
 * lift hour is missing; the powder-window parts are null on their own when that window has a gap.
 *
 * @returns {DayQuality | null}
 */
export function dayQuality(top, base, date, cfg, idx, model) {
  const q = cfg.quality;
  const curves = q.curves[model];
  if (!curves) return null;
  const rules = cfg.rules;
  const lift = stamps(localTimeMs(date, cfg.liftOpenHour, cfg.timezone), localTimeMs(date, cfg.liftCloseHour, cfg.timezone));
  let rainBase = 0, gust = -Infinity, sunSeconds = 0, cloud = 0, humidity = 0, extras = 0;
  for (const t of lift) {
    const i = idx.get(t);
    if (i === undefined) return null;
    const values = [top.temperature[i], top.precipitation[i], top.gust[i], top.sunSeconds[i], base.temperature[i], base.precipitation[i]];
    if (values.some((v) => v === null)) return null;
    rainBase += rainMm(base.precipitation[i], base.temperature[i], rules);
    gust = Math.max(gust, top.gust[i]);
    sunSeconds += top.sunSeconds[i];
    const lc = top.lowCloud ? top.lowCloud[i] : null, rh = top.humidity ? top.humidity[i] : null;
    if (lc !== null && rh !== null) { cloud += lc; humidity += rh; extras++; }
  }
  const sunHours = sunSeconds / 3600;
  const rainG = Math.sqrt(round3(rainBase));
  const rainBad = curveProb(curves.rainBad, rainG), rainFair = curveProb(curves.rainFair, rainG);
  const gustBad = curveProb(curves.gustBad, gust / 10), gustFair = curveProb(curves.gustFair, gust / 10);
  const sunLow = extras === lift.length && curves.sunLowCloud ? curveProb(curves.sunLowCloud, [7 - sunHours, cloud / extras / 100, humidity / extras / 100]) : curveProb(curves.sunLow, 7 - sunHours);

  let inversion = null;
  const inv = q.inversion[model];
  if (inv && base !== top) {
    const i = idx.get(localTimeMs(date, 13, cfg.timezone));
    if (i !== undefined && top.temperature[i] !== null && base.temperature[i] !== null) {
      const deltaTC = top.temperature[i] - base.temperature[i];
      inversion = { deltaTC: Math.round(deltaTC * 10) / 10, probability: round3(curveProb(inv, deltaTC)) };
    }
  }

  const w = powderWindow(date, cfg);
  let snow = 0, snowT = 0, windowGust = -Infinity, windowOk = true;
  for (const t of stamps(w.startMs, w.endMs)) {
    const i = idx.get(t);
    const p = i === undefined ? null : top.precipitation[i], temp = i === undefined ? null : top.temperature[i], g = i === undefined ? null : top.gust[i];
    if (p === null || temp === null || g === null) { windowOk = false; break; }
    const s = snowCm(p, temp, rules);
    if (s > 0) { snow += s; snowT += s * temp; }
    windowGust = Math.max(windowGust, g);
  }
  let snowTemp = null;
  if (windowOk && snow >= q.snowTemp.minSnowCm) {
    const tC = snowT / snow + (q.snowTemp.biasC[model] ?? 0);
    snowTemp = { tC: Math.round(tC * 10) / 10, band: tC <= q.snowTemp.dryC ? "dry" : tC <= q.snowTemp.wetC ? "moist" : "wet" };
  }

  return {
    rainBad: round3(rainBad),
    rainFair: round3(rainFair),
    gustBad: round3(gustBad),
    gustFair: round3(gustFair),
    sunLow: round3(sunLow),
    good: round3((1 - rainFair) * (1 - gustFair) * (1 - sunLow)),
    inversion,
    snowTemp,
    windowGustKmh: windowOk ? Math.round(windowGust) : null,
  };
}

/**
 * @typedef {{ goodPct: number | null, fairPct: number | null, badPct: number | null }} DayShares
 */

/**
 * The day's verdict as the three shares the page draws, the same three the ensemble days carry
 * (step 7, METODIKA §4.6): P(bad) = 1 − (1 − P rain ≥ rainBadMm)(1 − P gust > gustBadKmh), P(good) =
 * the calibrated good-day product - zero when the valley is soft, a temperature rule that stays
 * deterministic - and "fair" the rest. Both products verified against a direct fit (§5.4). Whole
 * percentages that sum to 100; null when the day has no verdict or the model no curves.
 *
 * @returns {DayShares}
 */
export function dayShares(verdict, quality) {
  if (!verdict.status || !quality) return { goodPct: null, fairPct: null, badPct: null };
  const bad = 1 - (1 - quality.rainBad) * (1 - quality.gustBad);
  const good = verdict.softSnow ? 0 : Math.min(quality.good, 1 - bad);
  const badPct = Math.round(bad * 100);
  const goodPct = Math.min(Math.round(good * 100), 100 - badPct);
  return { goodPct, fairPct: 100 - goodPct - badPct, badPct };
}

// ---------------------------------------------------------------------------
// Horizons
// ---------------------------------------------------------------------------

function resortPoints(points, cfg, r) {
  const top = points[2 * r];
  const base = points[2 * r + 1];
  if (!top || !base) throw new Error(`Open-Meteo: chýba bod pre ${cfg.resorts[r].name}`);
  return { top, base };
}

/** Hourly lines for the page's chart, limited to the shown days. */
function hourlyFor(top, base, dates, cfg) {
  const fromMs = localMidnightMs(dates[0], cfg.timezone);
  const toMs = localMidnightMs(addDays(dates[dates.length - 1], 1), cfg.timezone);
  const out = { timesMs: [], topTemp: [], baseTemp: [], snowTopCm: [], gustKmh: [] };
  const t0 = top.members[0];
  const b0 = base.members[0];
  for (let i = 0; i < top.timesMs.length; i++) {
    const t = top.timesMs[i];
    if (t <= fromMs || t > toMs) continue;
    out.timesMs.push(t);
    out.topTemp.push(t0.temperature[i]);
    out.baseTemp.push(b0.temperature[i]);
    out.snowTopCm.push(t0.precipitation[i] === null || t0.temperature[i] === null ? null : round3(snowCm(t0.precipitation[i], t0.temperature[i], cfg.rules)));
    out.gustKmh.push(t0.gust[i]);
  }
  return out;
}

/**
 * A deterministic horizon: one verdict per resort and day with its calibrated quality and the
 * good / fair / bad shares drawn from it, the POWDER_SNEH probability of the day (null without a
 * law for the model), plus the hourly lines behind it.
 */
export function judgeDeterministic(points, cfg, dates, law = null, publishedMs = 0, model = null) {
  return cfg.resorts.map((resort, r) => {
    const { top, base } = resortPoints(points, cfg, r);
    const idx = indexByTime(top.timesMs);
    return {
      id: resort.id,
      days: dates.map((date, i) => {
        const verdict = judgeDay(top.members[0], base.members[0], date, cfg, idx);
        const quality = model ? dayQuality(top.members[0], base.members[0], date, cfg, idx, model) : null;
        return {
          date,
          ...verdict,
          powderSnow: powderSnow(top.members[0], date, cfg, idx, law, publishedMs, i),
          quality,
          ...dayShares(verdict, quality),
        };
      }),
      hourly: hourlyFor(top, base, dates, cfg),
    };
  });
}

/** Linear-interpolated percentile of an already sorted list. */
export function percentile(sorted, q) {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return round3(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo));
}

/**
 * The ensemble horizon: every member judged with the very same judgeDay, then counted. The
 * denominator is the product's expected membership, never "however many arrived" - a missing member
 * or a member short of a value makes the day `null` with a reason ("members" / "horizon") instead
 * of a better-looking percentage.
 */
export function summarizeEnsemble(points, cfg, dates) {
  const expected = cfg.horizons.long.expectedMembers;
  return cfg.resorts.map((resort, r) => {
    const { top, base } = resortPoints(points, cfg, r);
    const idx = indexByTime(top.timesMs);
    const complete = top.members.length === expected && base.members.length === expected;
    const days = dates.map((date) => {
      const none = { date, goodPct: null, fairPct: null, badPct: null, snowCm: null, expected };
      if (!complete) return { ...none, reason: "members" };
      const counts = { good: 0, fair: 0, bad: 0 };
      const snows = [];
      for (let m = 0; m < expected; m++) {
        const v = judgeDay(top.members[m], base.members[m], date, cfg, idx);
        if (v.status === null) return { ...none, reason: "horizon" };
        counts[v.status]++;
        const s = daySnowCm(top.members[m], date, cfg, idx);
        if (s !== null) snows.push(s);
      }
      snows.sort((a, b) => a - b);
      const pct = (n) => Math.round((100 * n) / expected);
      return {
        date,
        goodPct: pct(counts.good),
        fairPct: pct(counts.fair),
        badPct: pct(counts.bad),
        snowCm: snows.length === expected ? { p10: percentile(snows, 0.1), p50: percentile(snows, 0.5), p90: percentile(snows, 0.9) } : null,
        expected,
        reason: null,
      };
    });
    return { id: resort.id, days };
  });
}

// ---------------------------------------------------------------------------
// The snapshot embedded in the page (and re-made in the browser on refresh)
// ---------------------------------------------------------------------------

/** Bumped whenever the snapshot's shape changes, so an older stored one is rejected, not misread.
 * 2 (4 Oct 2026): powderSnow (amount, lead, probability, median, p90, stage, alert flag) on deterministic
 * days, powderLaw and publishedAtMs on horizons. 3 (4 Oct 2026): quality (calibrated day-rule
 * probabilities, good-day probability, inversion, snow temperature, window gust) on deterministic days.
 * 4 (5 Oct 2026): softSnow on verdicts and goodPct / fairPct / badPct on deterministic days, the shares
 * the page draws instead of the yes/no verdict. */
export const SKI_SNAPSHOT_VERSION = 4;

/**
 * Everything the page draws, derived once by whoever has the raw responses - the generator, or the
 * page after a refresh. `responses[key]` is `{ data, meta }` for each of HORIZON_KEYS.
 */
export function buildSkiSnapshot(responses, cfg, fetchedAtMs) {
  const firstDate = firstSkiDate(fetchedAtMs, cfg);
  /** @type {Record<string, { model: string, label: string, runAtMs: number | null, publishedAtMs: number | null, powderLaw: string | null, dates: string[], grids: object[], resorts: { id: string, days: Record<string, any>[], hourly?: object }[] }>} */
  const horizons = {};
  for (const key of HORIZON_KEYS) {
    const h = cfg.horizons[key];
    const dates = horizonDates(cfg, key, firstDate);
    const points = parsePoints(responses[key].data, h.label);
    const lastNeeded = localTimeMs(dates[dates.length - 1], cfg.liftCloseHour, cfg.timezone);
    const runAtMs = resolveRun(responses[key].meta, lastNeeded);
    // The ensemble has no calibrated law yet (no member archive to fit one on), so its days carry none.
    const law = h.ensemble ? null : cfg.powder.laws[h.model] ?? null;
    const publishedMs = law ? publishedAtMs(runAtMs, fetchedAtMs, cfg.powder.publishDelayH[h.model]) : null;
    horizons[key] = {
      model: h.model,
      label: h.label,
      runAtMs,
      publishedAtMs: publishedMs,
      powderLaw: law ? h.model : null,
      dates,
      grids: points.map((p) => p.grid),
      resorts: h.ensemble ? summarizeEnsemble(points, cfg, dates) : judgeDeterministic(points, cfg, dates, law, publishedMs, h.model),
    };
  }
  return { version: SKI_SNAPSHOT_VERSION, fetchedAtMs, firstDate, config: cfg, horizons };
}
