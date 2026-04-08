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
      .select('id, empresa_id, colaborador_id, competencia_id, avaliacao_final, cenario_id')
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

    // 5. Build prompt — based on GAS CenarioBGenerator.js
    const system = `<PAPEL>
Especialista em avaliacao de competencias com 20 anos de experiencia.
Cria cenarios situacionais que funcionam como instrumentos diagnosticos.
</PAPEL>

<TAREFA>
Crie um CENARIO B complementar ao cenario A ja existente.
O cenario B usa a MESMA competencia mas com situacao-gatilho DIFERENTE.
</TAREFA>

<REGRAS_DE_CONSTRUCAO>
1. REALISMO CONTEXTUAL
   - Use elementos reais do contexto profissional
   - Nomeie personagens com nomes brasileiros
   - Inclua contexto temporal e situacional especifico

2. ESTRUTURA DO DILEMA
   - SITUACAO-PROBLEMA concreta, nao teorica
   - Tensao real: interesses conflitantes, urgencia, recursos limitados
   - NAO extrema — foco em dilemas cotidianos

3. PODER DISCRIMINANTE
   - Permite respostas em 4 niveis (N1-N4)
   - Diferenca nos niveis esta na complexidade, nao no tamanho

4. DIVERSIDADE EM RELACAO AO CENARIO A
   - Situacao-gatilho OBRIGATORIAMENTE diferente
   - Varie: momento do dia, atores, tipo de dilema
</REGRAS_DE_CONSTRUCAO>

Responda APENAS com JSON valido.`;

    const user = `## Competencia avaliada
Nome: ${competencia.nome}
Descricao: ${competencia.descricao}
Gabarito (regua por descritor): ${JSON.stringify(competencia.gabarito)}

## Perfil DISC do colaborador
Dominante: ${colaborador.perfil_dominante}
D=${colaborador.d_natural || 0}, I=${colaborador.i_natural || 0}, S=${colaborador.s_natural || 0}, C=${colaborador.c_natural || 0}

## Cenario A original (NAO repetir — crie algo DIFERENTE)
Titulo: ${cenarioOriginal.titulo}
Descricao: ${cenarioOriginal.descricao}

## Avaliacao da sessao anterior (lacunas a focar)
${JSON.stringify(sessao.avaliacao_final)}

## Formato de saida (JSON obrigatorio):
{
  "descricao": "contexto do cenario B (80-150 palavras com personagens e situacao concreta)",
  "personagens": "quem esta envolvido (nomes brasileiros fictícios)",
  "situacao_gatilho": "o que aconteceu (DIFERENTE do cenario A)",
  "pergunta_aprofund_1": "Dimensao SITUACAO — pergunta aberta",
  "pergunta_aprofund_2": "Dimensao ACAO — pergunta aberta",
  "pergunta_raciocinio": "Dimensao RACIOCINIO — pergunta aberta",
  "pergunta_cis": "Dimensao AUTOSSENSIBILIDADE — pergunta aberta",
  "objetivo_conversacional": "O que esta conversa deve evidenciar",
  "referencia_avaliacao": {
    "nivel_1": "que tipo de resposta indica N1",
    "nivel_2": "que tipo de resposta indica N2",
    "nivel_3": "que tipo de resposta indica N3",
    "nivel_4": "que tipo de resposta indica N4"
  },
  "faceta_avaliada": "qual aspecto especifico da competencia este cenario testa",
  "dilema_etico_embutido": {
    "valor_testado": "nome do valor etico em jogo",
    "caminho_facil": "o que a pessoa faria se cedesse",
    "caminho_etico": "o que a pessoa faria mantendo o valor"
  }
}`;

    const resultado = await callAI(system, user, aiConfig, 32768);
    const cenarioData = await extractJSON(resultado);

    if (!cenarioData || !cenarioData.descricao) {
      return { success: false, error: 'IA nao retornou JSON valido para o cenario' };
    }

    // 6. INSERT into banco_cenarios
    const { data: novoCenario, error: insertErr } = await sb
      .from('banco_cenarios')
      .insert({
        empresa_id: sessao.empresa_id || colaborador.empresa_id,
        competencia_id: competencia.id,
        titulo: cenarioData.faceta_avaliada || `Cenário B — ${competencia.nome}`,
        descricao: cenarioData.descricao,
        alternativas: cenarioData,
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
