import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { WINDOW_CONFIG } from "./config.js";
import { clientBundle, renderWindowPage } from "./window-page.js";
import { renderWindowEmailBlock } from "./window-email.js";
import { renderAlertEmail } from "./email.js";
import { buildRainPanel, buildScorePanel, renderWindowPng } from "./window-image.js";
import { LIGHT } from "./window-theme.js";
import {
  HOUR_MS,
  allowedDurations,
  bestStartPerDay,
  buildSnapshot,
  dailyTotals,
  lastNeededMs,
  localDateOf,
  localMidnightMs,
  localTimeMs,
  memberKeys,
  parseEnsemble,
  parseForecast,
  precipAxisMax,
  requestDates,
  resolveRun,
  scoreStarts,
  sixHourBuckets,
  startTimes,
  validStartHours,
} from "./window-core.js";

/*
 * The algorithm behind the painting-window page. These tests exist for the boundaries that decide
 * whether a percentage is honest: which hours a window really covers, what "missing" does to a
 * score, and whether a bar, a daily total and the score agree about where an hour belongs.
 */

type Cfg = typeof WINDOW_CONFIG;
type Member = { key: string; temperature: (number | null)[]; precipitation: (number | null)[] };
type Ens = { timesMs: number[]; members: Member[] };

function cfgFor(start: string, end: string, extra: Partial<Cfg> = {}): Cfg {
  return { ...WINDOW_CONFIG, start, end, ...extra };
}

/**
 * Hourly stamps from the window's first local midnight to the last instant any session needs, plus
 * a few hours beyond - the tests need stamps just outside a window to prove they are not counted.
 */
function timeAxis(cfg: Cfg): number[] {
  const times: number[] = [];
  for (let t = localMidnightMs(cfg.start, cfg.timezone); t <= lastNeededMs(cfg) + 3 * HOUR_MS; t += HOUR_MS) times.push(t);
  return times;
}

function ensembleFixture(cfg: Cfg, opts: { members?: number; temperature?: number; precipitation?: number; truncateAtMs?: number } = {}): Ens {
  const timesMs = timeAxis(cfg);
  const count = opts.members ?? cfg.expectedEnsembleMembers;
  const members: Member[] = [];
  for (let m = 0; m < count; m++) {
    const cut = (t: number, v: number) => (opts.truncateAtMs !== undefined && t > opts.truncateAtMs ? null : v);
    members.push({
      key: m === 0 ? "control" : `member${String(m).padStart(2, "0")}`,
      temperature: timesMs.map((t) => cut(t, opts.temperature ?? 15)),
      precipitation: timesMs.map((t) => cut(t, opts.precipitation ?? 0)),
    });
  }
  return { timesMs, members };
}

function put(ens: Ens, memberIndex: number, field: "temperature" | "precipitation", ms: number, value: number | null): void {
  const i = ens.timesMs.indexOf(ms);
  assert.ok(i >= 0, `fixture nepokrýva ${new Date(ms).toISOString()}`);
  ens.members[memberIndex][field][i] = value;
}

function scoreAt(ens: Ens, cfg: Cfg, startMs: number) {
  const found = scoreStarts(ens, cfg).find((s) => s.startMs === startMs);
  assert.ok(found, "začiatok nie je v zozname");
  return found;
}

const ONE_DAY = cfgFor("2026-10-01", "2026-10-01");
/** 1 Oct 2026 09:00 Europe/Vienna (CEST, UTC+2). */
const NINE_AM = Date.UTC(2026, 9, 1, 7);

test("požadované dátumy vychádzajú z konfigurácie, nie z pevného čísla", () => {
  // No session may end after 19:00, and the watch period runs from there: 19 + 24 h reaches 6 Oct.
  assert.deepEqual(requestDates(WINDOW_CONFIG), { startDate: "2026-10-01", endDate: "2026-10-06" });
  assert.deepEqual(requestDates({ ...WINDOW_CONFIG, postApplicationHours: 48 }), { startDate: "2026-10-01", endDate: "2026-10-07" });
});

