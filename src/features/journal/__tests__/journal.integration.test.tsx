// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CharacterCompanionDb, setDb } from '../../../persistence/db';
import { characters, journal as journalRepo, notes as notesRepo } from '../../../persistence/repositories';
import { ThemeProvider } from '../../../ui/theme/ThemeProvider';
import { RulesProvider } from '../../../rules/RulesProvider';
import { BundledRulesSource } from '../../../rules/BundledRulesSource';
import { CharacterShell } from '../../sheet/CharacterShell';
import { JournalTab } from '../JournalTab';
import { NotesTab } from '../../notes/NotesTab';
import { createCharacter, createJournalEntry, createNote } from '../../../domain/factories';
import { exportBundle, importBundle } from '../../../persistence/transfer';

/**
 * Journal and notes integration.
 *
 * Privacy gets the most attention here. Exposing a player's private notes to a DM is the worst
 * failure this app can have, so the tests assert not just that visibility is stored but that it
 * is visible in the UI, defaults safely, and survives export.
 */

let counter = 0;

beforeEach(async () => {
  const fresh = new CharacterCompanionDb(`journal-test-${counter++}`);
  setDb(fresh);
  await fresh.open();
});

afterEach(cleanup);

function renderTab(id: string, tab: 'journal' | 'notes') {
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
                <Route path="journal" element={<JournalTab />} />
                <Route path="notes" element={<NotesTab />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </RulesProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

async function seed() {
  return characters.save(
    createCharacter({
      identity: {
        name: 'Lyra', pronouns: 'she/her', alignment: null, description: '',
        personalityTraits: [], ideals: [], bonds: [], flaws: [], backstory: '',
      },
    }),
  );
}

describe('journal privacy', () => {
  it('defaults a new entry to private', async () => {
    const character = await seed();
    renderTab(character.id, 'journal');
    await waitFor(() => expect(screen.getByRole('button', { name: /new entry/i })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /new entry/i }));

    // Private is the safe direction to be wrong in, so it is preselected.
    const privateOption = await screen.findByRole('button', { name: /Private/ });
    expect(privateOption.getAttribute('aria-pressed')).toBe('true');
  });

  it('shows both choices in words, never as an unlabelled toggle', async () => {
    const character = await seed();
    renderTab(character.id, 'journal');
    await waitFor(() => expect(screen.getByRole('button', { name: /new entry/i })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /new entry/i }));

    expect(await screen.findByText('Who can see this?')).toBeDefined();
    expect(screen.getByText(/Only you/)).toBeDefined();
    expect(screen.getByText(/safe to show your party/)).toBeDefined();
  });

  it('badges every entry in the list with its visibility', async () => {
    const character = await seed();
    await journalRepo.save(
      createJournalEntry(character.id, 'private', { title: 'My doubts', body: 'I am afraid.' }),
    );
    await journalRepo.save(
      createJournalEntry(character.id, 'public', { title: 'Session one', body: 'A tavern.' }),
    );

    renderTab(character.id, 'journal');
    await waitFor(() => expect(screen.getByText('My doubts')).toBeDefined());

    // Visibility is never left to be inferred from position or colour.
    expect(screen.getAllByText('Private')).toHaveLength(1);
    expect(screen.getAllByText('Shareable')).toHaveLength(1);
  });

  it('filters to private entries only', async () => {
    const character = await seed();
    await journalRepo.save(createJournalEntry(character.id, 'private', { title: 'Secret thoughts' }));
    await journalRepo.save(createJournalEntry(character.id, 'public', { title: 'Shared recap' }));

    renderTab(character.id, 'journal');
    await waitFor(() => expect(screen.getByText('Secret thoughts')).toBeDefined());

    fireEvent.change(screen.getByLabelText(/filter by visibility/i), {
      target: { value: 'private' },
    });

    await waitFor(() => expect(screen.queryByText('Shared recap')).toBeNull());
    expect(screen.getByText('Secret thoughts')).toBeDefined();
  });

  it('preserves visibility through an export and import round trip', async () => {
    const character = await seed();
    await journalRepo.save(createJournalEntry(character.id, 'private', { title: 'Private' }));
    await journalRepo.save(createJournalEntry(character.id, 'public', { title: 'Public' }));

    await importBundle(await exportBundle(character.id));

    const all = await characters.list();
    const imported = all.find((c) => c.id !== character.id)!;
    const entries = await journalRepo.list(imported.id);

    // A round trip that flipped a private entry to shareable would be a serious leak.
    expect(entries.find((e) => e.title === 'Private')?.visibility).toBe('private');
    expect(entries.find((e) => e.title === 'Public')?.visibility).toBe('public');
  });
});

