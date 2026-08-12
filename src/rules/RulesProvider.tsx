import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BundledRulesSource } from './BundledRulesSource';
import { CompositeRulesSource } from './CompositeRulesSource';
import { customContent } from '../persistence/repositories';
import type { RulesSource } from './RulesSource';
import type { CollectionKey, CollectionDoc } from './collections';

/**
 * Provides the app's rules source.
 *
 * Bundled SRD data with the user's homebrew layered on top, so every consumer -- wizard, sheet,
 * level-up -- reads official and custom content through one interface and neither needs to know
 * which it got.
 */

const RulesContext = createContext<RulesSource | null>(null);

export function RulesProvider({ children, source }: { children: ReactNode; source?: RulesSource }) {
  const value = useMemo(
    () => source ?? new CompositeRulesSource(new BundledRulesSource(), customContent),
    [source],
  );
  return <RulesContext.Provider value={value}>{children}</RulesContext.Provider>;
}

export function useRulesSource(): RulesSource {
  const ctx = useContext(RulesContext);
  if (!ctx) throw new Error('useRulesSource must be used inside a RulesProvider');
  return ctx;
}

/**
 * Read a whole collection.
 *
 * Cached indefinitely: 2014 rules are immutable within a session, so refetching would only cost
 * work. Homebrew edits invalidate explicitly via the query key.
 */
export function useCollection<K extends CollectionKey>(collection: K) {
  const source = useRulesSource();
  return useQuery({
    queryKey: ['rules', source.id, collection],
    queryFn: () => source.all(collection),
  });
}

export function useRulesDoc<K extends CollectionKey>(collection: K, index: string | null) {
  const source = useRulesSource();
  return useQuery({
    queryKey: ['rules', source.id, collection, index],
    queryFn: () => (index ? source.get(collection, index) : Promise.resolve(null)),
    enabled: index !== null,
  });
}

/** Several collections at once, for steps that need to cross-reference. */
export function useCollections<K extends CollectionKey>(collections: K[]) {
  const source = useRulesSource();
  return useQuery({
    queryKey: ['rules', source.id, 'multi', ...collections],
    queryFn: async () => {
      const entries = await Promise.all(
        collections.map(async (c) => [c, await source.all(c)] as const),
      );
      return Object.fromEntries(entries) as { [P in K]: CollectionDoc<P>[] };
    },
  });
}
