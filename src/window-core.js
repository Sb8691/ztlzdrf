/**
 * Everything the painting-window page computes, as plain ESM JavaScript with no imports at all.
 *
 * This file is deliberately not TypeScript and deliberately dependency-free, because it runs in two
 * places verbatim: in Node (the generator that writes docs/index.html, and the tests) and inside the
 * published page, where the "Obnoviť predpoveď" button re-fetches Open-Meteo directly from the
 * browser. The site is static - GitHub Pages serves files, there is no server to ask - so a real
 * refresh can only happen client-side, and the only way to keep one algorithm instead of two is to
 * ship this exact source to both. tsc copies it to dist/ (allowJs), the page renderer inlines it.
 *
 * Conventions that the rest of the code depends on:
 *   - Instants are UTC epoch milliseconds, always. Local time exists only for labels and for day
 *     boundaries, and is derived through Intl with an explicit IANA zone - never by parsing a naive
 *     string (which would silently mean "the viewer's zone") and never by adding a fixed offset.
 *   - Open-Meteo hourly accumulations are documented as the "preceding hour sum", so the value
 *     stamped 10:00 is the rain that fell between 09:00 and 10:00. Every precipitation window here
 *     is therefore right-open on the left: a start at 09:00 first counts the stamp at 10:00.
 *   - Missing and zero are different things. A gap never becomes 0 mm, never joins a line across
 *     it, and never improves a score.
 */

export const HOUR_MS = 3_600_000;

export const FORECAST_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
export const ENSEMBLE_ENDPOINT = "https://ensemble-api.open-meteo.com/v1/ensemble";
export const META_ENDPOINT = "https://ensemble-api.open-meteo.com/data";

/** Chart variables, in the order the page draws them. */
export const FORECAST_VARS = [
  "temperature_2m",
  "relative_humidity_2m",
  "dew_point_2m",
  "precipitation",
  "wind_speed_10m",
  "shortwave_radiation",
];

/** The score needs nothing else: air temperature while applying, precipitation for the whole window. */
export const ENSEMBLE_VARS = ["temperature_2m", "precipitation"];

/** Verified live 2026-09-23. A response in other units is a changed API, not something to convert
 * silently - the caller is expected to fail loudly rather than publish mislabelled axes. */
export const EXPECTED_UNITS = {
  temperature_2m: "°C",
  relative_humidity_2m: "%",
  dew_point_2m: "°C",
  precipitation: "mm",
  wind_speed_10m: "km/h",
  shortwave_radiation: "W/m²",
};

// ---------------------------------------------------------------------------
// Local time. The browser twin of src/time.ts (which stays as-is for the older
// TypeScript modules); same iterative Intl approach, no offset tables, DST-safe.
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

/** Hour of day 0-23 of an instant in the given zone. */
export function localHourOf(ms, timeZone) {
  return Number(localParts(ms, timeZone).hour);
}

/** "HH:mm" of an instant in the given zone. */
export function localTimeLabel(ms, timeZone) {
  const p = localParts(ms, timeZone);
  return `${p.hour}:${p.minute}`;
}

/** Pure calendar arithmetic on an ISO date - no zone involved. */
export function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Inclusive list of ISO dates from `start` to `end`. */
export function eachDate(start, end) {
  const dates = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);
  return dates;
}

/**
 * The instant at which the given local wall-clock hour of the given local date begins. Solved by
 * interpreting the zone's own label as UTC and correcting the difference, which converges in a step
 * or two and stays correct across DST changes (on a spring-forward gap it lands on the instant the
 * clock jumps to, which is the only sensible answer).
 */
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

/** Sums of one-decimal millimetres accumulate float dust; 3 decimals is far below what the data
 * resolves and makes "exactly 0.2" behave like exactly 0.2. */
