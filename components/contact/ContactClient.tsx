'use client';

import { useState, useEffect } from 'react';
import { Mail, Handshake, Megaphone, MessageSquare } from 'lucide-react';

const MONO = "'Roboto Mono', var(--font-mono, monospace)";

interface CategoryButtonProps {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}

function CategoryButton({ icon, title, desc, onClick }: CategoryButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 16,
        padding: '20px 24px', borderRadius: 12,
        backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
        cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', width: '100%',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--accent)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <span style={{ color: 'var(--accent)', flexShrink: 0 }}>{icon}</span>
      <div>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 4px' }}>
          {title}
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          {desc}
        </p>
      </div>
    </button>
  );
}

export default function ContactClient() {
  const [email, setEmail] = useState('');

  useEffect(() => {
    // 마운트 후 이메일 조립 (스팸봇 방지)
    const user = 'm2zipco';
    const domain = 'gmail.com';
    setEmail(`${user}@${domain}`);
  }, []);

  function handleMailto(subject: string) {
    if (!email) return;
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}`;
  }

  return (
    <main style={{ paddingTop: 80, paddingBottom: 48, minHeight: '100vh', backgroundColor: 'var(--bg-primary)' }}>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px' }}>
        {/* 헤더 */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-strong)', margin: '0 0 8px' }}>
            📧 문의하기
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
            내집(My.ZIP)에 문의하실 내용을 남겨주세요
          </p>
        </div>

        {/* 이메일 카드 */}
        <div style={{
          padding: 24, borderRadius: 16, marginBottom: 32, textAlign: 'center',
          backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
        }}>
          <Mail size={28} style={{ color: 'var(--accent)', marginBottom: 12 }} />
          <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 8px' }}>
            문의 이메일
          </p>
          <p style={{
            fontSize: 20, fontWeight: 700, fontFamily: MONO,
            color: 'var(--text-primary)', margin: '0 0 16px',
          }}>
            {email || 'm2zipco [at] gmail.com'}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0 }}>
            아래 카테고리를 선택하시면 이메일 작성 창이 열립니다
          </p>
        </div>

        {/* 카테고리 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <CategoryButton
            icon={<Handshake size={24} />}
            title="🤝 협업·제휴 문의"
            desc="서비스 제휴, 데이터 파트너십, API 연동"
            onClick={() => handleMailto('[협업·제휴 문의] 내집(My.ZIP)')}
          />
          <CategoryButton
            icon={<Megaphone size={24} />}
            title="📢 광고 문의"
            desc="배너, 스폰서 콘텐츠, 브랜디드 콘텐츠"
            onClick={() => handleMailto('[광고 문의] 내집(My.ZIP)')}
          />
          <CategoryButton
            icon={<MessageSquare size={24} />}
            title="💬 일반 문의·피드백"
            desc="버그 리포트, 기능 제안, 데이터 오류 제보"
            onClick={() => handleMailto('[일반 문의·피드백] 내집(My.ZIP)')}
          />
        </div>

        {/* 안내 */}
        <div style={{
          marginTop: 32, padding: '16px 20px', borderRadius: 10,
          backgroundColor: 'var(--border-light)',
          fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7,
        }}>
          ※ 답변은 영업일 기준 2~3일 이내에 드립니다.
          <br />
          ※ 데이터 오류 제보 시 구체적인 지역·단지명·스크린샷을 함께 보내주시면 빠른 확인이 가능합니다.
        </div>
      </div>
    </main>
  );
}
