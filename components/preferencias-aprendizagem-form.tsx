'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ordemDePrefs } from '@/lib/access-gates/preferencias-aprendizagem';

/**
 * Ordenação das preferências de aprendizagem: a pessoa põe os formatos do que MAIS
 * ajuda ao que MENOS ajuda, com setas de subir/descer (o mesmo gesto do ranking do DISC).
 *
 * Fonte única do markup — usada na última etapa do mapeamento DISC
 * (`app/dashboard/perfil-comportamental/mapeamento`) e na tela avulsa
 * (`app/dashboard/preferencias-aprendizagem`) de quem não faz o DISC nativo.
 * Os rótulos vêm de `BehavioralMapping.learning`, para os dois lugares falarem
 * igual nos 4 idiomas.
 *
 * Por que ordenar e não dar estrelas: com estrelas dava para marcar tudo igual, e 46% da
 * base tinha empate no topo entre os formatos que o motor usa. Ordem não empata.
 */
export const FORMATOS_APRENDIZAGEM = [
  { id: 'video_short', icon: '🎬' },
  { id: 'text', icon: '📄' },
  { id: 'audio', icon: '🎧' },
  { id: 'infographic', icon: '📊' },
  { id: 'exercise', icon: '🎯' },
  { id: 'mentor', icon: '🤖' },
  { id: 'case', icon: '📋' },
] as const;

const ICONE: Record<string, string> = Object.fromEntries(FORMATOS_APRENDIZAGEM.map(f => [f.id, f.icon]));

function embaralhar<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Ordem de partida. Se a pessoa já tem uma ORDENAÇÃO gravada, parte dela (e já conta como
 * confirmada). Notas em estrelas não são uma ordem: parte de uma ordem EMBARALHADA, e o
 * botão só libera depois que ela mexe — uma ordem sorteada e confirmada sem olhar seria
 * dado inventado.
 */
export function ordemInicial(prefs?: unknown): { ordem: string[]; confirmada: boolean } {
  const salva = ordemDePrefs(prefs);
  if (salva) return { ordem: salva, confirmada: true };
  return { ordem: embaralhar(FORMATOS_APRENDIZAGEM.map(f => f.id)), confirmada: false };
}

export default function PreferenciasAprendizagemForm({
  ordem,
  onChange,
}: {
  ordem: string[];
  onChange: (nova: string[]) => void;
}) {
  const t = useTranslations('BehavioralMapping');

  const mover = (i: number, delta: -1 | 1) => {
    const j = i + delta;
    if (j < 0 || j >= ordem.length) return;
    const nova = [...ordem];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    onChange(nova);
  };

  return (
    <div className="mx-auto w-full max-w-2xl" data-preferencias="ordenacao">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[2px] text-brand-300">{t('learning.rankTop')}</p>
      <ol className="space-y-2">
        {ordem.map((id, i) => {
          const nome = t(`learning.formats.${id}`);
          return (
            <li
              key={id}
              className="flex items-center gap-3 rounded-xl p-3"
              style={{ background: '#182B48', border: i === 0 ? '1px solid rgba(252,211,77,0.45)' : '1px solid transparent' }}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-black"
                style={{ background: i < 3 ? 'rgba(252,211,77,0.15)' : 'rgba(255,255,255,0.05)', color: i < 3 ? '#FCD34D' : '#94A3B8' }}
                aria-label={t('learning.position', { value: i + 1 })}
              >
                {i + 1}
              </span>
              <span className="shrink-0 text-[18px]" aria-hidden="true">{ICONE[id]}</span>
              <span className="min-w-0 flex-1 text-[14px] font-semibold leading-snug text-white">{nome}</span>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => mover(i, -1)}
                  disabled={i === 0}
                  aria-label={t('learning.moveUp', { format: nome })}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-white/10 disabled:opacity-25 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
                  style={{ background: 'rgba(255,255,255,0.04)' }}
                >
                  <ChevronUp size={20} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => mover(i, 1)}
                  disabled={i === ordem.length - 1}
                  aria-label={t('learning.moveDown', { format: nome })}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-white/10 disabled:opacity-25 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
                  style={{ background: 'rgba(255,255,255,0.04)' }}
                >
                  <ChevronDown size={20} aria-hidden="true" />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-[11px] font-bold uppercase tracking-[2px] text-gray-500">{t('learning.rankBottom')}</p>
    </div>
  );
}
