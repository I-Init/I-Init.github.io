'use client';

import clsx from 'clsx';
import type { ReactNode } from 'react';
import { useId } from 'react';

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className='min-w-0'>
      <div className='pb-1 text-sm font-medium text-gray-700'>{label}</div>
      <div role='radiogroup' aria-label={label} className='inline-flex flex-wrap gap-1 rounded-full border border-gray-300 bg-white p-0.5'>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type='button'
              role='radio'
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={clsx(
                'rounded-full px-3 py-1 text-sm font-semibold transition md:text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary-600',
                selected ? 'bg-primary-600 text-white' : 'text-gray-700 hover:text-primary-700'
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  hint,
}: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <div className='min-w-0'>
      <div className='flex items-baseline justify-between gap-2 pb-1 text-sm'>
        <label htmlFor={id} className='font-medium text-gray-700'>
          {label}
        </label>
        <output htmlFor={id} className='font-semibold tabular-nums text-gray-900'>
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type='range'
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={format(value)}
        onChange={(event) => onChange(Number(event.target.value))}
        className='block h-6 w-full cursor-pointer accent-primary-600'
      />
      {hint && <p className='pt-0.5 text-sm text-gray-500'>{hint}</p>}
    </div>
  );
}

export function DemoButton({
  children,
  onClick,
  primary,
  disabled,
  icon,
}: {
  children: ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition md:text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:cursor-not-allowed disabled:opacity-50',
        primary
          ? 'border-primary-600 bg-primary-600 text-white hover:bg-primary-700'
          : 'border-gray-300 bg-white text-gray-800 hover:border-primary-600 hover:text-primary-700'
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function Stat({ label, value, detail, status, wide }: { label: ReactNode; value: ReactNode; detail?: ReactNode; status?: ReactNode; wide?: boolean }) {
  return (
    <div className={clsx('min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2', wide && 'col-span-2')}>
      <div className='text-sm text-gray-600'>{label}</div>
      <div className='flex flex-wrap items-baseline gap-x-2'>
        <span className='text-xl font-semibold text-gray-900'>{value}</span>
        {status}
      </div>
      {detail && <div className='text-sm text-gray-500'>{detail}</div>}
    </div>
  );
}

export function DemoCard({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <article className='min-w-0 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:p-6'>
      <h3 className='pb-2 text-gray-800'>{title}</h3>
      {children}
    </article>
  );
}

/** Read at the moment an animation starts, so it is safe to call outside render. */
export function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
