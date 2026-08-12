// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CharacterCompanionDb, setDb } from '../../../persistence/db';
import { characters, inventory } from '../../../persistence/repositories';
import { ThemeProvider } from '../../../ui/theme/ThemeProvider';
import { RulesProvider } from '../../../rules/RulesProvider';
import { BundledRulesSource } from '../../../rules/BundledRulesSource';
import { CharacterShell } from '../../sheet/CharacterShell';
import { InventoryTab } from '../InventoryTab';
import { createCharacter, createInventoryItem } from '../../../domain/factories';
import type { Character, InventoryItem } from '../../../domain/types';

/**
 * Inventory integration.
 *
 * The property that matters is that equipping moves the sheet's numbers -- that feedback is the
 * whole point of the screen, and it is the seam where the engine, the item snapshot and the UI
 * have to agree.
 */

let counter = 0;

beforeEach(async () => {
  const fresh = new CharacterCompanionDb(`inv-test-${counter++}`);
  setDb(fresh);
  await fresh.open();
});

afterEach(cleanup);

function renderInventory(id: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RulesProvider source={new BundledRulesSource()}>
          <MemoryRouter initialEntries={[`/c/${id}/inventory`]}>
            <Routes>
              <Route path="/c/:id" element={<CharacterShell />}>
                <Route path="inventory" element={<InventoryTab />} />
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
        name: 'Thorin', pronouns: 'he/him', alignment: null, description: '',
        personalityTraits: [], ideals: [], bonds: [], flaws: [], backstory: '',
      },
      classes: [{
        classRef: { source: 'srd', index: 'fighter', name: 'Fighter' },
        subclassRef: null, level: 1, hitDiceSpent: 0, hitPointRolls: [],
      }],
      abilityScores: {
        base: { str: 15, dex: 14, con: 14, int: 10, wis: 10, cha: 10 },
        method: 'manual',
        racial: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
        asi: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
        misc: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
        override: {},
      },
      currency: { cp: 0, sp: 0, ep: 0, gp: 10, pp: 0 },
      ...over,
    }),
  );
}

const chainShirt = (characterId: string, over: Partial<InventoryItem> = {}) =>
  createInventoryItem(characterId, {
    name: 'Chain Shirt',
    category: 'armor',
    weight: 20,
    armor: { base: 13, dexBonus: true, maxDex: 2, strMinimum: 0, stealthDisadvantage: false, isShield: false },
    ...over,
  });

const shield = (characterId: string, over: Partial<InventoryItem> = {}) =>
  createInventoryItem(characterId, {
    name: 'Shield',
    category: 'armor',
    weight: 6,
    armor: { base: 2, dexBonus: false, maxDex: null, strMinimum: 0, stealthDisadvantage: false, isShield: true },
    ...over,
  });

