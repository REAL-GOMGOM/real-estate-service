// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildShareImage, type ShareCardData } from '../share-image';
import { PARTIAL_TRANSACTION_NOTICE } from '../tx-share-text';

const data: ShareCardData = {
  apt: '우리집 2차 (A&B)',
  location: '강남구 대치동',
  price: '15.5억',
  delta: '▲ 6,000만',
  up: true,
  meta: '134㎡ · 41평 · 9층 · 26.07.08 계약',
  spark: [{ x: 0, y: 56 }, { x: 100, y: 0 }],
  high: true,
  pricePerPy: '평당 3,824만',
  peakLine: '3년 내 최고가 · 종전 14.9억 +6,000만',
};

describe('buildShareImage data completeness', () => {
  const blob = new Blob(['rendered-png'], { type: 'image/png' });
  const fillText = vi.fn<CanvasRenderingContext2D['fillText']>();
  const context = {
    scale: vi.fn(),
    fillRect: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fillText,
    measureText: vi.fn((text: string) => ({ width: text.length * 18 })),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arcTo: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
  };

  beforeEach(() => {
    fillText.mockClear();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((callback) => callback(blob));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves the existing default rendering including high badge, delta and peak line', async () => {
    await expect(buildShareImage(data)).resolves.toBe(blob);
    const defaultCalls = fillText.mock.calls.map((call) => [...call]);
    expect(defaultCalls.map(([text]) => text)).toEqual([
      '내집',
      'My.ZIP · 실거래 알림',
      '신고가',
      data.apt,
      data.location,
      data.price,
      data.delta,
      data.meta,
      `${data.pricePerPy}  ·  ${data.peakLine}`,
      '출처 국토교통부 실거래가 공개시스템',
      'naezipkorea.com',
    ]);

    fillText.mockClear();
    await buildShareImage({ ...data, dataComplete: true });
    expect(fillText.mock.calls).toEqual(defaultCalls);
  });

  it('retains actual contract details while independently suppressing supplied partial-data claims', async () => {
    await expect(buildShareImage({ ...data, dataComplete: false })).resolves.toBe(blob);
    const text = fillText.mock.calls.map(([value]) => value);

    expect(text).toContain(data.apt);
    expect(text).toContain(data.location);
    expect(text).toContain(data.price);
    expect(text).toContain(data.meta);
    expect(text).toContain(data.pricePerPy);
    expect(text).toContain('naezipkorea.com');
    expect(text).toContain(PARTIAL_TRANSACTION_NOTICE);
    expect(text).not.toContain(data.delta);
    expect(text).not.toContain(data.peakLine);
    expect(text.join('\n')).not.toMatch(/🔥|신고가|최고가|경신/);
    expect(fillText).toHaveBeenCalledWith(PARTIAL_TRANSACTION_NOTICE, 48, 370);
  });

  it('renders the complete limitation on a separate visible row even when the per-pyeong text is truncated', async () => {
    await buildShareImage({
      ...data,
      dataComplete: false,
      pricePerPy: `평당 ${'123,456만 · '.repeat(30)}`,
    });
    const perPyeong = fillText.mock.calls.find(([text]) => text.startsWith('평당'))!;
    const notices = fillText.mock.calls.filter(([text]) => text === PARTIAL_TRANSACTION_NOTICE);

    expect(perPyeong[0]).toMatch(/…$/);
    expect(perPyeong[0]).not.toContain(PARTIAL_TRANSACTION_NOTICE);
    expect(notices).toHaveLength(1);
    const [notice, x, y] = notices[0];
    expect(notice).not.toContain('…');
    expect(context.measureText(notice).width).toBeLessThanOrEqual(900 - 96);
    expect(x).toBe(48);
    expect(y).toBeGreaterThan(perPyeong[2] + 16);
    expect(y).toBeLessThan(470 - 84);
  });

  it('always draws the limitation even when callers supply no comparison or per-pyeong line', async () => {
    await buildShareImage({
      ...data,
      dataComplete: false,
      high: false,
      delta: '',
      peakLine: undefined,
      pricePerPy: undefined,
    });
    expect(fillText.mock.calls.filter(([text]) => text === PARTIAL_TRANSACTION_NOTICE)).toHaveLength(1);
    expect(fillText).toHaveBeenCalledWith(PARTIAL_TRANSACTION_NOTICE, 48, 370);
  });
});
