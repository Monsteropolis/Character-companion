import { z } from 'zod';

/**
 * Shared building blocks of the SRD dataset.
 *
 * These schemas are the single definition of what the app believes SRD data looks like.
 * Every document from every RulesSource is parsed through them at the boundary, so that a
 * malformed or unexpected record is quarantined rather than reaching the rules engine.
 */

/** A pointer to another SRD document. Present on nearly every record. */
export const apiReferenceSchema = z.object({
  index: z.string(),
  name: z.string(),
  url: z.string().optional(),
});
export type ApiReference = z.infer<typeof apiReferenceSchema>;

export const abilityIdSchema = z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']);
export type AbilityId = z.infer<typeof abilityIdSchema>;

export const costSchema = z.object({
  quantity: z.number(),
  unit: z.string(),
});

export const damageSchema = z.object({
  damage_dice: z.string().optional(),
  damage_type: apiReferenceSchema.optional(),
});

export const dcSchema = z.object({
  dc_type: apiReferenceSchema,
  dc_value: z.number().optional(),
  success_type: z.string().optional(),
});

/**
 * The choice/option system.
 *
 * This is the most structurally complex part of the dataset and the part most likely to be
 * parsed incompletely. The dataset uses 11 distinct `option_type` discriminants and 3
 * `option_set_type` container shapes, and options nest arbitrarily (`multiple` bundles other
 * options; `choice` embeds a whole nested choice). All variants are enumerated exhaustively
 * below -- a parser that handles only flat arrays silently drops real player choices, such as
 * the Fighter's "leather armor, longbow and 20 arrows" bundle.
 */

// Recursive types must be declared before use, so option/choice are typed explicitly.
export type OptionSet =
  | { option_set_type: 'options_array'; options: Option[] }
  | { option_set_type: 'equipment_category'; equipment_category: ApiReference }
  | { option_set_type: 'resource_list'; resource_list_url: string };

export type Choice = {
  desc?: string;
  choose: number;
  type: string;
  from: OptionSet;
};

export type Option =
  | { option_type: 'reference'; item: ApiReference }
  | { option_type: 'counted_reference'; count: number; of: ApiReference; prerequisites?: unknown[] }
  | { option_type: 'multiple'; items: Option[] }
  | { option_type: 'choice'; choice: Choice }
  | { option_type: 'string'; string: string }
  | { option_type: 'ability_bonus'; ability_score: ApiReference; bonus: number }
  | { option_type: 'score_prerequisite'; ability_score: ApiReference; minimum_score: number }
  | { option_type: 'ideal'; desc: string; alignments: ApiReference[] }
  | { option_type: 'action'; [k: string]: unknown }
  | { option_type: 'breath'; [k: string]: unknown }
  | { option_type: 'damage'; [k: string]: unknown };

export const optionSchema: z.ZodType<Option> = z.lazy(() =>
  z.discriminatedUnion('option_type', [
    z.object({ option_type: z.literal('reference'), item: apiReferenceSchema }),
    z.object({
      option_type: z.literal('counted_reference'),
      count: z.number(),
      of: apiReferenceSchema,
      prerequisites: z.array(z.unknown()).optional(),
    }),
    z.object({ option_type: z.literal('multiple'), items: z.array(optionSchema) }),
    z.object({ option_type: z.literal('choice'), choice: z.lazy(() => choiceSchema) }),
    z.object({ option_type: z.literal('string'), string: z.string() }),
    z.object({
      option_type: z.literal('ability_bonus'),
      ability_score: apiReferenceSchema,
      bonus: z.number(),
    }),
    z.object({
      option_type: z.literal('score_prerequisite'),
      ability_score: apiReferenceSchema,
      minimum_score: z.number(),
    }),
    z.object({
      option_type: z.literal('ideal'),
      desc: z.string(),
      alignments: z.array(apiReferenceSchema),
    }),
    // Monster-only option shapes. Loosely typed on purpose: they never drive character
    // construction, and tightening them would reject valid data for no benefit.
    z.object({ option_type: z.literal('action') }).passthrough(),
    z.object({ option_type: z.literal('breath') }).passthrough(),
    z.object({ option_type: z.literal('damage') }).passthrough(),
  ]) as unknown as z.ZodType<Option>,
);

export const optionSetSchema: z.ZodType<OptionSet> = z.lazy(() =>
  z.discriminatedUnion('option_set_type', [
    z.object({
      option_set_type: z.literal('options_array'),
      options: z.array(optionSchema),
    }),
    z.object({
      option_set_type: z.literal('equipment_category'),
      equipment_category: apiReferenceSchema,
    }),
    z.object({
      option_set_type: z.literal('resource_list'),
      resource_list_url: z.string(),
    }),
  ]) as unknown as z.ZodType<OptionSet>,
);

export const choiceSchema: z.ZodType<Choice> = z.lazy(() =>
  z.object({
    desc: z.string().optional(),
    choose: z.number(),
    type: z.string(),
    from: optionSetSchema,
  }),
);
