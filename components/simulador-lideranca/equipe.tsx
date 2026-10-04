'use client';
/**
 * Acompanhamento do Simulador de liderança (RH, gestor, tutor e admin da
 * plataforma). Decisão do dono (18/09/2026): quem acompanha vê QUEM faz e os
 * RESULTADOS. Entrega progresso, níveis por competência e as devolutivas;
 * as conversas, a preparação e a reflexão ficam com a pessoa.
 */
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, Download, Loader2, Star } from 'lucide-react';
import { fetchAuth } from '@/lib/auth/fetch-auth';
import { EPISODIOS } from '@/lib/simulador-lideranca/episodios';
import { resumoAvaliacao } from '@/lib/simulador-lideranca/avaliacao';
import { montarCsv } from '@/lib/simuladores/csv';
import RelatorioCompetencias from '@/components/simuladores/relatorio-competencias';
import type {
  detalhePessoa,
  painelEquipe,
} from '@/lib/simulador-lideranca/equipe';
import { competenciasParaRelatorio } from './relatorio';
import { diaBrasilia, linhasCsvEquipe, situacaoCompetencia } from './csv-equipe';
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
  // Repetir a leitura do painel sem recarregar a página (revisão de 04/10/2026).
  const [tentativa, setTentativa] = useState(0);
  const base =`/api/simulador-lideranca/equipe${empresaId ? `?empresaId=${empresaId}` : ''}`;
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
  }, [base, tentativa]);

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
      : t('teamNoActivity');
  const trilha = (v: 'lider' | 'futuro' | null) =>
    v === 'futuro' ? t('trackFuture') : v === 'lider' ? t('trackLeader') : '';
  type Pessoa = Painel['pessoas'][number];
  const descricao = (p: Pessoa) => [p.cargo, trilha(p.variante)].filter(Boolean).join(' · ');
  // "Ainda não avaliada" e "evidência insuficiente" com rótulos próprios (27/09/2026:
  // o mesmo traço servia para as duas, e no CSV as duas ficavam vazias).
  const situacao = {
    nivel: (n: number) => t('levelN', { n }),
    semNivel: t('noLevel'),
    naoAvaliada: t('notYet'),
  };
  /** Nível alcançado numa competência, com a estrela de quem subiu (tabela e cartão). */
  const celula = (p: Pessoa, competencia: string) => {
    const c = p.sintese?.competencias.find((x) => x.nome === competencia);
    return (
      <>
        {situacaoCompetencia(c, situacao)}
        {c?.subiu && <Star size={12} aria-label={t('levelUp')} />}
      </>
    );
  };
  const botaoVer = (p: Pessoa) => (
    <button
      type="button"
      disabled={!p.variante || abrindo === p.colaboradorId}
      onClick={() => void abrir(p.colaboradorId)}
    >
      {t('teamView')}
    </button>
  );

  function exportar() {
    if (!painel) return;
    const linhas = linhasCsvEquipe(painel.pessoas, {
      cabecalho: {
        pessoa: t('csvPerson'),
        cargo: t('csvRole'),
        trilha: t('csvTrack'),
        encontros: t('csvEncounters'),
        media: t('csvAverage'),
        ultimaAtividade: t('csvLastActivity'),
      },
      trilha,
      // No CSV o n\u00EDvel sai como n\u00FAmero: a coluna segue som\u00E1vel na planilha.
      nivel: (n) => n,
      semNivel: t('noLevel'),
      naoAvaliada: t('notYet'),
      semMedia: t('csvNoAverage'),
    });
    const blob = new Blob(['\uFEFF' + montarCsv(linhas)], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simulador-lideranca-${diaBrasilia(new Date())}.csv`;
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
              {/* O texto foi escrito PARA a pessoa, em segunda pessoa ("Você
                  investigou…"): na visão da equipe ele aparece rotulado e como
                  citação (27/09/2026). */}
              <h4 className={styles.teamFeedbackLabel}>{t('teamFeedbackReceived')}</h4>
              <blockquote className={styles.teamFeedback}>{e.avaliacao.sintese}</blockquote>
              {/* A próxima prática já chegava do servidor e não era mostrada (27/09/2026):
                  é a orientação que a pessoa recebeu, e o que o gestor pode acompanhar. */}
              {e.avaliacao.proximaPratica && (
                <div className={styles.practice}>
                  <h4>{t('teamNextPractice')}</h4>
                  <p>{e.avaliacao.proximaPratica}</p>
                </div>
              )}
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
          {/* Só a leitura do painel se repete aqui; a de uma pessoa se repete
              abrindo a pessoa de novo. */}
          {!painel && (
            <button
              type="button"
              disabled={carregando}
              onClick={() => setTentativa((n) => n + 1)}
            >
              {t('refresh')}
            </button>
          )}
        </div>
      )}
      {painel && (
        <>
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
            <>
            {/* Celular: um cartão por pessoa, com "Ver devolutivas" à vista. A tabela
                tinha 919 px numa caixa de 318, e o botão ficava fora da tela (27/09/2026).
                As duas marcações convivem; o CSS mostra uma por largura. */}
            <ul className={styles.teamCards} aria-label={t('teamTitle')}>
              {painel.pessoas.map((p) => (
                <li key={p.colaboradorId}>
                  <div className={styles.teamCardHead}>
                    <b>{p.nome}</b>
                    <small>{descricao(p)}</small>
                  </div>
                  <p className={styles.muted}>
                    {t('teamEncountersValue', { n: p.encontrosConcluidos })}
                    {p.emAndamento !== null &&
                      ` · ${t('teamInProgress', { n: p.emAndamento + 1 })}`}
                  </p>
                  <dl className={styles.teamCardLevels}>
                    {EPISODIOS.map((e) => (
                      <div key={e.competencia}>
                        <dt>{e.nome}</dt>
                        <dd>{celula(p, e.nome)}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className={styles.muted}>
                    {t('teamLastActivity')}: {data(p.ultimaAtividade)}
                  </p>
                  {botaoVer(p)}
                </li>
              ))}
            </ul>
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
                        <small>{descricao(p)}</small>
                      </td>
                      <td>
                        {t('teamEncountersValue', { n: p.encontrosConcluidos })}
                        {p.emAndamento !== null && (
                          <small>
                            {t('teamInProgress', { n: p.emAndamento + 1 })}
                          </small>
                        )}
                      </td>
                      {EPISODIOS.map((e) => (
                        <td key={e.competencia}>{celula(p, e.nome)}</td>
                      ))}
                      <td>{data(p.ultimaAtividade)}</td>
                      <td>{botaoVer(p)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
