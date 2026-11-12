/**
 * Design tokens: colors, radii, spacing and type scale.
 *
 * Colors use `light-dark()`, so the theme follows the root `color-scheme`, which next-themes sets
 * before the first paint (system, light or dark).
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";

/** Semantic colors for both color schemes. */
export const colors = stylex.defineVars({
  canvas: "light-dark(#f4f6f9, #0e1014)",
  surface: "light-dark(#ffffff, #161920)",
  surfaceRaised: "light-dark(#ffffff, #2a303c)",
  surfaceMuted: "light-dark(#eef1f5, #1f232c)",
  surfaceHover: "light-dark(#e6eaf0, #272c37)",
  border: "light-dark(#dfe3ea, #2a2f3a)",
  borderStrong: "light-dark(#c5ccd6, #3a4150)",
  text: "light-dark(#14171d, #eef0f4)",
  textMuted: "light-dark(#535b69, #a7adb9)",
  textSubtle: "light-dark(#656d7c, #8d94a3)",
  primary: "light-dark(#2457d6, #6e98ff)",
  primaryHover: "light-dark(#1d4bbd, #88aaff)",
  primaryText: "light-dark(#1e4fc4, #8eb0ff)",
  onPrimary: "light-dark(#ffffff, #0a1022)",
  primarySoft: "light-dark(#e7eefd, #1b2743)",
  free: "light-dark(#11804a, #3fcf86)",
  freeStrong: "light-dark(#0b6b3d, #62dc9d)",
  onFree: "light-dark(#ffffff, #052614)",
  freeSoft: "light-dark(#e2f5ea, #11291c)",
  busy: "light-dark(#c23a2e, #ff7365)",
  busyStrong: "light-dark(#a52f25, #ff8d81)",
  busySoft: "light-dark(#fdebe8, #35191a)",
  warning: "light-dark(#a15c07, #f3b44f)",
  warningSoft: "light-dark(#fff3dd, #2f2413)",
  info: "light-dark(#2457d6, #6e98ff)",
  infoSoft: "light-dark(#e7eefd, #1b2743)",
  block: "light-dark(#6b7280, #9aa1ae)",
  blockSoft: "light-dark(#eceef2, #252a33)",
  focusRing: "light-dark(rgb(36 87 214 / 0.45), rgb(110 152 255 / 0.55))",
  scrim: "light-dark(rgb(15 18 25 / 0.45), rgb(0 0 0 / 0.6))",
  shadow: "light-dark(rgb(16 24 40 / 0.08), rgb(0 0 0 / 0.35))",
  shadowStrong: "light-dark(rgb(16 24 40 / 0.18), rgb(0 0 0 / 0.55))",
  heat0: "light-dark(#eef1f5, #1f232c)",
  heat1: "light-dark(#86b6ef, #184f95)",
  heat2: "light-dark(#3987e5, #256abf)",
  heat3: "light-dark(#256abf, #3987e5)",
  heat4: "light-dark(#104281, #86b6ef)",
  chart1: "light-dark(#2a78d6, #3987e5)",
  chart2: "light-dark(#eb6834, #d95926)",
  chart3: "light-dark(#1baf7a, #199e70)",
});

/** Corner radii. */
export const radii = stylex.defineConsts({
  small: "8px",
  medium: "12px",
  large: "16px",
  extraLarge: "22px",
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

/** Layout breakpoints as media queries. */
export const media = stylex.defineConsts({
  tablet: "@media (min-width: 768px)",
  desktop: "@media (min-width: 1024px)",
  reducedMotion: "@media (prefers-reduced-motion: reduce)",
  hover: "@media (hover: hover)",
});
