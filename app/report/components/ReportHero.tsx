interface ReportHeroProps {
  title: string;
  subtitle: string;
  generatedAt: string;
  dateRange: { from: string; to: string };
}

function formatKST(iso: string): string {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getFullYear();
  const m = kst.getMonth() + 1;
  const day = kst.getDate();
  const h = String(kst.getHours()).padStart(2, '0');
  const min = String(kst.getMinutes()).padStart(2, '0');
  return `${y}년 ${m}월 ${day}일 ${h}:${min} 업데이트`;
}

function formatMD(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${parseInt(m)}/${parseInt(d)}`;
}

export default function ReportHero({ title, subtitle, generatedAt, dateRange }: ReportHeroProps) {
  return (
    <section style={{
      maxWidth: 'var(--container-narrow)',
      margin: '0 auto',
      padding: 'var(--space-9) var(--page-padding) var(--space-7)',
      textAlign: 'center',
    }}>
      {/* Meta line */}
      <p style={{
        fontSize: 'var(--font-sm)',
        color: 'var(--text-muted)',
        marginBottom: 'var(--space-4)',
        letterSpacing: '0.02em',
      }}>
        {formatMD(dateRange.from)} – {formatMD(dateRange.to)} · {formatKST(generatedAt)}
      </p>

      {/* Title */}
      <h1 style={{
        fontSize: 'var(--font-display)',
        fontWeight: 800,
        color: 'var(--text-primary)',
        lineHeight: 'var(--line-tight)',
        marginBottom: 'var(--space-4)',
        letterSpacing: '-0.02em',
      }}>
        {title}
      </h1>

      {/* Subtitle */}
      <p style={{
        fontSize: 'var(--font-body)',
        color: 'var(--text-muted)',
        lineHeight: 'var(--line-normal)',
      }}>
        {subtitle}
      </p>
    </section>
  );
}