export function round3(x) {
  return Math.round(x * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Request building - one definition, used by the generator and by the page.
// ---------------------------------------------------------------------------

/**
 * The local dates the request has to cover. The last candidate start is `end` 23:00, and it needs
 * applicationHours + postApplicationHours beyond that, so with 8 + 24 the data must reach 07:00 two
 * days after the window - all of it derived, so switching to 48h moves the boundary by itself.
 */
export function requestDates(cfg) {
  const reach = 23 + cfg.applicationHours + cfg.postApplicationHours;
  return { startDate: cfg.start, endDate: addDays(cfg.end, Math.floor(reach / 24)) };
}

function baseParams(cfg) {
  const { startDate, endDate } = requestDates(cfg);
  return {
    latitude: String(cfg.latitude),
    longitude: String(cfg.longitude),
    models: cfg.model,
    start_date: startDate,
    end_date: endDate,
    timezone: cfg.timezone,
    // Epoch seconds: unambiguous instants in, local labels derived here. The timezone parameter then
    // only decides which local days start_date/end_date mean.
    timeformat: "unixtime",
  };
}

function withQuery(base, params) {
  const q = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return `${base}?${q}`;
}

export function forecastUrl(cfg) {
  return withQuery(FORECAST_ENDPOINT, { ...baseParams(cfg), hourly: FORECAST_VARS.join(",") });
}

export function ensembleUrl(cfg) {
  return withQuery(ENSEMBLE_ENDPOINT, { ...baseParams(cfg), hourly: ENSEMBLE_VARS.join(",") });
}

export function metaUrl(cfg) {
  return cfg.metaDomain ? `${META_ENDPOINT}/${cfg.metaDomain}/static/meta.json` : null;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function requireHourly(json, what) {
  if (json && json.error) throw new Error(`Open-Meteo (${what}): ${json.reason || "neznáma chyba"}`);
  if (!json || !json.hourly || !Array.isArray(json.hourly.time)) throw new Error(`Open-Meteo (${what}): odpoveď bez hodinových dát`);
}

function checkUnits(json, vars, what) {
  const units = json.hourly_units || {};
  for (const v of vars) {
    const expected = EXPECTED_UNITS[v];
    const got = units[v];
    // Ensemble responses label the control column exactly like the plain variable, so one check per
    // variable is enough; a member in different units has never been observed and would be an API change.
    if (expected && got && got !== expected) throw new Error(`Open-Meteo (${what}): ${v} prišlo v ${got}, očakávam ${expected}`);
  }
}

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

/** The deterministic run that draws charts 2-5. */
export function parseForecast(json) {
  requireHourly(json, "predpoveď");
  checkUnits(json, FORECAST_VARS, "predpoveď");
  const h = json.hourly;
  const n = h.time.length;
  return {
    timesMs: h.time.map((t) => t * 1000),
    temperature: column(h, "temperature_2m", n),
    humidity: column(h, "relative_humidity_2m", n),
    dewPoint: column(h, "dew_point_2m", n),
    precipitation: column(h, "precipitation", n),
    wind: column(h, "wind_speed_10m", n),
    radiation: column(h, "shortwave_radiation", n),
    utcOffsetSeconds: json.utc_offset_seconds ?? 0,
    grid: { latitude: json.latitude, longitude: json.longitude, elevation: json.elevation },
  };
}

/**
 * Members are discovered from the response instead of being generated from a hardcoded list of 51
 * field names, so a product whose membership changes is read correctly. A member counts only when
 * both variables are present; the unsuffixed pair is the control run and sorts first.
 */
export function memberKeys(hourly) {
  const suffix = (prefix, key) => key.slice(prefix.length);
  const temps = new Set(Object.keys(hourly).filter((k) => /^temperature_2m(_member\d+)?$/.test(k)).map((k) => suffix("temperature_2m", k)));
  const precs = Object.keys(hourly)
    .filter((k) => /^precipitation(_member\d+)?$/.test(k))
    .map((k) => suffix("precipitation", k));
  return precs.filter((s) => temps.has(s)).sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)));
}

export function parseEnsemble(json) {
  requireHourly(json, "ansámbel");
  checkUnits(json, ENSEMBLE_VARS, "ansámbel");
  const h = json.hourly;
  const n = h.time.length;
  const keys = memberKeys(h);
  return {
    timesMs: h.time.map((t) => t * 1000),
    members: keys.map((key) => ({
      key: key === "" ? "control" : key.replace(/^_/, ""),
      temperature: column(h, `temperature_2m${key}`, n),
      precipitation: column(h, `precipitation${key}`, n),
    })),
    utcOffsetSeconds: json.utc_offset_seconds ?? 0,
    grid: { latitude: json.latitude, longitude: json.longitude, elevation: json.elevation },
  };
}

/**
 * The model run the numbers actually come from, or null when the source does not say. ECMWF's
 * 06z/18z ensemble cycles only reach 144h, so past that horizon the API still serves the previous
 * 00z/12z run and the metadata's own initialisation time would overstate the freshness.
 * Never a stand-in for the fetch time - the page shows the two separately or omits this one.
 */
