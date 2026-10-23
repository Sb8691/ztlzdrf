/**
 * The ski page's drawing code, as plain ESM JavaScript with no imports.
 *
 * It is inlined into docs/index.html right after src/ski-core.js, so the two share one scope and
 * everything core exports (localTimeMs, buildSkiSnapshot, ...) is simply in reach. Rendering is a
 * pure function from a snapshot to an HTML string (renderSki) - the tests call it without a DOM,
 * and the browser calls it again after every refresh. Only boot() touches the document, and only
 * when there is one.
 *
 * Colour follows the station everywhere: the top station is the first series colour, the base the
 * second. Verdicts are the good / fair / bad shares (calibrated probabilities on the deterministic
 * days, member shares on the ensemble days) and always carry their number, never colour alone.
 */

const STATUS_WORD = { good: "Dobré", fair: "Ujde", bad: "Zlé" };
/** Temperature during the snowfall, the page's word for each band (METODIKA §4.5). */
const BAND_WORD = { dry: "suchý", moist: "vlhší", wet: "mokrý" };
/** The POWDER_SNEH stage of a day whose probability reaches the flag threshold. */
const STAGE_WORD = { alert: "POWDER ALERT", pozor: "POWDER POZOR", vyhlad: "POWDER VÝHĽAD" };
/** A component is named among a day's concerns from this probability on - a display choice, not a
 * verified threshold (METODIKA §4.6). */
const CONCERN_FROM = 0.2;
/** The 3-day table names the powder chance from here on, so dry days stay quiet. */
const POWDER_LINE_FROM = 0.05;
/** EAWS danger levels in Slovak, the words the Slovak mountain rescue service uses for the same scale. */
const LEVEL_WORD = { 1: "nízke", 2: "mierne", 3: "zvýšené", 4: "vysoké", 5: "veľmi vysoké" };
/** The bulletin's tendency for the day after it. */
const TENDENCY_WORD = { steady: "ďalší deň bez zmeny", increasing: "ďalší deň stúpa", decreasing: "ďalší deň klesá" };
const NB = " ";

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Slovak decimal comma; `digits` decimals at most, trailing zeros dropped. */
function num(value, digits = 0) {
  const f = 10 ** digits;
  return String(Math.round(value * f) / f).replace(".", ",").replace(/^-0$/, "0").replace("-", "−");
}

