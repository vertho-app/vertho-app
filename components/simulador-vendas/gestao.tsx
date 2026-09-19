'use client';
import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { fetchAuth } from '@/lib/auth/fetch-auth';
import type { ResumoTreino } from '@/lib/simulador-vendas/historico';
import { formatarNotaPace } from '@/lib/simulador-vendas/nota';
import type { Saidas } from '@/lib/simulador-vendas/schema';
import { montarCsv } from '@/lib/simulador-vendas/csv';
import Relatorio from './relatorio';
import PainelEquipe from './painel-equipe';
import RevisaoHumana from '@/components/simuladores/revisao-humana';
import type { RevisaoPublica } from '@/lib/simuladores/revisao-tipos';

type Pagina = { historico: ResumoTreino[]; proximoCursor: string | null };
type Detalhe = {
  id: string;
  nomeVendedor: string;
  versaoRegua: string;
  relatorio: Saidas['gerente'];
  revisoes: RevisaoPublica[] | null;
  podeRevisar: boolean;
  competencias: Array<{ codigo: string; nome: string }>;
};
type LinhaExportacao = {
  id: string;
  nomeVendedor: string;
  testeAdmin: boolean;
  criadoEm: string;
  nivel: number;
  status: ResumoTreino['status'];
  versaoRegua: string;
  PL: number | null;
  P: number;
  A: number;
  C: number;
  E: number;
  Media: number;
  Resumo: string;
};
export default function Gestao({ empresaId }: { empresaId: string }) {
  const t = useTranslations('SimuladorVendas'),
    locale = useLocale();
  const [cursores, setCursores] = useState<Array<string | null>>([null]),
    [dados, setDados] = useState<Pagina | null>(null);
  const [erro, setErro] = useState(''),
    [ocupado, setOcupado] = useState(false),
    [selecionado, setSelecionado] = useState<Detalhe | null>(null);
  const [inicio, setInicio] = useState(''),
    [fim, setFim] = useState('');
  const vivo = useRef(true),
    operacao = useRef(0);
  const pagina = cursores.length - 1,
    cursor = cursores[pagina];
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
      operacao.current++;
    };
  }, []);
  async function consultar(extras: Record<string, string> = {}) {
    const q = new URLSearchParams({ empresaId, ...extras });
    const r = await fetchAuth('/api/simulador-vendas/gestao?' + q, {
        cache: 'no-store',
      }),
      d = await r.json();
    if (!r.ok) throw new Error(d.error || t('genericError'));
    return d;
  }
  useEffect(() => {
    let alive = true;
    setOcupado(true);
    setErro('');
    consultar(cursor ? { cursor } : {})
      .then((d) => {
        if (alive) setDados(d);
      })
      .catch((e) => {
        if (alive) setErro(e.message);
      })
      .finally(() => {
        if (alive) setOcupado(false);
      });
    return () => {
      alive = false;
    };
  }, [empresaId, cursor]);
  async function abrir(id: string) {
    const ticket = ++operacao.current;
    setOcupado(true);
    setErro('');
    try {
      const d = await consultar({ sessaoId: id });
      if (vivo.current && ticket === operacao.current) setSelecionado(d);
    } catch (e) {
      if (vivo.current && ticket === operacao.current)
        setErro(e instanceof Error ? e.message : t('genericError'));
    } finally {
      if (vivo.current && ticket === operacao.current) setOcupado(false);
    }
  }
  async function exportar() {
    const ticket = ++operacao.current;
    setOcupado(true);
    setErro('');
    try {
      const extras: Record<string, string> = { exportar: '1' };
      if (inicio) extras.inicio = new Date(inicio + 'T00:00:00').toISOString();
      if (fim) {
        const ultimo = new Date(fim + 'T00:00:00');
        ultimo.setDate(ultimo.getDate() + 1);
        extras.fim = ultimo.toISOString();
      }
      // Projeção de um único snapshot SQL. Não repagina enquanto dados mudam.
      const d: { linhas: LinhaExportacao[] } = await consultar(extras);
      if (!vivo.current || ticket !== operacao.current) return;
      if (
        !Array.isArray(d.linhas) ||
        new Set(d.linhas.map((r) => r.id)).size !== d.linhas.length
      )
        throw new Error(t('genericError'));
      const csv = montarCsv([
        [
          'ID',
          t('participant'),
          t('adminTest'),
          t('date'),
          t('level'),
          t('state'),
          'PL (1–4)',
          'P (1–4)',
          'A (1–4)',
          'C (1–4)',
          'E (1–4)',
          t('average'),
          t('summary'),
          t('version', { version: '' }),
        ],
        ...d.linhas.map((r) => [
          r.id,
          r.nomeVendedor,
          t(r.testeAdmin ? 'yes' : 'no'),
          r.criadoEm,
          r.nivel,
          t(`status_${r.status}`),
          r.PL,
          r.P,
          r.A,
          r.C,
          r.E,
          r.Media,
          r.Resumo,
          r.versaoRegua,
        ]),
      ]);
      const url = URL.createObjectURL(
        new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = 'pace.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      if (vivo.current && ticket === operacao.current)
        setErro(e instanceof Error ? e.message : t('genericError'));
    } finally {
      if (vivo.current && ticket === operacao.current) setOcupado(false);
    }
  }
  return (
    <section>
      <PainelEquipe empresaId={empresaId} />
      <h2 className="text-lg mb-1">{t('teamHistoryTitle')}</h2>
      <p className="text-sm text-slate-300 mb-4">{t('teamScope')}</p>
      <div className="flex flex-wrap gap-4 items-end mb-5">
        <label className="text-sm">
          {t('exportStart')}
          <input
            type="date"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
            disabled={ocupado}
          />
        </label>
        <label className="text-sm">
          {t('exportEnd')}
          <input
            type="date"
            value={fim}
            min={inicio || undefined}
            onChange={(e) => setFim(e.target.value)}
            disabled={ocupado}
          />
        </label>
        <button onClick={() => void exportar()} disabled={ocupado}>
          {t('export')}
        </button>
      </div>
      {erro && (
        <p role="alert" className="text-amber-200 my-3">
          {erro}
        </p>
      )}
      {ocupado && (
        <p role="status" className="text-sm text-slate-400 mb-3">
          {t('loading')}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="text-slate-400 border-b border-white/10">
              {['participant', 'date', 'state', 'score', 'report'].map((h) => (
                <th key={h} className="py-3 pr-4 font-medium">
                  {t(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dados?.historico.map((r) => (
              <tr key={r.id} className="border-b border-white/10">
                <td className="py-3 pr-4">
                  {r.nomeVendedor}
                  {r.testeAdmin && (
                    <small className="block text-slate-400">
                      {t('adminTest')}
                    </small>
                  )}
                </td>
                <td className="pr-4 whitespace-nowrap">
                  {new Date(r.criadoEm).toLocaleDateString(locale)}
                </td>
                <td className="pr-4">{t(`status_${r.status}`)}</td>
                <td className="pr-4">{formatarNotaPace(r.nota, locale)}</td>
                <td>
                  <button
                    disabled={ocupado || !r.temRelatorio}
                    onClick={() => void abrir(r.id)}
                  >
                    {t('viewReport')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dados?.historico.length === 0 && (
        <p className="text-slate-400 py-8">{t('emptyHistory')}</p>
      )}
      <div className="flex items-center gap-3 mt-5">
        <button
          disabled={ocupado || pagina === 0}
          onClick={() => setCursores((c) => c.slice(0, -1))}
        >
          {t('previous')}
        </button>
        <span className="text-sm">{t('page', { n: pagina + 1 })}</span>
        <button
          disabled={ocupado || !dados?.proximoCursor}
          onClick={() => setCursores((c) => [...c, dados!.proximoCursor])}
        >
          {t('next')}
        </button>
      </div>
      {selecionado && (
        <div className="border border-white/15 rounded-2xl p-5 mt-6">
          <div className="flex justify-between items-center mb-5">
            <p>{selecionado.nomeVendedor}</p>
            <button onClick={() => setSelecionado(null)}>
              {t('closeReport')}
            </button>
          </div>
          <Relatorio
            relatorio={selecionado.relatorio}
            versao={selecionado.versaoRegua}
          />
          <RevisaoHumana
            endpoint="/api/simulador-vendas/gestao"
            empresaId={empresaId}
            alvoId={selecionado.id}
            revisoes={selecionado.revisoes}
            podeRevisar={selecionado.podeRevisar}
            competencias={selecionado.competencias}
            onRegistrada={() => void abrir(selecionado.id)}
          />
        </div>
      )}
    </section>
  );
}
