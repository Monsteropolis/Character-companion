import { collectionRegistry, type CollectionKey, type CollectionDoc } from './collections';
import type { RulesSource, RulesIndexEntry } from './RulesSource';

/**
 * Rules served live from a 5e SRD REST API.
 *
 * Not the default -- bundled data is faster, works offline, and is the same content (see
 * API_INTEGRATION.md §3). This exists so the abstraction stays honest rather than being a
 * single-implementation interface, and to provide a refresh path for updated rules data.
 *
 * The 2014 namespace is explicit in the base URL: the 2024 revision is a different ruleset and
 * silently mixing the two would produce characters that are invalid under either.
 */
export class HttpRulesSource implements RulesSource {
  readonly id = 'dnd5eapi-2014';

  private readonly cache = new Map<CollectionKey, unknown[]>();
  private readonly inflight = new Map<CollectionKey, Promise<unknown[]>>();

  constructor(
    private readonly baseUrl = 'https://www.dnd5eapi.co/api/2014',
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
    private readonly timeoutMs = 10_000,
  ) {}

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

  private load(collection: CollectionKey): Promise<unknown[]> {
    const cached = this.cache.get(collection);
    if (cached) return Promise.resolve(cached);

    const pending = this.inflight.get(collection);
    if (pending) return pending;

    const promise = this.fetchCollection(collection)
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

  /**
   * The API returns an index list, then one document per entry, so a collection needs N+1
   * requests. Detail requests run in bounded batches: issuing 334 parallel requests for monsters
   * would be throttled or dropped, and unbounded concurrency is how a "fast" client gets
   * rate-limited into failure.
   */
  private async fetchCollection(collection: CollectionKey): Promise<unknown[]> {
    const { schema } = collectionRegistry[collection];
    const listing = await this.request<{ results?: { index: string }[] }>(`/${collection}`);
    const indices = (listing.results ?? []).map((r) => r.index);

    const docs: unknown[] = [];
    const BATCH = 12;

    for (let i = 0; i < indices.length; i += BATCH) {
      const batch = indices.slice(i, i + BATCH);
      const settled = await Promise.allSettled(
        batch.map((index) => this.request<unknown>(`/${collection}/${index}`)),
      );

      for (const [n, result] of settled.entries()) {
        if (result.status !== 'fulfilled') {
          console.warn(`[rules] failed to fetch ${collection}/${batch[n]}`, result.reason);
          continue;
        }
        // Same boundary validation as bundled data -- a live API is not more trustworthy.
        const parsed = schema.safeParse(result.value);
        if (parsed.success) docs.push(parsed.data);
        else console.warn(`[rules] quarantined ${collection}/${batch[n]}`, parsed.error.issues);
      }
    }

    return docs;
  }

  private async request<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`Rules API responded ${response.status} for ${path}`);
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }
}
