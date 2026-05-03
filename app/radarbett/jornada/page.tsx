import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Activity, Target, Sparkles, ClipboardCheck, BarChart3,
  GraduationCap, BookOpen, Users, Layers, Database, Building2, Eye, MessagesSquare,
  Compass, ArrowRight, ArrowDown, MapPin, FileText, Lightbulb, CheckCircle2,
} from 'lucide-react';
import { BettHeader } from '../_components/bett-header';
import { JornadaCTA } from './_cta';

export const metadata: Metadata = {
  title: 'Como a Vertho transforma diagnóstico em desenvolvimento',
  description:
    'A jornada Vertho.ai depois do diagnóstico do Radar: prioridades, trilhas, prática com evidência e gestão da evolução. Cinco passos para transformar dados em mudança real.',
  alternates: { canonical: 'https://radarbett.vertho.ai/jornada' },
};

type Etapa = {
  num: string;
  cor: 'cyan' | 'purple' | 'green' | 'amber';
  titulo: string;
  resumo: string;
  pilares: { icon: any; label: string; texto: string }[];
};

const COR: Record<string, { borda: string; bg: string; numBg: string; numColor: string; eyebrow: string; iconBg: string; iconColor: string }> = {
  cyan: {
    borda: 'rgba(52,197,204,0.25)',
    bg: 'rgba(52,197,204,0.05)',
    numBg: 'linear-gradient(135deg, #34c5cc, #2aa8ae)',
    numColor: '#06172C',
    eyebrow: '#34c5cc',
    iconBg: 'rgba(52,197,204,0.12)',
    iconColor: '#34c5cc',
  },
  purple: {
    borda: 'rgba(158,78,221,0.25)',
    bg: 'rgba(158,78,221,0.05)',
    numBg: 'linear-gradient(135deg, #c084fc, #9e4edd)',
    numColor: '#06172C',
    eyebrow: '#c084fc',
    iconBg: 'rgba(158,78,221,0.12)',
    iconColor: '#c084fc',
  },
  green: {
    borda: 'rgba(22,163,74,0.30)',
    bg: 'rgba(22,163,74,0.06)',
    numBg: 'linear-gradient(135deg, #86efac, #16a34a)',
    numColor: '#06172C',
    eyebrow: '#86efac',
    iconBg: 'rgba(22,163,74,0.15)',
    iconColor: '#86efac',
  },
  amber: {
    borda: 'rgba(251,191,36,0.30)',
    bg: 'rgba(251,191,36,0.05)',
    numBg: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
    numColor: '#06172C',
    eyebrow: '#fbbf24',
    iconBg: 'rgba(251,191,36,0.15)',
    iconColor: '#fbbf24',
  },
};

