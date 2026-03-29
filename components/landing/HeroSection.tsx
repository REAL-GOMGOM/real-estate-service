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
    <section style={{ position: 'relative', minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingTop: '64px', background: 'var(--gradient-main)' }}>

      {/* 배경 패턴 */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: '20%', right: '10%', width: '400px', height: '400px', borderRadius: '50%', opacity: 0.15, filter: 'blur(80px)', background: 'radial-gradient(circle, #F5DDD5 0%, transparent 70%)' }} />
        <div style={{ position: 'absolute', bottom: '10%', left: '5%', width: '300px', height: '300px', borderRadius: '50%', opacity: 0.1, filter: 'blur(60px)', background: 'radial-gradient(circle, #6B8F71 0%, transparent 70%)' }} />
        {/* 그리드 패턴 */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.04, backgroundImage: 'linear-gradient(var(--accent-border) 1px, transparent 1px), linear-gradient(90deg, var(--accent-border) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 10, maxWidth: '1280px', margin: '0 auto', padding: '0 24px', textAlign: 'center' }}>

        {/* 상단 뱃지 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 18px', borderRadius: '999px', fontSize: '13px', fontWeight: 500, backgroundColor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#FFFFFF', marginBottom: '36px' }}
        >
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#FFFFFF', animation: 'pulse 2s infinite' }} />
          2026년 3월 실거래 데이터 업데이트 완료
        </motion.div>

        {/* 메인 헤드라인 */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          style={{ fontSize: 'clamp(36px, 6vw, 64px)', fontWeight: 800, lineHeight: 1.2, color: '#FFFFFF', marginBottom: '24px', letterSpacing: '-0.02em', textShadow: '0 1px 2px rgba(0,0,0,0.1)' }}
        >
          부동산의 모든 답,<br />
          <span style={{ color: '#FFF3D6' }}>한곳에 압축</span>
          <br />
          <span style={{ fontSize: 'clamp(20px, 3vw, 32px)', fontWeight: 600, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.05em' }}>
            내집(My.ZIP)
          </span>
        </motion.h1>

        {/* 서브카피 */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          style={{ fontSize: '17px', color: 'rgba(255,255,255,0.9)', lineHeight: 1.7, maxWidth: '520px', margin: '0 auto 40px' }}
        >
          집값이 궁금할 때, 투자할 지 고민될 때, 우리 동네 뭐가 생기는지 알고 싶을 때 —<br />
          <strong style={{ fontWeight: 800 }}>{'\u2018'}내집{'\u2019'}</strong>이 모든 답을 쉽게 전해드립니다.
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
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '16px 32px', borderRadius: '14px', fontSize: '16px', fontWeight: 700, backgroundColor: '#FFFFFF', color: '#C4654A', textDecoration: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}
          >
            <MapPin size={20} />
            부동산 지도 보기
            <ArrowRight size={18} />
          </Link>
          <Link
            href="/market"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '16px 32px', borderRadius: '14px', fontSize: '16px', fontWeight: 600, backgroundColor: 'transparent', color: '#FFFFFF', textDecoration: 'none', border: '2px solid rgba(255,255,255,0.5)' }}
          >
            <BarChart3 size={20} />
            실거래가 조회
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
              style={{ padding: '20px 28px', borderRadius: '20px', backgroundColor: 'var(--border-light)', border: '1px solid var(--border)', backdropFilter: 'blur(12px)', textAlign: 'left' }}
            >
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>{stat.label}</p>
              <p style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'Roboto Mono, monospace', color: 'var(--text-primary)', marginBottom: '4px' }}>{stat.value}</p>
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
        <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>스크롤</span>
        <div style={{ width: '1px', height: '48px', background: 'linear-gradient(to bottom, rgba(59,130,246,0.6), transparent)' }} />
      </motion.div>
    </section>
  );
}