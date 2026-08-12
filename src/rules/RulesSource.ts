import type { CollectionKey, CollectionDoc } from './collections';

/**
 * The boundary between the app and whatever provides rules content.
 *
 * Nothing outside `src/rules/` may import a concrete source. Feature code depends on this
 * interface only, which is what keeps the app from coupling to any single external API and
 * lets bundled data, a live HTTP API, and user homebrew be composed interchangeably.
 */
export interface RulesSource {
  readonly id: string;
  /** Lightweight index entries, for pickers and lists. */
  list<K extends CollectionKey>(collection: K): Promise<RulesIndexEntry[]>;
  /** A single document, or null when absent. Never throws for a missing record. */
  get<K extends CollectionKey>(collection: K, index: string): Promise<CollectionDoc<K> | null>;
  /** Every document in a collection. */
  all<K extends CollectionKey>(collection: K): Promise<CollectionDoc<K>[]>;
}

export interface RulesIndexEntry {
  index: string;
  name: string;
  /** Which of the three content origins this came from. Rendered as a badge in the UI. */
  source: 'srd' | 'custom';
}

/** Outcome of validating one collection. Surfaced by the integrity test and the About screen. */
export interface ValidationReport {
  collection: CollectionKey;
  total: number;
  valid: number;
  quarantined: QuarantinedRecord[];
}

export interface QuarantinedRecord {
  index: string;
  issues: string[];
}
