'use client';

/**
 * "홈 화면에 내집 추가" CTA — 홈 텔레그램 밴드 위 (2026-07-12).
 *
 * - Android/Chrome: beforeinstallprompt 캡처 → 버튼 클릭 시 네이티브 설치 프롬프트
 * - iOS Safari: 이벤트가 없으므로 수동 안내(공유 → 홈 화면에 추가) 오버레이
 * - 이미 설치(standalone 실행) 또는 미지원 브라우저 → 아예 렌더하지 않음
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
    <section style={{ background: '#F4F7FE', borderTop: '1px solid #E7EAF0' }}>
      <div style={{
        maxWidth: 1200, margin: '0 auto', padding: '18px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0B1524' }}>
            📱 내집을 홈 화면에 추가하세요
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#64708A' }}>
            앱처럼 한 번에 실거래·시세 확인 — 설치 없이 바로가기만 생깁니다
          </p>
        </div>
        <button
          onClick={handleClick}
          style={{
            padding: '11px 20px', borderRadius: 11, background: '#1B4DDB', color: '#FFFFFF',
            fontSize: 13.5, fontWeight: 700, border: 'none', cursor: 'pointer',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          바로가기 만들기
        </button>
      </div>

      {/* iOS 수동 안내 */}
      {showIosGuide && (
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px 16px' }}>
          <div style={{
            padding: '12px 16px', borderRadius: 10, background: '#FFFFFF',
            border: '1px solid #E7EAF0', fontSize: 13, lineHeight: 1.7, color: '#2B333F',
          }}>
            아이폰은 이렇게 추가해요: Safari 하단 <b>공유 버튼(□↑)</b> →
            <b> &lsquo;홈 화면에 추가&rsquo;</b> → 우측 상단 <b>추가</b>. 홈 화면에 내집 아이콘이 생깁니다.
          </div>
        </div>
      )}
    </section>
  );
}
