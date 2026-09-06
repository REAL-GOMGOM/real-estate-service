'use client';

import { useId, useRef, useState } from 'react';
import {
  HOME_DISTRICT_GROUPS, homeDistrictGroup, homeDistrictLabel, isHomeDistrict,
} from '@/lib/home-district';

export default function HomeDistrictPicker({ district, onSelect, storageFailed }: {
  district: string;
  onSelect: (district: string) => void;
  storageFailed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState('');
  const [draft, setDraft] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const candidates = HOME_DISTRICT_GROUPS.find((candidate) => candidate.label === group)?.districts ?? [];
  const close = () => { setOpen(false); trigger.current?.focus(); };

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ color: '#3A4453', fontSize: 13, fontWeight: 700, minWidth: 0 }}>
          {homeDistrictLabel(district)}
        </span>
        <button
          ref={trigger} type="button" aria-expanded={open} aria-controls={`${id}-panel`}
          onClick={() => {
            if (open) { close(); return; }
            setGroup(homeDistrictGroup(district)); setDraft(district); setOpen(true);
          }}
          style={{ flexShrink: 0, minHeight: 36, padding: '6px 10px', borderRadius: 8, background: '#F2F5FF', border: '1px solid #D9E2FF', color: '#1B4DDB', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
        >지역 변경</button>
      </div>
      <p role={storageFailed ? 'status' : undefined} style={{ margin: '6px 0 0', fontSize: 11.5, color: '#6B7488', lineHeight: 1.5 }}>
        {storageFailed ? '이 기기의 저장을 확인하지 못했지만, 선택한 지역은 지금 조회할 수 있어요.' : '선택한 관심 지역은 이 기기에만 저장돼요.'}
      </p>
      {open ? (
        <form id={`${id}-panel`} aria-label="관심 지역 설정"
          onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }}
          onSubmit={(event) => {
            event.preventDefault();
            if (!isHomeDistrict(draft) || !candidates.includes(draft)) return;
            onSelect(draft); close();
          }}
          style={{ marginTop: 10, padding: 12, border: '1px solid #E2E6EF', borderRadius: 10, background: '#F8FAFF' }}
        >
          <label htmlFor={`${id}-group`} style={{ display: 'block', fontSize: 12, color: '#3A4453', marginBottom: 4 }}>시도·권역</label>
          <select id={`${id}-group`} value={group} onChange={(event) => { setGroup(event.target.value); setDraft(''); }}
            style={{ width: '100%', minWidth: 0, height: 40, padding: '0 8px', borderRadius: 7, border: '1px solid #D9DEEA', background: '#FFFFFF', color: '#0B1524', fontSize: 14 }}>
            {HOME_DISTRICT_GROUPS.map((candidate) => <option key={candidate.label} value={candidate.label}>{candidate.label}</option>)}
          </select>
          <label htmlFor={`${id}-district`} style={{ display: 'block', fontSize: 12, color: '#3A4453', margin: '10px 0 4px' }}>시군구</label>
          <select id={`${id}-district`} value={draft} required onChange={(event) => setDraft(event.target.value)}
            style={{ width: '100%', minWidth: 0, height: 40, padding: '0 8px', borderRadius: 7, border: '1px solid #D9DEEA', background: '#FFFFFF', color: '#0B1524', fontSize: 14 }}>
            <option value="" disabled>시군구를 선택하세요</option>
            {candidates.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}
          </select>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button type="button" onClick={close} style={{ minHeight: 40, padding: '6px 12px', border: '1px solid #D9DEEA', borderRadius: 8, background: '#FFFFFF', color: '#3A4453', cursor: 'pointer' }}>취소</button>
            <button type="submit" disabled={!candidates.includes(draft)} style={{ minHeight: 40, padding: '6px 12px', border: 0, borderRadius: 8, background: '#1B4DDB', color: '#FFFFFF', fontWeight: 700, opacity: candidates.includes(draft) ? 1 : 0.5, cursor: 'pointer' }}>이 지역 보기</button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
