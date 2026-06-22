import * as React from 'react';
import { cx } from './utils';

type SurfaceTone = 'default' | 'muted' | 'accent';

export interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: SurfaceTone;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const toneClass: Record<SurfaceTone, string> = {
  default: 'border-white/[0.08]',
  muted: 'border-white/[0.06]',
  accent: 'border-brand-400/25',
};

const paddingClass: Record<NonNullable<SurfaceProps['padding']>, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-5 md:p-6',
};

export function Surface({
  children,
  className,
  tone = 'default',
  padding = 'md',
  ...props
}: SurfaceProps) {
  return (
    <div
      className={cx(
        'rounded-md border backdrop-blur-xl',
        'bg-[linear-gradient(140deg,rgba(255,255,255,.035),rgba(255,255,255,.01))]',
        toneClass[tone],
        paddingClass[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function SurfaceHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('mb-4 flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="truncate text-sm font-bold text-white">{title}</h2>
        {description && <p className="mt-1 text-[11px] leading-relaxed text-white/45">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
