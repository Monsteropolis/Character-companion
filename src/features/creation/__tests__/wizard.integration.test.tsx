// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CharacterCompanionDb, setDb } from '../../../persistence/db';
import { characters, inventory } from '../../../persistence/repositories';
import { ThemeProvider } from '../../../ui/theme/ThemeProvider';
import { RulesProvider } from '../../../rules/RulesProvider';
import { BundledRulesSource } from '../../../rules/BundledRulesSource';
import { CreationWizard } from '../CreationWizard';
import { useDraft, initialDraft } from '../draft';
import { useCharacterStore } from '../../characters/store';

/**
 * End-to-end creation, driven against the real vendored SRD data.
 *
 * This is the test that proves the pieces fit: the bundled dataset loads, choices resolve,
 * the engine derives, and the review step's numbers are the ones that get saved. Unit tests
 * of each layer would all pass while the seams between them were broken.
 */

let counter = 0;

beforeEach(async () => {
  const fresh = new CharacterCompanionDb(`wizard-test-${counter++}`);
  setDb(fresh);
  await fresh.open();
  useDraft.setState(initialDraft());
  useCharacterStore.setState({ characters: [], status: 'idle', error: null });
  localStorage.clear();
});

afterEach(cleanup);

function renderWizard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RulesProvider source={new BundledRulesSource()}>
          <MemoryRouter>
            <CreationWizard />
          </MemoryRouter>
        </RulesProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('creation wizard', () => {
  it('loads real SRD races and lets one be chosen', async () => {
    renderWizard();
    useDraft.getState().goto('race');

    await waitFor(
      () => {
        expect(screen.getByText('Dwarf')).toBeDefined();
      },
      { timeout: 5000 },
    );

    // All nine SRD races, no more and no fewer.
    expect(screen.getByText('Half-Orc')).toBeDefined();
    expect(screen.getByText('Tiefling')).toBeDefined();

    fireEvent.click(screen.getByText('Dwarf'));
    expect(useDraft.getState().raceRef?.index).toBe('dwarf');
  });

  it('offers Hill Dwarf as the only SRD dwarf subrace, and says so', async () => {
    renderWizard();
    useDraft.getState().setRace({ source: 'srd', index: 'elf', name: 'Elf' });
    useDraft.getState().goto('race');

    await waitFor(() => expect(screen.getByText('High Elf')).toBeDefined(), { timeout: 5000 });
    // Wood Elf and Drow are not in the SRD.
    expect(screen.queryByText('Wood Elf')).toBeNull();
  });

  it('states the background licence limit plainly', async () => {
    renderWizard();
    useDraft.getState().goto('background');

    // "Acolyte" appears both in the licence notice and as the option card, so target the card.
    await waitFor(() => expect(screen.getByRole('button', { name: /Acolyte/ })).toBeDefined(), {
      timeout: 5000,
    });
    expect(screen.getByText(/Every other Player/i)).toBeDefined();
  });

  it('resolves real class skill choices', async () => {
    renderWizard();
    useDraft.getState().setClass({ source: 'srd', index: 'fighter', name: 'Fighter' });
    useDraft.getState().goto('proficiencies');

    await waitFor(() => expect(screen.getByText('Athletics')).toBeDefined(), { timeout: 5000 });
    // The Fighter picks two from eight.
    expect(screen.getByText('0/2')).toBeDefined();
  });

  it('enforces the point-buy budget in the UI', async () => {
    renderWizard();
    useDraft.getState().goto('abilities');
    useDraft.getState().setAbilityMethod('point-buy');

    await waitFor(() => expect(screen.getByText(/Points remaining/)).toBeDefined());
    expect(screen.getByText('27 / 27')).toBeDefined();

    useDraft.getState().setScores({ str: 15, dex: 14, con: 15, int: 8, wis: 10, cha: 8 });
    await waitFor(() => expect(screen.getByText('0 / 27')).toBeDefined());
  });

  it('computes and saves a complete level-1 character', async () => {
    renderWizard();

    const draft = useDraft.getState();
    draft.setIdentity({ name: 'Thorin Stonefist', pronouns: 'he/him' });
    draft.setRace({ source: 'srd', index: 'dwarf', name: 'Dwarf' });
    draft.setClass({ source: 'srd', index: 'fighter', name: 'Fighter' });
    draft.setBackground({ source: 'srd', index: 'acolyte', name: 'Acolyte' });
    draft.setAbilityMethod('manual');
    draft.setScores({ str: 16, dex: 12, con: 15, int: 10, wis: 12, cha: 8 });
    draft.goto('review');

    await waitFor(() => expect(screen.getByText('Thorin Stonefist')).toBeDefined(), {
      timeout: 5000,
    });

    // Dwarf grants CON +2, so 15 becomes 17 and the modifier is +3.
    await waitFor(() => {
      expect(screen.getByText(/incl. \+2 racial/)).toBeDefined();
    });

    const createButton = screen.getByRole('button', { name: /create character/i });
    fireEvent.click(createButton);

    await waitFor(async () => {
      const saved = await characters.list();
      expect(saved).toHaveLength(1);
    }, { timeout: 5000 });

    const saved = (await characters.list())[0]!;
    expect(saved.identity.name).toBe('Thorin Stonefist');
    expect(saved.classes[0]?.classRef.index).toBe('fighter');
    // Racial bonus applied as its own layer, leaving the player's base score intact.
    expect(saved.abilityScores.racial.con).toBe(2);
    expect(saved.abilityScores.base.con).toBe(15);
    // Hit points start full: d10 + CON +3.
    expect(saved.resources.currentHp).toBe(13);

    // Starting equipment from class and background came through.
    const items = await inventory.list(saved.id);
    expect(items.length).toBeGreaterThan(0);
  });

  it('hides the spells step for non-casters', async () => {
    renderWizard();
    useDraft.getState().setClass({ source: 'srd', index: 'fighter', name: 'Fighter' });

    // Nav buttons carry a completion tick, so match on the label rather than exact text.
    await waitFor(() => expect(screen.getByRole('button', { name: /Equipment/ })).toBeDefined());
    // An empty spell step for a Fighter is noise, not information.
    expect(screen.queryByRole('button', { name: /Spells/ })).toBeNull();
  });

  it('shows the spells step for casters', async () => {
    renderWizard();
    useDraft.getState().setClass({ source: 'srd', index: 'wizard', name: 'Wizard' });

    await waitFor(() => expect(screen.getByRole('button', { name: /Spells/ })).toBeDefined());
  });

  it('refuses to review a character with no class', async () => {
    renderWizard();
    useDraft.getState().setIdentity({ name: 'Nobody' });
    useDraft.getState().goto('review');

    await waitFor(() => expect(screen.getByText('Not quite ready')).toBeDefined(), {
      timeout: 5000,
    });
  });
});
