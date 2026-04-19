/**
 * OG Image Template — Phase 5c-7 Stage 3
 *
 * Vercel OG (ImageResponse)에서 PNG로 변환되는 JSX.
 * 1200x630, Pretendard, BRAND 팔레트. inline style만 사용.
 */

import type { RegionDetail } from '@/lib/types';

const COLORS = {
  bg: '#FAFAFA',
  accent: '#C4654A',
  ink: '#2A2420',
  inkSoft: '#5C524B',
  paper: '#F4EDE5',
  line: '#E8DED2',
} as const;

function getLevelLabel(score: number): string {
  if (score < 2.0) return '최상급지';
  if (score < 2.5) return '상급지';
  if (score < 3.0) return '중상급지';
  if (score < 3.5) return '중급지';
  return '중하급지';
}

interface Props {
  region: RegionDetail;
}

export function OgImageTemplate({ region }: Props) {
  const headline = region.insight.headline || `${region.name} 입지 분석`;
  const level = getLevelLabel(region.score);

  return (
    <div
      style={{
        width: '1200px',
        height: '630px',
        background: COLORS.bg,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Pretendard',
        padding: '80px',
        position: 'relative',
      }}
    >
      {/* 상단 테라코타 라인 */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '8px',
          background: COLORS.accent,
        }}
      />

      {/* 브랜드 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          marginBottom: '60px',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            background: COLORS.accent,
            borderRadius: '10px',
            display: 'flex',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
          <span style={{ fontSize: '28px', fontWeight: 700, color: COLORS.ink }}>
            내집
          </span>
          <span
            style={{
              fontSize: '18px',
              fontWeight: 400,
              color: COLORS.inkSoft,
              letterSpacing: '0.04em',
            }}
          >
            My.ZIP
          </span>
        </div>
      </div>

      {/* 지역명 */}
      <div
        style={{
          fontSize: '110px',
          fontWeight: 700,
          color: COLORS.ink,
          lineHeight: 1.05,
          marginBottom: '30px',
          display: 'flex',
        }}
      >
        {region.name}
      </div>

      {/* 해설 헤드라인 */}
      <div
        style={{
          fontSize: '42px',
          fontWeight: 500,
          color: COLORS.accent,
          fontStyle: 'italic',
          lineHeight: 1.3,
          marginBottom: '50px',
          display: 'flex',
          maxWidth: '1040px',
        }}
      >
        &ldquo;{headline}&rdquo;
      </div>

      {/* 하단 메타 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '24px',
          marginBottom: '24px',
        }}
      >
        <div
          style={{
            background: COLORS.paper,
            color: COLORS.accent,
            fontSize: '22px',
            fontWeight: 500,
            padding: '10px 22px',
            borderRadius: '10px',
            display: 'flex',
          }}
        >
          {level}
        </div>
        <span style={{ fontSize: '26px', fontWeight: 500, color: COLORS.inkSoft }}>
          {region.region}
        </span>
        <span style={{ fontSize: '22px', color: COLORS.line }}>·</span>
        <span style={{ fontSize: '22px', fontWeight: 400, color: COLORS.inkSoft }}>
          입지점수
        </span>
        <span style={{ fontSize: '36px', fontWeight: 700, color: COLORS.accent }}>
          {region.score.toFixed(2)}
        </span>
      </div>

      {/* URL */}
      <div
        style={{
          fontSize: '18px',
          fontWeight: 400,
          color: COLORS.inkSoft,
          marginTop: 'auto',
          display: 'flex',
        }}
      >
        www.naezipkorea.com/region/{region.id}
      </div>
    </div>
  );
}
