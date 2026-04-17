import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { callAIChat, callAI } from '@/actions/ai-client';
import { extractBlock, stripBlocks } from '@/actions/utils';
import { getOrCreatePromptVersion } from '@/lib/versioning';
import { requireUser, assertTenantAccess, assertColabAccess } from '@/lib/auth/request-context';
import { aiLimiter } from '@/lib/rate-limit';
import { csrfCheck } from '@/lib/csrf';

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
    const csrf = csrfCheck(req);
    if (csrf) return csrf;

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

function buildSystemPrompt(sessao: any, comp: any, cenario: any, totalTurnos: number): string {
  const faseInstrucao: Record<string, string> = {
    cenario: 'Apresente o cenario ao colaborador e peca que descreva como agiria. Ouca sem julgar.',
    aprofundamento: 'Faca perguntas abertas de aprofundamento. Busque evidencias concretas nas 5 dimensoes.',
    contraexemplo: 'Apresente uma situacao oposta ou desafio ao posicionamento anterior. Observe coerencia.',
    encerramento: 'Agradeca pela conversa. NAO revele avaliacao. Diga: "Voce recebera retorno em breve."',
  };

  return `═══ PAPEL ═══
Voce e a Mentor IA, uma ENTREVISTADORA comportamental da plataforma Vertho.
Seu UNICO objetivo e COLETAR EVIDENCIAS COMPORTAMENTAIS observaveis para
avaliacao posterior pela IA4. Voce NAO e coach, mentora ou consultora.
Voce FAZ PERGUNTAS e ESCUTA. Nada mais.

═══ TIPOS DE EVIDENCIA BUSCADOS ═══

Busque evidencias nestas 5 dimensoes (nao siga ordem fixa — deixe a resposta guiar):

1. SITUACAO — contexto concreto onde o comportamento aconteceu
   "Em que momento exatamente isso aconteceu?"
2. ACAO — o que o profissional FEZ/FARIA concretamente
   "O que voce fez nessa hora?" "Como voce reagiu?"
3. RACIOCINIO — criterio ou logica por tras da decisao
   "Por que escolheu esse caminho?" "O que pesou na sua decisao?"
4. CONSEQUENCIA — resultado percebido da acao
   "O que aconteceu depois?" "Como as pessoas reagiram?"
5. AUTOPERCEPÇÃO — reflexao sobre si e limitacoes
   "O que faria diferente hoje?" "O que foi mais dificil pra voce?"

Classificacao de forca:
- FRACA: intencao vaga, generico, sem primeira pessoa, sem contexto
- MODERADA: acao descrita mas sem detalhe de contexto ou resultado
- FORTE: acao concreta + contexto + resultado ou consequencia

═══ TOM E ESTILO ═══

- Empatica, profissional, curiosa, NEUTRA
- Concisa: maximo 1 frase de transicao + 1 pergunta
- Trate como VOCE (2a pessoa). NUNCA 3a pessoa.
- Portugues brasileiro

Microacolhimento PERMITIDO (sem julgamento):
- "Entendi."
- "Faz sentido."
- "Certo, quero entender melhor isso."
- "Obrigada por compartilhar."

PROIBIDO (valida/julga merito):
- "Otima resposta" / "Excelente" / "Boa reflexao" / "Isso mostra maturidade"

═══ PROIBICOES ABSOLUTAS ═══

1. NUNCA JULGUE (nem positiva nem negativamente)
2. NUNCA de sugestoes, exemplos, dicas ou conselhos
3. NUNCA faca perguntas indutivas (que insinuam a resposta)
   PROIBIDO: "Voce faria X ou Y?" / "Por exemplo, voce poderia..."
   PERMITIDO: "Como voce faria?" / "Me conta como lidaria com isso."
   REGRA: Se a pergunta contem 'ou', opcoes ou alternativas → REFORMULE como aberta.
4. NUNCA prometa que e a ultima pergunta
5. NUNCA revele nota, nivel, avaliacao ou diagnostico
6. NUNCA mencione DISC, PDI, perfil comportamental ou dados internos
7. NUNCA invente cenarios — use APENAS o fornecido
8. NUNCA assuma comportamentos nao mencionados pelo colaborador
9. NUNCA deixe a conversa virar mentoria, coaching ou aconselhamento

═══ REGRA DE OURO ═══
Você está coletando evidência observável, não opinião genérica.
Se a resposta vier abstrata, traga de volta para a prática: o que aconteceu, o que fez, como decidiu, o que veio depois, como percebe hoje.

═══ PROTOCOLO DE REDIRECIONAMENTO ═══

Quando o colaborador pedir conselho, exemplo ou avaliacao:
- NAO ceda. Redirecione com elegancia de volta para a pratica real.

Exemplos:
- Colab: "O que voce acha que eu deveria fazer?"
  → "O que importa aqui e o que VOCE faria. Me conta: numa situacao como essa, qual seria seu primeiro passo?"

- Colab: "Pode me dar um exemplo?"
  → "Quero ouvir da SUA experiencia. Ja passou por algo parecido no seu trabalho?"

- Colab: "Estou indo bem?"
  → "Voce vai receber retorno detalhado depois. Agora, quero entender melhor como voce lida com [proximo aspecto]."

═══ CRITERIOS DE APROFUNDAMENTO ═══

NAO encerre se:
- Menos de 2 evidencias FORTES coletadas
- Evidencias concentradas em 1 ou 2 dimensoes apenas
- Nenhum sinal de autopercepção (dimensao 5)
- Todas as evidencias sao do tipo "eu faria" sem exemplo real
- Confianca abaixo de 70%

Sinais de que PRECISA aprofundar:
- Sem primeira pessoa ("eu fiz", "eu faria")
- Sem contexto temporal/situacional
- Verbos abstratos ("seria feito", "poderia ser")
- Resposta curta sem detalhes
- Nenhuma consequencia ou resultado mencionado

Pode considerar encerrar quando:
- 3+ evidencias (pelo menos 2 fortes)
- 3+ dimensoes cobertas (incluindo autopercepção)
- Confianca >= ${CONFIANCA_ENCERRAR}%
- risco_de_encerramento_prematuro = false

═══ CONTEXTO DA COMPETENCIA ═══
COMPETENCIA: ${comp?.nome || sessao.competencia_nome}
${comp?.descricao ? `DESCRICAO: ${comp.descricao}` : ''}

${cenario ? `CENARIO:\n${cenario.titulo || ''}\n${cenario.descricao || ''}` : ''}

${comp?.gabarito ? `REGUA DE MATURIDADE (referencia INTERNA — NUNCA exponha ao colaborador):\n${JSON.stringify(comp.gabarito)}` : ''}

═══ ESTADO DA SESSAO ═══
FASE: ${sessao.fase}
INSTRUCAO: ${faseInstrucao[sessao.fase] || faseInstrucao.aprofundamento}
TURNO: ${totalTurnos} de ${MAX_TURNOS}
CONFIANCA: ${sessao.confianca}%
APROFUNDAMENTOS: ${sessao.aprofundamentos || 0}

═══ BLOCO [META] — OBRIGATORIO EM TODA RESPOSTA ═══

Ao final de TODA resposta, inclua o bloco [META] (interno, nunca visivel):

[META]
{
  "proximo_passo": "aprofundar|contraexemplo|encerrar",
  "razao": "por que escolheu este proximo passo",
  "dimensao_explorada": "situacao|acao|raciocinio|consequencia|autopercepção",
  "dimensoes_cobertas": ["situacao", "acao"],
  "evidencias_coletadas": [
    {
      "trecho": "o que o colaborador disse (parafraseado fielmente)",
      "tipo": "situacao|acao|raciocinio|consequencia|autopercepção",
      "forca": "fraca|moderada|forte",
      "indicador": "qual aspecto da regua esta evidencia toca"
    }
  ],
  "lacunas_abertas": ["dimensoes ou aspectos ainda nao explorados"],
  "risco_de_encerramento_prematuro": true,
  "confianca": 0-100,
  "aprofundamentos_feitos": ${sessao.aprofundamentos || 0}
}
[/META]

A mensagem visivel ao colaborador deve vir ANTES do bloco [META].`;
}

