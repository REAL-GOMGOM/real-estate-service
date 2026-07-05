'use client';

import { useState } from 'react';

/**
 * 이미지 저장 버튼 — 사이클 CC (랭킹·주요거래 카드 공용).
 * onSave 에서 canvas 카드 생성 → 공유/다운로드까지 처리한다.
 */
export function SaveImageButton({ onSave }: { onSave: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  return (
    <button
      type="button"
      disabled={saving}
      onClick={async () => {
        setSaving(true);
        try { await onSave(); } catch { /* 공유 취소 무시 */ }
        setSaving(false);
      }}
      title="이미지로 저장·공유"
      style={{
        fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)',
        backgroundColor: 'transparent', border: '1px solid var(--border)',
        padding: '4px 10px', borderRadius: '8px', cursor: saving ? 'wait' : 'pointer',
        opacity: saving ? 0.6 : 1, whiteSpace: 'nowrap', flexShrink: 0,
      }}
    >
      {saving ? '저장 중…' : '🖼 이미지'}
    </button>
  );
}
