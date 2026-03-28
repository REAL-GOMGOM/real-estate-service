'use client';

export interface MapLayer {
  key: string;
  label: string;
  icon: string;
  color: string;
  group: 'school' | 'infra';
}

export const MAP_LAYERS: MapLayer[] = [
  // 학군 그룹
  { key: 'elementary', label: '초', icon: '🏫', color: '#22C55E', group: 'school' },
  { key: 'middle',     label: '중', icon: '🏫', color: '#3B82F6', group: 'school' },
  { key: 'high',       label: '고', icon: '🏫', color: '#F97316', group: 'school' },
  // 인프라 그룹 (향후 확장)
  // { key: 'childcare',  label: '어린이집', icon: '👶', color: '#EC4899', group: 'infra' },
  // { key: 'kindergarten', label: '유치원', icon: '🎒', color: '#A855F7', group: 'infra' },
  // { key: 'library',    label: '도서관', icon: '📚', color: '#06B6D4', group: 'infra' },
  // { key: 'academy',    label: '학원가', icon: '✏️', color: '#F59E0B', group: 'infra' },
  // { key: 'subway',     label: '지하철', icon: '🚇', color: '#6366F1', group: 'infra' },
  // { key: 'redevelopment', label: '재개발', icon: '🏗️', color: '#EF4444', group: 'infra' },
];

interface LayerToggleProps {
  activeLayers: Set<string>;
  onToggle: (key: string) => void;
}

export default function LayerToggle({ activeLayers, onToggle }: LayerToggleProps) {
  const schoolLayers = MAP_LAYERS.filter((l) => l.group === 'school');
  // const infraLayers = MAP_LAYERS.filter((l) => l.group === 'infra');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* 학군 레이어 */}
      <div>
        <p style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', marginBottom: '6px' }}>
          🏫 학군
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {schoolLayers.map((layer) => {
            const active = activeLayers.has(layer.key);
            return (
              <button
                key={layer.key}
                onClick={() => onToggle(layer.key)}
                style={{
                  padding: '6px 14px', borderRadius: '8px',
                  fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                  border: 'none', transition: 'all 0.15s',
                  backgroundColor: active ? layer.color : 'rgba(255,255,255,0.06)',
                  color: active ? 'white' : '#94A3B8',
                  boxShadow: active ? `0 2px 8px ${layer.color}40` : 'none',
                }}
              >
                {layer.icon} {layer.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 인프라 레이어 (향후 활성화)
      <div>
        <p style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', marginBottom: '6px' }}>
          🏙️ 인프라
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {infraLayers.map((layer) => { ... })}
        </div>
      </div>
      */}
    </div>
  );
}
