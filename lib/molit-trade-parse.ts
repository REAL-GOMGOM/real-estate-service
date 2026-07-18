// 상대경로 import — 이 파일은 Next 라우트와 로컬 백필 스크립트(tsx) 양쪽에서
// 재사용되므로, tsx 별칭(@/) 해석에 의존하지 않도록 상대경로를 쓴다.
import { normalizeMLTMName } from './normalize-mltm-name';
import { buildDedupeKey } from './tx-dedupe-key';
import { decodeXmlEntities } from './xml-entities';
import type { NewTransaction } from './db/schema';

/**
 * MOLIT 매매 실거래 XML 전체 필드 파서 — Phase 2 (자체 DB 적재).
 *
 * /api/transactions 의 인라인 파서는 조회에 필요한 필드만 뽑고 취소·지번·
 * 등기일 등을 버린다. DB 적재는 이 필드들이 필요하므로(취소 처리·복합키)
 * 원본 <item> 을 전체 필드로 파싱하는 별도 함수를 둔다. 기존 조회 파서는
 * 건드리지 않는다. 파싱 방식은 기존 라우트와 동일한 정규식 스타일.
 *
 * server-only 를 import 하지 않으므로 로컬 백필 스크립트에서도 사용 가능.
 */

export interface MolitTradeItem {
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
  sggCd: string;
  cdealType: string;  // 해제 거래면 'O'
  cdealDay: string;   // 해제사유발생일
  dealingGbn: string; // 중개거래 / 직거래
  rgstDate: string;   // 등기일자
}

/** XML 문자열(여러 페이지 join 가능)에서 <item> 을 전체 필드로 파싱 */
export function parseTradeXml(xml: string): MolitTradeItem[] {
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
      sggCd:      get('sggCd'),
      cdealType:  get('cdealType'),
      cdealDay:   get('cdealDay'),
      dealingGbn: get('dealingGbn'),
      rgstDate:   get('rgstDate'),
    };
  });
}

const CANCELED_FLAG = 'O';

/**
 * 파싱된 MOLIT item → transactions 적재 행.
 * 필수값(금액·면적·단지명·연도) 없으면 null 반환 (조회 파서와 동일 가드).
 * @param ctx lawdCd = 조회 LAWD_CD(5자리), sigungu = 사이트 표기 시군구
 */
export function molitItemToTransaction(
  item: MolitTradeItem,
  ctx: { lawdCd: string; sigungu: string },
): NewTransaction | null {
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
  const buildYear   = parseInt(item.buildYear, 10) || null;
  const jibun       = item.jibun || null;
  const aptNameNorm = normalizeMLTMName(aptName);

  return {
    dedupeKey: buildDedupeKey({
      lawdCd: ctx.lawdCd, umdNm: item.umdNm, jibun,
      aptNameNorm, areaM2, floor, dealDate, dealAmount,
    }),
    lawdCd:       ctx.lawdCd,
    sigungu:      ctx.sigungu,
    umdNm:        item.umdNm,
    jibun,
    aptName,
    aptNameNorm,
    masterId:     null,
    areaM2,
    floor,
    buildYear,
    dealDate,
    dealAmount,
    dealType:     'buy',
    dealingGbn:   item.dealingGbn || null,
    rgstDate:     item.rgstDate || null,
    isCanceled:   item.cdealType.trim() === CANCELED_FLAG,
    canceledDate: item.cdealDay ? item.cdealDay.trim() : null,
    source:       'molit',
  };
}
