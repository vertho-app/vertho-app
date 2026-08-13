'use client';

/**
 * Composição das turmas — a tela que faltava.
 *
 * Até aqui as actions de turma existiam sem consumidor: criar, mover e arquivar
 * só por SQL. Um modelo que só o operador de banco consegue mexer não é
 * operável — e o próprio doc pedia composição EXPLÍCITA, não derivada de cargo.
 *
 * Duas regras que a tela carrega, e não só exibe:
 *  1. **Nenhum número sem denominador.** "38 de 127 (30%)", nunca "38".
 *  2. **Prévia antes de mover.** A ação diz o que vai acontecer com quem —
 *     inclusive quantas participações antigas serão fechadas.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Users, Archive, Pencil, X, ArrowRight } from 'lucide-react';
import {
  criarTurma, editarTurma, moverParaTurma, arquivarTurma,
  listarSemTurma, listarMembrosTurma,
} from '@/actions/turmas';
import type { PortfolioTurmas, TurmaResumo } from '@/lib/turmas/portfolio';
import { TURMA, TURMA_ENCERRADAS } from '@/lib/status';

// Rótulos e cores por status. As CHAVES saem de `lib/status.ts` (TURMA) — o
// guard de literais existe porque o valor do progresso e o da turma vivem a um
// typo de distância um do outro (um termina em -o, o outro em -a).
// (Sem citá-los aqui entre aspas: o guard varre o arquivo inteiro e não
//  distingue comentário de código — ele pegou esta própria linha antes.)
const STATUS: Record<string, { classe: string; rotulo: string }> = {
  [TURMA.PLANEJADA]: { classe: 'bg-white/[0.06] text-[var(--ink-faint)]', rotulo: 'Planejada' },
  [TURMA.DIAGNOSTICO]: { classe: 'bg-[#f4b74029] text-[var(--warning)]', rotulo: 'Diagnóstico' },
  [TURMA.TRILHAS_EM_GERACAO]: { classe: 'bg-[#34c5cc24] text-[var(--cyan)]', rotulo: 'Gerando trilhas' },
  [TURMA.EM_JORNADA]: { classe: 'bg-[#2ecc7124] text-[var(--success)]', rotulo: 'Em jornada' },
  [TURMA.CONCLUIDA]: { classe: 'bg-white/[0.06] text-[var(--ink-faint)]', rotulo: 'Concluída' },
  [TURMA.ARQUIVADA]: { classe: 'bg-white/[0.06] text-[var(--ink-faint)]', rotulo: 'Arquivada' },
};

const OPCOES_STATUS: string[] = Object.values(TURMA);
const OPCOES_MODO = ['', 'jornada', 'regular_duo', 'regular_single', 'onboarding', 'piloto'];

function fracao(parte: number, total: number): string {
  if (!total) return '0';
  return `${parte} de ${total} (${Math.round((parte / total) * 100)}%)`;
}

type Pessoa = {
  id: string; nome: string; cargo: string | null; email?: string | null;
  respondeu?: boolean; avaliado?: boolean; temTrilha?: boolean;
};

const btn = 'rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-40';
const btnPrim = `${btn} bg-[#34c5cc1f] text-[var(--cyan)] hover:bg-[#34c5cc33]`;
const btnGhost = `${btn} text-[var(--ink-dim)] hover:bg-white/[0.05] hover:text-[var(--ink)]`;
const campo = 'rounded-lg border border-white/[0.12] bg-[#0b1a2e] px-2.5 py-1.5 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--cyan)]';

export default function TurmasPanel({ empresaId, portfolio }: { empresaId: string; portfolio: PortfolioTurmas }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [vendo, setVendo] = useState<{ turmaId: string; pessoas: Pessoa[]; titulo: string } | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [destino, setDestino] = useState<string>('');

  const ativas = portfolio.turmas.filter((t) => !TURMA_ENCERRADAS.includes(t.status as any));

  /** Toda mutação passa por aqui: erro do servidor VAI para a tela, sempre. */
  const executar = (fn: () => Promise<any>, aoTerminar?: () => void) => {
    setErro(null);
    startTransition(async () => {
      const r = await fn();
      if (r && r.success === false) { setErro(r.error || 'Falha na operação'); return; }
      aoTerminar?.();
      router.refresh();
    });
  };

  const abrirMembros = (t: TurmaResumo) => {
    setErro(null); setSelecionados(new Set()); setDestino('');
    startTransition(async () => {
      const r: any = await listarMembrosTurma({ empresaId, turmaId: t.id });
      if (r?.success === false) { setErro(r.error); return; }
      setVendo({ turmaId: t.id, pessoas: r.data?.pessoas || [], titulo: t.nome });
    });
  };

  const abrirSemTurma = () => {
    setErro(null); setSelecionados(new Set()); setDestino('');
    startTransition(async () => {
      const r: any = await listarSemTurma({ empresaId });
      if (r?.success === false) { setErro(r.error); return; }
      const pessoas = (r.data?.pessoas || []).map((p: any) => ({
        id: p.id, nome: p.nome_completo, cargo: p.cargo, email: p.email,
      }));
      setVendo({ turmaId: '', pessoas, titulo: 'Sem turma' });
    });
  };

  const mover = () => {
    if (!destino || selecionados.size === 0) return;
    executar(
      () => moverParaTurma({ empresaId, turmaId: destino, colaboradorIds: [...selecionados] }),
      () => { setVendo(null); setSelecionados(new Set()); setDestino(''); },
    );
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-[68ch] text-[13.5px] text-[var(--ink-dim)]">
          Cada turma tem <b className="text-[var(--ink)]">estado próprio</b> e uma próxima ação. As fases F0/F1
          (cargos, Top 10, gabarito, cenários) seguem institucionais — perfil ideal é do cargo, não da safra.
        </p>
        <button type="button" className={btnPrim} onClick={() => setCriando((v) => !v)} disabled={pendente}>
          <Plus size={12} className="mr-1 inline" /> Nova turma
        </button>
      </div>

      {erro && (
        <div className="rounded-xl border border-[#e74c3c40] bg-[#e74c3c12] px-4 py-2.5 text-[13px] text-[#ff9b90]">
          {erro}
        </div>
      )}

      {criando && (
        <FormTurma
          onCancelar={() => setCriando(false)}
          onSalvar={(dados) => executar(
            () => criarTurma({ empresaId, ...dados }),
            () => setCriando(false),
          )}
          pendente={pendente}
        />
      )}

      {/* Pendência VISÍVEL: quem está sem turma não recebe lote nem comunicação. */}
      {portfolio.semTurma > 0 && (
        <button
          type="button"
          onClick={abrirSemTurma}
          disabled={pendente}
          className="flex items-center justify-between rounded-2xl border border-[#f4b74040] bg-[#f4b74012] px-4 py-3 text-left text-[13px] text-[var(--warning)] transition-colors hover:bg-[#f4b74020]"
        >
          <span>
            <b>{portfolio.semTurma}</b> pessoa(s) sem turma — não recebem ação em lote nem comunicação até serem
            classificadas.
          </span>
          <ArrowRight size={14} />
        </button>
      )}

      <div className="flex flex-col gap-2.5">
        {portfolio.turmas.map((t) => {
          const chip = STATUS[t.status] || STATUS.planejada;
          return (
            <div key={t.id} className="rounded-2xl border border-white/[0.08] bg-[var(--navy-card)] px-4 py-3.5 shadow-[0_8px_20px_rgba(0,0,0,0.18)]">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">{t.nome}</h3>
                  <span className="font-mono text-[11px] text-[var(--ink-faint)]">
                    {t.membros} pessoa(s)
                    {t.programaModo ? ` · ${t.programaModo}` : ''}
                    {t.dataInicio ? ` · início ${t.dataInicio}` : ''}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className={`whitespace-nowrap rounded-full px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.08em] ${chip.classe}`}>
                    {chip.rotulo}
                  </span>
                  <button type="button" className={btnGhost} onClick={() => abrirMembros(t)} disabled={pendente} title="Ver e mover membros">
                    <Users size={13} />
                  </button>
                  <button type="button" className={btnGhost} onClick={() => setEditando(editando === t.id ? null : t.id)} disabled={pendente} title="Editar">
                    <Pencil size={13} />
                  </button>
                  {t.status !== TURMA.ARQUIVADA && (
                    <button
                      type="button"
                      className={btnGhost}
                      title="Arquivar"
                      disabled={pendente}
                      onClick={() => executar(() => arquivarTurma({ empresaId, turmaId: t.id }))}
                    >
                      <Archive size={13} />
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-[var(--ink-dim)]">
                <span>responderam: {fracao(t.comResposta, t.membros)}</span>
                <span>avaliados: {fracao(t.comIa4, t.membros)}</span>
                <span>com trilha: {fracao(t.comTrilha, t.membros)}</span>
              </div>

              {t.semanas.length > 0 && (
                <div className="mt-1 font-mono text-[11px] text-[var(--ink-faint)]">
                  jornada: {t.semanas.map((s) => `${s.pessoas} na semana ${s.semana}`).join(' · ')}
                </div>
              )}

              {t.proximaAcao && (
                <a
                  href={`/admin/empresas/${empresaId}?turma=${t.id}`}
                  className="mt-1.5 block text-[12.5px] text-[var(--cyan)] hover:underline"
                >
                  → {t.proximaAcao}
                </a>
              )}

              {editando === t.id && (
                <div className="mt-3 border-t border-white/[0.08] pt-3">
                  <FormTurma
                    inicial={{ nome: t.nome, dataInicio: t.dataInicio, status: t.status, programaModo: t.programaModo }}
                    onCancelar={() => setEditando(null)}
                    onSalvar={(dados) => executar(
                      () => editarTurma({ empresaId, turmaId: t.id, ...dados }),
                      () => setEditando(null),
                    )}
                    pendente={pendente}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {vendo && (
        <div className="rounded-2xl border border-white/[0.12] bg-[var(--navy-card)] px-4 py-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              {vendo.titulo} · <span className="font-mono text-[11px] text-[var(--ink-faint)]">{vendo.pessoas.length} pessoa(s)</span>
            </h3>
            <button type="button" className={btnGhost} onClick={() => setVendo(null)}><X size={13} /></button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={btnGhost}
              onClick={() => setSelecionados(new Set(vendo.pessoas.map((p) => p.id)))}
            >
              selecionar todos
            </button>
            <button type="button" className={btnGhost} onClick={() => setSelecionados(new Set())}>limpar</button>
            <select className={campo} value={destino} onChange={(e) => setDestino(e.target.value)}>
              <option value="">mover para…</option>
              {ativas.filter((t) => t.id !== vendo.turmaId).map((t) => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
            <button type="button" className={btnPrim} onClick={mover} disabled={pendente || !destino || selecionados.size === 0}>
              mover {selecionados.size || ''}
            </button>
            {/* PRÉVIA: quem sai de onde. Mover fecha a participação anterior — a
                pessoa não fica em duas turmas (índice parcial no banco). */}
            {selecionados.size > 0 && destino && (
              <span className="font-mono text-[11px] text-[var(--ink-faint)]">
                {selecionados.size} de {vendo.pessoas.length} · a participação atual será encerrada
              </span>
            )}
          </div>

          <div className="mt-2.5 max-h-[320px] overflow-y-auto">
            {vendo.pessoas.map((p) => {
              const on = selecionados.has(p.id);
              return (
                <label
                  key={p.id}
                  className={`flex cursor-pointer items-center gap-2.5 border-b border-white/[0.05] px-1 py-1.5 text-[12.5px] ${on ? 'bg-[#34c5cc0f]' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => setSelecionados((prev) => {
                      const nova = new Set(prev);
                      if (nova.has(p.id)) nova.delete(p.id); else nova.add(p.id);
                      return nova;
                    })}
                  />
                  <span className="min-w-0 flex-1 truncate">{p.nome}</span>
                  <span className="shrink-0 font-mono text-[10.5px] text-[var(--ink-faint)]">{p.cargo || '—'}</span>
                  {/* O estado individual importa ao mover: quem já tem trilha
                      carrega o carimbo da participação anterior. */}
                  <span className="shrink-0 font-mono text-[10px] text-[var(--ink-faint)]">
                    {p.temTrilha ? 'trilha' : p.avaliado ? 'avaliado' : p.respondeu ? 'respondeu' : '—'}
                  </span>
                </label>
              );
            })}
            {vendo.pessoas.length === 0 && (
              <p className="py-3 text-[12.5px] text-[var(--ink-faint)]">Ninguém aqui.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FormTurma({
  inicial, onSalvar, onCancelar, pendente,
}: {
  inicial?: { nome: string; dataInicio: string | null; status: string; programaModo: string | null };
  onSalvar: (dados: { nome: string; dataInicio: string | null; status: any; sysConfig: Record<string, any> }) => void;
  onCancelar: () => void;
  pendente: boolean;
}) {
  const [nome, setNome] = useState(inicial?.nome || '');
  const [dataInicio, setDataInicio] = useState(inicial?.dataInicio || '');
  const [status, setStatus] = useState(inicial?.status || TURMA.PLANEJADA);
  const [modo, setModo] = useState(inicial?.programaModo || '');

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-white/[0.1] bg-[#0b1a2e80] px-3 py-3">
      <label className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-faint)]">nome</span>
        <input className={`${campo} w-[260px]`} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Diretores escolares — 2026.2" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-faint)]">início (segunda)</span>
        <input type="date" className={campo} value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-faint)]">status</span>
        <select className={campo} value={status} onChange={(e) => setStatus(e.target.value)}>
          {OPCOES_STATUS.map((s) => <option key={s} value={s}>{STATUS[s]?.rotulo || s}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-faint)]">programa</span>
        <select className={campo} value={modo} onChange={(e) => setModo(e.target.value)}>
          {OPCOES_MODO.map((m) => <option key={m} value={m}>{m || 'herda da empresa'}</option>)}
        </select>
      </label>
      <button
        type="button"
        className={btnPrim}
        disabled={pendente || nome.trim().length < 2}
        onClick={() => onSalvar({
          nome: nome.trim(),
          dataInicio: dataInicio || null,
          status,
          // Só grava o que foi escolhido: `{}` deixa a turma herdando a empresa,
          // que é diferente de gravar um modo igual ao dela.
          sysConfig: modo ? { programa_modo: modo } : {},
        })}
      >
        salvar
      </button>
      <button type="button" className={btnGhost} onClick={onCancelar} disabled={pendente}>cancelar</button>
    </div>
  );
}
