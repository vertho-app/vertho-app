'use server';

import { tenantDb } from '@/lib/tenant-db';
import { callAI, type AIConfig } from './ai-client';
import { extractJSON } from './utils';
import { requireAdminAction } from '@/lib/auth/action-context';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { excludeInternalEmails } from '@/lib/internal-emails';
import { hasDiscMapeado } from '@/lib/disc-status';
// Núcleo da IA4 (prompt + consolidação + persistência) vive em lib/ para a task
// de lote e os scripts o chamarem sem passar por HTTP — este arquivo é
// `'use server'`, onde todo export vira endpoint e só async é exportável.
import {
  IA4_CALL_OPTIONS, IA4_COLAB_COLS,
  avaliarUmaRespostaCore, carregarContextoLoteIA4,
} from '@/lib/ia4-avaliacao';

/**
 * Fila da IA4 = pendentes clássicas (avaliacao_ia IS NULL) + PRESAS: respostas
 * com avaliacao_ia gravado mas ZERO linhas em descriptor_assessments para o
 * mesmo (colaborador, competencia) — legado do bug em que a avaliação era
 * gravada antes do upsert de notas (achado 1.4 do FMEA-PIPELINE). Incluir as
 * presas na fila é o reparo self-service: o admin roda a IA4 normal e elas são
 * reprocessadas (rodarIA4Uma também deixou de recusá-las).
 *
 * Custo: 2 queries extras por chamada (avaliadas da empresa + assessments dos
 * colaboradores envolvidos, ambas com poucas colunas) — aceitável para a tela
 * admin e evita um NOT EXISTS por resposta via RPC/PostgREST.
 */
async function _buscarFilaIA4(tdb: any): Promise<{ data?: any[]; error?: string }> {
  const { data: pendentes, error } = await tdb.from('respostas')
    .select('id, colaborador_id, competencia_id, competencia_nome')
    .is('avaliacao_ia', null)
    .not('r1', 'is', null);
  if (error) return { error: error.message };

  const { data: avaliadas, error: errAv } = await tdb.from('respostas')
    .select('id, colaborador_id, competencia_id, competencia_nome')
    .not('avaliacao_ia', 'is', null)
    .not('r1', 'is', null);
  if (errAv) return { error: errAv.message };

  let presas: any[] = [];
  const colabIds = [...new Set((avaliadas || []).map((r: any) => r.colaborador_id).filter(Boolean))] as string[];
  if (colabIds.length) {
    // Só nota com origem 'ia4' "desprende" a resposta: uma nota MANUAL na mesma
    // competência não significa que a IA4 persistiu — sem o filtro, a presa saía
    // da fila e o reparo self-service não a alcançava mais.
    const { data: assessments, error: errAss } = await tdb.from('descriptor_assessments')
      .select('colaborador_id, competencia')
      .eq('origem', 'ia4')
      .in('colaborador_id', colabIds);
    if (errAss) return { error: errAss.message };
    const comNotas = new Set((assessments || []).map((a: any) => `${a.colaborador_id}|${a.competencia}`));
    presas = (avaliadas || [])
      .filter((r: any) => r.colaborador_id && r.competencia_nome && !comNotas.has(`${r.colaborador_id}|${r.competencia_nome}`))
      .map((r: any) => ({ ...r, presa_sem_notas: true }));
  }
  return { data: [...(pendentes || []), ...presas] };
}

export async function listarPendentesIA4(empresaId: string) {
  await requireAdminAction();
  if (!empresaId) return { success: false, error: 'empresaId obrigatório', data: [] };
  const tdb = tenantDb(empresaId);
  const fila = await _buscarFilaIA4(tdb);
  if (fila.error) return { success: false, error: fila.error, data: [] };
  const presas = (fila.data || []).filter((r: any) => r.presa_sem_notas).length;
  return { success: true, data: fila.data || [], presas };
}

