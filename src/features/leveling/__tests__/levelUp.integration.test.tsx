// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CharacterCompanionDb, setDb } from '../../../persistence/db';
import { characters, levelUps } from '../../../persistence/repositories';
import { ThemeProvider } from '../../../ui/theme/ThemeProvider';
import { RulesProvider } from '../../../rules/RulesProvider';
import { BundledRulesSource } from '../../../rules/BundledRulesSource';
import { CharacterShell } from '../../sheet/CharacterShell';
import { LevelUpTab } from '../LevelUpTab';
import { createCharacter } from '../../../domain/factories';
import { totalAbilityScore } from '../../../engine/abilityScores';
import type { AbilityId } from '../../../rules/schemas/primitives';
import type { Character } from '../../../domain/types';

/**
 * The level-up flow end to end, against the real SRD tables.
 *
 * What matters here is the brief's promise that nothing irreversible happens quietly: the plan is
 * shown before anything is written, the write is recorded, and the record puts the character back
 * exactly where it was.
 */

let counter = 0;

beforeEach(async () => {
  const fresh = new CharacterCompanionDb(`levelup-test-${counter++}`);
  setDb(fresh);
  await fresh.open();
});

afterEach(cleanup);

function renderTab(id: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RulesProvider source={new BundledRulesSource()}>
          <MemoryRouter initialEntries={[`/c/${id}/level-up`]}>
            <Routes>
              <Route path="/c/:id" element={<CharacterShell />}>
                <Route path="level-up" element={<LevelUpTab />} />
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
    base: { str: 15, dex: 14, con: 14, int: 13, wis: 12, cha: 10, ...v },
    method: 'manual' as const,
    racial: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    asi: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    misc: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    override: {},
  };
}

async function seed(
  classes: { index: string; name: string; level: number; subclass?: [string, string] }[],
  over: Partial<Character> = {},
) {
  return characters.save(
    createCharacter({
      identity: {
        name: 'Test Adventurer', pronouns: '', alignment: null, description: '',
        personalityTraits: [], ideals: [], bonds: [], flaws: [], backstory: '',
      },
      classes: classes.map((c) => ({
        classRef: { source: 'srd', index: c.index, name: c.name },
        subclassRef: c.subclass
          ? { source: 'srd' as const, index: c.subclass[0], name: c.subclass[1] }
          : null,
        level: c.level,
        hitDiceSpent: 0,
        hitPointRolls: [],
      })),
      abilityScores: scores(),
      ...over,
    }),
  );
}

/** The tab is ready once the plan panel for the default class has rendered. */
async function ready(heading: RegExp) {
  await waitFor(() => expect(screen.getByRole('heading', { name: heading })).toBeDefined(), {
    timeout: 8000,
  });
}

describe('previewing a level', () => {
  it('shows the consequences before anything is written', async () => {
    const character = await seed([{ index: 'wizard', name: 'Wizard', level: 4 }]);
    renderTab(character.id);
    await ready(/Wizard 4 → 5/);

    // Level 5 wizard: proficiency rises to +3 and 3rd-level slots appear for the first time.
    expect(screen.getByText(/Proficiency bonus/)).toBeDefined();
    expect(screen.getByText(/New level 3 spell slots: 2/)).toBeDefined();

    // Nothing is saved until Confirm is pressed.
    const saved = await characters.get(character.id);
    expect(saved?.classes[0]?.level).toBe(4);
    expect(await levelUps.list(character.id)).toHaveLength(0);
  });

  it('offers the average hit points by default and states the constitution bonus', async () => {
    const character = await seed([{ index: 'fighter', name: 'Fighter', level: 1 }]);
    renderTab(character.id);
    await ready(/Fighter 1 → 2/);

    // d10 average is 6, CON 14 is +2, so 8.
    expect(screen.getByRole('option', { name: 'Take the average (6)' })).toBeDefined();
    expect(screen.getByText(/Hit points: \+8/)).toBeDefined();
  });
});

