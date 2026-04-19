import type { RegionDetail } from '@/lib/types';

interface Props {
  region: RegionDetail;
}

export function RegionInsight({ region }: Props) {
  const { insight } = region;

  if (!insight.headline && !insight.summary) return null;

  return (
    <section
      className="mx-auto max-w-5xl px-4 md:px-6 py-8 md:py-10 border-t"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="space-y-4">
        {insight.headline && (
          <h2
            className="text-2xl md:text-3xl font-semibold leading-snug"
            style={{ color: 'var(--text-strong)' }}
          >
            {insight.headline}
          </h2>
        )}

        {insight.summary && (
          <p
            className="text-base md:text-lg leading-relaxed"
            style={{ color: 'var(--text-primary)' }}
          >
            {insight.summary}
          </p>
        )}

        {insight.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {insight.tags.map((tag, idx) => (
              <span
                key={idx}
                className="px-2.5 py-1 text-xs rounded-md"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-muted)',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
