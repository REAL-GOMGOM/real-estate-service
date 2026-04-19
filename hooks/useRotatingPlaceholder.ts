'use client';
import { useEffect, useState } from 'react';

const DEFAULT_ITEMS = [
  '강남구 아파트 시세',
  '분당 전세 실거래',
  '용산구 입지 점수',
  '수도권 청약 일정',
];

export function useRotatingPlaceholder(items = DEFAULT_ITEMS, interval = 2200) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % items.length);
    }, interval);
    return () => clearInterval(timer);
  }, [items.length, interval]);

  return items[index];
}
