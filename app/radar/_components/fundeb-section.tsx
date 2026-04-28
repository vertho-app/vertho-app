import { Wallet } from 'lucide-react';
import type { FundebRepasse } from '@/lib/radar/queries';

const FMT_BR = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export function FundebSection({ fundeb }: { fundeb: FundebRepasse[] }) {
  if (!fundeb.length) return null;
  const recente = fundeb[0];

  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        <Wallet size={18} style={{ color: '#34c5cc' }} />
        <h2 className="text-white text-xl font-bold">FUNDEB — Recursos da rede</h2>
      </div>
      <p className="text-xs text-white/55 mb-4">
        Fundo de Manutenção e Desenvolvimento da Educação Básica.
        <strong className="text-white/80"> 70% mínimo aplicado em remuneração docente</strong>.
        Por isso é um indicador-chave da capacidade da rede em formação e valorização.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-2xl p-4 border border-white/[0.06]"
          style={{ background: 'rgba(255,255,255,0.03)' }}>
          <p className="text-[9px] tracking-[0.2em] uppercase font-mono text-white/40 mb-1">
            Repasse {recente.ano}
          </p>
          <p className="text-2xl font-bold text-white font-mono">
            {recente.total_repasse_bruto != null ? FMT_BR.format(recente.total_repasse_bruto) : '—'}
          </p>
          {recente.total_complementacao_uniao != null && recente.total_complementacao_uniao > 0 && (
            <p className="text-[10px] text-white/45 mt-1 font-mono">
              + {FMT_BR.format(recente.total_complementacao_uniao)} (compl. União)
            </p>
          )}
        </div>

        <div className="rounded-2xl p-4 border border-white/[0.06]"
          style={{ background: 'rgba(255,255,255,0.03)' }}>
          <p className="text-[9px] tracking-[0.2em] uppercase font-mono text-white/40 mb-1">
            Por aluno/ano
          </p>
          <p className="text-2xl font-bold text-white font-mono">
            {recente.valor_aluno_ano != null ? FMT_BR.format(recente.valor_aluno_ano) : '—'}
          </p>
          {recente.matriculas_consideradas != null && (
            <p className="text-[10px] text-white/45 mt-1 font-mono">
              {recente.matriculas_consideradas.toLocaleString('pt-BR')} matrículas
            </p>
          )}
        </div>

        <div className="rounded-2xl p-4 border border-white/[0.06]"
          style={{ background: 'rgba(255,255,255,0.03)' }}>
          <p className="text-[9px] tracking-[0.2em] uppercase font-mono text-white/40 mb-1">
            Histórico
          </p>
          <div className="space-y-1 mt-2">
            {fundeb.slice(0, 4).map((f) => (
              <div key={f.ano} className="flex justify-between text-xs">
                <span className="text-white/50 font-mono">{f.ano}</span>
                <span className="text-white/80 font-mono">
                  {f.total_repasse_bruto != null ? FMT_BR.format(f.total_repasse_bruto) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[10px] text-white/40 mt-3">
        Fonte: Tesouro Transparente / FNDE
      </p>
    </section>
  );
}
