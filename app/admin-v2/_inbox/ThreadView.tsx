'use client';

import { Send, Lock, RefreshCw, CheckCheck, Check, AlertTriangle, Mic, Image as ImageIcon, FileText, Paperclip, X } from 'lucide-react';
import type { ThreadCompleta } from '@/lib/inbox/tipos';
import { restanteLegivel } from '@/lib/inbox/janela';
import { MIMES_ACEITOS } from '@/lib/inbox/anexos';
import SeletorEmoji from './SeletorEmoji';

/**
 * A conversa aberta — um componente só, usado pela caixa do cliente e pela caixa
 * da equipe.
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

export function Marca({ item }: { item: { entregueEm?: string | null; lidaEm?: string | null; erro?: string | null } }) {
  if (item.erro) return <AlertTriangle size={12} className="text-[var(--danger)]" aria-label="falhou" />;
  if (item.lidaEm) return <CheckCheck size={12} className="text-[var(--cyan)]" aria-label="lida" />;
  if (item.entregueEm) return <CheckCheck size={12} className="text-[var(--ink-faint)]" aria-label="entregue" />;
  return <Check size={12} className="text-[var(--ink-faint)]" aria-label="enviada" />;
}

export function IconeTipo({ tipo }: { tipo: string | null }) {
  if (tipo === 'audio' || tipo === 'voice') return <Mic size={13} />;
  if (tipo === 'image' || tipo === 'video' || tipo === 'sticker') return <ImageIcon size={13} />;
  if (tipo === 'document') return <FileText size={13} />;
  return null;
}

function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function ThreadView({
  thread,
  aviso,
  rascunho,
  onEscrever,
  onEnviar,
  enviando,
  onAtualizar,
  contexto,
  anexo,
  onAnexar,
  onEnviarAnexo,
}: {
  thread: ThreadCompleta | null;
  aviso: string | null;
  rascunho: string;
  onEscrever: (v: string) => void;
  onEnviar: () => void;
  enviando: boolean;
  onAtualizar: () => void;
  /** Linha extra no cabeçalho — na caixa global, de que cliente é a conversa. */
  contexto?: string | null;
  anexo: File | null;
  onAnexar: (f: File | null) => void;
  onEnviarAnexo: () => void;
}) {
  if (!thread) {
    return (
      <div className="flex min-h-[560px] flex-col rounded-xl border border-white/[0.08]">
        <p className="m-auto text-[13px] text-[var(--ink-faint)]">Selecione uma conversa.</p>
      </div>
    );
  }

  const j = thread.janela;

  return (
    <div className="flex min-h-[560px] flex-col rounded-xl border border-white/[0.08]">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{thread.nome || thread.telefone}</p>
          <p className="font-mono text-[10px] text-[var(--ink-faint)]">
            {thread.telefone}
            {contexto ? ` · ${contexto}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onAtualizar}
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
      </div>

      {/* Composer — a janela decide se existe */}
      <div className="border-t border-white/[0.08] p-3">
        {aviso && (
          <p className="mb-2 rounded-lg bg-[#e74c3c1a] px-3 py-2 text-[12px] text-[#ff9b90]">{aviso}</p>
        )}
        {j?.podeTextoLivre ? (
          <div className="flex flex-col gap-2">
            {anexo && (
              <div className="flex items-center gap-2 rounded-lg border border-[var(--cyan)]/30 bg-[#34c5cc12] px-3 py-2 text-[12px]">
                <Paperclip size={13} className="shrink-0 text-[var(--cyan)]" />
                <span className="min-w-0 flex-1 truncate">{anexo.name}</span>
                <span className="shrink-0 font-mono text-[10.5px] text-[var(--ink-faint)]">
                  {tamanhoLegivel(anexo.size)}
                </span>
                <button
                  type="button"
                  onClick={() => onAnexar(null)}
                  aria-label="Remover anexo"
                  className="shrink-0 text-[var(--ink-faint)] transition-colors hover:text-[var(--danger)]"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            <div className="flex items-end gap-2">
              <label
                className={`rounded-lg p-2 transition-colors ${
                  enviando
                    ? 'cursor-not-allowed text-[var(--ink-faint)] opacity-40'
                    : 'cursor-pointer text-[var(--ink-faint)] hover:bg-white/[0.05] hover:text-[var(--cyan)]'
                }`}
                title="Anexar arquivo (até 4 MB)"
              >
                <Paperclip size={16} />
                <input
                  type="file"
                  className="hidden"
                  disabled={enviando}
                  accept={MIMES_ACEITOS.join(',')}
                  onChange={(e) => {
                    onAnexar(e.target.files?.[0] ?? null);
                    // Zera o input: sem isso, escolher o MESMO arquivo de novo
                    // (depois de remover) não dispara `change` e a tela não reage.
                    e.target.value = '';
                  }}
                />
              </label>

              <textarea
                value={rascunho}
                onChange={(e) => onEscrever(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) (anexo ? onEnviarAnexo() : onEnviar());
                }}
                rows={2}
                maxLength={4096}
                placeholder={
                  anexo
                    ? 'Legenda do arquivo (opcional)'
                    : `Responder — janela aberta por ${restanteLegivel(j.restanteMs)}`
                }
                className="flex-1 resize-none rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-[13px] outline-none focus:border-[var(--cyan)]"
              />

              <SeletorEmoji desabilitado={enviando} onEscolher={(e) => onEscrever(rascunho + e)} />

              <button
                type="button"
                onClick={anexo ? onEnviarAnexo : onEnviar}
                disabled={enviando || (!anexo && !rascunho.trim())}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--cyan)] px-3.5 py-2.5 text-[13px] font-medium text-[#0f2b54] disabled:opacity-40"
              >
                <Send size={14} /> {enviando ? 'Enviando…' : anexo ? 'Enviar arquivo' : 'Enviar'}
              </button>
            </div>
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
    </div>
  );
}
