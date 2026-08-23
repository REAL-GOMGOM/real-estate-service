import { createHash } from 'node:crypto';
// 상대경로 import — Next 라우트 + 로컬 스크립트(tsx) 양쪽 재사용 (별칭 비의존)
import { normalizeMLTMName } from './normalize-mltm-name';
import { decodeXmlEntities } from './xml-entities';
import type { NewSilvTransactionRow } from './db/schema';

/**
 * MOLIT 분양권전매 XML 전체 필드 파서 — 분양권 DB 적재 (2026-08-02).
 *
 * lib/silv-shared.ts 의 parseSilvXml 은 조회용(면적 반올림·층 폴백)이라
 * 적재에 필요한 원값을 버린다. 적재는 이 파서를 쓴다 (rent 파서와 동일 원리).
 * 취소(해제)는 매매와 동일하게 cdealType='O' 플래그로 보존.
 */

const SEP = '|';
const CANCELED_FLAG = 'O';

export interface MolitSilvItem {
  aptNm: string;
  excluUseAr: string;
  dealAmount: string;
  dealYear: string;
  dealMonth: string;
  dealDay: string;
  floor: string;
  buildYear: string;
  umdNm: string;
  jibun: string;
  cdealType: string;
  cdealDay: string;
}

/** XML 문자열(여러 페이지 join 가능)에서 <item> 을 전체 필드로 파싱 */
export function parseSilvXmlFull(xml: string): MolitSilvItem[] {
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
  return items.map((item) => {
    const get = (tag: string) =>
      item.match(new RegExp('<' + tag + '>([^<]*)<\\/' + tag + '>'))?.[1]?.trim() ?? '';
    return {
      aptNm:      decodeXmlEntities(get('aptNm')),
      excluUseAr: get('excluUseAr'),
      dealAmount: get('dealAmount'),
      dealYear:   get('dealYear'),
      dealMonth:  get('dealMonth'),
      dealDay:    get('dealDay'),
      floor:      get('floor'),
      buildYear:  get('buildYear'),
      umdNm:      get('umdNm'),
      jibun:      get('jibun'),
      cdealType:  get('cdealType'),
      cdealDay:   get('cdealDay'),
    };
  });
}

/** 분양권 자연키 md5 해시 (32자 hex) — 취소 통보도 동일 키 (플래그만 갱신) */
export function buildSilvDedupeKey(f: {
  lawdCd: string; umdNm: string; jibun: string;
  aptNameNorm: string; areaM2: number; floor: number | null;
  dealDate: string; dealAmount: number;
}): string {
  const raw = [
    f.lawdCd.trim(), f.umdNm.trim(), f.jibun.trim(), f.aptNameNorm.trim(),
    f.areaM2.toFixed(2), f.floor == null ? '' : String(f.floor),
    f.dealDate.trim(), String(f.dealAmount),
  ].join(SEP);
  return createHash('md5').update(raw).digest('hex');
}

/** 파싱된 MOLIT 분양권 item → silv_transactions 적재 행. 필수값 없으면 null */
export function molitItemToSilvRow(
  item: MolitSilvItem,
  ctx: { lawdCd: string; sigungu: string },
): NewSilvTransactionRow | null {
  const dealAmount = parseInt(item.dealAmount.replace(/,/g, ''), 10);
  const areaM2     = parseFloat(item.excluUseAr);
  const aptName    = item.aptNm;
  const year       = item.dealYear;

  if (!dealAmount || !areaM2 || !aptName || !year) return null;

  const month = item.dealMonth.padStart(2, '0');
  const day   = (item.dealDay || '0').padStart(2, '0');
  const dealDate = `${year}-${month}-${day}`;

  const floorParsed = parseInt(item.floor, 10);
  const floor       = Number.isFinite(floorParsed) ? floorParsed : null;

  return {
    dedupeKey: buildSilvDedupeKey({
      lawdCd: ctx.lawdCd, umdNm: item.umdNm, jibun: item.jibun,
      aptNameNorm: normalizeMLTMName(aptName), areaM2, floor,
      dealDate, dealAmount,
    }),
    lawdCd:  ctx.lawdCd,
    sigungu: ctx.sigungu,
    umdNm:   item.umdNm,
    aptName,
    areaM2,
    floor,
    buildYear: parseInt(item.buildYear, 10) || null,
    dealDate,
    dealAmount,
    isCanceled:   item.cdealType.trim() === CANCELED_FLAG,
    canceledDate: item.cdealDay.trim() || null,
  };
}
