'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, ArrowRight, Lock, Calendar, GitCompare, Sparkles,
  GraduationCap, Building2,
} from 'lucide-react';
import { BettHeader } from '../_components/bett-header';
import { BettSearch } from '../_components/bett-search';
import { BettLeadModal } from '../_components/bett-lead-modal';
import { StickyCTAMobile } from '../_components/sticky-cta';
import { track } from '../_lib/tracking';

type EscolaCmp = {
  codigo_inep: string;
  nome: string;
  municipio: string;
  uf: string;
  rede: string | null;
  inse_grupo: number | null;
  saeb_ano: number | null;
  saeb_lp: number | null;
  saeb_mat: number | null;
  pct_n01_lp: number | null;
  pct_n01_mat: number | null;
};

type MunicipioCmp = {
  ibge: string;
  nome: string;
  uf: string;
  total: number;
  ica_taxa: number | null;
  ica_ano: number | null;
  ica_rede: string | null;
};

export function CompararClient({
  escolasData, municipiosData, modo,
}: {
  escolasData: EscolaCmp[];
  municipiosData: MunicipioCmp[];
  modo: 'escolas' | 'municipios' | 'inicial';
}) {
  const router = useRouter();
  const [leadOpen, setLeadOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const viewSent = useRef(false);
  const glimpseSent = useRef(false);

  useEffect(() => {
    if (!viewSent.current) {
      track('bett_result_view');
      viewSent.current = true;
    }
  }, []);

  useEffect(() => {
    if ((modo === 'escolas' || modo === 'municipios') && !unlocked && !glimpseSent.current) {
      track('bett_glimpse_view');
      glimpseSent.current = true;
    }
  }, [modo, unlocked]);

  function abrirLead() {
    track('bett_unlock_click');
    setLeadOpen(true);
  }

  return (
    <main
      className="min-h-dvh"
      style={{
        background:
          'radial-gradient(1100px 600px at 88% -5%, rgba(52,197,204,.12), transparent 55%),' +
          'radial-gradient(900px 500px at -5% 30%, rgba(154,226,230,.07), transparent 60%),' +
          'linear-gradient(180deg,#06172C 0%,#091D35 50%,#0a1f3a 100%)',
      }}
    >
      <BettHeader onAgendar={abrirLead} />

      <div className="max-w-[1100px] mx-auto px-6 pt-6 pb-12">
        <button
          onClick={() => router.push('/')}
          className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white mb-4"
        >
          <ArrowLeft size={12} /> Voltar pra home
        </button>

        <header className="mb-8">
          <p className="text-[10px] tracking-[0.2em] uppercase font-mono text-cyan-300/80 mb-2">
            Comparativo entre escolas e redes
          </p>
          <h1
            className="text-white mb-4"
            style={{
              fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
              fontSize: 'clamp(28px, 4.5vw, 44px)',
              fontWeight: 600,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
            }}
          >
            Compare escolas ou redes lado a <em style={{ color: '#34c5cc', fontStyle: 'italic' }}>lado</em>
          </h1>
          <p className="text-white/65 text-sm leading-relaxed max-w-[640px]">
            Identifique padrões entre unidades e aprenda com escolas que performam melhor em
            contextos similares. A comparação aprofundada é parte do diagnóstico construído com
            a Vertho.
          </p>
        </header>

        {modo === 'inicial' && <ModoInicial onLead={abrirLead} />}

        {modo === 'escolas' && escolasData.length > 0 && (
          <CompararEscolas
            escolas={escolasData}
            unlocked={unlocked}
            onUnlock={abrirLead}
          />
        )}

        {modo === 'municipios' && municipiosData.length > 0 && (
          <CompararMunicipios
            municipios={municipiosData}
            unlocked={unlocked}
            onUnlock={abrirLead}
          />
        )}

        {/* CTA final sempre presente */}
        <section className="mt-8">
          <div
            className="rounded-2xl p-6 sm:p-8 border text-center"
            style={{
              background: 'linear-gradient(135deg, rgba(52,197,204,0.06), rgba(255,255,255,0.025))',
              borderColor: 'rgba(52,197,204,0.18)',
            }}
          >
            <h2
              className="text-white mb-3"
              style={{
                fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
                fontSize: 'clamp(22px, 3vw, 30px)',
                fontWeight: 600,
                lineHeight: 1.15,
              }}
            >
              Vamos conversar sobre <em style={{ color: '#34c5cc', fontStyle: 'italic' }}>sua rede?</em>
            </h2>
            <button
              onClick={() => {
                track('bett_schedule_click');
                setLeadOpen(true);
              }}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-bold transition-all"
              style={{ background: 'linear-gradient(135deg, #34c5cc, #2aa8ae)', color: '#06172C' }}
            >
              <Calendar size={13} /> Agendar conversa com a Vertho
            </button>
          </div>
        </section>
      </div>

      <BettLeadModal open={leadOpen} onClose={() => setLeadOpen(false)} onSuccess={() => setUnlocked(true)} />
      <StickyCTAMobile
        unlocked={!unlocked}
        onBuscar={() => router.push('/')}
        onLiberar={abrirLead}
      />
    </main>
  );
}

function ModoInicial({ onLead }: { onLead: () => void }) {
  const router = useRouter();
  return (
    <>
      <section className="mb-8 rounded-2xl p-6 sm:p-7 border"
        style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.08)' }}>
        <p className="text-[10px] tracking-[0.2em] uppercase font-mono text-cyan-300/80 mb-3">
          Busque o ponto de partida
        </p>
        <BettSearch
          onSelectResult={(r) => {
            if (r.tipo === 'escola') router.push(`/escola/${r.id}`);
            else router.push(`/municipio/${r.id}`);
          }}
        />
        <p className="text-[11px] text-white/45 mt-3 leading-relaxed">
          Comece pela escola ou município principal. A partir daí, a equipe Vertho desenha o
          recorte de comparação sob medida pra sua realidade.
        </p>
      </section>

      <section className="mb-8">
        <div className="rounded-2xl p-6 border"
          style={{
            background: 'linear-gradient(135deg, rgba(52,197,204,0.08), rgba(52,197,204,0.02))',
            borderColor: 'rgba(52,197,204,0.25)',
          }}>
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(52,197,204,0.15)' }}>
              <GitCompare size={18} style={{ color: '#34c5cc' }} />
            </div>
            <div>
              <p className="text-[10px] tracking-[0.2em] uppercase font-mono text-cyan-300/80">
                Recorte sob medida
              </p>
              <h2 className="text-white text-base font-bold mt-1">
                O comparativo aprofundado é construído com a Vertho
              </h2>
            </div>
          </div>
          <p className="text-white/75 text-[14px] leading-relaxed mb-4">
            Comparar escolas só faz sentido com <strong className="text-white/95">contexto</strong>.
            A Vertho cruza Saeb, Ideb, Censo, INSE e variabilidade da rede pra desenhar o
            recorte certo — escolas com perfil socioeconômico semelhante, mesma etapa, mesma
            cidade ou microrregião.
          </p>
          <ul className="space-y-2 text-[13px] text-white/70 mb-5">
            <li className="flex items-start gap-2">
              <span className="text-cyan-300 mt-0.5">→</span>
              <span>Mantenedor de rede privada: <strong className="text-white/85">unidades vs benchmark interno</strong></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-300 mt-0.5">→</span>
              <span>Diretor de escola: <strong className="text-white/85">pares INSE da mesma cidade</strong></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-300 mt-0.5">→</span>
              <span>Secretaria: <strong className="text-white/85">grupos de escolas por risco e oportunidade</strong></span>
            </li>
          </ul>
          <button
            onClick={onLead}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-bold transition-all"
            style={{ background: 'linear-gradient(135deg, #34c5cc, #2aa8ae)', color: '#06172C' }}
          >
            Solicitar comparativo personalizado <ArrowRight size={13} />
          </button>
        </div>
      </section>
    </>
  );
}

