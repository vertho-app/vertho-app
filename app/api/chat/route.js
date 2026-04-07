import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { callAIChat, callAI } from '@/actions/ai-client';
import { extractBlock, stripBlocks } from '@/actions/utils';
import { getOrCreatePromptVersion } from '@/lib/versioning';

// ── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_AVALIADOR = 'claude-sonnet-4-6';
const DEFAULT_VALIDADOR = 'gemini-2.5-flash-preview-05-20';
const MAX_TURNOS = 10;
const CONFIANCA_ENCERRAR = 80;

// ── POST /api/chat ──────────────────────────────────────────────────────────

export async function POST(req) {
  try {
    const body = await req.json();
    const { sessaoId, empresaId, colaboradorId, competenciaId, mensagem } = body;

    if (!empresaId || !colaboradorId || !competenciaId || !mensagem?.trim()) {
      return NextResponse.json({ ok: false, error: 'Campos obrigatórios: empresaId, colaboradorId, competenciaId, mensagem' }, { status: 400 });
    }

    const sb = createSupabaseAdmin();

    // ── 1. Carregar ou criar sessão ─────────────────────────────────────────

    let sessao;

    if (sessaoId) {
      const { data, error } = await sb.from('sessoes_avaliacao')
        .select('*').eq('id', sessaoId).single();
      if (error || !data) return NextResponse.json({ ok: false, error: 'Sessão não encontrada' }, { status: 404 });
      if (data.status === 'concluido') {
        return NextResponse.json({ ok: false, error: 'Sessão já concluída' }, { status: 400 });
      }
      sessao = data;
    } else {
      // Busca sessão ativa existente para esta competência
      const { data: existente } = await sb.from('sessoes_avaliacao')
        .select('*')
        .eq('colaborador_id', colaboradorId)
        .eq('competencia_id', competenciaId)
        .eq('status', 'em_andamento')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (existente) {
        sessao = existente;
      } else {
        // Criar nova sessão
        const { data: comp } = await sb.from('competencias')
          .select('nome').eq('id', competenciaId).single();

        const { data: cenario } = await sb.from('banco_cenarios')
          .select('id')
          .eq('empresa_id', empresaId)
          .eq('competencia_id', competenciaId)
          .limit(1)
          .single();

        const { data: nova, error: errCriacao } = await sb.from('sessoes_avaliacao')
          .insert({
            empresa_id: empresaId,
            colaborador_id: colaboradorId,
            competencia_id: competenciaId,
            competencia_nome: comp?.nome || 'Competência',
            cenario_id: cenario?.id || null,
            status: 'em_andamento',
            fase: 'cenario',
          })
          .select('*')
          .single();

        if (errCriacao) return NextResponse.json({ ok: false, error: errCriacao.message }, { status: 500 });
        sessao = nova;
      }
    }

    // ── 2. Carregar contexto ────────────────────────────────────────────────

    const [compResult, cenarioResult, histResult, empresaResult] = await Promise.all([
      sb.from('competencias').select('nome, descricao, gabarito, cod_comp').eq('id', sessao.competencia_id).single(),
      sessao.cenario_id
        ? sb.from('banco_cenarios').select('titulo, descricao, alternativas').eq('id', sessao.cenario_id).single()
        : { data: null },
      sb.from('mensagens_chat').select('role, content').eq('sessao_id', sessao.id).order('created_at'),
      sb.from('empresas').select('nome, sys_config').eq('id', empresaId).single(),
    ]);

    const comp = compResult.data;
    const cenario = cenarioResult.data;
    const historico = histResult.data || [];
    const empresa = empresaResult.data;
    const sysConfig = empresa?.sys_config || {};
    const modeloAvaliador = sysConfig?.ai?.modelo_padrao || DEFAULT_AVALIADOR;

    // ── 3. Salvar mensagem do usuário ───────────────────────────────────────

    await sb.from('mensagens_chat').insert({
      sessao_id: sessao.id,
      role: 'user',
      content: mensagem.trim(),
    });

    // ── 4. Contar turnos ────────────────────────────────────────────────────

    const totalTurnos = historico.filter(m => m.role === 'user').length + 1;

    // ── 5. Montar prompt e chamar IA ────────────────────────────────────────

    const systemPrompt = buildSystemPrompt(sessao, comp, cenario, totalTurnos);

    // Registrar versão do prompt (dedup por hash — só cria se mudou)
    if (totalTurnos === 1) {
      const promptVersionId = await getOrCreatePromptVersion(
        'conversa_fase3', modeloAvaliador, systemPrompt,
        { max_tokens: 1024, max_turnos: MAX_TURNOS, confianca_encerrar: CONFIANCA_ENCERRAR }
      );
      const versaoRegua = comp?.versao_regua || 1;
      if (promptVersionId) {
        await sb.from('sessoes_avaliacao')
          .update({ prompt_version_id: promptVersionId, versao_regua: versaoRegua })
          .eq('id', sessao.id);
      }
    }

    const messages = [
      ...historico.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: mensagem.trim() },
    ];

    let rawResponse;
    try {
      rawResponse = await callAIChat(systemPrompt, messages, { model: modeloAvaliador }, 1024);
    } catch (llmError) {
      // Fallback: salvar erro mas não derrubar sessão
      await sb.from('mensagens_chat').insert({
        sessao_id: sessao.id,
        role: 'assistant',
        content: 'Desculpe, tive um problema técnico. Pode repetir sua resposta?',
        metadata: { error: llmError.message },
      });
      return NextResponse.json({
        ok: true,
        sessaoId: sessao.id,
        fase: sessao.fase,
        status: sessao.status,
        confianca: sessao.confianca,
        mensagem: 'Desculpe, tive um problema técnico. Pode repetir sua resposta?',
        metadata: null,
        avaliacaoFinal: null,
      });
    }

    // ── 6. Parsear [META] ───────────────────────────────────────────────────

    const meta = await extractBlock(rawResponse, 'META');
    const visibleMessage = await stripBlocks(rawResponse);

    // ── 7. Decidir próxima fase ─────────────────────────────────────────────

    const confianca = meta?.confianca ?? sessao.confianca;
    const evidencias = meta?.evidencias
      ? [...(sessao.evidencias || []), ...meta.evidencias]
      : sessao.evidencias || [];

    const nextFase = decidirFase(sessao.fase, sessao.aprofundamentos, confianca, totalTurnos, meta);
    const deveEncerrar = nextFase === 'concluida' || totalTurnos >= MAX_TURNOS || confianca >= CONFIANCA_ENCERRAR;

    // ── 8. Salvar resposta do assistant ─────────────────────────────────────

    await sb.from('mensagens_chat').insert({
      sessao_id: sessao.id,
      role: 'assistant',
      content: visibleMessage,
      metadata: meta,
    });

    // ── 9. Atualizar sessão ─────────────────────────────────────────────────

    const updates = {
      fase: deveEncerrar ? 'encerramento' : nextFase,
      confianca,
      evidencias,
      aprofundamentos: nextFase === 'aprofundamento' ? (sessao.aprofundamentos || 0) + 1 : sessao.aprofundamentos,
    };

    await sb.from('sessoes_avaliacao').update(updates).eq('id', sessao.id);

    // ── 10. Se deve encerrar → avaliação + auditoria ────────────────────────

    let avaliacaoFinal = null;

    if (deveEncerrar) {
      avaliacaoFinal = await encerrarSessao(sb, sessao.id, empresaId, comp, evidencias, messages, visibleMessage, sysConfig);
    }

    return NextResponse.json({
      ok: true,
      sessaoId: sessao.id,
      fase: deveEncerrar ? 'concluida' : nextFase,
      status: deveEncerrar ? 'concluido' : 'em_andamento',
      confianca,
      mensagem: visibleMessage,
      metadata: meta,
      avaliacaoFinal,
    });

  } catch (err) {
    console.error('[POST /api/chat]', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function buildSystemPrompt(sessao, comp, cenario, totalTurnos) {
  const faseInstrucao = {
    cenario: 'Apresente o cenário ao colaborador e peça que descreva como agiria nessa situação. Ouça sem julgar.',
    aprofundamento: 'Faça perguntas de aprofundamento para entender melhor as evidências comportamentais. Busque exemplos concretos, raciocínio por trás das ações, e como a pessoa se sentiu.',
    contraexemplo: 'Apresente uma situação oposta ou um desafio ao posicionamento anterior. Observe se o colaborador mantém coerência ou revela lacunas.',
    encerramento: 'Agradeça pela conversa e faça um fechamento positivo. Não revele a avaliação.',
  };

  return `Você é um avaliador comportamental experiente e empático da plataforma Vertho Mentor IA.

COMPETÊNCIA AVALIADA: ${comp?.nome || sessao.competencia_nome}
${comp?.descricao ? `DESCRIÇÃO: ${comp.descricao}` : ''}

${cenario ? `CENÁRIO BASE:
${cenario.titulo || ''}
${cenario.descricao || ''}` : ''}

${comp?.gabarito ? `RÉGUA DE MATURIDADE (use como referência interna, não exponha ao colaborador):
${JSON.stringify(comp.gabarito)}` : ''}

FASE ATUAL: ${sessao.fase}
INSTRUÇÃO DA FASE: ${faseInstrucao[sessao.fase] || faseInstrucao.aprofundamento}
TURNO: ${totalTurnos} de ${MAX_TURNOS}
CONFIANÇA ATUAL: ${sessao.confianca}%

REGRAS:
- Seja acolhedor, profissional e empático
- NUNCA revele a nota, nível ou avaliação
- NUNCA induza respostas ou dê exemplos do que o colaborador deveria dizer
- Foque em evidências comportamentais reais
- Perguntas curtas e objetivas (2-3 frases no máximo)
- Em português brasileiro

OBRIGATÓRIO: Ao final de TODA resposta, inclua um bloco [META] com análise interna:

[META]
{
  "proximo_passo": "aprofundar|contraexemplo|encerrar",
  "fase_sugerida": "cenario|aprofundamento|contraexemplo|encerramento",
  "confianca": 0-100,
  "evidencias": [
    {"tipo": "comportamento|lacuna|valor", "texto": "evidência observada"}
  ],
  "sinais": {
    "clareza": 0-100,
    "profundidade": 0-100,
    "consistencia": 0-100
  }
}
[/META]

A mensagem visível ao colaborador deve vir ANTES do bloco [META].`;
}

function decidirFase(faseAtual, aprofundamentos, confianca, totalTurnos, meta) {
  // Encerrar se critérios atingidos
  if (confianca >= CONFIANCA_ENCERRAR || totalTurnos >= MAX_TURNOS) return 'concluida';
  if (meta?.proximo_passo === 'encerrar') return 'concluida';

  // State machine
  switch (faseAtual) {
    case 'cenario':
      return 'aprofundamento';

    case 'aprofundamento':
      if ((aprofundamentos || 0) >= 2 && confianca < CONFIANCA_ENCERRAR) {
        return meta?.proximo_passo === 'contraexemplo' ? 'contraexemplo' : 'aprofundamento';
      }
      if (meta?.proximo_passo === 'contraexemplo') return 'contraexemplo';
      return 'aprofundamento';

    case 'contraexemplo':
      return meta?.proximo_passo === 'encerrar' ? 'concluida' : 'encerramento';

    case 'encerramento':
      return 'concluida';

    default:
      return 'aprofundamento';
  }
}

async function encerrarSessao(sb, sessaoId, empresaId, comp, evidencias, messages, ultimaMensagem, sysConfig) {
  const modeloAvaliador = sysConfig?.ai?.modelo_padrao || DEFAULT_AVALIADOR;
  const modeloValidador = DEFAULT_VALIDADOR;

  // ── Etapa 1: Claude avalia ──────────────────────────────────────────────

  const evalPrompt = `Você é o avaliador final de competências comportamentais da Vertho.

COMPETÊNCIA: ${comp?.nome || 'N/A'}
${comp?.descricao ? `DESCRIÇÃO: ${comp.descricao}` : ''}
${comp?.gabarito ? `RÉGUA DE MATURIDADE:\n${JSON.stringify(comp.gabarito)}` : ''}

EVIDÊNCIAS COLETADAS:
${JSON.stringify(evidencias, null, 2)}

HISTÓRICO COMPLETO DA CONVERSA:
${messages.map(m => `[${m.role}]: ${m.content}`).join('\n\n')}

Avalie o colaborador e retorne APENAS um bloco [EVAL]:

[EVAL]
{
  "nivel": 1-4,
  "nota_decimal": 0.0-10.0,
  "lacuna": -2.0 a 0.0,
  "evidencias_principais": ["evidência 1", "evidência 2"],
  "feedback": {
    "pontos_fortes": ["ponto 1", "ponto 2"],
    "pontos_melhoria": ["ponto 1", "ponto 2"],
    "resumo": "Texto resumo da avaliação (2-3 frases)"
  }
}
[/EVAL]`;

  // Registrar versão do prompt de avaliação
  const evalPromptVersionId = await getOrCreatePromptVersion(
    'avaliacao_ia4', modeloAvaliador, evalPrompt, { max_tokens: 32768 }
  );

  let rascunho = null;
  try {
    const evalResponse = await callAI(evalPrompt, '', { model: modeloAvaliador }, 32768);
    rascunho = await extractBlock(evalResponse, 'EVAL');
  } catch (err) {
    console.error('[encerrarSessao] Avaliação falhou:', err.message);
  }

  if (!rascunho) {
    // Fallback: avaliação mínima
    rascunho = {
      nivel: 2, nota_decimal: 5.0, lacuna: -1.0,
      evidencias_principais: ['Avaliação automática (falha no LLM)'],
      feedback: { pontos_fortes: [], pontos_melhoria: [], resumo: 'Avaliação gerada por fallback.' },
    };
  }

  // ── Etapa 2: Gemini audita ────────────────────────────────────────────

  const auditPrompt = `Você é um auditor de qualidade de avaliações comportamentais.

COMPETÊNCIA AVALIADA: ${comp?.nome || 'N/A'}
${comp?.gabarito ? `RÉGUA:\n${JSON.stringify(comp.gabarito)}` : ''}

RASCUNHO DA AVALIAÇÃO (feita por outro modelo de IA):
${JSON.stringify(rascunho, null, 2)}

EVIDÊNCIAS ORIGINAIS:
${JSON.stringify(evidencias, null, 2)}

Audite esta avaliação em 6 critérios e retorne APENAS um bloco [AUDIT]:

[AUDIT]
{
  "status": "aprovado|corrigido|reprovado",
  "criterios": {
    "evidencias": "ok|ajustar",
    "nivel": "ok|ajustar",
    "nota": "ok|ajustar",
    "lacuna": "ok|ajustar",
    "alucinacoes": "ok|ajustar",
    "vies": "ok|ajustar"
  },
  "justificativa": "Explique brevemente sua decisão",
  "avaliacao_corrigida": null
}
[/AUDIT]

Se status="corrigido", preencha avaliacao_corrigida com a mesma estrutura do rascunho, mas com os valores ajustados.
Se status="aprovado", avaliacao_corrigida deve ser null.`;

  // Registrar versão do prompt de auditoria
  const auditPromptVersionId = await getOrCreatePromptVersion(
    'auditoria_gemini', modeloValidador, auditPrompt, { max_tokens: 65536 }
  );

  let audit = null;
  try {
    const auditResponse = await callAI(auditPrompt, '', { model: modeloValidador }, 65536);
    audit = await extractBlock(auditResponse, 'AUDIT');
  } catch (err) {
    console.error('[encerrarSessao] Auditoria falhou:', err.message);
  }

  // ── Etapa 3: Consolidar resultado ───────────────────────────────────────

  let avaliacaoFinal;
  if (audit?.status === 'corrigido' && audit.avaliacao_corrigida) {
    avaliacaoFinal = audit.avaliacao_corrigida;
  } else {
    avaliacaoFinal = rascunho;
  }

  // ── Etapa 4: Persistir ────────────────────────────────────────────────

  await sb.from('sessoes_avaliacao').update({
    status: 'concluido',
    fase: 'concluida',
    rascunho_avaliacao: rascunho,
    validacao_audit: audit,
    avaliacao_final: avaliacaoFinal,
    modelo_avaliador: modeloAvaliador,
    modelo_validador: modeloValidador,
    nivel: avaliacaoFinal.nivel,
    nota_decimal: avaliacaoFinal.nota_decimal,
    lacuna: avaliacaoFinal.lacuna,
    eval_prompt_version_id: evalPromptVersionId,
    audit_prompt_version_id: auditPromptVersionId,
  }).eq('id', sessaoId);

  return avaliacaoFinal;
}
