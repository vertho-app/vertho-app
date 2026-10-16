'use client';

/**
 * Painel "Enriquecer contatos" da visão Escola do Mercado Potencial.
 *
 * Fluxo: plano (não gasta nada) → confirmação do custo → laço de lotes de 5 escolas (cada uma é gravada ao
 * terminar, então parar ou fechar a aba não perde o que já saiu) → resumo. A tela só mostra contagens: nome,
 * e-mail e telefone de ninguém passam por aqui (saem só na planilha).
 */

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2, Play, ShieldOff, Square, X } from 'lucide-react';
import { enriquecerLote, planejarEnriquecimento, suprimirContato, type MercadoFilters } from '../actions';
import { TAMANHO_LOTE } from '@/lib/mercado-potencial/enriquecimento/tipos';
import type { PlanoEnriquecimento, ResultadoEscola } from '@/lib/mercado-potencial/enriquecimento/lote';

type Fase = 'plano' | 'confirmar' | 'rodando' | 'fim';
type Parada = null | 'operador' | 'teto' | 'erro';

interface Resumo {
  total: number;
  feitas: number;
  niveis: { A: number; B: number; C: number };
  hunterPendente: number;
  erros: { codigo_inep: string; erro: string }[];
  adiadas: number;
  buscas: number;
  custoUsd: number;
  creditosGastos: number;
  creditosHunter: number | null;
  parada: Parada;
}

const VAZIO = (total: number): Resumo => ({
  total, feitas: 0, niveis: { A: 0, B: 0, C: 0 }, hunterPendente: 0, erros: [], adiadas: 0,
  buscas: 0, custoUsd: 0, creditosGastos: 0, creditosHunter: null, parada: null,
});

/** Escola que acabou sem o e-mail do decisor por falta de crédito ou de chave do Hunter (a busca web ficou gravada). */
const HUNTER_FALTOU = new Set(['a_completar', 'sem_creditos', 'indisponivel']);

