'use client';

import { useRef, useEffect, useState, useCallback } from 'react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export default function BottomSheet({ isOpen, onClose, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const currentY = useRef(0);
  const [height, setHeight] = useState(35); // vh 단위 (미니: 35, 풀: 70)
  const [dragging, setDragging] = useState(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    currentY.current = height;
    setDragging(true);
  }, [height]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging) return;
    const diff = startY.current - e.touches[0].clientY;
    const vh = window.innerHeight / 100;
    const newHeight = Math.max(0, Math.min(85, currentY.current + diff / vh));
    setHeight(newHeight);
  }, [dragging]);

  const handleTouchEnd = useCallback(() => {
    setDragging(false);
    // 스냅: 닫힘(<15), 미니(35), 풀(70)
    if (height < 15) {
      onClose();
      setHeight(35);
    } else if (height < 50) {
      setHeight(35);
    } else {
      setHeight(70);
    }
  }, [height, onClose]);

  useEffect(() => {
    if (isOpen) setHeight(35);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* 배경 오버레이 */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 99,
          backgroundColor: height > 50 ? 'rgba(0,0,0,0.3)' : 'transparent',
          transition: dragging ? 'none' : 'background-color 0.3s',
          pointerEvents: height > 50 ? 'auto' : 'none',
        }}
      />

      {/* 시트 */}
      <div
        ref={sheetRef}
        style={{
          position: 'fixed',
          bottom: 0, left: 0, right: 0,
          height: `${height}vh`,
          zIndex: 100,
          backgroundColor: 'var(--bg-card)',
          borderRadius: '20px 20px 0 0',
          border: '1px solid var(--border)',
          borderBottom: 'none',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
          transition: dragging ? 'none' : 'height 0.3s ease-out',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* 드래그 핸들 */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            padding: '12px 0 8px',
            cursor: 'grab',
            display: 'flex',
            justifyContent: 'center',
            flexShrink: 0,
            touchAction: 'none',
          }}
        >
          <div style={{
            width: '40px', height: '4px', borderRadius: '2px',
            backgroundColor: 'var(--border)',
          }} />
        </div>

        {/* 콘텐츠 */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0 20px 20px',
          WebkitOverflowScrolling: 'touch',
        }}>
          {children}
        </div>
      </div>
    </>
  );
}
