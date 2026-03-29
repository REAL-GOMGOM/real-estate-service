'use client';

import { useEffect } from 'react';
import { X, Calendar, Home, Users, TrendingUp, MapPin, ExternalLink } from 'lucide-react';
import type { SubscriptionItem } from '@/lib/types';
import dayjs from 'dayjs';

interface Props {
  item: SubscriptionItem;
  onClose: () => void;
}

const STATUS_CONFIG = {
  upcoming: { label: '청약 예정', color: 'var(--accent)', bg: 'var(--accent-bg)' },
  ongoing:  { label: '청약 중',   color: '#22C55E', bg: 'rgba(34,197,94,0.12)'  },
  closed:   { label: '청약 마감', color: 'var(--text-dim)', bg: 'rgba(100,116,139,0.12)'},
};

function formatPrice(manwon: number | null): string {
  if (!manwon) return '미정';
  if (manwon >= 10000) return `${(manwon / 10000).toFixed(1)}억`;
  return `${manwon.toLocaleString()}만`;
}

// 주택형 문자열에서 숫자 추출 후 평 단위로 변환
// 예: "084.97A" → 25.7평, "59㎡" → 17.8평
function toPyeong(houseType: string): string | null {
  const match = houseType.match(/(\d+\.?\d*)/);
  if (!match) return null;
  const m2 = parseFloat(match[1]);
  if (!m2 || m2 < 10) return null; // 10㎡ 미만은 면적이 아닐 가능성
  return `${(m2 / 3.3058).toFixed(1)}평`;
}

function getDday(endDate: string, status: string): string | null {
  if (status === 'closed') return null;
  const diff = dayjs(endDate).diff(dayjs(), 'day');
  if (diff < 0) return null;
  if (diff === 0) return 'D-day';
  return `D-${diff}`;
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '14px 0', borderBottom: '1px solid var(--border-light)' }}>
      <div style={{ flexShrink: 0, marginTop: '2px', color: 'var(--text-dim)' }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '4px' }}>{label}</p>
        <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{children}</div>
      </div>
    </div>
  );
}

export default function SubscriptionDetailModal({ item, onClose }: Props) {
  const sc   = STATUS_CONFIG[item.status];
  const dday = getDday(item.endDate, item.status);

  // ESC 키로 닫기
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // 스크롤 잠금
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <>
      {/* 배경 오버레이 */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
          zIndex: 50,
        }}
      />

      {/* 모달 패널 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
        style={{
          position: 'fixed',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(520px, calc(100vw - 32px))',
          maxHeight: 'calc(100vh - 64px)',
          overflowY: 'auto',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '20px',
          zIndex: 51,
          padding: '28px',
        }}
      >
        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ padding: '5px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, backgroundColor: sc.bg, color: sc.color }}>
              {sc.label}
            </span>
            {dday && (
              <span style={{ fontSize: '13px', fontWeight: 800, fontFamily: 'Roboto Mono, monospace', color: item.status === 'ongoing' ? '#22C55E' : 'var(--accent)' }}>
                {dday}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '4px', flexShrink: 0 }}
          >
            <X size={20} />
          </button>
        </div>

        {/* 단지명 */}
        <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px', lineHeight: 1.3 }}>
          {item.name}
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '24px' }}>{item.district}</p>

        {/* 상세 정보 rows */}
        <div>
          <Row icon={<MapPin size={15} />} label="공급 위치">
            {item.address || '—'}
          </Row>

          <Row icon={<Calendar size={15} />} label="청약 접수 기간">
            {item.startDate && item.endDate
              ? `${item.startDate} ~ ${item.endDate}`
              : '—'}
          </Row>

          {item.announceDate && (
            <Row icon={<Calendar size={15} />} label="당첨자 발표일">
              {item.announceDate}
            </Row>
          )}

          <Row icon={<Home size={15} />} label="공급 세대 / 주택형">
            <span>
              {item.totalUnits > 0 ? `${item.totalUnits.toLocaleString()}세대` : '—'}
              {item.houseType ? ` · ${item.houseType}` : ''}
            </span>
          </Row>

          <Row icon={<TrendingUp size={15} />} label="분양가">
            {item.minPrice || item.maxPrice ? (
              <span style={{ fontFamily: 'Roboto Mono, monospace', fontWeight: 700, color: '#F59E0B' }}>
                {formatPrice(item.minPrice)} ~ {formatPrice(item.maxPrice)}
              </span>
            ) : (
              <span style={{ color: 'var(--text-dim)' }}>미정</span>
            )}
          </Row>

          <Row icon={<Users size={15} />} label="평형별 경쟁률">
            {item.competitionRates.length > 0 ? (
              <div style={{ marginTop: '4px' }}>
                {/* 헤더 */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 80px 80px',
                  gap: '8px',
                  padding: '6px 10px',
                  borderRadius: '8px 8px 0 0',
                  backgroundColor: 'var(--border-light)',
                  fontSize: '11px',
                  color: 'var(--text-dim)',
                  fontWeight: 600,
                }}>
                  <span>주택형</span>
                  <span style={{ textAlign: 'right' }}>경쟁률</span>
                  <span style={{ textAlign: 'right' }}>접수건수</span>
                </div>
                {/* 행 */}
                {item.competitionRates.map((entry, i) => {
                  const pyeong = toPyeong(entry.houseType);
                  return <div
                    key={i}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 80px 80px',
                      gap: '8px',
                      padding: '8px 10px',
                      borderBottom: i < item.competitionRates.length - 1
                        ? '1px solid var(--border-light)'
                        : 'none',
                      backgroundColor: i % 2 === 0 ? 'transparent' : 'var(--bg-overlay)',
                      fontSize: '13px',
                    }}
                  >
                    <span style={{ color: 'var(--text-secondary)', fontFamily: 'Roboto Mono, monospace' }}>
                      {entry.houseType}
                      {pyeong && (
                        <span style={{ color: 'var(--text-dim)', fontSize: '11px', marginLeft: '5px' }}>
                          ({pyeong})
                        </span>
                      )}
                    </span>
                    <span style={{
                      textAlign: 'right',
                      fontWeight: 700,
                      fontFamily: 'Roboto Mono, monospace',
                      color: entry.rate >= 10 ? '#22C55E' : entry.rate >= 1 ? '#F59E0B' : 'var(--text-dim)',
                    }}>
                      {entry.rate.toFixed(1)}:1
                    </span>
                    <span style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: '12px' }}>
                      {entry.reqCount !== null ? entry.reqCount.toLocaleString() : '—'}
                    </span>
                  </div>;
                })}
              </div>
            ) : (
              <span style={{ color: 'var(--text-dim)' }}>미발표</span>
            )}
          </Row>
        </div>

        {/* 청약홈 바로가기 */}
        <a
          href="https://www.applyhome.co.kr"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            marginTop: '24px', padding: '14px',
            borderRadius: '12px', border: '1px solid var(--accent-border)',
            backgroundColor: 'var(--accent-bg)',
            color: 'var(--accent)', fontSize: '14px', fontWeight: 600,
            textDecoration: 'none',
            transition: 'background 0.15s',
          }}
        >
          청약홈에서 신청하기 <ExternalLink size={14} />
        </a>
      </div>
    </>
  );
}
