'use client';
/**
 * MAPEAMENTO DE LIDERANÇA: a matriz de duas camadas, por pessoa.
 *
 * Componente compartilhado (RH self-service e preview de admin), no padrão de
 * `prontidao-cargo-view`: as actions entram por prop, uma tela serve os dois
 * escopos. Sem IA na leitura: tudo aqui é o que o núcleo puro calculou.
 *
 * O que a tela diz de propósito:
 *  1. "Calculado em <hora>": não é snapshot, recomputa a cada abertura.
 *  2. Os dois eixos da matriz são CRESCENTES e as pontas vêm rotuladas com
 *     baixa/alta. Uma seta sozinha se lê nos dois sentidos, e a posição de cada
 *     quadrante só significa alguma coisa se o sentido do eixo for inequívoco.
 *  3. Nível, nunca nota decimal, para o cliente (decisão 1 do dono, revisão de
 *     02/10/2026). A porta do RH já entrega os dados sem a nota
 *     (`lib/prontidao-lideranca/cliente.ts`); só o preview do admin da Vertho
 *     recebe `exibeNota` e mostra média e corte ao lado do nível.
 *  4. Erro legível e sem código interno (R-39): o código vira frase traduzida.
 *  5. Parecer que falhou NÃO fica no cache (R-142): reabrir a pessoa tenta de
 *     novo, e o erro tem o botão "Tentar de novo".
 *  6. Evidência entre aspas só quando o trecho confere com a resposta (R-134);
 *     o resto aparece como leitura da IA, sem aspas.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, ChevronDown, ChevronUp, FileText, AlertTriangle, RotateCcw } from 'lucide-react';
import { ORDEM_QUADRANTES, GRID_QUADRANTES, type Quadrante } from '@/lib/prontidao-lideranca/matriz';
import { nivelDaNota } from '@/lib/nivel-regua';

// Forma única (não união discriminada): com strict:false a união não estreita por `success`.
type Resultado = { success: boolean; data?: any; error?: string; code?: string; motivo?: string; faltantes?: string[]; detalhe?: string };
type Tradutor = ReturnType<typeof useTranslations>;

/** Códigos que a tela sabe dizer em frase; qualquer outro vira a mensagem genérica. */
const ERROS_CONHECIDOS = new Set(['MODULO_NAO_CONTRATADO', 'PROGRAMA_NAO_CONFIGURADO', 'SO_RH', 'NAO_AUTENTICADO', 'SEM_EMPRESA']);
const MOTIVOS_INDISPONIVEL = new Set(['incompleto', 'sem_estilo', 'fora']);
const FORCAS = new Set(['forte', 'moderada', 'fraca']);
const AUDITORIAS = new Set(['aprovado', 'aprovado_com_ajustes', 'revisar']);

/** A frase do erro de carga, sem código nem texto técnico (R-39). */
export function mensagemDeErro(r: Pick<Resultado, 'code'>, t: Tradutor): string {
  return r.code && ERROS_CONHECIDOS.has(r.code) ? t(`erros.${r.code}`) : t('erros.generico');
}

/** A frase do parecer indisponível (pessoa fora da matriz), traduzida pelo motivo. */
export function mensagemDoParecer(r: Resultado, t: Tradutor): string {
  if (r.code === 'PARECER_INDISPONIVEL' && r.motivo && MOTIVOS_INDISPONIVEL.has(r.motivo)) {
    if (r.motivo === 'sem_estilo') {
      return t('indisponivel.sem_estilo', { motivo: t(`motivoSemEstilo.${r.detalhe === 'sem_perfil' ? 'sem_perfil' : 'estilo_indisponivel'}`) });
    }
    return t(`indisponivel.${r.motivo}`, { faltantes: (r.faltantes || []).join(', ') });
  }
  return mensagemDeErro(r, t);
}

