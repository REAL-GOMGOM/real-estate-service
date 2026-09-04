import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { createPageMetadata } from '@/lib/metadata';

export const metadata = createPageMetadata({
  title: '개인정보 처리방침 | 내집(My.ZIP)',
  description:
    '내집(My.ZIP)의 문의 정보, 접속 기록, 선택적 분석·광고 데이터 처리와 이용자 권리를 안내합니다.',
  path: '/privacy',
});

const externalLinkClass = 'underline underline-offset-2 hover:opacity-75';

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main
        className="mx-auto px-4 pb-16 pt-28 md:px-6 md:pb-24"
        style={{ maxWidth: '56rem' }}
      >
        <h1
          className="text-3xl font-bold md:text-4xl"
          style={{ color: 'var(--text-strong)' }}
        >
          개인정보 처리방침
        </h1>
        <p className="mt-4 leading-7" style={{ color: 'var(--text-muted)' }}>
          더로커스(The Locus, 이하 &ldquo;운영자&rdquo;)는 내집(My.ZIP)
          이용자의 개인정보를 필요한 범위에서만 처리하며, 선택적 분석·광고
          기능은 이용자가 동의한 경우에만 불러옵니다.
        </p>

        <div
          className="mt-10 space-y-10 text-[15px] leading-7"
          style={{ color: 'var(--text-muted)' }}
        >
          <PolicySection title="1. 처리하는 개인정보와 목적·보유기간">
            <p>
              사이트는 회원가입을 받지 않습니다. 다만 문의 또는 서비스 이용
              과정에서 아래 정보가 처리될 수 있습니다.
            </p>
            <div className="mt-4 overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <table className="min-w-[720px] w-full border-collapse text-left text-sm">
                <thead style={{ background: 'var(--bg-tertiary)', color: 'var(--text-strong)' }}>
                  <tr>
                    <th className="p-3">구분</th>
                    <th className="p-3">항목</th>
                    <th className="p-3">목적</th>
                    <th className="p-3">보유기간</th>
                  </tr>
                </thead>
                <tbody>
                  <PolicyRow
                    category="이메일 문의"
                    items="이메일 주소, 발신자명, 문의 내용과 이용자가 첨부한 자료"
                    purpose="답변, 오류 확인, 권리 요청 처리"
                    retention="최종 답변 후 3년 이내. 법령상 보존 의무가 있으면 해당 기간"
                  />
                  <PolicyRow
                    category="접속·보안 기록"
                    items="IP 주소, 브라우저·기기 정보, 요청 URL, 접속 시각, 오류 기록"
                    purpose="서비스 제공, 장애 대응, 보안과 부정 이용 방지"
                    retention="Vercel 런타임 로그 기준 계정 플랜·관측 설정에 따라 1시간~30일. 별도 법정 보존 사유가 없으면 목적 달성 후 삭제"
                  />
                  <PolicyRow
                    category="방문 분석(선택)"
                    items="온라인 식별자·쿠키, 페이지 조회와 이벤트, 브라우저·기기 및 대략적 지역 정보, IP 주소로 즉시 생성한 HMAC-SHA256 가명값(원문 미저장)"
                    purpose="이용 현황 측정, 오늘·최근 7일·누적 순방문자 수의 오차 있는 근사 집계와 서비스 개선"
                    retention="동의 철회 시 신규 수집 중단. 일별 HyperLogLog 집계는 35일, 누적 HyperLogLog 집계는 서비스 운영 기간 보관. GA4 사용자·이벤트 데이터는 운영 속성의 보유 설정(2개월 또는 14개월)에 따라 삭제"
                  />
                  <PolicyRow
                    category="광고(선택)"
                    items="광고 쿠키·온라인 식별자, 방문 URL·IP 주소, 광고 노출·클릭·마우스 상호작용, 브라우저·기기 정보"
                    purpose="문맥형 광고 제공·성과 측정·부정 클릭 방지와 Google·쿠팡으로의 전송"
                    retention="동의 철회 시 사이트에서 수집을 중단하며, 제공자 정책에 따른 기간"
                  />
                  <PolicyRow
                    category="맞춤형 광고(별도 선택)"
                    items="온라인 식별자, 관심사·이용 정보, 광고 상호작용"
                    purpose="이용자 관심사에 맞춘 광고 개인화"
                    retention="동의 철회 시 새 개인화 요청을 중단하며, 제공자 정책에 따른 기간"
                  />
                </tbody>
              </table>
            </div>
          </PolicySection>

          <section id="field-reports" className="scroll-mt-24">
            <h2 className="mb-3 text-xl font-semibold" style={{ color: 'var(--text-strong)' }}>현장 제보가격 정보 처리 안내</h2>
            <p>제보 기능은 별도 동의를 받은 경우에만 단지 식별자·단지명·지역·전용면적·거래유형·금액·계약일·소식 출처와 접수 시각을 저장합니다. 관리자 검수 후 해당 정보가 홈페이지에 공개될 수 있습니다. 이름·전화번호·동호수·계약서·자유 메모는 입력받지 않습니다.</p>
            <p className="mt-3">제보는 접수 후 30일간 공개 대상이며, 접수 후 90일이 지나면 제보 저장소에서 자동 삭제됩니다. 신고 사유·처리 상태도 해당 제보와 함께 삭제됩니다. 삭제·정정 요청은 접수번호 또는 공개된 제보를 지정하여 문의 이메일로 보내주세요.</p>
            <p className="mt-3">도배 방지를 위해 IP 주소를 서버에서 일별 HMAC-SHA256 가명값으로 변환합니다. 제보 저장소에는 원문 IP를 저장하지 않으며 요청 횟수 키는 최대 48시간 후 삭제합니다. 일반 호스팅 보안 로그의 처리는 위 접속·보안 기록 안내를 따릅니다.</p>
            <p className="mt-3">제보와 신고 내용은 Upstash Inc.(미국 및 선택한 서비스 처리 지역)의 접근 제한된 저장소로 HTTPS를 통해 전송됩니다. 공개 목록에는 검수를 통과한 제보 필드만 제공하며 내부 검수·신고 정보는 공개하지 않습니다. 공개 동의를 거부하면 제보 접수는 할 수 없지만 공식 실거래 조회는 계속 이용할 수 있습니다.</p>
            <p className="mt-3 text-sm">제보 기능 도입 안내: 2026년 8월 31일 · 실제 접수는 저장소 준비 및 기능 활성화 후 가능합니다.</p>
          </section>

          <PolicySection title="2. 쿠키·로컬 저장소와 선택권">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                필수 저장소: 동의 선택을 기억하기 위해 브라우저 로컬 저장소에{' '}
                <code>naezip.cookie-consent</code>를 저장합니다.
              </li>
              <li>
                편의 기능 저장소: 이용자가 본 단지를 다시 찾고 관심 단지를 직접
                저장할 수 있도록 단지 식별자·이름·지역과 저장 시각을 이 기기의
                로컬 저장소에 보관합니다. 이 정보는 서버로 전송하지 않으며 브라우저
                사이트 데이터 삭제로 언제든 지울 수 있습니다.
              </li>
              <li>
                방문 분석: 동의한 경우에만 Google Analytics를 불러오고 자체
                순방문자 근사 집계에 참여시킵니다. 자체 집계는 IP 주소를 서버에서
                비밀키 기반 HMAC-SHA256 가명값으로 즉시 변환하며, 원본 IP 주소는
                집계 저장소에 저장하지 않습니다. 브라우저 정보는 봇 제외 판단에만
                사용하고 개별 방문 기록으로 저장하지 않습니다.
                저장소에는 개별 이용 기록이 아닌 HyperLogLog 확률형 집계만 남아
                실제 수치와 작은 오차가 있을 수 있습니다.
              </li>
              <li>
                광고: 광고 항목에 동의한 경우에만 Google AdSense와 쿠팡 파트너스
                위젯을 불러옵니다. 맞춤형 광고는 별도 항목에 동의한 경우에만
              Google Consent Mode의 개인화 허용 신호를 보냅니다.
              </li>
            </ul>
            <p className="mt-3">
              현재 Google 인증 CMP 연동 전까지 AdSense 요청은 접속 국가가
              대한민국으로 확인된 트래픽에 한해 허용합니다. 국가를 확인할 수
              없거나 그 밖의 국가에서 접속하면 광고에 동의했더라도 Google 광고
              스크립트를 불러오지 않습니다. 쿠팡 파트너스 위젯은 광고 동의 범위
              안에서 별도로 동작합니다.
            </p>
            <p className="mt-3">
              Google과 다른 제3자 광고 공급업체는 광고 제공 과정에서 쿠키를
              설정·조회하거나 웹 비콘과 유사 기술을 사용할 수 있고, 방문 URL과
              IP 주소, 광고 노출·클릭·마우스 상호작용 정보가 Google에 전송될 수
              있습니다. 맞춤형 광고를 허용하면 Google과 그 파트너가 이 사이트
              또는 다른 사이트의 이전 방문 기록을 바탕으로 광고를 제공할 수
              있습니다. 맞춤형 광고를 거부해도 현재 페이지의 내용과 대략적 지역
              등에 따른 문맥형 광고는 표시될 수 있습니다.
            </p>
            <p className="mt-3">
              모든 페이지의 &ldquo;쿠키 설정&rdquo;에서 항목별 동의를 변경하거나
              철회할 수 있습니다. 철회하면 새 수집을 중단하고, 브라우저에서
              접근 가능한 Google 관련 1차 쿠키의 삭제를 시도합니다. 제3자
              도메인 쿠키는 브라우저 설정 또는 해당 제공자의 개인정보 설정에서
              별도로 삭제해야 할 수 있습니다.
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <a className={externalLinkClass} href="https://adssettings.google.com/" target="_blank" rel="noopener noreferrer">Google 광고 맞춤설정 관리</a>
              <a className={externalLinkClass} href="https://policies.google.com/technologies/partner-sites?hl=ko" target="_blank" rel="noopener noreferrer">Google 파트너 사이트 데이터 이용 안내</a>
              <a className={externalLinkClass} href="https://support.google.com/adsense/answer/1348695?hl=ko" target="_blank" rel="noopener noreferrer">AdSense 쿠키·개인정보 안내</a>
            </div>
          </PolicySection>

          <PolicySection title="3. 처리 위탁·외부 서비스와 국외 이전">
            <p>
              운영자는 사이트 제공에 필요한 인프라와, 이용자가 선택한 분석·광고
              기능을 위해 아래 서비스를 이용합니다. 외부 기능이 로드되면 이용자의
              브라우저가 해당 제공자와 직접 통신할 수 있습니다.
            </p>
            <div className="mt-4 overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
              <table className="min-w-[760px] w-full border-collapse text-left text-sm">
                <thead style={{ background: 'var(--bg-tertiary)', color: 'var(--text-strong)' }}>
                  <tr>
                    <th className="p-3">제공자·국가</th>
                    <th className="p-3">업무·목적</th>
                    <th className="p-3">이전 항목·시점·방법</th>
                    <th className="p-3">보유·연락처</th>
                  </tr>
                </thead>
                <tbody>
                  <PolicyRow
                    category="Vercel Inc. · 미국 및 서비스 처리 지역"
                    items="웹 호스팅·전송·보안 로그"
                    purpose="모든 페이지·API 요청 시 IP·요청·기기 관련 정보가 HTTPS 등 암호화된 네트워크로 전송"
                    retention="런타임 로그 1시간~30일(계정 플랜·관측 설정별), 그 밖의 처리는 목적 달성 또는 계약 종료 후 제공자 절차에 따라 삭제 · privacy@vercel.com"
                  />
                  <PolicyRow
                    category="Google LLC · 미국 및 Google 처리 지역"
                    items="Analytics·AdSense"
                    purpose="해당 항목 동의 시 페이지 이용·온라인 식별자·광고 노출·클릭 관련 정보가 HTTPS로 전송"
                    retention="Analytics 사용자·이벤트 데이터 2개월 또는 14개월(속성 설정), 광고 데이터는 Google 광고·개인정보 정책상 필요한 기간 · policies.google.com/privacy"
                  />
                  <PolicyRow
                    category="Google LLC · 미국 및 Google 처리 지역"
                    items="Gmail 문의 수신·보관"
                    purpose="이용자가 이메일을 보낼 때 발신 주소·이름·문의 내용·첨부 자료가 이메일 통신으로 전송"
                    retention="최종 답변 후 3년 이내 운영자 계정에서 삭제. 법령상 보존 의무가 있으면 해당 기간 · policies.google.com/privacy"
                  />
                  <PolicyRow
                    category="Upstash Inc. · 미국 및 선택한 AWS 처리 지역"
                    items="관리자 로그인·파일 업로드 요청 횟수 제한, 선택적 순방문자 근사 집계"
                    purpose="관리 기능 이용 시 IP 주소와 관리자 계정 식별자가 전송되며, 방문 분석 동의 시 서버가 생성한 HMAC-SHA256 가명값만 HyperLogLog 집계를 위해 암호화된 REST API로 전송"
                    retention="속도 제한 윈도우, 일별 방문 집계 35일, 누적 방문 집계는 서비스 운영 기간 · privacy@upstash.com"
                  />
                  <PolicyRow
                    category="쿠팡 주식회사 · 대한민국"
                    items="쿠팡 파트너스 광고 위젯"
                    purpose="광고 동의 후 광고 노출·클릭·기기 관련 정보가 네트워크로 전송될 수 있음"
                    retention="쿠팡 정책에 따른 기간 · privacy.coupang.com"
                  />
                  <PolicyRow
                    category="주식회사 카카오 · 대한민국"
                    items="부동산 지도 페이지의 Kakao Maps JavaScript SDK"
                    purpose="지도 페이지 접속 시 IP·브라우저·요청 정보가 HTTPS로 전송되어 지도 화면과 타일을 제공"
                    retention="카카오의 서비스·보안 로그 보유 기준에 따른 기간 · privacy.kakao.com/policy"
                  />
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm">
              선택적 분석·광고 정보의 이전을 원하지 않으면 쿠키 설정에서 해당
              항목을 거부할 수 있으며, 거부해도 부동산 정보 서비스의 핵심 기능은
              이용할 수 있습니다. 호스팅 과정의 필수 처리를 거부하면 사이트
              제공이 어려울 수 있습니다.
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <a className={externalLinkClass} href="https://vercel.com/legal/privacy-notice" target="_blank" rel="noopener noreferrer">Vercel 개인정보 안내</a>
              <a className={externalLinkClass} href="https://policies.google.com/privacy?hl=ko" target="_blank" rel="noopener noreferrer">Google 개인정보처리방침</a>
              <a className={externalLinkClass} href="https://upstash.com/trust/privacy.pdf" target="_blank" rel="noopener noreferrer">Upstash 개인정보처리방침</a>
              <a className={externalLinkClass} href="https://privacy.coupang.com/ko/center/coupang/" target="_blank" rel="noopener noreferrer">쿠팡 개인정보처리방침</a>
              <a className={externalLinkClass} href="https://privacy.kakao.com/policy?lang=ko" target="_blank" rel="noopener noreferrer">카카오 개인정보처리방침</a>
            </div>
          </PolicySection>

          <PolicySection title="4. 제3자 제공">
            <p>
              운영자는 이용자의 개인정보를 판매하지 않습니다. 법령에 근거가
              있거나 이용자가 별도로 동의한 경우를 제외하고 처리 목적의 범위를
              넘어 제3자에게 제공하지 않습니다. 위 외부 서비스가 직접 수집하는
              정보에는 각 제공자의 정책이 함께 적용됩니다.
            </p>
          </PolicySection>

          <PolicySection title="5. 파기 절차와 방법">
            <p>
              보유기간이 끝나거나 처리 목적을 달성한 정보는 지체 없이 파기합니다.
              전자 파일은 복구하기 어렵게 삭제하고, 법령상 별도 보존이 필요한
              정보는 다른 정보와 분리해 해당 기간 동안 보관합니다.
            </p>
          </PolicySection>

          <PolicySection title="6. 이용자의 권리와 행사 방법">
            <p>
              이용자는 본인 정보의 열람·정정·삭제·처리정지와 동의 철회를 요청할
              수 있습니다. 문의 이메일로 요청하면 본인 확인 후 관련 법령이 정한
              절차에 따라 처리합니다. 대리인이 요청하는 경우 위임 관계를 확인할
              수 있습니다.
            </p>
          </PolicySection>

          <PolicySection title="7. 안전성 확보 조치">
            <p>
              운영자는 HTTPS 전송, 관리자 접근 통제와 인증, 비밀정보의 환경변수
              분리, 로그인 시도 제한, 최소 권한 부여, 보안 업데이트 등 합리적인
              관리적·기술적 조치를 적용합니다.
            </p>
          </PolicySection>

          <PolicySection title="8. 개인정보 보호 담당 및 권리침해 구제">
            <ul className="list-none space-y-1 pl-0">
              <li>운영자: 더로커스(The Locus)</li>
              <li>개인정보 보호 담당: 내집 운영팀</li>
              <li>사업자등록번호: 507-06-96727</li>
              <li>
                이메일:{' '}
                <a href="mailto:m2zipco@gmail.com" className={externalLinkClass}>
                  m2zipco@gmail.com
                </a>
              </li>
            </ul>
            <p className="mt-3">
              개인정보 침해에 관한 상담이 필요한 경우 개인정보침해신고센터
              (국번 없이 118) 또는 개인정보분쟁조정위원회(1833-6972)에 문의할 수
              있습니다.
            </p>
          </PolicySection>

          <PolicySection title="9. 방침 변경">
            <p>
              내용이 추가·삭제·수정되면 이 페이지에 시행일과 변경 내용을
              공개합니다. 이용자 권리에 중대한 변경이 있는 경우 시행 전에 쉽게
              확인할 수 있는 방법으로 알립니다.
            </p>
          </PolicySection>

          <p
            className="border-t pt-6 text-sm"
            style={{ borderColor: 'var(--border)', color: 'var(--text-dim)' }}
          >
            공고·시행일: 2026년 8월 27일 · 버전 2.3
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}

function PolicySection({
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

function PolicyRow({
  category,
  items,
  purpose,
  retention,
}: {
  category: string;
  items: string;
  purpose: string;
  retention: string;
}) {
  return (
    <tr className="border-t align-top" style={{ borderColor: 'var(--border-light)' }}>
      <th className="p-3 font-semibold" style={{ color: 'var(--text-strong)' }}>{category}</th>
      <td className="p-3">{items}</td>
      <td className="p-3">{purpose}</td>
      <td className="p-3">{retention}</td>
    </tr>
  );
}
