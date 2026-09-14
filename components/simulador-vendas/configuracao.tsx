'use client';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { fetchAuth } from '@/lib/auth/fetch-auth';
import { RETENCAO_MESES, type Config } from '@/lib/simulador-vendas/schema';
import styles from './treino.module.css';

export function dataLocal(iso?: string | null): string {
  if (!iso) return '';
  const data = new Date(iso);
  return new Date(data.getTime() - data.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export default function Configuracao({
  empresaId,
  config,
  onSalvou,
}: {
  empresaId: string;
  config: Config | null;
  onSalvou: () => Promise<void>;
}) {
  const t = useTranslations('SimuladorVendas');
  const [briefing, setBriefing] = useState(config?.briefing || '');
  const [habilitado, setHabilitado] = useState(config?.habilitado || false);
  const [inicio, setInicio] = useState(dataLocal(config?.periodo_inicio)),
    [fim, setFim] = useState(dataLocal(config?.periodo_fim));
  const [salvando, setSalvando] = useState(false),
    [erro, setErro] = useState('');
  const vivo = useRef(true),
    emCurso = useRef(false);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);
  async function salvar() {
    if (emCurso.current) return;
    emCurso.current = true;
    setSalvando(true);
    setErro('');
    try {
      const r = await fetchAuth('/api/simulador-vendas/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresaId,
          revisao: config?.revisao ?? 0,
          briefing,
          habilitado,
          periodoInicio: inicio ? new Date(inicio).toISOString() : null,
          periodoFim: fim ? new Date(fim).toISOString() : null,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || t('genericError'));
      if (vivo.current) await onSalvou();
    } catch (e) {
      if (vivo.current) setErro(e instanceof Error ? e.message : t('genericError'));
    } finally {
      emCurso.current = false;
      if (vivo.current) setSalvando(false);
    }
  }
  return (
    <form
      className={styles.card}
      onSubmit={(e) => {
        e.preventDefault();
        void salvar();
      }}
    >
      <h2 className="text-xl mb-2">{t('configTitle')}</h2>
      <p className={`${styles.muted} mb-5`}>{t('configHelp')}</p>
      {erro && (
        <p role="alert" className="text-amber-200 mb-4">
          {erro}
        </p>
      )}
      <label htmlFor="pace-briefing">{t('brief')}</label>
      <textarea
        id="pace-briefing"
        className="mt-2"
        value={briefing}
        disabled={salvando}
        onChange={(e) => setBriefing(e.target.value)}
        minLength={40}
        maxLength={24000}
        required
        rows={10}
        placeholder={t('briefPlaceholder')}
      />
      <div className="grid sm:grid-cols-2 gap-6 mt-5">
        <label>
          {t('periodStart')}
          <input
            type="datetime-local"
            value={inicio}
            disabled={salvando}
            onChange={(e) => setInicio(e.target.value)}
            required={habilitado || !!fim}
          />
        </label>
        <label>
          {t('periodEnd')}
          <input
            type="datetime-local"
            value={fim}
            disabled={salvando}
            onChange={(e) => setFim(e.target.value)}
            min={inicio || undefined}
            required={habilitado || !!inicio}
          />
        </label>
      </div>
      <p className={`${styles.muted} mt-2`}>
        {t('timezone', { zone: Intl.DateTimeFormat().resolvedOptions().timeZone })}
      </p>
      <p className="text-sm text-brand-200 mt-4">{t('unlimited')}</p>
      <label className="mt-5">
        <span className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={habilitado}
            disabled={salvando}
            onChange={(e) => setHabilitado(e.target.checked)}
          />
          {t('enable')}
        </span>
        <span className={styles.muted}>{t('loginHelp')}</span>
      </label>
      <p className={`${styles.muted} mt-5`}>{t('retention', { months: RETENCAO_MESES })}</p>
      <button className={`${styles.primary} mt-6`} disabled={salvando} type="submit">
        {t('saveConfig')}
      </button>
    </form>
  );
}
