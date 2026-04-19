/**
 * xlsx → CSV 변환 스크립트
 *
 * data/research/입지등급_v2_종합분석_20260418.xlsx 의 시트를 CSV로 추출:
 *   - "전체122_14컬럼"   → data/research/scored_base.csv
 *   - "민감도_4시나리오"  → data/research/scored_sensitivity.csv
 *
 * 사용법: npm run extract:csv
 */

import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const XLSX_PATH = path.join(
  process.cwd(),
  'data/research/입지등급_v2_종합분석_20260418.xlsx',
);
const OUT_DIR = path.join(process.cwd(), 'data/research');

const SHEETS: [string, string][] = [
  ['전체122_14컬럼', 'scored_base.csv'],
  ['민감도_4시나리오', 'scored_sensitivity.csv'],
];

// UTF-8 BOM
const BOM = '\uFEFF';

function main() {
  if (!fs.existsSync(XLSX_PATH)) {
    console.error(`❌ xlsx 파일을 찾을 수 없습니다: ${XLSX_PATH}`);
    console.error(
      '   Claude.ai 대화에서 다운로드한 뒤 data/research/에 배치하세요.',
    );
    process.exit(1);
  }

  const wb = XLSX.readFile(XLSX_PATH);
  console.log(`📖 시트 목록: ${wb.SheetNames.join(', ')}\n`);

  for (const [sheetName, outFile] of SHEETS) {
    const ws = wb.Sheets[sheetName];
    if (!ws) {
      console.error(`❌ 시트 "${sheetName}" 을 찾을 수 없습니다.`);
      console.error(`   실제 시트: ${wb.SheetNames.join(', ')}`);
      continue;
    }

    const csv = XLSX.utils.sheet_to_csv(ws);
    const outPath = path.join(OUT_DIR, outFile);
    fs.writeFileSync(outPath, BOM + csv, 'utf-8');

    // 통계 출력
    const lines = csv.split('\n').filter((l) => l.trim());
    const headers = lines[0]?.split(',') ?? [];
    const stats = fs.statSync(outPath);

    console.log(`✅ ${outFile}`);
    console.log(`   크기: ${stats.size.toLocaleString()} bytes`);
    console.log(`   행 수: ${lines.length} (헤더 포함)`);
    console.log(`   헤더: ${headers.join(' | ')}`);
    console.log(`   --- 첫 5행 ---`);
    for (const line of lines.slice(0, 6)) {
      console.log(`   ${line}`);
    }
    console.log('');
  }

  console.log('🎉 변환 완료');
}

main();
