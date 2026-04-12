interface CommentaryBodyProps {
  paragraphs: string[];
}

export default function CommentaryBody({ paragraphs }: CommentaryBodyProps) {
  return (
    <section style={{
      maxWidth: 'var(--container-narrow)',
      margin: '0 auto',
      padding: 'var(--space-7) var(--page-padding)',
    }}>
      <article>
        {paragraphs.map((p, i) => (
          <p
            key={i}
            style={{
              fontSize: 'var(--font-body-lg)',
              lineHeight: 'var(--line-relaxed)',
              color: 'var(--text-primary)',
              marginBottom: i < paragraphs.length - 1 ? 'var(--space-5)' : '0',
            }}
          >
            {p}
          </p>
        ))}
      </article>
    </section>
  );
}
