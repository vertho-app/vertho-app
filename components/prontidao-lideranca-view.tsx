'use client';
/**
 * PRONTIDÃO PARA LIDERANÇA — a matriz de duas camadas, por pessoa.
 *
 * Componente compartilhado (RH self-service e preview de admin), no padrão de
 * `prontidao-cargo-view`: as actions entram por prop, uma tela serve os dois
 * escopos. Sem IA na leitura: tudo aqui é o que o núcleo puro calculou.
 *
 * O que a tela diz de propósito:
 *  1. "Calculado em <hora>" — não é snapshot; recomputa a cada abertura.
 *  2. A zona de revisão fica FORA da matriz, com lista própria: quem cai na
 *     banda do instrumento não é classificado por máquina.
 *  3. Cada gap vem com a média e o corte na mesma frase — rótulo sem número não
 *     aparece em lugar nenhum.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, ChevronDown, ChevronUp, FileText, Star, AlertTriangle } from 'lucide-react';
import { QUADRANTE_LABEL, RECOMENDACAO_POR_QUADRANTE, ORDEM_QUADRANTES, type Quadrante } from '@/lib/prontidao-lideranca/matriz';
import { POSICAO_LABEL } from '@/lib/prontidao-lideranca/posicao';
import { ESTILO_LABEL } from '@/lib/prontidao-lideranca/estilo';

// Forma única (não união discriminada): com strict:false a união não estreita por `success`.
type Resultado = { success: boolean; data?: any; error?: string; code?: string };

const fmtPct = (v: number | null | undefined) => (v == null ? '—' : `${Number(v).toFixed(1).replace('.', ',')}%`);
const fmtNota = (v: number | null | undefined) => (v == null ? '—' : Number(v).toFixed(2).replace('.', ','));
function horaBr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const TINTA: Record<Quadrante, { cor: string; fundo: string; borda: string }> = {
  pronta: { cor: '#34D399', fundo: 'rgba(52,211,153,.10)', borda: 'rgba(52,211,153,.35)' },
  pronta_com_custo: { cor: '#FBBF24', fundo: 'rgba(251,191,36,.10)', borda: 'rgba(251,191,36,.35)' },
  potencial: { cor: '#34C5CC', fundo: 'rgba(52,197,204,.10)', borda: 'rgba(52,197,204,.35)' },
  nao_agora: { cor: '#F87171', fundo: 'rgba(248,113,113,.10)', borda: 'rgba(248,113,113,.35)' },
  revisar: { cor: '#C4B5FD', fundo: 'rgba(196,181,253,.10)', borda: 'rgba(196,181,253,.35)' },
};

function Pill({ q }: { q: Quadrante }) {
  const t = TINTA[q];
  return (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider" style={{ color: t.cor, background: t.fundo, border: `1px solid ${t.borda}` }}>
      {QUADRANTE_LABEL[q]}
    </span>
  );
}

function Celula({ q, linhas, onAbrir }: { q: Quadrante; linhas: any[]; onAbrir: (id: string) => void }) {
  const t = TINTA[q];
  return (
    <div className="rounded-xl p-3 min-h-[120px]" style={{ background: t.fundo, border: `1px solid ${t.borda}` }}>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs font-extrabold" style={{ color: t.cor }}>{QUADRANTE_LABEL[q]}</span>
        <span className="text-lg font-black text-white tabular-nums">{linhas.length}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {linhas.map((l) => (
          <button key={l.colaboradorId} type="button" onClick={() => onAbrir(l.colaboradorId)}
            className="rounded-md px-2 py-0.5 text-[11px] text-gray-200 bg-white/[0.06] hover:bg-white/[0.12] transition">
            {l.ehExemplar && <Star size={9} className="inline mr-1 -mt-0.5 text-amber-300" />}{l.nome}
          </button>
        ))}
        {!linhas.length && <span className="text-[11px] text-gray-500">ninguém aqui</span>}
      </div>
    </div>
  );
}

function Parecer({ p, corte, exportar }: { p: any; corte: number; exportar?: (id: string) => Promise<{ success: boolean; url?: string; error?: string }> }) {
  const [exportando, setExportando] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [erro, setErro] = useState('');
  const l = p.linha;
  async function gerar() {
    if (!exportar) return;
    setExportando(true); setErro(''); setPdfUrl('');
    try {
      const r = await exportar(l.colaboradorId);
      if (r.success && r.url) setPdfUrl(r.url); else setErro(r.error || 'Falha ao gerar o PDF.');
    } catch { setErro('Falha ao gerar o PDF.'); }
    setExportando(false);
  }
  return (
    <div className="mt-3 rounded-xl border border-white/[0.08] p-4 space-y-4" style={{ background: '#091D35' }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-white">{l.nome} <span className="text-gray-500 font-normal">· {l.cargo || 'sem cargo'}</span></p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Pill q={l.quadrante} />
            {l.ehExemplar && <span className="text-[10px] text-amber-300 font-bold">líder de referência</span>}
            {l.auditoriaPendente && <span className="text-[10px] text-amber-300 font-bold inline-flex items-center gap-1"><AlertTriangle size={10} /> auditoria pediu revisão</span>}
          </div>
        </div>
        {exportar && (
          <div className="flex items-center gap-2">
            {pdfUrl ? (
              <a href={pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-brand-400/40 px-3 py-1.5 text-xs font-bold text-brand-300 hover:bg-brand-400/10"><FileText size={12} /> Abrir PDF</a>
            ) : (
              <button type="button" onClick={gerar} disabled={exportando} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-gray-200 hover:bg-white/5 disabled:opacity-50">
                {exportando ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />} Parecer em PDF
              </button>
            )}
          </div>
        )}
      </div>
      {erro && <p className="text-xs text-red-300">{erro}</p>}

      <p className="text-xs text-gray-300 leading-relaxed">{RECOMENDACAO_POR_QUADRANTE[l.quadrante as Quadrante]}</p>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-white/[0.06] p-3">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500 mb-2">Posição · competência demonstrada</p>
          <p className="text-xs text-gray-400 mb-2">Média geral <b className="text-white">{fmtNota(l.posicao.mediaGeral)}</b> (corte {fmtNota(corte)}) · {POSICAO_LABEL[l.posicao.posicao as keyof typeof POSICAO_LABEL]}</p>
          <ul className="space-y-1">
            {l.posicao.competencias.map((c: any) => (
              <li key={c.competencia} className="flex items-center justify-between gap-2 text-xs">
                <span className={c.gap ? 'text-red-300' : 'text-gray-200'}>{c.competencia}</span>
                <span className="tabular-nums text-gray-400">{fmtNota(c.media)} · N{c.nivel ?? '—'}</span>
              </li>
            ))}
          </ul>
          {l.frasesGap.length > 0 && (
            <div className="mt-2 border-t border-white/[0.06] pt-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-red-300 mb-1">Gaps nomeados</p>
              {l.frasesGap.map((f: string) => <p key={f} className="text-[11px] text-gray-300">{f}</p>)}
            </div>
          )}
        </div>
        <div className="rounded-lg border border-white/[0.06] p-3">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500 mb-2">Estilo · leitura, não veredito</p>
          <p className="text-xs text-gray-400 mb-2">Aderência ao perfil-alvo <b className="text-white">{fmtPct(l.estilo.aderenciaPct)}</b> · {ESTILO_LABEL[l.estilo.estilo as keyof typeof ESTILO_LABEL]}</p>
          {l.estilo.bloqueadoNoAlvo && (
            <p className="text-[11px] text-amber-300 mb-2">Requisito eliminatório do gabarito não atendido: {l.estilo.motivosBloqueio.join('; ') || 'ver gabarito'}. Aqui é leitura de onde o papel vai custar mais — não desqualifica.</p>
          )}
          {l.estilo.lacunas.length > 0 ? (
            <ul className="space-y-1">
              {l.estilo.lacunas.map((g: any) => (
                <li key={g.traco} className="flex items-center justify-between gap-2 text-xs"><span className="text-gray-200">{g.traco} <span className="text-gray-500">({g.bloco})</span></span><span className="tabular-nums text-gray-400">fit {fmtPct(g.fitPct)}</span></li>
              ))}
            </ul>
          ) : <p className="text-[11px] text-gray-500">sem lacunas relevantes</p>}
        </div>
      </div>

      <div>
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500 mb-2">Evidências · trechos da própria resposta</p>
        <div className="space-y-2">
          {p.evidencias.map((ev: any) => (
            <details key={ev.competencia} className="rounded-lg border border-white/[0.06] p-3">
              <summary className="cursor-pointer text-xs font-bold text-white flex items-center justify-between gap-2">
                <span>{ev.competencia}</span>
                <span className="text-[10px] font-normal text-gray-500">
                  {ev.auditoria === 'revisar' ? 'auditoria: revisar' : ev.auditoria ? `auditoria: ${ev.auditoria.replace(/_/g, ' ')}` : ev.descritores.length ? 'sem auditoria' : 'sem avaliação'}
                </span>
              </summary>
              {ev.descritores.length ? (
                <ul className="mt-2 space-y-2">
                  {ev.descritores.map((d: any) => (
                    <li key={d.descritor} className="text-[11px]">
                      <p className="text-gray-200"><b>{d.descritor}</b> · {fmtNota(d.nota)}{d.sustentacao ? ` · sustentação ${d.sustentacao}` : ''}</p>
                      {d.evidencias.map((e: any, i: number) => (
                        <p key={i} className="ml-2 text-gray-400 italic">“{e.trecho}” <span className="not-italic text-gray-600">— {e.resposta}{e.forca ? `, ${e.forca}` : ''}</span></p>
                      ))}
                      {!d.evidencias.length && d.limites.length > 0 && <p className="ml-2 text-amber-300/80">sem trecho; limites: {d.limites.join('; ')}</p>}
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-2 text-[11px] text-gray-500">Resposta ainda não avaliada pela IA.</p>}
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ProntidaoLiderancaView({ carregar, parecer, exportarParecer, scopeKey = 'default' }: {
  carregar: () => Promise<Resultado>;
  parecer: (colaboradorId: string) => Promise<Resultado>;
  exportarParecer?: (colaboradorId: string) => Promise<{ success: boolean; url?: string; error?: string }>;
  scopeKey?: string;
}) {
  const [data, setData] = useState<any>(null);
  const [erro, setErro] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [aberto, setAberto] = useState<string>('');
  const [pareceres, setPareceres] = useState<Record<string, any>>({});
  const [carregandoParecer, setCarregandoParecer] = useState('');
  const carregarRef = useRef(carregar);
  const parecerRef = useRef(parecer);
  carregarRef.current = carregar;
  parecerRef.current = parecer;

  useEffect(() => {
    let ativo = true;
    setLoading(true); setErro(''); setCode(''); setData(null); setAberto(''); setPareceres({});
    void (async () => {
      try {
        const r = await carregarRef.current();
        if (!ativo) return;
        if (r.success) setData(r.data); else { setErro(r.error || 'Erro.'); setCode(r.code || ''); }
      } catch { if (ativo) setErro('Não foi possível calcular a prontidão.'); }
      if (ativo) setLoading(false);
    })();
    return () => { ativo = false; };
  }, [scopeKey]);

  async function abrir(id: string) {
    if (aberto === id) { setAberto(''); return; }
    setAberto(id);
    if (pareceres[id]) return;
    setCarregandoParecer(id);
    try {
      const r = await parecerRef.current(id);
      setPareceres((prev) => ({ ...prev, [id]: r.success ? r.data : { erro: r.error } }));
    } catch { setPareceres((prev) => ({ ...prev, [id]: { erro: 'Não foi possível montar o parecer.' } })); }
    setCarregandoParecer('');
  }

  const porQuadrante = useMemo(() => {
    const m: Record<Quadrante, any[]> = { pronta: [], pronta_com_custo: [], potencial: [], nao_agora: [], revisar: [] };
    for (const l of data?.linhas || []) m[l.quadrante as Quadrante].push(l);
    return m;
  }, [data]);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 size={28} className="animate-spin text-brand-400" /></div>;
  if (erro) {
    return (
      <div className="rounded-2xl border border-white/[0.06] p-6" style={{ background: '#0F2A4A' }}>
        <p className="text-sm text-gray-200">{erro}</p>
        {code && <p className="mt-1 text-[11px] font-mono text-gray-500">{code}</p>}
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/[0.06] p-5" style={{ background: '#0F2A4A' }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-purple-300">Prontidão para liderança</p>
            <h2 className="text-lg font-black text-white">Perfil-alvo: {data.cargoAlvo}</h2>
            <p className="text-xs text-gray-400 mt-1">Calculado em {horaBr(data.calculadoEm)} · {data.populacao} pessoas na população · corte {fmtNota(data.corte)} ± {fmtNota(data.banda)}</p>
          </div>
          <div className="flex flex-wrap gap-1 max-w-md">
            {data.competencias.map((c: string) => <span key={c} className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] text-gray-300">{c}</span>)}
          </div>
        </div>
        {data.avisos?.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 space-y-1">
            {data.avisos.map((a: string) => <p key={a} className="text-[11px] text-amber-200 flex items-start gap-1.5"><AlertTriangle size={11} className="mt-0.5 shrink-0" /> {a}</p>)}
          </div>
        )}
      </div>

      {/* Matriz 2×2: Y = competência demonstrada (cima demonstra), X = estilo (direita aderente) */}
      <div className="grid gap-2 md:grid-cols-[auto_1fr]">
        <div className="hidden md:flex items-center justify-center"><span className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>competência demonstrada →</span></div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Celula q="pronta_com_custo" linhas={porQuadrante.pronta_com_custo} onAbrir={abrir} />
          <Celula q="pronta" linhas={porQuadrante.pronta} onAbrir={abrir} />
          <Celula q="nao_agora" linhas={porQuadrante.nao_agora} onAbrir={abrir} />
          <Celula q="potencial" linhas={porQuadrante.potencial} onAbrir={abrir} />
        </div>
        <div className="hidden md:block" />
        <p className="text-center text-[10px] font-extrabold uppercase tracking-widest text-gray-500">aderência de estilo ao perfil-alvo →</p>
      </div>

      {porQuadrante.revisar.length > 0 && (
        <div className="rounded-xl p-3" style={{ background: TINTA.revisar.fundo, border: `1px solid ${TINTA.revisar.borda}` }}>
          <p className="text-xs font-extrabold mb-1" style={{ color: TINTA.revisar.cor }}>Zona de revisão · {porQuadrante.revisar.length}</p>
          <p className="text-[11px] text-gray-400 mb-2">Média dentro de ±{fmtNota(data.banda)} do corte: a releitura do instrumento sozinha move esse número. Leitura humana com as evidências.</p>
          <div className="flex flex-wrap gap-1">
            {porQuadrante.revisar.map((l: any) => (
              <button key={l.colaboradorId} type="button" onClick={() => abrir(l.colaboradorId)} className="rounded-md px-2 py-0.5 text-[11px] text-gray-200 bg-white/[0.06] hover:bg-white/[0.12]">{l.nome}</button>
            ))}
          </div>
        </div>
      )}

      {(data.incompletos.length > 0 || data.semEstilo.length > 0 || data.naoIniciados > 0) && (
        <div className="rounded-xl border border-white/[0.06] p-3 text-[11px] text-gray-400 space-y-1" style={{ background: '#0F2A4A' }}>
          {data.naoIniciados > 0 && <p><b className="text-gray-200">{data.naoIniciados}</b> não iniciaram o mapeamento de liderança.</p>}
          {data.incompletos.length > 0 && <p><b className="text-gray-200">{data.incompletos.length}</b> com mapeamento incompleto: {data.incompletos.slice(0, 8).map((i: any) => `${i.nome} (${i.cobertas}/${i.total})`).join(', ')}{data.incompletos.length > 8 ? '…' : ''}</p>}
          {data.semEstilo.length > 0 && <p><b className="text-gray-200">{data.semEstilo.length}</b> sem o eixo de estilo: {data.semEstilo.slice(0, 8).map((s: any) => `${s.nome} (${s.motivo})`).join(', ')}{data.semEstilo.length > 8 ? '…' : ''}</p>}
        </div>
      )}

      <div className="rounded-2xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-4 py-2 text-[10px] font-extrabold uppercase tracking-widest text-gray-500 border-b border-white/[0.06]">
          <span>Pessoa</span><span>Quadrante</span><span className="text-right">Média</span><span className="text-right">Aderência</span>
        </div>
        {data.linhas.map((l: any) => (
          <div key={l.colaboradorId} className="border-b border-white/[0.04] last:border-b-0">
            <button type="button" onClick={() => abrir(l.colaboradorId)} className="w-full grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center px-4 py-2.5 text-left hover:bg-white/[0.03]">
              <span className="text-sm text-white truncate">{l.ehExemplar && <Star size={11} className="inline mr-1 -mt-0.5 text-amber-300" />}{l.nome} <span className="text-gray-500 text-xs">· {l.cargo || '—'}</span>{l.auditoriaPendente && <AlertTriangle size={11} className="inline ml-1 -mt-0.5 text-amber-300" />}</span>
              <Pill q={l.quadrante} />
              <span className="text-xs tabular-nums text-gray-300 text-right">{fmtNota(l.posicao.mediaGeral)}</span>
              <span className="text-xs tabular-nums text-gray-300 text-right inline-flex items-center justify-end gap-1">{fmtPct(l.estilo.aderenciaPct)} {aberto === l.colaboradorId ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</span>
            </button>
            {aberto === l.colaboradorId && (
              <div className="px-4 pb-4">
                {carregandoParecer === l.colaboradorId && <div className="py-4 flex justify-center"><Loader2 size={18} className="animate-spin text-brand-400" /></div>}
                {pareceres[l.colaboradorId]?.erro && <p className="text-xs text-red-300">{pareceres[l.colaboradorId].erro}</p>}
                {pareceres[l.colaboradorId]?.linha && <Parecer p={pareceres[l.colaboradorId]} corte={data.corte} exportar={exportarParecer} />}
              </div>
            )}
          </div>
        ))}
        {!data.linhas.length && <p className="px-4 py-6 text-sm text-gray-400">Ninguém com as duas camadas completas ainda.</p>}
      </div>

      <p className="text-[10px] text-gray-600">Ordem: {ORDEM_QUADRANTES.map((q) => QUADRANTE_LABEL[q]).join(' → ')}. Apoio à decisão; a decisão é da empresa.</p>
    </div>
  );
}
