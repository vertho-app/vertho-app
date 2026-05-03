'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Lock, Sparkles, Building2, ArrowRight,
  TrendingUp, Layers, Calendar,
} from 'lucide-react';
import { BettHeader } from '../../_components/bett-header';
import { BettLeadModal } from '../../_components/bett-lead-modal';
import { StickyCTAMobile } from '../../_components/sticky-cta';
import { WhatsappIcon } from '../../_components/whatsapp-icon';
import { track } from '../../_lib/tracking';
import { openWhatsAppAgendar } from '../../_lib/whatsapp';
import { PanoramaMunicipio } from './_panorama';
import { AtuacaoVerthoMunicipio } from './_atuacao-vertho';

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

type IcaStat = {
  ano: number;
  taxa: number;
  totalEstado: number | null;
  totalBrasil: number | null;
};

export function MunicipioResultadoClient({
  municipio, sinais, leituraResumo, narrativaModelo, icaStat, temIca, temIdeb, temFundeb, initialUnlocked = false, panorama,
}: {
  municipio: { ibge: string; nome: string; uf: string; totalEscolas: number; redes: Record<string, number> };
  sinais: Sinal[];
  leituraResumo: string;
  narrativaModelo?: string;
  icaStat: IcaStat | null;
  temIca: boolean;
  temIdeb: boolean;
  temFundeb: boolean;
  initialUnlocked?: boolean;
  panorama?: {
    ica: any[];
    ideb: any[];
    enem: any[];
    fundeb: any[];
    vaar: any | null;
    receitaPrevista: any | null;
    totalEscolas: number;
    redes: Record<string, number>;
    benchmarks?: any[];
  };
}) {
  const router = useRouter();
  const [unlocked, setUnlocked] = useState(initialUnlocked);
  const [leadOpen, setLeadOpen] = useState(false);
  const viewSent = useRef(false);
  const glimpseSent = useRef(false);

  useEffect(() => {
    if (!viewSent.current) {
      track('bett_result_view', { tipo: 'municipio', id: municipio.ibge });
      viewSent.current = true;
    }
  }, [municipio.ibge]);

  useEffect(() => {
    if (!unlocked && !glimpseSent.current) {
      track('bett_glimpse_view', { tipo: 'municipio', id: municipio.ibge });
      glimpseSent.current = true;
    }
  }, [unlocked, municipio.ibge]);

  function abrirLead() {
    track('bett_unlock_click', { tipo: 'municipio', id: municipio.ibge });
    // Modo teste pré-Bett: libera o conteúdo imediatamente, sem esperar
    // o lead ser preenchido. O modal continua abrindo em paralelo pra
    // capturar o contato. Reverter quando voltar ao gating estrito.
    setUnlocked(true);
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
      <BettHeader />

      <div className="max-w-[1100px] mx-auto px-6 pt-6 pb-12">
        <button
          onClick={() => router.push('/')}
          className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white mb-4"
        >
          <ArrowLeft size={12} /> Buscar outro município
        </button>

        {/* Hero do município */}
        <header
          className="relative overflow-hidden mb-6 rounded-3xl p-6 sm:p-10"
          style={{
            background: 'linear-gradient(135deg, rgba(8,26,55,0.6) 0%, rgba(15,43,84,0.4) 100%)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div aria-hidden className="pointer-events-none absolute"
            style={{ right: -120, top: -100, width: 420, height: 420, border: '50px solid rgba(52,197,204,0.05)', borderRadius: '50%' }} />
          <div className="relative">
            <div className="flex items-center gap-2 mb-4 eyebrow-manrope" style={{ color: '#9ae2e6' }}>
              <Building2 size={12} />
              <span>Leitura inicial · Rede municipal</span>
            </div>
            <h1
              className="text-white mb-5"
              style={{
                fontFamily: 'var(--font-fraunces), "Fraunces", Georgia, serif',
                fontWeight: 600,
                fontSize: 'clamp(36px, 5.5vw, 64px)',
                lineHeight: 1.0,
                letterSpacing: '-0.03em',
              }}
            >
              {municipio.nome}, <em style={{ color: '#34c5cc', fontStyle: 'italic' }}>{municipio.uf}</em>
            </h1>
            <div className="flex flex-wrap gap-2 mb-5">
              <Pill accent>{municipio.totalEscolas.toLocaleString('pt-BR')} escolas no Radar</Pill>
              {Object.entries(municipio.redes || {}).slice(0, 3).map(([rede, n]) => (
                <Pill key={rede}>{(n as number).toLocaleString('pt-BR')} {String(rede).toLowerCase()}</Pill>
              ))}
            </div>
            {(() => {
              const numSinais = sinais.filter(s => s.tipo !== 'oportunidade').length;
              const numOport = sinais.filter(s => s.tipo === 'oportunidade').length;
              if (numSinais === 0 && numOport === 0) return null;
              return (
                <p className="text-white/70 leading-relaxed" style={{ fontSize: 17, maxWidth: 720 }}>
                  Identificamos <strong className="text-white" style={{ fontWeight: 600 }}>
                    {numSinais} {numSinais === 1 ? 'sinal relevante' : 'sinais relevantes'}
                  </strong>
                  {numOport > 0 && <> e <strong className="text-white" style={{ fontWeight: 600 }}>
                    {numOport} {numOport === 1 ? 'oportunidade de atuação' : 'oportunidades de atuação'}
                  </strong></>}
                  {' '}para a rede de {municipio.nome}/{municipio.uf}.
                </p>
              );
            })()}
          </div>
        </header>

        {/* Stats grid removido — KPIs ficam consolidados no Panorama abaixo */}

        {/* Leitura institucional — card com avatar Vertho */}
        <section className="mb-8">
          <div
            className="relative rounded-2xl p-7 sm:p-9 border overflow-hidden"
            style={{
              background: 'rgba(255,255,255,0.025)',
              borderColor: 'rgba(255,255,255,0.10)',
            }}
          >
            <span aria-hidden className="absolute left-0 top-0 bottom-0 w-1"
              style={{ background: 'linear-gradient(180deg, #34c5cc 0%, #9e4edd 100%)' }} />
            <div className="flex items-center gap-3 mb-5">
              <div
                className="rounded-xl flex items-center justify-center flex-shrink-0 px-3 h-11"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <img src="/logo-vertho.png" alt="Vertho Mentor IA" style={{ height: 20, display: 'block' }} />
              </div>
              <div className="flex-1">
                <p className="text-white text-[14px] font-bold leading-tight">Vertho Mentor IA</p>
                <p className="text-white/55 text-[12px] mt-0.5">Leitura institucional · Dados públicos INEP {icaStat?.ano || ''}</p>
              </div>
              {narrativaModelo && narrativaModelo !== 'fallback' && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] tracking-[0.12em] uppercase font-bold text-white/45 flex-shrink-0"
                  title={`Análise gerada por ${narrativaModelo}`}
                >
                  <Sparkles size={10} /> Análise por IA
                </span>
              )}
            </div>
            <p className="leading-relaxed" style={{
              fontFamily: 'var(--font-fraunces), "Fraunces", Georgia, serif',
              fontSize: 18,
              color: 'rgba(255,255,255,0.92)',
            }}>
              {leituraResumo}
            </p>
            <p className="text-[12px] text-white/45 mt-5 pt-5 border-t italic leading-relaxed"
              style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              Esta é uma leitura inicial baseada em dados públicos. Para transformar essa leitura em
              plano de ação, a Vertho aprofunda o diagnóstico com dados da rede, assessment de
              competências e desenho da jornada de desenvolvimento.
            </p>
          </div>
        </section>

        {/* Panorama da rede — KPIs, comparativo vizinhos, trajetória, VAAR */}
        {panorama && (
          <PanoramaMunicipio
            ica={panorama.ica}
            ideb={panorama.ideb}
            enem={panorama.enem}
            fundeb={panorama.fundeb}
            vaar={panorama.vaar}
            receitaPrevista={panorama.receitaPrevista}
            totalEscolas={panorama.totalEscolas}
            redes={panorama.redes}
            benchmarks={panorama.benchmarks}
          />
        )}

        {/* Sinais */}
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
                style={{ background: 'linear-gradient(135deg, #34c5cc, #2aa8ae)', color: '#06172C' }}
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
                A leitura completa cruza Saeb, Ideb, ICA, ENEM, FUNDEB/VAAR, PDDE e variabilidade
                da rede pra sugerir frentes de atuação prioritárias.
              </p>
              <button
                onClick={abrirLead}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-bold transition-all"
                style={{ background: 'linear-gradient(135deg, #34c5cc, #2aa8ae)', color: '#06172C' }}
              >
                Liberar leitura completa <ArrowRight size={13} />
              </button>
            </div>
          )}
        </section>

        {/* Onde a Vertho atua — frentes derivadas dos dados da rede municipal */}
        {panorama && (
          <AtuacaoVerthoMunicipio
            ica={panorama.ica}
            ideb={panorama.ideb}
            enem={panorama.enem}
            vaar={panorama.vaar}
            redes={panorama.redes}
            nome={municipio.nome}
          />
        )}

        {/* Base de dados */}
        <section className="mb-8">
          <div className="mb-6">
            <p className="eyebrow-manrope text-cyan-300/85 mb-2">Base da leitura</p>
            <h2 className="text-white mb-1" style={{
              fontFamily: 'var(--font-fraunces), "Fraunces", Georgia, serif',
              fontSize: 'clamp(22px, 2.6vw, 28px)',
              fontWeight: 600,
              letterSpacing: '-0.02em',
            }}>
              Dados públicos que entram <em style={{ color: '#34c5cc', fontStyle: 'italic' }}>na análise</em>
            </h2>
            <p className="text-white/55" style={{ fontSize: 14 }}>
              Fontes oficiais do INEP e MEC. Cada número cita ano e origem.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <DadoCard nome="ICA" desc="Alfabetização do 2º ano EF" status={temIca ? 'ok' : 'off'} />
            <DadoCard nome="Ideb" desc="Ideb agregado da rede" status={temIdeb ? 'ok' : 'off'} />
            <DadoCard nome="FUNDEB / VAAR" desc="Recursos e prontidão" status={temFundeb ? 'ok' : 'off'} />
            <DadoCard nome="Saeb + Censo" desc="Proficiência e infraestrutura por escola" status="partial" />
          </div>
        </section>

        {/* CTA Final */}
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
              Pronto pra evoluir a gestão da sua <em style={{ color: '#34c5cc', fontStyle: 'italic' }}>rede?</em>
            </h2>
            <p className="text-white/65 text-sm leading-relaxed mb-5 max-w-[560px] mx-auto">
              A Vertho ajuda secretarias e mantenedores a priorizar escolas, desenvolver
              lideranças pedagógicas e organizar evidências.
            </p>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {!unlocked && (
                <button
                  onClick={abrirLead}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-bold transition-all"
                  style={{ background: 'linear-gradient(135deg, #34c5cc, #2aa8ae)', color: '#06172C' }}
                >
                  Liberar leitura completa <ArrowRight size={13} />
                </button>
              )}
              <button
                onClick={() => {
                  track('bett_schedule_click', { tipo: 'municipio', id: municipio.ibge });
                  openWhatsAppAgendar({ tipo: 'municipio', scope: `${municipio.nome}/${municipio.uf}` });
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

      <BettLeadModal
        open={leadOpen}
        onClose={() => setLeadOpen(false)}
        pre={{
          scopeType: 'municipio',
          scopeId: municipio.ibge,
          scopeLabel: `${municipio.nome}/${municipio.uf}`,
        }}
        onSuccess={() => setUnlocked(true)}
      />

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

function Pill({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-medium border"
      style={accent
        ? { background: 'rgba(52,197,204,0.15)', borderColor: 'rgba(52,197,204,0.35)', color: '#9ae2e6' }
        : { background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.70)' }
      }
    >
      {children}
    </span>
  );
}

function StatCard({
  label, value, compare, compareSecondary, compareText, unidade,
}: {
  label: string; value: string;
  compare?: { delta: number; ref: string } | null;
  compareSecondary?: { delta: number; ref: string } | null;
  compareText?: string;
  unidade?: 'pp' | 'pts';
}) {
  const u = unidade === 'pts' ? ' pts' : ' p.p.';
  return (
    <div className="rounded-2xl p-7 border text-center"
      style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.10)' }}>
      <p className="text-[11px] uppercase tracking-[0.10em] font-bold text-white/55 mb-2.5">{label}</p>
      <p className="leading-none mb-1.5" style={{
        fontFamily: 'var(--font-fraunces), "Fraunces", Georgia, serif',
        fontSize: 'clamp(36px, 4vw, 44px)',
        fontWeight: 600,
        color: '#34c5cc',
      }}>
        {value}
      </p>
      {compare ? (
        <>
          <p className="text-[13px] text-white/55">
            <span className="font-bold" style={{ color: compare.delta >= 0 ? '#86efac' : '#fca5a5' }}>
              {compare.delta >= 0 ? '+' : ''}{compare.delta.toFixed(unidade === 'pts' ? 0 : 1)}{u}
            </span>{' '}
            {compare.ref}
          </p>
          {compareSecondary && (
            <p className="text-[12px] text-white/45 mt-0.5">
              <span className="font-bold" style={{ color: compareSecondary.delta >= 0 ? '#86efac' : '#fca5a5' }}>
                {compareSecondary.delta >= 0 ? '+' : ''}{compareSecondary.delta.toFixed(unidade === 'pts' ? 0 : 1)}{u}
              </span>{' '}
              {compareSecondary.ref}
            </p>
          )}
        </>
      ) : compareText ? (
        <p className="text-[13px] text-white/55">{compareText}</p>
      ) : (
        <p className="text-[13px] text-white/30 italic">benchmark indisponível</p>
      )}
    </div>
  );
}

function DadoCard({ nome, desc, status }: { nome: string; desc: string; status: 'ok' | 'partial' | 'off' }) {
  const cfg = {
    ok:      { bg: 'rgba(22,163,74,0.15)',  color: '#86efac', label: 'Disponível' },
    partial: { bg: 'rgba(234,88,12,0.15)',  color: '#fb923c', label: 'Parcial' },
    off:     { bg: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.40)', label: 'Sem dados' },
  }[status];
  return (
    <div className="rounded-2xl p-5 border"
      style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.10)' }}>
      <p className="text-white text-[13px] font-bold mb-1.5">{nome}</p>
      <p className="text-white/65 text-[13px] leading-relaxed mb-3">{desc}</p>
      <span className="inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold"
        style={{ background: cfg.bg, color: cfg.color }}>
        {cfg.label}
      </span>
    </div>
  );
}

function fmtPct(n: number): string {
  return Number.isInteger(n) ? `${n}%` : `${n.toFixed(1)}%`;
}
