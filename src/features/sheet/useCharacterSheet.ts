import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCollections } from '../../rules/RulesProvider';
import { characters as characterRepo, inventory as inventoryRepo } from '../../persistence/repositories';
import { deriveCharacter, emptyResolvedRules, type ResolvedRules, type DerivedStats } from '../../engine/derive';
import type { AbilityId } from '../../rules/schemas/primitives';
import type { Character, InventoryItem } from '../../domain/types';

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
  loading: boolean;
  error: string | null;
  update: (patch: Partial<Character>) => Promise<void>;
  reload: () => Promise<void>;
}

export function useCharacterSheet(characterId: string | undefined): CharacterSheet {
  const [character, setCharacter] = useState<Character | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const rulesQuery = useCollections([
    'races', 'subraces', 'classes', 'subclasses', 'backgrounds',
    'skills', 'levels', 'features', 'traits',
  ]);

  const load = useCallback(async () => {
    if (!characterId) return;
    setLoading(true);
    try {
      const found = await characterRepo.get(characterId);
      if (!found) {
        setError('That character no longer exists.');
        setCharacter(null);
      } else {
        setCharacter(found);
        setItems(await inventoryRepo.list(characterId));
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this character.');
    } finally {
      setLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
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

  const { rules, features } = useMemo(() => {
    const data = rulesQuery.data;
    if (!data || !character) {
      return { rules: emptyResolvedRules(), features: [] as CharacterSheet['features'] };
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

    return { rules: resolved, features: featureList };
  }, [rulesQuery.data, character]);

  const stats = useMemo(
    () => (character ? deriveCharacter(character, rules, items) : null),
    [character, rules, items],
  );

  return {
    character,
    items,
    stats,
    features,
    loading: loading || rulesQuery.isLoading,
    error,
    update,
    reload: load,
  };
}