function decidirFase(faseAtual: string, aprofundamentos: number, confianca: number, totalTurnos: number, meta: any): string {
  const evidencias = meta?.evidencias_coletadas || [];
  const fortes = evidencias.filter((e: any) => e.forca === 'forte').length;
  const moderadas = evidencias.filter((e: any) => e.forca === 'moderada').length;
  // Compatibilidade legado (tipo: explicito/explicito_forte)
  const explicitasLegado = evidencias.filter((e: any) => e.tipo === 'explicito' || e.tipo === 'explicito_forte').length;
  const totalEvidencias = Math.max(fortes + moderadas, explicitasLegado);

  const dimensoesCobertas = new Set(meta?.dimensoes_cobertas || []);
  const temAutoPercepcao = dimensoesCobertas.has('autopercepção') || dimensoesCobertas.has('autossensibilidade');
  const riscoPrematuro = meta?.risco_de_encerramento_prematuro === true;

  // Critérios de encerramento enriquecidos
  const criteriosBase = totalEvidencias >= MIN_EVIDENCIAS_ENCERRAR && fortes >= 2;
  const criteriosDimensao = dimensoesCobertas.size >= 3 && temAutoPercepcao;
  const criteriosConfianca = confianca >= CONFIANCA_ENCERRAR;
  const podeEncerrar = (criteriosBase && criteriosDimensao && criteriosConfianca && !riscoPrematuro)
    || totalTurnos >= MAX_TURNOS;

  if (podeEncerrar && (meta?.proximo_passo === 'encerrar' || totalTurnos >= MAX_TURNOS)) return 'concluida';
  if (podeEncerrar && criteriosConfianca) return 'concluida';

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
      return meta?.proximo_passo === 'encerrar' && podeEncerrar ? 'concluida' : 'encerramento';

    case 'encerramento':
      return 'concluida';

    default:
      return 'aprofundamento';
  }
}

