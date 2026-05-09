/**
 * 쿠팡 파트너스 고지 의무 텍스트
 *
 * 법적 근거: 공정거래위원회 경제적 이해관계 표시 가이드
 * 박는 위치: 광고 박힌 컴포넌트마다 박음
 */
export function CoupangDisclosure() {
  return (
    <p className="mt-2 text-xs text-gray-500 text-center max-w-md">
      이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
    </p>
  );
}
