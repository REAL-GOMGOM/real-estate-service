'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Search } from 'lucide-react';
import { findDistrictByLawdCd } from '@/lib/district-codes';
import { trackAnalyticsEvent } from '@/lib/cookie-consent';
import type { ApartmentSearchResult } from '@/components/search/AptAutocomplete';

type SearchState =
  | { kind: 'loading' }
  | { kind: 'ok'; results: ApartmentSearchResult[] }
  | { kind: 'empty' }
  | { kind: 'error' };

export default function GlobalApartmentSearchResults({ query }: { query: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [retryKey, setRetryKey] = useState(0);
  const [state, setState] = useState<SearchState>(() =>
    query.trim().length < 2 ? { kind: 'empty' } : { kind: 'loading' },
  );

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const normalizedQuery = query.trim();

    if (normalizedQuery.length < 2) {
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    fetch(
      `/api/apartments/search?q=${encodeURIComponent(normalizedQuery)}&limit=10`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok || !Array.isArray(json.results)) {
          throw new Error('apartment search unavailable');
        }
        if (cancelled) return;
        setState(
          json.results.length > 0
            ? { kind: 'ok', results: json.results }
            : { kind: 'empty' },
        );
      })
      .catch((error: unknown) => {
        if (!cancelled && (error as { name?: string }).name !== 'AbortError') {
          setState({ kind: 'error' });
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [query, retryKey]);

  function selectApartment(apartment: ApartmentSearchResult) {
    const district =
      findDistrictByLawdCd(apartment.lawdCd) ?? apartment.sigungu;
    const params = new URLSearchParams(searchParams.toString());
    params.set('district', district);
    params.set('q', apartment.name);
    params.set('aptId', apartment.id);
    if (apartment.dong) params.set('aptDong', apartment.dong);
    else params.delete('aptDong');
    params.delete('tx');
    params.delete('rtx');
    trackAnalyticsEvent('transaction_apartment_search_select', {
      apartment_id: apartment.id,
      district,
      source: 'transactions_query_results',
    });
    router.replace(`/transactions?${params.toString()}`, { scroll: false });
  }

  return (
    <section
      aria-labelledby="global-apartment-search-title"
      style={{
        margin: '20px 0',
        padding: '20px',
        borderRadius: '16px',
        border: '1px solid var(--border)',
        background: 'var(--bg-card)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
        <Search size={18} aria-hidden="true" color="var(--accent)" />
        <h2
          id="global-apartment-search-title"
          style={{ margin: 0, fontSize: '16px', color: 'var(--text-primary)' }}
        >
          &lsquo;{query}&rsquo; 단지 검색 결과
        </h2>
      </div>

      {state.kind === 'loading' && (
        <p
          role="status"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '18px 0 0', color: 'var(--text-muted)', fontSize: '14px' }}
        >
          <Loader2 size={16} aria-hidden="true" className="animate-spin" />
          검색 중입니다
        </p>
      )}

      {state.kind === 'error' && (
        <div role="alert" style={{ marginTop: '16px' }}>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '14px' }}>
            단지 검색을 잠시 이용할 수 없습니다.
          </p>
          <button
            type="button"
            onClick={() => {
              setState({ kind: 'loading' });
              setRetryKey((key) => key + 1);
            }}
            style={{ marginTop: '10px', border: 0, borderRadius: '9px', padding: '8px 13px', background: 'var(--accent)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
          >
            다시 시도
          </button>
        </div>
      )}

      {state.kind === 'empty' && (
        <p style={{ margin: '16px 0 0', color: 'var(--text-muted)', fontSize: '14px' }}>
          일치하는 단지가 없습니다. 두 글자 이상의 정확한 단지명으로 다시 검색해 주세요.
        </p>
      )}

      {state.kind === 'ok' && (
        <ul style={{ margin: '14px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: '8px' }}>
          {state.results.map((apartment) => (
            <li key={apartment.id}>
              <button
                type="button"
                onClick={() => selectApartment(apartment)}
                style={{ width: '100%', padding: '12px 14px', borderRadius: '11px', border: '1px solid var(--border-light)', background: 'var(--bg-primary)', textAlign: 'left', cursor: 'pointer' }}
              >
                <strong style={{ display: 'block', color: 'var(--text-primary)', fontSize: '14px' }}>
                  {apartment.name}
                </strong>
                <span style={{ display: 'block', marginTop: '4px', color: 'var(--text-dim)', fontSize: '12px' }}>
                  {[apartment.sido, apartment.sigungu, apartment.dong]
                    .filter(Boolean)
                    .join(' ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
