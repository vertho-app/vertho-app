/**
 * Núcleo da REAVALIAÇÃO (revisão controlada com o feedback do auditor) —
 * extraído de `actions/fase3.ts` no padrão headless: a action aplica o gate e
 * delega; script e task chamam direto com um client service-role.
 *
 * Por que saiu da action (12/08/2026): a tela roda o lote no CLIENTE, uma
 * Server Action por item — a ~120 s por resposta, 55 respostas prendem a aba
 * ~2 h —, e ela chama `reavaliarResposta(id)` SEM config, então lá não há como
 * escolher o modelo. Sem núcleo, reavaliar um lote com outro modelo era
 * impossível sem passar por HTTP.
 *
 * A consolidação é a MESMA da IA4 (`lib/ia4-avaliacao`), incluindo a
 * normalização dos níveis: este é o caminho que conserta uma avaliação
 * reprovada, e regravar o nível que a IA escreveu faria o check reprovar de
 * novo por "consolidação contraditória" — o conserto viraria laço.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { tenantDb } from '@/lib/tenant-db';
import { callAI, type AIConfig } from '@/actions/ai-client';
import { extractJSON } from '@/actions/utils';
import {
  consolidarNotasIA4, blocoConsolidacao, normalizarNiveisDaAvaliacao,
  IA4_CALL_OPTIONS, IA4_MAX_TOKENS,
} from '@/lib/ia4-avaliacao';

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

export async function reavaliarRespostaCore(sbRaw: SupabaseClient, respostaId: string, aiConfig: AIConfig = {}) {
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
    const resultado = await callAI(IA4_REVIEW_SYSTEM, user, aiConfig, IA4_MAX_TOKENS, { ...IA4_CALL_OPTIONS, taskKey: 'ia4_avaliacao', empresaId: resp.empresa_id });
    let revisao = await extractJSON(resultado);

    if (!revisao) return { success: false, error: 'IA não retornou revisão válida' };

    // ── Consolidação em código (mesmo padrão da IA4 original) ──
    const descPorDescritor = revisao.avaliacao_revisada?.avaliacao_por_descritor || [];
    // Mesma consolidação da IA4 — inclusive a NORMALIZAÇÃO dos níveis. Este é o
    // caminho que o admin usa para consertar uma avaliação reprovada: se ele
    // regravasse o nível que a IA escreveu, o check reprovaria de novo por
    // "consolidação contraditória" e o conserto viraria um laço.
    const cons = consolidarNotasIA4(descPorDescritor);
    const { notasPorDesc, mediaDescritores, nivelGeral } = cons;
    normalizarNiveisDaAvaliacao(revisao.avaliacao_revisada || {}, notasPorDesc);

    // Montar avaliação final com histórico de revisão
    const avaliacaoFinal = {
      ...(revisao.avaliacao_revisada || {}),
      consolidacao: blocoConsolidacao(cons),
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
