'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from './ai-client';
import { extractJSON } from './utils';

// ── Simulador de Conversas (para testes) ────────────────────────────────────
// Gera conversas fictícias com distribuição realista de níveis:
// 30% fraco (N1-2), 50% médio (N2-3), 20% forte (N3-4)
// Cada conversa: 8-12 turnos alternados (mentor + colaborador)

export async function listarSessoesPendentes(empresaId) {
  const sb = createSupabaseAdmin();

  // Buscar colaboradores com top5 selecionadas
  const { data: top10 } = await sb.from('top10_cargos')
    .select('cargo, competencia_id, competencia:competencias(id, nome, cod_comp)')
    .eq('empresa_id', empresaId)
    .order('cargo');

  if (!top10?.length) return { success: false, error: 'Nenhuma Top 10 encontrada' };

  // Buscar colaboradores
  const { data: colabs } = await sb.from('colaboradores')
    .select('id, nome_completo, email, cargo')
    .eq('empresa_id', empresaId);

  if (!colabs?.length) return { success: false, error: 'Nenhum colaborador encontrado' };

  // Buscar sessões existentes
  const { data: sessoes } = await sb.from('sessoes_avaliacao')
    .select('colaborador_id, competencia_id, status')
    .eq('empresa_id', empresaId);

  const sessaoMap = {};
  (sessoes || []).forEach(s => { sessaoMap[`${s.colaborador_id}::${s.competencia_id}`] = s.status; });

  // Montar lista: colaborador × competência (do cargo do colaborador)
  const pendentes = [];
  for (const colab of colabs) {
    const compsDoCargoColab = top10.filter(t => t.cargo === colab.cargo);
    for (const t of compsDoCargoColab) {
      const key = `${colab.id}::${t.competencia_id}`;
      const status = sessaoMap[key];
      pendentes.push({
        colaborador_id: colab.id,
        nome: colab.nome_completo || colab.email,
        cargo: colab.cargo,
        competencia_id: t.competencia_id,
        competencia_nome: t.competencia?.nome || '—',
        status: status || 'nao_iniciada',
        jaConcluida: status === 'concluida',
      });
    }
  }

  return { success: true, data: pendentes };
}

export async function simularUmaConversa(empresaId, colaboradorId, competenciaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    // Buscar dados
    const { data: colab } = await sb.from('colaboradores')
      .select('id, nome_completo, email, cargo').eq('id', colaboradorId).single();
    if (!colab) return { success: false, error: 'Colaborador não encontrado' };

    const { data: comp } = await sb.from('competencias')
      .select('id, nome, cod_comp, descricao').eq('id', competenciaId).single();
    if (!comp) return { success: false, error: 'Competência não encontrada' };

    // Buscar cenário
    const { data: cenario } = await sb.from('banco_cenarios')
      .select('id, titulo, descricao, alternativas')
      .eq('empresa_id', empresaId)
      .eq('competencia_id', competenciaId)
      .eq('cargo', colab.cargo)
      .limit(1).maybeSingle();

    // Sortear nível alvo (distribuição realista)
    const rand = Math.random();
    let nivelAlvo, perfilResp;
    if (rand < 0.30) {
      nivelAlvo = Math.random() < 0.5 ? 1 : 2;
      perfilResp = 'FRACO: respostas vagas, genéricas, defensivas. Evita exemplos concretos. Usa "acho que sim", "depende". Não demonstra reflexão.';
    } else if (rand < 0.80) {
      nivelAlvo = Math.random() < 0.5 ? 2 : 3;
      perfilResp = 'MÉDIO: respostas com alguma substância mas inconsistentes. Exemplos genéricos. Reconhece dificuldades mas sem plano claro.';
    } else {
      nivelAlvo = Math.random() < 0.5 ? 3 : 4;
      perfilResp = 'FORTE: respostas detalhadas, exemplos concretos e reflexão. Demonstra intencionalidade e autocrítica. Propõe ações específicas.';
    }

    // Gerar conversa via IA
    const system = `Você vai SIMULAR uma entrevista completa entre um Mentor IA e um colaborador.
Gere EXATAMENTE 8-12 turnos alternados (assistant/user).

COLABORADOR: ${colab.nome_completo || colab.email}
CARGO: ${colab.cargo || 'Colaborador'}
COMPETÊNCIA AVALIADA: ${comp.nome}
${comp.descricao ? `DESCRIÇÃO: ${comp.descricao}` : ''}

${cenario ? `CENÁRIO:\nTítulo: ${cenario.titulo}\nContexto: ${cenario.descricao}` : ''}

PERFIL DE RESPOSTA (nível alvo ${nivelAlvo}):
${perfilResp}

REGRAS:
1. Mentor (assistant): apresenta cenário, faz perguntas abertas, aprofunda. NUNCA julga ou sugere.
2. Colaborador (user): responde conforme o PERFIL. Linguagem coloquial, realista.
3. Explore pelo menos 3 dimensões: Situação, Ação, Raciocínio, Autossensibilidade.
4. Último turno = assistant (encerramento agradecendo).

FORMATO: Responda SOMENTE JSON. Array de objetos:
[{"role":"assistant","content":"..."},{"role":"user","content":"..."},...]
Primeiro turno = assistant. Último turno = assistant.`;

    const resposta = await callAI(system, 'Gere a conversa simulada agora.', aiConfig, 8000);

    // Parsear conversa
    let conversa;
    try {
      const cleaned = resposta.replace(/```json|```/g, '').trim();
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (match) conversa = JSON.parse(match[0]);
    } catch {}
    if (!conversa) {
      conversa = await extractJSON(resposta);
      if (conversa && !Array.isArray(conversa)) conversa = conversa.conversa || conversa.messages;
    }
    if (!Array.isArray(conversa) || conversa.length < 6) {
      return { success: false, error: `Conversa simulada inválida (${conversa?.length || 0} turnos)` };
    }

    // Criar/atualizar sessão
    const { data: sessaoExistente } = await sb.from('sessoes_avaliacao')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('colaborador_id', colaboradorId)
      .eq('competencia_id', competenciaId)
      .maybeSingle();

    let sessaoId;
    if (sessaoExistente) {
      sessaoId = sessaoExistente.id;
      await sb.from('sessoes_avaliacao').update({
        status: 'concluida',
        fase: 'concluida',
        cenario_id: cenario?.id || null,
        mensagens_count: conversa.length,
        updated_at: new Date().toISOString(),
      }).eq('id', sessaoId);
      // Limpar mensagens anteriores
      await sb.from('mensagens_chat').delete().eq('sessao_id', sessaoId);
    } else {
      const { data: nova } = await sb.from('sessoes_avaliacao').insert({
        empresa_id: empresaId,
        colaborador_id: colaboradorId,
        competencia_id: competenciaId,
        competencia_nome: comp.nome,
        cenario_id: cenario?.id || null,
        status: 'concluida',
        fase: 'concluida',
        mensagens_count: conversa.length,
      }).select('id').single();
      sessaoId = nova?.id;
    }

    if (!sessaoId) return { success: false, error: 'Erro ao criar sessão' };

    // Salvar mensagens
    const mensagens = conversa.map((m, i) => ({
      sessao_id: sessaoId,
      role: m.role,
      content: m.content,
      ordem: i,
    }));

    const { error: msgErr } = await sb.from('mensagens_chat').insert(mensagens);
    if (msgErr) return { success: false, error: `Erro ao salvar mensagens: ${msgErr.message}` };

    return { success: true, message: `${colab.nome_completo}: ${conversa.length} turnos (N${nivelAlvo})`, nivelAlvo };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
