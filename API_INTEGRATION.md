# API Integration & Rules Data

Status: **review complete, implementation pending**. All numbers below were measured directly
against the source dataset on 2026-08-12, not recalled from memory.

## 1. Candidate evaluation

| | **5e-bits / dnd5eapi.co** | **Open5e** | **Hardcoded** |
|---|---|---|---|
| 2014 ruleset | Explicit `/api/2014` namespace, separate `src/2014` dataset | SRD 5.1 based, no formal 2014/2024 split | n/a |
| Structured mechanics | Yes — typed choice objects, AC formulas, spell slot tables | Partly — more prose-shaped | Total control |
| Source data available offline | Yes — `5e-bits/5e-database`, MIT-licensed JSON | Via scraping | n/a |
| Third-party OGL content | No | Yes (Kobold Press et al.) | n/a |
| Verdict | **Primary source** | Optional future adapter | Rejected as primary |

**Decision: 5e-bits as the primary rules source.** It is the only option with a first-class,
versioned 2014 namespace, and — critically — its mechanics are *machine-readable* rather than
prose. Class skill choices, starting-equipment options, armor AC formulas, and spell-slot
progressions all come through as structured objects we can drive a wizard and a rules engine
from. Open5e's strength is breadth of third-party monsters/magic items, which is largely
orthogonal to building a character.

### Verified 2014 dataset inventory

Measured from `5e-bits/5e-database` @ `src/2014/en`:

| Collection | Count | Collection | Count |
|---|---|---|---|
| Ability scores | 6 | Languages | 16 |
| Alignments | 9 | Levels | 290 |
| **Backgrounds** | **1** | Magic items | 362 |
| Classes | 12 | Magic schools | 8 |
| Conditions | 15 | Monsters | 334 |
| Damage types | 13 | Proficiencies | 117 |
| Equipment | 237 | Races | 9 |
| Equipment categories | 39 | Skills | 18 |
| **Feats** | **1** | Spells | 319 |
| Features | 407 | **Subclasses** | **12** |
| | | **Subraces** | **4** |

## 2. Licensing constraint — this reshapes the requirement

The brief asks for "the complete API-accessible set" of races, subclasses, backgrounds, and
feats. **That set is far smaller than the Player's Handbook, and no API can legally close the
gap.** Only the SRD 5.1 is freely licensed (CC-BY-4.0, and OGL 1.0a); the rest of the PHB is
proprietary WotC content. Concretely:

- **Backgrounds: Acolyte only.** No Soldier, Criminal, Folk Hero, Sage, …
- **Feats: Grappler only.** No Great Weapon Master, Sharpshooter, Lucky, War Caster, …
- **Subclasses: exactly one per class** — Berserker, Lore, Life, Land, Champion, Open Hand,
  Devotion, Hunter, Thief, Draconic, Fiend, Evocation. No Eldritch Knight, Assassin, Moon Druid, …
- **Subraces: 4** — Hill Dwarf, High Elf, Lightfoot Halfling, Rock Gnome. No Drow, Wood Elf,
  Mountain Dwarf, Forest Gnome, Stout Halfling.
- **Spells: 319** of the ~400 in the PHB.
- Races (9) and classes (12) *are* complete.

Switching APIs does not help — Open5e is bound by the same SRD boundary for WotC content.

