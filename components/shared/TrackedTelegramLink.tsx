'use client';

import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { trackAnalyticsEvent } from '@/lib/cookie-consent';

interface TrackedTelegramLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'> {
  href: string;
  placement: string;
  children: ReactNode;
}

/** 분석 동의가 있을 때만 위치별 텔레그램 전환을 기록하는 공용 링크. */
export function TrackedTelegramLink({
  href,
  placement,
  children,
  target = '_blank',
  rel = 'noopener noreferrer',
  ...props
}: TrackedTelegramLinkProps) {
  const pathname = usePathname();

  return (
    <a
      {...props}
      href={href}
      target={target}
      rel={rel}
      onClick={() => trackAnalyticsEvent('telegram_click', {
        placement,
        page_path: pathname,
      })}
    >
      {children}
    </a>
  );
}
