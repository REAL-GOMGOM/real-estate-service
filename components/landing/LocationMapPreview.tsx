'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { getScoreColor, getScoreBgColor } from '@/lib/score-utils';
import locationScoresData from '@/data/location-scores.json';
import type { LocationScore } from '@/lib/types';

const locationScores = locationScoresData as LocationScore[];

const REGIONS = [
  '전체', '서울', '경기', '인천',
  '1기신도시', '2기신도시', '3기신도시',
  '부산', '대구', '울산',
] as const;

function TrendIcon({ trend }: { trend: LocationScore['trend'] }) {
  if (trend === 'up') return <TrendingUp size={14} style={{ color: '#22C55E' }} />;
  if (trend === 'down') return <TrendingDown size={14} style={{ color: '#EF4444' }} />;
  return <Minus size={14} style={{ color: 'var(--text-dim)' }} />;
}

export default function LocationMapPreview() {
  const [selectedRegion, setSelectedRegion] = useState<string>('전체');
  const [updateMonth, setUpdateMonth] = useState('');
  useEffect(() => {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    setUpdateMonth(`${prev.getFullYear()}년 ${prev.getMonth() + 1}월`);
  }, []);

  const topLocations = useMemo(() => {
    return [...locationScores]
      .filter(l => {
        if (selectedRegion === '1기신도시' || selectedRegion === '2기신도시' || selectedRegion === '3기신도시') {
          return true;
        }
        return l.level === 'district';
      })
      .filter(l => selectedRegion === '전체' || l.region === selectedRegion)
      .sort((a, b) => a.score - b.score)
      .slice(0, 5);
  }, [selectedRegion]);

  return (
    <section style={{ padding: 'clamp(40px, 8vw, 96px) 0', backgroundColor: 'var(--bg-card)' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 'clamp(24px, 5vw, 64px)', alignItems: 'center' }}>

          {/* 왼쪽: 설명 */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 500, backgroundColor: 'rgba(34,197,94,0.12)', color: '#22C55E', marginBottom: '16px' }}>
              {updateMonth ? `${updateMonth} 업데이트` : '업데이트'}
            </span>
            <h2 style={{ fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '20px', lineHeight: 1.3 }}>
              전국 입지 점수 지도
            </h2>
            <p style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.9, marginBottom: '32px' }}>
              매월 업데이트되는 전국 주요 지역의 입지 점수를 지도 위에서 확인하세요.
              시세차익 가능성, 교통, 학군, 생활 인프라를 종합한 점수를 제공합니다.
            </p>
            <Link
              href="/location-map"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '14px 28px', borderRadius: '12px', fontSize: '15px', fontWeight: 600, backgroundColor: '#22C55E', color: 'white', textDecoration: 'none' }}
            >
              전체 지도 보기
              <ArrowRight size={16} />
            </Link>
          </motion.div>

          {/* 오른쪽: TOP 5 랭킹 */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>이달의 TOP 5 입지</span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>점수 기준</span>
            </div>

            {/* 권역 탭 */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
              {REGIONS.map((region) => (
                <button
                  key={region}
                  onClick={() => setSelectedRegion(region)}
                  style={{
                    padding: '5px 10px', borderRadius: '8px',
                    fontSize: '11px', fontWeight: 500, cursor: 'pointer', border: 'none',
                    backgroundColor: selectedRegion === region ? 'var(--accent)' : 'var(--border-light)',
                    color: selectedRegion === region ? 'white' : 'var(--text-muted)',
                    transition: 'background 0.15s', whiteSpace: 'nowrap',
                  }}
                >
                  {region}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {topLocations.map((location, index) => (
                <motion.div
                  key={location.id}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.2 + index * 0.08 }}
                  style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px', borderRadius: '14px', backgroundColor: 'var(--border-light)', border: '1px solid var(--border)' }}
                >
                  {/* 순위 */}
                  <span style={{ width: '28px', height: '28px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, flexShrink: 0, backgroundColor: index === 0 ? 'var(--accent-border)' : 'var(--border)', color: index === 0 ? 'var(--accent)' : 'var(--text-muted)' }}>
                    {index + 1}
                  </span>

                  {/* 지역 */}
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', marginRight: '8px' }}>{location.name}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{location.district}</span>
                  </div>

                  {/* 트렌드 + 점수 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                    <TrendIcon trend={location.trend} />
                    <span style={{ padding: '4px 12px', borderRadius: '8px', fontSize: '14px', fontWeight: 700, fontFamily: 'Roboto Mono, monospace', backgroundColor: getScoreBgColor(location.score), color: getScoreColor(location.score) }}>
                      {location.score.toFixed(1)}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* 점수 범례 */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border-light)' }}>
              {[
                { color: '#22C55E', label: '1.0~1.9 최우수' },
                { color: '#86EFAC', label: '2.0~2.9 우수' },
                { color: '#F59E0B', label: '3.0~3.9 보통' },
                { color: '#EF4444', label: '4.0 이상 일반' },
              ].map((item) => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: item.color, flexShrink: 0 }} />
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{item.label}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}