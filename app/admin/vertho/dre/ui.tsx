'use client';

/**
 * Primitivos da tela da DRE: modal, campo de formulário, selo e formatação.
 *
 * O app não tem `Dialog`, `Input` nem `Badge` como componentes (só `Button`,
 * `Surface`, `MetricCard` e os estados assíncronos): cada tela monta isso com
 * Tailwind. Estes são os da DRE, na superfície escura do admin.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { toast } from 'sonner';

export const inputCls =
  'w-full rounded-md border border-white/10 bg-[#091D35] px-3 py-2 text-sm text-white placeholder:text-white/30 ' +
  'focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400/60 disabled:opacity-50';

/** R$ com centavos. `null` vira travessão (valor desconhecido não é zero). */
export function brl(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

/** R$ sem centavos, para os cartões de topo. */
export function brlCurto(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

/** Percentual já em pontos (63,5 → "63,5%"). `null` = sem receita no período. */
export function pct(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return `${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}%`;
}

/** 'YYYY-MM-DD' → '05/10/2026'. */
export function data(d: string | null | undefined): string {
  if (!d) return '—';
  const s = d.slice(0, 10);
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
}

/** Cor do número: negativo em vermelho, positivo em verde, zero neutro. */
export function corDoValor(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v) || v === 0) return 'text-white/80';
  return v < 0 ? 'text-red-300' : 'text-emerald-300';
}

type Tom = 'ok' | 'aviso' | 'erro' | 'info' | 'neutro';
const TOM: Record<Tom, string> = {
  ok: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  aviso: 'border-amber-400/35 bg-amber-400/10 text-amber-200',
  erro: 'border-red-400/35 bg-red-400/10 text-red-200',
  info: 'border-brand-400/35 bg-brand-400/10 text-brand-300',
  neutro: 'border-white/10 bg-white/[0.04] text-white/60',
};

export function Selo({ tom = 'neutro', children, title }: { tom?: Tom; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${TOM[tom]}`}
    >
      {children}
    </span>
  );
}

export function Campo({
  rotulo,
  dica,
  erro,
  children,
}: {
  rotulo: string;
  dica?: ReactNode;
  erro?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-white/70">{rotulo}</span>
      {children}
      {dica && !erro && <span className="mt-1 block text-[11px] text-white/45">{dica}</span>}
      {erro && <span className="mt-1 block text-[11px] text-red-300">{erro}</span>}
    </label>
  );
}

/**
 * Modal em portal no `body`: `Surface` usa `backdrop-filter`, e um ancestral com
 * `backdrop-filter` vira o bloco de contenção do `position: fixed`, prendendo o
 * diálogo dentro do cartão em vez da janela.
 */
export function Modal({
  titulo,
  descricao,
  onFechar,
  children,
  largura = 'max-w-lg',
}: {
  titulo: string;
  descricao?: ReactNode;
  onFechar: () => void;
  children: ReactNode;
  largura?: string;
}) {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [onFechar]);

  if (!montado) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm md:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`w-full ${largura} rounded-2xl border border-white/10 bg-[#0B2141] p-5 shadow-[0_24px_48px_rgba(0,0,0,.42)]`}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-white">{titulo}</h2>
            {descricao && <p className="mt-1 text-xs leading-relaxed text-white/55">{descricao}</p>}
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="rounded-md p-1.5 text-white/50 hover:bg-white/[0.06] hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Roda uma action da DRE e fala o resultado com a pessoa. Devolve `true` só se
 * a escrita aconteceu. A mensagem de erro vem do envelope (já escrita para ser
 * lida); falha de rede ou exceção inesperada vira um aviso genérico.
 */
export async function rodar(
  promessa: Promise<{ success: boolean; error?: string }>,
  mensagemOk: string,
): Promise<boolean> {
  try {
    const r = await promessa;
    if (!r.success) {
      toast.error(r.error || 'Não foi possível concluir.');
      return false;
    }
    toast.success(mensagemOk);
    return true;
  } catch {
    toast.error('Sem conexão com o servidor. Confira a rede e tente de novo.');
    return false;
  }
}

/** Rodapé padrão dos formulários: cancelar e confirmar. */
export function Rodape({ children }: { children: ReactNode }) {
  return <div className="mt-5 flex flex-wrap items-center justify-end gap-2">{children}</div>;
}
