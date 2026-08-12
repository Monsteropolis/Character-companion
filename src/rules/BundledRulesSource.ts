import { collectionRegistry, type CollectionKey, type CollectionDoc } from './collections';
import type { RulesSource, RulesIndexEntry, ValidationReport, QuarantinedRecord } from './RulesSource';

/**
 * Rules served from the SRD dataset vendored into this repository.
 *
 * This is the default source. The data is immutable 2014 reference material, so paying network
 * latency per lookup would be waste, and a character sheet must keep working at a game table
 * with no connection. See API_INTEGRATION.md §3 for the full rationale.
 *
 * Collections are loaded lazily and cached per collection, so opening the spell list never
 * pays for the 1.3 MB monster file.
 */

// Vite resolves these to lazily-fetched chunks; only requested collections are ever downloaded.
const loaders = import.meta.glob<{ default: unknown[] }>('./data/2014/*.json');

export class BundledRulesSource implements RulesSource {
  readonly id = 'bundled-srd-2014';

  private readonly cache = new Map<CollectionKey, unknown[]>();
  private readonly inflight = new Map<CollectionKey, Promise<unknown[]>>();
  private readonly reports = new Map<CollectionKey, ValidationReport>();

  async all<K extends CollectionKey>(collection: K): Promise<CollectionDoc<K>[]> {
    return (await this.load(collection)) as CollectionDoc<K>[];
  }

  async list<K extends CollectionKey>(collection: K): Promise<RulesIndexEntry[]> {
    const docs = (await this.load(collection)) as { index: string; name: string }[];
    return docs.map((d) => ({ index: d.index, name: d.name, source: 'srd' as const }));
  }

  async get<K extends CollectionKey>(
    collection: K,
    index: string,
  ): Promise<CollectionDoc<K> | null> {
    const docs = (await this.load(collection)) as { index: string }[];
    return (docs.find((d) => d.index === index) as CollectionDoc<K>) ?? null;
  }

  /** Validation outcome for a collection, once it has been loaded. */
  reportFor(collection: CollectionKey): ValidationReport | undefined {
    return this.reports.get(collection);
  }

  private load(collection: CollectionKey): Promise<unknown[]> {
    const cached = this.cache.get(collection);
    if (cached) return Promise.resolve(cached);

    // De-duplicate concurrent loads; several panels commonly request one collection at once.
    const pending = this.inflight.get(collection);
    if (pending) return pending;

    const promise = this.read(collection)
      .then((docs) => {
        this.cache.set(collection, docs);
        this.inflight.delete(collection);
        return docs;
      })
      .catch((err) => {
        this.inflight.delete(collection);
        throw err;
      });

    this.inflight.set(collection, promise);
    return promise;
  }

  private async read(collection: CollectionKey): Promise<unknown[]> {
    const { file, schema } = collectionRegistry[collection];
    const loader = loaders[`./data/2014/${file}`];
    if (!loader) throw new Error(`Bundled rules data missing for collection "${collection}"`);

    const mod = await loader();
    const raw = Array.isArray(mod.default) ? mod.default : [];

    // Validate at the boundary. An invalid record is quarantined and excluded rather than
    // allowed to reach the rules engine, where it would surface as a wrong number on a sheet.
    const valid: unknown[] = [];
    const quarantined: QuarantinedRecord[] = [];

    for (const record of raw) {
      const parsed = schema.safeParse(record);
      if (parsed.success) {
        valid.push(parsed.data);
      } else {
        quarantined.push({
          index:
            typeof record === 'object' && record !== null && 'index' in record
              ? String((record as { index: unknown }).index)
              : '<unknown>',
          issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        });
      }
    }

    this.reports.set(collection, {
      collection,
      total: raw.length,
      valid: valid.length,
      quarantined,
    });

    if (quarantined.length > 0) {
      console.warn(
        `[rules] ${quarantined.length}/${raw.length} records quarantined in "${collection}"`,
        quarantined,
      );
    }

    return valid;
  }
}
