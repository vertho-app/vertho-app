'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from './ai-client';
import { extractJSON } from './utils';

/**
 * Check IA4 — Validação de qualidade das avaliações.
 * 4 dimensões × 25 pontos = 100 pontos.
 * Threshold: >= 90 = Aprovado, < 90 = Revisar.
 * Busca avaliações da tabela respostas (campo avaliacao_ia).
 */
export async function checkAvaliacoes(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();

  try {
    // Buscar respostas avaliadas sem check
    const { data: respostas, error: qErr } = await sb.from('respostas')
      .select('id, colaborador_id, competencia_id, cenario_id, r1, r2, r3, r4, avaliacao_ia, nivel_ia4')
      .eq('empresa_id', empresaId)
      .not('avaliacao_ia', 'is', null)
      .is('status_ia4', null);

    if (qErr) return { success: false, error: qErr.message };
    if (!respostas?.length) return { success: true, message: 'Nenhuma avaliação pendente de check' };

    // Buscar colaboradores
    const colabIds = [...new Set(respostas.map(r => r.colaborador_id).filter(Boolean))];
    const { data: colabs } = await sb.from('colaboradores').select('id, nome_completo, cargo').in('id', colabIds);
    const colabMap = {};
    (colabs || []).forEach(c => { colabMap[c.id] = c; });

    const model = aiConfig?.model || 'gemini-3-flash-preview';
    let checados = 0, erros = 0, ultimoErro = '';

    for (const resp of respostas) {
      try {
        const colab = colabMap[resp.colaborador_id] || {};

        // Buscar cenário
        let cenarioTexto = '', perguntasTexto = '';
        if (resp.cenario_id) {
          const { data: cen } = await sb.from('banco_cenarios')
            .select('titulo, descricao, alternativas')
            .eq('id', resp.cenario_id).maybeSingle();
          if (cen) {
            cenarioTexto = `${cen.titulo}\n${cen.descricao}`;
            const pergs = Array.isArray(cen.alternativas) ? cen.alternativas : [];
            perguntasTexto = pergs.map((p, i) =>
              `P${p.numero || i + 1}: ${p.texto || ''}`
            ).join('\n');
          }
        }

        // Buscar competência
        let compNome = '';
        if (resp.competencia_id) {
          const { data: comp } = await sb.from('competencias')
            .select('nome').eq('id', resp.competencia_id).maybeSingle();
          compNome = comp?.nome || '';
        }

        const system = `Voce e um auditor de qualidade de avaliacoes comportamentais.
Avalie a qualidade da avaliacao IA em 4 dimensoes (25pts cada = 100pts).

1. EVIDENCIAS E NIVEIS (25pts): nivel coerente com respostas? Evidencias citadas?
2. COERENCIA (25pts): niveis por pergunta sao consistentes com nivel geral?
3. FEEDBACK (25pts): feedback especifico (nao generico)? Cita elementos das respostas?
4. DESENVOLVIMENTO (25pts): pontos de desenvolvimento sao acionaveis e relevantes?

>= 90 = aprovado | < 90 = revisar

Responda APENAS JSON:
{"nota":85,"status":"revisar","dimensoes":{"evidencias":22,"coerencia":20,"feedback":23,"desenvolvimento":20},"justificativa":"...","revisao":"..."}`;

        const user = `COLABORADOR: ${colab.nome_completo || '—'} (${colab.cargo || '—'})
COMPETÊNCIA: ${compNome}

CENÁRIO:
${cenarioTexto}

PERGUNTAS:
${perguntasTexto}

RESPOSTAS:
R1: ${resp.r1 || '—'}
R2: ${resp.r2 || '—'}
R3: ${resp.r3 || '—'}
R4: ${resp.r4 || '—'}

AVALIAÇÃO A AUDITAR:
${JSON.stringify(resp.avaliacao_ia, null, 2)}`;

        const resultado = await callAI(system, user, { model }, 4096);
        const check = await extractJSON(resultado);

        if (check?.nota !== undefined) {
          const { error: updErr } = await sb.from('respostas').update({
            status_ia4: check.nota >= 90 ? 'aprovado' : 'revisar',
            payload_ia4: check,
          }).eq('id', resp.id).select('id');

          if (!updErr) checados++;
          else { erros++; ultimoErro = updErr.message; }
        } else {
          erros++;
          ultimoErro = 'Check não retornou nota';
        }
      } catch (e) {
        erros++;
        ultimoErro = e.message;
      }
    }

    return {
      success: true,
      message: `Check IA4: ${checados} verificadas${erros ? `, ${erros} erros` : ''}${ultimoErro ? ` — ${ultimoErro}` : ''}`,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
