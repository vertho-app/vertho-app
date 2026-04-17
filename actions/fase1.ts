'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { callAI, type AIConfig } from './ai-client';
import { extractJSON } from './utils';

// ── IA1: Selecionar top 10 competências por cargo ───────────────────────────
// Seleciona das competências JÁ CADASTRADAS na empresa (tabela competencias).
// Resultado salvo em top10_cargos para validação humana.

export async function rodarIA1(empresaId: string, aiConfig: AIConfig = {}) {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const sbRaw = createSupabaseAdmin();
  const tdb = tenantDb(empresaId);
  try {
    // 1. Buscar empresa (id é tenant — usar raw)
    let empresa;
    const { data: emp1 } = await sbRaw.from('empresas')
      .select('nome, segmento, ppp_texto')
      .eq('id', empresaId).single();
    if (emp1) {
      empresa = emp1;
    } else {
      const { data: emp2 } = await sbRaw.from('empresas')
        .select('nome, segmento')
        .eq('id', empresaId).single();
      empresa = emp2;
    }
    if (!empresa) return { success: false, error: `Empresa não encontrada (id: ${empresaId})` };

    // 2. Buscar competências da empresa (catálogo completo)
    const { data: competencias } = await tdb.from('competencias')
      .select('id, nome, descricao, cod_comp, pilar, cargo');

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

    // 3. Buscar PPP e valores (helpers usam tdb)
    const contextoPPP = await buscarContextoPPP(tdb, empresa.nome);
    const valores = await buscarValores(tdb, empresa.nome);

    // 4. Agrupar competências por cargo (usar o cargo DA COMPETÊNCIA, não do colaborador)
    const cargoCompsMap: Record<string, any[]> = {};
    compsUnicas.forEach((c: any) => {
      const cargo = c.cargo || '_sem_cargo';
      if (!cargoCompsMap[cargo]) cargoCompsMap[cargo] = [];
      cargoCompsMap[cargo].push(c);
    });

    // Buscar dados ricos do cargo (cargos_empresa) — match flexível
    const { data: cargosDetalhados } = await tdb.from('cargos_empresa')
      .select('*');
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
      await tdb.from('top10_cargos')
        .delete()
        .eq('cargo', cargoNome);

      if (compsDoCargo.length <= 10) {
        // <= 10: selecionar TODAS direto, sem chamar IA
        // empresa_id é injetado pelo tdb.insert
        for (let i = 0; i < compsDoCargo.length; i++) {
          await tdb.from('top10_cargos').insert({
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

        const resposta = await callAI(system, user, aiConfig, 8192);
        let resultado = await extractJSON(resposta);

        if (resultado?.top10 && Array.isArray(resultado.top10)) {
          // Validação pós-resposta
          const validIds = new Set(competencias.map((c: any) => (c.cod_comp || c.id || '').toLowerCase()));
          const validNomes = new Set(competencias.map((c: any) => c.nome.toLowerCase()));

          // Filtrar top10 válidos
          const top10Valid = (resultado.top10 || []).filter((sel: any) => {
            const selId = (sel.id || '').trim().toLowerCase();
            const selNome = (sel.nome || '').trim().toLowerCase();
            if (!selId && !selNome) return false;
            if (typeof sel.confianca === 'number' && (sel.confianca < 0 || sel.confianca > 1)) return false;
            return true;
          });

          // Se menos de 7 válidos (de 10), fazer retry
          if (top10Valid.length < Math.min(7, compsDoCargo.length)) {
            console.warn(`[IA1] ${cargoNome}: só ${top10Valid.length} válidos. Retry.`);
            const retry = await callAI(system, user + '\n\nATENÇÃO: sua resposta anterior não tinha competências suficientes da lista. Use EXATAMENTE os IDs/nomes da lista fornecida.', aiConfig, 8192);
            const retryResult = await extractJSON(retry);
            if (retryResult?.top10?.length > top10Valid.length) {
              resultado.top10 = retryResult.top10;
            }
          }

          // Persistir top10
          const usedIds = new Set();
          for (let i = 0; i < (resultado.top10 || []).length; i++) {
            const sel = resultado.top10[i];
            const selId = (sel.id || sel.cod_comp || '').trim().toLowerCase();
            const selNome = (sel.nome || '').trim().toLowerCase();

            const match = competencias.find((c: any) => !usedIds.has(c.id) && c.cod_comp && selId && c.cod_comp.toLowerCase() === selId)
              || competencias.find((c: any) => !usedIds.has(c.id) && selNome && c.nome.toLowerCase() === selNome)
              || competencias.find((c: any) => !usedIds.has(c.id) && selNome && c.nome.toLowerCase().includes(selNome))
              || competencias.find((c: any) => !usedIds.has(c.id) && selNome && selNome.includes(c.nome.toLowerCase()));

            if (!match) continue;
            usedIds.add(match.id);

            await tdb.from('top10_cargos').insert({
              cargo: cargoNome,
              competencia_id: match.id,
              posicao: sel.posicao || i + 1,
              justificativa: sel.justificativa || null,
              confianca: typeof sel.confianca === 'number' ? Math.max(0, Math.min(1, sel.confianca)) : null,
              evidencias: Array.isArray(sel.evidencias_do_caso) ? sel.evidencias_do_caso : [],
              papel_na_cobertura: sel.papel_na_cobertura || null,
            });
            totalSelecionadas++;
          }

          // Persistir resumo do cargo (quase_entrou + resumo_executivo)
          if (resultado.quase_entrou || resultado.resumo_executivo) {
            await tdb.from('cargos_empresa').update({
              ia1_resultado: {
                quase_entrou: resultado.quase_entrou || [],
                resumo_executivo: resultado.resumo_executivo || {},
                gerado_em: new Date().toISOString(),
              },
            }).eq('nome', cargoNome);
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

export async function loadTop10(empresaId: string, cargo: string) {
  if (!empresaId) return [];
  const tdb = tenantDb(empresaId);
  const { data } = await tdb.from('top10_cargos')
    .select('*, competencia:competencias(id, nome, cod_comp, pilar, descricao)')
    .eq('cargo', cargo)
    .order('posicao');
  return data || [];
}

export async function loadTop10TodosCargos(empresaId: string) {
  if (!empresaId) return [];
  const tdb = tenantDb(empresaId);
  const { data } = await tdb.from('top10_cargos')
    .select('*, competencia:competencias(id, nome, cod_comp, pilar, descricao)')
    .order('cargo')
    .order('posicao');
  return data || [];
}

export async function adicionarTop10(empresaId: string, cargo: string, competenciaId: string) {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  // Pegar próxima posição
  const { data: existentes } = await tdb.from('top10_cargos')
    .select('posicao')
    .eq('cargo', cargo)
    .order('posicao', { ascending: false })
    .limit(1);
  const proxPosicao = (existentes?.[0]?.posicao || 0) + 1;

  // empresa_id é injetado pelo tdb.insert
  const { error } = await tdb.from('top10_cargos').insert({
    cargo,
    competencia_id: competenciaId,
    posicao: proxPosicao,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function removerTop10(id: string) {
  // Não recebe empresaId. Descobre via raw + valida tenant pra defesa em profundidade.
  const sbRaw = createSupabaseAdmin();
  const { data: row } = await sbRaw.from('top10_cargos').select('empresa_id').eq('id', id).maybeSingle();
  if (!row) return { success: false, error: 'Não encontrado' };
  const tdb = tenantDb(row.empresa_id);
  const { error } = await tdb.from('top10_cargos').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ── Gabarito CIS (leitura) ───────────────────────────────────────────────────

export async function loadGabaritosCargos(empresaId: string) {
  if (!empresaId) return [];
  const tdb = tenantDb(empresaId);
  const { data, error } = await tdb.from('cargos_empresa')
    .select('id, nome, gabarito, raciocinio_ia2')
    .not('gabarito', 'is', null)
    .order('nome');
  if (error) return [];
  return data || [];
}

export async function loadCenarios(empresaId: string) {
  if (!empresaId) return [];
  const tdb = tenantDb(empresaId);
  // Listar colunas explicitamente para garantir que check fields vêm
  const { data, error } = await tdb.from('banco_cenarios')
    .select('id, empresa_id, competencia_id, cargo, titulo, descricao, alternativas, created_at, nota_check, status_check, dimensoes_check, justificativa_check, sugestao_check, alertas_check, checked_at')
    .order('cargo');

  if (error || !data?.length) return [];

  const compIds = [...new Set(data.map(c => c.competencia_id).filter(Boolean))];
  const compMap = {};
  if (compIds.length > 0) {
    const { data: comps } = await tdb.from('competencias')
      .select('id, nome, cod_comp')
      .in('id', compIds);
    (comps || []).forEach(c => { compMap[c.id] = c; });
  }

  return data.map(c => ({
    id: c.id,
    empresa_id: c.empresa_id,
    competencia_id: c.competencia_id,
    cargo: c.cargo,
    titulo: c.titulo,
    descricao: c.descricao,
    alternativas: c.alternativas,
    nota_check: c.nota_check,
    status_check: c.status_check,
    dimensoes_check: c.dimensoes_check,
    justificativa_check: c.justificativa_check,
    sugestao_check: c.sugestao_check,
    alertas_check: c.alertas_check,
    competencia_nome: compMap[c.competencia_id]?.nome || null,
    competencia_cod: compMap[c.competencia_id]?.cod_comp || null,
  }));
}

// Limpar cenários que não estão no Top 5
export async function limparCenariosAntigos(empresaId: string) {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    const top5 = await getTop5PorCargo(tdb);
    if (!Object.keys(top5).length) return { success: false, error: 'Nenhum Top 5 definido' };

    // Buscar todos cenários (filtra automaticamente por tenant)
    const { data: todos } = await tdb.from('banco_cenarios')
      .select('id, cargo, competencia_id');

    // Buscar nomes das competências
    const compIds = [...new Set((todos || []).map(c => c.competencia_id).filter(Boolean))];
    const compMap = {};
    if (compIds.length) {
      const { data: comps } = await tdb.from('competencias').select('id, nome').in('id', compIds);
      (comps || []).forEach(c => { compMap[c.id] = c.nome; });
    }

    // Identificar os que NÃO estão no Top 5
    const paraRemover = (todos || []).filter(c => {
      const t5 = top5[c.cargo];
      if (!t5) return true; // cargo sem top5 → remover
      const nome = compMap[c.competencia_id];
      return !nome || !t5.includes(nome);
    });

    if (!paraRemover.length) return { success: true, message: 'Nenhum cenário antigo para limpar' };

    const { error } = await tdb.from('banco_cenarios')
      .delete()
      .in('id', paraRemover.map(c => c.id));
    if (error) return { success: false, error: error.message };

    return { success: true, message: `${paraRemover.length} cenários antigos removidos` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Helper Top 5 ────────────────────────────────────────────────────────────

async function getTop5PorCargo(tdb) {
  const { data } = await tdb.from('cargos_empresa')
    .select('nome, top5_workshop');
  const result = {};
  (data || []).forEach(c => {
    if (c.top5_workshop && Array.isArray(c.top5_workshop) && c.top5_workshop.length > 0) {
      result[c.nome] = c.top5_workshop;
    }
  });
  return result;
}

// ── Helpers IA1 ─────────────────────────────────────────────────────────────

async function buscarContextoPPP(tdb, empresaNome) {
  try {
    // Buscar extração do PPP salva (recebe tdb tenant-scoped)
    const { data: ppp } = await tdb.from('ppp_escolas')
      .select('extracao')
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

async function buscarValores(tdb, empresaNome) {
  try {
    const { data: ppp } = await tdb.from('ppp_escolas')
      .select('valores')
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

function buildSystemPromptSelecao(competencias: any[], cargoAlvo: string): string {
  const total = competencias.length;
  const maxSel = Math.min(10, total);

  const listaComps = competencias.map((c: any) =>
    `- ID: ${c.cod_comp || c.id} | NOME: ${c.nome} | PILAR: ${c.pilar || '—'} | DESCRIÇÃO: ${c.descricao || '—'}`
  ).join('\n');

  return `Você é a IA de parametrização da plataforma Vertho Mentor IA.

TAREFA: Selecionar as ${maxSel} competências MAIS RELEVANTES para o cargo "${cargoAlvo}" da lista fornecida.

═══ REGRAS INVIOLÁVEIS ═══

1. SELECIONE APENAS DA LISTA FORNECIDA. NÃO invente competências.
2. Selecione EXATAMENTE ${maxSel} competências (nem mais, nem menos).
3. Use "id" e "nome" EXATAMENTE como aparecem na lista.
4. Cada competência selecionada deve ser ÚNICA (sem duplicatas).

═══ CRITÉRIOS DE PRIORIZAÇÃO ═══

Hierarquia de fontes (da mais forte pra mais fraca):
1. ENTREGAS E DECISÕES RECORRENTES do cargo (fonte primária)
2. TENSÕES E SITUAÇÕES DIFÍCEIS do cargo (revela gaps críticos)
3. STAKEHOLDERS e contexto relacional (competências interpessoais)
4. PPP / DOSSIÊ CORPORATIVO (valores e cultura)
5. SEGMENTO DA EMPRESA (contexto setorial)

Critérios de seleção:
- IMPACTO NO SUCESSO: priorize competências que diferenciam desempenho bom de excelente no cargo
- PODER DISCRIMINANTE: priorize competências que geram respostas observavelmente diferentes entre níveis 1-4
- COBERTURA: garanta que os pilares mais relevantes do cargo estejam representados
- ANTI-REDUNDÂNCIA: evite 2+ competências que avaliem essencialmente o mesmo comportamento

PROIBIDO:
- Justificativas genéricas ("importante para qualquer profissional", "essencial no mercado")
- Selecionar por popularidade em vez de relevância para o cargo específico
- Ignorar tensões/dilemas do cargo em favor de competências "seguras"

═══ FORMATO DE SAÍDA ═══

Retorne APENAS JSON válido (sem markdown, sem texto antes/depois):

{
  "top10": [
    {
      "id": "COD_COMP exato da lista",
      "nome": "Nome exato da lista",
      "posicao": 1,
      "confianca": 0.92,
      "justificativa": "Frase que cita elemento específico do cargo/contexto.",
      "evidencias_do_caso": ["elemento 1 do contexto", "elemento 2"],
      "papel_na_cobertura": "O que esta competência cobre que as outras não cobrem"
    }
  ],
  "quase_entrou": [
    {
      "id": "COD",
      "nome": "Nome",
      "motivo_exclusao": "Por que ficou de fora apesar de relevante"
    }
  ],
  "resumo_executivo": {
    "leitura_do_cargo": "2-3 frases: como a IA leu o perfil de exigências do cargo",
    "riscos_de_omissao": "O que pode ser perdido com esta seleção (1-2 frases honestas)",
    "cobertura_da_selecao": "Quais pilares/dimensões ficaram cobertos e quais não (1-2 frases)"
  }
}

REGRAS DO JSON:
- confianca: número entre 0.0 e 1.0 (0.7+ = alta confiança)
- evidencias_do_caso: 1 a 3 itens curtos extraídos do contexto fornecido
- quase_entrou: 2 a 3 competências que ficaram no limite
- posicao: 1 a ${maxSel} (ordem de prioridade)

═══ LISTA DE COMPETÊNCIAS DISPONÍVEIS (${total}) ═══

${listaComps}`;
}

function buildUserPrompt(empresa: any, cargoInfo: any, valores: string[], contextoPPP: string): string {
  const blocks: string[] = [];

  blocks.push(`═══ EMPRESA ═══
Nome: ${empresa.nome}
Segmento: ${empresa.segmento || 'Não informado'}`);

  blocks.push(`═══ CARGO-ALVO ═══
Cargo: ${cargoInfo.cargo}
Área: ${cargoInfo.area || 'Não informado'}`);

  if (cargoInfo.descricao || cargoInfo.entregas || cargoInfo.stakeholders || cargoInfo.decisoes || cargoInfo.tensoes) {
    let ctx = '═══ CONTEXTO ORGANIZACIONAL ═══';
    if (cargoInfo.descricao) ctx += `\nDescrição do cargo: ${cargoInfo.descricao}`;
    if (cargoInfo.entregas) ctx += `\nPrincipais entregas esperadas: ${cargoInfo.entregas}`;
    if (cargoInfo.stakeholders) ctx += `\nStakeholders: ${cargoInfo.stakeholders}`;
    if (cargoInfo.decisoes) ctx += `\nDecisões recorrentes: ${cargoInfo.decisoes}`;
    if (cargoInfo.tensoes) ctx += `\nTensões e situações difíceis: ${cargoInfo.tensoes}`;
    blocks.push(ctx);
  }

  if (contextoPPP) {
    blocks.push(`═══ CONTEXTO PPP / DOSSIÊ CORPORATIVO ═══\n${contextoPPP}`);
  }

  if (cargoInfo.contexto_extra) {
    blocks.push(`═══ CONTEXTO CULTURAL DO CARGO ═══\n${cargoInfo.contexto_extra}`);
  }

  blocks.push(`═══ VALORES ORGANIZACIONAIS ═══\n${valores.join(', ')}`);

  blocks.push(`═══ INSTRUÇÃO DE LEITURA ═══
1. Leia a descrição do cargo e as entregas. Identifique 3-5 SINAIS EXPLÍCITOS do que o cargo exige.
2. Cruze esses sinais com as tensões/decisões — elas revelam onde competências são TESTADAS no dia a dia.
3. Verifique se PPP/valores introduzem alguma exigência adicional (ex: cultura de transparência → comunicação).
4. Selecione priorizando IMPACTO + PODER DISCRIMINANTE + COBERTURA, nessa ordem.
5. Na dúvida entre duas competências parecidas, escolha a que gera comportamentos mais observáveis.`);

  return blocks.join('\n\n');
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

export async function rodarIA2(empresaId: string, aiConfig: AIConfig = {}) {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const sbRaw = createSupabaseAdmin();
  const tdb = tenantDb(empresaId);
  try {
    // 1. Buscar empresa (id é tenant — raw)
    let empresa;
    const { data: emp1 } = await sbRaw.from('empresas')
      .select('nome, segmento, ppp_texto').eq('id', empresaId).single();
    empresa = emp1 || (await sbRaw.from('empresas').select('nome, segmento').eq('id', empresaId).single()).data;
    if (!empresa) return { success: false, error: 'Empresa não encontrada' };

    // 2. PPP e valores
    const contextoPPP = await buscarContextoPPP(tdb, empresa.nome);
    const valores = await buscarValores(tdb, empresa.nome);

    // 3. Buscar top10 selecionadas por cargo
    const { data: top10All } = await tdb.from('top10_cargos')
      .select('cargo, competencia:competencias(nome)');

    const top10PorCargo: Record<string, string[]> = {};
    (top10All || []).forEach(t => {
      if (!top10PorCargo[t.cargo]) top10PorCargo[t.cargo] = [];
      if (t.competencia?.nome) top10PorCargo[t.cargo].push(t.competencia.nome);
    });

    if (!Object.keys(top10PorCargo).length) {
      return { success: false, error: 'Nenhuma Top 10 selecionada. Rode IA1 primeiro.' };
    }

    // 4. Buscar dados ricos dos cargos
    const { data: cargosDetalhados } = await tdb.from('cargos_empresa')
      .select('*');
    const cargosDetalheMap = {};
    (cargosDetalhados || []).forEach(c => { cargosDetalheMap[c.nome.toLowerCase()] = c; });

    // 5. Para cada cargo com top10, gerar gabarito CIS
    let totalGerados = 0;
    const NOMES_SUBCOMPS = new Set(SUB_COMPETENCIAS_CIS.map(s => s.nome));
    const FAIXAS_VALIDAS = ['Muito baixo (0-20)', 'Baixo (21-40)', 'Alto (41-60)', 'Muito alto (61-80)', 'Extremamente alto (81-100)'];

    for (const [cargoNome, compNomes] of Object.entries(top10PorCargo)) {
      const detalhe = cargosDetalheMap[cargoNome.toLowerCase()] || {};

      const system = `Você é um especialista em avaliação comportamental CIS/DISC com 20 anos de experiência.

TAREFA: Gerar o GABARITO COMPORTAMENTAL IDEAL para o cargo descrito.
O gabarito alimenta o assessment de competências (IA3) e o Fit v2 da Vertho.
Ele deve ser prudente, defensável e auditável.

═══ SEQUÊNCIA LÓGICA OBRIGATÓRIA ═══

Antes de montar as 4 telas, siga esta ordem mental:
1. SINAIS: Identifique 3-5 sinais explícitos do cargo (entregas, tensões, stakeholders)
2. HIPÓTESE-BASE: Forme uma leitura inicial do perfil comportamental ideal
3. INCERTEZAS: Declare onde faltam sinais ou onde há ambiguidade
4. TRADUÇÃO: Só então traduza a hipótese nas 4 telas

═══ HIERARQUIA DE FONTES ═══

1. Descrição do cargo, entregas, decisões, stakeholders, tensões (PRIMÁRIA)
2. Valores e contexto organizacional
3. Competências priorizadas pela IA1
4. Contexto PPP / dossiê institucional
5. Conhecimento comportamental geral (APENAS para refinar, NUNCA para sobrescrever sinais)

═══ REGRAS DE PRUDÊNCIA ═══

- NÃO gere perfis extremos sem evidência clara (ex: D=90 só porque "é gestor")
- Se faltar evidência para um fator, use intensidade MODERADA, não alta
- NÃO "feche demais" o perfil — incerteza é informação válida
- Cargos genéricos NÃO devem virar perfis artificialmente extremos
- Cargos diferentes na mesma empresa DEVEM ter perfis diferentes
- As 4 telas DEVEM ser coerentes entre si (ex: se tela1 indica perfil analítico, tela4 não pode ter C muito baixo sem justificativa)

═══ 4 TELAS DO GABARITO ═══

TELA 1 — Características do perfil ideal (pares de opostos)
Selecione até 20 da lista. Cada item = um polo do par:
${PARES_DISC.join(' | ')}

TELA 2 — Sub-competências CIS (6 a 10 das 16 disponíveis, NÃO todas)
${SUB_COMPETENCIAS_CIS.map(s => `${s.nome} (${s.dim})`).join(', ')}
Faixas: "Muito baixo (0-20)" | "Baixo (21-40)" | "Alto (41-60)" | "Muito alto (61-80)" | "Extremamente alto (81-100)"

TELA 3 — Estilos de Liderança (soma EXATA = 100)
Executor, Motivador, Metódico, Sistemático

TELA 4 — Faixas DISC ideais (min e max pra D, I, S, C)
Mesmas faixas da Tela 2. min <= max sempre.

═══ FORMATO JSON (APENAS JSON, sem markdown) ═══

{
  "gabarito": {
    "tela1": {
      "caracteristicas": ["Comunicativo", "Orientação a Resultados"],
      "confianca": 0.85
    },
    "tela2": {
      "subcompetencias": [
        {"nome": "Empatia", "dimensao": "S", "prioridade": "alta", "faixa_min": "Alto (41-60)", "faixa_max": "Muito alto (61-80)", "justificativa": "Cargo exige..."}
      ],
      "confianca": 0.78
    },
    "tela3": {
      "executor": 10, "motivador": 40, "metodico": 35, "sistematico": 15,
      "estilo_predominante": "Motivador",
      "justificativa": "Entregas do cargo indicam...",
      "confianca": 0.82
    },
    "tela4": {
      "D": {"min": "Baixo (21-40)", "max": "Muito alto (61-80)"},
      "I": {"min": "Alto (41-60)", "max": "Extremamente alto (81-100)"},
      "S": {"min": "Alto (41-60)", "max": "Muito alto (61-80)"},
      "C": {"min": "Muito baixo (0-20)", "max": "Alto (41-60)"},
      "justificativa": "Perfil relacional com...",
      "confianca": 0.75
    }
  },
  "raciocinio_estruturado": {
    "sinais_do_caso": ["sinal 1 do contexto", "sinal 2"],
    "hipotese_base": "Leitura inicial do perfil ideal antes de traduzir nas telas",
    "incertezas": "O que faltou de informação ou onde houve ambiguidade",
    "diferenciais_vs_outros_cargos": "Como este perfil se diferencia de cargos similares"
  }
}

REGRAS DO JSON:
- confianca: 0.0 a 1.0 por tela (0.7+ = boa sustentação)
- tela2: 6 a 10 subcompetências, apenas nomes da lista oficial
- tela3: executor + motivador + metodico + sistematico = EXATAMENTE 100
- tela4: min <= max pra cada fator DISC
- raciocinio_estruturado: obrigatório (auditoria humana lê isso)`;

      // ── User prompt estruturado ──
      const userBlocks: string[] = [];

      userBlocks.push(`═══ EMPRESA ═══
Nome: ${empresa.nome}
Segmento: ${empresa.segmento || 'Não informado'}`);

      userBlocks.push(`═══ CARGO-ALVO ═══
Cargo: ${cargoNome}`);

      if (detalhe.descricao || detalhe.principais_entregas || detalhe.stakeholders || detalhe.decisoes_recorrentes || detalhe.tensoes_comuns) {
        let ctx = '═══ CONTEXTO ORGANIZACIONAL ═══';
        if (detalhe.descricao) ctx += `\nDescrição do cargo: ${detalhe.descricao}`;
        if (detalhe.principais_entregas) ctx += `\nPrincipais entregas: ${detalhe.principais_entregas}`;
        if (detalhe.stakeholders) ctx += `\nStakeholders: ${detalhe.stakeholders}`;
        if (detalhe.decisoes_recorrentes) ctx += `\nDecisões recorrentes: ${detalhe.decisoes_recorrentes}`;
        if (detalhe.tensoes_comuns) ctx += `\nTensões e situações difíceis: ${detalhe.tensoes_comuns}`;
        userBlocks.push(ctx);
      }

      userBlocks.push(`═══ COMPETÊNCIAS PRIORIZADAS PELA IA1 ═══
${compNomes.join(', ')}`);

      if (contextoPPP) {
        userBlocks.push(`═══ CONTEXTO PPP / DOSSIÊ CORPORATIVO ═══\n${contextoPPP.slice(0, 2000)}`);
      }

      if (detalhe.contexto_cultural) {
        userBlocks.push(`═══ CONTEXTO CULTURAL DO CARGO ═══\n${detalhe.contexto_cultural}`);
      }

      userBlocks.push(`═══ VALORES ORGANIZACIONAIS ═══\n${valores.join(', ')}`);

      userBlocks.push(`═══ REFERÊNCIAS COMPORTAMENTAIS DISPONÍVEIS ═══
Pares: ${PARES_DISC.length} pares de opostos
Sub-competências CIS: ${SUB_COMPETENCIAS_CIS.map(s => s.nome).join(', ')}
Estilos de Liderança: Executor, Motivador, Metódico, Sistemático
Fatores DISC: D (Dominância), I (Influência), S (Estabilidade), C (Conformidade)`);

      userBlocks.push(`═══ INSTRUÇÃO DE LEITURA ═══
1. Leia descrição e entregas. Identifique 3-5 SINAIS EXPLÍCITOS do que o cargo exige.
2. Forme HIPÓTESE-BASE do perfil ANTES de aplicar referência comportamental.
3. Declare INCERTEZAS onde faltam sinais ou há ambiguidade.
4. Use conhecimento CIS APENAS para refinar, nunca para sobrescrever sinais do caso.
5. Garanta que este perfil é DIFERENTE dos outros cargos desta empresa.
6. Tela 3: soma DEVE ser exatamente 100.
7. Tela 4: min DEVE ser <= max para cada fator.
8. Se faltar evidência para um fator, use intensidade moderada e confiança baixa.`);

      const user = userBlocks.join('\n\n');
      let resposta = await callAI(system, user, aiConfig, 8192);
      let resultado = await extractJSON(resposta);

      // ── Validação pós-resposta ──
      if (resultado?.gabarito) {
        const g = resultado.gabarito;
        let invalid = false;
        const errors: string[] = [];

        // Validar tela3: soma = 100
        const t3 = g.tela3 || {};
        const somaLid = (t3.executor || 0) + (t3.motivador || 0) + (t3.metodico || 0) + (t3.sistematico || 0);
        if (somaLid !== 100) { errors.push(`Tela3: soma liderança = ${somaLid}, deve ser 100`); invalid = true; }

        // Validar tela4: min <= max (comparar ordinal das faixas)
        const faixaOrd = (f: string) => FAIXAS_VALIDAS.indexOf(f);
        if (g.tela4) {
          for (const fator of ['D', 'I', 'S', 'C']) {
            const f = g.tela4[fator];
            if (f && faixaOrd(f.min) > faixaOrd(f.max)) {
              errors.push(`Tela4: ${fator} min (${f.min}) > max (${f.max})`);
              invalid = true;
            }
          }
        }

        // Validar tela2: subcompetências na lista oficial
        const subcomps = g.tela2?.subcompetencias || g.tela2 || [];
        if (Array.isArray(subcomps)) {
          const subNames = subcomps.map((s: any) => s.nome);
          const invalidas = subNames.filter((n: string) => !NOMES_SUBCOMPS.has(n));
          if (invalidas.length) { errors.push(`Tela2: subcompetências fora da lista: ${invalidas.join(', ')}`); }
          if (subNames.length < 6 || subNames.length > 10) { errors.push(`Tela2: ${subNames.length} subcomps (esperado 6-10)`); }
        }

        // Validar confianca
        for (const tela of ['tela1', 'tela2', 'tela3', 'tela4']) {
          const conf = g[tela]?.confianca;
          if (typeof conf === 'number' && (conf < 0 || conf > 1)) {
            errors.push(`${tela}: confiança ${conf} fora de 0-1`);
          }
        }

        // Retry se soma errada ou erro grave
        if (invalid) {
          console.warn(`[IA2] ${cargoNome}: validação falhou (${errors.join('; ')}). Retry.`);
          const retryUser = user + `\n\n═══ ATENÇÃO: CORREÇÃO NECESSÁRIA ═══\n${errors.join('\n')}\nCorrija e retorne JSON válido.`;
          resposta = await callAI(system, retryUser, aiConfig, 8192);
          const retryResult = await extractJSON(resposta);
          if (retryResult?.gabarito) resultado = retryResult;
        }
      }

      if (resultado?.gabarito) {
        // Calcular confiança média
        const g = resultado.gabarito;
        const confs = [g.tela1?.confianca, g.tela2?.confianca, g.tela3?.confianca, g.tela4?.confianca]
          .filter((c: any) => typeof c === 'number') as number[];
        const confMedia = confs.length ? Math.round((confs.reduce((a, b) => a + b, 0) / confs.length) * 100) / 100 : null;

        const updateData: any = {
          gabarito: resultado.gabarito,
          raciocinio_ia2: resultado.raciocinio_estruturado || null,
          confianca_media_ia2: confMedia,
        };

        if (detalhe.id) {
          await tdb.from('cargos_empresa').update(updateData).eq('id', detalhe.id);
        } else {
          await tdb.from('cargos_empresa').upsert({
            nome: cargoNome,
            ...updateData,
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

// Lista competências do Top 5 pendentes para gerar cenário
export async function listarFilaIA3(empresaId: string) {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    // Buscar Top 5 por cargo
    const top5PorCargo = await getTop5PorCargo(tdb);
    if (!Object.keys(top5PorCargo).length) {
      return { success: false, error: 'Nenhum Top 5 selecionado. Selecione na tela de Cargos & Top 5.' };
    }

    // Buscar top10 e filtrar apenas as que estão no Top 5
    const { data: top10All } = await tdb.from('top10_cargos')
      .select('cargo, competencia_id, competencia:competencias(id, nome, cod_comp)')
      .order('cargo')
      .order('posicao');

    if (!top10All?.length) return { success: false, error: 'Nenhuma Top 10 selecionada. Rode IA1 primeiro.' };

    // Filtrar apenas competências do Top 5
    const filtradas = top10All.filter(t => {
      const top5 = top5PorCargo[t.cargo];
      if (!top5?.length) return false;
      return top5.includes(t.competencia?.nome);
    });

    if (!filtradas.length) return { success: false, error: 'Nenhuma competência no Top 5. Selecione na tela de Cargos & Top 5.' };

    // Verificar quais já têm cenário
    const { data: existentes } = await tdb.from('banco_cenarios')
      .select('competencia_id, cargo');
    const existSet = new Set((existentes || []).map(e => `${e.competencia_id}::${e.cargo}`));

    const fila = filtradas.map(t => ({
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
export async function rodarIA3Uma(empresaId: string, cargoNome: string, competenciaId: string, aiConfig: AIConfig = {}) {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const sbRaw = createSupabaseAdmin();
  const tdb = tenantDb(empresaId);
  try {
    // Empresa (id é tenant — raw)
    let empresa;
    const { data: emp1 } = await sbRaw.from('empresas')
      .select('nome, segmento, ppp_texto').eq('id', empresaId).single();
    empresa = emp1 || (await sbRaw.from('empresas').select('nome, segmento').eq('id', empresaId).single()).data;
    if (!empresa) return { success: false, error: 'Empresa não encontrada' };

    // Competência
    const { data: comp } = await tdb.from('competencias')
      .select('id, nome, cod_comp, pilar, descricao, cargo')
      .eq('id', competenciaId).single();
    if (!comp) return { success: false, error: 'Competência não encontrada' };

    // Descritores
    const { data: descritores } = await tdb.from('competencias')
      .select('cod_desc, nome_curto, descritor_completo, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia')
      .eq('cod_comp', comp.cod_comp)
      .not('cod_desc', 'is', null);

    // PPP, valores
    const contextoPPP = await buscarContextoPPP(tdb, empresa.nome);
    const valores = await buscarValores(tdb, empresa.nome);

    // Dados do cargo + gabarito CIS
    const { data: cargoEmp } = await tdb.from('cargos_empresa')
      .select('gabarito, descricao, principais_entregas, stakeholders, decisoes_recorrentes, tensoes_comuns')
      .eq('nome', cargoNome)
      .maybeSingle();

    const cargoDetalhe = cargoEmp || {};
    const gabCIS = cargoDetalhe.gabarito ? (typeof cargoDetalhe.gabarito === 'string' ? JSON.parse(cargoDetalhe.gabarito) : cargoDetalhe.gabarito) : null;

    // Gerar
    const system = buildIA3SystemPrompt();
    const user = buildIA3UserPrompt(empresa, cargoNome, cargoDetalhe, comp, descritores || [], valores, contextoPPP, gabCIS);

    let resposta = await callAI(system, user, aiConfig, 6144);
    let resultado = await extractJSON(resposta);

    if (!resultado) return { success: false, error: 'IA não retornou JSON válido' };

    // Normalizar formato
    const cen = resultado.cenario || resultado.scenario || resultado;
    const titulo = cen.titulo || cen.title || resultado.titulo || 'Cenário';
    const contexto = cen.contexto || cen.context || cen.descricao || resultado.contexto || '';
    const perguntas = resultado.perguntas || resultado.questions || cen.perguntas || [];

    if (!contexto && !titulo) return { success: false, error: 'IA não retornou cenário válido' };

    // ── Validação pós-resposta ──
    const errors: string[] = [];

    // 4 perguntas obrigatórias
    if (!Array.isArray(perguntas) || perguntas.length !== 4) {
      errors.push(`Esperado 4 perguntas, recebido ${Array.isArray(perguntas) ? perguntas.length : 0}`);
    }

    // Cobertura de descritores
    if (descritores?.length && Array.isArray(perguntas)) {
      const allDescs = new Set<number>();
      perguntas.forEach((p: any) => {
        if (Array.isArray(p.descritores_primarios)) {
          p.descritores_primarios.forEach((d: number) => allDescs.add(d));
        }
      });
      const missing = [];
      for (let i = 1; i <= descritores.length; i++) {
        if (!allDescs.has(i)) missing.push(`D${i}`);
      }
      if (missing.length) errors.push(`Descritores sem cobertura: ${missing.join(', ')}`);
    }

    // Confiança
    if (typeof cen.confianca_cenario === 'number' && (cen.confianca_cenario < 0 || cen.confianca_cenario > 1)) {
      errors.push(`confianca_cenario fora de 0-1: ${cen.confianca_cenario}`);
    }

    // Retry se erros críticos
    if (errors.length > 0) {
      console.warn(`[IA3] ${comp.nome}: validação (${errors.join('; ')}). Retry.`);
      const retryUser = user + `\n\n═══ ATENÇÃO: CORREÇÃO NECESSÁRIA ═══\n${errors.join('\n')}\nCorrija e retorne JSON válido.`;
      resposta = await callAI(system, retryUser, aiConfig, 6144);
      const retryResult = await extractJSON(resposta);
      if (retryResult) {
        resultado = retryResult;
        const cen2 = retryResult.cenario || retryResult;
        if (cen2.titulo) Object.assign(cen, cen2);
      }
    }

    // Montar alternativas enriquecidas (preserva perguntas + metadados do cenário)
    const alternativasEnriquecidas = {
      perguntas: (resultado.perguntas || resultado.questions || cen.perguntas || perguntas),
      faceta_testada_principal: cen.faceta_testada_principal || null,
      tradeoff_testado: cen.tradeoff_testado || null,
      fator_complicador: cen.fator_complicador || null,
      dilema_etico: cen.dilema_etico || resultado.dilema_etico || null,
      armadilha_de_resposta_generica: cen.armadilha_de_resposta_generica || null,
      confianca_cenario: typeof cen.confianca_cenario === 'number' ? Math.max(0, Math.min(1, cen.confianca_cenario)) : null,
      riscos_do_cenario: cen.riscos_do_cenario || null,
      mapa_cobertura_descritores: resultado.mapa_cobertura_descritores || null,
    };

    // Salvar (limpa anterior). empresa_id é injetado pelo tdb.delete/insert
    await tdb.from('banco_cenarios')
      .delete()
      .eq('competencia_id', comp.id)
      .eq('cargo', cargoNome);

    const { error: insertErr } = await tdb.from('banco_cenarios').insert({
      competencia_id: comp.id,
      cargo: cargoNome,
      titulo: cen.titulo || titulo,
      descricao: cen.contexto || contexto,
      alternativas: alternativasEnriquecidas,
    });

    if (insertErr) return { success: false, error: `Erro ao salvar: ${insertErr.message}` };
    return { success: true, message: `Cenário gerado: ${comp.nome}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Wrapper que o pipeline chama — retorna a fila para o frontend processar
export async function rodarIA3(empresaId: string, aiConfig: AIConfig = {}) {
  return listarFilaIA3(empresaId);
}

// Regenerar cenário com base no feedback do check
export async function regenerarCenario(cenarioId: string, aiConfig: AIConfig = {}) {
  const sbRaw = createSupabaseAdmin();
  try {
    // banco_cenarios é misto → raw por id
    const { data: cen } = await sbRaw.from('banco_cenarios')
      .select('empresa_id, competencia_id, cargo, sugestao_check, justificativa_check')
      .eq('id', cenarioId).single();
    if (!cen) return { success: false, error: 'Cenário não encontrado' };
    if (!cen.empresa_id) return { success: false, error: 'Cenário sem empresa_id (catálogo nacional)' };

    const tdb = tenantDb(cen.empresa_id);

    // Regenerar passando feedback como contexto extra
    const feedbackExtra = [cen.justificativa_check, cen.sugestao_check].filter(Boolean).join('\n');

    // Buscar dados necessários (como rodarIA3Uma)
    let empresa;
    const { data: emp1 } = await sbRaw.from('empresas')
      .select('nome, segmento, ppp_texto').eq('id', cen.empresa_id).single();
    empresa = emp1 || (await sbRaw.from('empresas').select('nome, segmento').eq('id', cen.empresa_id).single()).data;

    const { data: comp } = await tdb.from('competencias')
      .select('id, nome, cod_comp, pilar, descricao, cargo')
      .eq('id', cen.competencia_id).single();
    if (!comp) return { success: false, error: 'Competência não encontrada' };

    const { data: descritores } = await tdb.from('competencias')
      .select('cod_desc, nome_curto, descritor_completo, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia')
      .eq('cod_comp', comp.cod_comp).not('cod_desc', 'is', null);

    const contextoPPP = await buscarContextoPPP(tdb, empresa.nome);
    const valores = await buscarValores(tdb, empresa.nome);

    const { data: cargoEmp } = await tdb.from('cargos_empresa')
      .select('gabarito, descricao, principais_entregas, stakeholders, decisoes_recorrentes, tensoes_comuns')
      .eq('nome', cen.cargo).maybeSingle();
    const cargoDetalhe = cargoEmp || {};
    const gabCIS = cargoDetalhe.gabarito ? (typeof cargoDetalhe.gabarito === 'string' ? JSON.parse(cargoDetalhe.gabarito) : cargoDetalhe.gabarito) : null;

    // Gerar com instrução extra do feedback
    const system = buildIA3SystemPrompt();
    let user = buildIA3UserPrompt(empresa, cen.cargo, cargoDetalhe, comp, descritores || [], valores, contextoPPP, gabCIS);
    if (feedbackExtra) {
      user += `\n\nFEEDBACK DA REVISÃO ANTERIOR (CORRIJA ESTES PONTOS):\n${feedbackExtra}`;
    }

    const resposta = await callAI(system, user, aiConfig, 6144);
    const resultado = await extractJSON(resposta);
    if (!resultado) return { success: false, error: 'IA não retornou JSON válido' };

    const cen2 = resultado.cenario || resultado.scenario || resultado;
    const titulo = cen2.titulo || cen2.title || resultado.titulo || 'Cenário';
    const contexto = cen2.contexto || cen2.context || cen2.descricao || resultado.contexto || '';

    const alternativasEnriquecidas = {
      perguntas: (resultado.perguntas || resultado.questions || cen2.perguntas || []),
      faceta_testada_principal: cen2.faceta_testada_principal || null,
      tradeoff_testado: cen2.tradeoff_testado || null,
      fator_complicador: cen2.fator_complicador || null,
      dilema_etico: cen2.dilema_etico || resultado.dilema_etico || null,
      armadilha_de_resposta_generica: cen2.armadilha_de_resposta_generica || null,
      confianca_cenario: typeof cen2.confianca_cenario === 'number' ? Math.max(0, Math.min(1, cen2.confianca_cenario)) : null,
      riscos_do_cenario: cen2.riscos_do_cenario || null,
      mapa_cobertura_descritores: resultado.mapa_cobertura_descritores || null,
    };

    const { error: updErr } = await sbRaw.from('banco_cenarios').update({
      titulo,
      descricao: contexto,
      alternativas: alternativasEnriquecidas,
      nota_check: null,
      status_check: null,
      dimensoes_check: null,
      justificativa_check: null,
      sugestao_check: null,
      alertas_check: null,
      checked_at: null,
    }).eq('id', cenarioId);

    if (updErr) return { success: false, error: updErr.message };
    return { success: true, message: `Cenário regenerado: ${comp.nome}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Check Cenários (validação via Gemini) ───────────────────────────────────
// Usa IA diferente da que gerou (Gemini audita Claude)

export async function listarFilaCheck(empresaId: string) {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  const { data } = await tdb.from('banco_cenarios')
    .select('id, cargo, titulo, nota_check, status_check, competencia_id')
    .order('cargo');

  return {
    success: true,
    data: (data || []).map(c => ({
      id: c.id,
      cargo: c.cargo,
      titulo: c.titulo,
      jaChecado: !!c.nota_check,
      nota: c.nota_check,
      status: c.status_check,
    })),
  };
}

export async function checkCenarioUm(cenarioId: string, empresaId: string | null = null, cargo: string | null = null, competenciaId: string | null = null, modelo: string | null = null) {
  const sbRaw = createSupabaseAdmin();
  try {
    // banco_cenarios é misto → raw na busca por id ou por empresa+cargo+competencia
    let cen;
    if (cenarioId) {
      const { data } = await sbRaw.from('banco_cenarios').select('*').eq('id', cenarioId).single();
      cen = data;
    } else if (empresaId && cargo && competenciaId) {
      const { data } = await sbRaw.from('banco_cenarios').select('*')
        .eq('empresa_id', empresaId).eq('cargo', cargo).eq('competencia_id', competenciaId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      cen = data;
    }
    if (!cen) return { success: false, error: `Check: cenário não encontrado (cargo:${cargo}, comp:${competenciaId})` };

    // Se cenário tem empresa_id, escopa via tdb pra defesa em profundidade
    const tdb = cen.empresa_id ? tenantDb(cen.empresa_id) : null;

    // Buscar competência e descritores
    let compNome = '';
    let descritoresTexto = '';
    if (cen.competencia_id) {
      const sbForComp = tdb || sbRaw;
      const { data: comp } = await sbForComp.from('competencias')
        .select('nome, cod_comp, descricao')
        .eq('id', cen.competencia_id)
        .single();
      if (comp) compNome = comp.nome;

      const { data: descs } = await sbForComp.from('competencias')
        .select('cod_desc, nome_curto, descritor_completo')
        .eq('cod_comp', comp?.cod_comp)
        .not('cod_desc', 'is', null);
      if (descs?.length) {
        descritoresTexto = descs.map((d, i) => `D${i + 1}: ${d.cod_desc} — ${d.nome_curto || d.descritor_completo}`).join('\n');
      }
    }

    // Buscar PPP resumido (precisa do filtro empresa_id mesmo no fallback raw)
    let pppQuery;
    if (tdb) {
      pppQuery = tdb.from('ppp_escolas').select('extracao').eq('status', 'extraido');
    } else {
      pppQuery = sbRaw.from('ppp_escolas').select('extracao')
        .eq('empresa_id', cen.empresa_id).eq('status', 'extraido');
    }
    const { data: ppp } = await pppQuery.limit(1).maybeSingle();
    let pppResumo = '';
    if (ppp?.extracao) {
      const ext = typeof ppp.extracao === 'string' ? JSON.parse(ppp.extracao) : ppp.extracao;
      pppResumo = JSON.stringify(ext).slice(0, 500);
    }

    // Montar perguntas
    const perguntas = Array.isArray(cen.alternativas)
      ? cen.alternativas.map(p => `P${p.numero || ''}: ${p.texto || JSON.stringify(p)}`).join('\n')
      : '';

    const system = `Voce e um avaliador especialista em Assessment Comportamental.
Avalie o cenario e as perguntas com base em 5 dimensoes (20pts cada, total 100):

1. ADERENCIA A COMPETENCIA (20pts): O cenario avalia a competencia indicada? Descritores cobertos?
2. REALISMO CONTEXTUAL (20pts): Contexto e personagens criveis para o cargo/empresa? Usa vocabulario do PPP?
3. CONTENCAO (20pts): Contexto max ~900 chars? Max 2 tensoes? Max 2 stakeholders nomeados? Perguntas max ~200 chars?
4. FORCA DE DECISAO (20pts): P1 forca ESCOLHA? P2 pede COMO com obstaculo? P3 aborda tensao humana? P4 pede acompanhamento?
5. PODER DISCRIMINANTE (20pts): Resposta N2 seria diferente de N3? Nao permite resposta vaga?

ERROS GRAVES (forca nota max 60):
- Pergunta fechada (sim/nao)
- Cenario com 4+ tensoes simultaneas
- Contexto com 5+ stakeholders nomeados
- Pergunta que permite resposta generica sem escolha
- Competencia avaliada nao e a indicada

Nota >= 90 = aprovado. Nota < 90 = revisar com sugestao concreta.

Retorne APENAS JSON valido:
{"nota":85,"erro_grave":false,"dimensoes":{"aderencia":18,"realismo":19,"contencao":16,"decisao":17,"discriminante":15},"justificativa":"...","sugestao":"...","alertas":[]}`;

    const user = `CARGO: ${cen.cargo}
COMPETENCIA: ${compNome}

CENARIO:
Titulo: ${cen.titulo}
Contexto: ${cen.descricao}

PERGUNTAS:
${perguntas}

${descritoresTexto ? `DESCRITORES:\n${descritoresTexto}` : ''}
${pppResumo ? `\nCONTEXTO PPP:\n${pppResumo}` : ''}`;

    // Usar Gemini para validar (IA diferente da que gerou)
    const resposta = await callAI(system, user, { model: modelo || 'gemini-3-flash-preview' }, 4096);
    const resultado = await extractJSON(resposta);

    if (!resultado?.nota) return { success: false, error: 'Validação não retornou resultado' };

    // Salvar resultado — .select() garante que o update é confirmado
    const statusCheck = resultado.nota >= 90 ? 'aprovado' : 'revisar';
    const { data: updated, error: updErr } = await sbRaw.from('banco_cenarios').update({
      nota_check: resultado.nota,
      status_check: statusCheck,
      dimensoes_check: resultado.dimensoes || null,
      justificativa_check: resultado.justificativa || null,
      sugestao_check: resultado.sugestao || null,
      alertas_check: resultado.alertas || [],
      checked_at: new Date().toISOString(),
    }).eq('id', cen.id).select('id, nota_check');

    if (updErr) return { success: false, error: `Check UPDATE falhou: ${updErr.message} (cen.id: ${cen.id})` };
    if (!updated?.length) return { success: false, error: `Check UPDATE: 0 linhas afetadas (cen.id: ${cen.id})` };

    return {
      success: true,
      message: `${cen.titulo}: ${resultado.nota}pts (${resultado.nota >= 90 ? 'aprovado' : 'revisar'})`,
      nota: resultado.nota,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function buildIA3SystemPrompt(): string {
  return `Você é um especialista com 20 anos em avaliação de competências comportamentais em organizações brasileiras.
Sua especialidade: criar cenários situacionais como INSTRUMENTOS DIAGNÓSTICOS.

═══ OBJETIVO ═══

Criar UM cenário situacional + 4 perguntas temáticas que funcionem como
INSTRUMENTO DE ASSESSMENT. NÃO é storytelling. NÃO é treinamento. NÃO é texto bonito.
O cenário é uma radiografia: a resposta revela o nível de maturidade.

═══ PILARES DO CENÁRIO ═══

1. DECISÃO FORÇADA (REGRA DE OURO)
   Se o avaliado pode responder BEM sem abrir mão de nada, priorizar nada ou
   assumir risco algum → o cenário FALHOU como instrumento.
   - P1: ESCOLHA — trade-off real, priorização com custo
   - P2: COMO — execução sabendo que haverá resistência
   - P3: TENSÃO HUMANA — lidar com pessoa que resiste/sofre/discorda
   - P4: SUSTENTABILIDADE — como saber que funcionou no médio prazo

2. FACETA ESPECÍFICA
   O cenário testa uma FACETA ESPECÍFICA da competência, não "a competência
   de forma genérica". Explicite qual aspecto é o foco.

3. TRADE-OFF CENTRAL
   Todo cenário precisa ter UM trade-off claro no centro. Se não houver
   escolha difícil, não há diagnóstico.

4. PODER DISCRIMINANTE
   Resposta N1 deve ser VISIVELMENTE diferente de N3. Se não é, o cenário
   não discrimina. Resposta genérica/clichê DEVE falhar.

5. COBERTURA DE DESCRITORES
   Cada pergunta cobre 2-3 descritores como foco primário.
   As 4 perguntas JUNTAS cobrem TODOS os descritores fornecidos.

6. REALISMO CONTEXTUAL
   Personagens brasileiros nomeados, vocabulário da organização, 1 dado
   concreto (número, prazo, %), situação plausível no dia a dia do cargo.

7. DILEMA ÉTICO EMBUTIDO
   Pelo menos 1 situação onde o caminho mais fácil conflita com um valor
   organizacional. NÃO explicitar — deve emergir naturalmente.

8. SOBRIEDADE
   - Máx 2 stakeholders nomeados
   - Máx 2 tensões (1 central + 1 complicador)
   - Sem subtramas
   - Sem cenário teatral ou sofisticado demais
   - 10 segundos pra entender o problema
   - Contexto: máx 900 caracteres
   - Cada pergunta: máx 200 caracteres
   - Perguntas ABERTAS (não múltipla escolha)

═══ FORMATO JSON (APENAS JSON, sem markdown) ═══

{
  "cenario": {
    "titulo": "Título curto e descritivo",
    "contexto": "Contexto do cenário (250-400 palavras)",
    "faceta_testada_principal": "Qual aspecto específico da competência este cenário mais testa",
    "tradeoff_testado": "Qual escolha difícil o avaliado precisa fazer",
    "fator_complicador": "O que torna a situação mais difícil do que parece",
    "stakeholders_centrais": ["Nome1", "Nome2"],
    "dilema_etico": {
      "valor_testado": "Qual valor organizacional está em jogo",
      "caminho_facil": "O que a pessoa faria se cedesse",
      "caminho_etico": "O que a pessoa faria mantendo o valor"
    },
    "armadilha_de_resposta_generica": "Por que 'alinhar com todos' ou resposta vaga não resolve este cenário",
    "confianca_cenario": 0.85,
    "riscos_do_cenario": "Limitações deste cenário como instrumento (1-2 frases honestas)"
  },
  "perguntas": [
    {
      "numero": 1,
      "texto": "Pergunta aberta (máx 200 chars)",
      "objetivo_diagnostico": "O que esta pergunta quer revelar sobre o avaliado",
      "descritores_primarios": [1, 2],
      "o_que_diferencia_niveis": "N1: ... | N2: ... | N3: ... | N4: ...",
      "resposta_generica_falha_porque": "Por que resposta vaga/clichê não funciona aqui"
    }
  ],
  "mapa_cobertura_descritores": {
    "D1": [1, 3],
    "D2": [1, 4],
    "D3": [2],
    "D4": [2, 3],
    "D5": [3, 4],
    "D6": [4]
  }
}

REGRAS DO JSON:
- 4 perguntas obrigatórias
- descritores_primarios: números dos descritores (D1=1, D2=2, etc.)
- mapa_cobertura_descritores: cada descritor deve aparecer em pelo menos 1 pergunta
- confianca_cenario: 0.0 a 1.0
- stakeholders_centrais: máximo 2`;
}

function buildIA3UserPrompt(empresa: any, cargoNome: string, cargoDetalhe: any, comp: any, descritores: any[], valores: string[], contextoPPP: string, gabCIS: any): string {
  const blocks: string[] = [];

  blocks.push(`═══ EMPRESA ═══
Nome: ${empresa.nome}
Segmento: ${empresa.segmento || 'Não informado'}`);

  blocks.push(`═══ CARGO ═══
Cargo: ${cargoNome}`);

  if (cargoDetalhe.descricao || cargoDetalhe.principais_entregas || cargoDetalhe.stakeholders || cargoDetalhe.decisoes_recorrentes || cargoDetalhe.tensoes_comuns) {
    let ctx = '═══ CONTEXTO ORGANIZACIONAL ═══';
    if (cargoDetalhe.descricao) ctx += `\nDescrição do cargo: ${cargoDetalhe.descricao}`;
    if (cargoDetalhe.principais_entregas) ctx += `\nPrincipais entregas: ${cargoDetalhe.principais_entregas}`;
    if (cargoDetalhe.stakeholders) ctx += `\nStakeholders: ${cargoDetalhe.stakeholders}`;
    if (cargoDetalhe.decisoes_recorrentes) ctx += `\nDecisões recorrentes: ${cargoDetalhe.decisoes_recorrentes}`;
    if (cargoDetalhe.tensoes_comuns) ctx += `\nTensões e situações difíceis: ${cargoDetalhe.tensoes_comuns}`;
    blocks.push(ctx);
  }

  blocks.push(`═══ COMPETÊNCIA-ALVO ═══
Código: ${comp.cod_comp || '—'}
Nome: ${comp.nome}
${comp.descricao ? `Descrição: ${comp.descricao}` : ''}`);

  if (descritores.length > 0) {
    let desc = `═══ DESCRITORES DA COMPETÊNCIA (${descritores.length}) ═══`;
    descritores.forEach((d: any, i: number) => {
      desc += `\nD${i + 1}: ${d.cod_desc} — ${d.nome_curto || d.descritor_completo || ''}`;
      if (d.n1_gap) desc += `\n  N1 (Gap): ${d.n1_gap}`;
      if (d.n2_desenvolvimento) desc += `\n  N2 (Desenvolvimento): ${d.n2_desenvolvimento}`;
      if (d.n3_meta) desc += `\n  N3 (Meta): ${d.n3_meta}`;
      if (d.n4_referencia) desc += `\n  N4 (Referência): ${d.n4_referencia}`;
    });
    blocks.push(desc);
  }

  blocks.push(`═══ VALORES ORGANIZACIONAIS ═══\n${valores.join(', ')}`);

  if (gabCIS) {
    let perfil = '═══ PERFIL IDEAL DO CARGO (IA2) ═══';
    if (gabCIS.tela4) {
      perfil += `\nDISC ideal:`;
      for (const f of ['D', 'I', 'S', 'C']) {
        if (gabCIS.tela4[f]) perfil += `\n  ${f}: ${gabCIS.tela4[f].min} → ${gabCIS.tela4[f].max}`;
      }
    }
    if (gabCIS.tela3) {
      perfil += `\nEstilos de liderança: Executor ${gabCIS.tela3.executor}% | Motivador ${gabCIS.tela3.motivador}% | Metódico ${gabCIS.tela3.metodico}% | Sistemático ${gabCIS.tela3.sistematico}%`;
    }
    perfil += `\nUse o perfil para escolher o TIPO de gatilho que revela pontos cegos deste perfil.`;
    blocks.push(perfil);
  }

  if (contextoPPP) {
    blocks.push(`═══ CONTEXTO PPP / DOSSIÊ ═══\n${contextoPPP.slice(0, 3000)}`);
  }

  blocks.push(`═══ INSTRUÇÃO DE LEITURA ═══
1. Identifique qual FACETA da competência mais importa neste cargo específico.
2. Defina qual ESCOLHA DIFÍCIL diferenciaria respostas N1/N2/N3/N4.
3. Pense em qual RESPOSTA GENÉRICA precisaria falhar — se ela funciona, o cenário é fraco.
4. Distribua os ${descritores.length} descritores nas 4 perguntas (cada pergunta ≥2, cobertura total).
5. Verifique: o cenário tem trade-off REAL? Resposta "boa pra todos" é impossível?

═══ OBJETIVO ═══
Gere o cenário como INSTRUMENTO DIAGNÓSTICO que a IA4 e o check vão usar
para avaliar e auditar. Priorize clareza, discriminância e utilidade — não criatividade literária.`);

  return blocks.join('\n\n');
}

