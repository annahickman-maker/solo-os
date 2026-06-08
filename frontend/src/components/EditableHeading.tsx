import { useEffect, useRef, useState } from 'react';

// Click-to-edit heading. Renders as-is until you click; then an inline
// textarea that grows with the content. Saves on blur or Enter, cancels
// on Escape. Used for the 90-day-focus title so each user can phrase
// their goal in their own words.
export function EditableHeading({
  value,
  placeholder,
  onSave,
  className = 'h2',
}: {
  value: string;
  placeholder?: string;
  onSave: (next: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      ref.current.select();
      autoSize(ref.current);
    }
  }, [editing]);

  function commit() {
    const next = draft.trim();
    if (next && next !== value) onSave(next);
    setEditing(false);
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (!editing) {
    return (
      <h1
        className={className}
        onClick={() => setEditing(true)}
        title="click to edit"
        style={{ cursor: 'text', margin: 0 }}
      >
        {value || (
          <span className="muted" style={{ fontStyle: 'italic' }}>
            {placeholder ?? 'click to set your focus'}
          </span>
        )}
      </h1>
    );
  }

  return (
    <textarea
      ref={ref}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        autoSize(e.currentTarget);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
      }}
      rows={1}
      style={{
        width: '100%',
        background: 'transparent',
        border: 'none',
        outline: 'none',
        resize: 'none',
        color: 'var(--ink)',
        fontFamily: 'inherit',
        fontSize: 'inherit',
        fontWeight: 'inherit',
        lineHeight: 'inherit',
        letterSpacing: 'inherit',
        padding: 0,
        margin: 0,
      }}
      className={className}
    />
  );
}

function autoSize(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}
