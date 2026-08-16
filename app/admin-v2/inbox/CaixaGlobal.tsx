'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { Inbox, RefreshCw, UserPlus, Wand2, AlertTriangle } from 'lucide-react';
import {
  listarCaixaGlobal, listarFilaNaoIdentificada, associarTelefone, reprocessarNaoIdentificadas,
  type CaixaGlobal as Caixa,
} from './inbox-actions';
import ThreadView from '../_inbox/ThreadView';
import { useConversa } from '../_inbox/useConversa';
import { useIntervaloVisivel } from '../_inbox/useIntervaloVisivel';
import { rotuloDoTipo } from '@/lib/inbox/caixa';
import { restanteLegivel } from '@/lib/inbox/janela';
import type { FilaNaoIdentificada } from '@/lib/inbox/tipos';
import { AtivarPushInbox } from '@/components/notifications/ativar-push-inbox';

/**
 * Caixa de entrada da EQUIPE — todas as empresas numa lista só.
 *
 * POR QUE ESTA TELA, e não "entrar cliente por cliente"
 * ─────────────────────────────────────────────────────
 * Uma resposta chega quando chega, sem avisar em qual workspace. Sem visão
 * única, perceber que alguém escreveu exige abrir cada cliente — então na
 * prática ninguém percebe. E o caso pior nem tinha onde aparecer: telefone que o
 * webhook não conseguiu atribuir fica SEM empresa, portanto fora de todos os
 * workspaces. Medido em 15/08/2026: a única mensagem já recebida estava
 * exatamente nesse estado — invisível, enquanto a tela do cliente afirmava
 * "nenhuma mensagem recebida".
 *
 * A fila de não identificados é a primeira seção, não a última: é a única parte
 * desta tela que exige uma pessoa.
 */

/**
 * Três ritmos. A fila de não identificados é a mais cara (uma consulta por
 * empresa para achar os candidatos) e a que menos muda — rodá-la junto com a
 * thread era gastar várias consultas por ciclo para atualizar o que não mudou.
 */
const POLL_THREAD_MS = 5_000;
const POLL_LISTA_MS = 15_000;
const POLL_FILA_MS = 60_000;

function Numero({ valor, rotulo, destaque }: { valor: number; rotulo: string; destaque?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 rounded-xl border border-white/[0.08] bg-[var(--navy-card)] px-3.5 py-2.5">
      <span
        className={`font-[family-name:var(--font-serif)] text-[22px] leading-none ${
          destaque && valor > 0 ? 'text-[var(--warning)]' : 'text-[var(--cyan)]'
        }`}
      >
        {valor}
      </span>
      <span className="text-[12px] text-[var(--ink-dim)]">{rotulo}</span>
    </div>
  );
}

