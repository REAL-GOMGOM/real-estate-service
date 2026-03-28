'use client';

import { X, ExternalLink } from 'lucide-react';
import { CATEGORY_MAP, type CalendarEvent } from '@/types/calendar';

interface EventDetailModalProps {
  event: CalendarEvent;
  onClose: () => void;
}

export default function EventDetailModal({ event, onClose }: EventDetailModalProps) {
  const cat = CATEGORY_MAP[event.category];

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#111827', borderRadius: '16px',
          border: '1px solid rgba(255,255,255,0.1)',
          padding: '28px', maxWidth: '440px', width: '100%',
          boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              width: '40px', height: '40px', borderRadius: '12px',
              backgroundColor: cat.color + '20', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '20px',
            }}>
              {event.icon || cat.icon}
            </span>
            <div>
              <span style={{
                display: 'inline-block', padding: '2px 8px', borderRadius: '6px',
                fontSize: '11px', fontWeight: 600,
                backgroundColor: cat.color + '22', color: cat.color,
                marginBottom: '4px',
              }}>
                {cat.label}
              </span>
              {event.importance === 'high' && (
                <span style={{
                  marginLeft: '6px', padding: '2px 6px', borderRadius: '4px',
                  fontSize: '10px', fontWeight: 700,
                  backgroundColor: 'rgba(239,68,68,0.15)', color: '#EF4444',
                }}>
                  중요
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '32px', height: '32px', borderRadius: '8px', border: 'none',
              backgroundColor: 'rgba(255,255,255,0.06)', color: '#94A3B8',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* 제목 */}
        <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#F1F5F9', marginBottom: '8px' }}>
          {event.title}
        </h3>

        {/* 날짜 */}
        <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '16px' }}>
          {event.event_date}
        </p>

        {/* 설명 */}
        {event.description && (
          <p style={{
            fontSize: '14px', color: '#CBD5E1', lineHeight: '1.6',
            padding: '14px', borderRadius: '10px',
            backgroundColor: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            marginBottom: '16px',
          }}>
            {event.description}
          </p>
        )}

        {/* 원본 링크 */}
        {event.source_url && (
          <a
            href={event.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              fontSize: '13px', color: '#3B82F6', textDecoration: 'none',
            }}
          >
            <ExternalLink size={14} />
            원본 보기
          </a>
        )}
      </div>
    </div>
  );
}
