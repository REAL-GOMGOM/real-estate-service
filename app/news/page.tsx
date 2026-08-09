'use client';

import { useCallback, useEffect, useState } from 'react';
import Header from '@/components/layout/Header';
import { ExternalLink, RefreshCw, Building2, Landmark } from 'lucide-react';
import type { NewsItem } from '@/app/api/news/route';

interface NewsApiResponse {
  status?: 'ok' | 'unavailable';
  news?: unknown[];
  fetchedAt?: string;
  error?: string;
}

const CATEGORY_CONFIG = {
  realestate: { label: '부동산 시장', color: 'var(--accent)', bg: 'var(--accent-bg)' },
  general: { label: '정책·금융', color: '#A855F7', bg: 'rgba(168,85,247,0.12)' },
};

const FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'realestate', label: '부동산 시장' },
  { key: 'general', label: '정책·금융' },
] as const;

function formatFetchedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ko-KR', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function isNewsItem(value: unknown): value is NewsItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<NewsItem>;
  return typeof item.title === 'string'
    && typeof item.link === 'string'
    && typeof item.pubDate === 'string'
    && typeof item.pubDateFormatted === 'string'
    && typeof item.source === 'string'
    && (item.category === 'realestate' || item.category === 'general')
    && (item.thumbnail === null || typeof item.thumbnail === 'string');
}

