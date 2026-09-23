/**
 * The page itself: five charts over one shared time axis, the start picker, the shared cursor and
 * the refresh button. Plain ESM JavaScript with no imports - it is inlined into docs/index.html
 * right after src/window-core.js and calls into it directly.
 *
 * Everything that decides a number lives in window-core.js. This file only draws and reacts, so a
 * refresh in the browser and a render on the server can never disagree about what the data says.
 *
 * Charts are hand-written SVG, like everywhere else in this project, and are re-rendered at the
 * container's real pixel width (not scaled by viewBox) so labels stay the same readable size on a
 * phone as on a desktop.
 */

const GEO = {
  marginLeft: 46,
  marginRight: 14,
  // Room above the plot for the axis unit, which sits in the left margin so it can never collide
  // with the data.
  marginTop: 24,
  marginBottom: 24,
  plotHeight: 112,
  scorePlotHeight: 132,
  minWidth: 300,
  maxWidth: 1000,
};

const state = {
  snapshot: null,
  /** Selected start, as an instant. Kept across refreshes. */
  startMs: null,
  /** Length of one work session in hours - a coat need not happen in one go. */
  durationHours: 8,
  cursorMs: null,
  cursorChart: null,
  width: 900,
  pending: false,
  /** Only the newest request may write to the state - a slow earlier one must not overwrite it. */
  seq: 0,
  error: null,
  lastSuccessMs: null,
  charts: [],
};

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const NB = " ";

function num(value, digits) {
  return value.toFixed(digits).replace(".", ",");
}

