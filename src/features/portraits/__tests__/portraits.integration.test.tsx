// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CharacterCompanionDb, setDb } from '../../../persistence/db';
import { characters, portraits as portraitRepo, assetRepo } from '../../../persistence/repositories';
import { ThemeProvider } from '../../../ui/theme/ThemeProvider';
import { RulesProvider } from '../../../rules/RulesProvider';
import { BundledRulesSource } from '../../../rules/BundledRulesSource';
import { CharacterShell } from '../../sheet/CharacterShell';
import { PortraitTab } from '../PortraitTab';
import { createCharacter, persistedBase } from '../../../domain/factories';
import { importImage } from '../assets';
import { makeSpriteSheetPng, makePortraitPng, makeGif, asFile } from '../../../test/spriteFixture';
import { deriveMeta, frameRange } from '../../../engine/sprites';
import type { PortraitAsset } from '../../../domain/types';

/**
 * Portrait and sprite integration, against genuine PNG bytes.
 *
 * Fixtures are generated rather than stubbed so the whole import path -- validation, blob
 * storage, retrieval -- runs for real. Real sprite art will take exactly this route.
 */

let counter = 0;

beforeEach(async () => {
  const fresh = new CharacterCompanionDb(`portrait-test-${counter++}`);
  setDb(fresh);
  await fresh.open();
});

afterEach(cleanup);

