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

function links(resort) {
  return (
    `<p class="sk-links"><a href="${esc(resort.links.snowReport)}" target="_blank" rel="noopener">Snehová správa</a>` +
    `<a href="${esc(resort.links.webcam)}" target="_blank" rel="noopener">Webkamera</a></p>`
  );
}

// ---------------------------------------------------------------------------
// 1. The next lift day
// ---------------------------------------------------------------------------

function nowCard(resort, day, cfg) {
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
  return (
    `<article class="sk-card">` +
    `<header><h3>${esc(resort.name)}</h3>${shareMark(day)}</header>` +
    flag +
    `<p class="sk-why">${esc(concerns(day, cfg))}</p>` +
    `<dl>${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>` +
    links(resort) +
    `</article>`
  );
}

// ---------------------------------------------------------------------------
// 2. Three days: a day x resort table plus hourly charts per resort
// ---------------------------------------------------------------------------

/** Shares, then one short line per fact - narrow phone columns wrap a joined sentence badly. */
function shortCell(day, cfg) {
  if (!day.status) return `<td>${statusMark(null)}</td>`;
  const lines = [esc(range(day.topTemp.min, day.topTemp.max, "°C"))];
  const ps = day.powderSnow;
  if (ps && ps.probability >= POWDER_LINE_FROM) {
    const badge = powderBadge(day);
    lines.push(badge ? `${badge} ${pct(ps.probability)}` : esc(`prašan ${pct(ps.probability)}`));
  }
  if (day.freshSnowCm !== null && day.freshSnowCm >= 1) lines.push(esc(`${num(day.freshSnowCm)}${NB}cm snehu`));
  if (day.maxGustKmh > cfg.rules.gustFairKmh) lines.push(esc(`vietor ${num(day.maxGustKmh)}${NB}km/h`));
  const title = day.goodPct === null ? concerns(day, cfg) : `${shareTitle(day)} · ${concerns(day, cfg)}`;
  return `<td title="${esc(title)}">${shareMark(day)}${lines.map((l) => `<small>${l}</small>`).join("")}</td>`;
}

function dayTable(dates, resorts, cfg, cell, caption) {
  const head = cfg.resorts.map((r) => `<th scope="col">${esc(r.shortName)}</th>`).join("");
  const body = dates
    .map((date, i) => `<tr><th scope="row">${rowDayLabel(date)}</th>${resorts.map((r) => cell(r.days[i], cfg)).join("")}</tr>`)
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

function longCell(day) {
  if (day.goodPct === null) return `<td><span class="sk-status sk-none">${day.reason === "members" ? "Neúplné dáta" : "Nedostatok dát"}</span></td>`;
  let snow = "";
  if (day.snowCm && day.snowCm.p90 >= 1) {
    snow = `<small>${num(day.snowCm.p10)}–${num(day.snowCm.p90)}${NB}cm snehu</small>`;
  }
  return `<td title="${esc(`${shareTitle(day)} scenárov`)}">${shareMark(day)}${snow}</td>`;
}

// ---------------------------------------------------------------------------
// The whole page body
// ---------------------------------------------------------------------------

const LEGEND = `<p class="sk-legend"><span><i class="sk-good"></i>dobré</span><span><i class="sk-fair"></i>ujde</span><span><i class="sk-bad"></i>zlé</span></p>`;

function method(cfg) {
  const r = cfg.rules;
  const p = cfg.powder;
  const st = cfg.quality.snowTemp;
  const alertDays = p.stages[0].maxDayOffset + 1;
  return (
    `<details class="sk-method"><summary>Ako sa počítajú percentá?</summary>` +
    `<p>Hodnotí sa čas prevádzky lanoviek ${cfg.liftOpenHour}:00–${cfg.liftCloseHour}:00, pri každom stredisku pri najnižšej a najvyššej stanici lanovky. Deň je:</p>` +
    `<ul>` +
    `<li><b>zlý</b>, keď dole naprší aspoň ${num(r.rainBadMm, 1)}${NB}mm alebo nárazy vetra hore prekročia ${r.gustBadKmh}${NB}km/h (lanovky môžu stáť);</li>` +
    `<li><b>ujde</b>, keď dole naprší aspoň ${num(r.rainFairMm, 1)}${NB}mm, nárazy prekročia ${r.gustFairKmh}${NB}km/h, dole je aspoň pol dňa nad ${r.softSnowTempC}${NB}°C (mäkký sneh), alebo je menej ako ${r.minSunHours}${NB}h slnka (horšia viditeľnosť);</li>` +
    `<li><b>dobrý</b>, keď nič z toho.</li>` +
    `</ul>` +
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

  return (
    (stale ? `<p class="sk-warn">Tieto dáta sú staršie a začínajú dňom, ktorý už je za nami. Obnovte predpoveď.</p>` : "") +
    `<section class="sk-section"><h2>${esc(longDayLabel(H.now.dates[0]))}</h2><p class="sk-src">Najbližší lyžiarsky deň · ${esc(source(H.now))}</p>` +
    `<p class="sk-note">Pruh a percento sú pravdepodobnosť, že deň bude dobrý, ujde alebo zlý; pod názvom strediska je, čo ho môže pokaziť.</p>` +
    LEGEND +
    `<div class="sk-cards">${cfg.resorts.map((r, i) => nowCard(r, now[i].days[0], cfg)).join("")}</div></section>` +
    `<section class="sk-section"><h2>Najbližšie ${H.short.dates.length} dni</h2><p class="sk-src">${esc(source(H.short))}</p>` +
    `<p class="sk-note">Pod pruhom: teplota pri hornej stanici počas prevádzky, šanca na prašan, nový sneh za 3 dni a silnejší vietor.</p>` +
    dayTable(H.short.dates, short, cfg, shortCell, `Pravdepodobnosti dobrého, priemerného a zlého dňa na najbližšie ${H.short.dates.length} dni`) +
    cfg.resorts.map((r, i) => hourlyChart(r, short[i].hourly, H.short.dates, cfg)).join("") +
    `</section>` +
    `<section class="sk-section"><h2>Výhľad na ${H.long.dates.length} dní</h2><p class="sk-src">${esc(source(H.long))}</p>` +
    `<p class="sk-note">Pruh je podiel z 51 scenárov predpovede, nie kalibrovaná pravdepodobnosť; pod ním rozpätie snehu hore.</p>` +
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

const state = { snapshot: null, pending: false, seq: 0, error: null };

async function getJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json && json.error) throw new Error(json.reason || "chyba Open-Meteo");
  return json;
}

function paint() {
  const nowMs = Date.now();
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
    const next = buildSkiSnapshot(responses, cfg, Date.now());
    if (seq !== state.seq) return;
    state.snapshot = next;
    state.error = null;
  } catch (err) {
    if (seq !== state.seq) return;
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
  if (document.visibilityState !== "visible") return;
  const ageMin = (Date.now() - state.snapshot.fetchedAtMs) / 60_000;
  if (ageMin >= state.snapshot.config.clientRefreshMinutes) refresh();
}

function boot() {
  const raw = document.getElementById("sk-snapshot");
  if (!raw) return;
  state.snapshot = JSON.parse(raw.textContent);
  document.getElementById("sk-refresh").addEventListener("click", () => refresh());
  document.addEventListener("visibilitychange", refreshIfStale);
  paint();
  refreshIfStale();
}

if (typeof document !== "undefined") boot();
