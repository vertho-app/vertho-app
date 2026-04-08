'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from './ai-client';
import { extractJSON } from './utils';

// ── IA1: Gerar top 10 competências por cargo ────────────────────────────────
// Fiel ao GAS antigo: busca PPP, valores, competências base, dados do cargo

export async function rodarIA1(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    // 1. Buscar empresa
    let empresa;
    const { data: emp1 } = await sb.from('empresas')
      .select('nome, segmento, ppp_texto')
      .eq('id', empresaId).single();
    if (emp1) {
      empresa = emp1;
    } else {
      const { data: emp2 } = await sb.from('empresas')
        .select('nome, segmento')
        .eq('id', empresaId).single();
      empresa = emp2;
    }
    if (!empresa) return { success: false, error: `Empresa não encontrada (id: ${empresaId})` };

    // 2. Buscar PPP extraído (contexto da empresa/escola)
    const contextoPPP = await buscarContextoPPP(sb, empresaId, empresa.nome);

    // 3. Buscar valores organizacionais do PPP
    const valores = await buscarValores(sb, empresaId, empresa.nome);

    // 4. Buscar cargos com dados completos (colaboradores)
    const { data: colaboradores } = await sb.from('colaboradores')
      .select('cargo, area_depto')
      .eq('empresa_id', empresaId)
      .not('cargo', 'is', null);

    const cargosMap = {};
    (colaboradores || []).forEach(c => {
      if (c.cargo && !cargosMap[c.cargo]) {
        cargosMap[c.cargo] = { cargo: c.cargo, area: c.area_depto || '' };
      }
    });
    const cargosUnicos = Object.values(cargosMap);
    if (!cargosUnicos.length) return { success: false, error: 'Nenhum cargo encontrado nos colaboradores' };

    // 5. Buscar competências base (filtradas por segmento)
    const baseComp = await buscarBaseCompetencias(sb, empresa.segmento);

    // 6. Para cada cargo, gerar top 10
    const system = buildSystemPrompt(baseComp);
    let totalGeradas = 0;

    for (const cargoInfo of cargosUnicos) {
      const user = buildUserPrompt(empresa, cargoInfo, valores, contextoPPP);

      const resposta = await callAI(system, user, aiConfig, 4096);
      const resultado = await extractJSON(resposta);

      if (resultado?.top10 && Array.isArray(resultado.top10)) {
        for (const comp of resultado.top10) {
          // Dedup: não inserir se já existe
          const { data: existe } = await sb.from('competencias')
            .select('id')
            .eq('empresa_id', empresaId)
            .eq('cargo', cargoInfo.cargo)
            .eq('nome', comp.nome)
            .maybeSingle();
          if (existe) continue;

          await sb.from('competencias').insert({
            empresa_id: empresaId,
            cargo: cargoInfo.cargo,
            nome: comp.nome,
            descricao: comp.justificativa || comp.descricao || null,
            cod_comp: comp.id || comp.nome.substring(0, 10).toUpperCase(),
            pilar: comp.categoria || comp.pilar || null,
          });
          totalGeradas++;
        }
      }
    }

    return { success: true, message: `IA1 concluída: ${totalGeradas} competências geradas para ${cargosUnicos.length} cargos` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Helpers IA1 ─────────────────────────────────────────────────────────────

async function buscarContextoPPP(sb, empresaId, empresaNome) {
  try {
    // Buscar extração do PPP salva
    const { data: ppp } = await sb.from('ppp_escolas')
      .select('extracao')
      .eq('empresa_id', empresaId)
      .eq('status', 'extraido')
      .order('extracted_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!ppp?.extracao) return '';

    const ext = typeof ppp.extracao === 'string' ? JSON.parse(ppp.extracao) : ppp.extracao;

    // Formatar as seções mais relevantes (máx 4000 chars, como no GAS)
    const parts = [];
    let totalChars = 0;
    const MAX = 4000;

    const secoes = [
      { key: 'perfil_organizacional', label: 'PERFIL DA EMPRESA' },
      { key: 'perfil_instituicao', label: 'PERFIL DA INSTITUIÇÃO' },
      { key: 'comunidade_contexto', label: 'COMUNIDADE E CONTEXTO' },
      { key: 'mercado_stakeholders', label: 'MERCADO E STAKEHOLDERS' },
      { key: 'identidade_cultura', label: 'IDENTIDADE E CULTURA' },
      { key: 'identidade', label: 'IDENTIDADE' },
      { key: 'operacao_processos', label: 'OPERAÇÃO E PROCESSOS' },
      { key: 'praticas_descritas', label: 'PRÁTICAS DESCRITAS' },
      { key: 'desafios_estrategia', label: 'DESAFIOS E ESTRATÉGIA' },
      { key: 'desafios_metas', label: 'DESAFIOS E METAS' },
      { key: 'vocabulario_corporativo', label: 'VOCABULÁRIO' },
      { key: 'vocabulario', label: 'VOCABULÁRIO' },
      { key: 'modelo_pessoas', label: 'MODELO DE PESSOAS' },
    ];

    for (const sec of secoes) {
      if (totalChars >= MAX) break;
      let val = ext[sec.key];
      if (!val) continue;
      // Extrair conteudo se formato novo {conteudo, origem, confianca}
      if (val.conteudo !== undefined) val = val.conteudo;
      const texto = typeof val === 'string' ? val : JSON.stringify(val, null, 1);
      if (!texto || texto.length < 10) continue;
      const truncated = texto.length > 800 ? texto.substring(0, 800) + '...' : texto;
      const bloco = `## ${sec.label}\n${truncated}`;
      parts.push(bloco);
      totalChars += bloco.length;
    }

    return parts.join('\n\n');
  } catch {
    return '';
  }
}

async function buscarValores(sb, empresaId, empresaNome) {
  try {
    const { data: ppp } = await sb.from('ppp_escolas')
      .select('valores')
      .eq('empresa_id', empresaId)
      .eq('status', 'extraido')
      .order('extracted_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (ppp?.valores && Array.isArray(ppp.valores) && ppp.valores.length > 0) {
      return ppp.valores;
    }
    return ['Ética e integridade', 'Respeito', 'Compromisso com resultados', 'Responsabilidade'];
  } catch {
    return ['Ética e integridade', 'Respeito', 'Compromisso com resultados', 'Responsabilidade'];
  }
}

async function buscarBaseCompetencias(sb, segmento) {
  try {
    // Buscar competências da tabela competencias_base
    let query = sb.from('competencias_base').select('*').order('nome');
    if (segmento) query = query.eq('segmento', segmento);
    const { data } = await query;
    return data || [];
  } catch {
    return [];
  }
}

function buildSystemPrompt(baseComp) {
  const temBase = baseComp.length > 0;

  if (temBase) {
    // Montar texto da base (fiel ao GAS: id | nome | categoria | descrição)
    const baseTexto = baseComp.map(comp => {
      return `${comp.cod_comp || comp.id} | ${comp.nome} | ${comp.pilar || 'Comportamental'} | ${comp.descricao || ''}`;
    }).join('\n');

    return `Você é a IA de parametrização da Vertho.
Selecione as 10 competências MAIS RELEVANTES da base para o cargo descrito.
Retorne APENAS JSON válido, sem markdown:
{"top10":[{"id":"C001","nome":"Nome","categoria":"Comportamental","justificativa":"Frase específica."},...], "justificativa_geral":"Parágrafo."}

REGRAS — siga na ordem de prioridade:
1. Exatamente 10 competências — nem mais, nem menos.
2. TODAS as 10 devem ser da base fornecida — proibido inventar IDs.
3. Selecione APENAS competências diretamente aplicáveis ao cargo descrito:
   — Analise cargo, área, descrição e entregas.
   — Elimine competências que não fazem sentido para esse cargo específico.
4. Use descrição do cargo e entregas como critério principal de seleção.
5. Use valores organizacionais como critério de desempate.
6. A justificativa de cada competência DEVE citar elemento específico do cargo.

BASE DE COMPETÊNCIAS (id | nome | categoria | descrição):
${baseTexto}`;
  }

  // Sem base: gerar do zero
  return `Você é um especialista em gestão por competências comportamentais.
Gere as 10 competências comportamentais mais relevantes para o cargo descrito.
Retorne APENAS JSON válido:
{"top10":[{"id":"COMP-01","nome":"Nome","categoria":"Comportamental","justificativa":"Frase específica."},...], "justificativa_geral":"Parágrafo."}

REGRAS:
1. Exatamente 10 competências — nem mais, nem menos.
2. Foco em competências comportamentais aplicáveis ao cargo.
3. Use o contexto da empresa e valores organizacionais.
4. A justificativa de cada competência DEVE ser específica para o cargo.`;
}

function buildUserPrompt(empresa, cargoInfo, valores, contextoPPP) {
  return `EMPRESA: ${empresa.nome}
SEGMENTO: ${empresa.segmento || 'Não informado'}
CARGO: ${cargoInfo.cargo}
ÁREA: ${cargoInfo.area || 'Não informado'}
VALORES ORGANIZACIONAIS: ${valores.join(', ')}
${contextoPPP ? `\nCONTEXTO DA EMPRESA:\n${contextoPPP}` : ''}`;
}

// ── IA2: Gerar gabarito (rubrica de respostas) ──────────────────────────────

export async function rodarIA2(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: competencias } = await sb.from('competencias')
      .select('*')
      .eq('empresa_id', empresaId);

    if (!competencias?.length) return { success: false, error: 'Nenhuma competência encontrada. Rode IA1 primeiro.' };

    const { data: empresa } = await sb.from('empresas')
      .select('nome, segmento')
      .eq('id', empresaId).single();

    const system = `Você é um especialista em avaliação por competências.
Responda APENAS com JSON válido.`;

    let totalGabaritos = 0;

    for (const comp of competencias) {
      const user = `Para a competência "${comp.nome}" (${comp.descricao}) na empresa "${empresa.nome}" (${empresa.segmento}), cargo "${comp.cargo}":

Gere o gabarito de avaliação com 5 níveis de proficiência (1 a 5).
Formato JSON:
{
  "competencia_id": "${comp.id}",
  "niveis": [
    {"nivel": 1, "descricao": "...", "indicadores": ["..."]},
    {"nivel": 2, "descricao": "...", "indicadores": ["..."]},
    {"nivel": 3, "descricao": "...", "indicadores": ["..."]},
    {"nivel": 4, "descricao": "...", "indicadores": ["..."]},
    {"nivel": 5, "descricao": "...", "indicadores": ["..."]}
  ]
}`;

      const resposta = await callAI(system, user, aiConfig, 4096);
      const gabarito = await extractJSON(resposta);

      if (gabarito?.niveis) {
        await sb.from('competencias')
          .update({ gabarito: gabarito.niveis })
          .eq('id', comp.id);
        totalGabaritos++;
      }
    }

    return { success: true, message: `IA2 concluída: ${totalGabaritos} gabaritos gerados` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── IA3: Gerar cenários contextuais ─────────────────────────────────────────

export async function rodarIA3(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('nome, segmento')
      .eq('id', empresaId).single();

    const { data: competencias } = await sb.from('competencias')
      .select('*')
      .eq('empresa_id', empresaId);

    if (!competencias?.length) return { success: false, error: 'Nenhuma competência encontrada.' };

    const system = `Você é um especialista em avaliação comportamental por cenários situacionais.
Responda APENAS com JSON válido.`;

    let totalCenarios = 0;

    for (const comp of competencias) {
      const user = `Para a competência "${comp.nome}" na empresa "${empresa.nome}" (${empresa.segmento}), cargo "${comp.cargo}":

Crie 3 cenários situacionais com 4 alternativas cada (A, B, C, D), onde cada alternativa mapeia para um nível de proficiência diferente.
Formato JSON:
[{
  "titulo": "...",
  "descricao": "Situação contextual...",
  "alternativas": [
    {"letra": "A", "texto": "...", "nivel": 1},
    {"letra": "B", "texto": "...", "nivel": 2},
    {"letra": "C", "texto": "...", "nivel": 3},
    {"letra": "D", "texto": "...", "nivel": 5}
  ]
}]`;

      const resposta = await callAI(system, user, aiConfig, 6000);
      const cenarios = await extractJSON(resposta);

      if (Array.isArray(cenarios)) {
        for (const cenario of cenarios) {
          await sb.from('banco_cenarios').insert({
            empresa_id: empresaId,
            competencia_id: comp.id,
            cargo: comp.cargo,
            titulo: cenario.titulo,
            descricao: cenario.descricao,
            alternativas: cenario.alternativas,
          });
          totalCenarios++;
        }
      }
    }

    return { success: true, message: `IA3 concluída: ${totalCenarios} cenários gerados` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Popular Cenários (template do banco_cenarios) ───────────────────────────

export async function popularCenarios(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('segmento')
      .eq('id', empresaId).single();

    const { data: templates } = await sb.from('banco_cenarios')
      .select('*')
      .is('empresa_id', null)
      .eq('segmento', empresa.segmento);

    if (!templates?.length) {
      return { success: false, error: 'Nenhum cenário template encontrado para este segmento' };
    }

    const novos = templates.map(t => ({
      empresa_id: empresaId,
      competencia_id: t.competencia_id,
      cargo: t.cargo,
      titulo: t.titulo,
      descricao: t.descricao,
      alternativas: t.alternativas,
    }));

    const { error } = await sb.from('banco_cenarios').insert(novos);
    if (error) return { success: false, error: error.message };

    return { success: true, message: `${novos.length} cenários populados do template` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
