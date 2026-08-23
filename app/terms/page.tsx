import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { createPageMetadata } from '@/lib/metadata';

export const metadata = createPageMetadata({
  title: '이용약관 | 내집(My.ZIP)',
  description:
    '내집(My.ZIP) 부동산 정보 서비스의 이용 조건, 데이터 정정, 광고 표시 및 이용자 권리를 안내합니다.',
  path: '/terms',
});

export default function TermsPage() {
  return (
    <>
      <Header />
      <main
        className="mx-auto px-4 pb-16 pt-28 md:px-6 md:pb-24"
        style={{ maxWidth: '52rem' }}
      >
        <h1
          className="text-3xl font-bold md:text-4xl"
          style={{ color: 'var(--text-strong)' }}
        >
          이용약관
        </h1>

        <div
          className="mt-10 space-y-9 text-[15px] leading-7"
          style={{ color: 'var(--text-muted)' }}
        >
          <TermsSection title="제1조 (목적과 적용)">
            <p>
              본 약관은 더로커스(The Locus)가 운영하는 내집(My.ZIP, 이하
              &ldquo;서비스&rdquo;)의 이용 조건과 운영자·이용자의 권리 및 의무를
              정합니다. 서비스를 이용하면 본 약관이 적용됩니다.
            </p>
          </TermsSection>

          <TermsSection title="제2조 (서비스의 내용)">
            <p>
              서비스는 국토교통부·한국부동산원·청약 관련 기관 등 공개자료와
              자체 집계를 바탕으로 실거래, 시장 지표, 입지, 청약, 학교, 계산기,
              뉴스 링크와 칼럼을 제공합니다. 현재 공개 서비스는 회원가입 없이
              무료로 이용할 수 있습니다.
            </p>
          </TermsSection>

          <TermsSection title="제3조 (데이터의 기준과 이용 시 주의사항)">
            <p>
              공공데이터는 신고·정정·취소 반영 시차가 있고, 동일 지역이라도
              단지·면적·층·연식과 표본 구성에 따라 수치가 달라질 수 있습니다.
              서비스는 가능한 범위에서 출처, 기준 기간, 표본 수와 산식을 함께
              표시하며 오류가 확인되면 정정합니다.
            </p>
            <p className="mt-3">
              제공 정보와 계산 결과는 참고자료이며 감정평가, 중개, 세무·법률·금융
              자문이 아닙니다. 매수·매도·청약·대출 등 중요한 결정 전에는 원문
              공고, 등기사항증명서, 금융기관 조건과 관련 전문가의 확인을 받아야
              합니다.
            </p>
          </TermsSection>

          <TermsSection title="제4조 (이용자의 의무)">
            <p>이용자는 다음 행위를 해서는 안 됩니다.</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>서비스 또는 다른 이용자의 정상적인 이용을 방해하는 행위</li>
              <li>보안 장치를 우회하거나 비공개 관리자 영역에 접근하는 행위</li>
              <li>서버에 과도한 부하를 주는 자동 요청 또는 무단 대량 수집</li>
              <li>서비스 콘텐츠를 허위·오인 방식으로 재배포하는 행위</li>
              <li>관련 법령과 공공데이터 제공 조건을 위반하는 행위</li>
            </ul>
          </TermsSection>

          <TermsSection title="제5조 (광고와 제휴 링크)">
            <p>
              서비스는 운영 비용을 충당하기 위해 Google AdSense 광고와 쿠팡
              파트너스 제휴 광고를 표시할 수 있습니다. 제휴 광고에는 광고 또는
              수수료 수취 사실을 구분해 표시합니다. 광고·제휴 링크를 통한 구매
              계약은 이용자와 해당 판매자 사이에 체결되며, 상품·결제·배송·환불은
              판매자의 조건이 적용됩니다.
            </p>
          </TermsSection>

          <TermsSection title="제6조 (서비스 변경·점검·중단)">
            <p>
              운영자는 품질 개선이나 운영상 필요에 따라 기능을 변경할 수 있습니다.
              이용에 중대한 영향을 주는 계획된 변경·점검은 가능한 범위에서 미리
              알립니다. 장애, 보안 사고, 외부 API·클라우드 중단처럼 사전 안내가
              어려운 경우에는 먼저 피해를 줄이고 복구한 뒤 상태와 조치 내용을
              알릴 수 있습니다.
            </p>
          </TermsSection>

          <TermsSection title="제7조 (오류 제보와 정정)">
            <p>
              데이터 또는 콘텐츠 오류는 문의 이메일로 제보할 수 있습니다. 운영자는
              영업일 기준 3일 이내에 접수 여부를 회신하고, 원자료와 산식을 확인해
              정정·보류·유지 결과를 안내하도록 노력합니다. 검증 중인 수치는 필요한
              경우 화면에서 숨기거나 점검 상태로 표시합니다.
            </p>
          </TermsSection>

          <TermsSection title="제8조 (지식재산권)">
            <p>
              자체 제작한 칼럼·분석·디자인·시각화의 권리는 운영자 또는 정당한
              권리자에게 있습니다. 출처와 원문 링크를 밝힌 통상적인 인용은 허용되나,
              영리 목적의 복제·재판매 또는 서비스 전체를 대체하는 대량 수집은 사전
              동의가 필요합니다. 공공데이터 원본에는 각 제공 기관의 조건이 적용됩니다.
            </p>
          </TermsSection>

          <TermsSection title="제9조 (책임의 범위)">
            <p>
              운영자는 합리적인 범위에서 서비스의 안정성과 정보 품질을 관리합니다.
              다만 원자료의 오류·지연, 이용자의 입력 오류, 통제하기 어려운 외부 서비스
              장애로 발생한 차이에 대해서는 관련 법령이 허용하는 범위에서 책임이
              제한될 수 있습니다. 운영자의 고의 또는 중대한 과실로 인한 책임까지
              배제하지 않습니다.
            </p>
          </TermsSection>

          <TermsSection title="제10조 (약관 변경)">
            <p>
              약관을 변경할 때에는 시행일과 변경 이유를 이 페이지에 공개합니다.
              이용자에게 불리하거나 중요한 변경은 원칙적으로 시행 30일 전에,
              그 밖의 변경은 7일 전에 알립니다. 법령 변경이나 긴급한 보안 조치로
              사전 공지가 어려운 경우에는 적용 후 지체 없이 알릴 수 있습니다.
            </p>
          </TermsSection>

          <TermsSection title="제11조 (준거법과 분쟁 처리)">
            <p>
              본 약관은 대한민국 법률에 따라 해석합니다. 분쟁이 생기면 우선 상호
              협의해 해결하고, 해결되지 않는 경우 민사소송법에 따른 관할 법원을
              이용합니다.
            </p>
          </TermsSection>

          <TermsSection title="운영자 정보">
            <ul className="list-none space-y-1 pl-0">
              <li>상호: 더로커스(The Locus)</li>
              <li>사업자등록번호: 507-06-96727</li>
              <li>
                문의:{' '}
                <a
                  href="mailto:m2zipco@gmail.com"
                  className="underline underline-offset-2 hover:opacity-75"
                >
                  m2zipco@gmail.com
                </a>
              </li>
            </ul>
          </TermsSection>

          <p
            className="border-t pt-6 text-sm"
            style={{ borderColor: 'var(--border)', color: 'var(--text-dim)' }}
          >
            공고·시행일: 2026년 8월 9일 · 버전 1.1
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}

function TermsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2
        className="mb-3 text-xl font-semibold"
        style={{ color: 'var(--text-strong)' }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}
