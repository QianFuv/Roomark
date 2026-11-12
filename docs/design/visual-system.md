# Visual system

One set of fonts, type roles, spacing and icon rules for every screen and tier (mobile < 768 px,
narrow 768–1279 px, wide ≥ 1280 px). Colors are in [t3-soft.json](t3-soft.json). Tokens live in
`frontend/src/styles/tokens.stylex.tsx`; the type roles in `frontend/src/ui/typography.tsx`; the
icon sizes in `frontend/src/ui/icon.tsx`.

## Font

`JetBrainsLxgwNerdMono` (JetBrains Mono + LXGW WenKai Mono, OFL-1.1), loaded the same way as
LitRadar: the cn-font-split outputs `frontend/assets/JetBrainsLxgwNerdMono-Regular/` and
`frontend/assets/JetBrainsLxgwNerdMono-Bold/` (`result.css` plus unicode-range WOFF2 chunks) are
`@import`ed by `src/styles/base.css` and applied as `'JetBrainsLxgwNerdMono', monospace`. The
browser downloads only the chunks a page uses.

Only weights 400 and 700 exist. Every style uses one of them (`fontWeights.regular` /
`fontWeights.bold`), and `font-synthesis-weight: none` keeps the browser from faking others. The
font is monospaced with a 2:1 CJK width, so it reads about one step larger than a proportional
font at the same pixel size; the scale below is calibrated for that. The QR poster (PNG and PDF)
draws with the same font after loading the glyphs it needs.

## Type roles

Each text element uses exactly one role, which fixes size, line height and weight. Components add
only color. Nothing below a page title outweighs it.

| Role      | Size                        | Line height             | Weight | Use                                                                                      |
| --------- | --------------------------- | ----------------------- | ------ | ---------------------------------------------------------------------------------------- |
| `display` | 22 px (mobile), 24 px (≥ 768) | 30 px, 32 px          | 700    | Page title only (`PageHeader`)                                                           |
| `title`   | 16 px                       | 24 px                   | 700    | Section, card, sheet and dialog titles; status headline; empty-state title; brand        |
| `body`    | 14 px                       | 22 px                   | 400    | Running text, notices, menu items, table cells, secondary row text                       |
| `label`   | 14 px                       | 20 px                   | 700    | Buttons, tabs, segmented options, field labels, list-row primary text, inline emphasis   |
| `meta`    | 12 px                       | 18 px                   | 400    | Hints, captions, badges, times beside rows, axis labels, calendar event text, field errors |
| `figure`  | 20 px                       | 28 px                   | 700    | Standalone numbers: stat values, passcode and room-code boxes                            |
| `input`   | 16 px                       | 24 px                   | 400    | Text inputs and textareas only (16 px stops iOS from zooming)                            |

Numbers need no `tabular-nums`: the font is monospaced. No `letterSpacing`.

## Spacing

4-based scale (`space.*`):

| Token | xxs | xs | sm | md | lg | xl | xxl |
| ----- | --- | -- | -- | -- | -- | -- | --- |
| px    | 2   | 4  | 8  | 12 | 16 | 24 | 32  |

Semantic aliases (use these where one fits):

| Token                                | Value                           | Use                                       |
| ------------------------------------ | ------------------------------- | ----------------------------------------- |
| `pagePadding` / `Narrow` / `Wide`    | 16 / 24 / 32 px                 | Page padding per tier                     |
| `sectionGap` / `sectionGapWide`      | 16 / 24 px                      | Between sections and page columns         |
| `cardPadding`                        | 16 px (all tiers)               | Inside cards, panels, sheets              |
| `cardGap`                            | 12 px                           | Between blocks inside a card              |
| `controlGap`                         | 8 px                            | Between adjacent buttons and controls     |
| `rowPaddingBlock` / `rowPaddingInline` | 8 / 12 px                     | List rows (agenda, bookings, people)      |

Heading to its content: `sm` (8 px). Icon to text inside a control: `sm`; icon to meta text: `xs`.

Control heights (`sizes.*`): `controlSmall` 36 px (secondary controls in dense desktop headers),
`control` 44 px (default; the touch-target minimum), `controlLarge` 48 px (full-width form submits
and two-line buttons). Buttons come in `sm` / `md` / `lg` with these heights; all use the `label`
role. There is no larger button.

## Icons

lucide-react only. One stroke width app-wide (1.75, set by `IconDefaults` at the root); never pass
`strokeWidth`. Size by context (`ICON_SIZE`):

| Context                                     | Size  |
| ------------------------------------------- | ----- |
| Inline with `meta` text                     | 14 px |
| Buttons, inputs, menus, inline with body (default; omit `size`) | 16 px |
| Navigation items and tabs                   | 18 px |
| Empty and error states                      | 32 px |

Keep icons that aid scanning (navigation, tabs, primary actions, notice tone, repeat markers).
Drop decorative icons next to headings.

## Navigation

There is no back arrow. Back is the history: the Android back gesture, the browser back button,
mouse side buttons and Alt+←. Back closes the top overlay first, room tabs are history entries,
and an unsaved booking form asks before it is discarded. Every page is also reachable and
leavable through visible navigation (room tabs, admin tabs or sidebar, brand link, account menu).
