'use client';

import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { trackAnalyticsEvent } from '@/lib/cookie-consent';

interface RegionTransactionsLinkProps {
  href: string;
  ariaLabel: string;
  regionId: string;
  placement: 'hero' | 'metrics';
  className: string;
  style: CSSProperties;
  children: ReactNode;
}

export function RegionTransactionsLink({
  href,
  ariaLabel,
  regionId,
  placement,
  className,
  style,
  children,
}: RegionTransactionsLinkProps) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={className}
      style={style}
      onClick={() => {
        trackAnalyticsEvent('region_transaction_click', {
          placement,
          region_id: regionId,
        });
      }}
    >
      {children}
    </Link>
  );
}
