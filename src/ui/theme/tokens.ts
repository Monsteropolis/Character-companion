import type { ThemeMode } from './moods';

/**
 * Structural tokens.
 *
 * These are the layer a character's mood may NOT touch: surfaces, the text ramp, borders.
 * Fixing them is what lets per-character theming be expressive without any character being able
 * to render the interface unreadable.
 *
 * Expressed as OKLCH components so the same values feed both the emitted CSS and the contrast
 * tests that gate them.
 */

export interface Swatch {
  l: number;
  c: number;
  h: number;
}

export interface ThemeSurfaces {
  /** Page background. */
  base: Swatch;
  /** Cards and panels sitting on the base. */
  raised: Swatch;
  /** Popovers, dialogs, the play bar. */
  overlay: Swatch;
  /** Primary body text. */
  text: Swatch;
  /** Secondary text: labels, captions, metadata. */
  textMuted: Swatch;
  /**
   * Decorative hairlines and dividers only.
   *
   * Exempt from WCAG 1.4.11, which applies to boundaries needed to *identify* a control. Kept
   * deliberately faint so panel edges recede; never used as the sole indicator of anything.
   */
  border: Swatch;
  /**
   * Boundaries that define an interactive control -- inputs, checkboxes, toggles, focus rings.
   *
   * These carry meaning, so they must clear 3:1 against the surface behind them. Using the
   * faint `border` here would leave form fields effectively invisible to low-vision users.
   */
  borderStrong: Swatch;
}

const NEUTRAL_HUE = 265;

export const THEMES: Record<ThemeMode, ThemeSurfaces> = {
  // Aged parchment rather than pure white: less glare under table lighting.
  light: {
    base: { l: 0.968, c: 0.008, h: 90 },
    raised: { l: 0.995, c: 0.004, h: 90 },
    overlay: { l: 1.0, c: 0, h: 90 },
    text: { l: 0.24, c: 0.02, h: NEUTRAL_HUE },
    textMuted: { l: 0.46, c: 0.02, h: NEUTRAL_HUE },
    border: { l: 0.86, c: 0.01, h: NEUTRAL_HUE },
    borderStrong: { l: 0.58, c: 0.02, h: NEUTRAL_HUE },
  },
  // Deep warm-dark, not black: black surfaces make portrait art look cut out.
  dark: {
    base: { l: 0.19, c: 0.015, h: NEUTRAL_HUE },
    raised: { l: 0.245, c: 0.017, h: NEUTRAL_HUE },
    overlay: { l: 0.29, c: 0.018, h: NEUTRAL_HUE },
    text: { l: 0.95, c: 0.006, h: NEUTRAL_HUE },
    textMuted: { l: 0.74, c: 0.012, h: NEUTRAL_HUE },
    border: { l: 0.38, c: 0.015, h: NEUTRAL_HUE },
    borderStrong: { l: 0.62, c: 0.02, h: NEUTRAL_HUE },
  },
};

export function swatchToCss(s: Swatch): string {
  return `oklch(${s.l.toFixed(3)} ${s.c.toFixed(3)} ${s.h.toFixed(1)})`;
}

export function themeVariables(mode: ThemeMode): Record<string, string> {
  const t = THEMES[mode];
  return {
    '--surface-base': swatchToCss(t.base),
    '--surface-raised': swatchToCss(t.raised),
    '--surface-overlay': swatchToCss(t.overlay),
    '--text': swatchToCss(t.text),
    '--text-muted': swatchToCss(t.textMuted),
    '--border': swatchToCss(t.border),
    '--border-strong': swatchToCss(t.borderStrong),
  };
}

/** Semantic colours for game state. Deliberately outside the mood system: HP red must stay red. */
export const STATUS = {
  danger: { light: { l: 0.5, c: 0.19, h: 25 }, dark: { l: 0.68, c: 0.17, h: 25 } },
  warning: { light: { l: 0.55, c: 0.14, h: 70 }, dark: { l: 0.75, c: 0.13, h: 75 } },
  success: { light: { l: 0.5, c: 0.13, h: 150 }, dark: { l: 0.72, c: 0.12, h: 150 } },
  info: { light: { l: 0.5, c: 0.12, h: 240 }, dark: { l: 0.72, c: 0.11, h: 240 } },
} as const satisfies Record<string, Record<ThemeMode, Swatch>>;
