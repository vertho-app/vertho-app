'use server';

import { tenantDb } from '@/lib/tenant-db';
import { callAI, type AIConfig } from './ai-client';
import { extractJSON } from './utils';
import { requireAdminAction } from '@/lib/auth/action-context';
import type { FaseCarreira } from '@/lib/season-engine/programa-config';
import { requireAdminSupabase, requireEmpresaSupabase } from '@/lib/admin-supabase';
import { hasDiscMapeado } from '@/lib/disc-status';
import {
  buscarContextoPPP, buscarValores,
  carregarContextoIA2, montarPromptIA2, validarGabaritoIA2, persistirGabaritoIA2,
} from '@/lib/ia2-gabarito';
import { gerarCenarioIA3Core, checkCenarioIA3Core, buildIA3SystemPrompt, buildIA3UserPrompt } from '@/lib/ia3-cenarios';

// ── IA1: Selecionar top 10 competências por cargo ───────────────────────────
// Seleciona das competências JÁ CADASTRADAS na empresa (tabela competencias).
// Resultado salvo em top10_cargos para validação humana.
//
// Aceita opcionalmente `faseCarreira` (junior|pleno|senior) que vieza o
// ranking pra competências operacionais (junior) ou estratégicas (senior).
// Fallback: lê `sys_config.fase_carreira_default` da empresa.

export interface RodarIA1Opts {
  faseCarreira?: FaseCarreira;
}