export function resolveRun(meta, lastNeededMs) {
  if (!meta) return null;
  const init = meta.last_run_initialisation_time;
  const dataEnd = meta.data_end_time;
  const interval = meta.update_interval_seconds;
  if (![init, dataEnd, interval].every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  if (dataEnd * 1000 >= lastNeededMs) return { runAtMs: init * 1000, source: "meta" };
  return { runAtMs: (init - interval) * 1000, source: "meta" };
}

// ---------------------------------------------------------------------------
// The score
// ---------------------------------------------------------------------------

/** Every hourly start in the window: 24 per day, as instants. */
export function startTimes(cfg) {
  const starts = [];
  for (const date of eachDate(cfg.start, cfg.end)) {
    for (let hour = 0; hour < 24; hour++) starts.push(localTimeMs(date, hour, cfg.timezone));
  }
  return starts;
}

/** The last instant any start needs data for - the horizon the sources have to reach. */
export function lastNeededMs(cfg) {
  const starts = startTimes(cfg);
  return starts[starts.length - 1] + (cfg.applicationHours + cfg.postApplicationHours) * HOUR_MS;
}

function indexByTime(timesMs) {
  const idx = new Map();
  for (let i = 0; i < timesMs.length; i++) idx.set(timesMs[i], i);
  return idx;
}

/**
 * One member against one start: true (fits), false (does not), or null (cannot tell - a value the
 * rule needs is missing). Null must never be folded into either of the other two.
 *
 * Temperature is checked at the 9 hourly points from the start to the end of the 8h of work,
 * boundaries included. Precipitation is summed over the 32 hourly accumulations that cover the work
 * plus the 24h watch period, i.e. the stamps start+1h ... start+32h.
 */
export function judgeMember(member, startMs, cfg, idx) {
  for (let k = 0; k <= cfg.applicationHours; k++) {
    const i = idx.get(startMs + k * HOUR_MS);
    const t = i === undefined ? null : member.temperature[i];
    if (t === null) return null;
    if (round3(t) < cfg.minimumAirTemperatureC) return false;
  }
  const steps = cfg.applicationHours + cfg.postApplicationHours;
  let sum = 0;
  for (let k = 1; k <= steps; k++) {
    const i = idx.get(startMs + k * HOUR_MS);
    const p = i === undefined ? null : member.precipitation[i];
    if (p === null) return null;
    sum += p;
  }
  return round3(sum) < cfg.maximumWindowPrecipitationMm;
}

/**
 * Share of ensemble scenarios that fit, per hourly start.
 *
 * The denominator is the expected membership of the product, never "however many columns happened
 * to arrive": a response short of a member, or a member short of one of the values a start needs,
 * makes that start `score: null` ("Nedostatok dát"). Dropping the incomplete member instead would
 * quietly turn thin data into a better-looking percentage.
 */
export function scoreStarts(ens, cfg) {
  const idx = indexByTime(ens.timesMs);
  const expected = cfg.expectedEnsembleMembers;
  const membersMissing = ens.members.length !== expected;
  return startTimes(cfg).map((startMs) => {
    if (membersMissing) return { startMs, score: null, matching: 0, expected, reason: "members" };
    let matching = 0;
    for (const member of ens.members) {
      const verdict = judgeMember(member, startMs, cfg, idx);
      if (verdict === null) return { startMs, score: null, matching: 0, expected, reason: "horizon" };
      if (verdict) matching++;
    }
    return { startMs, score: Math.round((100 * matching) / expected), matching, expected, reason: null };
  });
}

/** The best scored start of each local day, for the e-mail digest. Days without a single computable
 * start are reported as such rather than as a zero. */
export function bestStartPerDay(scores, cfg) {
  return eachDate(cfg.start, cfg.end).map((date) => {
    const ofDay = scores.filter((s) => localDateOf(s.startMs, cfg.timezone) === date);
    const scored = ofDay.filter((s) => s.score !== null);
    if (scored.length === 0) return { date, best: null, computable: 0, total: ofDay.length };
    let best = scored[0];
    for (const s of scored) if (s.score > best.score) best = s;
    return { date, best, computable: scored.length, total: ofDay.length };
  });
}

// ---------------------------------------------------------------------------
// Precipitation aggregation
// ---------------------------------------------------------------------------

export const BUCKET_START_HOURS = [0, 6, 12, 18];

/**
 * Six-hour local buckets 00-06, 06-12, 12-18, 18-24. A bucket holds the accumulations stamped after
 * its start and up to and including its end, which is the same right-open convention the score uses
 * - so a bar, a daily total and the score can never disagree about which hour belongs where. The
 * bucket end is resolved through the zone rather than by adding 6h, so a DST day gets its real 5 or
 * 7 hours instead of a silently wrong sum.
 */
export function sixHourBuckets(series, cfg) {
  const idx = indexByTime(series.timesMs);
  const buckets = [];
  for (const date of eachDate(cfg.start, cfg.end)) {
    for (const startHour of BUCKET_START_HOURS) {
      const startMs = localTimeMs(date, startHour, cfg.timezone);
      const endMs = startHour === 18 ? localMidnightMs(addDays(date, 1), cfg.timezone) : localTimeMs(date, startHour + 6, cfg.timezone);
      const expectedHours = Math.round((endMs - startMs) / HOUR_MS);
      let total = 0;
      let hours = 0;
      for (let t = startMs + HOUR_MS; t <= endMs; t += HOUR_MS) {
        const i = idx.get(t);
        const v = i === undefined ? null : series.precipitation[i];
        if (v === null) continue;
        total += v;
        hours++;
      }
      buckets.push({
        date,
        startHour,
        startMs,
        endMs,
        totalMm: hours === 0 ? null : round3(total),
        hours,
        expectedHours,
        complete: hours === expectedHours,
      });
    }
  }
  return buckets;
}

/** Daily totals from the very same buckets, so the text line always matches the bars. A day missing
 * any hour is an incomplete total, not a smaller one. */
export function dailyTotals(buckets) {
  const byDate = new Map();
  for (const b of buckets) {
    let day = byDate.get(b.date);
    if (!day) {
      day = { date: b.date, totalMm: null, complete: true, hours: 0, expectedHours: 0 };
      byDate.set(b.date, day);
    }
    if (b.totalMm !== null) day.totalMm = round3((day.totalMm ?? 0) + b.totalMm);
    day.hours += b.hours;
    day.expectedHours += b.expectedHours;
    if (!b.complete) day.complete = false;
  }
  return [...byDate.values()];
}

const NICE_STEPS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100, 150, 200];

