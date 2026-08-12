import { useSheet } from './CharacterShell';
import { Button } from '../../ui/primitives';
import type { StatOverrides } from '../../domain/types';

/**
 * Manual overrides for derived statistics.
 *
 * DMs hand out effects the rules do not describe, and forms change everything at once. An app
 * that insists on its own arithmetic gets abandoned mid-session, so every derived number can be
 * pinned to a value the player types -- and the sheet then marks it clearly, so nobody later
 * wonders why their AC stopped responding to armour.
 */

const FIELDS: { key: keyof StatOverrides; label: string; hint: string }[] = [
  { key: 'armorClass', label: 'Armour class', hint: 'Wild shape, a DM ruling, an unusual form.' },
  { key: 'initiative', label: 'Initiative', hint: 'Alert, or a homebrew bonus.' },
  { key: 'speed', label: 'Speed', hint: 'In feet. Longstrider, difficult forms, a curse.' },
  { key: 'proficiencyBonus', label: 'Proficiency bonus', hint: 'Rare, but some effects change it.' },
  { key: 'passivePerception', label: 'Passive Perception', hint: 'Observant and similar.' },
  { key: 'spellSaveDc', label: 'Spell save DC', hint: 'Items that set a fixed DC.' },
  { key: 'spellAttackBonus', label: 'Spell attack bonus', hint: 'Items that set a fixed bonus.' },
];

export function StatOverrideEditor() {
  const { character, stats, update } = useSheet();
  if (!character || !stats) return null;

  const overrides = character.statOverrides;
  const anySet = FIELDS.some((f) => overrides[f.key] !== null);

  function setOverride(key: keyof StatOverrides, value: number | null) {
    if (!character) return;
    void update({ statOverrides: { ...character.statOverrides, [key]: value } });
  }

  return (
    <div>
      <h3 className="display-face mb-1 font-semibold">Override calculated values</h3>
      <p className="mb-3 text-sm text-[var(--text-muted)]">
        Leave a field empty to keep it calculated from the rules. An overridden value stops
        updating automatically and is marked with a pencil on the sheet.
      </p>

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <OverrideField
          label="Maximum hit points"
          hint="Set by your DM, or an unusual form."
          computed={stats.maxHp.total}
          value={character.resources.maxHpOverride}
          onChange={(value) =>
            void update({ resources: { ...character.resources, maxHpOverride: value } })
          }
        />

        {FIELDS.map((field) => (
          <OverrideField
            key={field.key}
            label={field.label}
            hint={field.hint}
            computed={computedFor(field.key, stats)}
            value={overrides[field.key]}
            onChange={(value) => setOverride(field.key, value)}
          />
        ))}
      </div>

      {anySet || character.resources.maxHpOverride !== null ? (
        <Button
          variant="ghost"
          onClick={() => {
            void update({
              statOverrides: {
                armorClass: null,
                initiative: null,
                speed: null,
                proficiencyBonus: null,
                passivePerception: null,
                spellSaveDc: null,
                spellAttackBonus: null,
              },
              resources: { ...character.resources, maxHpOverride: null },
            });
          }}
        >
          Clear all overrides
        </Button>
      ) : null}
    </div>
  );
}

function computedFor(key: keyof StatOverrides, stats: NonNullable<ReturnType<typeof useSheet>['stats']>): number {
  switch (key) {
    case 'armorClass':
      return stats.armorClass.total;
    case 'initiative':
      return stats.initiative.total;
    case 'speed':
      return stats.speed.total;
    case 'proficiencyBonus':
      return stats.proficiencyBonus;
    case 'passivePerception':
      return stats.passivePerception;
    case 'spellSaveDc':
      return Object.values(stats.spellSaveDc)[0] ?? 0;
    case 'spellAttackBonus':
      return Object.values(stats.spellAttackBonus)[0] ?? 0;
    default:
      return 0;
  }
}

function OverrideField({
  label,
  hint,
  computed,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  computed: number;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const id = `override-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <p className="mb-1 text-xs text-[var(--text-muted)]">{hint}</p>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          value={value ?? ''}
          // The computed value is the placeholder, so the player can always see what the rules
          // say even while overriding it.
          placeholder={String(computed)}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="min-h-11 w-24 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-base)] px-3 text-sm"
        />
        {value !== null ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="min-h-11 px-2 text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            Reset to {computed}
          </button>
        ) : (
          <span className="text-xs text-[var(--text-muted)]">Calculated: {computed}</span>
        )}
      </div>
    </div>
  );
}