function utcDate(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** "so 5. 12." */
function dayLabel(isoDate) {
  const d = utcDate(isoDate);
  const weekday = new Intl.DateTimeFormat("sk-SK", { weekday: "short", timeZone: "UTC" }).format(d);
  return `${weekday} ${d.getUTCDate()}.${NB}${d.getUTCMonth() + 1}.`;
}

/** "so" over "5. 12." - two short lines keep the first column narrow on a phone. */
function rowDayLabel(isoDate) {
  const d = utcDate(isoDate);
  const weekday = new Intl.DateTimeFormat("sk-SK", { weekday: "short", timeZone: "UTC" }).format(d);
  return `${esc(weekday)}<br>${d.getUTCDate()}.${NB}${d.getUTCMonth() + 1}.`;
}

/** "sobota 5. decembra" */
function longDayLabel(isoDate) {
  return new Intl.DateTimeFormat("sk-SK", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(utcDate(isoDate));
}

/** "dnes 14:05" / "včera 23:10" / "5. 12. 14:05" in the resorts' zone; without `nowMs` always the
 * date form, for text that must stay true however late it is read. */
function clockLabel(ms, nowMs, timeZone) {
  const p = localParts(ms, timeZone);
  const time = `${p.hour}:${p.minute}`;
  if (nowMs === null) return `${Number(p.day)}.${NB}${Number(p.month)}. ${time}`;
  const date = localDateOf(ms, timeZone);
  const today = localDateOf(nowMs, timeZone);
  if (date === today) return `dnes ${time}`;
  if (date === addDays(today, -1)) return `včera ${time}`;
  return `${Number(p.day)}.${NB}${Number(p.month)}. ${time}`;
}

function range(min, max, unit) {
  const a = num(min);
  const b = num(max);
  return a === b ? `${a}${NB}${unit}` : `${a} až ${b}${NB}${unit}`;
}

function statusMark(status) {
  if (!status) return `<span class="sk-status sk-none">Nedostatok dát</span>`;
  return `<span class="sk-status sk-${status}"><i aria-hidden="true"></i>${STATUS_WORD[status]}</span>`;
}

/** "35 %" from a probability. */
function pct(p) {
  return `${Math.round(p * 100)}${NB}%`;
}

/** The good / fair / bad bar - the one verdict language of the whole page: calibrated probabilities
 * on the deterministic days, member shares on the ensemble days. */
function shareBar(day) {
  const seg = (cls, v) => (v > 0 ? `<span class="sk-seg sk-${cls}" style="flex-grow:${v}"></span>` : "");
  return `<span class="sk-share" aria-hidden="true">${seg("good", day.goodPct)}${seg("fair", day.fairPct)}${seg("bad", day.badPct)}</span>`;
}

function shareTitle(day) {
  return `dobré ${day.goodPct}${NB}%, ujde ${day.fairPct}${NB}%, zlé ${day.badPct}${NB}%`;
}

/** The bar with the number that carries it (never colour alone). Without shares the verdict word,
 * which only happens when a model has no calibrated curves. */
function shareMark(day) {
  if (day.goodPct === null || day.goodPct === undefined) return statusMark(day.status);
  return `<span class="sk-prob">${shareBar(day)}<b>dobré ${day.goodPct}${NB}%</b></span>`;
}

/**
 * What may spoil the day: the page's own events with their probabilities (from CONCERN_FROM), the
 * temperature rule for soft snow and a likely inversion. The deterministic reasons when the day has
 * no probabilities.
 */
function concerns(day, cfg) {
  if (day.status === null) return "Predpoveď ešte nesiaha na celý deň.";
  const q = day.quality;
  if (!q) return day.reasons.length ? day.reasons.join(" · ") : "Bez výhrad.";
  const r = cfg.rules;
  const out = [];
  if (q.rainBad >= CONCERN_FROM) out.push(`dážď dole ${pct(q.rainBad)}`);
  else if (q.rainFair >= CONCERN_FROM) out.push(`slabý dážď dole ${pct(q.rainFair)}`);
  if (q.gustBad >= CONCERN_FROM) out.push(`nárazy nad ${r.gustBadKmh}${NB}km/h ${pct(q.gustBad)}, lanovky môžu stáť`);
  else if (q.gustFair >= CONCERN_FROM) out.push(`veterno ${pct(q.gustFair)}`);
  if (day.softSnow) out.push(`mäkký sneh dole (nad ${r.softSnowTempC}${NB}°C)`);
  if (q.sunLow >= CONCERN_FROM) out.push(`zamračené ${pct(q.sunLow)}`);
  if (q.inversion && q.inversion.probability >= 0.5) out.push(`hore teplejšie než dole ${pct(q.inversion.probability)}`);
  return out.length ? out.join(" · ") : "Bez výhrad.";
}

/** The stage badge of a day whose POWDER_SNEH probability reaches the flag threshold, else "". */
function powderBadge(day) {
  const ps = day.powderSnow;
  return ps && ps.alert && ps.stage ? `<b class="sk-alert">${STAGE_WORD[ps.stage]}</b>` : "";
}

/** The POWDER_SNEH rows of a card: the calibrated chance, and the expected new snow when there may
 * be any. Values are HTML. */
function powderRows(day, cfg) {
  const ps = day.powderSnow;
  if (!ps) return [];
  const rows = [[`Prašan do rána (≥ ${cfg.powder.thresholdCm}${NB}cm)`, pct(ps.probability)]];
  if (ps.p90Cm >= 1) {
    const band = day.quality && day.quality.snowTemp ? ` · ${BAND_WORD[day.quality.snowTemp.band]}` : "";
    rows.push(["Nový sneh do rána", esc(`okolo ${num(ps.medianCm)}, až ${num(ps.p90Cm)}${NB}cm${band}`)]);
  }
  return rows;
}

function links(resort, ava) {
  const bulletin = ava ? `<a href="${esc(ava.pageUrl)}" target="_blank" rel="noopener">Lavínová správa</a>` : "";
  return (
    `<p class="sk-links"><a href="${esc(resort.links.snowReport)}" target="_blank" rel="noopener">Snehová správa</a>` +
    `<a href="${esc(resort.links.webcam)}" target="_blank" rel="noopener">Webkamera</a>${bulletin}</p>`
  );
}

/** The danger level in its EAWS colour; the number is always there, never colour alone. */
function levelMark(level) {
  return `<b class="sk-lvl sk-lvl${level}">${level}</b>`;
}

/** "1800 m" or "hranicou lesa", after "nad" / "pod". */
function boundText(bound) {
  return bound === "treeline" ? "hranicou lesa" : `${num(Number(bound))}${NB}m`;
}

/**
 * The danger ratings of one region as one phrase: "3 zvýšené lavínové nebezpečenstvo nad 1800 m,
 * 1 nízke pod 1800 m"; with a daily course "ráno …; popoludní …". Within a part of the day the higher
 * level (the one above the bound) comes first.
 */
function ratingsText(ratings) {
  const parts = [];
  for (const period of ["all_day", "earlier", "later"]) {
    const rs = ratings.filter((r) => r.period === period).sort((a, b) => b.level - a.level);
    if (!rs.length) continue;
    const prefix = period === "earlier" ? "ráno " : period === "later" ? "popoludní " : "";
    const items = rs.map((r, i) => {
      const where = r.lower && r.upper ? ` medzi ${boundText(r.lower)} a ${boundText(r.upper)}` : r.lower ? ` nad ${boundText(r.lower)}` : r.upper ? ` pod ${boundText(r.upper)}` : "";
      return `${levelMark(r.level)} ${LEVEL_WORD[r.level]}${!parts.length && i === 0 ? " lavínové nebezpečenstvo" : ""}${where}`;
    });
    parts.push(prefix + items.join(", "));
  }
  return parts.join("; ");
}

/**
 * The avalanche line of a card (step 9): the danger ratings of the resort's region, the tendency, the
 * region's name, and a note when the bulletin in hand is for the day before the lift day (tomorrow's
 * edition is not out before 17:00). Nothing without a bulletin at all; a muted line when the bulletin
 * does not name the region (spring).
 */
function avalancheLine(ava, resort, liftDate, nowMs, cfg) {
  if (!ava) return "";
  const e = ava.resorts[resort.id];
  if (!e) return `<p class="sk-ava"><span class="sk-none">Lavínová správa pre túto oblasť nevyšla.</span></p>`;
  const bits = [];
  if (e.maxLevel === null) bits.push(e.noSnow ? "lavínová správa bez stupňa (bez snehu)" : "lavínová správa bez stupňa");
  else bits.push(ratingsText(e.ratings));
  if (e.tendency) bits.push(TENDENCY_WORD[e.tendency]);
  bits.push(esc(e.regionName));
  if (ava.date !== liftDate) bits.push(`správa na ${esc(dayLabel(ava.date))}${ava.validToMs ? `, platí do ${esc(clockLabel(ava.validToMs, nowMs, cfg.timezone))}` : ""}`);
  return `<p class="sk-ava">${bits.join(" · ")}</p>`;
}

/** " · lavínová správa dnes 8:00" for the section's source line, "" without a bulletin. */
function avalancheSource(ava, nowMs, cfg) {
  if (!ava || !ava.publishedAtMs) return "";
  return ` · lavínová správa ${esc(clockLabel(ava.publishedAtMs, nowMs, cfg.timezone))}`;
}

/** The snow-cover gate (step 8): true when the cover probability is known and below the configured
 * minimum - the day is then not judged at all. An unknown cover never gates. */
function noSnow(day, cfg) {
  const c = day.snowCover;
  return !!c && c.probability < cfg.cover.gate.minProb;
}

const NO_SNOW_MARK = `<span class="sk-status sk-none">Bez snehu</span>`;

function coverText(day, cfg) {
  const c = day.snowCover;
  return `sneh hore podľa modelu ${num(c.topCm)}${NB}cm, pokrývka aspoň ${cfg.cover.coverCm}${NB}cm ${pct(c.probability)}`;
}

/** "mimo sezóny (bežne od 22. 11. do 26. 4.)" outside the resort's usual season, else "". A note only:
 * whether lifts run is the snow report's business, the cover gate judges the snow. */
function seasonNote(resort, isoDate) {
  const s = resort && resort.season;
  if (!s) return "";
  const md = isoDate.slice(5);
  const inSeason = s.opens <= s.closes ? md >= s.opens && md <= s.closes : md >= s.opens || md <= s.closes;
  const dm = (x) => `${Number(x.slice(3))}.${NB}${Number(x.slice(0, 2))}.`;
  return inSeason ? "" : `mimo sezóny (bežne od ${dm(s.opens)} do ${dm(s.closes)})`;
}

// ---------------------------------------------------------------------------
// 1. The next lift day
// ---------------------------------------------------------------------------

function nowCard(resort, day, cfg, ava, nowMs) {
  const rows = [];
  const plain = (k, v) => rows.push([k, esc(v)]);
  rows.push(...powderRows(day, cfg));
  if (day.freshSnowCm !== null) plain("Nový sneh za 3 dni", `${num(day.freshSnowCm)}${NB}cm`);
  if (day.status) {
    plain("Teplota hore", range(day.topTemp.min, day.topTemp.max, "°C"));
    plain("Teplota dole", range(day.baseTemp.min, day.baseTemp.max, "°C"));
    plain("Nárazy vetra hore", `do ${num(day.maxGustKmh)}${NB}km/h`);
    plain("Slnko", `${num(day.sunHours, 1)}${NB}h`);
    if (day.rainBaseMm > 0) plain("Dážď dole", `${num(day.rainBaseMm, 1)}${NB}mm`);
  }
  // The badge gets a line of its own: in the value column it would wrap the row label on a phone.
  const badge = powderBadge(day);
  const flag = badge ? `<p class="sk-flag">${badge} prašan do rána ${pct(day.powderSnow.probability)}</p>` : "";
  const gated = noSnow(day, cfg);
  const why = [gated ? coverText(day, cfg) : concerns(day, cfg), seasonNote(resort, day.date)].filter(Boolean).join(" · ");
  return (
    `<article class="sk-card">` +
    `<header><h3>${esc(resort.name)}</h3>${gated ? NO_SNOW_MARK : shareMark(day)}</header>` +
    flag +
    avalancheLine(ava, resort, day.date, nowMs, cfg) +
    `<p class="sk-why">${esc(why)}</p>` +
    `<dl>${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>` +
    links(resort, ava) +
    `</article>`
  );
}

// ---------------------------------------------------------------------------
// 2. Three days: a day x resort table plus hourly charts per resort
// ---------------------------------------------------------------------------

/** Shares, then one short line per fact - narrow phone columns wrap a joined sentence badly. */
function shortCell(day, cfg, resort) {
  if (!day.status) return `<td>${statusMark(null)}</td>`;
  const gated = noSnow(day, cfg);
  const lines = [esc(range(day.topTemp.min, day.topTemp.max, "°C"))];
  const ps = day.powderSnow;
  if (ps && ps.probability >= POWDER_LINE_FROM) {
    const badge = powderBadge(day);
    lines.push(badge ? `${badge} ${pct(ps.probability)}` : esc(`prašan ${pct(ps.probability)}`));
  }
  if (day.freshSnowCm !== null && day.freshSnowCm >= 1) lines.push(esc(`${num(day.freshSnowCm)}${NB}cm snehu`));
  if (day.maxGustKmh > cfg.rules.gustFairKmh) lines.push(esc(`vietor ${num(day.maxGustKmh)}${NB}km/h`));
  const title = [gated ? coverText(day, cfg) : day.goodPct === null ? concerns(day, cfg) : `${shareTitle(day)} · ${concerns(day, cfg)}`, seasonNote(resort, day.date)].filter(Boolean).join(" · ");
  return `<td title="${esc(title)}">${gated ? NO_SNOW_MARK : shareMark(day)}${lines.map((l) => `<small>${l}</small>`).join("")}</td>`;
}

function dayTable(dates, resorts, cfg, cell, caption) {
  const head = cfg.resorts.map((r) => `<th scope="col">${esc(r.shortName)}</th>`).join("");
  const body = dates
    .map((date, i) => `<tr><th scope="row">${rowDayLabel(date)}</th>${resorts.map((r) => cell(r.days[i], cfg, cfg.resorts.find((x) => x.id === r.id))).join("")}</tr>`)
    .join("");
  return `<div class="sk-scroll"><table class="sk-table"><caption>${esc(caption)}</caption><thead><tr><th scope="col">Deň</th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

// Hourly charts: one small panel per measure on a shared time axis, never two y-scales in one.
const CW = 360;
const PAD = { left: 34, right: 8, top: 16, bottom: 4 };
const PANEL_H = 74;
const AXIS_H = 20;

function niceStep(span, target) {
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * mag >= raw) return m * mag;
  return 10 * mag;
}

function panel(h, title, values, opts) {
  const x0 = PAD.left;
  const x1 = CW - PAD.right;
  const fromMs = h.timesMs[0] - HOUR_MS;
  const toMs = h.timesMs[h.timesMs.length - 1];
  const xOf = (ms) => x0 + ((ms - fromMs) / (toMs - fromMs)) * (x1 - x0);
  const finite = values.flatMap((s) => s.data).filter((v) => v !== null);
  let lo = Math.min(opts.floor ?? Infinity, ...finite, ...(opts.refs ?? []).map((r) => r.value));
  let hi = Math.max(opts.ceil ?? -Infinity, ...finite, ...(opts.refs ?? []).map((r) => r.value));
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    lo = 0;
    hi = 1;
  }
  const step = niceStep(hi - lo || 1, 3);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  if (hi === lo) hi = lo + step;
  const y0 = PAD.top;
  const y1 = PAD.top + PANEL_H;
  const yOf = (v) => y1 - ((v - lo) / (hi - lo)) * (y1 - y0);

  let svg = `<text class="sk-ptitle" x="${x0}" y="11">${esc(title)}</text>`;
  // Lift hours, so it is visible which part of each day the verdict is about.
  const cfg = opts.cfg;
  for (const date of opts.dates) {
    const a = xOf(localTimeMs(date, cfg.liftOpenHour, cfg.timezone));
    const b = xOf(localTimeMs(date, cfg.liftCloseHour, cfg.timezone));
    svg += `<rect class="sk-lift" x="${a.toFixed(1)}" y="${y0}" width="${(b - a).toFixed(1)}" height="${PANEL_H}"/>`;
  }
  for (let v = lo; v <= hi + 1e-9; v += step) {
    const y = yOf(v).toFixed(1);
    svg += `<line class="sk-grid" x1="${x0}" x2="${x1}" y1="${y}" y2="${y}"/><text class="sk-tick" x="${x0 - 4}" y="${(+y + 3.5).toFixed(1)}" text-anchor="end">${num(v, 1)}</text>`;
  }
  for (const date of opts.dates.slice(1)) {
    const x = xOf(localMidnightMs(date, cfg.timezone)).toFixed(1);
    svg += `<line class="sk-dayline" x1="${x}" x2="${x}" y1="${y0}" y2="${y1}"/>`;
  }
  for (const r of opts.refs ?? []) {
    const y = yOf(r.value).toFixed(1);
    svg += `<line class="sk-ref" x1="${x0}" x2="${x1}" y1="${y}" y2="${y}"/><text class="sk-reflabel" x="${x1 - 2}" y="${(+y - 3).toFixed(1)}" text-anchor="end">${esc(r.label)}</text>`;
  }
  for (const s of values) {
    if (opts.bars) {
      // Each bar covers the hour its accumulation belongs to (the stamp ends the hour).
      const w = Math.max(1, (x1 - x0) / h.timesMs.length - 0.6);
      h.timesMs.forEach((t, i) => {
        const v = s.data[i];
        if (v === null || v <= 0) return;
        const top = yOf(v);
        svg += `<rect class="sk-bar ${s.cls}" x="${(xOf(t - HOUR_MS) + 0.3).toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="${(y1 - top).toFixed(1)}"/>`;
      });
    } else {
      // A gap breaks the line; it is never bridged.
      let d = "";
      let pen = false;
      h.timesMs.forEach((t, i) => {
        const v = s.data[i];
        if (v === null) {
          pen = false;
          return;
        }
        d += `${pen ? "L" : "M"}${xOf(t).toFixed(1)},${yOf(v).toFixed(1)}`;
        pen = true;
      });
      if (d) svg += `<path class="sk-line ${s.cls}" d="${d}"/>`;
    }
  }
  return { svg, height: y1 + PAD.bottom };
}