function dayLabel(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const weekday = new Intl.DateTimeFormat("sk-SK", { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
  return `${weekday} ${d}.${m}.`;
}

function shortDate(isoDate) {
  const [, m, d] = isoDate.split("-").map(Number);
  return `${d}.${m}.`;
}

function cfg() {
  return state.snapshot.config;
}

function hhmm(ms) {
  return localTimeLabel(ms, cfg().timezone);
}

/** "1.10. 09:00", and only the time when the date is already obvious from the context. */
function stamp(ms, withDate) {
  const date = localDateOf(ms, cfg().timezone);
  return withDate ? `${shortDate(date)} ${hhmm(ms)}` : hhmm(ms);
}

function clockLabel(ms) {
  const parts = localParts(ms, cfg().timezone);
  return `${Number(parts.day)}.${Number(parts.month)}. ${parts.hour}:${parts.minute}`;
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Axis
// ---------------------------------------------------------------------------

/** The visible domain: local midnight opening the window to local midnight closing it. Identical in
 * all five charts, and unaffected by the selection - the point is to compare the five days. */
function domain() {
  const c = cfg();
  return { fromMs: localMidnightMs(c.start, c.timezone), toMs: localMidnightMs(addDays(c.end, 1), c.timezone) };
}

function plotWidth() {
  return state.width - GEO.marginLeft - GEO.marginRight;
}

function xOf(ms) {
  const { fromMs, toMs } = domain();
  const ratio = (ms - fromMs) / (toMs - fromMs);
  return GEO.marginLeft + Math.max(0, Math.min(1, ratio)) * plotWidth();
}

/** Instant under a pixel, clamped to the visible domain. */
function msAtX(x) {
  const { fromMs, toMs } = domain();
  const ratio = (x - GEO.marginLeft) / plotWidth();
  return fromMs + Math.max(0, Math.min(1, ratio)) * (toMs - fromMs);
}

function nearestHour(ms) {
  return Math.round(ms / HOUR_MS) * HOUR_MS;
}

// ---------------------------------------------------------------------------
// Series access
// ---------------------------------------------------------------------------

let seriesIndex = new Map();

function reindex() {
  seriesIndex = new Map();
  const times = state.snapshot.series.timesMs;
  for (let i = 0; i < times.length; i++) seriesIndex.set(times[i], i);
}

function valueAt(field, ms) {
  const i = seriesIndex.get(ms);
  return i === undefined ? null : state.snapshot.series[field][i];
}

/** Scores for the session length currently chosen; the snapshot carries one list per length. */
function scoresList() {
  return state.snapshot.scoresByDuration[state.durationHours] || [];
}

function scoreAt(ms) {
  return scoresList().find((s) => s.startMs === ms) || null;
}

/** True when a session of the chosen length starting at `ms` fits inside the working day. */
function isWorkingStart(ms) {
  return validStartHours(cfg(), state.durationHours).includes(localHourOf(ms, cfg().timezone));
}

function bucketAt(ms) {
  return state.snapshot.buckets.find((b) => ms > b.startMs && ms <= b.endMs) || null;
}

/** Points of one variable inside the visible domain, nulls kept so gaps stay gaps. */
function visiblePoints(field) {
  const { fromMs, toMs } = domain();
  const out = [];
  const times = state.snapshot.series.timesMs;
  for (let i = 0; i < times.length; i++) {
    if (times[i] < fromMs || times[i] > toMs) continue;
    out.push({ ms: times[i], value: state.snapshot.series[field][i] });
  }
  return out;
}

// ---------------------------------------------------------------------------
// SVG building blocks
// ---------------------------------------------------------------------------

/** A line is cut wherever a value is missing: no interpolation across a gap. */
function linePath(points, yOf) {
  let d = "";
  let pen = false;
  for (const p of points) {
    if (p.value === null) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"} ${xOf(p.ms).toFixed(1)} ${yOf(p.value).toFixed(1)} `;
    pen = true;
  }
  return d.trim();
}

function areaPath(points, yOf, baseY) {
  let d = "";
  let run = [];
  const flush = () => {
    if (run.length < 2) {
      run = [];
      return;
    }
    d += `M ${xOf(run[0].ms).toFixed(1)} ${baseY.toFixed(1)} `;
    for (const p of run) d += `L ${xOf(p.ms).toFixed(1)} ${yOf(p.value).toFixed(1)} `;
    d += `L ${xOf(run[run.length - 1].ms).toFixed(1)} ${baseY.toFixed(1)} Z `;
    run = [];
  };
  for (const p of points) {
    if (p.value === null) flush();
    else run.push(p);
  }
  flush();
  return d.trim();
}

function niceCeil(value) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (step * magnitude >= value) return step * magnitude;
  }
  return 10 * magnitude;
}

/**
 * Gridlines on readable numbers. Dividing the range into a fixed number of slices would print ticks
 * like 1,5 or 7,5 next to lines that do not sit on them; a step picked from 1/2/5 x 10^n always
 * labels what it draws.
 */
function axisTicks(min, max, target) {
  const raw = (max - min) / target;
  if (!(raw > 0)) return [min];
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((s) => s * magnitude).find((s) => s >= raw - 1e-12) ?? 10 * magnitude;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step / 1000; v += step) ticks.push(round3(v));
  return ticks;
}

/** Enough decimals for the step, never more. */
function tickFormatter(ticks) {
  const smallest = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : 1;
  const digits = smallest >= 1 ? 0 : smallest >= 0.1 ? 1 : 2;
  return (t) => num(t, digits);
}

/** Day separators plus one centred label per day, the same in every chart. */
function dayDecorations(height) {
  const c = cfg();
  const bottom = height - GEO.marginBottom;
  let grid = "";
  let labels = "";
  for (const date of eachDate(c.start, c.end)) {
    const from = localMidnightMs(date, c.timezone);
    const to = localMidnightMs(addDays(date, 1), c.timezone);
    grid += `<line class="wx-day-line" x1="${xOf(from).toFixed(1)}" x2="${xOf(from).toFixed(1)}" y1="${GEO.marginTop}" y2="${bottom}" />`;
    const mid = (xOf(from) + xOf(to)) / 2;
    labels += `<text class="wx-day-label" x="${mid.toFixed(1)}" y="${height - 7}" text-anchor="middle">${esc(dayLabel(date))}</text>`;
  }
  grid += `<line class="wx-day-line" x1="${xOf(domain().toMs).toFixed(1)}" x2="${xOf(domain().toMs).toFixed(1)}" y1="${GEO.marginTop}" y2="${bottom}" />`;
  return { grid, labels };
}

