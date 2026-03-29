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
      border: '1px solid var(--border)',
    }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: '8px 18px', fontSize: '13px', fontWeight: 600,
            border: 'none', cursor: 'pointer', transition: 'all 0.15s',
            backgroundColor: selected === opt.value ? 'var(--accent)' : 'var(--border-light)',
            color: selected === opt.value ? 'white' : 'var(--text-muted)',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