function hourlyChart(resort, hourly, dates, cfg) {
  if (!hourly || hourly.timesMs.length === 0) return "";
  const base = { cfg, dates };
  const panels = [
    panel(hourly, "Teplota (°C)", [
      { data: hourly.topTemp, cls: "sk-top" },
      { data: hourly.baseTemp, cls: "sk-base" },
    ], { ...base, refs: [{ value: 0, label: "0 °C" }] }),
    panel(hourly, "Sneh hore (cm za hodinu)", [{ data: hourly.snowTopCm, cls: "sk-top" }], { ...base, bars: true, floor: 0, ceil: 1 }),
    panel(hourly, "Nárazy vetra (km/h)", [{ data: hourly.gustKmh, cls: "sk-top" }], {
      ...base,
      floor: 0,
      refs: [
        { value: cfg.rules.gustFairKmh, label: `${cfg.rules.gustFairKmh}` },
        { value: cfg.rules.gustBadKmh, label: `${cfg.rules.gustBadKmh}` },
      ],
    }),
  ];
  let y = 0;
  let body = "";
  for (const p of panels) {
    body += `<g transform="translate(0,${y})">${p.svg}</g>`;
    y += p.height + 8;
  }
  // Day labels under the last panel.
  const x0 = PAD.left;
  const x1 = CW - PAD.right;
  const fromMs = hourly.timesMs[0] - HOUR_MS;
  const toMs = hourly.timesMs[hourly.timesMs.length - 1];
  for (const date of dates) {
    const mid = (localMidnightMs(date, cfg.timezone) + localMidnightMs(addDays(date, 1), cfg.timezone)) / 2;
    const x = x0 + ((mid - fromMs) / (toMs - fromMs)) * (x1 - x0);
    body += `<text class="sk-tick" x="${x.toFixed(1)}" y="${y + 6}" text-anchor="middle">${esc(dayLabel(date))}</text>`;
  }
  const height = y + AXIS_H - 6;
  const label = `Hodinový priebeh na ${resort.name}: teplota hore a dole, sneh a nárazy vetra`;
  return (
    `<details class="sk-hourly"><summary>${esc(resort.name)} – hodinový priebeh</summary>` +
    `<p class="sk-legend"><span><i class="sk-top"></i>hore ${num(resort.top.elevation)}${NB}m</span><span><i class="sk-base"></i>dole ${num(resort.base.elevation)}${NB}m</span><span><i class="sk-liftkey"></i>prevádzka lanoviek</span></p>` +
    `<svg class="sk-svg" viewBox="0 0 ${CW} ${height}" role="img" aria-label="${esc(label)}">${body}</svg>` +
    `</details>`
  );
}

