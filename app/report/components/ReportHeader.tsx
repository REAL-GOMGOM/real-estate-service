interface ReportHeaderProps {
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

export default function ReportHeader({ title, subtitle, generatedAt }: ReportHeaderProps) {
  return (
    <div style={{ marginBottom: '40px' }}>
      <h1 style={{
        fontSize: 'clamp(24px, 4vw, 36px)',
        fontWeight: 800,
        color: 'var(--text-primary)',
        marginBottom: '8px',
        lineHeight: 1.3,
      }}>
        {title}
      </h1>
      <p style={{
        fontSize: '15px',
        color: 'var(--text-muted)',
        marginBottom: '6px',
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
  );
}
