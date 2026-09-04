// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicFieldReport } from '@/lib/field-reports/types';

const { submitMock, flagMock } = vi.hoisted(() => ({ submitMock: vi.fn(), flagMock: vi.fn() }));

vi.mock('@/app/field-reports/actions', () => ({ submitFieldReport: submitMock, reportFieldReport: flagMock }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock('@/components/search/AptAutocomplete', () => ({
  AptAutocomplete: ({ onSelect, ariaLabel }: { onSelect: (value: unknown) => void; ariaLabel: string }) => (
    <div>
      <input role="combobox" aria-label={ariaLabel} aria-expanded="false" aria-controls="mock-results" />
      <button type="button" onClick={() => onSelect({ id: 'apt-one', name: '테스트 단지', sido: '서울특별시', sigungu: '송파구', dong: '잠실동', lawdCd: '11710' })}>검색 결과 선택</button>
    </div>
  ),
}));

import FieldReportsHome from '../FieldReportsHome';
import { contractDateBounds, formatReportAmount, formatReportArea, isPublicFieldReport } from '../presentation';

const fetchMock = vi.fn();
let root: Root | null = null;
let host: HTMLDivElement;

function report(overrides: Partial<PublicFieldReport> = {}): PublicFieldReport {
  return {
    id: 'report-one', apartmentId: 'apt-one', apartmentName: '테스트 단지',
    sido: '서울특별시', sigungu: '송파구', dong: '잠실동', area: 84.95,
    tradeType: 'sale', price: 105_000, monthlyRent: null, contractDate: '2026-08-20',
    source: 'participant', createdAt: '2026-08-20T04:00:00Z', publishedAt: '2026-08-20T15:30:00Z',
    ...overrides,
  };
}

function response(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

async function settle() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }

async function renderPanel(expanded = false) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<FieldReportsHome expanded={expanded} />); await settle(); });
}

function button(label: string): HTMLButtonElement {
  const result = [...host.querySelectorAll('button')].find((item) => item.textContent === label);
  if (!result) throw new Error(`Missing button: ${label}`);
  return result;
}

async function click(label: string) {
  await act(async () => { button(label).click(); await settle(); });
}

async function change(name: string, value: string) {
  const input = host.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)!;
  const isSelect = input instanceof HTMLSelectElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(isSelect ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event(isSelect ? 'change' : 'input', { bubbles: true }));
    await settle();
  });
}

