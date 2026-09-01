import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantUrl } from '@/lib/domain';
import { randomBytes } from 'node:crypto';
import {
  DEMO_PRESENTATION_ROLES,
  DEMO_PRESENTATION_TENANT_SLUG,
  getDemoPresentationRoom,
  type DemoPresentationTenantSlug,
  demoPresentationAuthUrl,
  demoPresentationUrl,
  getDemoPresentationRole,
  type DemoPresentationRoleKey,
} from '@/lib/demo/presentation';
import { issueDemoPresentationTicket } from '@/lib/demo/presentation-ticket';
import fixture from '@/lib/demo/acme-demo-fixture.json';
// Artefatos de IA CONGELADOS dos cargos extra (Financeiro/Operações/Gerente):
// gabaritos (IA2) + cenários ricos com rubrica N1-N4 (IA3). Gerados 1x no
// acme-demo (scripts/_capture-*) e replicados no reset SEM rodar IA.
import extraArtifacts from '@/lib/demo/acme-demo-extra-artifacts.json';
import {
  ACME_DEMO_BEHIND_KEYS,
  ACME_DEMO_CONCLUDED_KEYS,
  ACME_DEMO_FUNNEL_TARGETS,
  ACME_DEMO_JOURNEY_KEYS,
  ACME_DEMO_REPORT_DIRECTORY,
  ACME_DEMO_SYNTHETIC_MAPPED_KEYS,
  ACME_DEMO_TEAM_SIZE,
  ACME_DEMO_WITHOUT_PROFILE_KEYS,
  avaliacaoAcmeDemo,
  competenciasAcmeDemoPorCargo,
  criarPdiAcmeDemo,
  criarRelatorioGestorAcmeDemo,
  criarRelatorioRhAcmeDemo,
} from '@/lib/demo/acme-rh-report-fixture';
import {
  ACME_DEMO_DESCRITORES,
  ACME_DEMO_DESCRITORES_POR_TRILHA,
  ACME_DEMO_EVOLUTION_MIX,
  construirEvolucaoAcmeDemo,
  construirFechamentoAcmeDemo,
  notaDePartida,
} from '@/lib/demo/acme-evolucao-fixture';
import { seedAcmeOrganizationReports } from '@/lib/demo/acme-organization-reports';
import { precomputeDemoFitResults, seedAcmeFitRankingSnapshots } from '@/lib/demo/acme-fit-rankings';
// Régua canônica de competências — a MESMA que o mapeamento real e o simulador
// usam. O demo tinha derivação própria; ver comportamentosDoDisc.
import { computeDiscCompetenciesNatural } from '@/lib/disc-competencias';
import { deriveProfile } from '@/lib/disc-mapeamento';
import { IA4_FILTRO, PLANO_SEMANA, PROGRESSO, TRILHA } from '@/lib/status';
import { buildAcmeDemoBehavioralReport } from '@/lib/demo/acme-behavioral-report';
// O ELENCO (cargos, competências, personas) vive fora do motor: um segmento
// novo troca o roster, não o reset. A identidade da empresa continua em
// DEMO_TENANT_PROFILES, logo abaixo.
import { rosterDemo, type DemoRosterKey } from '@/lib/demo/rosters';
import { PPP_REDE_ESCOLAS_ACME, VALORES_REDE_ESCOLAS_ACME } from '@/lib/demo/rosters/escolar';
import {
  COMERCIAL_AREA,
  DEMO_EXCLUDED_ROLES,
  DEMO_EXTRA_ROLES,
  DEMO_MANAGER,
  DEMO_RH_PERSONA,
  PERSONAS,
  REPRESENTANTE_FOCO,
  REPRESENTANTE_TOP5,
  ROSTER_COMERCIAL,
} from '@/lib/demo/rosters/comercial';
import type { DemoRoster } from '@/lib/demo/rosters/types';

// Reexportados porque o portal de vendas, os testes e o painel importam o
// elenco DESTE módulo desde antes de ele virar roster.
export { DEMO_RH_PERSONA, PERSONAS };

/**
 * Reset/seed dos tenants demo (`acme-demo` e `gruposinal`) — versão IN-APP da
 * lógica de `scripts/seed-acme-demo.mjs` (que segue como fallback manual).
 * Fonte única usada pelo botão "Resetar demo agora" (server action) e pelo
 * cron noturno. Os dois tenants recebem o MESMO roster rico (personas +
 * diretório sintético de 24 pessoas) e os mesmos artefatos (ranking de fit,
 * relatórios organizacionais); o que muda é a identidade (`DEMO_TENANT_PROFILES`
 * + `personalizarArtefatoDemo`) e os totais esperados (o gruposinal tem um
 * convidado real a mais).
 *
 * Idempotente e TENANT-SAFE: todo delete/insert é filtrado por `empresa_id` do
 * tenant escolhido — NUNCA toca outro tenant. Semeia a estrutura (competências,
 * cargos, top10, cenários) de um FIXTURE CONGELADO (`acme-demo-fixture.json`,
 * capturado do acme via scripts/capture-acme-fixture.mjs) — imune a mexidas no
 * acme vivo. Recria personas + respostas de demonstração.
 *
 * GUARDRAIL de envio (duas camadas): (1) GATE por tenant — `empresas.is_demo`
 * (setado aqui, mig 160) é lido por `lib/demo/envio-guard.ts`, que BLOQUEIA todo
 * disparo em lote e magic link/signup nos dispatchers. Proteção primária, robusta
 * até contra contato REAL adicionado à demo. (2) Defesa em profundidade: as
 * PERSONAS usam e-mails @vertho.ai (domínio interno) e SEM telefone. Os flags
 * `cadencia.email_ativo/whatsapp_ativo=false` seguem por convenção (cosméticos).
 */

const DEMO_SLUG = DEMO_PRESENTATION_TENANT_SLUG;
const DEMO_NAME = 'ACME Demo';
const GRUPO_SINAL_SLUG = 'gruposinal';
const ESCOLAS_ACME_SLUG = 'escolas-acme';
const DEMO_JOURNEY_CONTENT_KIND = 'conteudo' as const;

/**
 * Vídeo editorial fixo da sala de apresentação.
 *
 * A library também recebe vídeos personalizados de clientes; por isso o GUID
 * aqui é deliberadamente um conteúdo editorial da Vertho, e não o tutorial de
 * navegação. O slot é recomposto a cada reset para a visão Usuário sempre ter
 * um vídeo de desenvolvimento real, além de artigo, case e áudio.
 */
export const DEMO_PRESENTATION_VIDEO = {
  titulo: 'Antecipar cenários: perceber antes, agir melhor',
  descricao: 'Conteúdo prático sobre reconhecer sinais e agir antes que a urgência vire pressão.',
  formato: 'video',
  duracao_min: 1.7,
  bunny_video_id: 'e8b77be3-ce8d-4993-8e18-b1cc1514a5ab',
  competencia: REPRESENTANTE_FOCO[0],
  descritor: 'Criação de senso de urgência',
  nivel_min: 1,
  nivel_max: 4,
  tipo_conteudo: 'core',
  contexto: 'corporativo',
  cargo: 'Representante Comercial',
  setor: 'todos',
  origem: 'pre_produzido',
  ativo: true,
} as const;

/** Infraestrutura estável do vídeo nominal da semana 1. Os UUIDs por tenant
 * evitam colisão na unique da célula; o asset nominal pode ser compartilhado
 * porque as duas salas usam a mesma persona Bruna e a arte é neutra (Vertho). */
export const DEMO_PRESENTATION_WEEK_VIDEO = {
  competenciaBaseId: '004408f2-6ae4-41a0-87ae-ace7ad54b32c',
  // Saudação e conteúdo usam a mesma narradora feminina (Vindemiatrix).
  personalizedBunnyVideoId: '8c3fd9f0-eb48-4398-aac6-242a1398e1e1',
  byTenant: {
    'acme-demo': {
      moduleId: '5faaf43b-8b80-4bd7-aab1-204fa83dad56',
      cellId: 'f02bd1e6-cca5-468c-a749-ecc33f797242',
    },
    gruposinal: {
      moduleId: 'a5137b5f-6302-43de-8bb1-7e981b948a12',
      cellId: 'ec1a7025-78c3-4c26-9f7f-4efec7962cbe',
    },
  },
} as const;

export function focosValidosDemo(row: any, top5: string[], roster: DemoRoster = ROSTER_COMERCIAL): string[] {
  const focoOriginal = [
    ...(Array.isArray(row.competencias_foco) ? row.competencias_foco : []),
    row.competencia_foco,
  ].filter(Boolean);
  const top5Normalizado = new Map(top5.map((nome) => [nome.trim().toLocaleLowerCase('pt-BR'), nome]));
  const validos = row.nome === roster.cargoPrincipal
    ? roster.cargoPrincipalFoco
    : [...new Set(focoOriginal
        .map((nome: string) => top5Normalizado.get(nome.trim().toLocaleLowerCase('pt-BR')))
        .filter((nome): nome is string => Boolean(nome)))];
  return validos.length > 0 ? validos : top5.slice(0, 1);
}


const ACME_DEMO_PPP = {
  perfil_instituicao: {
    nome: 'ACME Demo - Cultura e Operação',
    tipo: 'Empresa corporativa fictícia',
    segmento: 'Tecnologia B2B e serviços consultivos',
    porte: 'Médio porte',
    localizacao: 'Operação distribuída no Brasil',
  },
  comunidade_contexto: 'A ACME Demo representa uma empresa B2B em crescimento, com áreas comercial, financeira e operacional trabalhando em ciclos curtos de planejamento, execução e aprendizado. O ambiente combina metas comerciais ambiciosas, pressão por previsibilidade financeira e necessidade de coordenação operacional entre áreas.',
  identidade: {
    missao: 'Ajudar clientes corporativos a resolver problemas complexos com soluções simples, confiáveis e orientadas a resultado.',
    visao: 'Ser reconhecida como uma empresa de execução consistente, relacionamento consultivo e melhoria contínua.',
    principios: ['Cliente no centro', 'Clareza e responsabilidade', 'Colaboração entre áreas', 'Aprendizado contínuo', 'Ética nas decisões', 'Simplicidade operacional'],
    concepcao: 'A empresa entende desempenho como a combinação entre resultado, qualidade da execução e maturidade comportamental. Valoriza pessoas que comunicam riscos cedo, sustentam acordos, aprendem com dados e colaboram além das fronteiras da própria área.',
  },
  praticas_descritas: [
    { nome: 'Rito semanal de prioridades', descricao: 'Reunião curta para alinhar foco, riscos e dependências entre Comercial, Operações e Financeiro.', frequencia: 'semanal' },
    { nome: 'Revisão mensal de indicadores', descricao: 'Leitura conjunta de pipeline, margem, inadimplência, capacidade operacional e satisfação do cliente.', frequencia: 'mensal' },
    { nome: 'Retrospectiva de aprendizados', descricao: 'Registro de decisões, erros, boas práticas e ajustes de processo após ciclos críticos.', frequencia: 'quinzenal' },
  ],
  gestao_participacao: 'A gestão é participativa e orientada por dados. Lideranças definem prioridades, mas esperam que cada pessoa assuma responsabilidade por decisões no seu escopo, sinalize bloqueios e proponha melhorias práticas.',
  desafios_metas: {
    desafios: ['Aumentar receita sem deteriorar margem', 'Evitar ruídos entre vendas, finanças e operação', 'Manter dados confiáveis para decisão', 'Crescer sem perder qualidade de entrega'],
    metas: ['Elevar previsibilidade do pipeline', 'Reduzir retrabalho operacional', 'Melhorar comunicação entre áreas', 'Fortalecer postura consultiva com clientes'],
  },
  vocabulario: [
    { termo: 'Forecast', significado: 'Previsão de vendas e receita esperada para o período.' },
    { termo: 'SLA', significado: 'Acordo de prazo e qualidade para uma entrega ou atendimento.' },
    { termo: 'Margem', significado: 'Resultado financeiro preservado depois de custos e concessões comerciais.' },
    { termo: 'Rito de prioridades', significado: 'Momento de alinhamento do que será feito, por quem e com quais riscos.' },
  ],
  competencias_priorizadas: [
    { nome: 'Comunicação objetiva', justificativa: 'Reduz ruídos entre áreas e acelera decisões.', relevancia: 'alta' },
    { nome: 'Responsabilidade por resultados', justificativa: 'Sustenta metas sem abrir mão de qualidade e ética.', relevancia: 'alta' },
    { nome: 'Colaboração interáreas', justificativa: 'A operação depende de passagem de bastão clara entre Comercial, Financeiro e Operações.', relevancia: 'alta' },
    { nome: 'Disciplina de execução', justificativa: 'Garante previsibilidade em ambiente de crescimento.', relevancia: 'alta' },
    { nome: 'Aprendizado contínuo', justificativa: 'Permite ajustar processos rapidamente sem culpabilização.', relevancia: 'media' },
  ],
  valores_institucionais: ['Cliente no centro', 'Responsabilidade', 'Colaboração', 'Ética', 'Simplicidade', 'Aprendizado contínuo'],
  competencias: [
    { nome: 'Comunicação objetiva', justificativa: 'Reduz ruídos entre áreas e acelera decisões.', relevancia: 'alta' },
    { nome: 'Responsabilidade por resultados', justificativa: 'Sustenta metas sem abrir mão de qualidade e ética.', relevancia: 'alta' },
    { nome: 'Colaboração interáreas', justificativa: 'A operação depende de passagem de bastão clara entre Comercial, Financeiro e Operações.', relevancia: 'alta' },
  ],
};

