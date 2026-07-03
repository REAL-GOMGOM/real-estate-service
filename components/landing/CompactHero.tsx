/**
 * 사이클 U 메인 컴팩트 히어로 — 시안 1a (피드 우선형).
 * 라이트 그라데이션 + 라이브 배지 + 좌정렬 카피. 검색은 피드/헤더 동선이 담당.
 */
export function CompactHero() {
  return (
    <section
      style={{
        background: 'linear-gradient(180deg, #FFFFFF 0%, #F6F8FC 100%)',
        borderBottom: '1px solid var(--border-light)',
        paddingTop: '64px',
      }}
    >
      <div
        className="mx-auto"
        style={{
          maxWidth: '1280px',
          padding: 'clamp(24px, 4vw, 36px) var(--page-padding) 22px',
        }}
      >
        <div
          className="inline-flex items-center gap-2 rounded-full"
          style={{
            backgroundColor: 'var(--accent-bg)',
            color: 'var(--accent)',
            fontWeight: 700,
            fontSize: '12px',
            padding: '5px 11px',
            marginBottom: '14px',
          }}
        >
          <span className="relative flex">
            <span className="w-[7px] h-[7px] rounded-full" style={{ backgroundColor: 'var(--accent)' }} />
            <span
              className="absolute inset-0 w-[7px] h-[7px] rounded-full animate-ping"
              style={{ backgroundColor: 'var(--accent)', opacity: 0.5 }}
            />
          </span>
          실거래 데이터 실시간 반영 중
        </div>

        <h1
          style={{
            margin: '0 0 8px',
            fontSize: 'clamp(26px, 4vw, 34px)',
            lineHeight: 1.2,
            fontWeight: 800,
            color: 'var(--text-strong)',
            letterSpacing: '-0.8px',
          }}
        >
          부동산의 모든 답을, 한 곳에 압축
        </h1>
        <p style={{ margin: 0, fontSize: '15px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          국토교통부·한국부동산원 공식 데이터를 가공 없이. 지역을 고르면 최근 실거래가 카드로 흐릅니다.
        </p>
      </div>
    </section>
  );
}
