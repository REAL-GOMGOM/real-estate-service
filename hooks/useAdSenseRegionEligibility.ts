'use client';

import { useEffect, useState } from 'react';

let cachedEligibility: boolean | null = null;
let pendingEligibility: Promise<boolean> | null = null;

async function loadEligibility(): Promise<boolean> {
  if (cachedEligibility !== null) return cachedEligibility;
  pendingEligibility ??= fetch('/api/adsense-eligibility', { cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) return false;
      const json = await response.json();
      return json?.eligible === true;
    })
    .catch(() => false)
    .then((eligible) => {
      cachedEligibility = eligible;
      return eligible;
    });
  return pendingEligibility;
}

/** 국가가 허용 목록으로 확인된 뒤에만 true가 된다. 실패·미확인은 fail-closed. */
export function useAdSenseRegionEligibility(enabled: boolean): boolean {
  const [eligible, setEligible] = useState(cachedEligibility === true);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void loadEligibility().then((result) => {
      if (active) setEligible(result);
    });
    return () => { active = false; };
  }, [enabled]);

  return enabled && eligible;
}
