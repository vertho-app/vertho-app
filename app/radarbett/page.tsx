'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight, Sparkles, BarChart3, TrendingUp, Layers,
  GraduationCap, Building2, Landmark, FileText, Database,
  Calendar, Shield,
} from 'lucide-react';
import { BettHeader } from './_components/bett-header';
import { BettSearch } from './_components/bett-search';
import { BettLeadModal } from './_components/bett-lead-modal';
import { StickyCTAMobile } from './_components/sticky-cta';
import { WhatsappIcon } from './_components/whatsapp-icon';
import { track } from './_lib/tracking';
import { openWhatsAppAgendar } from './_lib/whatsapp';

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
      <BettHeader />

      {/* ═══════════════════ 1. HERO + BUSCA ═══════════════════ */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute"
          style={{ right: -180, top: -150, width: 600, height: 600, border: '60px solid rgba(52,197,204,0.06)', borderRadius: '50%' }} />
        <div aria-hidden className="pointer-events-none absolute"
          style={{ left: -200, bottom: -200, width: 480, height: 480, border: '40px solid rgba(154,226,230,0.04)', borderRadius: '50%' }} />

        <div className="max-w-[1100px] mx-auto px-6 pt-12 sm:pt-20 pb-16 relative">
          <p className="text-cyan-300/85 mb-4" style={{
            fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}>
            Demonstração especial Bett Brasil 2026
          </p>
          <h1
            className="text-white mb-5"
            style={{
              fontFamily: 'var(--font-fraunces), "Fraunces", Georgia, serif',
              fontWeight: 600,
              fontSize: 'clamp(34px, 6vw, 64px)',
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
              maxWidth: 920,
            }}
          >
            Sua escola ou rede já sabe <em style={{ color: '#34c5cc', fontStyle: 'italic' }}>onde precisa agir primeiro?</em>
          </h1>
          <p className="text-white/75 leading-relaxed mb-3" style={{ fontSize: 17, maxWidth: 720 }}>
            Busque uma escola ou município e veja sinais de aprendizagem, contexto e oportunidades de
            atuação para a Vertho.
          </p>
          <p className="text-white/55 leading-relaxed mb-8" style={{ fontSize: 14, maxWidth: 720 }}>
            Em poucos segundos, veja uma primeira leitura baseada em dados públicos oficiais.
          </p>

          <div ref={heroSearchRef} className="max-w-[640px]">
            <BettSearch size="large" onSelectResult={(r) => {
              router.push(r.tipo === 'escola' ? `/escola/${r.id}` : `/municipio/${r.id}`);
            }} />
            <p className="text-[11px] text-white/45 mt-3 leading-relaxed">
              Leitura inicial baseada em dados públicos oficiais. O diagnóstico completo é construído
              com a Vertho a partir da realidade da escola ou rede.
              {' '}
              <a href="/buscar" className="text-cyan-300/80 hover:text-cyan-200 underline underline-offset-2 ml-1">
                Busca avançada com filtros →
              </a>
            </p>
          </div>

          <div className="flex items-center gap-3 mt-6 flex-wrap">
            <button
              onClick={() => {
                track('bett_example_click');
                router.push('/escola/35012245?demo=1'); // Yolanda Conte (Sao Vicente/SP) · 5 sinais + oportunidade, demo aberto
              }}
              className="inline-flex items-center gap-1.5 text-[13px] font-bold text-cyan-300 hover:text-cyan-200"
            >
              Ver exemplo de diagnóstico <ArrowRight size={12} />
            </button>
          </div>

          {/* Mockup browser preview — cards Ideb / Saeb / Infra */}
          <div className="mt-12 sm:mt-16 max-w-[960px]">
            <div className="rounded-2xl overflow-hidden border"
              style={{
                background: 'rgba(255,255,255,0.03)',
                borderColor: 'rgba(255,255,255,0.10)',
                boxShadow: '0 40px 80px -20px rgba(0,0,0,0.5)',
              }}>
              <div className="px-5 py-3 border-b flex items-center gap-2"
                style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#ff5f57' }} />
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#febc2e' }} />
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#28c840' }} />
                <span className="ml-3 flex-1 px-3 py-1.5 rounded text-[11px] text-white/55 font-mono"
                  style={{ background: 'rgba(255,255,255,0.06)' }}>
                  radarbett.vertho.ai/escola/29061920
                </span>
              </div>
              <div className="p-5 sm:p-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <PreviewCard label="Ideb · 9º ano" value="2,8" delta="−1,53 vs microrregião" deltaColor="#fca5a5" valueColor="#fca5a5" barPct={47} barColor="#dc2626" />
                <PreviewCard label="Saeb · Português" value="211" delta="−26 pts vs pares" deltaColor="#fca5a5" valueColor="#fca5a5" barPct={70} barColor="#ea580c" />
                <PreviewCard label="Infra Pedagógica" value="18" suffix="/100" delta="Crítica" deltaColor="rgba(255,255,255,0.55)" valueColor="#34c5cc" barPct={18} barColor="#dc2626" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ 1B. STATS ═══════════════════ */}
      <section className="pb-16 sm:pb-20">
        <div className="max-w-[1100px] mx-auto px-6">
          <div className="rounded-2xl overflow-hidden border grid grid-cols-2 sm:grid-cols-4"
            style={{ borderColor: 'rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.02)' }}>
            <StatCell num="200k+" desc="Escolas mapeadas" />
            <StatCell num="5.570" desc="Municípios cobertos" />
            <StatCell num="8" desc="Fontes oficiais cruzadas" />
            <StatCell num="<10s" desc="Diagnóstico gerado" />
          </div>
        </div>
      </section>

      {/* ═══════════════════ 2. RADAR REVELA · VERTHO TRANSFORMA ═══════════════════ */}
      <Section id="radar-vs-vertho">
        <div className="max-w-[1100px] mx-auto px-6">
          <SectionTitle>O Radar revela. A Vertho transforma.</SectionTitle>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
            <SplitCard
              tone="radar"
              icon={BarChart3}
              iconColor="#34c5cc"
              eyebrow="O Radar revela"
              title="Sinais a partir de dados públicos"
              text="O Radar identifica sinais de aprendizagem, contexto escolar e oportunidades de atuação a partir de dados públicos oficiais."
              bullets={[
                'Gargalos de aprendizagem por disciplina e etapa',
                'Variação entre escolas de mesmo perfil socioeconômico',
                'Sinais de risco em infraestrutura e formação docente',
                'Hipóteses contextualizadas para aprofundamento',
              ]}
            />
            <SplitCard
              tone="vertho"
              icon={Sparkles}
              iconColor="#9e4edd"
              eyebrow="A Vertho transforma"
              title="Leitura em mudança real"
              text="A Vertho transforma essa leitura em desenvolvimento de pessoas, plano de ação, acompanhamento por IA e evidências de evolução."
              bullets={[
                'Assessment de competências da equipe',
                'PDI individualizado por gestor',
                'Trilhas de desenvolvimento no cotidiano',
                'MentorIA — conversa que vira prática',
                'Relatórios e dossiês de evidência',
              ]}
            />
          </div>

          <p className="text-center text-white/65 mt-8 text-sm leading-relaxed max-w-[680px] mx-auto">
            Dados mostram sinais. <strong className="text-white/85">Pessoas transformam resultados.</strong>{' '}
            A Vertho conecta os dois.
          </p>
        </div>
      </Section>

      {/* ═══════════════════ 3. EXEMPLOS DE LEITURAS ═══════════════════ */}
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

      {/* ═══════════════════ 4. O QUE O RADAR REVELA ═══════════════════ */}
      <Section id="o-que-revela">
        <div className="max-w-[1100px] mx-auto px-6">
          <SectionTitle>Três camadas que o Radar combina</SectionTitle>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            <RevealCard
              num="01"
              icon={TrendingUp}
              titulo="Aprendizagem"
              texto="Sinais de desempenho em indicadores como Saeb, Ideb, ENEM, ICA (alfabetização) e SARESP, com proficiência por etapa e evolução histórica."
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

      {/* ═══════════════════ 6. JORNADA — STEPS TRACK ═══════════════════ */}
      <Section id="fluxo">
        <div className="max-w-[1100px] mx-auto px-6">
          <SectionTitle>Cinco passos do sinal à evidência de evolução</SectionTitle>
          <p className="text-white/55 mt-2 mb-12 max-w-[640px]" style={{ fontSize: 16, lineHeight: 1.65 }}>
            Um caminho claro que começa no dado público e termina em mudança mensurável.
          </p>

          {/* Steps track horizontal — linha conectora gradient cyan→purple→green */}
          <div className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-y-8 gap-x-3 mt-4">
            <div aria-hidden className="hidden lg:block absolute h-[2px] top-8 left-[10%] right-[10%]"
              style={{
                background: 'linear-gradient(90deg, #34c5cc 0%, #9e4edd 50%, #16a34a 100%)',
                opacity: 0.35,
              }} />
            {[
              { num: '01', titulo: 'Identifica sinais', texto: 'Cruzamento de dados públicos para apontar gargalos e oportunidades.', tone: 'cyan' },
              { num: '02', titulo: 'Gera hipóteses',   texto: 'Leitura inicial sobre aprendizagem, gestão e execução.', tone: 'cyanLight' },
              { num: '03', titulo: 'Aprofunda',         texto: 'Assessment, escuta, matriz de competências e contexto da rede.', tone: 'purpleLight' },
              { num: '04', titulo: 'Desenvolve',        texto: 'Trilhas, PDIs personalizados e interações com MentorIA.', tone: 'purple' },
              { num: '05', titulo: 'Evidência',         texto: 'Acompanhamento de evolução, engajamento e resultados.', tone: 'green' },
            ].map((s) => (
              <Step key={s.num} {...(s as any)} />
            ))}
          </div>

          <p className="text-center text-white/65 mt-12 text-sm leading-relaxed max-w-[700px] mx-auto">
            <strong className="text-white/85">O Radar mostra onde olhar.</strong>{' '}
            A Vertho ajuda a transformar leitura em mudança real.
          </p>
        </div>
      </Section>

      {/* ═══════════════════ 7. PRODUTO ═══════════════════ */}
      <Section id="entrega">
        <div className="max-w-[1100px] mx-auto px-6">
          <SectionTitle>Mais do que análise — uma jornada prática</SectionTitle>
          <p className="text-white/55 mt-2 mb-12 max-w-[640px]" style={{ fontSize: 16, lineHeight: 1.65 }}>
            Mentoria por IA, planos individuais, trilhas estruturadas e relatórios de evidência —
            tudo conectado ao cotidiano da escola.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* MentorIA — cyan */}
            <ProdutoCard tone="cyan" badge="MentorIA" title="Conversa que vira prática"
              lead="IA conversacional que transforma diagnóstico em treino prático — simulações, feedback e acompanhamento contínuo.">
              <DemoBox>
                <DemoLabel>Exemplo de interação</DemoLabel>
                <ChatBubbleIA>Pelo diagnóstico, sua principal oportunidade está em acompanhamento pedagógico. Vamos praticar uma conversa de feedback?</ChatBubbleIA>
                <ChatBubbleUser>Sim, quero treinar.</ChatBubbleUser>
                <ChatBubbleIA>Ótimo. Vou simular uma situação real e depois te dar feedback.</ChatBubbleIA>
              </DemoBox>
            </ProdutoCard>

            {/* PDI — purple */}
            <ProdutoCard tone="purple" badge="PDI" title="Plano individual com evidência"
              lead="Cada gestor recebe um plano de desenvolvimento conectado a competências, com ações concretas e evidências esperadas.">
              <DemoBox>
                <DemoLabel>Exemplo de competência</DemoLabel>
                <MetricRow label="Competência" value="Gestão pedagógica" />
                <MetricRow label="Nível atual" value="Em desenvolvimento" valueColor="#fb923c" />
                <MetricRow label="Objetivo" value="Prática consistente" />
                <MetricRow label="Evidência" value="Registro + intervenção" valueColor="#34c5cc" />
              </DemoBox>
            </ProdutoCard>

            {/* Trilhas — green */}
            <ProdutoCard tone="green" badge="Trilhas" title="Desenvolvimento no cotidiano"
              lead="Jornadas semanais que conectam diagnóstico, conteúdo, prática e evidência para que o desenvolvimento aconteça no dia a dia.">
              <DemoBox>
                <DemoLabel>Estrutura tipo</DemoLabel>
                <MetricRow label="Semana 1" value="Diagnóstico e priorização" />
                <MetricRow label="Semana 2" value="Prática guiada" />
                <MetricRow label="Semana 3" value="Aplicação na escola" />
                <MetricRow label="Semana 4" value="Reflexão e evidência" />
              </DemoBox>
            </ProdutoCard>

            {/* Evidências — orange */}
            <ProdutoCard tone="orange" badge="Evidências" title="Mais que certificado de participação"
              lead="A rede acompanha o desenvolvimento com dados reais — evolução de competências, engajamento e ações concluídas.">
              <DemoBox>
                <DemoLabel>Painel da rede</DemoLabel>
                <MetricRow label="Participação" value="93%" valueColor="#86efac" />
                <MetricRow label="Evolução média" value="+1.4 níveis" valueColor="#34c5cc" />
                <MetricRow label="Ações concluídas" value="22" />
                <MetricRow label="Evidências registradas" value="14" />
              </DemoBox>
            </ProdutoCard>
          </div>
        </div>
      </Section>

      {/* ═══════════════════ 8. PARA QUEM É O RADAR ═══════════════════ */}
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
                track('bett_persona_click', { tipo: 'escola', id: '35012245' });
                router.push('/escola/35012245?demo=1');
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

      {/* ═══════════════════ 9. BUSCA INTERMEDIÁRIA ═══════════════════ */}
      <section className="py-12">
        <div className="max-w-[820px] mx-auto px-6 text-center">
          <h2 className="text-white mb-3"
            style={{
              fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif',
              fontSize: 'clamp(26px, 3.6vw, 36px)',
              fontWeight: 700,
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
                    fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif',
                    fontSize: 'clamp(22px, 3vw, 30px)',
                    fontWeight: 700,
                    lineHeight: 1.2,
                    letterSpacing: '-0.02em',
                  }}>
                  Para Secretarias: priorização, evidências e prontidão da rede
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
              Avaliar minha rede pública <ArrowRight size={14} />
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
              tags={['INEP', 'Saeb', 'Ideb', 'ENEM', 'ICA', 'SARESP', 'Censo Escolar', 'FNDE/FUNDEB', 'Tesouro Nacional']}
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
              fontFamily: 'var(--font-fraunces), "Fraunces", Georgia, serif',
              fontSize: 'clamp(28px, 4.2vw, 44px)',
              fontWeight: 600,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
            }}>
            O diagnóstico inicial mostra onde olhar.{' '}
            <em style={{ color: '#34c5cc', fontStyle: 'italic' }}>A Vertho ajuda sua escola ou rede a agir.</em>
          </h2>
          <p className="text-white/65 leading-relaxed mb-8 max-w-[680px] mx-auto" style={{ fontSize: 16 }}>
            Transforme sinais de aprendizagem, contexto e gestão em plano de ação, desenvolvimento de
            pessoas e evidências de evolução.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              onClick={focarBusca}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full text-sm font-bold transition-all"
              style={{
                background: 'linear-gradient(135deg, #34c5cc, #2aa8ae)',
                color: '#06172C',
              }}
            >
              Ver diagnóstico inicial <ArrowRight size={14} />
            </button>
            <button
              onClick={() => {
                track('bett_schedule_click');
                openWhatsAppAgendar({ tipo: 'cta' });
              }}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full text-sm font-bold transition-all"
              style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)', color: '#06172C' }}
            >
              <WhatsappIcon size={15} /> Agendar conversa na Bett
            </button>
          </div>
        </div>
      </Section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-8 mt-12">
        <div className="max-w-[1100px] mx-auto px-6 flex flex-wrap items-center justify-between gap-3 eyebrow-manrope-sm text-white/40">
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

