'use client';

import * as React from 'react';
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import { Button } from './button';
import { cx } from './utils';

interface StateBlockProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}

export function Spinner({ label = 'Carregando' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-white/60" role="status" aria-live="polite">
      <Loader2 size={18} className="animate-spin text-brand-400" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function LoadingState({ title = 'Carregando', description, className }: StateBlockProps) {
  return (
    <div className={cx('flex min-h-40 flex-col items-center justify-center gap-3 text-center', className)}>
      <Loader2 size={28} className="animate-spin text-brand-400" aria-hidden="true" />
      <div role="status" aria-live="polite">
        <p className="text-sm font-bold text-white">{title}</p>
        {description && <p className="mt-1 max-w-[36ch] text-xs leading-relaxed text-white/50">{description}</p>}
      </div>
    </div>
  );
}

export function EmptyDataState({
  title = 'Nada encontrado',
  description,
  actionLabel,
  onAction,
  className,
}: StateBlockProps & { actionLabel?: string; onAction?: () => void }) {
  return (
    <div className={cx('flex min-h-40 flex-col items-center justify-center gap-3 text-center', className)}>
      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/45">
        <Inbox size={20} aria-hidden="true" />
      </div>
      <div>
        <p className="text-sm font-bold text-white">{title}</p>
        {description && <p className="mt-1 max-w-[38ch] text-xs leading-relaxed text-white/50">{description}</p>}
      </div>
      {actionLabel && onAction && <Button onClick={onAction}>{actionLabel}</Button>}
    </div>
  );
}

export function ErrorState({
  title = 'Nao foi possivel carregar',
  description,
  actionLabel = 'Tentar novamente',
  onRetry,
  className,
}: StateBlockProps & { actionLabel?: string; onRetry?: () => void }) {
  return (
    <div
      className={cx('flex min-h-40 flex-col items-center justify-center gap-3 text-center', className)}
      role="alert"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-danger/30 bg-danger/10 text-red-200">
        <AlertTriangle size={20} aria-hidden="true" />
      </div>
      <div>
        <p className="text-sm font-bold text-white">{title}</p>
        {description && <p className="mt-1 max-w-[38ch] text-xs leading-relaxed text-white/50">{description}</p>}
      </div>
      {onRetry && <Button variant="danger" onClick={onRetry}>{actionLabel}</Button>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cx('animate-pulse rounded-md bg-white/[0.07]', className)}
      aria-hidden="true"
    />
  );
}
