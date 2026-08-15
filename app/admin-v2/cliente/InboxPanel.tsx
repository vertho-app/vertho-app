'use client';

import { useEffect, useState, useTransition, useRef } from 'react';
import { Send, Lock, RefreshCw, CheckCheck, Check, AlertTriangle, Mic, Image as ImageIcon, FileText } from 'lucide-react';
import { listarConversas, carregarThread, responderConversa, marcarLida } from './inbox-actions';
import type { Conversa, ThreadCompleta, ResultadoEnvio } from '@/lib/inbox/tipos';
import { restanteLegivel } from '@/lib/inbox/janela';

/**
 * Caixa de entrada do WhatsApp no workspace do cliente.
 *
 * DECISÕES DE INTERFACE QUE VÊM DA REGRA, NÃO DO GOSTO
 * ────────────────────────────────────────────────────
 * 1. **A janela de 24h controla o campo de resposta**, não apenas o explica.
 *    Aberta → campo habilitado com o tempo restante. Fechada → campo bloqueado
 *    com o motivo. Um campo que aceita texto e falha no envio é pior que um
 *    campo desabilitado: a pessoa escreve, tenta, perde o que digitou e não
 *    entende por quê.
 * 2. **"Nunca escreveu" é diferente de "janela fechada"** e a tela diz os dois.
 *    Tratar como o mesmo estado faria parecer que houve conversa e ela expirou.
 * 3. **Falha de envio aparece na thread**, não só num toast que some. Se o
 *    atendente não vê que falhou, ele reescreve — e a pessoa pode receber duas.
 */

const POLL_MS = 15_000;

function Marca({ item }: { item: { status?: string | null; entregueEm?: string | null; lidaEm?: string | null; erro?: string | null } }) {
  if (item.erro) return <AlertTriangle size={12} className="text-[var(--danger)]" aria-label="falhou" />;
  if (item.lidaEm) return <CheckCheck size={12} className="text-[var(--cyan)]" aria-label="lida" />;
  if (item.entregueEm) return <CheckCheck size={12} className="text-[var(--ink-faint)]" aria-label="entregue" />;
  return <Check size={12} className="text-[var(--ink-faint)]" aria-label="enviada" />;
}

function IconeTipo({ tipo }: { tipo: string }) {
  if (tipo === 'audio' || tipo === 'voice') return <Mic size={13} />;
  if (tipo === 'image' || tipo === 'video' || tipo === 'sticker') return <ImageIcon size={13} />;
  if (tipo === 'document') return <FileText size={13} />;
  return null;
}

