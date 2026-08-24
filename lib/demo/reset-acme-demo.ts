import { createSupabaseAdmin } from '@/lib/supabase';
import fixture from '@/lib/demo/acme-demo-fixture.json';
// Artefatos de IA CONGELADOS dos cargos extra (Financeiro/Operações/Gerente):
// gabaritos (IA2) + cenários ricos com rubrica N1-N4 (IA3). Gerados 1x no
// acme-demo (scripts/_capture-*) e replicados no reset SEM rodar IA.
import extraArtifacts from '@/lib/demo/acme-demo-extra-artifacts.json';

/**
 * Reset/seed do tenant ACME Demo (slug `acme-demo`) — versão IN-APP da lógica
 * de `scripts/seed-acme-demo.mjs` (que segue como fallback manual). Fonte única
 * usada pelo botão "Resetar demo agora" (server action) e pelo cron noturno.
 *
 * Idempotente e TENANT-SAFE: todo delete/insert é filtrado por `empresa_id` do
 * acme-demo — NUNCA toca outro tenant. Semeia a estrutura (competências, cargos,
 * top10, cenários) de um FIXTURE CONGELADO (`acme-demo-fixture.json`, capturado
 * do acme via scripts/capture-acme-fixture.mjs) — imune a mexidas no acme vivo.
 * Recria personas + respostas de demonstração.
 *
 * GUARDRAIL de envio (duas camadas): (1) GATE por tenant — `empresas.is_demo`
 * (setado aqui, mig 160) é lido por `lib/demo/envio-guard.ts`, que BLOQUEIA todo
 * disparo em lote e magic link/signup nos dispatchers. Proteção primária, robusta
 * até contra contato REAL adicionado à demo. (2) Defesa em profundidade: as
 * PERSONAS usam e-mails @vertho.ai (domínio interno) e SEM telefone. Os flags
 * `cadencia.email_ativo/whatsapp_ativo=false` seguem por convenção (cosméticos).
 */

const DEMO_SLUG = 'acme-demo';
const DEMO_NAME = 'ACME Demo';
// Gerente Comercial sai do FIXTURE (o acme não tinha competências/cenários do
// cargo — só o cargo+Top5) e é construído fresco em DEMO_EXTRA_ROLES (pacote
// completo). Diretor Geral segue removido da demo.
const DEMO_EXCLUDED_ROLES = new Set(['Diretor Geral', 'Gerente Comercial']);

const REPRESENTANTE_TOP5 = [
  'Comunicação e Apresentação de Valor',
  'Negociação e Fechamento',
  'Relacionamento e Pós-venda',
  'Resiliência e Constância',
  'Orientação a Metas e Resultados',
];

const COMERCIAL_AREA = 'Comercial';
const DEMO_MANAGER = {
  nome: 'Carla Menezes',
  email: 'carla.demo@vertho.ai',
  whatsapp: null as string | null,
};

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