export default function CaixaGlobal() {
  const [caixa, setCaixa] = useState<Caixa | null>(null);
  const [fila, setFila] = useState<{ fila: FilaNaoIdentificada[]; truncada: boolean } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [empresaFiltro, setEmpresaFiltro] = useState('');
  const [soNaoLidas, setSoNaoLidas] = useState(false);
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const [avisoFila, setAvisoFila] = useState<string | null>(null);
  const [agindo, startAcao] = useTransition();

  const recarregarCaixa = useCallback(async () => {
    try {
      setCaixa(await listarCaixaGlobal());
      setErro(null);
    } catch (e: any) {
      setErro(e?.message || 'Falha ao carregar a caixa.');
    }
  }, []);

  const recarregarFila = useCallback(async () => {
    try {
      setFila(await listarFilaNaoIdentificada());
    } catch (e: any) {
      // A fila é a parte cara e a menos urgente: falhar aqui não pode esconder
      // as conversas, que é o que a tela existe para mostrar.
      console.error('[inbox] fila:', e?.message);
    }
  }, []);

  /** Depois de uma ação (envio, associação), as duas partes mudam. */
  const recarregar = useCallback(async () => {
    await Promise.all([recarregarCaixa(), recarregarFila()]);
  }, [recarregarCaixa, recarregarFila]);

  const conversa = useConversa(recarregar);
  const { abrir, atualizar, estaAtiva, thread, aviso, rascunho, escrever, enviar, enviando, ativa, anexo, anexar, enviarAnexo } = conversa;

  useEffect(() => { void recarregar(); }, [recarregar]);

  useIntervaloVisivel(atualizar, POLL_THREAD_MS);
  useIntervaloVisivel(() => { void recarregarCaixa(); }, POLL_LISTA_MS);
  useIntervaloVisivel(() => { void recarregarFila(); }, POLL_FILA_MS);

  function associar(item: FilaNaoIdentificada) {
    const telefone = item.telefone;
    const colaboradorId = escolha[telefone];
    // O cliente do candidato vai junto: o servidor confirma o par (empresa,
    // pessoa) no banco antes de escrever — o par vem da lista que ele mesmo
    // devolveu, não de um campo digitado.
    const candidato = item.candidatos.find((c) => c.colaboradorId === colaboradorId);
    if (!candidato) {
      setAvisoFila('Escolha a quem este telefone pertence antes de associar.');
      return;
    }
    setAvisoFila(null);
    startAcao(async () => {
      const r = await associarTelefone({ telefone, colaboradorId, empresaId: candidato.empresaId });
      setAvisoFila(r.ok ? `Telefone associado — ${r.mensagens} mensagem(ns) atribuída(s).` : (r.motivo || 'Falha ao associar.'));
      await recarregar();
    });
  }

  function reprocessar() {
    setAvisoFila(null);
    startAcao(async () => {
      const r = await reprocessarNaoIdentificadas();
      setAvisoFila(
        r.resolvidas > 0
          ? `${r.resolvidas} telefone(s) resolvido(s), ${r.mensagens} mensagem(ns) atribuída(s). ${r.restantes} ainda sem dono.`
          : `Nenhum resolveu automaticamente — os ${r.restantes} restantes continuam ambíguos e precisam de escolha manual.`,
      );
      await recarregar();
    });
  }

  if (erro) {
    return (
      <div className="rounded-2xl border border-red-400/40 bg-red-400/5 px-5 py-4 text-sm text-red-200">{erro}</div>
    );
  }

  if (!caixa || !fila) {
    return <p className="py-8 text-center text-[13px] text-[var(--ink-faint)]">Carregando a caixa…</p>;
  }

  const visiveis = caixa.conversas
    .filter((c) => (empresaFiltro ? c.empresaId === empresaFiltro : true))
    .filter((c) => (soNaoLidas ? c.naoLidas > 0 : true));

  return (
    <div className="flex flex-col gap-5">
      {/* Resumo */}
      <div className="flex flex-wrap gap-2.5">
        <Numero valor={caixa.resumo.conversasNaoLidas} rotulo="conversas não lidas" destaque />
        <Numero valor={caixa.resumo.naoLidas} rotulo="mensagens não lidas" />
        <Numero valor={caixa.resumo.janelasAbertas} rotulo="janelas abertas agora" />
        <Numero valor={caixa.resumo.naoIdentificadas} rotulo="sem cliente identificado" destaque />
      </div>

      {/* Push da inbox — opt-in da equipe (só platform admin, flag fail-closed) */}
      <AtivarPushInbox />

      {/* Fila de não identificados — primeiro, porque é o que exige gente */}
      {fila.fila.length > 0 && (
        <section className="flex flex-col gap-3 rounded-2xl border border-l-2 border-white/[0.08] border-l-[var(--warning)] bg-[var(--navy-card)] p-4">
          <header className="flex flex-wrap items-center gap-3">
            <AlertTriangle size={15} className="text-[var(--warning)]" />
            <div className="min-w-0 flex-1">
              <h2 className="text-[13.5px] font-semibold">Telefones não identificados</h2>
              <p className="mt-0.5 text-[12px] text-[var(--ink-dim)]">
                O número da Cloud API é o mesmo para todos os clientes, então quem escreve chega sem cliente. Estas
                conversas não aparecem em workspace nenhum até alguém dizer de quem são.
              </p>
            </div>
            <button
              type="button"
              onClick={reprocessar}
              disabled={agindo}
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.14] px-2.5 py-1.5 text-[12px] transition-colors hover:border-[var(--cyan)] hover:text-[var(--cyan)] disabled:opacity-40"
              title="Roda o resolvedor de novo — útil quando o cadastro foi corrigido depois da mensagem chegar"
            >
              <Wand2 size={12} /> {agindo ? 'processando…' : 'tentar resolver de novo'}
            </button>
          </header>

          {avisoFila && (
            <p className="rounded-lg bg-white/[0.04] px-3 py-2 text-[12px] text-[var(--ink-dim)]">{avisoFila}</p>
          )}

          <ul className="flex flex-col gap-2">
            {fila.fila.map((f) => (
              <li key={f.telefone} className="flex flex-wrap items-center gap-3 border-t border-white/[0.08] pt-2.5">
                <div className="min-w-[190px] flex-1">
                  <p className="font-mono text-[12px]">{f.telefone}</p>
                  <p className="truncate text-[12px] text-[var(--ink-faint)]">
                    {f.ultimoTexto || rotuloDoTipo(f.ultimoTipo)}
                  </p>
                  <p className="font-mono text-[10px] text-[var(--ink-faint)]">
                    {f.total} mensagem(ns) · {f.naoLidas} não lida(s) ·{' '}
                    {f.ambiguidade === 'telefone-em-multiplas-empresas'
                      ? 'cadastrado em mais de um cliente'
                      : f.ambiguidade === 'telefone-em-multiplas-pessoas'
                        ? 'mais de uma pessoa com este número'
                        : 'nenhum cadastro com este número'}
                  </p>
                </div>

                {f.candidatos.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={escolha[f.telefone] ?? ''}
                      onChange={(e) => setEscolha((s) => ({ ...s, [f.telefone]: e.target.value }))}
                      className="max-w-[280px] rounded-lg border border-white/[0.12] bg-[#06172c] px-2.5 py-1.5 text-[12px] outline-none focus:border-[var(--cyan)]"
                    >
                      <option value="">Escolher a quem pertence…</option>
                      {f.candidatos.map((c) => (
                        <option key={c.colaboradorId} value={c.colaboradorId}>
                          {c.nome || c.email || c.colaboradorId} · {c.empresa}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => associar(f)}
                      disabled={agindo}
                      className="flex items-center gap-1.5 rounded-lg bg-[var(--cyan)] px-2.5 py-1.5 text-[12px] font-medium text-[#0f2b54] disabled:opacity-40"
                    >
                      <UserPlus size={12} /> associar
                    </button>
                  </div>
                ) : (
                  <span className="text-[12px] text-[var(--ink-faint)]">
                    Nenhum colaborador cadastrado com este número — cadastre o telefone e use “tentar resolver de novo”.
                  </span>
                )}
              </li>
            ))}
          </ul>

          {fila.truncada && (
            <p className="font-mono text-[10.5px] text-[var(--warning)]">
              Lista cortada no teto desta tela — há mais telefones sem dono do que os exibidos.
            </p>
          )}
        </section>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2.5">
        <select
          value={empresaFiltro}
          onChange={(e) => setEmpresaFiltro(e.target.value)}
          className="rounded-lg border border-white/[0.12] bg-[#06172c] px-2.5 py-1.5 text-[12px] outline-none focus:border-[var(--cyan)]"
        >
          <option value="">Todos os clientes</option>
          {caixa.empresas.map((e) => (
            <option key={e.id} value={e.id}>{e.nome}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[12px] text-[var(--ink-dim)]">
          <input type="checkbox" checked={soNaoLidas} onChange={(e) => setSoNaoLidas(e.target.checked)} />
          só não lidas
        </label>
        <button
          type="button"
          onClick={() => void recarregar()}
          className="flex items-center gap-1.5 rounded-lg border border-white/[0.14] px-2.5 py-1.5 text-[12px] text-[var(--ink-faint)] transition-colors hover:text-[var(--cyan)]"
        >
          <RefreshCw size={12} /> atualizar
        </button>
        <span className="font-mono text-[11px] text-[var(--ink-faint)]">
          {visiveis.length} de {caixa.conversas.length} conversas
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[330px_1fr]">
        {/* Lista */}
        <div className="max-h-[560px] overflow-y-auto rounded-xl border border-white/[0.08]">
          {visiveis.length === 0 && (
            <p className="px-3.5 py-6 text-center text-[12px] text-[var(--ink-faint)]">
              {caixa.conversas.length === 0 ? 'Nenhuma mensagem recebida ainda.' : 'Nenhuma conversa neste filtro.'}
            </p>
          )}
          {visiveis.map((c) => {
            const semCliente = !c.empresaId;
            const on = c.empresaId ? estaAtiva({ empresaId: c.empresaId, telefone: c.telefone }) : false;
            return (
              <button
                key={`${c.empresaId ?? 'sem'}:${c.telefone}`}
                type="button"
                disabled={semCliente}
                onClick={() => c.empresaId && abrir({ empresaId: c.empresaId, telefone: c.telefone })}
                className={`flex w-full flex-col gap-1 border-b border-white/[0.06] px-3.5 py-3 text-left transition-colors ${
                  on ? 'bg-[#34c5cc12]' : semCliente ? 'opacity-70' : 'hover:bg-white/[0.03]'
                }`}
                title={semCliente ? 'Sem cliente identificado — associe na fila acima para abrir a conversa' : undefined}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-medium">{c.nome || c.telefone}</span>
                  {c.naoLidas > 0 && (
                    <span className="shrink-0 rounded-full bg-[var(--cyan)] px-1.5 py-0.5 font-mono text-[10px] text-[#0f2b54]">
                      {c.naoLidas}
                    </span>
                  )}
                </div>
                <span className="truncate text-[12px] text-[var(--ink-faint)]">
                  {c.ultimoTexto || rotuloDoTipo(c.ultimoTipo)}
                </span>
                <span className="flex items-center gap-1.5 font-mono text-[10px] text-[var(--ink-faint)]">
                  <span className={semCliente ? 'text-[var(--warning)]' : 'text-[var(--lilac)]'}>
                    {c.empresa ?? 'sem cliente'}
                  </span>
                  ·{' '}
                  {c.janela.estado === 'aberta'
                    ? `responde por ${restanteLegivel(c.janela.restanteMs)}`
                    : 'janela encerrada'}
                </span>
              </button>
            );
          })}
        </div>

        <ThreadView
          thread={ativa ? thread : null}
          aviso={aviso}
          rascunho={rascunho}
          onEscrever={escrever}
          onEnviar={enviar}
          enviando={enviando}
          onAtualizar={atualizar}
          contexto={caixa.empresas.find((e) => e.id === ativa?.empresaId)?.nome ?? null}
          anexo={anexo}
          onAnexar={anexar}
          onEnviarAnexo={enviarAnexo}
        />
      </div>

      <p className="flex items-center gap-1.5 font-mono text-[11px] text-[var(--ink-faint)]">
        <Inbox size={12} /> Agrupamento feito no banco (view `whatsapp_conversas`), não sobre uma janela das últimas
        mensagens — uma conversa movimentada não esconde as outras.
        {caixa.truncada && ' ⚠️ há mais conversas do que o teto desta tela.'}
      </p>
    </div>
  );
}
