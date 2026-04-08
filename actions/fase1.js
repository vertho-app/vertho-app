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

    // Agrupar competências únicas por cod_comp+cargo (descritores viram uma só)
    // IMPORTANTE: mesmo cod_comp pode existir em cargos diferentes, então a chave
    // precisa incluir o cargo para não perder competências na separação por cargo.
    const compMap = {};
    competencias.forEach(c => {
      const codKey = c.cod_comp || c.nome;
      const cargoKey = c.cargo || '_sem_cargo';
      const key = `${codKey}::${cargoKey}`;
      if (!compMap[key]) compMap[key] = { ...c, count: 1 };
      else compMap[key].count++;
    });
    const compsUnicas = Object.values(compMap);

    // 3. Buscar PPP e valores
    const contextoPPP = await buscarContextoPPP(sb, empresaId, empresa.nome);
    const valores = await buscarValores(sb, empresaId, empresa.nome);

    // 4. Agrupar competências por cargo (usar o cargo DA COMPETÊNCIA, não do colaborador)
    const cargoCompsMap = {};
    compsUnicas.forEach(c => {
      const cargo = c.cargo || '_sem_cargo';
      if (!cargoCompsMap[cargo]) cargoCompsMap[cargo] = [];
      cargoCompsMap[cargo].push(c);
    });

    // Buscar dados ricos do cargo (cargos_empresa) — match flexível
    const { data: cargosDetalhados } = await sb.from('cargos_empresa')
      .select('*')
      .eq('empresa_id', empresaId);
    const cargosDetalheMap = {};
    (cargosDetalhados || []).forEach(c => {
      cargosDetalheMap[c.nome.toLowerCase()] = c;
    });

    const cargosParaProcessar = Object.keys(cargoCompsMap).filter(c => c !== '_sem_cargo');
    if (!cargosParaProcessar.length) return { success: false, error: 'Nenhum cargo encontrado nas competências' };

    // 5. Para cada cargo (das competências), pedir à IA que selecione as melhores
    let totalSelecionadas = 0;

    for (const cargoNome of cargosParaProcessar) {
      const compsDoCargo = cargoCompsMap[cargoNome];
      // Buscar dados ricos (match case-insensitive)
      const detalhe = cargosDetalheMap[cargoNome.toLowerCase()] || {};
      const cargoInfo = {
        cargo: cargoNome, area: detalhe.area_depto || '',
        descricao: detalhe.descricao || '', entregas: detalhe.principais_entregas || '',
        stakeholders: detalhe.stakeholders || '', decisoes: detalhe.decisoes_recorrentes || '',
        tensoes: detalhe.tensoes_comuns || '', contexto_extra: detalhe.contexto_cultural || '',
      };

      // Limpar seleção anterior deste cargo
      await sb.from('top10_cargos')
        .delete()
        .eq('empresa_id', empresaId)
        .eq('cargo', cargoNome);

      if (compsDoCargo.length <= 10) {
        // <= 10: selecionar TODAS direto, sem chamar IA
        for (let i = 0; i < compsDoCargo.length; i++) {
          await sb.from('top10_cargos').insert({
            empresa_id: empresaId,
            cargo: cargoNome,
            competencia_id: compsDoCargo[i].id,
            posicao: i + 1,
            justificativa: null,
          });
          totalSelecionadas++;
        }
      } else {
        // > 10: chamar IA para selecionar as 10 melhores
        const system = buildSystemPromptSelecao(compsDoCargo, cargoNome);
        const user = buildUserPrompt(empresa, cargoInfo, valores, contextoPPP);

        const resposta = await callAI(system, user, aiConfig, 4096);
        const resultado = await extractJSON(resposta);

        if (resultado?.top10 && Array.isArray(resultado.top10)) {
          const usedIds = new Set();
          for (let i = 0; i < resultado.top10.length; i++) {
            const sel = resultado.top10[i];
            const selId = (sel.id || sel.cod_comp || '').trim().toLowerCase();
            const selNome = (sel.nome || '').trim().toLowerCase();

            const match = competencias.find(c => !usedIds.has(c.id) && c.cod_comp && selId && c.cod_comp.toLowerCase() === selId)
              || competencias.find(c => !usedIds.has(c.id) && selNome && c.nome.toLowerCase() === selNome)
              || competencias.find(c => !usedIds.has(c.id) && selNome && c.nome.toLowerCase().includes(selNome))
              || competencias.find(c => !usedIds.has(c.id) && selNome && selNome.includes(c.nome.toLowerCase()));

            if (!match) continue;
            usedIds.add(match.id);

            await sb.from('top10_cargos').insert({
              empresa_id: empresaId,
              cargo: cargoNome,
              competencia_id: match.id,
              posicao: i + 1,
              justificativa: sel.justificativa || null,
            });
            totalSelecionadas++;
          }
        }
      }
    }

    return { success: true, message: `IA1 concluída: ${totalSelecionadas} competências selecionadas para ${cargosParaProcessar.length} cargos` };
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

