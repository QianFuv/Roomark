/**
 * Type roles. Every piece of text uses exactly one role, which fixes its size, line height and
 * weight; components add only color. Hierarchy: `display` (page title) > `title` (section and card
 * titles) > `body` / `label` > `meta`. `figure` is for standalone numbers (stat values, code boxes)
 * and stays below `display`. `input` is the 16 px text-field size that keeps iOS from zooming.
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";

import { fontSizes, fontWeights, lineHeights, media } from "../styles/tokens.stylex";

/** Type role styles; pass one to `stylex.props` before the component's own styles. */
export const text = stylex.create({
  display: {
    fontSize: { default: fontSizes.display, [media.narrow]: fontSizes.displayNarrow },
    fontWeight: fontWeights.bold,
    lineHeight: { default: lineHeights.display, [media.narrow]: lineHeights.displayNarrow },
  },
  title: { fontSize: fontSizes.title, fontWeight: fontWeights.bold, lineHeight: lineHeights.title },
  body: { fontSize: fontSizes.body, fontWeight: fontWeights.regular, lineHeight: lineHeights.body },
  label: { fontSize: fontSizes.body, fontWeight: fontWeights.bold, lineHeight: lineHeights.control },
  meta: { fontSize: fontSizes.meta, fontWeight: fontWeights.regular, lineHeight: lineHeights.meta },
  figure: { fontSize: fontSizes.figure, fontWeight: fontWeights.bold, lineHeight: lineHeights.figure },
  input: { fontSize: fontSizes.input, fontWeight: fontWeights.regular, lineHeight: lineHeights.title },
});
