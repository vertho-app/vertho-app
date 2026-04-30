'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight, Sparkles, BarChart3, Users, Lightbulb, Target,
  GraduationCap, Building2, Landmark, FileText, Database, Lock,
  Check, ChevronRight, MessageCircle, Calendar, MapPin,
  TrendingUp, Layers, Award, Shield,
} from 'lucide-react';
import { BettHeader } from './_components/bett-header';
import { BettSearch } from './_components/bett-search';
import { BettLeadModal } from './_components/bett-lead-modal';
import { StickyCTAMobile } from './_components/sticky-cta';
import { track } from './_lib/tracking';

export default function RadarBettHome() {
  const router = useRouter();
  const [leadOpen, setLeadOpen] = useState(false);
  const [leadPre, setLeadPre] = useState<{ scopeType?: 'escola' | 'municipio'; scopeId?: string; scopeLabel?: string } | undefined>();
  const heroSearchRef = useRef<HTMLDivElement>(null);
  const homeViewSent = useRef(false);

  useEffect(() => {
    if (!homeViewSent.current) {
      track('bett_home_view');
      homeViewSent.current = true;
    }
  }, []);

  function abrirLead(pre?: typeof leadPre) {
    setLeadPre(pre);
    setLeadOpen(true);
  }

  function focarBusca() {
    heroSearchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => {
      const input = heroSearchRef.current?.querySelector('input');
      input?.focus();
    }, 600);
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
      <BettHeader onAgendar={() => abrirLead()} />

      {/* ═══════════════════ 1. HERO + BUSCA ═══════════════════ */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute"
          style={{ right: -180, top: -150, width: 600, height: 600, border: '60px solid rgba(52,197,204,0.06)', borderRadius: '50%' }} />
        <div aria-hidden className="pointer-events-none absolute"
          style={{ left: -200, bottom: -200, width: 480, height: 480, border: '40px solid rgba(154,226,230,0.04)', borderRadius: '50%' }} />

        <div className="max-w-[1100px] mx-auto px-6 pt-12 sm:pt-20 pb-16 relative">
          <p className="text-[10px] tracking-[0.3em] uppercase font-mono text-cyan-300/80 mb-4">
            Radar Vertho · Bett 2026
          </p>
          <h1
            className="text-white mb-5"
            style={{
              fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
              fontWeight: 600,
              fontSize: 'clamp(34px, 6vw, 64px)',
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
              maxWidth: 920,
            }}
          >
            Sua escola ou rede já sabe <em style={{ color: '#34c5cc', fontStyle: 'italic' }}>onde precisa agir primeiro?</em>
          </h1>
          <p className="text-white/70 leading-relaxed mb-8" style={{ fontSize: 17, maxWidth: 720 }}>
            O Radar Vertho cruza dados públicos de aprendizagem, contexto escolar e execução para
            gerar uma primeira leitura de oportunidades — e mostrar onde a Vertho pode apoiar com
            diagnóstico, formação, IA e evidências de evolução.
          </p>

          <div ref={heroSearchRef} className="max-w-[640px]">
            <BettSearch size="large" onSelectResult={(r) => {
              router.push(r.tipo === 'escola' ? `/escola/${r.id}` : `/municipio/${r.id}`);
            }} />
            <p className="text-[11px] text-white/45 mt-3 leading-relaxed">
              Leitura inicial baseada em dados públicos oficiais. O diagnóstico completo é construído
              com a Vertho a partir da realidade da escola ou rede.
            </p>
          </div>

          <div className="flex items-center gap-3 mt-6 flex-wrap">
            <button
              onClick={() => {
                track('bett_example_click');
                router.push('/escola/35915592'); // Hugo Penteado · exemplo curado
              }}
              className="inline-flex items-center gap-1.5 text-[12px] text-cyan-300 hover:text-cyan-200"
            >
              Ver exemplo de diagnóstico <ArrowRight size={11} />
            </button>
          </div>
        </div>
      </section>

      {/* ═══════════════════ 2. RADAR REVELA · VERTHO TRANSFORMA ═══════════════════ */}
      <Section id="radar-vs-vertho">
        <div className="max-w-[1100px] mx-auto px-6">
          <SectionTitle>O Radar revela. A Vertho transforma.</SectionTitle>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
            <SplitCard
              icon={BarChart3}
              iconColor="#9ae2e6"
              eyebrow="O Radar revela"
              title="Sinais a partir de dados públicos"
              text="O Radar identifica sinais de aprendizagem, contexto escolar e oportunidades de atuação a partir de dados públicos oficiais."
              bullets={[
                'Gargalos de aprendizagem',
                'Variação entre escolas ou unidades',
                'Sinais de risco e oportunidade',
                'Hipóteses para aprofundamento',
              ]}
            />
            <SplitCard
              icon={Sparkles}
              iconColor="#34c5cc"
              eyebrow="A Vertho transforma"
              title="Leitura em mudança real"
              text="A Vertho transforma essa leitura em desenvolvimento de pessoas, plano de ação, acompanhamento por IA e evidências de evolução."
              bullets={[
                'Assessment de competências',
                'PDI individualizado',
                'Trilhas de desenvolvimento',
                'MentorIA',
                'Relatórios e dossiês de evidência',
              ]}
              destaque
            />
          </div>

          <p className="text-center text-white/65 mt-8 text-sm leading-relaxed max-w-[680px] mx-auto">
            Dados mostram sinais. <strong className="text-white/85">Pessoas transformam resultados.</strong>{' '}
            A Vertho conecta os dois.
          </p>
        </div>
      </Section>

      {/* ═══════════════════ 3. PARA QUEM É O RADAR ═══════════════════ */}
      <Section id="personas">
        <div className="max-w-[1100px] mx-auto px-6">
          <SectionTitle>Três perspectivas, uma mesma pergunta</SectionTitle>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            <PersonaCard
              icon={GraduationCap}
              titulo="Para diretores de escola"
              pergunta="Onde minha escola precisa agir primeiro?"
              texto="Veja sinais de aprendizagem, contexto e oportunidades para orientar melhor sua equipe pedagógica."
              cta="Ver exemplo para escola"
              onClick={() => {
                track('bett_persona_click', { tipo: 'escola', id: '35915592' });
                router.push('/escola/35915592');
              }}
            />
            <PersonaCard
              icon={Building2}
              titulo="Para mantenedores e redes privadas"
              pergunta="Quais unidades estão abaixo do potencial?"
              texto="Identifique diferenças entre escolas, priorize investimentos e fortaleça a gestão pedagógica da rede."
              cta="Ver exemplo para rede"
              onClick={() => {
                track('bett_persona_click');
                focarBusca();
              }}
            />
            <PersonaCard
              icon={Landmark}
              titulo="Para secretarias de educação"
              pergunta="Como priorizar apoio entre muitas escolas?"
              texto="Use dados públicos para identificar riscos, oportunidades e frentes de atuação por escola ou município."
              cta="Avaliar minha rede pública"
              onClick={() => {
                track('bett_persona_click');
                track('bett_public_cta');
                abrirLead();
              }}
              destaque
            />
          </div>
        </div>
      </Section>

      {/* ═══════════════════ 4. O QUE O RADAR REVELA ═══════════════════ */}
      <Section id="o-que-revela">
        <div className="max-w-[1100px] mx-auto px-6">
          <SectionTitle>Três camadas que o Radar combina</SectionTitle>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            <RevealCard
              num="01"
              icon={TrendingUp}
              titulo="Aprendizagem"
              texto="Sinais de desempenho em indicadores como SAEB, IDEB, proficiência e evolução histórica."
            />
            <RevealCard
              num="02"
              icon={Layers}
              titulo="Condições de execução"
              texto="Elementos de contexto que podem influenciar os resultados: participação, infraestrutura, docentes e etapa de ensino."
            />
            <RevealCard
              num="03"
              icon={Sparkles}
              titulo="Oportunidade Vertho"
              texto="Indicação das frentes em que diagnóstico, desenvolvimento de competências, gestão pedagógica e IA podem apoiar a escola ou rede."
              destaque
            />
          </div>
        </div>
      </Section>

      {/* ═══════════════════ 5. EXEMPLOS DE LEITURAS ═══════════════════ */}
      <Section id="exemplos">
        <div className="max-w-[1100px] mx-auto px-6">
          <SectionTitle>Como uma leitura inicial se traduz em oportunidade</SectionTitle>
          <p className="text-white/55 text-sm mt-2 mb-8 max-w-[640px]">
            Cenários ilustrativos baseados em padrões comuns encontrados em dados públicos. Não
            representam escolas específicas.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ExemploCard
              titulo="Baixa proficiência em matemática + boa participação"
              leitura="Os estudantes estão sendo avaliados, mas a aprendizagem não está avançando no ritmo esperado."
              oportunidade="Formação docente aplicada, trilhas por competência e acompanhamento com MentorIA."
            />
            <ExemploCard
              titulo="IDEB estagnado nos anos finais"
              leitura="Pode haver dificuldade de coordenação pedagógica, gestão de sala de aula ou acompanhamento da aprendizagem."
              oportunidade="Assessment de competências da equipe gestora, PDI e plano de ação por escola."
            />
            <ExemploCard
              titulo="Rede com grande variação entre escolas"
              leitura="Algumas escolas podem performar melhor mesmo em contextos semelhantes, indicando oportunidade de aprender com boas práticas internas."
              oportunidade="Priorização por risco, identificação de boas práticas e jornada de desenvolvimento por grupos de escolas."
            />
            <ExemploCard
              titulo="Boa estrutura, baixo resultado"
              leitura="O desafio pode estar menos em recurso físico e mais em prática pedagógica, liderança ou execução."
              oportunidade="Diagnóstico de competências, desenvolvimento de liderança escolar e acompanhamento contínuo."
            />
          </div>
        </div>
      </Section>

      {/* ═══════════════════ 6. DA LEITURA AO PLANO ═══════════════════ */}
      <Section id="fluxo">
        <div className="max-w-[1100px] mx-auto px-6">
          <SectionTitle>Como saímos do dado bruto para a mudança real</SectionTitle>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-8">
            {[
              { num: '1', titulo: 'Identifica sinais', texto: 'O Radar cruza dados públicos para apontar gargalos e oportunidades.', icon: BarChart3 },
              { num: '2', titulo: 'Gera hipóteses', texto: 'A leitura inicial ajuda a levantar hipóteses sobre aprendizagem, gestão e execução.', icon: Lightbulb },
              { num: '3', titulo: 'Aprofunda com a Vertho', texto: 'Assessment, escuta, matriz de competências e contexto da rede.', icon: Sparkles },
              { num: '4', titulo: 'Desenvolve pessoas', texto: 'Trilhas, PDIs e interações com MentorIA.', icon: Users },
              { num: '5', titulo: 'Produz evidências', texto: 'Acompanhamento de evolução, engajamento, práticas e resultados.', icon: Award },
            ].map((step, i) => (
              <FluxoCard key={i} {...step} ultimo={i === 4} />
            ))}
          </div>

          <p className="text-center text-white/65 mt-10 text-sm leading-relaxed max-w-[700px] mx-auto">
            <strong className="text-white/85">O Radar mostra onde olhar.</strong>{' '}
            A Vertho ajuda a transformar leitura em mudança real.
          </p>
        </div>
      </Section>

      {/* ═══════════════════ 7. TANGIBILIZAÇÃO ═══════════════════ */}
      <Section id="entrega">
        <div className="max-w-[1100px] mx-auto px-6">
          <SectionTitle>Mais do que análise — uma jornada prática</SectionTitle>
          <p className="text-white/55 text-sm mt-2 mb-8 max-w-[640px]">
            A solução combina mentoria por IA, planos individuais, trilhas estruturadas e relatórios
            de evidência — tudo conectado ao cotidiano da escola.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TangibleMentor />
            <TangiblePDI />
            <TangibleTrilha />
            <TangibleRelatorio />
          </div>
        </div>
      </Section>

      {/* ═══════════════════ 8. BUSCA INTERMEDIÁRIA ═══════════════════ */}
      <section className="py-12">
        <div className="max-w-[820px] mx-auto px-6 text-center">
          <h2 className="text-white mb-3"
            style={{
              fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
              fontSize: 'clamp(28px, 4vw, 40px)',
              fontWeight: 600,
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
            }}>
            Busque sua escola ou município
          </h2>
          <p className="text-white/65 text-sm mb-6 leading-relaxed">
            Veja uma primeira leitura de oportunidades e entenda onde a Vertho pode apoiar.
          </p>
          <BettSearch size="normal" />
        </div>
      </section>

      {/* ═══════════════════ 9. VAAR/FUNDEB (REDES PÚBLICAS) ═══════════════════ */}
      <Section id="publica">
        <div className="max-w-[1100px] mx-auto px-6">
          <div className="rounded-3xl p-6 sm:p-10 border"
            style={{
              background: 'linear-gradient(135deg, rgba(154,226,230,0.06), rgba(52,197,204,0.02))',
              borderColor: 'rgba(52,197,204,0.18)',
            }}>
            <div className="flex items-start gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(52,197,204,0.12)' }}>
                <Landmark size={18} style={{ color: '#9ae2e6' }} />
              </div>
              <div>
                <h2 className="text-white"
                  style={{
                    fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
                    fontSize: 'clamp(24px, 3.4vw, 34px)',
                    fontWeight: 600,
                    lineHeight: 1.18,
                    letterSpacing: '-0.02em',
                  }}>
                  Gestão, evidências e prontidão para políticas educacionais
                </h2>
              </div>
            </div>

            <p className="text-white/70 leading-relaxed text-sm mb-4">
              O Radar Vertho pode apoiar Secretarias de Educação na leitura de oportunidades
              relacionadas à gestão da rede, desenvolvimento de lideranças escolares e produção de
              evidências. Essa visão dialoga com políticas públicas como{' '}
              <strong className="text-white/90">VAAR/FUNDEB</strong>, especialmente naquilo que envolve
              gestão, mérito, desempenho e melhoria contínua.
            </p>

            <div className="rounded-xl p-4 mb-5 border border-amber-400/20"
              style={{ background: 'rgba(251,191,36,0.04)' }}>
              <p className="text-[12px] text-amber-100/80 leading-relaxed">
                <strong className="text-amber-200">Importante:</strong> a Vertho não garante repasses
                nem substitui as exigências legais das políticas públicas. O papel da solução é
                fortalecer a prontidão da rede, organizar evidências e apoiar a evolução da gestão
                escolar.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6">
              {['prontidão', 'evidências', 'gestão', 'apoio à decisão', 'fortalecimento', 'melhoria contínua'].map((tag) => (
                <span key={tag} className="text-[11px] px-3 py-1.5 rounded-full text-center"
                  style={{ background: 'rgba(154,226,230,0.08)', color: '#9ae2e6', border: '1px solid rgba(154,226,230,0.18)' }}>
                  {tag}
                </span>
              ))}
            </div>

            <button
              onClick={() => {
                track('bett_public_cta');
                abrirLead();
              }}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-bold transition-all"
              style={{
                background: 'linear-gradient(135deg, #34c5cc, #2aa8ae)',
                color: '#06172C',
              }}
            >
              Avaliar oportunidades da minha rede pública <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </Section>

      {/* ═══════════════════ 10. FONTES + METODOLOGIA + PRIVACIDADE ═══════════════════ */}
      <Section id="confianca">
        <div className="max-w-[1100px] mx-auto px-6">
          <SectionTitle>Dados públicos, leitura responsável e privacidade</SectionTitle>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            <InfoCard
              icon={Database}
              titulo="Fontes oficiais"
              texto="Bases públicas governamentais. A leitura cita ano e fonte de cada número. Sem invenção."
              tags={['INEP', 'SAEB', 'IDEB', 'Censo Escolar', 'FNDE', 'Tesouro Nacional']}
            />
            <InfoCard
              icon={FileText}
              titulo="Metodologia"
              texto="Regras de interpretação educacional consistentes geram uma primeira leitura. Não substitui um diagnóstico completo da escola ou rede."
            />
            <InfoCard
              icon={Shield}
              titulo="Privacidade"
              texto="A busca inicial usa apenas bases públicas. Informações fornecidas por escolas ou redes são tratadas de forma confidencial e usadas apenas para fins de diagnóstico e desenvolvimento."
            />
          </div>
        </div>
      </Section>

      {/* ═══════════════════ 11. CTA FINAL ═══════════════════ */}
      <Section id="cta-final">
        <div className="max-w-[820px] mx-auto px-6 text-center">
          <h2 className="text-white mb-4"
            style={{
              fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
              fontSize: 'clamp(30px, 4.5vw, 46px)',
              fontWeight: 600,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
            }}>
            Quer transformar diagnóstico em <em style={{ color: '#34c5cc', fontStyle: 'italic' }}>plano de ação?</em>
          </h2>
          <p className="text-white/65 leading-relaxed mb-8 max-w-[640px] mx-auto" style={{ fontSize: 16 }}>
            A Vertho ajuda escolas e redes a desenvolver educadores, fortalecer a gestão pedagógica
            e produzir evidências de evolução.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              onClick={() => abrirLead()}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full text-sm font-bold transition-all"
              style={{
                background: 'linear-gradient(135deg, #34c5cc, #2aa8ae)',
                color: '#06172C',
              }}
            >
              Gerar diagnóstico da minha rede <ArrowRight size={14} />
            </button>
            <button
              onClick={() => {
                track('bett_schedule_click');
                abrirLead();
              }}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full text-sm font-bold border border-white/15 text-white/85 hover:bg-white/[0.04] transition-all"
            >
              <Calendar size={14} /> Agendar conversa com a Vertho
            </button>
          </div>
        </div>
      </Section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-8 mt-12">
        <div className="max-w-[1100px] mx-auto px-6 flex flex-wrap items-center justify-between gap-3 text-[10px] tracking-[0.1em] uppercase text-white/35">
          <span>© Vertho Mentor IA · radarbett.vertho.ai</span>
          <span>Dados públicos · INEP · MEC</span>
        </div>
      </footer>

      {/* Modais e CTAs flutuantes */}
      <BettLeadModal open={leadOpen} onClose={() => setLeadOpen(false)} pre={leadPre} />
      <StickyCTAMobile onBuscar={focarBusca} onLiberar={() => abrirLead()} />
    </main>
  );
}

