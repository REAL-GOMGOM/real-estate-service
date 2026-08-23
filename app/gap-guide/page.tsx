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

  const effectiveRentPrice = Math.min(rentPrice, salePrice);
  const gap = salePrice - effectiveRentPrice;
  const rentRatio = salePrice > 0 ? +((effectiveRentPrice / salePrice) * 100).toFixed(1) : 0;

  const simulations = [5000, 10000, 15000, 20000, 30000].map((rise) => ({
    rise,
    newPrice: salePrice + rise,
    simpleMultiple: gap > 0 ? +((rise / gap) * 100).toFixed(0) : null,
  }));

  return (
    <>
      <Header />
      <main style={{ paddingTop: '64px', backgroundColor: 'var(--bg-primary)', minHeight: '100vh' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '32px 20px' }}>
          <SubPageHeader parentLabel="갭분석" parentHref="/gap-analysis" />

          <h1 style={{ fontSize: 'clamp(24px, 4vw, 32px)', fontWeight: 800, color: 'var(--text-strong)', marginBottom: '8px' }}>
            매매·전세 갭 구조 가이드
          </h1>
          <p style={{ fontSize: '15px', color: 'var(--text-muted)', marginBottom: '32px', lineHeight: '1.7' }}>
            매매가와 전세 보증금의 단순 차이를 계산하고, 이 값만으로 판단할 수 없는 비용과 위험을 함께 확인합니다.
          </p>

          {/* 시뮬레이터 */}
          <div style={{ padding: '24px', borderRadius: '16px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', marginBottom: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              <Calculator size={20} style={{ color: 'var(--accent)' }} />
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-strong)' }}>단순 갭 계산기</h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              <div>
                <label htmlFor="gap-sale-price" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>매매가</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input id="gap-sale-price" type="range" min={10000} max={200000} step={1000} value={salePrice}
                    aria-valuetext={fmtPrice(salePrice)}
                    onChange={(e) => {
                      const nextSalePrice = Number(e.target.value);
                      setSalePrice(nextSalePrice);
                      setRentPrice((current) => Math.min(current, nextSalePrice));
                    }}
                    style={{ flex: 1, accentColor: 'var(--accent)' }} />
                  <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'Roboto Mono, monospace', minWidth: '60px' }}>
                    {fmtPrice(salePrice)}
                  </span>
                </div>
              </div>
              <div>
                <label htmlFor="gap-rent-price" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>전세가</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input id="gap-rent-price" type="range" min={5000} max={salePrice} step={1000} value={effectiveRentPrice}
                    aria-valuetext={fmtPrice(effectiveRentPrice)}
                    onChange={(e) => setRentPrice(Number(e.target.value))}
                    style={{ flex: 1, accentColor: 'var(--success)' }} />
                  <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'Roboto Mono, monospace', minWidth: '60px' }}>
                    {fmtPrice(effectiveRentPrice)}
                  </span>
                </div>
              </div>
            </div>

            {/* 결과 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
              <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: 'var(--btn-bg)', textAlign: 'center' }}>
                <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '4px' }}>매매−전세 단순 차이</p>
                <p style={{ fontSize: '24px', fontWeight: 800, color: '#EBC15C', fontFamily: 'Roboto Mono, monospace' }}>{fmtPrice(gap)}</p>
              </div>
              <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: 'var(--btn-bg)', textAlign: 'center' }}>
                <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '4px' }}>전세가율</p>
                <p style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-strong)', fontFamily: 'Roboto Mono, monospace' }}>{rentRatio}%</p>
              </div>
              <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: 'var(--warning-bg, #FBF3DC)', textAlign: 'center' }}>
                <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '4px' }}>해석</p>
                <p style={{ fontSize: '15px', fontWeight: 800, color: 'var(--warning-text, #8A6A1F)' }}>
                  적합성 판정 아님
                </p>
              </div>
            </div>

            {/* 단순 민감도 테이블 */}
            <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '8px 14px', backgroundColor: 'var(--btn-bg)' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-dim)' }}>매매가 상승</span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-dim)', textAlign: 'center' }}>매도 시세</span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-dim)', textAlign: 'right' }}>상승액÷현재 차이</span>
              </div>
              {simulations.map((s) => (
                <div key={s.rise} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '10px 14px', borderTop: '1px solid var(--border-light)' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>+{fmtPrice(s.rise)}</span>
                  <span style={{ fontSize: '13px', color: 'var(--text-primary)', textAlign: 'center', fontFamily: 'Roboto Mono' }}>{fmtPrice(s.newPrice)}</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, textAlign: 'right', fontFamily: 'Roboto Mono', color: 'var(--text-primary)' }}>
                    {s.simpleMultiple === null ? '계산 불가' : `${s.simpleMultiple}%`}
                  </span>
                </div>
              ))}
            </div>
            <p style={{ margin: '10px 0 0', fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.6 }}>
              위 비율은 세금·중개보수·대출이자·보유비용·보증금 반환을 반영하지 않은 단순 민감도이며 실제 수익률이 아닙니다.
            </p>
          </div>

          {/* 체크포인트 */}
          <div style={{ padding: '24px', borderRadius: '16px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', marginBottom: '32px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-strong)', marginBottom: '16px' }}>
              <CheckCircle size={18} style={{ color: 'var(--success)', verticalAlign: 'middle', marginRight: '6px' }} />
              갭투자 체크포인트
            </h2>
            {[
              { item: '전세가율', desc: '높고 낮음만으로 안전성·적합성을 판단할 수 없음' },
              { item: '입지', desc: '교통·학군·편의시설의 실제 접근성과 변화 확인' },
              { item: '인구 흐름', desc: '전입·전출과 가구 수 추이를 원자료로 확인' },
              { item: '공급 물량', desc: '예정 물량의 시점·취소·지연 가능성 확인' },
              { item: '전세 수요', desc: '최근 계약량·보증금 추이와 공실 위험 확인' },
              { item: '보유 기간', desc: '현금흐름과 매도 제한·세제를 함께 검토' },
              { item: '자금 여력', desc: '역전세 대비 여유 자금 확보' },
            ].map((c) => (
              <div key={c.item} style={{ display: 'flex', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--border-light)' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', minWidth: '80px' }}>{c.item}</span>
                <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>{c.desc}</span>
              </div>
            ))}
          </div>

          {/* 리스크 */}
          <div style={{ padding: '24px', borderRadius: '16px', backgroundColor: 'var(--danger-bg, #FDECEC)', border: '1px solid var(--danger-text, #C92F2F)30', marginBottom: '32px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--danger-text, #C92F2F)', marginBottom: '16px' }}>
              <AlertTriangle size={18} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
              갭투자 리스크
            </h2>
            {[
              { risk: '역전세', desc: '전세가 하락 시 보증금 반환 자금 부족' },
              { risk: '매매가 하락', desc: '매매가가 전세가 아래로 → 깡통전세' },
              { risk: '금리 변동', desc: '금리 상승 → 전세 수요 감소 → 전세가 하락' },
              { risk: '세금', desc: '다주택자 취득세·양도세 중과로 실질 수익 감소' },
            ].map((r) => (
              <div key={r.risk} style={{ display: 'flex', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--danger-text, #C92F2F)15' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--danger-text, #C92F2F)', minWidth: '80px' }}>{r.risk}</span>
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
