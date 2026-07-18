/**
 * 전월세 공용 타입·파서 — 사이클 II (전세·월세 탭)
 *
 * MOLIT RTMSDataSvcAptRent XML → RentTransaction. 순수 함수 (단위 테스트 대상).
 * 전세 = monthlyRent 0, 월세 = monthlyRent > 0.
 */
import type { ShareCardData } from '@/lib/share-image';
import type { Pt } from '@/lib/svg-smooth';
import { decodeXmlEntities } from '@/lib/xml-entities';

export interface RentTransaction {
  aptName:      string;
  district:     string;
  dong:         string;
  area:         number;          // 반올림 ㎡
  floor:        number;
  deposit:      number;          // 보증금 (만원)
  monthlyRent:  number;          // 월세 (만원, 0이면 전세)
  date:         string;          // 계약일 YYYY-MM-DD
  buildYear:    number | null;
  contractType: string;          // '신규' | '갱신' | ''
  prevDeposit:      number | null;  // 갱신 계약의 종전 보증금
  prevMonthlyRent:  number | null;  // 갱신 계약의 종전 월세
}

export interface RentAptGroup {
  id:           string;
  name:         string;
  district:     string;
  dong:         string | null;
  buildYear:    number | null;
  areas:        number[];
  transactions: RentTransaction[];
  /** 전체 계약 수 — API 가 페이로드 절감을 위해 transactions 를 자른 경우의 원본 건수 */
  txCount?:     number;
  /** 조회 기간 내 최고 보증금·최고 월세 (만원) — 슬라이스 전 전체 거래 기준, 정렬용 (v2) */
  maxDeposit?:      number;
  maxMonthlyRent?:  number;
}

export function isJeonse(tx: Pick<RentTransaction, 'monthlyRent'>): boolean {
  return tx.monthlyRent === 0;
}

/** "5억" / "1억 2,000/120만" 표기 — 목록·카드 공용 */
export function fmtRentPrice(tx: Pick<RentTransaction, 'deposit' | 'monthlyRent'>, fmt: (n: number) => string): string {
  if (tx.monthlyRent === 0) return fmt(tx.deposit);
  return `${fmt(tx.deposit)}/${tx.monthlyRent.toLocaleString()}만`;
}