// ────────────────────────── Componentes ──────────────────────────

function Section({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="py-12 sm:py-16">
      {children}
    </section>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-white mt-2"
      style={{
        fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
        fontSize: 'clamp(28px, 4vw, 42px)',
        fontWeight: 600,
        lineHeight: 1.12,
        letterSpacing: '-0.02em',
      }}
    >
      {children}
    </h2>
  );
}

function SplitCard({
  icon: Icon, iconColor, eyebrow, title, text, bullets, destaque,
}: {
  icon: any; iconColor: string; eyebrow: string; title: string; text: string;
  bullets: string[]; destaque?: boolean;
}) {
  return (
    <div
      className="rounded-3xl p-6 sm:p-7 border"
      style={{
        background: destaque
          ? 'linear-gradient(135deg, rgba(52,197,204,0.10), rgba(52,197,204,0.02))'
          : 'rgba(255,255,255,0.025)',
        borderColor: destaque ? 'rgba(52,197,204,0.25)' : 'rgba(255,255,255,0.08)',
      }}
    >
      <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
        style={{ background: `${iconColor}1A` }}>
        <Icon size={20} style={{ color: iconColor }} />
      </div>
      <p className="text-[10px] tracking-[0.2em] uppercase font-mono text-white/55 mb-1.5">
        {eyebrow}
      </p>
      <h3 className="text-white text-xl font-bold mb-3 leading-snug">{title}</h3>
      <p className="text-white/65 text-sm leading-relaxed mb-4">{text}</p>
      <ul className="space-y-2">
        {bullets.map((b) => (
          <li key={b} className="flex items-center gap-2 text-[13px] text-white/85">
            <Check size={13} className="text-cyan-400 flex-shrink-0" /> {b}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PersonaCard({
  icon: Icon, titulo, pergunta, texto, cta, onClick, destaque,
}: {
  icon: any; titulo: string; pergunta: string; texto: string;
  cta: string; onClick: () => void; destaque?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-2xl p-6 border transition-all hover:translate-y-[-2px] hover:shadow-xl"
      style={{
        background: destaque
          ? 'linear-gradient(135deg, rgba(52,197,204,0.06), rgba(255,255,255,0.025))'
          : 'rgba(255,255,255,0.025)',
        borderColor: destaque ? 'rgba(52,197,204,0.3)' : 'rgba(255,255,255,0.08)',
      }}
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
        style={{ background: 'rgba(52,197,204,0.12)' }}>
        <Icon size={18} style={{ color: '#34c5cc' }} />
      </div>
      <p className="text-[11px] tracking-[0.18em] uppercase font-mono text-white/45 mb-1.5">
        {titulo}
      </p>
      <h3 className="text-white text-base font-bold mb-3 leading-snug" style={{
        fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
        fontSize: 19,
      }}>
        {pergunta}
      </h3>
      <p className="text-white/60 text-[13px] leading-relaxed mb-4">{texto}</p>
      <span className="inline-flex items-center gap-1 text-[12px] font-bold text-cyan-300">
        {cta} <ArrowRight size={11} />
      </span>
    </button>
  );
}

function RevealCard({
  num, icon: Icon, titulo, texto, destaque,
}: {
  num: string; icon: any; titulo: string; texto: string; destaque?: boolean;
}) {
  return (
    <div
      className="rounded-2xl p-6 border"
      style={{
        background: destaque ? 'rgba(52,197,204,0.06)' : 'rgba(255,255,255,0.025)',
        borderColor: destaque ? 'rgba(52,197,204,0.25)' : 'rgba(255,255,255,0.08)',
      }}
    >
      <div className="flex items-baseline justify-between mb-3">
        <Icon size={18} style={{ color: destaque ? '#34c5cc' : '#9ae2e6' }} />
        <span className="text-[10px] font-mono text-white/30">{num}</span>
      </div>
      <h3 className="text-white text-base font-bold mb-2 leading-snug">{titulo}</h3>
      <p className="text-white/60 text-[13px] leading-relaxed">{texto}</p>
    </div>
  );
}

function ExemploCard({ titulo, leitura, oportunidade }: { titulo: string; leitura: string; oportunidade: string }) {
  return (
    <div
      className="rounded-2xl p-6 border"
      style={{
        background: 'rgba(255,255,255,0.025)',
        borderColor: 'rgba(255,255,255,0.08)',
      }}
    >
      <h3 className="text-white text-[15px] font-bold mb-4 leading-snug">{titulo}</h3>
      <div className="mb-3 pl-3 border-l-2 border-cyan-400/30">
        <p className="text-[10px] tracking-[0.18em] uppercase font-mono text-cyan-300/70 mb-1">
          Leitura
        </p>
        <p className="text-white/75 text-[13px] leading-relaxed">{leitura}</p>
      </div>
      <div className="pl-3 border-l-2 border-emerald-400/30">
        <p className="text-[10px] tracking-[0.18em] uppercase font-mono text-emerald-300/70 mb-1">
          Oportunidade Vertho
        </p>
        <p className="text-white/75 text-[13px] leading-relaxed">{oportunidade}</p>
      </div>
    </div>
  );
}

function FluxoCard({
  num, titulo, texto, icon: Icon, ultimo,
}: {
  num: string; titulo: string; texto: string; icon: any; ultimo?: boolean;
}) {
  return (
    <div className="relative">
      <div
        className="rounded-2xl p-5 border h-full"
        style={{
          background: ultimo
            ? 'linear-gradient(135deg, rgba(52,197,204,0.10), rgba(255,255,255,0.025))'
            : 'rgba(255,255,255,0.025)',
          borderColor: ultimo ? 'rgba(52,197,204,0.3)' : 'rgba(255,255,255,0.08)',
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-mono text-white/35 tabular-nums">{num.padStart(2, '0')}</span>
          <Icon size={14} style={{ color: ultimo ? '#34c5cc' : '#9ae2e6' }} />
        </div>
        <h3 className="text-white text-sm font-bold mb-1.5 leading-snug">{titulo}</h3>
        <p className="text-white/55 text-[12px] leading-relaxed">{texto}</p>
      </div>
    </div>
  );
}

function InfoCard({
  icon: Icon, titulo, texto, tags,
}: {
  icon: any; titulo: string; texto: string; tags?: string[];
}) {
  return (
    <div
      className="rounded-2xl p-6 border"
      style={{
        background: 'rgba(255,255,255,0.025)',
        borderColor: 'rgba(255,255,255,0.08)',
      }}
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
        style={{ background: 'rgba(154,226,230,0.10)' }}>
        <Icon size={18} style={{ color: '#9ae2e6' }} />
      </div>
      <h3 className="text-white text-base font-bold mb-2">{titulo}</h3>
      <p className="text-white/60 text-[13px] leading-relaxed mb-3">{texto}</p>
      {tags && tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {tags.map((t) => (
            <span key={t} className="text-[10px] px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(154,226,230,0.06)', color: '#9ae2e6', border: '1px solid rgba(154,226,230,0.15)' }}>
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ────────────── Mockups da Seção 7 (estilizados, não fotorealistas) ──────────────

function TangibleMentor() {
  return (
    <div className="rounded-2xl p-6 border" style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.08)' }}>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(52,197,204,0.12)' }}>
          <MessageCircle size={16} style={{ color: '#34c5cc' }} />
        </div>
        <div>
          <p className="text-[10px] tracking-[0.18em] uppercase font-mono text-cyan-300/70">MentorIA</p>
          <h3 className="text-white text-sm font-bold">Conversa que vira prática</h3>
        </div>
      </div>

      <div className="space-y-2 my-4">
        <BubbleIA>
          Pelo diagnóstico, sua principal oportunidade está em acompanhamento pedagógico. Vamos
          praticar uma conversa de feedback com um professor?
        </BubbleIA>
        <BubbleUser>Sim, quero treinar.</BubbleUser>
        <BubbleIA>
          Ótimo. Vou simular uma situação real e depois te dar feedback.
        </BubbleIA>
      </div>

      <p className="text-[11px] text-white/45 leading-relaxed">
        A Vertho pode operar por experiências conversacionais em ambiente web ou canais integrados,
        conforme configuração do projeto.
      </p>
    </div>
  );
}

function BubbleIA({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold"
        style={{ background: '#34c5cc', color: '#06172C' }}>
        IA
      </div>
      <div className="flex-1 rounded-2xl rounded-tl-sm px-3 py-2 text-[12px] text-white/80 leading-relaxed"
        style={{ background: 'rgba(52,197,204,0.08)', border: '1px solid rgba(52,197,204,0.18)' }}>
        {children}
      </div>
    </div>
  );
}

function BubbleUser({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 justify-end">
      <div className="rounded-2xl rounded-tr-sm px-3 py-2 text-[12px] text-white/85 leading-relaxed max-w-[75%]"
        style={{ background: 'rgba(255,255,255,0.06)' }}>
        {children}
      </div>
      <div className="w-6 h-6 rounded-full flex-shrink-0" style={{ background: 'rgba(255,255,255,0.10)' }} />
    </div>
  );
}

function TangiblePDI() {
  return (
    <div className="rounded-2xl p-6 border" style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.08)' }}>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(154,226,230,0.12)' }}>
          <Target size={16} style={{ color: '#9ae2e6' }} />
        </div>
        <div>
          <p className="text-[10px] tracking-[0.18em] uppercase font-mono text-cyan-300/70">PDI</p>
          <h3 className="text-white text-sm font-bold">Plano individual com evidência esperada</h3>
        </div>
      </div>

      <div className="space-y-2.5 mt-4">
        <PdiRow label="Competência" value="Gestão pedagógica baseada em evidências" />
        <PdiRow label="Nível atual" value="Em desenvolvimento" pillColor="#FCD34D" />
        <PdiRow label="Objetivo" value="Evoluir para prática consistente" pillColor="#34D399" />
        <PdiRow label="Ação recomendada" value="Realizar ciclos quinzenais de análise de aprendizagem com a coordenação." />
        <PdiRow label="Evidência esperada" value="Registro de reunião, plano de intervenção e acompanhamento de resultado." />
      </div>
    </div>
  );
}

function PdiRow({ label, value, pillColor }: { label: string; value: string; pillColor?: string }) {
  return (
    <div>
      <p className="text-[9px] tracking-[0.2em] uppercase font-mono text-white/35 mb-0.5">{label}</p>
      {pillColor ? (
        <span className="inline-block text-[11px] px-2 py-0.5 rounded-full"
          style={{ background: `${pillColor}1A`, color: pillColor, border: `1px solid ${pillColor}33` }}>
          {value}
        </span>
      ) : (
        <p className="text-[12px] text-white/80 leading-relaxed">{value}</p>
      )}
    </div>
  );
}

function TangibleTrilha() {
  const semanas = [
    { num: 1, titulo: 'Diagnóstico e priorização' },
    { num: 2, titulo: 'Prática guiada' },
    { num: 3, titulo: 'Aplicação na escola' },
    { num: 4, titulo: 'Reflexão e evidência' },
    { num: 5, titulo: 'Nova prática' },
  ];
  return (
    <div className="rounded-2xl p-6 border" style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.08)' }}>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(52,197,204,0.12)' }}>
          <Layers size={16} style={{ color: '#34c5cc' }} />
        </div>
        <div>
          <p className="text-[10px] tracking-[0.18em] uppercase font-mono text-cyan-300/70">Trilha</p>
          <h3 className="text-white text-sm font-bold">Desenvolvimento no cotidiano da escola</h3>
        </div>
      </div>

      <div className="space-y-2 my-4">
        {semanas.map((s, i) => (
          <div key={s.num} className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-mono font-bold flex-shrink-0"
              style={{
                background: i === 0 ? '#34c5cc' : 'rgba(255,255,255,0.06)',
                color: i === 0 ? '#06172C' : '#9ae2e6',
              }}>
              {s.num}
            </div>
            <p className="text-[12px] text-white/75">Semana {s.num}: {s.titulo}</p>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-white/45 leading-relaxed">
        Conecta diagnóstico, conteúdo, prática e evidência para que o desenvolvimento aconteça no
        cotidiano da escola.
      </p>
    </div>
  );
}

function TangibleRelatorio() {
  return (
    <div className="rounded-2xl p-6 border" style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.08)' }}>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(154,226,230,0.12)' }}>
          <FileText size={16} style={{ color: '#9ae2e6' }} />
        </div>
        <div>
          <p className="text-[10px] tracking-[0.18em] uppercase font-mono text-cyan-300/70">Evidências</p>
          <h3 className="text-white text-sm font-bold">Mais que certificado de participação</h3>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 my-4">
        <Metric label="Participação" value="93%" cor="#34D399" />
        <Metric label="Evolução média" value="+1.4" cor="#34c5cc" />
        <Metric label="Ações concluídas" value="22" cor="#9ae2e6" />
        <Metric label="Evidências" value="14" cor="#FCD34D" />
      </div>

      <p className="text-[11px] text-white/45 leading-relaxed">
        A rede acompanha o desenvolvimento com evidências, não apenas certificados de participação.
      </p>
    </div>
  );
}

function Metric({ label, value, cor }: { label: string; value: string; cor: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <p className="text-[9px] tracking-[0.2em] uppercase font-mono text-white/40 mb-1">{label}</p>
      <p className="text-xl font-bold tabular-nums" style={{ color: cor, fontFamily: 'var(--font-serif, "Instrument Serif", serif)' }}>
        {value}
      </p>
    </div>
  );
}