const ACME_DEMO_VALUES = ['Cliente no centro', 'Responsabilidade', 'Colaboração', 'Ética', 'Simplicidade', 'Aprendizado contínuo'];

const GRUPO_SINAL_PPP = {
  perfil_instituicao: {
    nome: 'Grupo Sinal',
    tipo: 'Grupo de concessionárias',
    segmento: 'Varejo automotivo, vendas e pós-vendas',
    porte: 'Cerca de 3 mil colaboradores, 75 lojas e mais de 16 marcas',
    localizacao: 'Operação distribuída, com administrativo em São Paulo',
  },
  comunidade_contexto: 'O Grupo Sinal vive uma fase de crescimento acelerado, com expansão recente da rede de lojas e necessidade de sustentar a operação por meio de lideranças mais preparadas, práticas comuns de gestão e desenvolvimento contínuo das equipes de vendas, pós-vendas, oficinas, logística e áreas administrativas.',
  identidade: {
    missao: 'Oferecer uma experiência de mobilidade confiável, próxima e consistente em todos os pontos de contato com clientes e equipes.',
    visao: 'Crescer de forma sustentável, conectando resultado, experiência do cliente e desenvolvimento das pessoas.',
    principios: ['Cliente no centro', 'Ética', 'Responsabilidade por resultados', 'Colaboração', 'Agilidade', 'Desenvolvimento das pessoas'],
    concepcao: 'Desempenho combina resultado comercial, qualidade da experiência do cliente, disciplina operacional e comportamentos de liderança observáveis no dia a dia.',
  },
  praticas_descritas: [
    { nome: 'Rito de performance comercial', descricao: 'Acompanhamento de metas, conversão, carteira, oportunidades e planos de ação por loja.', frequencia: 'semanal' },
    { nome: 'Conversas de desenvolvimento', descricao: 'Feedbacks curtos e frequentes, conectados a situações reais de trabalho e a combinados claros.', frequencia: 'quinzenal' },
    { nome: 'Revisão de operação e experiência', descricao: 'Leitura integrada de vendas, pós-vendas, oficina, qualidade e experiência do cliente.', frequencia: 'mensal' },
  ],
  gestao_participacao: 'As lideranças traduzem as prioridades do grupo e das montadoras para a realidade de cada loja, combinam expectativas, acompanham indicadores e desenvolvem as pessoas na prática.',
  desafios_metas: {
    desafios: ['Sustentar o crescimento da rede', 'Alinhar práticas entre lojas e marcas', 'Fortalecer a cultura de feedback', 'Desenvolver lideranças', 'Engajar equipes que trabalham longe do computador'],
    metas: ['Dar clareza sobre comportamentos esperados', 'Criar uma base de competências', 'Ativar desenvolvimento em ciclos curtos', 'Melhorar a experiência de vendas e pós-vendas'],
  },
  vocabulario: [
    { termo: 'Loja', significado: 'Unidade do grupo que conecta operação, marca, equipe e experiência do cliente.' },
    { termo: 'Pós-vendas', significado: 'Jornada de relacionamento, serviços, oficina, peças e retenção após a venda do veículo.' },
    { termo: 'Conversão', significado: 'Transformação de oportunidades e atendimentos em negócios efetivos.' },
    { termo: 'Montadora', significado: 'Parceira que estabelece padrões, produtos e treinamentos próprios de cada marca.' },
  ],
  competencias_priorizadas: [
    { nome: 'Liderança e desenvolvimento de pessoas', justificativa: 'O crescimento depende de gestores capazes de orientar, dar feedback e sustentar acordos.', relevancia: 'alta' },
    { nome: 'Comunicação objetiva', justificativa: 'Reduz ruídos entre lojas, áreas administrativas e operação.', relevancia: 'alta' },
    { nome: 'Orientação ao cliente', justificativa: 'Conecta vendas, pós-vendas e oficina a uma experiência consistente.', relevancia: 'alta' },
    { nome: 'Responsabilidade por resultados', justificativa: 'Equilibra metas, qualidade, margem e disciplina de execução.', relevancia: 'alta' },
    { nome: 'Colaboração', justificativa: 'Fortalece a passagem de bastão entre comercial, pós-vendas e áreas de apoio.', relevancia: 'alta' },
  ],
  valores_institucionais: ['Cliente no centro', 'Ética', 'Responsabilidade', 'Colaboração', 'Agilidade', 'Desenvolvimento das pessoas'],
  competencias: [
    { nome: 'Liderança e desenvolvimento de pessoas', justificativa: 'Transforma feedback e acompanhamento em evolução observável.', relevancia: 'alta' },
    { nome: 'Comunicação objetiva', justificativa: 'Cria clareza entre equipes, lojas e áreas.', relevancia: 'alta' },
    { nome: 'Orientação ao cliente', justificativa: 'Mantém a experiência como elo entre venda, serviço e relacionamento.', relevancia: 'alta' },
  ],
};

const GRUPO_SINAL_VALUES = ['Cliente no centro', 'Ética', 'Responsabilidade', 'Colaboração', 'Agilidade', 'Desenvolvimento das pessoas'];

/** Convidado REAL (prospect) num tenant demo: conta zerada para a degustação
 * self-service — faz o mapeamento do zero e recebe o magic link de verdade
 * (o e-mail entra em `demo_acesso_allowlist`, ver envio-guard). Fica FORA de
 * `PERSONAS`: não passa pela régua DISC, não tem artefato congelado e não
 * entra no ranking de fit. */
type DemoConvidado = { nome: string; email: string; telefone: string; cargo: string };

/** Totais que os relatórios organizacionais (Perfil + DNA) devem encontrar no
 * tenant ao fim do seed. `withProfile`/`withMapping` são IGUAIS nos dois
 * tenants porque o convidado real do gruposinal (Alpheu) nasce sem DISC e sem
 * mapeamento — ele infla só o `teamSize`. Se uma mudança de fixture alterar
 * estas fotografias, a validação fechada do seed falha antes de subir PDF
 * errado. */
type DemoRelatoriosOrganizacionais = { teamSize: number; withProfile: number; withMapping: number };

export const DEMO_TENANT_PROFILES = {
  [DEMO_SLUG]: {
    slug: DEMO_SLUG,
    nome: DEMO_NAME,
    marca: DEMO_NAME,
    segmento: 'corporativo',
    roster: 'comercial' as DemoRosterKey,
    fixture: 'acme' as DemoFixtureKey,
    loginSubtitle: 'Ambiente de treinamento e demonstração da Vertho',
    logoUrl: null,
    pppNome: 'ACME Demo - Cultura e Operação',
    ppp: ACME_DEMO_PPP,
    valores: ACME_DEMO_VALUES,
    acessoAllowlist: null as readonly string[] | null,
    resetPausadoAte: null as string | null,
    convidado: null as DemoConvidado | null,
    relatoriosOrganizacionais: {
      teamSize: ACME_DEMO_TEAM_SIZE,
      withProfile: ACME_DEMO_FUNNEL_TARGETS.withProfile,
      withMapping: ACME_DEMO_FUNNEL_TARGETS.withMapping,
    } as DemoRelatoriosOrganizacionais,
  },
  /**
   * O ambiente de outro SEGMENTO. Ele não é uma ACME com outra marca: o elenco
   * inteiro muda (roster escolar), e por isso ele não herda estrutura de
   * fixture nenhum — os três cargos nascem construídos.
   */
  [ESCOLAS_ACME_SLUG]: {
    slug: ESCOLAS_ACME_SLUG,
    nome: 'Rede de Escolas ACME',
    marca: 'Rede de Escolas ACME',
    segmento: 'educacao',
    roster: 'escolar' as DemoRosterKey,
    fixture: null as DemoFixtureKey,
    loginSubtitle: 'Ambiente de demonstração da jornada Vertho para redes de ensino',
    logoUrl: null,
    pppNome: 'Rede de Escolas ACME — Projeto Político-Pedagógico',
    ppp: PPP_REDE_ESCOLAS_ACME,
    valores: VALORES_REDE_ESCOLAS_ACME,
    acessoAllowlist: null as readonly string[] | null,
    // 🔴 PAUSA COM DATA DE FIM enquanto o golden não está congelado. O reset
    // apaga `cargos_empresa` e `banco_cenarios`, e o conteúdo de IA deste
    // ambiente (gabaritos e cenários) ainda vive SÓ no banco — sem a pausa, o
    // cron das 4h apagaria de madrugada o que a geração pagou. Sai quando o
    // fixture escolar estiver commitado, e não depois.
    resetPausadoAte: '2026-09-08T07:00:00.000Z' as string | null,
    convidado: null as DemoConvidado | null,
  },
  [GRUPO_SINAL_SLUG]: {
    slug: GRUPO_SINAL_SLUG,
    nome: 'Grupo Sinal — Demonstração',
    marca: 'Grupo Sinal',
    segmento: 'corporativo',
    roster: 'comercial' as DemoRosterKey,
    fixture: 'acme' as DemoFixtureKey,
    loginSubtitle: 'Ambiente de demonstração da jornada Vertho para o Grupo Sinal',
    logoUrl: 'https://www.gruposinal.com.br/assets/logo-grupo-sinal-white.webp',
    pppNome: 'Grupo Sinal — Contexto organizacional',
    ppp: GRUPO_SINAL_PPP,
    valores: GRUPO_SINAL_VALUES,
    acessoAllowlist: ['alpheu.sousa@gruposinal.com'] as readonly string[],
    // Pausa do reset noturno com DATA DE FIM (01/09/2026, a pedido do dono):
    // o Alpheu vai percorrer a experiência nesta semana e a conversa acontece
    // depois, então o que ele fizer precisa sobreviver às madrugadas.
    //
    // O adiamento normal do reset só cobre PASSAPORTE no prazo D+2 — e ele é
    // convidado nomeado do perfil, não passaporte: sem isto, resposta, DISC e
    // avaliação dele sumiriam às 04h e o seed o recriaria zerado.
    //
    // 🔑 A data é o desligamento: passado o instante abaixo (segunda, 07/09, no
    // horário do próprio cron), o ambiente volta a ser recomposto sozinho, sem
    // depender de alguém lembrar. Pausa sem data vira reset desligado para
    // sempre — o modo de falha do trabalho sazonal.
    resetPausadoAte: '2026-09-07T07:00:00.000Z' as string | null,
    convidado: {
      nome: 'Alpheu',
      email: 'alpheu.sousa@gruposinal.com',
      telefone: '+5511967673976',
      cargo: 'Representante Comercial',
    } as DemoConvidado,
  },
} as const;

export type DemoTenantSlug = keyof typeof DEMO_TENANT_PROFILES;

/**
 * De onde vem a ESTRUTURA do ambiente. `'acme'` semeia o fixture congelado do
 * tenant comercial; `null` é o ambiente cujos cargos nascem todos do roster.
 */
export type DemoFixtureKey = 'acme' | null;

/**
 * Até quando o reset AUTOMÁTICO deste ambiente está pausado, ou `null`.
 *
 * Fonte única: o cron consulta para pular, e a tela consulta para AVISAR quem
 * clica em "Resetar" — recusar o reset manual seria beco, já que a pessoa que
 * aperta o botão é a dona do ambiente. Ela decide sabendo o que perde.
 */
export function resetPausadoAte(slug: DemoTenantSlug, agora: Date = new Date()): string | null {
  const valor = DEMO_TENANT_PROFILES[slug]?.resetPausadoAte ?? null;
  if (!valor) return null;
  const limite = Date.parse(valor);
  if (!Number.isFinite(limite) || limite <= agora.getTime()) return null;
  return valor;
}

/** Aplica somente a identidade da empresa aos artefatos congelados. */
export function personalizarArtefatoDemo<T>(value: T, slug: DemoTenantSlug): T {
  const profile = DEMO_TENANT_PROFILES[slug];
  if (slug === DEMO_SLUG) return value;
  if (typeof value === 'string') {
    const marca = profile.marca;
    return value
      .replace(/\bA ACME Demo\b/g, `O ${marca}`)
      .replace(/\ba ACME Demo\b/g, `o ${marca}`)
      .replace(/\bda ACME Demo\b/g, `do ${marca}`)
      .replace(/\bna ACME Demo\b/g, `no ${marca}`)
      .replace(/\bpela ACME Demo\b/g, `pelo ${marca}`)
      .replace(/\bà ACME Demo\b/g, `ao ${marca}`)
      .replace(/\bA ACME\b/g, `O ${marca}`)
      .replace(/\ba ACME\b/g, `o ${marca}`)
      .replace(/\bda ACME\b/g, `do ${marca}`)
      .replace(/\bna ACME\b/g, `no ${marca}`)
      .replace(/\bpela ACME\b/g, `pelo ${marca}`)
      .replace(/\bà ACME\b/g, `ao ${marca}`)
      .replace(/ACME Demo/g, marca)
      .replace(/\bACME\b/g, marca) as T;
  }
  if (Array.isArray(value)) return value.map((item) => personalizarArtefatoDemo(item, slug)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [key, personalizarArtefatoDemo(item, slug)]),
    ) as T;
  }
  return value;
}