async function encerrarSessao(sb, sessaoId, empresaId, comp, evidencias, messages, ultimaMensagem, sysConfig) {
  const modeloAvaliador = sysConfig?.ai?.modelo_padrao || DEFAULT_AVALIADOR;
  const modeloValidador = DEFAULT_VALIDADOR;

  // ── Etapa 1: Claude avalia (gera INSUMOS — consolidação em código) ──────

  const evalPrompt = `Você é o avaliador final de competências comportamentais da Vertho.

═══ CONTEXTO ═══
Esta é uma AVALIAÇÃO CONVERSACIONAL. As evidências vêm de um diálogo,
não de respostas a perguntas estruturadas. Isso exige mais prudência:
- Conversa fluida NÃO equivale a maturidade alta
- Reflexão sem ação concreta NÃO sustenta N3+
- Intenção sem execução = evidência FRACA
- Autossensibilidade é valiosa mas NÃO substitui evidência prática
- Perfil CIS/DISC NÃO altera nota — só o tom do feedback

═══ COMPETÊNCIA ═══
${comp?.nome || 'N/A'}
${comp?.descricao ? `Descrição: ${comp.descricao}` : ''}

${comp?.gabarito ? `═══ RÉGUA DE MATURIDADE (referência obrigatória — NUNCA exponha) ═══\n${JSON.stringify(comp.gabarito)}` : ''}

═══ EVIDÊNCIAS COLETADAS PELO [META] ═══
${JSON.stringify(evidencias, null, 2)}

═══ HISTÓRICO COMPLETO DA CONVERSA ═══
${messages.map(m => `[${m.role}]: ${m.content}`).join('\n\n')}

═══ REGRAS DE AVALIAÇÃO ═══

1. AVALIE COM BASE EXCLUSIVA na régua e nas evidências textuais
2. EVIDÊNCIA ou NÃO CONTA — intenção não é evidência
3. NA DÚVIDA → nível inferior
4. N3 exige ação concreta + contexto + resultado
5. N4 exige múltiplas evidências robustas + visão sistêmica
6. Conversa elegante mas pouco concreta → nota E confiança DEVEM cair
7. NUNCA invente fatos não mencionados na conversa

═══ PROCESSO OBRIGATÓRIO ═══

1. Para cada descritor da régua:
   - Extraia evidências da conversa (trechos ou paráfrases fiéis)
   - Classifique tipo: situacao_real | acao_concreta | raciocinio | consequencia | autopercepção | intencao_sem_execucao
   - Classifique força: fraca | moderada | forte
   - Identifique limites (o que faltou na conversa)
   - Sugira nota_decimal (1.00-4.00) e nível (1-4)
2. Gere feedback personalizado (cite trechos REAIS)
3. NÃO calcule média, nível geral, gap ou travas — isso é feito em código

═══ FORMATO: BLOCO [EVAL] ═══

[EVAL]
{
  "competencia": "${comp?.nome || ''}",
  "avaliacao_por_descritor": [
    {
      "descritor": "nome do descritor",
      "evidencias": [
        {"trecho": "o que disse", "tipo": "acao_concreta", "forca": "forte", "fonte": "historico"}
      ],
      "limites_da_conversa": ["o que não foi demonstrado"],
      "nota_sugerida": 2.33,
      "nivel_sugerido": 2,
      "confianca": 0.75,
      "racional": "Por que este nível (1 frase)"
    }
  ],
  "insumos_consolidacao": {
    "descritores_fortes": ["D1"],
    "descritores_frageis": ["D3"],
    "descritores_sem_sustentacao": ["D5"],
    "alertas_metodologicos": ["conversa curta", "sem autopercepção"]
  },
  "descritores_destaque": {
    "pontos_fortes": [{"descritor": "nome", "nivel": 3, "evidencia_resumida": ""}],
    "gaps_prioritarios": [{"descritor": "nome", "nivel": 1, "o_que_faltou": ""}]
  },
  "feedback": {
    "resumo_geral": "2-3 frases de visão geral",
    "mensagem_positiva": "O que fez bem (cite trecho real)",
    "mensagem_construtiva": "Onde melhorar (tom mentor, sem jargão)"
  },
  "recomendacoes_pdi": [
    {"descritor_foco": "nome", "acao": "ação concreta e prática"}
  ]
}
[/EVAL]

REGRAS DO JSON:
- nota_sugerida: 1.00 a 4.00
- confianca: 0.0 a 1.0
- tipo: situacao_real | acao_concreta | raciocinio | consequencia | autopercepção | intencao_sem_execucao
- forca: fraca | moderada | forte
- NÃO inclua nivel_geral, gap nem travas — o código calcula`;

  const evalPromptVersionId = await getOrCreatePromptVersion(
    'avaliacao_ia4_conversacional', modeloAvaliador, evalPrompt, { max_tokens: 8192 }
  );

  let rascunho: any = null;
  try {
    const evalResponse = await callAI(evalPrompt, '', { model: modeloAvaliador }, 8192);
    rascunho = await extractBlock(evalResponse, 'EVAL');
  } catch (err: any) {
    console.error('[encerrarSessao] Avaliação falhou:', err.message);
  }

  // ── Consolidação em código ──
  if (rascunho?.avaliacao_por_descritor) {
    const descPorDescritor = rascunho.avaliacao_por_descritor;
    const notasPorDesc: Record<string, any> = {};
    for (const d of descPorDescritor) {
      const nota = Math.max(1.0, Math.min(4.0, d.nota_sugerida || d.nota_decimal || 1.0));
      notasPorDesc[d.descritor] = {
        nome: d.descritor,
        nota_decimal: Math.round(nota * 100) / 100,
        nivel: Math.floor(nota),
        confianca: d.confianca || 0,
      };
    }

    const notas = Object.values(notasPorDesc).map((d: any) => d.nota_decimal);
    const media = notas.length ? Math.round((notas.reduce((a: number, b: number) => a + b, 0) / notas.length) * 100) / 100 : 0;
    let nivelGeral = Math.floor(media);

    const travas: string[] = [];
    const nN1 = Object.values(notasPorDesc).filter((d: any) => d.nivel === 1).length;
    if (nN1 > 3) { nivelGeral = Math.min(nivelGeral, 1); travas.push(`${nN1} descritores N1 → max N1`); }
    else if (nN1 > 0 && nivelGeral > 2) { nivelGeral = Math.min(nivelGeral, 2); travas.push('Descritor N1 → max N2'); }
    const temN3 = Object.values(notasPorDesc).some((d: any) => d.nivel >= 3);
    if (temN3 && nivelGeral < 2) { nivelGeral = 2; travas.push('Evidência N3 → mínimo N2'); }
    nivelGeral = Math.max(1, Math.min(4, nivelGeral));

    const confs = Object.values(notasPorDesc).map((d: any) => d.confianca).filter((c: number) => c > 0);
    const confGeral = confs.length ? Math.round((confs.reduce((a, b) => a + b, 0) / confs.length) * 100) / 100 : 0;

    rascunho.consolidacao = {
      notas_por_descritor: notasPorDesc,
      media_descritores: media,
      nivel_geral: nivelGeral,
      gap: Math.max(0, 3 - nivelGeral),
      confianca_geral: Math.round(confGeral * 100),
      travas_aplicadas: travas.length ? travas : ['Nenhuma'],
    };
    rascunho.nivel = nivelGeral;
    rascunho.nota_decimal = media;
    rascunho.lacuna = -Math.max(0, 3 - nivelGeral);

    // Feedback como string (compatibilidade)
    if (typeof rascunho.feedback === 'object') {
      const fb = rascunho.feedback;
      rascunho.feedback_text = [fb.resumo_geral, fb.mensagem_positiva, fb.mensagem_construtiva].filter(Boolean).join('\n');
    }
  }

  if (!rascunho) {
    rascunho = {
      nivel: 2, nota_decimal: 2.0, lacuna: -1.0,
      consolidacao: { nivel_geral: 2, media_descritores: 2.0, gap: 1, confianca_geral: 0, travas_aplicadas: ['Fallback'] },
      feedback: { resumo_geral: 'Avaliação gerada por fallback (falha no LLM).' },
    };
  }

  // ── Etapa 2: Gemini audita (avaliação conversacional) ──────────────────

  const auditPrompt = `Você é um auditor de qualidade de avaliações comportamentais da Vertho.

═══ CONTEXTO ═══
Você está auditando uma AVALIAÇÃO CONVERSACIONAL — baseada em diálogo,
não em prova estruturada. Isso exige atenção especial:
- Evidência concreta vale mais que eloquência na conversa
- Reflexão sem ação concreta NÃO sustenta nota alta sozinha
- Autossensibilidade é valiosa mas NÃO substitui comportamento demonstrado
- A avaliação NÃO pode inferir fatos ou impactos não mencionados na conversa

═══ COMPETÊNCIA ═══
${comp?.nome || 'N/A'}
${comp?.gabarito ? `\n═══ RÉGUA ═══\n${JSON.stringify(comp.gabarito)}` : ''}

═══ AVALIAÇÃO A AUDITAR (gerada por outro modelo de IA) ═══
${JSON.stringify(rascunho, null, 2)}

═══ EVIDÊNCIAS ORIGINAIS COLETADAS ═══
${JSON.stringify(evidencias, null, 2)}

═══ HISTÓRICO DA CONVERSA ═══
${messages.map(m => `[${m.role}]: ${m.content}`).join('\n\n')}

═══ 6 CRITÉRIOS DE AUDITORIA ═══

1. ANCORAGEM EM EVIDÊNCIA (ok|ajustar|erro_grave)
   Cada nota está ancorada em evidência textual real da conversa?
   Nota alta sem trecho concreto = ajustar.

2. COERÊNCIA NÍVEL × NOTA (ok|ajustar)
   O nível atribuído é coerente com a nota decimal e as travas aplicadas?

3. PRUDÊNCIA CONVERSACIONAL (ok|ajustar|erro_grave)
   A avaliação foi prudente o suficiente dado que é conversa (não prova)?
   Nota N3+ sem ação concreta demonstrada = erro grave.

4. ALUCINAÇÃO / EXTRAPOLAÇÃO (ok|ajustar|erro_grave)
   A avaliação inventou fatos, inferiu impactos não mencionados ou atribuiu
   comportamentos não demonstrados na conversa?

5. ESPECIFICIDADE DO FEEDBACK (ok|ajustar)
   O feedback cita trechos reais? É específico o suficiente pra ser útil?
   Feedback genérico ("boa comunicação") = ajustar.

6. QUALIDADE DAS RECOMENDAÇÕES (ok|ajustar)
   As recomendações de PDI são proporcionais à força da evidência?
   Recomendação sem base na conversa = ajustar.

═══ ERROS GRAVES ═══
- Nota N3+ sem evidência concreta demonstrada
- Fato inventado ou extrapolado
- Feedback que contradiz as evidências
→ Se houver erro grave: status = "reprovado" ou "corrigido" com nota reduzida

═══ CLASSIFICAÇÃO ═══
- aprovado: avaliação defensável como está
- corrigido: ajustes aplicados (preencher avaliacao_corrigida)
- reprovado: avaliação não utilizável (justificar por quê)

═══ FORMATO: BLOCO [AUDIT] ═══

[AUDIT]
{
  "status": "aprovado|corrigido|reprovado",
  "erro_grave": false,
  "criterios": {
    "ancoragem_evidencia": "ok|ajustar|erro_grave",
    "coerencia_nivel_nota": "ok|ajustar",
    "prudencia_conversacional": "ok|ajustar|erro_grave",
    "alucinacao_extrapolacao": "ok|ajustar|erro_grave",
    "especificidade_feedback": "ok|ajustar",
    "qualidade_recomendacoes": "ok|ajustar"
  },
  "ponto_mais_confiavel": "O que a avaliação fez melhor",
  "ponto_mais_fragil": "Onde a avaliação é mais vulnerável",
  "descritores_com_risco": ["descritores onde a nota parece frágil"],
  "tipo_de_erro_predominante": "extrapolação|falta_prudencia|generico|nenhum",
  "justificativa": "Avaliação geral da qualidade (2-3 frases)",
  "mudancas_aplicadas": ["lista de mudanças se status=corrigido"],
  "alertas_residuais": ["riscos que permanecem mesmo após correção"],
  "avaliacao_corrigida": null
}
[/AUDIT]

REGRAS:
- Se aprovado → avaliacao_corrigida = null
- Se corrigido → avaliacao_corrigida com mesma estrutura do rascunho (com ajustes)
- Se reprovado → justificativa deve explicar por que não é utilizável
- Prefira rigor metodológico a elegância`;

  const auditPromptVersionId = await getOrCreatePromptVersion(
    'auditoria_gemini_conversacional', modeloValidador, auditPrompt, { max_tokens: 8192 }
  );

  let audit: any = null;
  try {
    const auditResponse = await callAI(auditPrompt, '', { model: modeloValidador }, 8192);
    audit = await extractBlock(auditResponse, 'AUDIT');
  } catch (err: any) {
    console.error('[encerrarSessao] Auditoria falhou:', err.message);
  }

  // ── Validação do audit ──
  if (audit) {
    if (audit.status === 'aprovado' && audit.avaliacao_corrigida) {
      audit.avaliacao_corrigida = null;
    }
    if (audit.status === 'corrigido' && !audit.avaliacao_corrigida) {
      console.warn('[encerrarSessao] Audit marcou corrigido sem avaliacao_corrigida — tratando como aprovado');
      audit.status = 'aprovado';
    }
  }

  // ── Etapa 3: Consolidar resultado ───────────────────────────────────────

  let avaliacaoFinal: any;
  if (audit?.status === 'corrigido' && audit.avaliacao_corrigida) {
    avaliacaoFinal = audit.avaliacao_corrigida;
    // Re-consolidar em código se veio com avaliacao_por_descritor
    if (avaliacaoFinal.avaliacao_por_descritor && !avaliacaoFinal.consolidacao?.media_descritores) {
      const descs = avaliacaoFinal.avaliacao_por_descritor;
      const notasCorr = descs.map((d: any) => Math.max(1, Math.min(4, d.nota_sugerida || d.nota_decimal || 1)));
      const mediaCorr = notasCorr.length ? Math.round((notasCorr.reduce((a: number, b: number) => a + b, 0) / notasCorr.length) * 100) / 100 : 0;
      avaliacaoFinal.nivel = Math.floor(mediaCorr);
      avaliacaoFinal.nota_decimal = mediaCorr;
      avaliacaoFinal.lacuna = -Math.max(0, 3 - avaliacaoFinal.nivel);
    }
  } else if (audit?.status === 'reprovado') {
    avaliacaoFinal = { ...rascunho, _reprovado: true, _motivo: audit.justificativa };
  } else {
    avaliacaoFinal = rascunho;
  }

  // ── Etapa 4: Persistir ────────────────────────────────────────────────

  await sb.from('sessoes_avaliacao').update({
    status: audit?.status === 'reprovado' ? 'reprovado' : 'concluido',
    fase: 'concluida',
    rascunho_avaliacao: rascunho,
    validacao_audit: audit,
    avaliacao_final: avaliacaoFinal,
    modelo_avaliador: modeloAvaliador,
    modelo_validador: modeloValidador,
    nivel: avaliacaoFinal.nivel || avaliacaoFinal.consolidacao?.nivel_geral,
    nota_decimal: avaliacaoFinal.nota_decimal || avaliacaoFinal.consolidacao?.media_descritores,
    lacuna: avaliacaoFinal.lacuna,
    eval_prompt_version_id: evalPromptVersionId,
    audit_prompt_version_id: auditPromptVersionId,
  }).eq('id', sessaoId);

  return avaliacaoFinal;
}
