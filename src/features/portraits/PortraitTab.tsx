import { useState } from 'react';
import { useSheet } from '../sheet/CharacterShell';
import { PortraitView } from './PortraitView';
import { SpriteSheetEditor } from './SpriteSheetEditor';
import { EmoteBindingEditor } from './EmoteBindingEditor';
import { Panel, Button, EmptyState, Spinner } from '../../ui/primitives';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { Field, TextInput, Select } from '../creation/steps/parts';
import { importImage, readDimensions } from './assets';
import { persistedBase } from '../../domain/factories';
import { deriveMeta, defaultKindFor, validateImage } from '../../engine/sprites';
import { characterDisplayName } from '../../domain/factories';
import type { PortraitAsset } from '../../domain/types';

/**
 * Portrait manager.
 *
 * Handles all three kinds the brief asks for -- a still image, an animated GIF/WebP, and a
 * sprite sheet with named states -- through one upload path. The kind is guessed from the file
 * and then editable, since only the user knows whether a PNG is one portrait or a grid of
 * sixteen frames.
 */
export function PortraitTab() {
  const {
    character,
    update,
    portraits,
    portraitUrls: urls,
    savePortrait: save,
    removePortrait,
    loading,
  } = useSheet();
  const [editing, setEditing] = useState<PortraitAsset | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PortraitAsset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!character) return null;
  if (loading) return <Spinner label="Loading portraits" />;

  async function handleUpload(file: File) {
    if (!character) return;
    setError(null);
    setBusy(true);
    try {
      const check = validateImage(file);
      if (!check.ok) throw new Error(check.reason);

      const kind = defaultKindFor(file.type);
      const { asset } = await importImage(file, character.id, {
        // Sheets and animated images keep their exact pixels; resizing either would break them.
        preserveOriginal: kind !== 'static',
      });

      const portrait: PortraitAsset = {
        ...persistedBase(),
        characterId: character.id,
        kind,
        blobId: asset.id,
        name: file.name.replace(/\.[^.]+$/, ''),
        spritesheet: null,
        states: [],
        defaultState: 'idle',
        emotes: [],
      };

      const saved = await save(portrait);
      // A first portrait becomes the active one, so an upload is immediately visible.
      if (!character.portraitId) await update({ portraitId: saved.id });
      setEditing(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That image could not be imported.');
    } finally {
      setBusy(false);
    }
  }

  async function switchToSpritesheet(portrait: PortraitAsset) {
    const url = urls.get(portrait.blobId);
    let width = 256;
    let height = 256;

    if (url) {
      try {
        const response = await fetch(url);
        const dims = await readDimensions(await response.blob());
        if (dims.width > 0) {
          width = dims.width;
          height = dims.height;
        }
      } catch {
        // Measurement is a convenience; the user can correct the grid by hand.
      }
    }

    setEditing({
      ...portrait,
      kind: 'spritesheet',
      spritesheet: deriveMeta(width, height, 4, 4),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="display-face font-semibold">Portrait &amp; sprites</h2>
          <p className="text-sm text-[var(--text-muted)]">
            A still image, an animated GIF or WebP, or a sprite sheet with named animations.
          </p>
        </div>
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--on-accent)]">
          {busy ? 'Importing…' : 'Upload image'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            aria-label="Upload portrait image"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-[var(--danger)] p-3 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      {portraits.length === 0 && !editing ? (
        <EmptyState
          icon="🖼"
          title="No portrait yet"
          description="Upload a picture of your character. Sprite sheets with named animations are supported, and drive the emote buttons."
        />
      ) : null}

      {editing ? (
        <Panel className="p-4">
          <h3 className="display-face mb-3 font-semibold">Configure portrait</h3>

          <div className="mb-4 flex flex-wrap items-start gap-4">
            <PortraitView
              portrait={editing}
              imageUrl={urls.get(editing.blobId) ?? null}
              stateName={null}
              fallbackInitial={characterDisplayName(character).slice(0, 1)}
              className="h-32 w-32 shrink-0 rounded-xl border border-[var(--border)]"
            />

            <div className="min-w-0 flex-1">
              <Field label="Name" htmlFor="portrait-name">
                <TextInput
                  id="portrait-name"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </Field>

              <Field label="Kind" htmlFor="portrait-kind">
                <Select
                  id="portrait-kind"
                  value={editing.kind}
                  onChange={(e) => {
                    const kind = e.target.value as PortraitAsset['kind'];
                    if (kind === 'spritesheet') void switchToSpritesheet(editing);
                    else setEditing({ ...editing, kind, spritesheet: null });
                  }}
                >
                  <option value="static">Still image</option>
                  <option value="animated-image">Animated image (GIF or WebP)</option>
                  <option value="spritesheet">Sprite sheet</option>
                </Select>
              </Field>
            </div>
          </div>

          {editing.kind === 'spritesheet' ? (
            <SpriteSheetEditor
              portrait={editing}
              imageUrl={urls.get(editing.blobId) ?? null}
              onChange={setEditing}
            />
          ) : null}

          <EmoteBindingEditor portrait={editing} onChange={setEditing} />

          <div className="mt-4 flex gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                await save(editing);
                setEditing(null);
              }}
            >
              Save portrait
            </Button>
          </div>
        </Panel>
      ) : null}

      {portraits.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {portraits.map((portrait) => {
            const active = character.portraitId === portrait.id;
            return (
              <li key={portrait.id}>
                <Panel className={`p-3 ${active ? 'ring-2 ring-[var(--accent)]' : ''}`}>
                  <div className="flex items-start gap-3">
                    <PortraitView
                      portrait={portrait}
                      imageUrl={urls.get(portrait.blobId) ?? null}
                      stateName={null}
                      fallbackInitial={characterDisplayName(character).slice(0, 1)}
                      className="h-20 w-20 shrink-0 rounded-lg border border-[var(--border)]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{portrait.name || 'Portrait'}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {kindLabel(portrait)}
                        {portrait.states.length > 0
                          ? ` · ${portrait.states.length} animation${portrait.states.length === 1 ? '' : 's'}`
                          : ''}
                      </p>
                      {active ? (
                        <p className="mt-1 text-xs font-medium text-[var(--accent)]">In use</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1">
                    {!active ? (
                      <Button
                        variant="secondary"
                        onClick={() => void update({ portraitId: portrait.id })}
                      >
                        Use this
                      </Button>
                    ) : null}
                    <Button variant="ghost" onClick={() => setEditing(portrait)}>
                      Configure
                    </Button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(portrait)}
                      aria-label={`Delete ${portrait.name || 'portrait'}`}
                      className="min-h-11 rounded-md px-2 text-sm text-[var(--danger)]"
                    >
                      Delete
                    </button>
                  </div>
                </Panel>
              </li>
            );
          })}
        </ul>
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this portrait?"
        description={
          pendingDelete
            ? `“${pendingDelete.name || 'Portrait'}” and its image will be removed.`
            : ''
        }
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (pendingDelete) {
            await removePortrait(pendingDelete.id);
            // A character pointing at a deleted portrait would render nothing at all.
            if (character.portraitId === pendingDelete.id) await update({ portraitId: null });
          }
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function kindLabel(portrait: PortraitAsset): string {
  if (portrait.kind === 'spritesheet') {
    const sheet = portrait.spritesheet;
    return sheet ? `Sprite sheet · ${sheet.frameCount} frames` : 'Sprite sheet';
  }
  return portrait.kind === 'animated-image' ? 'Animated image' : 'Still image';
}
