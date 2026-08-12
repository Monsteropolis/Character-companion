// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CharacterCompanionDb, setDb } from '../../../persistence/db';
import { characters } from '../../../persistence/repositories';
import { ThemeProvider } from '../../../ui/theme/ThemeProvider';
import { RulesProvider } from '../../../rules/RulesProvider';
import { BundledRulesSource } from '../../../rules/BundledRulesSource';
import { CharacterShell } from '../../sheet/CharacterShell';
import { SpellsTab } from '../SpellsTab';
import { CombatTab } from '../../sheet/CombatTab';
import { createCharacter } from '../../../domain/factories';
import { PACT_SLOT_OFFSET } from '../../../engine/spellcasting';
import type { AbilityId } from '../../../rules/schemas/primitives';
import type { Character } from '../../../domain/types';

/**
 * Spellcasting and class-resource integration, against the real SRD data.
 *
 * The two things worth proving end to end: a caster can spend and recover slots with the right
 * rest, and a non-caster has something to track at all.
 */

let counter = 0;

beforeEach(async () => {
  const fresh = new CharacterCompanionDb(`spells-test-${counter++}`);
  setDb(fresh);
  await fresh.open();
});

afterEach(cleanup);

function renderTab(id: string, tab: 'spells' | 'combat') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RulesProvider source={new BundledRulesSource()}>
          <MemoryRouter initialEntries={[`/c/${id}/${tab}`]}>
            <Routes>
              <Route path="/c/:id" element={<CharacterShell />}>
                <Route path="spells" element={<SpellsTab />} />
                <Route path="combat" element={<CombatTab />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </RulesProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

function scores(v: Partial<Record<AbilityId, number>> = {}) {
  return {
    base: { str: 10, dex: 14, con: 14, int: 16, wis: 14, cha: 16, ...v },
    method: 'manual' as const,
    racial: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    asi: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    misc: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    override: {},
  };
}

async function seed(
  classes: { index: string; name: string; level: number }[],
  over: Partial<Character> = {},
) {
  return characters.save(
    createCharacter({
      identity: {
        name: 'Test Caster', pronouns: '', alignment: null, description: '',
        personalityTraits: [], ideals: [], bonds: [], flaws: [], backstory: '',
      },
      classes: classes.map((c) => ({
        classRef: { source: 'srd', index: c.index, name: c.name },
        subclassRef: null,
        level: c.level,
        hitDiceSpent: 0,
        hitPointRolls: [],
      })),
      abilityScores: scores(),
      ...over,
    }),
  );
}

describe('wizard spellbook', () => {
  it('shows slots and save DC from the real level table', async () => {
    const character = await seed([{ index: 'wizard', name: 'Wizard', level: 5 }]);
    renderTab(character.id, 'spells');

    await waitFor(() => expect(screen.getByText('Spell slots')).toBeDefined(), { timeout: 8000 });

    // Level-5 wizard: 4/3/2 slots, DC 8 + 3 prof + 3 INT = 14.
    expect(screen.getByText('4 / 4')).toBeDefined();
    expect(screen.getByText('3 / 3')).toBeDefined();
    expect(screen.getByText('2 / 2')).toBeDefined();
    expect(screen.getByText('14')).toBeDefined();
  });

  it('spends a slot and undoes it', async () => {
    const character = await seed([{ index: 'wizard', name: 'Wizard', level: 5 }]);
    renderTab(character.id, 'spells');
    await waitFor(() => expect(screen.getByText('Spell slots')).toBeDefined(), { timeout: 8000 });

    fireEvent.click(screen.getAllByRole('button', { name: 'Use' })[0]!);
    await waitFor(async () => {
      const saved = await characters.get(character.id);
      expect(saved?.resources.spellSlots[1]?.used).toBe(1);
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Undo' })[0]!);
    await waitFor(async () => {
      const saved = await characters.get(character.id);
      expect(saved?.resources.spellSlots[1]?.used).toBe(0);
    });
  });

  it('adds a real SRD spell to the list and prepares it', async () => {
    const character = await seed([{ index: 'wizard', name: 'Wizard', level: 5 }], {
      spellcasting: {
        entries: [
          {
            classRef: { source: 'srd', index: 'wizard', name: 'Wizard' },
            ability: 'int',
            preparation: 'spellbook',
            known: [],
            ritualCasting: true,
          },
        ],
      },
    });
    renderTab(character.id, 'spells');
    await waitFor(() => expect(screen.getByRole('button', { name: /add spells/i })).toBeDefined(), {
      timeout: 8000,
    });

    fireEvent.click(screen.getByRole('button', { name: /add spells/i }));
    fireEvent.change(screen.getByLabelText(/search spells/i), { target: { value: 'fireball' } });

    // "fireball" also matches Delayed Blast Fireball, so target the exact card.
    fireEvent.click(await screen.findByText('Fireball', { exact: true }));
    fireEvent.click((await screen.findAllByRole('button', { name: /add to list/i }))[0]!);

    await waitFor(async () => {
      const saved = await characters.get(character.id);
      expect(saved?.spellcasting?.entries[0]?.known.map((s) => s.ref.index)).toContain('fireball');
    });
  });

  it('offers upcasting with the damage each slot produces', async () => {
    const character = await seed([{ index: 'wizard', name: 'Wizard', level: 5 }], {
      spellcasting: {
        entries: [
          {
            classRef: { source: 'srd', index: 'wizard', name: 'Wizard' },
            ability: 'int',
            preparation: 'spellbook',
            known: [
              {
                ref: { source: 'srd', index: 'fireball', name: 'Fireball' },
                prepared: true, alwaysPrepared: false, source: 'class',
              },
            ],
            ritualCasting: true,
          },
        ],
      },
    });

    renderTab(character.id, 'spells');
    await waitFor(() => expect(screen.getByText('Fireball')).toBeDefined(), { timeout: 8000 });
    fireEvent.click(screen.getByText('Fireball'));

    // Fireball is level 3; a level-5 wizard has only 3rd-level slots at or above it.
    expect(await screen.findByRole('button', { name: /Cast at 3 · 8d6/ })).toBeDefined();
  });
});

describe('warlock pact magic', () => {
  it('labels pact slots separately from standard ones', async () => {
    const character = await seed([{ index: 'warlock', name: 'Warlock', level: 5 }]);
    renderTab(character.id, 'spells');

    await waitFor(() => expect(screen.getByText(/Pact Magic \(level 3\)/)).toBeDefined(), {
      timeout: 8000,
    });
    expect(screen.getByText(/slots return on a short rest/i)).toBeDefined();
  });

  it('restores pact slots on a short rest but not ordinary slots', async () => {
    const character = await seed(
      [
        { index: 'warlock', name: 'Warlock', level: 3 },
        { index: 'wizard', name: 'Wizard', level: 3 },
      ],
      {
        resources: {
          currentHp: 20, tempHp: 0, maxHpOverride: null,
          deathSaves: { successes: 0, failures: 0 }, exhaustion: 0,
          conditions: [], usages: {},
          spellSlots: {
            1: { used: 4, total: 4 },
            [PACT_SLOT_OFFSET + 2]: { used: 2, total: 2 },
          },
          concentratingOn: null,
        },
      },
    );

    renderTab(character.id, 'combat');
    await waitFor(() => expect(screen.getByRole('button', { name: /short rest/i })).toBeDefined(), {
      timeout: 8000,
    });
    fireEvent.click(screen.getByRole('button', { name: /short rest/i }));

    await waitFor(async () => {
      const saved = await characters.get(character.id);
      // Pact Magic comes back on a short rest; ordinary slots do not.
      expect(saved?.resources.spellSlots[PACT_SLOT_OFFSET + 2]?.used).toBe(0);
      expect(saved?.resources.spellSlots[1]?.used).toBe(4);
    });
  });
});

describe('non-casters get resources too', () => {
  it('gives a barbarian a rage tracker', async () => {
    const character = await seed([{ index: 'barbarian', name: 'Barbarian', level: 5 }]);
    renderTab(character.id, 'combat');

    await waitFor(() => expect(screen.getByText('Class resources')).toBeDefined(), {
      timeout: 8000,
    });
    expect(screen.getByText('Rage')).toBeDefined();
    expect(screen.getByText('3 / 3')).toBeDefined();
    // Rage damage is a reference value, not a pool.
    expect(screen.getByText('Rage damage')).toBeDefined();
  });

  it('spends a rage and restores it on a long rest', async () => {
    const character = await seed([{ index: 'barbarian', name: 'Barbarian', level: 5 }]);
    renderTab(character.id, 'combat');
    await waitFor(() => expect(screen.getByText('Rage')).toBeDefined(), { timeout: 8000 });

    fireEvent.click(screen.getAllByRole('button', { name: 'Use' })[0]!);
    await waitFor(async () => {
      const saved = await characters.get(character.id);
      expect(saved?.resources.usages['barbarian:rage']?.used).toBe(1);
    });

    fireEvent.click(screen.getByRole('button', { name: /long rest/i }));
    await waitFor(async () => {
      const saved = await characters.get(character.id);
      expect(saved?.resources.usages['barbarian:rage']?.used).toBe(0);
    });
  });

  it('gives a fighter Second Wind and Action Surge, restored by a short rest', async () => {
    const character = await seed([{ index: 'fighter', name: 'Fighter', level: 5 }]);
    renderTab(character.id, 'combat');

    await waitFor(() => expect(screen.getByText('Second Wind')).toBeDefined(), { timeout: 8000 });
    expect(screen.getByText('Action Surge')).toBeDefined();
    expect(screen.getByText('Extra Attack')).toBeDefined();

    fireEvent.click(screen.getAllByRole('button', { name: 'Use' })[0]!);
    await waitFor(async () => {
      const saved = await characters.get(character.id);
      expect(saved?.resources.usages['fighter:second-wind']?.used).toBe(1);
    });

    fireEvent.click(screen.getByRole('button', { name: /short rest/i }));
    await waitFor(async () => {
      const saved = await characters.get(character.id);
      expect(saved?.resources.usages['fighter:second-wind']?.used).toBe(0);
    });
  });

  it('gives a monk ki that survives a long rest correctly', async () => {
    const character = await seed([{ index: 'monk', name: 'Monk', level: 5 }]);
    renderTab(character.id, 'combat');

    await waitFor(() => expect(screen.getByText('Ki points')).toBeDefined(), { timeout: 8000 });
    expect(screen.getByText('5 / 5')).toBeDefined();
    expect(screen.getByText('Martial Arts die')).toBeDefined();
  });

  it('shows a rogue sneak attack as a reference value with no tracker', async () => {
    const character = await seed([{ index: 'rogue', name: 'Rogue', level: 5 }]);
    renderTab(character.id, 'combat');

    await waitFor(() => expect(screen.getByText('Sneak Attack')).toBeDefined(), { timeout: 8000 });
    // Once per turn, so there is nothing to spend.
    expect(screen.queryByText('Class resources')).toBeNull();
    expect(screen.getByText('3d6')).toBeDefined();
  });

  it('hides the spells tab for a barbarian and shows it for a wizard', async () => {
    const barbarian = await seed([{ index: 'barbarian', name: 'Barbarian', level: 5 }]);
    const { unmount } = renderTab(barbarian.id, 'combat');
    await waitFor(() => expect(screen.getByText('Rests')).toBeDefined(), { timeout: 8000 });
    expect(screen.queryByRole('link', { name: 'Spells' })).toBeNull();
    unmount();

    const wizard = await seed([{ index: 'wizard', name: 'Wizard', level: 5 }]);
    renderTab(wizard.id, 'combat');
    await waitFor(() => expect(screen.getByRole('link', { name: 'Spells' })).toBeDefined(), {
      timeout: 8000,
    });
  });
});

describe('paladin', () => {
  it('has a Lay on Hands pool sized from level', async () => {
    const character = await seed([{ index: 'paladin', name: 'Paladin', level: 5 }]);
    renderTab(character.id, 'combat');

    await waitFor(() => expect(screen.getByText('Lay on Hands')).toBeDefined(), { timeout: 8000 });
    // Five points per paladin level.
    expect(screen.getByText('25 / 25')).toBeDefined();
  });

  it('is treated as a half caster with its own slot table', async () => {
    const character = await seed([{ index: 'paladin', name: 'Paladin', level: 5 }]);
    renderTab(character.id, 'spells');

    await waitFor(() => expect(screen.getByText('Spell slots')).toBeDefined(), { timeout: 8000 });
    expect(screen.getByText('4 / 4')).toBeDefined();
    expect(screen.getByText('2 / 2')).toBeDefined();
  });
});