/** The 8h of work and the 24h watch period, clipped to the axis. Painted under the data. */
function windowBands(height) {
  if (state.startMs === null) return "";
  const c = cfg();
  const bottom = height - GEO.marginBottom;
  const workEnd = state.startMs + state.durationHours * HOUR_MS;
  const monitorEnd = workEnd + c.postApplicationHours * HOUR_MS;
  const { fromMs, toMs } = domain();
  const band = (from, to, cls) => {
    const a = Math.max(from, fromMs);
    const b = Math.min(to, toMs);
    if (b <= a) return "";
    return `<rect class="${cls}" x="${xOf(a).toFixed(1)}" y="${GEO.marginTop}" width="${(xOf(b) - xOf(a)).toFixed(1)}" height="${bottom - GEO.marginTop}" />`;
  };
  return band(state.startMs, workEnd, "wx-band-work") + band(workEnd, monitorEnd, "wx-band-watch");
}

function yAxis(ticks, yOf, unit) {
  const format = tickFormatter(ticks);
  let out = `<text class="wx-unit" x="2" y="14">${esc(unit)}</text>`;
  for (const t of ticks) {
    const y = yOf(t);
    out += `<line class="wx-grid" x1="${GEO.marginLeft}" x2="${(state.width - GEO.marginRight).toFixed(1)}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" />`;
    out += `<text class="wx-tick" x="${GEO.marginLeft - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end">${esc(format(t))}</text>`;
  }
  return out;
}

function chartFrame(id, height, inner, ariaLabel) {
  return (
    `<svg class="wx-svg" viewBox="0 0 ${state.width} ${height}" width="${state.width}" height="${height}" ` +
    `role="img" aria-label="${esc(ariaLabel)}" data-chart="${id}">${inner}` +
    `<line class="wx-cursor" data-cursor="${id}" x1="0" x2="0" y1="${GEO.marginTop}" y2="${height - GEO.marginBottom}" style="opacity:0" />` +
    `<rect class="wx-capture" data-capture="${id}" x="${GEO.marginLeft}" y="${GEO.marginTop}" width="${plotWidth().toFixed(1)}" height="${height - GEO.marginTop - GEO.marginBottom}" />` +
    `</svg>`
  );
}

// ---------------------------------------------------------------------------
// The five charts
// ---------------------------------------------------------------------------

function renderScoreChart() {
  const height = GEO.scorePlotHeight + GEO.marginTop + GEO.marginBottom;
  const bottom = height - GEO.marginBottom;
  const yOf = (pct) => bottom - (pct / 100) * GEO.scorePlotHeight;
  const { fromMs, toMs } = domain();
  const points = scoresList()
    .filter((s) => s.startMs >= fromMs && s.startMs <= toMs)
    .map((s) => ({ ms: s.startMs, value: s.score }));
  const decor = dayDecorations(height);

  let marker = "";
  const selected = state.startMs === null ? null : scoreAt(state.startMs);
  if (selected && selected.score !== null) {
    marker = `<circle class="wx-marker" cx="${xOf(selected.startMs).toFixed(1)}" cy="${yOf(selected.score).toFixed(1)}" r="4" />`;
  }

  const inner =
    windowBands(height) +
    yAxis([0, 25, 50, 75, 100], yOf, "%") +
    decor.grid +
    `<path class="wx-score-area" d="${areaPath(points, yOf, bottom)}" />` +
    `<path class="wx-score-line" d="${linePath(points, yOf)}" />` +
    marker +
    decor.labels;
  return chartFrame("score", height, inner, "Graf vhodnosti počasia pre jednotlivé hodiny začiatku, v percentách vyhovujúcich scenárov");
}

