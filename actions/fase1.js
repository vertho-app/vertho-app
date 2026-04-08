'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from './ai-client';
import { extractJSON } from './utils';

// ── IA1: Selecionar top 10 competências por cargo ───────────────────────────
// Seleciona das competências JÁ CADASTRADAS na empresa (tabela competencias).
// Resultado salvo em top10_cargos para validação humana.

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

    // 2. Buscar competências da empresa (catálogo completo)
    const { data: competencias } = await sb.from('competencias')
      .select('id, nome, descricao, cod_comp, pilar, cargo')
      .eq('empresa_id', empresaId);

    if (!competencias?.length) return { success: false, error: 'Nenhuma competência cadastrada. Importe competências primeiro.' };

    // Agrupar competências únicas por cod_comp (descritores viram uma só)
    const compMap = {};
    competencias.forEach(c => {
      const key = c.cod_comp || c.nome;
      if (!compMap[key]) compMap[key] = { ...c, count: 1 };
      else compMap[key].count++;
    });
    const compsUnicas = Object.values(compMap);

    // 3. Buscar PPP e valores
    const contextoPPP = await buscarContextoPPP(sb, empresaId, empresa.nome);
    const valores = await buscarValores(sb, empresaId, empresa.nome);

    // 4. Buscar cargos (prioriza cargos_empresa com descrição)
    const { data: cargosDetalhados } = await sb.from('cargos_empresa')
      .select('*')
      .eq('empresa_id', empresaId);

    const { data: colaboradores } = await sb.from('colaboradores')
      .select('cargo, area_depto')
      .eq('empresa_id', empresaId)
      .not('cargo', 'is', null);

    const cargosMap = {};
    (cargosDetalhados || []).forEach(c => {
      cargosMap[c.nome] = {
        cargo: c.nome, area: c.area_depto || '',
        descricao: c.descricao || '', entregas: c.principais_entregas || '',
        stakeholders: c.stakeholders || '', decisoes: c.decisoes_recorrentes || '',
        tensoes: c.tensoes_comuns || '', contexto_extra: c.contexto_cultural || '',
      };
    });
    (colaboradores || []).forEach(c => {
      if (c.cargo && !cargosMap[c.cargo]) {
        cargosMap[c.cargo] = { cargo: c.cargo, area: c.area_depto || '' };
      }
    });
    const cargosUnicos = Object.values(cargosMap);
    if (!cargosUnicos.length) return { success: false, error: 'Nenhum cargo encontrado' };

    // 5. Para cada cargo, pedir à IA que selecione as 10 melhores
    let totalSelecionadas = 0;

    for (const cargoInfo of cargosUnicos) {
      // Enviar TODAS as competências da empresa — a IA seleciona as mais relevantes para o cargo
      const system = buildSystemPromptSelecao(compsUnicas, cargoInfo.cargo);
      const user = buildUserPrompt(empresa, cargoInfo, valores, contextoPPP);

      const resposta = await callAI(system, user, aiConfig, 4096);
      const resultado = await extractJSON(resposta);

      if (resultado?.top10 && Array.isArray(resultado.top10)) {
        // Limpar seleção anterior deste cargo
        await sb.from('top10_cargos')
          .delete()
          .eq('empresa_id', empresaId)
          .eq('cargo', cargoInfo.cargo);

        const usedIds = new Set();
        for (let i = 0; i < resultado.top10.length; i++) {
          const sel = resultado.top10[i];
          const selId = (sel.id || sel.cod_comp || '').trim().toLowerCase();
          const selNome = (sel.nome || '').trim().toLowerCase();

          // Match progressivo: cod_comp exato → cod_comp case-insensitive → nome exato → nome parcial
          const match = competencias.find(c => !usedIds.has(c.id) && c.cod_comp && selId && c.cod_comp.toLowerCase() === selId)
            || competencias.find(c => !usedIds.has(c.id) && selNome && c.nome.toLowerCase() === selNome)
            || competencias.find(c => !usedIds.has(c.id) && selNome && c.nome.toLowerCase().includes(selNome))
            || competencias.find(c => !usedIds.has(c.id) && selNome && selNome.includes(c.nome.toLowerCase()));

          if (!match) { console.log('[IA1] Sem match para:', sel.id, sel.nome); continue; }
          usedIds.add(match.id);

          await sb.from('top10_cargos').insert({
            empresa_id: empresaId,
            cargo: cargoInfo.cargo,
            competencia_id: match.id,
            posicao: i + 1,
            justificativa: sel.justificativa || null,
          });
          totalSelecionadas++;
        }
      }
    }

    return { success: true, message: `IA1 concluída: ${totalSelecionadas} competências selecionadas para ${cargosUnicos.length} cargos` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── CRUD top10 (para validação manual) ──────────────────────────────────────

export async function loadTop10(empresaId, cargo) {
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('top10_cargos')
    .select('*, competencia:competencias(id, nome, cod_comp, pilar, descricao)')
    .eq('empresa_id', empresaId)
    .eq('cargo', cargo)
    .order('posicao');
  return data || [];
}

export async function loadTop10TodosCargos(empresaId) {
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('top10_cargos')
    .select('*, competencia:competencias(id, nome, cod_comp, pilar, descricao)')
    .eq('empresa_id', empresaId)
    .order('cargo')
    .order('posicao');
  return data || [];
}

export async function adicionarTop10(empresaId, cargo, competenciaId) {
  const sb = createSupabaseAdmin();
  // Pegar próxima posição
  const { data: existentes } = await sb.from('top10_cargos')
    .select('posicao')
    .eq('empresa_id', empresaId)
    .eq('cargo', cargo)
    .order('posicao', { ascending: false })
    .limit(1);
  const proxPosicao = (existentes?.[0]?.posicao || 0) + 1;

  const { error } = await sb.from('top10_cargos').insert({
    empresa_id: empresaId,
    cargo,
    competencia_id: competenciaId,
    posicao: proxPosicao,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function removerTop10(id) {
  const sb = createSupabaseAdmin();
  const { error } = await sb.from('top10_cargos').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
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

function buildSystemPromptSelecao(competencias, cargoAlvo) {
  // Separar competências do cargo-alvo vs outras
  const doCargo = competencias.filter(c => c.cargo && c.cargo.toLowerCase() === cargoAlvo.toLowerCase());
  const outras = competencias.filter(c => !c.cargo || c.cargo.toLowerCase() !== cargoAlvo.toLowerCase());

  const formatComp = comp => `${comp.cod_comp || comp.id} | ${comp.nome} | ${comp.cargo || 'geral'} | ${comp.pilar || ''} | ${comp.descricao || ''}`;

  let baseTexto = '';
  if (doCargo.length > 0) {
    baseTexto += `--- COMPETÊNCIAS DO CARGO "${cargoAlvo}" (${doCargo.length}) ---\n`;
    baseTexto += doCargo.map(formatComp).join('\n');
  }
  if (outras.length > 0) {
    baseTexto += `\n\n--- OUTRAS COMPETÊNCIAS DISPONÍVEIS (${outras.length}) ---\n`;
    baseTexto += outras.map(formatComp).join('\n');
  }

  const total = competencias.length;
  const maxSel = Math.min(10, total);

  return `Você é a IA de parametrização da Vertho.
Sua tarefa: SELECIONAR as ${maxSel} competências MAIS RELEVANTES para o cargo "${cargoAlvo}" da lista abaixo.

IMPORTANTE: Você NÃO pode inventar competências. Selecione APENAS da lista fornecida.
A lista tem ${total} competências. ${total <= 10 ? `Como há ${total} (menos de 10), selecione TODAS.` : `Selecione exatamente 10.`}

PRIORIDADE: Competências que já estão associadas ao cargo "${cargoAlvo}" devem ser priorizadas.

Retorne APENAS JSON válido, sem markdown:
{"top10":[{"id":"COD","nome":"Nome exato da lista","justificativa":"Frase específica citando elemento do cargo."},...], "justificativa_geral":"Parágrafo."}

REGRAS:
1. Selecione ${maxSel} competências — ${total <= 10 ? 'TODAS da lista (são menos de 10).' : 'as 10 mais relevantes.'}
2. Use o campo "id" e "nome" EXATAMENTE como aparecem na lista.
3. Priorize competências do cargo "${cargoAlvo}".
4. Use descrição do cargo e entregas como critério principal.
5. Use stakeholders e tensões como critério de reforço.
6. Use valores organizacionais como critério de desempate.
7. A justificativa DEVE citar elemento específico do cargo.

LISTA DE COMPETÊNCIAS DISPONÍVEIS (id | nome | pilar | descrição):
${baseTexto}`;
}

function buildUserPrompt(empresa, cargoInfo, valores, contextoPPP) {
  let prompt = `EMPRESA: ${empresa.nome}
SEGMENTO: ${empresa.segmento || 'Não informado'}
CARGO: ${cargoInfo.cargo}
ÁREA: ${cargoInfo.area || 'Não informado'}`;

  if (cargoInfo.descricao) prompt += `\nDESCRIÇÃO DO CARGO: ${cargoInfo.descricao}`;
  if (cargoInfo.entregas) prompt += `\nPRINCIPAIS ENTREGAS: ${cargoInfo.entregas}`;
  if (cargoInfo.stakeholders) prompt += `\nSTAKEHOLDERS: ${cargoInfo.stakeholders}`;
  if (cargoInfo.decisoes) prompt += `\nDECISÕES RECORRENTES: ${cargoInfo.decisoes}`;
  if (cargoInfo.tensoes) prompt += `\nTENSÕES E SITUAÇÕES DIFÍCEIS: ${cargoInfo.tensoes}`;

  prompt += `\nVALORES ORGANIZACIONAIS: ${valores.join(', ')}`;

  if (cargoInfo.contexto_extra) prompt += `\nCONTEXTO CULTURAL DO CARGO: ${cargoInfo.contexto_extra}`;
  if (contextoPPP) prompt += `\n\nCONTEXTO DA EMPRESA:\n${contextoPPP}`;

  return prompt;
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
