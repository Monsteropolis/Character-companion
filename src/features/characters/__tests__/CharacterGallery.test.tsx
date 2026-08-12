// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CharacterCompanionDb, setDb } from '../../../persistence/db';
import { characters } from '../../../persistence/repositories';
import { useCharacterStore } from '../store';
import { CharacterGallery } from '../CharacterGallery';
import { ThemeProvider } from '../../../ui/theme/ThemeProvider';

/**
 * Smoke tests for the app's front door.
 *
 * These assert the states a user actually hits -- first run with nothing saved, and a populated
 * library -- because an empty screen with no explanation reads as a broken app, and the empty
 * state is by definition what every new user sees first.
 */

let counter = 0;

beforeEach(async () => {
  const fresh = new CharacterCompanionDb(`gallery-test-${counter++}`);
  setDb(fresh);
  await fresh.open();
  // Zustand stores are module singletons; reset between tests so they cannot leak state.
  useCharacterStore.setState({ characters: [], status: 'idle', error: null });
});

afterEach(cleanup);

function renderGallery() {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <CharacterGallery />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('CharacterGallery', () => {
  it('guides a first-time user rather than showing a blank screen', async () => {
    renderGallery();

    await waitFor(() => {
      expect(screen.getByText('Create your first character')).toBeDefined();
    });
    expect(screen.getByRole('button', { name: /start character creation/i })).toBeDefined();
  });

  it('renders saved characters with their name and class', async () => {
    await characters.create({
      identity: {
        name: 'Lyra Half-Moon',
        pronouns: 'she/her',
        alignment: 'chaotic-good',
        description: '',
        personalityTraits: [],
        ideals: [],
        bonds: [],
        flaws: [],
        backstory: '',
      },
      classes: [
        {
          classRef: { source: 'srd', index: 'bard', name: 'Bard' },
          subclassRef: null,
          level: 3,
          hitDiceSpent: 0,
          hitPointRolls: [8, 5, 6],
        },
      ],
    });

    renderGallery();

    await waitFor(() => {
      expect(screen.getByText('Lyra Half-Moon')).toBeDefined();
    });
    expect(screen.getByText(/Bard 3/)).toBeDefined();
  });

  it('shows an initial placeholder when a character has no portrait', async () => {
    await characters.create({
      identity: {
        name: 'Zephyr',
        pronouns: 'they/them',
        alignment: null,
        description: '',
        personalityTraits: [],
        ideals: [],
        bonds: [],
        flaws: [],
        backstory: '',
      },
    });

    renderGallery();

    await waitFor(() => expect(screen.getByText('Zephyr')).toBeDefined());
    // The fallback chain's last link: an initial, never a broken image.
    expect(screen.getByText('Z')).toBeDefined();
  });

  it('separates archived characters behind their own tab', async () => {
    const active = await characters.create({
      identity: {
        name: 'Active One', pronouns: '', alignment: null, description: '',
        personalityTraits: [], ideals: [], bonds: [], flaws: [], backstory: '',
      },
    });
    const archived = await characters.create({
      identity: {
        name: 'Retired One', pronouns: '', alignment: null, description: '',
        personalityTraits: [], ideals: [], bonds: [], flaws: [], backstory: '',
      },
    });
    await characters.setArchived(archived.id, true);

    renderGallery();

    await waitFor(() => expect(screen.getByText('Active One')).toBeDefined());
    expect(screen.queryByText('Retired One')).toBeNull();
    expect(screen.getByRole('button', { name: /archived \(1\)/i })).toBeDefined();
    expect(active.archived).toBe(false);
  });

  it('offers export only when there is something to export', async () => {
    renderGallery();

    await waitFor(() => {
      expect(screen.getByText('Create your first character')).toBeDefined();
    });
    const exportButton = screen.getByRole('button', { name: /export all/i });
    expect(exportButton.hasAttribute('disabled')).toBe(true);
  });

  it('labels destructive actions with the character they affect', async () => {
    await characters.create({
      identity: {
        name: 'Doomed', pronouns: '', alignment: null, description: '',
        personalityTraits: [], ideals: [], bonds: [], flaws: [], backstory: '',
      },
    });

    renderGallery();

    await waitFor(() => expect(screen.getByText('Doomed')).toBeDefined());
    // Screen-reader users must know which character a Delete button belongs to.
    expect(screen.getByRole('button', { name: 'Delete Doomed' })).toBeDefined();
  });
});