function renderRainChart() {
  const height = GEO.plotHeight + GEO.marginTop + GEO.marginBottom;
  const bottom = height - GEO.marginBottom;
  const max = state.snapshot.precipAxisMax;
  const yOf = (mm) => bottom - (mm / max) * GEO.plotHeight;
  const decor = dayDecorations(height);

  let bars = "";
  for (const b of state.snapshot.buckets) {
    if (b.totalMm === null) continue;
    const x0 = xOf(b.startMs);
    const x1 = xOf(b.endMs);
    const w = Math.max(1, x1 - x0 - 3);
    const y = yOf(Math.min(b.totalMm, max));
    const h = Math.max(b.totalMm > 0 ? 1 : 0, bottom - y);
    if (h <= 0) continue;
    bars += `<rect class="wx-bar${b.complete ? "" : " wx-bar-partial"}" x="${(x0 + 1.5).toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" />`;
  }

  const inner =
    windowBands(height) +
    yAxis(axisTicks(0, max, 3), yOf, `mm / 6${NB}h`) +
    decor.grid +
    bars +
    decor.labels;
  return chartFrame("rain", height, inner, `Graf úhrnov zrážok po šiestich hodinách, os 0 až ${num(max, 0)} milimetrov`);
}

function renderTemperatureChart() {
  const height = GEO.plotHeight + GEO.marginTop + GEO.marginBottom;
  const bottom = height - GEO.marginBottom;
  const temp = visiblePoints("temperature");
  const dew = visiblePoints("dewPoint");
  const values = [...temp, ...dew].map((p) => p.value).filter((v) => v !== null);
  const limit = cfg().minimumAirTemperatureC;
  const max = niceCeil(Math.max(limit + 2, ...values));
  const min = Math.min(0, Math.floor(Math.min(limit - 2, ...values) / 5) * 5);
  const yOf = (t) => bottom - ((t - min) / (max - min)) * GEO.plotHeight;
  const decor = dayDecorations(height);

  const inner =
    windowBands(height) +
    yAxis(axisTicks(min, max, 4), yOf, "°C") +
    decor.grid +
    `<line class="wx-limit" x1="${GEO.marginLeft}" x2="${(state.width - GEO.marginRight).toFixed(1)}" y1="${yOf(limit).toFixed(1)}" y2="${yOf(limit).toFixed(1)}" />` +
    `<text class="wx-limit-label" x="${(state.width - GEO.marginRight - 4).toFixed(1)}" y="${(yOf(limit) - 5).toFixed(1)}" text-anchor="end">hranica ${limit}${NB}°C</text>` +
    `<path class="wx-dew-line" d="${linePath(dew, yOf)}" />` +
    `<path class="wx-temp-line" d="${linePath(temp, yOf)}" />` +
    decor.labels;
  return chartFrame("temp", height, inner, "Graf teploty vzduchu a rosného bodu v stupňoch Celzia s vyznačenou hranicou 7 stupňov");
}

function renderWindChart() {
  const height = GEO.plotHeight + GEO.marginTop + GEO.marginBottom;
  const bottom = height - GEO.marginBottom;
  const wind = visiblePoints("wind");
  const max = niceCeil(Math.max(10, ...wind.map((p) => p.value).filter((v) => v !== null)));
  const yOf = (v) => bottom - (v / max) * GEO.plotHeight;
  const decor = dayDecorations(height);

  const inner =
    windowBands(height) +
    yAxis(axisTicks(0, max, 4), yOf, "km/h") +
    decor.grid +
    `<path class="wx-wind-line" d="${linePath(wind, yOf)}" />` +
    decor.labels;
  return chartFrame("wind", height, inner, "Graf rýchlosti vetra v kilometroch za hodinu");
}

