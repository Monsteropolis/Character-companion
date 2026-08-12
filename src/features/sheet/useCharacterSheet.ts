import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCollections } from '../../rules/RulesProvider';
import {
  characters as characterRepo,
  inventory as inventoryRepo,
  journal as journalRepo,
  notes as notesRepo,
  portraits as portraitRepo,
} from '../../persistence/repositories';
import { deriveCharacter, emptyResolvedRules, type ResolvedRules, type DerivedStats } from '../../engine/derive';
import { deriveClassResources, type ClassLevelRow, type ResourcePool, type ClassStat } from '../../engine/classResources';
import { deriveSpellcasting, type LevelSlotRow, type SpellcastingSnapshot } from '../../engine/spellcasting';
import type { AbilityId } from '../../rules/schemas/primitives';
import { resolveBlobUrls } from '../portraits/assets';
import type { Character, InventoryItem, JournalEntry, Note, PortraitAsset } from '../../domain/types';

/**
 * Loads a character and everything needed to derive its statistics.
 *
 * The resolver that turns rules documents into `ResolvedRules` lives here rather than in the
 * engine, so the engine stays free of the dataset's field names and the sheet, the creation
 * preview and the level-up flow can all feed it the same shape.
 */

export interface CharacterSheet {
  character: Character | null;
  items: InventoryItem[];
  stats: DerivedStats | null;
  features: { index: string; name: string; desc: string[]; source: string }[];
  /** Trackable class pools -- rage, ki, second wind -- for casters and non-casters alike. */
  pools: ResourcePool[];
  /** Level-scaled reference values such as Sneak Attack dice or Extra Attack. */
  classStats: ClassStat[];
  spellcasting: SpellcastingSnapshot | null;
  journal: JournalEntry[];
  notes: Note[];
  /**
   * Portraits live here rather than in each component so the play bar, the gallery and the
   * portrait manager all read one list -- otherwise uploading a portrait leaves the play bar
   * showing a stale placeholder until the page is reloaded.
   */
  portraits: PortraitAsset[];
  portraitUrls: Map<string, string>;
  activePortrait: PortraitAsset | null;
  savePortrait: (portrait: PortraitAsset) => Promise<PortraitAsset>;
  removePortrait: (id: string) => Promise<void>;
  loading: boolean;
  error: string | null;
  update: (patch: Partial<Character>) => Promise<void>;
  saveItem: (item: InventoryItem) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  saveEntry: (entry: JournalEntry) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
  saveNote: (note: Note) => Promise<void>;
  removeNote: (id: string) => Promise<void>;
  reload: () => Promise<void>;
}