export async function rodarIA4Uma(
  empresaId: string, respostaId: string, aiConfig: AIConfig = {},
): Promise<{ success: boolean; message?: string; error?: string }> {
  const sbRaw = await requireAdminSupabase('ai.audit.regenerate');
  if (!empresaId || !respostaId) return { success: false, error: 'empresaId e respostaId obrigatórios' };
  const tdb = tenantDb(empresaId);
  try {
    const { data: resp, error: respErr } = await tdb.from('respostas')
      .select('*').eq('id', respostaId).single();
    if (respErr || !resp) return { success: false, error: respErr?.message || 'Resposta não encontrada' };
    if (resp.avaliacao_ia) {
      // "Já avaliada" só vale com as notas persistidas PELA IA4: avaliacao_ia SEM
      // linhas ia4 em descriptor_assessments é o estado preso do achado 1.4 —
      // reprocessa. (Nota manual na mesma competência não conta: é outra origem.)
      const { count } = await tdb.from('descriptor_assessments')
        .select('colaborador_id', { count: 'exact', head: true })
        .eq('origem', 'ia4')
        .eq('colaborador_id', resp.colaborador_id)
        .eq('competencia', resp.competencia_nome || '');
      if ((count ?? 0) > 0) return { success: true, message: 'Já avaliada' };
      console.warn(`[IA4] resposta ${respostaId} avaliada mas SEM notas de descritor — reprocessando (achado 1.4)`);
    }

    const colabIds = [resp.colaborador_id].filter(Boolean);
    const { data: colabs } = await tdb.from('colaboradores')
      .select(IA4_COLAB_COLS)
      .in('id', colabIds);
    const colab = colabs?.[0] || {};

    // Contexto institucional consolidado por empresa (F-I10 — era `.limit(1)`, uma
    // escola sorteada da rede aplicada ao mapeamento de TODAS as respostas).
    const { empresa, contextoPPP } = await carregarContextoLoteIA4(tdb, sbRaw, empresaId);

    return await avaliarUmaRespostaCore(tdb, sbRaw, resp, colab, empresa, contextoPPP, aiConfig);
  } catch (err: any) {
    console.error('[IA4uma] ERRO:', err.message, err.stack?.split('\n').slice(0, 3).join(' '));
    return { success: false, error: err.message };
  }
}

export async function rodarIA4(empresaId: string, aiConfig: AIConfig = {}) {
  // Sem escape hatch: este arquivo é `'use server'`, então todo export é endpoint
  // HTTP e uma flag de bypass seria escolhida pelo CLIENTE. O id desta action
  // estava PUBLICADO no bundle do browser. Caminho headless → núcleo sem gate em
  // `lib/` (modelo `lib/blueprint/core.ts`), nunca uma flag.
  const sbRaw = await requireAdminSupabase('ai.audit.regenerate');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    // Buscar respostas pendentes — inclui as "presas" (avaliacao_ia gravado sem
    // notas de descritor, legado do achado 1.4) via _buscarFilaIA4.
    const fila = await _buscarFilaIA4(tdb);
    if (fila.error) return { success: false, error: fila.error };
    if (!fila.data?.length) return { success: true, message: 'Nenhuma resposta pendente de avaliação' };
    const { data: respostas, error: respErr } = await tdb.from('respostas')
      .select('*')
      .in('id', fila.data.map((r: any) => r.id));

    if (respErr) return { success: false, error: respErr.message };
    if (!respostas?.length) return { success: true, message: 'Nenhuma resposta pendente de avaliação' };

    // Buscar colaboradores com perfil CIS
    const colabIds = [...new Set(respostas.map((r: any) => r.colaborador_id).filter(Boolean))];
    const { data: colabs } = await tdb.from('colaboradores')
      .select(IA4_COLAB_COLS)
      .in('id', colabIds);
    const colabMap: Record<string, any> = {};
    (colabs || []).forEach((c: any) => { colabMap[c.id] = c; });

    // Contexto institucional consolidado por empresa (F-I10). Vai no `cachedUserPrefix`
    // do IA4, então é lido 1× por lote — consolidar não multiplica custo.
    const { empresa, contextoPPP } = await carregarContextoLoteIA4(tdb, sbRaw, empresaId);

    let avaliadas = 0, erros = 0, ultimoErro = '';

    for (const resp of respostas) {
      try {
        const colab = colabMap[resp.colaborador_id] || {};
        const r = await avaliarUmaRespostaCore(tdb, sbRaw, resp, colab, empresa, contextoPPP, aiConfig);
        if (r.success) avaliadas++;
        else { erros++; ultimoErro = r.error || 'Erro desconhecido'; }
      } catch (e: any) {
        erros++;
        ultimoErro = e.message;
        console.error(`[IA4] ERRO no colab ${resp.colaborador_id?.slice(0,8)} / comp ${resp.competencia_nome}:`, e.message);
      }
    }

    return { success: true, message: `IA4 concluída: ${avaliadas} avaliadas${erros ? `, ${erros} erros` : ''}${ultimoErro ? ` — ${ultimoErro}` : ''}` };
  } catch (err: any) {
    console.error('[IA4] ERRO GERAL:', err.message, err.stack?.split('\n').slice(0, 3).join(' '));
    return { success: false, error: err.message };
  }
}

