'use client';

import DemoExplorationBeacon from '@/components/dashboard/demo-exploration-beacon';
/**
 * UI compartilhada do Ranking de Adequação (gestor self-service + preview de admin).
 * VIEW pura — recebe `listar`/`carregar` (que diferem só na fonte da empresa: sessão do
 * gestor vs. rota do admin) e renderiza o ranking com as 3 travas. Não wrappa container
 * (cada página provê o seu shell). Nunca recomputa — só exibe o que a action devolve.
 *
 * R-67 (04/10/2026): todo texto da tela vem do catálogo (`RankingAdequacao`, nos 4 idiomas) e o erro
 * da action chega como CÓDIGO (`ManagerErrors`). Nome de cargo e de pessoa, "A desenvolver" e os
 * requisitos essenciais são dado do banco e do motor, e não se traduzem.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, FileText, Info, Loader2, ShieldAlert } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { GlassCard } from '@/components/page-shell';
import InAppPdfDocument from '@/components/pdf/in-app-pdf-document';
import { formatarPercentualNoIdioma } from '@/lib/avanco-no-idioma';
import { textoDoErroDoGestor } from '@/lib/gestor/codigos-de-erro';

const STATUS_COR: Record<string, { cor: string; chave: 'recommended' | 'withReservations' | 'belowCut' }> = {
  recomendado: { cor: '#10b981', chave: 'recommended' },
  recomendado_com_ressalvas: { cor: '#f59e0b', chave: 'withReservations' },
  abaixo_do_corte: { cor: '#94a3b8', chave: 'belowCut' },
};
const iniciais = (n: string) => n.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('');
// Aderência = número-herói: 1 casa decimal, com o separador do idioma. Exibir inteiro criava
// "empates" visuais (várias "92%") cuja sub-ordem — pela aderência CHEIA — parecia
// arbitrária ao lado do chip de Liderança. 1 casa torna a ordem auto-evidente.
const fmtBeta = (v: number, locale: string) =>
  new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.round(v * 10) / 1000);
// A data do snapshot é um DIA (ISO): formatada em UTC, para o fuso de quem lê não mover o dia.
const fmtData = (iso: string | null, locale: string) => iso
  ? new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`))
  : null;

/** Os quatro blocos que o snapshot grava pelo RÓTULO em português; a chave do catálogo de cada um. */
const CHAVE_DO_BLOCO: Record<string, 'competency' | 'leadership' | 'behavioral' | 'mapping'> = {
  competência: 'competency',
  liderança: 'leadership',
  disc: 'behavioral',
  mapeamento: 'mapping',
};

/**
 * Os dados que a tela recebe pronta quando é montada no servidor (teste): ninguém os passa em produção,
 * onde a tela lista os cargos e carrega o primeiro ao abrir.
 */
export type RankingDadosIniciais = { cargos: string[]; sel: string; data: any; pdfUrl?: string };