function renderRadiationChart() {
  const height = GEO.plotHeight + GEO.marginTop + GEO.marginBottom;
  const bottom = height - GEO.marginBottom;
  const rad = visiblePoints("radiation");
  const max = niceCeil(Math.max(100, ...rad.map((p) => p.value).filter((v) => v !== null)));
  const yOf = (v) => bottom - (v / max) * GEO.plotHeight;
  const decor = dayDecorations(height);

  const inner =
    windowBands(height) +
    yAxis(axisTicks(0, max, 4), yOf, "W/m²") +
    decor.grid +
    `<path class="wx-sun-area" d="${areaPath(rad, yOf, bottom)}" />` +
    `<path class="wx-sun-line" d="${linePath(rad, yOf)}" />` +
    decor.labels;
  return chartFrame("sun", height, inner, "Graf krátkovlnného slnečného žiarenia vo wattoch na meter štvorcový");
}

const CHARTS = [
  { id: "score", render: renderScoreChart },
  { id: "rain", render: renderRainChart },
  { id: "temp", render: renderTemperatureChart },
  { id: "wind", render: renderWindChart },
  { id: "sun", render: renderRadiationChart },
];

// ---------------------------------------------------------------------------
// Text around the charts
// ---------------------------------------------------------------------------

function renderScoreReadout() {
  const node = document.getElementById("wx-score-value");
  if (state.startMs === null) return;
  const s = scoreAt(state.startMs);
  if (!s || s.score === null) {
    const why = s && s.reason === "members" ? "ansámbel neprišiel celý" : "predpoveď zatiaľ nesiaha tak ďaleko";
    node.textContent = isWorkingStart(state.startMs) ? `Nedostatok dát (${why})` : "Mimo pracovného času";
    node.classList.add("wx-missing");
    return;
  }
  node.classList.remove("wx-missing");
  node.textContent = `${s.score}${NB}% · ${s.matching} z ${s.expected} scenárov`;
}

function renderPlanLine() {
  const c = cfg();
  const workEnd = state.startMs + state.durationHours * HOUR_MS;
  const monitorEnd = workEnd + c.postApplicationHours * HOUR_MS;
  const startDate = localDateOf(state.startMs, c.timezone);
  const endDate = localDateOf(workEnd, c.timezone);
  const monitorDate = localDateOf(monitorEnd, c.timezone);
  // Both dates are spelled out whenever the work or the watch period crosses midnight.
  document.getElementById("wx-plan").textContent =
    `Natieranie: ${stamp(state.startMs, true)} – ${stamp(workEnd, endDate !== startDate)} (${state.durationHours}${NB}h) · ` +
    `Počasie sledovať do: ${stamp(monitorEnd, monitorDate !== endDate)}`;
}

function renderDailyRain() {
  const parts = state.snapshot.daily.map((d) => {
    if (d.totalMm === null) return `${shortDate(d.date)} ${NB}—`;
    return `${shortDate(d.date)} ${num(d.totalMm, 1)}${NB}mm${d.complete ? "" : `${NB}(neúplné)`}`;
  });
  document.getElementById("wx-daily").textContent = `Denné úhrny: ${parts.join(" · ")}`;
}

function renderMeta() {
  const s = state.snapshot;
  const bits = [`Zdroj: ${cfg().modelLabel} cez Open-Meteo`];
  // Only when the source really states it - a fetch time is not a model run.
  if (s.runAtMs) bits.push(`beh modelu ${clockLabel(s.runAtMs)}`);
  bits.push(`načítané ${clockLabel(s.fetchedAtMs)}`);
  document.getElementById("wx-meta").textContent = bits.join(" · ");

  const status = document.getElementById("wx-status");
  if (state.error) {
    status.textContent = state.error;
    status.hidden = false;
  } else {
    status.hidden = true;
  }

  const past = document.getElementById("wx-past");
  past.hidden = Date.now() < domain().toMs;
}

// ---------------------------------------------------------------------------
// Cursor and tooltip
// ---------------------------------------------------------------------------