// ── Re-avaliar resposta (revisão controlada com feedback do check) ──────────

const IA4_REVIEW_SYSTEM = `Você é o Motor de Revisão de Avaliações da Vertho Mentor IA.

═══ TAREFA ═══
REVISAR uma avaliação anterior com base no feedback de uma auditoria (2ª IA).
Isto NÃO é uma reavaliação do zero — é uma REVISÃO CONTROLADA.

═══ PRINCÍPIOS DA REVISÃO ═══

1. PRESERVE o que já era defensável na avaliação anterior
2. CORRIJA apenas os pontos onde a auditoria aponta problema real E as evidências sustentam a correção
3. Se a auditoria sugerir algo que NÃO se sustenta nas evidências das respostas, MANTENHA a avaliação anterior e EXPLIQUE por quê
4. O feedback da auditoria é IMPORTANTE, mas NÃO substitui a régua nem as evidências
5. Toda mudança de nota/nível DEVE ter justificativa explícita

═══ REGRAS (mesmas da IA4 original) ═══
- Evidência ou não conta
- Intenção não é evidência
- Na dúvida → nível inferior
- N3/N4 exigem evidência robusta
- Perfil CIS NÃO altera nota
- NUNCA inventar dados não presentes nas respostas

═══ PROCESSO OBRIGATÓRIO ═══

1. Ler o feedback da auditoria (cada ponto)
2. Para cada ponto: verificar se as evidências das respostas sustentam a correção
3. Decidir: corrigir | corrigir_parcialmente | manter | nao_aplicavel
4. Gerar avaliação revisada com as correções aceitas
5. Documentar o que mudou e o que foi preservado

═══ FORMATO JSON ═══

{
  "avaliacao_revisada": {
    "avaliacao_por_descritor": [
      {
        "numero": 1,
        "nome": "nome do descritor",
        "nota_decimal": 2.33,
        "nivel_sugerido": 2,
        "confianca": 0.80,
        "sustentacao": "forte",
        "evidencias": ["trecho 1"],
        "limites_da_evidencia": ["o que não foi demonstrado"],
        "racional": "Por que este nível"
      }
    ],
    "descritores_destaque": {
      "pontos_fortes": [{"descritor": "", "nivel": 3, "evidencia_resumida": ""}],
      "gaps_prioritarios": [{"descritor": "", "nivel": 1, "o_que_faltou": ""}]
    },
    "feedback": {
      "tom_base": "acolhedor / direto / técnico",
      "resumo_geral": "2-3 frases",
      "mensagem_positiva": "O que fez bem",
      "mensagem_construtiva": "Onde melhorar",
      "recomendacoes": ["ação 1", "ação 2"]
    }
  },
  "tratamento_do_feedback": {
    "itens": [
      {
        "ponto_auditoria": "O que a auditoria apontou",
        "decisao": "corrigir",
        "justificativa": "Por que aceitou/rejeitou este ponto"
      }
    ],
    "mudancas_relevantes": ["D2: nota 1.67→2.33 (auditoria identificou evidência não computada)"],
    "pontos_preservados": ["D1: nota mantida em 2.00 (auditoria sugeriu N3 mas sem evidência suficiente)"]
  }
}

REGRAS DO JSON:
- decisao: "corrigir" | "corrigir_parcialmente" | "manter" | "nao_aplicavel"
- nota_decimal: 1.00 a 4.00
- confianca: 0.0 a 1.0
- tratamento_do_feedback.itens: pelo menos 1 item (não pode ignorar a auditoria)
- mudancas_relevantes e pontos_preservados: obrigatórios (podem ser arrays vazios)`;

