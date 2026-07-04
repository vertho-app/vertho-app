/**
 * Seed/reset da empresa ACME Demo.
 *
 * Uso:
 *   node scripts/seed-acme-demo.mjs
 *
 * O script é idempotente: mantém o tenant `acme-demo`, apaga apenas dados
 * demonstrativos desse tenant e recria um estado conhecido para treinamento.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const SOURCE_SLUG = 'acme';
const DEMO_SLUG = 'acme-demo';
const DEMO_NAME = 'ACME Demo';
const DEMO_EXCLUDED_ROLES = new Set(['Diretor Geral']);

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
  whatsapp: null,
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
];

const PERSONAS = [
  {
    key: 'ana',
    nome_completo: 'Ana Martins',
    email: 'ana.demo@vertho.ai',
    cargo: 'Representante Comercial',
    role: 'colaborador',
    area_depto: COMERCIAL_AREA,
    gestor_nome: DEMO_MANAGER.nome,
    gestor_email: DEMO_MANAGER.email,
    gestor_whatsapp: DEMO_MANAGER.whatsapp,
    perfil_dominante: 'I',
    d_natural: 28, i_natural: 72, s_natural: 46, c_natural: 34,
    scenario: 'novo',
    responder: [],
  },
  {
    key: 'paulo',
    nome_completo: 'Paulo Demo',
    email: 'paulo.demo@vertho.ai',
    cargo: 'Representante Comercial',
    role: 'colaborador',
    area_depto: COMERCIAL_AREA,
    gestor_nome: DEMO_MANAGER.nome,
    gestor_email: DEMO_MANAGER.email,
    gestor_whatsapp: DEMO_MANAGER.whatsapp,
    perfil_dominante: 'ID',
    d_natural: 66, i_natural: 61, s_natural: 24, c_natural: 31,
    scenario: 'parcial',
    responder: ['Negociação e Fechamento', 'Orientação a Metas e Resultados'],
  },
  {
    key: 'bruna',
    nome_completo: 'Bruna Costa',
    email: 'bruna.demo@vertho.ai',
    cargo: 'Representante Comercial',
    role: 'colaborador',
    area_depto: COMERCIAL_AREA,
    gestor_nome: DEMO_MANAGER.nome,
    gestor_email: DEMO_MANAGER.email,
    gestor_whatsapp: DEMO_MANAGER.whatsapp,
    perfil_dominante: 'CS',
    d_natural: 24, i_natural: 32, s_natural: 68, c_natural: 74,
    scenario: 'completo',
    responder: REPRESENTANTE_TOP5,
  },
  {
    key: 'carla',
    nome_completo: 'Carla Menezes',
    email: 'carla.demo@vertho.ai',
    cargo: 'Gerente Comercial',
    role: 'gestor',
    area_depto: COMERCIAL_AREA,
    gestor_nome: null,
    gestor_email: null,
    gestor_whatsapp: null,
    perfil_dominante: 'D',
    d_natural: 76, i_natural: 48, s_natural: 28, c_natural: 42,
    scenario: 'gestor-parcial',
    responder: [],
  },
  {
    key: 'mariana',
    nome_completo: 'Mariana Lopes',
    email: 'mariana.demo@vertho.ai',
    cargo: 'Analista Financeiro',
    role: 'colaborador',
    area_depto: 'Financeiro',
    gestor_nome: null,
    gestor_email: null,
    gestor_whatsapp: null,
    perfil_dominante: 'CS',
    d_natural: 22, i_natural: 34, s_natural: 64, c_natural: 78,
    scenario: 'novo',
    responder: [],
  },
  {
    key: 'renato',
    nome_completo: 'Renato Alves',
    email: 'renato.demo@vertho.ai',
    cargo: 'Coordenador de Operações',
    role: 'colaborador',
    area_depto: 'Operações',
    gestor_nome: null,
    gestor_email: null,
    gestor_whatsapp: null,
    perfil_dominante: 'DS',
    d_natural: 62, i_natural: 38, s_natural: 58, c_natural: 46,
    scenario: 'novo',
    responder: [],
  },
];

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const strip = (row, extra = []) => {
  const out = { ...row };
  for (const k of ['id', 'created_at', 'updated_at', ...extra]) delete out[k];
  return out;
};

async function must(label, promise) {
  const r = await promise;
  if (r.error) throw new Error(`${label}: ${r.error.message}`);
  return r.data;
}

async function maybeDelete(table, empresaId) {
  const r = await sb.from(table).delete().eq('empresa_id', empresaId);
  if (r.error) console.warn(`skip delete ${table}: ${r.error.message}`);
}

async function resetTenant(empresaId) {
  const tables = [
    'temporada_semana_progresso',
    'trilhas',
    'reavaliacao_sessoes',
    'sessoes_avaliacao',
    'descriptor_assessments',
    'respostas',
    'videos_watched',
    'fase4_progresso',
    'banco_cenarios',
    'top10_cargos',
    'colaboradores',
    'cargos_empresa',
    'competencias',
    'ppp_escolas',
  ];
  for (const table of tables) await maybeDelete(table, empresaId);
}

function demoSysConfig(sourceConfig = {}) {
  return {
    ...sourceConfig,
    allow_open_signup: true,
    mapeamento_cenarios_liberado: true,
    perfil_comportamental_liberado: true,
    programa_modo: 'regular',
    cadencia: {
      ...(sourceConfig.cadencia || {}),
      email_ativo: false,
      whatsapp_ativo: false,
    },
    envios: {},
  };
}

async function upsertEmpresaDemo(source) {
  const payload = {
    nome: DEMO_NAME,
    slug: DEMO_SLUG,
    segmento: source.segmento || 'corporativo',
    sys_config: demoSysConfig(source.sys_config || {}),
    ui_config: {
      ...(source.ui_config || {}),
      login_subtitle: 'Ambiente de treinamento e demonstração da Vertho',
    },
    default_locale: source.default_locale || 'pt-BR',
  };

  const existing = await must('load demo empresa',
    sb.from('empresas').select('id').eq('slug', DEMO_SLUG).maybeSingle());
  if (existing?.id) {
    return await must('update demo empresa',
      sb.from('empresas').update(payload).eq('id', existing.id).select('id,nome,slug').single());
  }
  return await must('insert demo empresa',
    sb.from('empresas').insert(payload).select('id,nome,slug').single());
}

async function cloneCompetencias(sourceId, destId) {
  const rows = await must('load competencias',
    sb.from('competencias').select('*').eq('empresa_id', sourceId).order('cargo').order('cod_comp'));
  const idMap = new Map();
  if (!rows?.length) return idMap;
  for (const row of rows) {
    if (DEMO_EXCLUDED_ROLES.has(row.cargo)) continue;
    const inserted = await must('insert competencia',
      sb.from('competencias').insert({ ...strip(row), empresa_id: destId }).select('id').single());
    idMap.set(row.id, inserted.id);
  }
  return idMap;
}

async function cloneCargos(sourceId, destId) {
  const rows = await must('load cargos',
    sb.from('cargos_empresa').select('*').eq('empresa_id', sourceId).order('nome'));
  if (!rows?.length) return;
  const payload = rows.filter((row) => !DEMO_EXCLUDED_ROLES.has(row.nome)).map((row) => {
    let top5 = Array.isArray(row.top5_workshop) ? row.top5_workshop : [];
    if (row.nome === 'Representante Comercial') top5 = REPRESENTANTE_TOP5;
    else if (top5.length > 5) top5 = top5.slice(0, 5);
    return { ...strip(row), empresa_id: destId, top5_workshop: top5 };
  });
  await must('insert cargos', sb.from('cargos_empresa').insert(payload));
}

async function cloneTop10(sourceId, destId, compMap) {
  const rows = await must('load top10',
    sb.from('top10_cargos').select('*').eq('empresa_id', sourceId).order('cargo').order('posicao'));
  const payload = (rows || [])
    .map((row) => {
      const competenciaId = compMap.get(row.competencia_id);
      if (!competenciaId) return null;
      return { ...strip(row), empresa_id: destId, competencia_id: competenciaId };
    })
    .filter(Boolean);
  if (payload.length) await must('insert top10', sb.from('top10_cargos').insert(payload));
}

async function cloneCenarios(sourceId, destId, compMap) {
  const rows = await must('load cenarios',
    sb.from('banco_cenarios').select('*').eq('empresa_id', sourceId).order('created_at'));
  const idMap = new Map();
  for (const row of rows || []) {
    const competenciaId = compMap.get(row.competencia_id);
    if (!competenciaId) continue;
    const inserted = await must('insert cenario',
      sb.from('banco_cenarios').insert({
        ...strip(row),
        empresa_id: destId,
        competencia_id: competenciaId,
        ppp_escola_id: null,
      }).select('id').single());
    idMap.set(row.id, inserted.id);
  }
  return idMap;
}

function demoScenarioFor(cargo, compNome) {
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

function demoDescriptorsFor(compNome, descricao) {
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

async function insertDemoPPP(destId) {
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

async function insertDemoExtraRoles(destId) {
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
      eh_lideranca: role.nome.includes('Coordenador'),
    }));

    for (const [idx, [nome, descricao]] of role.competencias.entries()) {
      const codComp = `${role.nome.startsWith('Analista') ? 'FIN' : 'OPS'}${String(idx + 1).padStart(2, '0')}`;
      let firstComp = null;
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

      await must(`insert cenario ${role.nome} ${nome}`, sb.from('banco_cenarios').insert({
        empresa_id: destId,
        cargo: role.nome,
        competencia_id: firstComp.id,
        ...demoScenarioFor(role.nome, nome),
      }));
    }
  }
}

async function insertPersonas(destId) {
  const idMap = new Map();
  for (const p of PERSONAS) {
    const inserted = await must(`insert persona ${p.key}`,
      sb.from('colaboradores').insert({
        empresa_id: destId,
        nome_completo: p.nome_completo,
        email: p.email,
        cargo: p.cargo,
        role: p.role,
        area_depto: p.area_depto,
        gestor_nome: p.gestor_nome,
        gestor_email: p.gestor_email,
        gestor_whatsapp: p.gestor_whatsapp,
        perfil_dominante: p.perfil_dominante,
        d_natural: p.d_natural,
        i_natural: p.i_natural,
        s_natural: p.s_natural,
        c_natural: p.c_natural,
        d_adaptado: p.d_natural,
        i_adaptado: p.i_natural,
        s_adaptado: p.s_natural,
        c_adaptado: p.c_natural,
        disc_resultados: { demo: true, estado_demo: p.scenario },
      }).select('id').single());
    idMap.set(p.key, inserted.id);
  }
  return idMap;
}

function respostasPara(compNome, personaNome) {
  return {
    r1: `Eu começaria delimitando o problema principal antes de agir. No caso de ${compNome}, eu separaria fatos, interesses do cliente e riscos comerciais para evitar uma resposta automática.`,
    r2: `Minha ação seria combinar uma conversa objetiva com registro no CRM e um próximo passo claro. Eu priorizaria o que preserva valor para o cliente sem comprometer margem ou previsibilidade.`,
    r3: `O critério seria equilibrar relação, resultado e sustentabilidade. Uma decisão boa precisa resolver o curto prazo sem criar dependência ou promessa difícil de cumprir depois.`,
    r4: `Eu acompanharia indicadores e pediria feedback. Também observaria onde minha reação inicial poderia ter sido impulsiva ou defensiva, para ajustar a próxima abordagem.`,
    representatividade: personaNome === 'Bruna Costa' ? 9 : 8,
  };
}

async function seedRespostas(destId, personaMap) {
  const { data: comps, error: compErr } = await sb.from('competencias')
    .select('id,nome,cargo,cod_desc')
    .eq('empresa_id', destId);
  if (compErr) throw compErr;
  const compByCargoNome = new Map();
  for (const c of comps || []) {
    const key = `${c.cargo}::${c.nome}`;
    const current = compByCargoNome.get(key);
    if (!current || (!c.cod_desc && current.cod_desc)) compByCargoNome.set(key, c);
  }

  const { data: cenarios, error: cenErr } = await sb.from('banco_cenarios')
    .select('id,competencia_id,cargo,tipo_cenario')
    .eq('empresa_id', destId)
    .or('tipo_cenario.is.null,tipo_cenario.neq.cenario_b');
  if (cenErr) throw cenErr;
  const cenarioByComp = new Map((cenarios || []).map((c) => [c.competencia_id, c.id]));

  const payload = [];
  for (const p of PERSONAS) {
    const colabId = personaMap.get(p.key);
    for (const compNome of p.responder || []) {
      const comp = compByCargoNome.get(`${p.cargo}::${compNome}`);
      if (!comp) continue;
      const respostas = respostasPara(compNome, p.nome_completo);
      payload.push({
        empresa_id: destId,
        colaborador_id: colabId,
        email_colaborador: p.email,
        nome_colaborador: p.nome_completo,
        cargo: p.cargo,
        cenario_id: cenarioByComp.get(comp.id) || null,
        competencia_id: comp.id,
        competencia_nome: comp.nome,
        ...respostas,
        canal: 'demo-seed',
        tipo_resposta: 'cenario_a',
        rodada: 1,
        timestamp_resposta: new Date().toISOString(),
      });
    }
  }
  if (payload.length) await must('insert respostas demo', sb.from('respostas').insert(payload));
}

async function main() {
  const source = await must('load source empresa',
    sb.from('empresas').select('id,nome,segmento,sys_config,ui_config,default_locale').eq('slug', SOURCE_SLUG).single());
  const demo = await upsertEmpresaDemo(source);
  console.log(`Empresa demo: ${demo.nome} (${demo.slug}) id=${demo.id}`);

  await resetTenant(demo.id);
  const compMap = await cloneCompetencias(source.id, demo.id);
  await cloneCargos(source.id, demo.id);
  await cloneTop10(source.id, demo.id, compMap);
  await cloneCenarios(source.id, demo.id, compMap);
  await insertDemoPPP(demo.id);
  await insertDemoExtraRoles(demo.id);
  const personaMap = await insertPersonas(demo.id);
  await seedRespostas(demo.id, personaMap);

  const counts = {};
  for (const table of ['colaboradores', 'cargos_empresa', 'competencias', 'top10_cargos', 'banco_cenarios', 'respostas']) {
    const r = await sb.from(table).select('*', { count: 'exact', head: true }).eq('empresa_id', demo.id);
    counts[table] = r.count;
  }
  console.log('Reset concluído:', JSON.stringify(counts, null, 2));
  console.log('Personas:', PERSONAS.map((p) => `${p.nome_completo} <${p.email}> (${p.scenario})`).join(' | '));
}

main().catch((err) => {
  console.error('ERRO:', err.message);
  process.exit(1);
});