function renderPortraitTab(id: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RulesProvider source={new BundledRulesSource()}>
          <MemoryRouter initialEntries={[`/c/${id}/portrait`]}>
            <Routes>
              <Route path="/c/:id" element={<CharacterShell />}>
                <Route path="portrait" element={<PortraitTab />} />
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

async function seedSpriteSheet(characterId: string): Promise<PortraitAsset> {
  const png = makeSpriteSheetPng({ columns: 4, rows: 3, frameSize: 16 });
  const { asset } = await importImage(asFile(png, 'hero.png'), characterId, {
    preserveOriginal: true,
    kind: 'sprite',
  });

  return portraitRepo.save({
    ...persistedBase(),
    characterId,
    kind: 'spritesheet',
    blobId: asset.id,
    name: 'Hero sheet',
    spritesheet: deriveMeta(64, 48, 4, 3, 12),
    states: [
      { name: 'idle', frames: frameRange(0, 4), fps: 8, loop: true, blobId: null },
      { name: 'happy', frames: frameRange(4, 4), fps: 10, loop: false, blobId: null },
    ],
    defaultState: 'idle',
    emotes: [],
  });
}

describe('image import', () => {
  /*
   * Byte-level assertions run against the value `importImage` returns, before storage.
   * fake-indexeddb's structured clone degrades a jsdom Blob to a plain object, so a size read
   * after a round trip is meaningless here -- real IndexedDB stores Blobs natively, and the
   * browser pass checks the stored bytes end to end.
   */
  it('stores a real PNG and reads the record back', async () => {
    const character = await seed();
    const png = makePortraitPng(64);

    const { asset } = await importImage(asFile(png, 'face.png'), character.id);
    expect(asset.blob.size).toBeGreaterThan(0);

    const stored = await assetRepo.get(asset.id);
    expect(stored).not.toBeNull();
    expect(stored?.mimeType).toBe('image/png');
  });

  it('keeps an animated GIF byte-for-byte', async () => {
    const character = await seed();
    const gif = makeGif();

    const { asset } = await importImage(asFile(gif, 'wave.gif', 'image/gif'), character.id);

    // Re-encoding a GIF through a canvas silently flattens it to one frame.
    expect(asset.blob.size).toBe(gif.byteLength);
  });

  it('keeps a sprite sheet byte-for-byte', async () => {
    const character = await seed();
    const png = makeSpriteSheetPng({ columns: 4, rows: 4 });

    const { asset } = await importImage(asFile(png, 'sheet.png'), character.id, {
      preserveOriginal: true,
      kind: 'sprite',
    });

    // Rescaling a sheet would shift every frame boundary the user just measured.
    expect(asset.blob.size).toBe(png.byteLength);
  });

  it('refuses an unsupported file type with a reason', async () => {
    const character = await seed();
    const file = new File(['not an image'], 'notes.pdf', { type: 'application/pdf' });

    await expect(importImage(file, character.id)).rejects.toThrow(/PNG, JPEG, WebP or GIF/);
  });
});

describe('portrait management', () => {
  it('shows an empty state before anything is uploaded', async () => {
    const character = await seed();
    renderPortraitTab(character.id);
    await waitFor(() => expect(screen.getByText('No portrait yet')).toBeDefined());
  });

  it('lists a stored sprite sheet with its frame count and animations', async () => {
    const character = await seed();
    await seedSpriteSheet(character.id);

    renderPortraitTab(character.id);
    await waitFor(() => expect(screen.getByText('Hero sheet')).toBeDefined());
    expect(screen.getByText(/Sprite sheet · 12 frames · 2 animations/)).toBeDefined();
  });

  it('marks the active portrait and can switch to another', async () => {
    const character = await seed();
    const first = await seedSpriteSheet(character.id);
    await characters.save({ ...character, portraitId: first.id });

    const second = await portraitRepo.save({
      ...persistedBase(),
      characterId: character.id,
      kind: 'static',
      blobId: 'missing',
      name: 'Second face',
      spritesheet: null,
      states: [],
      defaultState: 'idle',
      emotes: [],
    });

    renderPortraitTab(character.id);
    await waitFor(() => expect(screen.getByText('In use')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /use this/i }));
    await waitFor(async () => {
      const saved = await characters.get(character.id);
      expect(saved?.portraitId).toBe(second.id);
    });
  });

  it('clears the character pointer when the portrait in use is deleted', async () => {
    const character = await seed();
    const portrait = await seedSpriteSheet(character.id);
    await characters.save({ ...character, portraitId: portrait.id });

    renderPortraitTab(character.id);
    await waitFor(() => expect(screen.getByText('Hero sheet')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /delete hero sheet/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(async () => {
      const saved = await characters.get(character.id);
      // A character pointing at a deleted portrait would render nothing at all.
      expect(saved?.portraitId).toBeNull();
      expect(await portraitRepo.listForCharacter(character.id)).toHaveLength(0);
    });
  });

  it('removes the image blob along with the portrait', async () => {
    const character = await seed();
    const portrait = await seedSpriteSheet(character.id);

    await portraitRepo.remove(portrait.id);
    expect(await assetRepo.get(portrait.blobId)).toBeNull();
  });
});

describe('sprite sheet configuration', () => {
  it('exposes the grid and animation states for editing', async () => {
    const character = await seed();
    await seedSpriteSheet(character.id);

    renderPortraitTab(character.id);
    await waitFor(() => expect(screen.getByText('Hero sheet')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /configure/i }));

    expect(await screen.findByLabelText('Columns')).toBeDefined();
    expect((screen.getByLabelText('Columns') as HTMLInputElement).value).toBe('4');
    expect((screen.getByLabelText('Rows') as HTMLInputElement).value).toBe('3');
    expect((screen.getByLabelText('Total frames') as HTMLInputElement).value).toBe('12');
    // Frame size is derived, not asked for.
    expect(screen.getByText(/16 × 16 px/)).toBeDefined();
  });

  it('adds a state mapped to the next unclaimed row', async () => {
    const character = await seed();
    const portrait = await seedSpriteSheet(character.id);

    renderPortraitTab(character.id);
    await waitFor(() => expect(screen.getByText('Hero sheet')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /configure/i }));

    fireEvent.click(await screen.findByRole('button', { name: /add state/i }));
    fireEvent.click(screen.getByRole('button', { name: /save portrait/i }));

    await waitFor(async () => {
      const saved = await portraitRepo.get(portrait.id);
      expect(saved?.states).toHaveLength(3);
      // Two states already claimed rows 0 and 1, so the third starts at frame 8.
      expect(saved?.states[2]?.frames[0]).toBe(8);
    });
  });

  it('lets a state be renamed and removed', async () => {
    const character = await seed();
    const portrait = await seedSpriteSheet(character.id);

    renderPortraitTab(character.id);
    await waitFor(() => expect(screen.getByText('Hero sheet')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /configure/i }));

    fireEvent.change(await screen.findByLabelText('Name', { selector: '#state-name-1' }), {
      target: { value: 'cheer' },
    });
    fireEvent.click(screen.getByRole('button', { name: /remove idle/i }));
    fireEvent.click(screen.getByRole('button', { name: /save portrait/i }));

    await waitFor(async () => {
      const saved = await portraitRepo.get(portrait.id);
      expect(saved?.states).toHaveLength(1);
      expect(saved?.states[0]?.name).toBe('cheer');
    });
  });
});