export default function RankingAdequacaoView({ listar, carregar, exportar, scopeKey = 'default', dadosIniciais }: {
  listar: () => Promise<{ cargos: string[]; codigo?: string }>;
  carregar: (cargo: string) => Promise<any>;
  exportar?: (cargo: string) => Promise<{ success: boolean; url?: string; codigo?: string }>;
  /** Identidade estável do tenant/escopo. Evita reiniciar a busca a cada render. */
  scopeKey?: string;
  dadosIniciais?: RankingDadosIniciais;
}) {
  const t = useTranslations('RankingAdequacao');
  const tErro = useTranslations('ManagerErrors');
  const locale = useLocale();
  const pct = (v: number) => formatarPercentualNoIdioma(v, locale);
  // O rótulo de um bloco no idioma da tela; rótulo que o catálogo não conhece segue como veio.
  const rotuloBloco = (valor: string) => {
    const chave = CHAVE_DO_BLOCO[String(valor).toLocaleLowerCase('pt-BR')];
    return chave ? t(`blocks.${chave}`) : valor;
  };
  const negrito = { b: (chunks: ReactNode) => <b className="text-slate-300">{chunks}</b> };
  const [cargos, setCargos] = useState<string[]>(dadosIniciais?.cargos ?? []);
  const [sel, setSel] = useState(dadosIniciais?.sel ?? '');
  const [data, setData] = useState<any>(dadosIniciais?.data ?? null);
  const [listando, setListando] = useState(!dadosIniciais);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [fStatus, setFStatus] = useState<'todos' | 'recomendado' | 'recomendado_com_ressalvas'>('todos');
  const [fMin, setFMin] = useState(0);
  const [sort, setSort] = useState<'eixo' | 'aderencia'>('aderencia');
  const [exportando, setExportando] = useState(false);
  const [erroExport, setErroExport] = useState('');
  const [pdfUrl, setPdfUrl] = useState(dadosIniciais?.pdfUrl ?? '');
  const listarRef = useRef(listar);
  const carregarRef = useRef(carregar);
  const cargoRequestRef = useRef(0);

  // Server Actions podem chegar com uma nova identidade de função após qualquer
  // atualização de estado. A operação usa sempre a versão atual, mas o efeito
  // abaixo depende somente do escopo real (tenant), não da referência transitória.
  listarRef.current = listar;
  carregarRef.current = carregar;

  async function exportarPDF() {
    if (!exportar || !sel) return;
    setExportando(true); setErroExport('');
    try {
      const r = await exportar(sel);
      if (r.success && r.url) setPdfUrl(r.url);
      else setErroExport(textoDoErroDoGestor(tErro, r));
    } catch { setErroExport(textoDoErroDoGestor(tErro, { codigo: 'falha-no-pdf' })); }
    setExportando(false);
  }

  // Reseta somente quando o tenant/escopo muda. Antes a dependência era a Server
  // Action `listar`; no App Router sua referência pode mudar em re-renderizações,
  // criando o ciclo visual "limpa → lista → limpa" que fazia os filtros piscarem.
  useEffect(() => {
    if (dadosIniciais) return; // montada com dados (teste): não há o que buscar
    let ativo = true;
    cargoRequestRef.current += 1;
    setSel(''); setData(null); setErro(''); setCargos([]); setPdfUrl('');
    setListando(true); setLoading(false);
    void (async () => {
      try {
        const r = await listarRef.current();
        if (!ativo) return;
        const disponiveis = Array.isArray(r.cargos) ? r.cargos : [];
        setCargos(disponiveis);
        if (r.codigo) setErro(textoDoErroDoGestor(tErro, r));
        setListando(false);
        // O ranking é uma tela de consulta, não um seletor vazio: abre a primeira
        // fotografia disponível assim que a lista chega.
        if (!r.codigo && disponiveis[0]) void run(disponiveis[0]);
      } catch {
        if (!ativo) return;
        setErro(t('listError'));
        setListando(false);
      }
    })();
    return () => {
      ativo = false;
      cargoRequestRef.current += 1;
    };
    // `listarRef` mantém a action atual; a identidade do escopo é a dependência.
  }, [scopeKey]);
  async function run(cargo: string) {
    const requestId = ++cargoRequestRef.current;
    setSel(cargo); setLoading(true); setData(null); setErro(''); setPdfUrl(''); setErroExport(''); setSort('aderencia'); setFStatus('todos'); setFMin(0);
    const r = await carregarRef.current(cargo);
    if (requestId !== cargoRequestRef.current) return;
    if (r.success) setData(r); else setErro(textoDoErroDoGestor(tErro, r));
    setLoading(false);
  }

  // SEP = o bloco que de fato SEPARA: quando o eixo declarado (peso) não discrimina, é o
  // discriminador empírico (divergencia.real). O DEFAULT ordena por ADERÊNCIA (o veredito
  // candidato-vs-cargo, imune ao pool); sep é o DESEMPATE + o foco de leitura (chip por
  // pessoa + callout). NÃO é a chave de ordenação: a variância de um bloco é propriedade
  // do POOL (quem se inscreveu), e a posição de um candidato não deve depender disso —
  // é o tipo de critério contestável num edital. "Ordenar por sep" fica como MODO opcional.
  const sep: string = data?.divergencia?.real || data?.eixo?.label || '';
  const eixoMorto = data?.divergencia ? data.eixo.label : null; // declarado mas não separa

  const visiveis = useMemo(() => {
    if (!data) return [];
    let arr = [...data.elegiveis];
    if (fStatus !== 'todos') arr = arr.filter((e) => e.status === fStatus);
    arr = arr.filter((e) => e.aderencia >= fMin);
    arr.sort((a, b) => sort === 'eixo'
      ? ((b.blocos[sep] ?? -1) - (a.blocos[sep] ?? -1)) || (b.aderencia - a.aderencia)
      : (b.aderencia - a.aderencia) || ((b.blocos[sep] ?? -1) - (a.blocos[sep] ?? -1)));
    return arr;
  }, [data, fStatus, fMin, sort, sep]);

  return (
    <>
      {!loading && !erro && data && data.elegiveis?.length > 0 && <DemoExplorationBeacon alvo="adequacao" />}
      <div className="mb-4">
        <h1 className="text-xl font-bold text-white">{t('title')}</h1>
        <p className="text-xs text-slate-400 mt-1">{t('subtitle')}</p>
      </div>

      {erro && !data && <GlassCard><p className="text-sm text-amber-400 p-1">{erro}</p></GlassCard>}

      <div className="flex flex-wrap gap-2 mb-4">
        {cargos.map((c) => <button key={c} onClick={() => run(c)} className={`text-xs px-3 py-1.5 rounded-lg border ${sel === c ? 'bg-brand-500/20 border-brand-400 text-brand-200' : 'border-white/10 text-slate-300 hover:bg-white/5'}`}>{c}</button>)}
        {listando && <p className="inline-flex items-center gap-2 text-xs text-slate-400"><Loader2 size={13} className="animate-spin" /> {t('listing')}</p>}
        {!listando && cargos.length === 0 && !erro && <p className="text-xs text-slate-500">{t('noRoles')}</p>}
      </div>

      {pdfUrl && (
        <section aria-label={t('pdf.aria', { role: sel })}>
          <button
            type="button"
            onClick={() => setPdfUrl('')}
            className="mb-4 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.13em] text-white/45 transition hover:text-brand-200"
          >
            <ArrowLeft size={14} /> {t('pdf.back')}
          </button>

          <div className="overflow-hidden rounded-[26px] border border-white/[0.09] bg-[#071829] shadow-[0_24px_80px_rgba(0,0,0,.28)]">
            <header className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-4 sm:px-6">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-brand-400/20 bg-brand-400/10 text-brand-200">
                <FileText size={18} />
              </span>
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-brand-300">{t('pdf.reader')}</p>
                <h2 className="mt-0.5 truncate text-lg text-white sm:text-xl" style={{ fontFamily: 'var(--vh-font-display)', fontStyle: 'italic' }}>
                  {t('pdf.readerTitle', { role: sel })}
                </h2>
              </div>
            </header>
            <div className="p-2 sm:p-4">
              <InAppPdfDocument
                src={pdfUrl}
                title={t('pdf.documentTitle', { role: sel })}
                loadingLabel={t('pdf.loading')}
                errorLabel={t('pdf.openError')}
                retryLabel={t('pdf.retry')}
              />
            </div>
          </div>
        </section>
      )}

      {!pdfUrl && loading && <div className="flex justify-center py-12"><Loader2 className="animate-spin text-brand-400" /></div>}

      {!pdfUrl && data?.success && (
        <div className="space-y-4">
          <GlassCard>
            <div className="flex gap-2 items-start p-1">
              <Info size={15} className="text-cyan-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-slate-300">{t.rich('decisionSupport', { b: (chunks) => <b>{chunks}</b> })}</p>
            </div>
          </GlassCard>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
            <span>{t.rich('snapshot', { date: fmtData(data.dataISO, locale) ?? t('row.notAvailable'), ...negrito })}</span>
            <span>{t.rich('axis', {
              axis: rotuloBloco(data.eixo.label),
              hasWeight: data.eixo.peso != null ? 'yes' : 'no',
              weight: data.eixo.peso != null ? pct(Number(data.eixo.peso)) : '',
              ...negrito,
            })}</span>
            {/* As três faixas, com a cor de cada uma (eram emojis no texto: o ícone é a bolinha). */}
            <span className="inline-flex flex-wrap items-center gap-x-2">
              {Object.values(STATUS_COR).map((s, i) => (
                <span key={s.chave} className="inline-flex items-center gap-1">
                  {i > 0 && <span aria-hidden="true">{'·'}</span>}
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.cor }} aria-hidden="true" />
                  {t(`status.${s.chave}`)}
                </span>
              ))}
              {data.faixas ? <span>({t('legendNote', { min: pct(Number(data.faixas.ressalvasMin)) })})</span> : null}
            </span>
          </div>
          {data.divergencia && (
            <div className="rounded-lg p-2.5 border border-amber-400/30 bg-amber-400/5 text-[11px] text-amber-200/90 flex gap-2">
              <ShieldAlert size={14} className="shrink-0 mt-0.5" />
              <span>{t.rich('divergence', {
                axis: rotuloBloco(data.divergencia.eixo),
                spread: data.divergencia.sdEixo,
                real: rotuloBloco(data.divergencia.real),
                b: (chunks) => <b>{chunks}</b>,
              })}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <label className="flex items-center gap-1 text-slate-400">{t('filters.status')}
              <select value={fStatus} onChange={(e) => setFStatus(e.target.value as any)} className="bg-white/5 border border-white/10 rounded px-2 py-1 text-slate-200">
                <option value="todos">{t('filters.all')}</option><option value="recomendado">{t('filters.onlyRecommended')}</option><option value="recomendado_com_ressalvas">{t('filters.onlyReservations')}</option>
              </select>
            </label>
            {/* O filtro por traço a desenvolver saiu (03/09/2026, decisão do
                dono): não agregou. O que ele oferecia — saber quem precisa
                desenvolver o quê — já está escrito no card de cada pessoa
                ("A desenvolver: …"), sem custar um clique nem uma escolha. */}
            <label className="flex items-center gap-1 text-slate-400">{t('filters.minAdherence', { value: pct(fMin) })}
              <input type="range" min={0} max={100} value={fMin} onChange={(e) => setFMin(Number(e.target.value))} className="accent-brand-400" />
            </label>
            <div className="flex items-center gap-1 text-slate-400">{t('filters.sortBy')}
              <button onClick={() => setSort('aderencia')} className={`px-2 py-1 rounded border ${sort === 'aderencia' ? 'border-brand-400 text-brand-200' : 'border-white/10 text-slate-400'}`}>{t('filters.sortAdherence')}</button>
              <button onClick={() => setSort('eixo')} className={`px-2 py-1 rounded border ${sort === 'eixo' ? 'border-brand-400 text-brand-200' : 'border-white/10 text-slate-400'}`}>{t(data.divergencia ? 'filters.sortSeparates' : 'filters.sortAxis', { block: rotuloBloco(sep) })}</button>
            </div>
            <span className="text-slate-500 ml-auto">{t('count', { shown: visiveis.length, total: data.totais.elegiveis })}</span>
            {exportar && (
              <button onClick={exportarPDF} disabled={exportando} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-400/40 bg-brand-500/10 text-brand-200 hover:bg-brand-500/20 disabled:opacity-50">
                {exportando ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                {exportando ? t('pdf.generating') : t('pdf.view')}
              </button>
            )}
          </div>
          {erroExport && <p className="text-[11px] text-amber-400">{erroExport}</p>}

          <div className="space-y-1.5">
            {visiveis.map((e, i) => {
              const st = STATUS_COR[e.status] || STATUS_COR.abaixo_do_corte;
              return (
                <div key={e.id} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
                  <div className="w-6 text-center text-xs font-mono text-slate-500">{i + 1}</div>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: st.cor + '22', color: st.cor }}>{iniciais(e.nome)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-white truncate">{e.nome}</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: st.cor + '22', color: st.cor }}>{t(`status.${st.chave}`)}</span>
                      {e.borderline && <span className="text-[9px] text-amber-400" title={t('row.borderlineTitle')}>{t('row.borderline', { delta: e.semDelta })}</span>}
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-400/10 text-cyan-300">{rotuloBloco(sep)}: {e.blocos[sep] != null ? pct(Math.round(e.blocos[sep])) : t('row.notAvailable')}</span>
                      {eixoMorto && <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-slate-500" title={t('row.deadAxisTitle')}>{rotuloBloco(eixoMorto)}: {e.blocos[eixoMorto] != null ? pct(Math.round(e.blocos[eixoMorto])) : t('row.notAvailable')}</span>}
                    </div>
                    {e.drivers.length > 0 && <div className="text-[10px] text-slate-500 mt-0.5 truncate">{t('row.develop', { items: e.drivers.join(', ') })}</div>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold" style={{ color: st.cor }}>{fmtBeta(e.aderencia, locale)}</div>
                    <div className="text-[8px] text-slate-500">{t('row.adherence')}</div>
                  </div>
                </div>
              );
            })}
            {visiveis.length === 0 && <p className="text-xs text-slate-500 py-4 text-center">{t('row.noneMatch')}</p>}
          </div>

          {data.anexoGate.length > 0 && (
            <GlassCard>
              <div className="p-1">
                <div className="text-xs font-bold text-slate-300 mb-1">{t('gate.title', { count: data.anexoGate.length })}</div>
                <p className="text-[10px] text-slate-500 mb-2">{t('gate.body')}</p>
                <ul className="space-y-1">
                  {data.anexoGate.map((p: any) => (
                    <li key={p.id} className="text-[11px] text-slate-300 flex items-baseline gap-2">
                      <span className="font-medium text-white">{p.nome}</span>
                      <span className="text-red-400/90">{p.gates.join(' · ')}</span>
                      {p.origem && <span className="text-slate-600">({p.origem})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </GlassCard>
          )}
        </div>
      )}
    </>
  );
}
