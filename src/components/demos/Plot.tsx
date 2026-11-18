'use client';

import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

// Chart colors. Series hues are the first two slots of a CVD-validated categorical
// palette; text never wears them (see the legends and tooltips).
export const COLORS = {
  blue: '#2a78d6',
  orange: '#eb6834',
  truth: '#52514e',
  grid: '#e5e7eb',
  axis: '#d1d5db',
  tick: '#6b7280',
  residual: '#9ca3af',
};

export type Scale = (v: number) => number;
export type PlotScales = { x: Scale; y: Scale; left: number; right: number; top: number; bottom: number };

const MARGIN = { top: 8, right: 12, bottom: 38, left: 48 };

/** Round tick values covering [min, max]. */
export function niceTicks(min: number, max: number, count = 5) {
  if (!(max > min)) return [min];
  const raw = (max - min) / Math.max(count - 1, 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return ticks;
}

/** Pads a data extent and snaps it to round values. */
export function niceDomain(values: number[], minSpan = 1, pad = 0.08): [number, number] {
  const finite = values.filter(Number.isFinite);
  let lo = finite.length ? Math.min(...finite) : 0;
  let hi = finite.length ? Math.max(...finite) : 1;
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  const span = hi - lo;
  lo -= span * pad;
  hi += span * pad;
  const ticks = niceTicks(lo, hi, 5);
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : span;
  return [Math.floor(lo / step) * step, Math.ceil(hi / step) * step];
}

export function linePath(points: [number, number][], s: PlotScales) {
  let d = '';
  let pen = false;
  for (const [px, py] of points) {
    if (!Number.isFinite(px) || !Number.isFinite(py)) {
      pen = false;
      continue;
    }
    d += `${pen ? 'L' : 'M'}${s.x(px).toFixed(1)},${s.y(py).toFixed(1)}`;
    pen = true;
  }
  return d;
}

function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(200, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

type PlotProps = {
  title: ReactNode;
  ariaLabel: string;
  height?: number;
  xDomain: [number, number];
  yDomain: [number, number];
  xTicks?: number[];
  yTicks?: number[];
  xLabel?: string;
  formatX?: (v: number) => string;
  formatY?: (v: number) => string;
  /** Snap positions for the crosshair and the tooltip shown at each one. */
  hover?: { xs: number[]; render: (index: number) => ReactNode };
  children: (scales: PlotScales) => ReactNode;
  className?: string;
};

export default function Plot({
  title,
  ariaLabel,
  height = 170,
  xDomain,
  yDomain,
  xTicks,
  yTicks,
  xLabel,
  formatX = (v) => `${+v.toFixed(2)}`,
  formatY = (v) => `${+v.toFixed(2)}`,
  hover,
  children,
  className,
}: PlotProps) {
  const [ref, width] = useWidth<HTMLDivElement>(560);
  const clipId = useId().replace(/:/g, '');
  const [active, setActive] = useState<number | null>(null);

  const left = MARGIN.left;
  const right = width - MARGIN.right;
  const top = MARGIN.top;
  const bottom = height - MARGIN.bottom;
  const [x0, x1] = xDomain;
  const [y0, y1] = yDomain;
  const x: Scale = (v) => left + ((v - x0) / (x1 - x0 || 1)) * (right - left);
  const y: Scale = (v) => bottom - ((v - y0) / (y1 - y0 || 1)) * (bottom - top);
  const scales: PlotScales = { x, y, left, right, top, bottom };
  const xt = xTicks ?? niceTicks(x0, x1, Math.max(4, Math.floor((right - left) / 60)));
  const yt = yTicks ?? niceTicks(y0, y1, 4);

  const hoverCount = hover?.xs.length ?? 0;
  const index = active !== null && active < hoverCount ? active : null;

  const pick = (event: PointerEvent<SVGRectElement>) => {
    if (!hover || !hoverCount) return;
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect) return;
    const px = event.clientX - rect.left;
    let best = 0;
    for (let i = 1; i < hoverCount; i++) if (Math.abs(x(hover.xs[i]) - px) < Math.abs(x(hover.xs[best]) - px)) best = i;
    setActive(best);
  };

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!hoverCount) return;
    const current = index ?? 0;
    const jump = event.shiftKey ? 10 : 1;
    if (event.key === 'ArrowRight') setActive(Math.min(hoverCount - 1, current + jump));
    else if (event.key === 'ArrowLeft') setActive(Math.max(0, current - jump));
    else if (event.key === 'Home') setActive(0);
    else if (event.key === 'End') setActive(hoverCount - 1);
    else if (event.key === 'Escape') setActive(null);
    else return;
    event.preventDefault();
  };

  const crossX = index !== null && hover ? x(hover.xs[index]) : null;
  const tooltipLeft = crossX !== null && crossX > (left + right) / 2;

  return (
    <figure className={cn('min-w-0', className)}>
      <figcaption className='pb-1 text-sm font-medium text-gray-700'>{title}</figcaption>
      <div
        ref={ref}
        className='relative rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600'
        tabIndex={hover ? 0 : undefined}
        role={hover ? 'group' : undefined}
        aria-label={hover ? `${ariaLabel}. Use the left and right arrow keys to read values.` : undefined}
        onKeyDown={hover ? onKey : undefined}
        onFocus={() => hover && index === null && setActive(hoverCount - 1)}
        onBlur={() => setActive(null)}
      >
        {/* Drawn 1:1 once measured; the viewBox keeps the first, unmeasured render inside its column. */}
        <svg viewBox={`0 0 ${width} ${height}`} role='img' aria-label={ariaLabel} className='block h-auto w-full select-none'>
          <defs>
            <clipPath id={clipId}>
              <rect x={left} y={top} width={Math.max(0, right - left)} height={Math.max(0, bottom - top)} />
            </clipPath>
          </defs>
          {yt.map((v) => (
            <g key={`y${v}`}>
              <line x1={left} x2={right} y1={y(v)} y2={y(v)} stroke={COLORS.grid} strokeWidth={1} />
              <text x={left - 6} y={y(v)} dy='0.32em' textAnchor='end' fontSize={12.5} fill={COLORS.tick} className='tabular-nums'>
                {formatY(v)}
              </text>
            </g>
          ))}
          <line x1={left} x2={right} y1={bottom} y2={bottom} stroke={COLORS.axis} strokeWidth={1} />
          {xt.map((v) => (
            <text key={`x${v}`} x={x(v)} y={bottom + 16} textAnchor='middle' fontSize={12.5} fill={COLORS.tick} className='tabular-nums'>
              {formatX(v)}
            </text>
          ))}
          {xLabel && (
            <text x={(left + right) / 2} y={height - 3} textAnchor='middle' fontSize={12.5} fill={COLORS.tick}>
              {xLabel}
            </text>
          )}
          <g clipPath={`url(#${clipId})`}>{children(scales)}</g>
          {crossX !== null && <line x1={crossX} x2={crossX} y1={top} y2={bottom} stroke={COLORS.truth} strokeWidth={1} opacity={0.5} pointerEvents='none' />}
          {hover && (
            <rect
              x={left}
              y={top}
              width={Math.max(0, right - left)}
              height={Math.max(0, bottom - top)}
              fill='transparent'
              style={{ touchAction: 'pan-y' }}
              onPointerMove={pick}
              onPointerDown={pick}
              onPointerLeave={() => setActive(null)}
            />
          )}
        </svg>
        {index !== null && hover && crossX !== null && (
          <div
            className='pointer-events-none absolute z-10 min-w-[9rem] rounded-md border border-gray-200 bg-white/95 px-2.5 py-1.5 text-sm leading-6 text-gray-700 shadow-md'
            style={{ top: top, ...(tooltipLeft ? { right: width - crossX + 10 } : { left: crossX + 10 }) }}
          >
            {hover.render(index)}
          </div>
        )}
      </div>
    </figure>
  );
}

