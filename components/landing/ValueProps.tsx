import { FileText, Sparkles, Home } from 'lucide-react';
import { BRAND } from '@/lib/design-tokens';
import { Reveal } from '@/components/shared/Reveal';

const PROPS = [
  {
    icon: FileText,
    title: '공식 데이터 기반',
    desc: '국토교통부·한국부동산원·NEIS 공식 데이터를 가공 없이 전달합니다.',
  },
  {
    icon: Sparkles,
    title: '누구나 쉽게',
    desc: '복잡한 부동산 데이터를 한 눈에 보이는 시각 자료로 압축합니다.',
  },
  {
    icon: Home,
    title: '당신의 첫 집을 위해',
    desc: '내 집 마련이라는 긴 여정, 매달 업데이트되는 신뢰 가능한 길잡이.',
  },
] as const;

export function ValueProps() {
  return (
    <section
      style={{
        background: `linear-gradient(180deg, ${BRAND.bg} 0%, ${BRAND.paper} 100%)`,
        padding: 'clamp(40px, 8vw, 80px) 0',
      }}
    >
      <div style={{ maxWidth: 'var(--container-default)', margin: '0 auto', padding: '0 var(--page-padding)' }}>
        {/* 제목 */}
        <Reveal>
          <h2
            className="text-center mb-14"
            style={{
              fontSize: 'clamp(24px, 4vw, 36px)',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: BRAND.ink,
            }}
          >
            왜 <span style={{ color: BRAND.terracotta }}>내집</span>인가
          </h2>
        </Reveal>

        {/* 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {PROPS.map((p, i) => {
            const Icon = p.icon;
            return (
              <Reveal key={p.title} delay={i * 120} className="text-center">
                <div
                  className="inline-flex items-center justify-center w-14 h-14 rounded-2xl border mb-5"
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderColor: BRAND.line,
                  }}
                >
                  <Icon size={26} strokeWidth={1.5} style={{ color: BRAND.terracotta }} />
                </div>
                <h3
                  className="text-lg font-bold mb-3"
                  style={{ color: BRAND.ink }}
                >
                  {p.title}
                </h3>
                <p
                  className="text-sm leading-relaxed mx-auto"
                  style={{ color: BRAND.inkSoft, maxWidth: '280px' }}
                >
                  {p.desc}
                </p>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
