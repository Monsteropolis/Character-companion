import { describe, it, expect, beforeEach } from 'vitest';
import { useDraft, initialDraft, stepComplete, firstIncompleteStep, STEPS } from '../draft';
import { commitDraft } from '../commitDraft';
import { emptyResolvedRules } from '../../../engine/derive';
import type { ContentRef } from '../../../domain/types';

/**
 * Draft tests.
 *
 * The property that matters most is that going back does not destroy unrelated work. A wizard
 * that silently drops a player's typed backstory when they change their mind about race is a
 * wizard people abandon, and the bug is invisible until it has already cost them the text.
 */

const ref = (index: string, name: string): ContentRef => ({ source: 'srd', index, name });

beforeEach(() => {
  useDraft.setState(initialDraft());
});

describe('step navigation', () => {
  it('advances and retreats without running off either end', () => {
    const { next, back } = useDraft.getState();
    expect(useDraft.getState().step).toBe('identity');

    back();
    expect(useDraft.getState().step).toBe('identity');

    next();
    expect(useDraft.getState().step).toBe('race');

    for (let i = 0; i < 20; i++) useDraft.getState().next();
    expect(useDraft.getState().step).toBe(STEPS[STEPS.length - 1]);
  });

  it('allows jumping directly to any step', () => {
    useDraft.getState().goto('equipment');
    expect(useDraft.getState().step).toBe('equipment');
  });
});

describe('completion tracking', () => {
  it('requires a name, race and class', () => {
    const state = useDraft.getState();
    expect(stepComplete(state, 'identity')).toBe(false);
    expect(firstIncompleteStep(state)).toBe('identity');

    state.setIdentity({ name: 'Lyra' });
    expect(stepComplete(useDraft.getState(), 'identity')).toBe(true);
    expect(firstIncompleteStep(useDraft.getState())).toBe('race');
  });
});

describe('non-destructive back-navigation', () => {
  it('retracts only race-derived selections when race changes', () => {
    const s = useDraft.getState();

    s.setIdentity({ name: 'Lyra', backstory: 'Raised by wolves.' });
    s.setRace(ref('half-elf', 'Half-Elf'));
    s.select('race:half-elf:ability-bonus', ['a', 'b']);
    s.setClass(ref('bard', 'Bard'));
    s.select('class:bard:prof:0', ['x', 'y']);

    // The player changes their mind about race only.
    useDraft.getState().setRace(ref('human', 'Human'));
    const after = useDraft.getState();

    expect(after.selections['race:half-elf:ability-bonus']).toBeUndefined();
    // Everything not derived from race survives untouched.
    expect(after.selections['class:bard:prof:0']).toEqual(['x', 'y']);
    expect(after.identity.backstory).toBe('Raised by wolves.');
    expect(after.classRef?.index).toBe('bard');
  });

  it('clears the subrace when the race changes', () => {
    const s = useDraft.getState();
    s.setRace(ref('elf', 'Elf'));
    s.setSubrace(ref('high-elf', 'High Elf'));
    expect(useDraft.getState().subraceRef?.index).toBe('high-elf');

    useDraft.getState().setRace(ref('dwarf', 'Dwarf'));
    // A High Elf subrace under Dwarf would be an invalid character.
    expect(useDraft.getState().subraceRef).toBeNull();
  });

  it('retracts class-derived equipment and spells when class changes', () => {
    const s = useDraft.getState();
    s.setClass(ref('wizard', 'Wizard'));
    s.setCantrips([ref('fire-bolt', 'Fire Bolt')]);
    s.setSpells([ref('magic-missile', 'Magic Missile')]);
    s.select('class:wizard:equipment:0', ['q']);
    s.setIdentity({ name: 'Keeps their name' });

    useDraft.getState().setClass(ref('fighter', 'Fighter'));
    const after = useDraft.getState();

    expect(after.cantrips).toEqual([]);
    expect(after.spells).toEqual([]);
    expect(after.selections['class:wizard:equipment:0']).toBeUndefined();
    expect(after.identity.name).toBe('Keeps their name');
  });

  it('does nothing when the same race is chosen again', () => {
    const s = useDraft.getState();
    s.setRace(ref('elf', 'Elf'));
    s.select('race:elf:languages', ['l1']);

    // Re-clicking the current race must not wipe the selections it granted.
    useDraft.getState().setRace(ref('elf', 'Elf'));
    expect(useDraft.getState().selections['race:elf:languages']).toEqual(['l1']);
  });

  it('keeps identity intact when background changes', () => {
    const s = useDraft.getState();
    s.setIdentity({ name: 'Lyra', ideals: ['Freedom above all'] });
    s.setBackground(ref('acolyte', 'Acolyte'));
    s.select('background:acolyte:languages', ['l']);

    useDraft.getState().setBackground(ref('custom:soldier', 'Soldier'));
    const after = useDraft.getState();

    expect(after.selections['background:acolyte:languages']).toBeUndefined();
    expect(after.identity.ideals).toEqual(['Freedom above all']);
  });
});

