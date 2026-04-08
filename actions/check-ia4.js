'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from './ai-client';
import { extractJSON } from './utils';

/**
 * Check IA4 — Validação de qualidade das avaliações.
 * Baseado em GAS Checkia4.js: 4 dimensões × 25 pontos = 100 pontos.
 * Threshold: >= 90 = Aprovado, < 90 = Revisar.
 */
export async function checkAvaliacoes(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();

  try {
    // Buscar sessões concluídas sem check
    const { data: sessoes } = await sb.from('sessoes_avaliacao')
      .select('id, colaborador_id, competencia_id, competencia_nome, avaliacao_final, rascunho_avaliacao, validacao_audit')
      .eq('empresa_id', empresaId)
      .eq('status', 'concluido')
      .is('check_nota', null);

    if (!sessoes?.length) return { success: true, message: 'Nenhuma avaliação pendente de check' };

    const model = aiConfig?.model || 'gemini-3-flash-preview';
    let checados = 0;

    for (const sessao of sessoes) {
      if (!sessao.avaliacao_final) continue;

      // Carregar competência com gabarito
      const { data: comp } = await sb.from('competencias')
        .select('nome, descricao, gabarito')
        .eq('id', sessao.competencia_id).single();

      // Carregar histórico da conversa
      const { data: msgs } = await sb.from('mensagens_chat')
        .select('role, content')
        .eq('sessao_id', sessao.id)
        .order('created_at');

      const conversa = (msgs || []).map(m => `[${m.role}]: ${m.content}`).join('\n\n');

      const system = `Voce e um auditor de qualidade de avaliacoes comportamentais.
Avalie a qualidade da avaliacao IA em 4 dimensoes, cada uma valendo 25 pontos (total 100).

DIMENSOES:
1. EVIDENCIAS E NIVEIS (25pts)
   - Descritores tem evidencia textual (pode ser parafraseada)?
   - nivel_geral dentro de +-1 do que a regua indica?
   - Penalize APENAS: N3+ sem evidencia, ou resposta N1 avaliada como N3+

2. COERENCIA DA CONSOLIDACAO (25pts)
   - media_descritores → nivel_geral: arredonda para BAIXO?
   - Travas: descritor critico N1 → max N2; 3+ N1 → N1?
   - GAP = 3 - nivel_geral correto?
   - Matematica correta → 23-25pts

3. FEEDBACK + USO DO PERFIL (25pts)
   - Feedback especifico para esta pessoa (nao generico)?
   - Tom alinhado ao contexto?
   - ERRO GRAVE: 100% generico → max 60 total

4. PLANO PDI (25pts)
   - Tem acoes concretas?
   - Prioridades alinhadas aos gaps identificados?
   - Acoes praticas (nao teoricas)?

THRESHOLD: >= 90 = Aprovado | < 90 = Revisar

Responda APENAS com JSON valido.`;

      const user = `## Competencia: ${comp?.nome || sessao.competencia_nome}
${comp?.gabarito ? `## Regua de maturidade:\n${JSON.stringify(comp.gabarito)}` : ''}

## Avaliacao a auditar:
${JSON.stringify(sessao.avaliacao_final, null, 2)}

## Conversa original:
${conversa.slice(0, 30000)}

## Formato de resposta:
{
  "nota": 0-100,
  "status": "aprovado|revisar",
  "erro_grave": false,
  "dimensoes": {
    "evidencias_niveis": 0-25,
    "consolidacao": 0-25,
    "feedback_perfil": 0-25,
    "pdi": 0-25
  },
  "justificativa": "explicacao breve da nota",
  "revisao": "o que precisa ser corrigido (se < 90)"
}`;

      const resultado = await callAI(system, user, { model }, 8192);
      const check = await extractJSON(resultado);

      if (check) {
        await sb.from('sessoes_avaliacao')
          .update({
            check_nota: check.nota,
            check_status: check.status || (check.nota >= 90 ? 'aprovado' : 'revisar'),
            check_resultado: check,
          })
          .eq('id', sessao.id);
        checados++;
      }
    }

    return { success: true, message: `Check IA4 concluído: ${checados} avaliações verificadas de ${sessoes.length}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
