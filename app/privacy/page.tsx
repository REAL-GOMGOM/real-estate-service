import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '개인정보 처리방침 | 내집(NAEZIP)',
  description: '내집(NAEZIP) 서비스의 개인정보 처리방침입니다.',
};

export default function PrivacyPage() {
  return (
    <main
      className="mx-auto px-4 md:px-6 py-12 md:py-20"
      style={{ maxWidth: '48rem' }}
    >
      <h1
        className="text-3xl md:text-4xl font-bold mb-8"
        style={{ color: 'var(--text-strong)' }}
      >
        개인정보 처리방침
      </h1>

      <div
        className="space-y-4 leading-relaxed"
        style={{ color: 'var(--text-muted)', fontSize: '15px' }}
      >
        <p>
          내집(NAEZIP, 운영: 더로커스)은 회원가입·개별 개인정보 수집을 하지
          않습니다.
        </p>

        <p>
          본 서비스는 방문자 분석을 위해 <strong>Google Analytics</strong>,
          광고 게재를 위해 <strong>Google AdSense</strong>를 사용하며, 이
          과정에서 쿠키와 IP 정보가 Google(미국)로 전송될 수 있습니다. 페이지
          하단의 &ldquo;쿠키 설정&rdquo;에서 언제든 동의를 철회할 수 있습니다.
        </p>

        <p>
          방문자 수 집계를 위해 IP 해시값이 익명으로 저장됩니다(원본 IP 저장
          없음).
        </p>

        <p>
          서비스 호스팅은 Vercel Inc.(미국), 방문자 통계 임시 저장은 Upstash
          Inc.(미국)에 위탁하고 있습니다.
        </p>

        <h2
          className="text-xl font-semibold mt-8 mb-3"
          style={{ color: 'var(--text-strong)' }}
        >
          사업자 정보
        </h2>
        <ul className="space-y-1 list-none pl-0">
          <li>상호: 더로커스(The Locus)</li>
          <li>사업자등록번호: 507-06-96727</li>
          <li>
            문의:{' '}
            <a href="mailto:m2zipco@gmail.com" className="underline">
              m2zipco@gmail.com
            </a>
          </li>
        </ul>

        <p
          className="text-sm mt-10 pt-6"
          style={{
            borderTop: '1px solid var(--border)',
            color: 'var(--text-dim)',
          }}
        >
          시행일자: 2026년 4월 19일 · 버전 1.0
        </p>
      </div>
    </main>
  );
}
