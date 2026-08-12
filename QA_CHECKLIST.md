# QA checklist

A pass through everything the app claims to do. Roughly 45 minutes end to end; each section
stands alone, so you can do them in any order or stop after the ones you care about.

**Before you start:** everything is stored in your browser on the device you are testing with.
Two browsers, or a private window, are two separate character libraries. Nothing is uploaded.

Legend: **Do** what it says, expect **→**. Anything that does not match is a bug worth telling me
about, with the browser and screen size you saw it on.

---

## 1. First run and data safety

- [ ] Open the app fresh → a "Before you start" panel explains local storage, the SRD limits and
      Homebrew. Dismiss it → it does not come back on reload.
- [ ] With no characters → the gallery offers "Start character creation" rather than an empty grid.
- [ ] Some browsers refuse persistent storage → if yours does, a warning strip appears under the
      masthead telling you to export. (No warning means the browser granted it; that is the good
      case.)
- [ ] Turn off wifi → an "Offline" strip appears, and **everything keeps working** — create a
      character, edit it, switch tabs. Turn wifi back on → the strip disappears.
- [ ] Reload the page mid-session → you land back on the same URL with your data intact.

## 2. Character creation

- [ ] Start creation → 9 steps: Identity, Race, Class, Background, Abilities, Skills, Equipment,
      Spells, Review. The step rail shows a ✓ against steps that are already valid.
- [ ] Try to continue past Race without picking one → the button is disabled, not a silent no-op.
- [ ] Pick a race with a subrace (Dwarf, Elf, Halfling, Gnome) → subrace options appear; racial
      ability bonuses show on the Abilities step.
- [ ] On Abilities, try each method: **Standard array** (assign 15/14/13/12/10/8), **Point buy**
      (27 points, cost shown, cannot overspend), **Roll** (4d6 drop lowest), **Manual** (any value
      1–30, for a DM who has ruled something unusual).
- [ ] Start at a level above 1 → the wizard asks for the levels' choices rather than assuming.
- [ ] Skills step → you get exactly the number your class allows, and skills already granted by
      your background are marked rather than offered twice.
- [ ] Equipment step → the class's starting-equipment choices are real choices, and there is a
      gold option.
- [ ] Spells step → appears for casters only. A wizard picks cantrips and spellbook spells; a
      barbarian never sees the step.
- [ ] Review → shows the derived numbers (AC, HP, initiative, saves) before you commit.
- [ ] Create → you land on the character sheet, and the character appears in the gallery.
- [ ] Go back mid-wizard and change your class → choices that no longer apply are dropped, and
      choices that still apply survive.

## 3. The dashboard and the play bar

- [ ] The play bar is visible on every tab: portrait, name, race/class/level, AC, initiative,
      speed, HP bar, damage/heal/temp, emotes.
- [ ] Scroll down a long tab → the play bar stays on screen (docked at the top on a phone, in the
      right rail on a desktop).
- [ ] Deal damage → HP drops, the bar changes colour at half HP, and the number changes too (not
      colour alone).
- [ ] Take yourself to 0 → "Unconscious — roll death saves in the Combat tab", and the portrait
      reacts.
- [ ] Heal above your maximum → it clamps to max; temp HP is tracked separately and is spent first.
- [ ] Every number on the Overview tab is tappable → tapping shows *where it came from* (base,
      proficiency, ability modifier, item, override), not just the total.

## 4. Combat

- [ ] Death saves: three successes and three failures, independently tracked, resettable.
- [ ] Hit dice: spend one, and it is deducted; a long rest returns half your total, rounded down.
- [ ] Conditions: add from the real SRD list; each shows its rules text.
- [ ] Exhaustion: set level 3 → the effects that apply at that level are listed, and the
      disadvantage shows up on the relevant rolls.
- [ ] Short rest → Pact Magic slots, Second Wind, Action Surge, Ki (and similar) come back;
      ordinary spell slots do not.
- [ ] Long rest → everything comes back, HP to full, exhaustion drops by one.
- [ ] Attacks: an equipped weapon appears as an attack card with the right attack bonus and
      damage, including your ability modifier and proficiency.

## 5. Abilities, skills and overrides

