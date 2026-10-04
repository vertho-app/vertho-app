'use client';

import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Bot, ChevronDown, ChevronUp, ClipboardList, Clapperboard, FileText, GripVertical, Headphones, BarChart3, Target } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ordemDePrefs } from '@/lib/access-gates/preferencias-aprendizagem';
import { ordemAoArrastar } from '@/lib/ordenacao-arrastar';

/**
 * Ordenação das preferências de aprendizagem: a pessoa põe os formatos do que MAIS
 * ajuda ao que MENOS ajuda — ARRASTANDO a alça de cada linha (mouse ou dedo) ou com as
 * setas de subir/descer (que também são o caminho do teclado e do leitor de tela).
 *
 * Fonte única do markup — usada na última etapa do mapeamento DISC
 * (`app/dashboard/perfil-comportamental/mapeamento`) e na tela avulsa
 * (`app/dashboard/preferencias-aprendizagem`) de quem não faz o DISC nativo.
 * Os rótulos vêm de `BehavioralMapping.learning`, para os dois lugares falarem
 * igual nos 4 idiomas.
 *
 * Por que ordenar e não dar estrelas: com estrelas dava para marcar tudo igual, e 46% da
 * base tinha empate no topo entre os formatos que o motor usa. Ordem não empata.
 *
 * Arrastar sem biblioteca: Pointer Events na alça (`touch-action: none`, para o dedo não
 * virar rolagem da página). Os ouvintes ficam na `window` durante o gesto — a linha é
 * reinserida no DOM a cada troca de posição e isso solta a captura do ponteiro.
 */
// Ícone Lucide por formato (R-123: sem emoji no chrome do produto).
export const FORMATOS_APRENDIZAGEM = [
  { id: 'video_short', icon: Clapperboard },
  { id: 'text', icon: FileText },
  { id: 'audio', icon: Headphones },
  { id: 'infographic', icon: BarChart3 },
  { id: 'exercise', icon: Target },
  { id: 'mentor', icon: Bot },
  { id: 'case', icon: ClipboardList },
] as const satisfies ReadonlyArray<{ id: string; icon: LucideIcon }>;

const ICONE: Record<string, LucideIcon> = Object.fromEntries(FORMATOS_APRENDIZAGEM.map(f => [f.id, f.icon]));

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

// Distância da borda da janela a partir da qual o arrastar rola a página.
const BORDA_ROLAGEM = 70;
const PASSO_ROLAGEM = 14;

export default function PreferenciasAprendizagemForm({
  ordem,
  onChange,
}: {
  ordem: string[];
  onChange: (nova: string[]) => void;
}) {
  const t = useTranslations('BehavioralMapping');

  // Os ouvintes da `window` vivem além de um render: leem o estado MAIS RECENTE por ref.
  const ordemRef = useRef(ordem);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    ordemRef.current = ordem;
    onChangeRef.current = onChange;
  });
  const linhas = useRef(new Map<string, HTMLLIElement>());
  const encerrar = useRef<(() => void) | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);

  // Sai da tela no meio do gesto: solta os ouvintes.
  useEffect(() => () => { encerrar.current?.(); }, []);

  const mover = (i: number, delta: -1 | 1) => {
    const j = i + delta;
    if (j < 0 || j >= ordem.length) return;
    const nova = [...ordem];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    onChange(nova);
  };

  const iniciarArrasto = (e: ReactPointerEvent, id: string) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    encerrar.current?.();
    setArrastando(id);

    const aoMover = (ev: PointerEvent) => {
      const medios: Record<string, number> = {};
      linhas.current.forEach((el, k) => {
        const r = el.getBoundingClientRect();
        medios[k] = r.top + r.height / 2;
      });
      const atual = ordemRef.current;
      const nova = ordemAoArrastar(atual, id, ev.clientY, medios);
      if (nova.some((x, i) => x !== atual[i])) onChangeRef.current(nova);
      if (ev.clientY < BORDA_ROLAGEM) window.scrollBy(0, -PASSO_ROLAGEM);
      else if (ev.clientY > window.innerHeight - BORDA_ROLAGEM) window.scrollBy(0, PASSO_ROLAGEM);
    };
    const fim = () => {
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', fim);
      window.removeEventListener('pointercancel', fim);
      encerrar.current = null;
      setArrastando(null);
    };
    window.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerup', fim);
    window.addEventListener('pointercancel', fim);
    encerrar.current = fim;
  };

  return (
    <div className="mx-auto w-full max-w-2xl" data-preferencias="ordenacao">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[2px] text-brand-300">{t('learning.rankTop')}</p>
      <ol className="space-y-2">
        {ordem.map((id, i) => {
          const nome = t(`learning.formats.${id}`);
          const emArrasto = arrastando === id;
          return (
            <li
              key={id}
              ref={(el) => { if (el) linhas.current.set(id, el); else linhas.current.delete(id); }}
              className="flex select-none items-center gap-2 rounded-xl p-3 transition-shadow sm:gap-3"
              style={{
                background: '#182B48',
                border: emArrasto ? '1px solid rgba(45,212,191,0.8)' : i === 0 ? '1px solid rgba(252,211,77,0.45)' : '1px solid transparent',
                boxShadow: emArrasto ? '0 10px 28px rgba(0,0,0,0.45)' : undefined,
                position: 'relative',
                zIndex: emArrasto ? 1 : undefined,
              }}
            >
              <span
                onPointerDown={(e) => iniciarArrasto(e, id)}
                title={t('learning.drag')}
                aria-hidden="true"
                className="flex h-11 w-7 shrink-0 items-center justify-center rounded-md text-gray-500 hover:text-gray-300"
                style={{ touchAction: 'none', cursor: emArrasto ? 'grabbing' : 'grab' }}
              >
                <GripVertical size={18} />
              </span>
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-black"
                style={{ background: i < 3 ? 'rgba(252,211,77,0.15)' : 'rgba(255,255,255,0.05)', color: i < 3 ? '#FCD34D' : '#94A3B8' }}
                aria-label={t('learning.position', { value: i + 1 })}
              >
                {i + 1}
              </span>
              <span className="shrink-0 text-white/70" aria-hidden="true">{(() => { const Icone = ICONE[id]; return Icone ? <Icone size={18} /> : null; })()}</span>
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
