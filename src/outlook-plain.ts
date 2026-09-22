import { PAINTING_RULES, type OutlookConfig } from "./config.js";
import type { OutlookDigest, OutlookDigestDay, OutlookSnapshot, OutlookTrend, PaintingStatus } from "./types.js";
import { daysBetween, formatDayLabelLong } from "./time.js";
import { statusIcon, statusLabelSk } from "./outlook-core.js";
import type { WeatherGlyphKind } from "./charts.js";

/*
 * The plain-language layer: turns the digest numbers into the few words a non-technical reader
 * needs - a traffic light with a word, a weather pictogram with a word, one temperature, the chance
 * as "x z 10 predpovedí" and the trend as a phrase. Pure functions of the digest, so the page, the
 * dashboard card, the e-mail and the PNG all say exactly the same thing.
 *
 * Vocabulary rule (enforced by a test): nothing here may say "beh", "p50", "ensemble", "UTC",
 * "p. b.", "%", "členov", "GOOD" or a model name - those live in the technical details only.
 */

/** Non-breaking space: keeps "17 °C" and "6 z 10" on one line on a phone. */
const NB = " ";

export type RainLevel = "rain" | "showers" | "dry";
/** The pictogram encodes rain risk + suitability, NOT cloud cover (radiation is not persisted):
 * sun = dry and a usable window, dryish = dry but cold/humid/short, showers, rain. The emoji is for
 * HTML, `weatherGlyphSvg` draws the same four for the rasterized strip (type import only - this
 * module stays free of runtime dependencies). */
export type WeatherGlyph = WeatherGlyphKind;

export interface PlainDay {
  date: string;
  /** "štvrtok 1.10." */
  dayLabel: string;
  past: boolean;
  status: PaintingStatus;
  /** 🟢 / 🟡 / 🔴 */
  icon: string;
  /** "Pravdepodobne áno" / "Neisté" / "Skôr nie" */
  verdict: string;
  glyph: WeatherGlyph;
  glyphEmoji: string;
  /** "sucho", "možno prehánky", "skôr dážď", "sucho, ale chladno" ... */
  weather: string;
  /** "cez deň okolo 18 °C" */
  temp: string;
  chanceOf10: number;
  /** "áno v 6 z 10 predpovedí", plus the "aspoň čiastočne" clause where it is needed. */
  chance: string;
  /** Always the bare "áno v 6 z 10 predpovedí" - for the narrow rows of the e-mail image, where the
   * longer form would not fit; the e-mail table beside it still carries the full sentence. */
  chanceShort: string;
  trendDirection: OutlookTrend["direction"] | null;
  trendArrow: string;
  /** "od včera lepšie" / "zatiaľ nie je s čím porovnať" */
  trend: string;
  /** One sentence for aria-label / image alt text. */
  sentence: string;
  snapshots: OutlookSnapshot[];
}

export interface PlainContext {
  today: string;
  window: { start: string; end: string };
}

export function rainLevel(pRain: number, cfg: OutlookConfig): RainLevel {
  if (pRain >= cfg.plain.rainLikely) return "rain";
  if (pRain >= cfg.plain.rainPossible) return "showers";
  return "dry";
}

export function weatherGlyph(day: Pick<OutlookDigestDay, "pRain" | "goodRunP50">, cfg: OutlookConfig): WeatherGlyph {
  const level = rainLevel(day.pRain, cfg);
  if (level !== "dry") return level;
  return day.goodRunP50 >= cfg.minGoodHours ? "sun" : "dryish";
}

export function glyphEmoji(glyph: WeatherGlyph): string {
  return glyph === "sun" ? "☀️" : glyph === "dryish" ? "🌤️" : glyph === "showers" ? "🌦️" : "🌧️";
}

export function weatherWords(day: Pick<OutlookDigestDay, "pRain" | "goodRunP50" | "tMaxP50" | "rhMinP50">, cfg: OutlookConfig): string {
  const glyph = weatherGlyph(day, cfg);
  // "skôr dážď", not "dážď": at the threshold half of the forecasts are still dry.
  if (glyph === "rain") return "skôr dážď";
  if (glyph === "showers") return "možno prehánky";
  if (glyph === "sun") return "sucho";
  const cold = day.tMaxP50 < PAINTING_RULES.temperature.preferredMin;
  const humid = day.rhMinP50 > PAINTING_RULES.humidity.preferredMax;
  const why = cold && humid ? "chladno a vlhko" : cold ? "chladno" : humid ? "vlhko" : "nie ideálne";
  return `sucho, ale ${why}`;
}

export function tempWords(tMaxP50: number): string {
  return `cez deň okolo ${Math.round(tMaxP50)}${NB}°C`;
}

/** Floor, not round: 0.59 must read "5 z 10" (🟡), 0.6 "6 z 10" (🟢) - the count and the traffic
 * light must never disagree. */
