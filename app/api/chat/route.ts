import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { callAIChat, callAI } from '@/actions/ai-client';
import { extractBlock, stripBlocks } from '@/actions/utils';
import { getOrCreatePromptVersion } from '@/lib/versioning';
import { requireUser, assertTenantAccess, assertColabAccess } from '@/lib/auth/request-context';
import { aiLimiter } from '@/lib/rate-limit';

// ── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_AVALIADOR = 'claude-sonnet-4-6';
const DEFAULT_VALIDADOR = 'gemini-3-flash-preview';
const MAX_TURNOS = 10;
const CONFIANCA_ENCERRAR = 80;
const MIN_EVIDENCIAS_ENCERRAR = 2;
const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 4096;

// ── POST /api/chat ──────────────────────────────────────────────────────────

export async function POST(req) {
  try {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;

    const limited = aiLimiter.check(req, auth.email);
    if (limited) return limited;

    const body = await req.json();
    const { sessaoId, empresaId, colaboradorId, competenciaId, mensagem } = body;

    if (!empresaId || !colaboradorId || !competenciaId || !mensagem?.trim()) {
      return NextResponse.json({ ok: false, error: 'Campos obrigatórios: empresaId, colaboradorId, competenciaId, mensagem' }, { status: 400 });
    }

    // Valida tenant: empresaId do body tem que bater com auth (admin bypassa).
    const tenantGuard = assertTenantAccess(auth, empresaId);
    if (tenantGuard) return tenantGuard;

    // Valida acesso ao colaborador: próprio OU gestor/rh mesma empresa OU admin.
    const colabGuard = await assertColabAccess(auth, colaboradorId);
    if (colabGuard) return colabGuard;

    // Validar tamanho da mensagem (regra do GAS)
    const msgTrimmed = mensagem.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (msgTrimmed.length < MIN_MESSAGE_LENGTH) {
      return NextResponse.json({ ok: false, error: `Mensagem muito curta (mínimo ${MIN_MESSAGE_LENGTH} caracteres)` }, { status: 400 });
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
      // Sessão é fonte de verdade: validar ownership contra o contexto autenticado
      const sessaoColabGuard = await assertColabAccess(auth, data.colaborador_id);
      if (sessaoColabGuard) return sessaoColabGuard;
      if (data.empresa_id && data.empresa_id !== empresaId) {
        return NextResponse.json({ ok: false, error: 'sessaoId inconsistente com empresaId' }, { status: 403 });
      }
      if (data.colaborador_id !== colaboradorId) {
        return NextResponse.json({ ok: false, error: 'sessaoId inconsistente com colaboradorId' }, { status: 403 });
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
      content: msgTrimmed,
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
      const versaoRegua = (comp as any)?.versao_regua || 1;
      if (promptVersionId) {
        await sb.from('sessoes_avaliacao')
          .update({ prompt_version_id: promptVersionId, versao_regua: versaoRegua })
          .eq('id', sessao.id);
      }
    }

    const messages = [
      ...historico.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: msgTrimmed },
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
    cenario: 'Apresente o cenario ao colaborador e peca que descreva como agiria. Ouca sem julgar.',
    aprofundamento: 'Faca perguntas abertas de aprofundamento. Busque exemplos concretos, raciocinio e sentimentos.',
    contraexemplo: 'Apresente uma situacao oposta ou desafio ao posicionamento anterior. Observe coerencia.',
    encerramento: 'Agradeca pela conversa. NAO revele avaliacao. Diga: "Voce recebera retorno em breve."',
  };

  return `## PAPEL
Voce e a Mentor IA, uma ENTREVISTADORA comportamental da plataforma Vertho.
Seu UNICO objetivo e COLETAR EVIDENCIAS comportamentais do colaborador.
Voce NAO e coach, mentora, consultora ou professora.
Voce FAZ PERGUNTAS e ESCUTA. Nada mais.

## TOM E ESTILO
- Empatica, profissional, curiosa, neutra
- Concisa: maximo 1 frase de transicao + 1 pergunta
- Trate como VOCE (2a pessoa). NUNCA 3a pessoa.
- Em portugues brasileiro

## PROIBICOES ABSOLUTAS

### 1. NUNCA JULGUE (nem positiva nem negativamente)
PROIBIDO: 'Otima resposta', 'Excelente abordagem', 'Boa reflexao', 'Isso mostra maturidade', 'Interessante'

### 2. NUNCA DE SUGESTOES, EXEMPLOS OU DICAS
PROIBIDO: 'Voce poderia tambem...', 'Uma opcao seria...', 'Isso e importante porque...'

### 3. NUNCA FACA PERGUNTAS INDUTIVAS
Pergunta indutiva = pergunta que INSINUA a resposta certa.
PROIBIDO: 'Voce faria X ou Y?' (oferece opcoes), 'Por exemplo: voce anotaria, marcaria prazo, ou...?'
PERMITIDO (perguntas abertas puras): 'Como voce faria isso?', 'O que voce diria?', 'Me conta como lidaria com isso.'
REGRA DE OURO: Se a pergunta contem 'ou', 'por exemplo', opcoes ou alternativas — REFORMULE como pergunta aberta.

### 4. NUNCA PROMETA QUE E A ULTIMA PERGUNTA
### 5. NUNCA revele nota, nivel ou avaliacao
### 6. NUNCA mencione diagnostico anterior, PDI, perfil DISC ou dados internos
### 7. NUNCA invente cenarios — use APENAS o cenario fornecido
### 8. NUNCA assuma comportamentos nao mencionados pelo colaborador

## O QUE VOCE PODE FAZER
- Perguntas abertas sobre a experiencia do colaborador
- Pedir mais detalhes ('Conta mais sobre isso')
- Pedir exemplos reais ('Ja passou por algo assim?')
- Transicoes neutras CURTAS: 'Entendi.', 'Certo.'

## 4 DIMENSOES A EXPLORAR
SITUACAO, ACAO, RACIOCINIO, AUTOSSENSIBILIDADE.
NAO siga ordem fixa. Deixe a resposta guiar a proxima pergunta.

## COMO APROFUNDAR
Precisa de pelo menos 2 evidencias EXPLICITAS para encerrar.
- Evidencia explicita = acao concreta que ELE fez/faria (1a pessoa)
- Evidencia forte = explicita + especifica + com resultado

Sinais de que PRECISA aprofundar:
- Sem primeira pessoa ('eu fiz', 'eu faria')
- Sem contexto temporal/situacional
- Verbos abstratos ('seria feito', 'poderia ser')
- Resposta curta sem detalhes

Sinais de que pode ENCERRAR:
- 2+ evidencias explicitas mapeadas
- Exemplos reais com acoes concretas
- Confianca >= 80%

## CONTEXTO DA COMPETENCIA
COMPETENCIA: ${comp?.nome || sessao.competencia_nome}
${comp?.descricao ? `DESCRICAO: ${comp.descricao}` : ''}

${cenario ? `CENARIO:
${cenario.titulo || ''}
${cenario.descricao || ''}` : ''}

${comp?.gabarito ? `REGUA DE MATURIDADE (referencia interna — NUNCA exponha ao colaborador):
${JSON.stringify(comp.gabarito)}` : ''}

## ESTADO DA SESSAO
FASE ATUAL: ${sessao.fase}
INSTRUCAO: ${faseInstrucao[sessao.fase] || faseInstrucao.aprofundamento}
TURNO: ${totalTurnos} de ${MAX_TURNOS}
CONFIANCA ATUAL: ${sessao.confianca}%
APROFUNDAMENTOS: ${sessao.aprofundamentos || 0}

## BLOCO [META] — OBRIGATORIO EM TODA RESPOSTA

Ao final de TODA resposta, inclua:

[META]
{
  "proximo_passo": "aprofundar|contraexemplo|encerrar",
  "razao": "explicacao curta de por que escolheu este proximo passo",
  "dimensao_explorada": "situacao|acao|raciocinio|autossensibilidade",
  "dimensoes_cobertas": ["lista das ja exploradas"],
  "evidencias_coletadas": [
    {"trecho": "o que o colaborador disse", "indicador": "qual indicador da regua", "tipo": "explicito|explicito_forte|inferido"}
  ],
  "confianca": 0-100,
  "aprofundamentos_feitos": ${sessao.aprofundamentos || 0}
}
[/META]

A mensagem visivel ao colaborador deve vir ANTES do bloco [META].
O bloco [META] e INTERNO — nunca aparece para o colaborador.`;
}

function decidirFase(faseAtual, aprofundamentos, confianca, totalTurnos, meta) {
  // Contar evidências explícitas coletadas
  const evidenciasExplicitas = (meta?.evidencias_coletadas || [])
    .filter(e => e.tipo === 'explicito' || e.tipo === 'explicito_forte').length;

  // Encerrar se critérios atingidos (com mínimo de evidências — regra GAS)
  const podeEncerrar = evidenciasExplicitas >= MIN_EVIDENCIAS_ENCERRAR || totalTurnos >= MAX_TURNOS;
  if (podeEncerrar && (confianca >= CONFIANCA_ENCERRAR || totalTurnos >= MAX_TURNOS)) return 'concluida';
  if (podeEncerrar && meta?.proximo_passo === 'encerrar') return 'concluida';

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

  const evalPrompt = `Voce e o avaliador final de competencias comportamentais da Vertho.

COMPETENCIA: ${comp?.nome || 'N/A'}
${comp?.descricao ? `DESCRICAO: ${comp.descricao}` : ''}
${comp?.gabarito ? `REGUA DE MATURIDADE (use como referencia obrigatoria):\n${JSON.stringify(comp.gabarito)}` : ''}

EVIDENCIAS COLETADAS DURANTE A CONVERSA:
${JSON.stringify(evidencias, null, 2)}

HISTORICO COMPLETO DA CONVERSA:
${messages.map(m => `[${m.role}]: ${m.content}`).join('\n\n')}

## REGRAS DE AVALIACAO

### NIVEIS (N1-N4):
N1 (Gap/Emergente): Resposta funcional mas limitada, generica, reativa, sem 1a pessoa
N2 (Em Desenvolvimento): Intencao presente mas sem metodo ou consistencia
N3 (Proficiente/Meta): Acoes concretas, estruturadas, pratica consistente com resultado
N4 (Referencia): Articulacao de multiplas dimensoes, multiplicacao, impacto institucional

### NOTA DECIMAL:
A parte inteira = nivel. A parte decimal = forca dentro do nivel:
.00-.25 = atende minimo do nivel, lacunas significativas
.26-.50 = atende o nivel com algumas lacunas
.51-.75 = atende bem o nivel, poucas lacunas
.76-.99 = quase no proximo nivel, evidencias fortes

### TRAVAS DE SEGURANCA:
1. Se descritor CRITICO em N1 → nivel_geral MAXIMO N2
2. Se 3+ descritores em N1 → nivel_geral = N1
3. Na duvida entre dois niveis → escolha o INFERIOR

### FEEDBACK:
- Cite comportamentos REAIS observados nas respostas
- 3-5 paragrafos
- NAO mencione DISC, CIS, valores ou termos tecnicos
- Tom acolhedor e construtivo

Retorne APENAS um bloco [EVAL]:

[EVAL]
{
  "competencia": "${comp?.nome || ''}",
  "consolidacao": {
    "nivel_geral": 1-4,
    "nota_decimal": 0.00-4.99,
    "gap": 0-3,
    "confianca_geral": 0-100,
    "travas_aplicadas": ["descricao de travas usadas ou vazio"]
  },
  "descritores_destaque": {
    "pontos_fortes": [
      {"descritor": "nome", "nivel": 0, "evidencia_resumida": "trecho"}
    ],
    "gaps_prioritarios": [
      {"descritor": "nome", "nivel": 0, "o_que_faltou": "descricao"}
    ]
  },
  "evidencias": [
    {"trecho": "citacao literal da conversa", "indicador": "qual indicador da regua", "tipo": "explicito|explicito_forte|inferido"}
  ],
  "feedback": "texto personalizado 3-5 paragrafos",
  "recomendacoes_pdi": [
    {
      "descritor_foco": "qual descritor desenvolver",
      "nivel_atual": 0,
      "nivel_meta": 3,
      "acao": "acao concreta e pratica",
      "por_que_importa": "conexao com o contexto do colaborador",
      "barreira_provavel": "obstaculo realista"
    }
  ],
  "nivel": 1-4,
  "nota_decimal": 0.00-4.99,
  "lacuna": -3 a 0
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