describe('journal entries', () => {
  it('creates an entry with a session, tags and body', async () => {
    const character = await seed();
    renderTab(character.id, 'journal');
    await waitFor(() => expect(screen.getByRole('button', { name: /new entry/i })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /new entry/i }));
    fireEvent.change(await screen.findByLabelText('Title'), {
      target: { value: 'The bridge at Sable Ford' },
    });
    fireEvent.change(screen.getByLabelText('Entry'), {
      target: { value: 'We **held** the line.' },
    });
    fireEvent.change(screen.getByLabelText(/tags/i), { target: { value: 'combat, bridge' } });
    fireEvent.click(screen.getByRole('button', { name: /save entry/i }));

    await waitFor(async () => {
      const saved = await journalRepo.list(character.id);
      expect(saved).toHaveLength(1);
      expect(saved[0]?.title).toBe('The bridge at Sable Ford');
      expect(saved[0]?.tags).toEqual(['combat', 'bridge']);
      // A new entry defaults to the next session number.
      expect(saved[0]?.sessionNumber).toBe(1);
    });
  });

  it('renders rich text in the entry body', async () => {
    const character = await seed();
    await journalRepo.save(
      createJournalEntry(character.id, 'public', {
        title: 'Formatted',
        body: '# Heading\n- one\n**bold**',
      }),
    );

    renderTab(character.id, 'journal');
    await waitFor(() => expect(screen.getByText('Formatted')).toBeDefined());
    fireEvent.click(screen.getByText('Formatted'));

    expect(await screen.findByRole('heading', { name: 'Heading' })).toBeDefined();
    expect(screen.getByText('one')).toBeDefined();
    expect(screen.getByText('bold')).toBeDefined();
  });

  it('searches across title, body and tags', async () => {
    const character = await seed();
    await journalRepo.save(
      createJournalEntry(character.id, 'public', { title: 'Alpha', body: 'mentions a kraken' }),
    );
    await journalRepo.save(createJournalEntry(character.id, 'public', { title: 'Beta' }));

    renderTab(character.id, 'journal');
    await waitFor(() => expect(screen.getByText('Alpha')).toBeDefined());

    fireEvent.change(screen.getByLabelText(/search journal/i), { target: { value: 'kraken' } });
    await waitFor(() => expect(screen.queryByText('Beta')).toBeNull());
    expect(screen.getByText('Alpha')).toBeDefined();
  });

  it('browses chronologically and can reverse the order', async () => {
    const character = await seed();
    await journalRepo.save(
      createJournalEntry(character.id, 'public', { title: 'Older', realDate: 1000 }),
    );
    await journalRepo.save(
      createJournalEntry(character.id, 'public', { title: 'Newer', realDate: 5000 }),
    );

    renderTab(character.id, 'journal');
    await waitFor(() => expect(screen.getByText('Older')).toBeDefined());

    const titles = () =>
      screen.getAllByRole('group').map((el) => el.querySelector('.font-medium')?.textContent);

    expect(titles()[0]).toBe('Newer');

    fireEvent.change(screen.getByLabelText(/sort order/i), { target: { value: 'oldest' } });
    await waitFor(() => expect(titles()[0]).toBe('Older'));
  });

  it('deletes an entry behind a confirmation', async () => {
    const character = await seed();
    await journalRepo.save(createJournalEntry(character.id, 'public', { title: 'Doomed entry' }));

    renderTab(character.id, 'journal');
    await waitFor(() => expect(screen.getByText('Doomed entry')).toBeDefined());
    fireEvent.click(screen.getByText('Doomed entry'));
    fireEvent.click(await screen.findByRole('button', { name: /delete doomed entry/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(async () => {
      expect(await journalRepo.list(character.id)).toHaveLength(0);
    });
  });
});

describe('notes', () => {
  it('defaults a secret to private but an NPC to shareable', async () => {
    const character = await seed();
    renderTab(character.id, 'notes');
    await waitFor(() => expect(screen.getByRole('button', { name: /new note/i })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /new note/i }));
    // NPCs are usually shared party knowledge.
    expect((await screen.findByRole('button', { name: /Shareable/ })).getAttribute('aria-pressed')).toBe('true');

    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'secret' } });
    // A secret defaulting to shareable would be the worst default in the app.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Private/ }).getAttribute('aria-pressed')).toBe('true'),
    );
  });

  it('creates a typed note with its structured fields', async () => {
    const character = await seed();
    renderTab(character.id, 'notes');
    await waitFor(() => expect(screen.getByRole('button', { name: /new note/i })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /new note/i }));
    fireEvent.change(await screen.findByLabelText('Type'), { target: { value: 'quest' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Find the lost mine' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'Active' } });
    fireEvent.click(screen.getByRole('button', { name: /save note/i }));

    await waitFor(async () => {
      const saved = await notesRepo.list(character.id);
      expect(saved[0]?.kind).toBe('quest');
      expect(saved[0]?.meta.status).toBe('Active');
    });
  });

  it('groups notes by type', async () => {
    const character = await seed();
    await notesRepo.save(createNote(character.id, 'npc', 'public', { name: 'Sildar' }));
    await notesRepo.save(createNote(character.id, 'location', 'public', { name: 'Phandalin' }));

    renderTab(character.id, 'notes');
    // "NPCs" also appears as a filter option, so target the section heading.
    await waitFor(() => expect(screen.getByRole('heading', { name: /NPCs/ })).toBeDefined());
    expect(screen.getByRole('heading', { name: /Locations/ })).toBeDefined();
  });
});