function Step({ num, titulo, texto, tone }: { num: string; titulo: string; texto: string; tone: string }) {
  const styles: Record<string, { bg: string; color: string; border: string }> = {
    cyan:        { bg: 'rgba(52,197,204,0.15)',  color: '#34c5cc', border: 'rgba(52,197,204,0.30)' },
    cyanLight:   { bg: 'rgba(52,197,204,0.12)',  color: '#9ae2e6', border: 'rgba(52,197,204,0.25)' },
    purpleLight: { bg: 'rgba(158,78,221,0.12)',  color: '#c084fc', border: 'rgba(158,78,221,0.25)' },
    purple:      { bg: 'rgba(158,78,221,0.15)',  color: '#c084fc', border: 'rgba(158,78,221,0.30)' },
    green:       { bg: 'rgba(22,163,74,0.15)',   color: '#86efac', border: 'rgba(22,163,74,0.30)' },
  };
  const s = styles[tone] || styles.cyan;
  return (
    <div className="relative text-center px-2">
      <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center relative z-10 border"
        style={{ background: s.bg, color: s.color, borderColor: s.border }}>
        <span style={{
          fontFamily: 'var(--font-fraunces), "Fraunces", Georgia, serif',
          fontSize: 22, fontWeight: 600,
        }}>
          {num}
        </span>
      </div>
      <h4 className="text-white text-[15px] font-bold mb-1.5">{titulo}</h4>
      <p className="text-white/55 leading-relaxed" style={{ fontSize: 13.5 }}>{texto}</p>
    </div>
  );
}

