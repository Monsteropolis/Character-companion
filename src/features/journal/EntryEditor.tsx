import { Panel, Button } from '../../ui/primitives';
import { Field, TextInput } from '../creation/steps/parts';
import { RichTextEditor } from '../../ui/RichTextEditor';
import { VisibilityToggle } from '../../ui/VisibilityToggle';
import { LinkPicker } from '../notes/LinkPicker';
import type { JournalEntry, Note } from '../../domain/types';

/**
 * Journal entry editor.
 *
 * Visibility sits at the top, before the body, so the decision is made before the writing rather
 * than after — the moment a player has typed something private, a mis-set toggle is already a
 * risk.
 */
export function EntryEditor({
  entry,
  notes,
  onChange,
  onSave,
  onCancel,
}: {
  entry: JournalEntry;
  notes: Note[];
  onChange: (entry: JournalEntry) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = <K extends keyof JournalEntry>(key: K, value: JournalEntry[K]) =>
    onChange({ ...entry, [key]: value });

  return (
    <Panel className="mb-4 p-4">
      <h3 className="display-face mb-3 font-semibold">
        {entry.title ? `Edit “${entry.title}”` : 'New entry'}
      </h3>

      <VisibilityToggle
        value={entry.visibility}
        onChange={(visibility) => set('visibility', visibility)}
        idPrefix={`entry-${entry.id}`}
      />

      <Field label="Title" htmlFor="entry-title">
        <TextInput
          id="entry-title"
          value={entry.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="e.g. The bridge at Sable Ford"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Session" htmlFor="entry-session">
          <input
            id="entry-session"
            type="number"
            min={0}
            value={entry.sessionNumber ?? ''}
            placeholder="—"
            onChange={(e) =>
              set('sessionNumber', e.target.value === '' ? null : Number(e.target.value))
            }
            className="min-h-11 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-base)] px-3 text-sm"
          />
        </Field>

        <Field label="Date played" htmlFor="entry-date">
          <input
            id="entry-date"
            type="date"
            value={new Date(entry.realDate).toISOString().slice(0, 10)}
            onChange={(e) => set('realDate', new Date(e.target.value).getTime() || Date.now())}
            className="min-h-11 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-base)] px-3 text-sm"
          />
        </Field>

        <Field
          label="In-game date"
          htmlFor="entry-ingame"
          hint="Free text — fantasy calendars are not ISO dates."
        >
          <TextInput
            id="entry-ingame"
            value={entry.inGameDate ?? ''}
            onChange={(e) => set('inGameDate', e.target.value || null)}
            placeholder="e.g. 14th of Flamerule"
          />
        </Field>
      </div>

      <Field label="Entry" htmlFor="entry-body">
        <RichTextEditor
          id="entry-body"
          value={entry.body}
          onChange={(body) => set('body', body)}
          placeholder="What happened?"
        />
      </Field>

      <Field label="Tags" htmlFor="entry-tags" hint="Comma separated.">
        <TextInput
          id="entry-tags"
          value={entry.tags.join(', ')}
          onChange={(e) =>
            set(
              'tags',
              e.target.value
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
            )
          }
          placeholder="e.g. combat, betrayal"
        />
      </Field>

      <LinkPicker
        notes={notes}
        links={entry.links}
        onChange={(links) => set('links', links)}
      />

      <div className="flex gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onSave} disabled={!entry.title.trim()}>
          Save entry
        </Button>
      </div>
    </Panel>
  );
}