function renderCursor() {
  const visible = state.cursorMs !== null;
  for (const el of document.querySelectorAll("[data-cursor]")) {
    el.style.opacity = visible ? "1" : "0";
    if (visible) {
      const x = xOf(state.cursorMs).toFixed(1);
      el.setAttribute("x1", x);
      el.setAttribute("x2", x);
    }
  }
  const tip = document.getElementById("wx-tooltip");
  if (!visible) {
    tip.hidden = true;
    return;
  }

  const ms = state.cursorMs;
  const rows = [];
  const s = scoreAt(ms);
  // The percentage belongs to an hourly start, so the tooltip shows that hour's real value and
  // never interpolates one between two starts.
  const suitability = s === null ? (isWorkingStart(ms) ? "Nedostatok dát" : "mimo pracovného času") : s.score === null ? "Nedostatok dát" : `${s.score}${NB}% (${s.matching} z ${s.expected})`;
  rows.push([`Vhodnosť pri štarte (${state.durationHours}${NB}h)`, suitability]);
  const bucket = bucketAt(ms);
  if (bucket) {
    const label = `${String(bucket.startHour).padStart(2, "0")}–${bucket.startHour === 18 ? "24" : String(bucket.startHour + 6).padStart(2, "0")}`;
    const value = bucket.totalMm === null ? "—" : `${num(bucket.totalMm, 1)}${NB}mm${bucket.complete ? "" : `${NB}(neúplné)`}`;
    rows.push([`Dážď ${label}`, value]);
  }
  const fields = [
    ["Teplota", "temperature", 1, "°C"],
    ["Rosný bod", "dewPoint", 1, "°C"],
    ["Vietor", "wind", 0, "km/h"],
    ["Slnko", "radiation", 0, "W/m²"],
  ];
  for (const [label, field, digits, unit] of fields) {
    const v = valueAt(field, ms);
    rows.push([label, v === null ? "—" : `${num(v, digits)}${NB}${unit}`]);
  }

  tip.innerHTML =
    `<strong>${esc(clockLabel(ms))}</strong>` +
    rows.map(([k, v]) => `<span class="wx-tip-row"><span>${esc(k)}</span><span>${esc(v)}</span></span>`).join("");
  tip.hidden = false;

  // Placed inside the charts container, next to the chart actually under the pointer, so it never
  // covers the values it is describing.
  const wrap = document.getElementById("wx-charts");
  const x = xOf(ms);
  const width = tip.offsetWidth || 190;
  tip.style.left = `${Math.max(8, Math.min(wrap.clientWidth - width - 8, x - width / 2))}px`;
  const host = state.cursorChart ? document.getElementById(`wx-chart-${state.cursorChart}`) : null;
  if (host) {
    const below = host.offsetTop + host.offsetHeight + 6;
    const above = host.offsetTop - tip.offsetHeight - 6;
    tip.style.top = `${below + tip.offsetHeight > wrap.clientHeight && above > 0 ? above : below}px`;
  }
}

// ---------------------------------------------------------------------------
// Interaction
// ---------------------------------------------------------------------------

/** The nearest start that is actually offered for the chosen session length. */
function snapToStart(ms) {
  const starts = scoresList();
  if (starts.length === 0) return ms;
  let best = starts[0].startMs;
  let bestDelta = Math.abs(ms - best);
  for (const s of starts) {
    const delta = Math.abs(ms - s.startMs);
    if (delta < bestDelta) {
      best = s.startMs;
      bestDelta = delta;
    }
  }
  return best;
}

function setStart(ms) {
  state.startMs = snapToStart(ms);
  syncControls();
  renderCharts();
  renderScoreReadout();
  renderPlanLine();
}

/** Steps through the offered starts rather than the clock, so leaving a working day lands on the
 * next day's first legal start instead of going nowhere. */
function moveStart(steps) {
  const starts = scoresList().map((s) => s.startMs);
  const here = starts.indexOf(state.startMs);
  if (here === -1) {
    setStart(state.startMs + steps * HOUR_MS);
    return;
  }
  const next = Math.max(0, Math.min(starts.length - 1, here + steps));
  setStart(starts[next]);
}

