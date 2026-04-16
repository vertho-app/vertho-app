'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { callAI, type AIConfig } from './ai-client';
import { extractJSON } from './utils';

// ── Simulador de Respostas (para testes) ────────────────────────────────────
// Gera respostas fictícias às 4 perguntas de cada cenário.
// Distribuição realista: 30% fraco (N1-2), 50% médio (N2-3), 20% forte (N3-4)

export async function listarPendentesSimulacao(empresaId: string) {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);

  // Buscar cenários existentes
  const { data: cenarios } = await tdb.from('banco_cenarios')
    .select('id, cargo, competencia_id, titulo');

  if (!cenarios?.length) return { success: false, error: 'Nenhum cenário encontrado. Rode IA3 primeiro.' };

  // Buscar colaboradores
  const { data: colabs } = await tdb.from('colaboradores')
    .select('id, nome_completo, email, cargo');

  if (!colabs?.length) return { success: false, error: 'Nenhum colaborador encontrado' };

  // Buscar respostas existentes
  const { data: respostas } = await tdb.from('respostas')
    .select('colaborador_id, competencia_id');

  const respSet = new Set((respostas || []).map(r => `${r.colaborador_id}::${r.competencia_id}`));

  // Montar lista: colaborador × cenário (do cargo do colaborador)
  const pendentes: any[] = [];
  for (const colab of colabs) {
    const cenariosDoCargoColab = cenarios.filter(c => c.cargo === colab.cargo);
    for (const cen of cenariosDoCargoColab) {
      const key = `${colab.id}::${cen.competencia_id}`;
      pendentes.push({
        colaborador_id: colab.id,
        nome: colab.nome_completo || colab.email,
        cargo: colab.cargo,
        competencia_id: cen.competencia_id,
        cenario_id: cen.id,
        cenario_titulo: cen.titulo,
        jaRespondido: respSet.has(key),
      });
    }
  }

  return { success: true, data: pendentes };
}

export async function simularUmaResposta(empresaId: string, colaboradorId: string, cenarioId: string, aiConfig: AIConfig = {}) {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const sbRaw = createSupabaseAdmin();
  const tdb = tenantDb(empresaId);
  try {
    // Buscar colaborador
    const { data: colab } = await tdb.from('colaboradores')
      .select('id, nome_completo, email, cargo').eq('id', colaboradorId).single();
    if (!colab) return { success: false, error: 'Colaborador não encontrado' };

    // Buscar cenário com perguntas — banco_cenarios é misto, raw por id
    const { data: cenario } = await sbRaw.from('banco_cenarios')
      .select('id, titulo, descricao, alternativas, competencia_id, cargo')
      .eq('id', cenarioId).single();
    if (!cenario) return { success: false, error: 'Cenário não encontrado' };

    const perguntas = Array.isArray(cenario.alternativas) ? cenario.alternativas : [];
    if (perguntas.length < 4) return { success: false, error: `Cenário com ${perguntas.length} perguntas (precisa 4)` };

    // Buscar competência
    const { data: comp } = await tdb.from('competencias')
      .select('nome, descricao').eq('id', cenario.competencia_id).maybeSingle();

    // Sortear nível alvo
    const rand = Math.random();
    let nivelAlvo, perfilResp;
    if (rand < 0.30) {
      nivelAlvo = Math.random() < 0.5 ? 1 : 2;
      perfilResp = `FRACO (N${nivelAlvo}): Respostas vagas, genéricas, sem exemplos concretos. Usa "acho que sim", "depende", "faria o básico". Não demonstra reflexão. Respostas curtas (2-3 frases).`;
    } else if (rand < 0.80) {
      nivelAlvo = Math.random() < 0.5 ? 2 : 3;
      perfilResp = `MÉDIO (N${nivelAlvo}): Respostas com alguma substância mas inconsistentes. Dá exemplos genéricos. Reconhece dificuldades sem plano claro. Mostra intenção mas falta método. Respostas médias (3-5 frases).`;
    } else {
      nivelAlvo = Math.random() < 0.5 ? 3 : 4;
      perfilResp = `FORTE (N${nivelAlvo}): Respostas detalhadas com exemplos concretos e reflexão. Demonstra intencionalidade e autocrítica. Propõe ações específicas, conecta ao impacto. Respostas completas (4-7 frases).`;
    }

    // Gerar respostas via IA
    const system = `Você vai simular as respostas de um colaborador a 4 perguntas de um cenário de avaliação de competências.

COLABORADOR: ${colab.nome_completo || colab.email}
CARGO: ${colab.cargo}
COMPETÊNCIA: ${comp?.nome || 'Competência'}

CENÁRIO:
${cenario.descricao}

PERFIL DE RESPOSTA:
${perfilResp}

REGRAS:
- Respostas REALISTAS — linguagem coloquial, natural
- Coerentes com o perfil de nível indicado
- Cada resposta é independente mas coerente com o cenário
- NÃO use linguagem acadêmica ou perfeita
- Se nível fraco: hesitações, respostas incompletas, genéricas
- Se nível forte: exemplos concretos, reflexão, plano de ação

Retorne APENAS JSON:
{"r1": "resposta à P1", "r2": "resposta à P2", "r3": "resposta à P3", "r4": "resposta à P4"}`;

    const perguntasTexto = perguntas.map((p, i) =>
      `P${p.numero || i + 1}: ${p.texto || (typeof p === 'string' ? p : JSON.stringify(p))}`
    ).join('\n\n');

    const user = `Responda estas 4 perguntas como o colaborador descrito:\n\n${perguntasTexto}`;

    const resposta = await callAI(system, user, aiConfig, 4096);
    const resultado = await extractJSON(resposta);

    if (!resultado?.r1) return { success: false, error: 'IA não retornou respostas válidas' };

    // Salvar — empresa_id é injetado pelo tdb.upsert
    const { error: saveErr } = await tdb.from('respostas').upsert({
      colaborador_id: colaboradorId,
      competencia_id: cenario.competencia_id,
      cenario_id: cenarioId,
      r1: resultado.r1,
      r2: resultado.r2,
      r3: resultado.r3,
      r4: resultado.r4,
      nivel_simulado: nivelAlvo,
    }, { onConflict: 'empresa_id,colaborador_id,competencia_id' }).select('id');

    if (saveErr) return { success: false, error: `Erro ao salvar: ${saveErr.message}` };

    return { success: true, message: `${colab.nome_completo?.split(' ')[0]}: N${nivelAlvo} — ${comp?.nome || 'competência'}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
