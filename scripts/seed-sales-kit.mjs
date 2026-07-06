// Ingestão do KIT de sales enablement no Portal do Representante.
// Substitui os placeholders genéricos por materiais ricos (battlecard, scripts
// de qualificação por segmento, 7 etapas, cheat sheet do demo, mapa da jornada,
// modelo de proposta, one-pagers por segmento), com `content` para a IA aterrar.
//
// Idempotente: arquiva os seeds genéricos antigos (menos os de política) e
// faz upsert-por-título dos materiais do kit. Rodar: node scripts/seed-sales-kit.mjs
//
// Mapa de segmentos (GTM → sales_accounts.segment): escola privada→escola,
// RH/T&D corporativo→empresa, secretaria/rede pública→rede_ensino, transversais→geral.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Client } = require('pg');
const ENV = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const url = ENV.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (!url) { console.error('DATABASE_URL ausente'); process.exit(1); }

// Placeholders genéricos a arquivar (superados pelo kit). Os de 'politica' ficam.
const ARQUIVAR = [
  'Pitch Vertho — apresentação institucional', 'Proposta padrão (modelo)', 'One-pager Mentor IA',
  'Playbook — Redes de ensino e secretarias', 'Playbook — Escolas privadas', 'Playbook — Empresas (RH/T&D)',
  'Roteiro de diagnóstico — primeira reunião', 'Qualificação BANT adaptada',
  'Objeção: "Já temos plataforma de treinamento"', 'Objeção: "Não temos orçamento agora"',
  'Objeção: "IA não funciona para a nossa realidade"', 'Case — Rede municipal (100+ colaboradores)',
];