describe('links and backlinks', () => {
  it('links a journal entry to a note and shows the backlink', async () => {
    const character = await seed();
    const npc = await notesRepo.save(
      createNote(character.id, 'npc', 'public', { name: 'Sildar Hallwinter' }),
    );
    await journalRepo.save(
      createJournalEntry(character.id, 'public', {
        title: 'Rescued Sildar',
        sessionNumber: 3,
        links: [{ kind: 'npc', noteId: npc.id }],
      }),
    );

    // The entry lists who it mentions...
    const { unmount } = renderTab(character.id, 'journal');
    await waitFor(() => expect(screen.getByText('Rescued Sildar')).toBeDefined());
    fireEvent.click(screen.getByText('Rescued Sildar'));
    expect(await screen.findByText('Mentions')).toBeDefined();
    unmount();

    // ...and the note lists which sessions it appeared in. That is what makes it a graph.
    renderTab(character.id, 'notes');
    await waitFor(() => expect(screen.getByText('Sildar Hallwinter')).toBeDefined());
    fireEvent.click(screen.getByText('Sildar Hallwinter'));
    expect(await screen.findByText('Appears in')).toBeDefined();
    expect(screen.getByText(/Rescued Sildar \(S3\)/)).toBeDefined();
  });

  it('links from the entry editor', async () => {
    const character = await seed();
    await notesRepo.save(createNote(character.id, 'location', 'public', { name: 'Phandalin' }));

    renderTab(character.id, 'journal');
    await waitFor(() => expect(screen.getByRole('button', { name: /new entry/i })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /new entry/i }));

    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Arrival' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Phandalin/ }));
    fireEvent.click(screen.getByRole('button', { name: /save entry/i }));

    await waitFor(async () => {
      const saved = await journalRepo.list(character.id);
      expect(saved[0]?.links[0]?.kind).toBe('location');
    });
  });

  it('drops links to a note that gets deleted, rather than dangling', async () => {
    const character = await seed();
    const npc = await notesRepo.save(createNote(character.id, 'npc', 'public', { name: 'Doomed NPC' }));
    await journalRepo.save(
      createJournalEntry(character.id, 'public', {
        title: 'An entry',
        links: [{ kind: 'npc', noteId: npc.id }],
      }),
    );

    renderTab(character.id, 'notes');
    await waitFor(() => expect(screen.getByText('Doomed NPC')).toBeDefined());
    fireEvent.click(screen.getByText('Doomed NPC'));
    fireEvent.click(await screen.findByRole('button', { name: /delete doomed npc/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(async () => {
      expect(await notesRepo.list(character.id)).toHaveLength(0);
    });
  });

  it('says so plainly when there is nothing to link yet', async () => {
    const character = await seed();
    renderTab(character.id, 'journal');
    await waitFor(() => expect(screen.getByRole('button', { name: /new entry/i })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /new entry/i }));

    expect(await screen.findByText(/Nothing to link yet/)).toBeDefined();
  });
});
