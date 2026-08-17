'use client';

/**
 * Aviso de plano pronto (PDI) — prévia com denominador e disparo confirmado.
 *
 * Duas regras que a tela carrega, e não só exibe:
 *  1. **Nenhum número sem denominador**: "34 de 34 com plano", nunca "34".
 *  2. **Prévia antes de enviar**: o botão só aparece depois de contar, e diz
 *     exatamente quantas mensagens vão sair. Mensagem enviada não volta.
 */

import { useState, useTransition } from 'react';
import { Send, Loader2, Check, AlertTriangle } from 'lucide-react';
import { previaAvisoPlanos, dispararAvisoPlanos, type PreviaPlanos } from './planos-actions';

export default function PlanosPanel({ empresaId }: { empresaId: string }) {
  const [previa, setPrevia] = useState<PreviaPlanos | null>(null);
  const [resultado, setResultado] = useState<{ enviados: number; falhas: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [pendente, iniciar] = useTransition();

  const contar = () => iniciar(async () => {
    setErro(null); setResultado(null); setConfirmando(false);
    try { setPrevia(await previaAvisoPlanos(empresaId)); }
    catch (e: any) { setErro(e?.message || 'falha ao contar'); }
  });

  const enviar = () => iniciar(async () => {
    setErro(null);
    const r = await dispararAvisoPlanos(empresaId);
    setConfirmando(false);
    if (!r.success) { setErro(r.error); return; }
    setResultado({ enviados: r.enviados, falhas: r.falhas });
    try { setPrevia(await previaAvisoPlanos(empresaId)); } catch { /* a contagem volta no próximo clique */ }
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Avisar plano pronto</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--ink-faint)]">
          Envia por WhatsApp o template <code className="font-mono">plano_desenvolvimento</code> com o
          link de <code className="font-mono">/dashboard/pdi</code> — não é o PDF anexo, é a página onde
          a pessoa baixa. Quem já foi avisado nunca recebe de novo, e quem não tem plano é ignorado.
        </p>
      </div>

      <button
        onClick={contar}
        disabled={pendente}
        className="rounded border border-white/[0.12] px-3 py-1.5 font-mono text-[11px] transition-colors hover:border-[var(--cyan)] hover:text-[var(--cyan)] disabled:opacity-40"
      >
        {pendente && !confirmando ? <Loader2 size={12} className="inline animate-spin" /> : null} contar quem receberia
      </button>

      {previa && (
        <div className="space-y-3 rounded border border-white/[0.08] bg-white/[0.02] p-3">
          <div className="grid grid-cols-2 gap-2 font-mono text-[11px] sm:grid-cols-4">
            <Num rotulo="receberiam agora" valor={previa.elegiveis} total={previa.comPlano} destaque />
            <Num rotulo="já avisados" valor={previa.jaAvisados} total={previa.comPlano} />
            <Num rotulo="sem telefone" valor={previa.semTelefone} total={previa.comPlano} />
            <Num rotulo="com plano" valor={previa.comPlano} total={previa.comPlano} />
          </div>

          {previa.elegiveis === 0 ? (
            <p className="text-[11px] text-[var(--ink-faint)]">Ninguém a avisar neste momento.</p>
          ) : !confirmando ? (
            <button
              onClick={() => setConfirmando(true)}
              className="flex items-center gap-1.5 rounded bg-[var(--cyan)] px-3 py-1.5 font-mono text-[11px] font-semibold text-black transition-opacity hover:opacity-90"
            >
              <Send size={12} /> enviar para {previa.elegiveis}
            </button>
          ) : (
            <div className="space-y-2 rounded border border-[var(--warning)]/40 bg-[#f4b74012] p-2.5">
              <p className="flex items-start gap-1.5 text-[11px] text-[var(--warning)]">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                <span>
                  {previa.elegiveis} mensagem(ns) de WhatsApp sairão agora, uma a cada 6 segundos
                  (~{Math.ceil((previa.elegiveis * 6) / 60)} min). Não há como recolher.
                </span>
              </p>
              <div className="flex gap-2">
                <button
                  onClick={enviar}
                  disabled={pendente}
                  className="rounded bg-[var(--warning)] px-3 py-1.5 font-mono text-[11px] font-semibold text-black disabled:opacity-40"
                >
                  {pendente ? <Loader2 size={12} className="inline animate-spin" /> : null} confirmar envio
                </button>
                <button
                  onClick={() => setConfirmando(false)}
                  disabled={pendente}
                  className="rounded border border-white/[0.12] px-3 py-1.5 font-mono text-[11px] disabled:opacity-40"
                >
                  cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {resultado && (
        <p className="flex items-center gap-1.5 font-mono text-[11px] text-[var(--success)]">
          <Check size={12} /> {resultado.enviados} enviado(s)
          {resultado.falhas > 0 && <span className="text-[var(--danger)]"> · {resultado.falhas} falha(s)</span>}
        </p>
      )}
      {erro && <p className="font-mono text-[11px] text-[var(--danger)]">{erro}</p>}
    </div>
  );
}

function Num({ rotulo, valor, total, destaque }: { rotulo: string; valor: number; total: number; destaque?: boolean }) {
  return (
    <div>
      <div className={destaque ? 'text-[var(--cyan)]' : ''}>
        <span className="text-base font-semibold">{valor}</span>
        <span className="text-[var(--ink-faint)]"> de {total}</span>
      </div>
      <div className="text-[10px] text-[var(--ink-faint)]">{rotulo}</div>
    </div>
  );
}
