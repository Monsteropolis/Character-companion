import { describe, it, expect } from 'vitest';
import { MOODS, LIGHTNESS, suggestMood, moodById, moodVariables, type ThemeMode } from '../moods';
import { THEMES, STATUS } from '../tokens';
import { contrastRatio, WCAG_AA_TEXT, WCAG_AA_UI } from '../color';

/**
 * Accessibility gate for character-driven theming.
 *
 * Per-character theming is the feature most likely to quietly produce an unusable interface, so
 * every mood is measured against both themes here. A mood that fails these assertions fails CI
 * and does not ship -- which is what makes it safe to let a character change the palette at all.
 */

const MODES: ThemeMode[] = ['light', 'dark'];

describe('mood definitions', () => {
  it('has unique ids and names', () => {
    expect(new Set(MOODS.map((m) => m.id)).size).toBe(MOODS.length);
    expect(new Set(MOODS.map((m) => m.name)).size).toBe(MOODS.length);
  });

  it('keeps chroma within a range that stays in sRGB gamut', () => {
    for (const mood of MOODS) {
      expect(mood.chroma).toBeLessThanOrEqual(0.15);
      expect(mood.chroma).toBeGreaterThanOrEqual(0);
    }
  });

  it('falls back to the default mood for an unknown id', () => {
    expect(moodById('does-not-exist').id).toBe('default');
  });
});

describe.each(MODES)('contrast in %s theme', (mode) => {
  const theme = THEMES[mode];

  it('body text meets AA against every surface', () => {
    for (const surface of [theme.base, theme.raised, theme.overlay] as const) {
      expect(contrastRatio(theme.text, surface)).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
    }
  });

  it('muted text meets AA against base and raised surfaces', () => {
    for (const surface of [theme.base, theme.raised] as const) {
      expect(contrastRatio(theme.textMuted, surface)).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
    }
  });

  it('control borders meet the 3:1 non-text threshold against every surface', () => {
    // These identify inputs and toggles, so 1.4.11 applies to them.
    for (const surface of [theme.base, theme.raised, theme.overlay] as const) {
      expect(contrastRatio(theme.borderStrong, surface)).toBeGreaterThanOrEqual(WCAG_AA_UI);
    }
  });

  it('keeps decorative hairlines visible but recessive', () => {
    // Exempt from 1.4.11 as pure decoration, but still has to be perceptible as a divider.
    const ratio = contrastRatio(theme.border, theme.base);
    expect(ratio).toBeGreaterThan(1.2);
    expect(ratio).toBeLessThan(WCAG_AA_UI);
  });

  // The core guarantee: no character's chosen mood can drop below AA.
  it.each(MOODS.map((m) => [m.name, m] as const))(
    '%s accent meets the non-text threshold on base and raised surfaces',
    (_name, mood) => {
      const accent = { l: LIGHTNESS[mode].accent, c: mood.chroma, h: mood.hue };
      expect(contrastRatio(accent, theme.base)).toBeGreaterThanOrEqual(WCAG_AA_UI);
      expect(contrastRatio(accent, theme.raised)).toBeGreaterThanOrEqual(WCAG_AA_UI);
    },
  );

  it.each(MOODS.map((m) => [m.name, m] as const))(
    '%s keeps text legible on top of its own accent',
    (_name, mood) => {
      const accent = { l: LIGHTNESS[mode].accent, c: mood.chroma, h: mood.hue };
      const onAccent = { l: LIGHTNESS[mode].onAccent, c: 0.01, h: mood.hue };
      expect(contrastRatio(onAccent, accent)).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
    },
  );

  it.each(MOODS.map((m) => [m.name, m] as const))(
    '%s keeps body text legible on its subtle fill',
    (_name, mood) => {
      const subtle = { l: LIGHTNESS[mode].accentSubtle, c: mood.chroma * 0.5, h: mood.hue };
      expect(contrastRatio(theme.text, subtle)).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
    },
  );

  it('status colours meet the non-text threshold on the raised surface', () => {
    // HP red and death-save markers must read at a glance, in any mood.
    for (const [name, variants] of Object.entries(STATUS)) {
      const ratio = contrastRatio(variants[mode], theme.raised);
      expect(ratio, `${name} in ${mode}`).toBeGreaterThanOrEqual(WCAG_AA_UI);
    }
  });
});

describe('lightness anchors', () => {
  it('are fixed per theme, so changing mood cannot change contrast', () => {
    const arcane = moodVariables('arcane', 'dark');
    const martial = moodVariables('martial', 'dark');

    const lightnessOf = (css: string): string => css.split(' ')[0] ?? '';
    expect(lightnessOf(arcane['--accent'] ?? '')).toBe(lightnessOf(martial['--accent'] ?? ''));
  });

  it('emits the full set of accent variables', () => {
    const vars = moodVariables('fey', 'light');
    expect(Object.keys(vars).sort()).toEqual([
      '--accent',
      '--accent-hover',
      '--accent-subtle',
      '--on-accent',
    ]);
  });
});

describe('suggestMood', () => {
  it('maps classes to a fitting mood', () => {
    expect(suggestMood('wizard')).toBe('arcane');
    expect(suggestMood('warlock')).toBe('infernal');
    expect(suggestMood('rogue')).toBe('shadow');
  });

  it('falls back to the default for unknown or missing classes', () => {
    expect(suggestMood(null)).toBe('default');
    expect(suggestMood('artificer')).toBe('default');
  });

  it('only ever suggests a mood that exists', () => {
    const ids = new Set(MOODS.map((m) => m.id));
    for (const cls of ['wizard', 'fighter', 'cleric', 'druid', 'rogue', 'bard', 'warlock', 'x']) {
      expect(ids.has(suggestMood(cls))).toBe(true);
    }
  });
});
