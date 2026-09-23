import { readFileSync } from "node:fs";
import { eachDate } from "./window-core.js";

/**
 * docs/index.html: the whole application, as one self-contained file.
 *
 * The page carries a snapshot of the data as JSON plus the very code that produced it
 * (src/window-core.js) and the code that draws it (src/window-ui.js). That is what lets the refresh
 * button do a real fetch on a static host - there is no server here, only files on GitHub Pages.
 *
 * Both scripts are read from disk next to this module, so the generator inlines whichever copy it is
 * itself running from: src/ under tsx, dist/ under node. Their `export` keywords are stripped,
 * because an inline module has nothing to export to and the two files simply share one scope.
 */

const CLIENT_FILES = ["window-core.js", "window-ui.js"];

export function clientBundle(): string {
  const parts = CLIENT_FILES.map((name) => {
    const source = readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
    return source.replace(/^export\s+/gm, "");
  });
  const bundle = parts.join("\n");
  // Cheap guards for the two ways an inlined script silently breaks a page.
  if (/^\s*import\s/m.test(bundle)) throw new Error("Klientsky kód nesmie obsahovať import - vkladá sa do jedného rozsahu.");
  if (/<\/script/i.test(bundle)) throw new Error("Klientsky kód obsahuje </script a rozbil by stránku.");
  return bundle;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function dayButtonLabel(isoDate: string): { day: string; weekday: string } {
  const [y, m, d] = isoDate.split("-").map(Number);
  const weekday = new Intl.DateTimeFormat("sk-SK", { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
  return { day: `${d}. ${m}.`, weekday };
}

function monthName(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("sk-SK", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

const STYLES = `
:root {
  color-scheme: light;
  --page: #f7f7f5;
  --surface: #ffffff;
  --text: #1d2125;
  --muted: #5e6871;
  --hairline: #e3e5e4;
  --grid: #ebedec;
  --day-line: #d8dbda;
  --accent: #2f6fb0;
  --accent-soft: #eaf1f8;
  --score: #2f7d6b;
  --score-fill: rgba(47, 125, 107, 0.14);
  --rain: #3d7cb8;
  --rain-partial: #9dbcd8;
  --temp: #c1562f;
  --dew: #5b7a99;
  --wind: #5a6b7a;
  --sun: #b07d12;
  --sun-fill: rgba(176, 125, 18, 0.13);
  --band-work: rgba(47, 111, 176, 0.13);
  --band-watch: rgba(214, 138, 51, 0.13);
  --limit: #b03030;
  --warn-bg: #fdf3e7;
  --warn-text: #7a4a12;
}
@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --page: #14171a;
    --surface: #1c2024;
    --text: #e8eaec;
    --muted: #9aa4ad;
    --hairline: #2b3137;
    --grid: #272d33;
    --day-line: #333b42;
    --accent: #6fb1e8;
    --accent-soft: #1f2a34;
    --score: #5fc3ab;
    --score-fill: rgba(95, 195, 171, 0.16);
    --rain: #6fb1e8;
    --rain-partial: #3f5f7a;
    --temp: #f0906a;
    --dew: #9bb6cf;
    --wind: #a7b8c6;
    --sun: #e9c46a;
    --sun-fill: rgba(233, 196, 106, 0.14);
    --band-work: rgba(111, 177, 232, 0.16);
    --band-watch: rgba(233, 176, 106, 0.15);
    --limit: #e8756f;
    --warn-bg: #33291a;
    --warn-text: #e8c489;
  }
}

* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 0 16px 56px;
  background: var(--page);
  color: var(--text);
  font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  -webkit-text-size-adjust: 100%;
}
.wx-wrap { max-width: 1000px; margin: 0 auto; }

header { padding: 32px 0 8px; }
h1 { font-size: 1.6rem; line-height: 1.25; margin: 0 0 4px; font-weight: 650; letter-spacing: -0.01em; }
.wx-sub { margin: 0 0 14px; color: var(--muted); }
.wx-meta { margin: 0; font-size: 0.82rem; color: var(--muted); }
.wx-status {
  margin: 12px 0 0; padding: 10px 12px; border-radius: 8px;
  background: var(--warn-bg); color: var(--warn-text); font-size: 0.88rem;
}

button {
  font: inherit; color: inherit; cursor: pointer;
  background: var(--surface); border: 1px solid var(--hairline); border-radius: 8px;
}
button:focus-visible, select:focus-visible, svg:focus-visible {
  outline: 2px solid var(--accent); outline-offset: 2px;
}
.wx-refresh { margin-top: 16px; padding: 9px 16px; font-weight: 550; }
.wx-refresh[disabled] { opacity: 0.6; cursor: progress; }

.wx-controls {
  display: flex; flex-wrap: wrap; gap: 20px 28px; align-items: flex-end;
  margin: 24px 0 8px; padding: 16px 0; border-top: 1px solid var(--hairline); border-bottom: 1px solid var(--hairline);
}
.wx-field { display: flex; flex-direction: column; gap: 8px; }
.wx-label { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
.wx-days { display: flex; flex-wrap: wrap; gap: 8px; }
.wx-days button { padding: 7px 13px; line-height: 1.2; text-align: center; }
.wx-days button b { display: block; font-weight: 600; }
.wx-days button span { display: block; font-size: 0.72rem; color: var(--muted); }
.wx-days button[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-soft); }
.wx-days button[aria-pressed="true"] span { color: inherit; }
.wx-hour { display: flex; align-items: center; gap: 8px; }
.wx-hour button { width: 42px; height: 42px; font-size: 1rem; }
.wx-hour select {
  font: inherit; color: inherit; padding: 9px 10px; min-height: 42px;
  background: var(--surface); border: 1px solid var(--hairline); border-radius: 8px;
}
.wx-plan { margin: 14px 0 0; font-size: 0.95rem; }

#wx-charts { position: relative; }
.wx-card { margin: 28px 0 0; }
.wx-card h2 {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 12px;
  margin: 0 0 2px; font-size: 1.02rem; font-weight: 600;
}
.wx-value { font-weight: 500; color: var(--score); font-variant-numeric: tabular-nums; }
.wx-value.wx-missing { color: var(--muted); font-style: italic; }
.wx-note { margin: 2px 0 0; font-size: 0.82rem; color: var(--muted); }
.wx-legend { display: flex; gap: 16px; margin: 4px 0 0; font-size: 0.8rem; color: var(--muted); }
.wx-legend i { display: inline-block; width: 14px; height: 2px; margin-right: 6px; vertical-align: middle; }

.wx-svg { display: block; width: 100%; height: auto; touch-action: pan-y; }
.wx-grid { stroke: var(--grid); stroke-width: 1; }
.wx-day-line { stroke: var(--day-line); stroke-width: 1; }
.wx-tick, .wx-day-label { fill: var(--muted); font-size: 11px; }
.wx-unit { fill: var(--muted); font-size: 11px; }
.wx-capture { fill: transparent; }
.wx-cursor { stroke: var(--muted); stroke-width: 1; stroke-dasharray: 3 3; pointer-events: none; }
.wx-band-work { fill: var(--band-work); }
.wx-band-watch { fill: var(--band-watch); }
.wx-score-area { fill: var(--score-fill); }
.wx-score-line { fill: none; stroke: var(--score); stroke-width: 2; stroke-linejoin: round; }
.wx-marker { fill: var(--score); stroke: var(--surface); stroke-width: 2; }
.wx-bar { fill: var(--rain); }
.wx-bar-partial { fill: var(--rain-partial); }
.wx-temp-line { fill: none; stroke: var(--temp); stroke-width: 2; stroke-linejoin: round; }
.wx-dew-line { fill: none; stroke: var(--dew); stroke-width: 2; stroke-dasharray: 1 0; stroke-linejoin: round; }
.wx-wind-line { fill: none; stroke: var(--wind); stroke-width: 2; stroke-linejoin: round; }
.wx-sun-area { fill: var(--sun-fill); }
.wx-sun-line { fill: none; stroke: var(--sun); stroke-width: 2; stroke-linejoin: round; }
.wx-limit { stroke: var(--limit); stroke-width: 1.5; stroke-dasharray: 5 4; }
.wx-limit-label { fill: var(--limit); font-size: 11px; }

#wx-tooltip {
  position: absolute; top: 0; left: 0; z-index: 5; min-width: 180px;
  padding: 9px 11px; border: 1px solid var(--hairline); border-radius: 8px;
  background: var(--surface); box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
  font-size: 0.82rem; pointer-events: none;
}
#wx-tooltip strong { display: block; margin-bottom: 5px; }
.wx-tip-row { display: flex; justify-content: space-between; gap: 18px; font-variant-numeric: tabular-nums; }
.wx-tip-row span:last-child { color: var(--muted); }

.wx-method { margin: 22px 0 0; }
.wx-method-toggle { padding: 6px 12px; font-size: 0.84rem; }
.wx-method-panel {
  margin: 10px 0 0; padding: 14px 16px; border-radius: 8px;
  background: var(--surface); border: 1px solid var(--hairline); font-size: 0.86rem; color: var(--muted);
}
.wx-method-panel p { margin: 0 0 8px; }
.wx-method-panel p:last-child { margin-bottom: 0; }
footer { margin: 30px 0 0; padding-top: 18px; border-top: 1px solid var(--hairline); font-size: 0.84rem; color: var(--muted); }
footer p { margin: 0; }

@media (max-width: 560px) {
  h1 { font-size: 1.35rem; }
  .wx-controls { gap: 16px; }
  .wx-days { width: 100%; }
  .wx-days button { flex: 1 1 0; padding: 7px 4px; }
  #wx-tooltip { min-width: 150px; font-size: 0.78rem; }
}
`;

interface SnapshotLike {
  config: { start: string; end: string };
}

function dayButtons(from: string, to: string): string {
  return eachDate(from, to)
    .map((date: string) => {
      const { day, weekday } = dayButtonLabel(date);
      return `<button type="button" data-day="${date}" aria-pressed="false" aria-label="${esc(`${weekday} ${day}`)}"><b>${esc(day)}</b><span>${esc(weekday)}</span></button>`;
    })
    .join("");
}

function hourOptions(): string {
  let out = "";
  for (let h = 0; h < 24; h++) {
    const label = `${String(h).padStart(2, "0")}:00`;
    out += `<option value="${h}"${h === 9 ? " selected" : ""}>${label}</option>`;
  }
  return out;
}

function chartCard(id: string, title: string, extras: { value?: boolean; note?: string; legend?: string; daily?: boolean }): string {
  const value = extras.value ? ` <span class="wx-value" id="wx-score-value"></span>` : "";
  const legend = extras.legend ?? "";
  const daily = extras.daily ? `<p class="wx-note" id="wx-daily"></p>` : "";
  const note = extras.note ? `<p class="wx-note">${esc(extras.note)}</p>` : "";
  return `<section class="wx-card"><h2>${esc(title)}${value}</h2><div id="wx-chart-${id}"></div>${legend}${daily}${note}</section>`;
}

export function renderWindowPage(snapshot: SnapshotLike): string {
  const { start, end } = snapshot.config;
  const [, , startDay] = start.split("-");
  const [, , endDay] = end.split("-");
  const period = `${Number(startDay)}.–${Number(endDay)}. ${monthName(start)} ${start.slice(0, 4)}`;
  // Escaping "<" keeps any future string value from ending the JSON block early.
  const json = JSON.stringify(snapshot).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="sk">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Počasie na natieranie terasy</title>
<meta name="description" content="Kedy natierať terasu v Zedlitzdorfe: vhodnosť počasia pre 8 hodín práce a ďalších 24 hodín sledovania, ${esc(period)}." />
<style>${STYLES}</style>
</head>
<body>
<div class="wx-wrap">
<header>
  <h1>Počasie na natieranie terasy</h1>
  <p class="wx-sub">Zedlitzdorf · ${esc(period)}</p>
  <p class="wx-meta" id="wx-meta"></p>
  <p class="wx-status" id="wx-past" hidden>Plánované obdobie už uplynulo. Toto je predpoveď pre dni, ktoré sú za nami – nie je to aktuálne rozhodnutie.</p>
  <p class="wx-status" id="wx-status" hidden></p>
  <button type="button" class="wx-refresh" id="wx-refresh">Obnoviť predpoveď</button>
</header>

<div class="wx-controls">
  <div class="wx-field">
    <span class="wx-label" id="wx-day-label">Deň začiatku</span>
    <div class="wx-days" role="group" aria-labelledby="wx-day-label">${dayButtons(start, end)}</div>
  </div>
  <div class="wx-field">
    <span class="wx-label"><label for="wx-hour">Hodina začiatku</label></span>
    <div class="wx-hour">
      <button type="button" id="wx-hour-prev" aria-label="O hodinu skôr">◀</button>
      <select id="wx-hour">${hourOptions()}</select>
      <button type="button" id="wx-hour-next" aria-label="O hodinu neskôr">▶</button>
    </div>
  </div>
</div>
<p class="wx-plan" id="wx-plan"></p>

<noscript><p class="wx-status">Táto stránka potrebuje JavaScript: grafy sa kreslia a predpoveď sa sťahuje priamo v prehliadači.</p></noscript>

<main id="wx-charts">
  <div id="wx-tooltip" hidden></div>
  ${chartCard("score", "Vhodnosť počasia pri začiatku náteru", {
    value: true,
    note: "Viac percent = viac scenárov vyhovuje pre 8 h práce a ďalších 24 h. Hodnotíme dážď a teplotu, nie suchosť dreva.",
  })}
  ${chartCard("rain", "Dážď", { daily: true, note: "Stĺpec je úhrn za celých šesť hodín (mm / 6 h). Mierka je spoločná pre celé obdobie." })}
  ${chartCard("temp", "Teplota a hranica rosenia", {
    legend:
      `<p class="wx-legend"><span><i style="background:var(--temp)"></i>teplota vzduchu</span>` +
      `<span><i style="background:var(--dew)"></i>rosný bod</span>` +
      `<span><i style="background:var(--limit)"></i>hranica 7 °C</span></p>`,
    note: "Rosa sa tvorí, keď povrch vychladne na rosný bod. Teplota dreva sa môže líšiť od teploty vzduchu.",
  })}
  ${chartCard("wind", "Vietor", { note: "Predpoveď vetra je vo výške 10 m; pod terasou môže byť slabší." })}
  ${chartCard("sun", "Sila slnka", { note: "Viac žiarenia môže pomáhať vysychaniu; spodok terasy a zatienené časti dostávajú menej slnka." })}
</main>

<div class="wx-method">
  <button type="button" class="wx-method-toggle" id="wx-method-toggle" aria-expanded="false" aria-controls="wx-method">Ako sa počíta percento?</button>
  <div class="wx-method-panel" id="wx-method" hidden>
    <p>Pre každú hodinu začiatku prejde každý scenár predpovede tým istým filtrom: teplota vzduchu aspoň 7 °C vo všetkých hodinách 8-hodinovej práce a menej než 0,2 mm zrážok za celý čas práce aj nasledujúcich 24 hodín. Percento je podiel scenárov, ktoré prejdú.</p>
    <p>Je to priehľadný filter meteorologických scenárov, nie model schnutia dreva ani pravdepodobnosť úspešného náteru. Hranica 0,2 mm je pracovná tolerancia výpočtu, nie potvrdenie, že taký dážď náteru neuškodí. Teplota sa kontroluje počas nanášania – teplota, rosa a vlhkosť počas následného schnutia tým nie sú overené.</p>
    <p>Ak čo i len jednému scenáru chýba niektorá potrebná hodnota, percento sa nezobrazí a hodina je označená ako nedostatok dát. Chýbajúce údaje sa nikdy nepočítajú ako nula.</p>
    <p>Hodnotenie je čisto meteorologické: nočný začiatok s vysokým percentom nie je odporúčanie pracovať v noci.</p>
  </div>
</div>

<footer>
  <p>Pred natieraním zmerajte vlhkosť a teplotu dreva. Predpoveď ich nepotvrdzuje. Nasledujúcich 24 h je sledované obdobie, nie záruka vyschnutia.</p>
</footer>
</div>

<script type="application/json" id="wx-snapshot">${json}</script>
<script type="module">
${clientBundle()}
</script>
</body>
</html>
`;
}
