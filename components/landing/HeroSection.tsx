'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, MapPin, BarChart3, TrendingUp } from 'lucide-react';

const FLOATING_STATS = [
  { label: '강남구 평균', value: '28.4억', change: '+2.1%' },
  { label: '서초구 평균', value: '24.7억', change: '+1.8%' },
  { label: '마포구 평균', value: '12.3억', change: '+3.2%' },
];

export default function HeroSection() {
  return (
    <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingTop: '64px', backgroundColor: '#0A0E1A' }}>

      {/* 배경 블러 효과 */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: '25%', left: '50%', transform: 'translate(-50%, -50%)', width: '700px', height: '500px', borderRadius: '50%', opacity: 0.18, filter: 'blur(80px)', background: 'radial-gradient(circle, #3B82F6 0%, transparent 70%)' }} />
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: '350px', height: '350px', borderRadius: '50%', opacity: 0.1, filter: 'blur(60px)', background: 'radial-gradient(circle, #22C55E 0%, transparent 70%)' }} />
        {/* 그리드 패턴 */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.04, backgroundImage: 'linear-gradient(rgba(59,130,246,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.5) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 10, maxWidth: '1280px', margin: '0 auto', padding: '0 24px', textAlign: 'center' }}>

        {/* 상단 뱃지 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 18px', borderRadius: '999px', fontSize: '13px', fontWeight: 500, backgroundColor: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', color: '#60A5FA', marginBottom: '36px' }}
        >
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#60A5FA', animation: 'pulse 2s infinite' }} />
          2026년 3월 서울 입지 데이터 업데이트 완료
        </motion.div>

        {/* 메인 헤드라인 */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          style={{ fontSize: 'clamp(40px, 7vw, 80px)', fontWeight: 800, lineHeight: 1.15, color: '#F1F5F9', marginBottom: '24px', letterSpacing: '-0.02em' }}
        >
          부동산 투자의<br />
          <span style={{ color: '#3B82F6' }}>모든 데이터</span>를<br />
          한눈에
        </motion.h1>

        {/* 서브카피 */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          style={{ fontSize: '18px', color: '#CBD5E1', lineHeight: 1.8, maxWidth: '560px', margin: '0 auto 48px' }}
        >
          시세 차트 분석부터 입지 점수 지도, 청약 정보까지.<br />
          데이터 기반으로 더 스마트한 부동산 결정을 내리세요.
        </motion.p>

        {/* CTA 버튼 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '80px' }}
        >
          <Link
            href="/location-map"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '16px 32px', borderRadius: '14px', fontSize: '16px', fontWeight: 600, backgroundColor: '#3B82F6', color: 'white', textDecoration: 'none', boxShadow: '0 0 40px rgba(59,130,246,0.3)' }}
          >
            <MapPin size={20} />
            입지 지도 보기
            <ArrowRight size={18} />
          </Link>
          <Link
            href="/market"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '16px 32px', borderRadius: '14px', fontSize: '16px', fontWeight: 600, backgroundColor: 'rgba(255,255,255,0.06)', color: '#F1F5F9', textDecoration: 'none', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            <BarChart3 size={20} />
            시세 분석 보기
          </Link>
        </motion.div>

        {/* 플로팅 통계 카드 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '16px' }}>
          {FLOATING_STATS.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5 + index * 0.1 }}
              style={{ padding: '20px 28px', borderRadius: '20px', backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)', textAlign: 'left' }}
            >
              <p style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '6px' }}>{stat.label}</p>
              <p style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'Roboto Mono, monospace', color: '#F1F5F9', marginBottom: '4px' }}>{stat.value}</p>
              <p style={{ fontSize: '12px', fontWeight: 600, color: '#22C55E', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <TrendingUp size={12} />
                {stat.change}
              </p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* 스크롤 인디케이터 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        style={{ position: 'absolute', bottom: '32px', left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}
      >
        <span style={{ fontSize: '11px', color: '#475569' }}>스크롤</span>
        <div style={{ width: '1px', height: '48px', background: 'linear-gradient(to bottom, rgba(59,130,246,0.6), transparent)' }} />
      </motion.div>
    </section>
  );
}