// ---------------------------------------------------------------------------
// 3. Ten days: share of ensemble scenarios per verdict
// ---------------------------------------------------------------------------

function longCell(day, cfg, resort) {
  if (day.goodPct === null) return `<td><span class="sk-status sk-none">${day.reason === "members" ? "Neúplné dáta" : "Nedostatok dát"}</span></td>`;
  let snow = "";
  if (day.snowCm && day.snowCm.p90 >= 1) {
    snow = `<small>${num(day.snowCm.p10)}–${num(day.snowCm.p90)}${NB}cm snehu</small>`;
  }
  const gated = noSnow(day, cfg);
  const title = [gated ? coverText(day, cfg) : `${shareTitle(day)} scenárov`, seasonNote(resort, day.date)].filter(Boolean).join(" · ");
  return `<td title="${esc(title)}">${gated ? NO_SNOW_MARK : shareMark(day)}${snow}</td>`;
}

// ---------------------------------------------------------------------------
// The whole page body
// ---------------------------------------------------------------------------

const LEGEND = `<p class="sk-legend"><span><i class="sk-good"></i>dobré</span><span><i class="sk-fair"></i>ujde</span><span><i class="sk-bad"></i>zlé</span></p>`;

function method(cfg) {
  const r = cfg.rules;
  const p = cfg.powder;
  const st = cfg.quality.snowTemp;
  const a = cfg.avalanche;
  const alertDays = p.stages[0].maxDayOffset + 1;
  const avalanche = a
    ? `<p><b>Lavínové nebezpečenstvo</b> je stupeň 1 až 5 z lavínovej správy, ktorú ${esc(a.provider.name)} vydáva od zimy 2025/26 v spoločnom systéme ${esc(a.site.name)}: o 17:00 na nasledujúci deň, ráno o 8:00 môže prísť aktualizácia. Stredisko dostane stupeň mikroregiónu, v ktorom leží jeho horná stanica. „Nad“ a „pod“ je výška, od ktorej stupeň platí, „ráno“ a „popoludní“ jeho zmena počas dňa, „ďalší deň“ tendencia na deň po správe. Stupeň hovorí o voľnom teréne mimo zabezpečených zjazdoviek; na otvorenej zjazdovke zodpovedá za bezpečnosť stredisko, pri vyšších stupňoch však bývajú zatvorené lanovky, zjazdovky aj cesty.</p>`
    : "";
  return (
    `<details class="sk-method"><summary>Ako sa počítajú percentá?</summary>` +
    `<p>Hodnotí sa čas prevádzky lanoviek ${cfg.liftOpenHour}:00–${cfg.liftCloseHour}:00, pri každom stredisku pri najnižšej a najvyššej stanici lanovky. Deň je:</p>` +
    `<ul>` +
    `<li><b>zlý</b>, keď dole naprší aspoň ${num(r.rainBadMm, 1)}${NB}mm alebo nárazy vetra hore prekročia ${r.gustBadKmh}${NB}km/h (lanovky môžu stáť);</li>` +
    `<li><b>ujde</b>, keď dole naprší aspoň ${num(r.rainFairMm, 1)}${NB}mm, nárazy prekročia ${r.gustFairKmh}${NB}km/h, dole je aspoň pol dňa nad ${r.softSnowTempC}${NB}°C (mäkký sneh), alebo je menej ako ${r.minSunHours}${NB}h slnka (horšia viditeľnosť);</li>` +
    `<li><b>dobrý</b>, keď nič z toho.</li>` +
    `</ul>` +
    `<p><b>Bez snehu</b> znamená, že podľa modelu ICON-D2 nie je pri hornej stanici pokrývka aspoň ${cfg.cover.coverCm}${NB}cm, takže sa deň nehodnotí. Pravdepodobnosť pokrývky vychádza z toho, ako často stanice v okolí pri danej modelovej výške snehu naozaj mali aspoň ${cfg.cover.coverCm}${NB}cm (štyri zimy, 17 staníc); hodnotí sa od ${pct(cfg.cover.gate.minProb)}. Ďalšie dni berú dnešnú výšku snehu z ICON-D2 a pridajú k nej zmenu podľa svojho modelu. Bežné termíny sezóny stredísk stránka len poznamená; či lanovky bežia, povie snehová správa.</p>` +
    avalanche +
    `<p>Na najbližší deň a na tri dni sú pruh a percentá <b>pravdepodobnosti</b>. Pre každé pravidlo sa z predpovedaného dažďa, nárazu a slnka zoberie, ako často sa pri takej predpovedi naozaj splnilo – na šiestich horských staniciach GeoSphere Austria v okolí za štyri zimy. „Dobré“ je pravdepodobnosť, že sa nesplní žiadne (mäkký sneh sa berie z teploty priamo), „zlé“, že dole naprší aspoň ${num(r.rainBadMm, 1)}${NB}mm alebo zafúka nad ${r.gustBadKmh}${NB}km/h. Samotné áno/nie podľa predpovede pri overení neobstálo: dážď hlásilo viac než dvakrát častejšie, než prišiel, a vietor na vrcholoch z modelu na tri dni nesedí vôbec. Od štvrtého dňa tieto pravdepodobnosti strácajú hodnotu.</p>` +
    `<p><b>Prašan</b> je aspoň ${p.thresholdCm}${NB}cm nového snehu pri hornej stanici od ${p.windowHour}:00 predošlého dňa do ${p.windowHour}:00. Percento vychádza z predpovedaného úhrnu a z toho, ako sa predpovede s rovnakým predstihom trafili v minulých zimách na staniciach, kde sa nový sneh meria. <b>POWDER ALERT</b> svieti od ${Math.round(p.alert.minProb * 100)}${NB}% na prvé ${alertDays} dni, <b>POWDER POZOR</b> ďalej. „Okolo“ je stredná hodnota, „až“ hodnota, pod ktorou ostane deväť z desiatich prípadov. Suchý, vlhší alebo mokrý sneh je podľa teploty počas sneženia (do ${num(st.dryC)}${NB}°C, do ${num(st.wetC)}${NB}°C, teplejšie). Či prašan rozfúka vietor, sa predpovedať nedá. Nový sneh za 3 dni je súčet za ${r.freshSnowHours}${NB}h pred otvorením a počas dňa.</p>` +
    `<p>Či padá dážď alebo sneh, určuje teplota v danej výške: do ${num(r.snowMaxTempC)}${NB}°C sneh, nad ňou dážď.</p>` +
    `<p>Pri 10 dňoch prejde každý z 51 scenárov ansámblu ECMWF áno/nie pravidlami. Podiely sú podiely scenárov, nie kalibrované pravdepodobnosti, a sneh je rozpätie medzi 10. a 90. percentilom celodenného sneženia hore.</p>` +
    `<p><b>Čo predpoveď nevie:</b> či je stredisko otvorené, koľko snehu je na zjazdovke a či je upravená alebo technicky zasnežená. Na to slúžia snehová správa a webkamera. Model počíta zrážky, vietor a slnko pre celú oblasť, nie zvlášť pre vrchol. Na exponovanom hrebeni môže fúkať viac. Ansámbel má hrubú mriežku (asi 25${NB}km), preto sa v 10-dňovom výhľade strediská líšia hlavne teplotou.</p>` +
    `<p>Ak chýba čo i len jedna potrebná hodnota, deň sa neohodnotí. Chýbajúce údaje sa nikdy nepočítajú ako nula.</p>` +
    `</details>`
  );
}

