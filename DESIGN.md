# Emotionizer — Design System

Editorial, typographic, calm. This is a design-journal tool, not a toy. Every decision below exists to keep the interface legible, intentional, and free of generic AI-app slop.

## 1. Principles

1. **Typography is the interface.** The emotion word is the hero. Chrome is secondary.
2. **One neutral canvas.** Subtle temperature shifts per emotion, no rainbow states.
3. **Asymmetry with discipline.** Off-center anchors, strict baseline, generous margins.
4. **Motion as punctuation.** Micro-timings, spring curves, always dismissible by `prefers-reduced-motion`.
5. **Refuse ornament.** No emoji. No gradients for decoration. No blur blobs. No glass. No sparkles.

## 2. Type system

Two families. That is the whole system.

| Role | Family | Weights | Usage |
|---|---|---|---|
| Display | `Fraunces` (variable, opsz) | 400, 500 | Emotion word, large headings |
| Text / UI | `Inter` (variable) | 400, 500, 600 | Descriptors, input, buttons, meta |

Fallback stack: `Fraunces, 'EB Garamond', Georgia, serif` and `Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`.

Scale (desktop; mobile scales down ~0.82×):

- `display-xl` — 128px / 1.0 / -0.03em — emotion word
- `display-l` — 72px / 1.05 / -0.02em — fallback hero
- `body-l` — 20px / 1.5 / 0 — descriptor line
- `body` — 16px / 1.55 / 0 — input, meta
- `micro` — 12px / 1.4 / 0.04em / uppercase — labels, attribution

Small-caps only where semantically a label. Never fake small-caps — use `font-feature-settings: 'smcp'` on Fraunces.

## 3. Color

One palette, two modes. Accents pull toward the current emotion's v/a coordinates — *subtly*, within a narrow hue window, never overwhelming the text.

### Tokens

```
--ink-900: #111111   /* primary text on light */
--ink-700: #3a3a3a
--ink-500: #6b6b6b   /* meta, attribution */
--paper:   #f6f3ed   /* warm off-white canvas */
--paper-2: #efeae0   /* pill bg, subtle cards */
--rule:    #00000014 /* hairlines */

/* dark mode */
--ink-900-dark: #f2ece0
--ink-700-dark: #c4bfb4
--ink-500-dark: #8f8a7f
--paper-dark:   #141311
--paper-2-dark: #1c1a17
--rule-dark:    #ffffff14
```

### Accent (emotion-driven)

Computed at runtime from the generated temperature / saturation / brightness descriptors. Hue cap is ±30° of the page's base warm axis so the canvas never goes neon.

```
temperature: warm   → hue 28°
temperature: cold   → hue 210°
temperature: neutral→ hue 40° (very low sat)

saturation: highly saturated → chroma 0.10
saturation: saturated        → chroma 0.06
saturation: desaturated      → chroma 0.03
saturation: very desaturated → chroma 0.015

brightness modulates lightness within the canvas palette (±8% L).
```

Use OKLCH for interpolation so shifts are perceptually even. Transition `background-color` and `color` at 400ms ease-out when the selection changes.

## 4. Layout

Single column, center-anchored on the page but left-aligned internally. One 720px content column desktop, 88vw mobile with 24px side padding.

Vertical rhythm in 8px units. Baseline grid anchored at 32px from top.

Zones top→bottom:

1. **Title strip** — 40px tall, `EMOTIONIZER` in `micro` style, uppercase, left-aligned. Tiny hairline rule below.
2. **Input** — 96px tall. Full width. Caret, autocomplete ghost, and pills all live here. Bottom border hairline only (no box).
3. **Emotion word** — `display-xl`, left-aligned, first letter sits exactly on the input's left edge. 64px above, 32px below. Off-center by ~8% of the column on desktop (overhangs 8% into the left margin for texture).
4. **Descriptor line** — `body-l`, separator is ` · ` (space-middot-space). Wraps naturally; soft-wrap at descriptor boundaries.
5. **Attribution + Copy row** — flex row. Left: attribution in `micro`, `--ink-500`. Right: `Copy prompt` button.
6. **Axis readout** (disclosure, collapsed by default) — dots on a rule for the 9 axes.

## 5. Motion

All durations in ms. All easings CSS cubic-beziers named for the stack.

- `spring-soft` — `cubic-bezier(0.22, 1, 0.36, 1)` — pill insert/remove, button press.
- `ease-ink` — `cubic-bezier(0.4, 0, 0.1, 1)` — color canvas, text opacity.

| Event | Property | Duration | Easing |
|---|---|---|---|
| New descriptor line | opacity + y(4px) per word, staggered 20ms | 200 total | ease-ink |
| Pill insert | scale(0.9→1), opacity 0→1 | 200 | spring-soft |
| Pill remove | opacity 1→0, scale 1→0.92 | 140 | ease-ink |
| Canvas color shift | background-color, color | 400 | ease-ink |
| Button press | scale(1→0.98→1) | 120 | spring-soft |
| Autocomplete ghost | opacity 0→1 | 80 | ease-ink |

Gate everything behind `@media (prefers-reduced-motion: no-preference)`. In reduced-motion, only opacity transitions remain, all ≤80ms.

## 6. Components

### Input
- Single `<input type="text">`, unstyled-looking. Borderless except for bottom hairline.
- Pills render inside the input using a container that wraps the real input. Backspace on empty input removes the last pill.
- Autocomplete ghost: inline, gray, shows after current token. Tab/Enter accepts.

### Pill
- `--paper-2` background, `--ink-900` text, 4px 10px padding, 999px radius, tiny ✕ (use × character, not an emoji) on hover.
- Do NOT use colored pills per emotion family. The canvas does the color work.

### Copy button
- Sans, `body`, 500 weight. Underline offset 3px, underline thickness 1px. No box. On click, underline briefly thickens to 2px and label flips to "Copied" for 1200ms.

### Axis readout
- Nine rows, each: label (`micro`), dot on a 240px rule showing position. Smooth tween on update.

## 7. Accessibility

- Contrast AA minimum in every canvas state. Accent-driven backgrounds are tested against text at minimum contrast.
- Focus ring: 2px `--ink-900` outline, 2px offset, no shadow.
- All interaction reachable by keyboard: input → autocomplete → Copy → disclosure.
- `prefers-reduced-motion` respected (see §5).
- Emotion word has `aria-live="polite"` so screen readers announce changes.

## 8. What's explicitly forbidden

- Emoji anywhere in UI copy.
- Drop shadows on cards.
- Linear multi-stop gradients as backgrounds.
- Glassmorphism / backdrop blur.
- More than two type families.
- Stock "AI" iconography (stars, sparkles, orbit rings).
- Bold weights under 500 as a decorative choice.
- Color-coding emotions into rainbow swatches.