function syncControls() {
  const date = localDateOf(state.startMs, cfg().timezone);
  for (const button of document.querySelectorAll("[data-day]")) {
    const active = button.dataset.day === date;
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }
  // The hour list depends on the chosen length: an 8h session can only start 08:00-11:00, a 3h one
  // up to 16:00. Offering an hour that cannot be worked would be offering a number nobody can use.
  const hours = validStartHours(cfg(), state.durationHours);
  const select = document.getElementById("wx-hour");
  const wanted = String(localHourOf(state.startMs, cfg().timezone));
  select.innerHTML = hours.map((h) => `<option value="${h}">${String(h).padStart(2, "0")}:00</option>`).join("");
  select.value = wanted;
  document.getElementById("wx-duration").value = String(state.durationHours);
}

function renderScoreNote() {
  const c = cfg();
  document.getElementById("wx-score-note").textContent =
    `Viac percent = viac scenárov vyhovuje pre ${state.durationHours} h práce a ďalších ${c.postApplicationHours} h. ` +
    `Natierať sa dá ${c.workDayStartHour}:00–${c.workDayEndHour}:00, preto sú v grafe len začiatky, pri ktorých sa práca do tohto času zmestí. ` +
    `Hodnotíme dážď a teplotu, nie suchosť dreva.`;
}

/** Keeps the chosen length, moving the start to the nearest one that is still legal for it. */
function setDuration(hours) {
  state.durationHours = hours;
  state.startMs = snapToStart(state.startMs);
  syncControls();
  renderCharts();
  renderScoreReadout();
  renderScoreNote();
  renderPlanLine();
}

function bindEvents() {
  for (const button of document.querySelectorAll("[data-day]")) {
    button.addEventListener("click", () => {
      setStart(localTimeMs(button.dataset.day, localHourOf(state.startMs, cfg().timezone), cfg().timezone));
    });
  }
  document.getElementById("wx-hour").addEventListener("change", (e) => {
    setStart(localTimeMs(localDateOf(state.startMs, cfg().timezone), Number(e.target.value), cfg().timezone));
  });
  document.getElementById("wx-duration").addEventListener("change", (e) => setDuration(Number(e.target.value)));
  document.getElementById("wx-hour-prev").addEventListener("click", () => moveStart(-1));
  document.getElementById("wx-hour-next").addEventListener("click", () => moveStart(1));
  document.getElementById("wx-refresh").addEventListener("click", () => refresh(true));

  const info = document.getElementById("wx-method-toggle");
  info.addEventListener("click", () => {
    const panel = document.getElementById("wx-method");
    const open = !panel.hidden;
    panel.hidden = open;
    info.setAttribute("aria-expanded", open ? "false" : "true");
  });

  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshIfStale();
  });
  setInterval(refreshIfStale, 5 * 60 * 1000);
}

/** Pointer handling is attached after every render, because the SVGs are rebuilt wholesale. */
function bindChartPointers() {
  const wrap = document.getElementById("wx-charts");
  for (const capture of wrap.querySelectorAll("[data-capture]")) {
    const svg = capture.closest("svg");
    const locate = (event) => {
      const rect = svg.getBoundingClientRect();
      // The SVG is rendered at its real pixel width, so client pixels map straight onto the axis.
      return nearestHour(msAtX(event.clientX - rect.left));
    };
    capture.addEventListener("pointermove", (event) => {
      state.cursorMs = locate(event);
      state.cursorChart = svg.dataset.chart;
      renderCursor();
    });
    capture.addEventListener("pointerleave", () => {
      state.cursorMs = null;
      state.cursorChart = null;
      renderCursor();
    });
    capture.addEventListener("pointerdown", (event) => {
      state.cursorMs = locate(event);
      state.cursorChart = svg.dataset.chart;
      if (svg.dataset.chart === "score") setStart(state.cursorMs);
      renderCursor();
    });
  }

  const score = wrap.querySelector('svg[data-chart="score"]');
  if (score) {
    score.setAttribute("tabindex", "0");
    score.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight") moveStart(1);
      else if (event.key === "ArrowLeft") moveStart(-1);
      else if (event.key === "ArrowUp") moveStart(24);
      else if (event.key === "ArrowDown") moveStart(-24);
      else return;
      event.preventDefault();
    });
  }
}