export function chanceOf10(pPaintable: number): number {
  return Math.max(0, Math.min(10, Math.floor(pPaintable * 10 + 1e-9)));
}

function ofTen(n: number): string {
  return n === 0 ? `žiadnej z${NB}10` : `${n}${NB}z${NB}10`;
}

/** "áno v 6 z 10 predpovedí". A 🟡 day that owes its verdict to the "at least marginal" share
 * (few fully paintable members, many partly usable ones) says so, otherwise a yellow light next to
 * "1 z 10" would look like a contradiction. */
export function chanceWords(pPaintable: number, pPossible = 0, cfg?: OutlookConfig): string {
  const n = chanceOf10(pPaintable);
  const base = `áno v ${ofTen(n)} predpovedí`;
  if (cfg && n < cfg.dayStatus.marginal * 10 && pPossible >= cfg.dayStatus.possibleMarginal) {
    return `${base}, aspoň čiastočne v ${ofTen(chanceOf10(pPossible))}`;
  }
  return base;
}

/** The null phrase is deliberately neutral: it covers the first snapshot, a model change and the
 * morning mail (whose newest run has no >= 24 h older sibling yet) alike. */
export function trendWords(trend: OutlookTrend | null): { arrow: string; text: string; direction: OutlookTrend["direction"] | null } {
  if (!trend) return { arrow: "", text: "zatiaľ nie je s čím porovnať", direction: null };
  if (trend.direction === "up") return { arrow: "↑", text: "od včera lepšie", direction: "up" };
  if (trend.direction === "down") return { arrow: "↓", text: "od včera horšie", direction: "down" };
  return { arrow: "→", text: "od včera bez zmeny", direction: "flat" };
}

function dayWord(n: number): string {
  return n === 1 ? "deň" : n >= 2 && n <= 4 ? "dni" : "dní";
}

/** "výhľad na 9–12 dní dopredu – ešte sa môže zmeniť", computed from the dates, never hard-coded. */
export function horizonWords(ctx: PlainContext): string {
  const a = daysBetween(ctx.today, ctx.window.start);
  const b = daysBetween(ctx.today, ctx.window.end);
  let range: string;
  if (a < 1) range = b <= 0 ? "výhľad na dnes" : "výhľad na najbližšie dni";
  else if (a === b) range = `výhľad na ${a} ${dayWord(a)} dopredu`;
  else range = `výhľad na ${a}–${b} ${dayWord(b)} dopredu`;
  return `${range} – ešte sa môže zmeniť`;
}

export const PAST_WORDS = "už je za nami";

export function plainDay(day: OutlookDigestDay, cfg: OutlookConfig): PlainDay {
  const dayLabel = formatDayLabelLong(day.date);
  const glyph = weatherGlyph(day, cfg);
  const weather = weatherWords(day, cfg);
  const temp = tempWords(day.tMaxP50);
  const chance = chanceWords(day.pPaintable, day.pPossible, cfg);
  const trend = trendWords(day.trend);
  const verdict = statusLabelSk(day.status);
  // Semicolons, because the weather part may itself contain a comma ("sucho, ale chladno").
  const sentence = day.past
    ? `${dayLabel}: ${PAST_WORDS}.`
    : `${dayLabel}: ${verdict.toLowerCase()}; ${weather}; ${temp}; ${chance}; ${trend.text}.`;
  return {
    date: day.date,
    dayLabel,
    past: day.past,
    status: day.status,
    icon: statusIcon(day.status),
    verdict,
    glyph,
    glyphEmoji: glyphEmoji(glyph),
    weather,
    temp,
    chanceOf10: chanceOf10(day.pPaintable),
    chance,
    chanceShort: chanceWords(day.pPaintable),
    trendDirection: trend.direction,
    trendArrow: trend.arrow,
    trend: trend.text,
    sentence,
    snapshots: day.snapshots,
  };
}

export function plainDays(digest: OutlookDigest, cfg: OutlookConfig): PlainDay[] {
  return digest.days.map((d) => plainDay(d, cfg));
}

export function plainContext(digest: OutlookDigest): PlainContext {
  return { today: digest.today, window: digest.window };
}

export const LEGEND_SHORT = "🟢 asi áno · 🟡 ešte nevieme · 🔴 skôr nie";

/** The horizon caveat as a sentence of its own - the page, the dashboard card, the e-mail and the
 * e-mail image all carry it, so it is written once. */
export function horizonSentence(ctx: PlainContext): string {
  return `${capitalize(horizonWords(ctx))}.`;
}

export function howToRead(ctx: PlainContext): string {
  return (
    "Ako to čítať: 🟢 Pravdepodobne áno = asi sa bude dať maľovať, 🟡 Neisté = ešte nevieme, 🔴 Skôr nie. " +
    "Šípka hovorí, či sa predpoveď od včera zlepšila, alebo zhoršila; malý graf v každom dni ukazuje, ako sa šanca menila deň po dni (vpravo je dnešok). " +
    horizonSentence(ctx)
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