export function personaDemoComMapeamentoCompleto(persona: { scenario?: string }): boolean {
  return persona.scenario === 'completo';
}

// Colunas comportamentais (comp_*/lid_*) DETERMINÍSTICAS a partir do DISC — as
// comp_* seguem a fórmula do simulador-disc sem o ruído aleatório (reproduzível
// a cada reset). O motor de Adequação (fit v2) LÊ essas colunas do colaborador;
// sem elas o bloco competências/liderança fica 0 e os knockouts de traço (ex.:
// Organização, Prudência) reprovam mesmo com DISC perfeito.
// Ver [[project_ranking_adequacao]].
//
// 🔴 As lid_* seguem o MAPEAMENTO REAL (`computeLeadership`), não o simulador.
// A régua do produto é `lid_X = DISC_X / 2` — medido em 24/08: 199 dos 218
// colaboradores com DISC batem exatamente (Macaé 138/138, Ibipeba 52/52, Elo
// 6/6, UniAnchieta 2/2). O simulador usa outra coisa (0,7·D + 0,3·C etc.) numa
// escala 0-100, e o demo herdara ISSO: as personas saíam com Metódico 71 /
// Sistemático 74 onde o produto real daria 32 e 39. Um número que a plataforma
// nunca produz não pode aparecer numa demo — e ainda estourava a barra da tela.
// 🔴 As comp_* também: elas eram `cl(D)`, `cl((D+I)/2)`… — uma TERCEIRA régua,
// nem a do produto nem a do simulador. Isso não era cosmético: o motor de fit
// lê comp_* nos knockouts, e o "Não recomendado" do Paulo saía de um
// `comp_persistencia = cl(S) = 24` que a regressão canônica jamais produziria
// para aquele DISC (daria 50). A demo exibia uma reprovação que o produto real
// não geraria — e o DISC das personas era recalibrado (ver PERSONAS) para que
// os efeitos de vitrine (knockout do Paulo, aderência baixa da Bruna) voltem a
// existir PELA régua, não apesar dela.
/**
 * Junta os artefatos congelados das duas fontes (fixture principal + extras dos
 * cargos demo-only) CHAVE A CHAVE dentro de cada persona.
 *
 * 🔴 Era um spread raso — e a entrada do extra SUBSTITUÍA a do fixture. A
 * Mariana existe nos dois (respostas/assessments no extra, relatório no
 * fixture) e perdia o relatório em TODO reset: a tela de perfil dela disparava
 * geração de IA ao vivo no meio da demo. O sintoma aparece longe da causa —
 * congelar o artefato no arquivo "certo" não resolvia, porque o problema era o
 * merge.
 */
export function mesclarPersonaArtifacts(...fontes: any[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const fonte of fontes) {
    for (const [email, artefato] of Object.entries<any>(fonte || {})) {
      out[email] = { ...(out[email] || {}), ...(artefato || {}) };
    }
  }
  return out;
}

export function comportamentosDoDisc(D: number, I: number, S: number, C: number) {
  // Mesmo arredondamento do caminho real: executivo/motivador com 1 casa,
  // metódico/sistemático inteiros (mapeamento-actions.ts:116-119).
  const meio1 = (v: number) => Math.round((v / 2) * 10) / 10;
  const meio0 = (v: number) => Math.round(v / 2);
  const comp = computeDiscCompetenciesNatural({ D, I, S, C });
  return {
    lid_executivo: meio1(D), lid_motivador: meio1(I),
    lid_metodico: meio0(S), lid_sistematico: meio0(C),
    comp_ousadia: comp.Ousadia, comp_comando: comp.Comando, comp_objetividade: comp.Objetividade,
    comp_assertividade: comp.Assertividade, comp_persuasao: comp['Persuasão'], comp_extroversao: comp['Extroversão'],
    comp_entusiasmo: comp.Entusiasmo, comp_sociabilidade: comp.Sociabilidade, comp_empatia: comp.Empatia,
    comp_paciencia: comp['Paciência'], comp_persistencia: comp['Persistência'], comp_planejamento: comp.Planejamento,
    comp_organizacao: comp['Organização'], comp_detalhismo: comp.Detalhismo, comp_prudencia: comp['Prudência'],
    comp_concentracao: comp['Concentração'],
  };
}

const strip = (row: any, extra: string[] = []) => {
  const out = { ...row };
  for (const k of ['id', 'created_at', 'updated_at', ...extra]) delete out[k];
  return out;
};

export interface ResetDemoResult {
  ok: boolean;
  empresaId?: string;
  counts?: Record<string, number | null>;
  error?: string;
}

// Ordem é parte da segurança do reset. `relatorios.colaborador_id` usa
// ON DELETE SET NULL e há unicidade para relatório agregado; se os relatórios
// não saírem antes das personas, dois documentos podem colidir ao virar NULL e
// o reset fica pela metade.
export const DEMO_RESET_TABLES = [
  'relatorios',
  'temporada_semana_progresso', 'trilhas', 'reavaliacao_sessoes', 'sessoes_avaliacao',
  'descriptor_assessments', 'respostas', 'videos_watched', 'fase4_progresso',
  'banco_cenarios', 'top10_cargos', 'colaboradores', 'cargos_empresa',
  // `escolas` sai ANTES de `ppp_escolas` (FK `ppp_escola_id`) e depois de
  // `colaboradores` (FK `escola_id`). Sem ela na lista, cada reset somaria as
  // unidades de novo: a rede amanheceria com nove escolas na terceira noite.
  'competencias', 'escolas', 'ppp_escolas',
] as const;

type DemoWarmSnapshot = {
  colaboradores: Array<{
    email: string;
    comportamental_pdf_path: string | null;
    comportamental_audio_path: string | null;
    comportamental_audio_at: string | null;
  }>;
  relatorios: Array<{
    ownerEmail: string | null;
    tipo: string;
    conteudo: any;
    pdf_path: string | null;
    gerado_em: string | null;
  }>;
  audiosPersonalizadosJornada: Array<{
    ownerEmail: string;
    contentId: string;
    sourcePath: string;
  }>;
  videosPersonalizadosJornada: Array<{
    ownerEmail: string;
    cellVideoId: string;
    nomeUsado: string;
    videoUrl: string | null;
    bunnyVideoId: string;
    bunnyLibrary: string | null;
  }>;
};

function demoAudioPersonalizadoPath(contentId: string, colaboradorId: string): string {
  const seguro = (value: string) => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `final/audio-personalizado/${seguro(contentId)}/${seguro(colaboradorId)}.mp3`;
}

export function relatorioIndividualDemoValido(conteudoRaw: unknown): boolean {
  let conteudo: any = conteudoRaw;
  if (typeof conteudoRaw === 'string') {
    try { conteudo = JSON.parse(conteudoRaw); } catch { return false; }
  }
  const competencias = Array.isArray(conteudo?.competencias) ? conteudo.competencias : [];
  return competencias.length > 0 && competencias.every((competencia: any) => {
    const nivel = Number(competencia?.nivel_atual ?? competencia?.nivel);
    return Number.isInteger(nivel) && nivel >= 1 && nivel <= 4;
  });
}

export interface DemoAccessResult {
  ok: boolean;
  url?: string;
  senha?: string;
  acessos?: Array<{ visao: string; nome: string; email: string }>;
  error?: string;
}

export interface DemoMagicLinksResult {
  ok: boolean;
  acessos?: Array<{ visao: string; nome: string; email: string; url: string }>;
  error?: string;
}

export interface DemoPresentationLinksResult {
  ok: boolean;
  acessos?: Array<{
    roleKey: DemoPresentationRoleKey;
    visao: string;
    nome: string;
    email: string;
    url: string;
    directUrl: string;
  }>;
  error?: string;
}


/** Quem atende cada visão da sala NESTE ambiente (vem do roster do perfil). */
function salaDoTenant(slug: DemoTenantSlug) {
  return rosterDemo(DEMO_TENANT_PROFILES[slug].roster).salaApresentacao;
}

async function validarTenantEAcessosDemo(sb: any, slug: DemoTenantSlug) {
  const profile = DEMO_TENANT_PROFILES[slug];
  const sala = salaDoTenant(slug);
  const { data: empresa, error: empresaError } = await sb.from('empresas')
    .select('id, is_demo')
    .eq('slug', profile.slug)
    .maybeSingle();
  if (empresaError) throw new Error(`carregar tenant: ${empresaError.message}`);
  if (!empresa?.id || empresa.is_demo !== true) {
    throw new Error(`O tenant ${profile.slug} não existe ou não está marcado como demonstração.`);
  }

  const emails = sala.map((a) => a.email);
  const { data: colabs, error: colabsError } = await sb.from('colaboradores')
    .select('email, role')
    .eq('empresa_id', empresa.id)
    .in('email', emails);
  if (colabsError) throw new Error(`validar personas: ${colabsError.message}`);
  for (const acesso of sala) {
    const colab = (colabs || []).find((c: any) => c.email?.toLowerCase() === acesso.email);
    if (!colab || colab.role !== acesso.role) {
      throw new Error(`${acesso.email} não existe no ${profile.slug} com role=${acesso.role}. Resete o ambiente antes de preparar os acessos.`);
    }
  }
  return { empresa, profile, sala };
}

