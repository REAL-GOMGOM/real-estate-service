import { createHash } from 'node:crypto';
// 상대경로 import — Next 라우트 + 로컬 백필 스크립트(tsx) 양쪽 재사용 (별칭 비의존)
import { normalizeMLTMName } from './normalize-mltm-name';
import { decodeXmlEntities } from './xml-entities';
import type { NewRentTransactionRow } from './db/schema';

/**
 * MOLIT 전월세 XML 전체 필드 파서 — 전월세 DB 적재 (2026-07-18).
 *
 * lib/rent-shared.ts 의 parseRentXml 은 조회용(면적 반올림 등 정규화)이라
 * DB 적재에 필요한 원값(면적 소수·지번)을 버린다. 적재는 이 파서를 쓴다.
 * 기존 조회 파서는 건드리지 않는다.
 *
 * dedupeKey: 자연키의 md5 해시 — 매매(tx-dedupe-key)와 동일 원리지만
 * 전월세는 행수가 2.5배라 긴 텍스트 PK 대신 32자 해시로 스토리지를 아낀다.
 * 갱신·재통보는 동일 자연키 → 같은 해시 → upsert 로 기존 행 갱신.
 */

const SEP = '|';

export interface MolitRentItem {
  aptNm: string;
  excluUseAr: string;
  deposit: string;
  monthlyRent: string;
  dealYear: string;
  dealMonth: string;
  dealDay: string;
  floor: string;
  buildYear: string;
  umdNm: string;
  jibun: string;
  contractType: string;
  preDeposit: string;
  preMonthlyRent: string;
}

/** XML 문자열(여러 페이지 join 가능)에서 <item> 을 전체 필드로 파싱 */
export function parseRentXmlFull(xml: string): MolitRentItem[] {
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
  return items.map((item) => {
    const get = (tag: string) =>
      item.match(new RegExp('<' + tag + '>([^<]*)<\\/' + tag + '>'))?.[1]?.trim() ?? '';
    return {
      aptNm:          decodeXmlEntities(get('aptNm')),
      excluUseAr:     get('excluUseAr'),
      deposit:        get('deposit'),
      monthlyRent:    get('monthlyRent'),
      dealYear:       get('dealYear'),
      dealMonth:      get('dealMonth'),
      dealDay:        get('dealDay'),
      floor:          get('floor'),
      buildYear:      get('buildYear'),
      umdNm:          get('umdNm'),
      jibun:          get('jibun'),
      contractType:   get('contractType'),
      preDeposit:     get('preDeposit'),
      preMonthlyRent: get('preMonthlyRent'),
    };
  });
}

function toInt(raw: string): number {
  const n = parseInt(raw.replace(/,/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

/** 전월세 자연키 md5 해시 (32자 hex) — 결정적, 갱신 통보도 동일 키 */
export function buildRentDedupeKey(f: {
  lawdCd: string; umdNm: string; jibun: string;
  aptNameNorm: string; areaM2: number; floor: number | null;
  dealDate: string; deposit: number; monthlyRent: number;
}): string {
  const raw = [
    f.lawdCd.trim(), f.umdNm.trim(), f.jibun.trim(), f.aptNameNorm.trim(),
    f.areaM2.toFixed(2), f.floor == null ? '' : String(f.floor),
    f.dealDate.trim(), String(f.deposit), String(f.monthlyRent),
  ].join(SEP);
  return createHash('md5').update(raw).digest('hex');
}

/**
 * 파싱된 MOLIT 전월세 item → rent_transactions 적재 행.
 * 필수값(단지명·면적·보증금·연도) 없으면 null (조회 파서와 동일 가드 —
 * 보증금 0 계약은 오류 데이터로 간주해 제외).
 */
export function molitItemToRentRow(
  item: MolitRentItem,
  ctx: { lawdCd: string; sigungu: string },
): NewRentTransactionRow | null {
  const deposit = toInt(item.deposit);
  const areaM2  = parseFloat(item.excluUseAr);
  const aptName = item.aptNm;
  const year    = item.dealYear;

  if (!deposit || !areaM2 || !aptName || !year) return null;

  const month = item.dealMonth.padStart(2, '0');
  const day   = (item.dealDay || '0').padStart(2, '0');
  const dealDate = `${year}-${month}-${day}`;

  const floorParsed = parseInt(item.floor, 10);
  const floor       = Number.isFinite(floorParsed) ? floorParsed : null;
  const monthlyRent = toInt(item.monthlyRent);
  const prevDeposit = toInt(item.preDeposit);
  const prevMonthly = toInt(item.preMonthlyRent);

  return {
    dedupeKey: buildRentDedupeKey({
      lawdCd: ctx.lawdCd, umdNm: item.umdNm, jibun: item.jibun,
      aptNameNorm: normalizeMLTMName(aptName), areaM2, floor,
      dealDate, deposit, monthlyRent,
    }),
    lawdCd:  ctx.lawdCd,
    sigungu: ctx.sigungu,
    umdNm:   item.umdNm,
    aptName,
    areaM2,
    floor,
    buildYear: parseInt(item.buildYear, 10) || null,
    dealDate,
    deposit,
    monthlyRent,
    contractType:    item.contractType || null,
    prevDeposit:     prevDeposit > 0 ? prevDeposit : null,
    prevMonthlyRent: prevMonthly > 0 ? prevMonthly : null,
  };
}
