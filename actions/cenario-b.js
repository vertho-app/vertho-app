'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from './ai-client';
import { extractJSON } from './utils';

/**
 * Gera um Cenario B alternativo para uma sessao de avaliacao.
 * O cenario e adaptado ao perfil DISC do colaborador e foca nas lacunas
 * identificadas na avaliacao_final.
 *
 * @param {string} sessaoId - ID da sessao_avaliacao
 * @param {object} aiConfig - { model?: string }
 * @returns {{ success: boolean, cenario?: object, error?: string }}
 */
export async function gerarCenarioB(sessaoId, aiConfig = {}) {
  const sb = createSupabaseAdmin();

  try {
    // 1. Load sessao_avaliacao
    const { data: sessao, error: sessaoErr } = await sb
      .from('sessoes_avaliacao')
      .select('id, colaborador_id, competencia_id, avaliacao_final, cenario_id')
      .eq('id', sessaoId)
      .single();

    if (sessaoErr || !sessao) {
      return { success: false, error: `Sessao nao encontrada: ${sessaoErr?.message || 'ID invalido'}` };
    }

    // 2. Load colaborador with DISC profile
    const { data: colaborador, error: colabErr } = await sb
      .from('colaboradores')
      .select('id, nome_completo, cargo, perfil_dominante, d_natural, i_natural, s_natural, c_natural')
      .eq('id', sessao.colaborador_id)
      .single();

    if (colabErr || !colaborador) {
      return { success: false, error: `Colaborador nao encontrado: ${colabErr?.message}` };
    }

    // 3. Load competencia
    const { data: competencia, error: compErr } = await sb
      .from('competencias')
      .select('id, nome, descricao, gabarito')
      .eq('id', sessao.competencia_id)
      .single();

    if (compErr || !competencia) {
      return { success: false, error: `Competencia nao encontrada: ${compErr?.message}` };
    }

    // 4. Load original cenario
    const { data: cenarioOriginal, error: cenErr } = await sb
      .from('banco_cenarios')
      .select('id, titulo, descricao, p1, p2, p3, p4')
      .eq('id', sessao.cenario_id)
      .single();

    if (cenErr || !cenarioOriginal) {
      return { success: false, error: `Cenario original nao encontrado: ${cenErr?.message}` };
    }

    // 5. Build prompt and call Claude
    const system = `Voce e um especialista em avaliacao de competencias comportamentais usando metodologia DISC.
Sua tarefa e gerar um cenario alternativo (Cenario B) para reavaliacao de um colaborador.
O cenario deve ser diferente do original, mas avaliar a mesma competencia.
Responda APENAS com JSON valido, sem texto adicional.`;

    const discProfile = {
      perfil_dominante: colaborador.perfil_dominante,
      D: colaborador.d_natural,
      I: colaborador.i_natural,
      S: colaborador.s_natural,
      C: colaborador.c_natural,
    };

    const user = `## Competencia avaliada
Nome: ${competencia.nome}
Descricao: ${competencia.descricao}
Gabarito (rubrica por descritor): ${JSON.stringify(competencia.gabarito)}

## Perfil DISC do colaborador
${JSON.stringify(discProfile)}

## Cenario original (NAO repetir este cenario)
Titulo: ${cenarioOriginal.titulo}
Descricao: ${cenarioOriginal.descricao}
P1: ${cenarioOriginal.p1}
P2: ${cenarioOriginal.p2}
P3: ${cenarioOriginal.p3}
P4: ${cenarioOriginal.p4}

## Avaliacao da sessao anterior (lacunas a focar)
${JSON.stringify(sessao.avaliacao_final)}

## Instrucoes
Gere um Cenario B alternativo que:
1. Avalia a MESMA competencia "${competencia.nome}" mas com situacao diferente
2. E adaptado ao perfil DISC do colaborador (perfil dominante: ${colaborador.perfil_dominante})
3. Foca especificamente nas lacunas identificadas na avaliacao anterior
4. As 4 alternativas (p1-p4) devem ter niveis progressivos de maturidade na competencia
5. A situacao deve ser realista e profissional

Retorne JSON no formato:
{
  "titulo": "Titulo do cenario",
  "descricao": "Descricao detalhada da situacao (2-3 paragrafos)",
  "p1": "Alternativa nivel 1 (menos madura)",
  "p2": "Alternativa nivel 2",
  "p3": "Alternativa nivel 3",
  "p4": "Alternativa nivel 4 (mais madura)",
  "justificativa_adaptacao": "Breve explicacao de como o cenario foi adaptado ao perfil DISC e lacunas"
}`;

    const resultado = await callAI(system, user, aiConfig, 32768);
    const cenarioData = await extractJSON(resultado);

    if (!cenarioData || !cenarioData.titulo) {
      return { success: false, error: 'IA nao retornou JSON valido para o cenario' };
    }

    // 6. INSERT into banco_cenarios
    const { data: novoCenario, error: insertErr } = await sb
      .from('banco_cenarios')
      .insert({
        competencia_id: competencia.id,
        titulo: cenarioData.titulo,
        descricao: cenarioData.descricao,
        p1: cenarioData.p1,
        p2: cenarioData.p2,
        p3: cenarioData.p3,
        p4: cenarioData.p4,
        origin: 'cenario_b',
        sessao_origem_id: sessaoId,
        justificativa_adaptacao: cenarioData.justificativa_adaptacao || null,
      })
      .select()
      .single();

    if (insertErr) {
      return { success: false, error: `Erro ao salvar cenario: ${insertErr.message}` };
    }

    return { success: true, cenario: novoCenario };
  } catch (err) {
    console.error('[gerarCenarioB] Error:', err);
    return { success: false, error: err.message };
  }
}
