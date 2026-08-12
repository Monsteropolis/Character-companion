import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

/**
 * Smoke test for the single-file demo build, loaded from the filesystem in the same wrapped shape
 * the Artifact host produces. Proves the inlining is intact, the hash router works, and a
 * character survives a reload — the three things that are specific to this build.
 */

/*
 * Served over HTTP rather than opened from disk: a file:// origin has restricted storage in
 * Chromium, so IndexedDB there would fail for reasons that have nothing to do with this build.
 * The Artifact host serves over https, which this matches.
 */
const html = readFileSync('dist-single/wrapped.html');
const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
});
await new Promise((done) => server.listen(4199, '127.0.0.1', done));
const url = 'http://127.0.0.1:4199/';
const problems = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text().slice(0, 200)}`));
page.on('request', (r) => {
  // Nothing may be fetched: a strict CSP blocks external hosts, and there is no server here.
  if (!r.url().startsWith(url) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) {
    problems.push(`external request: ${r.url().slice(0, 120)}`);
  }
});

async function step(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`);
    problems.push(`${name}: ${e.message.split('\n')[0]}`);
  }
}

await page.goto(url, { waitUntil: 'load' });

await step('the app boots from one file', async () => {
  // Scoped to the masthead on purpose: the Artifact wrapper leaves the page's <title> inside the
  // body, so a bare text match finds that hidden element first and waits for it forever.
  await page.getByRole('banner').getByText('Character Companion').waitFor({ timeout: 20000 });
  await page.getByRole('heading', { name: 'Before you start' }).waitFor({ timeout: 20000 });
});

await step('routing works on the hash', async () => {
  await page.locator('nav[aria-label="Main"]').getByRole('link', { name: 'Homebrew' }).click();
  await page.waitForURL(/#\/custom/, { timeout: 10000 });
  await page.goBack();
  await page.waitForURL(/#\/$|127\.0\.0\.1:4199\/$/, { timeout: 10000 });
});

let id = '';
await step('a character can be created', async () => {
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

  await page.getByRole('button', { name: /start character creation|new character/i }).first().click();
  await page.getByLabel(/name/i).first().fill('Single File Sam');
  await advance();
  await page.getByRole('button', { name: /^Dwarf/ }).click();
  await advance();
  await page.getByRole('button', { name: /^Fighter/ }).click();
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
  await page.waitForURL(/#\/c\//, { timeout: 20000 });
  id = page.url().match(/#\/c\/([^/]+)/)[1];
});

await step('the SRD dataset is inlined and derives real numbers', async () => {
  await page.getByLabel('Character status').getByText(/Dwarf · Fighter 1/).waitFor({ timeout: 15000 });
});

await step('IndexedDB persists across a reload', async () => {
  await page.reload({ waitUntil: 'load' });
  await page.getByText('Single File Sam').first().waitFor({ timeout: 20000 });
});

await step('a deep link into a tab works', async () => {
  await page.goto(`${url}#/c/${id}/level-up`, { waitUntil: 'load' });
  await page.getByRole('heading', { name: /Fighter 1 → 2/ }).waitFor({ timeout: 20000 });
});

await browser.close();
server.close();

console.log('\n--- problems ---');
console.log(problems.length ? problems.join('\n') : 'none');
process.exit(problems.length ? 1 : 0);