export default function EnriquecerPainel({ filtros, onFechar }: { filtros: MercadoFilters; onFechar: () => void }) {
  const t = useTranslations('AdminMarketPotential.enrich');
  const locale = useLocale();
  const n = (x: number) => Math.round(x).toLocaleString(locale);
  const usd = (x: number) => x.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const [fase, setFase] = useState<Fase>('plano');
  const [plano, setPlano] = useState<PlanoEnriquecimento | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const parar = useRef(false);
  const pedido = useRef(0);

  // Suspensão (remover e bloquear um e-mail)
  const [emailBloqueio, setEmailBloqueio] = useState('');
  const [motivoBloqueio, setMotivoBloqueio] = useState('');
  const [bloqueando, setBloqueando] = useState(false);

  async function planejar() {
    const meu = ++pedido.current;
    setCarregando(true); setErro('');
    try {
      const r = await planejarEnriquecimento(filtros);
      if (meu !== pedido.current) return;
      if (r.ok === false) { setPlano(null); setErro(t('planError', { message: r.error })); }
      else setPlano(r.plano);
    } catch (e: any) {
      if (meu === pedido.current) { setPlano(null); setErro(t('planError', { message: e?.message || '' })); }
    }
    if (meu === pedido.current) setCarregando(false);
  }

  // Fechar o painel (ou trocar de visão) no meio do laço PARA o gasto, depois do lote em curso: sem isto o laço
  // seguiria chamando o servidor, e a busca é paga, sem tela e sem botão de parar.
  useEffect(() => () => { parar.current = true; }, []);

  // O plano depende do filtro (e da ordem da tela): recalcula, com folga para quem digita, enquanto nada roda.
  const chave = JSON.stringify(filtros);
  useEffect(() => {
    if (fase === 'rodando') return;
    setFase('plano'); setResumo(null);
    const espera = setTimeout(planejar, 600);
    return () => clearTimeout(espera);
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps

  async function rodar() {
    if (!plano || !plano.codigos.length) return;
    parar.current = false;
    setErro(''); setFase('rodando');
    const acc = VAZIO(plano.codigos.length);
    setResumo({ ...acc });
    const fila = [...plano.codigos];
    const adiadasPorPrazo: string[] = [];
    let segunda = false;
    try {
      for (;;) {
        if (!fila.length) {
          // As que ficaram para depois por demora têm UMA segunda chance: sem isso o laço nunca acabaria.
          if (!segunda && adiadasPorPrazo.length) { fila.push(...adiadasPorPrazo.splice(0)); segunda = true; }
          else break;
        }
        if (parar.current) { acc.parada = 'operador'; break; }
        const lote = fila.splice(0, TAMANHO_LOTE);
        const r = await enriquecerLote(lote);
        if (r.ok === false) { setErro(r.error); acc.parada = 'erro'; break; }
        let tetoDoDia = false;
        for (const x of r.resultados as ResultadoEscola[]) {
          if (x.adiada) {
            if (x.adiadaPor === 'teto_diario') { tetoDoDia = true; acc.adiadas++; }
            else if (!segunda) adiadasPorPrazo.push(x.codigo_inep);
            else acc.adiadas++;
            continue;
          }
          acc.feitas++;
          if (!x.ok) { acc.erros.push({ codigo_inep: x.codigo_inep, erro: x.erro || '' }); continue; }
          if (x.nivel) acc.niveis[x.nivel]++;
          if (x.hunter_status && HUNTER_FALTOU.has(x.hunter_status)) acc.hunterPendente++;
        }
        acc.buscas += r.buscas; acc.custoUsd += r.custoUsd; acc.creditosGastos += r.hunterCreditosGastos; acc.creditosHunter = r.creditosHunter;
        setResumo({ ...acc, erros: [...acc.erros] });
        if (tetoDoDia) { acc.parada = 'teto'; break; }
      }
    } catch (e: any) {
      // A chamada pode cair no meio (rede, tempo da função): o que já foi gravado fica, e o plano mostra o que falta.
      setErro(t('runError', { message: e?.message || '' }));
      acc.parada = 'erro';
    }
    acc.adiadas += fila.length + adiadasPorPrazo.length;
    setResumo({ ...acc, erros: [...acc.erros] });
    setFase('fim');
  }

  async function bloquear() {
    setBloqueando(true);
    try {
      const r = await suprimirContato(emailBloqueio, motivoBloqueio || undefined);
      if (r.ok === false) { toast.error(t('suppress.error', { message: r.error })); return; }
      toast.success(t('suppress.done', { count: r.escolas }));
      setEmailBloqueio(''); setMotivoBloqueio('');
    } catch (e: any) {
      toast.error(t('suppress.error', { message: e?.message || '' }));
    } finally {
      setBloqueando(false);
    }
  }

  const progresso = resumo && resumo.total ? Math.min(100, Math.round(((resumo.feitas + resumo.adiadas) / resumo.total) * 100)) : 0;
  const creditosCurtos = plano && plano.hunterConfigurado && plano.creditosHunter != null && plano.creditosHunter < plano.creditosHunterEstimados;
  const tetoCurto = plano && plano.buscasRestantesHoje < plano.buscasNovas;

  return (
    <div className="rounded-2xl mb-5 p-4 space-y-4" style={{ background: '#0b1d36', border: '1px solid rgba(34,211,238,.18)' }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{t('title')}</p>
          <p className="text-[11px] text-white/50 mt-1 max-w-3xl">{t('intro')}</p>
        </div>
        <button onClick={onFechar} aria-label={t('close')} className="text-white/40 hover:text-white"><X size={16} /></button>
      </div>

      {erro && <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{erro}</p>}

      {fase !== 'rodando' && carregando && (
        <p className="flex items-center gap-2 text-xs text-white/60"><Loader2 size={12} className="animate-spin" /> {t('planning')}</p>
      )}

      {plano && fase !== 'rodando' && fase !== 'fim' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Numero rotulo={t('ready')} valor={n(plano.prontas)} />
            <Numero rotulo={t('hunterOnly')} valor={n(plano.hunterPendente)} />
            <Numero rotulo={t('toEnrich')} valor={n(plano.aEnriquecer)} />
            <Numero rotulo={t('todayLeft')} valor={n(plano.buscasRestantesHoje)} />
          </div>
          <p className="text-[11px] text-white/45">{t('window', { count: n(plano.janela), total: n(plano.lidas) })}</p>

          {plano.codigos.length === 0 ? (
            <p className="text-xs text-emerald-300">{t('nothing')}</p>
          ) : (
            <div className="text-xs text-white/70 space-y-1">
              <p>{t('round', { count: n(plano.codigos.length), fresh: n(plano.buscasNovas), resume: n(plano.soHunter) })}</p>
              <p>{t('cost', { usd: usd(plano.custoBuscaUsd) })}</p>
              {/* Sem a chave do Hunter não há crédito a gastar: falar de crédito aqui contradiria o aviso logo abaixo. */}
              {plano.hunterConfigurado && (
                <p>
                  {plano.creditosHunter != null
                    ? t('credits', { credits: n(plano.creditosHunterEstimados), available: n(plano.creditosHunter) })
                    : t('creditsUnknown', { credits: n(plano.creditosHunterEstimados) })}
                </p>
              )}
              {plano.paraDepois > 0 && <p className="text-white/50">{t('later', { count: n(plano.paraDepois) })}</p>}
            </div>
          )}

          {!plano.hunterConfigurado && <Aviso>{t('noHunter')}</Aviso>}
          {creditosCurtos && <Aviso>{t('lowCredits', { available: n(plano.creditosHunter ?? 0), needed: n(plano.creditosHunterEstimados) })}</Aviso>}
          {plano.truncado && <Aviso>{t('truncated', { total: n(plano.totalNoBanco ?? plano.lidas) })}</Aviso>}
          {tetoCurto && <Aviso>{t('capToday', { count: n(plano.buscasRestantesHoje) })}</Aviso>}

          <div className="flex flex-wrap items-center gap-2">
            {fase === 'plano' && plano.codigos.length > 0 && (
              <button onClick={() => setFase('confirmar')} disabled={carregando}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-400/15 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-400/25 disabled:opacity-40">
                <Play size={12} /> {t('start', { count: n(plano.codigos.length) })}
              </button>
            )}
            {fase === 'confirmar' && (
              <div className="w-full rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 space-y-2">
                <p className="text-xs text-amber-100">
                  {plano.hunterConfigurado
                    ? t('confirmText', { fresh: n(plano.buscasNovas), usd: usd(plano.custoBuscaUsd), credits: n(plano.creditosHunterEstimados) })
                    : t('confirmTextNoHunter', { fresh: n(plano.buscasNovas), usd: usd(plano.custoBuscaUsd) })}
                </p>
                <div className="flex gap-2">
                  <button onClick={rodar}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-400/20 border border-amber-400/50 text-amber-100 hover:bg-amber-400/30">
                    {t('confirm', { usd: usd(plano.custoBuscaUsd) })}
                  </button>
                  <button onClick={() => setFase('plano')} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/10 text-white/60 hover:text-white">
                    {t('cancel')}
                  </button>
                </div>
              </div>
            )}
            <button onClick={planejar} disabled={carregando}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/10 text-white/60 hover:text-white disabled:opacity-40">
              {t('recalc')}
            </button>
          </div>
        </div>
      )}

      {(fase === 'rodando' || fase === 'fim') && resumo && (
        <div className="space-y-3">
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-cyan-400 transition-all" style={{ width: `${progresso}%` }} />
          </div>
          <p className="text-xs text-white/70">
            {t('progress', { done: n(resumo.feitas), total: n(resumo.total), fresh: n(resumo.buscas), usd: usd(resumo.custoUsd) })}
          </p>
          {fase === 'rodando' && (
            <button onClick={() => { parar.current = true; }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-400/40 text-red-200 hover:bg-red-400/10">
              <Square size={12} /> {t('stop')}
            </button>
          )}
          {fase === 'fim' && (
            <div className="text-xs text-white/75 space-y-1">
              <p className="font-semibold text-white">{t('result')}</p>
              <p>{t('levels', { a: n(resumo.niveis.A), b: n(resumo.niveis.B), c: n(resumo.niveis.C) })}</p>
              {resumo.hunterPendente > 0 && <p className="text-amber-200">{t('hunterPending', { count: n(resumo.hunterPendente) })}</p>}
              {resumo.creditosHunter != null && <p>{t('creditsNow', { credits: n(resumo.creditosHunter) })}</p>}
              {resumo.erros.length > 0 && (
                <p className="text-red-300">{t('errors', { count: n(resumo.erros.length), list: resumo.erros.slice(0, 5).map((x) => `${x.codigo_inep}: ${x.erro}`).join(' · ') })}</p>
              )}
              {resumo.adiadas > 0 && <p className="text-white/50">{t('deferred', { count: n(resumo.adiadas) })}</p>}
              {resumo.parada === 'operador' && <p className="text-white/50">{t('stoppedByOperator')}</p>}
              {resumo.parada === 'teto' && <p className="text-amber-200">{t('stoppedByCap')}</p>}
              <p className="text-white/50">{t('exportHint')}</p>
              <button onClick={() => { setFase('plano'); setResumo(null); planejar(); }}
                className="mt-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/10 text-white/60 hover:text-white">
                {t('newPlan')}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="border-t border-white/[0.06] pt-3 space-y-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-white/60"><ShieldOff size={12} /> {t('suppress.title')}</p>
        <p className="text-[10px] text-white/40 max-w-3xl">{t('suppress.hint')}</p>
        <div className="flex flex-wrap gap-2">
          <input value={emailBloqueio} onChange={(e) => setEmailBloqueio(e.target.value)} type="email" autoComplete="off"
            placeholder={t('suppress.email')} aria-label={t('suppress.email')}
            className="flex-1 min-w-[220px] px-3 py-1.5 rounded-lg text-xs text-white border border-white/10 outline-none focus:border-cyan-400/40" style={{ background: '#091D35' }} />
          <input value={motivoBloqueio} onChange={(e) => setMotivoBloqueio(e.target.value)} maxLength={200} autoComplete="off"
            placeholder={t('suppress.reason')} aria-label={t('suppress.reason')}
            className="flex-1 min-w-[180px] px-3 py-1.5 rounded-lg text-xs text-white border border-white/10 outline-none focus:border-cyan-400/40" style={{ background: '#091D35' }} />
          <button onClick={bloquear} disabled={bloqueando || !emailBloqueio.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/10 text-white/70 hover:text-white disabled:opacity-40">
            {bloqueando && <Loader2 size={12} className="animate-spin" />} {t('suppress.submit')}
          </button>
        </div>
      </div>

      <p className="text-[10px] text-white/35 max-w-3xl">{t('privacy')}</p>
    </div>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-lg border border-white/[0.07] px-3 py-2" style={{ background: '#091D35' }}>
      <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">{rotulo}</p>
      <p className="text-lg font-semibold text-white">{valor}</p>
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-amber-200 bg-amber-400/10 border border-amber-400/25 rounded-lg px-3 py-2">{children}</p>;
}
