import type { Metadata } from 'next';
import {
  Mail, Globe, ArrowRight, Sparkles, Users, MessageCircle, Award, Heart,
  GraduationCap, Brain, Target, Map, Layers, BookOpen, RefreshCw, Film,
  Tv, FileText, Book, Zap, ShieldCheck,
} from 'lucide-react';
import { WhatsappIcon } from '../radarbett/_components/whatsapp-icon';

export const metadata: Metadata = {
  title: 'Imprensa — Vertho',
  description:
    'Vertho.ai — Inteligência artificial e escuta humana para o desenvolvimento profissional na educação. Sala de imprensa: institucional, metodologia, contato.',
  alternates: { canonical: 'https://imprensa.vertho.ai' },
  openGraph: {
    title: 'Imprensa — Vertho',
    description:
      'Como a Vertho usa IA + escuta humana para desenvolver competências de gestores, coordenadores e professores.',
    url: 'https://imprensa.vertho.ai',
    type: 'website',
  },
};

export default function ImprensaPage() {
  return (
    <main
      className="radarbett-shell min-h-dvh"
      style={{
        background:
          'radial-gradient(1100px 600px at 88% -5%, rgba(52,197,204,.10), transparent 55%),' +
          'radial-gradient(900px 500px at -5% 30%, rgba(158,78,221,.06), transparent 60%),' +
          'linear-gradient(180deg,#06172C 0%,#091D35 50%,#0a1f3a 100%)',
      }}
    >
      <ImprensaHeader />

      <article className="max-w-[1100px] mx-auto px-6 pb-24">
        {/* Hero */}
        <section className="pt-12 sm:pt-20 pb-12 sm:pb-16">
          <p
            className="text-[10px] font-bold tracking-[0.25em] uppercase mb-3"
            style={{ color: '#34C5CC' }}
          >
            Sala de Imprensa
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
            Os saberes que a educação exige todos os dias —{' '}
            <em style={{ color: '#34C5CC', fontStyle: 'italic' }}>
              mas que ninguém ensinou
            </em>
            .
          </h1>
          <p className="text-white/80 leading-relaxed mb-3" style={{ fontSize: 18, maxWidth: 760 }}>
            A Vertho une <strong className="text-white">inteligência artificial e escuta humana</strong>{' '}
            para transformar a forma como profissionais da educação lidam com os desafios reais da escola.
          </p>
          <p className="text-white/55 leading-relaxed" style={{ fontSize: 14, maxWidth: 760 }}>
            Análise comportamental, cenários práticos do cotidiano escolar e curadoria de
            repertório cultural — desenvolvimento profissional verdadeiramente personalizado.
          </p>
        </section>

        {/* O que fazemos */}
        <Section
          eyebrow="O que fazemos"
          titulo={<>Apoiamos escolas e redes a desenvolver <em style={italicCyan}>capacidades reais</em>.</>}
          intro="A Vertho atua com Gestores Educacionais e Técnicos das Secretarias de Educação, Gestores e Diretores Escolares, Coordenadores e Supervisores Pedagógicos, e Professores. Nossas matrizes de competências cobrem o que o cotidiano da educação exige, em todos os níveis."
        >
          <div className="mb-8">
            <div
              className="inline-flex items-center gap-3 rounded-full px-5 py-2.5 border"
              style={{
                background: 'linear-gradient(135deg, rgba(52,197,204,0.10), rgba(158,78,221,0.10))',
                borderColor: 'rgba(255,255,255,0.10)',
              }}
            >
              <span className="text-white/60 text-[12px]">Catálogo</span>
              <span
                className="text-white text-[28px] font-bold leading-none"
                style={{ fontFamily: 'var(--font-fraunces), Georgia, serif' }}
              >
                50
              </span>
              <span className="text-white/80 text-[14px]">competências mapeadas</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <CompetCard
              icone={<Award size={18} strokeWidth={2.2} />}
              titulo="Liderança"
              texto="Habilidades para liderar equipes, inspirar mudanças e tomar decisões estratégicas no ambiente escolar."
              cor="cyan"
            />
            <CompetCard
              icone={<MessageCircle size={18} strokeWidth={2.2} />}
              titulo="Gestão de conflitos"
              texto="Estratégias práticas para mediar divergências, construir consensos e manter ambientes produtivos."
              cor="lilac"
            />
            <CompetCard
              icone={<Sparkles size={18} strokeWidth={2.2} />}
              titulo="Comunicação"
              texto="Técnicas para se conectar efetivamente com alunos, famílias, colegas e comunidade escolar."
              cor="purple"
            />
            <CompetCard
              icone={<Users size={18} strokeWidth={2.2} />}
              titulo="Diversidade e Inclusão"
              texto="Ferramentas para criar ambientes acolhedores e respeitosos com todas as identidades e necessidades."
              cor="cyan"
            />
            <CompetCard
              icone={<GraduationCap size={18} strokeWidth={2.2} />}
              titulo="Gestão pedagógica"
              texto="Métodos para coordenar processos de ensino-aprendizagem, planejamento e avaliação escolar."
              cor="lilac"
            />
            <CompetCard
              icone={<Layers size={18} strokeWidth={2.2} />}
              titulo="+ 45 competências"
              texto="Catálogo amplo cobrindo as demandas de cada cargo e contexto da rede ou escola atendida."
              cor="purple"
              destaque
            />
          </div>
        </Section>

        {/* Como funciona */}
        <Section
          eyebrow="Como funciona"
          titulo={<>Um processo completo, <em style={italicCyan}>não um curso pontual</em>.</>}
          intro="Combinamos análise comportamental, cenários práticos e acompanhamento personalizado por inteligência artificial — em uma jornada contínua, com evidência de evolução real."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PassoCard
              num="01"
              icone={<Brain size={18} strokeWidth={2.2} />}
              titulo="Avaliação de perfil"
              texto="Mapeamento comportamental baseado em DISC para identificar estilos e pontos de desenvolvimento."
              cor="cyan"
            />
            <PassoCard
              num="02"
              icone={<Target size={18} strokeWidth={2.2} />}
              titulo="Definição dos eixos"
              texto="Alinhamento com escola ou rede + matriz própria ou personalizada conforme as necessidades."
              cor="lilac"
            />
            <PassoCard
              num="03"
              icone={<Sparkles size={18} strokeWidth={2.2} />}
              titulo="Diagnóstico com IA"
              texto="Avaliação baseada em cenários reais do cotidiano escolar e desafios práticos vividos pelo profissional."
              cor="purple"
            />
            <PassoCard
              num="04"
              icone={<Map size={18} strokeWidth={2.2} />}
              titulo="Jornada personalizada"
              texto="Conteúdos adaptados ao nível real de cada profissional, ao seu contexto e ao seu ritmo."
              cor="purpleDeep"
            />
          </div>
        </Section>

        {/* Conteúdo e acompanhamento */}
        <Section
          eyebrow="Conteúdo e acompanhamento"
          titulo={<>O desenvolvimento que <em style={italicCyan}>cabe no dia a dia</em>.</>}
          intro="Conteúdos em formatos variados, curadoria cultural, IA que acompanha cada participante e re-avaliação para medir evolução. A jornada não termina no último módulo."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ConteudoBlock
              num="01"
              titulo="Conteúdos e formatos"
              texto="Texto, vídeo, podcast, prática e materiais de apoio em formatos variados para diferentes estilos de aprendizagem."
            />
            <ConteudoBlock
              num="02"
              titulo="Curadoria de repertório"
              texto="Livros, filmes, séries, artigos e referências culturais que ampliam perspectivas e inspiram novas formas de agir."
            />
            <ConteudoBlock
              num="03"
              titulo="Acompanhamento com IA (Beto)"
              texto="Agente que acompanha, provoca reflexões e sustenta a aprendizagem ao longo da jornada — no ritmo de cada participante."
            />
            <ConteudoBlock
              num="04"
              titulo="Nova avaliação"
              texto="Medição de evolução e definição de próximos passos. Re-mapeamento da competência foco ao final do ciclo."
            />
          </div>
        </Section>

        {/* Personalização */}
        <Section
          eyebrow="Personalização"
          titulo={<>Ninguém recebe formação <em style={italicCyan}>genérica</em>.</>}
          intro="Cada pessoa recebe exatamente o que precisa. Dois profissionais com a mesma função e a mesma matriz de competências podem fazer jornadas completamente diferentes."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PersonaCard
              letra="A"
              cor="cyan"
              perfilLinhas={['Estilo assertivo, focado em resultados', 'Necessita desenvolver escuta ativa']}
              receberLinhas={['Conteúdos sobre empatia e comunicação não-violenta', 'Práticas de mediação de conflitos']}
            />
            <PersonaCard
              letra="B"
              cor="lilac"
              perfilLinhas={['Estilo colaborativo, busca harmonia', 'Necessita fortalecer tomada de decisão']}
              receberLinhas={['Conteúdos sobre liderança e assertividade', 'Práticas de feedback construtivo']}
            />
          </div>
        </Section>

        {/* Curadoria de repertório */}
        <Section
          eyebrow="Curadoria de repertório"
          titulo={<>Aprender também é <em style={italicCyan}>ampliar repertório</em>.</>}
          intro="Selecionamos obras que inspiram novas perspectivas e enriquecem a prática educacional — para além do conteúdo direto da formação."
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <CuradoriaCard
              icone={<Book size={18} strokeWidth={2.2} />}
              titulo="Livros"
              texto="Obras literárias e acadêmicas que oferecem fundamentação teórica e reflexões profundas sobre educação."
              cor="cyan"
            />
            <CuradoriaCard
              icone={<Film size={18} strokeWidth={2.2} />}
              titulo="Filmes"
              texto="Ficções e documentários que retratam questões educacionais através de narrativas envolventes."
              cor="lilac"
            />
            <CuradoriaCard
              icone={<Tv size={18} strokeWidth={2.2} />}
              titulo="Séries"
              texto="Produções seriadas que se conectam ao que os participantes estão aprendendo no momento."
              cor="purple"
            />
            <CuradoriaCard
              icone={<FileText size={18} strokeWidth={2.2} />}
              titulo="Artigos"
              texto="Publicações acadêmicas e jornalísticas com pesquisas recentes e análises contemporâneas."
              cor="purpleDeep"
            />
          </div>
        </Section>

        {/* Tecnologia + Humanidade */}
        <section className="mb-16">
          <div
            className="rounded-3xl border p-6 sm:p-10"
            style={{
              background: 'linear-gradient(135deg, rgba(52,197,204,0.08), rgba(158,78,221,0.08))',
              borderColor: 'rgba(255,255,255,0.10)',
            }}
          >
            <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6 lg:gap-10 items-start">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: 'linear-gradient(135deg, rgba(52,197,204,0.18), rgba(158,78,221,0.18))',
                  border: '1px solid rgba(255,255,255,0.14)',
                  color: '#34C5CC',
                }}
              >
                <Heart size={28} strokeWidth={2} />
              </div>
              <div>
                <p
                  className="text-[10px] font-bold tracking-[0.25em] uppercase mb-3"
                  style={{ color: '#34C5CC' }}
                >
                  Tecnologia + Humanidade
                </p>
                <h2
                  className="text-white mb-4 serif"
                  style={{
                    fontSize: 'clamp(26px, 3.6vw, 36px)',
                    fontWeight: 600,
                    lineHeight: 1.15,
                    letterSpacing: '-0.02em',
                  }}
                >
                  A tecnologia <em style={italicCyan}>não substitui o humano</em>.
                </h2>
                <p className="text-white/80 leading-relaxed mb-3" style={{ fontSize: 16, maxWidth: 720 }}>
                  Ela ajuda a enxergar melhor, personalizar com precisão e acompanhar com consistência.
                  Nossa IA mapeia perfis, sugere conteúdos, acompanha progresso e provoca reflexões —
                  sempre respeitando o ritmo e o contexto de cada profissional.
                </p>
                <p className="text-white/65 leading-relaxed" style={{ fontSize: 14, maxWidth: 720 }}>
                  O resultado é um processo que combina a precisão da análise de dados com a
                  sensibilidade da escuta humana.
                </p>

                <div className="mt-6 inline-flex items-center gap-2 rounded-full px-4 py-2 border"
                  style={{
                    background: 'rgba(52,197,204,0.10)',
                    borderColor: 'rgba(52,197,204,0.25)',
                  }}
                >
                  <ShieldCheck size={14} style={{ color: '#34C5CC' }} />
                  <span className="text-white/85 text-[12.5px]">
                    Tecnologia a serviço do desenvolvimento genuíno, nunca como substituto
                    da presença e empatia.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Filosofia */}
        <section className="mb-20 text-center">
          <p
            className="text-white/45 text-[10px] font-bold tracking-[0.25em] uppercase mb-4"
          >
            Filosofia
          </p>
          <blockquote
            className="text-white serif"
            style={{
              fontSize: 'clamp(24px, 3.4vw, 34px)',
              lineHeight: 1.25,
              letterSpacing: '-0.02em',
              fontWeight: 500,
              maxWidth: 880,
              margin: '0 auto',
            }}
          >
            Aprender não é consumir conteúdo.{' '}
            <em style={{ color: '#34C5CC', fontStyle: 'italic' }}>
              É transformar a forma de agir no dia a dia da escola.
            </em>
          </blockquote>
        </section>

        {/* Contato Imprensa */}
        <section className="mb-12">
          <div
            className="rounded-3xl border p-6 sm:p-10"
            style={{
              background:
                'linear-gradient(135deg, rgba(158,78,221,0.10), rgba(52,197,204,0.06))',
              borderColor: 'rgba(255,255,255,0.10)',
            }}
          >
            <p
              className="text-[10px] font-bold tracking-[0.25em] uppercase mb-3"
              style={{ color: '#E1AAEF' }}
            >
              Para a imprensa
            </p>
            <h2
              className="text-white mb-3 serif"
              style={{
                fontSize: 'clamp(26px, 3.6vw, 36px)',
                fontWeight: 600,
                lineHeight: 1.15,
                letterSpacing: '-0.02em',
              }}
            >
              Disponíveis para <em style={italicCyan}>entrevistas e matérias</em>.
            </h2>
            <p className="text-white/75 leading-relaxed mb-6" style={{ fontSize: 15, maxWidth: 660 }}>
              Estamos abertos a entrevistas, matérias e esclarecimentos sobre nossa metodologia,
              produto e resultados. Resposta em até 1 dia útil.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl">
              <a
                href="mailto:contato@vertho.ai?subject=Imprensa%20%E2%80%94%20Vertho"
                className="group flex items-center gap-3 rounded-2xl p-4 border transition-all hover:translate-y-[-1px]"
                style={{
                  background: 'rgba(52,197,204,0.10)',
                  borderColor: 'rgba(52,197,204,0.25)',
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(52,197,204,0.18)', color: '#34C5CC' }}
                >
                  <Mail size={18} strokeWidth={2.2} />
                </div>
                <div className="min-w-0">
                  <p className="text-white/55 text-[10px] uppercase tracking-[0.18em] font-bold">
                    E-mail
                  </p>
                  <p className="text-white text-[14px] font-semibold truncate">
                    contato@vertho.ai
                  </p>
                </div>
                <ArrowRight
                  size={16}
                  className="ml-auto text-white/40 group-hover:text-white/85 transition-colors"
                />
              </a>

              <a
                href="https://wa.me/5511911807809?text=Ol%C3%A1%21%20Sou%20da%20imprensa%20e%20gostaria%20de%20falar%20com%20a%20Vertho."
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 rounded-2xl p-4 border transition-all hover:translate-y-[-1px]"
                style={{
                  background: 'rgba(225,170,239,0.08)',
                  borderColor: 'rgba(225,170,239,0.25)',
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(225,170,239,0.18)', color: '#E1AAEF' }}
                >
                  <WhatsappIcon size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-white/55 text-[10px] uppercase tracking-[0.18em] font-bold">
                    WhatsApp
                  </p>
                  <p className="text-white text-[14px] font-semibold truncate">
                    +55 11 91180-7809
                  </p>
                </div>
                <ArrowRight
                  size={16}
                  className="ml-auto text-white/40 group-hover:text-white/85 transition-colors"
                />
              </a>

              <a
                href="https://vertho.ai"
                className="group flex items-center gap-3 rounded-2xl p-4 border transition-all hover:translate-y-[-1px]"
                style={{
                  background: 'rgba(158,78,221,0.10)',
                  borderColor: 'rgba(158,78,221,0.25)',
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(158,78,221,0.18)', color: '#c084fc' }}
                >
                  <Globe size={18} strokeWidth={2.2} />
                </div>
                <div className="min-w-0">
                  <p className="text-white/55 text-[10px] uppercase tracking-[0.18em] font-bold">
                    Website
                  </p>
                  <p className="text-white text-[14px] font-semibold truncate">vertho.ai</p>
                </div>
                <ArrowRight
                  size={16}
                  className="ml-auto text-white/40 group-hover:text-white/85 transition-colors"
                />
              </a>
            </div>
          </div>
        </section>

        <div className="mt-10 text-center">
          <a
            href="https://vertho.ai"
            className="inline-flex items-center gap-1.5 text-[12px] text-white/45 hover:text-white"
          >
            ← vertho.ai
          </a>
        </div>
      </article>
    </main>
  );
}

const italicCyan: React.CSSProperties = { color: '#34C5CC', fontStyle: 'italic' };

// ── Header simples e institucional ────────────────────────────────────

function ImprensaHeader() {
  return (
    <header
      className="sticky top-0 z-30 border-b border-white/[0.06]"
      style={{ background: 'rgba(6,23,44,0.85)', backdropFilter: 'blur(12px)' }}
    >
      <div className="max-w-[1100px] mx-auto px-6 py-3 flex items-center justify-between">
        <a href="https://vertho.ai" className="flex items-center gap-2">
          <img src="/logo-vertho.png" alt="Vertho" style={{ height: 22, opacity: 0.9 }} />
        </a>

        <a
          href="mailto:contato@vertho.ai?subject=Imprensa%20%E2%80%94%20Vertho"
          className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-full text-[12px] sm:text-[13px] font-bold transition-all"
          style={{
            background: 'linear-gradient(135deg, #34C5CC, #2aa8ae)',
            color: '#06172C',
          }}
        >
          <Mail size={14} strokeWidth={2.4} />
          Falar com a imprensa
        </a>
      </div>
    </header>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────

function Section({
  eyebrow, titulo, intro, children,
}: { eyebrow: string; titulo: React.ReactNode; intro: string; children: React.ReactNode }) {
  return (
    <section className="mb-16">
      <p
        className="text-[10px] font-bold tracking-[0.25em] uppercase mb-3"
        style={{ color: '#34C5CC' }}
      >
        {eyebrow}
      </p>
      <h2
        className="text-white mb-3 serif"
        style={{
          fontSize: 'clamp(26px, 3.6vw, 36px)',
          fontWeight: 600,
          lineHeight: 1.15,
          letterSpacing: '-0.02em',
        }}
      >
        {titulo}
      </h2>
      <p
        className="text-white/65 leading-relaxed mb-8"
        style={{ fontSize: 15, maxWidth: 720 }}
      >
        {intro}
      </p>
      {children}
    </section>
  );
}

// ── Cards reutilizáveis ────────────────────────────────────────────────

const TONS_VERTHO = {
  cyan:       { bg: 'rgba(52,197,204,0.10)',  iconBg: 'rgba(52,197,204,0.15)',  iconColor: '#34C5CC',  border: 'rgba(52,197,204,0.22)',  badge: '#34C5CC' },
  lilac:      { bg: 'rgba(225,170,239,0.08)', iconBg: 'rgba(225,170,239,0.15)', iconColor: '#E1AAEF',  border: 'rgba(225,170,239,0.22)', badge: '#E1AAEF' },
  purple:     { bg: 'rgba(158,78,221,0.10)',  iconBg: 'rgba(158,78,221,0.15)',  iconColor: '#c084fc',  border: 'rgba(158,78,221,0.25)',  badge: '#c084fc' },
  purpleDeep: { bg: 'rgba(59,10,109,0.10)',   iconBg: 'rgba(158,78,221,0.18)',  iconColor: '#c084fc',  border: 'rgba(59,10,109,0.40)',   badge: '#c084fc' },
};

type Cor = keyof typeof TONS_VERTHO;

function CompetCard({
  icone, titulo, texto, cor, destaque,
}: { icone: React.ReactNode; titulo: string; texto: string; cor: Cor; destaque?: boolean }) {
  const t = TONS_VERTHO[cor];
  return (
    <div
      className="rounded-2xl p-5 border transition-colors"
      style={{
        background: destaque
          ? 'linear-gradient(135deg, rgba(158,78,221,0.10), rgba(52,197,204,0.05))'
          : t.bg,
        borderColor: t.border,
      }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
        style={{ background: t.iconBg, color: t.iconColor }}
      >
        {icone}
      </div>
      <h3
        className="text-white text-[15px] font-bold mb-1.5 leading-tight"
        style={{ letterSpacing: '-0.01em' }}
      >
        {titulo}
      </h3>
      <p className="text-white/65 text-[13px] leading-relaxed">{texto}</p>
    </div>
  );
}

function PassoCard({
  num, icone, titulo, texto, cor,
}: { num: string; icone: React.ReactNode; titulo: string; texto: string; cor: Cor }) {
  const t = TONS_VERTHO[cor];
  return (
    <div
      className="rounded-2xl p-5 border"
      style={{ background: t.bg, borderColor: t.border }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: t.iconBg, color: t.iconColor }}
        >
          {icone}
        </div>
        <span
          className="text-[12px] font-bold tracking-[0.18em]"
          style={{ color: t.badge }}
        >
          PASSO {num}
        </span>
      </div>
      <h3 className="text-white text-[16px] font-bold mb-1.5 leading-tight" style={{ letterSpacing: '-0.01em' }}>
        {titulo}
      </h3>
      <p className="text-white/70 text-[13px] leading-relaxed">{texto}</p>
    </div>
  );
}

function ConteudoBlock({ num, titulo, texto }: { num: string; titulo: string; texto: string }) {
  return (
    <div
      className="rounded-2xl p-5 border"
      style={{
        background: 'rgba(255,255,255,0.025)',
        borderColor: 'rgba(255,255,255,0.06)',
      }}
    >
      <span
        className="block text-[40px] font-bold leading-none mb-3"
        style={{
          fontFamily: 'var(--font-fraunces), Georgia, serif',
          background: 'linear-gradient(135deg, #34C5CC, #c084fc)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          color: 'transparent',
        }}
      >
        {num}
      </span>
      <h3 className="text-white text-[16px] font-bold mb-1.5 leading-tight" style={{ letterSpacing: '-0.01em' }}>
        {titulo}
      </h3>
      <p className="text-white/65 text-[13px] leading-relaxed">{texto}</p>
    </div>
  );
}

function PersonaCard({
  letra, cor, perfilLinhas, receberLinhas,
}: { letra: string; cor: Cor; perfilLinhas: string[]; receberLinhas: string[] }) {
  const t = TONS_VERTHO[cor];
  return (
    <div
      className="rounded-2xl p-6 border"
      style={{ background: t.bg, borderColor: t.border }}
    >
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 text-[22px] font-bold"
          style={{
            background: t.iconBg,
            color: t.iconColor,
            fontFamily: 'var(--font-fraunces), Georgia, serif',
          }}
        >
          {letra}
        </div>
        <p className="text-white text-[16px] font-bold leading-tight">
          Profissional {letra}
        </p>
      </div>
      <div className="mb-4">
        <p className="text-white/55 text-[10px] font-bold tracking-[0.18em] uppercase mb-2">
          Perfil
        </p>
        <ul className="space-y-1.5">
          {perfilLinhas.map((l, i) => (
            <li key={i} className="text-white/85 text-[13.5px] leading-relaxed flex gap-2">
              <span className="text-white/30">·</span>
              <span>{l}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-white/55 text-[10px] font-bold tracking-[0.18em] uppercase mb-2">
          Recebe
        </p>
        <ul className="space-y-1.5">
          {receberLinhas.map((l, i) => (
            <li key={i} className="text-white/85 text-[13.5px] leading-relaxed flex gap-2">
              <span style={{ color: t.iconColor }}>→</span>
              <span>{l}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function CuradoriaCard({
  icone, titulo, texto, cor,
}: { icone: React.ReactNode; titulo: string; texto: string; cor: Cor }) {
  const t = TONS_VERTHO[cor];
  return (
    <div
      className="rounded-2xl p-5 border"
      style={{ background: t.bg, borderColor: t.border }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
        style={{ background: t.iconBg, color: t.iconColor }}
      >
        {icone}
      </div>
      <h3 className="text-white text-[15px] font-bold mb-1.5 leading-tight" style={{ letterSpacing: '-0.01em' }}>
        {titulo}
      </h3>
      <p className="text-white/65 text-[12.5px] leading-relaxed">{texto}</p>
    </div>
  );
}
