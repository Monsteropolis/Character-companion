# Rules Engine

Status: **proposed**. The engine is the highest-risk, highest-value subsystem; it is specified
before it is written.

## 1. Contract

```ts
function deriveCharacter(
  character: Character,
  rules: ResolvedRules,      // pre-resolved SRD + custom docs the character references
  items: InventoryItem[],
): DerivedStats;
```

Pure, synchronous, deterministic. No I/O, no React, no clock, no randomness. Dice rolling lives
outside the engine — the engine computes *bonuses*, not results. Every one of the brief's
required numbers comes from here and nowhere else:

ability modifiers · proficiency bonus · saving throws · skills · AC · initiative · HP · hit dice ·
passive Perception · spell save DC · spell attack bonus · weapon attack & damage · carry capacity ·
encumbrance.

## 2. Contribution model — the core design decision

A naïve engine returns `{ ac: 17 }`. This one returns the *reasons*:

```ts
interface Contribution {
  source: string;          // 'Breastplate' | 'DEX modifier' | 'Ring of Protection'
  sourceRef?: ContentRef;
  value: number;
  kind: 'base'|'ability'|'proficiency'|'item'|'feature'|'condition'|'override'|'manual';
}

interface DerivedValue {
  total: number;
  contributions: Contribution[];
  advantage?: 'advantage' | 'disadvantage' | null;
  notes: string[];         // prose the engine can't compute — surfaced, not swallowed
}
```

Three things fall out of this, which is why it is worth the extra structure:

1. **The UI gets explanations for free.** Tapping AC shows `14 breastplate + 2 DEX + 1 ring`.
   This is the single highest-value UX affordance in a character sheet, and it is impossible to
   retrofit onto a bare number.
2. **Bugs become visible.** A wrong total shows *which* contributor is wrong.
3. **`notes` is the honesty valve.** When a feature's effect can't be modelled, the engine says
   so on the affected stat instead of silently ignoring it.

## 3. The effects layer — required, not optional

**Finding from the data audit: SRD features are prose.** `Features` entries carry only
`desc: string[]`. Barbarian Unarmored Defense reads *"your Armor Class equals 10 + your Dexterity
modifier + your Constitution modifier"* as English. Nothing in any 5e API will compute that.

So the engine is driven by a hand-authored, version-controlled registry mapping feature indices
to machine-readable effects:

```ts
type RuleEffect =
  | { t: 'ability-bonus';    ability: AbilityId; value: number }
  | { t: 'ac-formula';       base: number; adds: AbilityId[]; allowShield: boolean; requiresNoArmor: boolean }
  | { t: 'ac-bonus';         value: number }
  | { t: 'proficiency';      ref: ContentRef }
  | { t: 'expertise';        skill: string }
  | { t: 'speed';            mode: 'walk'|'fly'|'swim'|'climb'; value: number; op: 'set'|'add' }
  | { t: 'resource';         key: string; max: DiceOrNumber; resetOn: RestType }
  | { t: 'damage-rider';     appliesTo: WeaponFilter; dice: string; damageType: string }
  | { t: 'attack-bonus';     appliesTo: WeaponFilter; value: number }
  | { t: 'save-advantage';   against: string }
  | { t: 'resistance';       damageType: string }
  | { t: 'carry-multiplier'; value: number }
  | { t: 'max-hp-per-level'; value: number }
  | { t: 'prose-only';       summary: string };   // explicit "we can't model this"
```

`prose-only` is deliberate. A feature with no mechanical encoding is tagged as such, still
renders its full text in Features & Traits, and — where relevant — appears in a stat's `notes`.
The failure mode we refuse is a feature that silently does nothing with no indication.

**Coverage plan.** ~407 SRD features exist; only a minority alter a computed statistic. Phase 3
encodes the level-1 mechanical set (Unarmored Defense ×2, Fighting Styles, Draconic Resilience,
Dwarven/Elven traits, Rage, Sneak Attack, Martial Arts); the rest are added incrementally, each
with a test. Registry completeness is tracked as a checklist, not assumed.

