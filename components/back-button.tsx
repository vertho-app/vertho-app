'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

/**
 * Botão de "Voltar" padronizado — sempre alinhado ao topo-direito do conteúdo
 * da página (linha própria). Centraliza posição, ícone, tamanho e rótulo pra
 * todas as telas (dashboard + admin), evitando a inconsistência de cada tela
 * posicionar o botão de um jeito.
 *
 * Ação padrão: router.back(). Passe `href` para navegar a uma rota fixa, ou
 * `onClick` para uma ação custom (tem prioridade sobre `href`).
 */
interface BackButtonProps {
  href?: string;
  onClick?: () => void;
  /** Sobrescreve o texto padrão "Voltar" (ex.: "Dashboard", "Voltar para empresa"). */
  label?: string;
  /** Ajustes pontuais de espaçamento do wrapper (ex.: "mb-6"). */
  className?: string;
}

export default function BackButton({ href, onClick, label, className }: BackButtonProps) {
  const router = useRouter();
  const t = useTranslations('Common');
  const handle = onClick ?? (href ? () => router.push(href) : () => router.back());

  return (
    <div className={`flex justify-end ${className ?? 'mb-4'}`}>
      <button
        onClick={handle}
        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
      >
        <ArrowLeft size={16} /> {label ?? t('actions.back')}
      </button>
    </div>
  );
}
