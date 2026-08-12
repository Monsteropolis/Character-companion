import { useMemo, useState } from 'react';
import { useSheet } from '../sheet/CharacterShell';
import { EntryEditor } from './EntryEditor';
import { Button, EmptyState } from '../../ui/primitives';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { TextInput, Select } from '../creation/steps/parts';
import { RichTextView } from '../../ui/RichTextEditor';
import { VisibilityBadge } from '../../ui/VisibilityToggle';
import { excerpt, toPlainText } from '../../ui/richText';
import { createJournalEntry } from '../../domain/factories';
import { NOTE_KIND_ICONS } from '../notes/noteKinds';
import type { JournalEntry, Visibility } from '../../domain/types';

/**
 * Campaign journal.
 *
 * Browsing is chronological by default because that is how a campaign is remembered: "the
 * session where the bridge collapsed" is easier to find by when it happened than by keyword.
 * Filters narrow by visibility, session and tag on top of that.
 */
export function JournalTab() {
  const { character, journal, notes, saveEntry, removeEntry } = useSheet();
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [pendingDelete, setPendingDelete] = useState<JournalEntry | null>(null);
  const [query, setQuery] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | Visibility>('all');
  const [sessionFilter, setSessionFilter] = useState<'all' | number>('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest');

  const sessions = useMemo(
    () =>
      [...new Set(journal.map((e) => e.sessionNumber).filter((n): n is number => n !== null))].sort(
        (a, b) => a - b,
      ),
    [journal],
  );

  const tags = useMemo(
    () => [...new Set(journal.flatMap((e) => e.tags))].sort((a, b) => a.localeCompare(b)),
    [journal],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return journal
      .filter((e) => (visibilityFilter === 'all' ? true : e.visibility === visibilityFilter))
      .filter((e) => (sessionFilter === 'all' ? true : e.sessionNumber === sessionFilter))
      .filter((e) => (tagFilter === 'all' ? true : e.tags.includes(tagFilter)))
      .filter((e) =>
        needle
          ? e.title.toLowerCase().includes(needle) ||
            toPlainText(e.body).toLowerCase().includes(needle) ||
            e.tags.some((t) => t.toLowerCase().includes(needle))
          : true,
      )
      .sort((a, b) => (order === 'newest' ? b.realDate - a.realDate : a.realDate - b.realDate));
  }, [journal, query, visibilityFilter, sessionFilter, tagFilter, order]);

  if (!character) return null;

  const privateCount = journal.filter((e) => e.visibility === 'private').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="display-face font-semibold">Journal</h2>
          <p className="text-sm text-[var(--text-muted)]">
            {journal.length} {journal.length === 1 ? 'entry' : 'entries'}
            {privateCount > 0 ? ` · ${privateCount} private` : ''}
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() =>
            // Private by default: the safe direction to be wrong in.
            setEditing(createJournalEntry(character.id, 'private', {
              sessionNumber: sessions.length > 0 ? Math.max(...sessions) + 1 : 1,
            }))
          }
        >
          New entry
        </Button>
      </div>

      {editing ? (
        <EntryEditor
          entry={editing}
          notes={notes}
          onChange={setEditing}
          onSave={async () => {
            await saveEntry(editing);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      ) : null}

      {journal.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search entries"
            aria-label="Search journal"
            className="flex-1"
          />
          <Select
            value={visibilityFilter}
            onChange={(e) => setVisibilityFilter(e.target.value as 'all' | Visibility)}
            aria-label="Filter by visibility"
            className="w-auto"
          >
            <option value="all">All entries</option>
            <option value="private">Private only</option>
            <option value="public">Shareable only</option>
          </Select>
          {sessions.length > 0 ? (
            <Select
              value={String(sessionFilter)}
              onChange={(e) =>
                setSessionFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
              }
              aria-label="Filter by session"
              className="w-auto"
            >
              <option value="all">All sessions</option>
              {sessions.map((n) => (
                <option key={n} value={n}>
                  Session {n}
                </option>
              ))}
            </Select>
          ) : null}
          {tags.length > 0 ? (
            <Select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              aria-label="Filter by tag"
              className="w-auto"
            >
              <option value="all">All tags</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          ) : null}
          <Select
            value={order}
            onChange={(e) => setOrder(e.target.value as 'newest' | 'oldest')}
            aria-label="Sort order"
            className="w-auto"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </Select>
        </div>
      ) : null}

      {journal.length === 0 && !editing ? (
        <EmptyState
          icon="📖"
          title="No entries yet"
          description="Keep a record of what happened. Entries are private unless you mark them shareable."
        />
      ) : null}

      {journal.length > 0 && visible.length === 0 ? (
        <EmptyState title="Nothing matches" description="Try a different search or filter." />
      ) : null}

      <ul className="space-y-2">
        {visible.map((entry) => (
          <li key={entry.id}>
            <EntryCard
              entry={entry}
              noteNames={
                new Map(notes.map((n) => [n.id, { name: n.name || 'Untitled', kind: n.kind }]))
              }
              onEdit={() => setEditing(entry)}
              onDelete={() => setPendingDelete(entry)}
            />
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this entry?"
        description={
          pendingDelete ? `“${pendingDelete.title || 'Untitled'}” will be removed.` : ''
        }
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (pendingDelete) await removeEntry(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function EntryCard({
  entry,
  noteNames,
  onEdit,
  onDelete,
}: {
  entry: JournalEntry;
  noteNames: Map<string, { name: string; kind: keyof typeof NOTE_KIND_ICONS }>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <details
      className={`panel p-3 ${
        // Private entries carry a visible edge as well as a badge, so a glance across the list
        // never leaves visibility ambiguous.
        entry.visibility === 'private' ? 'border-l-4 border-l-[var(--border-strong)]' : ''
      }`}
    >
      <summary className="flex cursor-pointer items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{entry.title || 'Untitled'}</span>
            <VisibilityBadge visibility={entry.visibility} />
          </span>
          <span className="block text-xs text-[var(--text-muted)]">
            {new Date(entry.realDate).toLocaleDateString()}
            {entry.sessionNumber !== null ? ` · Session ${entry.sessionNumber}` : ''}
            {entry.inGameDate ? ` · ${entry.inGameDate}` : ''}
          </span>
          <span className="mt-1 block text-sm text-[var(--text-muted)]">
            {excerpt(entry.body, 120)}
          </span>
        </span>
      </summary>

      <div className="mt-3 space-y-3 border-t border-[var(--border)] pt-3">
        <RichTextView value={entry.body} />

        {entry.tags.length > 0 ? (
          <ul className="flex flex-wrap gap-1">
            {entry.tags.map((tag) => (
              <li
                key={tag}
                className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--text-muted)]"
              >
                {tag}
              </li>
            ))}
          </ul>
        ) : null}

        {entry.links.length > 0 ? (
          <div>
            <p className="mb-1 text-xs font-medium">Mentions</p>
            <ul className="flex flex-wrap gap-1">
              {entry.links.map((link) => {
                const note = noteNames.get(link.noteId);
                return (
                  <li
                    key={link.noteId}
                    className="rounded-full bg-[var(--accent-subtle)] px-2 py-0.5 text-xs"
                  >
                    <span aria-hidden="true">{NOTE_KIND_ICONS[link.kind]} </span>
                    {note?.name ?? 'Deleted note'}
                  </li>
                );
              })}
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
            aria-label={`Delete ${entry.title || 'Untitled'}`}
            className="min-h-11 rounded-md px-2 text-sm text-[var(--danger)] hover:bg-[var(--accent-subtle)]"
          >
            Delete
          </button>
        </div>
      </div>
    </details>
  );
}
