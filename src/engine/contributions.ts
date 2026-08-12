/**
 * The contribution model.
 *
 * Derived statistics carry the reasons for their value, not just the value. A bare `ac: 17`
 * cannot answer "why?", which is the question players ask most at a table, and it makes a wrong
 * total impossible to attribute. Carrying contributions gives the UI free explanatory tooltips,
 * makes engine bugs point at their own cause, and gives `notes` somewhere honest to record
 * effects the engine cannot model rather than dropping them.
 *
 * This module is pure: no React, no I/O, no clock, no randomness.
 */

export type ContributionKind =
  | 'base'
  | 'ability'
  | 'proficiency'
  | 'item'
  | 'feature'
  | 'condition'
  | 'override'
  | 'manual';

export interface Contribution {
  source: string;
  value: number;
  kind: ContributionKind;
  /** Set when the contribution came from identifiable content, for click-through in the UI. */
  refIndex?: string;
}

export type AdvantageState = 'advantage' | 'disadvantage' | null;

export interface DerivedValue {
  total: number;
  contributions: Contribution[];
  advantage: AdvantageState;
  /** Prose the engine cannot express numerically. Surfaced on the stat, never swallowed. */
  notes: string[];
}

export function contribution(
  source: string,
  value: number,
  kind: ContributionKind,
  refIndex?: string,
): Contribution {
  return refIndex === undefined ? { source, value, kind } : { source, value, kind, refIndex };
}

/**
 * Build a derived value from contributions.
 *
 * An `override` contribution wins outright and replaces the sum. DMs routinely set a flat value
 * ("your AC is 15 in this form"), and the app must be able to represent the table's actual state
 * rather than insisting on its own arithmetic. The overridden contributions are retained so the
 * UI can still show what the computed value would have been.
 */
export function derive(
  contributions: Contribution[],
  opts: { advantage?: AdvantageState; notes?: string[] } = {},
): DerivedValue {
  const override = contributions.find((c) => c.kind === 'override');
  const total = override
    ? override.value
    : contributions.reduce((sum, c) => sum + c.value, 0);

  return {
    total,
    contributions,
    advantage: opts.advantage ?? null,
    notes: opts.notes ?? [],
  };
}

/**
 * Combine advantage states by 5e's rule: any advantage plus any disadvantage cancels to neither,
 * and multiple sources of the same kind do not stack.
 */
export function combineAdvantage(states: AdvantageState[]): AdvantageState {
  const hasAdv = states.includes('advantage');
  const hasDis = states.includes('disadvantage');
  if (hasAdv && hasDis) return null;
  if (hasAdv) return 'advantage';
  if (hasDis) return 'disadvantage';
  return null;
}

/** Format a modifier the way a character sheet does: always signed. */
export function formatModifier(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}
