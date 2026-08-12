import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCharacterStore } from './store';
import { CharacterCard } from './CharacterCard';
import { Button, EmptyState, ErrorNotice, Spinner } from '../../ui/primitives';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { characterDisplayName } from '../../domain/factories';
import { exportBundle, importBundle, bundleFilename } from '../../persistence/transfer';
import { usePortraitUrls } from '../portraits/usePortraitUrl';

/**
 * The character selection screen -- the app's front door.
 *
 * Also carries export/import, because this is the only screen that owns the whole library and
 * because a backup route needs to exist before accounts do.
 */
export function CharacterGallery() {
  const navigate = useNavigate();
  const { characters, status, error, load, duplicate, setArchived, remove } = useCharacterStore();

  const [showArchived, setShowArchived] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () => characters.filter((c) => c.archived === showArchived),
    [characters, showArchived],
  );

  const archivedCount = useMemo(
    () => characters.filter((c) => c.archived).length,
    [characters],
  );

  const portraitUrls = usePortraitUrls(visible);

  const target = pendingDelete ? characters.find((c) => c.id === pendingDelete) : null;

  async function handleAction(
    action: 'duplicate' | 'archive' | 'unarchive' | 'delete',
    id: string,
  ) {
    if (action === 'duplicate') await duplicate(id);
    if (action === 'archive') await setArchived(id, true);
    if (action === 'unarchive') await setArchived(id, false);
    // Deletion always routes through confirmation -- it is the one destructive action here.
    if (action === 'delete') setPendingDelete(id);
  }

  async function handleExport() {
    setTransferError(null);
    try {
      const bundle = await exportBundle();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = bundleFilename(bundle);
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice(`Exported ${bundle.characters.length} character(s).`);
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : 'Export failed');
    }
  }

  async function handleImport(file: File) {
    setTransferError(null);
    try {
      const result = await importBundle(JSON.parse(await file.text()));
      await load();
      setNotice(`Imported ${result.charactersImported} character(s).`);
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : 'Import failed');
    }
  }

  if (status === 'loading' || status === 'idle') return <Spinner label="Loading characters" />;
  if (status === 'error') {
    return <ErrorNotice message={error ?? 'Could not load your characters.'} onRetry={load} />;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24">
      <header className="flex flex-wrap items-center justify-between gap-3 py-6">
        <div>
          <h1 className="display-face text-2xl font-semibold">Characters</h1>
          <p className="text-sm text-[var(--text-muted)]">
            {characters.length === 0
              ? 'No characters yet'
              : `${characters.length - archivedCount} active${archivedCount ? `, ${archivedCount} archived` : ''}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={handleExport} disabled={characters.length === 0}>
            Export all
          </Button>

          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg px-4 py-2 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--accent-subtle)]">
            Import
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

          <Button variant="primary" onClick={() => navigate('/create')}>
            New character
          </Button>
        </div>
      </header>

      {transferError ? (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-[var(--danger)] p-3 text-sm text-[var(--danger)]"
        >
          {transferError}
        </div>
      ) : null}

      {notice ? (
        <div
          role="status"
          className="mb-4 rounded-lg border border-[var(--border-strong)] p-3 text-sm text-[var(--text-muted)]"
        >
          {notice}
        </div>
      ) : null}

      {archivedCount > 0 ? (
        <div className="mb-4 flex gap-1">
          <TabButton active={!showArchived} onClick={() => setShowArchived(false)}>
            Active
          </TabButton>
          <TabButton active={showArchived} onClick={() => setShowArchived(true)}>
            Archived ({archivedCount})
          </TabButton>
        </div>
      ) : null}

      {visible.length === 0 ? (
        showArchived ? (
          <EmptyState
            title="Nothing archived"
            description="Archived characters are kept out of the way but never deleted."
          />
        ) : (
          <EmptyState
            icon="🎲"
            title="Create your first character"
            description="Build a character step by step, or import one you exported earlier. Everything is stored on this device."
            action={
              <Button variant="primary" onClick={() => navigate('/create')}>
                Start character creation
              </Button>
            }
          />
        )
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((character) => (
            <li key={character.id}>
              <CharacterCard
                character={character}
                portraitUrl={portraitUrls[character.id] ?? null}
                onAction={handleAction}
              />
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={target !== null}
        title="Delete this character?"
        // Naming the character makes an accidental confirmation far less likely.
        description={
          target
            ? `"${characterDisplayName(target)}" and its inventory, journal and notes will be removed. Export first if you want a copy.`
            : ''
        }
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (pendingDelete) await remove(pendingDelete);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-11 rounded-lg px-3 text-sm font-medium transition-colors ${
        active
          ? 'bg-[var(--accent-subtle)] text-[var(--text)]'
          : 'text-[var(--text-muted)] hover:bg-[var(--accent-subtle)]'
      }`}
    >
      {children}
    </button>
  );
}
