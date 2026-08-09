'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

const BLUE = '#1B4DDB';
const INK = '#0B1524';
const INK2 = '#2B333F';
const MUTED = '#8A93A3';
const MUTED2 = '#98A1B0';

interface FeedItem {
  slug: string;
  title: string;
  publishedAt: string;
  categoryName: string | null;
}

type FeedState =
  | { status: 'loading'; items: [] }
  | { status: 'ok'; items: FeedItem[] }
  | { status: 'error'; items: [] };

function isFeedItem(value: unknown): value is FeedItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<FeedItem>;
  return typeof item.slug === 'string'
    && /^[a-z0-9-]{1,200}$/.test(item.slug)
    && typeof item.title === 'string'
    && typeof item.publishedAt === 'string'
    && (typeof item.categoryName === 'string' || item.categoryName === null);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return month && day ? `${month}.${day}` : '';
}

export default function HomeBlogFeed() {
  const [state, setState] = useState<FeedState>({ status: 'loading', items: [] });
  const [retryKey, setRetryKey] = useState(0);

  const retry = useCallback(() => {
    setState({ status: 'loading', items: [] });
    setRetryKey((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      try {
        const response = await fetch('/api/blog/feed', { signal: controller.signal });
        const json = await response.json() as { status?: unknown; data?: unknown };
        if (!response.ok || json.status !== 'ok' || !Array.isArray(json.data) || !json.data.every(isFeedItem)) {
          throw new Error('invalid blog feed response');
        }
        if (active) setState({ status: 'ok', items: json.data });
      } catch (error) {
        if (active && !(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error', items: [] });
        }
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [retryKey]);

  if (state.status === 'loading') {
    return (
      <div aria-busy="true" aria-label="칼럼 목록 불러오는 중" style={{ display: 'grid', gap: 10 }}>
        <div style={{ height: 78, borderRadius: 11, background: '#F1F3F7' }} />
        <div style={{ height: 16, width: '86%', borderRadius: 6, background: '#F1F3F7' }} />
        <div style={{ height: 16, width: '72%', borderRadius: 6, background: '#F1F3F7' }} />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div role="status" style={{ border: '1px solid #F2D7D5', borderRadius: 12, padding: 16, background: '#FFF8F7' }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#8A2C25' }}>칼럼 목록을 잠시 불러오지 못했습니다.</p>
        <p style={{ margin: '5px 0 0', fontSize: 11.5, lineHeight: 1.5, color: MUTED }}>다른 서비스는 계속 이용할 수 있습니다.</p>
        <button
          type="button"
          onClick={retry}
          style={{ marginTop: 10, border: '1px solid #D6DAE2', borderRadius: 8, padding: '6px 10px', background: '#FFFFFF', color: INK2, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
        >
          다시 시도
        </button>
      </div>
    );
  }

  const [featured, ...columns] = state.items;
  if (!featured) {
    return (
      <div style={{ border: '1px dashed #D9DEE8', borderRadius: 12, padding: 16, background: '#FCFDFE' }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: INK2 }}>아직 발행된 칼럼이 없습니다.</p>
        <p style={{ margin: '5px 0 0', fontSize: 11.5, lineHeight: 1.5, color: MUTED }}>검증된 자료를 준비해 순차적으로 공개하겠습니다.</p>
      </div>
    );
  }

  const featuredHref = `/blog/${encodeURIComponent(featured.slug)}`;
  const featuredCategory = featured.categoryName ?? '칼럼';
  return (
    <>
      <Link href={featuredHref} style={{ display: 'flex', gap: 14, paddingBottom: 14, borderBottom: '1px solid #F1F3F7', marginBottom: 12, textDecoration: 'none' }}>
        <span style={{ width: 120, height: 78, flexShrink: 0, borderRadius: 11, overflow: 'hidden', background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '7px 9px' }}>
          <span style={{ alignSelf: 'flex-start', fontSize: 8.5, fontWeight: 700, color: '#FFFFFF', background: '#0f172a', padding: '2px 7px', borderRadius: 99, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {featuredCategory}
          </span>
          <span style={{ alignSelf: 'flex-end', fontSize: 8.5, fontWeight: 800, color: '#0f172a' }}>내집(My.ZIP)</span>
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: BLUE, background: '#EEF2FE', padding: '3px 8px', borderRadius: 6 }}>{featuredCategory}</span>
            <span style={{ fontSize: 11, color: MUTED2 }}>{formatDate(featured.publishedAt)}</span>
          </span>
          <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: 15, fontWeight: 800, color: INK, lineHeight: 1.32, letterSpacing: '-0.01em' }}>
            {featured.title}
          </span>
        </span>
      </Link>
      {columns.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {columns.map((item) => (
            <Link key={item.slug} href={`/blog/${encodeURIComponent(item.slug)}`} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: BLUE, flexShrink: 0, width: 56, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.categoryName ?? '칼럼'}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: INK2, lineHeight: 1.35, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.title}
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
