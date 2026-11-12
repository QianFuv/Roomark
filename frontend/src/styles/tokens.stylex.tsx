/**
 * Design tokens: colors, radii, spacing and type scale.
 *
 * Colors follow the T3 Soft palette (`docs/design/t3-soft.json`): the light value of each
 * `light-dark()` pair comes from `variants.light`, the dark value from `colors`. Status colors map
 * onto the palette's own accents: free = accent blue, busy = error red, warning and blocked time =
 * warning amber. The theme follows the root `color-scheme`, which next-themes sets before the first
 * paint (system, light or dark).
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";

/** Semantic colors for both color schemes. */
export const colors = stylex.defineVars({
  canvas: "light-dark(#f6f6f6, #141414)",
  surface: "light-dark(#fbfbfb, #1b1b1b)",
  surfaceRaised: "light-dark(#ffffff, #1e1e1e)",
  surfaceMuted: "light-dark(#efefef, #252525)",
  surfaceHover: "light-dark(#ededee, #2c2c2c)",
  sidebar: "light-dark(#efefef, #1c1c1c)",
  sidebarHover: "light-dark(#e7e7e8, #2c2c2c)",
  sidebarActive: "light-dark(#fbfbfb, #343434)",
  border: "light-dark(#e0e0e3, #242424)",
  borderStrong: "light-dark(#d0d0d4, #343434)",
  text: "light-dark(#27272a, #f5f5f5)",
  textMuted: "light-dark(#696973, #8e8e8e)",
  textSubtle: "light-dark(#676771, #a3a3a3)",
  primary: "light-dark(#1b4ed8, #346bf1)",
  primaryHover: "light-dark(#3160db, #3061d9)",
  primaryText: "light-dark(#1b4ed8, #51a2ff)",
  onPrimary: "#ffffff",
  primarySoft: "light-dark(#dbe1f2, #1b2440)",
  free: "light-dark(#1b4ed8, #51a2ff)",
  freeStrong: "light-dark(#1b4ed8, #51a2ff)",
  freeSolid: "light-dark(#1b4ed8, #346bf1)",
  freeSolidHover: "light-dark(#3160db, #3061d9)",
  onFree: "#ffffff",
  freeSoft: "light-dark(#dbe1f2, #1b2440)",
  busy: "light-dark(#c10007, #ff6467)",
  busySolid: "light-dark(#fb2c36, #fb414a)",
  busyStrong: "light-dark(#c10007, #ff6467)",
  busySoft: "light-dark(#f7e6e7, #3a1a1c)",
  warning: "light-dark(#b54b00, #ffb900)",
  warningSolid: "#fe9a00",
  warningSoft: "light-dark(#f7efe2, #3b2a11)",
  info: "light-dark(#1b4ed8, #51a2ff)",
  infoSoft: "light-dark(#dbe1f2, #1b2440)",
  focusRing: "light-dark(rgb(27 78 216 / 0.45), rgb(52 107 241 / 0.6))",
  scrim: "light-dark(rgb(39 39 42 / 0.4), rgb(0 0 0 / 0.6))",
  shadowStrong: "light-dark(rgb(39 39 42 / 0.14), rgb(0 0 0 / 0.5))",
  heat0: "light-dark(#efefef, #252525)",
  heat1: "light-dark(#c6d2f1, #1b2c5c)",
  heat2: "light-dark(#89a5e8, #22438f)",
  heat3: "light-dark(#4b74df, #2f5fd6)",
  heat4: "light-dark(#1b4ed8, #51a2ff)",
  chart1: "light-dark(#1b4ed8, #346bf1)",
  chart2: "light-dark(#fe9a00, #fe9a00)",
  chart3: "light-dark(#fb2c36, #fb414a)",
});

/** Corner radii. */
export const radii = stylex.defineConsts({
  small: "6px",
  medium: "10px",
  large: "14px",
  extraLarge: "20px",
  pill: "999px",
});

/** Font families and sizes. */
export const fonts = stylex.defineConsts({
  sans: 'system-ui, -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans SC", sans-serif',
  mono: 'ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace',
  sizeXs: "12px",
  sizeSm: "13px",
  sizeMd: "15px",
  sizeLg: "17px",
  sizeXl: "20px",
  sizeXxl: "26px",
  sizeHero: "34px",
});

/**
 * Layout tiers as media queries: mobile is the default (< 768 px), `narrow` is a PC window or
 * tablet (768–1279 px), `wide` is a maximised PC window (≥ 1280 px). Components that live in sheets
 * use the container queries instead, so they follow the space they actually get.
 */
export const media = stylex.defineConsts({
  narrow: "@media (min-width: 768px)",
  wide: "@media (min-width: 1280px)",
  formTwoColumn: "@container (min-width: 640px)",
  reducedMotion: "@media (prefers-reduced-motion: reduce)",
  hover: "@media (hover: hover)",
});
