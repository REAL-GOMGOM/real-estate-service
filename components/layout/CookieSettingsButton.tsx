'use client';

export function CookieSettingsButton() {
  return (
    <button
      type="button"
      onClick={() =>
        window.dispatchEvent(new CustomEvent('naezip:cookie-settings-open'))
      }
      style={{ fontSize: '14px', color: '#6B5B4F', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
    >
      쿠키 설정
    </button>
  );
}
