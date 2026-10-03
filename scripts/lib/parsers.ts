/**
 * Parsers for the truth sources' native formats. Pure functions, covered by parsers.test.ts with
 * fixtures cut from real downloads (3 Oct 2026).
 */

export interface EhydSeries {
  header: Record<string, string>;
  /** "YYYY-MM-DDTHH:MM" exactly as stamped (local time, no zone). */
  stamps: string[];
  values: (number | null)[];
}

/**
 * eHYD export (MessstellenExtraData): CP1252 text already decoded; header lines "Key: ;value",
 * then "Werte:" and rows "dd.mm.yyyy HH:MM:SS ;value" with comma decimals. "Lücke" is a gap.
 * Stamps are kept as given: eHYD documents interval values as valid from the stamp until the next
 * one ("Der Intervallwert gilt bis zum nächsten Zeitpunkt"), so a daily sum stamped 07:00 of day d
 * covers d 07:00 .. d+1 07:00; the report verifies this against independent hourly data.
 */
export function parseEhyd(text: string): EhydSeries {
  const header: Record<string, string> = {};
  const stamps: string[] = [];
  const values: (number | null)[] = [];
  let inValues = false;
  for (const line of text.split(/\r?\n/)) {
    if (!inValues) {
      if (line.startsWith("Werte:")) inValues = true;
      else {
        const m = /^([^:;]+):\s*;?(.*)$/.exec(line);
        if (m) {
          const key = m[1].trim();
          const val = m[2].replace(/\s*;\s*/g, " ").trim();
          header[key] = header[key] ? `${header[key]} | ${val}` : val;
        }
      }
      continue;
    }
    const m = /^(\d\d)\.(\d\d)\.(\d{4}) (\d\d):(\d\d):\d\d\s*;\s*(.*)$/.exec(line);
    if (!m) continue;
    stamps.push(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}`);
    const v = m[6].trim();
    values.push(v === "" || v.startsWith("L") ? null : Number(v.replace(",", ".")));
  }
  return { header, stamps, values };
}

/**
 * 5-minute interval values (stamp = start of the interval) summed into hours. The hourly stamp is
 * the start of the hour; an hour with any missing or absent 5-minute value is null.
 */
export function hourlySums(stamps: string[], values: (number | null)[]): { stamps: string[]; values: (number | null)[] } {
  const sums = new Map<string, { sum: number; n: number; gap: boolean }>();
  stamps.forEach((t, i) => {
    const h = t.slice(0, 13);
    const s = sums.get(h) ?? { sum: 0, n: 0, gap: false };
    const v = values[i];
    if (v === null || v === undefined) s.gap = true;
    else {
      s.sum += v;
      s.n++;
    }
    sums.set(h, s);
  });
  const hours = [...sums.keys()].sort();
  return {
    stamps: hours.map((h) => `${h}:00`),
    values: hours.map((h) => {
      const s = sums.get(h)!;
      return s.gap || s.n < 12 ? null : Math.round(s.sum * 100) / 100;
    }),
  };
}

export interface SmetSeries {
  header: Record<string, string>;
  /** Field names after `timestamp`. */
  fields: string[];
  stamps: string[];
  rows: (number | null)[][];
}

/**
 * SMET 1.1 ASCII (LWD Kärnten via smet.hydrographie.info). `nodata` is -777; in columns the
 * exporter scales by 0.01 (RH, HS) it shows up as -7.77, which is treated as missing too.
 */
export function parseSmet(text: string): SmetSeries {
  const [head, data] = text.split(/\[DATA\]\r?\n/);
  const header: Record<string, string> = {};
  for (const line of head.split(/\r?\n/)) {
    const m = /^(\w+)\s*=\s*(.*)$/.exec(line);
    if (m) header[m[1]] = m[2].trim();
  }
  if (!header.fields) throw new Error("SMET bez riadku fields");
  const fields = header.fields.split(/\s+/).slice(1);
  const nodata = Number(header.nodata ?? -777);
  const stamps: string[] = [];
  const rows: (number | null)[][] = [];
  for (const line of (data ?? "").split(/\r?\n/)) {
    const p = line.trim().split(/\s+/);
    if (p.length < 2 || !/^\d{4}-/.test(p[0])) continue;
    stamps.push(p[0]);
    rows.push(p.slice(1).map((x) => {
      const v = Number(x);
      return !Number.isFinite(v) || v === nodata || (v < -7 && v > -8) ? null : v;
    }));
  }
  return { header, fields, stamps, rows };
}