let resizeTimer = null;

function onResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const next = measureWidth();
    if (next === state.width) return;
    state.width = next;
    renderCharts();
    renderCursor();
  }, 120);
}

function measureWidth() {
  const wrap = document.getElementById("wx-charts");
  return Math.round(Math.max(GEO.minWidth, Math.min(GEO.maxWidth, wrap.clientWidth || GEO.maxWidth)));
}

// ---------------------------------------------------------------------------
// Data refresh - real fetches, straight from the browser
// ---------------------------------------------------------------------------

function refreshIfStale() {
  if (document.visibilityState !== "visible" || state.pending) return;
  const age = Date.now() - (state.lastSuccessMs ?? state.snapshot.fetchedAtMs);
  if (age >= cfg().clientRefreshMinutes * 60 * 1000) refresh(false);
}

async function getJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function refresh(manual) {
  if (state.pending) return;
  state.pending = true;
  const seq = ++state.seq;
  const button = document.getElementById("wx-refresh");
  button.disabled = true;
  button.textContent = "Sťahujem…";

  try {
    const c = cfg();
    // Sequential on purpose: Open-Meteo answers a burst of parallel requests with an error body and
    // HTTP 200, and two requests a moment apart cost nothing here.
    const forecast = await getJson(forecastUrl(c));
    const ensemble = await getJson(ensembleUrl(c));
    let meta = null;
    try {
      const url = metaUrl(c);
      if (url) meta = await getJson(url);
    } catch {
      meta = null; // The run stamp is a nicety; never fail a refresh over it.
    }
    const next = buildSnapshot(forecast, ensemble, meta, c, Date.now());
    // A slower earlier request must never overwrite a newer answer.
    if (seq !== state.seq) return;
    state.snapshot = next;
    state.lastSuccessMs = next.fetchedAtMs;
    state.error = null;
    reindex();
    renderAll();
  } catch (err) {
    if (seq !== state.seq) return;
    const when = clockLabel(state.lastSuccessMs ?? state.snapshot.fetchedAtMs);
    state.error = `Predpoveď sa nepodarilo obnoviť (${err && err.message ? err.message : "chyba siete"}). Ukazujem posledné platné dáta z ${when}.`;
    renderMeta();
  } finally {
    if (seq === state.seq) {
      state.pending = false;
      button.disabled = false;
      button.textContent = "Obnoviť predpoveď";
    }
  }
  if (manual && state.error === null) renderMeta();
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function renderCharts() {
  const wrap = document.getElementById("wx-charts");
  for (const chart of CHARTS) {
    document.getElementById(`wx-chart-${chart.id}`).innerHTML = chart.render();
  }
  bindChartPointers();
  if (wrap) renderCursor();
}

function renderAll() {
  renderMeta();
  syncControls();
  renderCharts();
  renderScoreReadout();
  renderScoreNote();
  renderPlanLine();
  renderDailyRain();
}

function boot() {
  const raw = document.getElementById("wx-snapshot");
  if (!raw) return;
  state.snapshot = JSON.parse(raw.textContent);
  state.lastSuccessMs = state.snapshot.fetchedAtMs;
  state.width = measureWidth();
  reindex();

  const c = cfg();
  state.durationHours = c.applicationHours;
  state.startMs = snapToStart(localTimeMs(c.start, 9, c.timezone));

  bindEvents();
  renderAll();
  refreshIfStale();
}

boot();