describe('equipping moves the sheet', () => {
  it('raises AC when armour is equipped', async () => {
    const character = await seedFighter();
    await inventory.save(chainShirt(character.id));
    renderInventory(character.id);

    // Unarmoured: 10 + DEX 2 = 12.
    await waitFor(() => expect(screen.getByText('12')).toBeDefined());

    fireEvent.click(screen.getByText('Chain Shirt'));
    fireEvent.click(await screen.findByRole('button', { name: 'Equip' }));

    // Chain shirt 13 + DEX capped at 2 = 15.
    await waitFor(() => expect(screen.getByText('15')).toBeDefined());

    const saved = await inventory.list(character.id);
    expect(saved[0]?.equipped).toBe(true);
  });

  it('stacks a shield on top of worn armour', async () => {
    const character = await seedFighter();
    await inventory.save(chainShirt(character.id, { equipped: true }));
    await inventory.save(shield(character.id));
    renderInventory(character.id);

    await waitFor(() => expect(screen.getByText('15')).toBeDefined());

    fireEvent.click(screen.getByText('Shield'));
    const buttons = await screen.findAllByRole('button', { name: 'Equip' });
    fireEvent.click(buttons[0]!);

    await waitFor(() => expect(screen.getByText('17')).toBeDefined());
  });

  it('removes conflicting body armour automatically', async () => {
    const character = await seedFighter();
    await inventory.save(chainShirt(character.id, { equipped: true }));
    const leather = await inventory.save(
      createInventoryItem(character.id, {
        name: 'Leather Armor',
        category: 'armor',
        weight: 10,
        armor: { base: 11, dexBonus: true, maxDex: null, strMinimum: 0, stealthDisadvantage: false, isShield: false },
      }),
    );

    renderInventory(character.id);
    await waitFor(() => expect(screen.getByText('Leather Armor')).toBeDefined());

    fireEvent.click(screen.getByText('Leather Armor'));
    const equipButtons = await screen.findAllByRole('button', { name: 'Equip' });
    fireEvent.click(equipButtons[0]!);

    await waitFor(async () => {
      const saved = await inventory.list(character.id);
      const chain = saved.find((i) => i.name === 'Chain Shirt');
      const worn = saved.find((i) => i.id === leather.id);
      // Two suits of body armour cannot be worn at once.
      expect(chain?.equipped).toBe(false);
      expect(worn?.equipped).toBe(true);
    });

    expect(screen.getByText(/removed to make room/i)).toBeDefined();
  });

  it('does not change AC for an unequipped item', async () => {
    const character = await seedFighter();
    await inventory.save(chainShirt(character.id));
    renderInventory(character.id);
    await waitFor(() => expect(screen.getByText('Chain Shirt')).toBeDefined());
    expect(screen.getByText('12')).toBeDefined();
  });
});

describe('encumbrance', () => {
  it('tracks carried weight and crosses thresholds', async () => {
    const character = await seedFighter();
    await inventory.save(
      createInventoryItem(character.id, { name: 'Anvil', weight: 80, quantity: 1 }),
    );
    renderInventory(character.id);

    // STR 15 -> encumbered above 75 lb.
    await waitFor(() => expect(screen.getByText(/Encumbered/)).toBeDefined());
    expect(screen.getByText('80.0')).toBeDefined();
  });

  it('ignores weightless containers', async () => {
    const character = await seedFighter();
    await inventory.save(
      createInventoryItem(character.id, {
        name: 'Bag of Holding', weight: 500, weightless: true,
      }),
    );
    renderInventory(character.id);
    await waitFor(() => expect(screen.getByText('Bag of Holding')).toBeDefined());
    expect(screen.getByText('0.0')).toBeDefined();
  });
});

