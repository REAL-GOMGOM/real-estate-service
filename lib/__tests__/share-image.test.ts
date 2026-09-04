// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { safePngFilename, shareOrDownloadImage } from '../share-image';

class TestClipboardItem {
  constructor(readonly data: Record<string, Blob>) {}
}

describe('shareOrDownloadImage', () => {
  const blob = new Blob(['png'], { type: 'image/png' });
  const createObjectURL = vi.fn(() => 'blob:test-image');
  const revokeObjectURL = vi.fn();
  const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click');

  function installNavigator(options: {
    canShare?: ((data: ShareData) => boolean) | undefined;
    share?: ((data: ShareData) => Promise<void>) | undefined;
    clipboardWrite?: ((items: ClipboardItems) => Promise<void>) | undefined;
  } = {}) {
    const canShare = Object.hasOwn(options, 'canShare') ? options.canShare : vi.fn(() => false);
    const share = Object.hasOwn(options, 'share') ? options.share : vi.fn().mockResolvedValue(undefined);
    const clipboardWrite = Object.hasOwn(options, 'clipboardWrite')
      ? options.clipboardWrite
      : vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      ...(canShare ? { canShare } : {}),
      ...(share ? { share } : {}),
      clipboard: clipboardWrite ? { write: clipboardWrite } : undefined,
    });
    return { canShare, share, clipboardWrite };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    anchorClick.mockReset();
    anchorClick.mockImplementation(function (this: HTMLAnchorElement) {
      expect(document.body.contains(this)).toBe(true);
    });
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    vi.stubGlobal('ClipboardItem', TestClipboardItem);
    document.body.replaceChildren();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('stops after a successful native file share', async () => {
    const nav = installNavigator({ canShare: vi.fn(() => true) });
    await shareOrDownloadImage(blob, '우리집.png', '우리집');
    expect(nav.canShare).toHaveBeenCalledExactlyOnceWith({ files: [expect.any(File)] });
    expect(nav.share).toHaveBeenCalledExactlyOnceWith({ files: [expect.any(File)], title: '우리집' });
    expect(nav.clipboardWrite).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('treats AbortError as an intentional cancellation without fallback side effects', async () => {
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    const nav = installNavigator({ canShare: vi.fn(() => true), share: vi.fn().mockRejectedValue(abort) });
    await shareOrDownloadImage(blob, '우리집.png', '우리집');
    expect(nav.share).toHaveBeenCalledOnce();
    expect(nav.clipboardWrite).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('copies PNG and downloads when native file sharing is unavailable', async () => {
    const nav = installNavigator({ canShare: vi.fn(() => false) });
    await shareOrDownloadImage(blob, '우리집.png', '우리집');
    expect(nav.share).not.toHaveBeenCalled();
    expect(nav.clipboardWrite).toHaveBeenCalledOnce();
    const clipboardItem = (nav.clipboardWrite as ReturnType<typeof vi.fn>).mock.calls[0][0][0] as TestClipboardItem;
    expect(clipboardItem.data).toEqual({ 'image/png': blob });
    expect(anchorClick).toHaveBeenCalledOnce();
  });

  it('falls back when canShare throws', async () => {
    const nav = installNavigator({ canShare: vi.fn(() => { throw new Error('unsupported'); }) });
    await shareOrDownloadImage(blob, '우리집.png', '우리집');
    expect(nav.share).not.toHaveBeenCalled();
    expect(nav.clipboardWrite).toHaveBeenCalledOnce();
    expect(anchorClick).toHaveBeenCalledOnce();
  });

  it('falls back after a non-Abort native share rejection', async () => {
    const nav = installNavigator({
      canShare: vi.fn(() => true),
      share: vi.fn().mockRejectedValue(Object.assign(new Error('not allowed'), { name: 'NotAllowedError' })),
    });
    await shareOrDownloadImage(blob, '우리집.png', '우리집');
    expect(nav.clipboardWrite).toHaveBeenCalledOnce();
    expect(anchorClick).toHaveBeenCalledOnce();
  });

  it('downloads even when clipboard image writing rejects', async () => {
    const nav = installNavigator({ clipboardWrite: vi.fn().mockRejectedValue(new Error('permission denied')) });
    await expect(shareOrDownloadImage(blob, '우리집.png', '우리집')).resolves.toBeUndefined();
    expect(nav.clipboardWrite).toHaveBeenCalledOnce();
    expect(anchorClick).toHaveBeenCalledOnce();
  });

  it('downloads when native share and image clipboard APIs do not exist', async () => {
    installNavigator({ canShare: undefined, share: undefined, clipboardWrite: undefined });
    vi.stubGlobal('ClipboardItem', undefined);
    await shareOrDownloadImage(blob, '우리집.png', '우리집');
    expect(anchorClick).toHaveBeenCalledOnce();
  });

  it('attaches and removes the anchor, then revokes the object URL after a delay', async () => {
    installNavigator();
    await shareOrDownloadImage(blob, '우리집.png', '우리집');
    expect(createObjectURL).toHaveBeenCalledExactlyOnceWith(blob);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(999);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:test-image');
  });

  it('uses the sanitized filename for native sharing and downloads', async () => {
    const native = installNavigator({ canShare: vi.fn(() => true) });
    await shareOrDownloadImage(blob, 'CON. ', 'title');
    const sharedFile = (native.share as ReturnType<typeof vi.fn>).mock.calls[0][0].files?.[0];
    expect(sharedFile?.name).toBe('_CON.png');

    installNavigator();
    anchorClick.mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('강남_래미안_______.png');
    });
    await shareOrDownloadImage(blob, '강남/래미안:*?"<>|.png', 'title');
    expect(anchorClick).toHaveBeenCalledOnce();
  });
});

describe('safePngFilename', () => {
  it.each([
    ['강남/래미안:*?"<>|.png', '강남_래미안_______.png'],
    ['CON.png', '_CON.png'],
    ['lpt9.report.png', '_lpt9.report.png'],
    ['name...   .png', 'name.png'],
    ['   .png', 'naezip-image.png'],
    ['normal.PNG', 'normal.png'],
  ])('normalizes %s for Windows to %s', (input, expected) => {
    expect(safePngFilename(input)).toBe(expected);
  });
});
