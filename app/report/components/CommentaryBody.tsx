interface CommentaryBodyProps {
  paragraphs: string[];
}

export default function CommentaryBody({ paragraphs }: CommentaryBodyProps) {
  return (
    <section style={{
      padding: 'clamp(32px, 6vw, 64px) 24px',
    }}>
      <div style={{
        maxWidth: '680px',
        margin: '0 auto',
      }}>
        {paragraphs.map((p, i) => (
          <p
            key={i}
            style={{
              fontSize: '18px',
              lineHeight: 1.7,
              color: 'var(--text-primary)',
              marginBottom: i < paragraphs.length - 1 ? '24px' : '0',
            }}
          >
            {p}
          </p>
        ))}
      </div>
    </section>
  );
}