function PreviewCard({
  label, value, suffix, delta, deltaColor, valueColor, barPct, barColor,
}: {
  label: string; value: string; suffix?: string; delta: string;
  deltaColor: string; valueColor: string; barPct: number; barColor: string;
}) {
  return (
    <div className="rounded-xl p-5 border"
      style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}>
      <p className="text-[10px] tracking-[0.10em] uppercase text-white/55 font-bold mb-3">{label}</p>
      <p className="leading-none mb-1.5" style={{
        fontFamily: 'var(--font-fraunces), "Fraunces", Georgia, serif',
        fontSize: 36, fontWeight: 600, color: valueColor,
      }}>
        {value}{suffix && <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.30)' }}>{suffix}</span>}
      </p>
      <p className="text-[12px] font-bold mb-3" style={{ color: deltaColor }}>{delta}</p>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div className="h-full rounded-full" style={{ width: `${barPct}%`, background: barColor }} />
      </div>
    </div>
  );
}

function StatCell({ num, desc }: { num: string; desc: string }) {
  return (
    <div className="px-5 py-7 sm:py-8 text-center border-r border-b"
      style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
      <p className="leading-none mb-2" style={{
        fontFamily: 'var(--font-fraunces), "Fraunces", Georgia, serif',
        fontSize: 'clamp(28px, 3.5vw, 40px)', fontWeight: 600, color: '#34c5cc',
      }}>
        {num}
      </p>
      <p className="text-[12px] sm:text-[13px] text-white/55 font-medium">{desc}</p>
    </div>
  );
}

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
        fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif',
        fontSize: 'clamp(26px, 3.6vw, 38px)',
        fontWeight: 700,
        lineHeight: 1.15,
        letterSpacing: '-0.02em',
      }}
    >
      {children}
    </h2>
  );
}

