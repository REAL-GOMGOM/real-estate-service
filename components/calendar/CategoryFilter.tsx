'use client';

import { CATEGORY_MAP, type EventCategory } from '@/types/calendar';

interface CategoryFilterProps {
  activeCategories: Set<EventCategory>;
  onToggle: (category: EventCategory) => void;
}

export default function CategoryFilter({ activeCategories, onToggle }: CategoryFilterProps) {
  const categories = Object.values(CATEGORY_MAP);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
      {categories.map((cat) => {
        const active = activeCategories.has(cat.key);
        return (
          <button
            key={cat.key}
            onClick={() => onToggle(cat.key)}
            style={{
              padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
              cursor: 'pointer', border: 'none', transition: 'all 0.15s',
              backgroundColor: active ? cat.color + '22' : 'rgba(255,255,255,0.04)',
              color: active ? cat.color : '#64748B',
              outline: active ? `1.5px solid ${cat.color}55` : '1.5px solid transparent',
            }}
          >
            {cat.icon} {cat.label}
          </button>
        );
      })}
    </div>
  );
}
