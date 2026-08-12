import { useMemo, useState } from 'react';
import { useSheet } from '../sheet/CharacterShell';
import { CurrencyPanel } from './CurrencyPanel';
import { ItemEditor } from './ItemEditor';
import { AddFromCatalogue } from './AddFromCatalogue';
import { Panel, Button, EmptyState, SourceBadge } from '../../ui/primitives';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { TextInput } from '../creation/steps/parts';
import { createInventoryItem } from '../../domain/factories';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  ATTUNEMENT_LIMIT,
  attunedCount,
  conflictingArmor,
  isEquippable,
  itemWeight,
} from '../../engine/inventory';
import type { InventoryItem, ItemCategory } from '../../domain/types';

/**
 * Inventory.
 *
 * Equipping is the point of this screen: toggling a suit of armour or a weapon has to visibly
 * move the numbers in the play bar above, because that feedback is what makes the sheet feel
 * like a live character rather than a form.
 */
export function InventoryTab() {
  const { character, items, stats, update, saveItem, removeItem } = useSheet();
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<InventoryItem | null>(null);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const visible = items.filter(
      (i) => !needle || i.name.toLowerCase().includes(needle) || i.description.toLowerCase().includes(needle),
    );
    const map = new Map<ItemCategory, InventoryItem[]>();
    for (const item of visible) {
      map.set(item.category, [...(map.get(item.category) ?? []), item]);
    }
    return CATEGORY_ORDER.filter((c) => (map.get(c) ?? []).length > 0).map(
      (c) => [c, map.get(c)!] as const,
    );
  }, [items, query]);

  if (!character || !stats) return null;

  const attuned = attunedCount(items);
  const overAttuned = attuned > ATTUNEMENT_LIMIT;

  async function toggleEquipped(item: InventoryItem) {
    if (!item.equipped) {
      // Wearing two suits of body armour is not possible, so the previous one comes off.
      const conflict = conflictingArmor(items, item);
      if (conflict) {
        await saveItem({ ...conflict, equipped: false });
        setNotice(`${conflict.name} removed to make room for ${item.name}.`);
      }
    }
    await saveItem({ ...item, equipped: !item.equipped });
  }

  async function toggleAttuned(item: InventoryItem) {
    await saveItem({ ...item, attuned: !item.attuned });
  }

  async function addNew(fields: Partial<InventoryItem> = {}) {
    if (!character) return;
    const item = createInventoryItem(character.id, fields);
    setEditing(item);
    setBrowsing(false);
  }

  return (
    <div className="space-y-4">
      <Panel className="p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="display-face font-semibold">Carrying</h2>
          <span className="text-sm">
            <strong>{stats.currentWeight.toFixed(1)}</strong>
            <span className="text-[var(--text-muted)]"> / {stats.carryingCapacity} lb</span>
          </span>
        </div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--accent-subtle)]"
          role="meter"
          aria-valuenow={Math.round(stats.currentWeight)}
          aria-valuemin={0}
          aria-valuemax={stats.carryingCapacity}
          aria-label="Carried weight"
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, (stats.currentWeight / Math.max(1, stats.carryingCapacity)) * 100)}%`,
              background:
                stats.encumbrance === 'none'
                  ? 'var(--success)'
                  : stats.encumbrance === 'encumbered'
                    ? 'var(--warning)'
                    : 'var(--danger)',
            }}
          />
        </div>
        {stats.encumbrance !== 'none' ? (
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            {/* Named in words as well as colour, so the state is not colour-only. */}
            {stats.encumbrance === 'encumbered'
              ? 'Encumbered: speed reduced by 10 feet (variant rule).'
              : stats.encumbrance === 'heavily-encumbered'
                ? 'Heavily encumbered: speed reduced by 20 feet, disadvantage on many rolls (variant rule).'
                : 'Over your maximum carrying capacity.'}
          </p>
        ) : null}
      </Panel>

      <CurrencyPanel
        currency={character.currency}
        onChange={(currency) => void update({ currency })}
      />

      <div className="flex flex-wrap items-center gap-2">
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your inventory"
          aria-label="Search inventory"
          className="flex-1"
        />
        <Button variant="secondary" onClick={() => setBrowsing(true)}>
          Add from rules
        </Button>
        <Button variant="primary" onClick={() => void addNew()}>
          Create item
        </Button>
      </div>

      {notice ? (
        <p role="status" className="rounded-lg border border-[var(--border-strong)] p-3 text-sm text-[var(--text-muted)]">
          {notice}
        </p>
      ) : null}

      {overAttuned ? (
        <p
          role="alert"
          className="rounded-lg border border-[var(--warning)] p-3 text-sm"
        >
          Attuned to {attuned} items. The limit is {ATTUNEMENT_LIMIT} — this is allowed here in
          case your DM has ruled otherwise, but it is worth checking.
        </p>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">
          Attunement: {attuned} of {ATTUNEMENT_LIMIT}
        </p>
      )}

      {browsing ? (
        <AddFromCatalogue onAdd={(fields) => void addNew(fields)} onCancel={() => setBrowsing(false)} />
      ) : null}

      {editing ? (
        <ItemEditor
          item={editing}
          onChange={setEditing}
          onSave={async () => {
            await saveItem(editing);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      ) : null}

      {items.length === 0 && !editing && !browsing ? (
        <EmptyState
          icon="🎒"
          title="Nothing carried yet"
          description="Add gear from the rules, or create anything your DM handed you."
        />
      ) : null}

      {grouped.length === 0 && items.length > 0 ? (
        <EmptyState title="Nothing matches" description="Try a different search term." />
      ) : null}

      {grouped.map(([category, list]) => (
        <section key={category}>
          <h2 className="display-face mb-2 font-semibold">{CATEGORY_LABELS[category]}</h2>
          <ul className="space-y-2">
            {list.map((item) => (
              <li key={item.id}>
                <ItemRow
                  item={item}
                  onToggleEquipped={() => void toggleEquipped(item)}
                  onToggleAttuned={() => void toggleAttuned(item)}
                  onEdit={() => setEditing(item)}
                  onDelete={() => setPendingDelete(item)}
                  onQuantity={(quantity) => void saveItem({ ...item, quantity })}
                  onCharges={(current) =>
                    void saveItem({ ...item, charges: { ...item.charges!, current } })
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      ))}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Remove this item?"
        description={pendingDelete ? `"${pendingDelete.name}" will be removed from your inventory.` : ''}
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          if (pendingDelete) await removeItem(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function ItemRow({
  item,
  onToggleEquipped,
  onToggleAttuned,
  onEdit,
  onDelete,
  onQuantity,
  onCharges,
}: {
  item: InventoryItem;
  onToggleEquipped: () => void;
  onToggleAttuned: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onQuantity: (quantity: number) => void;
  onCharges: (current: number) => void;
}) {
  return (
    <details className="panel p-3">
      <summary className="flex cursor-pointer items-center gap-2">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium">{item.name}</span>
            {item.quantity !== 1 ? (
              <span className="text-sm text-[var(--text-muted)]">×{item.quantity}</span>
            ) : null}
            {item.equipped ? (
              <span className="rounded-full bg-[var(--accent-subtle)] px-2 py-0.5 text-[0.625rem] font-medium tracking-wide uppercase">
                Equipped
              </span>
            ) : null}
            {item.attuned ? (
              <span className="rounded-full border border-[var(--border-strong)] px-2 py-0.5 text-[0.625rem] tracking-wide uppercase">
                Attuned
              </span>
            ) : null}
            <SourceBadge source={item.ref ? 'srd' : 'custom'} />
          </span>
          <span className="block text-xs text-[var(--text-muted)]">
            {itemWeight(item).toFixed(1)} lb
            {item.charges ? ` · ${item.charges.current}/${item.charges.max} charges` : ''}
            {item.magical ? ' · magical' : ''}
          </span>
        </span>
      </summary>

      <div className="mt-3 space-y-3 border-t border-[var(--border)] pt-3">
        {item.description ? (
          <p className="text-sm text-[var(--text-muted)] whitespace-pre-line">{item.description}</p>
        ) : null}
        {item.notes ? <p className="text-sm italic text-[var(--text-muted)]">{item.notes}</p> : null}

        <div className="flex flex-wrap items-center gap-2">
          {isEquippable(item.category) ? (
            <Button variant={item.equipped ? 'primary' : 'secondary'} onClick={onToggleEquipped}>
              {item.equipped ? 'Unequip' : 'Equip'}
            </Button>
          ) : null}

          {item.magical ? (
            <Button variant={item.attuned ? 'primary' : 'secondary'} onClick={onToggleAttuned}>
              {item.attuned ? 'End attunement' : 'Attune'}
            </Button>
          ) : null}

          <label className="flex items-center gap-2 text-sm">
            <span className="text-[var(--text-muted)]">Qty</span>
            <input
              type="number"
              min={0}
              value={item.quantity}
              aria-label={`Quantity of ${item.name}`}
              onChange={(e) => onQuantity(Math.max(0, Number(e.target.value) || 0))}
              className="min-h-11 w-20 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-base)] px-2 text-sm"
            />
          </label>

          {item.charges ? (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                onClick={() => onCharges(Math.max(0, item.charges!.current - 1))}
                aria-label={`Use a charge of ${item.name}`}
              >
                Use charge
              </Button>
              <Button
                variant="ghost"
                onClick={() => onCharges(item.charges!.max)}
                aria-label={`Restore charges of ${item.name}`}
              >
                Restore
              </Button>
            </div>
          ) : null}

          <Button variant="ghost" onClick={onEdit}>
            Edit
          </Button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Remove ${item.name}`}
            className="min-h-11 rounded-md px-2 text-sm text-[var(--danger)] hover:bg-[var(--accent-subtle)]"
          >
            Remove
          </button>
        </div>
      </div>
    </details>
  );
}