async function buscarUsuarioAuth(sb: any, email: string) {
  const perPage = 200;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listar usuários: ${error.message}`);
    const users = data.users as Array<{ id: string; email?: string }>;
    const user = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (users.length < perPage) return null;
  }
  throw new Error('Busca de usuário excedeu 10.000 contas.');
}

/** Executa o reset completo. NÃO lança — devolve `{ok:false,error}` em falha
 *  (o caller — action/cron — decide como reportar). */
export async function resetDemoTenant(slug: DemoTenantSlug): Promise<ResetDemoResult> {
  const sb = createSupabaseAdmin();
  const profile = DEMO_TENANT_PROFILES[slug];
  // O elenco vem do PERFIL do ambiente; o motor não sabe de que segmento se
  // trata. Trocar o roster é trocar esta declaração, não o reset.
  const roster: DemoRoster = rosterDemo(profile.roster);
  // O fixture de ESTRUTURA (competências, cargos, top10, cenários capturados de
  // um tenant vivo) é do ambiente, não do motor. Quem tem todos os cargos
  // construídos no roster não herda estrutura de ninguém, e semear o fixture
  // comercial ali plantaria Representante Comercial numa rede de escolas.
  const fx: any = profile.fixture === 'acme' ? (fixture as any) : {
    empresa: {},
    competencias: [],
    cargos: [],
    top10: [],
    cenarios: [],
    personaArtifacts: {},
  };
  const brand = <T,>(value: T): T => personalizarArtefatoDemo(value, slug);

  async function must(label: string, promise: any) {
    const r = await promise;
    if (r.error) throw new Error(`${label}: ${r.error.message}`);
    return r.data;
  }
  async function maybeDelete(table: string, empresaId: string) {
    const r = await sb.from(table).delete().eq('empresa_id', empresaId);
    if (!r.error) return;
    // Compatibilidade com ambientes antigos em que uma tabela opcional nunca
    // existiu. Qualquer outro erro aborta: continuar depois de uma exclusão
    // crítica falhar produz um tenant híbrido e viola a idempotência do reset.
    if (r.error.code === 'PGRST205' || /Could not find the table/i.test(r.error.message)) {
      console.warn(`[reset-demo] skip delete ${table}: ${r.error.message}`);
      return;
    }
    throw new Error(`delete ${table}: ${r.error.message}`);
  }

  async function resetTenant(empresaId: string) {
    for (const table of DEMO_RESET_TABLES) await maybeDelete(table, empresaId);
  }

  async function snapshotWarmArtifacts(empresaId: string): Promise<DemoWarmSnapshot> {
    const colaboradores = await must('snapshot colaboradores demo', sb.from('colaboradores')
      .select('id,email,comportamental_pdf_path,comportamental_audio_path,comportamental_audio_at')
      .eq('empresa_id', empresaId));
    const relatorios = await must('snapshot relatorios demo', sb.from('relatorios')
      .select('colaborador_id,tipo,conteudo,pdf_path,gerado_em')
      .eq('empresa_id', empresaId)
      .in('tipo', ['individual', 'gestor', 'rh']));
    const emailPorId = new Map<string, string>((colaboradores || [])
      .map((colaborador: any) => [String(colaborador.id), String(colaborador.email)] as const));
    // A linha nominal usa o UUID do colaborador e recebe CASCADE quando o reset
    // recria as personas. O asset no Bunny continua pronto, mas sem esta ponte a
    // semana volta silenciosamente ao deck genérico. Snapshot por EMAIL (chave
    // estável da persona) e restauração para o UUID novo mantêm a saudação pronta.
    const celulas = await must('snapshot células de vídeo demo', sb.from('videos_gerados')
      .select('id')
      .eq('empresa_id', empresaId));
    const cellIds = (celulas || []).map((celula: any) => celula.id);
    const personalizados = cellIds.length
      ? await must('snapshot vídeos personalizados demo', sb.from('videos_personalizados')
          .select('cell_video_id,colaborador_id,nome_usado,status,video_url,bunny_video_id,bunny_library')
          .in('cell_video_id', cellIds)
          .eq('status', 'done'))
      : [];
    // O cache de podcast personalizado usa o UUID do colaborador no path. Como
    // o reset apaga/recria as personas, esse UUID muda e o primeiro play voltava
    // a pagar TTS (~2-5 min), mesmo com o áudio já pronto. Capturamos somente os
    // MP3s que pertencem às personas atuais e aos conteúdos deste tenant. Os
    // arquivos serão MOVIDOS para o UUID novo no restore (não duplicados).
    const audios = await must('snapshot conteúdos de áudio demo', sb.from('micro_conteudos')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('formato', 'audio'));
    const audiosPersonalizadosJornada: DemoWarmSnapshot['audiosPersonalizadosJornada'] = [];
    for (const audio of audios || []) {
      // A pasta é a parte estável até o contentId. Construí-la explicitamente
      // evita listar o Storage inteiro e mantém o reset proporcional ao
      // catálogo do tenant.
      const pastaAudio = `final/audio-personalizado/${String(audio.id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      const { data: arquivos, error: arquivosError } = await sb.storage.from('conteudos')
        .list(pastaAudio, { limit: 1000 });
      if (arquivosError) throw new Error(`snapshot áudio ${audio.id}: ${arquivosError.message}`);
      for (const arquivo of arquivos || []) {
        if (!arquivo.name.endsWith('.mp3') || Number(arquivo.metadata?.size || 0) <= 0) continue;
        const colaboradorId = arquivo.name.slice(0, -4);
        const ownerEmail = emailPorId.get(colaboradorId);
        if (!ownerEmail) continue;
        audiosPersonalizadosJornada.push({
          ownerEmail,
          contentId: audio.id,
          sourcePath: `${pastaAudio}/${arquivo.name}`,
        });
      }
    }
    return {
      colaboradores: (colaboradores || [])
        .filter((colaborador: any) => colaborador.comportamental_pdf_path || colaborador.comportamental_audio_path)
        .map(({ id, ...colaborador }: any) => colaborador),
      relatorios: (relatorios || [])
        .filter((relatorio: any) => relatorio.pdf_path)
        .filter((relatorio: any) => relatorio.tipo !== 'individual' || relatorioIndividualDemoValido(relatorio.conteudo))
        .map((relatorio: any) => ({
          ownerEmail: relatorio.colaborador_id ? emailPorId.get(relatorio.colaborador_id) || null : null,
          tipo: relatorio.tipo,
          conteudo: relatorio.conteudo,
          pdf_path: relatorio.pdf_path,
          gerado_em: relatorio.gerado_em,
        })),
      audiosPersonalizadosJornada,
      videosPersonalizadosJornada: (personalizados || [])
        .filter((video: any) => emailPorId.has(String(video.colaborador_id)) && video.bunny_video_id)
        .map((video: any) => ({
          ownerEmail: emailPorId.get(String(video.colaborador_id))!,
          cellVideoId: video.cell_video_id,
          nomeUsado: video.nome_usado,
          videoUrl: video.video_url,
          bunnyVideoId: video.bunny_video_id,
          bunnyLibrary: video.bunny_library,
        })),
    };
  }

  async function restoreWarmArtifacts(
    empresaId: string,
    personaMap: Map<string, string>,
    snapshot: DemoWarmSnapshot,
  ) {
    const idPorEmail = new Map<string, string>();
    for (const persona of roster.personas) {
      const id = personaMap.get(persona.key);
      if (id) idPorEmail.set(persona.email, id);
    }
    if (slug === DEMO_SLUG) {
      for (const pessoa of ACME_DEMO_REPORT_DIRECTORY) {
        const id = personaMap.get(pessoa.key);
        if (id) idPorEmail.set(pessoa.email, id);
      }
    }
    const rhId = personaMap.get(roster.administradora.key);
    if (rhId) idPorEmail.set(roster.administradora.email, rhId);

    for (const artifact of snapshot.colaboradores) {
      const colaboradorId = idPorEmail.get(artifact.email);
      if (!colaboradorId) continue;
      const result = await sb.from('colaboradores').update({
        comportamental_pdf_path: artifact.comportamental_pdf_path,
        comportamental_audio_path: artifact.comportamental_audio_path,
        // O reset diário comprovou que o arquivo segue no Storage. Renovar o
        // carimbo evita que o cache de 30 dias mande a apresentação de volta ao
        // TTS mesmo com o MP3 aquecido e válido.
        comportamental_audio_at: artifact.comportamental_audio_path
          ? new Date().toISOString()
          : artifact.comportamental_audio_at,
      }).eq('empresa_id', empresaId).eq('id', colaboradorId);
      if (result.error) throw new Error(`restaurar mídia ${artifact.email}: ${result.error.message}`);
    }

    for (const relatorio of snapshot.relatorios) {
      const colaboradorId = relatorio.ownerEmail ? idPorEmail.get(relatorio.ownerEmail) : null;
      if (relatorio.ownerEmail && !colaboradorId) continue;
      const result = await sb.from('relatorios').insert({
        empresa_id: empresaId,
        colaborador_id: colaboradorId,
        tipo: relatorio.tipo,
        conteudo: relatorio.conteudo,
        pdf_path: relatorio.pdf_path,
        gerado_em: relatorio.gerado_em || new Date().toISOString(),
      });
      if (result.error) throw new Error(`restaurar relatório ${relatorio.tipo}: ${result.error.message}`);
    }

    for (const video of snapshot.videosPersonalizadosJornada) {
      const colaboradorId = idPorEmail.get(video.ownerEmail);
      if (!colaboradorId) continue;
      const result = await sb.from('videos_personalizados').upsert({
        cell_video_id: video.cellVideoId,
        colaborador_id: colaboradorId,
        nome_usado: video.nomeUsado,
        status: 'done',
        video_url: video.videoUrl,
        bunny_video_id: video.bunnyVideoId,
        bunny_library: video.bunnyLibrary,
        error: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'cell_video_id,colaborador_id' });
      if (result.error) throw new Error(`restaurar vídeo nominal ${video.ownerEmail}: ${result.error.message}`);
    }

    for (const audio of snapshot.audiosPersonalizadosJornada) {
      const colaboradorId = idPorEmail.get(audio.ownerEmail);
      if (!colaboradorId) continue;
      const destino = demoAudioPersonalizadoPath(audio.contentId, colaboradorId);
      if (destino === audio.sourcePath) continue;
      const { error } = await sb.storage.from('conteudos').move(audio.sourcePath, destino);
      if (error) throw new Error(`restaurar áudio de jornada ${audio.ownerEmail}: ${error.message}`);
    }
  }

  function demoSysConfig(sourceConfig: any = {}) {
    // 🔴 `ai.modelos` NÃO é copiado do fixture (25/08/2026).
    //
    // O spread abaixo trazia o bloco inteiro, e o fixture carregava
    // `{ia3_check: 'gpt-5.4', ia4_check: 'gpt-5.4'}` — modelo que MORREU (403
    // com a chave do projeto). Como override explícito por task vence o pin, os
    // dois auditores Dual-IA da demo apontavam para o nada.
    //
    // A migration 227 limpou isso no banco e o reset das 04h REPÔS: consertei o
    // sintoma no dado e deixei o escritor de pé. Medido no re-check de hoje —
    // 20 chamadas morreram com `OpenAI 403 (gpt-5.4)` num tenant que eu tinha
    // dado por limpo horas antes.
    //
    // Política de MODELO é decisão de plataforma (`DEFAULT_TASK_MODELS` +
    // `PINNED_TASKS`), não característica de tenant. Copiá-la para a demo só
    // propaga configuração velha; sem ela, a demo resolve pelos pins, que é o
    // comportamento correto e o que o resto da base já faz.
    const { ai: aiDaOrigem, ...restoDaOrigem } = sourceConfig || {};
    const ai = aiDaOrigem ? { ...aiDaOrigem, modelos: {} } : undefined;
    return {
      ...restoDaOrigem,
      ...(ai ? { ai } : {}),
      allow_open_signup: true,
      mapeamento_cenarios_liberado: true,
      perfil_comportamental_liberado: true,
      programa_modo: 'regular',
      cadencia: { ...(sourceConfig.cadencia || {}), email_ativo: false, whatsapp_ativo: false },
      envios: {},
      // Exceção do envio-guard (login self-service do prospect). NÃO entra no
      // acme-demo: lá nenhum contato real deve receber link.
      ...(profile.acessoAllowlist?.length ? { demo_acesso_allowlist: [...profile.acessoAllowlist] } : {}),
    };
  }

  async function upsertEmpresaDemo(source: any) {
    const payload = {
      nome: profile.nome, slug: profile.slug, segmento: profile.segmento || source.segmento || 'corporativo',
      is_demo: true, // gate de envio (mig 160): fonte única de "tenant de demonstração"
      sys_config: demoSysConfig(source.sys_config || {}),
      ui_config: {
        ...(source.ui_config || {}),
        ...(profile.logoUrl ? { logo_url: profile.logoUrl } : {}),
        login_subtitle: profile.loginSubtitle,
      },
      default_locale: source.default_locale || 'pt-BR',
    };
    const existing = await must('load demo empresa', sb.from('empresas').select('id').eq('slug', profile.slug).maybeSingle());
    if (existing?.id) {
      return await must('update demo empresa', sb.from('empresas').update(payload).eq('id', existing.id).select('id,nome,slug').single());
    }
    return await must('insert demo empresa', sb.from('empresas').insert(payload).select('id,nome,slug').single());
  }

  // Seed a partir do FIXTURE congelado (arrays), não do acme vivo. Mantém o
  // remapeamento source-id→new-id (competências/cenários) pra preservar as FKs.
  async function seedCompetencias(rows: any[], destId: string) {
    const idMap = new Map<string, string>();
    if (!rows?.length) return idMap;
    for (const row of rows) {
      if (roster.cargosExcluidosDoFixture.has(row.cargo)) continue;
      const inserted = await must('insert competencia', sb.from('competencias').insert({ ...strip(brand(row)), empresa_id: destId }).select('id').single());
      idMap.set(row.id, inserted.id);
    }
    return idMap;
  }

  async function ensurePresentationVideo(destId: string, personaMap: Map<string, string>) {
    const videoInfra = (DEMO_PRESENTATION_WEEK_VIDEO.byTenant as Record<string, any>)[slug];
    // Sem célula declarada para este ambiente não há vídeo nominal a recompor.
    // Seguir daqui plantaria a competência-base e o módulo COMERCIAIS num
    // tenant de outro segmento.
    if (!videoInfra) return;
    const libraryId = String(process.env.BUNNY_LIBRARY_ID || 636615);

    // Módulo real da semana 1: sem ele `resolverVideoDaSemana` não tem uma
    // célula para consultar, ainda que exista um MP4 editorial no catálogo.
    const competenciaBaseResult = await sb.from('competencias_base').upsert({
      id: DEMO_PRESENTATION_WEEK_VIDEO.competenciaBaseId,
      segmento: 'corporativo',
      cod_comp: 'DEMO_NEGOCIACAO',
      nome: 'Negociação e Fechamento',
      pilar: 'Comercial',
      descricao: 'Conduzir negociações de forma consultiva e avançar para decisões sustentáveis.',
      cod_desc: 'DEMO_NEG_D1',
      nome_curto: 'Senso de urgência',
      descritor_completo: 'Criar senso de urgência legítimo, sem pressão artificial.',
      n1_gap: 'Evita explicitar o custo de adiar a decisão.',
      n2_desenvolvimento: 'Apresenta motivos concretos para decidir no tempo certo.',
      n3_meta: 'Conduz urgência consultiva com consistência.',
      n4_referencia: 'É referência em acelerar decisões preservando confiança.',
      cargo: DEMO_PRESENTATION_VIDEO.cargo,
    }, { onConflict: 'id' });
    if (competenciaBaseResult.error) throw new Error(`competência-base do vídeo da apresentação: ${competenciaBaseResult.error.message}`);

    const moduloResult = await sb.from('modulos_base_conteudo').upsert({
      id: videoInfra.moduleId,
      empresa_id: destId,
      competencia_base_id: DEMO_PRESENTATION_WEEK_VIDEO.competenciaBaseId,
      competencia_id: null,
      locale: 'pt-BR',
      nivel_entrada: 'N1',
      nivel_destino: 'N2',
      titulo: 'Senso de urgência legítimo',
      finalidade: 'Ajudar representantes comerciais a tornar claro o custo de adiar uma decisão sem recorrer a pressão artificial.',
      contexto_pedagogico: DEMO_PRESENTATION_VIDEO.cargo,
      tags: ['negociação', 'fechamento', 'urgência'],
      preferido: false,
      status: 'publicado',
      versao: 1,
      descritor: 'Criação de senso de urgência',
      conteudo_central: { ideia: 'Urgência legítima nasce de fatos concretos e do custo real de adiar.' },
      conteudo_aplicavel: { pratica: 'Explicite uma razão verdadeira para decidir agora.' },
      guarda_corpos: { evitar: ['pressão artificial', 'escassez falsa'] },
      adaptacao_por_formato: { video_roteiro: 'Tom consultivo, direto e aplicável.' },
      created_by: 'demo-presentation',
      published_by: 'demo-presentation',
      published_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (moduloResult.error) throw new Error(`módulo do vídeo da apresentação: ${moduloResult.error.message}`);

    // O tuple abaixo é o mesmo da unique parcial uq_micro_conteudos_core.
    // Buscar pelo SLOT (e não só pelo GUID) torna a atualização idempotente e
    // evita colidir se o vídeo editorial for trocado no futuro.
    const existing = await must('load vídeo da apresentação', sb.from('micro_conteudos')
      .select('id')
      .eq('empresa_id', destId)
      .eq('competencia', DEMO_PRESENTATION_VIDEO.competencia)
      .eq('descritor', DEMO_PRESENTATION_VIDEO.descritor)
      .eq('formato', DEMO_PRESENTATION_VIDEO.formato)
      .eq('cargo', DEMO_PRESENTATION_VIDEO.cargo)
      .is('kit_id', null)
      .maybeSingle());

    const payload = {
      ...DEMO_PRESENTATION_VIDEO,
      empresa_id: destId,
      modulo_base_id: videoInfra.moduleId,
      url: `https://iframe.mediadelivery.net/embed/${libraryId}/${DEMO_PRESENTATION_VIDEO.bunny_video_id}`,
    };

    if (existing?.id) {
      const { error } = await sb.from('micro_conteudos')
        .update(payload)
        .eq('id', existing.id)
        .eq('empresa_id', destId);
      if (error) throw new Error(`update vídeo da apresentação: ${error.message}`);
    } else {
      const { error } = await sb.from('micro_conteudos').insert(payload);
      if (error) throw new Error(`insert vídeo da apresentação: ${error.message}`);
    }

    // Liga também os formatos do kit ao mesmo módulo. É o `core_id` de texto,
    // áudio ou case que a semana passa ao resolvedor de vídeo.
    const kit = await must('load kit do vídeo da apresentação', sb.from('kits')
      .select('id,brief_id,kit_briefs!inner(empresa_id,competencia,descritor,cargo)')
      .eq('disc', 'C')
      .eq('status', 'published')
      .eq('kit_briefs.empresa_id', destId)
      .eq('kit_briefs.competencia', roster.cargoPrincipalFoco[0])
      .eq('kit_briefs.descritor', 'Criação de senso de urgência')
      .eq('kit_briefs.cargo', DEMO_PRESENTATION_VIDEO.cargo)
      .maybeSingle());
    if (kit?.brief_id) {
      const briefResult = await sb.from('kit_briefs')
        .update({ modulo_base_id: videoInfra.moduleId }).eq('id', kit.brief_id);
      if (briefResult.error) throw new Error(`vincular brief ao módulo da apresentação: ${briefResult.error.message}`);
      const kitContentsResult = await sb.from('micro_conteudos')
        .update({ modulo_base_id: videoInfra.moduleId })
        .eq('kit_id', kit.id)
        .eq('empresa_id', destId);
      if (kitContentsResult.error) throw new Error(`vincular kit ao módulo da apresentação: ${kitContentsResult.error.message}`);
    }

    const existingCell = await must('load célula do vídeo da apresentação', sb.from('videos_gerados')
      .select('id')
      .eq('modulo_base_id', videoInfra.moduleId)
      .eq('empresa_id', destId)
      .eq('cargo', DEMO_PRESENTATION_VIDEO.cargo)
      .eq('disc_dominante', 'C')
      .neq('status', 'error')
      .maybeSingle());
    const cellId = existingCell?.id || videoInfra.cellId;
    const cellPayload = {
      modulo_base_id: videoInfra.moduleId,
      empresa_id: destId,
      status: 'done',
      etapa: 'done',
      bunny_video_id: DEMO_PRESENTATION_VIDEO.bunny_video_id,
      bunny_library: libraryId,
      video_url: `https://iframe.mediadelivery.net/play/${libraryId}/${DEMO_PRESENTATION_VIDEO.bunny_video_id}`,
      cargo: DEMO_PRESENTATION_VIDEO.cargo,
      disc_dominante: 'C',
      kit_id: kit?.id || null,
      created_by: 'demo-presentation',
      error: null,
    };
    if (existingCell?.id) {
      const cellResult = await sb.from('videos_gerados')
        .update(cellPayload).eq('id', cellId).eq('empresa_id', destId);
      if (cellResult.error) throw new Error(`update célula do vídeo da apresentação: ${cellResult.error.message}`);
    } else {
      const cellResult = await sb.from('videos_gerados').insert({ id: cellId, ...cellPayload });
      if (cellResult.error) throw new Error(`insert célula do vídeo da apresentação: ${cellResult.error.message}`);
    }

    const brunaId = personaMap.get('bruna');
    if (brunaId) {
      const personalizedResult = await sb.from('videos_personalizados').upsert({
        cell_video_id: cellId,
        colaborador_id: brunaId,
        nome_usado: 'Bruna',
        status: 'done',
        video_url: `https://iframe.mediadelivery.net/play/${libraryId}/${DEMO_PRESENTATION_WEEK_VIDEO.personalizedBunnyVideoId}`,
        bunny_video_id: DEMO_PRESENTATION_WEEK_VIDEO.personalizedBunnyVideoId,
        bunny_library: libraryId,
        error: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'cell_video_id,colaborador_id' });
      if (personalizedResult.error) throw new Error(`vídeo nominal da Bruna na apresentação: ${personalizedResult.error.message}`);
    }
  }

  async function seedCargos(rows: any[], destId: string) {
    if (!rows?.length) return;
    const payload = rows.filter((row: any) => !roster.cargosExcluidosDoFixture.has(row.nome)).map((row: any) => {
      let top5 = Array.isArray(row.top5_workshop) ? row.top5_workshop : [];
      if (row.nome === roster.cargoPrincipal) top5 = roster.cargoPrincipalTop5;
      else if (top5.length > 5) top5 = top5.slice(0, 5);
      // Tenant de demo nunca nasce com foco órfão. Se o fixture antigo não
      // tiver foco válido, o primeiro item do próprio Top 5 é o fallback.
      const focos = focosValidosDemo(row, top5, roster);
      return {
        ...strip(brand(row)),
        empresa_id: destId,
        top5_workshop: top5,
        competencia_foco: focos[0] || null,
        competencias_foco: focos,
      };
    });
    await must('insert cargos', sb.from('cargos_empresa').insert(payload));
  }

  async function seedTop10(rows: any[], destId: string, compMap: Map<string, string>) {
    const payload = (rows || [])
      .map((row: any) => {
        const competenciaId = compMap.get(row.competencia_id);
        if (!competenciaId) return null;
        return { ...strip(brand(row)), empresa_id: destId, competencia_id: competenciaId };
      })
      .filter(Boolean);
    if (payload.length) await must('insert top10', sb.from('top10_cargos').insert(payload));
  }

  async function seedCenarios(rows: any[], destId: string, compMap: Map<string, string>) {
    const idMap = new Map<string, string>();
    for (const row of rows || []) {
      const competenciaId = compMap.get(row.competencia_id);
      if (!competenciaId) continue;
      const inserted = await must('insert cenario', sb.from('banco_cenarios').insert({ ...strip(brand(row)), empresa_id: destId, competencia_id: competenciaId, ppp_escola_id: null }).select('id').single());
      idMap.set(row.id, inserted.id);
    }
    return idMap;
  }

  function demoScenarioFor(cargo: string, compNome: string) {
    return {
      titulo: `${compNome} em uma situação real de ${cargo}`,
      descricao: `Você atua como ${cargo} no ${profile.marca}. Durante uma semana crítica, surge uma situação que exige ${compNome.toLowerCase()}. Há pressão de prazo, informações incompletas e impacto para outras áreas. Você precisa decidir como agir, o que comunicar e como acompanhar o resultado sem perder qualidade nem responsabilidade.`,
      alternativas: {
        perguntas: [
          { numero: 1, texto: 'Qual é o problema principal que você identificaria antes de agir?' },
          { numero: 2, texto: 'Que ação concreta você tomaria nas próximas horas?' },
          { numero: 3, texto: 'Como você equilibraria prazo, qualidade e relacionamento com as áreas envolvidas?' },
          { numero: 4, texto: 'Como você avaliaria depois se sua decisão funcionou?' },
        ],
      },
      nota_check: 85,
      status_check: 'aprovado',
      tipo_cenario: null,
      ppp_escola_id: null,
    };
  }

  function demoDescriptorsFor(compNome: string, descricao: string) {
    return [
      ['D01', 'Leitura do contexto e identificação do problema', `Capacidade de entender a situação, separar fatos de suposições e reconhecer onde ${compNome.toLowerCase()} é exigida.`],
      ['D02', 'Critério de priorização e tomada de decisão', `Capacidade de escolher uma linha de ação coerente, considerando impacto, urgência, risco e qualidade da entrega em ${compNome.toLowerCase()}.`],
      ['D03', 'Execução com método e acompanhamento', `Capacidade de transformar a decisão em passos claros, acompanhar evolução e corrigir desvios relacionados a ${compNome.toLowerCase()}.`],
      ['D04', 'Comunicação com stakeholders', `Capacidade de comunicar decisões, riscos e combinados de forma clara para as pessoas impactadas por ${compNome.toLowerCase()}.`],
      ['D05', 'Colaboração e negociação de dependências', `Capacidade de articular áreas, negociar prioridades e reduzir atritos quando ${compNome.toLowerCase()} depende de outras pessoas.`],
      ['D06', 'Aprendizado, ética e melhoria contínua', `Capacidade de aprender com a situação, preservar responsabilidade ética e melhorar práticas futuras de ${compNome.toLowerCase()}.`],
    ].map(([suffix, nomeCurto, descritor]) => ({
      suffix,
      nome_curto: nomeCurto,
      descritor_completo: `${descritor} ${descricao}`,
      n1_gap: 'Age de forma reativa, sem critério claro, evidências suficientes ou responsabilidade sobre os impactos.',
      n2_desenvolvimento: 'Reconhece o que precisa ser feito, mas aplica a competência de forma parcial, tardia ou dependente de cobrança externa.',
      n3_meta: 'Aplica a competência com consistência, usando critérios claros, comunicando riscos e acompanhando resultados.',
      n4_referencia: 'Serve de referência para o time, antecipa riscos, melhora práticas e ajuda outras pessoas a elevar o padrão de atuação.',
      evidencias_esperadas: 'Exemplos concretos, critérios usados, registros, comunicação feita, acompanhamento e aprendizado gerado.',
      perguntas_alvo: 'Conte uma situação recente em que essa competência foi exigida. | Que critérios você usou para decidir? | Como acompanhou o resultado? | O que mudou depois da experiência?',
    }));
  }

  async function insertDemoPPP(destId: string) {
    const result = await sb.from('ppp_escolas').insert({
      empresa_id: destId,
      escola: profile.pppNome,
      fonte: 'json',
      status: 'extraido',
      extracao: JSON.stringify(profile.ppp),
      valores: profile.valores,
      extracted_at: new Date().toISOString(),
    });
    await must('insert ppp demo', result);
  }

  /**
   * Unidades da organização (as escolas de uma rede). `area_depto_origens` é o
   * elo com o cadastro: as pessoas trazem o nome da unidade em `area_depto`, e
   * é por ele que as telas de rede agrupam. Elenco sem unidades (uma empresa
   * só) não escreve nada aqui.
   */
  async function seedUnidades(destId: string) {
    if (!roster.unidades?.length) return;
    const payload = roster.unidades.map((unidade) => ({
      empresa_id: destId,
      nome: unidade.nome,
      is_central: false,
      area_depto_origens: [unidade.nome],
    }));
    // Retorno capturado e conferido: `must` faz o mesmo, mas o guard E11 lê a
    // ÁRVORE, não a semântica de quem chama. Os vizinhos com `await must(...)`
    // são dívida allowlistada antiga, e allowlist só encolhe — escrita nova
    // nasce checando o `error` onde o guard enxerga.
    const unidadesResult = await sb.from('escolas').insert(payload);
    if (unidadesResult.error) {
      throw new Error(`insert unidades demo: ${unidadesResult.error.message}`);
    }
  }

  async function insertDemoExtraRoles(destId: string) {
    for (const role of roster.cargosConstruidos) {
      const cargoResult = await sb.from('cargos_empresa').insert({
        empresa_id: destId,
        nome: role.nome,
        area_depto: role.area_depto,
        descricao: role.descricao,
        principais_entregas: role.principais_entregas,
        stakeholders: role.stakeholders,
        decisoes_recorrentes: role.decisoes_recorrentes,
        tensoes_comuns: role.tensoes_comuns,
        contexto_cultural: role.contexto_cultural,
        top5_workshop: role.competencias.map(([nome]) => nome),
        competencia_foco: role.competencias_foco[0],
        competencias_foco: role.competencias_foco,
        fit_versao: '2.0',
        eh_lideranca: role.ehLideranca,
        gabarito: brand((extraArtifacts.gabaritos as Record<string, any>)?.[role.nome] ?? null),
      });
      await must(`insert cargo ${role.nome}`, cargoResult);

      // Prefixo do código da competência por cargo (evita colisão entre cargos).
      // Vem do roster: derivá-lo do NOME funcionava por acidente com um elenco
      // só, e num roster escolar a heurística casaria o cargo errado.
      for (const [idx, [nome, descricao]] of role.competencias.entries()) {
        const codComp = `${role.codPrefix}${String(idx + 1).padStart(2, '0')}`;
        let firstComp: any = null;
        for (const d of demoDescriptorsFor(nome, descricao)) {
          const comp = await must(`insert competencia ${role.nome} ${nome} ${d.suffix}`, sb.from('competencias').insert({
            empresa_id: destId,
            cargo: role.nome,
            pilar: role.pilar,
            cod_comp: codComp,
            nome,
            descricao,
            cod_desc: `${codComp}-${d.suffix}`,
            nome_curto: d.nome_curto,
            descritor_completo: d.descritor_completo,
            n1_gap: d.n1_gap,
            n2_desenvolvimento: d.n2_desenvolvimento,
            n3_meta: d.n3_meta,
            n4_referencia: d.n4_referencia,
            evidencias_esperadas: d.evidencias_esperadas,
            perguntas_alvo: d.perguntas_alvo,
          }).select('id').single());
          if (!firstComp) firstComp = comp;
        }
        if (!firstComp) continue;

        await must(`insert top10 ${role.nome} ${idx + 1}`, sb.from('top10_cargos').insert({
          empresa_id: destId,
          cargo: role.nome,
          competencia_id: firstComp.id,
          posicao: idx + 1,
          evidencias: [],
        }));

        // Cenário RICO capturado do IA3 (rubrica N1-N4 + descritores-alvo), por
        // (cargo, codComp); fallback ao gerador genérico se faltar no fixture.
        const capt = (extraArtifacts.cenarios as any[]).find((x) => x.cargo === role.nome && x.cod_comp === codComp);
        const cenarioData = capt
          ? {
              titulo: capt.titulo, descricao: capt.descricao, alternativas: capt.alternativas,
              nota_check: capt.nota_check, status_check: capt.status_check, tipo_cenario: capt.tipo_cenario,
              p1: capt.p1, p2: capt.p2, p3: capt.p3, p4: capt.p4,
              dimensoes_check: capt.dimensoes_check, justificativa_check: capt.justificativa_check,
              sugestao_check: capt.sugestao_check, alertas_check: capt.alertas_check, ppp_escola_id: null,
            }
          : demoScenarioFor(role.nome, nome);
        const cenarioResult = await sb.from('banco_cenarios').insert({
          empresa_id: destId,
          cargo: role.nome,
          competencia_id: firstComp.id,
          ...brand(cenarioData),
        });
        await must(`insert cenario ${role.nome} ${nome}`, cenarioResult);
      }
    }
  }

  async function insertPersonas(destId: string) {
    const idMap = new Map<string, string>();
    for (const p of roster.personas) {
      const semPerfil = slug === DEMO_SLUG && ACME_DEMO_WITHOUT_PROFILE_KEYS.some((key) => key === p.key);
      const reportTexts = semPerfil ? null : buildAcmeDemoBehavioralReport(p);
      const inserted = await must(`insert persona ${p.key}`, sb.from('colaboradores').insert({
        empresa_id: destId, nome_completo: p.nome_completo, email: p.email, cargo: p.cargo, role: p.role,
        area_depto: p.area_depto, gestor_nome: p.gestor_nome, gestor_email: p.gestor_email, gestor_whatsapp: p.gestor_whatsapp,
        perfil_dominante: semPerfil ? null : p.perfil_dominante,
        mapeamento_em: semPerfil ? null : new Date().toISOString(),
        d_natural: p.d_natural, i_natural: p.i_natural, s_natural: p.s_natural, c_natural: p.c_natural,
        ...comportamentosDoDisc(p.d_natural, p.i_natural, p.s_natural, p.c_natural),
        disc_resultados: semPerfil ? null : { demo: true, estado_demo: p.scenario },
        report_texts: reportTexts,
        report_generated_at: reportTexts ? new Date().toISOString() : null,
      }).select('id').single());
      idMap.set(p.key, inserted.id);
    }

    // A ACME é também a sala de apresentação da central do RH. Estas pessoas
    // não têm credencial própria nem entram nas três personas navegáveis; dão
    // escala realista ao panorama e aos relatórios (30 participantes no total).
    if (slug === DEMO_SLUG) {
      for (const pessoa of ACME_DEMO_REPORT_DIRECTORY) {
        const semPerfil = ACME_DEMO_WITHOUT_PROFILE_KEYS.some((key) => key === pessoa.key);
        const disc = {
          D: pessoa.d_natural,
          I: pessoa.i_natural,
          S: pessoa.s_natural,
          C: pessoa.c_natural,
        };
        const perfilDominante = semPerfil ? null : deriveProfile(disc);
        const reportTexts = perfilDominante
          ? buildAcmeDemoBehavioralReport({ ...pessoa, perfil_dominante: perfilDominante })
          : null;
        const inserted = await must(`insert diretório RH ${pessoa.key}`, sb.from('colaboradores').insert({
          empresa_id: destId,
          nome_completo: pessoa.nome_completo,
          email: pessoa.email,
          cargo: pessoa.cargo,
          role: pessoa.role,
          area_depto: pessoa.area_depto,
          gestor_nome: pessoa.gestor_nome,
          gestor_email: pessoa.gestor_email,
          gestor_whatsapp: null,
          perfil_dominante: perfilDominante,
          mapeamento_em: semPerfil ? null : new Date().toISOString(),
          d_natural: pessoa.d_natural,
          i_natural: pessoa.i_natural,
          s_natural: pessoa.s_natural,
          c_natural: pessoa.c_natural,
          ...comportamentosDoDisc(pessoa.d_natural, pessoa.i_natural, pessoa.s_natural, pessoa.c_natural),
          disc_resultados: semPerfil ? null : { demo: true, estado_demo: 'relatorio-rh' },
          report_texts: reportTexts,
          report_generated_at: reportTexts ? new Date().toISOString() : null,
        }).select('id').single());
        idMap.set(pessoa.key, inserted.id);
      }
    }

    // O RH precisa de uma linha em colaboradores para resolver tenant e papel,
    // mas nasce sem DISC, avaliação ou trilha: ela administra o programa, não o
    // percorre. As métricas do RH excluem `role='rh'`, portanto esta conta não
    // cria um gargalo fictício no próprio funil que ela consulta.
    const rh = await must('insert persona rh', sb.from('colaboradores').insert({
      empresa_id: destId,
      nome_completo: roster.administradora.nome_completo,
      email: roster.administradora.email,
      cargo: roster.administradora.cargo,
      role: roster.administradora.role,
      area_depto: roster.administradora.area_depto,
      gestor_nome: null,
      gestor_email: null,
      gestor_whatsapp: null,
      perfil_dominante: null,
      disc_resultados: null,
    }).select('id').single());
    idMap.set(roster.administradora.key, rh.id);

    return idMap;
  }

  // Respostas FORTES (nível 3-4) da Mariana no Financeiro — para a demo mostrar
  // um candidato REALMENTE avaliado com fit positivo (o IA4 pontua alto).
  function respostasFortesFinanceiro(compNome: string) {
    const c = compNome.toLowerCase();
    return {
      r1: `Antes de agir eu isolo o problema central e valido a base. Em ${c}, cruzo as fontes, encontro a inconsistência na origem e separo erro de lançamento de efeito real de negócio — para não reportar um número que induza a diretoria a uma decisão errada.`,
      r2: `Corrijo na origem e deixo rastro auditável: reconcilio contra o razão, ajusto o lançamento, registro a premissa e comunico o impacto na margem antes do fechamento. Priorizo o que trava a decisão da gestão, sem estourar o prazo do ciclo.`,
      r3: `Meu critério é confiabilidade acima de velocidade: prefiro entregar um número auditável com uma ressalva explícita a um número redondo sem lastro. Sinalizo cedo o que ainda está em verificação e negocio prazo quando a precisão exige.`,
      r4: `Depois comparo previsto versus realizado, meço quantas correções vieram da minha revisão e atualizo o checklist de fechamento na causa-raiz. Se algo passou, ajusto o controle para não repetir e explico o aprendizado para a área.`,
      representatividade: 9,
    };
  }

  function respostasPara(compNome: string, personaNome: string) {
    return {
      r1: `Eu começaria delimitando o problema principal antes de agir. No caso de ${compNome}, eu separaria fatos, interesses do cliente e riscos comerciais para evitar uma resposta automática.`,
      r2: `Minha ação seria combinar uma conversa objetiva com registro no CRM e um próximo passo claro. Eu priorizaria o que preserva valor para o cliente sem comprometer margem ou previsibilidade.`,
      r3: `O critério seria equilibrar relação, resultado e sustentabilidade. Uma decisão boa precisa resolver o curto prazo sem criar dependência ou promessa difícil de cumprir depois.`,
      r4: `Eu acompanharia indicadores e pediria feedback. Também observaria onde minha reação inicial poderia ter sido impulsiva ou defensiva, para ajustar a próxima abordagem.`,
      representatividade: personaNome === 'Bruna Costa' ? 9 : 8,
    };
  }

  async function seedRespostas(destId: string, personaMap: Map<string, string>) {
    const { data: comps, error: compErr } = await sb.from('competencias').select('id,nome,cargo,cod_desc').eq('empresa_id', destId);
    if (compErr) throw compErr;
    const compByCargoNome = new Map<string, any>();
    for (const c of comps || []) {
      const key = `${c.cargo}::${c.nome}`;
      const current = compByCargoNome.get(key);
      if (!current || (!c.cod_desc && current.cod_desc)) compByCargoNome.set(key, c);
    }
    const { data: cenarios, error: cenErr } = await sb.from('banco_cenarios')
      .select('id,competencia_id,cargo,tipo_cenario').eq('empresa_id', destId)
      .or('tipo_cenario.is.null,tipo_cenario.neq.cenario_b');
    if (cenErr) throw cenErr;
    const nomeByCompId = new Map((comps || []).map((comp: any) => [comp.id, comp.nome]));
    const cenarioByCargoNome = new Map((cenarios || []).map((cenario: any) => [
      `${cenario.cargo}::${nomeByCompId.get(cenario.competencia_id)}`,
      cenario,
    ]));

    const participantes: any[] = slug === DEMO_SLUG
      ? [
          ...roster.personas,
          ...ACME_DEMO_REPORT_DIRECTORY.map((pessoa) => ({
            ...pessoa,
            responder: competenciasAcmeDemoPorCargo(pessoa.cargo),
            demo_report_fixture: true,
          })),
        ]
      : roster.personas;
    const payload: any[] = [];
    for (const p of participantes) {
      const colabId = personaMap.get(p.key);
      for (const compNome of p.responder || []) {
        const comp = compByCargoNome.get(`${p.cargo}::${compNome}`);
        const cenario = cenarioByCargoNome.get(`${p.cargo}::${compNome}`);
        if (!comp && !cenario) continue;
        const respostas = p.key === 'mariana'
          ? respostasFortesFinanceiro(compNome)
          : respostasPara(compNome, p.nome_completo);
        const avaliacaoDemo = p.demo_report_fixture
          ? avaliacaoAcmeDemo(p.email, compNome)
          : null;
        payload.push({
          empresa_id: destId, colaborador_id: colabId, email_colaborador: p.email,
          nome_colaborador: p.nome_completo, cargo: p.cargo,
          cenario_id: cenario?.id || null,
          competencia_id: cenario?.competencia_id || comp.id,
          competencia_nome: comp?.nome || compNome,
          ...respostas, canal: 'demo-seed', tipo_resposta: 'cenario_a', rodada: 1,
          timestamp_resposta: new Date().toISOString(),
          ...(avaliacaoDemo ? {
            avaliacao_ia: {
              consolidacao: { nivel_geral: avaliacaoDemo.nivel, nota_geral: avaliacaoDemo.nota },
              resumo_geral: avaliacaoDemo.feedback,
              pontos_fortes: avaliacaoDemo.pontosFortes,
              pontos_atencao: avaliacaoDemo.pontosAtencao,
            },
            nivel_ia4: avaliacaoDemo.nivel,
            nota_ia4: avaliacaoDemo.nota,
            pontos_fortes: avaliacaoDemo.pontosFortes,
            pontos_atencao: avaliacaoDemo.pontosAtencao,
            feedback_ia4: avaliacaoDemo.feedback,
            status_ia4: IA4_FILTRO.APROVADO,
          } : {}),
        });
      }
    }
    if (payload.length) await must('insert respostas demo', sb.from('respostas').insert(payload));
  }

  // Replay dos artefatos AVALIADOS congelados (mapeamento pronto sem rodar IA no
  // reset). Falha fechada: responder `ok:true` sem estas linhas deixaria as três
  // visões contando estados diferentes. Chaveado por e-mail da persona.
  async function applyPersonaArtifacts(destId: string, personaMap: Map<string, string>) {
    // Artefatos avaliados: do fixture principal (acme) + do fixture extra
    // (personas demo-only, ex.: Mariana no Financeiro). Chaveados por e-mail.
    // 🔴 Merge por PERSONA, não por objeto inteiro. O spread raso
    // `{...fixture, ...extra}` fazia a entrada do extra SUBSTITUIR a do fixture:
    // a Mariana existe nos dois (respostas/assessments no extra, relatório no
    // fixture) e perdia o relatório em todo reset — a persona abria a tela de
    // perfil disparando IA ao vivo, no meio da demo. Sintoma longe da causa:
    // congelar o artefato no arquivo "certo" não adiantava nada.
    const artifacts: any = mesclarPersonaArtifacts(
      fx.personaArtifacts,
      (extraArtifacts as any).personaArtifacts,
    );
    for (const p of roster.personas) {
      const colabId = personaMap.get(p.key);
      const a = brand(artifacts[p.email]);
      if (!colabId || !a) continue;
      // Relatório comportamental (DISC) — report_texts congelado → abre sem IA.
      if (a.report?.report_texts) {
        const result = await sb.from('colaboradores').update({
          report_texts: a.report.report_texts,
          report_generated_at: a.report.report_generated_at || new Date().toISOString(),
        }).eq('id', colabId);
        if (result.error) throw new Error(`relatório comportamental ${p.email}: ${result.error.message}`);
      }
      for (const r of a.respostas || []) {
        const result = await sb.from('respostas').update({
          avaliacao_ia: r.avaliacao_ia, nivel_ia4: r.nivel_ia4, nota_ia4: r.nota_ia4,
          pontos_fortes: r.pontos_fortes, pontos_atencao: r.pontos_atencao,
          feedback_ia4: r.feedback_ia4, payload_ia4: r.payload_ia4, status_ia4: r.status_ia4,
        }).eq('colaborador_id', colabId).eq('competencia_nome', r.competencia_nome);
        if (result.error) throw new Error(`avaliação ${p.email} ${r.competencia_nome}: ${result.error.message}`);
      }
      if (a.descriptor_assessments?.length) {
        // `nivel` é coluna GENERATED ALWAYS — nunca inserir (dá erro).
        const rows = a.descriptor_assessments.map((d: any) => {
          const { nivel, ...rest } = d;
          return { ...rest, empresa_id: destId, colaborador_id: colabId };
        });
        const result = await sb.from('descriptor_assessments').insert(rows);
        if (result.error) throw new Error(`descritores ${p.email}: ${result.error.message}`);
      }
      // Trilha (jornada) congelada — conteúdo inline em temporada_plano.
      if (personaDemoComMapeamentoCompleto(p) && a.trilha?.row) {
        // Uma trilha pressupõe o Top 5 concluído. O fixture histórico tinha
        // trilha para o Paulo com só 2/5 competências e fazia as fases da demo
        // se contradizerem. A data é reancorada no reset para a jornada de
        // vitrine começar na semana 1, sem nascer artificialmente atrasada.
        const hojeDemo = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(new Date());
        const newTrilha = await must(`trilha ${p.email}`, sb.from('trilhas').insert({
          ...a.trilha.row,
          empresa_id: destId,
          colaborador_id: colabId,
          criado_em: new Date().toISOString(),
          data_inicio: hojeDemo,
        }).select('id').single());
        if (newTrilha?.id && a.trilha.progress?.length) {
          const rows = a.trilha.progress.map((pr: any) => ({ ...pr, empresa_id: destId, colaborador_id: colabId, trilha_id: newTrilha.id }));
          const result = await sb.from('temporada_semana_progresso').insert(rows);
          if (result.error) throw new Error(`progresso ${p.email}: ${result.error.message}`);
        }
      }
    }
  }

  /**
   * Fotografia executiva da ACME: 30 → 28 → 25 → 20, com 17 jornadas em dia
   * e 3 atrasadas. O funil é material de apresentação, mas continua usando as
   * mesmas tabelas e a mesma régua do produto — nenhum número é sobrescrito na
   * camada visual.
   */
  async function seedAcmePanorama(destId: string, personaMap: Map<string, string>) {
    if (slug !== DEMO_SLUG) return;

    const pessoaPorChave = new Map<string, any>([
      ...roster.personas.map((pessoa) => [pessoa.key, pessoa] as const),
      ...ACME_DEMO_REPORT_DIRECTORY.map((pessoa) => [pessoa.key, pessoa] as const),
    ]);
    const agora = new Date();
    const assessmentDate = agora.toISOString();

    const assessments = ACME_DEMO_SYNTHETIC_MAPPED_KEYS.flatMap((key) => {
      const pessoa = pessoaPorChave.get(key);
      const colaboradorId = personaMap.get(key);
      if (!pessoa || !colaboradorId) throw new Error(`pessoa do funil ACME ausente: ${key}`);
      return competenciasAcmeDemoPorCargo(pessoa.cargo).map((competencia, index) => ({
        empresa_id: destId,
        colaborador_id: colaboradorId,
        cargo: pessoa.cargo,
        competencia,
        descritor: `Evidência demonstrativa ${index + 1}`,
        nota: 2 + ((key.length + index) % 3) * 0.5,
        origem: 'ia4',
        assessment_date: assessmentDate,
      }));
    });
    // T0 dos descritores que a jornada vai trabalhar. Precisa existir com a
    // MESMA nota que o Evolution Report grava em `nota_pre`: é o que impede a
    // tela de diagnóstico e a de evolução de contarem histórias diferentes
    // sobre a mesma pessoa no meio de uma apresentação.
    const assessmentsDaJornada = ACME_DEMO_CONCLUDED_KEYS.flatMap((key) => {
      const pessoa = pessoaPorChave.get(key);
      const colaboradorId = personaMap.get(key);
      if (!pessoa || !colaboradorId) throw new Error(`pessoa concluída do funil ACME ausente: ${key}`);
      const competencia = competenciasAcmeDemoPorCargo(pessoa.cargo)[0];
      if (!competencia) throw new Error(`cargo sem competência na régua da ACME Demo: ${pessoa.cargo}`);
      return ACME_DEMO_DESCRITORES.slice(0, ACME_DEMO_DESCRITORES_POR_TRILHA).map((descritor) => ({
        empresa_id: destId,
        colaborador_id: colaboradorId,
        cargo: pessoa.cargo,
        competencia,
        descritor,
        nota: notaDePartida(pessoa.email, descritor),
        origem: 'ia4',
        assessment_date: assessmentDate,
      }));
    });

    const todosAssessments = [...assessments, ...assessmentsDaJornada];
    if (todosAssessments.length) {
      const result = await sb.from('descriptor_assessments').insert(todosAssessments);
      if (result.error) throw new Error(`mapeamentos do panorama ACME: ${result.error.message}`);
    }

    const formatDate = (date: Date) => new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date);
    const hojeDemo = formatDate(agora);
    const inicioAtrasado = formatDate(new Date(agora.getTime() - 28 * 24 * 60 * 60 * 1000));
    const atrasadas = new Set(ACME_DEMO_BEHIND_KEYS);
    const trilhasExistentes = await must('listar jornadas do panorama ACME', sb.from('trilhas')
      .select('id,colaborador_id,numero_temporada,status')
      .eq('empresa_id', destId));
    const trilhaTemporadaUmPorPessoa = new Map(
      (trilhasExistentes || [])
        .filter((trilha: any) => trilha.numero_temporada === 1)
        .map((trilha: any) => [trilha.colaborador_id, trilha]),
    );
    const idsEmJornada = new Set(ACME_DEMO_JOURNEY_KEYS.map((key) => personaMap.get(key)));
    for (const trilha of trilhasExistentes || []) {
      if (trilha.status !== TRILHA.ATIVA || idsEmJornada.has(trilha.colaborador_id)) continue;
      const result = await sb.from('trilhas').update({ status: TRILHA.PAUSADA })
        .eq('id', trilha.id).eq('empresa_id', destId);
      if (result.error) throw new Error(`pausar jornada fora do panorama ACME: ${result.error.message}`);
    }

    const concluidas = new Set<string>(ACME_DEMO_CONCLUDED_KEYS);
    // O fechamento é datado no passado para a jornada não parecer concluída no
    // mesmo dia em que começou — quem apresenta a demo é perguntado sobre isso.
    const inicioConcluido = formatDate(new Date(agora.getTime() - 105 * 24 * 60 * 60 * 1000));
    const fechamentoEm = new Date(agora.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString();

    for (const key of ACME_DEMO_JOURNEY_KEYS) {
      const pessoa = pessoaPorChave.get(key);
      const colaboradorId = personaMap.get(key);
      if (!pessoa || !colaboradorId) throw new Error(`jornada do funil ACME ausente: ${key}`);
      const competencia = competenciasAcmeDemoPorCargo(pessoa.cargo)[0];
      const concluiu = concluidas.has(key);
      const dataInicio = concluiu ? inicioConcluido : (atrasadas.has(key) ? inicioAtrasado : hojeDemo);

      // A evolução é DERIVADA (notas + régua de produção), nunca carimbada:
      // ver o cabeçalho de `acme-evolucao-fixture`.
      const evolucao = concluiu
        ? construirEvolucaoAcmeDemo(pessoa, ACME_DEMO_EVOLUTION_MIX[ACME_DEMO_CONCLUDED_KEYS.indexOf(key)])
        : null;
      const descritoresDaTrilha = evolucao
        ? evolucao.descritores.map((d) => ({ descritor: d.descritor, competencia, nota_atual: d.nota_pre }))
        : ['Evidência demonstrativa'];
      const camposDeFechamento = evolucao
        ? {
            status: TRILHA.CONCLUIDA,
            evolution_report: evolucao.evolution_report,
            evolution_generated_at: fechamentoEm,
          }
        : { status: TRILHA.ATIVA };

      const existente = trilhaTemporadaUmPorPessoa.get(colaboradorId) as any;
      let trilhaId: string | null = existente?.id || null;
      if (existente) {
        const result = await sb.from('trilhas').update({
          ...camposDeFechamento,
          data_inicio: dataInicio,
          ...(evolucao ? { competencia_foco: competencia, competencias_foco: [competencia], descritores_selecionados: descritoresDaTrilha } : {}),
        }).eq('id', existente.id).eq('empresa_id', destId);
        if (result.error) throw new Error(`atualizar jornada ${key}: ${result.error.message}`);
      } else {
        const inserida = await must(`inserir jornada ${key}`, sb.from('trilhas').insert({
          empresa_id: destId,
          colaborador_id: colaboradorId,
          numero_temporada: 1,
          cursos: [],
          ...camposDeFechamento,
          criado_em: assessmentDate,
          data_inicio: dataInicio,
          competencia_foco: competencia,
          competencias_foco: [competencia],
          descritores_selecionados: descritoresDaTrilha,
          temporada_plano: Array.from({ length: 14 }, (_, index) => ({
            semana: index + 1,
            tipo: DEMO_JOURNEY_CONTENT_KIND,
            status: evolucao ? PLANO_SEMANA.CONCLUIDA : (index === 0 ? PLANO_SEMANA.DISPONIVEL : PLANO_SEMANA.BLOQUEADA),
            competencia,
            descritor: evolucao
              ? evolucao.descritores[index % evolucao.descritores.length].descritor
              : 'Evidência demonstrativa',
          })),
        }).select('id').single());
        trilhaId = inserida?.id || null;
      }

      if (!evolucao || !trilhaId) continue;

      // Progresso das 14 semanas. É DELETE antes de INSERT porque a persona
      // navegável pode ter chegado aqui com as primeiras semanas já semeadas
      // pelo bloco de personas; sem isso a jornada concluída ganharia duas
      // linhas para a mesma semana e a tela mostraria a primeira que voltasse.
      const limpeza = await sb.from('temporada_semana_progresso')
        .delete().eq('trilha_id', trilhaId).eq('empresa_id', destId);
      if (limpeza.error) throw new Error(`limpar progresso de ${key}: ${limpeza.error.message}`);

      const fechamento = construirFechamentoAcmeDemo(evolucao, fechamentoEm);
      const semanasAnteriores = Array.from({ length: 12 }, (_, index) => ({
        semana: index + 1,
        tipo: DEMO_JOURNEY_CONTENT_KIND,
        status: PROGRESSO.CONCLUIDO,
        conteudo_consumido: true,
        iniciado_em: fechamentoEm,
        concluido_em: fechamentoEm,
      }));
      const progresso = [...semanasAnteriores, ...fechamento].map((linha) => ({
        ...linha,
        empresa_id: destId,
        colaborador_id: colaboradorId,
        trilha_id: trilhaId,
      }));
      const gravado = await sb.from('temporada_semana_progresso').insert(progresso);
      if (gravado.error) throw new Error(`progresso da jornada concluída ${key}: ${gravado.error.message}`);
      continue;
    }

    if (
      ACME_DEMO_WITHOUT_PROFILE_KEYS.length !== ACME_DEMO_TEAM_SIZE - ACME_DEMO_FUNNEL_TARGETS.withProfile
      || ACME_DEMO_SYNTHETIC_MAPPED_KEYS.length + 2 !== ACME_DEMO_FUNNEL_TARGETS.withMapping
      || ACME_DEMO_JOURNEY_KEYS.length !== ACME_DEMO_FUNNEL_TARGETS.inJourney
      || ACME_DEMO_BEHIND_KEYS.length !== ACME_DEMO_FUNNEL_TARGETS.behind
      || ACME_DEMO_CONCLUDED_KEYS.length !== ACME_DEMO_FUNNEL_TARGETS.concluded
      || ACME_DEMO_CONCLUDED_KEYS.some((key) => ACME_DEMO_BEHIND_KEYS.includes(key))
    ) {
      throw new Error('coortes do panorama ACME não correspondem aos totais declarados');
    }
  }

  /**
   * Relatórios sintéticos, exclusivos da ACME, para a demonstração do papel RH.
   * Primeiro restauramos qualquer PDF já aquecido; aqui criamos somente o que
   * estiver faltando, preservando o arquivo pronto e evitando trabalho no clique.
   */
  async function seedAcmeRhReportCenter(destId: string) {
    if (slug !== DEMO_SLUG) return;

    const colaboradores = await must('listar diretório da central RH', sb.from('colaboradores')
      .select('id,nome_completo,email,cargo,role,area_depto,gestor_email')
      .eq('empresa_id', destId));
    const participantes = (colaboradores || []).filter((pessoa: any) => pessoa.role !== 'rh');
    if (participantes.length !== ACME_DEMO_TEAM_SIZE) {
      throw new Error(`central RH esperava ${ACME_DEMO_TEAM_SIZE} participantes e encontrou ${participantes.length}`);
    }

    const existentes = await must('listar relatórios aquecidos da central RH', sb.from('relatorios')
      .select('colaborador_id,tipo')
      .eq('empresa_id', destId)
      .in('tipo', ['individual', 'gestor', 'rh']));
    const keys = new Set((existentes || []).map((relatorio: any) =>
      `${relatorio.tipo}:${relatorio.colaborador_id || 'organizacao'}`,
    ));
    const agora = new Date().toISOString();
    const rows: any[] = [];

    for (const pessoa of participantes) {
      if (!keys.has(`individual:${pessoa.id}`)) {
        rows.push({
          empresa_id: destId,
          colaborador_id: pessoa.id,
          tipo: 'individual',
          conteudo: criarPdiAcmeDemo(pessoa),
          pdf_path: null,
          gerado_em: agora,
        });
      }

      if (pessoa.role === 'gestor' && !keys.has(`gestor:${pessoa.id}`)) {
        const equipeDireta = participantes.filter((integrante: any) =>
          integrante.gestor_email === pessoa.email,
        );
        rows.push({
          empresa_id: destId,
          colaborador_id: pessoa.id,
          tipo: 'gestor',
          conteudo: criarRelatorioGestorAcmeDemo(pessoa, equipeDireta),
          pdf_path: null,
          gerado_em: agora,
        });
      }
    }

    if (!keys.has('rh:organizacao')) {
      rows.push({
        empresa_id: destId,
        colaborador_id: null,
        tipo: 'rh',
        conteudo: criarRelatorioRhAcmeDemo(),
        pdf_path: null,
        gerado_em: agora,
      });
    }

    if (rows.length) {
      const { error } = await sb.from('relatorios').insert(rows);
      if (error) throw new Error(`criar relatórios demonstrativos da central RH: ${error.message}`);
    }
  }

  try {
    const demo = await upsertEmpresaDemo(fx.empresa);
    // Um reset de sala de demo deve recompor dados, não devolver a experiência
    // ao estado frio. Guardamos somente artefatos já renderizados e PDIs com
    // níveis válidos; nenhum conteúdo novo é gerado aqui.
    const warmSnapshot = await snapshotWarmArtifacts(demo.id);

    // Garante que o subdomínio do tenant demo está registrado no Vercel
    // (sem isso o host não é servido → demo inacessível). Best-effort e
    // idempotente (409 = já existe). Self-healing a cada reset.
    try {
      const { addVercelDomain } = await import('@/lib/vercel-domain');
      await addVercelDomain(profile.slug);
    } catch (e: any) {
      console.warn('[reset-demo] addVercelDomain best-effort:', e?.message);
    }

    await resetTenant(demo.id);
    const compMap = await seedCompetencias(fx.competencias, demo.id);
    await seedCargos(fx.cargos, demo.id);
    await seedTop10(fx.top10, demo.id, compMap);
    await seedCenarios(fx.cenarios, demo.id, compMap);
    await insertDemoPPP(demo.id);
    await seedUnidades(demo.id);
    await insertDemoExtraRoles(demo.id);
    const personaMap = await insertPersonas(demo.id);
    if (profile.convidado) {
      // Convidado real do tenant (ver DemoConvidado): conta zerada, fora da
      // régua DISC e do fit. O reset o recria para o acesso do prospect não
      // depender de passo manual depois de cada recomposição.
      await must('insert convidado demo', sb.from('colaboradores').insert({
        empresa_id: demo.id,
        email: profile.convidado.email,
        nome_completo: profile.convidado.nome,
        cargo: profile.convidado.cargo,
        role: 'colaborador',
        area_depto: COMERCIAL_AREA,
        gestor_nome: DEMO_MANAGER.nome,
        gestor_email: DEMO_MANAGER.email,
        gestor_whatsapp: DEMO_MANAGER.whatsapp,
        telefone: profile.convidado.telefone,
        whatsapp: profile.convidado.telefone,
        locale: 'pt-BR',
      }));
    }
    await seedRespostas(demo.id, personaMap);
    await applyPersonaArtifacts(demo.id, personaMap);
    await seedAcmePanorama(demo.id, personaMap);
    await ensurePresentationVideo(demo.id, personaMap);
    await restoreWarmArtifacts(demo.id, personaMap, warmSnapshot);
    await seedAcmeRhReportCenter(demo.id);
    if (slug === DEMO_SLUG) {
      await seedAcmeOrganizationReports(sb, demo.id, DEMO_NAME);
      await seedAcmeFitRankingSnapshots(sb, demo.id, DEMO_NAME);
    }
    let fitOk = 0;
    try {
      const fit = await precomputeDemoFitResults(sb, demo.id);
      fitOk = fit.total;
      for (const failure of fit.failures) console.warn(`[reset-demo] fit: ${failure}`);
    } catch (e: any) {
      console.warn('[reset-demo] precomputeDemoFitResults:', e?.message);
    }

    const counts: Record<string, number | null> = {};
    for (const table of ['colaboradores', 'cargos_empresa', 'competencias', 'top10_cargos', 'banco_cenarios', 'respostas', 'relatorios']) {
      const r = await sb.from(table).select('*', { count: 'exact', head: true }).eq('empresa_id', demo.id);
      counts[table] = r.count;
    }
    counts.fit_resultados = fitOk;
    return { ok: true, empresaId: demo.id, counts };
  } catch (err: any) {
    console.error('[reset-demo] ERRO:', err?.message);
    return { ok: false, error: err?.message || 'erro desconhecido' };
  }
}

export async function resetAcmeDemo(): Promise<ResetDemoResult> {
  return resetDemoTenant(DEMO_SLUG);
}

export async function resetGrupoSinalDemo(): Promise<ResetDemoResult> {
  return resetDemoTenant(GRUPO_SINAL_SLUG);
}

/**
 * Cria/rotaciona a senha das três contas que um prospect recebe. O caller é
 * responsável pelo gate de platform admin e pelo audit log; este núcleo repete
 * as travas de alvo para nunca alterar credenciais fora do tenant de demo.
 */
export async function prepararAcessosDemo(slug: DemoTenantSlug = DEMO_SLUG): Promise<DemoAccessResult> {
  try {
    const sb = createSupabaseAdmin();
    const { profile, sala } = await validarTenantEAcessosDemo(sb, slug);

    const senha = `Demo-${randomBytes(9).toString('base64url')}-Aa7!`;
    // Só depois de validar tenant + as três personas exatas alteramos o Auth.
    for (const acesso of sala) {
      const existente = await buscarUsuarioAuth(sb, acesso.email);
      if (existente) {
        const { error } = await sb.auth.admin.updateUserById(existente.id, { password: senha, email_confirm: true });
        if (error) throw new Error(`atualizar ${acesso.email}: ${error.message}`);
      } else {
        const { error } = await sb.auth.admin.createUser({ email: acesso.email, password: senha, email_confirm: true });
        if (error) throw new Error(`criar ${acesso.email}: ${error.message}`);
      }
    }

    return {
      ok: true,
      url: tenantUrl(profile.slug, '/login'),
      senha,
      acessos: sala.map(({ visao, nome, email }) => ({ visao, nome, email })),
    };
  } catch (error: any) {
    console.error('[demo-access] preparar contas:', error?.message);
    return { ok: false, error: error?.message || 'erro desconhecido' };
  }
}

/**
 * Gera links reais de autenticação, sem disparar e-mail ou WhatsApp. O operador
 * decide como compartilhar cada URL; assim o gate de envio do tenant demo
 * continua intacto e o prospect ainda experimenta o acesso em um toque.
 */
export async function gerarMagicLinksDemo(slug: DemoTenantSlug): Promise<DemoMagicLinksResult> {
  try {
    const sb = createSupabaseAdmin();
    const { profile, sala } = await validarTenantEAcessosDemo(sb, slug);
    const acessos: NonNullable<DemoMagicLinksResult['acessos']> = [];

    for (const acesso of sala) {
      const existente = await buscarUsuarioAuth(sb, acesso.email);
      if (!existente) {
        const { error: createError } = await sb.auth.admin.createUser({
          email: acesso.email,
          email_confirm: true,
        });
        if (createError) throw new Error(`criar ${acesso.email}: ${createError.message}`);
      }

      const redirectTo = tenantUrl(profile.slug, acesso.nextPath);
      const { data: link, error: linkError } = await sb.auth.admin.generateLink({
        type: 'magiclink',
        email: acesso.email,
        options: { redirectTo },
      });
      const tokenHash = link?.properties?.hashed_token;
      if (linkError || !tokenHash) {
        throw new Error(`gerar link de ${acesso.visao}: ${linkError?.message || 'token ausente'}`);
      }

      acessos.push({
        visao: acesso.visao,
        nome: acesso.nome,
        email: acesso.email,
        url: tenantUrl(
          profile.slug,
          `/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=email&next=${encodeURIComponent(acesso.nextPath)}`,
        ),
      });
    }

    return { ok: true, acessos };
  } catch (error: any) {
    console.error('[demo-access] gerar magic links:', error?.message);
    return { ok: false, error: error?.message || 'erro desconhecido' };
  }
}

/**
 * Prepara os três pontos de entrada da sala no ACME Demo neutro.
 *
 * Um passe assinado e temporário acompanha o dropdown. Cada hostname
 * (`usuario-demo`, `gestor-demo`, `rh-demo`) o troca por uma sessão real da
 * persona correspondente somente quando é visitado.
 */
export async function prepararAcessosApresentacaoDemo(
  slug: DemoPresentationTenantSlug = DEMO_SLUG,
): Promise<DemoPresentationLinksResult> {
  try {
    const sb = createSupabaseAdmin();
    const { sala } = await validarTenantEAcessosDemo(sb, slug as DemoTenantSlug);

    // O DNS é wildcard, mas o projeto Vercel ainda precisa conhecer cada host
    // para rotear e emitir SSL. A operação é idempotente (409 = já existe).
    const { addVercelDomain } = await import('@/lib/vercel-domain');
    const dominios = await Promise.all(
      getDemoPresentationRoom(slug).roles.map((role) => addVercelDomain(role.hostSlug)),
    );
    const dominioComErro = dominios.find((result) => !result.ok && !('skipped' in result));
    if (dominioComErro && 'error' in dominioComErro) {
      throw new Error(`preparar domínios da apresentação: ${dominioComErro.error}`);
    }

    const ticket = issueDemoPresentationTicket(undefined, undefined, slug);
    const acessos: NonNullable<DemoPresentationLinksResult['acessos']> = [];

    for (const acesso of sala) {
      const existente = await buscarUsuarioAuth(sb, acesso.email);
      if (!existente) {
        const { error: createError } = await sb.auth.admin.createUser({
          email: acesso.email,
          email_confirm: true,
        });
        if (createError) throw new Error(`criar ${acesso.email}: ${createError.message}`);
      }

      const role = getDemoPresentationRole(acesso.presentationRoleKey as DemoPresentationRoleKey, slug);
      const directUrl = demoPresentationUrl(role.key, acesso.nextPath, undefined, slug);

      acessos.push({
        roleKey: role.key,
        visao: role.label,
        nome: acesso.nome,
        email: acesso.email,
        directUrl,
        url: demoPresentationAuthUrl(role.key, ticket, undefined, slug),
      });
    }

    return { ok: true, acessos };
  } catch (error: any) {
    console.error('[demo-access] preparar apresentação:', error?.message);
    return { ok: false, error: error?.message || 'erro desconhecido' };
  }
}

/**
 * Gera um token de login de uso único para UM papel depois que a rota pública
 * validou o passe assinado da sala. Este núcleo não aceita e-mail nem tenant do
 * client: ambos vêm da allowlist fixa acima.
 */
export async function gerarMagicLinkPapelApresentacaoDemo(
  roleKey: DemoPresentationRoleKey,
  slug: DemoPresentationTenantSlug = DEMO_SLUG,
): Promise<
  { ok: true; tokenHash: string; nextPath: string } | { ok: false; error: string }
> {
  try {
    const acesso = salaDoTenant(slug as DemoTenantSlug)
      .find((item) => item.presentationRoleKey === roleKey);
    if (!acesso) return { ok: false, error: 'Papel de apresentação inválido.' };

    const sb = createSupabaseAdmin();
    await validarTenantEAcessosDemo(sb, slug as DemoTenantSlug);
    const redirectTo = demoPresentationUrl(roleKey, acesso.nextPath, undefined, slug);
    const { data: link, error } = await sb.auth.admin.generateLink({
      type: 'magiclink',
      email: acesso.email,
      options: { redirectTo },
    });
    const tokenHash = link?.properties?.hashed_token;
    if (error || !tokenHash) {
      throw new Error(`gerar login de ${roleKey}: ${error?.message || 'token ausente'}`);
    }
    return { ok: true, tokenHash, nextPath: acesso.nextPath };
  } catch (error: any) {
    console.error('[demo-access] autenticar papel da apresentação:', error?.message);
    return { ok: false, error: error?.message || 'erro desconhecido' };
  }
}
