'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cx } from './utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantClass: Record<ButtonVariant, string> = {
  primary:
    'border-transparent bg-brand-400 text-navy-deep hover:bg-brand-300 focus-visible:outline-brand-300',
  secondary:
    'border-white/10 bg-white/[0.04] text-white hover:border-brand-400/50 hover:bg-brand-400/10 focus-visible:outline-brand-300',
  ghost:
    'border-transparent bg-transparent text-white/70 hover:bg-white/[0.06] hover:text-white focus-visible:outline-brand-300',
  danger:
    'border-danger/35 bg-danger/10 text-red-100 hover:bg-danger/20 focus-visible:outline-danger',
};

const sizeClass: Record<ButtonSize, string> = {
  sm: 'min-h-8 px-3 text-xs',
  md: 'min-h-10 px-4 text-sm',
  icon: 'h-9 w-9 p-0',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    className,
    variant = 'secondary',
    size = 'md',
    loading = false,
    loadingLabel,
    leftIcon,
    rightIcon,
    disabled,
    type = 'button',
    ...props
  },
  ref,
) {
  const isDisabled = disabled || loading;
  const iconOnly = size === 'icon';

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-md border font-bold transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-55',
        sizeClass[size],
        variantClass[variant],
        className,
      )}
      {...props}
    >
      {loading ? (
        <Loader2 size={iconOnly ? 16 : 14} className="animate-spin" aria-hidden="true" />
      ) : (
        leftIcon
      )}
      {!iconOnly && <span className="min-w-0 truncate">{loading && loadingLabel ? loadingLabel : children}</span>}
      {!loading && rightIcon}
    </button>
  );
});