const ETAPAS: Etapa[] = [
  {
    num: '01',
    cor: 'cyan',
    titulo: 'Diagnóstico',
    resumo:
      'Identificamos sinais críticos da escola ou da rede: aprendizagem, infraestrutura, contexto docente, participação e evolução histórica — tudo a partir de dados oficiais públicos.',
    pilares: [
      { icon: Database, label: 'Dados oficiais', texto: 'INEP, FNDE, Tesouro Nacional, SARESP. Toda informação tem ano e fonte.' },
      { icon: GraduationCap, label: 'Por escola', texto: 'Saeb, Ideb, ENEM, Censo Escolar, pares INSE da microrregião.' },
      { icon: Building2, label: 'Por rede', texto: 'ICA agregado, Ideb por etapa, FUNDEB, VAAR e dispersão entre escolas.' },
      { icon: BarChart3, label: 'Painel de indicadores', texto: 'Tudo organizado para leitura ágil: KPIs, comparativos e trajetória.' },
    ],
  },
  {
    num: '02',
    cor: 'amber',
    titulo: 'Prioridades',
    resumo:
      'A leitura dos dados vira foco: quais competências, práticas e decisões precisam ser trabalhadas primeiro. Sem dispersar a equipe em frentes paralelas que não conversam.',
    pilares: [
      { icon: Target, label: 'Foco no que mais impacta', texto: 'Identificamos os gaps com maior efeito alavanca na aprendizagem.' },
      { icon: Compass, label: 'Competências e práticas-chave', texto: 'Priorizamos o que move o ponteiro com a equipe que está disponível.' },
      { icon: Lightbulb, label: 'Decisões com evidência', texto: 'Cada escolha tem dado por trás — não é palpite ou modismo pedagógico.' },
    ],
  },
  {
    num: '03',
    cor: 'purple',
    titulo: 'Jornada de desenvolvimento',
    resumo:
      'A Vertho cria trilhas personalizadas para educadores, gestores e equipes, conectadas aos desafios reais da rede — não conteúdo genérico.',
    pilares: [
      { icon: Users, label: 'Trilhas por perfil', texto: 'Diretor, coordenador, professor — cada um na sua frente, com seu ritmo.' },
      { icon: Layers, label: 'Competências prioritárias', texto: 'Identificadas no diagnóstico, escaladas no PDI, treinadas na trilha.' },
      { icon: BookOpen, label: 'Práticas aplicáveis', texto: 'Conteúdo curto, ancorado em situações reais da escola.' },
      { icon: Sparkles, label: 'IA como tutora', texto: 'MentorIA acompanha cada participante no ritmo dele, com contexto.' },
    ],
  },
  {
    num: '04',
    cor: 'green',
    titulo: 'Prática e evidência',
    resumo:
      'O desenvolvimento não fica só no conteúdo. Cada participante aplica no cotidiano, registra evidências e recebe devolutivas — fechando o ciclo aprender, fazer, mostrar, evoluir.',
    pilares: [
      { icon: ClipboardCheck, label: 'Missões práticas', texto: 'Tarefas observáveis, com critério de execução claro, na rotina da escola.' },
      { icon: Eye, label: 'Evidências do cotidiano', texto: 'Cada participante registra o que aplicou — fica visível para a liderança.' },
      { icon: MessagesSquare, label: 'Feedback inteligente', texto: 'Devolutiva da MentorIA + da liderança humana, integradas.' },
      { icon: Activity, label: 'Acompanhamento da liderança', texto: 'Coordenadores e gestores enxergam o progresso em tempo real.' },
    ],
  },
  {
    num: '05',
    cor: 'cyan',
    titulo: 'Gestão da evolução',
    resumo:
      'Secretarias e lideranças acompanham progresso, engajamento, evolução de competências e oportunidades de apoio — com painel pensado para decisão, não só leitura.',
    pilares: [
      { icon: BarChart3, label: 'Painéis de evolução', texto: 'Indicadores que mostram onde a rede subiu, onde travou e por quê.' },
      { icon: FileText, label: 'Relatórios para gestores', texto: 'Dossiê de evidências por escola, área e período.' },
      { icon: MapPin, label: 'Visão por escola, equipe e competência', texto: 'Cortes que respondem perguntas reais da gestão.' },
      { icon: CheckCircle2, label: 'Decisões baseadas em evidências', texto: 'Plano do próximo ciclo sai do mesmo painel — fluxo contínuo.' },
    ],
  },
];

