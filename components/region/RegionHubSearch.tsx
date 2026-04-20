'use client';

import { useEffect, useState } from 'react';
import { BRAND } from '@/lib/design-tokens';

interface Props {
  onChange: (query: string) => void;
}

export function RegionHubSearch({ onChange }: Props) {
  const [input, setInput] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => onChange(input.trim()), 200);
    return () => clearTimeout(timer);
  }, [input, onChange]);

  return (
    <div className="relative">
      <input
        type="search"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="지역 검색 (예: 강남, 서울, 성남)"
        aria-label="지역 검색"
        className="w-full px-4 py-2.5 pl-10 rounded-lg text-sm outline-none"
        style={{
          backgroundColor: '#FFFFFF',
          border: `1px solid ${BRAND.line}`,
          color: BRAND.ink,
        }}
      />
      <span
        className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-sm"
        style={{ color: BRAND.inkSoft }}
      >
        🔍
      </span>
    </div>
  );
}
