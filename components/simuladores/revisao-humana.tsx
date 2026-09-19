'use client';
/**
 * Revisão humana da devolutiva (18/09/2026): quem acompanha a equipe registra se
 * concorda com a avaliação da IA. Comum ao vendas e à liderança (o atendimento
 * tem a sua desde a mig 241). A revisão se acrescenta; a nota original não muda.
 */
import { useId, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { fetchAuth } from '@/lib/auth/fetch-auth';
import { PARECERES, type Parecer, type RevisaoPublica } from '@/lib/simuladores/revisao-tipos';
import styles from './revisao-humana.module.css';

type Props = {
  /** Rota que recebe o POST `{ acao: 'revisar', ... }`. */
  endpoint: string;
  empresaId?: string;
  /** Sessão (vendas) ou jornada (liderança). */
  alvoId: string;
  /** `null` = a leitura falhou; nunca é mostrado como "sem revisão". */
  revisoes: RevisaoPublica[] | null;
  podeRevisar: boolean;
  competencias: Array<{ codigo: string; nome: string }>;
  onRegistrada: () => void;
  tema?: 'escuro' | 'claro';
};

export default function RevisaoHumana({
  endpoint, empresaId, alvoId, revisoes, podeRevisar, competencias, onRegistrada, tema = 'escuro',
}: Props) {
  const t = useTranslations('SimuladorRevisao');
  const locale = useLocale();
  const titulo = useId();
  const [parecer, setParecer] = useState<Parecer | ''>('');
  const [dimensoes, setDimensoes] = useState<string[]>([]);
  const [motivo, setMotivo] = useState('');
  // O mesmo id no reenvio depois de uma falha: se a primeira gravou, o servidor não duplica.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ erro: boolean; texto: string } | null>(null);
  const nomes = new Map(competencias.map((c) => [c.codigo, c.nome]));
  const quando = (iso: string) =>
    new Date(iso).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!parecer || enviando) return;
    if (!motivo.trim()) {
      setAviso({ erro: true, texto: t('reasonRequired') });
      return;
    }
    setEnviando(true);
    setAviso(null);
    try {
      const res = await fetchAuth(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'revisar',
          ...(empresaId ? { empresaId } : {}),
          requestId,
          alvoId,
          parecer,
          motivo: motivo.trim(),
          // Na ordem da tela: o reenvio idêntico compara a lista inteira.
          dimensoes: competencias.filter((c) => dimensoes.includes(c.codigo)).map((c) => c.codigo),
        }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error || t('error'));
      setParecer('');
      setDimensoes([]);
      setMotivo('');
      setRequestId(crypto.randomUUID());
      setAviso({ erro: false, texto: t('saved') });
      onRegistrada();
    } catch (err) {
      setAviso({ erro: true, texto: (err as Error).message || t('error') });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className={`${styles.root} ${tema === 'claro' ? styles.claro : styles.escuro}`} aria-labelledby={titulo}>
      <h3 id={titulo}>{t('title')}</h3>
      <p className={styles.muted}>{t('help')}</p>
      {revisoes === null ? (
        <p className={styles.alerta}>{t('unavailable')}</p>
      ) : revisoes.length === 0 ? (
        <p className={styles.muted}>{t('none')}</p>
      ) : (
        <ul className={styles.lista} aria-label={t('registered')}>
          {revisoes.map((r) => (
            <li key={r.id} className={styles.item}>
              <span className={`${styles.selo} ${styles[`selo_${r.parecer}`] ?? ''}`}>{t(`verdict_${r.parecer}`)}</span>
              {!!r.dimensoes?.length && (
                <span className={styles.dimensoes}>{r.dimensoes.map((d) => nomes.get(d) || d).join(', ')}</span>
              )}
              <p className={styles.motivo}>{r.motivo}</p>
              <small className={styles.muted}>{t('by', { nome: r.revisor_nome, data: quando(r.created_at) })}</small>
            </li>
          ))}
        </ul>
      )}
      {podeRevisar ? (
        <form onSubmit={enviar} className={styles.form}>
          <fieldset className={styles.grupo}>
            <legend>{t('verdict')}</legend>
            {PARECERES.map((p) => (
              <label key={p} className={styles.opcao}>
                <input
                  type="radio"
                  name={`parecer-${alvoId}`}
                  value={p}
                  checked={parecer === p}
                  onChange={() => setParecer(p)}
                  disabled={enviando}
                />
                {t(`verdict_${p}`)}
              </label>
            ))}
          </fieldset>
          {!!competencias.length && (
            <fieldset className={styles.grupo}>
              <legend>{t('dimensions')}</legend>
              {competencias.map((c) => (
                <label key={c.codigo} className={styles.opcao}>
                  <input
                    type="checkbox"
                    checked={dimensoes.includes(c.codigo)}
                    onChange={(e) =>
                      setDimensoes((atual) => (e.target.checked ? [...atual, c.codigo] : atual.filter((x) => x !== c.codigo)))
                    }
                    disabled={enviando}
                  />
                  {c.nome}
                </label>
              ))}
            </fieldset>
          )}
          <label className={styles.campo}>
            {t('reason')}
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={4000}
              rows={4}
              placeholder={t('reasonPlaceholder')}
              disabled={enviando}
            />
          </label>
          <button type="submit" className={styles.botao} disabled={!parecer || enviando} aria-busy={enviando}>
            {enviando ? t('saving') : t('save')}
          </button>
        </form>
      ) : (
        <p className={styles.muted}>{t('notAllowed')}</p>
      )}
      {aviso && (
        <p role={aviso.erro ? 'alert' : 'status'} className={aviso.erro ? styles.alerta : styles.sucesso}>
          {aviso.texto}
        </p>
      )}
    </section>
  );
}