export function useCharacterSheet(characterId: string | undefined): CharacterSheet {
  const [character, setCharacter] = useState<Character | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [portraitList, setPortraitList] = useState<PortraitAsset[]>([]);
  const [portraitUrls, setPortraitUrls] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const rulesQuery = useCollections([
    'races', 'subraces', 'classes', 'subclasses', 'backgrounds',
    'skills', 'levels', 'features', 'traits',
  ]);

  /**
   * A refresh keeps the current view on screen.
   *
   * Only the first load shows the spinner. Blanking the sheet whenever something is saved
   * unmounts the tab, taking its state with it -- a level-up confirmation, a half-written form,
   * the scroll position -- and flashes at the table for no benefit.
   */
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    if (!characterId) return;
    if (!loadedOnce.current) setLoading(true);
    try {
      const found = await characterRepo.get(characterId);
      if (!found) {
        setError('That character no longer exists.');
        setCharacter(null);
      } else {
        setCharacter(found);
        const [loadedItems, loadedJournal, loadedNotes, loadedPortraits] = await Promise.all([
          inventoryRepo.list(characterId),
          journalRepo.list(characterId),
          notesRepo.list(characterId),
          portraitRepo.listForCharacter(characterId),
        ]);
        setItems(loadedItems);
        setJournal(loadedJournal);
        setNotes(loadedNotes);
        setPortraitList(loadedPortraits);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this character.');
    } finally {
      loadedOnce.current = true;
      setLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    // A different character is a first load again, spinner and all.
    loadedOnce.current = false;
    void load();
  }, [load]);

  /**
   * Writes through to storage before updating memory.
   *
   * The reverse order would let the UI show saved-looking state that was never persisted --
   * the worst possible failure for a character sheet used at a table.
   */
  const update = useCallback(
    async (patch: Partial<Character>) => {
      if (!character) return;
      const next = { ...character, ...patch };
      const saved = await characterRepo.save(next);
      setCharacter(saved);
    },
    [character],
  );

  /**
   * Item writes go through storage first, then update memory.
   *
   * The local list is patched rather than refetched so equipping an item feels instant --
   * a round trip to IndexedDB on every toggle is visible on a phone at a table.
   */
  const saveItem = useCallback(async (item: InventoryItem) => {
    const saved = await inventoryRepo.save(item);
    setItems((current) => {
      const exists = current.some((i) => i.id === saved.id);
      return exists ? current.map((i) => (i.id === saved.id ? saved : i)) : [...current, saved];
    });
  }, []);

  const removeItem = useCallback(async (id: string) => {
    await inventoryRepo.remove(id);
    setItems((current) => current.filter((i) => i.id !== id));
  }, []);

  const saveEntry = useCallback(async (entry: JournalEntry) => {
    const saved = await journalRepo.save(entry);
    setJournal((current) =>
      current.some((e) => e.id === saved.id)
        ? current.map((e) => (e.id === saved.id ? saved : e))
        : [...current, saved],
    );
  }, []);

  const removeEntry = useCallback(async (id: string) => {
    await journalRepo.remove(id);
    setJournal((current) => current.filter((e) => e.id !== id));
  }, []);

  const saveNote = useCallback(async (note: Note) => {
    const saved = await notesRepo.save(note);
    setNotes((current) =>
      current.some((n) => n.id === saved.id)
        ? current.map((n) => (n.id === saved.id ? saved : n))
        : [...current, saved],
    );
  }, []);

  const removeNote = useCallback(async (id: string) => {
    await notesRepo.remove(id);
    setNotes((current) => current.filter((n) => n.id !== id));
    // Links pointing at a deleted note are cleaned up so no entry shows a dangling reference.
    setJournal((current) =>
      current.map((e) => ({ ...e, links: e.links.filter((l) => l.noteId !== id) })),
    );
  }, []);

  const savePortrait = useCallback(async (portrait: PortraitAsset) => {
    const saved = await portraitRepo.save(portrait);
    setPortraitList((current) =>
      current.some((p) => p.id === saved.id)
        ? current.map((p) => (p.id === saved.id ? saved : p))
        : [...current, saved],
    );
    return saved;
  }, []);

  const removePortrait = useCallback(async (id: string) => {
    await portraitRepo.remove(id);
    setPortraitList((current) => current.filter((p) => p.id !== id));
  }, []);

  // Object URLs are keyed on the blob ids, so renaming a state does not churn them, and are
  // revoked whenever that set changes or the sheet unmounts.
  const blobKey = portraitList
    .flatMap((p) => [p.blobId, ...p.states.map((s) => s.blobId)])
    .filter(Boolean)
    .join(',');

  useEffect(() => {
    let cancelled = false;
    let created: string[] = [];

    void resolveBlobUrls([...new Set(blobKey.split(',').filter(Boolean))]).then((map) => {
      created = [...map.values()];
      if (cancelled) {
        created.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      setPortraitUrls(map);
    });

    return () => {
      cancelled = true;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [blobKey]);

  const { rules, features, levelRows } = useMemo(() => {
    const data = rulesQuery.data;
    if (!data || !character) {
      return {
        rules: emptyResolvedRules(),
        features: [] as CharacterSheet['features'],
        levelRows: [] as (typeof rulesQuery.data extends undefined ? never : any)[],
      };
    }

    const race = data.races.find((r) => r.index === character.race.raceRef?.index);
    const subrace = data.subraces.find((s) => s.index === character.race.subraceRef?.index);

    const featureIndices: string[] = [];
    const featureNames: Record<string, string> = {};
    const featureList: CharacterSheet['features'] = [];

    for (const cls of character.classes) {
      for (const feature of data.features) {
        if (feature.class.index !== cls.classRef.index) continue;
        if (feature.level > cls.level) continue;
        // Subclass features only apply once that subclass has been chosen.
        if (feature.subclass && feature.subclass.index !== cls.subclassRef?.index) continue;
        featureIndices.push(feature.index);
        featureNames[feature.index] = feature.name;
        featureList.push({
          index: feature.index,
          name: feature.name,
          desc: feature.desc,
          source: feature.subclass?.name ?? cls.classRef.name,
        });
      }
    }

    for (const traitRef of [...(race?.traits ?? []), ...(subrace?.racial_traits ?? [])]) {
      const trait = data.traits.find((t) => t.index === traitRef.index);
      featureIndices.push(traitRef.index);
      featureNames[traitRef.index] = traitRef.name;
      featureList.push({
        index: traitRef.index,
        name: traitRef.name,
        desc: trait?.desc ?? [],
        source: subrace?.name ?? race?.name ?? 'Race',
      });
    }

    if (character.background.feature) {
      featureList.push({
        index: 'background-feature',
        name: character.background.feature.name,
        desc: character.background.feature.desc,
        source: character.background.ref?.name ?? 'Background',
      });
    }

    for (const custom of character.customFeatures) {
      featureList.push({
        index: custom.id,
        name: custom.name,
        desc: [custom.description],
        source: custom.source || 'Custom',
      });
    }

    const resolved: ResolvedRules = {
      ...emptyResolvedRules(),
      skills: data.skills.map((s) => ({
        index: s.index,
        name: s.name,
        ability: s.ability_score.index as AbilityId,
      })),
      raceSpeed: race?.speed ?? 30,
      hitDieByClass: Object.fromEntries(data.classes.map((c) => [c.index, c.hit_die])),
      savingThrowsByClass: Object.fromEntries(
        data.classes.map((c) => [c.index, c.saving_throws.map((s) => s.index as AbilityId)]),
      ),
      spellcastingAbilityByClass: Object.fromEntries(
        data.classes
          .filter((c) => c.spellcasting)
          .map((c) => [c.index, c.spellcasting!.spellcasting_ability.index as AbilityId]),
      ),
      featureIndices,
      featureNames,
    };

    // Class progression rows only: rows carrying a `subclass` field are subclass progression
    // yet still report the parent class, which would double-count levels.
    const classRows = data.levels.filter((l) => !l.subclass);

    return { rules: resolved, features: featureList, levelRows: classRows };
  }, [rulesQuery.data, character]);

  const stats = useMemo(
    () => (character ? deriveCharacter(character, rules, items) : null),
    [character, rules, items],
  );

  const { pools, classStats } = useMemo(() => {
    if (!character || !stats) return { pools: [] as ResourcePool[], classStats: [] as ClassStat[] };
    const rows: ClassLevelRow[] = levelRows.map((l: any) => ({
      classIndex: l.class.index,
      level: l.level,
      classSpecific: l.class_specific,
    }));
    const derived = deriveClassResources(character, rows, stats.abilityModifiers);
    return { pools: derived.pools, classStats: derived.stats };
  }, [character, stats, levelRows]);

  const spellcasting = useMemo(() => {
    if (!character || !stats || !rulesQuery.data) return null;
    const rows: LevelSlotRow[] = levelRows.map((l: any) => {
      const slots: Record<number, number> = {};
      const sc = l.spellcasting ?? {};
      for (let level = 1; level <= 9; level++) {
        const value = sc[`spell_slots_level_${level}`];
        if (typeof value === 'number' && value > 0) slots[level] = value;
      }
      return {
        classIndex: l.class.index,
        level: l.level,
        slots,
        cantripsKnown: sc.cantrips_known ?? 0,
        spellsKnown: sc.spells_known ?? null,
      };
    });

    const classNames = Object.fromEntries(
      rulesQuery.data.classes.map((c) => [c.index, c.name]),
    );

    return deriveSpellcasting(
      character,
      rows,
      stats.abilityModifiers,
      rules.spellcastingAbilityByClass,
      classNames,
    );
  }, [character, stats, levelRows, rules, rulesQuery.data]);

  return {
    character,
    items,
    stats,
    features,
    pools,
    classStats,
    spellcasting,
    journal,
    notes,
    portraits: portraitList,
    portraitUrls,
    activePortrait: portraitList.find((p) => p.id === character?.portraitId) ?? null,
    savePortrait,
    removePortrait,
    loading: loading || rulesQuery.isLoading,
    error,
    update,
    saveItem,
    removeItem,
    saveEntry,
    removeEntry,
    saveNote,
    removeNote,
    reload: load,
  };
}
