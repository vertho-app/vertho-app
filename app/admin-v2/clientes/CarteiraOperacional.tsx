'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowRight, Check, Search, UsersRound } from 'lucide-react';
import type { ClienteLinha } from '../actions';
import type { TurmaResumo } from '@/lib/turmas/portfolio';
import { TURMA, TURMA_ENCERRADAS } from '@/lib/status';

const STATUS: Record<string, string> = {
  [TURMA.PLANEJADA]: 'Planejada',
  [TURMA.DIAGNOSTICO]: 'Em diagnóstico',
  [TURMA.TRILHAS_EM_GERACAO]: 'Gerando jornadas',
  [TURMA.EM_JORNADA]: 'Em jornada',
  [TURMA.CONCLUIDA]: 'Concluída',
  [TURMA.ARQUIVADA]: 'Arquivada',
};

function percentual(parte: number, total: number) {
  return total > 0 ? Math.min(100, Math.round((parte / total) * 100)) : 0;
}

function etapaDaTurma(turma: TurmaResumo) {
  if (turma.membros === 0) return 'preparar';
  if (turma.comResposta < turma.membros || turma.comIa4 < turma.comResposta) return 'diagnostico';
  if (turma.comIa4 > turma.comTrilha) return 'lancamento';
  if (turma.comTrilha > 0) return 'acompanhamento';
  return 'diagnostico';
}

export default function CarteiraOperacional({ clientes }: { clientes: ClienteLinha[] }) {
  const [busca, setBusca] = useState('');
  const [somenteComAcao, setSomenteComAcao] = useState(false);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    return clientes.filter((cliente) => {
      const casaBusca = !termo
        || cliente.nome.toLocaleLowerCase('pt-BR').includes(termo)
        || cliente.portfolio.turmas.some((turma) => turma.nome.toLocaleLowerCase('pt-BR').includes(termo));
      const temAcao = cliente.bloqueador || cliente.portfolio.semTurma > 0 || cliente.portfolio.turmas.some((turma) => turma.proximaAcao);
      return casaBusca && (!somenteComAcao || !!temAcao);
    });
  }, [busca, clientes, somenteComAcao]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-[16px] border border-white/[0.08] bg-[#091d35] p-2.5">
        <label className="flex min-w-[240px] flex-1 items-center gap-2 rounded-[10px] border border-white/[0.08] bg-[#06172c] px-3 py-2 focus-within:border-[#34c5cc55]">
          <Search size={14} className="text-[var(--ink-faint)]" />
          <input
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar empresa ou turma"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-[var(--ink-faint)]"
          />
        </label>
        <button
          type="button"
          aria-pressed={somenteComAcao}
          onClick={() => setSomenteComAcao((valor) => !valor)}
          className={`rounded-[10px] border px-3 py-2 text-[11px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--cyan)] ${
            somenteComAcao
              ? 'border-[#34c5cc55] bg-[#34c5cc12] text-[var(--cyan)]'
              : 'border-white/[0.08] text-[var(--ink-dim)] hover:border-white/[0.14]'
          }`}
        >
          Só com próxima ação
        </button>
        <span className="px-2 font-[family-name:var(--font-manrope)] text-[9px] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
          {filtrados.length} empresa(s)
        </span>
      </div>

      {filtrados.map((cliente) => {
        const turmasAtivas = cliente.portfolio.turmas.filter((turma) => !TURMA_ENCERRADAS.includes(turma.status));
        return (
          <article key={cliente.id} className="overflow-hidden rounded-[16px] border border-white/[0.08] bg-[var(--navy-card)]">
            <header className="grid gap-4 border-b border-white/[0.07] bg-white/[0.018] px-4 py-4 lg:grid-cols-[minmax(220px,1.25fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0">
                <Link href={`/admin-v2/clientes/${cliente.id}`} className="group inline-flex max-w-full items-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--cyan)]">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[#34c5cc38] bg-[#34c5cc0d] font-[family-name:var(--font-serif)] text-lg italic text-[var(--cyan-soft)]">
                    {cliente.nome.trim()[0]?.toUpperCase() || '?'}
                  </span>
                  <span className="truncate text-[15px] font-semibold tracking-[-0.02em] group-hover:text-[var(--cyan)]">{cliente.nome}</span>
                </Link>
                <p className="ml-10 mt-0.5 text-[10.5px] text-[var(--ink-faint)]">{cliente.colaboradores} pessoa(s) · {turmasAtivas.length} turma(s) ativa(s)</p>
              </div>
              <FundacaoItem titulo="Base institucional" pronto={cliente.fundacao.basePronta} detalhe={cliente.fundacao.resumoBase} />
              <FundacaoItem titulo="Régua institucional" pronto={cliente.fundacao.reguaPronta} detalhe={cliente.fundacao.resumoRegua} />
              <Link href={`/admin-v2/clientes/${cliente.id}`} className="inline-flex items-center gap-1.5 justify-self-start text-[11px] font-semibold text-[var(--cyan)] hover:underline lg:justify-self-end">
                Abrir empresa <ArrowRight size={12} />
              </Link>
            </header>

            <div className="relative pl-5 sm:pl-8">
              <span className="absolute bottom-5 left-[19px] top-0 w-px bg-[#34c5cc20] sm:left-[31px]" aria-hidden="true" />
              {cliente.portfolio.semTurma > 0 && (
                <Link
                  href={`/admin-v2/clientes/${cliente.id}#turmas`}
                  className="relative grid gap-2 border-b border-white/[0.055] py-3 pl-5 pr-4 text-[12px] transition-colors hover:bg-[#f4b74008] sm:grid-cols-[minmax(190px,1fr)_minmax(0,1.4fr)_auto] sm:items-center"
                >
                  <span className="absolute -left-[5px] top-1/2 h-[11px] w-[11px] -translate-y-1/2 rounded-full border-2 border-[var(--warning)] bg-[var(--navy-card)]" />
                  <span className="font-medium text-[var(--warning)]">Sem turma</span>
                  <span className="text-[var(--ink-dim)]">{cliente.portfolio.semTurma} pessoa(s) fora de qualquer lote ou comunicação</span>
                  <span className="text-[11px] font-semibold text-[var(--warning)]">Classificar →</span>
                </Link>
              )}

              {turmasAtivas.map((turma) => {
                const etapa = etapaDaTurma(turma);
                return (
                  <Link
                    key={turma.id}
                    href={`/admin-v2/clientes/${cliente.id}/turmas/${turma.id}/${etapa}`}
                    className="group relative grid gap-3 border-b border-white/[0.055] py-3.5 pl-5 pr-4 transition-colors last:border-b-0 hover:bg-white/[0.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[var(--cyan)] lg:grid-cols-[minmax(200px,1fr)_minmax(280px,1.5fr)_minmax(220px,1.25fr)_auto] lg:items-center"
                  >
                    <span className="absolute -left-[5px] top-1/2 h-[11px] w-[11px] -translate-y-1/2 rounded-full border-2 border-[var(--cyan)] bg-[var(--navy-card)] transition-colors group-hover:bg-[var(--cyan)]" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold group-hover:text-[var(--cyan)]">{turma.nome}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-[var(--ink-faint)]">
                        <UsersRound size={11} /> {turma.membros} · {STATUS[turma.status] || turma.status}
                      </span>
                    </span>
                    <MiniFluxo turma={turma} />
                    <span className="text-[11.5px] leading-snug text-[var(--ink-dim)]">
                      {turma.proximaAcao ? (
                        <><span className="text-[var(--cyan)]">Próxima:</span> {turma.proximaAcao}</>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[var(--success)]"><Check size={12} /> sem ação imediata</span>
                      )}
                    </span>
                    <ArrowRight size={14} className="text-[var(--ink-faint)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--cyan)]" />
                  </Link>
                );
              })}

              {turmasAtivas.length === 0 && cliente.portfolio.semTurma === 0 && (
                <div className="relative py-5 pl-5 pr-4 text-[12px] text-[var(--ink-faint)]">
                  <span className="absolute -left-[5px] top-1/2 h-[11px] w-[11px] -translate-y-1/2 rounded-full border-2 border-white/20 bg-[var(--navy-card)]" />
                  Nenhuma turma ativa. Abra a empresa para criar a primeira safra.
                </div>
              )}
            </div>
          </article>
        );
      })}

      {filtrados.length === 0 && (
        <div className="rounded-[16px] border border-dashed border-white/[0.12] px-5 py-10 text-center text-sm text-[var(--ink-dim)]">
          Nenhuma empresa ou turma corresponde a estes filtros.
        </div>
      )}
    </div>
  );
}

