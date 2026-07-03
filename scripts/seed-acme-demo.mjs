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

const REPRESENTANTE_TOP5 = [
  'Comunicação e Apresentação de Valor',
  'Negociação e Fechamento',
  'Relacionamento e Pós-venda',
  'Resiliência e Constância',
  'Orientação a Metas e Resultados',
];

const PERSONAS = [
  {
    key: 'ana',
    nome_completo: 'Ana Martins',
    email: 'ana.demo@vertho.ai',
    cargo: 'Representante Comercial',
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
    perfil_dominante: 'D',
    d_natural: 76, i_natural: 48, s_natural: 28, c_natural: 42,
    scenario: 'gestor-parcial',
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
  const payload = rows.map((row) => {
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

async function insertPersonas(destId) {
  const idMap = new Map();
  for (const p of PERSONAS) {
    const inserted = await must(`insert persona ${p.key}`,
      sb.from('colaboradores').insert({
        empresa_id: destId,
        nome_completo: p.nome_completo,
        email: p.email,
        cargo: p.cargo,
        role: 'colaborador',
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
