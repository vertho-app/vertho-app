'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Inbox } from 'lucide-react';
import { listarConversas } from './inbox-actions';
import ThreadView from '../_inbox/ThreadView';
import { useConversa } from '../_inbox/useConversa';
import { useIntervaloVisivel } from '../_inbox/useIntervaloVisivel';
import type { Conversa } from '@/lib/inbox/tipos';
import { rotuloDoTipo } from '@/lib/inbox/caixa';
import { restanteLegivel } from '@/lib/inbox/janela';

/**
 * Caixa de entrada do WhatsApp no workspace do cliente — só as conversas DESTA
 * empresa.
 *
 * ⚠️ ESTA TELA NÃO MOSTRA TUDO, e a diferença importa para quem atende: uma
 * mensagem cujo telefone o webhook não conseguiu atribuir não tem empresa,
 * portanto não aparece em cliente nenhum. Ela vive em `/admin-v2/inbox`, a caixa
 * da equipe. O link no rodapé existe porque a ausência aqui é silenciosa: sem
 * ele, "nenhuma mensagem" continua parecendo "ninguém escreveu".
 *
 * O estado da conversa aberta (rascunho por conversa, guarda de corrida do
 * polling) vive em `useConversa`, compartilhado com a caixa da equipe.
 */

/** A conversa aberta é o que a pessoa está olhando; a lista custa mais e muda menos. */
const POLL_THREAD_MS = 5_000;
const POLL_LISTA_MS = 15_000;

export default function InboxPanel({ empresaId }: { empresaId: string }) {
  const [conversas, setConversas] = useState<Conversa[] | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  /** Também quem só recebeu (ver o mesmo controle em `/admin-v2/inbox`). */
  const [incluirSemResposta, setIncluirSemResposta] = useState(false);

  const recarregar = useCallback(async () => {
    try {
      setConversas(await listarConversas(empresaId, { incluirSemResposta }));
      setErroLista(null);
    } catch (e: any) {
      setErroLista(e?.message || 'Falha ao carregar conversas.');
    }
  }, [empresaId, incluirSemResposta]);

  const conversa = useConversa(recarregar);
  const { abrir, fechar, atualizar, estaAtiva, thread, aviso, rascunho, escrever, enviar, enviando, ativa, anexo, anexar, enviarAnexo } = conversa;

  useEffect(() => { void recarregar(); }, [recarregar]);

  // Dois ritmos, não um: a CONVERSA ABERTA é o que a pessoa está olhando (5s), a
  // lista muda menos e custa mais (15s). Antes eram os dois a 15s, e a mensagem
  // que o webhook grava em 2-3s levava até 15 para aparecer.
  useIntervaloVisivel(atualizar, POLL_THREAD_MS);
  useIntervaloVisivel(() => { void recarregar(); }, POLL_LISTA_MS);

  if (conversas === null && !erroLista) {
    return <p className="py-8 text-center text-[13px] text-[var(--ink-faint)]">Carregando conversas…</p>;
  }

  if (erroLista) {
    return (
      <div className="rounded-xl border border-red-400/40 bg-red-400/5 px-4 py-3 text-[13px] text-red-200">
        {erroLista}
      </div>
    );
  }

  /**
   * O controle vive FORA do `if (vazio)`, e isso não é detalhe de layout: sem
   * resposta nenhuma é exatamente quando alguém quer ver o que foi enviado. Um
   * checkbox que só aparece quando já há conversa é inalcançável no único estado
   * em que ele muda alguma coisa.
   */
  const controle = (
    <label
      className="flex items-center gap-1.5 text-[12px] text-[var(--ink-dim)]"
      title="Inclui quem recebeu mensagem nossa e ainda não respondeu"
    >
      <input
        type="checkbox"
        checked={incluirSemResposta}
        onChange={(e) => setIncluirSemResposta(e.target.checked)}
      />
      mostrar enviadas sem resposta
    </label>
  );

  if (!conversas?.length) {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-6 text-center">
          <p className="text-sm text-[var(--ink-dim)]">
            {incluirSemResposta
              ? 'Nenhuma mensagem trocada com este cliente — nem recebida, nem enviada.'
              : 'Nenhuma mensagem recebida deste cliente.'}
          </p>
          <p className="mt-2 text-[12px] text-[var(--ink-faint)]">
            As respostas dos colaboradores aparecem aqui assim que chegam pelo WhatsApp. Mensagens de telefone que
            o sistema não conseguiu identificar não entram nesta lista —{' '}
            <Link href="/admin-v2/inbox" className="underline underline-offset-2 hover:text-[var(--cyan)]">
              veja a caixa da equipe
            </Link>.
          </p>
        </div>
        {controle}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {controle}
      {/* Lista e conversa se ALTERNAM no celular — ver o comentário em
          `_inbox/ThreadView.tsx`: empilhadas, o toque parecia não fazer nada. */}
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* Lista de conversas */}
        <div
          className={`max-h-[560px] overflow-y-auto rounded-xl border border-white/[0.08] ${
            ativa ? 'hidden lg:block' : ''
          }`}
        >
          {conversas.map((c) => {
            const on = estaAtiva({ empresaId, telefone: c.telefone });
            return (
              <button
                key={c.telefone}
                type="button"
                onClick={() => abrir({ empresaId, telefone: c.telefone })}
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
                  {c.ultimoLado === 'equipe' && <span>nós: </span>}
                  {c.ultimoTexto || rotuloDoTipo(c.ultimoTipo)}
                </span>
                <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                  {c.recebidas === 0
                    ? `${c.enviadas} enviada(s) · sem resposta`
                    : c.janela.estado === 'aberta'
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
          onVoltar={fechar}
          anexo={anexo}
          onAnexar={anexar}
          onEnviarAnexo={enviarAnexo}
        />
      </div>

      <Link
        href="/admin-v2/inbox"
        className="flex items-center gap-1.5 self-start font-mono text-[11px] text-[var(--ink-faint)] transition-colors hover:text-[var(--cyan)]"
      >
        <Inbox size={12} /> caixa da equipe — todas as empresas e os telefones não identificados →
      </Link>
    </div>
  );
}