/** A short stroke in the series color, used to key legend and tooltip rows. */
export function LineKey({ color, dashed, dot }: { color: string; dashed?: boolean; dot?: boolean }) {
  return (
    <svg width={18} height={10} aria-hidden='true' className='inline-block shrink-0 align-middle'>
      {dot ? (
        <circle cx={9} cy={5} r={3.5} fill={color} />
      ) : (
        <line x1={1} x2={17} y1={5} y2={5} stroke={color} strokeWidth={2} strokeLinecap='round' strokeDasharray={dashed ? '4 3' : undefined} />
      )}
    </svg>
  );
}

export function TooltipRow({ color, dashed, dot, label, value }: { color: string; dashed?: boolean; dot?: boolean; label: ReactNode; value: ReactNode }) {
  return (
    <div className='flex items-center gap-1.5 whitespace-nowrap'>
      <LineKey color={color} dashed={dashed} dot={dot} />
      <span className='font-semibold tabular-nums text-gray-900'>{value}</span>
      <span className='text-gray-500'>{label}</span>
    </div>
  );
}

export function Legend({ items, className }: { items: { color: string; label: ReactNode; dashed?: boolean; dot?: boolean }[]; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600', className)}>
      {items.map((item, i) => (
        <li key={i} className='flex items-center gap-1.5'>
          <LineKey color={item.color} dashed={item.dashed} dot={item.dot} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
