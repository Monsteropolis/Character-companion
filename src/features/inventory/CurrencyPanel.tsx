import { useState } from 'react';
import { Panel, Button } from '../../ui/primitives';
import {
  COIN_ORDER,
  COIN_NAMES,
  addCurrency,
  consolidate,
  spend,
  totalInGold,
  currencyWeight,
} from '../../engine/inventory';
import type { Currency, CurrencyId } from '../../domain/types';

/**
 * Coin purse.
 *
 * Adding and spending are separate actions rather than a set of editable numbers, because at a
 * table money almost always changes by a delta -- "we found 40 gp", "the room costs 5 sp" --
 * and making change by hand across five denominations is exactly the tedium worth automating.
 */
export function CurrencyPanel({
  currency,
  onChange,
}: {
  currency: Currency;
  onChange: (next: Currency) => void;
}) {
  const [amount, setAmount] = useState('');
  const [coin, setCoin] = useState<CurrencyId>('gp');
  const [error, setError] = useState<string | null>(null);

  const parsed = Math.max(0, Math.floor(Number(amount) || 0));

  function handleAdd() {
    if (parsed === 0) return;
    onChange(addCurrency(currency, { [coin]: parsed }));
    setAmount('');
    setError(null);
  }

  function handleSpend() {
    if (parsed === 0) return;
    const next = spend(currency, parsed, coin);
    if (!next) {
      // Refused rather than allowed to go negative.
      setError('Not enough coin for that.');
      return;
    }
    onChange(next);
    setAmount('');
    setError(null);
  }

  return (
    <Panel className="p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="display-face font-semibold">Coin</h2>
        <span className="text-sm text-[var(--text-muted)]">
          {totalInGold(currency).toFixed(2)} gp total · {currencyWeight(currency).toFixed(1)} lb
        </span>
      </div>

      <ul className="mb-3 grid grid-cols-5 gap-2">
        {COIN_ORDER.map((c) => (
          <li key={c} className="rounded-lg border border-[var(--border)] p-2 text-center">
            <span className="block text-xs text-[var(--text-muted)] uppercase">{c}</span>
            {/* Full-height and numeric-keypad: coin counts get edited mid-session on a phone,
                so they are a touch target, not a display. */}
            <input
              type="number"
              min={0}
              inputMode="numeric"
              aria-label={COIN_NAMES[c]}
              value={currency[c]}
              onChange={(e) =>
                onChange({ ...currency, [c]: Math.max(0, Number(e.target.value) || 0) })
              }
              className="display-face min-h-11 w-full bg-transparent text-center text-lg outline-none"
            />
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          aria-label="Amount of coin"
          className="min-h-11 w-24 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-base)] px-3 text-sm"
        />
        <select
          value={coin}
          onChange={(e) => setCoin(e.target.value as CurrencyId)}
          aria-label="Denomination"
          className="min-h-11 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-base)] px-3 text-sm"
        >
          {COIN_ORDER.map((c) => (
            <option key={c} value={c}>
              {COIN_NAMES[c]}
            </option>
          ))}
        </select>
        <Button variant="secondary" onClick={handleAdd} disabled={parsed === 0}>
          Gain
        </Button>
        <Button variant="secondary" onClick={handleSpend} disabled={parsed === 0}>
          Spend
        </Button>
        <Button variant="ghost" onClick={() => onChange(consolidate(currency))}>
          Consolidate
        </Button>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}
