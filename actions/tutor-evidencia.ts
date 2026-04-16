'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from './ai-client';
import { extractJSON } from './utils';

/**
 * Avalia a qualidade de uma evidência submetida pelo colaborador.
 * Baseado em GAS Fase4 tutor.js — 5 critérios de avaliação.
 *
 * @param {string} colaboradorId
 * @param {string} empresaId
 * @param {number} semana
 * @param {string} evidenciaTexto
 * @returns {{ success, feedback, pontos, avaliacao }}
 */
export async function avaliarEvidencia(colaboradorId: string, empresaId: string, semana: number, evidenciaTexto: string) {
  const sb = createSupabaseAdmin();

  try {
    // Carregar contexto
    const { data: colab } = await sb.from('colaboradores')
      .select('nome_completo, cargo, perfil_dominante')
      .eq('id', colaboradorId).single();

    const { data: envio } = await sb.from('fase4_envios')
      .select('sequencia, competencia_id')
      .eq('colaborador_id', colaboradorId)
      .eq('status', 'ativo')
      .single();

    let pilulaAtual = null;
    let competenciaNome = '';
    try {
      const seq = typeof envio?.sequencia === 'string' ? JSON.parse(envio.sequencia) : envio?.sequencia || [];
      if (semana <= seq.length) pilulaAtual = seq[semana - 1];
    } catch {}

    if (envio?.competencia_id) {
      const { data: comp } = await sb.from('competencias')
        .select('nome').eq('id', envio.competencia_id).single();
      competenciaNome = comp?.nome || '';
    }

    const system = `Voce e o tutor da Vertho avaliando uma evidencia de pratica semanal.
Avalie a evidencia em 5 criterios (0-2 pontos cada, total 0-10):

1. CONCRETUDE: A pessoa descreve uma acao CONCRETA que realizou? (nao abstrata ou hipotetica)
2. AUTENTICIDADE: Parece uma experiencia REAL vivida? (nao copiada ou inventada)
3. REFLEXAO: Mostra compreensao do PORQUE (nao apenas o QUE)?
4. IMPACTO: Menciona resultado ou consequencia da acao?
5. APLICACAO: Conecta com proximos passos ou aprendizado continuo?

Tom do feedback: acolhedor, motivacional, especifico. Adapte ao perfil DISC:
- Alto D: direto, foco em resultados
- Alto I: inspirador, foco em impacto
- Alto S: encorajador, foco em processo
- Alto C: detalhado, foco em qualidade

Responda APENAS com JSON valido.`;

    const user = `Colaborador: ${colab?.nome_completo || 'Colaborador'}
Cargo: ${colab?.cargo || 'N/A'}
Perfil DISC: ${colab?.perfil_dominante || 'N/A'}
Competencia em foco: ${competenciaNome}
Semana: ${semana}
Pilula da semana: ${pilulaAtual?.titulo || 'N/A'}

Evidencia submetida:
"${evidenciaTexto}"

Avalie e gere feedback:
{
  "criterios": {
    "concretude": {"nota": 0-2, "comentario": "breve"},
    "autenticidade": {"nota": 0-2, "comentario": "breve"},
    "reflexao": {"nota": 0-2, "comentario": "breve"},
    "impacto": {"nota": 0-2, "comentario": "breve"},
    "aplicacao": {"nota": 0-2, "comentario": "breve"}
  },
  "pontos_total": 0-10,
  "feedback": "3-5 frases personalizadas: elogio especifico + 1 sugestao de melhoria + motivacao",
  "qualidade": "excelente|boa|regular|insuficiente"
}`;

    const resultado = await callAI(system, user, {}, 1024);
    const avaliacao = await extractJSON(resultado);

    if (!avaliacao) {
      return { success: true, feedback: 'Obrigado pela sua evidência! Continue praticando.', pontos: 5, avaliacao: null };
    }

    // Salvar pontuação na capacitação
    const pontos = avaliacao.pontos_total || 5;
    await sb.from('capacitacao')
      .update({
        pontos,
        evidencia_avaliacao: avaliacao,
        pilula_ok: true,
      })
      .eq('colaborador_id', colaboradorId)
      .eq('empresa_id', empresaId)
      .eq('semana', semana)
      .eq('tipo', 'evidencia');

    return {
      success: true,
      feedback: avaliacao.feedback || 'Obrigado pela sua evidência!',
      pontos,
      avaliacao,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