describe('ability score method switching', () => {
  it('lands on a legal spread for the new method', () => {
    const s = useDraft.getState();
    s.setAbilityMethod('manual');
    s.setScore('str', 20);
    expect(useDraft.getState().baseScores.str).toBe(20);

    // 20 is not buyable, so switching must not carry an illegal value across.
    useDraft.getState().setAbilityMethod('point-buy');
    expect(useDraft.getState().baseScores.str).toBe(8);
  });
});

describe('level bounds', () => {
  it('clamps to 1..20', () => {
    const s = useDraft.getState();
    s.setLevel(0);
    expect(useDraft.getState().level).toBe(1);
    s.setLevel(99);
    expect(useDraft.getState().level).toBe(20);
  });
});

describe('commitDraft', () => {
  function draftFor() {
    const s = useDraft.getState();
    s.setIdentity({ name: 'Thorin', pronouns: 'he/him' });
    s.setRace(ref('dwarf', 'Dwarf'));
    s.setClass(ref('fighter', 'Fighter'));
    s.setLevel(1);
    s.setAbilityMethod('manual');
    s.setScores({ str: 16, dex: 12, con: 15, int: 10, wis: 12, cha: 8 });
    return useDraft.getState();
  }

  const rules = {
    ...emptyResolvedRules(),
    hitDieByClass: { fighter: 10 },
    savingThrowsByClass: { fighter: ['str', 'con'] as ('str' | 'con')[] },
  };

  it('produces a character carrying the draft identity', () => {
    const { character } = commitDraft({
      draft: draftFor(),
      rules,
      racialBonuses: { con: 2 },
      proficiencies: [],
      items: [],
      spellcastingAbility: null,
    });

    expect(character.identity.name).toBe('Thorin');
    expect(character.classes[0]?.classRef.index).toBe('fighter');
    expect(character.abilityScores.racial.con).toBe(2);
    // Base and racial stay separate so a race change can retract cleanly.
    expect(character.abilityScores.base.con).toBe(15);
  });

  it('starts the character at full hit points', () => {
    const { character } = commitDraft({
      draft: draftFor(),
      rules,
      racialBonuses: { con: 2 },
      proficiencies: [],
      items: [],
      spellcastingAbility: null,
    });
    // d10 + CON 3 (15 base + 2 racial = 17) = 13.
    expect(character.resources.currentHp).toBe(13);
  });

  it('creates inventory items owned by the new character', () => {
    const { character, items } = commitDraft({
      draft: draftFor(),
      rules,
      racialBonuses: {},
      proficiencies: [],
      items: [
        { ref: ref('longsword', 'Longsword'), name: 'Longsword', quantity: 1 },
        { ref: null, name: "Grandfather's compass", quantity: 1 },
      ],
      spellcastingAbility: null,
    });

    expect(items).toHaveLength(2);
    expect(items.every((i) => i.characterId === character.id)).toBe(true);
    // A fully custom item is as valid as a rules-backed one.
    expect(items[1]?.ref).toBeNull();
  });

  it('records spellcasting only for casters that chose spells', () => {
    const s = useDraft.getState();
    s.setIdentity({ name: 'Elyn' });
    s.setClass(ref('wizard', 'Wizard'));
    s.setCantrips([ref('fire-bolt', 'Fire Bolt')]);

    const { character } = commitDraft({
      draft: useDraft.getState(),
      rules: { ...rules, hitDieByClass: { wizard: 6 } },
      racialBonuses: {},
      proficiencies: [],
      items: [],
      spellcastingAbility: 'int',
    });

    expect(character.spellcasting?.entries[0]?.ability).toBe('int');
    expect(character.spellcasting?.entries[0]?.preparation).toBe('spellbook');
    // Cantrips never occupy a prepared slot.
    expect(character.spellcasting?.entries[0]?.known[0]?.alwaysPrepared).toBe(true);
  });

  it('leaves spellcasting null for a non-caster', () => {
    const { character } = commitDraft({
      draft: draftFor(),
      rules,
      racialBonuses: {},
      proficiencies: [],
      items: [],
      spellcastingAbility: null,
    });
    expect(character.spellcasting).toBeNull();
  });

  it('carries proficiencies through with their origin recorded', () => {
    const { character } = commitDraft({
      draft: draftFor(),
      rules,
      racialBonuses: {},
      proficiencies: [
        { ref: ref('skill-athletics', 'Athletics'), from: 'class', expertise: false },
      ],
      items: [],
      spellcastingAbility: null,
    });
    expect(character.proficiencies[0]?.from).toBe('class');
  });
});