function FundacaoItem({ titulo, pronto, detalhe }: { titulo: string; pronto: boolean; detalhe: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[11.5px] font-medium">
        <span className={`grid h-4 w-4 place-items-center rounded-full border text-[9px] ${pronto ? 'border-[#2ecc7155] bg-[#2ecc7112] text-[var(--success)]' : 'border-[#f4b74055] bg-[#f4b74010] text-[var(--warning)]'}`}>
          {pronto ? '✓' : '•'}
        </span>
        {titulo}
      </div>
      <p className="mt-1 truncate text-[10px] text-[var(--ink-faint)]">{detalhe}</p>
    </div>
  );
}

function MiniFluxo({ turma }: { turma: TurmaResumo }) {
  const partes = [
    { rotulo: 'resp.', valor: turma.comResposta, cor: 'bg-[#34c5cc]' },
    { rotulo: 'IA4', valor: turma.comIa4, cor: 'bg-[#7ba7e0]' },
    { rotulo: 'jornada', valor: turma.comTrilha, cor: 'bg-[#b888e8]' },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {partes.map((parte) => (
        <div key={parte.rotulo} className="min-w-0">
          <div className="mb-1 flex items-baseline justify-between gap-1 font-[family-name:var(--font-manrope)] text-[8px] uppercase tracking-[0.08em] text-[var(--ink-faint)]">
            <span>{parte.rotulo}</span><span>{parte.valor}/{turma.membros}</span>
          </div>
          <span className="block h-1 overflow-hidden rounded-full bg-white/[0.07]">
            <span className={`block h-full rounded-full ${parte.cor}`} style={{ width: `${percentual(parte.valor, turma.membros)}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}