const KIT = [
  // ── Battlecard ────────────────────────────────────────────────────────────
  {
    title: 'Battlecard — Objeções e respostas (13)',
    category: 'objecoes', segment: 'geral',
    description: 'As 13 objeções mais comuns que o RC ouve, com resposta pronta. Frase canônica de posicionamento no fim.',
    content: `13 OBJEÇÕES QUE O RC VAI OUVIR — respostas prontas.

"Isso substitui avaliação de desempenho?" → Não. A Vertho desenvolve competências. Quem quer nota de avaliador + nine-box precisa de ferramenta de performance. Somos complementares.
"A IA decide sozinha?" → Nunca. A IA diagnostica, sugere e avalia — o gestor e o RH tomam a decisão. Dual-IA (2ª IA valida a 1ª) em toda avaliação crítica.
"Como evitar viés da IA?" → Dual-IA em toda avaliação, cenários ancorados no contexto real (PPP/cargo), scorer com régua explícita n1-n4 por descritor. A IA narra o motor, não inventa nota.
"Como fica a LGPD?" → PII nunca toca a IA. Dados isolados por tenant. Audit log de acessos. Pulso com guard n≥7. Mascara em-voo, não em repouso.
"Os colaboradores vão aceitar?" → A jornada é por chat e conteúdo curto (vídeo, podcast, texto, case). Formato-core pela preferência da pessoa. Desafio semanal leve. Tira-dúvidas no tom da instituição.
"Quanto tempo a pessoa dedica?" → ~20-30 min/semana (conteúdo + desafio + reflexão). Missão aplicada quinzenal é na rotina real do cargo, não é tarefa extra.
"Já temos LMS / Qulture / Feedz." → LMS entrega curso. Qulture/Feedz medem performance. A Vertho fecha o loop: diagnóstico individual → trilha personalizada → evidência de evolução. São camadas diferentes.
"Isso é pesquisa de clima?" → Não. O Pulso Vertho é leitura do ambiente que sustenta o desenvolvimento — não eNPS, não diagnóstico psicossocial, não compliance NR-1.
"O conteúdo gerado por IA não é genérico?" → Cada conteúdo é gerado por cargo, perfil DISC, descritor da competência e contexto institucional (PPP/valores). Não é catálogo — é sob medida.
"Como provo ROI?" → Evolution Report com delta real por descritor (ex.: "evoluiu de N2 para N3.4 em Negociação"). Plenária institucional mostra o consolidado pro board.
"Serve pra NR-1?" → O Pulso oferece insumo qualitativo COMPLEMENTAR a especialistas técnicos. Não substitui análise técnica nem diagnóstico psicossocial. Linguagem: "complementar a", nunca "substitui".
"Como o gestor usa na prática?" → Dashboard com delta de evolução da equipe, plenária consolidada, dossiê individual por liderado. O líder chega na 1:1 com documento, não com achismo.

O QUE A VERTHO NÃO É: não medimos performance (desenvolvemos competências); não somos LMS (conteúdo gerado por IA, personalizado por cargo/perfil); não somos pesquisa de clima (o Pulso é leitura do ambiente); não somos ATS (atuamos de quem já entrou pra frente).

FRASE CANÔNICA (decore): "Somos uma HRTech que entende o perfil de cada pessoa e personaliza as decisões sobre ela — de quem desenvolver a como reter e promover — com evidência de evolução, não achismo."`,
  },
  {
    title: 'Battlecard — Posicionamento vs. concorrentes',
    category: 'playbook', segment: 'geral',
    description: 'Como posicionar a Vertho frente a Qulture Rocks, Feedz, Gupy, Revvo e Twygo. A pergunta de ouro que diferencia.',
    content: `VERTHO VS. CONCORRENTES — o que cada um faz, o gap, e como posicionar.

Qulture Rocks (UOL EdTech): avaliação de desempenho, OKRs, PDI, feedback, clima, LMS. NÃO desenvolve (mede performance), PDI genérico, sem diagnóstico comportamental, sem evidência de evolução granular. Posicionar: "A plataforma de vocês também diagnostica, desenvolve E comprova evolução no mesmo fluxo?" Melhor fit deles: cliente quer avaliação + OKR + clima.
Feedz (TOTVS): clima, engajamento, OKRs, desempenho, feedback, gamificação, eNPS. Foco em clima; sem IA contextual; sem conteúdo personalizado; avaliação = formulário. Posicionar: "Feedz mostra como a pessoa se sente. A Vertho mostra o que ela precisa desenvolver — e entrega o plano." Fit deles: clima + eNPS + integração TOTVS.
Gupy Performance: ATS (recrutamento) + módulo de performance. Performance é secundário; sem trilha; sem avaliação por cenário+IA. Posicionar: "Gupy resolve a porta de entrada. A Vertho resolve o que vem depois — com evidência." Fit deles: dor principal é R&S.
Revvo (ex-Alura): LMS corporativo, catálogo de cursos, certificação. Conteúdo de prateleira; sem diagnóstico; sem personalização; mede conclusão. Posicionar: "Revvo entrega curso. A pergunta é: como vocês sabem se a pessoa evoluiu de verdade?" Fit deles: catálogo de cursos + certificação.
Twygo: LMS/EAD corporativo, trilhas de cursos, gamificação, universidade corporativa. Mesmo gap: conteúdo sem diagnóstico/personalização/evidência. Posicionar: "Twygo mede se assistiu. A Vertho mede se evoluiu." Fit deles: universidade corporativa / EAD em escala.

REGRA DE OURO: a maioria mede alguma coisa. A pergunta que diferencia: "a plataforma de vocês também diagnostica, desenvolve E comprova a evolução com evidência, no mesmo fluxo?"`,
  },
  // ── Scripts de qualificação (por segmento) ────────────────────────────────
  {
    title: 'Script de qualificação — RH / T&D (corporativo)',
    category: 'diagnostico', segment: 'empresa',
    description: '3 perguntas para os 5 primeiros minutos com RH/T&D, com resposta ideal, red flag e próximo passo. Régua de decisão.',
    content: `SCRIPT DE QUALIFICAÇÃO — RH / T&D (corporativo). Use nos primeiros 5 min com diretores de RH, heads de T&D ou BPs.

FRASE DE ABERTURA: "Oi [nome], sou [seu nome], represento a Vertho — uma plataforma de inteligência de pessoas. A gente ajuda empresas a desenvolver, promover e reter gente com base em evidência, não em achismo. Queria entender como funciona isso aí na [empresa] pra ver se faz sentido conversar. Posso fazer umas perguntas rápidas?"

P1: "Como vocês decidem hoje quem desenvolver, promover ou realocar?" — Ideal: "avaliação de desempenho mas falta dados" ou "o gestor decide na intuição" (dor real). Red flag: "assessment center, comitê de calibração, processo maduro" (dor baixa). Se há dor → "Posso mostrar como a Vertho resolve isso em 14 semanas — diagnóstico + trilha + evidência. Demo de 25 min?"
P2: "Como vocês medem se um treinamento funcionou?" — Ideal: "não medimos" ou "pesquisa de satisfação/NPS" (gastam sem ROI). Red flag: "correlação treinamento × indicadores com grupo controle" (raro). Se não medem → "Essa é a lacuna: a Vertho entrega Evolution Report com delta real por competência."
P3: "Como o gestor acompanha o PDI depois da avaliação?" — Ideal: "o PDI vira documento morto" ou "depende do gestor". Red flag: "ferramenta que integra PDI com acompanhamento e o gestor usa". Se PDI é morto → "A Vertho transforma o PDI em trilha personalizada com conteúdo, missão e evidência. O gestor recebe dashboard, não planilha."

RÉGUA DE DECISÃO: 2+ verdes → propor demo de 25 min. 1 verde → enviar one-pager do segmento + follow-up em 7 dias. 0 verde → nutrir, revisitar em 3 meses.`,
  },
  {
    title: 'Script de qualificação — Secretaria / rede pública',
    category: 'diagnostico', segment: 'rede_ensino',
    description: '3 perguntas para secretários de educação e coordenação da secretaria, com resposta ideal, red flag e próximo passo.',
    content: `SCRIPT DE QUALIFICAÇÃO — Secretaria / rede pública. Use com secretários de educação, diretores de ensino ou coordenação pedagógica da secretaria.

FRASE DE ABERTURA: "Secretário(a), sou [seu nome], represento a Vertho — uma plataforma que ajuda redes de ensino a selecionar e desenvolver gestores e coordenadores com base em perfil e evidência. Queria entender como funciona a formação na rede de vocês. Posso fazer 3 perguntas rápidas?"

P1: "Como vocês priorizam a formação de gestores e coordenadores hoje?" — Ideal: "formação genérica pra todo mundo" ou "cada escola escolhe" (sem diagnóstico/priorização). Red flag: "programa estruturado com assessment individual e trilha por escola" (raro). Se genérica → "A Vertho faz o diagnóstico de cada gestor e monta a trilha pela realidade da escola dele — com cenários baseados no PPP. Mostro em 25 min?"
P2: "Como vocês medem se a formação continuada gerou evolução real?" — Ideal: "não medimos" ou "frequência e certificado". Red flag: "indicadores correlacionados com IDEB/Saeb" (raro). Se não medem → "A Vertho entrega relatório de evolução com delta por competência — a secretaria vê quem evoluiu, quanto e onde."
P3: "Como vocês personalizam a formação por escola ou por perfil de gestor?" — Ideal: "não personalizamos — mesma pauta pra rede". Red flag: "cada escola tem plano próprio com acompanhamento individual" (raro). Se não personaliza → "A Vertho gera conteúdo pela realidade de cada escola e pelo perfil do gestor. Piloto de 2 semanas mostra o método."

RÉGUA: 2+ verdes → demo 25 min. 1 verde → one-pager + follow-up 7 dias. 0 → nutrir, revisitar em 3 meses.`,
  },
  {
    title: 'Script de qualificação — Escola privada',
    category: 'diagnostico', segment: 'escola',
    description: '3 perguntas para mantenedores e diretores de escolas/grupos educacionais, com resposta ideal, red flag e próximo passo.',
    content: `SCRIPT DE QUALIFICAÇÃO — Escola privada. Use com mantenedores, diretores pedagógicos ou heads de pessoas de escolas e grupos educacionais.

FRASE DE ABERTURA: "Oi [nome], sou [seu nome], represento a Vertho — inteligência de pessoas pra educação. A gente ajuda escolas a desenvolver professores e coordenadores com base em perfil e evidência — cada um recebe uma trilha personalizada. Queria entender como funciona o desenvolvimento de pessoas na [escola]."

P1: "Como vocês desenvolvem professores e coordenadores hoje?" — Ideal: "formação interna genérica" ou "cursos externos quando dá" (sem diagnóstico/trilha). Red flag: "programa estruturado com coaching individual e assessment" (concorre com consultorias). Se genérica → "A Vertho faz o diagnóstico de cada profissional e monta trilha pelo perfil e pelo PPP da escola. Mostro em 25 min?"
P2: "Como vocês identificam quem precisa de apoio antes de virar problema?" — Ideal: "quando o coordenador percebe" ou "quando a família reclama" (reativo). Red flag: "sistema de early warning". Se reativo → "O Pulso Vertho dá leitura do ambiente — antes de virar crise, você vê os sinais. E a trilha atua antes do gestor precisar intervir."
P3: "O que vocês fazem pra reter bons professores?" — Ideal: "pagamos bem e torcemos" ou "não temos estratégia" (turnover caro). Red flag: "programa de retenção com plano de carreira estruturado". Se sem estratégia → "Desenvolver a pessoa é reter. Quando o professor vê que a escola investe no perfil dele — não num curso genérico — a retenção sobe. O piloto de 2 semanas já entrega essa experiência."

RÉGUA: 2+ verdes → demo 25 min. 1 verde → one-pager + follow-up 7 dias. 0 → nutrir, revisitar em 3 meses.`,
  },
  // ── Processo e apoio ──────────────────────────────────────────────────────
  {
    title: 'Como vender a Vertho em 7 etapas',
    category: 'playbook', segment: 'geral',
    description: 'Guia sequencial do lead ao kick-off: identificar → abordar → qualificar → demonstrar → propor → fechar → handoff.',
    content: `COMO VENDER A VERTHO EM 7 ETAPAS (do lead ao kick-off). Não pule etapas — qualificação antes da demo evita demo desperdiçada.

1. IDENTIFICAR — escolher segmento (RH/T&D, secretaria, escola privada) e o comprador provável. Apoio: one-pagers por segmento. Resultado: segmento + buyer definidos.
2. ABORDAR — primeiro contato (cold call, indicação, evento, inbound), usar a frase de abertura do segmento. Objetivo: conseguir 5 minutos. Apoio: script de qualificação. Resultado: conversa agendada.
3. QUALIFICAR — 3 perguntas do script do segmento. Régua: 2+ verdes → demo; 1 verde → one-pager + follow-up; 0 → nutrir. Resultado: decisão demo/nutrir/abandonar.
4. DEMONSTRAR — escolher roteiro (10/25/40 min) pelo tempo/perfil. Resetar acme-demo. Conduzir por DOR, não por funcionalidade. Fechar com proposta de piloto. Apoio: cheat sheet do acme-demo. Resultado: cliente pediu proposta/piloto.
5. PROPOR — montar proposta usando o modelo. Preencher contexto com a dor real. Revisar escopo e "não incluso". Pedir kit de setup se for piloto. Resultado: proposta enviada + kit entregue.
6. FECHAR — follow-up em 48h. Responder objeções (battlecard). Negociar dentro do escopo — não inventar. Se empacou, rever qualificação. Resultado: aprovação + planilha recebida.
7. HANDOFF — enviar planilha + briefing + logo + docs ao time Vertho. Confirmar data de início. Apresentar o ponto focal ao time de implantação. Resultado: tenant configurado, diagnóstico agendado.

REGRA DE OURO: se o cliente não tem dor clara (etapa 3), não faça demo (etapa 4). QUANDO NÃO VENDER: cliente quer só avaliação/OKR (→ Qulture/Feedz), só LMS (→ Revvo/Twygo), só ATS (→ Gupy), ou sem orçamento/timing. Registrar e revisitar em 3 meses.`,
  },
  {
    title: 'Cheat sheet — Ambiente ACME Demo',
    category: 'playbook', segment: 'geral',
    description: 'Referência para conduzir a demo no acme-demo: as 4 personas, 3 roteiros (10/25/40 min), o que NÃO falar e o reset.',
    content: `CHEAT SHEET — Ambiente ACME Demo (acme-demo.vertho.ai). Entre no portal como a persona.

AS 4 PERSONAS: Ana (DISC I, nova — só cadastro): mostra a tela inicial e o convite de diagnóstico → "a pessoa recebe um link e em 20 min a plataforma já conhece o perfil dela". Paulo (ID, parcial — 2 comps, trilha ativa): trilha em andamento, conteúdo, tira-dúvidas → "o dia a dia: conteúdo no formato que a pessoa prefere, desafio prático, tira-dúvidas com IA no tom da instituição". Bruna (CS, completa — 5 comps, concluída): DISC, mapa de competências, Evolution Report → "o resultado: delta real por competência. Não é opinião — é evidência". Carla (D, gestora): dashboard, plenária, relatório do liderado → "o que o líder recebe: visão da equipe com dados. Chega na 1:1 com documento".

3 ROTEIROS: Curta (10 min): Bruna → DISC → mapa competências → Evolution Report → Carla → dashboard gestor. Média (25 min): Ana onboarding → Bruna DISC+DNA → trilha (vídeo+tira-dúvidas) → Evolution Report → Carla dashboard → admin visão RH. Deep (40 min): slide posicionamento → Ana → Paulo trilha ao vivo → Bruna DISC+Evolution → Carla gestor+plenária → admin pipeline+Pulso → piloto. Reserve 5 min pro cliente perguntar. Deep é consultiva, não tour.

O QUE NÃO FALAR: não diga "IA revolucionária" (diga "IA que conversa em turnos socráticos e extrai evidência validada por 2ª IA"); não prometa ROI específico (mostre o Evolution Report); não compare por nome ("o Qulture não faz X") — posicione pela pergunta; não mostre admin/pipeline na demo curta.

RESET E ACESSO: antes da demo, acme-demo.vertho.ai/admin/demo → "Resetar demo agora" (~10s). Reset automático toda madrugada (04h BRT). Login = e-mail da persona (ana@/paulo@/bruna@/carla@vertho.ai) via magic link. Plano B: prints/vídeo de backup. NÃO cadastre dados reais, NÃO rode IA1/IA2/IA3. Se 2 RCs usam ao mesmo tempo, resete antes.`,
  },
  {
    title: 'Mapa da jornada Vertho — do setup ao Evolution Report',
    category: 'playbook', segment: 'geral',
    description: 'Visão da jornada completa (Setup → Diagnóstico → Trilha → Fechamento → Resultados) com o "wow" de cada fase.',
    content: `MAPA DA JORNADA VERTHO — o colaborador é diagnosticado, desenvolve competências com conteúdo personalizado e é reavaliado, tudo na mesma plataforma, com evidência.

0. SETUP (~1 sem) — RH/Admin: planilha de cargos+colaboradores, upload de logo/docs, Vertho configura o tenant. Wow: tenant pronto em 1 dia útil.
1. DIAGNÓSTICO (1–2 sem) — Colaborador: mapeamento DISC, cenários situacionais (chat IA), mapeamento de competências, DNA + Fit v2. Wow: perfil DISC completo com narrativa rica ("nunca tinham me descrito assim").
2. TRILHA (14 sem*) — Colaborador: conteúdo semanal personalizado (vídeo/texto/podcast/case), desafio prático, tira-dúvidas com IA, missão aplicada (sem 4/8/12), reflexão com evidências. RH: dashboard de engajamento, Pulso (T0/T2). Wow: conteúdo gerado por IA no formato preferido, contextualizado por cargo e PPP.
3. FECHAMENTO (sem 14, ou sem 3 no piloto) — Colaborador: cenário B, arguição oral (defesa com IA), reavaliação. RH: Scorer + Check (Dual-IA), Evolution Report. Wow: arguição oral em tempo real — a IA sonda e extrai evidência.
5. RESULTADOS — Colaborador: Evolution Report pessoal (delta por descritor), próximo ciclo sugerido. RH: plenária institucional, Relatório RH consolidado, dossiê do gestor. Wow: delta real por descritor ("evoluiu de N2 para N3.4 em Negociação").

*Trilha regular = 14 semanas (2 competências). Piloto = 2 semanas (1 competência, degustação). Onboarding = 10 semanas (5 competências).`,
  },
  {
    title: 'Modelo de proposta comercial',
    category: 'material', segment: 'geral',
    description: 'Estrutura da proposta comercial. Dica: gere o documento pronto no portal (na proposta aprovada → "Baixar PDF / Copiar link").',
    content: `MODELO DE PROPOSTA COMERCIAL — Programa de Inteligência de Pessoas.
DICA: o portal já gera este documento pronto (página + PDF) a partir da proposta aprovada — use "Documento da proposta" no detalhe. Estrutura de referência:

1. Contexto e dor identificada (2–3 frases com a dor real do cliente).
2. A Vertho (HRTech que entende o perfil de cada pessoa e personaliza as decisões — diagnóstico DISC + competências + cenários avaliados por IA → trilha personalizada → Evolution Report com delta).
3. Escopo proposto (modalidade piloto 2 sem / completo 14 sem; participantes; cargos; duração; início).
4. O que está incluso (ambiente dedicado com subdomínio; diagnóstico individual; trilha personalizada; avaliação de fechamento; relatórios: Evolution + Plenária + RH + dossiê; suporte com canal dedicado).
5. O que NÃO está incluso (customizações fora do escopo; diagnóstico clínico/psicológico; pesquisa de clima/eNPS; avaliação de desempenho formal/nine-box/OKR; garantia de ROI financeiro; consultoria presencial; recrutamento/ATS).
6. Premissas (cliente envia planilha de setup + docs; ponto focal disponível; participantes com smartphone/PC + internet; envio de links por WhatsApp/e-mail).
7. Investimento (valores + condições: à vista / Pix / boleto).
8. Cronograma (Setup → Diagnóstico → Trilha → Fechamento).
9. Próximos passos (aprovação → envio da planilha/logo/docs → Vertho configura em até 2 dias úteis → disparo do diagnóstico).
10. Validade (30 dias a partir da emissão).`,
  },
  // ── One-pagers por segmento (client-facing) ───────────────────────────────
  {
    title: 'One-pager — Vertho para Escolas Privadas',
    category: 'material', segment: 'escola',
    description: 'Quem compra, a dor, vocabulário, frase de abertura, 3 objeções típicas e próximo passo — para colégios e grupos educacionais.',
    content: `VERTHO PARA ESCOLAS PRIVADAS (colégios, grupos educacionais, redes de escolas).
QUEM COMPRA: mantenedor(a), diretor(a) geral/pedagógico(a), head de pessoas do grupo. Em grupos multi-unidade a decisão é do corporativo; em escolas isoladas, do mantenedor. Coordenador influencia, raramente decide.
A DOR: rotatividade docente alta e cara; formação interna genérica ("mesma pauta BNCC pra 80 professores"); coordenação sobrecarregada sem acompanhar cada professor; diferenciação competitiva (famílias escolhem escola que investe no corpo docente); sem evidência de que a formação gera resultado.
VOCABULÁRIO: PPP, BNCC, coordenação pedagógica, mantenedora, mensalidade, retenção de alunos, NPS de famílias, formação continuada, plano de carreira docente, turnover docente, diferencial pedagógico.
FRASE DE ABERTURA: "[Nome], a Vertho ajuda escolas a desenvolver professores e coordenadores com base no perfil de cada um — não numa formação genérica. Diagnóstico individual, trilha personalizada pela realidade da escola (PPP, perfil, cargo) e um relatório que prova a evolução. Isso reduz rotatividade e fortalece a diferenciação. Posso mostrar em 25 minutos?"
3 OBJEÇÕES: "Já temos coordenação que faz isso." → A coordenação é essencial — a Vertho potencializa: hoje o coordenador acompanha 20-30 professores sem dados; com a Vertho vê o perfil e a evolução de cada um e prioriza. É ferramenta do coordenador, não substituto. | "Escola não tem orçamento de RH corporativo." → O piloto de 2 semanas cabe no orçamento de formação continuada e já entrega o diagnóstico de cada professor. Compare com o custo de perder um bom professor. | "Professores não vão aderir a mais uma plataforma." → Jornada por WhatsApp e conteúdo curto (~20 min/sem), formato escolhido pelo professor, tira-dúvidas no tom da escola. É microlearning, não EAD pesado.
PRÓXIMO PASSO: piloto de 2 semanas com 10-15 professores/coordenadores de 1 unidade. O diagnóstico já é o entregável. Se fizer sentido, escala pra rede.`,
  },
  {
    title: 'One-pager — Vertho para Educação Pública',
    category: 'material', segment: 'rede_ensino',
    description: 'Quem compra, a dor, licitação/dispensa, LGPD, 3 objeções típicas e próximo passo — para secretarias e redes municipais.',
    content: `VERTHO PARA EDUCAÇÃO PÚBLICA (secretarias municipais, escolas, redes de ensino).
QUEM COMPRA: secretário(a) de educação, diretor(a) de ensino, coordenação da secretaria. Decisão por licitação/dispensa (até R$ 50k) ou pregão. Ponto focal: assessoria técnica ou setor de formação.
A DOR: decisões de lotação, formação e seleção de gestores por currículo e indicação política — sem diagnóstico de perfil nem evidência; formação continuada genérica sem personalização por escola/cargo/perfil; não sabem se o investimento gerou evolução.
VOCABULÁRIO: PPP, BNCC, coordenação pedagógica, lotação, formação continuada, IDEB, gestor escolar, rede municipal, NR-1 (servidores CLT).
FRASE DE ABERTURA: "Secretário(a), a Vertho ajuda redes de ensino a selecionar e desenvolver gestores e coordenadores com base em perfil e evidência — não em currículo e indicação. Diagnóstico de cada profissional, trilha personalizada pela realidade da escola, e um relatório que prova a evolução. Posso mostrar em 25 minutos?"
3 OBJEÇÕES: "Já temos formação continuada." → A Vertho não substitui — personaliza e prova o resultado. A formação vira mais eficaz quando cada gestor recebe conteúdo no perfil dele. | "Não temos orçamento / precisa de licitação." → Opera por dispensa de licitação (até R$ 50k — art. 75, Lei 14.133). O piloto de 2 semanas cabe na dispensa e gera o diagnóstico antes de comprometer orçamento maior. | "Como fica a LGPD com dados de servidores?" → LGPD by design: PII nunca toca a IA, dados isolados por tenant (subdomínio da rede), audit log, Pulso com guard n≥7. Detalhamos na proposta técnica.
PRÓXIMO PASSO: piloto de 2 semanas (kit de setup + briefing). O diagnóstico já é o entregável.`,
  },
  {
    title: 'One-pager — Vertho para Setor Privado (RH/T&D)',
    category: 'material', segment: 'empresa',
    description: 'Quem compra, a dor, vocabulário, frase de abertura, 3 objeções típicas (Qulture/Feedz, ATS, escala) e próximo passo.',
    content: `VERTHO PARA SETOR PRIVADO (RH, T&D, desenvolvimento organizacional).
QUEM COMPRA: diretor(a) de RH, head de T&D, BP de desenvolvimento, CHRO. Em empresas médias (100–1.000), decisão do RH com aval financeiro; em grandes, passa por procurement.
A DOR: avaliação de desempenho que não desenvolve ("fazemos nine-box todo ano e nada muda"); treinamento genérico sem ROI ("gastamos R$ 500k em LMS e não sabemos se funcionou"); PDI que vira documento morto; promoção/sucessão por opinião do gestor, não por perfil.
VOCABULÁRIO: PDI, nine-box, ciclo de avaliação, assessment, pipeline de sucessão, engagement, eNPS, OKR, ROI de T&D, people analytics, HRBP, competências core, cultura organizacional.
FRASE DE ABERTURA: "[Nome], a Vertho é inteligência de pessoas — diagnóstico individual de competências, trilha personalizada e, ao final, um relatório que prova a evolução com evidência. É como fechar o loop que o nine-box abre mas nunca completa. Posso mostrar em 25 minutos?"
3 OBJEÇÕES: "Já usamos Qulture / Feedz." → Eles medem performance (ONDE a pessoa está); a Vertho desenvolve e leva até onde precisa ir, provando que chegou (trilha + Evolution Report). Complementares. | "Qual a integração com nosso ATS / HRIS?" → Integra por API + SSO; onboarding puxa dados do HRIS. Mas não é ATS — atuamos de quem já entrou pra frente. | "Como escala pra 500+?" → Multi-tenant com branding, conteúdo gerado por IA (sem curadoria manual), envios em massa por WhatsApp/e-mail, dashboards. Custo de IA por chamada, não por licença — escala linear.
PRÓXIMO PASSO: piloto de 2 semanas com 10-15 pessoas (um cargo/área). O diagnóstico já entrega valor.`,
  },
];

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  // 1. Arquiva os placeholders genéricos (mantém os de política).
  const arq = await client.query(
    `UPDATE sales_materials SET is_active=false, updated_at=now() WHERE title = ANY($1) AND is_active=true`, [ARQUIVAR]);
  console.log(`placeholders arquivados: ${arq.rowCount}`);
  // 2. Upsert por título dos materiais do kit.
  for (const m of KIT) {
    await client.query('DELETE FROM sales_materials WHERE title=$1', [m.title]);
    await client.query(
      'INSERT INTO sales_materials (title, category, segment, description, content, is_active) VALUES ($1,$2,$3,$4,$5,true)',
      [m.title, m.category, m.segment, m.description, m.content]);
  }
  console.log(`materiais do kit inseridos: ${KIT.length}`);
  const { rows } = await client.query("SELECT category, count(*)::int n FROM sales_materials WHERE is_active GROUP BY category ORDER BY category");
  console.log('ativos por categoria:', JSON.stringify(rows));
} finally {
  await client.end();
}