async function fillReport() {
  await click('가격 제보하기');
  await click('검색 결과 선택');
  await change('areaPyeong', '25.7');
  await change('priceEok', '10.5');
  await change('contractDate', host.querySelector<HTMLInputElement>('[name="contractDate"]')!.max);
  await act(async () => {
    host.querySelector<HTMLInputElement>('[name="consent"]')!.click();
    host.querySelector<HTMLInputElement>('[name="confirmContracted"]')!.click();
  });
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  fetchMock.mockReset().mockResolvedValue(response({ status: 'ok', submissionsEnabled: true, reports: [] }));
  submitMock.mockReset();
  flagMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  root = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('현장 제보가격 공개 UI', () => {
  it('로딩을 표시하고 예시 제보 없이 no-store로 요청한다', async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    await renderPanel();
    expect(host.textContent).toContain('현장 제보가격을 불러오는 중');
    expect(host.querySelector('article')).toBeNull();
    expect(host.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(button('가격 제보하기').disabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/api/field-reports', expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }));
  });

  it('빈 목록과 서비스 장애를 구별하고 장애 후 재시도한다', async () => {
    fetchMock.mockResolvedValueOnce(response({ status: 'unavailable', submissionsEnabled: false, reports: [] }, false));
    await renderPanel();
    expect(host.textContent).toContain('제보 목록을 잠시 불러오지 못했습니다');
    expect(host.textContent).not.toContain('아직 공개된 제보가 없습니다');
    await click('다시 시도');
    expect(host.textContent).toContain('아직 공개된 제보가 없습니다');
    expect(button('가격 제보하기').disabled).toBe(false);
  });

  it('저장소 준비 중 상태를 장애나 빈 목록으로 안내하지 않는다', async () => {
    fetchMock.mockResolvedValue(response({ status: 'preparing', submissionsEnabled: false, reports: [] }));
    await renderPanel();
    expect(host.textContent).toContain('현장 제보가격을 준비하고 있습니다.');
    expect(host.textContent).toContain('접수가 시작되면 이웃의 계약 소식을 제보하고 확인할 수 있습니다.');
    expect(host.textContent).not.toContain('제보 목록을 잠시 불러오지 못했습니다');
    expect(host.textContent).not.toContain('아직 공개된 제보가 없습니다');
    expect(host.textContent).not.toContain('다시 시도');
    expect(button('가격 제보하기').disabled).toBe(true);
    expect(host.querySelector('form')).toBeNull();
    expect(host.querySelector('article')).toBeNull();
    expect(host.querySelector('[role="status"]')).not.toBeNull();
  });

  it('접수 기능이 꺼져 있어도 공개된 목록은 표시한다', async () => {
    fetchMock.mockResolvedValue(response({ status: 'ok', submissionsEnabled: false, reports: [report()] }));
    await renderPanel();
    expect(host.querySelectorAll('article')).toHaveLength(1);
    expect(host.textContent).toContain('현재 제보 접수를 준비하고 있습니다');
    expect(button('가격 제보하기').disabled).toBe(true);
  });

  it('서버 데이터만 최대 6건 표시하고 모든 카드에 미확인 문구를 붙인다', async () => {
    fetchMock.mockResolvedValue(response({ status: 'ok', submissionsEnabled: true, reports: Array.from({ length: 8 }, (_, index) => report({ id: `report-${index}` })) }));
    await renderPanel();
    expect(host.querySelectorAll('article')).toHaveLength(6);
    expect([...host.querySelectorAll('article')].every((card) => card.textContent?.includes('미확인 제보'))).toBe(true);
    expect(host.textContent).toContain('공식 실거래와 별개인 미확인 정보');
    expect(host.textContent).toContain('10억 5,000만원');
    expect(host.textContent).toContain('8. 21.');
    expect(host.querySelector('a[href="/field-reports"]')).not.toBeNull();
    expect(host.querySelector('a[href="/privacy#field-reports"]')).not.toBeNull();
  });

  it('확장 페이지는 h1과 최대 20건을 표시한다', async () => {
    fetchMock.mockResolvedValue(response({ status: 'ok', submissionsEnabled: true, reports: Array.from({ length: 23 }, (_, index) => report({ id: `report-${index}` })) }));
    await renderPanel(true);
    expect(host.querySelector('h1')?.textContent).toBe('현장 제보가격');
    expect(host.querySelectorAll('article')).toHaveLength(20);
  });

  it('유효하지 않은 API 응답을 정상 빈 목록으로 표시하지 않는다', async () => {
    fetchMock.mockResolvedValue(response({ status: 'ok', submissionsEnabled: true, reports: [{ id: 'partial' }] }));
    await renderPanel();
    expect(host.textContent).toContain('제보 목록을 잠시 불러오지 못했습니다');
    expect(host.querySelector('article')).toBeNull();
  });

  it('제보 열기·접기에서 포커스를 이동하고 단지 변경 시 오래된 선택을 제거한다', async () => {
    await renderPanel();
    await click('가격 제보하기');
    expect(document.activeElement?.textContent).toBe('계약 소식 제보');
    expect(button('제보 접수하기').disabled).toBe(true);
    await click('검색 결과 선택');
    expect(host.querySelector('[role="combobox"]')).toBeNull();
    expect(host.querySelector<HTMLInputElement>('[name="apartmentId"]')?.value).toBe('apt-one');
    expect(document.activeElement?.getAttribute('name')).toBe('areaPyeong');
    await click('단지 변경');
    expect(host.querySelector<HTMLInputElement>('[name="apartmentId"]')?.value).toBe('');
    expect(document.activeElement?.getAttribute('role')).toBe('combobox');
    expect(button('제보 접수하기').disabled).toBe(true);
    await click('제보 접기');
    expect(host.querySelector('form')).toBeNull();
    expect(document.activeElement).toBe(button('가격 제보하기'));
  });

  it('월세 필드는 월세 선택 시에만 전송하고 개인정보 필드를 만들지 않는다', async () => {
    await renderPanel();
    await click('가격 제보하기');
    expect(host.querySelector('[name="monthlyRent"]')).toBeNull();
    await change('tradeType', 'monthly');
    expect(host.querySelector<HTMLInputElement>('[name="monthlyRent"]')?.min).toBe('1');
    expect(host.querySelector<HTMLInputElement>('[name="priceEok"]')?.min).toBe('0');
    await change('tradeType', 'jeonse');
    expect(host.querySelector('[name="monthlyRent"]')).toBeNull();
    expect(host.querySelector<HTMLInputElement>('[name="priceEok"]')?.min).toBe('0.01');
    for (const name of ['name', 'email', 'phone', 'unit', 'memo', 'attachment']) expect(host.querySelector(`[name="${name}"]`)).toBeNull();
    expect(host.querySelector<HTMLInputElement>('[name="website"]')?.tabIndex).toBe(-1);
  });

  it('평·억원 입력을 즉시 환산하고 익명 출처를 기본으로 제공한다', async () => {
    await renderPanel();
    await click('가격 제보하기');
    expect(host.querySelector<HTMLSelectElement>('[name="source"]')?.value).toBe('anonymous');
    expect([...host.querySelectorAll<HTMLSelectElement>('[name="source"] option')].map((option) => option.value)).toEqual([
      'anonymous', 'field_news', 'participant', 'agent', 'neighbor',
    ]);
    await change('areaPyeong', '25.7');
    await change('priceEok', '10.5');
    expect(host.textContent).toContain('공급 평형이 아닌 전용면적 기준');
    expect(host.textContent).toContain('전용 84.96㎡로 저장됩니다.');
    expect(host.textContent).toContain('10억 5,000만원으로 저장됩니다.');
  });

  it('서버 거절 메시지와 입력값을 유지하고 오류로 포커스한다', async () => {
    submitMock.mockResolvedValue({ status: 'error', message: '계약 정보를 다시 확인해주세요.' });
    await renderPanel();
    await fillReport();
    expect(host.querySelector<HTMLInputElement>('[name="areaPyeong"]')?.value).toBe('25.7');
    await act(async () => { host.querySelector('form')!.requestSubmit(); await settle(); });
    expect(submitMock).toHaveBeenCalledTimes(1);
    expect(host.querySelector<HTMLInputElement>('[name="areaPyeong"]')?.value).toBe('25.7');
    expect(host.querySelector<HTMLInputElement>('[name="priceEok"]')?.value).toBe('10.5');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('계약 정보를 다시 확인해주세요');
    expect(document.activeElement).toBe(host.querySelector('[role="alert"]'));
  });

  it('성공은 검수 대기 접수로 알리고 공개 목록에 즉시 추가하지 않는다', async () => {
    submitMock.mockResolvedValue({ status: 'success', receipt: 'FR-TEST', message: '제보가 접수되었습니다.' });
    await renderPanel();
    await fillReport();
    await act(async () => { host.querySelector('form')!.requestSubmit(); await settle(); });
    const submittedData = submitMock.mock.calls[0][1] as FormData;
    expect(submittedData.get('apartmentId')).toBe('apt-one');
    expect(submittedData.get('areaPyeong')).toBe('25.7');
    expect(submittedData.get('priceEok')).toBe('10.5');
    expect(submittedData.get('area')).toBeNull();
    expect(submittedData.get('price')).toBeNull();
    expect(submittedData.get('source')).toBe('anonymous');
    expect(submittedData.get('consent')).toBe('on');
    expect(submittedData.get('confirmContracted')).toBe('on');
    expect(submittedData.has('monthlyRent')).toBe(false);
    expect(host.textContent).toContain('접수 완료 · 검수 후 공개');
    expect(host.textContent).toContain('FR-TEST');
    expect(host.querySelector('article')).toBeNull();
    expect(host.textContent).toContain('아직 공개된 제보가 없습니다');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('공개 제보 ID와 정해진 사유만 신고한다', async () => {
    fetchMock.mockResolvedValue(response({ status: 'ok', submissionsEnabled: true, reports: [report()] }));
    flagMock.mockResolvedValue({ status: 'success', message: '신고가 접수되었습니다.' });
    await renderPanel();
    await click('신고');
    expect(document.activeElement?.getAttribute('name')).toBe('reason');
    await change('reason', 'false_information');
    await act(async () => { host.querySelector<HTMLFormElement>('form[aria-label="제보 신고"]')!.requestSubmit(); await settle(); });
    const flagData = flagMock.mock.calls[0][1] as FormData;
    expect(flagData.get('reportId')).toBe('report-one');
    expect(flagData.get('reason')).toBe('false_information');
    expect(host.textContent).toContain('신고가 접수되었습니다');
    await click('신고 닫기');
    expect(document.activeElement).toBe(button('신고'));
  });
});

describe('제보 표시 형식', () => {
  it('날짜 경계는 한국 날짜의 90일 전부터 오늘까지다', () => {
    expect(contractDateBounds(new Date('2026-08-30T15:30:00Z'))).toEqual({ min: '2026-06-02', max: '2026-08-31' });
  });
  it('만원을 누락하거나 월세 0원 보증금을 숨기지 않는다', () => {
    expect(formatReportAmount(0)).toBe('0만원');
    expect(formatReportAmount(9500)).toBe('9,500만원');
    expect(formatReportAmount(10000)).toBe('1억원');
    expect(isPublicFieldReport(report({ tradeType: 'monthly', price: 0, monthlyRent: 100 }))).toBe(true);
    expect(isPublicFieldReport(report({ price: -1 }))).toBe(false);
  });
  it('공개 면적은 평을 우선하고 저장 ㎡를 병기한다', () => {
    expect(formatReportArea(84.95)).toEqual({ pyeong: '25.7평', squareMeters: '84.95㎡' });
  });
  it.each(['anonymous', 'field_news'] as const)('새 출처 %s를 유효한 공개 DTO로 받는다', (source) => {
    expect(isPublicFieldReport(report({ source }))).toBe(true);
  });
});
