import { config } from 'dotenv';
config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { categories } from '../lib/db/schema';

/**
 * 카테고리 초기 시드.
 *
 * 멱등성: slug unique constraint를 활용해 onConflictDoNothing.
 * 재실행해도 중복 생성 X.
 *
 * 실행: npm run db:seed
 */

const SEED: Array<{ slug: string; name: string; description: string }> = [
  { slug: 'market-trends', name: '시장 동향', description: '가격, 거래량, 지역별 분석' },
  { slug: 'subscription', name: '청약', description: '분양, 청약 통장, 당첨 가이드' },
  { slug: 'loan', name: '대출', description: '주담대, 전세대출, 금리 동향' },
  { slug: 'tax', name: '세금', description: '양도세, 취득세, 종부세' },
  { slug: 'policy', name: '정책', description: '정부 부동산 정책, 규제' },
];

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) {
    console.error('[seed] DATABASE_URL_UNPOOLED 미설정');
    process.exit(1);
  }

  const db = drizzle(neon(url));

  let inserted = 0;
  let skipped = 0;

  for (const c of SEED) {
    const result = await db
      .insert(categories)
      .values(c)
      .onConflictDoNothing({ target: categories.slug })
      .returning({ id: categories.id });

    if (result.length > 0) {
      inserted++;
      console.log(`  + ${c.slug} (${c.name})`);
    } else {
      skipped++;
      console.log(`  - ${c.slug} (이미 존재, 건너뜀)`);
    }
  }

  console.log('');
  console.log(`✓ 시드 완료: ${inserted}개 추가, ${skipped}개 건너뜀 (총 ${SEED.length}개 시도)`);
}

main().catch((e) => {
  console.error('[seed] 에러:', e);
  process.exit(1);
});
