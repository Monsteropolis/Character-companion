import { Field } from '../creation/steps/parts';
import { NOTE_KIND_LABELS } from './noteKinds';
import type { EntityLink, Note } from '../../domain/types';

/**
 * Links an entry or note to the campaign entities it mentions.
 *
 * These are typed links from the start rather than free text, because the brief calls for notes
 * that eventually interconnect and retrofitting a graph onto prose is not feasible. Each link
 * carries the note's kind alongside its id, so a backlinks panel can group without a second
 * lookup.
 */
export function LinkPicker({
  notes,
  links,
  onChange,
  label = 'Related people, places and quests',
}: {
  notes: Note[];
  links: EntityLink[];
  onChange: (links: EntityLink[]) => void;
  label?: string;
}) {
  if (notes.length === 0) {
    return (
      <Field label={label}>
        <p className="text-sm text-[var(--text-muted)]">
          Nothing to link yet. Create NPCs, locations or quests in the Notes tab first.
        </p>
      </Field>
    );
  }

  const linked = new Set(links.map((l) => l.noteId));

  return (
    <Field label={label}>
      <ul className="grid gap-1 sm:grid-cols-2">
        {notes.map((note) => {
          const checked = linked.has(note.id);
          return (
            <li key={note.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-strong)] px-2 text-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    onChange(
                      checked
                        ? links.filter((l) => l.noteId !== note.id)
                        : [...links, { kind: note.kind, noteId: note.id }],
                    )
                  }
                  className="h-4 w-4 shrink-0"
                />
                <span className="truncate">
                  {note.name || 'Untitled'}
                  <span className="ml-1 text-xs text-[var(--text-muted)]">
                    {NOTE_KIND_LABELS[note.kind]}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </Field>
  );
}
