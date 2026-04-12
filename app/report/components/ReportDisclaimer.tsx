interface ReportDisclaimerProps {
  disclaimer: string;
}

export default function ReportDisclaimer({ disclaimer }: ReportDisclaimerProps) {
  return (
    <div style={{
      padding: '20px',
      borderRadius: '14px',
      backgroundColor: 'var(--bg-tertiary)',
      marginTop: '8px',
    }}>
      <p style={{
        fontSize: '13px',
        color: 'var(--text-dim)',
        lineHeight: 1.7,
        marginBottom: '8px',
      }}>
        ※ {disclaimer}
      </p>
      <p style={{
        fontSize: '12px',
        color: 'var(--text-dim)',
      }}>
        데이터 출처: 국토교통부 실거래가 공개시스템
      </p>
    </div>
  );
}
