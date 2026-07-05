/**
 * MOLIT 실거래 API fetch 헬퍼 — 사이클 Z4
 *
 * 문제: 32개 구 동시 조회 시 MOLIT 가 간헐적으로 에러 XML(rate limit 등)을
 * 200 으로 반환하고, 이것이 Next Data Cache 에 revalidate 주기 동안 저장되어
 * 특정 지역이 "0건" 으로 오염되는 사고 (광주·전남 0건 사례).
 *
 * 대응: 응답에 totalCount 가 없으면 캐시를 우회(no-store)해 1회 재시도.
 * 재시도 응답을 사용하므로 해당 요청은 정상 — 오염 캐시는 주기 만료로 소멸.
 */

export async function fetchMolitXml(url: string, revalidate: number): Promise<string> {
  let xml = '';
  try {
    xml = await fetch(url, { next: { revalidate } }).then((r) => r.text());
  } catch {
    xml = '';
  }

  if (!xml.includes('<totalCount>')) {
    // 에러 응답(또는 오염 캐시) — 신선 조회로 1회 재시도
    try {
      xml = await fetch(url, { cache: 'no-store' }).then((r) => r.text());
    } catch {
      // 재시도 실패 — 호출부 fail-open 로직에 맡김
    }
  }
  return xml;
}
