// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CharacterCompanionDb, setDb } from '../../../persistence/db';
import { characters, inventory, customContent } from '../../../persistence/repositories';
import { ThemeProvider } from '../../../ui/theme/ThemeProvider';
import { RulesProvider } from '../../../rules/RulesProvider';
import { BundledRulesSource } from '../../../rules/BundledRulesSource';
import { CompositeRulesSource } from '../../../rules/CompositeRulesSource';
import { CharacterShell } from '../CharacterShell';
import { OverviewTab } from '../OverviewTab';
import { CombatTab } from '../CombatTab';
import { AbilitiesTab } from '../AbilitiesTab';
import { createCharacter, createInventoryItem } from '../../../domain/factories';
import { toCustomContent } from '../../custom/homebrewSchema';
import { emptyForm } from '../../custom/payloads';
import type { Character } from '../../../domain/types';

/**
 * Dashboard integration, against the real vendored SRD data.
 *
 * Covers the three things a player does constantly -- read a number and ask why, take damage,
 * and change a score mid-session -- plus the homebrew path, which is how most real characters
 * get a background at all.
 */

let counter = 0;

beforeEach(async () => {
  const fresh = new CharacterCompanionDb(`sheet-test-${counter++}`);
  setDb(fresh);
  await fresh.open();
});

afterEach(cleanup);

