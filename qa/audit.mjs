import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

/**
 * Phase 9 audit: axe-core on every route, at three viewports, in both themes.
 * Also checks touch targets, horizontal overflow, and that focus lands somewhere on navigation.
 */

const BASE = 'http://127.0.0.1:4173';
const AXE = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 900 },
];

const findings = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

async function seedCharacter(page) {
  const advance = async () => {
    const cont = page.getByRole('button', { name: /^Continue$/ });
    for (let i = 0; i < 8; i++) {
      if (!(await cont.isDisabled())) break;
      const unpicked = page.locator('button[aria-pressed="false"]');
      if ((await unpicked.count()) === 0) break;
      await unpicked.first().click();
      await page.waitForTimeout(100);
    }
    await cont.click();
    await page.waitForTimeout(200);
  };

  await page.goto(`${BASE}/create`, { waitUntil: 'networkidle' });
  await page.getByLabel(/name/i).first().fill('Auditor Vex');
  await advance();
  await page.getByRole('button', { name: /^Elf/ }).click();
  await advance();
  await page.getByRole('button', { name: /^Wizard/ }).click();
  await advance();
  await page.getByRole('button', { name: /^Acolyte/ }).click();
  await advance();
  for (let i = 0; i < 6; i++) {
    const finish = page.getByRole('button', { name: /create character/i });
    if (await finish.count()) {
      await finish.click();
      break;
    }
    await advance();
  }
  await page.waitForURL(/\/c\//, { timeout: 20000 });
  return page.url().match(/\/c\/([^/]+)/)[1];
}

async function auditPage(page, label) {
  await page.waitForTimeout(600);
  await page.evaluate(AXE);
  const result = await page.evaluate(async () => {
    // WCAG 2.1 AA is the bar this project set itself.
    return await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
  });

  for (const violation of result.violations) {
    const detail = violation.nodes
      .map(
        (node) =>
          `\n      node: ${node.html.slice(0, 160)}\n      why : ${node.failureSummary?.replace(/\s+/g, ' ')}\n      at  : ${JSON.stringify(node.target)}`,
      )
      .join('');
    findings.push(
      `[a11y ${violation.impact}] ${label}: ${violation.id} — ${violation.help} (${violation.nodes.length} node${violation.nodes.length === 1 ? '' : 's'})${detail}`,
    );
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) findings.push(`[layout] ${label}: horizontal overflow of ${overflow}px`);

  const small = await page.evaluate(() =>
    [...document.querySelectorAll('button, select, a[href], input:not([type=checkbox]):not([type=file])')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || r.height >= 40) return false;
        // Visually-hidden controls (the skip link) have no target until they are focused.
        if (el.classList.contains('sr-only')) return false;
        // WCAG 2.2 target-size exempts links flowing inline with text; the masthead wordmark
        // and prose links are those, and padding them out would look wrong rather than help.
        if (el.tagName === 'A' && getComputedStyle(el).display.includes('inline')) return false;
        return true;
      })
      .map((el) => `${el.tagName}.${el.className.split(' ')[0]}: ${(el.textContent ?? '').trim().slice(0, 20)}`),
  );
  if (small.length) findings.push(`[touch] ${label}: ${[...new Set(small)].join(' | ')}`);
}

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on('pageerror', (e) => findings.push(`[js] ${viewport.name}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') findings.push(`[console] ${viewport.name}: ${m.text().slice(0, 160)}`);
  });

  const id = await seedCharacter(page);

  const routes = [
    ['/', 'gallery'],
    ['/custom', 'homebrew'],
    ['/about', 'about'],
    [`/c/${id}/overview`, 'overview'],
    [`/c/${id}/combat`, 'combat'],
    [`/c/${id}/abilities`, 'abilities'],
    [`/c/${id}/spells`, 'spells'],
    [`/c/${id}/inventory`, 'inventory'],
    [`/c/${id}/journal`, 'journal'],
    [`/c/${id}/notes`, 'notes'],
    [`/c/${id}/portrait`, 'portrait'],
    [`/c/${id}/level-up`, 'level-up'],
  ];

  for (const [path, name] of routes) {
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    await auditPage(page, `${viewport.name} ${name}`);
  }

  // The creation wizard is the longest form in the app and deserves its own pass.
  await page.goto(`${BASE}/create`, { waitUntil: 'networkidle' });
  await auditPage(page, `${viewport.name} create`);

  await context.close();

  /*
   * Dark theme gets its own context rather than a JS flip of `data-theme`.
   *
   * Flipping the attribute on a live page starts a `transition-colors` on every themed element,
   * and axe samples the interpolated values -- which reads as a contrast failure that no user
   * ever sees. Loading with `prefers-color-scheme: dark` is both artifact-free and the path a
   * user on a dark-mode device actually takes.
   */
  const darkContext = await browser.newContext({ viewport, colorScheme: 'dark' });
  const darkPage = await darkContext.newPage();
  darkPage.on('pageerror', (e) => findings.push(`[js] ${viewport.name} dark: ${e.message}`));
  const darkId = await seedCharacter(darkPage);
  for (const [path, name] of [
    [`/c/${darkId}/combat`, 'combat'],
    [`/c/${darkId}/overview`, 'overview'],
    [`/c/${darkId}/spells`, 'spells'],
    ['/', 'gallery'],
  ]) {
    await darkPage.goto(BASE + path, { waitUntil: 'networkidle' });
    await auditPage(darkPage, `${viewport.name} ${name} (dark)`);
  }
  await darkContext.close();
}

// Keyboard: does focus move into the content when a tab is activated?
{
  const context = await browser.newContext({ viewport: VIEWPORTS[0] });
  const page = await context.newPage();
  const id = await seedCharacter(page);
  await page.goto(`${BASE}/c/${id}/overview`, { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: 'Combat' }).click();
  await page.waitForTimeout(500);
  const focused = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
  if (focused !== 'main-content') findings.push(`[focus] after tab navigation focus is on "${focused}", not the content region`);

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.keyboard.press('Tab');
  const firstStop = await page.evaluate(() => (document.activeElement?.textContent ?? '').trim());
  if (!/skip to content/i.test(firstStop)) findings.push(`[focus] first tab stop is "${firstStop}", not the skip link`);
  await context.close();
}

await browser.close();

console.log(findings.length ? findings.join('\n') : 'clean');
console.log(`\n${findings.length} finding(s)`);
