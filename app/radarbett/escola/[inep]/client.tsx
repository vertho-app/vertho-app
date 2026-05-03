'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Lock, Sparkles, MapPin, GraduationCap, ArrowRight,
  TrendingUp, Layers, Target, Calendar, MessageCircle,
} from 'lucide-react';
import { BettHeader } from '../../_components/bett-header';
import { BettLeadModal } from '../../_components/bett-lead-modal';
import { StickyCTAMobile } from '../../_components/sticky-cta';
import { WhatsappIcon } from '../../_components/whatsapp-icon';
import { track } from '../../_lib/tracking';
import { openWhatsAppAgendar } from '../../_lib/whatsapp';
import { PanoramaEscola } from './_panorama';

type Sinal = {
  tipo: 'aprendizagem' | 'contexto' | 'oportunidade';
  titulo: string;
  preview: string;
};

const TIPO_CFG = {
  aprendizagem: { icon: TrendingUp, color: '#34c5cc', label: 'Sinal de aprendizagem' },
  contexto:     { icon: Layers,     color: '#9ae2e6', label: 'Sinal de contexto' },
  oportunidade: { icon: Sparkles,   color: '#34D399', label: 'Oportunidade Vertho' },
};

export function EscolaResultadoClient({
  escola, sinais, leituraResumo, narrativaModelo, temIdeb, temCenso, temEnem, temSaresp, ufEscola, saebSnapshots, initialUnlocked = false, panorama,
}: {
  escola: any;
  sinais: Sinal[];
  leituraResumo: string;
  narrativaModelo?: string;
  temIdeb: boolean;
  temCenso: boolean;
  temEnem: boolean;
  temSaresp: boolean;
  ufEscola: string;
  saebSnapshots: number;
  initialUnlocked?: boolean;
  panorama?: {
    saeb: any[];
    ideb: any[];
    enem: any[];
    censo: any;
    benchmarks: any[];
    quadrante: string | null;
  };
}) {
  const router = useRouter();
  const [unlocked, setUnlocked] = useState(initialUnlocked);
  const [leadOpen, setLeadOpen] = useState(false);
  const viewSent = useRef(false);
  const glimpseSent = useRef(false);

  useEffect(() => {
    if (!viewSent.current) {
      track('bett_result_view', { tipo: 'escola', id: escola.codigo_inep });
      viewSent.current = true;
    }
  }, [escola.codigo_inep]);

  useEffect(() => {
    // glimpse_view dispara quando a tela com cards bloqueados aparece
    if (!unlocked && !glimpseSent.current) {
      track('bett_glimpse_view', { tipo: 'escola', id: escola.codigo_inep });
      glimpseSent.current = true;
    }
  }, [unlocked, escola.codigo_inep]);

  function abrirLead() {
    track('bett_unlock_click', { tipo: 'escola', id: escola.codigo_inep });
    // Modo teste pré-Bett: libera o conteúdo imediatamente, sem esperar
    // o lead ser preenchido. O modal de cadastro continua abrindo em paralelo
    // pra capturar o contato. Reverter quando voltar ao gating estrito.
    setUnlocked(true);
    setLeadOpen(true);
  }

  function handleLeadSuccess() {
    setUnlocked(true);
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
      <BettHeader />

      <div className="max-w-[1100px] mx-auto px-6 pt-6 pb-12">
        {/* Voltar */}
        <button
          onClick={() => router.push('/')}
          className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white mb-4"
        >
          <ArrowLeft size={12} /> Buscar outra escola
        </button>

        {/* Hero da escola */}
        <header
          className="relative overflow-hidden mb-8 rounded-3xl p-6 sm:p-10"
          style={{
            background: 'linear-gradient(135deg, rgba(8,26,55,0.6) 0%, rgba(15,43,84,0.4) 100%)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div aria-hidden className="pointer-events-none absolute"
            style={{ right: -120, top: -100, width: 420, height: 420, border: '50px solid rgba(52,197,204,0.05)', borderRadius: '50%' }} />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3 eyebrow-manrope" style={{ color: '#9ae2e6' }}>
              <GraduationCap size={12} />
              <span>Leitura inicial · Radar Vertho</span>
            </div>
            <h1
              className="text-white mb-3"
              style={{
                fontFamily: 'var(--font-fraunces), "Fraunces", Georgia, serif',
                fontWeight: 600,
                fontSize: 'clamp(28px, 4.5vw, 48px)',
                lineHeight: 1.08,
                letterSpacing: '-0.02em',
              }}
            >
              {escola.nome}
            </h1>
            <div className="flex flex-wrap gap-2 text-[12px] text-white/65">
              <span className="inline-flex items-center gap-1"><MapPin size={11} /> {escola.municipio}/{escola.uf}</span>
              {escola.rede && <span className="text-white/40">·</span>}
              {escola.rede && <span>Rede {String(escola.rede).toLowerCase()}</span>}
              {escola.zona && <span className="text-white/40">·</span>}
              {escola.zona && <span>Zona {String(escola.zona).toLowerCase()}</span>}
              {escola.inse_grupo != null && (
                <>
                  <span className="text-white/40">·</span>
                  <span title="Indicador de Nível Socioeconômico (INEP) — escala 1=mais alto a 6=mais baixo">
                    INSE Grupo {escola.inse_grupo}
                  </span>
                </>
              )}
              <span className="text-white/40">·</span>
              <span className="font-mono">INEP {escola.codigo_inep}</span>
            </div>
          </div>
        </header>

        {/* Highlight: contagem de sinais e oportunidades */}
        {(() => {
          const numSinais = sinais.filter(s => s.tipo !== 'oportunidade').length;
          const numOport = sinais.filter(s => s.tipo === 'oportunidade').length;
          if (numSinais === 0 && numOport === 0) return null;
          return (
            <section className="mb-6">
              <div className="rounded-2xl px-5 sm:px-6 py-4 border flex items-center gap-3 flex-wrap"
                style={{
                  background: 'linear-gradient(135deg, rgba(52,197,204,0.10), rgba(52,197,204,0.02))',
                  borderColor: 'rgba(52,197,204,0.28)',
                }}>
                <Sparkles size={18} style={{ color: '#34c5cc' }} className="flex-shrink-0" />
                <p className="text-white/90 leading-relaxed flex-1" style={{
                  fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif',
                  fontSize: 16,
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                }}>
                  Identificamos <span style={{ color: '#34c5cc' }}>{numSinais} {numSinais === 1 ? 'sinal relevante' : 'sinais relevantes'}</span>
                  {numOport > 0 && <> e <span style={{ color: '#34D399' }}>{numOport} {numOport === 1 ? 'oportunidade de atuação' : 'oportunidades de atuação'}</span></>}
                  {' '}para <strong className="text-white">{escola.nome}</strong>.
                </p>
              </div>
            </section>
          );
        })()}

        {/* Resumo executivo da leitura */}
        <section className="mb-8">
          <div
            className="rounded-2xl p-5 sm:p-6 border"
            style={{
              background: 'rgba(255,255,255,0.025)',
              borderColor: 'rgba(255,255,255,0.08)',
            }}
          >
            <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
              <p className="eyebrow-manrope text-cyan-300/85">Leitura institucional</p>
              {narrativaModelo && narrativaModelo !== 'fallback' && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] tracking-[0.12em] uppercase font-bold text-white/45"
                  title={`Análise gerada por ${narrativaModelo}`}
                >
                  <Sparkles size={10} /> Análise por IA
                </span>
              )}
            </div>
            <p className="text-white/85 leading-relaxed" style={{ fontSize: 14 }}>{leituraResumo}</p>
            <p className="text-[11px] text-white/45 mt-3 italic leading-relaxed">
              Esta é uma leitura inicial baseada em dados públicos. Para transformar essa leitura em
              plano de ação, a Vertho aprofunda o diagnóstico com dados da rede, assessment de
              competências e desenho da jornada de desenvolvimento.
            </p>
          </div>
        </section>

        {/* Panorama da escola — KPIs, comparativos, trajetória, quadrante Infra×Saeb */}
        {panorama && (
          <PanoramaEscola
            saeb={panorama.saeb}
            ideb={panorama.ideb}
            enem={panorama.enem}
            censo={panorama.censo}
            benchmarks={panorama.benchmarks}
            quadrante={panorama.quadrante as any}
          />
        )}

        {/* Sinais identificados */}
        <section className="mb-8">
          <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
            <div>
              <p className="eyebrow-manrope text-cyan-300/85">O que o Radar identificou</p>
              <h2 className="text-white mt-1" style={{
                fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif',
                fontSize: 22,
                fontWeight: 700,
                lineHeight: 1.2,
                letterSpacing: '-0.02em',
              }}>
                {sinais.filter(s => s.tipo !== 'oportunidade').length} sinais e{' '}
                {sinais.filter(s => s.tipo === 'oportunidade').length} oportunidade
                {sinais.filter(s => s.tipo === 'oportunidade').length === 1 ? '' : 's'} de atuação
              </h2>
            </div>
            {!unlocked && (
              <button
                onClick={abrirLead}
                className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-bold transition-all"
                style={{
                  background: 'linear-gradient(135deg, #34c5cc, #2aa8ae)',
                  color: '#06172C',
                }}
              >
                <Lock size={12} /> Liberar leitura completa
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sinais.map((s, i) => (
              <SinalCard key={i} sinal={s} unlocked={unlocked} onUnlock={abrirLead} />
            ))}
          </div>

          {!unlocked && (
            <div className="mt-6 rounded-2xl p-5 border text-center"
              style={{
                background: 'linear-gradient(135deg, rgba(52,197,204,0.08), rgba(52,197,204,0.02))',
                borderColor: 'rgba(52,197,204,0.25)',
              }}>
              <Lock size={18} className="text-cyan-300 mx-auto mb-2" />
              <p className="text-white/85 text-sm leading-relaxed mb-3">
                A leitura completa inclui análise por competência, comparativo com escolas
                socioeconomicamente similares e indicação das frentes de atuação Vertho.
              </p>
              <button
                onClick={abrirLead}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-bold transition-all"
                style={{
                  background: 'linear-gradient(135deg, #34c5cc, #2aa8ae)',
                  color: '#06172C',
                }}
              >
                Liberar leitura completa <ArrowRight size={13} />
              </button>
            </div>
          )}
        </section>

        {/* Comparação contextual simples (texto, sem dashboard) */}
        <section className="mb-8">
          <div
            className="rounded-2xl p-5 sm:p-6 border"
            style={{
              background: 'rgba(255,255,255,0.025)',
              borderColor: 'rgba(255,255,255,0.08)',
            }}
          >
            <p className="eyebrow-manrope text-cyan-300/85 mb-2">Base da leitura</p>
            <h2 className="text-white mb-3" style={{
              fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif',
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: '-0.01em',
            }}>
              Dados públicos que entram na análise
            </h2>
            <ul className="space-y-2 text-[13px] text-white/75">
              <li className="flex items-center gap-2">
                <Dot ativo={saebSnapshots > 0} />
                <span>Saeb · {saebSnapshots > 0 ? `${saebSnapshots} registros históricos disponíveis` : 'sem dados Saeb publicados'}</span>
              </li>
              <li className="flex items-center gap-2">
                <Dot ativo={temIdeb} />
                <span>Ideb · {temIdeb ? 'meta vs realizado disponível' : 'sem Ideb publicado'}</span>
              </li>
              <li className="flex items-center gap-2">
                <Dot ativo={temEnem} />
                <span>ENEM por escola · {temEnem ? 'média geral e por área disponível' : 'sem dados de ENEM publicados'}</span>
              </li>
              {ufEscola === 'SP' && (
                <li className="flex items-center gap-2">
                  <Dot ativo={temSaresp} />
                  <span>SARESP (SP) · {temSaresp ? 'séries e disciplinas disponíveis' : 'sem dados de SARESP publicados'}</span>
                </li>
              )}
              <li className="flex items-center gap-2">
                <Dot ativo={temCenso} />
                <span>Censo Escolar · {temCenso ? 'infraestrutura, recursos e contexto' : 'sem dados de Censo'}</span>
              </li>
            </ul>
          </div>
        </section>

        {/* Próximos passos / CTAs */}
        <section className="mb-8">
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
                fontFamily: 'var(--font-fraunces), "Fraunces", Georgia, serif',
                fontSize: 'clamp(22px, 3vw, 30px)',
                fontWeight: 600,
                lineHeight: 1.15,
              }}
            >
              Quer transformar essa leitura em <em style={{ color: '#34c5cc', fontStyle: 'italic' }}>plano de ação?</em>
            </h2>
            <p className="text-white/65 text-sm leading-relaxed mb-5 max-w-[560px] mx-auto">
              A Vertho aprofunda o diagnóstico, desenvolve a equipe pedagógica e produz evidências
              de evolução nas semanas seguintes.
            </p>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {!unlocked && (
                <button
                  onClick={abrirLead}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-bold transition-all"
                  style={{
                    background: 'linear-gradient(135deg, #34c5cc, #2aa8ae)',
                    color: '#06172C',
                  }}
                >
                  Liberar leitura completa <ArrowRight size={13} />
                </button>
              )}
              <button
                onClick={() => {
                  track('bett_schedule_click', { tipo: 'escola', id: escola.codigo_inep });
                  openWhatsAppAgendar({ tipo: 'escola', scope: escola.nome });
                }}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-bold transition-all"
                style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)', color: '#06172C' }}
              >
                <WhatsappIcon size={14} /> Agendar conversa
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Modal lead — pré-preenche escola */}
      <BettLeadModal
        open={leadOpen}
        onClose={() => setLeadOpen(false)}
        pre={{
          scopeType: 'escola',
          scopeId: escola.codigo_inep,
          scopeLabel: escola.nome,
        }}
        onSuccess={handleLeadSuccess}
      />

      {/* Sticky CTA mobile */}
      <StickyCTAMobile
        unlocked={!unlocked}
        onBuscar={() => router.push('/')}
        onLiberar={abrirLead}
      />
    </main>
  );
}

