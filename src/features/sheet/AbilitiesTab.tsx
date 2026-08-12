import { useMemo, useState } from 'react';
import { useSheet } from './CharacterShell';
import { Panel, Button, EmptyState } from '../../ui/primitives';
import { TextInput, Field, TextArea } from '../creation/steps/parts';
import { isEncoded } from '../../engine/effects/registry';
import { newId } from '../../domain/factories';
import type { CustomFeature } from '../../domain/types';

/**
 * Features and traits.
 *
 * Searchable and collapsible, grouped by where they came from. Features whose mechanical effect
 * the engine does not model are marked, so a player knows at a glance which ones the sheet is
 * applying for them and which they have to remember themselves.
 */
export function AbilitiesTab() {
  const { character, features, update } = useSheet();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState<CustomFeature | null>(null);

  const grouped = useMemo(() => {
    const filtered = features.filter((f) =>
      query
        ? f.name.toLowerCase().includes(query.toLowerCase()) ||
          f.desc.join(' ').toLowerCase().includes(query.toLowerCase())
        : true,
    );
    const map = new Map<string, typeof features>();
    for (const feature of filtered) {
      map.set(feature.source, [...(map.get(feature.source) ?? []), feature]);
    }
    return [...map.entries()];
  }, [features, query]);

  if (!character) return null;

  async function saveCustom(feature: CustomFeature) {
    if (!character) return;
    const exists = character.customFeatures.some((f) => f.id === feature.id);
    await update({
      customFeatures: exists
        ? character.customFeatures.map((f) => (f.id === feature.id ? feature : f))
        : [...character.customFeatures, feature],
    });
    setAdding(null);
  }

  async function removeCustom(id: string) {
    if (!character) return;
    await update({ customFeatures: character.customFeatures.filter((f) => f.id !== id) });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search features and traits"
          aria-label="Search features and traits"
          className="flex-1"
        />
        <Button
          variant="secondary"
          onClick={() =>
            setAdding({ id: newId(), name: '', description: '', source: 'Custom', effects: [] })
          }
        >
          Add your own
        </Button>
      </div>

      {adding ? (
        <Panel className="p-4">
          <h3 className="display-face mb-3 font-semibold">Custom feature</h3>
          <Field label="Name" htmlFor="cf-name">
            <TextInput
              id="cf-name"
              value={adding.name}
              onChange={(e) => setAdding({ ...adding, name: e.target.value })}
              placeholder="e.g. Boon of the Storm"
            />
          </Field>
          <Field label="Where it came from" htmlFor="cf-source">
            <TextInput
              id="cf-source"
              value={adding.source}
              onChange={(e) => setAdding({ ...adding, source: e.target.value })}
              placeholder="e.g. Epic Boon, DM reward"
            />
          </Field>
          <Field label="Description" htmlFor="cf-desc">
            <TextArea
              id="cf-desc"
              value={adding.description}
              onChange={(e) => setAdding({ ...adding, description: e.target.value })}
              rows={4}
            />
          </Field>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setAdding(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!adding.name.trim()}
              onClick={() => void saveCustom(adding)}
            >
              Save
            </Button>
          </div>
        </Panel>
      ) : null}

      {grouped.length === 0 ? (
        <EmptyState
          title={query ? 'Nothing matches' : 'No features yet'}
          description={
            query
              ? 'Try a different search term.'
              : 'Features from your race, class and background appear here.'
          }
        />
      ) : null}

      {grouped.map(([source, list]) => (
        <section key={source}>
          <h2 className="display-face mb-2 font-semibold">{source}</h2>
          <ul className="space-y-2">
            {list.map((feature) => {
              const custom = character.customFeatures.some((f) => f.id === feature.index);
              return (
                <li key={feature.index}>
                  <details className="panel p-3">
                    <summary className="flex cursor-pointer items-center justify-between gap-2">
                      <span className="font-medium">{feature.name}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        {/* Says plainly whether the sheet applies this or the player must. */}
                        {!isEncoded(feature.index) && !custom ? (
                          <span className="rounded-full border border-[var(--border-strong)] px-2 py-0.5 text-[0.625rem] tracking-wide text-[var(--text-muted)] uppercase">
                            Manual
                          </span>
                        ) : null}
                        {custom ? (
                          <span className="rounded-full border border-[var(--border-strong)] px-2 py-0.5 text-[0.625rem] tracking-wide text-[var(--text-muted)] uppercase">
                            Custom
                          </span>
                        ) : null}
                      </span>
                    </summary>
                    <div className="mt-2 space-y-2 border-t border-[var(--border)] pt-2 text-sm text-[var(--text-muted)]">
                      {feature.desc.map((paragraph, i) => (
                        <p key={i}>{paragraph}</p>
                      ))}
                      {custom ? (
                        <button
                          type="button"
                          onClick={() => void removeCustom(feature.index)}
                          className="min-h-11 text-xs text-[var(--danger)]"
                        >
                          Remove this feature
                        </button>
                      ) : null}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
