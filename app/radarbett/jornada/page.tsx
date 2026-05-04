import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Activity, Target, Sparkles, ClipboardCheck, ClipboardList, BarChart3,
  GraduationCap, BookOpen, Users, Layers, Database, Building2, Eye, MessagesSquare,
  Compass, ArrowRight, ArrowDown, MapPin, FileText, Lightbulb, CheckCircle2,
  TrendingUp, GitCompare, Brain, Briefcase, Repeat, Award, Smartphone, Bell, Zap,
} from 'lucide-react';
import { BettHeader } from '../_components/bett-header';
import { JornadaCTA } from './_cta';
import { WhatsappIcon } from '../_components/whatsapp-icon';

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
      'Primeiro a Vertho calibra o instrumento: define competências relevantes, constrói cenários customizados para a realidade da rede/escola e formaliza o perfil ideal de cada cargo. Sem isso, todo mapeamento mede contra o vazio.',
    pilares: [
      { icon: ClipboardList, label: 'Definição de competências', texto: 'Conjunto de competências do contexto, com descritores observáveis e níveis de proficiência (n1 a n4).' },
      { icon: Briefcase, label: 'Perfil do cargo ideal', texto: 'O que se espera do diretor, coordenador, supervisor — referência clara para mapear o que existe contra o que deveria.' },
      { icon: Compass, label: 'Cenários customizados', texto: 'Situações reais da escola usadas para testar o exercício das competências (não casos genéricos de manual).' },
      { icon: Target, label: 'Vínculo com prioridades da rede/escola', texto: 'A preparação se conecta ao plano estratégico da secretaria ou direção — competências calibradas pelo desafio real.' },
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
      'O diagnóstico Vertho cruza tudo que foi mapeado: comportamento × competências × contexto da rede/escola. Daí saem o PDI individual, o relatório do gestor e o DNA Organizacional agregado.',
    pilares: [
      { icon: GitCompare, label: 'Cruzamento dos mapeamentos', texto: 'DISC + Liderança + competências por descritor, cruzados com o perfil de cargo ideal definido na preparação.' },
      { icon: ClipboardCheck, label: 'PDI individualizado', texto: 'Plano de Desenvolvimento Individual com competência foco, ações concretas e marcos de evidência por colaborador.' },
      { icon: FileText, label: 'Relatórios para o gestor', texto: 'Dossiê estruturado para conversa de feedback: contexto, gaps, hipóteses e roteiro de devolutiva.' },
      { icon: Layers, label: 'DNA Organizacional', texto: 'Foto agregada da rede/escola: padrões de competência, distribuição de perfis, força coletiva e risco coletivo.' },
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

        {/* Três diferenciais (antes das 5 fases) */}
        <section className="mb-16">
          <h2
            className="text-white mb-3 serif"
            style={{
              fontSize: 'clamp(26px, 3.6vw, 36px)',
              fontWeight: 600,
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
            }}
          >
            Três coisas que ninguém mais{' '}
            <em style={{ color: '#34c5cc', fontStyle: 'italic' }}>faz</em>.
          </h2>
          <p
            className="text-white/65 leading-relaxed mb-8"
            style={{ fontSize: 15, maxWidth: 720 }}
          >
            Não é curso online. Não é consultoria pontual. É uma jornada contínua que
            conecta diagnóstico, prática e evidência.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <DiferencialCard
              cor="cyan"
              icone={<Sparkles size={18} strokeWidth={2.2} />}
              titulo="MentorIA no bolso"
              texto="IA conversacional que acompanha cada gestor no ritmo dele: simula situações reais, dá feedback e registra evidência. Funciona no celular, via WhatsApp."
            />
            <DiferencialCard
              cor="green"
              icone={<CheckCircle2 size={18} strokeWidth={2.2} />}
              titulo="Evidência real, não certificado"
              texto="Cada descritor de competência é avaliado por trecho da resposta — auditável e regravável. Re-mapeamento pós-jornada mede evolução real com cenários novos."
            />
            <DiferencialCard
              cor="purple"
              icone={<ArrowRight size={18} strokeWidth={2.2} />}
              titulo="Do dado à prática em 14 semanas"
              texto="Trilha de desenvolvimento que parte do PDI individual: conteúdo + missões no cotidiano + reflexão + evidência. Não é teoria — é ação na escola."
            />
          </div>
        </section>

        {/* 5 Etapas */}
        <section className="mb-16 space-y-5">
          {ETAPAS.map((e) => (
            <EtapaCard key={e.num} etapa={e} />
          ))}
        </section>

        {/* Mobile-first com WhatsApp */}
        <section className="mb-16">
          <div
            className="rounded-3xl border p-6 sm:p-8"
            style={{
              background: 'linear-gradient(135deg, rgba(37,211,102,0.08), rgba(52,197,204,0.04))',
              borderColor: 'rgba(37,211,102,0.22)',
            }}
          >
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6 lg:gap-10 items-center">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)', color: '#06172C' }}
                  >
                    <Smartphone size={22} strokeWidth={2.2} />
                  </div>
                  <div>
                    <p className="text-[10px] tracking-[0.18em] uppercase font-bold" style={{ color: '#86efac' }}>
                      Acesso
                    </p>
                    <h3 className="text-white text-[17px] sm:text-[18px] font-bold leading-tight" style={{
                      fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif',
                      letterSpacing: '-0.02em',
                    }}>
                      Tudo pelo celular, no fluxo do trabalho
                    </h3>
                  </div>
                </div>

                <p className="text-white/80 leading-relaxed mb-4" style={{ fontSize: 15, maxWidth: 720 }}>
                  Toda a jornada — mapeamento, PDIs, Tutor IA, missões práticas, evidências, feedback —
                  acontece no celular. <strong className="text-white">Notificações via WhatsApp</strong> avisam
                  o que precisa ser feito quando precisa, sem app extra para baixar e sem login complicado.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <BeneficioMobile
                    icon={<WhatsappIcon size={14} />}
                    titulo="Notificações WhatsApp"
                    texto="Cada novo módulo, missão e devolutiva chega como mensagem — engajamento sustentado sem precisar 'lembrar de entrar'."
                  />
                  <BeneficioMobile
                    icon={<Zap size={14} strokeWidth={2.2} />}
                    titulo="Sem app, sem fricção"
                    texto="Roda em qualquer celular pelo navegador. Login com link mágico — qualquer educador da escola usa, sem treinamento técnico."
                  />
                  <BeneficioMobile
                    icon={<Bell size={14} strokeWidth={2.2} />}
                    titulo="Cadência inteligente"
                    texto="A IA respeita o ritmo de cada participante e da rede. Lembretes na hora certa; pausa quando o ciclo escolar pede silêncio."
                  />
                </div>
              </div>

              {/* Mock de celular — preview da conversa MentorIA */}
              <PhoneMock />
            </div>
          </div>
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

function DiferencialCard({
  cor, icone, titulo, texto,
}: { cor: 'cyan' | 'green' | 'purple'; icone: React.ReactNode; titulo: string; texto: string }) {
  const tons = {
    cyan:   { bg: 'rgba(52,197,204,0.10)',  iconBg: 'rgba(52,197,204,0.15)', iconColor: '#34c5cc', border: 'rgba(52,197,204,0.22)' },
    green:  { bg: 'rgba(22,163,74,0.10)',   iconBg: 'rgba(22,163,74,0.15)',  iconColor: '#86efac', border: 'rgba(22,163,74,0.25)' },
    purple: { bg: 'rgba(158,78,221,0.10)',  iconBg: 'rgba(158,78,221,0.15)', iconColor: '#c084fc', border: 'rgba(158,78,221,0.22)' },
  };
  const t = tons[cor];
  return (
    <div
      className="rounded-2xl p-6 border transition-colors"
      style={{ background: t.bg, borderColor: t.border }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
        style={{ background: t.iconBg, color: t.iconColor }}
      >
        {icone}
      </div>
      <h3 className="text-white text-[16px] font-bold mb-2 leading-tight" style={{
        fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif',
        letterSpacing: '-0.01em',
      }}>
        {titulo}
      </h3>
      <p className="text-white/70 text-[13.5px] leading-relaxed">{texto}</p>
    </div>
  );
}

function PhoneMock() {
  return (
    <div
      className="relative mx-auto rounded-[36px] p-2 shadow-2xl"
      style={{
        background: 'linear-gradient(180deg, #1a2942, #0f1d33)',
        border: '6px solid #06172C',
        width: 240,
        maxWidth: '100%',
      }}
    >
      {/* Notch */}
      <div
        className="absolute left-1/2 -translate-x-1/2 top-2 rounded-full"
        style={{ background: '#06172C', width: 80, height: 18, zIndex: 2 }}
      />
      <div
        className="rounded-[28px] p-3 pt-7"
        style={{ background: '#0a1f3a', minHeight: 380 }}
      >
        {/* Header WhatsApp */}
        <div
          className="flex items-center gap-2 pb-2.5 mb-3 border-b"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold"
            style={{ background: 'linear-gradient(135deg, #34c5cc, #9e4edd)', color: '#06172C' }}
          >
            V
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-[11px] font-bold leading-tight">Vertho MentorIA</p>
            <p className="text-[9px]" style={{ color: '#86efac' }}>online agora</p>
          </div>
        </div>

        {/* Conversa */}
        <div className="space-y-2">
          <ChatMsg from="ai">
            Oi, Maria! 👋 Sua missão da semana está pronta: observar uma aula e registrar 3 pontos de feedback construtivo.
          </ChatMsg>
          <ChatTime>10:32</ChatTime>
          <ChatMsg from="user">Vou fazer hoje à tarde!</ChatMsg>
          <ChatTime>10:33</ChatTime>
          <ChatMsg from="ai">
            Ótimo! Depois me conta como foi — vou te ajudar a estruturar o feedback para a conversa com a professora.
          </ChatMsg>
          <ChatTime>10:33</ChatTime>
          <ChatMsg from="ai">
            Lembre: foque em comportamento observável, não em julgamento. Boa observação! 💪
          </ChatMsg>
          <ChatTime>10:34</ChatTime>
        </div>
      </div>
    </div>
  );
}

function ChatMsg({ from, children }: { from: 'ai' | 'user'; children: React.ReactNode }) {
  const isAi = from === 'ai';
  return (
    <div className={`flex ${isAi ? 'justify-start' : 'justify-end'}`}>
      <div
        className="rounded-2xl px-2.5 py-1.5 text-[10.5px] leading-snug"
        style={{
          background: isAi ? 'rgba(255,255,255,0.06)' : 'rgba(37,211,102,0.20)',
          color: isAi ? 'rgba(255,255,255,0.92)' : '#86efac',
          maxWidth: '88%',
          borderTopLeftRadius: isAi ? 6 : 14,
          borderTopRightRadius: isAi ? 14 : 6,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ChatTime({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[8.5px] text-white/35 px-1" style={{ marginTop: 1, marginBottom: 4 }}>
      {children}
    </p>
  );
}

function BeneficioMobile({
  icon, titulo, texto,
}: { icon: React.ReactNode; titulo: string; texto: string }) {
  return (
    <div
      className="rounded-2xl p-4 border"
      style={{
        background: 'rgba(255,255,255,0.025)',
        borderColor: 'rgba(255,255,255,0.06)',
      }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center mb-2.5"
        style={{ background: 'rgba(37,211,102,0.15)', color: '#86efac' }}
      >
        {icon}
      </div>
      <p className="text-white text-[13px] font-bold mb-1 leading-tight">{titulo}</p>
      <p className="text-white/65 text-[12.5px] leading-relaxed">{texto}</p>
    </div>
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
