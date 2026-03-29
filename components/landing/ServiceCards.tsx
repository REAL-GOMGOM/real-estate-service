'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { BarChart3, MapPin, Home, ArrowRight } from 'lucide-react';

const SERVICES = [
  {
    icon: BarChart3,
    title: '시세 차트 분석',
    description: '서울 및 수도권 주요 지역의 실거래가 시세를 차트로 분석하세요. 이동평균, 거래량, 변동률을 한눈에 확인합니다.',
    href: '/market',
    color: 'var(--accent)',
    badge: '실시간 업데이트',
  },
  {
    icon: MapPin,
    title: '입지 점수 지도',
    description: '매월 업데이트되는 서울 전역 입지 점수를 지도 위에서 확인하세요. 상승·하락 트렌드와 함께 최적의 입지를 찾아보세요.',
    href: '/location-map',
    color: '#22C55E',
    badge: '26년 3월 업데이트',
  },
  {
    icon: Home,
    title: '청약 정보',
    description: '수도권 청약 일정, 경쟁률, 분양가 정보를 한 곳에서 확인하세요. 관심 단지를 설정하고 마감일 알림을 받으세요.',
    href: '/subscription',
    color: '#F59E0B',
    badge: '일정 관리',
  },
];

export default function ServiceCards() {
  return (
    <section style={{ padding: '96px 0', backgroundColor: 'var(--bg-primary)' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px' }}>

        {/* 섹션 헤더 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          style={{ textAlign: 'center', marginBottom: '64px' }}
        >
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '16px' }}>
            토탈 부동산 서비스
          </h2>
          <p style={{ fontSize: '17px', color: 'var(--text-secondary)' }}>투자 결정에 필요한 모든 데이터를 제공합니다</p>
        </motion.div>

        {/* 카드 그리드 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
          {SERVICES.map((service, index) => {
            const Icon = service.icon;
            return (
              <motion.div
                key={service.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Link href={service.href} style={{ textDecoration: 'none', display: 'block', height: '100%' }}>
                  <div style={{ height: '100%', padding: '36px', borderRadius: '20px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', transition: 'transform 0.2s, border-color 0.2s' }}>

                    {/* 아이콘 */}
                    <div style={{ width: '56px', height: '56px', borderRadius: '16px', backgroundColor: `${service.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
                      <Icon size={28} style={{ color: service.color }} />
                    </div>

                    {/* 뱃지 */}
                    <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 500, backgroundColor: `${service.color}15`, color: service.color, marginBottom: '16px' }}>
                      {service.badge}
                    </span>

                    {/* 제목 */}
                    <h3 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
                      {service.title}
                    </h3>

                    {/* 설명 */}
                    <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.8, marginBottom: '28px' }}>
                      {service.description}
                    </p>

                    {/* 링크 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 600, color: service.color }}>
                      자세히 보기
                      <ArrowRight size={16} />
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}