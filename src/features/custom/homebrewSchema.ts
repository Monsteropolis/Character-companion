import { z } from 'zod';
import type { CustomContent, CustomContentKind, RuleEffect } from '../../domain/types';
import { persistedBase } from '../../domain/factories';
import { buildPayload, buildEffects, emptyForm, type HomebrewForm } from './payloads';

/**
 * Homebrew authoring and exchange.
 *
 * The SRD legally provides one background, one feat, twelve subclasses and four subraces, so
 * for most real characters this is where their content lives. Homebrew is therefore validated
 * and stored to the same standard as official content, not treated as a scratchpad.
 *
 * The pack format exists so a table can author a set of backgrounds once and share it, rather
 * than every player re-entering the same content by hand.
 */

export const CUSTOM_KINDS: { value: CustomContentKind; label: string; hint: string }[] = [
  { value: 'background', label: 'Background', hint: 'The SRD has only Acolyte.' },
  { value: 'subclass', label: 'Subclass', hint: 'The SRD has one per class.' },
  { value: 'feat', label: 'Feat', hint: 'The SRD has only Grappler.' },
  { value: 'subrace', label: 'Subrace', hint: 'The SRD has four.' },
  { value: 'race', label: 'Race' , hint: 'Add a race the SRD omits.' },
  { value: 'class', label: 'Class', hint: 'A wholly new class.' },
  { value: 'spell', label: 'Spell', hint: 'The SRD has 319 spells.' },
  { value: 'item', label: 'Item', hint: 'Magic items and gear.' },
  { value: 'feature', label: 'Feature', hint: 'A class or subclass feature.' },
  { value: 'trait', label: 'Trait', hint: 'A racial trait.' },
];

/**
 * Minimum viable homebrew.
 *
 * Deliberately permissive: demanding a full SRD-shaped document would stop a player recording
 * the background they are playing tonight. `payload` holds whatever structure the kind needs
 * and is refined as the app learns to consume more of it.
 */
export const homebrewEntrySchema = z.object({
  kind: z.enum([
    'race', 'subrace', 'class', 'subclass', 'background',
    'feat', 'spell', 'item', 'feature', 'trait',
  ]),
  name: z.string().min(1, 'A name is required'),
  description: z.string().optional().default(''),
  basedOn: z
    .object({ source: z.enum(['srd', 'custom']), index: z.string(), name: z.string() })
    .nullable()
    .optional()
    .default(null),
  payload: z.record(z.string(), z.unknown()).optional().default({}),
  effects: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  /** The authoring form, so an imported entry can be edited rather than only read. */
  form: z.record(z.string(), z.unknown()).optional(),
});

export type HomebrewEntry = z.infer<typeof homebrewEntrySchema>;

export const PACK_FORMAT = 'character-companion.homebrew';
export const PACK_VERSION = 1;

export const homebrewPackSchema = z.object({
  format: z.literal(PACK_FORMAT),
  packVersion: z.number(),
  name: z.string().optional().default('Homebrew pack'),
  author: z.string().optional().default(''),
  entries: z.array(homebrewEntrySchema),
});

export type HomebrewPack = z.infer<typeof homebrewPackSchema>;

/**
 * Builds a storable record from an authored or imported entry.
 *
 * The rules document is always regenerated from the authoring form rather than trusted from
 * the entry, so an imported pack cannot inject a malformed document that would later be
 * quarantined and silently disappear.
 */
export function toCustomContent(entry: HomebrewEntry): CustomContent {
  const form: HomebrewForm = {
    ...emptyForm(),
    ...(entry.form as Partial<HomebrewForm> | undefined),
    name: entry.name,
    description: entry.description,
  };

  return {
    ...persistedBase(),
    kind: entry.kind,
    name: entry.name,
    basedOn: entry.basedOn ?? null,
    payload: buildPayload(entry.kind, form),
    effects: (entry.effects.length > 0
      ? entry.effects
      : buildEffects(entry.kind, form)) as unknown as RuleEffect[],
    form,
  };
}

export function toPack(entries: CustomContent[], name = 'Homebrew pack'): HomebrewPack {
  return {
    format: PACK_FORMAT,
    packVersion: PACK_VERSION,
    name,
    author: '',
    entries: entries.map((c) => ({
      kind: c.kind,
      name: c.name,
      description: descriptionOf(c),
      basedOn: c.basedOn,
      payload: (c.payload ?? {}) as Record<string, unknown>,
      effects: c.effects as unknown as Record<string, unknown>[],
      form: (c.form ?? {}) as Record<string, unknown>,
    })),
  };
}

export function descriptionOf(content: CustomContent): string {
  const payload = content.payload as { desc?: string[] | string } | null;
  if (!payload?.desc) return '';
  return Array.isArray(payload.desc) ? payload.desc.join('\n') : payload.desc;
}

/** Parses an imported pack, reporting why it failed rather than throwing a raw Zod error. */
export function parsePack(raw: unknown): { pack: HomebrewPack } | { error: string } {
  const parsed = homebrewPackSchema.safeParse(raw);
  if (parsed.success) {
    if (parsed.data.packVersion > PACK_VERSION) {
      return { error: 'This pack was made with a newer version of the app.' };
    }
    return { pack: parsed.data };
  }
  return {
    error: parsed.error.issues
      .map((i) => `${i.path.join('.') || 'pack'}: ${i.message}`)
      .join('; '),
  };
}
