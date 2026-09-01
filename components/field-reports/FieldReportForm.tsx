'use client';

import Link from 'next/link';
import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { submitFieldReport } from '@/app/field-reports/actions';
import { AptAutocomplete, type ApartmentSearchResult } from '@/components/search/AptAutocomplete';
import type { FieldReportActionState, PublicFieldReport } from '@/lib/field-reports/types';
import { contractDateBounds } from './presentation';
import { usePreserveFormDraft } from './usePreserveFormDraft';
import styles from './FieldReports.module.css';

const INITIAL_STATE: FieldReportActionState = { status: 'idle' };

export default function FieldReportForm({ id, onClose }: { id: string; onClose: () => void }) {
  const prefix = useId();
  const [state, formAction, pending] = useActionState(submitFieldReport, INITIAL_STATE);
  const [apartment, setApartment] = useState<ApartmentSearchResult | null>(null);
  const [tradeType, setTradeType] = useState<PublicFieldReport['tradeType']>('sale');
  const [area, setArea] = useState('');
  const [price, setPrice] = useState('');
  const [monthlyRent, setMonthlyRent] = useState('');
  const [contractDate, setContractDate] = useState('');
  const [source, setSource] = useState('');
  const [consent, setConsent] = useState(false);
  const [confirmContracted, setConfirmContracted] = useState(false);
  const [dateBounds] = useState(() => contractDateBounds());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLInputElement>(null);
  const formRef = usePreserveFormDraft();

  useEffect(() => {
    if (apartment) areaRef.current?.focus();
    else searchRef.current?.querySelector('input')?.focus();
  }, [apartment]);

  useEffect(() => { headingRef.current?.focus(); }, []);
  useEffect(() => {
    if (state.status !== 'idle') statusRef.current?.focus();
  }, [state]);

  return (
    <section id={id} className={styles.formPanel} aria-labelledby={`${prefix}-heading`}>
      <div className={styles.formHeader}>
        <div>
          <h3 id={`${prefix}-heading`} ref={headingRef} tabIndex={-1}>계약 소식 제보하기</h3>
          <p>실제로 체결된 계약만 알려주세요. 호가·매물 광고는 받지 않습니다.</p>
        </div>
        <button type="button" className={styles.quietButton} disabled={pending} onClick={onClose}>제보 접기</button>
      </div>

      {state.status === 'success' ? (
        <div ref={statusRef} tabIndex={-1} role="status" className={styles.successMessage}>
          <strong>접수 완료 · 검수 후 공개</strong>
          <p>{state.message}</p>
          <p>접수번호 <code>{state.receipt}</code></p>
          <p>검수는 내용의 적합성을 살피는 절차이며, 실제 계약이나 가격의 확인을 뜻하지 않습니다.</p>
        </div>
      ) : (
        <form ref={formRef} action={formAction} aria-busy={pending}>
          <fieldset disabled={pending} className={styles.formFields}>
            <legend className={styles.visuallyHidden}>계약 제보 내용</legend>
            <div className={styles.apartmentField}>
              <span className={styles.fieldLabel}>아파트 단지 <span aria-hidden="true">*</span></span>
              {apartment ? (
                <div className={styles.selectedApartment}>
                  <div><strong>{apartment.name}</strong><span>{apartment.sido} {apartment.sigungu} {apartment.dong}</span></div>
                  <button type="button" className={styles.quietButton} onClick={() => setApartment(null)}>단지 변경</button>
                </div>
              ) : (
                <div ref={searchRef}>
                  <AptAutocomplete
                    ariaLabel="제보할 아파트 단지 검색"
                    placeholder="아파트 이름을 검색하고 단지를 선택하세요"
                    onSelect={setApartment}
                    onClear={() => setApartment(null)}
                  />
                </div>
              )}
              <input type="hidden" name="apartmentId" value={apartment?.id ?? ''} />
              <p className={styles.fieldHint}>검색 결과에서 단지를 선택해야 접수할 수 있습니다.</p>
            </div>

            <div className={styles.formGrid}>
              <label htmlFor={`${prefix}-area`} className={styles.field}>
                <span>전용면적 (㎡)</span>
                <input ref={areaRef} id={`${prefix}-area`} name="area" type="number" inputMode="decimal" min="10" max="500" step="0.01" required value={area} onChange={(event) => setArea(event.target.value)} placeholder="예: 84.95" />
              </label>
              <label htmlFor={`${prefix}-type`} className={styles.field}>
                <span>거래 유형</span>
                <select id={`${prefix}-type`} name="tradeType" value={tradeType} onChange={(event) => setTradeType(event.target.value as PublicFieldReport['tradeType'])}>
                  <option value="sale">매매</option><option value="jeonse">전세</option><option value="monthly">월세</option>
                </select>
              </label>
              <label htmlFor={`${prefix}-price`} className={styles.field}>
                <span>{tradeType === 'sale' ? '매매가격' : '보증금'} (만원)</span>
                <input id={`${prefix}-price`} name="price" type="number" inputMode="numeric" min={tradeType === 'monthly' ? 0 : 1} max="5000000" step="1" required value={price} onChange={(event) => setPrice(event.target.value)} placeholder="만원 단위로 입력" />
              </label>
              {tradeType === 'monthly' ? (
                <label htmlFor={`${prefix}-rent`} className={styles.field}>
                  <span>월세 (만원 / 월)</span>
                  <input id={`${prefix}-rent`} name="monthlyRent" type="number" inputMode="numeric" min="1" max="10000" step="1" required value={monthlyRent} onChange={(event) => setMonthlyRent(event.target.value)} />
                </label>
              ) : null}
              <label htmlFor={`${prefix}-date`} className={styles.field}>
                <span>계약일</span>
                <input id={`${prefix}-date`} name="contractDate" type="date" min={dateBounds.min} max={dateBounds.max} required value={contractDate} onChange={(event) => setContractDate(event.target.value)} aria-describedby={`${prefix}-date-hint`} />
                <small id={`${prefix}-date-hint`}>한국 날짜 기준 최근 90일 이내</small>
              </label>
              <label htmlFor={`${prefix}-source`} className={styles.field}>
                <span>제보자 구분</span>
                <select id={`${prefix}-source`} name="source" required value={source} onChange={(event) => setSource(event.target.value)}>
                  <option value="" disabled>선택해주세요</option>
                  <option value="participant">계약 당사자</option><option value="agent">중개업 종사자</option><option value="neighbor">이웃</option>
                </select>
              </label>
            </div>

            <div className={styles.privacyNotice}>
              이름·연락처·동호수·계약서 등 개인정보와 증빙은 수집하지 않습니다. 단지명 외 개인정보는 입력하지 마세요. 제보 내용은 접수 후 최대 90일 보관됩니다.
            </div>
            <div className={styles.consentFields}>
              <label><input type="checkbox" name="confirmContracted" required checked={confirmContracted} onChange={(event) => setConfirmContracted(event.target.checked)} /><span>호가나 광고가 아닌, 실제 체결된 계약에 대한 제보입니다. (필수)</span></label>
              <label><input type="checkbox" name="consent" required checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>미확인 정보로 검수 후 공개될 수 있음과 <Link href="/terms#field-reports">제보 이용 기준</Link>·<Link href="/privacy#field-reports">개인정보 처리 안내</Link>를 확인했습니다. (필수)</span></label>
            </div>
            <div className={styles.visuallyHidden} aria-hidden="true">
              <label htmlFor={`${prefix}-website`}>웹사이트</label>
              <input id={`${prefix}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
            </div>
            {state.status === 'error' ? (
              <div className={styles.errorMessage} ref={statusRef} role="alert" tabIndex={-1}>{state.message}</div>
            ) : null}
            <div className={styles.submitRow}>
              <p>제보는 바로 공개되지 않습니다. 공개 후에도 공식 실거래와 별개의 미확인 정보로 표시됩니다.</p>
              <button type="submit" className={styles.primaryButton} disabled={pending || !apartment}>{pending ? '접수 중…' : '제보 접수하기'}</button>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  );
}
