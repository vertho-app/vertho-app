'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { getSupabase } from '@/lib/supabase-browser';
import { caminhoLocalOu } from '@/lib/auth/caminho-local';
import { cadastrarAparelho, confirmarCodigo, lerEtapa, type Etapa } from '@/lib/auth/segundo-fator-tela';

/**
 * Só o cliente do navegador: nenhuma action de admin funciona antes do código (elas negam o poder
 * de plataforma em `aal1`). Depois do `verify`, o supabase-js grava a sessão nova (`aal2`) no
 * cookie, e a navegação seguinte já chega ao servidor com ela.
 *
 * As regras (a aba de trás não cadastra; QR trocado não é código inválido) moram em
 * `lib/auth/segundo-fator-tela.ts`, onde os testes as alcançam.
 */
export default function SegundoFatorCliente() {
  const t = useTranslations('SegundoFator');
  const destino = caminhoLocalOu(useSearchParams().get('next'), '/admin/dashboard');
  const [etapa, setEtapa] = useState<Etapa>({ tipo: 'carregando' });
  const [codigo, setCodigo] = useState('');
  const [fatorEscolhido, setFatorEscolhido] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erroCodigo, setErroCodigo] = useState('');
  const [qrTrocado, setQrTrocado] = useState(false);

  const mostrar = useCallback((proxima: Etapa) => {
    if (proxima.tipo === 'sem-sessao') { window.location.replace(`/login?redirect=${encodeURIComponent(destino)}`); return; }
    if (proxima.tipo === 'confirmar') setFatorEscolhido(proxima.fatores[0].id);
    if (proxima.tipo === 'cadastrar') { setCodigo(''); setErroCodigo(''); }
    setQrTrocado(false);
    setEtapa(proxima);
  }, [destino]);

  const carregar = useCallback(async (sinal?: AbortSignal) => {
    const proxima = await lerEtapa(getSupabase().auth, document, () => new Date(), sinal);
    if (sinal?.aborted) return;
    mostrar(proxima);
  }, [mostrar]);

  async function cadastrar(reserva: boolean) {
    mostrar(await cadastrarAparelho(getSupabase().auth, new Date(), reserva));
  }

  // A aba de trás fica esperando vir para a frente; se a tela sair antes, ela não cadastra mais.
  useEffect(() => {
    const controle = new AbortController();
    carregar(controle.signal);
    return () => controle.abort();
  }, [carregar]);

  async function confirmar(factorId: string) {
    const limpo = codigo.replace(/\D/g, '');
    if (limpo.length !== 6 || enviando) return;
    setEnviando(true); setErroCodigo('');
    try {
      const resultado = await confirmarCodigo(getSupabase().auth, factorId, limpo);
      if (resultado.tipo === 'invalido') { setErroCodigo(t('errorInvalid')); return; }
      if (resultado.tipo === 'substituido') { setErroCodigo(t('errorReplaced')); setQrTrocado(true); return; }
      if (resultado.tipo === 'falha') { setErroCodigo(t('error', { error: resultado.detalhe })); return; }
      setCodigo('');
      await carregar();
    } finally {
      setEnviando(false);
    }
  }

  /** QR trocado: no cadastro gera outro do mesmo tipo; na confirmação relê (o aparelho saiu da conta). */
  function recomecar() {
    if (etapa.tipo === 'cadastrar') cadastrar(etapa.reserva);
    else carregar();
  }

  const campoCodigo = (factorId: string) => (
    <form className="flex w-full flex-col gap-3" onSubmit={(e) => { e.preventDefault(); confirmar(factorId); }}>
      <label className="text-left text-xs font-semibold text-gray-400" htmlFor="codigo-segundo-fator">{t('codeLabel')}</label>
      <input
        id="codigo-segundo-fator"
        value={codigo}
        onChange={(e) => setCodigo(e.target.value)}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        autoFocus
        className="w-full rounded-lg border border-white/10 bg-[#091D35] px-3 py-2 text-center text-xl tracking-[0.4em] text-white outline-none focus:border-cyan-400/60"
      />
      {erroCodigo && <p className="text-sm text-red-400">{erroCodigo}</p>}
      {qrTrocado ? (
        <button
          type="button"
          onClick={recomecar}
          className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-[#07162a] transition-colors hover:bg-cyan-400"
        >
          {t('newQr')}
        </button>
      ) : (
        <button
          type="submit"
          disabled={enviando || codigo.replace(/\D/g, '').length !== 6}
          className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-[#07162a] transition-colors hover:bg-cyan-400 disabled:opacity-40"
        >
          {enviando ? t('confirming') : t('confirm')}
        </button>
      )}
    </form>
  );

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#07162a] px-4 py-10">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        <ShieldCheck size={44} className="text-cyan-400" />
        <h1 className="text-lg font-semibold text-white">{t('title')}</h1>

        {etapa.tipo === 'carregando' && <Loader2 size={24} className="animate-spin text-gray-400" />}

        {etapa.tipo === 'erro' && <p className="text-sm text-red-400">{t('error', { error: etapa.detalhe })}</p>}

        {etapa.tipo === 'cadastrar' && (
          <>
            <p className="text-sm text-gray-300">{etapa.reserva ? t('backupSteps') : t('enrollSteps')}</p>
            <img src={etapa.qr} alt={t('qrAlt')} className="h-48 w-48 rounded-lg bg-white p-2" />
            <p className="text-xs text-gray-500">{t('manualKey')}</p>
            <code className="break-all rounded bg-white/5 px-2 py-1 text-xs text-gray-300">{etapa.chave}</code>
            {campoCodigo(etapa.factorId)}
          </>
        )}

        {etapa.tipo === 'confirmar' && (
          <>
            <p className="text-sm text-gray-300">{t('challengeSteps')}</p>
            {etapa.fatores.length > 1 && (
              <select
                value={fatorEscolhido}
                onChange={(e) => setFatorEscolhido(e.target.value)}
                aria-label={t('chooseApp')}
                className="w-full rounded-lg border border-white/10 bg-[#091D35] px-3 py-2 text-sm text-white outline-none"
              >
                {etapa.fatores.map((f) => <option key={f.id} value={f.id}>{f.friendly_name || f.id.slice(0, 8)}</option>)}
              </select>
            )}
            {campoCodigo(fatorEscolhido)}
          </>
        )}

        {etapa.tipo === 'pronto' && (
          <>
            <p className="text-sm text-gray-300">{t('done', { count: etapa.fatores.length })}</p>
            {etapa.fatores.length < 2 && <p className="text-sm text-amber-300">{t('backupAdvice')}</p>}
            <button
              type="button"
              onClick={() => window.location.assign(destino)}
              className="w-full rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-[#07162a] transition-colors hover:bg-cyan-400"
            >
              {t('goPanel')}
            </button>
            {etapa.fatores.length < 2 && (
              <button
                type="button"
                onClick={() => cadastrar(true)}
                className="w-full rounded-lg border border-cyan-400/30 px-4 py-2 text-sm font-semibold text-cyan-400 transition-colors hover:bg-cyan-400/10"
              >
                {t('addBackup')}
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
