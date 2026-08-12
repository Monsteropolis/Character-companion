import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

/**
 * Repackages the single-file build as an Artifact page.
 *
 * The Artifact host supplies the document skeleton, so the page must contain no <html>, <head> or
 * <body> tags of its own — just the title, the styles, the mount point and the script.
 */

const source = readFileSync('dist-single/index.html', 'utf8');

const pick = (pattern, what) => {
  const match = source.match(pattern);
  if (!match) throw new Error(`Could not find the ${what} in dist-single/index.html`);
  return match[0];
};

const title = pick(/<title>[\s\S]*?<\/title>/, 'title');
const style = source.match(/<style[^>]*>[\s\S]*?<\/style>/)?.[0] ?? '';
const script = pick(/<script type="module">[\s\S]*?<\/script>/, 'module script');

const page = `${title}
${style}
<div id="root"></div>
${script}
`;

mkdirSync('dist-single', { recursive: true });
writeFileSync('dist-single/artifact.html', page);

const mb = (Buffer.byteLength(page) / 1024 / 1024).toFixed(2);
console.log(`dist-single/artifact.html — ${mb} MB`);
if (Buffer.byteLength(page) > 16 * 1024 * 1024) {
  console.error('Over the 16 MB Artifact limit.');
  process.exit(1);
}
