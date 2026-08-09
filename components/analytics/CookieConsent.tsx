'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  COOKIE_SETTINGS_OPEN_EVENT,
  setConsent,
  type ConsentChoices,
} from '@/lib/cookie-consent';
import { useConsent } from '@/hooks/useConsent';
import { useMounted } from '@/hooks/useMounted';

const DEFAULT_CHOICES: ConsentChoices = {
  analytics: false,
  advertising: false,
  personalization: false,
};

export function CookieConsent() {
  const mounted = useMounted();
  const consent = useConsent();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [customising, setCustomising] = useState(false);
  const [draft, setDraft] = useState<ConsentChoices>(DEFAULT_CHOICES);

  useEffect(() => {
    const handleReopen = () => {
      setDraft({
        analytics: consent?.analytics ?? false,
        advertising: consent?.advertising ?? false,
        personalization: consent?.personalization ?? false,
      });
      setCustomising(true);
      setSettingsOpen(true);
    };
    window.addEventListener(COOKIE_SETTINGS_OPEN_EVENT, handleReopen);
    return () => window.removeEventListener(COOKIE_SETTINGS_OPEN_EVENT, handleReopen);
  }, [consent]);

  const visible = consent === null || settingsOpen;
  if (!mounted || !visible) return null;

  const save = (choices: ConsentChoices) => {
    const revokedPreviouslyGrantedChoice = Boolean(
      consent && (
        (consent.analytics && !choices.analytics)
        || (consent.advertising && !choices.advertising)
        || (consent.personalization && !choices.personalization)
      ),
    );
    if (setConsent(choices)) {
      setSettingsOpen(false);
      setCustomising(false);
      // 이미 실행된 제3자 태그는 JavaScript만으로 완전히 되돌릴 수 없으므로
      // 철회 시 새 문서에서 허용된 태그만 다시 구성한다.
      if (revokedPreviouslyGrantedChoice) window.location.reload();
    }
  };

  return (
    <div
      role="dialog"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-description"
      className="fixed inset-x-0 bottom-0 z-[120] border-t bg-white/[0.98] shadow-2xl backdrop-blur-sm"
      style={{
        borderColor: 'var(--border)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="mx-auto max-w-5xl p-4 md:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="cookie-consent-title" className="text-base font-bold" style={{ color: 'var(--text-strong)' }}>
              쿠키와 외부 광고 설정
            </h2>
            <p
              id="cookie-consent-description"
              className="mt-1 text-sm leading-relaxed"
              style={{ color: 'var(--text-muted)' }}
            >
              필수 기능은 항상 사용하며, 방문 분석·광고·맞춤형 광고는 각각 선택한 범위에서만 사용합니다. 자세한 내용은{' '}
              <Link href="/privacy" className="underline underline-offset-2" style={{ color: 'var(--text-primary)' }}>
                개인정보 처리방침
              </Link>
              에서 확인할 수 있습니다.
            </p>
          </div>
          {consent !== null && (
            <button
              type="button"
              aria-label="쿠키 설정 닫기"
              onClick={() => {
                setSettingsOpen(false);
                setCustomising(false);
              }}
              className="shrink-0 rounded-md px-2 py-1 text-xl focus-visible:outline-none focus-visible:ring-2"
              style={{ color: 'var(--text-muted)' }}
            >
              ×
            </button>
          )}
        </div>

        {customising && (
          <div className="mt-4 grid gap-2 md:grid-cols-2 lg:grid-cols-4">
            <ConsentToggle label="필수" description="서비스 기본 동작과 동의 저장" checked disabled onChange={() => undefined} />
            <ConsentToggle
              label="방문 분석"
              description="Google Analytics 이용 통계"
              checked={draft.analytics}
              onChange={(analytics) => setDraft((current) => ({ ...current, analytics }))}
            />
            <ConsentToggle
              label="광고"
              description="문맥형 광고 표시·성과 측정 및 Google·쿠팡 전송"
              checked={draft.advertising}
              onChange={(advertising) => setDraft((current) => ({
                ...current,
                advertising,
                personalization: advertising ? current.personalization : false,
              }))}
            />
            <ConsentToggle
              label="맞춤형 광고"
              description="관심사·이용 정보 기반 광고 개인화"
              checked={draft.advertising && draft.personalization}
              disabled={!draft.advertising}
              onChange={(personalization) => setDraft((current) => ({ ...current, personalization }))}
            />
          </div>
        )}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => save(DEFAULT_CHOICES)} className="rounded-md border px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            필수만 사용
          </button>
          {!customising ? (
            <button type="button" onClick={() => setCustomising(true)} className="rounded-md border px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
              직접 설정
            </button>
          ) : (
            <button type="button" onClick={() => save(draft)} className="rounded-md border px-4 py-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-2" style={{ borderColor: 'var(--text-primary)', color: 'var(--text-primary)' }}>
              선택 저장
            </button>
          )}
          <button type="button" onClick={() => save({ analytics: true, advertising: true, personalization: true })} className="rounded-md px-4 py-2 text-sm font-bold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2" style={{ backgroundColor: 'var(--text-primary)' }}>
            모두 허용
          </button>
        </div>
      </div>
    </div>
  );
}

interface ConsentToggleProps {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

function ConsentToggle({ label, description, checked, disabled = false, onChange }: ConsentToggleProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3" style={{ borderColor: 'var(--border-light)' }}>
      <div>
        <p className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>{label}</p>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--text-dim)' }}>{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={`${label} ${checked ? '허용됨' : '거부됨'}`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
        style={{ backgroundColor: checked ? 'var(--text-primary)' : 'var(--border-hover)' }}
      >
        <span
          aria-hidden="true"
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none"
          style={{ left: '2px', transform: checked ? 'translateX(20px)' : 'translateX(0)' }}
        />
      </button>
    </div>
  );
}
