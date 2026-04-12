interface PullQuoteProps {
  text: string;
}

export default function PullQuote({ text }: PullQuoteProps) {
  return (
    <section style={{
      maxWidth: 'var(--container-narrow)',
      margin: '0 auto',
      padding: 'var(--space-7) var(--page-padding)',
    }}>
      <div style={{
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
        padding: 'var(--space-6) 0',
        textAlign: 'center',
      }}>
        <blockquote style={{
          margin: 0,
          padding: '0 var(--space-5)',
        }}>
          <p style={{
            fontSize: 'var(--font-h2)',
            fontWeight: 500,
            fontStyle: 'italic',
            color: 'var(--accent)',
            lineHeight: 'var(--line-snug)',
            letterSpacing: '-0.01em',
          }}>
            {text}
          </p>
        </blockquote>
      </div>
    </section>
  );
}
