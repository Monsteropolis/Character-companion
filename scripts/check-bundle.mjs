import { readdirSync, statSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

/**
 * Bundle budget, enforced at build time.
 *
 * The thing being protected is the first paint on a phone with poor signal at a table. What
 * matters is the JavaScript needed *before the app is usable* — the entry chunk plus the CSS —
 * not the total on disk. The SRD dataset dwarfs everything else but is loaded per collection, on
 * demand, so it is budgeted separately and generously.
 *
 * Budgets are gzip, because that is what ships. Raise one deliberately, with a reason in the
 * commit message; a budget quietly raised to make a build pass is not a budget.
 */

const BUDGETS = {
  /** Entry chunk: React, router, Dexie, the shell and the gallery. */
  entry: 130 * 1024,
  /** All CSS. */
  css: 12 * 1024,
  /** Any single lazily-loaded route chunk. */
  route: 24 * 1024,
  /**
   * Chunks shared by several routes: the rules layer and the design-system primitives.
   *
   * The rules chunk is mostly Zod schemas. They are load-bearing — every record crossing the
   * dataset boundary is validated, which is what keeps a malformed entry out of the engine — so
   * this budget is set at what that costs rather than at what would look tidy. It is not on the
   * critical path: the gallery renders without it.
   */
  shared: 50 * 1024,
  /** Any single SRD collection chunk. Monsters is the largest by a distance. */
  data: 130 * 1024,
};

const dir = 'dist/assets';
const files = readdirSync(dir).filter((f) => f.endsWith('.js') || f.endsWith('.css'));

const rows = files.map((name) => {
  const path = join(dir, name);
  const size = statSync(path).size;
  const gzip = gzipSync(readFileSync(path)).length;
  const kind = name.endsWith('.css')
    ? 'css'
    : name.startsWith('5e-SRD-')
      ? 'data'
      : name.startsWith('index-')
        ? 'entry'
        : /^(RulesProvider|primitives)-/.test(name)
          ? 'shared'
          : 'route';
  return { name, size, gzip, kind };
});

const failures = rows.filter((row) => row.gzip > BUDGETS[row.kind]);

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
for (const row of [...rows].sort((a, b) => b.gzip - a.gzip)) {
  const over = row.gzip > BUDGETS[row.kind];
  console.log(
    `${over ? 'OVER ' : '  ok '} ${row.kind.padEnd(5)} ${kb(row.gzip).padStart(9)} gzip  (budget ${kb(BUDGETS[row.kind])})  ${row.name}`,
  );
}

const entry = rows.find((r) => r.kind === 'entry');
const css = rows.filter((r) => r.kind === 'css').reduce((sum, r) => sum + r.gzip, 0);
console.log(`\nFirst load: ${kb((entry?.gzip ?? 0) + css)} gzip (entry + css).`);

if (failures.length > 0) {
  console.error(`\n${failures.length} chunk(s) over budget.`);
  process.exit(1);
}
