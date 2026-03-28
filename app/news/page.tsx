'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/layout/Header';
import { ExternalLink, RefreshCw, Building2, Globe } from 'lucide-react';
import type { NewsItem } from '@/app/api/news/route';

type NewsWithMeta = NewsItem & { pubDateFormatted: string; pubDateTs: number };

const CATEGORY_CONFIG = {
  realestate: { label: '부동산', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  general:    { label: '이슈',   color: '#A855F7', bg: 'rgba(168,85,247,0.12)'  },
};

const FILTERS = [
  { key: 'all',        label: '전체' },
  { key: 'realestate', label: '부동산' },
  { key: 'general',    label: '이슈' },
] as const;

export default function NewsPage() {
  const [news, setNews]       = useState<NewsWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<'all' | 'realestate' | 'general'>('all');
  const [lastFetched, setLastFetched] = useState('');

  async function load() {
    setLoading(true);
    try {
      const res  = await fetch('/api/news');
      const json = await res.json();
      setNews(json.news ?? []);
      setLastFetched(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = filter === 'all' ? news : news.filter((n) => n.category === filter);

  return (
    <>
      <Header />
      <main style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', paddingTop: '64px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 20px' }}>

          {/* 헤더 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>뉴스</h1>
              {lastFetched && (
                <p style={{ fontSize: '12px', color: 'var(--text-dim)' }}>마지막 업데이트 {lastFetched}</p>
              )}
            </div>
            <button
              onClick={load}
              disabled={loading}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 14px', borderRadius: '10px',
                backgroundColor: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer',
                opacity: loading ? 0.5 : 1,
              }}
            >
              <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              새로고침
            </button>
          </div>

          {/* 필터 탭 */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  style={{
                    padding: '7px 16px', borderRadius: '999px', fontSize: '13px', fontWeight: 600,
                    cursor: 'pointer', border: 'none',
                    backgroundColor: active ? '#3B82F6' : 'rgba(255,255,255,0.06)',
                    color: active ? '#fff' : 'var(--text-dim)',
                  }}
                >
                  {f.label}
                  {f.key !== 'all' && (
                    <span style={{ marginLeft: '6px', fontSize: '11px', opacity: 0.8 }}>
                      {news.filter((n) => n.category === f.key).length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 뉴스 목록 */}
          {loading ? (
            <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--text-dim)', fontSize: '14px' }}>
              뉴스를 불러오는 중...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--text-dim)', fontSize: '14px' }}>
              뉴스가 없습니다.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filtered.map((item, i) => {
                const cc = CATEGORY_CONFIG[item.category];
                return (
                  <a
                    key={i}
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'block', textDecoration: 'none',
                      padding: '16px 18px', borderRadius: '14px',
                      backgroundColor: 'var(--bg-card)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      {/* 카테고리 아이콘 */}
                      <div style={{
                        width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
                        backgroundColor: cc.bg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        marginTop: '2px',
                      }}>
                        {item.category === 'realestate'
                          ? <Building2 size={15} color={cc.color} />
                          : <Globe     size={15} color={cc.color} />
                        }
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* 제목 */}
                        <p style={{
                          fontSize: '14px', fontWeight: 600, color: '#E2E8F0',
                          lineHeight: 1.5, marginBottom: '8px',
                          overflow: 'hidden', display: '-webkit-box',
                          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        }}>
                          {item.title}
                        </p>

                        {/* 하단 메타 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: '11px', fontWeight: 600, padding: '2px 8px',
                            borderRadius: '999px', backgroundColor: cc.bg, color: cc.color,
                          }}>
                            {cc.label}
                          </span>
                          <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{item.source}</span>
                          <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>·</span>
                          <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{item.pubDateFormatted}</span>
                          <ExternalLink size={11} style={{ color: 'var(--text-dim)', marginLeft: 'auto', flexShrink: 0 }} />
                        </div>
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
