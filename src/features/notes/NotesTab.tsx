import { useMemo, useState } from 'react';
import { useSheet } from '../sheet/CharacterShell';
import { Panel, Button, EmptyState } from '../../ui/primitives';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { Field, TextInput, Select } from '../creation/steps/parts';
import { RichTextEditor, RichTextView } from '../../ui/RichTextEditor';
import { VisibilityToggle, VisibilityBadge } from '../../ui/VisibilityToggle';
import { LinkPicker } from './LinkPicker';
import { excerpt, toPlainText } from '../../ui/richText';
import { createNote } from '../../domain/factories';
import {
  NOTE_KINDS,
  NOTE_KIND_LABELS,
  NOTE_KIND_PLURALS,
  NOTE_KIND_ICONS,
  NOTE_META_FIELDS,
  defaultVisibilityFor,
} from './noteKinds';
import type { Note, NoteKind } from '../../domain/types';

/**
 * Campaign notes.
 *
 * Typed entities rather than one flat text field: a quest has a status, an NPC an attitude, and
 * the links between them are what let the journal become navigable rather than a pile of prose.
 * Each note shows its backlinks, so opening an NPC reveals every session they appeared in.
 */
export function NotesTab() {
  const { character, notes, journal, saveNote, removeNote } = useSheet();
  const [editing, setEditing] = useState<Note | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Note | null>(null);
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | NoteKind>('all');

  /** Which journal entries and notes point at each note. */
  const backlinks = useMemo(() => {
    const map = new Map<string, { entries: typeof journal; notes: Note[] }>();
    for (const note of notes) map.set(note.id, { entries: [], notes: [] });

    for (const entry of journal) {
      for (const link of entry.links) {
        map.get(link.noteId)?.entries.push(entry);
      }
    }
    for (const note of notes) {
      for (const link of note.links) {
        map.get(link.noteId)?.notes.push(note);
      }
    }
    return map;
  }, [notes, journal]);

  const grouped = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = notes
      .filter((n) => (kindFilter === 'all' ? true : n.kind === kindFilter))
      .filter((n) =>
        needle
          ? n.name.toLowerCase().includes(needle) ||
            toPlainText(n.body).toLowerCase().includes(needle)
          : true,
      );

    return NOTE_KINDS.map(
      (kind) => [kind, filtered.filter((n) => n.kind === kind)] as const,
    ).filter(([, list]) => list.length > 0);
  }, [notes, query, kindFilter]);

  if (!character) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="display-face font-semibold">Notes</h2>
          <p className="text-sm text-[var(--text-muted)]">
            People, places, quests and everything else worth remembering.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() =>
            setEditing(createNote(character.id, 'npc', defaultVisibilityFor('npc')))
          }
        >
          New note
        </Button>
      </div>

      {editing ? (
        <NoteEditor
          note={editing}
          notes={notes.filter((n) => n.id !== editing.id)}
          onChange={setEditing}
          onSave={async () => {
            await saveNote(editing);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      ) : null}

      {notes.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes"
            aria-label="Search notes"
            className="flex-1"
          />
          <Select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as 'all' | NoteKind)}
            aria-label="Filter by type"
            className="w-auto"
          >
            <option value="all">All types</option>
            {NOTE_KINDS.map((k) => (
              <option key={k} value={k}>
                {NOTE_KIND_PLURALS[k]}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      {notes.length === 0 && !editing ? (
        <EmptyState
          icon="🗂"
          title="No notes yet"
          description="Track the NPCs, locations and quests your character cares about. Journal entries can link to them."
        />
      ) : null}

      {notes.length > 0 && grouped.length === 0 ? (
        <EmptyState title="Nothing matches" description="Try a different search or type." />
      ) : null}

      {grouped.map(([kind, list]) => (
        <section key={kind}>
          <h3 className="display-face mb-2 font-semibold">
            <span aria-hidden="true">{NOTE_KIND_ICONS[kind]} </span>
            {NOTE_KIND_PLURALS[kind]}
          </h3>
          <ul className="space-y-2">
            {list.map((note) => (
              <li key={note.id}>
                <NoteCard
                  note={note}
                  backlinks={backlinks.get(note.id) ?? { entries: [], notes: [] }}
                  onEdit={() => setEditing(note)}
                  onDelete={() => setPendingDelete(note)}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this note?"
        description={
          pendingDelete
            ? `“${pendingDelete.name || 'Untitled'}” will be removed, and any journal entry linking to it will lose that link.`
            : ''
        }
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (pendingDelete) await removeNote(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function NoteEditor({
  note,
  notes,
  onChange,
  onSave,
  onCancel,
}: {
  note: Note;
  notes: Note[];
  onChange: (note: Note) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = <K extends keyof Note>(key: K, value: Note[K]) => onChange({ ...note, [key]: value });
  const fields = NOTE_META_FIELDS[note.kind];

  return (
    <Panel className="mb-4 p-4">
      <h3 className="display-face mb-3 font-semibold">
        {note.name ? `Edit ${note.name}` : 'New note'}
      </h3>

      <Field label="Type" htmlFor="note-kind">
        <Select
          id="note-kind"
          value={note.kind}
          onChange={(e) => {
            const kind = e.target.value as NoteKind;
            // Changing kind resets meta, since the fields differ, and re-applies the safe
            // default for visibility -- switching to Secret must not stay shareable.
            onChange({ ...note, kind, meta: {}, visibility: defaultVisibilityFor(kind) });
          }}
        >
          {NOTE_KINDS.map((k) => (
            <option key={k} value={k}>
              {NOTE_KIND_LABELS[k]}
            </option>
          ))}
        </Select>
      </Field>

      <VisibilityToggle
        value={note.visibility}
        onChange={(visibility) => set('visibility', visibility)}
        idPrefix={`note-${note.id}`}
      />

      <Field label="Name" htmlFor="note-name">
        <TextInput
          id="note-name"
          value={note.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder={`e.g. ${placeholderFor(note.kind)}`}
        />
      </Field>

      {fields.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {fields.map((field) => (
            <Field key={field.key} label={field.label} htmlFor={`note-meta-${field.key}`}>
              {field.options ? (
                <Select
                  id={`note-meta-${field.key}`}
                  value={note.meta[field.key] ?? field.options[0]}
                  onChange={(e) => set('meta', { ...note.meta, [field.key]: e.target.value })}
                >
                  {field.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              ) : (
                <TextInput
                  id={`note-meta-${field.key}`}
                  value={note.meta[field.key] ?? ''}
                  placeholder={field.placeholder}
                  onChange={(e) => set('meta', { ...note.meta, [field.key]: e.target.value })}
                />
              )}
            </Field>
          ))}
        </div>
      ) : null}

      <Field label="Notes" htmlFor="note-body">
        <RichTextEditor
          id="note-body"
          value={note.body}
          onChange={(body) => set('body', body)}
          rows={6}
        />
      </Field>

      <LinkPicker
        notes={notes}
        links={note.links}
        onChange={(links) => set('links', links)}
        label="Related notes"
      />

      <div className="flex gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onSave} disabled={!note.name.trim()}>
          Save note
        </Button>
      </div>
    </Panel>
  );
}

function NoteCard({
  note,
  backlinks,
  onEdit,
  onDelete,
}: {
  note: Note;
  backlinks: { entries: { id: string; title: string; sessionNumber: number | null }[]; notes: Note[] };
  onEdit: () => void;
  onDelete: () => void;
}) {
  const meta = NOTE_META_FIELDS[note.kind]
    .map((f) => (note.meta[f.key] ? `${f.label}: ${note.meta[f.key]}` : null))
    .filter(Boolean);

  return (
    <details
      className={`panel p-3 ${
        note.visibility === 'private' ? 'border-l-4 border-l-[var(--border-strong)]' : ''
      }`}
    >
      <summary className="flex cursor-pointer items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{note.name || 'Untitled'}</span>
            <VisibilityBadge visibility={note.visibility} />
          </span>
          {meta.length > 0 ? (
            <span className="block text-xs text-[var(--text-muted)]">{meta.join(' · ')}</span>
          ) : null}
          {note.body ? (
            <span className="mt-1 block text-sm text-[var(--text-muted)]">
              {excerpt(note.body, 120)}
            </span>
          ) : null}
        </span>
      </summary>

      <div className="mt-3 space-y-3 border-t border-[var(--border)] pt-3">
        <RichTextView value={note.body} />

        {backlinks.entries.length > 0 ? (
          <div>
            {/* Backlinks are what make this a graph rather than a folder of documents. */}
            <p className="mb-1 text-xs font-medium">Appears in</p>
            <ul className="flex flex-wrap gap-1">
              {backlinks.entries.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-full bg-[var(--accent-subtle)] px-2 py-0.5 text-xs"
                >
                  {entry.title || 'Untitled'}
                  {entry.sessionNumber !== null ? ` (S${entry.sessionNumber})` : ''}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {backlinks.notes.length > 0 ? (
          <div>
            <p className="mb-1 text-xs font-medium">Referenced by</p>
            <ul className="flex flex-wrap gap-1">
              {backlinks.notes.map((other) => (
                <li
                  key={other.id}
                  className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs"
                >
                  <span aria-hidden="true">{NOTE_KIND_ICONS[other.kind]} </span>
                  {other.name || 'Untitled'}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex gap-2">
          <Button variant="ghost" onClick={onEdit}>
            Edit
          </Button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${note.name || 'Untitled'}`}
            className="min-h-11 rounded-md px-2 text-sm text-[var(--danger)] hover:bg-[var(--accent-subtle)]"
          >
            Delete
          </button>
        </div>
      </div>
    </details>
  );
}

function placeholderFor(kind: NoteKind): string {
  const map: Record<NoteKind, string> = {
    npc: 'Sildar Hallwinter',
    location: 'Phandalin',
    quest: 'Find the lost mine',
    faction: 'The Zhentarim',
    secret: 'The mayor is a doppelganger',
    goal: 'Avenge my mentor',
    relationship: 'My sister Elyn',
  };
  return map[kind];
}