/**
 * Everything below the header, from one snapshot. `nowMs` only decides the staleness note - the
 * days themselves come from the snapshot, so a refreshed page and a generated one cannot differ.
 */
function renderSki(snapshot, nowMs) {
  const cfg = snapshot.config;
  const H = snapshot.horizons;
  const resortsById = (h) => cfg.resorts.map((r) => h.resorts.find((x) => x.id === r.id));
  const now = resortsById(H.now);
  const short = resortsById(H.short);
  const long = resortsById(H.long);
  const source = (h) => `${h.label}${h.runAtMs ? `, beh ${clockLabel(h.runAtMs, nowMs, cfg.timezone)}` : ""}`;
  const stale = firstSkiDate(nowMs, cfg) > snapshot.firstDate;
  // A bulletin past its validity says nothing about the lift day: it is drawn as no bulletin (step 10b).
  const ava = avalancheCurrent(snapshot.avalanche, snapshot.firstDate, nowMs) ? snapshot.avalanche : null;

  return (
    (stale ? `<p class="sk-warn">Tieto dáta sú staršie a začínajú dňom, ktorý už je za nami. Obnovte predpoveď.</p>` : "") +
    `<section class="sk-section"><h2>${esc(longDayLabel(H.now.dates[0]))}</h2><p class="sk-src">Najbližší lyžiarsky deň · ${esc(source(H.now))}${avalancheSource(ava, nowMs, cfg)}</p>` +
    `<p class="sk-note">Pruh a percento sú pravdepodobnosť, že deň bude dobrý, ujde alebo zlý; pod názvom strediska je, čo ho môže pokaziť. „Bez snehu“: model nevidí hore pokrývku aspoň ${cfg.cover.coverCm}${NB}cm.${ava ? "" : " Lavínová správa pre tento deň nie je k dispozícii."}</p>` +
    LEGEND +
    `<div class="sk-cards">${cfg.resorts.map((r, i) => nowCard(r, now[i].days[0], cfg, ava, nowMs)).join("")}</div></section>` +
    `<section class="sk-section"><h2>Najbližšie ${H.short.dates.length} dni</h2><p class="sk-src">${esc(source(H.short))}</p>` +
    `<p class="sk-note">Pod pruhom: teplota pri hornej stanici počas prevádzky, šanca na prašan, nový sneh za 3 dni a silnejší vietor.</p>` +
    dayTable(H.short.dates, short, cfg, shortCell, `Pravdepodobnosti, že deň bude dobrý, ujde alebo zlý, na najbližšie ${H.short.dates.length} dni`) +
    cfg.resorts.map((r, i) => hourlyChart(r, short[i].hourly, H.short.dates, cfg)).join("") +
    `</section>` +
    `<section class="sk-section"><h2>Výhľad na ${H.long.dates.length} dní</h2><p class="sk-src">${esc(source(H.long))}</p>` +
    `<p class="sk-note">Pruh je podiel z 51 scenárov predpovede, nie kalibrovaná pravdepodobnosť; pod ním rozpätie snehu hore.${H.long.dates.length < cfg.horizons.long.days ? " Posledný deň pribudne s novým behom modelu." : ""}</p>` +
    LEGEND +
    dayTable(H.long.dates, long, cfg, longCell, `Výhľad na ${H.long.dates.length} dní`) +
    `</section>` +
    method(cfg)
  );
}

