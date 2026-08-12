/**
 * A deliberately small rich-text format.
 *
 * Journal entries need emphasis, headings and lists -- not a word processor. A constrained
 * markdown subset gives that without pulling in an editor dependency, keeps entries as plain
 * text (so they stay diffable, searchable and portable through export), and means there is no
 * hidden document model that could corrupt.
 *
 * Rendering escapes HTML *first* and only then introduces the tags this module generates. Entries
 * are exported and shared with DMs, so treating their text as untrusted is the right default even
 * in a local-only app.
 */

export interface RichTextToken {
  type: 'heading' | 'paragraph' | 'list-item' | 'quote' | 'blank';
  level?: number;
  text: string;
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/** Splits a document into block-level tokens. */
export function tokenize(source: string): RichTextToken[] {
  return source.split(/\r?\n/).map((line): RichTextToken => {
    const trimmed = line.trim();
    if (trimmed === '') return { type: 'blank', text: '' };

    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      return { type: 'heading', level: heading[1]!.length, text: heading[2]! };
    }

    const item = /^[-*]\s+(.*)$/.exec(trimmed);
    if (item) return { type: 'list-item', text: item[1]! };

    const quote = /^>\s?(.*)$/.exec(trimmed);
    if (quote) return { type: 'quote', text: quote[1]! };

    return { type: 'paragraph', text: trimmed };
  });
}

/**
 * Inline formatting: bold, italic, code and links.
 *
 * Applied to already-escaped text, so a user typing `<script>` gets the literal characters and
 * never an element. Link targets are restricted to http/https for the same reason -- a
 * `javascript:` URL in a shared journal would otherwise be live.
 */
export function renderInline(escaped: string): string {
  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>');
}

/** Renders the supported subset to HTML. */
export function renderRichText(source: string): string {
  const tokens = tokenize(source);
  const out: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };

  for (const token of tokens) {
    const text = renderInline(escapeHtml(token.text));

    if (token.type === 'list-item') {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${text}</li>`);
      continue;
    }

    closeList();

    switch (token.type) {
      case 'heading': {
        // Headings start at h3: the page already owns h1 and h2.
        const level = Math.min(6, (token.level ?? 1) + 2);
        out.push(`<h${level}>${text}</h${level}>`);
        break;
      }
      case 'quote':
        out.push(`<blockquote>${text}</blockquote>`);
        break;
      case 'paragraph':
        out.push(`<p>${text}</p>`);
        break;
      case 'blank':
        break;
    }
  }

  closeList();
  return out.join('');
}

/** Plain text for search and previews, with all markup stripped. */
export function toPlainText(source: string): string {
  return tokenize(source)
    .filter((t) => t.type !== 'blank')
    .map((t) =>
      t.text
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'),
    )
    .join(' ');
}

export function excerpt(source: string, length = 160): string {
  const plain = toPlainText(source);
  return plain.length <= length ? plain : `${plain.slice(0, length).trimEnd()}…`;
}
