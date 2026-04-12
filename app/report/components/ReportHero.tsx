interface ReportHeroProps {
  title: string;
  subtitle: string;
  generatedAt: string;
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

export default function ReportHero({ title, subtitle, generatedAt }: ReportHeroProps) {
  return (
    <section style={{
      backgroundColor: 'var(--bg-secondary)',
      padding: 'clamp(48px, 10vw, 96px) 24px',
      textAlign: 'center',
    }}>
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>
        <h1 style={{
          fontSize: 'clamp(36px, 6vw, 60px)',
          fontWeight: 800,
          color: 'var(--text-primary)',
          lineHeight: 1.2,
          marginBottom: '16px',
          letterSpacing: '-0.02em',
        }}>
          {title}
        </h1>
        <p style={{
          fontSize: 'clamp(15px, 2vw, 18px)',
          color: 'var(--text-muted)',
          marginBottom: '12px',
        }}>
          {subtitle}
        </p>
        <p style={{
          fontSize: '13px',
          color: 'var(--text-dim)',
        }}>
          {formatKST(generatedAt)}
        </p>
      </div>
    </section>
  );
}