function renderMetaText(snapshot, nowMs) {
  return `Načítané ${clockLabel(snapshot.fetchedAtMs, nowMs, snapshot.config.timezone)} · dáta Open-Meteo`;
}

// ---------------------------------------------------------------------------
// Browser only
// ---------------------------------------------------------------------------

/** `paintedDay` is the local day of the last drawing, `failedAtMs` the last failed refresh. */
const state = { snapshot: null, pending: false, seq: 0, error: null, paintedDay: null, failedAtMs: 0 };

/** A request that never settles would keep the button on "Sťahujem…" and block every later refresh. */
const FETCH_TIMEOUT_MS = 45_000;
/** After a failed refresh the page waits this long before trying again by itself; the button still works. */
const RETRY_AFTER_FAILURE_MS = 10 * 60_000;

/** fetch + JSON with a timeout. `allow404` turns a missing file into null - the avalanche bulletin of
 * a day may simply not exist; anything else that is not OK is an error. */
async function getJson(url, allow404 = false) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
    if (allow404 && res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json && json.error) throw new Error(json.reason || "chyba Open-Meteo");
    return json;
  } catch (err) {
    throw ctrl.signal.aborted ? new Error("server neodpovedal včas") : err;
  } finally {
    clearTimeout(timer);
  }
}

