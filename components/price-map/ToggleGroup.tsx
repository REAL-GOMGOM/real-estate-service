'use client';

interface ToggleGroupProps<T extends string> {
  options: { label: string; value: T }[];
  selected: T;
  onChange: (value: T) => void;
}

export default function ToggleGroup<T extends string>({ options, selected, onChange }: ToggleGroupProps<T>) {
  return (
    <div style={{
      display: 'inline-flex', borderRadius: '10px', overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.1)',
    }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: '8px 18px', fontSize: '13px', fontWeight: 600,
            border: 'none', cursor: 'pointer', transition: 'all 0.15s',
            backgroundColor: selected === opt.value ? '#3B82F6' : 'rgba(255,255,255,0.04)',
            color: selected === opt.value ? 'white' : '#94A3B8',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