describe('emote bindings', () => {
  it('describes what each emote will do automatically', async () => {
    const character = await seed();
    await seedSpriteSheet(character.id);

    renderPortraitTab(character.id);
    await waitFor(() => expect(screen.getByText('Hero sheet')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /configure/i }));
    fireEvent.click(await screen.findByText(/Emote buttons/));

    // "happy" matches a state on the sheet, so it resolves to that animation with no setup.
    expect(await screen.findByText(/Automatic: plays “happy”/)).toBeDefined();
    // "angry" has no matching state, so it degrades rather than doing nothing.
    expect(screen.getAllByText(/shows “😠”, pulses/).length).toBeGreaterThan(0);
  });

  it('stores an override binding', async () => {
    const character = await seed();
    const portrait = await seedSpriteSheet(character.id);

    renderPortraitTab(character.id);
    await waitFor(() => expect(screen.getByText('Hero sheet')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /configure/i }));
    fireEvent.click(await screen.findByText(/Emote buttons/));

    fireEvent.change(screen.getByLabelText('Animation', { selector: '#emote-anim-celebrate' }), {
      target: { value: 'happy' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save portrait/i }));

    await waitFor(async () => {
      const saved = await portraitRepo.get(portrait.id);
      const binding = saved?.emotes.find((b) => b.emote === 'celebrate');
      expect(binding?.presentation).toEqual([{ type: 'animation', state: 'happy' }]);
    });
  });

  it('stores custom bubble text for a static portrait', async () => {
    const character = await seed();
    const portrait = await portraitRepo.save({
      ...persistedBase(),
      characterId: character.id,
      kind: 'static',
      blobId: 'none',
      name: 'Painting',
      spritesheet: null,
      states: [],
      defaultState: 'idle',
      emotes: [],
    });

    renderPortraitTab(character.id);
    await waitFor(() => expect(screen.getByText('Painting')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /configure/i }));
    fireEvent.click(await screen.findByText(/Emote buttons/));

    fireEvent.change(screen.getByLabelText('Bubble text', { selector: '#emote-bubble-laugh' }), {
      target: { value: 'Hah!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save portrait/i }));

    await waitFor(async () => {
      const saved = await portraitRepo.get(portrait.id);
      expect(saved?.emotes.find((b) => b.emote === 'laugh')?.presentation).toEqual([
        { type: 'bubble', text: 'Hah!' },
      ]);
    });
  });

  it('explains that a static portrait still reacts', async () => {
    const character = await seed();
    await portraitRepo.save({
      ...persistedBase(),
      characterId: character.id,
      kind: 'static',
      blobId: 'none',
      name: 'Painting',
      spritesheet: null,
      states: [],
      defaultState: 'idle',
      emotes: [],
    });

    renderPortraitTab(character.id);
    await waitFor(() => expect(screen.getByText('Painting')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /configure/i }));
    fireEvent.click(await screen.findByText(/Emote buttons/));

    expect(await screen.findByText(/show a bubble and a small pulse/i)).toBeDefined();
  });
});
