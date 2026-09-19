'use client';
/**
 * Acompanhamento do Simulador de liderança (RH, gestor, tutor e admin da
 * plataforma). Decisão do dono (18/09/2026): quem acompanha vê QUEM faz e os
 * RESULTADOS. Entrega progresso, níveis por competência e as devolutivas;
 * as conversas, a preparação e a reflexão ficam com a pessoa.
 */
import PainelRevisoes from '@/components/simuladores/revisao-painel';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, Download, Loader2, Star } from 'lucide-react';
import { fetchAuth } from '@/lib/auth/fetch-auth';
import { EPISODIOS } from '@/lib/simulador-lideranca/episodios';
import { resumoAvaliacao } from '@/lib/simulador-lideranca/avaliacao';
import { montarCsv } from '@/lib/simuladores/csv';
import RelatorioCompetencias from '@/components/simuladores/relatorio-competencias';
import RevisaoHumana from '@/components/simuladores/revisao-humana';
import type {
  detalhePessoa,
  painelEquipe,
} from '@/lib/simulador-lideranca/equipe';
import { competenciasParaRelatorio } from './relatorio';
import SinteseJornadaView from './sintese';
import styles from './treino.module.css';

type Painel = Awaited<ReturnType<typeof painelEquipe>>;
type Detalhe = Awaited<ReturnType<typeof detalhePessoa>>;

