import { useMemo } from 'react';
import { useCollections } from '../../rules/RulesProvider';
import type { LevelUpContext } from '../../engine/levelUp';
import type { AbilityId } from '../../rules/schemas/primitives';

/**
 * Builds the rules context the level-up engine needs.
 *
 * The subclass level per class is derived from the data rather than hardcoded: it is the
 * lowest level at which any subclass feature for that class appears. That keeps Cleric at 1 and
 * Fighter at 3 without a table to maintain, and picks up homebrew subclasses automatically.
 */
export function useLevelUpContext(): { context: LevelUpContext | null; loading: boolean } {
  const { data, isLoading } = useCollections(['levels', 'features', 'classes', 'subclasses']);

  const context = useMemo(() => {
    if (!data) return null;

    // Rows carrying a `subclass` field are subclass progression yet still report the parent
    // class, so they must be excluded before anything is counted.
    const classRows = data.levels.filter((l) => !l.subclass);

    const subclassLevelByClass: Record<string, number> = {};
    for (const feature of data.features) {
      if (!feature.subclass) continue;
      const current = subclassLevelByClass[feature.class.index];
      if (current === undefined || feature.level < current) {
        subclassLevelByClass[feature.class.index] = feature.level;
      }
    }

    const multiclassPrerequisites: Record<string, { ability: AbilityId; minimum: number }[]> = {};
    for (const cls of data.classes) {
      const direct = cls.multi_classing?.prerequisites ?? [];
      if (direct.length > 0) {
        multiclassPrerequisites[cls.index] = direct.map((p) => ({
          ability: p.ability_score.index as AbilityId,
          minimum: p.minimum_score,
        }));
      }
    }

    return {
      levelRows: classRows.map((l) => ({
        classIndex: l.class.index,
        level: l.level,
        abilityScoreBonuses: l.ability_score_bonuses,
        features: l.features,
        spellcasting: l.spellcasting as Record<string, number> | undefined,
        classSpecific: l.class_specific,
      })),
      features: data.features.map((f) => ({
        index: f.index,
        name: f.name,
        desc: f.desc,
        classIndex: f.class.index,
        subclassIndex: f.subclass?.index ?? null,
        level: f.level,
      })),
      hitDieByClass: Object.fromEntries(data.classes.map((c) => [c.index, c.hit_die])),
      multiclassPrerequisites,
      subclassLevelByClass,
    } satisfies LevelUpContext;
  }, [data]);

  return { context, loading: isLoading };
}
