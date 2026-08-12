import { Button, Panel } from '../../ui/primitives';
import { Field, TextInput, TextArea, Select } from '../creation/steps/parts';
import { ABILITY_IDS, ABILITY_NAMES } from '../../engine/core';
import { SKILL_OPTIONS, SPELL_SCHOOLS, type HomebrewForm as FormState } from './payloads';
import type { CustomContentKind } from '../../domain/types';
import type { AbilityId } from '../../rules/schemas/primitives';

/**
 * Homebrew authoring form.
 *
 * Fields shown are those the chosen kind actually uses. A background asks for skills, a feature
 * and languages; a spell asks for level, school and components. Showing every field for every
 * kind would bury the three that matter, and asking for nothing but a description would mean
 * homebrew that cannot affect the sheet.
 */
export function HomebrewFormFields({
  kind,
  form,
  onChange,
  onSave,
  onCancel,
  classOptions,
  raceOptions,
}: {
  kind: CustomContentKind;
  form: FormState;
  onChange: (form: FormState) => void;
  onSave: () => void;
  onCancel: () => void;
  classOptions: { index: string; name: string }[];
  raceOptions: { index: string; name: string }[];
}) {
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    onChange({ ...form, [key]: value });

  const needsSkills = kind === 'background' || kind === 'race';
  const needsAbilityBonuses =
    kind === 'race' || kind === 'subrace' || kind === 'feat' || kind === 'trait';

  return (
    <Panel className="mb-6 p-4">
      <Field label="Name" htmlFor="hb-name">
        <TextInput
          id="hb-name"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder={placeholderFor(kind)}
        />
      </Field>

      <Field label="Description" htmlFor="hb-desc" hint="Shown on the sheet for reference.">
        <TextArea
          id="hb-desc"
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          rows={4}
        />
      </Field>

      {kind === 'background' ? (
        <>
          <Field label="Feature name" htmlFor="hb-feat">
            <TextInput
              id="hb-feat"
              value={form.featureName}
              onChange={(e) => set('featureName', e.target.value)}
              placeholder="e.g. Military Rank"
            />
          </Field>
          <Field label="Feature description" htmlFor="hb-featdesc">
            <TextArea
              id="hb-featdesc"
              value={form.featureDesc}
              onChange={(e) => set('featureDesc', e.target.value)}
              rows={3}
            />
          </Field>
          <Field label="Starting gold (gp)" htmlFor="hb-gold">
            <NumberInput
              id="hb-gold"
              value={form.startingGold}
              min={0}
              onChange={(v) => set('startingGold', v)}
            />
          </Field>
          <ListField
            label="Tool proficiencies"
            values={form.toolProficiencies}
            onChange={(v) => set('toolProficiencies', v)}
            placeholder="e.g. Smith's tools"
          />
          <ListField
            label="Starting equipment"
            values={form.equipment}
            onChange={(v) => set('equipment', v)}
            placeholder="e.g. An insignia of rank"
          />
        </>
      ) : null}

      {needsSkills ? (
        <Field
          label="Skill proficiencies"
          hint="These are applied to the character sheet, not just listed."
        >
          <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3">
            {SKILL_OPTIONS.map((skill) => {
              const checked = form.skillProficiencies.includes(skill);
              return (
                <li key={skill}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-strong)] px-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        set(
                          'skillProficiencies',
                          checked
                            ? form.skillProficiencies.filter((s) => s !== skill)
                            : [...form.skillProficiencies, skill],
                        )
                      }
                      className="h-4 w-4 shrink-0"
                    />
                    <span className="truncate capitalize">{skill.replace(/-/g, ' ')}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </Field>
      ) : null}

      {kind === 'background' || kind === 'race' ? (
        <Field label="Additional languages" htmlFor="hb-lang" hint="How many the player may choose.">
          <NumberInput
            id="hb-lang"
            value={form.languageCount}
            min={0}
            max={5}
            onChange={(v) => set('languageCount', v)}
          />
        </Field>
      ) : null}

      {needsAbilityBonuses ? (
        <AbilityBonusField
          bonuses={form.abilityBonuses}
          onChange={(v) => set('abilityBonuses', v)}
        />
      ) : null}

      {kind === 'race' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Speed (ft)" htmlFor="hb-speed">
            <NumberInput id="hb-speed" value={form.speed} min={0} onChange={(v) => set('speed', v)} />
          </Field>
          <Field label="Size" htmlFor="hb-size">
            <Select id="hb-size" value={form.size} onChange={(e) => set('size', e.target.value)}>
              {['Tiny', 'Small', 'Medium', 'Large'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
        </div>
      ) : null}

      {kind === 'subrace' ? (
        <Field label="Parent race" htmlFor="hb-parentrace">
          <Select
            id="hb-parentrace"
            value={form.parentRace}
            onChange={(e) => set('parentRace', e.target.value)}
          >
            <option value="">Choose a race</option>
            {raceOptions.map((r) => (
              <option key={r.index} value={r.index}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      {kind === 'subclass' || kind === 'feature' ? (
        <Field label="Parent class" htmlFor="hb-parentclass">
          <Select
            id="hb-parentclass"
            value={form.parentClass}
            onChange={(e) => set('parentClass', e.target.value)}
          >
            <option value="">Choose a class</option>
            {classOptions.map((c) => (
              <option key={c.index} value={c.index}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      {kind === 'class' ? (
        <Field label="Hit die" htmlFor="hb-hitdie">
          <Select
            id="hb-hitdie"
            value={form.hitDie}
            onChange={(e) => set('hitDie', Number(e.target.value))}
          >
            {[6, 8, 10, 12].map((d) => (
              <option key={d} value={d}>
                d{d}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      {kind === 'feat' ? (
        <Field label="Prerequisite" htmlFor="hb-prereq" hint="Shown for reference; not enforced.">
          <TextInput
            id="hb-prereq"
            value={form.prerequisite}
            onChange={(e) => set('prerequisite', e.target.value)}
            placeholder="e.g. Strength 13 or higher"
          />
        </Field>
      ) : null}

      {kind === 'spell' ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Spell level" htmlFor="hb-level">
              <Select
                id="hb-level"
                value={form.spellLevel}
                onChange={(e) => set('spellLevel', Number(e.target.value))}
              >
                <option value={0}>Cantrip</option>
                {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    Level {n}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="School" htmlFor="hb-school">
              <Select
                id="hb-school"
                value={form.school}
                onChange={(e) => set('school', e.target.value)}
              >
                {SPELL_SCHOOLS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Field label="Casting time" htmlFor="hb-cast">
              <TextInput
                id="hb-cast"
                value={form.castingTime}
                onChange={(e) => set('castingTime', e.target.value)}
              />
            </Field>
            <Field label="Range" htmlFor="hb-range">
              <TextInput
                id="hb-range"
                value={form.range}
                onChange={(e) => set('range', e.target.value)}
              />
            </Field>
            <Field label="Duration" htmlFor="hb-duration">
              <TextInput
                id="hb-duration"
                value={form.duration}
                onChange={(e) => set('duration', e.target.value)}
              />
            </Field>
            <Field label="Components" hint="V, S, M">
              <div className="flex gap-2">
                {['V', 'S', 'M'].map((c) => {
                  const checked = form.components.includes(c);
                  return (
                    <label
                      key={c}
                      className="flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--border-strong)] text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          set(
                            'components',
                            checked
                              ? form.components.filter((x) => x !== c)
                              : [...form.components, c],
                          )
                        }
                        className="h-4 w-4"
                      />
                      {c}
                    </label>
                  );
                })}
              </div>
            </Field>
          </div>

          <div className="mb-4 flex gap-4">
            <Toggle
              label="Concentration"
              checked={form.concentration}
              onChange={(v) => set('concentration', v)}
            />
            <Toggle label="Ritual" checked={form.ritual} onChange={(v) => set('ritual', v)} />
          </div>

          <Field label="At higher levels" htmlFor="hb-higher">
            <TextArea
              id="hb-higher"
              value={form.higherLevel}
              onChange={(e) => set('higherLevel', e.target.value)}
              rows={2}
            />
          </Field>
        </>
      ) : null}

      {kind === 'item' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor="hb-itemcat">
            <Select
              id="hb-itemcat"
              value={form.itemCategory}
              onChange={(e) => set('itemCategory', e.target.value)}
            >
              {['adventuring-gear', 'weapon', 'armor', 'tools', 'wondrous-items'].map((c) => (
                <option key={c} value={c}>
                  {c.replace(/-/g, ' ')}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Weight (lb)" htmlFor="hb-weight">
            <NumberInput
              id="hb-weight"
              value={form.weight}
              min={0}
              onChange={(v) => set('weight', v)}
            />
          </Field>
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onSave} disabled={!form.name.trim()}>
          Save
        </Button>
      </div>
    </Panel>
  );
}

function placeholderFor(kind: CustomContentKind): string {
  const map: Partial<Record<CustomContentKind, string>> = {
    background: 'e.g. Soldier',
    subclass: 'e.g. Eldritch Knight',
    feat: 'e.g. Great Weapon Master',
    subrace: 'e.g. Wood Elf',
    race: 'e.g. Aasimar',
    spell: 'e.g. Hunter’s Mark',
    item: 'e.g. Cloak of Elvenkind',
  };
  return map[kind] ?? 'Name';
}

function NumberInput({
  id,
  value,
  min,
  max,
  onChange,
}: {
  id?: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      id={id}
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      className="min-h-11 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-base)] px-3 text-sm"
    />
  );
}

function Toggle({
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

function AbilityBonusField({
  bonuses,
  onChange,
}: {
  bonuses: { ability: AbilityId; bonus: number }[];
  onChange: (bonuses: { ability: AbilityId; bonus: number }[]) => void;
}) {
  return (
    <Field label="Ability score bonuses" hint="Applied to the character sheet automatically.">
      <ul className="space-y-2">
        {bonuses.map((bonus, i) => (
          <li key={i} className="flex items-center gap-2">
            <Select
              aria-label="Ability"
              value={bonus.ability}
              onChange={(e) =>
                onChange(
                  bonuses.map((b, n) =>
                    n === i ? { ...b, ability: e.target.value as AbilityId } : b,
                  ),
                )
              }
            >
              {ABILITY_IDS.map((id) => (
                <option key={id} value={id}>
                  {ABILITY_NAMES[id]}
                </option>
              ))}
            </Select>
            <input
              type="number"
              aria-label="Bonus"
              value={bonus.bonus}
              onChange={(e) =>
                onChange(
                  bonuses.map((b, n) =>
                    n === i ? { ...b, bonus: Number(e.target.value) || 0 } : b,
                  ),
                )
              }
              className="min-h-11 w-20 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-base)] px-3 text-sm"
            />
            <button
              type="button"
              aria-label="Remove bonus"
              onClick={() => onChange(bonuses.filter((_, n) => n !== i))}
              className="min-h-11 px-2 text-sm text-[var(--text-muted)] hover:text-[var(--danger)]"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <Button
        variant="secondary"
        className="mt-2"
        onClick={() => onChange([...bonuses, { ability: 'str', bonus: 1 }])}
      >
        Add bonus
      </Button>
    </Field>
  );
}

function ListField({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  return (
    <Field label={label}>
      <ul className="mb-2 space-y-2">
        {values.map((value, i) => (
          <li key={i} className="flex gap-2">
            <TextInput
              value={value}
              placeholder={placeholder}
              onChange={(e) => onChange(values.map((v, n) => (n === i ? e.target.value : v)))}
            />
            <button
              type="button"
              aria-label={`Remove ${label}`}
              onClick={() => onChange(values.filter((_, n) => n !== i))}
              className="min-h-11 px-2 text-sm text-[var(--text-muted)] hover:text-[var(--danger)]"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <Button variant="secondary" onClick={() => onChange([...values, ''])}>
        Add
      </Button>
    </Field>
  );
}
