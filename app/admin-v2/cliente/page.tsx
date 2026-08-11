'use client';

import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import { ETAPAS_CLIENTE, FASES, REGUA, PREFLIGHT, type EstadoFase } from '../_dados/prototipo';

const CHIP: Record<EstadoFase, { classe: string; rotulo: string }> = {
  feito: { classe: 'bg-[#2ecc7124] text-[var(--success)]', rotulo: 'Concluído' },
  revisao: { classe: 'bg-[#f4b74029] text-[var(--warning)]', rotulo: 'Em revisão' },
  bloqueado: { classe: 'bg-[#e74c3c29] text-[#ff9b90]', rotulo: 'Bloqueado' },
  aguardando: { classe: 'bg-white/[0.06] text-[var(--ink-faint)]', rotulo: 'Aguardando' },
};

const PONTO: Record<string, string> = {
  feito: 'bg-[var(--success)]',
  agora: 'bg-[var(--warning)]',
  neutro: 'bg-[var(--ink-faint)]',
};

export default function ClienteWorkspacePage() {
  const [etapa, setEtapa] = useState<string>('visao');
  const [preflight, setPreflight] = useState(false);

  // Esc fecha o preflight — confirmação de risco não pode virar armadilha.
  useEffect(() => {
    if (!preflight) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreflight(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [preflight]);

  const mostraRegua = etapa === 'regua' || etapa === 'preparar';

  return (
    <>
      <div className="flex flex-wrap gap-1 border-b border-white/[0.08]">
        {ETAPAS_CLIENTE.map((e) => {
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
              <span className={`h-1.5 w-1.5 rounded-full ${PONTO[e.estado]}`} />
              {e.rotulo}
            </button>
          );
        })}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-3.5">
          {!mostraRegua && (
            <>
              <div>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">Mapa de status</span>
                <h2 className="mt-1.5 text-base font-semibold">O pipeline volta a ser mapa, não menu</h2>
                <p className="mt-1.5 max-w-[76ch] text-[13.5px] text-[var(--ink-dim)]">
                  Cada fase mostra o estado e <b className="text-[var(--ink)]">uma</b> próxima ação, que abre a etapa certa
                  já no contexto do cliente. Os 25 controles que hoje só navegam saem daqui — 15 deles repetiam itens do menu.
                </p>
              </div>

              <div className="flex flex-col gap-2.5">
                {FASES.map((f) => (
                  <div
                    key={f.sigla}
                    className="grid grid-cols-[44px_1fr_auto] items-center gap-4 rounded-2xl border border-white/[0.08] bg-[var(--navy-card)] px-4.5 py-3.5 shadow-[0_8px_20px_rgba(0,0,0,0.18)]"
                  >
                    <div className="text-center font-mono text-[11px] text-[var(--ink-faint)]">
                      <b className="block font-[family-name:var(--font-serif)] text-[19px] font-normal text-[var(--ink-dim)]">
                        {f.sigla}
                      </b>
                      {f.rotulo}
                    </div>
                    <div>
                      <h3 className="mb-0.5 text-sm font-semibold">{f.titulo}</h3>
                      <span className="font-mono text-[11px] text-[var(--ink-faint)]">{f.meta}</span>
                      {f.proximaAcao && (
                        <span className="mt-1.5 block text-[12.5px] text-[var(--cyan)]">→ {f.proximaAcao}</span>
                      )}
                    </div>
                    <span className={`whitespace-nowrap rounded-full px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.08em] ${CHIP[f.estado].classe}`}>
                      {CHIP[f.estado].rotulo}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {mostraRegua && (
            <>
              <div>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                  Gerar → revisar → aprovar
                </span>
                <h2 className="mt-1.5 text-base font-semibold">A régua inteira numa etapa só</h2>
                <p className="mt-1.5 max-w-[76ch] text-[13.5px] text-[var(--ink-dim)]">
                  Hoje isso exige alternar entre Pipeline, Cargos e Fase 1. Cada passo carrega os três estados e o
                  denominador do que falta.
                </p>
              </div>

              <div className="flex flex-col rounded-2xl border border-white/[0.08] bg-[var(--navy-card)] px-5 shadow-[0_8px_20px_rgba(0,0,0,0.18)]">
                {REGUA.map((p, i) => (
                  <div
                    key={p.titulo}
                    className={`grid grid-cols-[26px_1fr_auto] items-start gap-3.5 py-4 ${
                      i < REGUA.length - 1 ? 'border-b border-white/[0.08]' : ''
                    }`}
                  >
                    <span
                      className={`grid h-[22px] w-[22px] place-items-center rounded-full border font-mono text-[10px] ${
                        p.estado === 'aprovado'
                          ? 'border-[#2ecc7166] bg-[#2ecc7129] text-[var(--success)]'
                          : 'border-[#f4b74073] bg-[#f4b74029] text-[var(--warning)]'
                      }`}
                    >
                      {p.estado === 'aprovado' ? '✓' : '●'}
                    </span>
                    <div>
                      <h3 className="mb-0.5 text-[13.5px] font-semibold">{p.titulo}</h3>
                      <p className="text-xs text-[var(--ink-dim)]">
                        {p.descricao} · <span className="font-mono text-[11px] text-[var(--cyan-soft)]">{p.denominador}</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 overflow-hidden rounded-full border border-white/[0.14]">
                      {(['gerar', 'revisar', 'aprovar'] as const).map((s) => {
                        const ativo =
                          (p.estado === 'aprovado' && s === 'aprovar') || (p.estado === 'revisando' && s === 'revisar');
                        return (
                          <span
                            key={s}
                            className={`px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.08em] ${
                              ativo
                                ? p.estado === 'aprovado'
                                  ? 'bg-[#2ecc7124] text-[var(--success)]'
                                  : 'bg-[#34c5cc2e] text-[var(--cyan)]'
                                : 'text-[var(--ink-faint)]'
                            }`}
                          >
                            {ativo && p.estado === 'aprovado' ? 'aprovado' : s}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => setPreflight(true)}
                  className="flex items-center gap-2 rounded-full bg-[var(--cyan)] px-4 py-2 text-[12.5px] font-semibold text-[#052227] transition-colors hover:bg-[var(--cyan-soft)]"
                >
                  <Zap size={14} /> Gerar cenários dos 2 cargos restantes
                </button>
                <button
                  type="button"
                  className="rounded-full border border-white/[0.14] px-4 py-2 text-[12.5px] font-medium text-[var(--ink-dim)] transition-colors hover:border-[var(--cyan)] hover:text-[var(--cyan)]"
                >
                  Revisar os 16 pendentes
                </button>
              </div>

              <div className="rounded-[10px] border border-dashed border-red-400/40 bg-red-400/5 px-3.5 py-3 text-xs text-[var(--ink-dim)]">
                <b className="font-semibold text-red-300">Hoje:</b> gerar acontece no card do pipeline, revisar em{' '}
                <span className="font-mono">/fase1</span>, a votação em <span className="font-mono">/cargos</span> e a
                régua em <span className="font-mono">/competencias</span> — quatro telas para uma tarefa, e nada impede
                executar fora de ordem.
              </div>
            </>
          )}
        </div>

        <aside className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-[var(--navy-card)] p-4 shadow-[0_8px_20px_rgba(0,0,0,0.18)]">
            <h3 className="text-[12.5px] font-semibold">🚧 Bloqueadores</h3>
            <p className="border-b border-white/[0.08] pb-2.5 text-xs text-[var(--ink-dim)]">
              <b className="text-[var(--ink)]">F2 travado:</b> nenhum convite enviado. 6 pessoas aguardam.
            </p>
            <p className="text-xs text-[var(--ink-dim)]">
              <b className="text-[var(--ink)]">16 cenários</b> ainda sem revisão humana em F1.
            </p>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-[var(--navy-card)] p-4 shadow-[0_8px_20px_rgba(0,0,0,0.18)]">
            <h3 className="text-[12.5px] font-semibold">⚙ Jobs em andamento</h3>
            {[
              { nome: 'IA3 · cenários', estado: '18/25', pct: 72, erro: false },
              { nome: 'Kit semanal · DISC D', estado: '4/4', pct: 100, erro: false },
              { nome: 'Roteiro de vídeo', estado: 'erro · 2 tentativas', pct: 35, erro: true },
            ].map((j) => (
              <div key={j.nome} className="text-xs">
                <div className="mb-1.5 flex justify-between gap-2">
                  <b className="font-medium">{j.nome}</b>
                  <span className="font-mono text-[10.5px] text-[var(--ink-faint)]">{j.estado}</span>
                </div>
                <div className="h-1 overflow-hidden rounded bg-white/[0.08]">
                  <span
                    className={`block h-full ${j.erro ? 'bg-[var(--danger)]' : 'bg-[var(--cyan)]'}`}
                    style={{ width: `${j.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>

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
              {PREFLIGHT.map((l, i) => (
                <div
                  key={l.rotulo}
                  className={`flex justify-between gap-4 py-2.5 text-[13px] ${
                    i < PREFLIGHT.length - 1 ? 'border-b border-white/[0.08]' : ''
                  }`}
                >
                  <span className="text-[var(--ink-dim)]">{l.rotulo}</span>
                  <b
                    className={`text-right font-medium ${
                      l.tom === 'ok' ? 'text-[var(--success)]' : l.tom === 'atencao' ? 'text-[var(--warning)]' : ''
                    }`}
                  >
                    {l.valor}
                  </b>
                </div>
              ))}
            </div>
            <footer className="flex items-center gap-2.5 border-t border-white/[0.08] bg-black/[0.14] px-6 pb-5 pt-4">
              <span className="mr-auto max-w-[26ch] text-[11.5px] leading-snug text-[var(--ink-faint)]">
                Ao confirmar, isto vira um job com progresso, retry por item e custo realizado.
              </span>
              <button
                type="button"
                onClick={() => setPreflight(false)}
                className="rounded-full border border-white/[0.14] px-4 py-2 text-[12.5px] font-medium text-[var(--ink-dim)] transition-colors hover:border-[var(--cyan)] hover:text-[var(--cyan)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => setPreflight(false)}
                className="rounded-full bg-[var(--cyan)] px-4 py-2 text-[12.5px] font-semibold text-[#052227] transition-colors hover:bg-[var(--cyan-soft)]"
              >
                Gerar 10 cenários
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