- [ ] All six scores with modifiers, saves and skills; proficiency and expertise shown distinctly.
- [ ] Passive Perception is present and correct (10 + modifier + proficiency).
- [ ] **Temporary change:** add an adjustment (say a belt setting STR to 21) marked temporary →
      it applies everywhere, is listed as active, and can be removed in one action.
- [ ] **Permanent change:** the same, marked permanent → it survives a long rest.
- [ ] **Hard override:** type a raw value over a score or over AC/speed/initiative/max HP → the
      override wins, and the field is visibly marked as overridden.
- [ ] Remove the override → the computed value comes back, unchanged from before.
- [ ] Features and traits are listed with their text. Ones the app does not mechanically model are
      marked **Manual** rather than silently doing nothing.

## 6. Spellcasting

- [ ] A wizard at level 5 → 4/3/2 slots, correct save DC and attack bonus, prepared limit shown.
- [ ] Add a spell from the catalogue → search, filter by level and school, add, prepare.
- [ ] Cast a spell → the right slot is spent, with an undo. Upcasting is offered explicitly, and
      each slot shows the damage it produces at that level.
- [ ] Concentration: cast a concentration spell → it is tracked, and starting another replaces it.
- [ ] **Warlock:** Pact Magic slots are a separate pool, labelled as such, recovered on a short
      rest.
- [ ] **Warlock/Wizard multiclass:** the two pools stay separate and do not merge.
- [ ] Ritual casting is marked where it applies.
- [ ] A non-caster has no Spells tab at all.

## 7. Class resources (non-casters too)

- [ ] Barbarian → Rage uses and rage damage; Fighter → Second Wind, Action Surge, Extra Attack;
      Monk → Ki points and martial arts die; Rogue → Sneak Attack dice (a reference value, with no
      tracker, because it is once per turn); Paladin → Lay on Hands pool sized to level.
- [ ] Spend one, then take the rest that restores it → it comes back; the wrong rest does not
      restore it.

## 8. Inventory and currency

- [ ] Add an item from the SRD catalogue → its weight, cost, damage or AC come with it.
- [ ] Search for something the SRD does not have → you are told plainly and offered "Create item".
- [ ] Create a custom item with every field: name, quantity, weight, value, description,
      equipped, attuned, container, magical, rarity, charges.
- [ ] Equip armour → AC updates. Equip a shield → +2. Equip two suits of armour → the conflict is
      flagged rather than silently stacking.
- [ ] Attunement → the third attuned item is allowed, the fourth is refused with a reason.
- [ ] Weight → carried weight and encumbrance thresholds update as you add items.
- [ ] Currency: hold 1 gp, spend 5 sp → you get change in the largest sensible coins (4 sp), not
      50 cp. All five coin types (cp/sp/ep/gp/pp) are tracked.

## 9. Journal — public and private

- [ ] Create an entry → it defaults to **private**, and visibility is two labelled buttons, never
      an unlabelled toggle.
