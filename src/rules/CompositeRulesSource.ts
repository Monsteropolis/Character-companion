import type { CollectionKey, CollectionDoc } from './collections';
import type { RulesSource, RulesIndexEntry } from './RulesSource';
import type { CustomContent, CustomContentKind } from '../domain/types';

/** Maps a custom-content kind onto the rules collection it participates in. */
const KIND_TO_COLLECTION: Record<CustomContentKind, CollectionKey> = {
  race: 'races',
  subrace: 'subraces',
  class: 'classes',
  subclass: 'subclasses',
  background: 'backgrounds',
  feat: 'feats',
  spell: 'spells',
  item: 'equipment',
  feature: 'features',
  trait: 'traits',
};

export interface CustomContentProvider {
  list(): Promise<CustomContent[]>;
}

/**
 * Official rules content with user homebrew layered on top.
 *
 * This is the single lookup path the rest of the app uses, and it is what makes homebrew a
 * first-class citizen rather than a parallel system: because a custom subclass resolves through
 * the same interface as an SRD one, it appears in the creation wizard, the sheet and the
 * level-up flow without any of them knowing it is custom.
 *
 * That matters more here than in most apps. The SRD provides one background, one feat and
 * twelve subclasses, so for most real characters the homebrew layer is not an edge case --
 * it is where their content lives.
 */
export class CompositeRulesSource implements RulesSource {
  readonly id: string;

  constructor(
    private readonly base: RulesSource,
    private readonly custom: CustomContentProvider,
  ) {
    this.id = `composite(${base.id})`;
  }

  async all<K extends CollectionKey>(collection: K): Promise<CollectionDoc<K>[]> {
    const [baseDocs, overlay] = await Promise.all([
      this.base.all(collection),
      this.customFor(collection),
    ]);

    // Custom entries override official ones of the same index, so a user can correct or
    // reinterpret SRD content without editing the dataset.
    const overrides = new Map(overlay.map((c) => [this.indexFor(c), c.payload]));
    const merged = baseDocs.map((doc) => {
      const key = (doc as { index: string }).index;
      return (overrides.get(key) ?? doc) as CollectionDoc<K>;
    });

    const additions = overlay
      .filter((c) => !baseDocs.some((d) => (d as { index: string }).index === this.indexFor(c)))
      .map((c) => c.payload as CollectionDoc<K>);

    return [...merged, ...additions];
  }

  async list<K extends CollectionKey>(collection: K): Promise<RulesIndexEntry[]> {
    const [baseList, overlay] = await Promise.all([
      this.base.list(collection),
      this.customFor(collection),
    ]);

    const customIndices = new Set(overlay.map((c) => this.indexFor(c)));

    const merged: RulesIndexEntry[] = baseList.map((entry) =>
      customIndices.has(entry.index) ? { ...entry, source: 'custom' as const } : entry,
    );

    for (const c of overlay) {
      if (!merged.some((m) => m.index === this.indexFor(c))) {
        merged.push({ index: this.indexFor(c), name: c.name, source: 'custom' });
      }
    }

    return merged.sort((a, b) => a.name.localeCompare(b.name));
  }

  async get<K extends CollectionKey>(
    collection: K,
    index: string,
  ): Promise<CollectionDoc<K> | null> {
    const overlay = await this.customFor(collection);
    const match = overlay.find((c) => this.indexFor(c) === index);
    if (match) return match.payload as CollectionDoc<K>;
    return this.base.get(collection, index);
  }

  private async customFor(collection: CollectionKey): Promise<CustomContent[]> {
    const all = await this.custom.list();
    return all.filter((c) => KIND_TO_COLLECTION[c.kind] === collection);
  }

  /**
   * Custom content addresses itself by `custom:<id>` unless it overrides official content, in
   * which case it borrows that content's index so lookups resolve to the override.
   */
  private indexFor(content: CustomContent): string {
    return content.basedOn?.index ?? `custom:${content.id}`;
  }
}
