'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Lock, Calendar, GitCompare } from 'lucide-react';
import { BettHeader } from '../_components/bett-header';
import { BettSearch } from '../_components/bett-search';
import { BettLeadModal } from '../_components/bett-lead-modal';
import { StickyCTAMobile } from '../_components/sticky-cta';
import { track } from '../_lib/tracking';

/**
 * Versão comercial do comparar — V1 simples:
 * - Pede pro usuário buscar 1 escola/município
 * - Mostra que comparativo profundo está no produto Vertho (CTA pra lead)
 *
 * V2 (pós-Bett): aceitar query string ?escolas=A,B,C,D pré-populado
 * e mostrar comparativo lado-a-lado parcial com CTA pra leitura completa.
 */
export default function CompararPage() {
  const router = useRouter();
  const [leadOpen, setLeadOpen] = useState(false);
  const viewSent = useRef(false);

  useEffect(() => {
    if (!viewSent.current) {
      track('bett_result_view');
      viewSent.current = true;
    }
  }, []);

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
      <BettHeader onAgendar={() => setLeadOpen(true)} />

      <div className="max-w-[900px] mx-auto px-6 pt-6 pb-12">
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

        <section className="mb-8 rounded-2xl p-6 sm:p-7 border"
          style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.08)' }}>
          <p className="text-[10px] tracking-[0.2em] uppercase font-mono text-cyan-300/80 mb-3">
            1. Busque o ponto de partida
          </p>
          <BettSearch
            onSelectResult={(r) => {
              if (r.tipo === 'escola') router.push(`/escola/${r.id}`);
              else router.push(`/municipio/${r.id}`);
            }}
          />
          <p className="text-[11px] text-white/45 mt-3 leading-relaxed">
            Comece pela escola ou município principal. A partir daí, a equipe Vertho desenha o
            recorte de comparação que faz sentido pra sua realidade.
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
                  Recorte feito sob medida
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
              onClick={() => setLeadOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-bold transition-all"
              style={{
                background: 'linear-gradient(135deg, #34c5cc, #2aa8ae)',
                color: '#06172C',
              }}
            >
              Solicitar comparativo personalizado <ArrowRight size={13} />
            </button>
          </div>
        </section>

        <section className="mb-8 rounded-2xl p-6 border text-center"
          style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.08)' }}>
          <h2 className="text-white text-base font-bold mb-2">
            Quer ver um exemplo?
          </h2>
          <p className="text-white/65 text-[13px] leading-relaxed mb-4 max-w-[520px] mx-auto">
            Veja a leitura inicial de uma escola pública estadual em Campinas/SP.
          </p>
          <button
            onClick={() => {
              track('bett_example_click');
              router.push('/escola/35915592');
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[12px] font-bold border border-cyan-400/30 text-cyan-300 hover:bg-cyan-400/10 transition-colors"
          >
            Ver exemplo de leitura <ArrowRight size={11} />
          </button>
        </section>

        <section>
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

      <BettLeadModal open={leadOpen} onClose={() => setLeadOpen(false)} />
      <StickyCTAMobile
        onBuscar={() => router.push('/')}
        onLiberar={() => setLeadOpen(true)}
      />
    </main>
  );
}