describe('currency', () => {
  it('adds coin', async () => {
    const character = await seedFighter();
    renderInventory(character.id);
    await waitFor(() => expect(screen.getByText('Coin')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Amount of coin'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gain' }));

    await waitFor(async () => {
      const saved = await characters.get(character.id);
      expect(saved?.currency.gp).toBe(50);
    });
  });

  it('refuses to spend more than the purse holds', async () => {
    const character = await seedFighter();
    renderInventory(character.id);
    await waitFor(() => expect(screen.getByText('Coin')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Amount of coin'), { target: { value: '999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Spend' }));

    expect(await screen.findByText(/not enough coin/i)).toBeDefined();
    const saved = await characters.get(character.id);
    // The purse is untouched rather than negative.
    expect(saved?.currency.gp).toBe(10);
  });

  it('makes change across denominations when spending', async () => {
    const character = await seedFighter();
    renderInventory(character.id);
    await waitFor(() => expect(screen.getByText('Coin')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Amount of coin'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Denomination'), { target: { value: 'sp' } });
    fireEvent.click(screen.getByRole('button', { name: 'Spend' }));

    await waitFor(async () => {
      const saved = await characters.get(character.id);
      // 10 gp minus 5 sp leaves 9 gp and 5 sp.
      expect(saved?.currency.gp).toBe(9);
      expect(saved?.currency.sp).toBe(5);
    });
  });
});

describe('attunement', () => {
  it('warns when past the limit of three', async () => {
    const character = await seedFighter();
    for (let i = 0; i < 4; i++) {
      await inventory.save(
        createInventoryItem(character.id, { name: `Ring ${i}`, magical: true, attuned: true }),
      );
    }
    renderInventory(character.id);
    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    expect(screen.getByRole('alert').textContent).toMatch(/limit is 3/i);
  });

  it('shows the count when within the limit', async () => {
    const character = await seedFighter();
    await inventory.save(
      createInventoryItem(character.id, { name: 'Ring', magical: true, attuned: true }),
    );
    renderInventory(character.id);
    await waitFor(() => expect(screen.getByText(/Attunement: 1 of 3/)).toBeDefined());
  });

  it('offers attunement only on magical items', async () => {
    const character = await seedFighter();
    await inventory.save(createInventoryItem(character.id, { name: 'Mundane Rope' }));
    renderInventory(character.id);

    await waitFor(() => expect(screen.getByText('Mundane Rope')).toBeDefined());
    fireEvent.click(screen.getByText('Mundane Rope'));
    expect(screen.queryByRole('button', { name: 'Attune' })).toBeNull();
  });
});

describe('charges', () => {
  it('spends and restores charges', async () => {
    const character = await seedFighter();
    const wand = await inventory.save(
      createInventoryItem(character.id, {
        name: 'Wand of Magic Missiles',
        magical: true,
        charges: { current: 7, max: 7, resetOn: 'long' },
      }),
    );
    renderInventory(character.id);

    await waitFor(() => expect(screen.getByText('Wand of Magic Missiles')).toBeDefined());
    fireEvent.click(screen.getByText('Wand of Magic Missiles'));
    fireEvent.click(await screen.findByRole('button', { name: /use a charge/i }));

    await waitFor(async () => {
      const saved = await inventory.get(wand.id);
      expect(saved?.charges?.current).toBe(6);
    });

    fireEvent.click(screen.getByRole('button', { name: /restore charges/i }));
    await waitFor(async () => {
      const saved = await inventory.get(wand.id);
      expect(saved?.charges?.current).toBe(7);
    });
  });
});

describe('adding items', () => {
  it('finds real SRD equipment and snapshots its stats', async () => {
    const character = await seedFighter();
    renderInventory(character.id);
    await waitFor(() => expect(screen.getByRole('button', { name: /add from rules/i })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /add from rules/i }));
    fireEvent.change(await screen.findByLabelText(/search equipment/i), {
      target: { value: 'breastplate' },
    });

    const result = await screen.findByText('Breastplate');
    fireEvent.click(result);

    // Lands in the editor with the SRD armour values already filled in.
    await waitFor(() => expect(screen.getByLabelText('Base AC')).toBeDefined());
    expect((screen.getByLabelText('Base AC') as HTMLInputElement).value).toBe('14');
    expect((screen.getByLabelText('Max DEX bonus') as HTMLInputElement).value).toBe('2');
  });

  it('creates a fully custom item', async () => {
    const character = await seedFighter();
    renderInventory(character.id);
    await waitFor(() => expect(screen.getByRole('button', { name: /create item/i })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /create item/i }));
    fireEvent.change(await screen.findByLabelText('Name'), {
      target: { value: "Grandfather's Compass" },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(async () => {
      const saved = await inventory.list(character.id);
      expect(saved.map((i) => i.name)).toContain("Grandfather's Compass");
      // A custom item has no rules reference and is badged as homebrew.
      expect(saved[0]?.ref).toBeNull();
    });
  });

  it('removes an item behind a confirmation', async () => {
    const character = await seedFighter();
    await inventory.save(createInventoryItem(character.id, { name: 'Doomed Item' }));
    renderInventory(character.id);

    await waitFor(() => expect(screen.getByText('Doomed Item')).toBeDefined());
    fireEvent.click(screen.getByText('Doomed Item'));
    fireEvent.click(await screen.findByRole('button', { name: /remove doomed item/i }));

    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));

    await waitFor(async () => {
      expect(await inventory.list(character.id)).toHaveLength(0);
    });
  });
});
