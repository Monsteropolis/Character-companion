import { create } from 'zustand';
import { characters as repo } from '../../persistence/repositories';
import type { Character } from '../../domain/types';

/**
 * Character library state.
 *
 * Kept separate from the rules cache: rules data is immutable, re-fetchable server state, while
 * characters are user-owned documents whose loss is unrecoverable. Every mutation writes through
 * to IndexedDB before updating memory, so a crash cannot leave the UI showing saved-looking data
 * that was never persisted.
 */

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

interface CharacterStore {
  characters: Character[];
  status: LoadState;
  error: string | null;

  load: () => Promise<void>;
  create: (partial?: Partial<Character>) => Promise<Character | null>;
  update: (character: Character) => Promise<void>;
  duplicate: (id: string) => Promise<Character | null>;
  setArchived: (id: string, archived: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : 'Unexpected error';
}

export const useCharacterStore = create<CharacterStore>((set, get) => ({
  characters: [],
  status: 'idle',
  error: null,

  async load() {
    set({ status: 'loading', error: null });
    try {
      set({ characters: await repo.list(), status: 'ready' });
    } catch (err) {
      set({ status: 'error', error: message(err) });
    }
  },

  async create(partial = {}) {
    try {
      const created = await repo.create(partial);
      set({ characters: [created, ...get().characters] });
      return created;
    } catch (err) {
      set({ error: message(err) });
      return null;
    }
  },

  async update(character) {
    try {
      const saved = await repo.save(character);
      set({
        characters: get().characters.map((c) => (c.id === saved.id ? saved : c)),
      });
    } catch (err) {
      set({ error: message(err) });
    }
  },

  async duplicate(id) {
    try {
      const copy = await repo.duplicate(id);
      if (copy) set({ characters: [copy, ...get().characters] });
      return copy;
    } catch (err) {
      set({ error: message(err) });
      return null;
    }
  },

  async setArchived(id, archived) {
    try {
      await repo.setArchived(id, archived);
      set({
        characters: get().characters.map((c) => (c.id === id ? { ...c, archived } : c)),
      });
    } catch (err) {
      set({ error: message(err) });
    }
  },

  async remove(id) {
    try {
      await repo.remove(id);
      set({ characters: get().characters.filter((c) => c.id !== id) });
    } catch (err) {
      set({ error: message(err) });
    }
  },
}));
