'use client';

import { Children, useState } from 'react';

/**
 * 단지 페이지 매매/전월세 탭 — 전월세 v2.
 *
 * children[0] = 매매, children[1] = 전월세. 두 패널 모두 서버에서 렌더돼
 * 초기 HTML에 포함되고(SEO 안전), display 토글로 전환한다.
 * 전월세 데이터가 없으면 전월세 탭은 비활성.
 */

const TAB_LABELS = ['매매', '전월세'];

export default function AptDealTabs({
  children,
  hasRent,
}: {
  children: React.ReactNode;
  hasRent: boolean;
}) {
  const [active, setActive] = useState(0);
  const panels = Children.toArray(children);

  return (
    <>
      <div style={{ borderBottom: '1px solid var(--border)', marginBottom: '20px', display: 'flex' }}>
        {TAB_LABELS.map((label, i) => {
          const disabled = i === 1 && !hasRent;
          return (
            <button
              key={label}
              onClick={() => { if (!disabled) setActive(i); }}
              disabled={disabled}
              style={{
                padding: '12px 4px', marginRight: '24px', fontSize: '15px', fontWeight: 700,
                color: active === i ? 'var(--text-primary)' : 'var(--text-dim)',
                background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer',
                borderBottom: active === i ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: '-1px', opacity: disabled ? 0.4 : 1,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      {panels.map((panel, i) => (
        <div key={i} style={{ display: active === i ? 'block' : 'none' }}>
          {panel}
        </div>
      ))}
    </>
  );
}
