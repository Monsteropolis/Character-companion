import { useDraft } from '../draft';
import { StepHeading, Field, TextInput, TextArea, Select } from './parts';
import { MOODS } from '../../../ui/theme/moods';
import type { Alignment } from '../../../domain/types';

const ALIGNMENTS: { value: Alignment; label: string }[] = [
  { value: 'lawful-good', label: 'Lawful Good' },
  { value: 'neutral-good', label: 'Neutral Good' },
  { value: 'chaotic-good', label: 'Chaotic Good' },
  { value: 'lawful-neutral', label: 'Lawful Neutral' },
  { value: 'neutral', label: 'True Neutral' },
  { value: 'chaotic-neutral', label: 'Chaotic Neutral' },
  { value: 'lawful-evil', label: 'Lawful Evil' },
  { value: 'neutral-evil', label: 'Neutral Evil' },
  { value: 'chaotic-evil', label: 'Chaotic Evil' },
];

export function IdentityStep() {
  const { identity, setIdentity, mood, setMood } = useDraft();

  return (
    <div>
      <StepHeading
        title="Who are they?"
        description="Only a name is required. Everything else can be filled in later, or never."
      />

      <Field label="Name" htmlFor="name">
        <TextInput
          id="name"
          value={identity.name}
          onChange={(e) => setIdentity({ name: e.target.value })}
          placeholder="e.g. Lyra Half-Moon"
          autoComplete="off"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Pronouns" htmlFor="pronouns" hint="Free text — anything you like.">
          <TextInput
            id="pronouns"
            value={identity.pronouns}
            onChange={(e) => setIdentity({ pronouns: e.target.value })}
            placeholder="she/her, they/them, ..."
            autoComplete="off"
          />
        </Field>

        <Field label="Alignment" htmlFor="alignment">
          <Select
            id="alignment"
            value={identity.alignment ?? ''}
            onChange={(e) =>
              setIdentity({ alignment: (e.target.value || null) as Alignment | null })
            }
          >
            <option value="">Not decided</option>
            {ALIGNMENTS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Appearance" htmlFor="description">
        <TextArea
          id="description"
          value={identity.description}
          onChange={(e) => setIdentity({ description: e.target.value })}
          placeholder="What do people notice first?"
        />
      </Field>

      <Field label="Backstory" htmlFor="backstory">
        <TextArea
          id="backstory"
          value={identity.backstory}
          onChange={(e) => setIdentity({ backstory: e.target.value })}
          placeholder="Where did they come from?"
        />
      </Field>

      <Field
        label="Mood"
        hint="Sets the accent colour of this character's sheet. Suggested from your class later; change it any time."
      >
        <div className="flex flex-wrap gap-2">
          {MOODS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMood(m.id)}
              aria-pressed={mood === m.id}
              title={m.description}
              className={`min-h-11 rounded-lg border px-3 text-sm transition-colors ${
                mood === m.id
                  ? 'border-[var(--accent)] bg-[var(--accent-subtle)] ring-2 ring-[var(--accent)]'
                  : 'border-[var(--border-strong)] hover:bg-[var(--accent-subtle)]'
              }`}
            >
              {m.name}
            </button>
          ))}
        </div>
      </Field>
    </div>
  );
}
