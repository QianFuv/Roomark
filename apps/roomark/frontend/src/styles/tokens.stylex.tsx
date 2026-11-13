/**
 * Design tokens: colors, radii, fonts, type scale, spacing and control sizes. The rules for using
 * them are in `docs/design/visual-system.md`.
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
  heat0: "light-dark(#ebebec, #252525)",
  heat1: "color-mix(in oklab, light-dark(#1b4ed8, #346bf1) 25%, light-dark(#ebebec, #252525))",
  heat2: "color-mix(in oklab, light-dark(#1b4ed8, #346bf1) 50%, light-dark(#ebebec, #252525))",
  heat3: "color-mix(in oklab, light-dark(#1b4ed8, #346bf1) 75%, light-dark(#ebebec, #252525))",
  heat4: "light-dark(#1b4ed8, #346bf1)",
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

/**
 * Font families. JetBrainsLxgwNerdMono (JetBrains Mono + LXGW WenKai Mono, 400 and 700 only) is
 * loaded from `assets/` by `base.css`, the same way as LitRadar.
 */
export const fonts = stylex.defineConsts({
  sans: "'JetBrainsLxgwNerdMono', monospace",
  mono: "'JetBrainsLxgwNerdMono', monospace",
});

/**
 * Type scale. Each role in `ui/typography.tsx` pairs one size with one line height and weight; use
 * the roles rather than these values. The font is monospaced with 2:1 CJK width, so it reads about
 * one step larger than a proportional font at the same pixel size.
 */
export const fontSizes = stylex.defineConsts({
  meta: "12px",
  body: "14px",
  title: "16px",
  input: "16px",
  figure: "20px",
  display: "22px",
  displayNarrow: "24px",
});

/** Line heights of the type roles, in whole pixels so text sits on the pixel grid. */
export const lineHeights = stylex.defineConsts({
  meta: "18px",
  control: "20px",
  body: "22px",
  title: "24px",
  figure: "28px",
  display: "30px",
  displayNarrow: "32px",
});

/** The only two weights the font ships; anything else would be synthesized. */
export const fontWeights = stylex.defineConsts({
  regular: "400",
  bold: "700",
});

/**
 * Spacing: a 4-based scale plus semantic aliases. Prefer the semantic names where one fits.
 */
export const space = stylex.defineConsts({
  xxs: "2px",
  xs: "4px",
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "24px",
  xxl: "32px",
  pagePadding: "16px",
  pagePaddingNarrow: "24px",
  pagePaddingWide: "32px",
  sectionGap: "16px",
  sectionGapWide: "24px",
  cardPadding: "16px",
  cardGap: "12px",
  controlGap: "8px",
  rowPaddingBlock: "8px",
  rowPaddingInline: "12px",
});

/**
 * Control heights. `control` is the 44 px touch target; `controlSmall` is for secondary controls in
 * dense headers; `controlLarge` is for full-width form submits and two-line buttons.
 */
export const sizes = stylex.defineConsts({
  controlSmall: "36px",
  control: "44px",
  controlLarge: "48px",
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
