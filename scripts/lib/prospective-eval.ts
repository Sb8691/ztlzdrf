/**
 * Pure helpers for the season-end verification of the prospective log (METODIKA §5.2): the log
 * lines of src/prospective.ts turned into scored cases, grouped the way the page used them - by
 * horizon, day offset and CI slot - so every day enters a class once.
 */
import type { ForecastLogLine } from "../../src/prospective.js";
import type { Case } from "./verify.js";

export interface TruthValue { obs: number; hs: number | null }
export type TruthLookup = (station: string, date: string) => TruthValue | null;
export type Climatology = (station: string, month: number, date: string) => { p: number; mean: number };

/** The CI runs at 04:13, 10:13 and 16:13 UTC; anything else (a manual run) is its own slot. */
export function slotOf(fetchedAtMs: number): string {
  const h = new Date(fetchedAtMs).getUTCHours();
  if (h >= 3 && h <= 6) return "04";
  if (h >= 9 && h <= 12) return "10";
  if (h >= 15 && h <= 18) return "16";
  return `${String(h).padStart(2, "0")}?`;
}

export interface LoggedCase extends Case {
  key: string;
  leadH: number | null;
  alert: boolean;
  /** Snow depth on the morning of the day, for the primary filter. */
  hs: number | null;
  /** The forecast amount the probability came from (cm), for the bias of the physics. */
  forecastCm: number | null;
}

type PowderRecord = { forecastCm: number; leadH: number; probability: number; medianCm: number; p90Cm: number; stage: string | null; alert: boolean } | null;

/** Nearest station with truth for each resort's top: Turracher and Falkert have LWD stations 1.4-1.6 km
 * from the lifts; Hochrindl and Bad Kleinkirchheim only a station 10-15 km away (orientation, not truth). */
export const RESORT_PROXY: Record<string, { station: string; approximate: boolean }> = {
  "turracher-hoehe": { station: "lwd:2900265", approximate: false },
  falkert: { station: "lwd:2900240", approximate: false },
  hochrindl: { station: "geosphere:186", approximate: true },
  "bad-kleinkirchheim": { station: "lwd:2900240", approximate: true },
};

/**
 * Cases from the log. Station classes are keyed `stations|<horizon>|D+<n>|<slot>`, resort classes
 * `resorts|<horizon>|D+<n>|<slot>` (scored against the proxy station), ensemble classes
 * `ensemble|long|D+<n>|<slot>` with the raw share of members at or above the threshold as the probability.
 * A day appears in a class at most once per station (the last line of a slot wins).
 */
export function collectCases(lines: ForecastLogLine[], truth: TruthLookup, clim: Climatology, thresholdCm: number): Map<string, LoggedCase[]> {
  const byKey = new Map<string, Map<string, LoggedCase>>();
  const put = (key: string, c: LoggedCase) => {
    const m = byKey.get(key) ?? new Map<string, LoggedCase>();
    m.set(`${c.station}|${c.day}`, c);
    byKey.set(key, m);
  };
  const make = (key: string, station: string, date: string, prob: number, fc: number | null, leadH: number | null, alert: boolean, forecastCm: number | null): LoggedCase | null => {
    const t = truth(station, date);
    if (!t) return null;
    const c = clim(station, Number(date.slice(5, 7)), date);
    return { key, day: date, station, obs: Math.max(0, t.obs), fc, prob, clim: c.p, climMean: c.mean, leadH, alert, hs: t.hs, forecastCm };
  };
  for (const line of lines) {
    const slot = slotOf(line.fetchedAtMs);
    for (const [hk, h] of Object.entries(line.horizons)) {
      for (const [station, days] of Object.entries(h.stations ?? {})) {
        days.forEach((d, di) => {
          const ps = d.powderSnow as PowderRecord;
          if (!ps) return;
          const key = `stations|${hk}|D+${di}|${slot}`;
          const c = make(key, station, d.date as string, ps.probability, ps.medianCm, ps.leadH, ps.alert, ps.forecastCm);
          if (c) put(key, c);
        });
      }
      for (const [resort, days] of Object.entries(h.resorts)) {
        const proxy = RESORT_PROXY[resort];
        if (!proxy) continue;
        days.forEach((d, di) => {
          if ("members" in d) {
            const members = d.members as (number | null)[];
            if (!members.length || members.some((v) => v === null)) return;
            const prob = members.filter((v) => (v as number) >= thresholdCm).length / members.length;
            const sorted = [...(members as number[])].sort((a, b) => a - b);
            const key = `ensemble|${hk}|D+${di}|${slot}`;
            const c = make(key, proxy.station, d.date as string, prob, sorted[Math.floor(sorted.length / 2)], null, false, null);
            if (c) put(key, { ...c, station: resort });
            return;
          }
          const ps = d.powderSnow as PowderRecord;
          if (!ps) return;
          const key = `resorts|${hk}|D+${di}|${slot}`;
          const c = make(key, proxy.station, d.date as string, ps.probability, ps.medianCm, ps.leadH, ps.alert, ps.forecastCm);
          if (c) put(key, { ...c, station: resort });
        });
      }
    }
  }
  return new Map([...byKey.entries()].map(([k, m]) => [k, [...m.values()].sort((a, b) => a.day.localeCompare(b.day) || a.station.localeCompare(b.station))]));
}

export interface Decision { alerts: number; hits: number; falseAlarms: number; misses: number; events: number; pod: number | null; far: number | null }

/** What the ALERT flag would have meant on these cases at threshold p* (the logged flag when p* is the page's own). */
export function decisionTable(cases: LoggedCase[], thresholdCm: number, pStar: number): Decision {
  let alerts = 0, hits = 0, misses = 0, events = 0;
  for (const c of cases) {
    const ev = c.obs >= thresholdCm;
    const on = (c.prob ?? 0) >= pStar;
    if (ev) events++;
    if (on) alerts++;
    if (on && ev) hits++;
    if (!on && ev) misses++;
  }
  const fa = alerts - hits;
  return { alerts, hits, falseAlarms: fa, misses, events, pod: events ? hits / events : null, far: alerts ? fa / alerts : null };
}

/** Mean of a numeric field over the cases, null when none. */
export function meanOf(cases: LoggedCase[], pick: (c: LoggedCase) => number | null): number | null {
  const v = cases.map(pick).filter((x): x is number => x !== null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