export async function reavaliarResposta(respostaId: string, aiConfig: AIConfig = {}) {
  const sbRaw = await requireAdminSupabase('ai.audit.regenerate');
  try {
    const { data: resp } = await sbRaw.from('respostas')
      .select('id, empresa_id, colaborador_id, competencia_id, cenario_id, r1, r2, r3, r4, avaliacao_ia, payload_ia4')
      .eq('id', respostaId).single();
    if (!resp) return { success: false, error: 'Resposta não encontrada' };

    const tdb = tenantDb(resp.empresa_id);

    // Preservar avaliação anterior
    const avaliacaoAnterior = typeof resp.avaliacao_ia === 'string' ? JSON.parse(resp.avaliacao_ia) : resp.avaliacao_ia;

    // Extrair feedback do check
    const check = typeof resp.payload_ia4 === 'string' ? JSON.parse(resp.payload_ia4) : resp.payload_ia4;
    const feedbackCheck = check ? JSON.stringify(check, null, 2) : '';

    const { data: empresa } = await sbRaw.from('empresas')
      .select('nome, segmento').eq('id', resp.empresa_id).single();

    const { data: colab } = await tdb.from('colaboradores')
      .select('id, nome_completo, cargo, d_natural, i_natural, s_natural, c_natural, perfil_dominante, perfil_externo_fonte, perfil_externo_dados')
      .eq('id', resp.colaborador_id).single();

    let cenarioTexto = '', perguntasTexto = '';
    if (resp.cenario_id) {
      const { data: cen } = await sbRaw.from('banco_cenarios')
        .select('titulo, descricao, alternativas').eq('id', resp.cenario_id).maybeSingle();
      if (cen) {
        cenarioTexto = `${cen.titulo}\n${cen.descricao}`;
        const altObj2 = typeof cen.alternativas === 'object' && !Array.isArray(cen.alternativas) ? cen.alternativas : {};
        const pergs = altObj2.perguntas || (Array.isArray(cen.alternativas) ? cen.alternativas : []);
        perguntasTexto = pergs.map((p: any, i: number) => `P${p.numero || i + 1}: ${p.texto || ''}`).join('\n');
      }
    }

    let compNome = '', compCod = '', descritoresTexto = '';
    if (resp.competencia_id) {
      const { data: comp } = await tdb.from('competencias')
        .select('nome, cod_comp').eq('id', resp.competencia_id).maybeSingle();
      compNome = comp?.nome || ''; compCod = comp?.cod_comp || '';
      const { data: descs } = await tdb.from('competencias')
        .select('cod_desc, nome_curto, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia')
        .eq('cod_comp', comp?.cod_comp).not('cod_desc', 'is', null);
      if (descs?.length) {
        descritoresTexto = descs.map((d: any, i: number) =>
          `D${i + 1}: ${d.cod_desc} — ${d.nome_curto || ''}\nN1: ${d.n1_gap || ''}\nN2: ${d.n2_desenvolvimento || ''}\nN3: ${d.n3_meta || ''}\nN4: ${d.n4_referencia || ''}`
        ).join('\n\n');
      }
    }

    // ── User prompt estruturado ──
    const userBlocks: string[] = [];

    userBlocks.push(`═══ PROFISSIONAL ═══\n${colab?.nome_completo || '—'} · ${colab?.cargo || '—'} · ${empresa?.nome || '—'}`);
    userBlocks.push(`═══ COMPETÊNCIA ═══\n${compCod} — ${compNome}`);
    userBlocks.push(`═══ RÉGUA DE MATURIDADE ═══\n${descritoresTexto || '(não disponíveis)'}`);
    if (cenarioTexto) userBlocks.push(`═══ CENÁRIO ═══\n${cenarioTexto}`);
    if (perguntasTexto) userBlocks.push(`═══ PERGUNTAS ═══\n${perguntasTexto}`);

    userBlocks.push(`═══ RESPOSTAS DO PROFISSIONAL ═══
R1: ${resp.r1 || '—'}
R2: ${resp.r2 || '—'}
R3: ${resp.r3 || '—'}
R4: ${resp.r4 || '—'}`);

    // Avaliação anterior (resumida)
    if (avaliacaoAnterior) {
      const descAnterior = avaliacaoAnterior.avaliacao_por_descritor || [];
      const resumoAnterior = descAnterior.map((d: any) =>
        `${d.nome}: nota ${d.nota_decimal} (N${d.nivel_sugerido}) conf ${d.confianca} — ${d.racional || ''}`
      ).join('\n');
      const consol = avaliacaoAnterior.consolidacao || {};
      userBlocks.push(`═══ AVALIAÇÃO ANTERIOR ═══
Nível geral: N${consol.nivel_geral || '?'} (média: ${consol.media_descritores || '?'})
Travas: ${(consol.travas_aplicadas || []).join('; ')}

Por descritor:
${resumoAnterior || '(formato legado — sem detalhamento por descritor)'}`);
    }

    if (feedbackCheck) {
      userBlocks.push(`═══ FEEDBACK DA AUDITORIA (2ª IA) ═══\n${feedbackCheck}`);
    }

    userBlocks.push(`═══ INSTRUÇÃO DE REVISÃO ═══
1. Leia CADA ponto da auditoria
2. Para cada ponto: verifique se as EVIDÊNCIAS das respostas sustentam a correção
3. Se sustentam → corrija a nota/nível e explique
4. Se NÃO sustentam → mantenha a avaliação anterior e explique por quê
5. NÃO refaça tudo do zero — revise cirurgicamente
6. Documente mudanças E preservações no tratamento_do_feedback`);

    const user = userBlocks.join('\n\n');
    const resultado = await callAI(IA4_REVIEW_SYSTEM, user, aiConfig, 8192, IA4_CALL_OPTIONS);
    let revisao = await extractJSON(resultado);

    if (!revisao) return { success: false, error: 'IA não retornou revisão válida' };

    // ── Consolidação em código (mesmo padrão da IA4 original) ──
    const descPorDescritor = revisao.avaliacao_revisada?.avaliacao_por_descritor || [];
    const notasPorDesc: Record<string, any> = {};
    for (const d of descPorDescritor) {
      const key = `D${d.numero}`;
      const nota = Math.max(1.0, Math.min(4.0, d.nota_decimal || 1.0));
      notasPorDesc[key] = {
        nome: d.nome,
        nota_decimal: Math.round(nota * 100) / 100,
        nivel: Math.floor(nota),
        confianca: d.confianca || 0,
        sustentacao: d.sustentacao || 'insuficiente',
      };
    }

    const notas = Object.values(notasPorDesc).map((d: any) => d.nota_decimal);
    const mediaDescritores = notas.length
      ? Math.round((notas.reduce((a: number, b: number) => a + b, 0) / notas.length) * 100) / 100 : 0;
    let nivelGeral = Math.floor(mediaDescritores);

    const travasAplicadas: string[] = [];
    const niveisN1 = Object.values(notasPorDesc).filter((d: any) => d.nivel === 1).length;
    if (niveisN1 > 3) { nivelGeral = Math.min(nivelGeral, 1); travasAplicadas.push(`${niveisN1} descritores N1 → max N1`); }
    else if (niveisN1 > 0 && nivelGeral > 2) { nivelGeral = Math.min(nivelGeral, 2); travasAplicadas.push('Descritor N1 → max N2'); }
    const temN3 = Object.values(notasPorDesc).some((d: any) => d.nivel >= 3);
    if (temN3 && nivelGeral < 2) { nivelGeral = 2; travasAplicadas.push('Evidência N3 → mínimo N2'); }
    nivelGeral = Math.max(1, Math.min(4, nivelGeral));

    const confs = Object.values(notasPorDesc).map((d: any) => d.confianca || 0).filter((c: number) => c > 0);
    const confiancaGeral = confs.length ? Math.round((confs.reduce((a, b) => a + b, 0) / confs.length) * 100) / 100 : 0;

    // Montar avaliação final com histórico de revisão
    const avaliacaoFinal = {
      ...(revisao.avaliacao_revisada || {}),
      consolidacao: {
        notas_por_descritor: notasPorDesc,
        media_descritores: mediaDescritores,
        nivel_geral: nivelGeral,
        gap: Math.max(0, 3 - nivelGeral),
        confianca_geral: confiancaGeral,
        travas_aplicadas: travasAplicadas.length ? travasAplicadas : ['Nenhuma'],
      },
      _revisao: {
        avaliacao_anterior: avaliacaoAnterior,
        auditoria: check,
        tratamento_do_feedback: revisao.tratamento_do_feedback || null,
        revisado_em: new Date().toISOString(),
      },
    };

    const feedbackObj = revisao.avaliacao_revisada?.feedback;
    const feedbackStr = typeof feedbackObj === 'object'
      ? [feedbackObj.resumo_geral, feedbackObj.mensagem_positiva, feedbackObj.mensagem_construtiva].filter(Boolean).join('\n')
      : (feedbackObj || '');

    const { data: updated, error: updErr } = await tdb.from('respostas').update({
      avaliacao_ia: avaliacaoFinal,
      nivel_ia4: nivelGeral,
      nota_ia4: mediaDescritores,
      pontos_fortes: avaliacaoFinal.descritores_destaque?.pontos_fortes?.map((p: any) => p.descritor || p).join('; ') || null,
      pontos_atencao: avaliacaoFinal.descritores_destaque?.gaps_prioritarios?.map((g: any) => g.descritor || g).join('; ') || null,
      feedback_ia4: feedbackStr || null,
      status_ia4: null,
      payload_ia4: null,
      avaliado_em: new Date().toISOString(),
    }).eq('id', respostaId).select('id');

    if (updErr) return { success: false, error: `Re-avaliação UPDATE falhou: ${updErr.message}` };
    if (!updated?.length) return { success: false, error: 'Re-avaliação: 0 linhas atualizadas' };

    const mudancas = revisao.tratamento_do_feedback?.mudancas_relevantes?.length || 0;
    const preservados = revisao.tratamento_do_feedback?.pontos_preservados?.length || 0;
    return {
      success: true,
      message: `Revisado: ${compNome} — N${nivelGeral} (${mudancas} mudanças, ${preservados} preservados)`,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ── Re-checar UMA resposta ───────────────────────────────────────────────────

export async function rechecarResposta(respostaId: string, aiConfig: AIConfig = {}) {
  const { checarUmaResposta } = await import('./check-ia4');
  return checarUmaResposta(respostaId, aiConfig);
}

// ── Ver fila de IA4 ─────────────────────────────────────────────────────────

export async function verFilaIA4(empresaId: string) {
  await requireAdminAction();
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    const { count: pendentes } = await tdb.from('respostas')
      .select('id', { count: 'exact', head: true })
      .is('avaliacao_ia', null)
      .not('r1', 'is', null);

    const { count: avaliadas } = await tdb.from('respostas')
      .select('id', { count: 'exact', head: true })
      .not('avaliacao_ia', 'is', null);

    return {
      success: true,
      message: `Fila IA4: ${pendentes || 0} pendentes, ${avaliadas || 0} avaliadas`,
      pendentes: pendentes || 0,
      avaliadas: avaliadas || 0,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ── Carregar respostas com avaliação ─────────────────────────────────────────

export async function loadRespostasAvaliadas(empresaId: string) {
  const sbRaw = await requireAdminSupabase();
  if (!empresaId) return [];
  const tdb = tenantDb(empresaId);
  const { data, error } = await tdb.from('respostas')
    .select('id, colaborador_id, competencia_id, cenario_id, r1, r2, r3, r4, nivel_simulado, avaliacao_ia, nivel_ia4, nota_ia4, status_ia4, payload_ia4, pontos_fortes, pontos_atencao, feedback_ia4, created_at')
    .not('r1', 'is', null)
    .order('created_at', { ascending: false });

  if (error || !data?.length) return [];

  const colabIds = [...new Set(data.map((r: any) => r.colaborador_id).filter(Boolean))];
  const colabMap: Record<string, any> = {};
  if (colabIds.length) {
    const { data: colabs } = await tdb.from('colaboradores').select('id, nome_completo, cargo').in('id', colabIds);
    (colabs || []).forEach((c: any) => { colabMap[c.id] = c; });
  }

  const compIds = [...new Set(data.map((r: any) => r.competencia_id).filter(Boolean))];
  const compMap: Record<string, any> = {};
  if (compIds.length) {
    const { data: comps } = await tdb.from('competencias').select('id, nome, cod_comp').in('id', compIds);
    (comps || []).forEach((c: any) => { compMap[c.id] = c; });
  }

  const cenIds = [...new Set(data.map((r: any) => r.cenario_id).filter(Boolean))];
  const cenMap: Record<string, any> = {};
  if (cenIds.length) {
    // banco_cenarios é misto → raw
    const { data: cens } = await sbRaw.from('banco_cenarios').select('id, titulo, alternativas').in('id', cenIds);
    (cens || []).forEach((c: any) => { cenMap[c.id] = c; });
  }

  return data.map((r: any) => ({
    ...r,
    colaborador_nome: colabMap[r.colaborador_id]?.nome_completo || '—',
    colaborador_cargo: colabMap[r.colaborador_id]?.cargo || '—',
    competencia_nome: compMap[r.competencia_id]?.nome || '—',
    competencia_cod: compMap[r.competencia_id]?.cod_comp || '',
    cenario_titulo: cenMap[r.cenario_id]?.titulo || '—',
    cenario_perguntas: cenMap[r.cenario_id]?.alternativas || [],
  }));
}

/**
 * Roster de colaboradores ELEGÍVEIS ao Diagnóstico — usado para calcular % de
 * diagnósticos/cenários realizados e listar quem falta. Exclui:
 * - contas internas (@vertho.ai);
 * - quem ainda NÃO fez o mapeamento comportamental (DISC), pré-requisito das
 *   próximas etapas. Sem DISC, o colaborador não é cobrado de diagnóstico nem
 *   de cenários (não infla o denominador).
 *
 * O cruzamento com quem já respondeu é feito na tela (via colaborador_id das
 * respostas).
 */
export async function loadRosterDiagnostico(empresaId: string) {
  await requireAdminAction();
  if (!empresaId) return [];
  const tdb = tenantDb(empresaId);
  const { data } = await excludeInternalEmails(
    tdb.from('colaboradores')
      .select('id, nome_completo, cargo, perfil_dominante, d_natural, i_natural, s_natural, c_natural')
      .order('nome_completo')
  );
  // DISC realizado = perfil dominante + ao menos um eixo D/I/S/C preenchido.
  return (data || [])
    .filter((c: any) => hasDiscMapeado(c))
    .map((c: any) => ({ id: c.id, nome_completo: c.nome_completo, cargo: c.cargo }));
}

// ── Relatórios ──────────────────────────────────────────────────────────────

export async function gerarRelatoriosIndividuais(_empresaId: string, _aiConfig: AIConfig = {}) {
  return { success: true, message: 'Relatórios individuais: funcionalidade em desenvolvimento' };
}

export async function gerarRelatorioGestor(_empresaId: string, _aiConfig: AIConfig = {}) {
  return { success: true, message: 'Relatório gestor: funcionalidade em desenvolvimento' };
}

export async function gerarRelatorioRH(_empresaId: string, _aiConfig: AIConfig = {}) {
  return { success: true, message: 'Relatório RH: funcionalidade em desenvolvimento' };
}

export async function enviarRelIndividuais(_empresaId: string) {
  return { success: true, message: 'Envio individuais: funcionalidade em desenvolvimento' };
}

export async function enviarRelGestor(_empresaId: string) {
  return { success: true, message: 'Envio gestor: funcionalidade em desenvolvimento' };
}

export async function enviarRelRH(_empresaId: string) {
  return { success: true, message: 'Envio RH: funcionalidade em desenvolvimento' };
}