// ── Gabarito CIS (leitura) ───────────────────────────────────────────────────

export async function loadGabaritosCargos(empresaId) {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('cargos_empresa')
    .select('id, nome, gabarito, raciocinio_ia2')
    .eq('empresa_id', empresaId)
    .not('gabarito', 'is', null)
    .order('nome');
  if (error) return [];
  return data || [];
}

export async function loadCenarios(empresaId) {
  const sb = createSupabaseAdmin();
  // Query simples sem join (mais confiável)
  const { data, error } = await sb.from('banco_cenarios')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('cargo');

  if (error) {
    console.error('[loadCenarios] erro:', error.message);
    return [];
  }

  if (!data?.length) return [];

  // Buscar nomes das competências separadamente
  const compIds = [...new Set(data.map(c => c.competencia_id).filter(Boolean))];
  const compMap = {};
  if (compIds.length > 0) {
    const { data: comps } = await sb.from('competencias')
      .select('id, nome, cod_comp')
      .in('id', compIds);
    (comps || []).forEach(c => { compMap[c.id] = c; });
  }

  return data.map(c => ({
    ...c,
    competencia_nome: compMap[c.competencia_id]?.nome || null,
    competencia_cod: compMap[c.competencia_id]?.cod_comp || null,
  }));
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
  const baseTexto = competencias.map(comp =>
    `${comp.cod_comp || comp.id} | ${comp.nome} | ${comp.pilar || ''} | ${comp.descricao || ''}`
  ).join('\n');

  const total = competencias.length;
  const maxSel = Math.min(10, total);

  return `Você é a IA de parametrização da Vertho.
Sua tarefa: SELECIONAR as competências MAIS RELEVANTES para o cargo "${cargoAlvo}" da lista abaixo.

IMPORTANTE:
- Selecione APENAS da lista fornecida — NÃO invente competências.
- A lista tem ${total} competências.
- ${total <= 10 ? `Selecione TODAS as ${total}. Não omita nenhuma.` : `Selecione exatamente 10.`}

Retorne APENAS JSON válido, sem markdown:
{"top10":[{"id":"COD","nome":"Nome exato da lista","justificativa":"Frase específica."},...]}

REGRAS:
1. Selecione exatamente ${maxSel} competências.
2. Use "id" e "nome" EXATAMENTE como aparecem na lista.
3. A justificativa DEVE citar elemento específico do cargo.

LISTA DE COMPETÊNCIAS (${total}):

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

// ── IA2: Gerar gabarito CIS (4 telas comportamentais por cargo) ─────────────
// Fiel ao GAS: gera perfil ideal com pares de opostos, sub-competências DISC,
// estilos de liderança e faixas DISC — tudo contextualizado por cargo + PPP.

const PARES_DISC = [
  'Otimista × Realista (I)', 'Comunicativo × Analista (I)', 'Generalista × Detalhista (D)',
  'Estilo Agressivo × Estilo Consultivo (D)', 'Melhor em Falar × Melhor em Ouvir (I)',
  'Avesso a Rotina × Rotineiro (D)', 'Delega × Centraliza (D)', 'Compreensivo × Imparcial (S)',
  'Casual × Formal (C)', 'Foco em Relacionamentos × Foco nas Tarefas (S)',
  'Orientação a Resultados × Orientação a Processos (D)', 'Emocional × Racional (S)',
  'Dinâmico × Estável (D)', 'Age com Firmeza × Age com Consentimento (D)',
  'Comandante × Conciliador (D)', 'Assume Riscos × Prudente (D)',
  'Objetivo × Sistemático (D)', 'Cria do Zero × Aprimora o que já Existe (I)',
  'Multitarefas × Especialista (I)', 'Inspirador × Técnico (I)',
  'Extrovertido × Introvertido (I)', 'Ousado × Conservador (D)',
  'Age com Velocidade × Age com Planejamento (D)',
];

const SUB_COMPETENCIAS_CIS = [
  { nome: 'Ousadia', dim: 'D' }, { nome: 'Comando', dim: 'D' },
  { nome: 'Objetividade', dim: 'D' }, { nome: 'Assertividade', dim: 'D' },
  { nome: 'Persuasão', dim: 'I' }, { nome: 'Extroversão', dim: 'I' },
  { nome: 'Entusiasmo', dim: 'I' }, { nome: 'Sociabilidade', dim: 'I' },
  { nome: 'Empatia', dim: 'S' }, { nome: 'Paciência', dim: 'S' },
  { nome: 'Persistência', dim: 'S' }, { nome: 'Planejamento', dim: 'S' },
  { nome: 'Organização', dim: 'C' }, { nome: 'Detalhismo', dim: 'C' },
  { nome: 'Prudência', dim: 'C' }, { nome: 'Concentração', dim: 'C' },
];

export async function rodarIA2(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    // 1. Buscar empresa
    let empresa;
    const { data: emp1 } = await sb.from('empresas')
      .select('nome, segmento, ppp_texto').eq('id', empresaId).single();
    empresa = emp1 || (await sb.from('empresas').select('nome, segmento').eq('id', empresaId).single()).data;
    if (!empresa) return { success: false, error: 'Empresa não encontrada' };

    // 2. PPP e valores
    const contextoPPP = await buscarContextoPPP(sb, empresaId, empresa.nome);
    const valores = await buscarValores(sb, empresaId, empresa.nome);

    // 3. Buscar top10 selecionadas por cargo
    const { data: top10All } = await sb.from('top10_cargos')
      .select('cargo, competencia:competencias(nome)')
      .eq('empresa_id', empresaId);

    const top10PorCargo = {};
    (top10All || []).forEach(t => {
      if (!top10PorCargo[t.cargo]) top10PorCargo[t.cargo] = [];
      if (t.competencia?.nome) top10PorCargo[t.cargo].push(t.competencia.nome);
    });

    if (!Object.keys(top10PorCargo).length) {
      return { success: false, error: 'Nenhuma Top 10 selecionada. Rode IA1 primeiro.' };
    }

    // 4. Buscar dados ricos dos cargos
    const { data: cargosDetalhados } = await sb.from('cargos_empresa')
      .select('*').eq('empresa_id', empresaId);
    const cargosDetalheMap = {};
    (cargosDetalhados || []).forEach(c => { cargosDetalheMap[c.nome.toLowerCase()] = c; });

    // 5. Para cada cargo com top10, gerar gabarito CIS
    let totalGerados = 0;

    for (const [cargoNome, compNomes] of Object.entries(top10PorCargo)) {
      const detalhe = cargosDetalheMap[cargoNome.toLowerCase()] || {};

      const system = `Você é um especialista em avaliação comportamental CIS/DISC.
Sua tarefa: gerar o GABARITO COMPORTAMENTAL IDEAL para o cargo descrito.
O gabarito tem 4 telas. Retorne APENAS JSON válido.

HIERARQUIA DE FONTES (ordem de prioridade):
1. DESCRIÇÃO DO CARGO E CONTEXTO DA EMPRESA — fonte primária
2. SINAIS EXPLÍCITOS DO TEXTO — palavras, ênfases no cargo/empresa
3. CONHECIMENTO COMPORTAMENTAL — apenas para refinar, nunca sobrescrever
4. REGRA DE OURO: Nunca use conhecimento genérico para sobrescrever sinais claros do caso.

REGRAS DE DIFERENCIAÇÃO:
- Cargos diferentes DEVEM ter perfis diferentes
- Pelo menos 2 dos 4 fatores DISC devem diferir entre cargos na mesma empresa

TELA 1: Características do perfil ideal (pares de opostos)
- Selecione até 20 características da lista. Cada item = lado esquerdo OU direito do par.
- Pares disponíveis: ${PARES_DISC.join(' | ')}

TELA 2: Sub-competências CIS com faixas ideais
- Selecione 6-10 das 16 disponíveis (NÃO todas):
  ${SUB_COMPETENCIAS_CIS.map(s => `${s.nome} (${s.dim})`).join(', ')}
- Faixas: "Muito baixo (0-20)" | "Baixo (21-40)" | "Alto (41-60)" | "Muito alto (61-80)" | "Extremamente alto (81-100)"

TELA 3: Estilo de Liderança (4 estilos, soma = 100)
- Executor, Motivador, Metódico, Sistemático

TELA 4: Faixas DISC ideais (min e max para D, I, S, C)
- Mesmas faixas da Tela 2

FORMATO JSON:
{
  "gabarito": {
    "tela1": ["Comunicativo", "Orientação a Resultados", ...],
    "tela2": [{"nome":"Empatia","dimensao":"S","faixa_min":"Alto (41-60)","faixa_max":"Muito alto (61-80)"}, ...],
    "tela3": {"executor":10,"motivador":40,"metodico":35,"sistematico":15},
    "tela4": {
      "D":{"min":"Baixo (21-40)","max":"Muito alto (61-80)"},
      "I":{"min":"Alto (41-60)","max":"Extremamente alto (81-100)"},
      "S":{"min":"Alto (41-60)","max":"Muito alto (61-80)"},
      "C":{"min":"Muito baixo (0-20)","max":"Alto (41-60)"}
    }
  },
  "raciocinio_estruturado": {
    "sinais_do_caso": ["sinal 1", "sinal 2"],
    "leitura_principal": "interpretação direta dos sinais",
    "diferenciais_vs_outros_cargos": "como este perfil se diferencia"
  }
}`;

      const user = `EMPRESA: ${empresa.nome} (${empresa.segmento})
CARGO: ${cargoNome}
${detalhe.descricao ? `DESCRIÇÃO DO CARGO: ${detalhe.descricao}` : ''}
${detalhe.principais_entregas ? `ENTREGAS ESPERADAS: ${detalhe.principais_entregas}` : ''}
${detalhe.stakeholders ? `STAKEHOLDERS: ${detalhe.stakeholders}` : ''}
${detalhe.decisoes_recorrentes ? `DECISÕES RECORRENTES: ${detalhe.decisoes_recorrentes}` : ''}
${detalhe.tensoes_comuns ? `TENSÕES: ${detalhe.tensoes_comuns}` : ''}
VALORES: ${valores.join(', ')}
TOP COMPETÊNCIAS SELECIONADAS: ${compNomes.join(', ')}
${contextoPPP ? `\nCONTEXTO DA EMPRESA:\n${contextoPPP.slice(0, 2000)}` : ''}

INSTRUÇÃO:
1. Leia descrição e entregas. Identifique 3-5 SINAIS EXPLÍCITOS.
2. Forme HIPÓTESE-BASE do perfil ANTES de aplicar referência comportamental.
3. Use conhecimento CIS APENAS para refinar.
4. Garanta que este perfil é DIFERENTE dos outros cargos desta empresa.
5. Tela 3: soma DEVE ser exatamente 100.`;

      const resposta = await callAI(system, user, aiConfig, 6000);
      const resultado = await extractJSON(resposta);

      if (resultado?.gabarito) {
        // Salvar no cargos_empresa se existir, senão criar
        if (detalhe.id) {
          await sb.from('cargos_empresa')
            .update({ gabarito: resultado.gabarito, raciocinio_ia2: resultado.raciocinio_estruturado || null })
            .eq('id', detalhe.id);
        } else {
          await sb.from('cargos_empresa').upsert({
            empresa_id: empresaId,
            nome: cargoNome,
            gabarito: resultado.gabarito,
            raciocinio_ia2: resultado.raciocinio_estruturado || null,
          }, { onConflict: 'empresa_id,nome' });
        }
        totalGerados++;
      }
    }

    return { success: true, message: `IA2 concluída: ${totalGerados} gabaritos CIS gerados` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── IA3: Gerar cenários contextuais (fiel ao GAS) ───────────────────────────
// 1 cenário + 4 perguntas abertas por competência × cargo
// Processamento unitário (1 competência por chamada) para caber no timeout do Vercel Hobby

// Lista competências pendentes para gerar cenário
export async function listarFilaIA3(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    const { data: top10All } = await sb.from('top10_cargos')
      .select('cargo, competencia_id, competencia:competencias(id, nome, cod_comp)')
      .eq('empresa_id', empresaId)
      .order('cargo')
      .order('posicao');

    if (!top10All?.length) return { success: false, error: 'Nenhuma Top 10 selecionada. Rode IA1 primeiro.' };

    // Verificar quais já têm cenário
    const { data: existentes } = await sb.from('banco_cenarios')
      .select('competencia_id, cargo')
      .eq('empresa_id', empresaId);
    const existSet = new Set((existentes || []).map(e => `${e.competencia_id}::${e.cargo}`));

    const fila = top10All.map(t => ({
      cargo: t.cargo,
      competencia_id: t.competencia_id,
      nome: t.competencia?.nome || '—',
      cod_comp: t.competencia?.cod_comp || '',
      jaGerado: existSet.has(`${t.competencia_id}::${t.cargo}`),
    }));

    return { success: true, data: fila };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Gera cenário para UMA competência (cabe em 60s)
export async function rodarIA3Uma(empresaId, cargoNome, competenciaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    // Empresa
    let empresa;
    const { data: emp1 } = await sb.from('empresas')
      .select('nome, segmento, ppp_texto').eq('id', empresaId).single();
    empresa = emp1 || (await sb.from('empresas').select('nome, segmento').eq('id', empresaId).single()).data;
    if (!empresa) return { success: false, error: 'Empresa não encontrada' };

    // Competência
    const { data: comp } = await sb.from('competencias')
      .select('id, nome, cod_comp, pilar, descricao, cargo')
      .eq('id', competenciaId).single();
    if (!comp) return { success: false, error: 'Competência não encontrada' };

    // Descritores
    const { data: descritores } = await sb.from('competencias')
      .select('cod_desc, nome_curto, descritor_completo, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia')
      .eq('empresa_id', empresaId)
      .eq('cod_comp', comp.cod_comp)
      .not('cod_desc', 'is', null);

    // PPP, valores
    const contextoPPP = await buscarContextoPPP(sb, empresaId, empresa.nome);
    const valores = await buscarValores(sb, empresaId, empresa.nome);

    // Dados do cargo + gabarito CIS
    const { data: cargoEmp } = await sb.from('cargos_empresa')
      .select('gabarito, descricao, principais_entregas, stakeholders, decisoes_recorrentes, tensoes_comuns')
      .eq('empresa_id', empresaId)
      .eq('nome', cargoNome)
      .maybeSingle();

    const cargoDetalhe = cargoEmp || {};
    const gabCIS = cargoDetalhe.gabarito ? (typeof cargoDetalhe.gabarito === 'string' ? JSON.parse(cargoDetalhe.gabarito) : cargoDetalhe.gabarito) : null;

    // Gerar
    const system = buildIA3SystemPrompt();
    const user = buildIA3UserPrompt(empresa, cargoNome, cargoDetalhe, comp, descritores || [], valores, contextoPPP, gabCIS);

    const resposta = await callAI(system, user, aiConfig, 8000);
    const resultado = await extractJSON(resposta);

    if (!resultado?.cenario) return { success: false, error: 'IA não retornou cenário válido' };

    // Salvar (limpa anterior)
    await sb.from('banco_cenarios')
      .delete()
      .eq('empresa_id', empresaId)
      .eq('competencia_id', comp.id)
      .eq('cargo', cargoNome);

    const { error: insertErr } = await sb.from('banco_cenarios').insert({
      empresa_id: empresaId,
      competencia_id: comp.id,
      cargo: cargoNome,
      titulo: resultado.cenario.titulo,
      descricao: resultado.cenario.contexto,
      alternativas: resultado.perguntas || [],
    });

    if (insertErr) return { success: false, error: `Erro ao salvar: ${insertErr.message}` };
    return { success: true, message: `Cenário gerado: ${comp.nome}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Wrapper que o pipeline chama — retorna a fila para o frontend processar
export async function rodarIA3(empresaId, aiConfig = {}) {
  return listarFilaIA3(empresaId);
}

function buildIA3SystemPrompt() {
  return `Você é um especialista com 20 anos em avaliação de competências em organizações brasileiras.
Especialidade: criar cenários situacionais como instrumentos diagnósticos.
Os cenários funcionam como "radiografia" — a resposta revela naturalmente o nível de maturidade.

TAREFA: Crie UM cenário situacional + 4 perguntas temáticas para a competência descrita.

REGRAS DE CONSTRUÇÃO:
1. ESTRUTURA DO CENÁRIO
   - Contexto: 250-400 palavras, personagens nomeados, situação-gatilho
   - 1 tensão central + 1 complicador (máx 2 tensões)
   - Máx 2 stakeholders nomeados
   - 1 dado concreto (número, prazo, %)
   - Teste: 10 segundos para entender o problema

2. REALISMO CONTEXTUAL
   - Use APENAS elementos do contexto da empresa/escola fornecido
   - Vocabulário e siglas da organização
   - Nomes brasileiros para personagens

3. DECISÃO FORÇADA (REGRA DE OURO)
   - Se pode responder SEM ABRIR MÃO DE NADA → cenário NÃO funciona
   - P1: ESCOLHA — cenário de decisão com trade-off real
   - P2: COMO — execução sabendo que haverá resistência
   - P3: TENSÃO HUMANA — lidar com pessoa que resiste/sofre
   - P4: SUSTENTABILIDADE — como saber que funcionou

4. COBERTURA DE DESCRITORES
   - Cada pergunta deve cobrir 2-3 descritores como foco primário
   - As 4 perguntas JUNTAS devem cobrir TODOS os descritores fornecidos
   - Para cada pergunta, indique o que diferencia N1/N2/N3/N4

5. DILEMA ÉTICO EMBUTIDO
   - O cenário DEVE conter pelo menos 1 situação onde o caminho mais fácil entra em conflito com um valor organizacional
   - NÃO explicitar o dilema — ele deve emergir NATURALMENTE

6. LIMITES
   - Contexto: máx 900 caracteres
   - Cada pergunta: máx 200 caracteres
   - Perguntas ABERTAS (não múltipla escolha)

Retorne APENAS JSON válido:
{
  "cenario": {"titulo":"...","contexto":"... (250-400 palavras)"},
  "perguntas": [
    {"numero":1,"texto":"...","descritores_primarios":[1,2],"o_que_diferencia_niveis":"N1:... | N2:... | N3:... | N4:..."},
    {"numero":2,"texto":"...","descritores_primarios":[3,4],"o_que_diferencia_niveis":"N1:... | N2:... | N3:... | N4:..."},
    {"numero":3,"texto":"...","descritores_primarios":[5,6],"o_que_diferencia_niveis":"N1:... | N2:... | N3:... | N4:..."},
    {"numero":4,"texto":"...","descritores_primarios":[1,3,5],"o_que_diferencia_niveis":"N1:... | N2:... | N3:... | N4:..."}
  ],
  "dilema_etico": {"valor_testado":"...","caminho_facil":"...","caminho_etico":"..."}
}`;
}

function buildIA3UserPrompt(empresa, cargoNome, cargoDetalhe, comp, descritores, valores, contextoPPP, gabCIS) {
  let prompt = `EMPRESA: ${empresa.nome} (${empresa.segmento})
CARGO: ${cargoNome}`;

  if (cargoDetalhe.descricao) prompt += `\nDESCRIÇÃO DO CARGO: ${cargoDetalhe.descricao}`;
  if (cargoDetalhe.principais_entregas) prompt += `\nENTREGAS: ${cargoDetalhe.principais_entregas}`;
  if (cargoDetalhe.stakeholders) prompt += `\nSTAKEHOLDERS: ${cargoDetalhe.stakeholders}`;
  if (cargoDetalhe.tensoes_comuns) prompt += `\nTENSÕES: ${cargoDetalhe.tensoes_comuns}`;

  prompt += `\n\nCOMPETÊNCIA: ${comp.cod_comp} — ${comp.nome}`;
  if (comp.descricao) prompt += `\nDescrição: ${comp.descricao}`;

  // Descritores com níveis N1-N4
  if (descritores.length > 0) {
    prompt += `\n\nDESCRITORES (${descritores.length}):`;
    descritores.forEach((d, i) => {
      prompt += `\nD${i + 1}: ${d.cod_desc} — ${d.nome_curto || d.descritor_completo || ''}`;
      if (d.n1_gap) prompt += `\n  N1 (Gap): ${d.n1_gap}`;
      if (d.n3_meta) prompt += `\n  N3 (Meta): ${d.n3_meta}`;
    });
    prompt += `\nREGRA: Cada pergunta cobre >=2 descritores. As 4 perguntas cobrem TODOS os ${descritores.length}.`;
  }

  prompt += `\n\nVALORES ORGANIZACIONAIS: ${valores.join(', ')}`;
  prompt += `\nREGRA DE VALORES: O cenário DEVE conter pelo menos 1 dilema onde o caminho mais fácil conflita com um valor acima.`;

  if (gabCIS) {
    prompt += `\n\nPERFIL CIS IDEAL DO CARGO:`;
    if (gabCIS.tela4) {
      prompt += `\n  D: ${gabCIS.tela4.D?.min} → ${gabCIS.tela4.D?.max}`;
      prompt += `\n  I: ${gabCIS.tela4.I?.min} → ${gabCIS.tela4.I?.max}`;
      prompt += `\n  S: ${gabCIS.tela4.S?.min} → ${gabCIS.tela4.S?.max}`;
      prompt += `\n  C: ${gabCIS.tela4.C?.min} → ${gabCIS.tela4.C?.max}`;
    }
    if (gabCIS.tela3) {
      prompt += `\n  Estilos: Executor ${gabCIS.tela3.executor}% | Motivador ${gabCIS.tela3.motivador}% | Metódico ${gabCIS.tela3.metodico}% | Sistemático ${gabCIS.tela3.sistematico}%`;
    }
    prompt += `\nUse o perfil para escolher o TIPO de gatilho que revela pontos cegos deste perfil.`;
  }

  if (contextoPPP) prompt += `\n\nCONTEXTO DA EMPRESA:\n${contextoPPP.slice(0, 3000)}`;

  return prompt;
}

