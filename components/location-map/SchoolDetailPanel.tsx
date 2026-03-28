'use client';

import { X, GraduationCap, Users, Award } from 'lucide-react';
import { useState, useEffect } from 'react';

export interface SchoolData {
  id: string;
  name: string;
  school_level: 'elementary' | 'middle' | 'high';
  address: string;
  latitude: number;
  longitude: number;
  establish_type: string | null;
  coedu_type: string | null;
  student_count: number | null;
  teacher_count: number | null;
  district: string | null;
  grade: string | null;
  nationwide_pct: number | null;
  region_pct: number | null;
  special_high_rate: number | null;
  science_high_rate: number | null;
  foreign_high_rate: number | null;
  autonomous_high_rate: number | null;
}

interface Props {
  school: SchoolData;
  nearbySchools: SchoolData[];
  onClose: () => void;
}

const LEVEL_LABELS: Record<string, string> = {
  elementary: '초등학교',
  middle: '중학교',
  high: '고등학교',
};

const LEVEL_COLORS: Record<string, string> = {
  elementary: '#22C55E',
  middle: '#3B82F6',
  high: '#F97316',
};

function gradeColor(grade: string | null): string {
  switch (grade) {
    case '1': return '#22C55E';
    case '2': return '#86EFAC';
    case '3': return '#F59E0B';
    case '4': return '#FB923C';
    case '5': return '#EF4444';
    default: return '#64748B';
  }
}

