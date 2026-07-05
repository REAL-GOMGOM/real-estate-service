'use client';

import { useState } from 'react';
import {
  type AptGroup, fmtPrice, fmtContractDate, detectNewHigh, buildSparkPts,
} from '@/lib/tx-shared';
import { buildShareImage, shareOrDownloadImage } from '@/lib/share-image';

/**
 * 단지 페이지 하단 액션 — 사이클 DD.
 * 이미지 공유(브랜드 카드) + 링크 공유 + 네이버 지도. 모달 액션과 동일 UX.
 */

export default function AptShareActions({ group, pageUrl }: { group: AptGroup; pageUrl: string }) {
  const [imageSaving, setImageSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const sorted = [...group.transactions].sort((a, b) => b.date.localeCompare(a.date));
  const latest = sorted[0];

  const saveAsImage = async () => {
    if (!latest || imageSaving) return;
    setImageSaving(true);
    try {
      const prev = sorted.find((t) => t !== latest && Math.abs(t.area - latest.area) <= 6) ?? null;
      const delta = prev ? latest.price - prev.price : null;
      const spark = buildSparkPts(group);

      const blob = await buildShareImage({
        apt: group.name,
        location: `${group.district}${group.dong ? ' ' + group.dong : ''}`,
        price: fmtPrice(latest.price),
        delta: delta !== null && delta !== 0 ? `${delta > 0 ? '▲' : '▼'} ${fmtPrice(Math.abs(delta))}` : '',
        up: delta !== null ? delta >= 0 : true,
        meta: `${latest.area}㎡ · ${Math.round(latest.area / 3.3058)}평 · ${latest.floor}층 · ${fmtContractDate(latest.date)} 계약`,
        spark: spark?.pts ?? [],
        high: detectNewHigh(group),
      });
      if (blob) await shareOrDownloadImage(blob, `${group.name}-실거래.png`, group.name);
    } catch { /* 공유 취소 무시 */ }
    setImageSaving(false);
  };

  const shareLink = async () => {
    const text = `${group.name} 실거래가·시세${latest ? ` · 최근 ${fmtPrice(latest.price)}` : ''} · 내집 My.ZIP`;
    try {
      if (navigator.share) {
        await navigator.share({ title: group.name, text, url: pageUrl });
      } else {
        await navigator.clipboard.writeText(`${text}\n${pageUrl}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch { /* 공유 취소 무시 */ }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
      <a
        href={`https://map.naver.com/p/search/${encodeURIComponent(`${group.district} ${group.name}`)}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
          border: '1px solid #D3E8DA', backgroundColor: '#F3FBF6', color: '#1F8A5B',
          fontWeight: 700, fontSize: '12.5px', padding: '10px', borderRadius: '11px',
          textDecoration: 'none',
        }}
      >
        <span style={{
          width: '17px', height: '17px', borderRadius: '5px', backgroundColor: '#03C75A',
          color: '#FFFFFF', fontSize: '10.5px', fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          N
        </span>
        네이버 지도에서 위치·로드뷰 보기 ↗
      </a>
      <div style={{ display: 'flex', gap: '9px' }}>
        <button
          onClick={saveAsImage}
          disabled={imageSaving || !latest}
          style={{
            flex: 1, backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)',
            border: '1px solid var(--border)', fontWeight: 800, fontSize: '14px',
            padding: '14px', borderRadius: '12px',
            cursor: imageSaving ? 'wait' : 'pointer', fontFamily: 'inherit',
            opacity: imageSaving ? 0.6 : 1,
          }}
        >
          {imageSaving ? '생성 중…' : '🖼 이미지로 공유'}
        </button>
        <button
          onClick={shareLink}
          style={{
            flex: 1, border: 0, backgroundColor: 'var(--accent)', color: '#FFFFFF',
            fontWeight: 800, fontSize: '14px', padding: '14px', borderRadius: '12px',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {copied ? '✓ 링크 복사됨' : '↗ 공유하기'}
        </button>
      </div>
    </div>
  );
}
