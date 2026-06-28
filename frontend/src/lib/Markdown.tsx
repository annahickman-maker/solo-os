import { type ReactNode } from 'react';
import { CarouselEmbed } from '../components/CarouselViewer';

// A small, dependency-free markdown renderer. Handles the things skill
// instructions actually use - headings, bold/italic, inline code, fenced code,
// bullet + numbered lists, blockquotes, and horizontal rules - so the editor
// shows clean formatted text instead of raw # and * characters.

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Order matters: code first (so ** inside code isn't parsed), then bold, then italic, then links.
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*|_[^_]+_)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-${i++}`;
    if (tok.startsWith('`')) {
      nodes.push(
        <code key={key} style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', background: 'var(--fill-subtle)', padding: '1px 5px', borderRadius: 4, fontSize: '0.9em' }}>
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith('**')) {
      nodes.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith('[')) {
      const mm = tok.match(/\[([^\]]+)\]\(([^)]+)\)/);
      nodes.push(
        <a key={key} href={mm?.[2]} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
          {mm?.[1]}
        </a>,
      );
    } else {
      nodes.push(<em key={key}>{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ text }: { text: string }) {
  const lines = (text || '').replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  const heading: Record<number, { fontSize: string; mt: string }> = {
    1: { fontSize: 'var(--body-lg)', mt: 'var(--space-4)' },
    2: { fontSize: 'var(--body-lg)', mt: 'var(--space-4)' },
    3: { fontSize: 'var(--body)', mt: 'var(--space-3)' },
    4: { fontSize: 'var(--body)', mt: 'var(--space-3)' },
  };

  while (i < lines.length) {
    const line = lines[i];

    // ```carousel<newline>path-to-slides.html``` -> inline carousel preview +
    // approve button (emitted by the carousel skill). Indent-tolerant (the
    // block may be nested under a list item). Skip while the path is still
    // empty (the message is mid-stream and the fence hasn't filled yet).
    if (/^\s*```carousel\s*$/i.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++; // closing fence
      const cpath = buf.join('\n').trim();
      if (cpath) blocks.push(<CarouselEmbed key={key++} path={cpath} />);
      continue;
    }

    // fenced code block
    if (/^```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++; // closing fence
      blocks.push(
        <pre
          key={key++}
          style={{ background: 'var(--fill-subtle)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', overflowX: 'auto', fontSize: 'var(--body-sm)', fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', lineHeight: 1.5 }}
        >
          {buf.join('\n')}
        </pre>,
      );
      continue;
    }

    // horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push(<hr key={key++} style={{ border: 'none', borderTop: '1px solid var(--hairline)', margin: 'var(--space-3) 0' }} />);
      i++;
      continue;
    }

    // heading
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const st = heading[level];
      blocks.push(
        <div key={key++} style={{ fontWeight: 600, fontSize: st.fontSize, marginTop: blocks.length ? st.mt : 0, marginBottom: 2 }}>
          {renderInline(h[2], `h${key}`)}
        </div>,
      );
      i++;
      continue;
    }

    // blockquote
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push(
        <blockquote key={key++} style={{ borderLeft: '2px solid var(--hairline)', paddingLeft: 'var(--space-3)', color: 'var(--muted)', margin: 0 }}>
          {renderInline(buf.join(' '), `q${key}`)}
        </blockquote>,
      );
      continue;
    }

    // unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ''));
      blocks.push(
        <ul key={key++} style={{ margin: '4px 0', paddingLeft: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it, `ul${key}-${idx}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\.\s+/, ''));
      blocks.push(
        <ol key={key++} style={{ margin: '4px 0', paddingLeft: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it, `ol${key}-${idx}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // paragraph (gather consecutive non-blank, non-special lines)
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4})\s/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])
    ) {
      buf.push(lines[i++]);
    }
    // Preserve single newlines inside a paragraph as hard line breaks
    // (GitHub-style "breaks"). Without this, consecutive lines join with a
    // space and intended lists - e.g. the timestamped chapters in a YouTube
    // description - collapse into one run-on sentence. A blank line still
    // starts a new paragraph (handled above).
    blocks.push(
      <p key={key++} style={{ margin: '6px 0', lineHeight: 1.6 }}>
        {buf.map((ln, idx) => (
          <span key={idx}>
            {idx > 0 && <br />}
            {renderInline(ln, `p${key}-${idx}`)}
          </span>
        ))}
      </p>,
    );
  }

  return <div style={{ fontSize: 'var(--body-sm)' }}>{blocks}</div>;
}
