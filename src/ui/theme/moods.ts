/**
 * Character moods.
 *
 * Theming is constrained by construction rather than exposed as a colour picker. Each mood
 * varies only hue and chroma; the lightness anchors are fixed, so switching mood cannot change
 * contrast against a surface. Every mood is contrast-checked in CI (`moods.test.ts`), and a
 * mood that fails does not ship.
 *
 * Colour is always decorative here. State -- proficient, equipped, private, bloodied -- is
 * carried by shape, icon or text as well, so the interface still works for colour-blind users
 * and in the dim light of an actual game table.
 */

export interface Mood {
  id: string;
  name: string;
  /** OKLCH hue angle in degrees. */
  hue: number;
  /** OKLCH chroma. Kept low enough that no mood turns neon at either theme's lightness. */
  chroma: number;
  description: string;
}

export const MOODS: Mood[] = [
  { id: 'default', name: 'Ink', hue: 250, chroma: 0.03, description: 'Neutral slate and ink' },
  { id: 'arcane', name: 'Arcane', hue: 285, chroma: 0.11, description: 'Violet, starlight, secrets' },
  { id: 'martial', name: 'Martial', hue: 25, chroma: 0.11, description: 'Iron, rust, banners' },
  { id: 'divine', name: 'Divine', hue: 85, chroma: 0.11, description: 'Gold, dawn, conviction' },
  { id: 'primal', name: 'Primal', hue: 145, chroma: 0.10, description: 'Moss, bark, wild places' },
  { id: 'shadow', name: 'Shadow', hue: 315, chroma: 0.08, description: 'Smoke, plum, quiet knives' },
  { id: 'fey', name: 'Fey', hue: 190, chroma: 0.10, description: 'Glass, water, strange bargains' },
  { id: 'infernal', name: 'Infernal', hue: 15, chroma: 0.13, description: 'Ember, brass, old debts' },
];

export const DEFAULT_MOOD = 'default';

/**
 * Fixed lightness anchors, in OKLCH L.
 *
 * These are the reason a mood cannot break the interface: hue and chroma move, lightness never
 * does, so the contrast ratio against a given surface is stable across every mood.
 */
export const LIGHTNESS = {
  light: { accent: 0.45, accentHover: 0.4, accentSubtle: 0.94, onAccent: 0.99 },
  dark: { accent: 0.72, accentHover: 0.78, accentSubtle: 0.26, onAccent: 0.18 },
} as const;

export type ThemeMode = 'light' | 'dark';

export function moodById(id: string): Mood {
  return MOODS.find((m) => m.id === id) ?? MOODS[0]!;
}

/** Suggest a mood from a class, so a new character arrives already themed. */
export function suggestMood(classIndex: string | null | undefined): string {
  const map: Record<string, string> = {
    wizard: 'arcane',
    sorcerer: 'arcane',
    fighter: 'martial',
    barbarian: 'martial',
    monk: 'martial',
    cleric: 'divine',
    paladin: 'divine',
    druid: 'primal',
    ranger: 'primal',
    rogue: 'shadow',
    bard: 'fey',
    warlock: 'infernal',
  };
  return (classIndex && map[classIndex]) || DEFAULT_MOOD;
}

export function oklch(l: number, c: number, h: number): string {
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`;
}

/** CSS custom properties for a mood in a given theme. Applied on the character shell element. */
export function moodVariables(moodId: string, mode: ThemeMode): Record<string, string> {
  const mood = moodById(moodId);
  const l = LIGHTNESS[mode];
  return {
    '--accent': oklch(l.accent, mood.chroma, mood.hue),
    '--accent-hover': oklch(l.accentHover, mood.chroma, mood.hue),
    '--accent-subtle': oklch(l.accentSubtle, mood.chroma * 0.5, mood.hue),
    '--on-accent': oklch(l.onAccent, 0.01, mood.hue),
  };
}