const DEMO_EXTRA_ROLES = [
  {
    nome: 'Analista Financeiro',
    area_depto: 'Financeiro',
    pilar: 'Finanças',
    descricao: 'Profissional responsável por organizar informações financeiras, apoiar o fechamento mensal, acompanhar orçamento, analisar variações e produzir insumos confiáveis para decisões de gestão.',
    principais_entregas: 'Relatórios financeiros confiáveis; conciliações e fechamentos no prazo; análise de desvios orçamentários; apoio a decisões de custo, margem e caixa; comunicação clara de riscos e oportunidades.',
    stakeholders: 'Controladoria, contabilidade, gestores de área, diretoria, compras, comercial e auditoria.',
    decisoes_recorrentes: 'Quais variações investigar primeiro; quando escalar inconsistências; como priorizar demandas de fechamento versus análises gerenciais; que premissas usar em projeções.',
    tensoes_comuns: 'Prazos curtos de fechamento; dados incompletos; pressão por respostas rápidas; divergências entre áreas; necessidade de precisão sem travar a operação.',
    contexto_cultural: 'Ambiente orientado a dados, prazos e confiabilidade, com forte necessidade de organização, critério técnico e comunicação objetiva.',
    competencias: [
      ['Controle, Precisão e Confiabilidade dos Dados', 'Capacidade de revisar informações financeiras, identificar inconsistências e garantir bases confiáveis antes de reportar números.'],
      ['Análise de Indicadores Financeiros', 'Capacidade de interpretar variações, margens, custos e tendências para apoiar decisões de gestão.'],
      ['Organização de Rotinas e Prazos', 'Capacidade de cumprir ciclos de fechamento, conciliação e reporte sem perder qualidade.'],
      ['Comunicação Financeira para Não Especialistas', 'Capacidade de explicar números, riscos e premissas de forma clara para gestores de outras áreas.'],
      ['Critério e Ética no Tratamento de Informações', 'Capacidade de lidar com dados sensíveis com confidencialidade, responsabilidade e independência técnica.'],
    ],
  },
  {
    nome: 'Coordenador de Operações',
    area_depto: 'Operações',
    pilar: 'Operações',
    descricao: 'Profissional responsável por coordenar rotinas operacionais, organizar prioridades do time, resolver gargalos do dia a dia e garantir que processos, prazos e padrões de qualidade sejam cumpridos.',
    principais_entregas: 'Execução operacional dentro do prazo; redução de gargalos; priorização clara do time; melhoria contínua dos processos; comunicação fluida entre áreas.',
    stakeholders: 'Equipe operacional, gerência, comercial, atendimento, fornecedores, logística, financeiro e clientes internos.',
    decisoes_recorrentes: 'Como redistribuir demandas; que urgência atender primeiro; quando escalar desvios; como equilibrar qualidade, prazo e capacidade do time.',
    tensoes_comuns: 'Mudanças de prioridade; sobrecarga do time; falhas de comunicação entre áreas; urgências simultâneas; pressão por produtividade sem perda de qualidade.',
    contexto_cultural: 'Ambiente prático, dinâmico e orientado à execução, no qual liderança próxima, previsibilidade e solução rápida de problemas fazem diferença.',
    competencias: [
      ['Priorização e Gestão da Rotina Operacional', 'Capacidade de organizar demandas, sequenciar atividades e manter o time focado no que gera mais impacto.'],
      ['Resolução de Problemas e Gargalos', 'Capacidade de diagnosticar causas, agir rapidamente e prevenir recorrência de problemas operacionais.'],
      ['Liderança de Equipe e Alinhamento Diário', 'Capacidade de orientar pessoas, distribuir responsabilidades e manter cadência de execução.'],
      ['Melhoria Contínua de Processos', 'Capacidade de revisar fluxos, eliminar desperdícios e padronizar boas práticas.'],
      ['Comunicação entre Áreas', 'Capacidade de alinhar expectativas, negociar prioridades e evitar ruídos entre operação, comercial e atendimento.'],
    ],
  },
  {
    nome: 'Gerente Comercial',
    area_depto: 'Comercial',
    pilar: 'Comercial',
    descricao: 'Profissional responsável por liderar a equipe de vendas, traduzir metas em estratégia executável, desenvolver vendedores, acompanhar indicadores e destravar negociações críticas para garantir previsibilidade e crescimento da receita.',
    principais_entregas: 'Atingimento consistente da meta do time; pipeline previsível e saudável; vendedores em evolução; forecast confiável; suporte a deals estratégicos; leitura de mercado traduzida em prioridades.',
    stakeholders: 'Equipe de vendas, diretoria comercial, marketing, produto, financeiro, clientes estratégicos e RH.',
    decisoes_recorrentes: 'Onde concentrar esforço (contas/territórios); em quem investir desenvolvimento; quando entrar pessoalmente num deal; como redistribuir metas; que indicadores cobrar primeiro.',
    tensoes_comuns: 'Pressão por meta versus desenvolvimento do time; deals travados; forecast otimista versus realidade; sobrecarga entre gerir e executar; conflito entre volume e qualidade de pipeline.',
    contexto_cultural: 'Ambiente de alta cobrança por resultado, ritmo acelerado e remuneração variável, no qual liderança próxima, previsibilidade e desenvolvimento de pessoas fazem a diferença.',
    competencias: [
      ['Coaching e Desenvolvimento de Vendedores', 'Capacidade de desenvolver a equipe por meio de feedback, acompanhamento individual e planos de evolução que elevam a performance de cada vendedor.'],
      ['Inteligência de Mercado e Visão Competitiva', 'Capacidade de ler o mercado, monitorar concorrência e traduzir tendências em posicionamento e prioridades comerciais.'],
      ['Negociação Estratégica e Suporte a Deals', 'Capacidade de entrar em negociações complexas, destravar deals críticos e orientar o time em condições, concessões e fechamento.'],
      ['Planejamento Comercial, Priorização e Execução de Estratégia', 'Capacidade de traduzir metas em plano de ação, priorizar territórios e contas e garantir execução consistente da estratégia comercial.'],
      ['Gestão de Performance, Indicadores e Accountability', 'Capacidade de acompanhar indicadores, cobrar resultados com clareza e sustentar uma cultura de responsabilidade e previsibilidade no funil.'],
    ],
  },
];