function renderSheet(id: string, tab: 'overview' | 'combat' | 'abilities' = 'overview') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RulesProvider source={new CompositeRulesSource(new BundledRulesSource(), customContent)}>
          <MemoryRouter initialEntries={[`/c/${id}/${tab}`]}>
            <Routes>
              <Route path="/c/:id" element={<CharacterShell />}>
                <Route index element={<Navigate to="overview" replace />} />
                <Route path="overview" element={<OverviewTab />} />
                <Route path="combat" element={<CombatTab />} />
                <Route path="abilities" element={<AbilitiesTab />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </RulesProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

async function seedFighter(over: Partial<Character> = {}) {
  return characters.save(
    createCharacter({
      identity: {
        name: 'Thorin Stonefist',
        pronouns: 'he/him',
        alignment: 'lawful-good',
        description: '',
        personalityTraits: [],
        ideals: [],
        bonds: [],
        flaws: [],
        backstory: '',
      },
      classes: [
        {
          classRef: { source: 'srd', index: 'fighter', name: 'Fighter' },
          subclassRef: null,
          level: 3,
          hitDiceSpent: 0,
          hitPointRolls: [6, 7],
        },
      ],
      race: {
        raceRef: { source: 'srd', index: 'dwarf', name: 'Dwarf' },
        subraceRef: null,
      },
      abilityScores: {
        base: { str: 16, dex: 12, con: 14, int: 10, wis: 12, cha: 8 },
        method: 'manual',
        racial: { str: 0, dex: 0, con: 2, int: 0, wis: 0, cha: 0 },
        asi: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
        misc: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
        override: {},
      },
      resources: {
        currentHp: 28,
        tempHp: 0,
        maxHpOverride: null,
        deathSaves: { successes: 0, failures: 0 },
        exhaustion: 0,
        conditions: [],
        usages: {},
        spellSlots: {},
        concentratingOn: null,
      },
      ...over,
    }),
  );
}

describe('character dashboard', () => {
  it('shows the character and its derived numbers', async () => {
    const character = await seedFighter();
    renderSheet(character.id);

    await waitFor(() => expect(screen.getByText('Thorin Stonefist')).toBeDefined());
    // STR 16 -> +3, and a level-3 character has a +2 proficiency bonus.
    expect(screen.getAllByText('16').length).toBeGreaterThan(0);
    expect(screen.getByText(/Dwarf · Fighter 3/)).toBeDefined();
  });

  it('explains where an ability score came from', async () => {
    const character = await seedFighter();
    renderSheet(character.id);

    await waitFor(() => expect(screen.getByText('Thorin Stonefist')).toBeDefined());
    // CON 14 base + 2 racial = 16, and the breakdown must say so.
    expect(screen.getByText('Racial bonus')).toBeDefined();
  });

  it('applies damage from the play bar, sparing temporary hit points first', async () => {
    const character = await seedFighter({
      resources: {
        currentHp: 28, tempHp: 5, maxHpOverride: null,
        deathSaves: { successes: 0, failures: 0 }, exhaustion: 0,
        conditions: [], usages: {}, spellSlots: {}, concentratingOn: null,
      },
    });
    renderSheet(character.id);

    await waitFor(() => expect(screen.getByText('Thorin Stonefist')).toBeDefined());

    fireEvent.change(screen.getByLabelText(/amount of damage or healing/i), {
      target: { value: '8' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Damage' }));

    await waitFor(async () => {
      const saved = await characters.get(character.id);
      // 5 absorbed by temporary hit points, 3 reaching real ones.
      expect(saved?.resources.tempHp).toBe(0);
      expect(saved?.resources.currentHp).toBe(25);
    });
  });

  it('never heals above the maximum', async () => {
    const character = await seedFighter();
    renderSheet(character.id);
    await waitFor(() => expect(screen.getByText('Thorin Stonefist')).toBeDefined());

    fireEvent.change(screen.getByLabelText(/amount of damage or healing/i), {
      target: { value: '999' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Heal' }));

    await waitFor(async () => {
      const saved = await characters.get(character.id);
      // d10 + 6 + 7 rolled, plus CON +3 x 3 levels = 32.
      expect(saved?.resources.currentHp).toBe(32);
    });
  });

  it('shows attack cards for equipped weapons', async () => {
    const character = await seedFighter();
    await inventory.save(
      createInventoryItem(character.id, {
        name: 'Warhammer',
        category: 'weapon',
        equipped: true,
        weapon: {
          damageDice: '1d8',
          damageType: 'Bludgeoning',
          versatileDice: '1d10',
          ranged: false,
          properties: ['Versatile'],
          categoryProficiency: 'martial-weapons',
          rangeNormal: 5,
          rangeLong: null,
        },
      }),
    );

    renderSheet(character.id, 'combat');
    await waitFor(() => expect(screen.getByText('Warhammer')).toBeDefined());
    expect(screen.getByText(/1d8\+3 bludgeoning/i)).toBeDefined();
  });
});

describe('ability adjustments', () => {
  it('applies a temporary bonus and flows it into every dependent number', async () => {
    const character = await seedFighter({
      abilityAdjustments: [
        {
          id: 'adj1',
          ability: 'str',
          kind: 'bonus',
          value: 4,
          duration: 'temporary',
          label: 'Enlarge',
          note: '1 minute',
          createdAt: Date.now(),
        },
      ],
    });

    renderSheet(character.id);
    await waitFor(() => expect(screen.getByText('Thorin Stonefist')).toBeDefined());

    // STR 16 + 4 = 20, and the breakdown names the cause.
    expect(screen.getAllByText('20').length).toBeGreaterThan(0);
    expect(screen.getByText('Enlarge')).toBeDefined();
    expect(screen.getByRole('button', { name: /adjust scores \(1 active\)/i })).toBeDefined();
  });

  it('lets a temporary change be added and then cleared', async () => {
    const character = await seedFighter();
    renderSheet(character.id);
    await waitFor(() => expect(screen.getByText('Thorin Stonefist')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /adjust scores/i }));
    fireEvent.click(screen.getByRole('button', { name: /add temporary change/i }));

    fireEvent.change(screen.getByLabelText(/what is causing it/i), {
      target: { value: "Bear's Endurance" },
    });
    fireEvent.change(screen.getByLabelText('Ability'), { target: { value: 'con' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(async () => {
      const saved = await characters.get(character.id);
      expect(saved?.abilityAdjustments).toHaveLength(1);
      expect(saved?.abilityAdjustments[0]?.label).toBe("Bear's Endurance");
      expect(saved?.abilityAdjustments[0]?.duration).toBe('temporary');
    });

    // Clearing temporary effects is one action, not one per entry.
    fireEvent.click(screen.getByRole('button', { name: /clear all temporary/i }));
    await waitFor(async () => {
      const saved = await characters.get(character.id);
      expect(saved?.abilityAdjustments).toHaveLength(0);
    });
  });

  it('keeps permanent changes when temporary ones are cleared', async () => {
    const character = await seedFighter({
      abilityAdjustments: [
        { id: 'p', ability: 'str', kind: 'set', value: 21, duration: 'permanent', label: 'Belt', note: '', createdAt: 1 },
        { id: 't', ability: 'dex', kind: 'bonus', value: 2, duration: 'temporary', label: 'Spell', note: '', createdAt: 2 },
      ],
    });

    renderSheet(character.id);
    await waitFor(() => expect(screen.getByText('Thorin Stonefist')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /adjust scores/i }));
    fireEvent.click(screen.getByRole('button', { name: /clear all temporary/i }));

    await waitFor(async () => {
      const saved = await characters.get(character.id);
      expect(saved?.abilityAdjustments).toHaveLength(1);
      expect(saved?.abilityAdjustments[0]?.label).toBe('Belt');
    });
  });
});

describe('stat overrides', () => {
  it('overrides armour class and marks it as no longer calculated', async () => {
    const character = await seedFighter();
    renderSheet(character.id);
    await waitFor(() => expect(screen.getByText('Thorin Stonefist')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /override stats/i }));
    fireEvent.change(screen.getByLabelText('Armour class'), { target: { value: '21' } });

    await waitFor(async () => {
      const saved = await characters.get(character.id);
      expect(saved?.statOverrides.armorClass).toBe(21);
    });

    // The play bar shows the overridden value, with a marker.
    await waitFor(() => expect(screen.getByText('21')).toBeDefined());
  });

  it('restores the calculated value when an override is cleared', async () => {
    const character = await seedFighter({
      statOverrides: {
        armorClass: 25, initiative: null, speed: null, proficiencyBonus: null,
        passivePerception: null, spellSaveDc: null, spellAttackBonus: null,
      },
    });
    renderSheet(character.id);
    await waitFor(() => expect(screen.getByText('Thorin Stonefist')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /override stats \(1\)/i }));
    fireEvent.click(screen.getByRole('button', { name: /clear all overrides/i }));

    await waitFor(async () => {
      const saved = await characters.get(character.id);
      expect(saved?.statOverrides.armorClass).toBeNull();
    });
  });
});

describe('combat tab', () => {
  it('restores hit points and reduces exhaustion on a long rest', async () => {
    const character = await seedFighter({
      resources: {
        currentHp: 4, tempHp: 3, maxHpOverride: null,
        deathSaves: { successes: 1, failures: 2 }, exhaustion: 2,
        conditions: [], usages: {}, spellSlots: {}, concentratingOn: null,
      },
    });

    renderSheet(character.id, 'combat');
    await waitFor(() => expect(screen.getByRole('button', { name: /long rest/i })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /long rest/i }));

    await waitFor(async () => {
      const saved = await characters.get(character.id);
      expect(saved?.resources.currentHp).toBe(32);
      expect(saved?.resources.tempHp).toBe(0);
      expect(saved?.resources.exhaustion).toBe(1);
      expect(saved?.resources.deathSaves).toEqual({ successes: 0, failures: 0 });
    });
  });

  it('shows death saves only when the character is down', async () => {
    const up = await seedFighter();
    const { unmount } = renderSheet(up.id, 'combat');
    await waitFor(() => expect(screen.getByText('Rests')).toBeDefined());
    expect(screen.queryByText('Death saves')).toBeNull();
    unmount();

    const down = await seedFighter({
      resources: {
        currentHp: 0, tempHp: 0, maxHpOverride: null,
        deathSaves: { successes: 0, failures: 0 }, exhaustion: 0,
        conditions: [], usages: {}, spellSlots: {}, concentratingOn: null,
      },
    });
    renderSheet(down.id, 'combat');
    await waitFor(() => expect(screen.getByText('Death saves')).toBeDefined());
  });

  it('toggles a condition from the real SRD list', async () => {
    const character = await seedFighter();
    renderSheet(character.id, 'combat');

    await waitFor(() => expect(screen.getByRole('button', { name: /Poisoned/ })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Poisoned/ }));

    await waitFor(async () => {
      const saved = await characters.get(character.id);
      expect(saved?.resources.conditions.map((c) => c.index)).toContain('poisoned');
    });
  });

  it('spends a hit die', async () => {
    const character = await seedFighter();
    renderSheet(character.id, 'combat');

    await waitFor(() => expect(screen.getByText(/3 of 3 remaining/)).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /spend one/i }));

    await waitFor(async () => {
      const saved = await characters.get(character.id);
      expect(saved?.classes[0]?.hitDiceSpent).toBe(1);
    });
  });
});

describe('abilities tab', () => {
  it('lists real class features and marks ones the engine does not model', async () => {
    const character = await seedFighter();
    renderSheet(character.id, 'abilities');

    await waitFor(() => expect(screen.getByText('Second Wind')).toBeDefined());
    // Second Wind is prose-only, so the player is told they must track it.
    expect(screen.getAllByText('Manual').length).toBeGreaterThan(0);
  });

  it('filters features by search', async () => {
    const character = await seedFighter();
    renderSheet(character.id, 'abilities');

    await waitFor(() => expect(screen.getByText('Second Wind')).toBeDefined());
    fireEvent.change(screen.getByLabelText(/search features/i), {
      target: { value: 'darkvision' },
    });

    await waitFor(() => expect(screen.queryByText('Second Wind')).toBeNull());
    expect(screen.getByText('Darkvision')).toBeDefined();
  });
});

describe('custom backgrounds reach the sheet', () => {
  it('grants skill proficiencies from a homebrew background', async () => {
    // The realistic case: the SRD has no Soldier, so the player writes one.
    const soldier = toCustomContent({
      kind: 'background',
      name: 'Soldier',
      description: 'You served in an army.',
      basedOn: null,
      payload: {},
      effects: [],
      form: {
        ...emptyForm(),
        name: 'Soldier',
        featureName: 'Military Rank',
        featureDesc: 'Soldiers still recognise your authority.',
        skillProficiencies: ['athletics', 'intimidation'],
      },
    });
    await customContent.save(soldier);

    const character = await seedFighter({
      background: {
        ref: { source: 'custom', index: 'custom:soldier', name: 'Soldier' },
        feature: { name: 'Military Rank', desc: ['Soldiers still recognise your authority.'] },
      },
      proficiencies: [
        { ref: { source: 'srd', index: 'skill-athletics', name: 'Athletics' }, from: 'background', expertise: false },
        { ref: { source: 'srd', index: 'skill-intimidation', name: 'Intimidation' }, from: 'background', expertise: false },
      ],
    });

    renderSheet(character.id);
    await waitFor(() => expect(screen.getByText('Thorin Stonefist')).toBeDefined());

    // Proficiency must actually change the modifier, not merely be listed.
    const athletics = screen.getByText('Athletics').closest('details');
    expect(athletics?.textContent).toMatch(/\+5/); // STR +3 plus proficiency +2
  });

  it('shows a homebrew background feature in the abilities tab', async () => {
    const character = await seedFighter({
      background: {
        ref: { source: 'custom', index: 'custom:soldier', name: 'Soldier' },
        feature: { name: 'Military Rank', desc: ['Soldiers still recognise your authority.'] },
      },
    });

    renderSheet(character.id, 'abilities');
    await waitFor(() => expect(screen.getByText('Military Rank')).toBeDefined());
    expect(screen.getByText('Soldier')).toBeDefined();
  });
});