function SinalCard({
  sinal, unlocked, onUnlock,
}: {
  sinal: Sinal;
  unlocked: boolean;
  onUnlock: () => void;
}) {
  const cfg = TIPO_CFG[sinal.tipo];
  const Icon = cfg.icon;
  return (
    <div
      className="relative rounded-2xl p-5 border overflow-hidden"
      style={{
        background: sinal.tipo === 'oportunidade'
          ? 'linear-gradient(135deg, rgba(52,211,153,0.08), rgba(52,211,153,0.02))'
          : 'rgba(255,255,255,0.025)',
        borderColor: sinal.tipo === 'oportunidade'
          ? 'rgba(52,211,153,0.25)'
          : 'rgba(255,255,255,0.08)',
      }}
    >
      <div className="flex items-center gap-2 mb-2.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `${cfg.color}1F` }}>
          <Icon size={14} style={{ color: cfg.color }} />
        </div>
        <p className="eyebrow-manrope" style={{ color: cfg.color }}>
          {cfg.label}
        </p>
      </div>
      <h3 className="text-white text-[15px] font-bold mb-2 leading-snug">{sinal.titulo}</h3>
      <p
        className="text-white/65 text-[13px] leading-relaxed"
        style={{
          filter: unlocked ? 'none' : 'blur(4px)',
          userSelect: unlocked ? 'auto' : 'none',
          transition: 'filter 0.4s ease',
        }}
      >
        {unlocked
          ? sinal.preview
          : `${sinal.preview} ${sinal.preview.split('').reverse().join('').slice(0, 80)}`}
      </p>
      {!unlocked && (
        <button
          onClick={onUnlock}
          className="absolute inset-0 flex items-end justify-center pb-4 opacity-0 hover:opacity-100 transition-opacity bg-gradient-to-t from-[#091D35]/85 to-transparent"
        >
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-cyan-300">
            <Lock size={11} /> Liberar
          </span>
        </button>
      )}
    </div>
  );
}

function Dot({ ativo }: { ativo: boolean }) {
  return (
    <span
      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
      style={{ background: ativo ? '#34D399' : 'rgba(255,255,255,0.18)' }}
    />
  );
}
