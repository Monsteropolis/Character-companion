# Character Companion

A persistent digital companion for **D&D 5e (2014 ruleset)** characters — built to feel like an
RPG interface rather than a PDF character sheet, and to survive an entire campaign.

> **Status: architecture review complete. Implementation has not started.**
> The design is documented below and awaiting sign-off on the open questions in
> [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) §5.

## What this is

Character creation, a live play dashboard, inventory, spellbook, leveling, a public/private
campaign journal, linked campaign notes, and character portraits/sprites with an emote system.
Local-first, offline-capable, mobile- and table-friendly.

## Documentation

These documents are the source of truth and are maintained as development proceeds.

| Document | Contents |
|---|---|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Stack, module boundaries, data flow, navigation, sync-readiness |
| [`DATA_MODEL.md`](./DATA_MODEL.md) | Entities, persistence layout, the rules/character/custom split |
| [`RULES_ENGINE.md`](./RULES_ENGINE.md) | Derived stats, the effects layer, calculation order, testing |
| [`API_INTEGRATION.md`](./API_INTEGRATION.md) | API evaluation, licensing limits, data-integrity findings |
| [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) | Phases, assumptions, risks, open questions |

## Three findings that shaped the design

**1. The SRD is much smaller than the Player's Handbook, and no API can fix that.**
Measured against the 2014 dataset: **1 background** (Acolyte), **1 feat** (Grappler),
**12 subclasses** (one per class), **4 subraces**, and 319 spells. Races and classes are complete.
Only SRD 5.1 is freely licensed; the rest of the PHB is proprietary. So **custom content is a
core feature, not an add-on** — it is how a player represents the character they're actually
playing. See [`API_INTEGRATION.md`](./API_INTEGRATION.md) §2.

**2. Rules data describes features in English, not in code.**
Barbarian Unarmored Defense arrives as the sentence *"your Armor Class equals 10 + your Dexterity
modifier + your Constitution modifier."* No 5e API computes that. The app therefore carries a
hand-authored **effects layer** translating features into machine-readable modifiers, with an
explicit `prose-only` fallback so an unencoded feature still displays its text instead of
silently doing nothing. See [`RULES_ENGINE.md`](./RULES_ENGINE.md) §3.

**3. The dataset contains real traps.**
`ability_score_bonuses` is *cumulative*, so read naively it grants an ASI at every level;
`Levels` mixes subclass rows into class progression (Fighter returns 25 rows for 20 levels).
Both are handled explicitly and covered by regression tests. See
[`API_INTEGRATION.md`](./API_INTEGRATION.md) §4.

## Design principles

- **One source of truth for every number.** All derived statistics come from a single pure
  `deriveCharacter()`. No component computes a modifier inline.
- **Show your work.** Stats carry their contributions, so AC 17 explains itself as
  *14 breastplate + 2 DEX + 1 ring*.
- **Never overwrite the player.** Every derived value has a manual override, and refreshing
  rules data never rewrites character data.
- **No silent irreversible choices.** Selections are recorded with their origin, so back-navigation
  and level-ups are non-destructive and auditable.
- **Official vs. homebrew is always visible**, and homebrew works everywhere official content does.
- **Private stays private.** Journal visibility is a required field with no default.

## Stack

TypeScript (strict) · React + Vite · React Router · Zustand · TanStack Query · Dexie (IndexedDB) ·
Zod · Tailwind + design tokens · Vitest. Rationale in [`ARCHITECTURE.md`](./ARCHITECTURE.md) §2.

## Getting started

Not yet applicable — implementation begins at Phase 0. Setup instructions will land with it.

## Legal

This project ships no proprietary Wizards of the Coast content. Rules data derives from the
**SRD 5.1**, used under **CC-BY-4.0**, via the MIT-licensed
[`5e-bits/5e-database`](https://github.com/5e-bits/5e-database) dataset. Attribution notices ship
in the application. Homebrew content is created and owned by users.
