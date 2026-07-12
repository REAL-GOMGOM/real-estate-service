import type { Pt } from '@/lib/svg-smooth';

/**
 * 실거래 공유 이미지 생성 — 사이클 Z4 (의존성 없는 canvas 렌더)
 *
 * 카드 데이터를 900×470 브랜드 카드로 그려 PNG Blob 반환.
 * navigator.share(files) 지원 시 네이티브 공유, 아니면 다운로드 폴백은 호출부에서.
 */

export interface ShareCardData {
  apt:      string;
  location: string;   // "강남구 도곡동"
  price:    string;   // "26.9억"
  delta:    string;   // "▼ 2.1억" ('' 가능)
  up:       boolean;
  meta:     string;   // "60㎡ · 18평 · 22층 · 26.06.27 계약"
  spark:    Pt[];     // 0~100 × 0~56 좌표계
  high:     boolean;
}

const W = 900;
const H = 470;

export async function buildShareImage(data: ShareCardData): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  const scale = 2; // 레티나
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(scale, scale);

  const font = (weight: number, size: number) =>
    `${weight} ${size}px Pretendard, -apple-system, "Apple SD Gothic Neo", sans-serif`;

  // 배경
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#FFFFFF');
  grad.addColorStop(1, '#F3F6FC');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // 브랜드
  ctx.fillStyle = '#1B4DDB';
  ctx.font = font(800, 26);
  ctx.fillText('내집', 48, 66);
  ctx.fillStyle = '#8A94A8';
  ctx.font = font(600, 16);
  ctx.fillText('My.ZIP · 실거래 알림', 106, 66);

  // 신고가 뱃지
  if (data.high) {
    ctx.fillStyle = '#FDECEC';
    const bw = 86;
    roundRect(ctx, W - 48 - bw, 42, bw, 34, 17);
    ctx.fill();
    ctx.fillStyle = '#E23B3B';
    ctx.font = font(700, 16);
    ctx.fillText('신고가', W - 48 - bw + 20, 65);
  }

  // 단지명 · 위치
  ctx.fillStyle = '#14213D';
  ctx.font = font(800, 40);
  ctx.fillText(truncate(ctx, data.apt, W - 96), 48, 146);
  ctx.fillStyle = '#64708A';
  ctx.font = font(500, 19);
  ctx.fillText(data.location, 48, 180);

  // 가격 + 등락
  ctx.fillStyle = '#14213D';
  ctx.font = font(800, 64);
  const priceW = ctx.measureText(data.price).width;
  ctx.fillText(data.price, 48, 268);
  if (data.delta) {
    ctx.fillStyle = data.up ? '#C92F2F' : '#1636A8';
    ctx.font = font(700, 26);
    ctx.fillText(data.delta, 48 + priceW + 16, 262);
  }

  // 메타
  ctx.fillStyle = '#64708A';
  ctx.font = font(500, 18);
  ctx.fillText(data.meta, 48, 306);

  // 스파크라인 (우측 상단 영역)
  if (data.spark.length > 1) {
    const cx = W - 48 - 260;
    const cy = 110;
    const cw = 260;
    const ch = 130;
    ctx.fillStyle = '#FAFBFE';
    roundRect(ctx, cx - 12, cy - 14, cw + 24, ch + 28, 12);
    ctx.fill();
    ctx.strokeStyle = '#E4E9F2';
    ctx.lineWidth = 1;
    roundRect(ctx, cx - 12, cy - 14, cw + 24, ch + 28, 12);
    ctx.stroke();

    ctx.strokeStyle = '#3D4E6E';
    ctx.lineWidth = 2.4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    data.spark.forEach((p, i) => {
      const x = cx + (p.x / 100) * cw;
      const y = cy + (p.y / 56) * ch;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    const last = data.spark[data.spark.length - 1];
    ctx.fillStyle = '#3D4E6E';
    ctx.beginPath();
    ctx.arc(cx + (last.x / 100) * cw, cy + (last.y / 56) * ch, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // 구분선 + 푸터
  ctx.strokeStyle = '#E4E9F2';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(48, H - 84);
  ctx.lineTo(W - 48, H - 84);
  ctx.stroke();

  ctx.fillStyle = '#8A94A8';
  ctx.font = font(500, 16);
  ctx.fillText('출처 국토교통부 실거래가 공개시스템', 48, H - 46);
  ctx.fillStyle = '#1B4DDB';
  ctx.font = font(700, 16);
  const url = 'naezipkorea.com';
  ctx.fillText(url, W - 48 - ctx.measureText(url).width, H - 46);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

// ── 랭킹 리스트 공유 카드 — 사이클 CC ─────────────────────────
//
// 주간 랭킹·주요거래의 TOP N 리스트를 브랜드 카드로.
// 행 수에 따라 높이 가변 (silgga식 캡처 공유 대체 — DOM 캡처 없이 전용 렌더).

export interface RankingShareRow {
  rank:        number;
  name:        string;   // 단지명 · 지역명
  sub?:        string;   // "송파구 · 평균 29.0억"
  value:       string;   // "111건" · "50.2억" · "+2.31%"
  valueSub?:   string;   // "▲ 1.2억 (5.0%)" 등
  valueColor?: string;   // 탭별 강조색 (기본 진네이비)
}

export interface RankingShareData {
  title:    string;   // "거래 TOP · 서울특별시"
  subtitle: string;   // "최근 1년 · 84㎡ 면적 · 2026.07.05 기준"
  rows:     RankingShareRow[];
  source?:  string;   // 기본: 국토교통부 실거래가 공개시스템
}

const MEDAL_TINT: Record<number, { bg: string; fg: string }> = {
  1: { bg: '#FFF6DB', fg: '#B8860B' },
  2: { bg: '#F1F3F7', fg: '#7C8698' },
  3: { bg: '#F9EFE5', fg: '#B06E3B' },
};

export async function buildRankingShareImage(data: RankingShareData): Promise<Blob | null> {
  const rowH = 76;
  const listTop = 208;
  const footerH = 96;
  const width = 900;
  const height = listTop + data.rows.length * rowH + 28 + footerH;

  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(scale, scale);

  const font = (weight: number, size: number) =>
    `${weight} ${size}px Pretendard, -apple-system, "Apple SD Gothic Neo", sans-serif`;

  // 배경
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, '#FFFFFF');
  grad.addColorStop(1, '#F3F6FC');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // 브랜드
  ctx.fillStyle = '#1B4DDB';
  ctx.font = font(800, 26);
  ctx.fillText('내집', 48, 66);
  ctx.fillStyle = '#8A94A8';
  ctx.font = font(600, 16);
  ctx.fillText('My.ZIP · 실거래 랭킹', 106, 66);

  // 타이틀 · 서브
  ctx.fillStyle = '#14213D';
  ctx.font = font(800, 36);
  ctx.fillText(truncate(ctx, data.title, width - 96), 48, 138);
  ctx.fillStyle = '#64708A';
  ctx.font = font(500, 17);
  ctx.fillText(truncate(ctx, data.subtitle, width - 96), 48, 172);

  // 리스트
  data.rows.forEach((row, i) => {
    const top = listTop + i * rowH;
    const cy = top + rowH / 2;

    // 행 구분선
    if (i > 0) {
      ctx.strokeStyle = '#EDF1F8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(48, top);
      ctx.lineTo(width - 48, top);
      ctx.stroke();
    }

    // 순위 뱃지
    const tint = MEDAL_TINT[row.rank];
    ctx.fillStyle = tint?.bg ?? '#F4F6FA';
    roundRect(ctx, 48, cy - 19, 38, 38, 10);
    ctx.fill();
    ctx.fillStyle = tint?.fg ?? '#8A94A8';
    ctx.font = font(800, 18);
    const rankText = String(row.rank);
    ctx.fillText(rankText, 48 + 19 - ctx.measureText(rankText).width / 2, cy + 7);

    // 값 (우측 정렬) — 폭을 먼저 재서 이름 최대폭 산출
    ctx.font = font(800, 26);
    const valueW = ctx.measureText(row.value).width;
    ctx.fillStyle = row.valueColor ?? '#14213D';
    ctx.fillText(row.value, width - 48 - valueW, cy + (row.valueSub ? 0 : 9));
    if (row.valueSub) {
      ctx.fillStyle = '#8A94A8';
      ctx.font = font(500, 14);
      ctx.fillText(row.valueSub, width - 48 - ctx.measureText(row.valueSub).width, cy + 24);
    }

    // 이름 · 서브
    const nameX = 104;
    const nameMax = width - 48 - valueW - nameX - 24;
    ctx.fillStyle = '#14213D';
    ctx.font = font(700, 21);
    ctx.fillText(truncate(ctx, row.name, nameMax), nameX, cy + (row.sub ? 0 : 8));
    if (row.sub) {
      ctx.fillStyle = '#64708A';
      ctx.font = font(500, 14);
      ctx.fillText(truncate(ctx, row.sub, nameMax), nameX, cy + 24);
    }
  });

  // 푸터
  ctx.strokeStyle = '#E4E9F2';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(48, height - 76);
  ctx.lineTo(width - 48, height - 76);
  ctx.stroke();

  ctx.fillStyle = '#8A94A8';
  ctx.font = font(500, 16);
  ctx.fillText(`출처 ${data.source ?? '국토교통부 실거래가 공개시스템'}`, 48, height - 40);
  ctx.fillStyle = '#1B4DDB';
  ctx.font = font(700, 16);
  const url = 'naezipkorea.com';
  ctx.fillText(url, width - 48 - ctx.measureText(url).width, height - 40);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

// ── 실질 가치 비교 공유 카드 — 2026-07-12 ─────────────────────
//
// /dollar 단지 카드를 브랜드 이미지로. 4개 자산(원화·달러·BTC·금)의
// 기준→비교 값 + 변동률 뱃지 + 해석 문장(최대 2줄 랩핑).

export interface RealValueShareRow {
  icon:    string;   // "₩" "$" "₿" "Au"
  label:   string;   // "원화"
  accent:  string;   // 아이콘 색
  baseVal: string;
  compareVal: string;
  pct:     number | null;
}

export interface RealValueShareData {
  apt:      string;
  district: string;
  baseYear: number;
  compareYear: number;
  rows:     RealValueShareRow[];
  insight:  string | null;
}

export async function buildRealValueShareImage(data: RealValueShareData): Promise<Blob | null> {
  const width = 900;
  const rowH = 58;
  const insightH = data.insight ? 96 : 0;
  const height = 190 + data.rows.length * rowH + insightH + 100;

  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(scale, scale);

  const font = (weight: number, size: number) =>
    `${weight} ${size}px Pretendard, -apple-system, "Apple SD Gothic Neo", sans-serif`;

  // 배경
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, '#FFFFFF');
  grad.addColorStop(1, '#F3F6FC');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // 브랜드
  ctx.fillStyle = '#1B4DDB';
  ctx.font = font(800, 26);
  ctx.fillText('내집', 48, 66);
  ctx.fillStyle = '#8A94A8';
  ctx.font = font(600, 16);
  ctx.fillText('My.ZIP · 실질 가치 비교', 106, 66);

  // 기간 뱃지 (우측 상단)
  const period = `${data.baseYear} → ${data.compareYear}`;
  ctx.font = font(700, 16);
  const pw = ctx.measureText(period).width + 40;
  ctx.fillStyle = '#EEF2FB';
  roundRect(ctx, width - 48 - pw, 42, pw, 34, 17);
  ctx.fill();
  ctx.fillStyle = '#1B4DDB';
  ctx.fillText(period, width - 48 - pw + 20, 65);

  // 단지명 · 위치
  ctx.fillStyle = '#14213D';
  ctx.font = font(800, 36);
  ctx.fillText(truncate(ctx, data.apt, width - 96), 48, 140);
  ctx.fillStyle = '#64708A';
  ctx.font = font(500, 18);
  ctx.fillText(data.district, 48, 170);

  // 자산 행
  let y = 214;
  for (const row of data.rows) {
    // 아이콘 칩
    ctx.fillStyle = `${row.accent}22`;
    roundRect(ctx, 48, y - 24, 34, 34, 9);
    ctx.fill();
    ctx.fillStyle = row.accent;
    ctx.font = font(800, 15);
    ctx.fillText(row.icon, 48 + 17 - ctx.measureText(row.icon).width / 2, y - 2);

    ctx.fillStyle = '#64708A';
    ctx.font = font(700, 15);
    ctx.fillText(row.label, 94, y - 2);

    // 값: base → compare
    ctx.fillStyle = '#3D4E6E';
    ctx.font = font(700, 20);
    const baseW = ctx.measureText(row.baseVal).width;
    ctx.fillText(row.baseVal, 170, y);
    ctx.fillStyle = '#B9C1D0';
    ctx.fillText('→', 170 + baseW + 14, y);
    ctx.fillStyle = '#14213D';
    ctx.font = font(800, 20);
    ctx.fillText(row.compareVal, 170 + baseW + 44, y);

    // 변동률 뱃지 (우측 정렬)
    if (row.pct !== null) {
      const up = row.pct >= 0;
      const txt = `${up ? '▲' : '▼'} ${Math.abs(row.pct).toFixed(1)}%`;
      ctx.font = font(800, 17);
      const tw = ctx.measureText(txt).width + 36;
      ctx.fillStyle = up ? 'rgba(111,192,138,0.16)' : 'rgba(232,93,93,0.14)';
      roundRect(ctx, width - 48 - tw, y - 22, tw, 32, 16);
      ctx.fill();
      ctx.fillStyle = up ? '#2E7A4C' : '#C92F2F';
      ctx.fillText(txt, width - 48 - tw + 18, y);
    }

    // 행 구분선
    ctx.strokeStyle = '#E9EDF5';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(48, y + 20);
    ctx.lineTo(width - 48, y + 20);
    ctx.stroke();

    y += rowH;
  }

  // 해석 문장 박스
  if (data.insight) {
    const bx = 48;
    const by = y + 4;
    ctx.fillStyle = '#EEF2FB';
    roundRect(ctx, bx, by, width - 96, 78, 14);
    ctx.fill();
    ctx.fillStyle = '#1B4DDB';
    ctx.font = font(800, 16);
    ctx.fillText('💡', bx + 20, by + 32);
    ctx.fillStyle = '#2C3A55';
    ctx.font = font(600, 16);
    wrapText(ctx, data.insight, bx + 52, by + 32, width - 96 - 72, 26, 2);
  }

  // 푸터
  ctx.strokeStyle = '#E4E9F2';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(48, height - 66);
  ctx.lineTo(width - 48, height - 66);
  ctx.stroke();
  ctx.fillStyle = '#8A94A8';
  ctx.font = font(500, 15);
  ctx.fillText('출처 국토교통부 · 한국은행 ECOS · ₿·Au 환산은 참고용', 48, height - 32);
  ctx.fillStyle = '#1B4DDB';
  ctx.font = font(700, 15);
  const rvUrl = 'naezipkorea.com/dollar';
  ctx.fillText(rvUrl, width - 48 - ctx.measureText(rvUrl).width, height - 32);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/** 단어 단위 줄바꿈 (maxLines 초과분은 말줄임) */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number,
  maxW: number, lineH: number, maxLines: number,
) {
  const words = text.split(' ');
  let line = '';
  let lineNo = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxW && line) {
      if (lineNo === maxLines - 1) {
        ctx.fillText(truncate(ctx, `${line} ${words.slice(i).join(' ')}`, maxW), x, y + lineNo * lineH);
        return;
      }
      ctx.fillText(line, x, y + lineNo * lineH);
      line = words[i];
      lineNo++;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y + lineNo * lineH);
}

/**
 * 공유 이미지 배포 공통 헬퍼 — navigator.share(files) 지원 시 네이티브 공유,
 * 아니면 a[download] 다운로드 폴백. (DealFeed·랭킹·주요거래 공용)
 */
export async function shareOrDownloadImage(blob: Blob, filename: string, title: string): Promise<void> {
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title });
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}
