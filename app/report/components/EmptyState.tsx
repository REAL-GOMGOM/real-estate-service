interface EmptyStateProps {
  message: string;
}

export default function EmptyState({ message }: EmptyStateProps) {
  return (
    <div style={{
      maxWidth: '1280px',
      margin: '0 auto',
      padding: '80px 24px',
      textAlign: 'center',
    }}>
      <p style={{ fontSize: '18px', color: 'var(--text-muted)' }}>
        {message}
      </p>
      <p style={{ fontSize: '14px', color: 'var(--text-dim)', marginTop: '8px' }}>
        매일 오전 8시 30분에 자동으로 생성됩니다.
      </p>
    </div>
  );
}
