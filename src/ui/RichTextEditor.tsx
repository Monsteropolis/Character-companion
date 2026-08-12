import { useState } from 'react';
import { renderRichText } from './richText';

/**
 * Rich text editing, as plain text with a preview.
 *
 * A contentEditable surface would mean a hidden document model that can corrupt and that export
 * has to serialise. Keeping the source as text means entries stay searchable, diffable and
 * portable, and the preview shows exactly what will render.
 */
export function RichTextEditor({
  value,
  onChange,
  id,
  rows = 10,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  rows?: number;
  placeholder?: string;
}) {
  const [preview, setPreview] = useState(false);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-xs text-[var(--text-muted)]">
          <code>**bold**</code> · <code>*italic*</code> · <code># heading</code> ·{' '}
          <code>- list</code> · <code>&gt; quote</code>
        </p>
        <button
          type="button"
          onClick={() => setPreview(!preview)}
          aria-pressed={preview}
          className="min-h-11 rounded-md px-2 text-xs text-[var(--text-muted)] hover:bg-[var(--accent-subtle)]"
        >
          {preview ? 'Edit' : 'Preview'}
        </button>
      </div>

      {preview ? (
        <div
          className="prose-entry min-h-24 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-base)] p-3 text-sm"
          // Safe: renderRichText escapes all input before introducing its own tags.
          dangerouslySetInnerHTML={{ __html: renderRichText(value) }}
        />
      ) : (
        <textarea
          id={id}
          value={value}
          rows={rows}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-base)] px-3 py-2 text-sm"
        />
      )}
    </div>
  );
}

/** Read-only rendered rich text. */
export function RichTextView({ value }: { value: string }) {
  if (!value.trim()) {
    return <p className="text-sm text-[var(--text-muted)] italic">No content yet.</p>;
  }
  return (
    <div
      className="prose-entry text-sm"
      dangerouslySetInnerHTML={{ __html: renderRichText(value) }}
    />
  );
}