test("pracovný čas 8:00-19:00 určuje, ktoré začiatky sa vôbec ponúkajú", () => {
  assert.deepEqual(validStartHours(WINDOW_CONFIG, 8), [8, 9, 10, 11], "8 h práce sa musí skončiť do 19:00");
  assert.deepEqual(validStartHours(WINDOW_CONFIG, 3), [8, 9, 10, 11, 12, 13, 14, 15, 16]);
  assert.deepEqual(validStartHours(WINDOW_CONFIG, 11), [8], "najdlhšia seansa vyplní celý pracovný deň");
  assert.deepEqual(validStartHours(WINDOW_CONFIG, 12), [], "dlhšie než pracovný deň sa nezmestí");
  assert.deepEqual(allowedDurations(WINDOW_CONFIG), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
});

test("jednu vrstvu možno rozdeliť: kratšia seansa sa hodnotí kratším oknom", () => {
  const cfg = ONE_DAY;
  const threeHourStart = localTimeMs("2026-10-01", 16, cfg.timezone); // 16:00-19:00, legal only for <= 3 h
  assert.equal(scoreStarts(ensembleFixture(cfg), cfg, 8).find((s) => s.startMs === threeHourStart)?.reason, "hours");

  // 3 h of work plus 24 h of watching is 27 precipitation stamps and 4 temperature checks.
  const lastCounted = ensembleFixture(cfg);
  put(lastCounted, 0, "precipitation", threeHourStart + 27 * HOUR_MS, 5);
  assert.equal(scoreStarts(lastCounted, cfg, 3).find((s) => s.startMs === threeHourStart)?.matching, cfg.expectedEnsembleMembers - 1);

  const justAfter = ensembleFixture(cfg);
  put(justAfter, 0, "precipitation", threeHourStart + 28 * HOUR_MS, 5);
  assert.equal(scoreStarts(justAfter, cfg, 3).find((s) => s.startMs === threeHourStart)?.score, 100);

  const tempEnd = ensembleFixture(cfg);
  put(tempEnd, 0, "temperature", threeHourStart + 3 * HOUR_MS, 6.9);
  assert.equal(scoreStarts(tempEnd, cfg, 3).find((s) => s.startMs === threeHourStart)?.matching, cfg.expectedEnsembleMembers - 1);
});

test("okno má 120 hodinových začiatkov od 1.10. 00:00 do 5.10. 23:00 miestneho času", () => {
  const starts = startTimes(WINDOW_CONFIG);
  assert.equal(starts.length, 120);
  assert.equal(starts[0], Date.UTC(2026, 8, 30, 22));
  assert.equal(localDateOf(starts[0], WINDOW_CONFIG.timezone), "2026-10-01");
  assert.equal(starts[starts.length - 1], Date.UTC(2026, 9, 5, 21));
  assert.equal(lastNeededMs(WINDOW_CONFIG), Date.UTC(2026, 9, 6, 17)); // 6 Oct 19:00 local
});

test("teplota sa kontroluje v 9 bodoch vrátane oboch hraníc", () => {
  const cfg = ONE_DAY;

  const atEnd = ensembleFixture(cfg);
  put(atEnd, 0, "temperature", NINE_AM + 8 * HOUR_MS, 6.9);
  assert.equal(scoreAt(atEnd, cfg, NINE_AM).matching, cfg.expectedEnsembleMembers - 1, "8. hodina ešte patrí do práce");

  const justAfter = ensembleFixture(cfg);
  put(justAfter, 0, "temperature", NINE_AM + 9 * HOUR_MS, 6.9);
  assert.equal(scoreAt(justAfter, cfg, NINE_AM).score, 100, "9 hodín po začiatku už do práce nepatrí");

  const atStart = ensembleFixture(cfg);
  put(atStart, 0, "temperature", NINE_AM, 6.9);
  assert.equal(scoreAt(atStart, cfg, NINE_AM).matching, cfg.expectedEnsembleMembers - 1, "hodina začiatku sa kontroluje");
});

test("presne 7 °C vyhovuje, 6,9 °C nie", () => {
  assert.equal(scoreAt(ensembleFixture(ONE_DAY, { temperature: 7 }), ONE_DAY, NINE_AM).score, 100);
  assert.equal(scoreAt(ensembleFixture(ONE_DAY, { temperature: 6.9 }), ONE_DAY, NINE_AM).score, 0);
});

test("zrážky sa počítajú za predchádzajúcu hodinu: 32 značiek od začiatok+1 h", () => {
  const cfg = ONE_DAY;
  const steps = cfg.applicationHours + cfg.postApplicationHours;
  assert.equal(steps, 32);

  const onStart = ensembleFixture(cfg);
  put(onStart, 0, "precipitation", NINE_AM, 5);
  assert.equal(scoreAt(onStart, cfg, NINE_AM).score, 100, "úhrn označený hodinou začiatku spadol ešte pred ňou");

  const firstHour = ensembleFixture(cfg);
  put(firstHour, 0, "precipitation", NINE_AM + HOUR_MS, 5);
  assert.equal(scoreAt(firstHour, cfg, NINE_AM).matching, cfg.expectedEnsembleMembers - 1, "prvá započítaná značka je +1 h");

  const lastHour = ensembleFixture(cfg);
  put(lastHour, 0, "precipitation", NINE_AM + steps * HOUR_MS, 5);
  assert.equal(scoreAt(lastHour, cfg, NINE_AM).matching, cfg.expectedEnsembleMembers - 1, "posledná započítaná značka je +32 h");

  const justAfter = ensembleFixture(cfg);
  put(justAfter, 0, "precipitation", NINE_AM + (steps + 1) * HOUR_MS, 5);
  assert.equal(scoreAt(justAfter, cfg, NINE_AM).score, 100, "+33 h je už mimo sledovaného okna");
});

test("hranica 0,2 mm: presne 0,2 nevyhovuje, 0,19 vyhovuje, plávajúci šum neprekĺzne", () => {
  const cfg = ONE_DAY;
  const rain = (values: number[]) => {
    const ens = ensembleFixture(cfg);
    values.forEach((v, i) => put(ens, 0, "precipitation", NINE_AM + (i + 1) * HOUR_MS, v));
    return scoreAt(ens, cfg, NINE_AM).matching === cfg.expectedEnsembleMembers;
  };

  assert.equal(rain([0.19]), true, "0,19 mm < 0,2 mm");
  assert.equal(rain([0.2]), false, "presne 0,2 mm už nevyhovuje kritériu < 0,2");
  assert.equal(rain([0.1, 0.1]), false, "0,1 + 0,1 je presne 0,2");
  assert.equal(rain([0.05, 0.05, 0.05, 0.05]), false, "0,05 × 4 je presne 0,2 aj s plávajúcim šumom");
  assert.equal(rain([0.1, 0.09]), true, "0,19 rozdelené na dve hodiny stále vyhovuje");
});

test("prechod cez polnoc počíta okno ďalej do ďalších dní", () => {
  const cfg = ONE_DAY;
  const lastStart = localTimeMs("2026-10-01", 11, cfg.timezone); // 11:00-19:00, watch to 2 Oct 19:00
  const monitorEnd = lastStart + 32 * HOUR_MS;
  assert.equal(localDateOf(monitorEnd, cfg.timezone), "2026-10-02");

  const inside = ensembleFixture(cfg);
  put(inside, 0, "precipitation", monitorEnd, 5);
  assert.equal(scoreAt(inside, cfg, lastStart).matching, cfg.expectedEnsembleMembers - 1);

  const outside = ensembleFixture(cfg);
  put(outside, 0, "precipitation", monitorEnd + HOUR_MS, 5);
  assert.equal(scoreAt(outside, cfg, lastStart).score, 100);
});

test("chýbajúca hodnota robí skóre neúplným, nie lepším ani horším", () => {
  const cfg = cfgFor("2026-10-01", "2026-10-02");

  const noTemp = ensembleFixture(cfg);
  put(noTemp, 3, "temperature", NINE_AM + 2 * HOUR_MS, null);
  const t = scoreAt(noTemp, cfg, NINE_AM);
  assert.equal(t.score, null);
  assert.equal(t.reason, "horizon");

  const noRain = ensembleFixture(cfg);
  put(noRain, 7, "precipitation", NINE_AM + 20 * HOUR_MS, null);
  assert.equal(scoreAt(noRain, cfg, NINE_AM).score, null);

  // A start on the next day, whose window never touches the gap, stays computable.
  const untouched = scoreStarts(noTemp, cfg).find((s) => s.startMs === localTimeMs("2026-10-02", 8, cfg.timezone));
  assert.equal(untouched?.score, 100);
});

test("neúplný ansámbel sa nevydáva za celok", () => {
  const cfg = ONE_DAY;
  const short = ensembleFixture(cfg, { members: cfg.expectedEnsembleMembers - 1 });
  const scores = scoreStarts(short, cfg).filter((s) => s.reason !== "hours");
  assert.ok(scores.length > 0);
  assert.ok(scores.every((s) => s.score === null && s.reason === "members"), "50 z 51 členov nie je celý ansámbel");
  assert.equal(scores[0].expected, cfg.expectedEnsembleMembers);
});

test("skóre je podiel vyhovujúcich členov z očakávaného počtu", () => {
  const cfg = ONE_DAY;
  const ens = ensembleFixture(cfg);
  for (let m = 0; m < 20; m++) put(ens, m, "precipitation", NINE_AM + HOUR_MS, 5);
  const s = scoreAt(ens, cfg, NINE_AM);
  assert.equal(s.matching, 31);
  assert.equal(s.expected, 51);
  assert.equal(s.score, Math.round((100 * 31) / 51));
  assert.equal(s.score, 61);
});

test("posledný deň okna hlási nedostatok dát, keď ansámbel nesiaha dosť ďaleko", () => {
  // The live API really does cut member precipitation short of the horizon (seen 2026-09-23), and
  // the last day's sessions are the first to feel it.
  const cfg = WINDOW_CONFIG;
  const ens = ensembleFixture(cfg, { truncateAtMs: localTimeMs("2026-10-06", 16, cfg.timezone) });
  const scores = scoreStarts(ens, cfg);
  const at = (date: string, hour: number) => scores.find((s) => s.startMs === localTimeMs(date, hour, cfg.timezone));

  assert.equal(at("2026-10-05", 8)?.score, 100, "štart 8:00 potrebuje dáta práve do 6.10. 16:00");
  assert.equal(at("2026-10-05", 9)?.reason, "horizon", "o hodinu neskôr už predpoveď nesiaha");
  assert.equal(at("2026-10-05", 11)?.score, null);
  assert.equal(at("2026-10-01", 9)?.score, 100);
  assert.equal(at("2026-10-01", 20)?.reason, "hours", "mimo pracovného času nie je nedostatok dát");
});

test("šesťhodinové intervaly zaraďujú úhrny podľa koncovej značky", () => {
  const cfg = ONE_DAY;
  const times = timeAxis(cfg);
  const series = { timesMs: times, precipitation: times.map(() => 0 as number | null) };
  const set = (ms: number, v: number | null) => {
    series.precipitation[times.indexOf(ms)] = v;
  };

  set(localTimeMs("2026-10-01", 6, cfg.timezone), 1); // 05:00-06:00 -> bucket 00-06
  set(localTimeMs("2026-10-01", 7, cfg.timezone), 2); // 06:00-07:00 -> bucket 06-12
  const buckets = sixHourBuckets(series, cfg);

  const bucket = (h: number) => buckets.find((b) => b.date === "2026-10-01" && b.startHour === h);
  assert.equal(bucket(0)?.totalMm, 1);
  assert.equal(bucket(6)?.totalMm, 2);
  assert.equal(bucket(0)?.expectedHours, 6);
  assert.ok(buckets.every((b) => b.complete));
});

test("chýbajúca hodina je neúplný interval aj neúplný denný úhrn, nie nula", () => {
  const cfg = ONE_DAY;
  const times = timeAxis(cfg);
  const series = { timesMs: times, precipitation: times.map(() => 0.5 as number | null) };
  series.precipitation[times.indexOf(localTimeMs("2026-10-01", 3, cfg.timezone))] = null;

  const buckets = sixHourBuckets(series, cfg).filter((b) => b.date === "2026-10-01");
  const first = buckets.find((b) => b.startHour === 0)!;
  assert.equal(first.complete, false);
  assert.equal(first.hours, 5);
  assert.equal(first.totalMm, 2.5, "neúplný interval nesie to, čo naozaj prišlo");

  const day = dailyTotals(buckets).find((d) => d.date === "2026-10-01")!;
  assert.equal(day.complete, false);
  assert.equal(day.totalMm, round(buckets));

  function round(bs: typeof buckets): number {
    return Math.round(bs.reduce((sum, b) => sum + (b.totalMm ?? 0), 0) * 1000) / 1000;
  }
});

test("denné úhrny sa presne rovnajú súčtu svojich stĺpcov", () => {
  const cfg = WINDOW_CONFIG;
  const times = timeAxis(cfg);
  const series = { timesMs: times, precipitation: times.map((_, i) => (i % 3 === 0 ? 0.3 : 0.1) as number | null) };
  const buckets = sixHourBuckets(series, cfg);
  const daily = dailyTotals(buckets);

  assert.equal(daily.length, 5);
  for (const day of daily) {
    const own = buckets.filter((b) => b.date === day.date);
    assert.equal(own.length, 4);
    const sum = Math.round(own.reduce((s, b) => s + (b.totalMm ?? 0), 0) * 1000) / 1000;
    assert.equal(day.totalMm, sum);
  }
});

test("mierka zrážok je spoločná pre celé obdobie a nikdy nenafúkne drobný dážď", () => {
  const bucket = (totalMm: number | null) => ({ totalMm });
  assert.equal(precipAxisMax([bucket(0)]), 1, "sucho má stále os 0-1 mm / 6 h");
  assert.equal(precipAxisMax([bucket(0.3)]), 1, "0,3 mm sa nesmie roztiahnuť cez celý graf");
  assert.equal(precipAxisMax([bucket(1)]), 1);
  assert.equal(precipAxisMax([bucket(5)]), 6, "maximum 5 mm dáva rozsah 0-6");
  assert.equal(precipAxisMax([bucket(1.2)]), 2);
  assert.equal(precipAxisMax([bucket(12)]), 15);
  assert.equal(precipAxisMax([bucket(null)]), 1, "samé chýbajúce hodnoty nie sú nula");

  // The tallest bar anywhere decides, so switching between days cannot rescale anything.
  const period = [bucket(0.2), bucket(5), bucket(0.1), bucket(null)];
  assert.equal(precipAxisMax(period), 6);
  assert.equal(precipAxisMax([...period].reverse()), 6);
});

test("členovia sa objavujú z odpovede, nie z pevného zoznamu 51 názvov", () => {
  assert.deepEqual(memberKeys({ temperature_2m: [], precipitation: [] }), [""]);
  assert.deepEqual(memberKeys({ precipitation: [], precipitation_member01: [], temperature_2m: [], temperature_2m_member01: [] }), ["", "_member01"]);
  assert.deepEqual(memberKeys({ precipitation: [], precipitation_member01: [], temperature_2m: [] }), [""], "člen bez oboch veličín sa nepočíta");
});

test("jednotky sa overujú v odpovedi", () => {
  const ok = {
    hourly_units: { temperature_2m: "°C", precipitation: "mm" },
    hourly: { time: [0], temperature_2m: [10], precipitation: [0] },
  };
  assert.equal(parseEnsemble(ok).members.length, 1);
  const wrong = { ...ok, hourly_units: { ...ok.hourly_units, temperature_2m: "°F" } };
  assert.throws(() => parseEnsemble(wrong), /°F/);
  assert.throws(() => parseForecast({ error: true, reason: "sensor" }), /sensor/);
});

test("čas behu modelu sa berie len z metadát zdroja", () => {
  const need = Date.UTC(2026, 9, 7, 5);
  const init = Date.UTC(2026, 9, 1, 0) / 1000;
  const covering = { last_run_initialisation_time: init, data_end_time: need / 1000, update_interval_seconds: 21_600 };
  assert.deepEqual(resolveRun(covering, need), { runAtMs: init * 1000, source: "meta" });

  const short = { ...covering, data_end_time: need / 1000 - 3600 };
  assert.equal(resolveRun(short, need).runAtMs, (init - 21_600) * 1000, "kratší cyklus servíruje čísla z predchádzajúceho behu");
  assert.equal(resolveRun(null, need), null, "bez metadát sa čas behu nevymýšľa");
});

test("najlepší začiatok dňa preskočí nevypočítateľné hodiny", () => {
  const cfg = cfgFor("2026-10-01", "2026-10-02");
  const scores = [
    { startMs: localTimeMs("2026-10-01", 6, cfg.timezone), score: 40 },
    { startMs: localTimeMs("2026-10-01", 9, cfg.timezone), score: 80 },
    { startMs: localTimeMs("2026-10-02", 9, cfg.timezone), score: null },
  ];
  const best = bestStartPerDay(scores, cfg);
  assert.equal(best[0].best?.score, 80);
  assert.equal(best[0].computable, 2);
  assert.equal(best[1].best, null, "deň bez vypočítateľného začiatku nie je nula");
});

/** Responses shaped exactly like the live ones, with every member present and no rain worth counting. */
function jsonFixtures(cfg: Cfg) {
  const times = timeAxis(cfg);
  const seconds = times.map((t) => t / 1000);
  const forecastJson = {
    latitude: 46.75,
    longitude: 14,
    elevation: 1055,
    utc_offset_seconds: 7200,
    hourly_units: {
      temperature_2m: "°C",
      relative_humidity_2m: "%",
      dew_point_2m: "°C",
      precipitation: "mm",
      wind_speed_10m: "km/h",
      shortwave_radiation: "W/m²",
    },
    hourly: {
      time: seconds,
      temperature_2m: times.map(() => 12),
      relative_humidity_2m: times.map(() => 70),
      dew_point_2m: times.map(() => 6),
      precipitation: times.map((_, i) => (i === 5 ? 0.4 : 0)),
      wind_speed_10m: times.map(() => 8),
      shortwave_radiation: times.map(() => 200),
    },
  };
  const hourly: Record<string, unknown> = { time: seconds };
  for (let m = 0; m <= 50; m++) {
    const sfx = m === 0 ? "" : `_member${String(m).padStart(2, "0")}`;
    hourly[`temperature_2m${sfx}`] = times.map(() => 12);
    hourly[`precipitation${sfx}`] = times.map(() => 0);
  }
  const ensembleJson = { ...forecastJson, hourly_units: { temperature_2m: "°C", precipitation: "mm" }, hourly };
  return { forecastJson, ensembleJson };
}

test("snímka sa poskladá z odpovedí a jej časti si neodporujú", () => {
  const cfg = cfgFor("2026-10-01", "2026-10-02");
  const { forecastJson, ensembleJson } = jsonFixtures(cfg);

  const snapshot = buildSnapshot(forecastJson, ensembleJson, null, cfg, 1_758_000_000_000);
  assert.equal(snapshot.scores.length, 8, "dva dni po štyroch legálnych začiatkoch pre 8 h");
  assert.ok(snapshot.scores.every((s: { score: number | null }) => s.score === 100));
  assert.deepEqual(Object.keys(snapshot.scoresByDuration).map(Number), allowedDurations(cfg));
  assert.equal(snapshot.scoresByDuration[3].length, 18, "3 h sa dá začať deväťkrát za deň");
  assert.ok(
    Object.values(snapshot.scoresByDuration).every((list) => (list as { reason: string | null }[]).every((s) => s.reason !== "hours")),
    "v snímke sú len ponúkané začiatky"
  );
  assert.equal(snapshot.ensemble.discovered, 51);
  assert.equal(snapshot.buckets.length, 8);
  assert.equal(snapshot.precipAxisMax, 1);
  assert.equal(snapshot.runAtMs, null, "bez metadát stránka čas behu neukáže");
  assert.equal(snapshot.config.postApplicationHours, 24);

  const dailySum = snapshot.daily.reduce((s: number, d: { totalMm: number | null }) => s + (d.totalMm ?? 0), 0);
  const bucketSum = snapshot.buckets.reduce((s: number, b: { totalMm: number | null }) => s + (b.totalMm ?? 0), 0);
  assert.equal(Math.round(dailySum * 1000), Math.round(bucketSum * 1000));
});

// ---------------------------------------------------------------------------
// The page and the generator
// ---------------------------------------------------------------------------

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

function snapshotFor(cfg: Cfg) {
  const { forecastJson, ensembleJson } = jsonFixtures(cfg);
  return buildSnapshot(forecastJson, ensembleJson, null, cfg, Date.UTC(2026, 8, 23, 6));
}

function embeddedSnapshot(html: string): Record<string, unknown> {
  const match = html.match(/<script type="application\/json" id="wx-snapshot">([\s\S]*?)<\/script>/);
  assert.ok(match, "stránka musí niesť snímku dát");
  return JSON.parse(match[1]);
}

test("stránka nesie presne päť grafov v danom poradí a nikam inam nevedie", () => {
  const html = renderWindowPage(snapshotFor(WINDOW_CONFIG));

  const charts = [...html.matchAll(/id="wx-chart-([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(charts, ["score", "rain", "temp", "wind", "sun"]);
  assert.equal([...html.matchAll(/data-day="/g)].length, 5, "päť tlačidiel dní");
  assert.match(html, /<html lang="sk">/);
  assert.match(html, /Počasie na natieranie terasy/);
  assert.match(html, /1\.–5\. október 2026/);

  // No way back to the retired views.
  assert.equal(html.includes("outlook.html"), false);
  assert.equal(html.includes("Podrobný výhľad"), false);
  assert.equal(html.includes("Podrobná predpoveď počasia"), false);

  // The wording the brief fixes, including the limits of the percentage.
  assert.match(html, /Hodnotíme dážď a teplotu, nie suchosť dreva/);
  assert.match(html, /Pred natieraním zmerajte vlhkosť a teplotu dreva/);
  assert.match(html, /mm \/ 6 h/);
});

test("vložená snímka sa dá prečítať späť a vložený kód je bez import\\/export", () => {
  const snapshot = snapshotFor(WINDOW_CONFIG);
  const parsed = embeddedSnapshot(renderWindowPage(snapshot));
  assert.deepEqual(parsed, JSON.parse(JSON.stringify(snapshot)));

  const bundle = clientBundle();
  assert.equal(/^\s*export\s/m.test(bundle), false, "vložený modul nemá komu exportovať");
  assert.equal(/^\s*import\s/m.test(bundle), false);
  assert.ok(bundle.includes("function scoreStarts"), "jadro sa vkladá do stránky");
  assert.ok(bundle.includes("function boot"), "ovládanie sa vkladá do stránky");
});

function runWindowCli(env: Record<string, string>): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, ["--import", "tsx", "src/outlook.ts"], {
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
    encoding: "utf8",
    timeout: 60_000,
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

test("generátor renderuje z uloženej snímky bez siete, len do scratch adresára", () => {
  const dir = mkdtempSync(join(tmpdir(), "ztlzdrf-window-"));
  mkdirSync(join(dir, "data"));
  writeFileSync(join(dir, "data", "window.json"), `${JSON.stringify(snapshotFor(WINDOW_CONFIG))}\n`);
  const env = { OUTLOOK_DOCS_DIR: dir, WINDOW_RENDER_ONLY: "true" };

  const first = runWindowCli(env);
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /nič sa nesťahuje/);
  assert.match(first.stdout, /index\.html aktualizovaná/);
  const html = readFileSync(join(dir, "index.html"), "utf8");
  assert.equal([...html.matchAll(/id="wx-chart-/g)].length, 5);

  const second = runWindowCli(env);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /index\.html bez zmeny/, "rovnaké dáta nesmú robiť zmenu v gite");

  // The live page must never be touched by a test run.
  assert.ok(existsSync(join(REPO_ROOT, "docs")), "docs/ existuje");
  assert.equal(readFileSync(join(dir, "index.html"), "utf8") === "", false);
});

test("bez dát generátor nič nevymyslí", () => {
  const dir = mkdtempSync(join(tmpdir(), "ztlzdrf-window-"));
  const r = runWindowCli({ OUTLOOK_DOCS_DIR: dir, WINDOW_RENDER_ONLY: "true" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /nemá použiteľnú snímku/);
  assert.equal(existsSync(join(dir, "index.html")), false, "prázdna stránka sa nepublikuje");
});

test("blok v e-maile hovorí tou istou rečou ako stránka a rešpektuje pravidlá Gmailu", () => {
  const snapshot = snapshotFor(WINDOW_CONFIG);
  const html = renderWindowEmailBlock(snapshot, Date.UTC(2026, 8, 23, 6));

  assert.match(html, /Koľko scenárov predpovede vyhovuje/);
  for (const day of ["1.10.", "2.10.", "3.10.", "4.10.", "5.10."]) assert.ok(html.includes(day), `chýba deň ${day}`);
  assert.match(html, /100 %/);
  assert.match(html, /z 51/);
  assert.match(html, /Najlepší začiatok/);
  assert.match(html, /Dážď za deň/);

  // Mail clients strip these, and the old block linked to pages that no longer exist.
  for (const banned of ["<details", "<style", "nowrap", "outlook.html", "outlook.png"]) {
    assert.equal(html.includes(banned), false, `e-mail obsahuje zakázané "${banned}"`);
  }
});

test("blok zmizne po skončení okna a nevypočítateľný deň nie je nula", () => {
  const snapshot = snapshotFor(WINDOW_CONFIG);
  assert.equal(renderWindowEmailBlock(snapshot, Date.UTC(2026, 9, 6, 12)), "", "po okne sa už nič nehlási");

  const gappy = JSON.parse(JSON.stringify(snapshot));
  for (const s of gappy.scores) {
    if (localDateOf(s.startMs, WINDOW_CONFIG.timezone) === "2026-10-03") {
      s.score = null;
      s.reason = "horizon";
    }
  }
  const html = renderWindowEmailBlock(gappy, Date.UTC(2026, 8, 23, 6));
  const row = html.split("<tr>").find((r) => r.includes("3.10.")) ?? "";
  assert.match(row, /nedostatok dát/);
  assert.equal(/\d+ %/.test(row), false, "chýbajúce dáta sa nesmú tváriť ako percento");
  assert.equal([...html.matchAll(/nedostatok dát/g)].length, 1, "ostatné dni sa počítať dajú");
});

test("e-mail je celý o okne, nie o dnešku", () => {
  const snapshot = snapshotFor(WINDOW_CONFIG);
  const { subject, html } = renderAlertEmail(snapshot, new Date(Date.UTC(2026, 8, 23, 6)));

  assert.match(subject, /Terasa št 1\.10\. – po 5\.10\./);
  assert.match(subject, /najlepší štart/);
  assert.match(html, /chart\.png\?t=\d+/, "obrázok musí byť hosťovaný a cache-busted");
  assert.match(html, /Pred natieraním zmerajte vlhkosť a teplotu dreva/);

  // The e-mail must read as the page, not as a second design: same heading, subtitle, source line
  // and palette, all from the shared theme.
  const page = renderWindowPage(snapshot);
  for (const shared of ["Počasie na natieranie terasy", "Zedlitzdorf · 1.–5. október 2026"]) {
    assert.ok(html.includes(shared), `e-mail nehovorí ako stránka: "${shared}"`);
    assert.ok(page.includes(shared), `stránka nehovorí ako e-mail: "${shared}"`);
  }
  assert.match(html, /Zdroj: ECMWF IFS 0,25° cez Open-Meteo/);
  for (const token of [LIGHT.page, LIGHT.surface, LIGHT.text, LIGHT.muted, LIGHT.hairline, LIGHT.score]) {
    assert.ok(html.includes(token), `e-mail nepoužíva farbu stránky ${token}`);
  }

  // Nothing from the retired daily decision may survive here.
  for (const gone of ["NEMAĽOVAŤ", "DOBRÉ NA MAĽOVANIE", "Vysychanie", "Posledných 24 h", "Stav terasy", "Najlepšie okno"]) {
    assert.equal(html.includes(gone), false, `e-mail stále nesie dnešok: "${gone}"`);
  }
  for (const banned of ["<details", "<style", "nowrap", "outlook.html", "outlook.png"]) {
    assert.equal(html.includes(banned), false, `e-mail obsahuje zakázané "${banned}"`);
  }

  // With images off the alt text must still carry the message.
  const alt = html.match(/alt="([^"]*)"/)?.[1] ?? "";
  assert.ok(alt.includes("1.10.") && alt.includes("5.10."), `alt je príliš chudobný: ${alt}`);
});

test("obrázok do e-mailu je PNG a kreslený tvarmi, nie emoji", () => {
  const snapshot = snapshotFor(WINDOW_CONFIG);
  const png = renderWindowPng(snapshot);
  assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);

  // The CI rasterizer has no emoji font and would draw empty boxes instead.
  const svg = buildScorePanel(snapshot) + buildRainPanel(snapshot);
  assert.equal(/\p{Extended_Pictographic}/u.test(svg), false, "obrázok nesmie obsahovať emoji");
  assert.match(svg, /št 1\.10\./);
  assert.match(svg, /po 5\.10\./);
});

test("chýbajúce skóre robí v obrázku medzeru, nie spojnicu", () => {
  const snapshot = JSON.parse(JSON.stringify(snapshotFor(WINDOW_CONFIG)));
  for (const s of snapshot.scores) {
    if (localDateOf(s.startMs, WINDOW_CONFIG.timezone) === "2026-10-03") s.score = null;
  }
  const withGap = buildScorePanel(snapshot);
  const whole = buildScorePanel(snapshotFor(WINDOW_CONFIG));
  const paths = (svg: string) => [...svg.matchAll(/<path /g)].length;
  assert.ok(paths(withGap) > paths(whole), "chýbajúci deň musí krivku prerušiť na dva úseky");
});

// ---------------------------------------------------------------------------
// The page's own script, run without a browser
// ---------------------------------------------------------------------------

/** The inlined page script in a sandbox with no DOM: boot() finds no snapshot and returns, which
 * leaves every function of window-ui.js callable - enough for the ones that touch no DOM. */
function pageSandbox(): vm.Context {
  const ctx = vm.createContext({ document: { getElementById: () => null } });
  vm.runInContext(`"use strict";\n${clientBundle()}`, ctx);
  return ctx;
}

type GestureEvent = { type: string; pointerType: string; id: number; x: number; y: number; chart: string; buttons?: number; scrolling?: boolean };

/** Feeds a sequence of pointer events through chartGesture and returns what each one did. */
function gestures(ctx: vm.Context, events: GestureEvent[]): { cursor: string; select: boolean }[] {
  const script = `(() => { let press = null; const out = [];
    for (const e of ${JSON.stringify(events)}) { const r = chartGesture(press, e); press = r.press; out.push({ cursor: r.cursor, select: r.select }); }
    return JSON.stringify(out); })()`;
  return JSON.parse(vm.runInContext(script, ctx));
}

const finger = (type: string, x: number, y: number, chart = "score", id = 1): GestureEvent => ({ type, pointerType: "touch", id, x, y, chart });
const mouse = (type: string, x: number, y: number, chart = "score"): GestureEvent => ({ type, pointerType: "mouse", id: 1, x, y, chart });

test("rolovanie prstom, ktoré začne na hornom grafe, nič nevyberie ani neukáže", () => {
  // Measured on an emulated phone before this fix: this exact swipe moved the start from
  // 1.10. 09:00 to 3.10. 11:00, because the page selected on pointerdown.
  const steps = gestures(pageSandbox(), [
    finger("pointerdown", 211, 681),
    finger("pointermove", 211, 651),
    finger("pointercancel", 211, 651),
    finger("pointerleave", 211, 651),
  ]);
  assert.equal(steps.some((s) => s.select), false, "rolovanie nesmie meniť výber");
  assert.equal(steps.some((s) => s.cursor === "move"), false, "tooltip nesmie ani bliknúť");
  assert.equal(steps[2].cursor, "clear", "rolovanie zavrie pripnutý tooltip");
});

test("ťuknutie na horný graf vyberie začiatok až po zdvihnutí prsta a tooltip ostane", () => {
  const steps = gestures(pageSandbox(), [
    finger("pointerdown", 266, 681),
    finger("pointerup", 268, 682),
    finger("pointerleave", 268, 682),
  ]);
  assert.deepEqual(steps.map((s) => s.select), [false, true, false]);
  assert.equal(steps[1].cursor, "move");
  assert.equal(steps[2].cursor, "keep", "pointerleave po zdvihnutí prsta tooltip nezavrie");
});

test("prechádzanie prstom do strany ukazuje hodnoty, ale nič nevyberie", () => {
  const steps = gestures(pageSandbox(), [
    finger("pointerdown", 200, 681),
    finger("pointermove", 205, 682), // too little to tell yet
    finger("pointermove", 220, 683),
    finger("pointermove", 240, 684),
    finger("pointerup", 240, 684),
  ]);
  assert.deepEqual(steps.map((s) => s.cursor), ["keep", "keep", "move", "move", "keep"]);
  assert.equal(steps.some((s) => s.select), false);
});

test("ťuknutie na iný graf ukáže hodnoty bez zmeny výberu; cudzí prst sa ignoruje", () => {
  const ctx = pageSandbox();
  const rain = gestures(ctx, [finger("pointerdown", 156, 586, "rain"), finger("pointerup", 156, 586, "rain")]);
  assert.deepEqual(rain, [{ cursor: "keep", select: false }, { cursor: "move", select: false }]);
  const other = gestures(ctx, [finger("pointerdown", 100, 600, "score", 1), finger("pointerup", 100, 600, "score", 2)]);
  assert.equal(other[1].select, false);
});

test("myš sa správa ako doteraz: klik do horného grafu vyberie hneď, odchod tooltip skryje", () => {
  const steps = gestures(pageSandbox(), [mouse("pointermove", 300, 100), mouse("pointerdown", 300, 100), mouse("pointerup", 300, 100), mouse("pointerleave", 300, 100)]);
  assert.deepEqual(steps, [
    { cursor: "move", select: false },
    { cursor: "move", select: true },
    { cursor: "keep", select: false },
    { cursor: "clear", select: false },
  ]);
  assert.equal(gestures(pageSandbox(), [mouse("pointerdown", 300, 100, "rain")])[0].select, false);
});

test("dotyk, ktorý len zastaví dobiehajúce rolovanie, nič nevyberie", () => {
  const steps = gestures(pageSandbox(), [{ ...finger("pointerdown", 266, 681), scrolling: true }, finger("pointerup", 266, 681)]);
  assert.deepEqual(steps, [
    { cursor: "keep", select: false },
    { cursor: "keep", select: false },
  ]);
});

test("pero, ktoré sa grafu nedotýka, ukazuje hodnoty ako myš; dotykom pera sa ťuká ako prstom", () => {
  const pen = (type: string, x: number, buttons: number): GestureEvent => ({ type, pointerType: "pen", id: 7, x, y: 600, chart: "score", buttons });
  const steps = gestures(pageSandbox(), [pen("pointermove", 200, 0), pen("pointerleave", 200, 0), pen("pointerdown", 210, 1), pen("pointerup", 210, 0)]);
  assert.deepEqual(steps, [
    { cursor: "move", select: false },
    { cursor: "clear", select: false },
    { cursor: "keep", select: false },
    { cursor: "move", select: true },
  ]);
});

test("stránka nechá graf posúvať zvislo aj približovať dvoma prstami a počúva pointercancel", () => {
  const html = renderWindowPage(snapshotFor(WINDOW_CONFIG));
  assert.match(html, /touch-action: pan-y pinch-zoom/);
  assert.match(clientBundle(), /"pointercancel"/);
});

/** A stand-in for any element the page script touches: it takes every write and keeps its listeners. */
function fakeElement(extra: Record<string, unknown> = {}): Record<string, any> {
  const listeners: Record<string, ((event: unknown) => void)[]> = {};
  return {
    style: {},
    dataset: {},
    hidden: true,
    textContent: "",
    innerHTML: "",
    value: "",
    clientWidth: 358,
    clientHeight: 1200,
    offsetWidth: 200,
    offsetHeight: 150,
    offsetTop: 0,
    classList: { add() {}, remove() {} },
    setAttribute() {},
    getAttribute: () => null,
    addEventListener(type: string, fn: (event: unknown) => void) {
      (listeners[type] ??= []).push(fn);
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 358, bottom: 180, width: 358, height: 180 }),
    closest: () => null,
    listeners,
    ...extra,
  };
}

/**
 * The page script with the real snapshot, wired to fake elements, and the score chart's pointer
 * handler exactly as bindChartPointers registered it - so a test drives the real wiring, not just
 * the rule behind it.
 */
function wiredPage() {
  const svg = fakeElement({ dataset: { chart: "score" } });
  const capture = fakeElement({ closest: () => svg });
  const elements = new Map<string, Record<string, any>>();
  const byId = (id: string) => {
    if (!elements.has(id)) {
      const wrap = id === "wx-charts" ? { querySelectorAll: (sel: string) => (sel === "[data-capture]" ? [capture] : []) } : {};
      elements.set(id, fakeElement(wrap));
    }
    return elements.get(id);
  };
  const document = { getElementById: (): unknown => null, querySelectorAll: () => [] };
  const ctx = vm.createContext({ document, window: { innerHeight: 844 } });
  vm.runInContext(`"use strict";\n${clientBundle()}`, ctx);
  // Elements only from now on: boot() above had to find no snapshot and stop.
  document.getElementById = byId;
  ctx.__snapshot = JSON.stringify(snapshotFor(WINDOW_CONFIG));
  vm.runInContext(
    `state.snapshot = JSON.parse(__snapshot); state.width = 358; state.durationHours = cfg().applicationHours; reindex();
     state.startMs = snapToStart(localTimeMs(cfg().start, 9, cfg().timezone)); bindChartPointers();`,
    ctx,
  );
  const handler = capture.listeners.pointerdown[0];
  const read = (expr: string) => vm.runInContext(expr, ctx);
  const target = localTimeMs("2026-10-04", 10, WINDOW_CONFIG.timezone);
  const x = read(`xOf(${target})`) as number;
  const fire = (type: string, dx = 0, dy = 0) => handler({ type, pointerType: "touch", pointerId: 1, clientX: x + dx, clientY: 100 + dy, buttons: 1 });
  return { capture, read, fire, target, initial: read("state.startMs") as number };
}

test("napojenie na stránke: rolovanie z horného grafu výber nezmení, ťuknutie áno", () => {
  const scroll = wiredPage();
  assert.deepEqual(Object.keys(scroll.capture.listeners).sort(), ["pointercancel", "pointerdown", "pointerleave", "pointermove", "pointerup"]);
  assert.notEqual(scroll.initial, scroll.target);
  scroll.fire("pointerdown");
  scroll.fire("pointermove", 0, -30);
  scroll.fire("pointercancel", 0, -30);
  assert.equal(scroll.read("state.startMs"), scroll.initial, "rolovanie nesmie meniť výber");
  assert.equal(scroll.read("state.cursorMs"), null);

  const tap = wiredPage();
  tap.fire("pointerdown");
  assert.equal(tap.read("state.startMs"), tap.initial, "pri položení prsta sa ešte nič nevyberá");
  tap.fire("pointerup", 1, 1);
  tap.fire("pointerleave", 1, 1);
  assert.equal(tap.read("state.startMs"), tap.target, "ťuknutie vyberie hodinu pod prstom");
  assert.equal(tap.read("state.cursorMs"), tap.target, "tooltip ostane aj po zdvihnutí prsta");

  const flick = wiredPage();
  flick.read("lastScrollAt = Date.now()");
  flick.fire("pointerdown");
  flick.fire("pointerup");
  assert.equal(flick.read("state.startMs"), flick.initial, "zastavenie rolovania nie je ťuknutie");
});
