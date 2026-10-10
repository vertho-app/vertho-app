'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { getSupabase } from '@/lib/supabase-browser';
import { caminhoLocalOu } from '@/lib/auth/caminho-local';

type Fator = { id: string; friendly_name?: string | null };
type Etapa =
  | { tipo: 'carregando' }
  | { tipo: 'cadastrar'; factorId: string; qr: string; chave: string; reserva: boolean }
  | { tipo: 'confirmar'; fatores: Fator[] }
  | { tipo: 'pronto'; fatores: Fator[] }
  | { tipo: 'erro'; mensagem: string };

/**
 * Só o cliente do navegador: nenhuma action de admin funciona antes do código (elas negam o poder
 * de plataforma em `aal1`). Depois do `verify`, o supabase-js grava a sessão nova (`aal2`) no
 * cookie, e a navegação seguinte já chega ao servidor com ela.
 */
export default function SegundoFatorCliente() {
  const t = useTranslations('SegundoFator');
  const destino = caminhoLocalOu(useSearchParams().get('next'), '/admin/dashboard');
  const [etapa, setEtapa] = useState<Etapa>({ tipo: 'carregando' });
  const [codigo, setCodigo] = useState('');
  const [fatorEscolhido, setFatorEscolhido] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erroCodigo, setErroCodigo] = useState('');

  const cadastrar = useCallback(async (reserva: boolean) => {
    const sb = getSupabase();
    // Cadastro abandonado deixa fator `unverified`, e o próximo `enroll` pode falhar por isso.
    const { data: atuais } = await sb.auth.mfa.listFactors();
    const pendentes = (atuais?.all || []).filter((f: any) => f.factor_type === 'totp' && f.status === 'unverified');
    for (const f of pendentes) await sb.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await sb.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `vertho.ai ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
    });
    if (error || !data) { setEtapa({ tipo: 'erro', mensagem: t('error', { error: error?.message || '' }) }); return; }
    setCodigo(''); setErroCodigo('');
    setEtapa({ tipo: 'cadastrar', factorId: data.id, qr: data.totp.qr_code, chave: data.totp.secret, reserva });
  }, [t]);

  const carregar = useCallback(async () => {
    const sb = getSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { window.location.replace(`/login?redirect=${encodeURIComponent(destino)}`); return; }

    const [{ data: nivel, error: erroNivel }, { data: fatores, error: erroFatores }] = await Promise.all([
      sb.auth.mfa.getAuthenticatorAssuranceLevel(),
      sb.auth.mfa.listFactors(),
    ]);
    if (erroNivel || erroFatores || !fatores) {
      setEtapa({ tipo: 'erro', mensagem: t('error', { error: (erroNivel || erroFatores)?.message || '' }) });
      return;
    }
    const verificados: Fator[] = fatores.totp || [];
    if (nivel?.currentLevel === 'aal2') { setEtapa({ tipo: 'pronto', fatores: verificados }); return; }
    if (verificados.length > 0) {
      setFatorEscolhido(verificados[0].id);
      setEtapa({ tipo: 'confirmar', fatores: verificados });
      return;
    }
    await cadastrar(false);
  }, [destino, t, cadastrar]);

  useEffect(() => { carregar(); }, [carregar]);

  async function confirmar(factorId: string) {
    const limpo = codigo.replace(/\D/g, '');
    if (limpo.length !== 6 || enviando) return;
    setEnviando(true); setErroCodigo('');
    try {
      const { error } = await getSupabase().auth.mfa.challengeAndVerify({ factorId, code: limpo });
      if (error) { setErroCodigo(t('errorInvalid')); return; }
      setCodigo('');
      await carregar();
    } finally {
      setEnviando(false);
    }
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
      <button
        type="submit"
        disabled={enviando || codigo.replace(/\D/g, '').length !== 6}
        className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-[#07162a] transition-colors hover:bg-cyan-400 disabled:opacity-40"
      >
        {enviando ? t('confirming') : t('confirm')}
      </button>
    </form>
  );

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#07162a] px-4 py-10">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        <ShieldCheck size={44} className="text-cyan-400" />
        <h1 className="text-lg font-semibold text-white">{t('title')}</h1>

        {etapa.tipo === 'carregando' && <Loader2 size={24} className="animate-spin text-gray-400" />}

        {etapa.tipo === 'erro' && <p className="text-sm text-red-400">{etapa.mensagem}</p>}

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
