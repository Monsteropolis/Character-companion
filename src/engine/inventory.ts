import type { Currency, CurrencyId, InventoryItem, ItemCategory } from '../domain/types';

/**
 * Inventory and currency rules.
 *
 * Pure functions, kept out of the UI so the awkward parts -- making change across five coin
 * denominations, the attunement cap, deciding what "equipped" even means for a given category --
 * are testable and stated once.
 */

/** Value of each coin in copper. Electrum is included; many tables ignore it, but the SRD has it. */
export const COIN_VALUE: Record<CurrencyId, number> = {
  cp: 1,
  sp: 10,
  ep: 50,
  gp: 100,
  pp: 1000,
};

export const COIN_ORDER: CurrencyId[] = ['pp', 'gp', 'ep', 'sp', 'cp'];

export const COIN_NAMES: Record<CurrencyId, string> = {
  cp: 'Copper',
  sp: 'Silver',
  ep: 'Electrum',
  gp: 'Gold',
  pp: 'Platinum',
};

/** The 2014 attunement limit. Exceeding it is possible in the app, but flagged. */
export const ATTUNEMENT_LIMIT = 3;

/** Coins weigh a fiftieth of a pound each, regardless of denomination. */
export const COIN_WEIGHT = 0.02;

export function totalInCopper(currency: Currency): number {
  return COIN_ORDER.reduce((sum, coin) => sum + currency[coin] * COIN_VALUE[coin], 0);
}

/** Total wealth expressed in gold, the unit players actually quote. */
export function totalInGold(currency: Currency): number {
  return totalInCopper(currency) / COIN_VALUE.gp;
}

export function coinCount(currency: Currency): number {
  return COIN_ORDER.reduce((sum, coin) => sum + currency[coin], 0);
}

export function currencyWeight(currency: Currency): number {
  return coinCount(currency) * COIN_WEIGHT;
}

/**
 * Spend an amount of copper, making change across denominations.
 *
 * Returns null when the purse cannot cover it, rather than going negative -- a silently
 * negative coin pouch is worse than a refused purchase.
 */
export function spend(currency: Currency, amount: number, coin: CurrencyId): Currency | null {
  const costInCopper = amount * COIN_VALUE[coin];
  if (costInCopper <= 0) return { ...currency };
  if (totalInCopper(currency) < costInCopper) return null;

  const next: Currency = { ...currency };

  // Pay with the exact denomination first, so a purse keeps its shape where possible.
  const direct = Math.min(next[coin], amount);
  next[coin] -= direct;
  let remaining = costInCopper - direct * COIN_VALUE[coin];
  if (remaining === 0) return next;

  // Then spend from the smallest coins upward, so large coins are preserved.
  for (const c of [...COIN_ORDER].reverse()) {
    if (remaining <= 0) break;
    const usable = Math.min(next[c], Math.floor(remaining / COIN_VALUE[c]));
    next[c] -= usable;
    remaining -= usable * COIN_VALUE[c];
  }

  // Anything left needs breaking a larger coin and taking change.
  if (remaining > 0) {
    for (const c of COIN_ORDER) {
      if (remaining <= 0) break;
      if (next[c] === 0 || COIN_VALUE[c] < remaining) continue;

      next[c] -= 1;
      let change = COIN_VALUE[c] - remaining;
      remaining = 0;

      // Change comes back in the LARGEST coins that fit. Paying 5 sp from a gold piece should
      // return 5 sp, not 50 cp -- both preserve value, but only one leaves a usable purse.
      // Electrum is skipped for the same reason `consolidate` leaves it alone.
      for (const larger of COIN_ORDER) {
        if (larger === 'ep' || COIN_VALUE[larger] > change) continue;
        const give = Math.floor(change / COIN_VALUE[larger]);
        next[larger] += give;
        change -= give * COIN_VALUE[larger];
      }
    }
  }

  return remaining > 0 ? null : next;
}

export function addCurrency(currency: Currency, delta: Partial<Currency>): Currency {
  return {
    cp: Math.max(0, currency.cp + (delta.cp ?? 0)),
    sp: Math.max(0, currency.sp + (delta.sp ?? 0)),
    ep: Math.max(0, currency.ep + (delta.ep ?? 0)),
    gp: Math.max(0, currency.gp + (delta.gp ?? 0)),
    pp: Math.max(0, currency.pp + (delta.pp ?? 0)),
  };
}

/**
 * Consolidate loose coin upward without changing its value.
 *
 * Electrum is deliberately left alone: converting into it surprises players, and many tables
 * treat it as a curiosity rather than currency.
 */
export function consolidate(currency: Currency): Currency {
  let copper = currency.cp;
  let silver = currency.sp;
  let gold = currency.gp;
  let platinum = currency.pp;

  silver += Math.floor(copper / 10);
  copper %= 10;
  gold += Math.floor(silver / 10);
  silver %= 10;
  platinum += Math.floor(gold / 10);
  gold %= 10;

  return { cp: copper, sp: silver, ep: currency.ep, gp: gold, pp: platinum };
}

/** Items whose "equipped" state means something mechanically. */
export function isEquippable(category: ItemCategory): boolean {
  return category === 'weapon' || category === 'armor';
}

export function attunedCount(items: InventoryItem[]): number {
  return items.filter((i) => i.attuned && i.deletedAt === null).length;
}

export function isOverAttuned(items: InventoryItem[]): boolean {
  return attunedCount(items) > ATTUNEMENT_LIMIT;
}

/**
 * Whether equipping an item conflicts with something already worn.
 *
 * Only body armour genuinely conflicts -- you can hold several weapons, and shields are counted
 * separately because a shield plus armour is the normal case, not a clash.
 */
export function conflictingArmor(
  items: InventoryItem[],
  candidate: InventoryItem,
): InventoryItem | null {
  if (candidate.category !== 'armor' || candidate.armor?.isShield) return null;
  return (
    items.find(
      (i) =>
        i.id !== candidate.id &&
        i.equipped &&
        i.deletedAt === null &&
        i.category === 'armor' &&
        !i.armor?.isShield,
    ) ?? null
  );
}

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  weapon: 'Weapons',
  armor: 'Armour',
  consumable: 'Consumables',
  tool: 'Tools',
  quest: 'Quest items',
  treasure: 'Treasure',
  misc: 'Miscellaneous',
};

export const CATEGORY_ORDER: ItemCategory[] = [
  'weapon', 'armor', 'consumable', 'tool', 'quest', 'treasure', 'misc',
];

/** Total weight of a stack, tolerating the SRD records that carry no weight at all. */
export function itemWeight(item: InventoryItem): number {
  if (item.weightless) return 0;
  const weight = Number.isFinite(item.weight) ? item.weight : 0;
  return weight * Math.max(0, item.quantity);
}

export function formatCurrency(currency: Currency): string {
  const parts = COIN_ORDER.filter((c) => currency[c] > 0).map((c) => `${currency[c]} ${c}`);
  return parts.length > 0 ? parts.join(', ') : '0 gp';
}
