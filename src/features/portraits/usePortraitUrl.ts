import { useEffect, useState } from 'react';
import { assetRepo } from '../../persistence/repositories';
import type { Character } from '../../domain/types';

/**
 * Resolves stored portrait blobs to object URLs.
 *
 * Object URLs are revoked on unmount and whenever the set changes. Skipping that leaks the
 * entire blob into memory for the session, which matters here because portraits are large and
 * the gallery can hold many of them.
 */
export function usePortraitUrls(characters: Character[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});

  // Depend on the id/portrait pairs rather than the array identity, so unrelated character
  // edits (renaming, taking damage) do not churn every object URL.
  const key = characters.map((c) => `${c.id}:${c.portraitId ?? ''}`).join(',');

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];

    async function resolve() {
      const next: Record<string, string> = {};
      for (const character of characters) {
        if (!character.portraitId) continue;
        const asset = await assetRepo.get(character.portraitId);
        if (!asset) continue;
        const url = URL.createObjectURL(asset.blob);
        created.push(url);
        next[character.id] = url;
      }
      if (cancelled) {
        created.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      setUrls(next);
    }

    void resolve();

    return () => {
      cancelled = true;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return urls;
}
