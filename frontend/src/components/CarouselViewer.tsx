import { useQueryClient, useMutation } from '@tanstack/react-query';
import { api, carouselFileUrl } from '../api';
import { solidButtonStyle } from '../lib/ui';

// The rendered carousel (slides.html) in an iframe - the in-app click-through
// preview. Reused by the chat approval embed and the Ready-to-Schedule card.
export function CarouselFrame({ path, title, height = 560 }: { path: string; title?: string; height?: number }) {
  return (
    <iframe
      title={title || 'carousel preview'}
      src={carouselFileUrl(path)}
      style={{
        width: '100%',
        height,
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-md)',
        background: '#1f1f1f',
        display: 'block',
      }}
    />
  );
}

function titleFromPath(path: string): string {
  const slug = path.split('/').slice(-2, -1)[0] ?? '';
  const m = slug.match(/^\d{4}-\d{2}-\d{2}-(.+)$/);
  const s = m ? m[1] : slug;
  return s.replace(/-/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
}

// Inline-in-chat carousel preview + an "Approve -> Ready to Schedule" button.
// Rendered by the Markdown component when the skill emits a ```carousel block.
export function CarouselEmbed({ path }: { path: string }) {
  const qc = useQueryClient();
  const title = titleFromPath(path);
  const approve = useMutation({
    mutationFn: () => api.approveCarousel(path),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ig-queue'] }),
  });
  const done = approve.isSuccess;

  return (
    <div
      style={{
        margin: '10px 0',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--surface)',
        padding: 'var(--space-3)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span className="eyebrow" style={{ color: 'var(--muted)' }}>carousel preview · {title}</span>
      </div>

      <CarouselFrame path={path} title={title} height={560} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        {done ? (
          <span style={{ fontSize: 'var(--body-sm)', fontWeight: 600, color: 'var(--accent)' }}>
            ✓ sent to Ready to Schedule
          </span>
        ) : (
          <>
            <button
              type="button"
              onClick={() => approve.mutate()}
              disabled={approve.isPending}
              style={solidButtonStyle}
            >
              {approve.isPending ? 'approving…' : 'approve → ready to schedule'}
            </button>
            <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>flip through it above first</span>
          </>
        )}
      </div>
      {approve.isError && (
        <span style={{ color: 'var(--danger)', fontSize: 'var(--body-sm)' }}>
          couldn't approve: {(approve.error as Error)?.message}
        </span>
      )}
    </div>
  );
}