function CompararEscolas({
  escolas, unlocked, onUnlock,
}: {
  escolas: EscolaCmp[];
  unlocked: boolean;
  onUnlock: () => void;
}) {
  // Identifica "melhor" por menor pct_n01 médio (LP+MAT)
  const comScore = escolas.map((e) => {
    const pcts = [e.pct_n01_lp, e.pct_n01_mat].filter((x) => x != null) as number[];
    const score = pcts.length > 0 ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
    return { ...e, score };
  });
  const melhor = comScore.filter((e) => e.score != null).sort((a, b) => (a.score || 0) - (b.score || 0))[0];

  return (
    <>
      <section className="mb-6">
        <p className="text-[10px] tracking-[0.2em] uppercase font-mono text-cyan-300/80 mb-2">
          {escolas.length} escolas comparadas
        </p>
        <h2 className="text-white text-xl font-bold mb-1">
          Quadro comparativo · Saeb 9º ano EF
        </h2>
        <p className="text-white/55 text-[13px] leading-relaxed mb-4">
          Comparativo simplificado. A leitura completa cruza com pares INSE, evolução histórica,
          contexto socioeconômico e ações da rede.
        </p>
      </section>

      <section className="mb-6 -mx-6 sm:mx-0 px-6 sm:px-0 overflow-x-auto">
        <div className="rounded-2xl border overflow-hidden min-w-[640px]"
          style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.08)' }}>
          <table className="w-full text-sm">
            <thead className="text-[10px] tracking-[0.18em] uppercase font-mono text-white/40 border-b border-white/[0.06]">
              <tr className="text-left">
                <th className="px-4 py-3">Escola</th>
                <th className="px-3 py-3 text-right">INSE</th>
                <th className="px-3 py-3 text-right">Saeb LP</th>
                <th className="px-3 py-3 text-right">Saeb MAT</th>
                <th className="px-3 py-3 text-right">% N0–1</th>
              </tr>
            </thead>
            <tbody>
              {comScore.map((e, i) => {
                const eMelhor = melhor && e.codigo_inep === melhor.codigo_inep;
                return (
                  <tr key={e.codigo_inep} className={`border-b border-white/[0.04] last:border-b-0 ${eMelhor ? 'bg-cyan-400/[0.05]' : ''}`}>
                    <td className="px-4 py-3 text-white/90">
                      <div className="flex items-center gap-2">
                        <GraduationCap size={12} className="text-cyan-400/70 flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="text-[13px] font-bold text-white truncate flex items-center gap-2">
                            {e.nome}
                            {eMelhor && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-400/15 text-cyan-300 border border-cyan-400/30 uppercase tracking-wider">
                                Melhor
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-white/45">
                            {e.municipio}/{e.uf}{e.rede ? ` · ${String(e.rede).toLowerCase()}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right text-white/65 font-mono">
                      {e.inse_grupo ?? '—'}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-white">
                      {e.saeb_lp != null ? Math.round(e.saeb_lp) : '—'}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-white">
                      {e.saeb_mat != null ? Math.round(e.saeb_mat) : '—'}
                    </td>
                    <td className="px-3 py-3 text-right font-mono"
                      style={{ color: e.score != null && e.score < 30 ? '#86efac' : e.score != null && e.score > 50 ? '#fca5a5' : '#9ae2e6' }}>
                      {e.score != null ? `${e.score.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8">
        <div className="rounded-2xl p-5 border"
          style={{
            background: unlocked
              ? 'rgba(52,211,153,0.05)'
              : 'linear-gradient(135deg, rgba(52,197,204,0.06), rgba(255,255,255,0.025))',
            borderColor: unlocked ? 'rgba(52,211,153,0.25)' : 'rgba(52,197,204,0.25)',
          }}>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} style={{ color: unlocked ? '#34D399' : '#34c5cc' }} />
            <p className="text-[10px] tracking-[0.18em] uppercase font-mono"
              style={{ color: unlocked ? '#34D399' : '#34c5cc' }}>
              Leitura comparativa
            </p>
          </div>
          <p className="text-white/85 text-[14px] leading-relaxed"
            style={{
              filter: unlocked ? 'none' : 'blur(4px)',
              userSelect: unlocked ? 'auto' : 'none',
              transition: 'filter 0.4s ease',
            }}>
            {unlocked
              ? `Em breve a equipe Vertho enviará a leitura aprofundada por e-mail com hipóteses específicas pra cada escola, recorte INSE e plano de ação sugerido.`
              : `Há diferença relevante entre as escolas comparadas mesmo controlando por INSE — a leitura aprofundada explora se isso reflete prática pedagógica, gestão da unidade ou contexto local específico. As escolas com melhor performance podem servir de referência pra rede como um todo, enquanto...`}
          </p>
          {!unlocked && (
            <button
              onClick={onUnlock}
              className="mt-4 inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-bold transition-all"
              style={{ background: 'linear-gradient(135deg, #34c5cc, #2aa8ae)', color: '#06172C' }}
            >
              <Lock size={13} /> Liberar leitura comparativa
            </button>
          )}
        </div>
      </section>
    </>
  );
}

function CompararMunicipios({
  municipios, unlocked, onUnlock,
}: {
  municipios: MunicipioCmp[];
  unlocked: boolean;
  onUnlock: () => void;
}) {
  return (
    <>
      <section className="mb-6">
        <p className="text-[10px] tracking-[0.2em] uppercase font-mono text-cyan-300/80 mb-2">
          {municipios.length} municípios comparados
        </p>
        <h2 className="text-white text-xl font-bold mb-1">Quadro comparativo · ICA + escolas</h2>
        <p className="text-white/55 text-[13px] leading-relaxed mb-4">
          Comparativo simplificado das redes. A leitura completa traz Ideb agregado, FUNDEB, VAAR
          e variabilidade entre escolas.
        </p>
      </section>

      <section className="mb-6 -mx-6 sm:mx-0 px-6 sm:px-0 overflow-x-auto">
        <div className="rounded-2xl border overflow-hidden min-w-[640px]"
          style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.08)' }}>
          <table className="w-full text-sm">
            <thead className="text-[10px] tracking-[0.18em] uppercase font-mono text-white/40 border-b border-white/[0.06]">
              <tr className="text-left">
                <th className="px-4 py-3">Município</th>
                <th className="px-3 py-3 text-right">Escolas</th>
                <th className="px-3 py-3 text-right">ICA</th>
              </tr>
            </thead>
            <tbody>
              {municipios.map((m) => (
                <tr key={m.ibge} className="border-b border-white/[0.04] last:border-b-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Building2 size={12} className="text-cyan-400/70 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[13px] font-bold text-white truncate">{m.nome}</div>
                        <div className="text-[11px] text-white/45">
                          {m.uf} · IBGE {m.ibge}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-white">
                    {m.total.toLocaleString('pt-BR')}
                  </td>
                  <td className="px-3 py-3 text-right font-mono"
                    style={{ color: m.ica_taxa != null && m.ica_taxa >= 70 ? '#86efac' : m.ica_taxa != null && m.ica_taxa < 50 ? '#fca5a5' : '#9ae2e6' }}>
                    {m.ica_taxa != null ? `${m.ica_taxa.toFixed(1)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8">
        <div className="rounded-2xl p-5 border"
          style={{
            background: unlocked
              ? 'rgba(52,211,153,0.05)'
              : 'linear-gradient(135deg, rgba(52,197,204,0.06), rgba(255,255,255,0.025))',
            borderColor: unlocked ? 'rgba(52,211,153,0.25)' : 'rgba(52,197,204,0.25)',
          }}>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} style={{ color: unlocked ? '#34D399' : '#34c5cc' }} />
            <p className="text-[10px] tracking-[0.18em] uppercase font-mono"
              style={{ color: unlocked ? '#34D399' : '#34c5cc' }}>
              Leitura comparativa
            </p>
          </div>
          <p className="text-white/85 text-[14px] leading-relaxed"
            style={{
              filter: unlocked ? 'none' : 'blur(4px)',
              userSelect: unlocked ? 'auto' : 'none',
              transition: 'filter 0.4s ease',
            }}>
            {unlocked
              ? `A equipe Vertho enviará leitura aprofundada por e-mail com Ideb, FUNDEB, VAAR e plano de priorização entre os municípios.`
              : `Diferenças entre os municípios comparados sugerem oportunidades distintas de atuação. A leitura completa identifica quais redes têm melhor relação aprendizagem×recursos, onde há gargalos de gestão e como organizar prioridades...`}
          </p>
          {!unlocked && (
            <button
              onClick={onUnlock}
              className="mt-4 inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-bold transition-all"
              style={{ background: 'linear-gradient(135deg, #34c5cc, #2aa8ae)', color: '#06172C' }}
            >
              <Lock size={13} /> Liberar leitura comparativa
            </button>
          )}
        </div>
      </section>
    </>
  );
}
