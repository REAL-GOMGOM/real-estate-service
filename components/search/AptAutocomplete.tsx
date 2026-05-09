'use client';

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useId,
  type KeyboardEvent,
} from 'react';
import { Search, X, Loader2 } from 'lucide-react';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH_FOR_FETCH = 2;
const DROPDOWN_MAX_RESULTS = 10;

export interface ApartmentSearchResult {
  id:      string;
  name:    string;
  sido:    string;
  sigungu: string;
  dong:    string | null;
  lawdCd:  string;
}

interface AptAutocompleteProps {
  onSelect:     (apt: ApartmentSearchResult) => void;
  placeholder?: string;
  initialValue?: string;
  className?:   string;
}

type FetchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; results: ApartmentSearchResult[] }
  | { kind: 'empty' }
  | { kind: 'error' };

export function AptAutocomplete({
  onSelect,
  placeholder = '단지명 입력 (예: 잠실엘스)',
  initialValue = '',
  className,
}: AptAutocompleteProps) {
  const [query,   setQuery]   = useState(initialValue);
  const [state,   setState]   = useState<FetchState>({ kind: 'idle' });
  const [isOpen,  setIsOpen]  = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef     = useRef<HTMLInputElement | null>(null);
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef     = useRef<AbortController | null>(null);

  const listboxId = useId();

  const results = state.kind === 'ok' ? state.results : [];

  // 외부 클릭 → 드롭다운 닫기
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // unmount 시 진행 중인 fetch·debounce 정리
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const runSearch = useCallback(async (q: string) => {
    // 이전 요청 취소
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setState({ kind: 'loading' });
    try {
      const res = await fetch(
        `/api/apartments/search?q=${encodeURIComponent(q)}&limit=${DROPDOWN_MAX_RESULTS}`,
        { signal: ctrl.signal },
      );
      if (!res.ok) {
        // 최신 요청만 반영
        if (abortRef.current === ctrl) setState({ kind: 'error' });
        return;
      }
      const json = await res.json();
      if (abortRef.current !== ctrl) return; // stale
      const data: ApartmentSearchResult[] = Array.isArray(json.results) ? json.results : [];
      setState(data.length === 0 ? { kind: 'empty' } : { kind: 'ok', results: data });
      setFocusIdx(-1);
    } catch (e: unknown) {
      if ((e as { name?: string }).name === 'AbortError') return;
      if (abortRef.current === ctrl) setState({ kind: 'error' });
    }
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    setIsOpen(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (v.trim().length < MIN_QUERY_LENGTH_FOR_FETCH) {
      // 진행 중인 요청 취소·idle
      if (abortRef.current) abortRef.current.abort();
      setState({ kind: 'idle' });
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(v.trim()), DEBOUNCE_MS);
  }

  function pick(apt: ApartmentSearchResult) {
    setQuery(apt.name);
    setIsOpen(false);
    setState({ kind: 'idle' });
    setFocusIdx(-1);
    onSelect(apt);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setFocusIdx(-1);
      return;
    }
    if (results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIsOpen(true);
      setFocusIdx((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIsOpen(true);
      setFocusIdx((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      if (focusIdx >= 0 && focusIdx < results.length) {
        e.preventDefault();
        pick(results[focusIdx]);
      }
    }
  }

  function clearInput() {
    setQuery('');
    setState({ kind: 'idle' });
    setFocusIdx(-1);
    if (abortRef.current) abortRef.current.abort();
    inputRef.current?.focus();
  }

  const showDropdown = isOpen && query.trim().length >= MIN_QUERY_LENGTH_FOR_FETCH;
  const activeId = focusIdx >= 0 ? `${listboxId}-opt-${focusIdx}` : undefined;

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: 'relative', width: '100%' }}
    >
      <div style={{ position: 'relative' }}>
        <Search
          size={16}
          style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-dim)', pointerEvents: 'none',
          }}
        />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-activedescendant={activeId}
          value={query}
          placeholder={placeholder}
          onChange={handleChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          style={{
            width: '100%',
            padding: '12px 36px 12px 38px',
            borderRadius: 12, fontSize: 14,
            backgroundColor: 'var(--bg-card)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            outline: 'none', boxSizing: 'border-box',
          }}
        />
        {query && (
          <button
            type="button"
            onClick={clearInput}
            aria-label="검색어 지우기"
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', padding: 6,
              color: 'var(--text-dim)', display: 'flex', alignItems: 'center',
              minWidth: 32, minHeight: 32, justifyContent: 'center',
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {showDropdown && (
        <ul
          id={listboxId}
          role="listbox"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
            zIndex: 50,
            margin: 0, padding: 0, listStyle: 'none',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
            maxHeight: 320, overflowY: 'auto',
          }}
        >
          {state.kind === 'loading' && (
            <li style={dropdownMessageStyle}>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', marginRight: 8 }} />
              검색 중...
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </li>
          )}
          {state.kind === 'empty' && (
            <li style={dropdownMessageStyle}>검색 결과가 없습니다</li>
          )}
          {state.kind === 'error' && (
            <li style={{ ...dropdownMessageStyle, color: '#EF4444' }}>
              검색 실패. 다시 시도해주세요.
            </li>
          )}
          {state.kind === 'ok' && state.results.map((apt, i) => {
            const isFocused = i === focusIdx;
            return (
              <li
                key={apt.id}
                id={`${listboxId}-opt-${i}`}
                role="option"
                aria-selected={isFocused}
                onMouseDown={(e) => { e.preventDefault(); pick(apt); }}
                onMouseEnter={() => setFocusIdx(i)}
                style={{
                  padding: '12px 14px',
                  cursor: 'pointer',
                  minHeight: 44,
                  display: 'flex', alignItems: 'center', gap: 8,
                  backgroundColor: isFocused ? 'var(--accent-bg, rgba(59,130,246,0.1))' : 'transparent',
                  borderBottom: i < state.results.length - 1 ? '1px solid var(--border-light)' : 'none',
                }}
              >
                <span style={{
                  fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
                  flexShrink: 0,
                }}>
                  {apt.name}
                </span>
                <span style={{
                  fontSize: 12, color: 'var(--text-dim)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {apt.sido} {apt.sigungu}{apt.dong ? ` ${apt.dong}` : ''}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const dropdownMessageStyle: React.CSSProperties = {
  padding: '14px 16px',
  fontSize: 13,
  color: 'var(--text-muted)',
  display: 'flex', alignItems: 'center',
};
