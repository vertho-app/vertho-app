import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Activity, Target, Sparkles, ClipboardCheck, ClipboardList, BarChart3,
  GraduationCap, BookOpen, Users, Layers, Database, Building2, Eye, MessagesSquare,
  Compass, ArrowRight, ArrowDown, MapPin, FileText, Lightbulb, CheckCircle2,
  TrendingUp, GitCompare, Brain, Briefcase, Repeat, Award,
} from 'lucide-react';
import { BettHeader } from '../_components/bett-header';
import { JornadaCTA } from './_cta';

export const metadata: Metadata = {
  title: 'Metodologia Vertho — 5 fases de desenvolvimento',
  description:
    'A metodologia Vertho.ai em cinco fases: Preparação (competências, cenários, perfil de cargo), Mapeamento (DISC + Liderança + competências), Diagnóstico (PDI, relatórios, DNA Organizacional), Capacitação (Jornada de 14 semanas, Tutor IA, prática) e Re-Avaliação (evolução, novos cenários, Mentor IA, feedback).',
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
    titulo: 'Preparação',
    resumo:
      'Primeiro a Vertho calibra o instrumento: define competências relevantes, constrói cenários customizados para a realidade da rede e formaliza o perfil ideal de cada cargo. Sem isso, todo mapeamento mede contra o vazio.',
    pilares: [
      { icon: ClipboardList, label: 'Definição de competências', texto: 'Conjunto de competências do contexto, com descritores observáveis e níveis de proficiência (n1 a n4).' },
      { icon: Briefcase, label: 'Perfil do cargo ideal', texto: 'O que se espera do diretor, coordenador, supervisor — referência clara para mapear o que existe contra o que deveria.' },
      { icon: Compass, label: 'Cenários customizados', texto: 'Situações reais da escola usadas para testar o exercício das competências (não casos genéricos de manual).' },
      { icon: Target, label: 'Vínculo com prioridades da rede', texto: 'A preparação se conecta ao plano estratégico da secretaria — competências calibradas pelo desafio real.' },
    ],
  },
  {
    num: '02',
    cor: 'purple',
    titulo: 'Mapeamento',
    resumo:
      'Com as competências definidas, mapeamos quem é o profissional hoje: perfil comportamental (DISC + Liderança) e domínio técnico das competências esperadas para o cargo.',
    pilares: [
      { icon: Brain, label: 'Perfil comportamental DISC', texto: 'Mapeamento do estilo de comportamento (Dominância, Influência, Estabilidade, Cautela) aplicado ao contexto educacional.' },
      { icon: Award, label: 'Perfil de Liderança', texto: 'Estilo de liderança e seus arquétipos — conecta o "como faço" com o "como decido".' },
      { icon: GraduationCap, label: 'Mapeamento de competências', texto: 'Cenários customizados aplicados em conversa estruturada com IA. Cada resposta vira evidência de proficiência por descritor.' },
      { icon: Eye, label: 'Evidência por descritor', texto: 'Não é nota global. Cada descritor é avaliado por trecho da resposta — auditável e regravável.' },
    ],
  },
  {
    num: '03',
    cor: 'amber',
    titulo: 'Diagnóstico',
    resumo:
      'O diagnóstico Vertho cruza tudo que foi mapeado: comportamento × competências × contexto da rede. Daí saem o PDI individual, o relatório do gestor e o DNA Organizacional da rede inteira.',
    pilares: [
      { icon: GitCompare, label: 'Cruzamento dos mapeamentos', texto: 'DISC + Liderança + competências por descritor, cruzados com o perfil de cargo ideal definido na preparação.' },
      { icon: ClipboardCheck, label: 'PDI individualizado', texto: 'Plano de Desenvolvimento Individual com competência foco, ações concretas e marcos de evidência por colaborador.' },
      { icon: FileText, label: 'Relatórios para o gestor', texto: 'Dossiê estruturado para conversa de feedback: contexto, gaps, hipóteses e roteiro de devolutiva.' },
      { icon: Layers, label: 'DNA Organizacional', texto: 'Foto agregada da rede: padrões de competência, distribuição de perfis, força coletiva e risco coletivo.' },
    ],
  },
  {
    num: '04',
    cor: 'green',
    titulo: 'Capacitação',
    resumo:
      'A jornada de desenvolvimento parte do PDI: 14 semanas de trilha por competência foco, com Tutor IA acompanhando o ritmo e missões aplicadas no cotidiano da escola.',
    pilares: [
      { icon: BookOpen, label: 'Jornada de Desenvolvimento', texto: 'Trilha de 14 semanas combinando conteúdo, prática, reflexão e evidência — orientada pelo PDI individual.' },
      { icon: Sparkles, label: 'Tutor IA', texto: 'IA conversacional acompanhando o participante no ritmo dele: tira dúvidas, conduz socraticamente e responde com contexto da escola.' },
      { icon: ClipboardCheck, label: 'Aplicação prática', texto: 'Missões observáveis no cotidiano. O desenvolvimento não fica no conteúdo — vira ação e fica registrado.' },
      { icon: Activity, label: 'Acompanhamento da liderança', texto: 'Coordenadores e gestores enxergam o progresso em tempo real — engajamento, evidências, marcos.' },
    ],
  },
  {
    num: '05',
    cor: 'cyan',
    titulo: 'Re-Avaliação',
    resumo:
      'A jornada não termina com o último módulo. Re-mapeamos a competência depois da prática, com cenários novos e feedback estruturado — evidência de evolução real, não percepção.',
    pilares: [
      { icon: Repeat, label: 'Re-mapeamento das competências', texto: 'Mesma metodologia da fase 2, agora medindo o quanto a competência foco subiu de nível depois da capacitação.' },
      { icon: Compass, label: 'Novos cenários', texto: 'Situações inéditas (não as do mapeamento inicial) — evita memorização e mede aplicação real.' },
      { icon: Brain, label: 'Mentor IA', texto: 'Conversa qualitativa estruturada que extrai a percepção do colaborador sobre a própria evolução, com triangulação.' },
      { icon: TrendingUp, label: 'Feedback e próximo ciclo', texto: 'Devolutiva ao colaborador e ao gestor + insumo para o próximo ciclo de PDI. Fluxo contínuo, não evento isolado.' },
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
            Metodologia Vertho · 5 fases
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
            A Vertho aplica uma metodologia em cinco fases que conecta dados, gestão pedagógica e
            desenvolvimento de pessoas em uma jornada prática, mensurável e contínua.
          </p>
          <p className="text-white/55 leading-relaxed" style={{ fontSize: 14, maxWidth: 760 }}>
            Preparação · Mapeamento · Diagnóstico · Capacitação · Re-Avaliação. Cada fase tem entregas
            concretas, instrumentos próprios e produz evidência para a próxima.
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
              titulo="Metodologia em cinco fases que viram plano de ação"
              texto="Preparação, mapeamento, diagnóstico próprio, capacitação prática e re-avaliação. Instrumentos próprios e evidência acumulada a cada fase."
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