export default function InboxPanel({ empresaId }: { empresaId: string }) {
  const [conversas, setConversas] = useState<Conversa[] | null>(null);
  const [ativa, setAtiva] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadCompleta | null>(null);
  const [texto, setTexto] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, startEnvio] = useTransition();
  const fim = useRef<HTMLDivElement>(null);

  async function recarregar() {
    try {
      setConversas(await listarConversas(empresaId));
    } catch (e: any) {
      setAviso(e?.message || 'Falha ao carregar conversas.');
    }
  }

  useEffect(() => { void recarregar(); }, [empresaId]);

  // Polling curto: sem volume, websocket seria complexidade sem uso. 15s é
  // suficiente para atendimento e não pesa no banco.
  useEffect(() => {
    const id = setInterval(() => { void recarregar(); if (ativa) void abrir(ativa, false); }, POLL_MS);
    return () => clearInterval(id);
  }, [ativa, empresaId]);

  async function abrir(telefone: string, marcar = true) {
    setAtiva(telefone);
    try {
      const t = await carregarThread(empresaId, telefone);
      setThread(t);
      if (marcar) { await marcarLida(empresaId, telefone); void recarregar(); }
      setTimeout(() => fim.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch (e: any) {
      setAviso(e?.message || 'Falha ao abrir a conversa.');
    }
  }

  function enviar() {
    if (!ativa || !texto.trim()) return;
    const corpo = texto.trim();
    // Idempotência: o mesmo conteúdo, na mesma conversa, dentro do mesmo minuto
    // é duplo clique — não uma segunda mensagem deliberada.
    const dedupeKey = `inbox:${ativa}:${corpo.slice(0, 40)}:${Math.floor(Date.now() / 60000)}`;
    setAviso(null);
    startEnvio(async () => {
      const r: ResultadoEnvio = await responderConversa({ empresaId, telefone: ativa, texto: corpo, dedupeKey });
      if (!r.ok) {
        setAviso(r.motivo || 'Falha ao enviar.');
        // Janela fechada ENTRE a renderização e o envio: recarrega para o campo
        // sumir. Sem isso a tela continuaria oferecendo um campo que já não vale,
        // e a pessoa tentaria de novo.
        if (r.janelaFechada) await abrir(ativa, false);
        return;
      }
      setTexto('');
      await abrir(ativa, false);
    });
  }

  if (conversas === null) {
    return <p className="py-8 text-center text-[13px] text-[var(--ink-faint)]">Carregando conversas…</p>;
  }

  if (!conversas.length) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-6 text-center">
        <p className="text-sm text-[var(--ink-dim)]">Nenhuma mensagem recebida deste cliente.</p>
        <p className="mt-2 text-[12px] text-[var(--ink-faint)]">
          As respostas dos colaboradores aparecem aqui assim que chegam pelo WhatsApp.
        </p>
      </div>
    );
  }

  const j = thread?.janela;

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      {/* Lista de conversas */}
      <div className="max-h-[560px] overflow-y-auto rounded-xl border border-white/[0.08]">
        {conversas.map((c) => {
          const on = ativa === c.telefone;
          return (
            <button
              key={c.telefone}
              type="button"
              onClick={() => void abrir(c.telefone)}
              className={`flex w-full flex-col gap-1 border-b border-white/[0.06] px-3.5 py-3 text-left transition-colors ${
                on ? 'bg-[#34c5cc12]' : 'hover:bg-white/[0.03]'
              }`}
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
                {c.ultimoTexto || '(mídia)'}
              </span>
              <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                {c.janela.estado === 'aberta'
                  ? `responde por ${restanteLegivel(c.janela.restanteMs)}`
                  : 'janela encerrada'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Thread */}
      <div className="flex min-h-[560px] flex-col rounded-xl border border-white/[0.08]">
        {!thread ? (
          <p className="m-auto text-[13px] text-[var(--ink-faint)]">Selecione uma conversa.</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3">
              <div>
                <p className="text-[13px] font-semibold">{thread.nome || thread.telefone}</p>
                <p className="font-mono text-[10px] text-[var(--ink-faint)]">{thread.telefone}</p>
              </div>
              <button
                type="button"
                onClick={() => void abrir(thread.telefone, false)}
                className="text-[var(--ink-faint)] transition-colors hover:text-[var(--cyan)]"
                title="Atualizar"
              >
                <RefreshCw size={14} />
              </button>
            </div>

            <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
              {thread.itens.map((it) => {
                const daPessoa = it.autor === 'pessoa';
                return (
                  <div key={it.id} className={`flex ${daPessoa ? 'justify-start' : 'justify-end'}`}>
                    <div
                      className={`max-w-[78%] rounded-xl px-3 py-2 text-[13px] ${
                        daPessoa
                          ? 'bg-white/[0.06]'
                          : it.autor === 'equipe'
                            ? 'bg-[#34c5cc1f]'
                            : 'bg-white/[0.03] text-[var(--ink-dim)]'
                      }`}
                    >
                      {it.texto ? (
                        <p className="whitespace-pre-wrap break-words">{it.texto}</p>
                      ) : it.midiaId ? (
                        <div className="flex items-center gap-2">
                          <IconeTipo tipo={it.tipo} />
                          {it.tipo === 'audio' || it.tipo === 'voice' ? (
                            <audio controls preload="none" className="h-8" src={`/api/inbox/midia/${it.midiaId}`} />
                          ) : it.tipo === 'image' ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img alt="imagem recebida" src={`/api/inbox/midia/${it.midiaId}`} className="max-h-52 rounded-lg" />
                          ) : (
                            <a href={`/api/inbox/midia/${it.midiaId}`} className="underline" target="_blank" rel="noreferrer">
                              abrir {it.tipo}
                            </a>
                          )}
                        </div>
                      ) : (
                        <p className="italic text-[var(--ink-faint)]">
                          {it.rotulo ? `enviado: ${it.rotulo}` : '(sem conteúdo)'}
                        </p>
                      )}

                      <div className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-[var(--ink-faint)]">
                        <span>{new Date(it.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                        {!daPessoa && <Marca item={it} />}
                        {it.autorEmail && <span>· {it.autorEmail.split('@')[0]}</span>}
                      </div>
                      {it.erro && <p className="mt-1 text-[11px] text-[var(--danger)]">{it.erro}</p>}
                    </div>
                  </div>
                );
              })}
              <div ref={fim} />
            </div>

            {/* Composer — a janela decide se existe */}
            <div className="border-t border-white/[0.08] p-3">
              {aviso && (
                <p className="mb-2 rounded-lg bg-[#e74c3c1a] px-3 py-2 text-[12px] text-[#ff9b90]">{aviso}</p>
              )}
              {j?.podeTextoLivre ? (
                <div className="flex items-end gap-2">
                  <textarea
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) enviar(); }}
                    rows={2}
                    maxLength={4096}
                    placeholder={`Responder — janela aberta por ${restanteLegivel(j.restanteMs)}`}
                    className="flex-1 resize-none rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-[13px] outline-none focus:border-[var(--cyan)]"
                  />
                  <button
                    type="button"
                    onClick={enviar}
                    disabled={enviando || !texto.trim()}
                    className="flex items-center gap-1.5 rounded-lg bg-[var(--cyan)] px-3.5 py-2.5 text-[13px] font-medium text-[#0f2b54] disabled:opacity-40"
                  >
                    <Send size={14} /> {enviando ? 'Enviando…' : 'Enviar'}
                  </button>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-lg bg-white/[0.03] px-3 py-2.5 text-[12px] text-[var(--ink-faint)]">
                  <Lock size={13} className="mt-0.5 shrink-0" />
                  <span>
                    {j?.estado === 'nunca-escreveu'
                      ? 'Esta pessoa nunca escreveu para o número. Sem janela aberta, só é possível enviar template aprovado.'
                      : 'A janela de 24 horas encerrou. Para falar agora, só por template aprovado — a pessoa precisa escrever de novo para reabrir a resposta livre.'}
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
