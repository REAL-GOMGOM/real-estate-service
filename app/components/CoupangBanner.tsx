/**
 * 쿠팡 파트너스 다이나믹 배너 — iframe 박음
 *
 * 사이즈: 680×140 (carousel template)
 * 모바일: max-width: 100% 박아 responsive
 * 보안: iframe 격리. 사이트 영향 최소화
 * 법적: CoupangDisclosure 같이 박음 (고지 의무)
 *
 * 사이클 D Phase 1 — 쿠팡 파트너스 신규 가입 승인용
 */
import { CoupangDisclosure } from './CoupangDisclosure';

const COUPANG_BANNER_ID = 987354;
const COUPANG_TRACKING_CODE = 'AF2740428';
const BANNER_WIDTH = 680;
const BANNER_HEIGHT = 140;

interface CoupangBannerProps {
  /** 서브 트래킹 ID — 박은 위치별 path (예: "blog-end", "loan-bottom") */
  subId?: string;
}

export function CoupangBanner({ subId = '' }: CoupangBannerProps) {
  const params = new URLSearchParams({
    id: String(COUPANG_BANNER_ID),
    template: 'carousel',
    trackingCode: COUPANG_TRACKING_CODE,
    subId,
    width: String(BANNER_WIDTH),
    height: String(BANNER_HEIGHT),
    tsource: '',
  });
  const src = `https://ads-partners.coupang.com/widgets.html?${params.toString()}`;

  return (
    <div className="my-8 flex flex-col items-center">
      <iframe
        src={src}
        width={BANNER_WIDTH}
        height={BANNER_HEIGHT}
        frameBorder={0}
        scrolling="no"
        referrerPolicy="unsafe-url"
        loading="lazy"
        title="쿠팡 파트너스 광고"
        style={{ maxWidth: '100%' }}
      />
      <CoupangDisclosure />
    </div>
  );
}
