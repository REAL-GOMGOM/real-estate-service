'use client';

/**
 * "홈 화면에 내집 추가" 플로팅 버튼 — 우하단 텔레그램 FAB 바로 위 스택 (2026-07-12).
 *
 * - Android/Chrome: beforeinstallprompt 캡처 → 클릭 시 네이티브 설치 프롬프트
 * - iOS Safari: 이벤트가 없으므로 수동 안내(공유 → 홈 화면에 추가) 팝오버
 * - 이미 설치(standalone 실행) 또는 미지원 브라우저 → 아예 렌더하지 않음
 *
 * 좌표는 TelegramFloatingButton(right-6, bottom 1.5rem+safe-area, 56px 원형)과
 * 동기 — FAB 높이 56px + 간격 12px 만큼 위에 얹는다.
 */

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Mode = 'hidden' | 'native' | 'ios';

export default function AddToHomeCta() {
  const [mode, setMode] = useState<Mode>('hidden');
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    // 이미 앱으로 실행 중이면 표시 불필요
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    // iOS 판정은 비동기 주입 — effect 내 동기 setState 룰 회피 (Header 패턴과 동일)
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const t = isIos ? window.setTimeout(() => setMode('ios'), 0) : null;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setMode('native');
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => {
      if (t !== null) window.clearTimeout(t);
      window.removeEventListener('beforeinstallprompt', onPrompt);
    };
  }, []);

  if (mode === 'hidden') return null;

  async function handleClick() {
    if (mode === 'native' && deferred) {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === 'accepted') setMode('hidden');
      setDeferred(null);
    } else {
      setShowIosGuide((v) => !v);
    }
  }

  return (
    <div
      className="fixed right-6 z-50"
      // FAB(56px) + 간격 12px 위 — safe-area까지 FAB와 동일 계산식 유지
      style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom) + 68px)' }}
    >
      {/* iOS 수동 안내 팝오버 — 버튼 위로 펼침 */}
      {showIosGuide && (
        <div
          role="dialog"
          aria-label="홈 화면 추가 방법"
          style={{
            position: 'absolute', bottom: 56, right: 0, width: 248,
            padding: '12px 14px', borderRadius: 12, background: '#FFFFFF',
            border: '1px solid #E7EAF0', boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
            fontSize: 12.5, lineHeight: 1.7, color: '#2B333F',
          }}
        >
          Safari 하단 <b>공유 버튼(□↑)</b> → <b>&lsquo;홈 화면에 추가&rsquo;</b> →
          우측 상단 <b>추가</b>. 홈 화면에 내집 아이콘이 생깁니다.
        </div>
      )}

      <button
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-label="내집을 홈 화면에 추가"
        className="group flex items-center gap-2 focus-visible:outline-none"
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
      >
        {/* 툴팁 — FAB와 동일 패턴 */}
        <span
          className="px-3 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-300"
          style={{
            backgroundColor: '#0B1524', color: '#FFFFFF',
            opacity: hovered ? 1 : 0,
            transform: hovered ? 'translateX(0)' : 'translateX(10px)',
            pointerEvents: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          홈 화면에 바로가기 추가
        </span>

        {/* 흰 원형 버튼 — 파란 FAB와 위계 구분 (48px) */}
        <span
          className="rounded-full flex items-center justify-center transition-all duration-300"
          style={{
            width: 48, height: 48, background: '#FFFFFF',
            border: '1px solid #E7EAF0',
            boxShadow: hovered ? '0 8px 24px rgba(0,0,0,0.16)' : '0 4px 12px rgba(0,0,0,0.10)',
            transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
          }}
        >
          {/* 집 + 플러스 아이콘 */}
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none"
            stroke="#1B4DDB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m3 10 9-7 9 7" />
            <path d="M5 8.5V21h14V8.5" />
            <path d="M12 12v6" />
            <path d="M9 15h6" />
          </svg>
        </span>
      </button>
    </div>
  );
}
