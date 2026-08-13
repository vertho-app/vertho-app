'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { Workspace, FaseReal } from '../actions';
import TurmasPanel from './TurmasPanel';

const CHIP: Record<FaseReal['estado'], { classe: string; rotulo: string }> = {
  feito: { classe: 'bg-[#2ecc7124] text-[var(--success)]', rotulo: 'Concluído' },
  revisao: { classe: 'bg-[#f4b74029] text-[var(--warning)]', rotulo: 'Em revisão' },
  bloqueado: { classe: 'bg-[#e74c3c29] text-[#ff9b90]', rotulo: 'Bloqueado' },
  aguardando: { classe: 'bg-white/[0.06] text-[var(--ink-faint)]', rotulo: 'Aguardando' },
};

const ETAPAS_BASE = [
  { chave: 'visao', rotulo: 'Visão geral' },
  { chave: 'regua', rotulo: 'Definir régua' },
];

export default function ClienteWorkspace({ ws }: { ws: Workspace }) {
  const ETAPAS = ws.portfolio
    ? [ETAPAS_BASE[0], { chave: 'turmas', rotulo: 'Turmas' }, ETAPAS_BASE[1]]
    : ETAPAS_BASE;
  const [etapa, setEtapa] = useState<string>('visao');
  const [preflight, setPreflight] = useState(false);

  useEffect(() => {
    if (!preflight) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreflight(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [preflight]);

  const pontoDaEtapa = (chave: string) => {
    if (chave === 'visao') return ws.fases.some((f) => f.estado === 'bloqueado') ? 'bg-[var(--danger)]' : 'bg-[var(--success)]';
    if (chave === 'turmas') return ws.portfolio?.semTurma ? 'bg-[var(--warning)]' : 'bg-[var(--success)]';
    return ws.cenariosSemCheck > 0 ? 'bg-[var(--warning)]' : 'bg-[var(--success)]';
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin-v2/clientes"
          className="flex items-center gap-1.5 font-mono text-[11px] text-[var(--ink-faint)] transition-colors hover:text-[var(--cyan)]"
        >
          <ArrowLeft size={12} /> todos os clientes
        </Link>
        <span className="text-[var(--ink-faint)]">·</span>
        <span className="text-sm font-semibold">{ws.empresa.nome}</span>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-white/[0.08]">
        {ETAPAS.map((e) => {
          const on = etapa === e.chave;
          return (
            <button
              key={e.chave}
              type="button"
              onClick={() => setEtapa(e.chave)}
              aria-current={on ? 'step' : undefined}
              className={`flex items-center gap-2 rounded-t-[10px] border-b-2 px-3.5 py-2.5 text-[13px] transition-colors ${
                on
                  ? 'border-[var(--cyan)] bg-[#34c5cc12] text-[var(--cyan)]'
                  : 'border-transparent text-[var(--ink-dim)] hover:bg-white/[0.03] hover:text-[var(--ink)]'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${pontoDaEtapa(e.chave)}`} />
              {e.rotulo}
            </button>
          );
        })}
      </div>

      {etapa === 'visao' && (
        <div className="flex flex-col gap-3.5">
          <p className="max-w-[76ch] text-[13.5px] text-[var(--ink-dim)]">
            O pipeline como mapa de status: cada fase mostra o estado real e <b className="text-[var(--ink)]">uma</b>{' '}
            próxima ação, que abre a tela que resolve.
          </p>
          <div className="flex flex-col gap-2.5">
            {ws.fases.map((f) => (
              <div
                key={f.sigla}
                className="grid grid-cols-[44px_1fr_auto] items-center gap-4 rounded-2xl border border-white/[0.08] bg-[var(--navy-card)] px-4 py-3.5 shadow-[0_8px_20px_rgba(0,0,0,0.18)]"
              >
                <div className="text-center font-mono text-[11px] text-[var(--ink-faint)]">
                  <b className="block font-[family-name:var(--font-serif)] text-[19px] font-normal text-[var(--ink-dim)]">
                    {f.sigla}
                  </b>
                  {f.rotulo}
                </div>
                <div className="min-w-0">
                  <h3 className="mb-0.5 text-sm font-semibold">{f.titulo}</h3>
                  <span className="font-mono text-[11px] text-[var(--ink-faint)]">{f.meta}</span>
                  {f.proximaAcao && (
                    <Link href={f.href} className="mt-1.5 block text-[12.5px] text-[var(--cyan)] hover:underline">
                      → {f.proximaAcao}
                    </Link>
                  )}
                </div>
                <span className={`whitespace-nowrap rounded-full px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.08em] ${CHIP[f.estado].classe}`}>
                  {CHIP[f.estado].rotulo}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {etapa === 'turmas' && ws.portfolio && (
        <TurmasPanel empresaId={ws.empresa.id} portfolio={ws.portfolio} />
      )}

      {etapa === 'regua' && (
        <div className="flex flex-col gap-3.5">
          <p className="max-w-[76ch] text-[13.5px] text-[var(--ink-dim)]">
            A régua inteira numa etapa só — hoje isso exige alternar entre Pipeline, Cargos, Competências e Fase 1.
            Cada passo mostra <b className="text-[var(--ink)]">quantos de quantos</b> e leva à tela que resolve.
          </p>

          <div className="flex flex-col rounded-2xl border border-white/[0.08] bg-[var(--navy-card)] px-5 shadow-[0_8px_20px_rgba(0,0,0,0.18)]">
            {ws.regua.map((p, i) => {
              const completo = p.total > 0 && p.feitos >= p.total;
              return (
                <div
                  key={p.titulo}
                  className={`grid grid-cols-[26px_1fr_auto] items-start gap-3.5 py-4 ${
                    i < ws.regua.length - 1 ? 'border-b border-white/[0.08]' : ''
                  }`}
                >
                  <span
                    className={`grid h-[22px] w-[22px] place-items-center rounded-full border font-mono text-[10px] ${
                      completo
                        ? 'border-[#2ecc7166] bg-[#2ecc7129] text-[var(--success)]'
                        : 'border-[#f4b74073] bg-[#f4b74029] text-[var(--warning)]'
                    }`}
                  >
                    {completo ? '✓' : '●'}
                  </span>
                  <div className="min-w-0">
                    <h3 className="mb-0.5 text-[13.5px] font-semibold">{p.titulo}</h3>
                    <p className="text-xs text-[var(--ink-dim)]">
                      {p.descricao} ·{' '}
                      <span className="font-mono text-[11px] text-[var(--cyan-soft)]">
                        {p.feitos} de {p.total}
                      </span>
                    </p>
                  </div>
                  <Link
                    href={p.href}
                    className="shrink-0 rounded-full border border-white/[0.14] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-dim)] transition-colors hover:border-[var(--cyan)] hover:text-[var(--cyan)]"
                  >
                    {completo ? 'revisar' : 'resolver'}
                  </Link>
                </div>
              );
            })}
          </div>

          {ws.cargosSemCenario > 0 && (
            <button
              type="button"
              onClick={() => setPreflight(true)}
              className="self-start rounded-full bg-[var(--cyan)] px-4 py-2 text-[12.5px] font-semibold text-[#052227] transition-colors hover:bg-[var(--cyan-soft)]"
            >
              ⚡ Gerar cenários dos {ws.cargosSemCenario} cargos sem cenário
            </button>
          )}
        </div>
      )}

      {preflight && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Preflight de geração de cenários"
          onClick={(e) => { if (e.target === e.currentTarget) setPreflight(false); }}
          className="fixed inset-0 z-[80] grid place-items-center bg-[#030a14b8] p-5 backdrop-blur-[3px]"
        >
          <div className="w-full max-w-[560px] overflow-hidden rounded-3xl border border-white/[0.14] bg-[var(--navy-card)] shadow-[0_24px_48px_rgba(0,0,0,0.42)]">
            <header className="border-b border-white/[0.08] px-6 pb-3.5 pt-5">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                Confirmação proporcional ao risco
              </span>
              <h3 className="mt-1 text-lg font-semibold">Gerar cenários situacionais</h3>
            </header>
            <div className="px-6 py-1">
              {[
                { r: 'Cliente e escopo', v: `${ws.empresa.nome} · ${ws.cargosSemCenario} cargo(s) sem cenário` },
                { r: 'Pré-requisito', v: 'Gabarito aprovado no cargo', tom: 'ok' as const },
                { r: 'O que será sobrescrito', v: 'Nada — só cargos sem cenário', tom: 'atencao' as const },
                { r: 'Reversível', v: 'Sim, até a aprovação na revisão', tom: 'ok' as const },
                { r: 'Custo', v: 'chamada de IA paga, por cargo' },
              ].map((l, i, arr) => (
                <div
                  key={l.r}
                  className={`flex justify-between gap-4 py-2.5 text-[13px] ${i < arr.length - 1 ? 'border-b border-white/[0.08]' : ''}`}
                >
                  <span className="text-[var(--ink-dim)]">{l.r}</span>
                  <b className={`text-right font-medium ${l.tom === 'ok' ? 'text-[var(--success)]' : l.tom === 'atencao' ? 'text-[var(--warning)]' : ''}`}>
                    {l.v}
                  </b>
                </div>
              ))}
            </div>
            <footer className="flex items-center gap-2.5 border-t border-white/[0.08] bg-black/[0.14] px-6 pb-5 pt-4">
              <span className="mr-auto max-w-[24ch] text-[11.5px] leading-snug text-[var(--ink-faint)]">
                A geração acontece na tela de Fase 1, que já tem o controle por cargo.
              </span>
              <button
                type="button"
                onClick={() => setPreflight(false)}
                className="rounded-full border border-white/[0.14] px-4 py-2 text-[12.5px] font-medium text-[var(--ink-dim)] transition-colors hover:border-[var(--cyan)] hover:text-[var(--cyan)]"
              >
                Cancelar
              </button>
              <Link
                href={`/admin/empresas/${ws.empresa.id}/fase1?tab=cenarios`}
                className="rounded-full bg-[var(--cyan)] px-4 py-2 text-[12.5px] font-semibold text-[#052227] transition-colors hover:bg-[var(--cyan-soft)]"
              >
                Ir para a geração
              </Link>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