function SplitCard({
  icon: Icon, iconColor, eyebrow, title, text, bullets, destaque, tone,
}: {
  icon: any; iconColor: string; eyebrow: string; title: string; text: string;
  bullets: string[]; destaque?: boolean; tone?: 'radar' | 'vertho';
}) {
  // tone='radar' (cyan) ou 'vertho' (purple) — usado na border-left e no eyebrow
  const accent = tone === 'vertho' ? '#9e4edd' : '#34c5cc';
  return (
    <div
      className="relative rounded-3xl p-6 sm:p-8 border overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.025)',
        borderColor: 'rgba(255,255,255,0.10)',
      }}
    >
      {/* border-left colored stripe */}
      <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: accent }} />

      <p className="mb-4" style={{
        color: accent,
        fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
      }}>
        {eyebrow}
      </p>
      <h3 className="text-white mb-5" style={{
        fontFamily: 'var(--font-fraunces), "Fraunces", Georgia, serif',
        fontSize: 'clamp(22px, 2.2vw, 26px)',
        fontWeight: 600,
        lineHeight: 1.2,
        letterSpacing: '-0.01em',
      }}>{title}</h3>
      <p className="text-white/70 leading-relaxed mb-5" style={{ fontSize: 15 }}>{text}</p>
      <ul className="space-y-3">
        {bullets.map((b) => (
          <li key={b} className="relative pl-6 text-[15px] text-white/75 leading-relaxed">
            <span aria-hidden className="absolute left-0 top-2 w-2 h-2 rounded-sm"
              style={{ background: accent, opacity: 0.55 }} />
            {b}
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
      <p className="text-white/45 mb-2" style={{
        fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
      }}>
        {titulo}
      </p>
      <h3 className="text-white mb-3" style={{
        fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif',
        fontSize: 'clamp(20px, 2vw, 22px)',
        fontWeight: 700,
        lineHeight: 1.2,
        letterSpacing: '-0.02em',
      }}>
        {pergunta}
      </h3>
      <p className="text-white/65 leading-relaxed mb-4" style={{ fontSize: 14 }}>{texto}</p>
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
      <h3 className="text-white mb-2" style={{
        fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif',
        fontSize: 18,
        fontWeight: 700,
        lineHeight: 1.25,
        letterSpacing: '-0.01em',
      }}>{titulo}</h3>
      <p className="text-white/65 leading-relaxed" style={{ fontSize: 14 }}>{texto}</p>
    </div>
  );
}

function ExemploCard({ titulo, leitura, oportunidade }: { titulo: string; leitura: string; oportunidade: string }) {
  const eyebrowStyle: React.CSSProperties = {
    fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
  };
  return (
    <div
      className="rounded-2xl p-6 border"
      style={{
        background: 'rgba(255,255,255,0.025)',
        borderColor: 'rgba(255,255,255,0.08)',
      }}
    >
      <h3 className="text-white mb-4" style={{
        fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif',
        fontSize: 17,
        fontWeight: 700,
        lineHeight: 1.25,
        letterSpacing: '-0.01em',
      }}>{titulo}</h3>
      <div className="mb-3 pl-3 border-l-2 border-cyan-400/30">
        <p className="text-cyan-300/85 mb-1" style={eyebrowStyle}>Leitura</p>
        <p className="text-white/75 leading-relaxed" style={{ fontSize: 14 }}>{leitura}</p>
      </div>
      <div className="pl-3 border-l-2 border-emerald-400/30">
        <p className="text-emerald-300/85 mb-1" style={eyebrowStyle}>Oportunidade Vertho</p>
        <p className="text-white/75 leading-relaxed" style={{ fontSize: 14 }}>{oportunidade}</p>
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
      <h3 className="text-white mb-2" style={{
        fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif',
        fontSize: 18,
        fontWeight: 700,
        lineHeight: 1.25,
        letterSpacing: '-0.01em',
      }}>{titulo}</h3>
      <p className="text-white/65 leading-relaxed mb-3" style={{ fontSize: 14 }}>{texto}</p>
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

/* ─── Produto Card (handoff Bett) ─────────────────────────────────────── */

const PRODUTO_TONES: Record<string, { badgeBg: string; badgeText: string; border: string }> = {
  cyan:   { badgeBg: 'rgba(52,197,204,0.15)',  badgeText: '#34c5cc', border: 'rgba(52,197,204,0.25)' },
  purple: { badgeBg: 'rgba(158,78,221,0.15)',  badgeText: '#c084fc', border: 'rgba(158,78,221,0.25)' },
  green:  { badgeBg: 'rgba(22,163,74,0.15)',   badgeText: '#86efac', border: 'rgba(22,163,74,0.25)'  },
  orange: { badgeBg: 'rgba(234,88,12,0.15)',   badgeText: '#fb923c', border: 'rgba(234,88,12,0.25)'  },
};

function ProdutoCard({
  tone, badge, title, lead, children,
}: {
  tone: keyof typeof PRODUTO_TONES; badge: string; title: string; lead: string;
  children: React.ReactNode;
}) {
  const t = PRODUTO_TONES[tone];
  return (
    <div className="rounded-3xl p-7 sm:p-9 border transition-colors"
      style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.10)' }}>
      <span className="inline-flex px-3 py-1 rounded-md mb-4 text-[11px] font-bold uppercase tracking-[0.10em]"
        style={{ background: t.badgeBg, color: t.badgeText }}>
        {badge}
      </span>
      <h4 className="text-white mb-3" style={{
        fontFamily: 'var(--font-fraunces), "Fraunces", Georgia, serif',
        fontSize: 22, fontWeight: 600, lineHeight: 1.2,
      }}>{title}</h4>
      <p className="text-white/55 mb-5" style={{ fontSize: 14, lineHeight: 1.65 }}>{lead}</p>
      {children}
    </div>
  );
}

function DemoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4 border space-y-2"
      style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
      {children}
    </div>
  );
}

function DemoLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-[0.10em] font-bold text-white/30 mb-2">
      {children}
    </p>
  );
}

function ChatBubbleIA({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl px-3.5 py-3 text-[13px] leading-relaxed"
      style={{
        background: 'rgba(52,197,204,0.10)',
        border: '1px solid rgba(52,197,204,0.20)',
        color: '#9ae2e6',
      }}>
      {children}
    </div>
  );
}

function ChatBubbleUser({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl px-3.5 py-3 text-[13px] leading-relaxed"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.10)',
        color: 'rgba(255,255,255,0.75)',
      }}>
      {children}
    </div>
  );
}

function MetricRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0"
      style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
      <span className="text-[13px] text-white/55">{label}</span>
      <span className="text-[13px] font-bold" style={{ color: valueColor || 'white' }}>{value}</span>
    </div>
  );
}
