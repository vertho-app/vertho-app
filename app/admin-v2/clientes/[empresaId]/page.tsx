import Link from 'next/link';
import { ArrowLeft, ArrowRight, ExternalLink, Settings2, Users, Waypoints } from 'lucide-react';
import { TURMA_ENCERRADAS } from '@/lib/status';
import type { TurmaResumo } from '@/lib/turmas/portfolio';
import { carregarClienteWorkspace } from '../../actions';
import TurmasPanel from '../../cliente/TurmasPanel';

export const dynamic = 'force-dynamic';

function etapaDaTurma(turma: TurmaResumo) {
  if (turma.membros === 0) return 'preparar';
  if (turma.comResposta < turma.membros || turma.comIa4 < turma.comResposta) return 'diagnostico';
  if (turma.comIa4 > turma.comTrilha) return 'lancamento';
  if (turma.comTrilha > 0) return 'acompanhamento';
  return 'diagnostico';
}

export default async function EmpresaPage({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const { ws, erro } = await carregarClienteWorkspace(empresaId);

  if (erro || !ws) {
    return (
      <div className="rounded-[16px] border border-red-400/35 bg-red-400/[0.06] px-5 py-4 text-sm text-red-200">
        Esta empresa não pôde ser carregada. {erro ?? 'Sem dados'}
      </div>
    );
  }

  const base = ws.fases[0];
  const regua = ws.fases[1];
  const turmasAtivas = ws.portfolio.turmas.filter((turma) => !TURMA_ENCERRADAS.includes(turma.status));

  return (
    <div className="space-y-7">
      <section className="border-b border-white/[0.08] pb-7">
        <Link href="/admin-v2/clientes" className="inline-flex items-center gap-1.5 text-[11px] text-[var(--ink-faint)] transition-colors hover:text-[var(--cyan)]">
          <ArrowLeft size={12} /> Voltar à carteira
        </Link>
        <div className="mt-4 flex flex-wrap items-end gap-5">
          <div className="min-w-0 flex-1">
            <p className="font-[family-name:var(--font-manrope)] text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--cyan)]">Workspace da empresa</p>
            <h1 className="mt-2 text-[clamp(32px,4.5vw,56px)] font-semibold leading-[0.96] tracking-[-0.05em]">
              <span className="font-[family-name:var(--font-serif)] font-normal italic text-[var(--cyan-soft)]">{ws.empresa.nome}</span>
            </h1>
            <p className="mt-3 text-[13px] text-[var(--ink-dim)]">
              Fundação compartilhada · {ws.portfolio.totalPessoas} pessoa(s) · {turmasAtivas.length} turma(s) ativa(s)
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Atalho href={`/admin/empresas/gerenciar?empresa=${empresaId}`} icone={Users}>Pessoas</Atalho>
            <Atalho href={`/admin/empresas/${empresaId}/configuracoes`} icone={Settings2}>Configurações</Atalho>
          </div>
        </div>
      </section>

      <section aria-labelledby="fundacao-titulo">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <p className="font-[family-name:var(--font-manrope)] text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ink-faint)]">Compartilhada por todas as turmas</p>
            <h2 id="fundacao-titulo" className="mt-1 text-lg font-semibold tracking-[-0.02em]">Fundação da empresa</h2>
          </div>
          <span className="hidden text-[11px] text-[var(--ink-faint)] sm:block">configura uma vez · reutiliza em cada safra</span>
        </div>

        <div className="relative grid gap-3 md:grid-cols-2">
          <FundacaoCard
            numero="1"
            titulo="Base institucional"
            detalhe={base.meta}
            estado={base.estado}
            proxima={base.proximaAcao}
            href={base.href}
          />
          <FundacaoCard
            numero="2"
            titulo="Régua institucional"
            detalhe={regua.meta}
            estado={regua.estado}
            proxima={regua.proximaAcao}
            href={regua.href}
          />
          <span className="pointer-events-none absolute left-1/2 top-full hidden h-8 w-px -translate-x-1/2 bg-gradient-to-b from-[#34c5cc55] to-[#34c5cc12] md:block" aria-hidden="true" />
        </div>

        <div className="mt-3 grid gap-1 rounded-[16px] border border-white/[0.07] bg-[#091d35] p-2 sm:grid-cols-2 xl:grid-cols-6">
          {ws.regua.map((passo, index) => {
            const completo = passo.total > 0 && passo.feitos >= passo.total;
            return (
              <Link key={passo.titulo} href={passo.href} className="group rounded-[10px] px-3 py-2.5 transition-colors hover:bg-white/[0.035] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--cyan)]">
                <div className="flex items-center gap-2">
                  <span className={`grid h-5 w-5 place-items-center rounded-full border font-[family-name:var(--font-manrope)] text-[8px] font-bold ${completo ? 'border-[#2ecc7150] text-[var(--success)]' : 'border-white/[0.12] text-[var(--ink-faint)]'}`}>
                    {completo ? '✓' : index + 1}
                  </span>
                  <span className="truncate text-[10.5px] font-medium group-hover:text-[var(--cyan)]">{passo.titulo}</span>
                </div>
                <p className="ml-7 mt-1 font-[family-name:var(--font-manrope)] text-[9px] text-[var(--ink-faint)]">{passo.feitos} de {passo.total}</p>
              </Link>
            );
          })}
        </div>
      </section>

      <section id="turmas" aria-labelledby="turmas-titulo" className="pt-3">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-[family-name:var(--font-manrope)] text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--cyan)]">Relógios independentes</p>
            <h2 id="turmas-titulo" className="mt-1 text-lg font-semibold tracking-[-0.02em]">Turmas da empresa</h2>
          </div>
          <span className="text-[11px] text-[var(--ink-faint)]">cada linha tem seu próprio próximo passo</span>
        </div>

        {ws.portfolio.semTurma > 0 && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[#f4b74035] bg-[#f4b7400c] px-4 py-3 text-[12px]">
            <span className="text-[var(--warning)]"><b>{ws.portfolio.semTurma}</b> pessoa(s) estão sem turma e ficam fora dos lotes e comunicações.</span>
            <span className="text-[11px] text-[var(--ink-dim)]">Classifique na gestão de composição abaixo.</span>
          </div>
        )}

        <div className="relative overflow-hidden rounded-[16px] border border-white/[0.08] bg-[var(--navy-card)]">
          <span className="absolute bottom-6 left-[27px] top-0 w-px bg-[#34c5cc28]" aria-hidden="true" />
          {turmasAtivas.map((turma) => {
            const etapa = etapaDaTurma(turma);
            return (
              <Link
                key={turma.id}
                href={`/admin-v2/clientes/${empresaId}/turmas/${turma.id}/${etapa}`}
                className="group relative grid gap-3 border-b border-white/[0.055] py-4 pl-12 pr-4 transition-colors last:border-b-0 hover:bg-white/[0.022] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[var(--cyan)] lg:grid-cols-[minmax(220px,1fr)_minmax(250px,1.25fr)_minmax(220px,1fr)_auto] lg:items-center"
              >
                <span className="absolute left-[21px] top-1/2 h-[13px] w-[13px] -translate-y-1/2 rounded-full border-2 border-[var(--cyan)] bg-[var(--navy-card)] transition-colors group-hover:bg-[var(--cyan)]" />
                <span>
                  <b className="block text-[13px] group-hover:text-[var(--cyan)]">{turma.nome}</b>
                  <span className="mt-0.5 block text-[10.5px] text-[var(--ink-faint)]">{turma.membros} pessoa(s) · {turma.programaModo || 'programa herdado'}</span>
                </span>
                <span className="grid grid-cols-3 gap-2 font-[family-name:var(--font-manrope)] text-[9px] text-[var(--ink-faint)]">
                  <Contagem valor={turma.comResposta} total={turma.membros} rotulo="responderam" />
                  <Contagem valor={turma.comIa4} total={turma.membros} rotulo="avaliados" />
                  <Contagem valor={turma.comTrilha} total={turma.membros} rotulo="jornadas" />
                </span>
                <span className="text-[11.5px] leading-snug text-[var(--ink-dim)]">
                  {turma.proximaAcao ? <><span className="text-[var(--cyan)]">Próxima:</span> {turma.proximaAcao}</> : 'Sem ação imediata'}
                </span>
                <ArrowRight size={14} className="text-[var(--ink-faint)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--cyan)]" />
              </Link>
            );
          })}
          {turmasAtivas.length === 0 && (
            <div className="px-5 py-10 text-center">
              <Waypoints size={24} className="mx-auto text-[var(--ink-faint)]" />
              <p className="mt-3 text-sm font-medium">Nenhuma turma ativa</p>
              <p className="mt-1 text-[11.5px] text-[var(--ink-faint)]">Crie a primeira safra e atribua as pessoas.</p>
            </div>
          )}
        </div>

        <details className="group mt-4 rounded-[16px] border border-white/[0.08] bg-[#091d35] open:p-4">
          <summary className="cursor-pointer list-none px-4 py-3 text-[12px] font-semibold text-[var(--ink-dim)] marker:hidden group-open:px-0 group-open:pt-0">
            Gerenciar composição, calendário e status das turmas
          </summary>
          <div className="border-t border-white/[0.07] pt-4">
            <TurmasPanel empresaId={empresaId} portfolio={ws.portfolio} />
          </div>
        </details>
      </section>
    </div>
  );
}

