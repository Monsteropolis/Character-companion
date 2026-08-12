import { useEffect, useMemo, useState } from 'react';
import { useCollections } from '../../rules/RulesProvider';
import { Panel, Button, Spinner, SourceBadge } from '../../ui/primitives';
import { TextInput } from '../creation/steps/parts';
import type { InventoryItem, ItemCategory } from '../../domain/types';

/** Results per slice. Enough that most searches never need a second one. */
const PAGE = 40;

/**
 * Browse SRD equipment and magic items.
 *
 * Selecting an item snapshots its mechanical stats onto the inventory entry rather than storing
 * a reference, so the item keeps working -- and stays editable -- even if the rules entry is
 * later changed or removed.
 */
export function AddFromCatalogue({
  onAdd,
  onCancel,
}: {
  onAdd: (fields: Partial<InventoryItem>) => void;
  onCancel: () => void;
}) {
  const { data, isLoading } = useCollections(['equipment', 'magic-items']);
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    if (!data) return [];
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) return [];

    const equipment = data.equipment
      .filter((e) => e.name.toLowerCase().includes(needle))
      .map((e) => ({ doc: e, magical: false }));

    const magic = data['magic-items']
      .filter((m) => m.name.toLowerCase().includes(needle))
      .map((m) => ({ doc: m, magical: true }));

    return [...equipment, ...magic];
  }, [data, query]);

  // Results render in slices, and the count says so. Silently truncating a search is worse than
  // a long list: the item you wanted is missing and nothing tells you it was ever there.
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [query]);
  const shown = results.slice(0, limit);

  return (
    <Panel className="mb-4 p-4">
      <h3 className="display-face mb-3 font-semibold">Add from the rules</h3>

      <TextInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search equipment and magic items"
        aria-label="Search equipment"
        autoFocus
      />

      {isLoading ? <Spinner label="Loading equipment" /> : null}

      {!isLoading && query.trim().length < 2 ? (
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Type at least two letters. The SRD includes 237 pieces of equipment and 362 magic items.
        </p>
      ) : null}

      {!isLoading && query.trim().length >= 2 && results.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Nothing matches. The SRD is a subset of the rules — use “Create item” for anything it
          does not include.
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul className="mt-3 max-h-80 space-y-1 overflow-y-auto">
          {shown.map(({ doc, magical }) => (
            <li key={`${magical ? 'm' : 'e'}-${doc.index}`}>
              <button
                type="button"
                onClick={() => onAdd(toInventoryFields(doc, magical))}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--border-strong)] p-2 text-left text-sm hover:bg-[var(--accent-subtle)]"
              >
                <span>
                  <span className="block font-medium">{doc.name}</span>
                  <span className="block text-xs text-[var(--text-muted)]">
                    {describe(doc, magical)}
                  </span>
                </span>
                <SourceBadge source="srd" />
              </button>
            </li>
          ))}
          {results.length > shown.length ? (
            <li className="flex flex-col items-center gap-1 pt-2">
              <span role="status" className="text-xs text-[var(--text-muted)]">
                Showing {shown.length} of {results.length} matches.
              </span>
              <Button variant="ghost" onClick={() => setLimit((current) => current + PAGE)}>
                Show more
              </Button>
            </li>
          ) : null}
        </ul>
      ) : null}

      <div className="mt-3">
        <Button variant="ghost" onClick={onCancel}>
          Close
        </Button>
      </div>
    </Panel>
  );
}

function describe(doc: Record<string, any>, magical: boolean): string {
  if (magical) return `${doc.rarity?.name ?? 'Magic item'} · magic item`;
  const bits: string[] = [];
  if (doc.armor_category) bits.push(`${doc.armor_category} armour`);
  if (doc.weapon_category) bits.push(`${doc.category_range ?? doc.weapon_category} weapon`);
  if (doc.damage?.damage_dice) bits.push(doc.damage.damage_dice);
  if (doc.armor_class) bits.push(`AC ${doc.armor_class.base}`);
  if (typeof doc.weight === 'number') bits.push(`${doc.weight} lb`);
  if (doc.cost) bits.push(`${doc.cost.quantity} ${doc.cost.unit}`);
  return bits.join(' · ') || 'Adventuring gear';
}

/**
 * Snapshots a rules document into inventory fields.
 *
 * Shared shape with the creation wizard's resolver, so an item added mid-campaign behaves
 * identically to one granted at character creation.
 */
export function toInventoryFields(
  doc: Record<string, any>,
  magical: boolean,
): Partial<InventoryItem> {
  const category = categoryFor(doc, magical);
  const fields: Partial<InventoryItem> = {
    ref: { source: 'srd', index: doc.index, name: doc.name },
    name: doc.name,
    category,
    weight: typeof doc.weight === 'number' ? doc.weight : 0,
    magical,
    description: Array.isArray(doc.desc) ? doc.desc.join('\n\n') : '',
  };

  if (doc.armor_class) {
    fields.armor = {
      base: doc.armor_class.base,
      dexBonus: doc.armor_class.dex_bonus,
      maxDex: doc.armor_class.max_bonus ?? null,
      strMinimum: doc.str_minimum ?? 0,
      stealthDisadvantage: doc.stealth_disadvantage ?? false,
      isShield: doc.armor_category === 'Shield',
    };
  }

  if (doc.damage?.damage_dice) {
    fields.weapon = {
      damageDice: doc.damage.damage_dice,
      damageType: doc.damage.damage_type?.name ?? 'Bludgeoning',
      versatileDice: doc.two_handed_damage?.damage_dice ?? null,
      ranged: doc.weapon_range === 'Ranged',
      properties: (doc.properties ?? []).map((p: { name: string }) => p.name),
      categoryProficiency:
        doc.weapon_category === 'Martial' ? 'martial-weapons' : 'simple-weapons',
      rangeNormal: doc.range?.normal ?? null,
      rangeLong: doc.range?.long ?? null,
    };
  }

  return fields;
}

function categoryFor(doc: Record<string, any>, magical: boolean): ItemCategory {
  const index = doc.equipment_category?.index ?? '';
  if (doc.armor_class || index === 'armor') return 'armor';
  if (doc.damage?.damage_dice || index === 'weapon') return 'weapon';
  if (index === 'tools') return 'tool';
  if (index === 'potion' || /potion/i.test(doc.name)) return 'consumable';
  if (magical) return 'misc';
  return 'misc';
}
