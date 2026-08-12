import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { customContent as repo } from '../../persistence/repositories';
import { Button, Panel, EmptyState, Spinner, SourceBadge } from '../../ui/primitives';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { StepHeading, Field, TextInput, TextArea, Select } from '../creation/steps/parts';
import {
  CUSTOM_KINDS,
  homebrewEntrySchema,
  toCustomContent,
  toPack,
  parsePack,
  descriptionOf,
  type HomebrewEntry,
} from './homebrewSchema';
import type { CustomContent, CustomContentKind } from '../../domain/types';

/**
 * Homebrew content manager.
 *
 * Both halves of the agreed approach live here: an authoring form for entering content by hand,
 * and pack import/export so a table can share a set once instead of every player retyping it.
 */
export function CustomContentPage() {
  const queryClient = useQueryClient();
  const [content, setContent] = useState<CustomContent[] | null>(null);
  const [editing, setEditing] = useState<HomebrewEntry | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CustomContent | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setContent(await repo.list());
    // Homebrew is layered into the rules source, so its caches must drop when it changes.
    await queryClient.invalidateQueries({ queryKey: ['rules'] });
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave(entry: HomebrewEntry) {
    const parsed = homebrewEntrySchema.safeParse(entry);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join('; '));
      return;
    }
    const record = toCustomContent(parsed.data);
    // Editing keeps the original id so characters referencing it are not orphaned.
    await repo.save(editingId ? { ...record, id: editingId } : record);
    setEditing(null);
    setEditingId(null);
    setError(null);
    setMessage(`Saved "${entry.name}".`);
    await refresh();
  }

  async function handleImport(file: File) {
    setError(null);
    try {
      const result = parsePack(JSON.parse(await file.text()));
      if ('error' in result) {
        setError(result.error);
        return;
      }
      for (const entry of result.pack.entries) {
        await repo.save(toCustomContent(entry));
      }
      setMessage(`Imported ${result.pack.entries.length} entries from "${result.pack.name}".`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.');
    }
  }

  function handleExport() {
    if (!content || content.length === 0) return;
    const pack = toPack(content);
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'homebrew-pack.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (content === null) return <Spinner label="Loading homebrew" />;

  const byKind = new Map<CustomContentKind, CustomContent[]>();
  for (const item of content) {
    byKind.set(item.kind, [...(byKind.get(item.kind) ?? []), item]);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-3 py-6">
        <div>
          <h1 className="display-face text-2xl font-semibold">Homebrew</h1>
          <p className="text-sm text-[var(--text-muted)]">
            {content.length} item{content.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={handleExport} disabled={content.length === 0}>
            Export pack
          </Button>
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--accent-subtle)]">
            Import pack
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImport(file);
                e.target.value = '';
              }}
            />
          </label>
          <Button
            variant="primary"
            onClick={() => {
              setEditingId(null);
              setEditing({
                kind: 'background',
                name: '',
                description: '',
                basedOn: null,
                payload: {},
                effects: [],
              });
            }}
          >
            New
          </Button>
        </div>
      </header>

      <Panel className="mb-4 p-4">
        <p className="text-sm text-[var(--text-muted)]">
          The SRD is a subset of the Player&apos;s Handbook, so most backgrounds, feats and
          subclasses are not included. Add what your character uses here — it appears in the
          creation wizard alongside official content and works the same way.
        </p>
      </Panel>

      {error ? (
        <p role="alert" className="mb-3 rounded-lg border border-[var(--danger)] p-3 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="mb-3 rounded-lg border border-[var(--border-strong)] p-3 text-sm text-[var(--text-muted)]">
          {message}
        </p>
      ) : null}

      {editing ? (
        <HomebrewForm
          entry={editing}
          onChange={setEditing}
          onSave={() => void handleSave(editing)}
          onCancel={() => {
            setEditing(null);
            setEditingId(null);
            setError(null);
          }}
        />
      ) : null}

      {content.length === 0 && !editing ? (
        <EmptyState
          icon="📜"
          title="No homebrew yet"
          description="Add the background, subclass or feat your character actually uses, or import a pack someone shared with you."
        />
      ) : null}

      {[...byKind.entries()].map(([kind, items]) => (
        <section key={kind} className="mb-6">
          <h2 className="display-face mb-2 font-semibold capitalize">{kind}</h2>
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id}>
                <Panel className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.name}</span>
                      <SourceBadge source="custom" />
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-[var(--text-muted)]">
                      {descriptionOf(item) || 'No description'}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(item.id);
                        setEditing({
                          kind: item.kind,
                          name: item.name,
                          description: descriptionOf(item),
                          basedOn: item.basedOn,
                          payload: {},
                          effects: [],
                        });
                      }}
                      className="min-h-11 rounded-md px-2 text-xs text-[var(--text-muted)] hover:bg-[var(--accent-subtle)]"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(item)}
                      aria-label={`Delete ${item.name}`}
                      className="min-h-11 rounded-md px-2 text-xs text-[var(--danger)] hover:bg-[var(--accent-subtle)]"
                    >
                      Delete
                    </button>
                  </div>
                </Panel>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this homebrew?"
        description={
          pendingDelete
            ? `"${pendingDelete.name}" will be removed. Characters using it keep its name but lose its details.`
            : ''
        }
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (pendingDelete) await repo.remove(pendingDelete.id);
          setPendingDelete(null);
          await refresh();
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function HomebrewForm({
  entry,
  onChange,
  onSave,
  onCancel,
}: {
  entry: HomebrewEntry;
  onChange: (entry: HomebrewEntry) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const kind = CUSTOM_KINDS.find((k) => k.value === entry.kind);

  return (
    <Panel className="mb-6 p-4">
      <StepHeading title="Homebrew entry" />

      <Field label="Type" htmlFor="kind">
        <Select
          id="kind"
          value={entry.kind}
          onChange={(e) => onChange({ ...entry, kind: e.target.value as CustomContentKind })}
        >
          {CUSTOM_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>
        {kind ? <p className="mt-1 text-xs text-[var(--text-muted)]">{kind.hint}</p> : null}
      </Field>

      <Field label="Name" htmlFor="hb-name">
        <TextInput
          id="hb-name"
          value={entry.name}
          onChange={(e) => onChange({ ...entry, name: e.target.value })}
          placeholder="e.g. Soldier"
        />
      </Field>

      <Field
        label="Description"
        htmlFor="hb-desc"
        hint="What it does. Written out for reference at the table."
      >
        <TextArea
          id="hb-desc"
          value={entry.description}
          onChange={(e) => onChange({ ...entry, description: e.target.value })}
          rows={5}
        />
      </Field>

      <div className="flex gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onSave} disabled={!entry.name.trim()}>
          Save
        </Button>
      </div>
    </Panel>
  );
}