Item effects use the **same `RuleEffect` union**, so a homebrew cloak and SRD plate armor take
identical paths through AC computation.

## 4. Calculation order

Order matters; several 5e rules are non-commutative.

```
1  ability totals   = base + racial + asi + misc  (override wins outright)
2  modifiers        = floor((score - 10) / 2)
3  proficiency      = 1 + ceil(totalCharacterLevel / 4)      // total, not per-class
4  effects collected: race, class, subclass, background, feats, equipped items, conditions
5  AC               = best of {unarmored 10+DEX, armor formula, feature formulas} + shield + bonuses
6  HP               = Σ per-level (roll|average + CON mod) + per-level effects   (override wins)
7  saves, skills, passives
8  attacks          = ability mod + proficiency? + item bonus + riders
9  spellcasting     = save DC 8 + prof + ability;  attack = prof + ability
10 carry/encumbrance
11 conditions applied last — they suppress and override earlier results
```

Rules the order encodes, each a common bug:

- **Proficiency bonus uses total character level**, not the level of any single class.
- **AC formulas compete; they don't stack.** A Barbarian in armor uses the armor. The engine
  computes every applicable formula and takes the max, which is also how it stays correct when a
  homebrew formula is added.
- **Medium armor caps DEX at +2** — read from `armor_class.max_bonus`, not hardcoded.
- **`str_minimum`** on heavy armor imposes a speed penalty rather than blocking equip.
- **Conditions run last** because they override (Unconscious → auto-fail STR/DEX saves;
  Exhaustion 5 → speed 0) rather than contribute.

## 5. Level progression

Both level traps found in the data audit are handled here.

```ts
function levelUpPlan(character, targetLevel, classRef): LevelUpPlan
```

- **Class progression rows are those *without* a `subclass` field.** Fighter's `Levels` returns
  25 entries — 20 class rows plus 5 Champion rows that still report `class.index === 'fighter'`.
- **ASI is granted at level N iff `ability_score_bonuses(N) > ability_score_bonuses(N-1)`**, since
  that field is cumulative (Fighter: L4→1, L6→2, L8→3). Reading it directly grants an ASI every
  level.

`levelUpPlan` returns a **`LevelUpPlan` of pending choices, and mutates nothing.** HP mode
(roll/average/manual), ASI-vs-feat, new spells, subclass selection at the class's subclass level,
and expertise picks are all presented for confirmation. Commit writes a `LevelUpRecord` so the
step is auditable and reversible — which is the brief's "no silent irreversible choices"
requirement expressed as a mechanism rather than a promise.

## 6. Multiclassing

`ClassEntry[]` from day one (§DATA_MODEL 3), because retrofitting it means touching every
derived stat. Multiclass spell-slot computation uses the standard combined-caster-level table:
full casters at full level, half casters (Paladin/Ranger) at half rounded down, Warlock **excluded**
— Pact Magic is a separate pool with its own recovery. The SRD provides multiclass prerequisites
(`multi_classing.prerequisite_options`, verified present), which the UI surfaces as a warning
rather than a hard block.

## 7. Testing

The engine is where tests earn their keep, because errors are silent and compound.

- **Golden characters.** Full fixtures — a level-1 Fighter, a level-5 Wizard, a level-8
  multiclass — asserted end-to-end against hand-verified numbers.
- **Table-driven rules.** Proficiency bonus across levels 1–20; AC across every SRD armor at
  several DEX values (light/medium-capped/heavy/shield); spell slots for every caster class at
  every level, checked against the SRD tables; ASI levels per class.
- **Property tests.** Modifiers monotonic in score; contributions always sum to `total`.
- **Regression tests** for each of the six data-integrity findings in `API_INTEGRATION.md`, so a
  dataset refresh that reintroduces one fails CI.

Target: engine at high coverage before the sheet UI is built on top of it, since every UI surface
inherits its correctness.
