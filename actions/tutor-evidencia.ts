'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from './ai-client';
import { extractJSON } from './utils';
import { requireUserAction } from '@/lib/auth/action-context';
import { resolverContextoSemanal } from '@/lib/fase4/contexto-semanal';

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
  const ctx = await requireUserAction();

  // `colaboradorId`/`empresaId` vêm do CLIENTE (este export é `'use server'` =
  // endpoint HTTP). O caller legítimo (`registrarEvidencia`) já os resolve pela
  // sessão via findColabByEmail — mas o export é chamável direto, e sem isto
  // qualquer autenticado lê colaborador de outro tenant E queima chamada de IA.
  // A evidência é a prática do PRÓPRIO colaborador: só o dono avalia a sua.
  if (!ctx.colaborador?.id || ctx.colaborador.id !== colaboradorId) {
    throw new Error('FORBIDDEN: não autorizado');
  }
  if (!ctx.empresaId || ctx.empresaId !== empresaId) {
    throw new Error('FORBIDDEN: não autorizado');
  }

  const sb = createSupabaseAdmin();

  try {
    // Carregar contexto. O `error` é checado de propósito: este arquivo inteiro
    // ficou anos entregando avaliação sem contexto porque o retorno do
    // supabase-js era descartado no destructuring (ele RETORNA `{ error }`, não
    // lança). Sem o nome/cargo/perfil, a avaliação sai genérica e ninguém vê.
    const { data: colab, error: errColab } = await sb.from('colaboradores')
      .select('nome_completo, cargo, perfil_dominante, empresa_id')
      .eq('id', colaboradorId).single();
    if (errColab) throw new Error(`colaboradores: ${errColab.message}`);

    // Contexto da semana pela TRILHA — ver `lib/fase4/contexto-semanal.ts`.
    //
    // 🔴 Isto lia `fase4_envios.competencia_id`, coluna que NUNCA existiu. O
    // PostgREST recusa a query inteira (400), então `envio` vinha null e o
    // `envio?.competencia_id` engolia em silêncio: `competenciaNome` ficava
    // vazio em TODA avaliação de evidência, e a `sequencia` (vazia nos 75
    // envios ativos) nunca daria a pílula.
    const contexto = await resolverContextoSemanal(sb, {
      colaboradorId,
      empresaId: (colab as any)?.empresa_id ?? null,
      cargo: (colab as any)?.cargo ?? null,
      semana,
    });

    const pilulaAtual = contexto?.pilula ?? null;
    const competenciaNome = contexto?.competencia || '';

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

    // Salvar pontuação na capacitação (tabela pode não existir em todos os ambientes)
    const pontos = avaliacao.pontos_total || 5;
    try {
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
    } catch (e) {
      console.warn('[avaliarEvidencia] capacitacao update falhou (tabela pode não existir):', e?.message);
    }

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