/**
 * Cache dos pareceres abertos: só o parecer MONTADO fica guardado. Até
 * 03/10/2026 o erro era guardado no mesmo mapa, e reabrir a pessoa mostrava o
 * mesmo erro sem nova tentativa até recarregar a página (R-142).
 */
export function precisaBuscarParecer(pareceres: Record<string, unknown>, id: string): boolean {
  return !pareceres[id];
}

const fmtPct = (v: number | null | undefined, locale: string) =>
  v == null ? '—' : `${Math.round(Number(v)).toLocaleString(locale)}%`;
const fmtNota = (v: number | null | undefined, locale: string) =>
  v == null ? '—' : Number(v).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function horaBr(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

/** Colunas da lista (ver o comentário no cabeçalho da tabela). */
const COLUNAS = { gridTemplateColumns: 'minmax(0,1fr) auto 4.5rem 5rem 1rem' } as const;

// "Não agora" em lilás, não em vermelho (R-39): é um momento da pessoa, não reprovação.
const TINTA: Record<Quadrante, { cor: string; fundo: string; borda: string }> = {
  pronta: { cor: '#34D399', fundo: 'rgba(52,211,153,.10)', borda: 'rgba(52,211,153,.35)' },
  pronta_com_custo: { cor: '#FBBF24', fundo: 'rgba(251,191,36,.10)', borda: 'rgba(251,191,36,.35)' },
  potencial: { cor: '#34C5CC', fundo: 'rgba(52,197,204,.10)', borda: 'rgba(52,197,204,.35)' },
  nao_agora: { cor: '#B4A5F0', fundo: 'rgba(180,165,240,.10)', borda: 'rgba(180,165,240,.35)' },
};

function Pill({ q, t }: { q: Quadrante; t: Tradutor }) {
  const tinta = TINTA[q];
  return (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider" style={{ color: tinta.cor, background: tinta.fundo, border: `1px solid ${tinta.borda}` }}>
      {t(`quadrante.${q}`)}
    </span>
  );
}

function Celula({ q, linhas, onAbrir, t }: { q: Quadrante; linhas: any[]; onAbrir: (id: string) => void; t: Tradutor }) {
  const tinta = TINTA[q];
  return (
    <div className="rounded-xl p-3 min-h-[120px]" style={{ background: tinta.fundo, border: `1px solid ${tinta.borda}` }}>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs font-extrabold" style={{ color: tinta.cor }}>{t(`quadrante.${q}`)}</span>
        <span className="text-lg font-black text-white tabular-nums">{linhas.length}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {linhas.map((l) => (
          <button key={l.colaboradorId} type="button" onClick={() => onAbrir(l.colaboradorId)}
            className="rounded-md px-2 py-0.5 text-[11px] text-gray-200 bg-white/[0.06] hover:bg-white/[0.12] transition">
            {l.nome}
          </button>
        ))}
        {!linhas.length && <span className="text-[11px] text-gray-500">{t('ninguemAqui')}</span>}
      </div>
    </div>
  );
}

/** Rótulo da meta: "meta: Nível 3", ou a meta do programa quando o corte não é um nível. */
function rotuloMeta(t: Tradutor, metaNivel: number | null | undefined): string {
  return metaNivel ? t('meta', { n: metaNivel }) : t('metaPrograma');
}

export function ParecerPessoa({ p, metaNivel, exibeNota, exportar }: {
  p: any;
  metaNivel?: number | null;
  exibeNota?: boolean;
  exportar?: (id: string) => Promise<{ success: boolean; url?: string; error?: string }>;
}) {
  const t = useTranslations('MapeamentoLideranca');
  const locale = useLocale();
  const [exportando, setExportando] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [erro, setErro] = useState('');
  const l = p.linha;
  async function gerar() {
    if (!exportar) return;
    setExportando(true); setErro(''); setPdfUrl('');
    try {
      const r = await exportar(l.colaboradorId);
      if (r.success && r.url) setPdfUrl(r.url); else setErro(t('erros.pdf'));
    } catch { setErro(t('erros.pdf')); }
    setExportando(false);
  }
  const abaixo = l.posicao.competencias.filter((c: any) => c.gap && c.nivel != null);
  return (
    <div className="mt-3 rounded-xl border border-white/[0.08] p-4 space-y-4" style={{ background: '#091D35' }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-white">{l.nome} <span className="text-gray-500 font-normal">· {l.cargo || t('semCargo')}</span></p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Pill q={l.quadrante} t={t} />
            {l.auditoriaPendente && <span className="text-[10px] text-amber-300 font-bold inline-flex items-center gap-1"><AlertTriangle size={10} /> {t('auditoriaPediuRevisao')}</span>}
          </div>
        </div>
        {exportar && (
          <div className="flex items-center gap-2">
            {pdfUrl ? (
              <a href={pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-brand-400/40 px-3 py-1.5 text-xs font-bold text-brand-300 hover:bg-brand-400/10"><FileText size={12} /> {t('abrirPdf')}</a>
            ) : (
              <button type="button" onClick={gerar} disabled={exportando} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-gray-200 hover:bg-white/5 disabled:opacity-50">
                {exportando ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />} {t('parecerPdf')}
              </button>
            )}
          </div>
        )}
      </div>
      {erro && <p className="text-xs text-red-300">{erro}</p>}

      <p className="text-xs text-gray-300 leading-relaxed">{t(`recomendacao.${l.quadrante}`)}</p>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-white/[0.06] p-3">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500 mb-2">{t('posicaoTitulo')}</p>
          <p className="text-xs text-gray-400 mb-2">
            <b className="text-white">{t('nivelGeral', { n: l.posicao.nivelGeral })}</b> · {t(`posicao.${l.posicao.posicao}`)} · {rotuloMeta(t, metaNivel)}
            {exibeNota && <span className="text-gray-600"> · {t('notaAdmin', { media: fmtNota(l.posicao.mediaGeral, locale), corte: fmtNota(p.corte, locale) })}</span>}
          </p>
          <ul className="space-y-1">
            {l.posicao.competencias.map((c: any) => (
              <li key={c.competencia} className="flex items-center justify-between gap-2 text-xs">
                <span className={c.gap ? 'text-amber-200' : 'text-gray-200'}>
                  {c.competencia}
                  {c.parcial && <span className="ml-1 text-amber-300" title={t('sinalFracoAjuda', { n: c.descritores })}>· {t('sinalFraco')}</span>}
                </span>
                <span className="tabular-nums text-gray-400">
                  {c.nivel != null ? t('nivel', { n: c.nivel }) : '—'}
                  {exibeNota && c.media != null && <span className="text-gray-600"> ({fmtNota(c.media, locale)})</span>}
                </span>
              </li>
            ))}
          </ul>
          {abaixo.length > 0 && (
            <div className="mt-2 border-t border-white/[0.06] pt-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300 mb-1">{t('abaixoDaMeta')}</p>
              {abaixo.map((c: any) => <p key={c.competencia} className="text-[11px] text-gray-300">{t('linhaAbaixo', { competencia: c.competencia, n: c.nivel })}</p>)}
            </div>
          )}
        </div>
        <div className="rounded-lg border border-white/[0.06] p-3">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500 mb-2">{t('estiloTitulo')}</p>
          <p className="text-xs text-gray-400 mb-2">{t('aderencia', { pct: fmtPct(l.estilo.aderenciaPct, locale) })} · {t(`estilo.${l.estilo.estilo === 'aderente' ? 'aderente' : 'distante'}`)}</p>
          {l.estilo.bloqueadoNoAlvo && (
            <p className="text-[11px] text-amber-300 mb-2">{t('eliminatorio', { motivos: l.estilo.motivosBloqueio.join('; ') || t('verGabarito') })}</p>
          )}
          {l.estilo.lacunas.length > 0 ? (
            <ul className="space-y-1">
              {l.estilo.lacunas.map((g: any) => (
                <li key={g.traco} className="flex items-center justify-between gap-2 text-xs"><span className="text-gray-200">{g.traco} <span className="text-gray-500">({String(g.bloco).toLocaleLowerCase('pt-BR') === 'disc' ? t('mapeamentoComportamental') : g.bloco})</span></span><span className="tabular-nums text-gray-400">{t('fit', { pct: fmtPct(g.fitPct, locale) })}</span></li>
              ))}
            </ul>
          ) : <p className="text-[11px] text-gray-500">{t('semLacunas')}</p>}
        </div>
      </div>

      <div>
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500 mb-1">{t('evidenciasTitulo')}</p>
        <p className="text-[11px] text-gray-500 mb-2">{t('evidenciasAjuda')}</p>
        <div className="space-y-2">
          {p.evidencias.map((ev: any) => (
            <details key={ev.competencia} className="rounded-lg border border-white/[0.06] p-3">
              <summary className="cursor-pointer text-xs font-bold text-white flex items-center justify-between gap-2">
                <span>{ev.competencia}</span>
                <span className="text-[10px] font-normal text-gray-500">
                  {ev.auditoria && AUDITORIAS.has(ev.auditoria) ? t(`auditoria.${ev.auditoria}`) : ev.descritores.length ? t('semAuditoria') : t('semAvaliacao')}
                </span>
              </summary>
              {ev.descritores.length ? (
                <ul className="mt-2 space-y-2">
                  {ev.descritores.map((d: any) => {
                    const nivel = d.nivel ?? (d.nota == null ? null : nivelDaNota(d.nota));
                    return (
                      <li key={d.descritor} className="text-[11px]">
                        <p className="text-gray-200">
                          <b>{d.descritor}</b>{nivel != null ? ` · ${t('nivel', { n: nivel })}` : ''}
                          {exibeNota && d.nota != null ? ` (${fmtNota(d.nota, locale)})` : ''}
                          {d.sustentacao ? ` · ${t('sustentacao', { forca: FORCAS.has(d.sustentacao) ? t(`forca.${d.sustentacao}`) : d.sustentacao })}` : ''}
                        </p>
                        {d.evidencias.map((e: any, i: number) => {
                          const origem = /^R\s*([1-4])$/i.exec(String(e.resposta || '').trim());
                          const rodape = [origem ? t('resposta', { n: Number(origem[1]) }) : e.resposta, e.forca && FORCAS.has(e.forca) ? t(`forca.${e.forca}`) : e.forca].filter(Boolean).join(', ');
                          return e.literal ? (
                            <p key={i} className="ml-2 text-gray-400 italic">“{e.trecho}” <span className="not-italic text-gray-600">· {rodape}</span></p>
                          ) : (
                            <p key={i} className="ml-2 text-gray-400"><span className="text-gray-500">{t('leituraDaIa')}:</span> {e.trecho} <span className="text-gray-600">· {rodape}</span></p>
                          );
                        })}
                        {!d.evidencias.length && d.limites.length > 0 && <p className="ml-2 text-amber-300/80">{t('semTrecho', { limites: d.limites.join('; ') })}</p>}
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="mt-2 text-[11px] text-gray-500">{t('naoAvaliada')}</p>}
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ProntidaoLiderancaView({ carregar, parecer, exportarParecer, exportarConsolidado, scopeKey = 'default' }: {
  carregar: () => Promise<Resultado>;
  parecer: (colaboradorId: string) => Promise<Resultado>;
  exportarParecer?: (colaboradorId: string) => Promise<{ success: boolean; url?: string; error?: string }>;
  exportarConsolidado?: () => Promise<{ success: boolean; url?: string; error?: string }>;
  scopeKey?: string;
}) {
  const t = useTranslations('MapeamentoLideranca');
  const locale = useLocale();
  const [consolidando, setConsolidando] = useState(false);
  const [consolidadoUrl, setConsolidadoUrl] = useState('');
  const [erroConsolidado, setErroConsolidado] = useState('');
  async function gerarConsolidado() {
    if (!exportarConsolidado) return;
    setConsolidando(true); setErroConsolidado(''); setConsolidadoUrl('');
    try {
      const r = await exportarConsolidado();
      if (r.success && r.url) setConsolidadoUrl(r.url); else setErroConsolidado(t('erros.pdf'));
    } catch { setErroConsolidado(t('erros.pdf')); }
    setConsolidando(false);
  }
  const [data, setData] = useState<any>(null);
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(true);
  const [aberto, setAberto] = useState<string>('');
  const [pareceres, setPareceres] = useState<Record<string, any>>({});
  const [errosParecer, setErrosParecer] = useState<Record<string, string>>({});
  const [carregandoParecer, setCarregandoParecer] = useState('');
  const carregarRef = useRef(carregar);
  const parecerRef = useRef(parecer);
  carregarRef.current = carregar;
  parecerRef.current = parecer;

  useEffect(() => {
    let ativo = true;
    setLoading(true); setErro(''); setData(null); setAberto(''); setPareceres({}); setErrosParecer({});
    void (async () => {
      try {
        const r = await carregarRef.current();
        if (!ativo) return;
        if (r.success) setData(r.data); else setErro(mensagemDeErro(r, t));
      } catch { if (ativo) setErro(t('erros.generico')); }
      if (ativo) setLoading(false);
    })();
    return () => { ativo = false; };
    // `t` muda de identidade a cada render; o efeito é por escopo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  async function buscarParecer(id: string) {
    setCarregandoParecer(id);
    setErrosParecer((prev) => { const { [id]: _, ...resto } = prev; return resto; });
    try {
      const r = await parecerRef.current(id);
      if (r.success) setPareceres((prev) => ({ ...prev, [id]: r.data }));
      else setErrosParecer((prev) => ({ ...prev, [id]: mensagemDoParecer(r, t) }));
    } catch { setErrosParecer((prev) => ({ ...prev, [id]: t('erros.parecer') })); }
    setCarregandoParecer('');
  }

  async function abrir(id: string) {
    if (aberto === id) { setAberto(''); return; }
    setAberto(id);
    if (!precisaBuscarParecer(pareceres, id)) return;
    await buscarParecer(id);
  }

  const porQuadrante = useMemo(() => {
    const m: Record<Quadrante, any[]> = { pronta: [], pronta_com_custo: [], potencial: [], nao_agora: [] };
    for (const l of data?.linhas || []) m[l.quadrante as Quadrante].push(l);
    return m;
  }, [data]);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 size={28} className="animate-spin text-brand-400" /></div>;
  if (erro) {
    return (
      <div className="rounded-2xl border border-white/[0.06] p-6" style={{ background: '#0F2A4A' }}>
        <p className="text-sm text-gray-200">{erro}</p>
      </div>
    );
  }
  if (!data) return null;
  const exibeNota = data.exibeNota === true;
  const avisos: Array<{ codigo: string; valores?: Record<string, any> }> = data.avisosCodigos || [];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/[0.06] p-5" style={{ background: '#0F2A4A' }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-purple-300">{t('eyebrow')}</p>
            <h2 className="text-lg font-black text-white">{t('perfilAlvo', { cargo: data.cargoAlvo })}</h2>
            <p className="text-xs text-gray-400 mt-1">
              {t('calculadoEm', { data: horaBr(data.calculadoEm, locale), n: data.populacao })} · {rotuloMeta(t, data.metaNivel)}
              {exibeNota && <span className="text-gray-600"> · {t('corteAdmin', { corte: fmtNota(data.corte, locale) })}</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-1 max-w-md">
            {data.competencias.map((c: string) => <span key={c} className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] text-gray-300">{c}</span>)}
          </div>
        </div>
        {exportarConsolidado && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {consolidadoUrl ? (
              <a href={consolidadoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-brand-400/40 px-3 py-1.5 text-xs font-bold text-brand-300 hover:bg-brand-400/10"><FileText size={12} /> {t('abrirConsolidado')}</a>
            ) : (
              <button type="button" onClick={gerarConsolidado} disabled={consolidando} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-gray-200 hover:bg-white/5 disabled:opacity-50">
                {consolidando ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />} {t('consolidadoPdf')}
              </button>
            )}
            {erroConsolidado && <span className="text-xs text-red-300">{erroConsolidado}</span>}
          </div>
        )}
        {avisos.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 space-y-1">
            {avisos.map((a) => <p key={a.codigo} className="text-[11px] text-amber-200 flex items-start gap-1.5"><AlertTriangle size={11} className="mt-0.5 shrink-0" /> {t(`avisos.${a.codigo}`, a.valores || {})}</p>)}
          </div>
        )}
      </div>

      {/*
        Matriz 2x2 com os dois eixos CRESCENTES, lida do `GRID_QUADRANTES` (fonte
        única, para a ordem não divergir aqui e no PDF). Cada eixo tem as pontas
        rotuladas baixa/alta: uma seta sozinha se lê nos dois sentidos, e sem o
        sentido inequívoco a posição do quadrante não informa nada.

        O alinhamento do eixo X é ESTRUTURAL: ele é uma célula do mesmo grid,
        em `md:col-start-3`, a coluna das células. A primeira tentativa repetia
        o bloco do eixo Y invisível como espelho, e o espelho saiu com largura
        ZERO (o `hidden` venceu o `md:flex`), então o alinhamento que apareceu
        na tela era coincidência.

        Os rótulos seguem o MESMO breakpoint das células (`sm`, 640px). Com eles
        em `md` havia uma faixa de 640 a 768 onde a matriz aparecia 2x2 e o
        sentido dos eixos não: matriz sem eixo declarado é a ambiguidade que
        este bloco existe para fechar. Abaixo de 640 as células empilham e aí
        não há eixo nenhum a declarar.
      */}
      <div className="grid grid-cols-1 gap-x-2 gap-y-1.5 sm:grid-cols-[auto_auto_1fr]">
        <div className="hidden sm:flex sm:row-span-2 items-center justify-center">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
            {t('eixoY')}
          </span>
        </div>
        <div className="hidden sm:flex sm:row-span-2 flex-col justify-between py-3 text-[9px] font-bold uppercase tracking-wider text-gray-600">
          <span>{t('alta')}</span>
          <span>{t('baixa')}</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 sm:row-span-2">
          {GRID_QUADRANTES.map((q) => <Celula key={q} q={q} linhas={porQuadrante[q]} onAbrir={abrir} t={t} />)}
        </div>
        <div className="sm:col-start-3">
          <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider text-gray-600">
            <span>{t('baixa')}</span><span>{t('alta')}</span>
          </div>
          <p className="text-center text-[10px] font-extrabold uppercase tracking-widest text-gray-500">{t('eixoX')}</p>
        </div>
      </div>

      {(data.incompletos.length > 0 || data.semEstilo.length > 0 || data.naoIniciados > 0) && (
        <div className="rounded-xl border border-white/[0.06] p-3 text-[11px] text-gray-400 space-y-1" style={{ background: '#0F2A4A' }}>
          {data.naoIniciados > 0 && <p>{t('naoIniciaram', { n: data.naoIniciados })}</p>}
          {data.incompletos.length > 0 && <p>{t('incompletos', { n: data.incompletos.length, lista: data.incompletos.slice(0, 8).map((i: any) => t('incompletoItem', { nome: i.nome, feitas: i.cobertas, total: i.total })).join(', ') + (data.incompletos.length > 8 ? '…' : '') })}</p>}
          {data.semEstilo.length > 0 && <p>{t('semEstilo', { n: data.semEstilo.length, lista: data.semEstilo.slice(0, 8).map((s: any) => `${s.nome} (${t(`motivoSemEstilo.${s.motivoCodigo === 'sem_perfil' ? 'sem_perfil' : 'estilo_indisponivel'}`)})`).join(', ') + (data.semEstilo.length > 8 ? '…' : '') })}</p>}
        </div>
      )}

      <div className="rounded-2xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
        {/*
          Colunas com largura FIXA em vez de `auto`: com `auto` as três da direita
          encolhem até o conteúdo e encostam umas nas outras, e o cabeçalho sai
          embolado (visto em 14/09). O chevron ganha coluna própria para não
          empurrar o número da aderência.

          ⚠️ Vai por `style`, não por classe do Tailwind: a classe arbitrária
          `grid-cols-[minmax(0,1fr)_...]` NÃO é gerada (a vírgula quebra o
          parser), e o efeito é silencioso: a classe fica no DOM, o CSS não
          existe e o grid cai para UMA coluna. Medido em 14/09, com
          `gridTemplateColumns` computado em `1007.74px`. Nenhum teste vê isso.
        */}
        <div className="grid gap-x-4 px-4 py-2 text-[10px] font-extrabold uppercase tracking-widest text-gray-500 border-b border-white/[0.06]" style={COLUNAS}>
          <span>{t('colPessoa')}</span><span className="text-center">{t('colQuadrante')}</span><span className="text-right">{t('colNivel')}</span><span className="text-right">{t('colAderencia')}</span><span />
        </div>
        {data.linhas.map((l: any) => (
          <div key={l.colaboradorId} className="border-b border-white/[0.04] last:border-b-0">
            <button type="button" onClick={() => abrir(l.colaboradorId)} className="w-full grid gap-x-4 items-center px-4 py-2.5 text-left hover:bg-white/[0.03]" style={COLUNAS}>
              <span className="text-sm text-white truncate">{l.nome} <span className="text-gray-500 text-xs">· {l.cargo || '—'}</span>{l.auditoriaPendente && <AlertTriangle size={11} className="inline ml-1 -mt-0.5 text-amber-300" />}</span>
              <span className="justify-self-center"><Pill q={l.quadrante} t={t} /></span>
              <span className="text-xs tabular-nums text-gray-300 text-right">
                {l.posicao.nivelGeral != null ? t('nivel', { n: l.posicao.nivelGeral }) : '—'}
                {exibeNota && <span className="block text-[10px] text-gray-600">{fmtNota(l.posicao.mediaGeral, locale)}</span>}
              </span>
              <span className="text-xs tabular-nums text-gray-300 text-right">{fmtPct(l.estilo.aderenciaPct, locale)}</span>
              <span className="text-gray-400 justify-self-end">{aberto === l.colaboradorId ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</span>
            </button>
            {aberto === l.colaboradorId && (
              <div className="px-4 pb-4">
                {carregandoParecer === l.colaboradorId && <div className="py-4 flex justify-center"><Loader2 size={18} className="animate-spin text-brand-400" /></div>}
                {errosParecer[l.colaboradorId] && carregandoParecer !== l.colaboradorId && (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-xs text-red-300">{errosParecer[l.colaboradorId]}</p>
                    <button type="button" onClick={() => buscarParecer(l.colaboradorId)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1 text-xs font-bold text-gray-200 hover:bg-white/5">
                      <RotateCcw size={12} /> {t('tentarDeNovo')}
                    </button>
                  </div>
                )}
                {pareceres[l.colaboradorId]?.linha && (
                  <ParecerPessoa p={pareceres[l.colaboradorId]} metaNivel={data.metaNivel} exibeNota={exibeNota} exportar={exportarParecer} />
                )}
              </div>
            )}
          </div>
        ))}
        {!data.linhas.length && <p className="px-4 py-6 text-sm text-gray-400">{t('listaVazia')}</p>}
      </div>

      <p className="text-[10px] text-gray-600">{t('rodape', { ordem: ORDEM_QUADRANTES.map((q) => t(`quadrante.${q}`)).join(' → ') })}</p>
    </div>
  );
}
