/**
 * The one palette the painting-window page, its e-mail and the e-mail's image all draw from.
 *
 * It lives here because the three media cannot share a stylesheet: the page uses CSS custom
 * properties (and switches to the dark set by itself), the e-mail has to inline every colour as an
 * attribute, and the PNG is rasterized with no CSS at all. Keeping the values in one place is what
 * stops them from slowly drifting apart.
 *
 * E-mail and image always use LIGHT: mail clients handle `prefers-color-scheme` inconsistently and
 * some invert colours on their own, so a light, high-contrast card is the safe choice.
 */

export const LIGHT = {
  page: "#f7f7f5",
  surface: "#ffffff",
  text: "#1d2125",
  muted: "#5e6871",
  hairline: "#e3e5e4",
  grid: "#ebedec",
  dayLine: "#d8dbda",
  accent: "#2f6fb0",
  accentSoft: "#eaf1f8",
  score: "#2f7d6b",
  scoreFill: "rgba(47, 125, 107, 0.14)",
  rain: "#3d7cb8",
  rainPartial: "#9dbcd8",
  temp: "#c1562f",
  dew: "#5b7a99",
  wind: "#5a6b7a",
  sun: "#b07d12",
  sunFill: "rgba(176, 125, 18, 0.13)",
  bandWork: "rgba(47, 111, 176, 0.13)",
  bandWatch: "rgba(214, 138, 51, 0.13)",
  limit: "#b03030",
  warnBg: "#fdf3e7",
  warnText: "#7a4a12",
};

export const DARK: typeof LIGHT = {
  page: "#14171a",
  surface: "#1c2024",
  text: "#e8eaec",
  muted: "#9aa4ad",
  hairline: "#2b3137",
  grid: "#272d33",
  dayLine: "#333b42",
  accent: "#6fb1e8",
  accentSoft: "#1f2a34",
  score: "#5fc3ab",
  scoreFill: "rgba(95, 195, 171, 0.16)",
  rain: "#6fb1e8",
  rainPartial: "#3f5f7a",
  temp: "#f0906a",
  dew: "#9bb6cf",
  wind: "#a7b8c6",
  sun: "#e9c46a",
  sunFill: "rgba(233, 196, 106, 0.14)",
  bandWork: "rgba(111, 177, 232, 0.16)",
  bandWatch: "rgba(233, 176, 106, 0.15)",
  limit: "#e8756f",
  warnBg: "#33291a",
  warnText: "#e8c489",
};

export type Theme = typeof LIGHT;

/** kebab-case CSS custom properties, so the stylesheet is generated from the same object. */
export function cssVariables(theme: Theme, indent = "  "): string {
  return Object.entries(theme)
    .map(([key, value]) => `${indent}--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${value};`)
    .join("\n");
}
