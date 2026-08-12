import { useEffect, useState } from 'react';
import { Panel, Button } from '../../ui/primitives';
import { importImage, resolveBlobUrls } from '../portraits/assets';
import { assetRepo } from '../../persistence/repositories';
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

  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
  const [imageError, setImageError] = useState<string | null>(null);

  // Object URLs for attached images, revoked when the attachment set changes.
  const attachmentKey = entry.imageAssetIds.join(',');
  useEffect(() => {
    let cancelled = false;
    let created: string[] = [];
    void resolveBlobUrls(entry.imageAssetIds).then((map) => {
      created = [...map.values()];
      if (cancelled) {
        created.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      setImageUrls(map);
    });
    return () => {
      cancelled = true;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachmentKey]);

  async function attachImage(file: File) {
    setImageError(null);
    try {
      const { asset } = await importImage(file, entry.characterId, { kind: 'journal-image' });
      set('imageAssetIds', [...entry.imageAssetIds, asset.id]);
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'That image could not be attached.');
    }
  }

  async function detachImage(assetId: string) {
    await assetRepo.remove(assetId);
    set('imageAssetIds', entry.imageAssetIds.filter((id) => id !== assetId));
  }

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

      <Field label="Images" hint="Maps, handouts, a sketch of the room.">
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-[var(--border-strong)] px-3 text-sm hover:bg-[var(--accent-subtle)]">
          Attach image
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            aria-label="Attach image to entry"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void attachImage(file);
              e.target.value = '';
            }}
          />
        </label>

        {imageError ? (
          <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
            {imageError}
          </p>
        ) : null}

        {entry.imageAssetIds.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {entry.imageAssetIds.map((id) => (
              <li key={id} className="relative">
                <img
                  src={imageUrls.get(id) ?? ''}
                  alt=""
                  className="h-20 w-20 rounded-lg border border-[var(--border)] object-cover"
                />
                <button
                  type="button"
                  aria-label="Remove image"
                  onClick={() => void detachImage(id)}
                  className="absolute -top-2 -right-2 h-7 w-7 rounded-full border border-[var(--border-strong)] bg-[var(--surface-overlay)] text-xs"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        ) : null}
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
