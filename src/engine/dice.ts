/**
 * The one place randomness lives.
 *
 * Everything else in `engine/` is pure and deterministic (see RULES_ENGINE.md §1): it computes
 * *bonuses*, never results. Rolling is a separate concern, isolated here so it can be seeded in
 * tests and so no derivation ever picks up a hidden dependency on `Math.random`.
 */

/** One die of `sides` faces, 1..sides. Non-positive sides degrade to 1 rather than NaN. */
export function rollDie(sides: number, random: () => number = Math.random): number {
  const faces = Math.max(1, Math.floor(sides));
  return Math.floor(random() * faces) + 1;
}

/** `count` dice of `sides` faces, returned individually so a UI can show each one. */
export function rollDice(count: number, sides: number, random: () => number = Math.random): number[] {
  return Array.from({ length: Math.max(0, Math.floor(count)) }, () => rollDie(sides, random));
}
