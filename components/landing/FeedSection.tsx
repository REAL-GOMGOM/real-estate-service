'use client';

import { useState, type ReactNode } from 'react';
import { FilterRail } from './FilterRail';
import { DealFeed } from './DealFeed';

/**
 * 메인 3컬럼 피드 섹션 — 사이클 W.
 * 좌측 레일(지역 칩)과 중앙 피드가 지역 상태를 공유한다.
 * 우측 레일은 서버 컴포넌트 그대로 children 으로 통과 (RSC 유지).
 */

const DEFAULT_DISTRICT = '강남구';

interface FeedSectionProps {
  rightRail: ReactNode;
}

export function FeedSection({ rightRail }: FeedSectionProps) {
  const [district, setDistrict] = useState(DEFAULT_DISTRICT);

  return (
    <section
      className="mx-auto grid grid-cols-1 lg:grid-cols-[236px_minmax(0,1fr)_268px] gap-5"
      style={{
        maxWidth: '1280px',
        padding: '24px var(--page-padding) 32px',
      }}
    >
      <FilterRail active={district} onPick={setDistrict} />
      <DealFeed district={district} />
      {rightRail}
    </section>
  );
}
