'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const CONTENT_ID = 'main-content';

/** 각 경로의 첫 <main>을 키보드 건너뛰기 링크 대상으로 연결한다. */
export function SkipToContent() {
  const pathname = usePathname();

  useEffect(() => {
    const main = document.querySelector<HTMLElement>('main');
    if (!main) return;

    const assignedId = !main.id;
    const previousTabIndex = main.getAttribute('tabindex');
    if (assignedId) main.id = CONTENT_ID;
    main.tabIndex = -1;

    return () => {
      if (assignedId && main.id === CONTENT_ID) main.removeAttribute('id');
      if (previousTabIndex === null) main.removeAttribute('tabindex');
      else main.setAttribute('tabindex', previousTabIndex);
    };
  }, [pathname]);

  function focusMain(event: React.MouseEvent<HTMLAnchorElement>) {
    const main = document.querySelector<HTMLElement>('main');
    if (!main) return;
    event.preventDefault();
    if (!main.id) main.id = CONTENT_ID;
    main.focus({ preventScroll: true });
    main.scrollIntoView({ block: 'start' });
  }

  return (
    <a
      href={`#${CONTENT_ID}`}
      onClick={focusMain}
      className="fixed left-4 top-4 z-[200] -translate-y-24 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white shadow-lg transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 motion-reduce:transition-none"
    >
      본문 바로가기
    </a>
  );
}
