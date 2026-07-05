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
