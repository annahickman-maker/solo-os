import { useEffect, useRef, useState } from 'react';

interface RingProps {
  value: number;
  label: string;
  bigNumber: string | number;
  unit?: string;
  subline?: string;
  size?: 'hero' | 'small' | 'tiny';
  color?: string;
}

export function Ring({
  value,
  label,
  bigNumber,
  unit,
  subline,
  size = 'small',
  color = 'var(--accent)',
}: RingProps) {
  const dimension = size === 'hero' ? 220 : size === 'tiny' ? 64 : 132;
  const stroke = size === 'hero' ? 10 : size === 'tiny' ? 5 : 8;
  const radius = dimension / 2 - stroke;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, value));
  const targetOffset = circumference * (1 - clamped);

  const [offset, setOffset] = useState(circumference);
  const mountedRef = useRef(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setOffset(targetOffset);
      mountedRef.current = true;
    });
    return () => cancelAnimationFrame(raf);
  }, [targetOffset, circumference]);

  const numberSize =
    size === 'hero' ? 'clamp(1.5rem, 6vw, 3.75rem)' :
    size === 'tiny' ? '0.95rem' :
    '1.875rem';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-3)',
        width: '100%',
        minWidth: 0,
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: dimension,
          aspectRatio: '1 / 1',
        }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${dimension} ${dimension}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ transform: 'rotate(-90deg)', display: 'block' }}
        >
          <circle
            cx={dimension / 2}
            cy={dimension / 2}
            r={radius}
            fill="none"
            stroke="var(--ring-track)"
            strokeWidth={stroke}
          />
          <circle
            cx={dimension / 2}
            cy={dimension / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              transition: 'stroke-dashoffset 800ms var(--ease-out)',
            }}
          />
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: numberSize,
              letterSpacing: '-0.04em',
              lineHeight: 0.95,
              color: 'var(--ink)',
            }}
          >
            {bigNumber}
            {unit && (
              <span style={{ fontSize: '0.45em', marginLeft: 2, opacity: 0.55, fontWeight: 600 }}>{unit}</span>
            )}
          </span>
          {subline && (
            <span
              style={{
                fontSize: 'clamp(0.625rem, 1.6vw, 0.75rem)',
                color: 'var(--muted)',
                fontWeight: 500,
                fontVariantNumeric: 'tabular-nums',
                marginTop: 4,
              }}
            >
              {subline}
            </span>
          )}
        </div>
      </div>
      <span
        style={{
          fontSize: 'var(--eyebrow)',
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          fontWeight: 500,
          color: 'var(--muted)',
        }}
      >
        {label}
      </span>
    </div>
  );
}
