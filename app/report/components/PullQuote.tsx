interface PullQuoteProps {
  text: string;
}

export default function PullQuote({ text }: PullQuoteProps) {
  return (
    <section style={{
      padding: 'clamp(40px, 8vw, 80px) 24px',
      textAlign: 'center',
    }}>
      <blockquote style={{
        maxWidth: '760px',
        margin: '0 auto',
        position: 'relative',
        padding: '0 40px',
      }}>
        <span style={{
          position: 'absolute',
          top: '-16px',
          left: '0',
          fontSize: '64px',
          lineHeight: 1,
          color: 'var(--accent)',
          opacity: 0.3,
          fontFamily: 'Georgia, serif',
        }}>
          &laquo;
        </span>
        <p style={{
          fontSize: 'clamp(22px, 3vw, 32px)',
          fontWeight: 500,
          color: 'var(--accent)',
          lineHeight: 1.5,
          letterSpacing: '-0.01em',
        }}>
          {text}
        </p>
        <span style={{
          position: 'absolute',
          bottom: '-40px',
          right: '0',
          fontSize: '64px',
          lineHeight: 1,
          color: 'var(--accent)',
          opacity: 0.3,
          fontFamily: 'Georgia, serif',
        }}>
          &raquo;
        </span>
      </blockquote>
    </section>
  );
}