export default function EquipeLideranca({ empresaId }: { empresaId?: string }) {
  const t = useTranslations('SimuladorLideranca');
  const locale = useLocale();
  const [painel, setPainel] = useState<Painel | null>(null);
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [abrindo, setAbrindo] = useState('');
  const base = `/api/simulador-lideranca/equipe${empresaId ? `?empresaId=${empresaId}` : ''}`;
  const sep = base.includes('?') ? '&' : '?';

  async function ler<T>(url: string): Promise<T> {
    const res = await fetchAuth(url, { cache: 'no-store' });
    const d = await res.json().catch(() => null);
    if (!res.ok || !d) throw new Error(d?.error || t('genericError'));
    return d as T;
  }

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro('');
    setDetalhe(null);
    ler<Painel>(base)
      .then((d) => vivo && setPainel(d))
      .catch((e) => vivo && setErro((e as Error).message))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
    // `ler` só depende de `t`, estável por locale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  async function abrir(id: string) {
    setAbrindo(id);
    setErro('');
    try {
      setDetalhe(await ler<Detalhe>(`${base}${sep}pessoa=${id}`));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setAbrindo('');
    }
  }

  const data = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString(locale, {
          dateStyle: 'short',
          timeStyle: 'short',
        })
      : '—';
  const trilha = (v: 'lider' | 'futuro' | null) =>
    v === 'futuro' ? t('trackFuture') : v === 'lider' ? t('trackLeader') : '—';
  const nivel = (n: number | null | undefined) =>
    n != null ? t('levelN', { n }) : '—';

  function exportar() {
    if (!painel) return;
    const nomes = EPISODIOS.map((e) => e.nome);
    const linhas: unknown[][] = [
      [
        t('csvPerson'),
        t('csvRole'),
        t('csvTrack'),
        t('csvEncounters'),
        ...nomes,
        t('csvAverage'),
        t('csvLastActivity'),
      ],
      ...painel.pessoas.map((p) => [
        p.nome,
        p.cargo || '',
        trilha(p.variante),
        p.encontrosConcluidos,
        ...nomes.map((n) => {
          const c = p.sintese?.competencias.find((x) => x.nome === n);
          return c?.nivelAlcancado ?? '';
        }),
        p.sintese?.media.nivel ?? '',
        p.ultimaAtividade || '',
      ]),
    ];
    const blob = new Blob(['\uFEFF' + montarCsv(linhas)], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simulador-lideranca-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (carregando)
    return (
      <p className={styles.loading} role="status">
        <Loader2 size={20} className={styles.spin} aria-hidden />
        {t('teamLoading')}
      </p>
    );

  if (detalhe)
    return (
      <section className={styles.panel}>
        <button
          type="button"
          className={styles.back}
          onClick={() => setDetalhe(null)}
        >
          <ArrowLeft size={15} aria-hidden /> {t('teamBack')}
        </button>
        <h2>{detalhe.pessoa.nome}</h2>
        {detalhe.pessoa.cargo && (
          <p className={styles.muted}>{detalhe.pessoa.cargo}</p>
        )}
        <p className={styles.visibility}>{t('teamPrivacy')}</p>
        {detalhe.sintese && (
          <SinteseJornadaView sintese={detalhe.sintese} publico="equipe" />
        )}
        {!detalhe.encontros.length && (
          <p className={styles.muted}>{t('teamNoJourney')}</p>
        )}
        {detalhe.encontros.map((e, posicao) => {
          if (!e.avaliacao) return null;
          const resumo = resumoAvaliacao(e.avaliacao, detalhe.matriz, e.indice);
          const { competencias, regra } = competenciasParaRelatorio(
            resumo,
            e.avaliacao,
            detalhe.matriz,
            (fonte, turno) =>
              t(
                fonte === 'fala'
                  ? 'speechEvidenceTeam'
                  : fonte === 'planejamento'
                    ? 'planEvidenceTeam'
                    : 'reflectionEvidenceTeam',
                {
                  n: turno,
                },
              ),
          );
          const foco = resumo.competencias.find((c) => c.foco);
          return (
            <details
              key={e.id}
              className={styles.teamEncounter}
              open={posicao === detalhe.encontros.length - 1}
            >
              <summary>
                <b>
                  {t('encounterTitle', {
                    n: e.indice + 1,
                    tipo: t(e.repeticao ? 'replay' : 'original'),
                    data: data(e.encerradoEm),
                  })}
                </b>
                {foco && (
                  <small>
                    {foco.nome}:{' '}
                    {foco.nivel != null
                      ? t('levelN', { n: foco.nivel })
                      : t('noLevel')}
                  </small>
                )}
              </summary>
              <p>{e.avaliacao.sintese}</p>
              <RelatorioCompetencias
                competencias={competencias}
                regra={regra}
                tema="escuro"
                abrirFoco={false}
              />
              {e.consequencia && (
                <div className={styles.outcome}>
                  <h4>{t('consequence')}</h4>
                  <p>{e.consequencia.narrativa}</p>
                  {!!e.consequencia.acordos.length && (
                    <>
                      <h4>{t('agreements')}</h4>
                      <ul>
                        {e.consequencia.acordos.map((a, i) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </details>
          );
        })}
        {detalhe.jornadaId && (
          <RevisaoHumana
            endpoint="/api/simulador-lideranca/equipe"
            empresaId={empresaId}
            alvoId={detalhe.jornadaId}
            referencia={detalhe.referencia}
            revisoes={detalhe.revisoes}
            podeRevisar={detalhe.podeRevisar}
            competencias={detalhe.competencias}
            onRegistrada={() => void abrir(detalhe.pessoa.id)}
          />
        )}
      </section>
    );

  return (
    <section className={styles.panel}>
      <div className={styles.teamHead}>
        <div>
          <h2>{t('teamTitle')}</h2>
          <p className={styles.muted}>{t('teamHelp')}</p>
        </div>
        {!!painel?.pessoas.length && (
          <button type="button" onClick={exportar}>
            <Download size={15} aria-hidden /> {t('exportCsv')}
          </button>
        )}
      </div>
      {erro && (
        <div className={styles.error} role="alert">
          <p>{erro}</p>
        </div>
      )}
      {painel && (
        <>
          <PainelRevisoes resumo={painel.revisoes ?? null} />
          <dl className={styles.teamMetrics}>
            <div>
              <dt>{t('teamPopulation')}</dt>
              <dd>{painel.populacao}</dd>
            </div>
            <div>
              <dt>{t('teamStarted')}</dt>
              <dd>{painel.iniciaram}</dd>
            </div>
            <div>
              <dt>{t('teamCompleted')}</dt>
              <dd>{painel.concluiram}</dd>
            </div>
          </dl>
          {!painel.pessoas.length ? (
            <p className={styles.muted}>{t('teamEmpty')}</p>
          ) : (
            <div className={styles.teamWrap}>
              <table className={styles.teamTable}>
                <thead>
                  <tr>
                    <th>{t('teamPerson')}</th>
                    <th>{t('teamEncounters')}</th>
                    {EPISODIOS.map((e) => (
                      <th key={e.competencia}>{e.nome}</th>
                    ))}
                    <th>{t('teamLastActivity')}</th>
                    <th aria-label={t('teamView')} />
                  </tr>
                </thead>
                <tbody>
                  {painel.pessoas.map((p) => (
                    <tr key={p.colaboradorId}>
                      <td>
                        <b>{p.nome}</b>
                        <small>
                          {[p.cargo, trilha(p.variante)]
                            .filter((x) => x && x !== '—')
                            .join(' · ') || '—'}
                        </small>
                      </td>
                      <td>
                        {t('teamEncountersValue', { n: p.encontrosConcluidos })}
                        {p.emAndamento !== null && (
                          <small>
                            {t('teamInProgress', { n: p.emAndamento + 1 })}
                          </small>
                        )}
                      </td>
                      {EPISODIOS.map((e) => {
                        const c = p.sintese?.competencias.find(
                          (x) => x.nome === e.nome,
                        );
                        return (
                          <td key={e.competencia}>
                            {nivel(c?.nivelAlcancado)}
                            {c?.subiu && (
                              <Star size={12} aria-label={t('levelUp')} />
                            )}
                          </td>
                        );
                      })}
                      <td>{data(p.ultimaAtividade)}</td>
                      <td>
                        <button
                          type="button"
                          disabled={!p.variante || abrindo === p.colaboradorId}
                          onClick={() => void abrir(p.colaboradorId)}
                        >
                          {t('teamView')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