export default function SchoolDetailPanel({ school, nearbySchools, onClose }: Props) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const color = LEVEL_COLORS[school.school_level] || '#3B82F6';
  const nearbyMiddle = nearbySchools.filter((s) => s.school_level === 'middle' && s.id !== school.id);

  const panelStyle: React.CSSProperties = isMobile ? {
    position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 100,
    borderRadius: '20px 20px 0 0',
    maxHeight: '75vh', overflowY: 'auto',
  } : {
    position: 'absolute', bottom: '32px', right: '32px', zIndex: 100,
    width: '320px', borderRadius: '20px',
    maxHeight: 'calc(100vh - 128px)', overflowY: 'auto',
  };

  return (
    <div style={{
      ...panelStyle,
      backgroundColor: 'rgba(15,22,41,0.97)',
      border: `1px solid ${color}40`,
      backdropFilter: 'blur(16px)',
      boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      padding: '24px',
    }}>
      {/* 닫기 */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: '16px', right: '16px',
          background: 'rgba(255,255,255,0.08)', border: 'none',
          borderRadius: '8px', width: '28px', height: '28px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: '#94A3B8',
        }}
      >
        <X size={14} />
      </button>

      {/* 학교 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <div style={{
          width: '42px', height: '42px', borderRadius: '12px',
          backgroundColor: color + '20',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <GraduationCap size={22} style={{ color }} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{
              padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
              backgroundColor: color + '22', color,
            }}>
              {LEVEL_LABELS[school.school_level]}
            </span>
            {school.establish_type && (
              <span style={{ fontSize: '11px', color: '#64748B' }}>
                {school.establish_type}
              </span>
            )}
          </div>
          <p style={{ fontSize: '17px', fontWeight: 700, color: '#F1F5F9', marginTop: '2px' }}>
            {school.name}
          </p>
        </div>
      </div>

      {/* 등급 + 배지 */}
      {school.grade && (
        <div style={{
          display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap',
        }}>
          <span style={{
            padding: '6px 14px', borderRadius: '10px',
            fontSize: '14px', fontWeight: 800,
            backgroundColor: gradeColor(school.grade) + '20',
            color: gradeColor(school.grade),
            fontFamily: 'Roboto Mono, monospace',
          }}>
            {school.grade}등급
          </span>
          {school.nationwide_pct != null && (
            <span style={{
              padding: '6px 12px', borderRadius: '10px',
              fontSize: '12px', fontWeight: 600,
              backgroundColor: 'rgba(255,255,255,0.06)',
              color: '#CBD5E1',
            }}>
              전국상위 {school.nationwide_pct}%
            </span>
          )}
          {school.region_pct != null && (
            <span style={{
              padding: '6px 12px', borderRadius: '10px',
              fontSize: '12px', fontWeight: 600,
              backgroundColor: 'rgba(255,255,255,0.06)',
              color: '#CBD5E1',
            }}>
              서울상위 {school.region_pct}%
            </span>
          )}
        </div>
      )}

      {/* 기본 정보 */}
      <div style={{
        padding: '14px', borderRadius: '12px',
        backgroundColor: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        marginBottom: '16px',
      }}>
        <p style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '8px' }}>{school.address}</p>
        <div style={{ display: 'flex', gap: '16px' }}>
          {school.student_count != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Users size={13} style={{ color: '#64748B' }} />
              <span style={{ fontSize: '12px', color: '#CBD5E1' }}>
                {school.student_count.toLocaleString()}명
              </span>
            </div>
          )}
          {school.coedu_type && (
            <span style={{ fontSize: '12px', color: '#64748B' }}>{school.coedu_type}</span>
          )}
        </div>
      </div>

      {/* 특목고 진학률 (중학교만) */}
      {school.school_level === 'middle' && school.autonomous_high_rate != null && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
            <Award size={14} style={{ color: '#F59E0B' }} />
            <p style={{ fontSize: '13px', fontWeight: 700, color: '#F1F5F9' }}>
              특목·자사고 진학률
            </p>
          </div>
          <div style={{
            borderRadius: '12px', overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            {[
              { label: '자사고', rate: school.autonomous_high_rate, icon: '🏫' },
              { label: '과학고', rate: school.science_high_rate, icon: '🔬' },
              { label: '외고', rate: school.foreign_high_rate, icon: '🌏' },
              { label: '특목고(기타)', rate: school.special_high_rate, icon: '🎯' },
            ].map((item, i) => (
              <div key={item.label} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px',
                backgroundColor: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}>
                <span style={{ fontSize: '13px', color: '#CBD5E1' }}>
                  {item.icon} {item.label}
                </span>
                <span style={{
                  fontSize: '14px', fontWeight: 700,
                  fontFamily: 'Roboto Mono, monospace',
                  color: (item.rate ?? 0) > 0 ? '#F59E0B' : '#64748B',
                }}>
                  {item.rate != null ? `${item.rate}%` : '-'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 주변 중학교 (초등학교 선택 시) */}
      {school.school_level === 'elementary' && nearbyMiddle.length > 0 && (
        <div>
          <p style={{ fontSize: '13px', fontWeight: 700, color: '#F1F5F9', marginBottom: '10px' }}>
            📍 주변중학교
          </p>
          <div style={{
            borderRadius: '12px', overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            {/* 헤더 */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 60px',
              padding: '8px 14px', backgroundColor: 'rgba(255,255,255,0.03)',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>주변중학교</span>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>특목·자사고 진학률</span>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textAlign: 'right' }}>등급</span>
            </div>
            {nearbyMiddle.slice(0, 5).map((s, i) => (
              <div key={s.id} style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 60px',
                padding: '10px 14px',
                backgroundColor: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
                borderBottom: '1px solid rgba(255,255,255,0.03)',
              }}>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#3B82F6' }}>{s.name}</p>
                  <p style={{ fontSize: '10px', color: '#64748B' }}>
                    {s.establish_type} {s.coedu_type}
                  </p>
                </div>
                <div style={{ fontSize: '11px', color: '#CBD5E1', lineHeight: '1.6' }}>
                  {s.autonomous_high_rate != null && <div>🏫 자사고 {s.autonomous_high_rate}%</div>}
                  {s.science_high_rate != null && <div>🔬 과학고 {s.science_high_rate}%</div>}
                  {s.foreign_high_rate != null && <div>🌏 외고 {s.foreign_high_rate}%</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  {s.grade && (
                    <span style={{
                      padding: '3px 8px', borderRadius: '6px',
                      fontSize: '13px', fontWeight: 800,
                      backgroundColor: gradeColor(s.grade) + '20',
                      color: gradeColor(s.grade),
                    }}>
                      {s.grade}등급
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