**Therefore custom content is not a nice-to-have; it is the mechanism by which this app becomes
usable for a real campaign.** A player running a Soldier Eldritch Knight must be able to enter
that content themselves (they own the PHB; entering their own character's data is theirs to do).
This elevates the Custom Content system from Phase 9 polish to a **Phase 2 dependency**, and it
is the single most consequential finding of this review.

**Attribution obligation:** SRD 5.1 under CC-BY-4.0 requires attribution. The app must carry an
SRD attribution notice in an About/Legal screen. Bundled data retains its MIT/OGL notices.

## 3. Architecture: `RulesSource` abstraction

```ts
interface RulesSource {
  readonly id: string;                     // 'bundled-srd-2014' | 'dnd5eapi-2014'
  list<K extends RulesCollection>(k: K): Promise<Array<RulesIndexEntry>>;
  get<K extends RulesCollection>(k: K, index: string): Promise<RulesDoc<K> | null>;
  search<K extends RulesCollection>(k: K, q: RulesQuery): Promise<Array<RulesDoc<K>>>;
}
```

Three implementations, chosen by config — the app never imports a concrete one directly:

1. **`BundledRulesSource` (default).** The dataset is vendored into the repo at build time and
   loaded from lazily code-split JSON chunks.
2. **`HttpRulesSource`.** Live `https://www.dnd5eapi.co/api/2014`, Zod-validated, TanStack Query
   cached, IndexedDB-persisted.
3. **`CompositeRulesSource`.** Overlays user custom content on top of any base source, resolving
   by `ContentRef`. This is how homebrew and official content share one lookup path.

### Why bundled-by-default is the right call

- **The data is effectively immutable.** These are 2014 rules; the dataset is a slow-moving
  snapshot. Paying network latency per lookup for immutable reference data is waste — and the
  brief explicitly asks us to cache static rules data rather than make unnecessary requests.
- **The game table is hostile to networks.** Basements, cafés, cabins. A character sheet that
  degrades without wifi is a broken character sheet.
- **Performance.** Character creation reads dozens of collections; bundling makes the wizard
  instant instead of waterfall-loading.
- **It is legitimately available.** `5e-bits/5e-database` is MIT-licensed and designed to be
  self-hosted.
- **Verified constraint:** this development environment's egress policy blocks
  `www.dnd5eapi.co` and `api.open5e.com` outright (403 on CONNECT, confirmed for both `curl` and
  fetch tooling), while `github.com` is reachable. A live-API-only design would be untestable
  here. The GitHub clone path *does* work, so vendoring is achievable in Phase 1.

The `HttpRulesSource` still gets built and tested — it keeps us honest about decoupling and
gives a refresh path — but it is not on the critical path for using the app.

### Sync / refresh strategy

Vendored data carries a `datasetVersion`. A "Check for rules updates" action can pull a newer
snapshot into IndexedDB, which then takes precedence over the bundle. **Refreshing rules data
never rewrites character data** — characters store `ContentRef`s plus a snapshot of any value
the user could have edited, so upstream changes surface as an informational diff, never a
silent overwrite.

## 4. Data integrity findings — traps confirmed in the real data

These are measured defects/subtleties, each with a required mitigation.

1. **`ability_score_bonuses` in `Levels` is cumulative, not per-level.**
   Fighter reads `L4→1, L5→1, L6→2, L8→3`. Reading it naively grants an ASI at *every* level.
   → *Mitigation:* ASI at level N iff `bonuses(N) > bonuses(N-1)`. Unit-tested per class.

2. **`Levels` mixes class and subclass rows.** Fighter returns 25 entries: 20 class levels plus
   5 Champion rows (`champion-3`, `champion-7`, …) that still carry `class.index === 'fighter'`.
   Filtering on class alone double-counts progression.
   → *Mitigation:* class progression = rows **without** a `subclass` field; subclass features are
   selected by `subclass.index`.

3. **Class features are prose only.** `Features` entries expose `desc: string[]` and no
   machine-readable effect. Barbarian/Monk Unarmored Defense, Rage, Sneak Attack, Fighting
   Styles, and Archery all exist purely as English text.
   → *Mitigation:* the hand-authored **effects layer** (see `RULES_ENGINE.md`). This is the
   central architectural consequence of the review.

4. **Only one background exists**, and it carries the equipment/proficiency shape the wizard
   depends on. → The wizard must treat backgrounds as a *custom-content-first* step.

5. **`option_set_type` has multiple shapes** — `options_array` and `equipment_category` both
   appear (e.g. Cleric chooses 1 from category `holy-symbols`), and options nest
   (`option_type: "multiple"` bundles longbow + 20 arrows). A parser handling only flat arrays
   silently drops choices.
   → *Mitigation:* one exhaustively-tested `resolveChoice()` with a discriminated union over
   every `option_type`; unknown variants surface as a manual-entry prompt rather than vanishing.

6. **Not every collection is uniformly populated.** `Feats` and `Backgrounds` have one entry;
   some spells lack `damage`/`dc`. All optional fields are modelled optional in Zod — no
   non-null assertions on API data.

### Data that is genuinely good

Worth stating, since it shapes what we *don't* have to hand-author: armor carries
`{base, dex_bonus, max_bonus, str_minimum, stealth_disadvantage}` (medium armor correctly caps
at +2); weapons carry `two_handed_damage` for Versatile alongside properties; spells carry
`damage_at_slot_level` maps for upcasting, plus `concentration` and `ritual` booleans; Half-Elf
correctly models `ability_bonus_options` (choose 2 of the non-CHA scores) and `language_options`.
AC, weapon attacks, upcasting, and spell slots can therefore be computed from data.

## 5. Validation boundary

Every document from any source is parsed through a **Zod schema at the boundary**. Invalid
records are logged, quarantined, and excluded from selection lists rather than crashing a
render or corrupting a character. Schemas live in `src/rules/schemas/` and are the single
definition of what the app believes SRD data looks like.