function paint() {
  const nowMs = Date.now();
  state.paintedDay = localDateOf(nowMs, state.snapshot.config.timezone);
  document.getElementById("sk-meta").textContent = renderMetaText(state.snapshot, nowMs);
  // Keep open hourly charts open across a re-render.
  const open = new Set([...document.querySelectorAll("#sk-main details[open] > summary")].map((s) => s.textContent));
  document.getElementById("sk-main").innerHTML = renderSki(state.snapshot, nowMs);
  for (const s of document.querySelectorAll("#sk-main details > summary")) if (open.has(s.textContent)) s.parentElement.open = true;
  const status = document.getElementById("sk-status");
  status.hidden = !state.error;
  status.textContent = state.error || "";
}

async function refresh() {
  if (state.pending) return;
  state.pending = true;
  const seq = ++state.seq;
  const button = document.getElementById("sk-refresh");
  button.disabled = true;
  button.textContent = "Sťahujem…";
  try {
    const cfg = state.snapshot.config;
    const first = firstSkiDate(Date.now(), cfg);
    const responses = {};
    // Sequential on purpose: Open-Meteo answers a burst of parallel requests with an error body.
    for (const key of HORIZON_KEYS) {
      const data = await getJson(horizonUrl(cfg, key, first));
      let meta = null;
      try {
        meta = await getJson(metaUrl(cfg, key));
      } catch {
        meta = null; // The run stamp is a nicety; never fail a refresh over it.
      }
      responses[key] = { data, meta };
    }
    // The bulletin is an extra: a missing file is a normal state, and a failure never fails the refresh.
    let avalanche = null;
    try {
      for (const date of avalancheDates(first)) {
        const json = await getJson(avalancheUrl(cfg, date), true);
        if (json) {
          const parsed = parseAvalanche(json, cfg, date);
          avalanche = avalancheCurrent(parsed, first, Date.now()) ? parsed : null;
          break;
        }
      }
    } catch {
      avalanche = null;
    }
    const next = buildSkiSnapshot(responses, cfg, Date.now(), avalanche);
    if (seq !== state.seq) return;
    state.snapshot = next;
    state.error = null;
    state.failedAtMs = 0;
  } catch (err) {
    if (seq !== state.seq) return;
    state.failedAtMs = Date.now();
    const when = clockLabel(state.snapshot.fetchedAtMs, Date.now(), state.snapshot.config.timezone);
    state.error = `Predpoveď sa nepodarilo obnoviť (${err && err.message ? err.message : "chyba siete"}). Ukazujem dáta z ${when}.`;
  } finally {
    if (seq === state.seq) {
      state.pending = false;
      button.disabled = false;
      button.textContent = "Obnoviť predpoveď";
      paint();
    }
  }
}

function refreshIfStale() {
  if (document.visibilityState !== "visible" || state.pending) return;
  const nowMs = Date.now();
  if (nowMs - state.failedAtMs < RETRY_AFTER_FAILURE_MS) return;
  if (snapshotStale(state.snapshot, nowMs, state.snapshot.config.clientRefreshMinutes)) refresh();
}

/**
 * Every minute and whenever the page becomes visible again (step 10b): redraw once the local day has
 * changed, so "dnes" and "včera" stay true past midnight, and fetch again once the data are stale -
 * an hour old, made for a lift day that has passed, or carrying a bulletin that has run out.
 */
function tick() {
  if (document.visibilityState !== "visible") return;
  if (localDateOf(Date.now(), state.snapshot.config.timezone) !== state.paintedDay) paint();
  refreshIfStale();
}

function boot() {
  const raw = document.getElementById("sk-snapshot");
  if (!raw) return;
  state.snapshot = JSON.parse(raw.textContent);
  document.getElementById("sk-refresh").addEventListener("click", () => refresh());
  document.addEventListener("visibilitychange", tick);
  setInterval(tick, 60_000);
  paint();
  refreshIfStale();
}

if (typeof document !== "undefined") boot();
