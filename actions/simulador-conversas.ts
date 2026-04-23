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

    // Formato novo: alternativas.perguntas[{texto, numero}] ou alternativas.p1..p4 ou array direto
    const alt = cenario.alternativas || {};
    let perguntas: any[] = [];
    if (Array.isArray(alt)) {
      perguntas = alt;
    } else if (Array.isArray(alt.perguntas)) {
      perguntas = alt.perguntas;
    } else if (alt.p1) {
      perguntas = [alt.p1, alt.p2, alt.p3, alt.p4].filter(Boolean).map((t, i) => typeof t === 'string' ? { texto: t, numero: i + 1 } : t);
    }
    if (perguntas.length < 4) return { success: false, error: `Cenário com ${perguntas.length} perguntas (precisa 4)` };

    // Buscar competência
    const { data: comp } = await tdb.from('competencias')
      .select('nome, descricao').eq('id', cenario.competencia_id).maybeSingle();

    // Sortear nível alvo
    const rand = Math.random();
    let nivelAlvo: number, perfilLabel: string;
    if (rand < 0.30) {
      nivelAlvo = Math.random() < 0.5 ? 1 : 2;
      perfilLabel = 'fraco';
    } else if (rand < 0.80) {
      nivelAlvo = Math.random() < 0.5 ? 2 : 3;
      perfilLabel = 'medio';
    } else {
      nivelAlvo = Math.random() < 0.5 ? 3 : 4;
      perfilLabel = 'forte';
    }

    const perguntasTexto = perguntas.map((p, i) =>
      `P${p.numero || i + 1}: ${p.texto || (typeof p === 'string' ? p : JSON.stringify(p))}`
    ).join('\n\n');

    const system = `Você vai simular as respostas de um colaborador fictício a 4 perguntas de um cenário de avaliação de competências.

ATENÇÃO:
Seu papel NÃO é produzir a melhor resposta possível.
Seu papel é gerar respostas PLAUSÍVEIS, humanas e úteis para testar a robustez da IA avaliadora.

PRINCÍPIOS INEGOCIÁVEIS:
1. Escreva sempre em primeira pessoa.
2. Use português brasileiro natural.
3. Não use linguagem acadêmica.
4. Não mencione nível, rubrica, competência ou descritor.
5. As respostas devem soar humanas, não "treinadas para avaliação".
6. As 4 respostas devem variar naturalmente entre si.
7. Mesmo respostas fortes devem parecer de pessoa real.

PERFIS DE RESPOSTA:

FRACO (N1-2):
- vago, genérico, pouca estrutura, pouca consequência
- hesitação plausível ("acho", "tentaria", "depende")
- 2 a 4 frases por resposta
- sem caricatura

MÉDIO (N2-3):
- alguma substância mas inconsistente
- critério parcial, exemplo mais genérico
- 3 a 5 frases por resposta
- bom para gerar ambiguidade real de avaliação

FORTE (N3-4):
- ação concreta, critério claro, adaptação
- consequência percebida, autopercepção mais madura
- 4 a 7 frases por resposta
- ainda humano, sem soar ensaiado

REGRAS DE QUALIDADE:
- R1 a R4 precisam responder à lógica de cada pergunta
- não copie a mesma estrutura em todas
- P4 tende a trazer mais consciência de limite ou aprendizado
- use situações plausíveis para o cargo
- não escreva como consultor, professor ou IA

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto antes ou depois.
{"r1": "resposta P1", "r2": "resposta P2", "r3": "resposta P3", "r4": "resposta P4"}`;

    const user = `COLABORADOR: ${colab.nome_completo || colab.email}
CARGO: ${colab.cargo}
COMPETÊNCIA: ${comp?.nome || 'Competência'}
PERFIL-ALVO: ${perfilLabel} (N${nivelAlvo})

CENÁRIO:
${cenario.descricao}

PERGUNTAS:
${perguntasTexto}

Responda as 4 perguntas como esse colaborador responderia.`;

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