function FundacaoCard({ numero, titulo, detalhe, estado, proxima, href }: {
  numero: string;
  titulo: string;
  detalhe: string;
  estado: 'feito' | 'revisao' | 'bloqueado' | 'aguardando';
  proxima: string | null;
  href: string;
}) {
  const feito = estado === 'feito';
  return (
    <Link href={href} className="group rounded-[16px] border border-white/[0.08] bg-[var(--navy-card)] p-4 transition-colors hover:border-[#34c5cc35] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--cyan)]">
      <div className="flex items-start gap-3">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border font-[family-name:var(--font-manrope)] text-[10px] font-bold ${feito ? 'border-[#2ecc7155] bg-[#2ecc7110] text-[var(--success)]' : 'border-[#f4b74055] bg-[#f4b7400d] text-[var(--warning)]'}`}>
          {feito ? '✓' : numero}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold group-hover:text-[var(--cyan)]">{titulo}</span>
          <span className="mt-1 block text-[10.5px] leading-relaxed text-[var(--ink-faint)]">{detalhe}</span>
          {proxima && <span className="mt-2 block text-[11px] text-[var(--warning)]">Próxima: {proxima}</span>}
        </span>
        <ArrowRight size={14} className="mt-1 text-[var(--ink-faint)] group-hover:text-[var(--cyan)]" />
      </div>
    </Link>
  );
}

function Contagem({ valor, total, rotulo }: { valor: number; total: number; rotulo: string }) {
  return (
    <span>
      <b className="block text-[11px] font-semibold text-[var(--ink)]">{valor}/{total}</b>
      <span>{rotulo}</span>
    </span>
  );
}

function Atalho({ href, icone: Icone, children }: { href: string; icone: typeof Users; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 rounded-[10px] border border-white/[0.1] px-3 py-2 text-[11px] text-[var(--ink-dim)] transition-colors hover:border-[var(--cyan)] hover:text-[var(--cyan)]">
      <Icone size={13} /> {children} <ExternalLink size={10} className="text-[var(--ink-faint)]" />
    </Link>
  );
}
