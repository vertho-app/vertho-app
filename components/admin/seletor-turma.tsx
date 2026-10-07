'use client';

import { useTranslations } from 'next-intl';
import { Filter } from 'lucide-react';
import type { TurmaFiltro } from '@/lib/turmas/escopo-leitura';

/** Valor do seletor para "quem não está em nenhuma turma" (lista de pessoas). */
export const SEM_TURMA = '__sem_turma__';

/**
 * Seletor de turma das telas de admin (Fase 2, temporadas, lista de pessoas).
 *
 * Só aparece com 2 ou mais turmas: empresa de uma turma só segue como antes, sem controle novo.
 * `value` '' = todas. A turma que já passou todo mundo adiante entra com o rótulo "(encerrada)".
 */
export default function SeletorTurma({ turmas, value, onChange, disabled = false, comSemTurma = false, comIcone = true }: {
  turmas: TurmaFiltro[];
  value: string;
  onChange: (turmaId: string) => void;
  disabled?: boolean;
  /** Acrescenta a opção "Sem turma" (só a lista de pessoas tem esse conceito). */
  comSemTurma?: boolean;
  /** Falso quando a tela já desenha o ícone de filtro ao lado. */
  comIcone?: boolean;
}) {
  const t = useTranslations('AdminTurmaFiltro');
  if (turmas.length < 2) return null;
  return (
    <span className="inline-flex items-center gap-2">
      {comIcone && <Filter size={14} className="text-gray-500" aria-hidden="true" />}
      <select
        aria-label={t('aria')}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="px-3 py-1.5 rounded-lg text-xs text-white border border-white/10 outline-none disabled:opacity-50"
        style={{ background: '#091D35' }}
      >
        <option value="">{t('all')}</option>
        {turmas.map((turma) => (
          <option key={turma.id} value={turma.id}>
            {turma.encerrada || turma.ativos === 0 ? t('ended', { name: turma.nome }) : turma.nome}
          </option>
        ))}
        {comSemTurma && <option value={SEM_TURMA}>{t('noTurma')}</option>}
      </select>
    </span>
  );
}