export default function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'realestate' | 'general'>('all');
  const [lastFetched, setLastFetched] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/news', { signal });
      const json = await response.json().catch(() => null) as NewsApiResponse | null;
      if (!response.ok || json?.status !== 'ok' || !Array.isArray(json.news)) {
        throw new Error(json?.error || '뉴스 응답을 확인할 수 없습니다.');
      }

      setNews(json.news.filter(isNewsItem));
      setLastFetched(json.fetchedAt ?? '');
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
      setError(loadError instanceof Error
        ? loadError.message
        : '뉴스를 불러오지 못했습니다.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const filtered = filter === 'all' ? news : news.filter((item) => item.category === filter);
  const initialLoading = loading && news.length === 0;
  const lastFetchedLabel = formatFetchedAt(lastFetched);

  return (
    <>
      <Header />
      <main style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', paddingTop: '64px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ maxWidth: '670px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>부동산 뉴스</h1>
                <span style={{
                  fontSize: '10px', fontWeight: 700, color: 'var(--text-dim)',
                  padding: '3px 7px', borderRadius: '999px',
                  backgroundColor: 'var(--border-light)', border: '1px solid var(--border)',
                }}>
                  자동 수집
                </span>
              </div>
              <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.55, margin: 0 }}>
                네이버 뉴스 검색 API에서 부동산·주거 관련 키워드로 자동 수집하고,
                제목 기준으로 관련성과 유사 기사를 정리합니다.
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.5, margin: '5px 0 0' }}>
                편집자가 각 기사의 정확성을 개별 검증하거나 추천한 목록은 아닙니다.
                {lastFetchedLabel && ` · 수집 시각 ${lastFetchedLabel}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              aria-label="뉴스 다시 불러오기"
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 14px', borderRadius: '10px',
                backgroundColor: 'var(--border-light)',
                border: '1px solid var(--border)',
                color: 'var(--text-muted)', fontSize: '13px', cursor: loading ? 'default' : 'pointer',
                opacity: loading ? 0.55 : 1,
              }}
            >
              <RefreshCw size={13} aria-hidden="true" style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              {loading ? '확인 중' : '다시 불러오기'}
            </button>
          </div>

          <div style={{
            padding: '11px 14px', borderRadius: '10px', marginBottom: '20px',
            backgroundColor: 'var(--border-light)', border: '1px solid var(--border)',
            color: 'var(--text-dim)', fontSize: '12px', lineHeight: 1.55,
          }}>
            제목·출처·게시 시각은 제공사 데이터 기준입니다. 기사를 선택하면 해당 언론사 원문이 새 창으로 열립니다.
          </div>

          <div role="group" aria-label="뉴스 분류" style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
            {FILTERS.map((item) => {
              const active = filter === item.key;
              const count = item.key === 'all'
                ? news.length
                : news.filter((newsItem) => newsItem.category === item.key).length;
              return (
                <button
                  type="button"
                  key={item.key}
                  onClick={() => setFilter(item.key)}
                  aria-pressed={active}
                  style={{
                    padding: '7px 16px', borderRadius: '999px', fontSize: '13px', fontWeight: 600,
                    cursor: 'pointer', border: 'none',
                    backgroundColor: active ? 'var(--accent)' : 'var(--border-light)',
                    color: active ? '#fff' : 'var(--text-dim)',
                  }}
                >
                  {item.label}
                  <span style={{ marginLeft: '6px', fontSize: '11px', opacity: 0.8 }}>{count}</span>
                </button>
              );
            })}
          </div>

          {error && (
            <div role="alert" style={{
              marginBottom: '16px', padding: '14px 16px', borderRadius: '12px',
              color: '#B42318', backgroundColor: 'rgba(240,68,56,0.08)',
              border: '1px solid rgba(240,68,56,0.22)', fontSize: '13px', lineHeight: 1.5,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap',
            }}>
              <span>{news.length > 0 ? `기존 목록을 표시합니다. ${error}` : error}</span>
              <button
                type="button"
                onClick={() => void load()}
                style={{
                  border: '1px solid rgba(180,35,24,0.3)', borderRadius: '8px',
                  background: 'transparent', color: '#B42318', padding: '6px 10px',
                  fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                }}
              >
                다시 시도
              </button>
            </div>
          )}

          {initialLoading ? (
            <div role="status" aria-live="polite" style={{ padding: '80px 0', textAlign: 'center', color: 'var(--text-dim)', fontSize: '14px' }}>
              뉴스를 불러오는 중입니다…
            </div>
          ) : !error && filtered.length === 0 ? (
            <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--text-dim)', fontSize: '14px' }}>
              현재 조건에 맞는 새 뉴스가 없습니다.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filtered.map((item) => {
                const category = CATEGORY_CONFIG[item.category];
                return (
                  <a
                    key={`${item.link}-${item.title}`}
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${item.title} - ${item.source} 원문 새 창에서 열기`}
                    style={{
                      display: 'block', textDecoration: 'none',
                      padding: '16px 18px', borderRadius: '14px',
                      backgroundColor: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={(event) => { event.currentTarget.style.borderColor = 'var(--border-hover)'; }}
                    onMouseLeave={(event) => { event.currentTarget.style.borderColor = 'var(--border)'; }}
                    onFocus={(event) => { event.currentTarget.style.borderColor = 'var(--accent)'; }}
                    onBlur={(event) => { event.currentTarget.style.borderColor = 'var(--border)'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      {item.thumbnail ? (
                        // 뉴스 이미지는 임의의 외부 도메인이므로 next/image 허용 목록을 사전 구성할 수 없다.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.thumbnail}
                          alt=""
                          loading="lazy"
                          style={{
                            width: 72, height: 72, borderRadius: 8, flexShrink: 0,
                            objectFit: 'cover', backgroundColor: 'var(--border-light)',
                          }}
                          onError={(event) => { event.currentTarget.style.display = 'none'; }}
                        />
                      ) : (
                        <div style={{
                          width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
                          backgroundColor: category.bg,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          marginTop: '2px',
                        }}>
                          {item.category === 'realestate'
                            ? <Building2 size={15} color={category.color} aria-hidden="true" />
                            : <Landmark size={15} color={category.color} aria-hidden="true" />}
                        </div>
                      )}

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)',
                          lineHeight: 1.5, margin: '0 0 8px',
                          overflow: 'hidden', display: '-webkit-box',
                          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        }}>
                          {item.title}
                        </p>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: '11px', fontWeight: 600, padding: '2px 8px',
                            borderRadius: '999px', backgroundColor: category.bg, color: category.color,
                          }}>
                            {category.label}
                          </span>
                          <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>출처 {item.source}</span>
                          <span aria-hidden="true" style={{ fontSize: '12px', color: 'var(--text-dim)' }}>·</span>
                          <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{item.pubDateFormatted}</span>
                          <ExternalLink size={11} aria-hidden="true" style={{ color: 'var(--text-dim)', marginLeft: 'auto', flexShrink: 0 }} />
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