describe('committing a level', () => {
  it('writes the level, the hit points and an undoable record', async () => {
    const character = await seed([{ index: 'fighter', name: 'Fighter', level: 1 }]);
    renderTab(character.id);
    await ready(/Fighter 1 → 2/);

    fireEvent.click(screen.getByRole('button', { name: /Confirm level 2/ }));

    await waitFor(async () => {
      const saved = await characters.get(character.id);
      expect(saved?.classes[0]?.level).toBe(2);
    });

    // The confirmation has to survive the save: a refresh must not unmount the tab under it.
    expect(await screen.findByText(/Fighter is now level 2/)).toBeDefined();

    // ...and the panel rolls straight on to the next level rather than going blank.
    expect(await screen.findByRole('heading', { name: /Fighter 2 → 3/ })).toBeDefined();

    const records = await levelUps.list(character.id);
    expect(records).toHaveLength(1);
    expect(records[0]?.level).toBe(2);
    expect(records[0]?.hpGained).toBe(8);
    expect(records[0]?.hpMethod).toBe('average');
  });

  it('requires a subclass at the level the class gets one', async () => {
    const character = await seed([{ index: 'fighter', name: 'Fighter', level: 2 }]);
    renderTab(character.id);
    await ready(/Fighter 2 → 3/);

    const confirm = screen.getByRole('button', { name: /Confirm level 3/ });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Martial Archetype|Subclass/i), {
      target: { value: 'champion' },
    });

    await waitFor(() =>
      expect((screen.getByRole('button', { name: /Confirm level 3/ }) as HTMLButtonElement).disabled)
        .toBe(false),
    );
    fireEvent.click(screen.getByRole('button', { name: /Confirm level 3/ }));

    await waitFor(async () => {
      const saved = await characters.get(character.id);
      expect(saved?.classes[0]?.subclassRef?.index).toBe('champion');
    });
  });

  it('applies an ability score improvement at the level that grants one', async () => {
    const character = await seed([
      { index: 'wizard', name: 'Wizard', level: 3, subclass: ['evocation', 'Evocation'] },
    ]);
    renderTab(character.id);
    await ready(/Wizard 3 → 4/);

    // Neither path is preselected, so the level cannot be taken until one is chosen deliberately.
    const confirm = () => screen.getByRole('button', { name: /Confirm level 4/ }) as HTMLButtonElement;
    expect(confirm().disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /Raise ability scores/ }));
    fireEvent.change(screen.getByLabelText('Intelligence increase'), { target: { value: '2' } });

    await waitFor(() => expect(confirm().disabled).toBe(false));
    fireEvent.click(confirm());

    await waitFor(async () => {
      const saved = await characters.get(character.id);
      expect(saved).toBeDefined();
      expect(totalAbilityScore(saved!.abilityScores, 'int', [])).toBe(15);
    });

    const records = await levelUps.list(character.id);
    expect(records[0]?.abilityIncreases).toEqual([{ ability: 'int', amount: 2 }]);
  });
});

describe('undoing a level', () => {
  it('puts the character back exactly where it was', async () => {
    const character = await seed([{ index: 'fighter', name: 'Fighter', level: 1 }], {
      resources: { ...createCharacter().resources, currentHp: 12 },
    });
    const before = await characters.get(character.id);

    renderTab(character.id);
    await ready(/Fighter 1 → 2/);
    fireEvent.click(screen.getByRole('button', { name: /Confirm level 2/ }));

    await waitFor(() => expect(screen.getByText(/fighter level 2/i)).toBeDefined());

    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    fireEvent.click(await screen.findByRole('button', { name: /Undo level/ }));

    await waitFor(async () => {
      const after = await characters.get(character.id);
      expect(after?.classes[0]?.level).toBe(1);
      expect(after?.resources.currentHp).toBe(before?.resources.currentHp);
    });

    // The record goes with it, so the history cannot offer to undo the same level twice.
    expect(await levelUps.list(character.id)).toHaveLength(0);
  });
});

describe('multiclassing', () => {
  it('warns about unmet prerequisites without blocking the level', async () => {
    // CHA 10 is well short of the 13 a warlock needs, and the fighter's own STR 15 is fine.
    const character = await seed([{ index: 'fighter', name: 'Fighter', level: 3, subclass: ['champion', 'Champion'] }]);
    renderTab(character.id);
    await ready(/Fighter 3 → 4/);

    fireEvent.change(screen.getByLabelText(/Advance which class/), {
      target: { value: 'warlock' },
    });

    await ready(/Warlock 0 → 1 \(new class\)/);
    expect(screen.getByText(/normally requires CHA 13; this character has 10/)).toBeDefined();

    // A warlock chooses its patron at level 1, so that is still required...
    const confirm = () => screen.getByRole('button', { name: /Confirm level 1/ }) as HTMLButtonElement;
    expect(confirm().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Otherworldly Patron|Subclass/i), {
      target: { value: 'fiend' },
    });

    // ...but the unmet prerequisite is only a warning: the DM may have ruled otherwise.
    await waitFor(() => expect(confirm().disabled).toBe(false));
    fireEvent.click(confirm());

    await waitFor(async () => {
      const saved = await characters.get(character.id);
      expect(saved?.classes).toHaveLength(2);
      expect(saved?.classes[1]?.classRef.index).toBe('warlock');
    });
  });

  it('removes the class entirely when a first level in it is undone', async () => {
    const character = await seed([
      { index: 'fighter', name: 'Fighter', level: 3, subclass: ['champion', 'Champion'] },
    ]);
    renderTab(character.id);
    await ready(/Fighter 3 → 4/);

    fireEvent.change(screen.getByLabelText(/Advance which class/), { target: { value: 'rogue' } });
    await ready(/Rogue 0 → 1 \(new class\)/);
    fireEvent.click(screen.getByRole('button', { name: /Confirm level 1/ }));

    await waitFor(async () => {
      expect((await characters.get(character.id))?.classes).toHaveLength(2);
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    fireEvent.click(await screen.findByRole('button', { name: /Undo level/ }));

    await waitFor(async () => {
      const saved = await characters.get(character.id);
      expect(saved?.classes).toHaveLength(1);
      expect(saved?.classes[0]?.classRef.index).toBe('fighter');
    });
  });
});