const PERSONAS = [
  { key: 'ana', nome_completo: 'Ana Martins', email: 'ana.demo@vertho.ai', cargo: 'Representante Comercial', role: 'colaborador', area_depto: COMERCIAL_AREA, gestor_nome: DEMO_MANAGER.nome, gestor_email: DEMO_MANAGER.email, gestor_whatsapp: DEMO_MANAGER.whatsapp, perfil_dominante: 'I', d_natural: 28, i_natural: 72, s_natural: 46, c_natural: 34, scenario: 'novo', responder: [] as string[] },
  { key: 'paulo', nome_completo: 'Paulo Demo', email: 'paulo.demo@vertho.ai', cargo: 'Representante Comercial', role: 'colaborador', area_depto: COMERCIAL_AREA, gestor_nome: DEMO_MANAGER.nome, gestor_email: DEMO_MANAGER.email, gestor_whatsapp: DEMO_MANAGER.whatsapp, perfil_dominante: 'ID', d_natural: 66, i_natural: 61, s_natural: 24, c_natural: 31, scenario: 'parcial', responder: ['Negociação e Fechamento', 'Orientação a Metas e Resultados'] },
  { key: 'bruna', nome_completo: 'Bruna Costa', email: 'bruna.demo@vertho.ai', cargo: 'Representante Comercial', role: 'colaborador', area_depto: COMERCIAL_AREA, gestor_nome: DEMO_MANAGER.nome, gestor_email: DEMO_MANAGER.email, gestor_whatsapp: DEMO_MANAGER.whatsapp, perfil_dominante: 'CS', d_natural: 24, i_natural: 32, s_natural: 68, c_natural: 74, scenario: 'completo', responder: REPRESENTANTE_TOP5 },
  { key: 'carla', nome_completo: 'Carla Menezes', email: 'carla.demo@vertho.ai', cargo: 'Gerente Comercial', role: 'gestor', area_depto: COMERCIAL_AREA, gestor_nome: null as string | null, gestor_email: null as string | null, gestor_whatsapp: null as string | null, perfil_dominante: 'D', d_natural: 76, i_natural: 48, s_natural: 28, c_natural: 42, scenario: 'gestor-parcial', responder: [] as string[] },
  { key: 'mariana', nome_completo: 'Mariana Lopes', email: 'mariana.demo@vertho.ai', cargo: 'Analista Financeiro', role: 'colaborador', area_depto: 'Financeiro', gestor_nome: null as string | null, gestor_email: null as string | null, gestor_whatsapp: null as string | null, perfil_dominante: 'CS', d_natural: 22, i_natural: 34, s_natural: 64, c_natural: 78, scenario: 'completo', responder: [
    'Controle, Precisão e Confiabilidade dos Dados',
    'Análise de Indicadores Financeiros',
    'Organização de Rotinas e Prazos',
    'Comunicação Financeira para Não Especialistas',
    'Critério e Ética no Tratamento de Informações',
  ] },
  { key: 'renato', nome_completo: 'Renato Alves', email: 'renato.demo@vertho.ai', cargo: 'Coordenador de Operações', role: 'colaborador', area_depto: 'Operações', gestor_nome: null as string | null, gestor_email: null as string | null, gestor_whatsapp: null as string | null, perfil_dominante: 'DS', d_natural: 62, i_natural: 38, s_natural: 58, c_natural: 46, scenario: 'novo', responder: [] as string[] },
];

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
function comportamentosDoDisc(D: number, I: number, S: number, C: number) {
  const cl = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
  // Mesmo arredondamento do caminho real: executivo/motivador com 1 casa,
  // metódico/sistemático inteiros (mapeamento-actions.ts:116-119).
  const meio1 = (v: number) => Math.round((v / 2) * 10) / 10;
  const meio0 = (v: number) => Math.round(v / 2);
  return {
    lid_executivo: meio1(D), lid_motivador: meio1(I),
    lid_metodico: meio0(S), lid_sistematico: meio0(C),
    comp_ousadia: cl(D), comp_comando: cl(D), comp_objetividade: cl(D),
    comp_assertividade: cl((D + I) / 2), comp_persuasao: cl(I), comp_extroversao: cl(I),
    comp_entusiasmo: cl(I), comp_sociabilidade: cl((I + S) / 2), comp_empatia: cl(S),
    comp_paciencia: cl(S), comp_persistencia: cl(S), comp_planejamento: cl((S + C) / 2),
    comp_organizacao: cl(C), comp_detalhismo: cl(C), comp_prudencia: cl(C), comp_concentracao: cl(C),
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

/** Executa o reset completo. NÃO lança — devolve `{ok:false,error}` em falha
 *  (o caller — action/cron — decide como reportar). */
export async function resetAcmeDemo(): Promise<ResetDemoResult> {
  const sb = createSupabaseAdmin();

  async function must(label: string, promise: any) {
    const r = await promise;
    if (r.error) throw new Error(`${label}: ${r.error.message}`);
    return r.data;
  }
  async function maybeDelete(table: string, empresaId: string) {
    const r = await sb.from(table).delete().eq('empresa_id', empresaId);
    if (r.error) console.warn(`[reset-demo] skip delete ${table}: ${r.error.message}`);
  }

  async function resetTenant(empresaId: string) {
    const tables = [
      'temporada_semana_progresso', 'trilhas', 'reavaliacao_sessoes', 'sessoes_avaliacao',
      'descriptor_assessments', 'respostas', 'videos_watched', 'fase4_progresso',
      'banco_cenarios', 'top10_cargos', 'colaboradores', 'cargos_empresa',
      'competencias', 'ppp_escolas',
    ];
    for (const table of tables) await maybeDelete(table, empresaId);
  }

  function demoSysConfig(sourceConfig: any = {}) {
    return {
      ...sourceConfig,
      allow_open_signup: true,
      mapeamento_cenarios_liberado: true,
      perfil_comportamental_liberado: true,
      programa_modo: 'regular',
      cadencia: { ...(sourceConfig.cadencia || {}), email_ativo: false, whatsapp_ativo: false },
      envios: {},
    };
  }

  async function upsertEmpresaDemo(source: any) {
    const payload = {
      nome: DEMO_NAME, slug: DEMO_SLUG, segmento: source.segmento || 'corporativo',
      is_demo: true, // gate de envio (mig 160): fonte única de "tenant de demonstração"
      sys_config: demoSysConfig(source.sys_config || {}),
      ui_config: { ...(source.ui_config || {}), login_subtitle: 'Ambiente de treinamento e demonstração da Vertho' },
      default_locale: source.default_locale || 'pt-BR',
    };
    const existing = await must('load demo empresa', sb.from('empresas').select('id').eq('slug', DEMO_SLUG).maybeSingle());
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
      if (DEMO_EXCLUDED_ROLES.has(row.cargo)) continue;
      const inserted = await must('insert competencia', sb.from('competencias').insert({ ...strip(row), empresa_id: destId }).select('id').single());
      idMap.set(row.id, inserted.id);
    }
    return idMap;
  }

  async function seedCargos(rows: any[], destId: string) {
    if (!rows?.length) return;
    const payload = rows.filter((row: any) => !DEMO_EXCLUDED_ROLES.has(row.nome)).map((row: any) => {
      let top5 = Array.isArray(row.top5_workshop) ? row.top5_workshop : [];
      if (row.nome === 'Representante Comercial') top5 = REPRESENTANTE_TOP5;
      else if (top5.length > 5) top5 = top5.slice(0, 5);
      return { ...strip(row), empresa_id: destId, top5_workshop: top5 };
    });
    await must('insert cargos', sb.from('cargos_empresa').insert(payload));
  }

  async function seedTop10(rows: any[], destId: string, compMap: Map<string, string>) {
    const payload = (rows || [])
      .map((row: any) => {
        const competenciaId = compMap.get(row.competencia_id);
        if (!competenciaId) return null;
        return { ...strip(row), empresa_id: destId, competencia_id: competenciaId };
      })
      .filter(Boolean);
    if (payload.length) await must('insert top10', sb.from('top10_cargos').insert(payload));
  }

  async function seedCenarios(rows: any[], destId: string, compMap: Map<string, string>) {
    const idMap = new Map<string, string>();
    for (const row of rows || []) {
      const competenciaId = compMap.get(row.competencia_id);
      if (!competenciaId) continue;
      const inserted = await must('insert cenario', sb.from('banco_cenarios').insert({ ...strip(row), empresa_id: destId, competencia_id: competenciaId, ppp_escola_id: null }).select('id').single());
      idMap.set(row.id, inserted.id);
    }
    return idMap;
  }

  function demoScenarioFor(cargo: string, compNome: string) {
    return {
      titulo: `${compNome} em uma situação real de ${cargo}`,
      descricao: `Você atua como ${cargo} na ACME Demo. Durante uma semana crítica, surge uma situação que exige ${compNome.toLowerCase()}. Há pressão de prazo, informações incompletas e impacto para outras áreas. Você precisa decidir como agir, o que comunicar e como acompanhar o resultado sem perder qualidade nem responsabilidade.`,
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
    await must('insert ppp demo', sb.from('ppp_escolas').insert({
      empresa_id: destId,
      escola: 'ACME Demo - Cultura e Operação',
      fonte: 'json',
      status: 'extraido',
      extracao: JSON.stringify(ACME_DEMO_PPP),
      valores: ACME_DEMO_VALUES,
      extracted_at: new Date().toISOString(),
    }));
  }

  async function insertDemoExtraRoles(destId: string) {
    for (const role of DEMO_EXTRA_ROLES) {
      await must(`insert cargo ${role.nome}`, sb.from('cargos_empresa').insert({
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
        fit_versao: '2.0',
        eh_lideranca: role.nome.includes('Coordenador') || role.nome.includes('Gerente'),
        gabarito: (extraArtifacts.gabaritos as Record<string, any>)?.[role.nome] ?? null,
      }));

      // Prefixo do código da competência por cargo (evita colisão entre cargos).
      const codPrefix = role.nome.startsWith('Analista') ? 'FIN'
        : role.nome.startsWith('Coordenador') ? 'OPS' : 'GER';
      for (const [idx, [nome, descricao]] of role.competencias.entries()) {
        const codComp = `${codPrefix}${String(idx + 1).padStart(2, '0')}`;
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
        await must(`insert cenario ${role.nome} ${nome}`, sb.from('banco_cenarios').insert({
          empresa_id: destId,
          cargo: role.nome,
          competencia_id: firstComp.id,
          ...cenarioData,
        }));
      }
    }
  }

  async function insertPersonas(destId: string) {
    const idMap = new Map<string, string>();
    for (const p of PERSONAS) {
      const inserted = await must(`insert persona ${p.key}`, sb.from('colaboradores').insert({
        empresa_id: destId, nome_completo: p.nome_completo, email: p.email, cargo: p.cargo, role: p.role,
        area_depto: p.area_depto, gestor_nome: p.gestor_nome, gestor_email: p.gestor_email, gestor_whatsapp: p.gestor_whatsapp,
        perfil_dominante: p.perfil_dominante,
        d_natural: p.d_natural, i_natural: p.i_natural, s_natural: p.s_natural, c_natural: p.c_natural,
        ...comportamentosDoDisc(p.d_natural, p.i_natural, p.s_natural, p.c_natural),
        disc_resultados: { demo: true, estado_demo: p.scenario },
      }).select('id').single());
      idMap.set(p.key, inserted.id);
    }
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
    const cenarioByComp = new Map((cenarios || []).map((c: any) => [c.competencia_id, c.id]));

    const payload: any[] = [];
    for (const p of PERSONAS) {
      const colabId = personaMap.get(p.key);
      for (const compNome of p.responder || []) {
        const comp = compByCargoNome.get(`${p.cargo}::${compNome}`);
        if (!comp) continue;
        const respostas = p.key === 'mariana'
          ? respostasFortesFinanceiro(compNome)
          : respostasPara(compNome, p.nome_completo);
        payload.push({
          empresa_id: destId, colaborador_id: colabId, email_colaborador: p.email,
          nome_colaborador: p.nome_completo, cargo: p.cargo,
          cenario_id: cenarioByComp.get(comp.id) || null, competencia_id: comp.id, competencia_nome: comp.nome,
          ...respostas, canal: 'demo-seed', tipo_resposta: 'cenario_a', rodada: 1,
          timestamp_resposta: new Date().toISOString(),
        });
      }
    }
    if (payload.length) await must('insert respostas demo', sb.from('respostas').insert(payload));
  }

  // Replay dos artefatos AVALIADOS congelados (mapeamento pronto sem rodar IA no
  // reset). BEST-EFFORT: falha aqui NÃO derruba o reset — a demo só fica com o
  // mapeamento não-avaliado (sem regressão). Chaveado por e-mail da persona.
  async function applyPersonaArtifacts(destId: string, personaMap: Map<string, string>) {
    // Artefatos avaliados: do fixture principal (acme) + do fixture extra
    // (personas demo-only, ex.: Mariana no Financeiro). Chaveados por e-mail.
    const artifacts: any = {
      ...((fixture as any).personaArtifacts || {}),
      ...((extraArtifacts as any).personaArtifacts || {}),
    };
    for (const p of PERSONAS) {
      const colabId = personaMap.get(p.key);
      const a = artifacts[p.email];
      if (!colabId || !a) continue;
      try {
        // Relatório comportamental (DISC) — report_texts congelado → abre sem IA.
        if (a.report?.report_texts) {
          await sb.from('colaboradores').update({
            report_texts: a.report.report_texts,
            report_generated_at: a.report.report_generated_at || new Date().toISOString(),
          }).eq('id', colabId);
        }
        for (const r of a.respostas || []) {
          await sb.from('respostas').update({
            avaliacao_ia: r.avaliacao_ia, nivel_ia4: r.nivel_ia4, nota_ia4: r.nota_ia4,
            pontos_fortes: r.pontos_fortes, pontos_atencao: r.pontos_atencao,
            feedback_ia4: r.feedback_ia4, payload_ia4: r.payload_ia4, status_ia4: r.status_ia4,
          }).eq('colaborador_id', colabId).eq('competencia_nome', r.competencia_nome);
        }
        if (a.descriptor_assessments?.length) {
          // `nivel` é coluna GENERATED ALWAYS — nunca inserir (dá erro).
          const rows = a.descriptor_assessments.map((d: any) => {
            const { nivel, ...rest } = d;
            return { ...rest, empresa_id: destId, colaborador_id: colabId };
          });
          await sb.from('descriptor_assessments').insert(rows);
        }
        // Trilha (jornada) congelada — conteúdo inline em temporada_plano.
        if (a.trilha?.row) {
          const ins = await sb.from('trilhas').insert({ ...a.trilha.row, empresa_id: destId, colaborador_id: colabId }).select('id').single();
          if (ins.error) throw new Error(`trilha: ${ins.error.message}`);
          const newTrilhaId = ins.data?.id;
          if (newTrilhaId && a.trilha.progress?.length) {
            const rows = a.trilha.progress.map((pr: any) => ({ ...pr, empresa_id: destId, colaborador_id: colabId, trilha_id: newTrilhaId }));
            await sb.from('temporada_semana_progresso').insert(rows);
          }
        }
      } catch (e: any) {
        console.warn(`[reset-demo] artifacts ${p.email}:`, e?.message);
      }
    }
  }

  try {
    const demo = await upsertEmpresaDemo((fixture as any).empresa);

    // Garante que o subdomínio acme-demo.vertho.ai está registrado no Vercel
    // (sem isso o host não é servido → demo inacessível). Best-effort e
    // idempotente (409 = já existe). Self-healing a cada reset.
    try {
      const { addVercelDomain } = await import('@/lib/vercel-domain');
      await addVercelDomain(DEMO_SLUG);
    } catch (e: any) {
      console.warn('[reset-demo] addVercelDomain best-effort:', e?.message);
    }

    await resetTenant(demo.id);
    const compMap = await seedCompetencias((fixture as any).competencias, demo.id);
    await seedCargos((fixture as any).cargos, demo.id);
    await seedTop10((fixture as any).top10, demo.id, compMap);
    await seedCenarios((fixture as any).cenarios, demo.id, compMap);
    await insertDemoPPP(demo.id);
    await insertDemoExtraRoles(demo.id);
    const personaMap = await insertPersonas(demo.id);
    await seedRespostas(demo.id, personaMap);
    await applyPersonaArtifacts(demo.id, personaMap);

    const counts: Record<string, number | null> = {};
    for (const table of ['colaboradores', 'cargos_empresa', 'competencias', 'top10_cargos', 'banco_cenarios', 'respostas']) {
      const r = await sb.from(table).select('*', { count: 'exact', head: true }).eq('empresa_id', demo.id);
      counts[table] = r.count;
    }
    return { ok: true, empresaId: demo.id, counts };
  } catch (err: any) {
    console.error('[reset-demo] ERRO:', err?.message);
    return { ok: false, error: err?.message || 'erro desconhecido' };
  }
}
