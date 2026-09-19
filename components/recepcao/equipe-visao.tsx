'use client';
/**
 * Visão por competência da equipe no atendimento (18/09/2026): quem tem acesso,
 * quem treinou no período, o maior nível de cada pessoa em cada competência e
 * quem ainda não treinou. A agregação vem pronta do servidor (`lib/recepcao/painel.ts`).
 */
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { EvolucaoCompetencia } from '@/lib/simuladores/evolucao';
import { montarCsv } from '@/lib/simuladores/csv';
import styles from './treino.module.css';

const BOM = String.fromCharCode(0xfeff);

export interface VisaoEquipe {
  pessoas: Array<{
    id: string;
    nome: string;
    cargo: string | null;
    iniciadas: number;
    concluidas: number;
    ultimo: string | null;
    competencias: EvolucaoCompetencia[];
  }>;
  competencias: Array<{ codigo: string; niveis: [number, number, number, number]; semNivel: number }>;
  naoTreinaram: Array<{ id: string; nome: string; cargo: string | null }>;
  nomes: Record<string, string>;
}

export default function EquipeVisao({ visao, dias }: { visao: VisaoEquipe; dias: number }) {
  const t = useTranslations('SimuladorAtendimento');
  const locale = useLocale();
  const [filtro, setFiltro] = useState('');
  const nome = (codigo: string) => visao.nomes[codigo] || codigo;
  const nivel = (n: number | null) => (n === null ? '—' : t('levelShort', { n }));
  const termo = filtro.trim().toLocaleLowerCase(locale);
  const pessoas = visao.pessoas.filter((p) => !termo || p.nome.toLocaleLowerCase(locale).includes(termo));
  const treinaram = visao.pessoas.filter((p) => p.iniciadas > 0).length;
  function exportar() {
    const csv = montarCsv([
      [
        t('teamPerson'),
        t('teamJobTitle'),
        t('teamSessions'),
        t('teamDone'),
        t('teamLast'),
        ...visao.competencias.map((c) => nome(c.codigo)),
      ],
      ...visao.pessoas.map((p) => [
        p.nome,
        p.cargo || '',
        p.iniciadas,
        p.concluidas,
        p.ultimo ? p.ultimo.slice(0, 10) : '',
        ...p.competencias.map((c) => c.nivelAlcancado ?? ''),
      ]),
    ]);
    const url = URL.createObjectURL(new Blob([BOM, csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'atendimento-equipe.csv';
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section aria-labelledby="atendimento-visao" className={styles.visao}>
      <h3 id="atendimento-visao">{t('teamOverview')}</h3>
      <p className={styles.small}>{t('teamOverviewHelp', { days: dias })}</p>
      <div className={styles.metrics}>
        <div>
          <strong>{visao.pessoas.length}</strong>
          <span>{t('teamWithAccess')}</span>
        </div>
        <div>
          <strong>{treinaram}</strong>
          <span>{t('teamTrained')}</span>
        </div>
        <div>
          <strong>{visao.naoTreinaram.length}</strong>
          <span>{t('teamNotTrained')}</span>
        </div>
      </div>
      <h4>{t('teamCompetencies')}</h4>
      <p className={styles.small}>{t('teamCompetenciesHelp')}</p>
      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>{t('teamCompetency')}</th>
              {[1, 2, 3, 4].map((n) => (
                <th key={n}>{t('levelShort', { n })}</th>
              ))}
              <th>{t('teamNoLevel')}</th>
            </tr>
          </thead>
          <tbody>
            {visao.competencias.map((c) => (
              <tr key={c.codigo}>
                <th>{nome(c.codigo)}</th>
                {c.niveis.map((qtd, i) => (
                  <td key={i}>{qtd}</td>
                ))}
                <td>{c.semNivel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.visaoHead}>
        <h4>{t('teamByPerson')}</h4>
        <div className={styles.filters}>
          <label>
            {t('teamFilter')}
            <input type="search" className={styles.visaoBusca} value={filtro} onChange={(e) => setFiltro(e.target.value)} />
          </label>
          <button className={styles.secondary} onClick={exportar} disabled={!visao.pessoas.length}>
            {t('exportPeople')}
          </button>
        </div>
      </div>
      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>{t('teamPerson')}</th>
              <th>{t('teamSessions')}</th>
              <th>{t('teamLast')}</th>
              {visao.competencias.map((c) => (
                <th key={c.codigo}>{nome(c.codigo)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pessoas.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.nome}</strong>
                  {p.cargo && <small className={styles.cellNote}>{p.cargo}</small>}
                </td>
                <td>
                  {p.iniciadas === 0 ? t('teamNone') : t('teamSessionsCount', { total: p.iniciadas, done: p.concluidas })}
                </td>
                <td>{p.ultimo ? new Date(p.ultimo).toLocaleDateString(locale) : '—'}</td>
                {p.competencias.map((c) => (
                  <td key={c.codigo}>
                    {nivel(c.nivelAlcancado)}
                    {c.subiu && <small className={styles.cellUp}>{t('teamLevelUp')}</small>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className={styles.group} open={visao.naoTreinaram.length > 0 && visao.naoTreinaram.length <= 12}>
        <summary>{t('teamNotTrainedList', { n: visao.naoTreinaram.length })}</summary>
        {visao.naoTreinaram.length ? (
          <p>{visao.naoTreinaram.map((p) => (p.cargo ? `${p.nome} (${p.cargo})` : p.nome)).join(' · ')}</p>
        ) : (
          <p>{t('teamNotTrainedEmpty')}</p>
        )}
      </details>
    </section>
  );
}
