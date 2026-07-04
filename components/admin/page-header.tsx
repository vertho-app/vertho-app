'use client';

import type { ComponentType, ReactNode } from 'react';
import BackButton from '@/components/back-button';

/**
 * Header padronizado das páginas do admin (Reorganização, Fase 2).
 *
 * Consolida as 4 variantes que existiam (text-lg/xl/2xl, emoji vs ícone,
 * ações espalhadas) no padrão majoritário:
 *   - h1 text-xl font-bold + ícone lucide no accent da página
 *   - subtítulo text-xs cinza
 *   - ações primárias/secundárias SEMPRE à direita do header
 *   - BackButton opcional (linha própria acima, como as telas já usam)
 *
 * Uso:
 *   <AdminPageHeader icon={Trophy} title={t('title')} subtitle={t('subtitle')}
 *     backHref={`/admin/empresas/${id}`} actions={<Button .../>} />
 */
export default function AdminPageHeader({
  icon: Icon,
  iconClassName = 'text-cyan-400',
  title,
  subtitle,
  backHref,
  backLabel,
  actions,
  className,
}: {
  icon?: ComponentType<{ size?: number | string; className?: string }>;
  iconClassName?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <>
      {backHref && <BackButton href={backHref} label={backLabel} />}
      <div className={`flex items-start justify-between gap-3 flex-wrap mb-6 ${className ?? ''}`}>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            {Icon && <Icon size={20} className={iconClassName} />}
            <span className="min-w-0">{title}</span>
          </h1>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
      </div>
    </>
  );
}