- [ ] A private entry is unmistakable at a glance: a badge and an edge marker, not just a colour.
- [ ] Filter by visibility → private entries can be hidden in one action (the "DM is looking at my
      screen" case).
- [ ] Rich text: headings, bold, italic, lists, quotes, code, links, with a preview.
- [ ] Attach an image to an entry → it persists across a reload.
- [ ] Export, then look at the JSON → each entry's visibility is a first-class field.

## 10. Notes

- [ ] Create notes of each kind: NPC, location, quest, faction, secret, goal, relationship.
- [ ] Secrets default to private.
- [ ] Link a journal entry to a note → the link is navigable from the entry.
- [ ] Delete a linked note → entries pointing at it lose the link cleanly, with no dangling
      reference and no crash.

## 11. Portraits, sprites and emotes

- [ ] Upload a still portrait → it appears in the play bar and on the gallery card immediately,
      with no reload.
- [ ] Upload an animated GIF or WebP → it animates, and is **not** flattened to one frame.
- [ ] Upload a sprite sheet → set columns/rows/frame count; the frame size is derived and shown;
      map named states (idle, happy, angry…) to frame ranges, each with a live preview.
- [ ] Trigger an emote the sprite **has** → the animation plays.
- [ ] Trigger an emote the sprite **does not have** → it degrades to a bubble and a pulse, never a
      blank frame or an error. (This is the "not every character has every animation" case.)
- [ ] Take damage → the hurt emote fires without you tapping anything.
- [ ] Turn on "reduce motion" in your OS → animation stops immediately, without a reload.
- [ ] Delete a portrait that is currently active → the sheet falls back to the initials placeholder
      rather than breaking.

## 12. Levelling

- [ ] Open Level up → it previews the whole level before anything is written: hit points with the
      CON maths, proficiency-bonus change, every new feature with its text, spell-slot changes,
      cantrips and spells known.
- [ ] Nothing is saved until you press Confirm. Navigate away mid-preview → nothing changed.
- [ ] Hit points: take the average, roll (a roll outside 1–hit die is refused), or enter manually
      for a DM ruling.
- [ ] Level 3 as a fighter → a subclass is **required**; Confirm stays disabled until you pick one.
- [ ] Level 4 → an ASI is required, and neither the ability path nor the feat path is preselected;
      you must distribute exactly 2 points.
- [ ] After confirming → the panel rolls straight on to the next level, the play bar updates, and
      the level appears in the history.
- [ ] **Undo** a level → the class level, the hit points and the ability increase all go back
      exactly as they were, and the history entry disappears.
- [ ] Multiclass into a class you do not qualify for → you get a warning naming the exact shortfall
      ("normally requires CHA 13; this character has 10") and it still lets you do it.
- [ ] Undo the first level of a multiclass → the whole class is removed, not left at level 0.

## 13. Homebrew

- [ ] Create a custom class, race, background, feat, spell and item through the authoring form.
- [ ] Each appears in creation and on the sheet alongside SRD content, with a **Custom** badge.
- [ ] Import homebrew as JSON → invalid entries are reported individually rather than failing the
      whole import.
- [ ] Mark something exportable → it travels with an export.
- [ ] Edit a custom entry already used by a character → the character keeps working.

## 14. Export and import

- [ ] Export all → a JSON file downloads.
- [ ] Import it back into the same library → you get copies, and nothing is overwritten.
- [ ] Import into a fresh browser profile → characters, inventory, journal, notes, portraits and
      homebrew all arrive intact.
- [ ] Import a deliberately corrupted file → a clear error, and your existing data is untouched.

## 15. Look, theme and accessibility

- [ ] Theme toggle cycles light → dark → system, and the choice sticks across a reload.
- [ ] Each character's mood tints the interface; the text stays readable in both themes.
- [ ] Keyboard only: press Tab on load → the first stop is "Skip to content". Reach every control
      without a mouse; the focus ring is always visible.
- [ ] Change tabs with the keyboard → focus moves into the new content rather than being left
      behind on the link.
- [ ] Zoom the browser to 200% → nothing is cut off and nothing scrolls sideways.
- [ ] Screen reader (VoiceOver/NVDA/TalkBack): the HP meter, the visibility buttons and the stat
      chips announce meaningfully.

## 16. Size, speed and offline

- [ ] Phone portrait (~390px), tablet (~768px), desktop (~1280px): nothing scrolls sideways at any
      size; the desktop layout puts the play bar in a right rail.
- [ ] Every control is comfortably tappable with a thumb.
- [ ] Browse the full spell list on a phone → it stays responsive; the list grows as you scroll and
      tells you how much is left rather than truncating silently.
- [ ] Reload with the network off after a first visit → the app still opens.

---

## Known limits — expected, not bugs

1. **The SRD is a subset.** 12 classes and 9 races in full, but only **1 background** (Acolyte),
   **1 feat** (Grappler), **12 subclasses** (one per class) and **4 subraces**. This is the limit
   of what Wizards of the Coast licenses freely; no rules API has the rest. Everything missing can
   be added through Homebrew.
2. **Feature effects are hand-authored.** SRD features are prose. Common ones are encoded and
   apply automatically; the rest render their text and are marked **Manual** so you know the sheet
   is not doing it for you.
3. **2014 rules only.** No 2024 content.
4. **No accounts, no sync, no sharing transport.** "Public" on a journal entry means *marked as
   shareable* and it travels through export; nothing is uploaded anywhere.
5. **One device at a time.** Export/import is the transfer mechanism until accounts exist.
6. **Dice are for hit points only.** The app computes bonuses; it does not roll your attacks.
