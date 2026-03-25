// BTC·금 현재 시세 proxy — CoinGecko free tier, 5분 서버 캐시
// PAXG(PAX Gold) = 순금 1 troy oz 연동 토큰 → 실제 금 현물가와 동일하게 움직임
const TROY_OZ_TO_GRAM = 31.1035;

export async function GET() {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,pax-gold&vs_currencies=usd,krw',
      { next: { revalidate: 300 } },
    );
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);

    const json = await res.json() as {
      bitcoin?:  { usd?: number; krw?: number };
      'pax-gold'?: { usd?: number; krw?: number };
    };

    const goldKrwPerOz = json['pax-gold']?.krw ?? null;
    const goldUsdPerOz = json['pax-gold']?.usd ?? null;

    return Response.json({
      btcUsd:        json.bitcoin?.usd    ?? null,
      btcKrw:        json.bitcoin?.krw    ?? null,
      // 금: 1 troy oz → 그램 단위로 변환 (UI에서 "₩XXX,XXX/g" 표시)
      goldUsdPerGram: goldUsdPerOz != null ? Math.round((goldUsdPerOz / TROY_OZ_TO_GRAM) * 100) / 100 : null,
      goldKrwPerGram: goldKrwPerOz != null ? Math.round(goldKrwPerOz / TROY_OZ_TO_GRAM) : null,
      updatedAt:     Date.now(),
    });
  } catch {
    return Response.json(
      { btcUsd: null, btcKrw: null, goldUsdPerGram: null, goldKrwPerGram: null, updatedAt: null, error: '시세 조회 실패' },
      { status: 503 },
    );
  }
}
