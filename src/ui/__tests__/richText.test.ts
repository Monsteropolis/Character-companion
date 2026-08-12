import { describe, it, expect } from 'vitest';
import { renderRichText, escapeHtml, toPlainText, excerpt, tokenize } from '../richText';

/**
 * Rich text tests.
 *
 * The escaping cases matter most: journal entries are exported and handed to DMs, so their text
 * is untrusted input even though the app is local-only.
 */

describe('escaping', () => {
  it('escapes every HTML-significant character', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('renders a script tag as literal text, never as an element', () => {
    const html = renderRichText('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes before applying formatting, so injected markup cannot survive', () => {
    const html = renderRichText('**<img src=x onerror=1>**');
    expect(html).toContain('<strong>');
    expect(html).not.toContain('<img');
  });

  it('refuses to turn a javascript: URL into a link', () => {
    // A live javascript: URL in a shared journal would be a real hazard. The text is left in
    // place as escaped prose rather than deleted -- silently eating what someone typed is worse.
    const html = renderRichText('[click](javascript:alert(1))');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('href');
    expect(html).toContain('[click]');
  });

  it('allows http and https links, opened safely', () => {
    const html = renderRichText('[docs](https://example.com/x)');
    expect(html).toContain('href="https://example.com/x"');
    expect(html).toContain('rel="noreferrer noopener"');
  });
});

describe('block formatting', () => {
  it('renders headings below the page heading levels', () => {
    // The page owns h1 and h2, so entry headings start at h3.
    expect(renderRichText('# Title')).toBe('<h3>Title</h3>');
    expect(renderRichText('## Sub')).toBe('<h4>Sub</h4>');
  });

  it('groups consecutive list items into one list', () => {
    const html = renderRichText('- one\n- two');
    expect(html).toBe('<ul><li>one</li><li>two</li></ul>');
  });

  it('closes a list when prose follows', () => {
    const html = renderRichText('- one\nafter');
    expect(html).toBe('<ul><li>one</li></ul><p>after</p>');
  });

  it('accepts both dash and asterisk bullets', () => {
    expect(renderRichText('* one')).toBe('<ul><li>one</li></ul>');
  });

  it('renders quotes', () => {
    expect(renderRichText('> spoken aloud')).toBe('<blockquote>spoken aloud</blockquote>');
  });

  it('drops blank lines rather than emitting empty paragraphs', () => {
    expect(renderRichText('one\n\n\ntwo')).toBe('<p>one</p><p>two</p>');
  });

  it('handles an empty document', () => {
    expect(renderRichText('')).toBe('');
  });
});

describe('inline formatting', () => {
  it('renders bold and italic', () => {
    expect(renderRichText('**bold**')).toContain('<strong>bold</strong>');
    expect(renderRichText('*soft*')).toContain('<em>soft</em>');
  });

  it('does not mistake bold for italic', () => {
    const html = renderRichText('**bold**');
    expect(html).not.toContain('<em>');
  });

  it('renders inline code', () => {
    expect(renderRichText('`1d20`')).toContain('<code>1d20</code>');
  });
});

describe('tokenize', () => {
  it('classifies each line', () => {
    const tokens = tokenize('# H\n- item\n> quote\ntext\n');
    expect(tokens.map((t) => t.type)).toEqual([
      'heading', 'list-item', 'quote', 'paragraph', 'blank',
    ]);
  });
});

describe('plain text', () => {
  it('strips markup for search and previews', () => {
    expect(toPlainText('# Title\n**bold** and *soft* and `code`')).toBe(
      'Title bold and soft and code',
    );
  });

  it('keeps link text and drops the target', () => {
    expect(toPlainText('see [the docs](https://example.com)')).toBe('see the docs');
  });

  it('truncates an excerpt on a word boundary with an ellipsis', () => {
    const long = 'word '.repeat(80);
    const short = excerpt(long, 20);
    expect(short.length).toBeLessThanOrEqual(21);
    expect(short.endsWith('…')).toBe(true);
  });

  it('leaves short text untouched', () => {
    expect(excerpt('brief', 100)).toBe('brief');
  });
});
