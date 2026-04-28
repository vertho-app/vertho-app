import { Coins } from 'lucide-react';
import type { PddeRepasse } from '@/lib/radar/queries';

const STATUS_LABEL: Record<string, { label: string; cor: string; bg: string }> = {
  aprovada:    { label: 'Aprovada',     cor: '#34D399', bg: 'rgba(52,211,153,0.12)' },
  pendente:    { label: 'Pendente',     cor: '#F4B740', bg: 'rgba(244,183,64,0.12)' },
  em_analise:  { label: 'Em análise',   cor: '#34c5cc', bg: 'rgba(52,197,204,0.12)' },
  rejeitada:   { label: 'Rejeitada',    cor: '#F97354', bg: 'rgba(249,115,84,0.12)' },
};

const FMT_BR = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export function PddeSection({ pdde }: { pdde: PddeRepasse[] }) {
  if (!pdde.length) return null;
  const recente = pdde[0];
  const status = recente.prestacao_contas_status
    ? STATUS_LABEL[recente.prestacao_contas_status] || { label: recente.prestacao_contas_status, cor: '#94a3b8', bg: 'rgba(148,163,184,0.12)' }
    : null;

  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        <Coins size={18} style={{ color: '#34c5cc' }} />
        <h2 className="text-white text-xl font-bold">PDDE — Programa Dinheiro Direto na Escola</h2>
      </div>
      <p className="text-xs text-white/55 mb-4">
        Recursos federais transferidos diretamente à escola pelo FNDE. Podem ser usados em
        formação continuada de professores, manutenção e materiais pedagógicos.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-2xl p-4 border border-white/[0.06]"
          style={{ background: 'rgba(255,255,255,0.03)' }}>
          <p className="text-[9px] tracking-[0.2em] uppercase font-mono text-white/40 mb-1">
            Recebido em {recente.ano}
          </p>
          <p className="text-2xl font-bold text-white font-mono">
            {recente.valor_recebido != null ? FMT_BR.format(recente.valor_recebido) : '—'}
          </p>
        </div>

        <div className="rounded-2xl p-4 border border-white/[0.06]"
          style={{ background: 'rgba(255,255,255,0.03)' }}>
          <p className="text-[9px] tracking-[0.2em] uppercase font-mono text-white/40 mb-1">
            Saldo atual
          </p>
          <p className="text-2xl font-bold text-white font-mono">
            {recente.saldo_atual != null ? FMT_BR.format(recente.saldo_atual) : '—'}
          </p>
          {recente.saldo_atual != null && recente.saldo_atual > 0 && (
            <p className="text-[10px] text-white/40 mt-1 leading-relaxed">
              Pode ser aplicado em formação continuada
            </p>
          )}
        </div>

        <div className="rounded-2xl p-4 border border-white/[0.06]"
          style={{ background: 'rgba(255,255,255,0.03)' }}>
          <p className="text-[9px] tracking-[0.2em] uppercase font-mono text-white/40 mb-1">
            Prestação de contas
          </p>
          {status ? (
            <span className="inline-flex px-3 py-1 rounded-full text-xs font-bold mt-1"
              style={{ color: status.cor, background: status.bg }}>
              {status.label}
            </span>
          ) : (
            <p className="text-base text-white/45 mt-1 font-mono">—</p>
          )}
          <p className="text-[10px] text-white/40 mt-2 leading-relaxed">
            Fonte: FNDE / dadosabertos
          </p>
        </div>
      </div>

      {pdde.length > 1 && (
        <p className="text-[10px] text-white/45 mt-3 font-mono">
          Histórico: {pdde.map((p) => p.ano).join(' · ')}
        </p>
      )}
    </section>
  );
}