function toInt(raw: string): number {
  const n = parseInt(raw.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** MOLIT 전월세 XML → 거래 배열 (불량 행 제외) */
export function parseRentXml(xml: string, district: string): RentTransaction[] {
  const out: RentTransaction[] = [];
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];

  for (const item of items) {
    const get = (tag: string) =>
      item.match(new RegExp('<' + tag + '>([^<]*)<\\/' + tag + '>'))?.[1]?.trim() ?? '';

    const aptNm   = decodeXmlEntities(get('aptNm'));
    const area    = parseFloat(get('excluUseAr'));
    const deposit = toInt(get('deposit'));
    const year    = get('dealYear');
    // 보증금 0 계약(간혹 오류 데이터)·필수 필드 누락 행은 제외
    if (!aptNm || !area || !deposit || !year) continue;

    const month = get('dealMonth').padStart(2, '0');
    const day   = get('dealDay').padStart(2, '0');
    const prevDeposit = toInt(get('preDeposit'));
    const prevMonthly = toInt(get('preMonthlyRent'));

    out.push({
      aptName:      aptNm,
      district,
      dong:         get('umdNm'),
      area:         Math.round(area),
      floor:        parseInt(get('floor')) || 1,
      deposit,
      monthlyRent:  toInt(get('monthlyRent')),
      date:         year + '-' + month + (day !== '00' ? '-' + day : ''),
      buildYear:    parseInt(get('buildYear')) || null,
      contractType: get('contractType'),
      prevDeposit:      prevDeposit > 0 ? prevDeposit : null,
      prevMonthlyRent:  prevMonthly > 0 ? prevMonthly : null,
    });
  }
  return out;
}

/** 단지별 그룹핑 — 매매 AptGroup 과 같은 규칙 (거래 많은 순 정렬은 호출부) */
export function groupRentTransactions(txs: RentTransaction[]): RentAptGroup[] {
  const grouped: Record<string, RentAptGroup> = {};
  for (const tx of txs) {
    if (!grouped[tx.aptName]) {
      grouped[tx.aptName] = {
        id:           tx.aptName.replace(/\s/g, '-'),
        name:         tx.aptName,
        district:     tx.district,
        dong:         tx.dong || null,
        buildYear:    tx.buildYear,
        areas:        [],
        transactions: [],
      };
    }
    const g = grouped[tx.aptName];
    g.transactions.push(tx);
    if (!g.areas.includes(tx.area)) g.areas.push(tx.area);
    if (!g.buildYear && tx.buildYear) g.buildYear = tx.buildYear;
  }
  return Object.values(grouped);
}

// === 전월세 그룹 정렬 (전월세 v2 — 월세 정렬) ===

export type RentSortKey = 'volume' | 'date' | 'deposit' | 'monthly';

/**
 * 그룹 정렬 — 서버 집계값(txCount/maxDeposit/maxMonthlyRent) 우선,
 * 없으면 내려온 거래로 폴백 (배포 경계·구 캐시 응답에도 안전).
 * 원본 배열은 변경하지 않는다.
 */
export function sortRentGroups(groups: RentAptGroup[], key: RentSortKey): RentAptGroup[] {
  const txCount = (g: RentAptGroup) => g.txCount ?? g.transactions.length;
  const latestDate = (g: RentAptGroup) =>
    g.transactions.reduce((m, t) => (t.date > m ? t.date : m), '');
  const maxDeposit = (g: RentAptGroup) =>
    g.maxDeposit ?? g.transactions.reduce((m, t) => Math.max(m, t.deposit), 0);
  const maxMonthly = (g: RentAptGroup) =>
    g.maxMonthlyRent ?? g.transactions.reduce((m, t) => Math.max(m, t.monthlyRent), 0);

  const sorted = [...groups];
  switch (key) {
    case 'date':    return sorted.sort((a, b) => latestDate(b).localeCompare(latestDate(a)));
    case 'deposit': return sorted.sort((a, b) => maxDeposit(b) - maxDeposit(a));
    case 'monthly': return sorted.sort((a, b) => maxMonthly(b) - maxMonthly(a));
    case 'volume':
    default:        return sorted.sort((a, b) => txCount(b) - txCount(a));
  }
}

// === 전월세 공유 이미지 카드 매핑 (상세 모달 → buildShareImage) ===

export interface RentShareCardInput {
  aptName:  string;
  district: string;
  dong:     string | null;
  /** 최신순 정렬 + 모달의 면적 필터가 적용된 거래 목록 */
  filtered: RentTransaction[];
  /** 만원 → "26.9억" 표기 (호출부에서 fmtPrice 주입 — fmtRentPrice 와 동일 패턴) */
  fmt:      (n: number) => string;
  /** YYYY-MM-DD → "26.06.27" 표기 */
  fmtDate:  (d: string) => string;
}

/**
 * 보증금 스파크 좌표 — 매매 buildSparkPts 와 동일 좌표계 (x 3~97, y 7~49).
 * 모달에서 보고 있는 필터 상태 그대로를 그린다 (대표면적 재선택 없음).
 * 시간축 정규화, 계약일이 전부 같으면 인덱스 균등 배치. 2건 미만이면 빈 배열.
 */
export function rentSparkPts(filtered: RentTransaction[]): Pt[] {
  if (filtered.length < 2) return [];
  const asc = [...filtered].sort((a, b) => a.date.localeCompare(b.date));
  const times = asc.map((t) => new Date(t.date).getTime());
  const t0 = times[0];
  const tSpan = times[times.length - 1] - t0;
  const deposits = asc.map((t) => t.deposit);
  const min = Math.min(...deposits);
  const span = Math.max(...deposits) - min || 1;
  return asc.map((tx, i) => ({
    x: 3 + (tSpan > 0 ? (times[i] - t0) / tSpan : i / (asc.length - 1)) * 94,
    y: 7 + (1 - (tx.deposit - min) / span) * 42,
  }));
}

/**
 * 전월세 상세 모달 → 공유 이미지 카드 데이터.
 *
 * - 가격: 전세 "5.2억" / 월세 "1억 2,000/120만" (fmtRentPrice)
 * - 등락: 전세만 — 동일 유형·유사 면적(±6㎡) 직전 계약 보증금 대비.
 *   월세는 보증금·월세 2차원 가격이라 스칼라 등락 표기를 생략한다.
 * - 신고가 뱃지(high)는 매매 전용 개념이라 항상 false.
 * - 거래가 없으면 null.
 */
export function buildRentShareCard(input: RentShareCardInput): ShareCardData | null {
  const { aptName, district, dong, filtered, fmt, fmtDate } = input;
  const latest = filtered[0];
  if (!latest) return null;

  const jeonse = isJeonse(latest);
  let delta = '';
  let up = true;
  if (jeonse) {
    const prev = filtered.find(
      (t) => t !== latest && isJeonse(t) && Math.abs(t.area - latest.area) <= 6,
    );
    if (prev) {
      const diff = latest.deposit - prev.deposit;
      if (diff !== 0) {
        delta = `${diff > 0 ? '▲' : '▼'} ${fmt(Math.abs(diff))}`;
        up = diff > 0;
      }
    }
  }

  const kind = jeonse ? '전세' : '월세';
  const renewal = latest.contractType === '갱신' ? ' · 갱신' : '';
  return {
    apt:      aptName,
    location: `${district}${dong ? ' ' + dong : ''}`,
    price:    fmtRentPrice(latest, fmt),
    delta,
    up,
    meta:     `${kind} · ${latest.area}㎡ · ${Math.round(latest.area / 3.3058)}평 · ${latest.floor}층 · ${fmtDate(latest.date)} 계약${renewal}`,
    spark:    rentSparkPts(filtered),
    high:     false,
  };
}