/**
 * One shared y-axis for the whole period, so a drizzle never looks dramatic just because a single
 * day was scaled to it. Derived from the tallest six-hour total anywhere in the window, plus
 * headroom, rounded up to a readable step - and never below 1 mm / 6h. Changing the selected day or
 * hour does not touch it; only new data does.
 */
export function precipAxisMax(buckets) {
  let max = 0;
  for (const b of buckets) if (b.totalMm !== null && b.totalMm > max) max = b.totalMm;
  if (max <= 1) return 1;
  const target = max * 1.15;
  for (const step of NICE_STEPS) if (step >= target) return step;
  return Math.ceil(target / 50) * 50;
}

// ---------------------------------------------------------------------------
// The snapshot embedded in the page (and re-made in the browser on refresh)
// ---------------------------------------------------------------------------

export const SNAPSHOT_VERSION = 1;

/** Last instant for which a variable has a value, so the page can say honestly how far the data
 * actually reaches rather than implying the axis is full. */
function coverageEndMs(timesMs, columns) {
  let last = null;
  for (const col of columns) {
    let end = null;
    for (let i = col.length - 1; i >= 0; i--) {
      if (col[i] !== null) {
        end = timesMs[i];
        break;
      }
    }
    if (end === null) return null;
    if (last === null || end < last) last = end;
  }
  return last;
}

/**
 * Everything the page draws, derived once by whoever has the raw responses - the generator at build
 * time, the page itself after a manual refresh. Both call this same function, so a refreshed page
 * can never drift from a generated one.
 */
export function buildSnapshot(forecastJson, ensembleJson, metaJson, cfg, fetchedAtMs) {
  const series = parseForecast(forecastJson);
  const ens = parseEnsemble(ensembleJson);
  const buckets = sixHourBuckets(series, cfg);
  const scores = scoreStarts(ens, cfg);
  const run = resolveRun(metaJson, lastNeededMs(cfg));
  return {
    version: SNAPSHOT_VERSION,
    fetchedAtMs,
    runAtMs: run ? run.runAtMs : null,
    runSource: run ? run.source : null,
    config: cfg,
    grid: series.grid,
    utcOffsetSeconds: series.utcOffsetSeconds,
    series: {
      timesMs: series.timesMs,
      temperature: series.temperature,
      dewPoint: series.dewPoint,
      humidity: series.humidity,
      precipitation: series.precipitation,
      wind: series.wind,
      radiation: series.radiation,
    },
    scores,
    buckets,
    daily: dailyTotals(buckets),
    precipAxisMax: precipAxisMax(buckets),
    ensemble: {
      discovered: ens.members.length,
      expected: cfg.expectedEnsembleMembers,
      precipCoverageEndMs: coverageEndMs(ens.timesMs, ens.members.map((m) => m.precipitation)),
      tempCoverageEndMs: coverageEndMs(ens.timesMs, ens.members.map((m) => m.temperature)),
    },
  };
}
