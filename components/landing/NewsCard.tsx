'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * 오늘의 뉴스 카드 — 홈 대시보드.
 * /api/news의 실제 응답만 표시하고, 로딩·빈 결과·장애를 구분한다.
 */

const INK = '#0B1524';

interface Row {
  title: string;
  link: string;
  time: string;
  source: string;
}

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  pubDateFormatted?: string;
  source?: string;
}

interface NewsApiResponse {
  status?: 'ok' | 'unavailable';
  news?: unknown[];
  error?: string;
}

type LoadStatus = 'loading' | 'ready' | 'empty' | 'error';

/** pubDate가 상대 표기면 그대로, 절대 시간이면 MM.DD로 축약한다. */
function fmtTime(pubDate: string): string {
  if (pubDate.includes('전') || pubDate.includes('분') || pubDate.includes('시간')) return pubDate;
  const date = new Date(pubDate);
  if (Number.isNaN(date.getTime())) return pubDate;
  return `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

function isNewsItem(value: unknown): value is NewsItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<NewsItem>;
  return typeof item.title === 'string'
    && typeof item.link === 'string'
    && typeof item.pubDate === 'string'
    && (item.pubDateFormatted === undefined || typeof item.pubDateFormatted === 'string')
    && (item.source === undefined || typeof item.source === 'string');
}

export default function NewsCard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    setStatus('loading');
    setErrorMessage('');

    try {
      const response = await fetch('/api/news', { signal });
      const json = await response.json().catch(() => null) as NewsApiResponse | null;
      if (!response.ok || json?.status !== 'ok' || !Array.isArray(json.news)) {
        throw new Error(json?.error || '뉴스 응답을 확인할 수 없습니다.');
      }

      const live = json.news
        .filter(isNewsItem)
        .filter((item) => item.title && item.link)
        .slice(0, 6)
        .map((item) => ({
          title: item.title,
          link: item.link,
          time: fmtTime(item.pubDateFormatted || item.pubDate),
          source: item.source || '출처 미상',
        }));

      setRows(live);
      setStatus(live.length > 0 ? 'ready' : 'empty');
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
      setRows([]);
      setErrorMessage(loadError instanceof Error
        ? loadError.message
        : '뉴스를 불러오지 못했습니다.');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return (
    <div style={{
      background: '#FFFFFF', border: '1px solid #E7EAF0', borderRadius: 18,
      padding: 20, display: 'flex', flexDirection: 'column', minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <span style={{ fontWeight: 800, fontSize: 15, color: INK, letterSpacing: '-0.01em' }}>오늘의 부동산 뉴스</span>
          <span style={{
            padding: '2px 6px', borderRadius: 999, background: '#F1F3F7',
            color: '#7B8494', fontSize: 9.5, fontWeight: 700, whiteSpace: 'nowrap',
          }}>
            자동 수집
          </span>
        </div>
        <Link href="/news" style={{ fontSize: 12.5, fontWeight: 600, color: '#1B4DDB', textDecoration: 'none', flexShrink: 0 }}>
          전체 →
        </Link>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 258 }}>
        {status === 'loading' && (
          <div role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <span style={{
              position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
              overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0,
            }}>
              뉴스를 불러오는 중입니다…
            </span>
            {[72, 88, 64, 80, 69, 84].map((width, index) => (
              <div
                aria-hidden="true"
                key={width}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, minHeight: 43,
                  borderBottom: index < 5 ? '1px solid #F1F3F7' : 'none',
                }}
              >
                <span style={{ width: 16, height: 8, borderRadius: 4, background: '#F1F3F7' }} />
                <span style={{ width: `${width}%`, maxWidth: 320, height: 10, borderRadius: 5, background: '#F1F3F7' }} />
              </div>
            ))}
          </div>
        )}

        {status === 'error' && (
          <div role="alert" style={{
            minHeight: 258, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            textAlign: 'center', color: '#727C8E', fontSize: 12.5, lineHeight: 1.55, padding: '18px 10px',
          }}>
            <p style={{ margin: '0 0 10px' }}>{errorMessage}</p>
            <button
              type="button"
              onClick={() => void load()}
              style={{
                border: '1px solid #DCE1EA', borderRadius: 8, background: '#FFFFFF',
                color: '#1B4DDB', padding: '6px 10px', fontSize: 11.5, fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              다시 시도
            </button>
          </div>
        )}

        {status === 'empty' && (
          <div style={{
            minHeight: 258, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#8A93A3', fontSize: 12.5, textAlign: 'center',
          }}>
            현재 조건에 맞는 새 뉴스가 없습니다.
          </div>
        )}

        {status === 'ready' && rows.map((newsItem, index) => (
          <a
            key={`${newsItem.link}-${newsItem.title}`}
            href={newsItem.link}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${newsItem.title} - ${newsItem.source} 원문 새 창에서 열기`}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, minHeight: 43, padding: '7px 0',
              borderBottom: index < rows.length - 1 ? '1px solid #F1F3F7' : 'none', textDecoration: 'none',
            }}
          >
            <span style={{
              fontFamily: 'var(--font-sg, ui-monospace, monospace)',
              fontSize: 11, fontWeight: 700, color: '#C3CAD8', flexShrink: 0, width: 16,
            }}>
              {index + 1}
            </span>
            <span style={{
              flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: '#2B333F',
              lineHeight: 1.35, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {newsItem.title}
            </span>
            <span
              title={`출처 ${newsItem.source} · ${newsItem.time}`}
              style={{
                fontSize: 10.5, color: '#9CA5B4', flexShrink: 0, maxWidth: 108,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              {newsItem.source} · {newsItem.time}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