export default function JornadaPage() {
  return (
    <main
      className="min-h-dvh"
      style={{
        background:
          'radial-gradient(1100px 600px at 88% -5%, rgba(52,197,204,.10), transparent 55%),' +
          'radial-gradient(900px 500px at -5% 30%, rgba(158,78,221,.06), transparent 60%),' +
          'linear-gradient(180deg,#06172C 0%,#091D35 50%,#0a1f3a 100%)',
      }}
    >
      <BettHeader />

      <article className="max-w-[1100px] mx-auto px-6 pb-24">
        {/* Hero */}
        <section className="pt-12 sm:pt-20 pb-12 sm:pb-16">
          <p className="text-[10px] font-bold tracking-[0.25em] uppercase mb-3" style={{ color: '#34c5cc' }}>
            Depois do diagnóstico
          </p>
          <h1
            className="text-white mb-5 serif"
            style={{
              fontSize: 'clamp(34px, 6vw, 60px)',
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
              fontWeight: 600,
              maxWidth: 920,
            }}
          >
            Você viu o diagnóstico. Agora vem a{' '}
            <em style={{ color: '#34c5cc', fontStyle: 'italic' }}>transformação</em>.
          </h1>
          <p
            className="text-white/75 leading-relaxed mb-3"
            style={{ fontSize: 18, maxWidth: 760 }}
          >
            A Vertho conecta dados, gestão pedagógica e desenvolvimento de educadores em uma jornada
            prática, mensurável e contínua.
          </p>
          <p className="text-white/55 leading-relaxed" style={{ fontSize: 14, maxWidth: 760 }}>
            Esta página descreve, em cinco passos, como o diagnóstico do Radar vira plano de ação,
            jornada de desenvolvimento e evidência de evolução real.
          </p>
        </section>

        {/* Bridge: Radar → Vertho */}
        <section className="mb-16">
          <div
            className="rounded-3xl border p-6 sm:p-8 grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 sm:gap-6 items-center"
            style={{
              background: 'linear-gradient(135deg, rgba(52,197,204,0.06), rgba(158,78,221,0.06))',
              borderColor: 'rgba(255,255,255,0.10)',
            }}
          >
            <BridgeBlock
              eyebrow="Radar Vertho"
              titulo="Você enxergou os desafios da sua rede"
              texto="Sinais de aprendizagem, contexto e oportunidade — extraídos de dados públicos oficiais."
              accent="#34c5cc"
            />
            <div className="hidden sm:flex items-center justify-center">
              <ArrowRight size={22} className="text-white/40" />
            </div>
            <div className="flex sm:hidden justify-center">
              <ArrowDown size={22} className="text-white/40" />
            </div>
            <BridgeBlock
              eyebrow="Vertho.ai"
              titulo="A jornada que transforma diagnóstico em desenvolvimento"
              texto="Prioridades, trilhas personalizadas, prática real, evidência e gestão da evolução."
              accent="#c084fc"
            />
          </div>
        </section>

        {/* 5 Etapas */}
        <section className="mb-16 space-y-5">
          {ETAPAS.map((e) => (
            <EtapaCard key={e.num} etapa={e} />
          ))}
        </section>

        {/* Tagline antes do CTA */}
        <section className="mb-12 text-center">
          <h2
            className="text-white mb-2"
            style={{
              fontFamily: 'var(--font-fraunces), "Fraunces", Georgia, serif',
              fontSize: 'clamp(26px, 3.6vw, 36px)',
              fontWeight: 600,
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
            }}
          >
            Dados mostram onde agir.{' '}
            <em style={{ color: '#34c5cc', fontStyle: 'italic' }}>A Vertho mostra como evoluir.</em>
          </h2>
        </section>

        {/* CTA final (componente cliente para o WhatsApp) */}
        <JornadaCTA />

        <div className="mt-10 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[12px] text-white/45 hover:text-white"
          >
            ← Voltar à busca do Radar
          </Link>
        </div>
      </article>
    </main>
  );
}

function BridgeBlock({
  eyebrow, titulo, texto, accent,
}: { eyebrow: string; titulo: string; texto: string; accent: string }) {
  return (
    <div>
      <p
        className="text-[10px] tracking-[0.20em] uppercase font-bold mb-2"
        style={{ color: accent }}
      >
        {eyebrow}
      </p>
      <h3
        className="text-white text-[17px] sm:text-[18px] font-bold leading-tight mb-2"
        style={{
          fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif',
          letterSpacing: '-0.01em',
        }}
      >
        {titulo}
      </h3>
      <p className="text-white/65 text-[13.5px] leading-relaxed">{texto}</p>
    </div>
  );
}

function EtapaCard({ etapa }: { etapa: Etapa }) {
  const c = COR[etapa.cor];
  return (
    <div
      className="rounded-3xl border p-6 sm:p-8"
      style={{ background: c.bg, borderColor: c.borda }}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[140px_1fr] gap-5 lg:gap-8">
        {/* Coluna esquerda: número + título */}
        <div>
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
            style={{ background: c.numBg, color: c.numColor }}
          >
            <span
              style={{
                fontFamily: 'var(--font-fraunces), "Fraunces", Georgia, serif',
                fontSize: 22,
                fontWeight: 700,
              }}
            >
              {etapa.num}
            </span>
          </div>
          <p
            className="text-[10px] tracking-[0.18em] uppercase font-bold mb-1"
            style={{ color: c.eyebrow }}
          >
            Etapa {etapa.num}
          </p>
          <h2
            className="text-white"
            style={{
              fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif',
              fontSize: 'clamp(22px, 2.6vw, 28px)',
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
            }}
          >
            {etapa.titulo}
          </h2>
        </div>

        {/* Coluna direita: resumo + pilares */}
        <div>
          <p
            className="text-white/80 leading-relaxed mb-5"
            style={{ fontSize: 15, maxWidth: 720 }}
          >
            {etapa.resumo}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {etapa.pilares.map((p, i) => {
              const Icon = p.icon;
              return (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-2xl p-4 border"
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    borderColor: 'rgba(255,255,255,0.06)',
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: c.iconBg, color: c.iconColor }}
                  >
                    <Icon size={15} strokeWidth={2.2} />
                  </div>
                  <div>
                    <p className="text-white text-[13px] font-bold mb-1 leading-tight">
                      {p.label}
                    </p>
                    <p className="text-white/60 text-[12.5px] leading-relaxed">
                      {p.texto}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
