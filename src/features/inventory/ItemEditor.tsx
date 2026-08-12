import { Panel, Button } from '../../ui/primitives';
import { Field, TextInput, TextArea, Select } from '../creation/steps/parts';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../../engine/inventory';
import type { InventoryItem, ItemCategory } from '../../domain/types';

/**
 * Item editor.
 *
 * Everything is editable, including items that came from the SRD. A DM hands out a "+1 longsword
 * that hums near orcs", and a sheet that refuses to represent that gets abandoned. Armour and
 * weapon stats are exposed too, so a fully custom item drives AC and attack rolls exactly as an
 * official one does.
 */
export function ItemEditor({
  item,
  onChange,
  onSave,
  onCancel,
}: {
  item: InventoryItem;
  onChange: (item: InventoryItem) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = <K extends keyof InventoryItem>(key: K, value: InventoryItem[K]) =>
    onChange({ ...item, [key]: value });

  return (
    <Panel className="mb-4 p-4">
      <h3 className="display-face mb-3 font-semibold">
        {item.name ? `Edit ${item.name}` : 'New item'}
      </h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="item-name">
          <TextInput
            id="item-name"
            value={item.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. Rope, silk (50 feet)"
          />
        </Field>

        <Field label="Category" htmlFor="item-category">
          <Select
            id="item-category"
            value={item.category}
            onChange={(e) => set('category', e.target.value as ItemCategory)}
          >
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Quantity" htmlFor="item-qty">
          <NumberField
            id="item-qty"
            value={item.quantity}
            min={0}
            onChange={(v) => set('quantity', v)}
          />
        </Field>

        <Field label="Weight each (lb)" htmlFor="item-weight">
          <NumberField
            id="item-weight"
            value={item.weight}
            min={0}
            step={0.1}
            onChange={(v) => set('weight', v)}
          />
        </Field>
      </div>

      <Field label="Description" htmlFor="item-desc">
        <TextArea
          id="item-desc"
          value={item.description}
          onChange={(e) => set('description', e.target.value)}
          rows={3}
        />
      </Field>

      <Field label="Notes" htmlFor="item-notes" hint="Private reminders — attunement conditions, who gave it to you.">
        <TextInput
          id="item-notes"
          value={item.notes}
          onChange={(e) => set('notes', e.target.value)}
        />
      </Field>

      <div className="mb-4 flex flex-wrap gap-4">
        <Check label="Magical" checked={item.magical} onChange={(v) => set('magical', v)} />
        <Check
          label="Weightless"
          checked={item.weightless}
          onChange={(v) => set('weightless', v)}
        />
      </div>

      {item.category === 'armor' ? (
        <fieldset className="mb-4 rounded-lg border border-[var(--border)] p-3">
          <legend className="px-1 text-sm font-medium">Armour</legend>
          <p className="mb-2 text-xs text-[var(--text-muted)]">
            These values drive your armour class directly.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Base AC" htmlFor="armor-base">
              <NumberField
                id="armor-base"
                value={item.armor?.base ?? 11}
                onChange={(v) => set('armor', { ...defaultArmor(item), base: v })}
              />
            </Field>
            <Field label="Max DEX bonus" htmlFor="armor-maxdex" hint="Leave empty for uncapped.">
              <input
                id="armor-maxdex"
                type="number"
                value={item.armor?.maxDex ?? ''}
                placeholder="uncapped"
                onChange={(e) =>
                  set('armor', {
                    ...defaultArmor(item),
                    maxDex: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                className="min-h-11 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-base)] px-3 text-sm"
              />
            </Field>
            <Field label="Strength requirement" htmlFor="armor-str">
              <NumberField
                id="armor-str"
                value={item.armor?.strMinimum ?? 0}
                min={0}
                onChange={(v) => set('armor', { ...defaultArmor(item), strMinimum: v })}
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-4">
            <Check
              label="Adds DEX"
              checked={item.armor?.dexBonus ?? true}
              onChange={(v) => set('armor', { ...defaultArmor(item), dexBonus: v })}
            />
            <Check
              label="Is a shield"
              checked={item.armor?.isShield ?? false}
              onChange={(v) => set('armor', { ...defaultArmor(item), isShield: v })}
            />
            <Check
              label="Stealth disadvantage"
              checked={item.armor?.stealthDisadvantage ?? false}
              onChange={(v) => set('armor', { ...defaultArmor(item), stealthDisadvantage: v })}
            />
          </div>
        </fieldset>
      ) : null}

      {item.category === 'weapon' ? (
        <fieldset className="mb-4 rounded-lg border border-[var(--border)] p-3">
          <legend className="px-1 text-sm font-medium">Weapon</legend>
          <p className="mb-2 text-xs text-[var(--text-muted)]">
            These drive your attack and damage rolls.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Damage dice" htmlFor="weapon-dice">
              <TextInput
                id="weapon-dice"
                value={item.weapon?.damageDice ?? '1d6'}
                placeholder="1d8"
                onChange={(e) => set('weapon', { ...defaultWeapon(item), damageDice: e.target.value })}
              />
            </Field>
            <Field label="Damage type" htmlFor="weapon-type">
              <TextInput
                id="weapon-type"
                value={item.weapon?.damageType ?? 'Slashing'}
                onChange={(e) => set('weapon', { ...defaultWeapon(item), damageType: e.target.value })}
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-4">
            <Check
              label="Ranged"
              checked={item.weapon?.ranged ?? false}
              onChange={(v) => set('weapon', { ...defaultWeapon(item), ranged: v })}
            />
            <Check
              label="Finesse"
              checked={(item.weapon?.properties ?? []).includes('Finesse')}
              onChange={(v) =>
                set('weapon', {
                  ...defaultWeapon(item),
                  properties: v
                    ? [...(item.weapon?.properties ?? []), 'Finesse']
                    : (item.weapon?.properties ?? []).filter((p) => p !== 'Finesse'),
                })
              }
            />
            <Check
              label="Martial"
              checked={item.weapon?.categoryProficiency === 'martial-weapons'}
              onChange={(v) =>
                set('weapon', {
                  ...defaultWeapon(item),
                  categoryProficiency: v ? 'martial-weapons' : 'simple-weapons',
                })
              }
            />
          </div>
        </fieldset>
      ) : null}

      <fieldset className="mb-4 rounded-lg border border-[var(--border)] p-3">
        <legend className="px-1 text-sm font-medium">Charges</legend>
        {item.charges ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Current" htmlFor="charges-current">
              <NumberField
                id="charges-current"
                value={item.charges.current}
                min={0}
                onChange={(v) => set('charges', { ...item.charges!, current: v })}
              />
            </Field>
            <Field label="Maximum" htmlFor="charges-max">
              <NumberField
                id="charges-max"
                value={item.charges.max}
                min={0}
                onChange={(v) => set('charges', { ...item.charges!, max: v })}
              />
            </Field>
            <Field label="Restores on" htmlFor="charges-reset">
              <Select
                id="charges-reset"
                value={item.charges.resetOn}
                onChange={(e) =>
                  set('charges', {
                    ...item.charges!,
                    resetOn: e.target.value as 'short' | 'long' | 'none',
                  })
                }
              >
                <option value="none">Never</option>
                <option value="short">Short rest</option>
                <option value="long">Long rest</option>
              </Select>
            </Field>
          </div>
        ) : (
          <Button
            variant="secondary"
            onClick={() => set('charges', { current: 3, max: 3, resetOn: 'long' })}
          >
            Add charges
          </Button>
        )}
        {item.charges ? (
          <Button variant="ghost" onClick={() => set('charges', null)}>
            Remove charges
          </Button>
        ) : null}
      </fieldset>

      <div className="flex gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onSave} disabled={!item.name.trim()}>
          Save
        </Button>
      </div>
    </Panel>
  );
}

function defaultArmor(item: InventoryItem): NonNullable<InventoryItem['armor']> {
  return (
    item.armor ?? {
      base: 11,
      dexBonus: true,
      maxDex: null,
      strMinimum: 0,
      stealthDisadvantage: false,
      isShield: false,
    }
  );
}

function defaultWeapon(item: InventoryItem): NonNullable<InventoryItem['weapon']> {
  return (
    item.weapon ?? {
      damageDice: '1d6',
      damageType: 'Slashing',
      versatileDice: null,
      ranged: false,
      properties: [],
      categoryProficiency: 'simple-weapons',
      rangeNormal: null,
      rangeLong: null,
    }
  );
}

function NumberField({
  id,
  value,
  min,
  step,
  onChange,
}: {
  id?: string;
  value: number;
  min?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      id={id}
      type="number"
      value={value}
      min={min}
      step={step}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      className="min-h-11 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-base)] px-3 text-sm"
    />
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4"
      />
      {label}
    </label>
  );
}