export async function rodarIA1(empresaId: string, aiConfig: AIConfig = {}, opts: RodarIA1Opts = {}) {
  const sbRaw = await requireAdminSupabase('ai.audit.regenerate');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    // 1. Buscar empresa (id é tenant — usar raw)
    let empresa;
    const { data: emp1 } = await sbRaw.from('empresas')
      .select('nome, segmento, ppp_texto, sys_config')
      .eq('id', empresaId).single();
    if (emp1) {
      empresa = emp1;
    } else {
      const { data: emp2 } = await sbRaw.from('empresas')
        .select('nome, segmento, sys_config')
        .eq('id', empresaId).single();
      empresa = emp2;
    }
    if (!empresa) return { success: false, error: `Empresa não encontrada (id: ${empresaId})` };

    // Override > sys_config default > undefined (sem viés).
    const faseCarreira: FaseCarreira | undefined =
      opts.faseCarreira || (empresa as any)?.sys_config?.fase_carreira_default || undefined;

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

    // 4.5. Reconciliação de nomes: o IA original aceitava 'Consultor' do CSV
    // de competências, mas o cargo oficial é 'Rare Diseases Demand Sr Consultant'.
    // Pra cada cargo de competência, tentamos achar match em cargos_empresa
    // (exato, case-insensitive, ou contém em qualquer direção). Quando há
    // match único, usamos o nome OFICIAL na hora de gravar top10_cargos.
    const reconciliarCargo = (nomeOrig: string): string => {
      const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
      const alvo = norm(nomeOrig);
      const candidatos = (cargosDetalhados || []).filter((c: any) => {
        const cn = norm(c.nome || '');
        return cn === alvo || cn.includes(alvo) || alvo.includes(cn);
      });
      // Match exato vence
      const exato = candidatos.find((c: any) => norm(c.nome) === alvo);
      if (exato) return exato.nome;
      // Único contém — assume
      if (candidatos.length === 1) return candidatos[0].nome;
      // Ambíguo (>1) ou nenhum: mantém original
      return nomeOrig;
    };

    // 5. Para cada cargo (das competências), pedir à IA que selecione as melhores
    let totalSelecionadas = 0;

    for (const cargoNomeRaw of cargosParaProcessar) {
      // Reconcilia: 'Consultor' → 'Rare Diseases Demand Sr Consultant' quando
      // existe em cargos_empresa. Se não houver match, mantém o nome original.
      const cargoNome = reconciliarCargo(cargoNomeRaw);
      const compsDoCargo = cargoCompsMap[cargoNomeRaw];
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
        const system = buildSystemPromptSelecao(compsDoCargo, cargoNome, faseCarreira);
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
              aderencia_cargo: typeof sel.aderencia_cargo === 'number' ? Math.max(0, Math.min(1, sel.aderencia_cargo)) : null,
              aderencia_mercado: typeof sel.aderencia_mercado === 'number' ? Math.max(0, Math.min(1, sel.aderencia_mercado)) : null,
              motivo: sel.motivo || null,
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
  await requireAdminAction();
  if (!empresaId) return [];
  const tdb = tenantDb(empresaId);
  // Match case/accent-insensitive: pega tudo e filtra em memória
  const { data } = await tdb.from('top10_cargos')
    .select('*, competencia:competencias(id, nome, cod_comp, pilar, descricao)')
    .order('posicao');
  const norm = (s: string | null | undefined) =>
    (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const alvo = norm(cargo);
  return (data || []).filter((r: any) => norm(r.cargo) === alvo);
}

export async function loadTop10TodosCargos(empresaId: string) {
  await requireAdminAction();
  if (!empresaId) return [];
  const tdb = tenantDb(empresaId);
  const { data } = await tdb.from('top10_cargos')
    .select('*, competencia:competencias(id, nome, cod_comp, pilar, descricao)')
    .order('cargo')
    .order('posicao');
  return data || [];
}

/** ia1_resultado por nome de cargo (enriquece a tela /admin/top10). Server-side
 *  (service_role via tenantDb) — a leitura antes ia pelo client anon do browser,
 *  dependendo da policy permissiva de cargos_empresa (removida na mig 156). */
export async function loadIa1ResultadosCargos(empresaId: string): Promise<Record<string, any>> {
  await requireAdminAction();
  if (!empresaId) return {};
  const tdb = tenantDb(empresaId);
  const { data } = await tdb.from('cargos_empresa')
    .select('nome, ia1_resultado')
    .not('ia1_resultado', 'is', null);
  const map: Record<string, any> = {};
  (data || []).forEach((c: any) => { map[c.nome] = c.ia1_resultado; });
  return map;
}

export async function adicionarTop10(empresaId: string, cargo: string, competenciaId: string) {
  await requireAdminAction('content.manage');
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
  const sbRaw = await requireAdminSupabase('content.manage');
  const { data: row } = await sbRaw.from('top10_cargos').select('empresa_id').eq('id', id).maybeSingle();
  if (!row) return { success: false, error: 'Não encontrado' };
  const tdb = tenantDb(row.empresa_id);
  const { error } = await tdb.from('top10_cargos').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ── Gabarito CIS (leitura) ───────────────────────────────────────────────────

export async function loadGabaritosCargos(empresaId: string) {
  await requireAdminAction();
  if (!empresaId) return [];
  const tdb = tenantDb(empresaId);
  const { data, error } = await tdb.from('cargos_empresa')
    .select('id, nome, gabarito, raciocinio_ia2')
    .not('gabarito', 'is', null)
    .order('nome');
  if (error) return [];
  return data || [];
}

/** Exclui UM cenário (hard delete). Para remover cenários de rede que sobraram
 *  da migração por-PPP, ou qualquer um indesejado. Regenerar substitui; este
 *  apaga de vez. */
export async function excluirCenario(cenarioId: string) {
  const sbRaw = await requireAdminSupabase('ai.audit.regenerate');
  if (!cenarioId) return { success: false, error: 'cenarioId obrigatório' };
  // Predicado de tenant explícito (mutação sobre linha lida): empresa OU catálogo global
  const { data: cenLinha } = await sbRaw.from('banco_cenarios').select('empresa_id').eq('id', cenarioId).maybeSingle();
  if (!cenLinha) return { success: false, error: 'Cenário não encontrado' };
  let qDel = sbRaw.from('banco_cenarios').delete().eq('id', cenarioId);
  qDel = cenLinha.empresa_id ? qDel.eq('empresa_id', cenLinha.empresa_id) : qDel.is('empresa_id', null);
  const { error } = await qDel;
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function loadCenarios(empresaId: string) {
  await requireAdminAction();
  if (!empresaId) return [];
  const tdb = tenantDb(empresaId);
  // Listar colunas explicitamente para garantir que check fields vêm
  const { data, error } = await tdb.from('banco_cenarios')
    .select('id, empresa_id, competencia_id, cargo, ppp_escola_id, titulo, descricao, alternativas, created_at, nota_check, status_check, dimensoes_check, justificativa_check, sugestao_check, alertas_check, checked_at')
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

  // Nome do PPP de cada cenário (null = Rede).
  const pppMap: Record<string, string> = {};
  const pppIds = [...new Set(data.map((c: any) => c.ppp_escola_id).filter(Boolean))];
  if (pppIds.length > 0) {
    const { data: ppps } = await tdb.from('ppp_escolas').select('id, escola').in('id', pppIds);
    (ppps || []).forEach((p: any) => { pppMap[p.id] = p.escola; });
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
    ppp_escola_id: c.ppp_escola_id || null,
    ppp_nome: c.ppp_escola_id ? (pppMap[c.ppp_escola_id] || 'PPP') : 'Rede',
  }));
}

// Limpar cenários que não estão no Top 5
export async function limparCenariosAntigos(empresaId: string) {
  await requireAdminAction('content.manage');
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
// buscarContextoPPP / buscarValores agora vivem em `@/lib/ia2-gabarito` (importados
// acima) — compartilhados entre IA1/IA2/IA3 e a task de lote do IA2.

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

function buildSystemPromptSelecao(competencias: any[], cargoAlvo: string, faseCarreira?: FaseCarreira): string {
  const total = competencias.length;
  const maxSel = Math.min(10, total);

  const listaComps = competencias.map((c: any) =>
    `- ID: ${c.cod_comp || c.id} | NOME: ${c.nome} | PILAR: ${c.pilar || '—'} | DESCRIÇÃO: ${c.descricao || '—'}`
  ).join('\n');

  // Viés por fase de carreira — Onboarding (junior) prioriza operacional/básico,
  // Senior prioriza estratégico/relacional. Pleno ou ausente = sem viés (default).
  const VIES = {
    junior: `

═══ VIÉS POR FASE DE CARREIRA: JUNIOR (RECÉM-FORMADO) ═══

Este cargo é ocupado por profissional em fase INICIAL da carreira. Priorize competências:
- OPERACIONAIS e BÁSICAS: rotina, execução, organização, postura profissional.
- FUNDAMENTAIS de exercer o papel com AUTONOMIA SUPERVISIONADA.
- Que possam ser desenvolvidas em 8-10 semanas com mentoria.

EVITE priorizar competências estratégicas, de liderança ou de articulação interdepartamental — elas viriam depois.
Meta: chegar ao nível 2 (autonomia funcional supervisionada), não 3 (proficiente).`,
    senior: `

═══ VIÉS POR FASE DE CARREIRA: SENIOR ═══

Este cargo é ocupado por profissional EXPERIENTE/SENIOR. Priorize competências:
- ESTRATÉGICAS, RELACIONAIS e de LIDERANÇA: visão sistêmica, articulação, influência.
- Que diferenciam um sênior de um pleno — não as básicas que ele já domina.
- De alto IMPACTO ORGANIZACIONAL.

EVITE priorizar competências operacionais básicas — elas são pressuposto, não diferencial.`,
    pleno: '',
  };
  const blocoVies = faseCarreira ? (VIES[faseCarreira] || '') : '';

  return `Você é a IA de parametrização da plataforma Vertho Mentor IA.

TAREFA: Selecionar as ${maxSel} competências MAIS RELEVANTES para o cargo "${cargoAlvo}" da lista fornecida.${blocoVies}

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
      "aderencia_cargo": 0.90,
      "aderencia_mercado": 0.75,
      "justificativa": "Frase que cita elemento específico do cargo/contexto.",
      "motivo": "Por que esta competência é crítica para ESTE cargo especificamente",
      "evidencias_do_caso": ["elemento 1 do contexto", "elemento 2"],
      "papel_na_cobertura": "O que esta competência cobre que as outras não cobrem"
    }
  ],
  "quase_entrou": [
    {
      "id": "COD",
      "nome": "Nome",
      "motivo_nao_entrou": "Por que ficou logo abaixo do corte.",
      "confianca": 0.0
    }
  ],
  "resumo_executivo": {
    "leitura_do_cargo": "2-3 frases: como a IA leu o perfil de exigências do cargo",
    "riscos_de_omissao": ["possível subcobrir algum aspecto relevante"],
    "cobertura_da_selecao": ["dimensão 1 coberta", "dimensão 2 coberta"]
  }
}

REGRAS DO JSON:
- confianca: 0.0 a 1.0 — quão seguro você está desta seleção (0.7+ = alta)
- aderencia_cargo: 0.0 a 1.0 — quanto esta competência é exigida no dia a dia do cargo
- aderencia_mercado: 0.0 a 1.0 — quanto esta competência responde a desafios/oportunidades de mercado e setor
- motivo: frase curta e específica (não genérica) dizendo POR QUE esta competência importa para ESTE cargo
- evidencias_do_caso: 1 a 3 itens curtos extraídos do contexto fornecido
- quase_entrou: 2 a 3 competências que ficaram no limite
- posicao: 1 a ${maxSel} (ordem de prioridade)

REGRAS ADICIONAIS:
- Não repita a mesma justificativa em competências diferentes
- Pense como alguém que está montando um instrumento de diagnóstico, não como alguém fazendo um texto bonito

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

// PARES_DISC / SUB_COMPETENCIAS_CIS movidos p/ `@/lib/ia2-gabarito` (usados pela
// montagem de prompt do gabarito, compartilhada com a task de lote).

/** Cargos com Top 10 (+ flag jaTem gabarito) — a UI itera e chama rodarIA2 por
 *  cargo (evita timeout) e pula os que já têm gabarito. */
export async function listarCargosParaIA2(empresaId: string): Promise<{ cargos: { nome: string; jaTem: boolean }[] }> {
  await requireAdminAction();
  if (!empresaId) return { cargos: [] };
  try {
    const tdb = tenantDb(empresaId);
    const { data: t10 } = await tdb.from('top10_cargos').select('cargo');
    const nomes = Array.from(new Set<string>((t10 || []).map((t: any) => String(t.cargo)))).sort((a, b) => a.localeCompare(b));
    const { data: cgs } = await tdb.from('cargos_empresa').select('nome, gabarito');
    const comGab = new Set((cgs || []).filter((c: any) => (typeof c.gabarito === 'string' ? JSON.parse(c.gabarito || '{}') : c.gabarito)?.tela4).map((c: any) => c.nome));
    return { cargos: nomes.map((n) => ({ nome: n, jaTem: comGab.has(n) })) };
  } catch { return { cargos: [] }; }
}

export async function rodarIA2(empresaId: string, aiConfig: AIConfig = {}, opts: { cargoNome?: string } = {}) {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  // Sem escape hatch: arquivo `'use server'` → todo export é endpoint HTTP, e a
  // flag seria escolhida pelo CLIENTE (o id desta action estava PUBLICADO no
  // bundle). "Escopado por empresaId" não protege: o empresaId vem do caller.
  const sbRaw = await requireEmpresaSupabase(empresaId, 'ai.audit.regenerate');
  const tdb = tenantDb(empresaId);
  try {
    // Contexto compartilhado (empresa + PPP + valores + top10 + detalhe + população
    // p/ colinearidade) — extraído p/ `@/lib/ia2-gabarito` e reusado pela task de lote.
    const { ctx, error } = await carregarContextoIA2(empresaId, tdb, sbRaw, { cargoNome: opts.cargoNome });
    if (error || !ctx) return { success: false, error: error || 'contexto IA2 indisponível' };
    const { empresa, contextoPPP, valores, top10PorCargo, cargosDetalheMap, colabsParaMetrica } = ctx;

    // 5. Para cada cargo com top10, gerar gabarito CIS (1 chamada por cargo).
    let totalGerados = 0;

    for (const [cargoNome, compNomes] of Object.entries(top10PorCargo)) {
      const detalhe = cargosDetalheMap[cargoNome.toLowerCase()] || {};

      // Montagem do prompt (system + user) extraída p/ montarPromptIA2.
      const { system, user } = montarPromptIA2({ cargoNome, compNomes, detalhe, contextoPPP, valores, empresa });
      let resposta = await callAI(system, user, aiConfig, 8192);
      let resultado = await extractJSON(resposta);

      // ── Validação pós-resposta + RETRY (permanece aqui, no caminho síncrono) ──
      if (resultado?.gabarito) {
        const { invalid, errors } = validarGabaritoIA2(resultado);
        // Retry se soma errada ou erro grave
        if (invalid) {
          console.warn(`[IA2] ${cargoNome}: validação falhou (${errors.join('; ')}). Retry.`);
          const retryUser = user + `\n\n═══ ATENÇÃO: CORREÇÃO NECESSÁRIA ═══\n${errors.join('\n')}\nCorrija e retorne JSON válido.`;
          resposta = await callAI(system, retryUser, aiConfig, 8192);
          const retryResult = await extractJSON(resposta);
          if (retryResult?.gabarito) resultado = retryResult;
        }
      }

      // Validação + gravação extraídas p/ persistirGabaritoIA2 (grava sempre que há
      // gabarito, como antes; o retorno é ignorado no síncrono — só o lote o usa).
      if (resultado?.gabarito) {
        await persistirGabaritoIA2({ tdb, cargoNome, resultado, detalhe, colabsParaMetrica });
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
  await requireAdminAction();
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    // Buscar Top 5 por cargo
    const top5PorCargo = await getTop5PorCargo(tdb);
    if (!Object.keys(top5PorCargo).length) {
      return { success: false, error: 'Nenhum Top 5 selecionado. Selecione na tela de Cargos & Top 5.' };
    }

    // top10 (IA1) é só uma FONTE de id representativo — NÃO é mais filtro.
    // Toda competência aprovada na votação (top5_workshop) deve gerar cenário,
    // mesmo que NÃO esteja no Top 10. Quando estiver no top10, reusamos o
    // competencia_id que o IA1 escolheu (estabilidade); senão, resolvemos pela
    // tabela `competencias` por (nome, cargo), preferindo a linha-competência
    // (cod_desc null) sobre as linhas de descritor.
    const { data: top10All } = await tdb.from('top10_cargos')
      .select('cargo, competencia_id, competencia:competencias(id, nome, cod_comp)')
      .order('cargo')
      .order('posicao');

    const { data: comps } = await tdb.from('competencias')
      .select('id, nome, cod_comp, cargo, cod_desc');
    const compById = new Map<string, any>((comps || []).map((c: any) => [c.id, c]));

    // PPPs com colaboradores POR CARGO: cada cargo gera 1 cenário por PPP
    // distinto. Colaborador → escola → escola.ppp_escola_id. Escolas diferentes
    // com o MESMO PPP compartilham 1 cenário (sem duplicar). Sem escola, escola
    // sem PPP ou central → ppp null = cenário de rede.
    const { data: escolas } = await tdb.from('escolas').select('id, ppp_escola_id');
    const escolaPpp = new Map<string, string | null>((escolas || []).map((e: any) => [e.id, e.ppp_escola_id || null]));
    const { data: ppps } = await tdb.from('ppp_escolas').select('id, escola');
    const pppNome = new Map<string, string>((ppps || []).map((p: any) => [p.id, p.escola]));
    // Só colaboradores com DISC mapeado contam para definir os PPPs-alvo de cada
    // cargo (pré-requisito das próximas etapas). Cargos cujos colaboradores ainda
    // não fizeram DISC caem no fallback "rede" (ver pppsAlvo abaixo) — nenhum
    // cargo do Top 5 deixa de ter ao menos o cenário base.
    const { data: colabsEsc } = await tdb.from('colaboradores')
      .select('cargo, escola_id, perfil_dominante, d_natural, i_natural, s_natural, c_natural');
    const cargoPpps = new Map<string, Set<string | null>>();
    for (const c of (colabsEsc || []) as any[]) {
      if (!c.cargo || !hasDiscMapeado(c)) continue;
      const ppp = c.escola_id ? (escolaPpp.get(c.escola_id) || null) : null;
      if (!cargoPpps.has(c.cargo)) cargoPpps.set(c.cargo, new Set());
      cargoPpps.get(c.cargo)!.add(ppp);
    }

    // Já gerados: indexa por (competencia|cod_comp)::cargo::ppp (ppp null = 'rede').
    const { data: existentes } = await tdb.from('banco_cenarios')
      .select('competencia_id, cargo, ppp_escola_id');
    const existSet = new Set<string>();
    for (const e of existentes || []) {
      const ppp = e.ppp_escola_id || 'rede';
      existSet.add(`${e.competencia_id}::${e.cargo}::${ppp}`);
      const cc = compById.get(e.competencia_id)?.cod_comp;
      if (cc) existSet.add(`cc:${cc}::${e.cargo}::${ppp}`);
    }

    const fila: any[] = [];
    const seen = new Set<string>();
    const semCompetencia: string[] = [];
    for (const [cargo, nomes] of Object.entries(top5PorCargo)) {
      // PPPs-alvo deste cargo (ao menos a rede, se não houver colaborador mapeado).
      const pppsAlvo = Array.from(cargoPpps.get(cargo) || new Set<string | null>([null]));
      if (!pppsAlvo.length) pppsAlvo.push(null);
      for (const nome of (nomes as string[])) {
        let competencia_id: string | undefined;
        let cod_comp = '';
        const t10 = (top10All || []).find((t: any) => t.cargo === cargo && t.competencia?.nome === nome);
        if (t10) {
          competencia_id = t10.competencia_id;
          cod_comp = t10.competencia?.cod_comp || '';
        } else {
          const matches = (comps || []).filter((c: any) => c.cargo === cargo && c.nome === nome);
          if (!matches.length) { semCompetencia.push(`${cargo} › ${nome}`); continue; }
          const rep = matches.find((c: any) => !c.cod_desc) || matches[0];
          competencia_id = rep.id;
          cod_comp = rep.cod_comp || '';
        }
        for (const pppId of pppsAlvo) {
          const pppKey = pppId || 'rede';
          const key = `${competencia_id}::${cargo}::${pppKey}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const jaGerado = existSet.has(key) || (cod_comp ? existSet.has(`cc:${cod_comp}::${cargo}::${pppKey}`) : false);
          fila.push({
            cargo, competencia_id, nome, cod_comp, jaGerado,
            ppp_escola_id: pppId,
            ppp_nome: pppId ? (pppNome.get(pppId) || 'PPP') : 'Rede',
          });
        }
      }
    }

    if (!fila.length) {
      return { success: false, error: 'Nenhuma competência aprovada (Top 5) encontrada. Aprove competências na votação ou em Cargos & Top 5.' };
    }
    return { success: true, data: fila, semCompetencia };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Gera cenário para UMA competência (cabe em 60s) — núcleo em lib/ia3-cenarios
export async function rodarIA3Uma(empresaId: string, cargoNome: string, competenciaId: string, pppEscolaId: string | null = null, aiConfig: AIConfig = {}): Promise<{ success: boolean; error?: string; message?: string; cenarioId?: string | null }> {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  try {
    // Auth DENTRO do try: qualquer falha (permissão, sessão) vira erro legível
    // em vez de derrubar a server action. Sem escape hatch: arquivo 'use server'
    // → todo export é endpoint HTTP. O núcleo (headless) vive em lib/ia3-cenarios
    // — é o mesmo que a task de LOTE usa (gerar-ia3-batch).
    const sbRaw = await requireAdminSupabase('ai.audit.regenerate');
    return await gerarCenarioIA3Core(sbRaw, { empresaId, cargoNome, competenciaId, pppEscolaId, aiConfig });
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Wrapper que o pipeline chama — retorna a fila para o frontend processar
export async function rodarIA3(empresaId: string, aiConfig: AIConfig = {}) {
  await requireAdminAction('ai.audit.regenerate');
  return listarFilaIA3(empresaId);
}

// Regenerar cenário com base no feedback do check
export async function regenerarCenario(cenarioId: string, aiConfig: AIConfig = {}) {
  const sbRaw = await requireAdminSupabase('ai.audit.regenerate');
  try {
    // banco_cenarios é misto → raw por id
    const { data: cen } = await sbRaw.from('banco_cenarios')
      .select('empresa_id, competencia_id, cargo, ppp_escola_id, sugestao_check, justificativa_check, alertas_check')
      .eq('id', cenarioId).single();
    if (!cen) return { success: false, error: 'Cenário não encontrado' };
    if (!cen.empresa_id) return { success: false, error: 'Cenário sem empresa_id (catálogo nacional)' };

    const tdb = tenantDb(cen.empresa_id);

    // Regenerar passando feedback enriquecido
    const alertas = typeof cen.alertas_check === 'object' ? cen.alertas_check : {};
    const feedbackParts = [cen.justificativa_check, cen.sugestao_check];
    if (alertas.ponto_mais_fraco) feedbackParts.push(`Ponto mais fraco: ${alertas.ponto_mais_fraco}`);
    if (Array.isArray(alertas.descritores_sem_cobertura) && alertas.descritores_sem_cobertura.length) {
      feedbackParts.push(`Descritores sem cobertura: ${alertas.descritores_sem_cobertura.join(', ')}`);
    }
    if (Array.isArray(alertas.perguntas_com_risco)) {
      alertas.perguntas_com_risco.forEach((p: any) => {
        feedbackParts.push(`P${p.numero}: ${p.problema}. Sugestão: ${p.correcao_recomendada}`);
      });
    }
    const feedbackExtra = feedbackParts.filter(Boolean).join('\n');

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

    const contextoPPP = await buscarContextoPPP(tdb, empresa.nome, cen.ppp_escola_id);
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

    const { data: cenLinha } = await sbRaw.from('banco_cenarios').select('empresa_id').eq('id', cenarioId).maybeSingle();
    let qUpd = sbRaw.from('banco_cenarios').update({
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
    qUpd = cenLinha?.empresa_id ? qUpd.eq('empresa_id', cenLinha.empresa_id) : qUpd.is('empresa_id', null);
    const { error: updErr } = await qUpd;

    if (updErr) return { success: false, error: updErr.message };
    return { success: true, message: `Cenário regenerado: ${comp.nome}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Check Cenários (validação via Gemini) ───────────────────────────────────
// Usa IA diferente da que gerou (Gemini audita Claude)

export async function listarFilaCheck(empresaId: string) {
  await requireAdminAction();
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

export async function checkCenarioUm(cenarioId: string, empresaId: string | null = null, cargo: string | null = null, competenciaId: string | null = null, modelo: string | null = null): Promise<{ success: boolean; error?: string; message?: string; nota?: number; status?: string }> {
  try {
    const sbRaw = await requireAdminSupabase('ai.audit.regenerate');
    // Núcleo headless em lib/ia3-cenarios (mesmo que o LOTE usa).
    return await checkCenarioIA3Core(sbRaw, { cenarioId, empresaId, cargo, competenciaId, modelo });
  } catch (err) {
    return { success: false, error: err.message };
  }
}
