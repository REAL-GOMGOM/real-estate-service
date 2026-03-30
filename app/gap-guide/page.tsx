'use client';

import { useState } from 'react';
import Header from '@/components/layout/Header';
import Link from 'next/link';
import { Calculator, AlertTriangle, CheckCircle, ArrowRight, TrendingUp } from 'lucide-react';
import SubPageHeader from '@/components/common/SubPageHeader';

function fmtPrice(manwon: number): string {
  if (manwon >= 10000) return `${(manwon / 10000).toFixed(1)}억`;
  return `${manwon.toLocaleString()}만`;
}

export default function GapGuidePage() {
  const [salePrice, setSalePrice] = useState(50000); // 만원
  const [rentPrice, setRentPrice] = useState(40000);

  const gap = salePrice - rentPrice;
  const rentRatio = salePrice > 0 ? +((rentPrice / salePrice) * 100).toFixed(1) : 0;

  const simulations = [5000, 10000, 15000, 20000, 30000].map((rise) => ({
    rise,
    newPrice: salePrice + rise,
    roi: gap > 0 ? +((rise / gap) * 100).toFixed(0) : 0,
  }));

  return (
    <>
      <Header />
      <main style={{ paddingTop: '64px', backgroundColor: 'var(--bg-primary)', minHeight: '100vh' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '32px 20px' }}>
          <SubPageHeader parentLabel="갭분석" parentHref="/gap-analysis" />

          <h1 style={{ fontSize: 'clamp(24px, 4vw, 32px)', fontWeight: 800, color: 'var(--text-strong)', marginBottom: '8px' }}>
            갭투자 가이드
          </h1>
          <p style={{ fontSize: '15px', color: 'var(--text-muted)', marginBottom: '32px', lineHeight: '1.7' }}>
            매매가와 전세가의 차이(갭)만큼만 자기 자본을 투자하여 부동산을 매수하는 전략입니다.
          </p>

          {/* 시뮬레이터 */}
          <div style={{ padding: '24px', borderRadius: '16px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', marginBottom: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              <Calculator size={20} style={{ color: 'var(--accent)' }} />
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-strong)' }}>투자금 시뮬레이터</h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>매매가</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="range" min={10000} max={200000} step={1000} value={salePrice}
                    onChange={(e) => setSalePrice(Number(e.target.value))}
                    style={{ flex: 1, accentColor: 'var(--accent)' }} />
                  <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'Roboto Mono, monospace', minWidth: '60px' }}>
                    {fmtPrice(salePrice)}
                  </span>
                </div>
              </div>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>전세가</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="range" min={5000} max={salePrice} step={1000} value={Math.min(rentPrice, salePrice)}
                    onChange={(e) => setRentPrice(Number(e.target.value))}
                    style={{ flex: 1, accentColor: 'var(--success)' }} />
                  <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'Roboto Mono, monospace', minWidth: '60px' }}>
                    {fmtPrice(rentPrice)}
                  </span>
                </div>
              </div>
            </div>

            {/* 결과 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
              <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: 'var(--btn-bg)', textAlign: 'center' }}>
                <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '4px' }}>갭 (투자금)</p>
                <p style={{ fontSize: '24px', fontWeight: 800, color: '#D4A853', fontFamily: 'Roboto Mono, monospace' }}>{fmtPrice(gap)}</p>
              </div>
              <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: 'var(--btn-bg)', textAlign: 'center' }}>
                <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '4px' }}>전세가율</p>
                <p style={{ fontSize: '24px', fontWeight: 800, color: rentRatio >= 70 ? 'var(--success-text, #3D6B44)' : 'var(--danger-text, #B93E32)', fontFamily: 'Roboto Mono, monospace' }}>{rentRatio}%</p>
              </div>
              <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: rentRatio >= 70 ? 'var(--success-bg, #E8F0E9)' : 'var(--danger-bg, #FDE8E6)', textAlign: 'center' }}>
                <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '4px' }}>판정</p>
                <p style={{ fontSize: '18px', fontWeight: 800, color: rentRatio >= 70 ? 'var(--success-text, #3D6B44)' : 'var(--danger-text, #B93E32)' }}>
                  {rentRatio >= 80 ? '매우 적합' : rentRatio >= 70 ? '적합' : rentRatio >= 60 ? '주의' : '비추천'}
                </p>
              </div>
            </div>

            {/* 수익률 테이블 */}
            <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '8px 14px', backgroundColor: 'var(--btn-bg)' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-dim)' }}>매매가 상승</span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-dim)', textAlign: 'center' }}>매도 시세</span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-dim)', textAlign: 'right' }}>수익률</span>
              </div>
              {simulations.map((s) => (
                <div key={s.rise} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '10px 14px', borderTop: '1px solid var(--border-light)' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>+{fmtPrice(s.rise)}</span>
                  <span style={{ fontSize: '13px', color: 'var(--text-primary)', textAlign: 'center', fontFamily: 'Roboto Mono' }}>{fmtPrice(s.newPrice)}</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, textAlign: 'right', fontFamily: 'Roboto Mono', color: 'var(--up-color)' }}>+{s.roi}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* 체크포인트 */}
          <div style={{ padding: '24px', borderRadius: '16px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', marginBottom: '32px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-strong)', marginBottom: '16px' }}>
              <CheckCircle size={18} style={{ color: 'var(--success)', verticalAlign: 'middle', marginRight: '6px' }} />
              갭투자 체크포인트
            </h2>
            {[
              { item: '전세가율', desc: '70% 이상 권장' },
              { item: '입지', desc: '교통·학군·편의시설 상위' },
              { item: '인구 흐름', desc: '인구 순유입 지역 우선' },
              { item: '공급 물량', desc: '향후 2~3년 입주 물량 적은 곳' },
              { item: '전세 수요', desc: '안정적 전세 수요 존재 여부' },
              { item: '보유 기간', desc: '최소 2년 이상 보유 계획' },
              { item: '자금 여력', desc: '역전세 대비 여유 자금 확보' },
            ].map((c) => (
              <div key={c.item} style={{ display: 'flex', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--border-light)' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', minWidth: '80px' }}>{c.item}</span>
                <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>{c.desc}</span>
              </div>
            ))}
          </div>

          {/* 리스크 */}
          <div style={{ padding: '24px', borderRadius: '16px', backgroundColor: 'var(--danger-bg, #FDE8E6)', border: '1px solid var(--danger-text, #B93E32)30', marginBottom: '32px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--danger-text, #B93E32)', marginBottom: '16px' }}>
              <AlertTriangle size={18} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
              갭투자 리스크
            </h2>
            {[
              { risk: '역전세', desc: '전세가 하락 시 보증금 반환 자금 부족' },
              { risk: '매매가 하락', desc: '매매가가 전세가 아래로 → 깡통전세' },
              { risk: '금리 변동', desc: '금리 상승 → 전세 수요 감소 → 전세가 하락' },
              { risk: '세금', desc: '다주택자 취득세·양도세 중과로 실질 수익 감소' },
            ].map((r) => (
              <div key={r.risk} style={{ display: 'flex', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--danger-text, #B93E32)15' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--danger-text, #B93E32)', minWidth: '80px' }}>{r.risk}</span>
                <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>{r.desc}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <Link href="/gap-analysis" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            padding: '16px', borderRadius: '14px', fontSize: '16px', fontWeight: 700,
            backgroundColor: 'var(--accent)', color: '#FFFFFF', textDecoration: 'none',
            marginBottom: '20px',
          }}>
            <TrendingUp size={20} />
            실제 단지 갭 분석하기
            <ArrowRight size={18} />
          </Link>

          <p style={{ fontSize: '12px', color: 'var(--text-dim)', textAlign: 'center', lineHeight: '1.6' }}>
            본 자료는 갭투자의 개념 이해를 위한 참고 자료이며,<br />
            투자 판단은 본인의 재정 상황과 시장 분석에 바탕으로 신중하게 이루어져야 합니다.
          </p>
        </div>
      </main>
    </>
  );
}
