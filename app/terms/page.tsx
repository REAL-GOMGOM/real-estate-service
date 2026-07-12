import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '이용약관 | 내집(NAEZIP)',
  description: '내집(NAEZIP) 서비스의 이용약관입니다.',
};

/**
 * 이용약관 — 푸터 전역 링크 대상 (2026-07-12 신설).
 * 배경: 푸터가 /terms 로 링크했지만 페이지가 없어 사이트 전역에서 404
 * (콘솔의 /terms?_rsc 프리페치 404 로 발견). privacy 페이지와 동일 레이아웃.
 */
export default function TermsPage() {
  return (
    <main
      className="mx-auto px-4 md:px-6 py-12 md:py-20"
      style={{ maxWidth: '48rem' }}
    >
      <h1
        className="text-3xl md:text-4xl font-bold mb-8"
        style={{ color: 'var(--text-strong)' }}
      >
        이용약관
      </h1>

      <div
        className="space-y-4 leading-relaxed"
        style={{ color: 'var(--text-muted)', fontSize: '15px' }}
      >
        <h2 className="text-xl font-semibold mt-2 mb-3" style={{ color: 'var(--text-strong)' }}>
          제1조 (목적)
        </h2>
        <p>
          본 약관은 내집(NAEZIP, 운영: 더로커스, 이하 &ldquo;서비스&rdquo;)이
          제공하는 부동산 정보 서비스의 이용 조건을 규정합니다. 서비스를
          이용하는 경우 본 약관에 동의한 것으로 봅니다.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3" style={{ color: 'var(--text-strong)' }}>
          제2조 (서비스의 내용)
        </h2>
        <p>
          서비스는 국토교통부·한국부동산원 등 공공데이터를 기반으로 실거래가,
          시세 분석, 입지 정보, 청약 정보, 칼럼 등을 무료로 제공합니다. 별도의
          회원가입 없이 이용할 수 있습니다.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3" style={{ color: 'var(--text-strong)' }}>
          제3조 (정보의 성격과 책임의 한계)
        </h2>
        <p>
          서비스가 제공하는 모든 정보는 <strong>참고용</strong>입니다. 공공데이터의
          집계·반영 시차, 원천 데이터의 오류 등으로 실제와 차이가 있을 수
          있으며, 서비스는 정보의 완전성·정확성·적시성을 보증하지 않습니다.
        </p>
        <p>
          부동산 매수·매도·청약·대출 등 일체의 의사결정과 그 결과에 대한 책임은
          이용자 본인에게 있습니다. 중요한 결정은 반드시 등기부등본 등 원천
          자료 확인과 전문가 상담을 거치시기 바랍니다.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3" style={{ color: 'var(--text-strong)' }}>
          제4조 (지식재산권)
        </h2>
        <p>
          서비스의 칼럼·분석·시각화 등 자체 제작 콘텐츠의 저작권은 운영자에게
          있습니다. 출처(내집, naezipkorea.com)를 명시한 비상업적 인용은
          허용되며, 그 외 무단 복제·전재·크롤링을 통한 대량 수집은 금지됩니다.
          공공데이터 원본의 권리는 해당 제공 기관에 있습니다.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3" style={{ color: 'var(--text-strong)' }}>
          제5조 (광고)
        </h2>
        <p>
          서비스는 운영 재원을 위해 Google AdSense 등 제3자 광고를 게재할 수
          있습니다. 광고를 통한 거래는 이용자와 해당 광고주 간의 문제이며,
          서비스는 이에 관여하지 않습니다.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3" style={{ color: 'var(--text-strong)' }}>
          제6조 (서비스의 변경·중단)
        </h2>
        <p>
          서비스는 기능의 전부 또는 일부를 사전 고지 없이 변경하거나 중단할 수
          있습니다. 무료 서비스의 변경·중단으로 인한 손해에 대해서는 책임을
          지지 않습니다.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3" style={{ color: 'var(--text-strong)' }}>
          제7조 (준거법)
        </h2>
        <p>
          본 약관은 대한민국 법률에 따라 해석되며, 분쟁이 발생하는 경우
          민사소송법상 관할 법원에 제소합니다.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3" style={{ color: 'var(--text-strong)' }}>
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
          시행일자: 2026년 7월 12일 · 버전 1.0
        </p>
      </div>
    </main>
  );
}
