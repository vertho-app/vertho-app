// =====================================================================
// VERTHO — Reavaliacao.gs  (Semana 15 — Reavaliacao Conversacional)
//
// Conversa de 10-15 min entre Mentor IA e colaborador apos 14 semanas
// de trilha. A IA investiga o que MUDOU NA PRATICA — nao o que a pessoa
// aprendeu em teoria. Busca evidencias concretas de mudanca comportamental.
//
// FLUXO:
//   1. iniciarReavaliacaoConversacional(email, competenciaId) → cria sessao
//   2. continuarReavaliacao(sessaoId, mensagem) → turnos da conversa
//   3. _reaFinalizarSessao(sessaoId) → extrai JSON qualitativo
//   4. iniciarReavaliacaoLote() → menu batch
//
// DEPENDENCIAS:
//   - Código.js: _lerBaseCompetenciasV2, _carregarCFG, _CFG, _norm, _extrairJSON
//   - Fase2_Cenarios.js: _ia4ClaudeRawV2, _ia4OpenAIRawV2
//   - CISReferencia.js: getCISParaPDI
//   - ConversationController.js: _salvarTurno, _stripInvisible, _parseMeta
//   - StateManager.js: saveSessionState, getSession, getActiveSession
//   - DriveStorage.js: addTurn, getHistory
//   - Config.js: constantes de modelo, abas, limites
// =====================================================================


// ── Constantes do modulo ────────────────────────────────────────────
var REA_TIPO_SESSAO     = 'reavaliacao_conversa';
var REA_MAX_TURNOS      = 8;
var REA_ABA_TRILHAS     = 'Trilhas';
var REA_ABA_RESPOSTAS   = 'Respostas';
var REA_ABA_CAPACITACAO = 'Capacitacao';


// ═══════════════════════════════════════════════════════════════════════
// 1. ENTRY POINT — Iniciar reavaliacao conversacional
// ═══════════════════════════════════════════════════════════════════════

/**
 * Inicia sessao de reavaliacao conversacional para um colaborador.
 *
 * @param {string} email — E-mail corporativo do colaborador
 * @param {string} competenciaId — ID da competencia avaliada (ex: "C007")
 * @return {Object} { sessao_id, mensagem_abertura, erro }
 */
function iniciarReavaliacaoConversacional(email, competenciaId) {
  _carregarCFG();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Carregar dados do colaborador
  var colaborador = StateManager.getColaborador(email);
  if (!colaborador) {
    return { erro: true, mensagem: 'Colaborador nao encontrado: ' + email };
  }
  Logger.log('REA: Colaborador carregado — ' + colaborador.nome);

  // 2. Carregar avaliacao original (Cenario A — Respostas)
  var avaliacaoOriginal = _reaCarregarAvaliacaoOriginal(ss, email, competenciaId);
  if (!avaliacaoOriginal) {
    return { erro: true, mensagem: 'Avaliacao original nao encontrada para ' + email + ' / ' + competenciaId };
  }
  Logger.log('REA: Avaliacao original — nivel ' + avaliacaoOriginal.nivel + ', nota ' + avaliacaoOriginal.nota);

  // 3. Carregar dados da trilha realizada
  var trilhaRealizada = _reaCarregarTrilha(ss, email, competenciaId);
  Logger.log('REA: Trilha — ' + (trilhaRealizada.pilulas.length) + ' pilulas, ' + trilhaRealizada.desafios_realizados.length + ' desafios');

  // 4. Carregar detalhes da competencia (V2)
  var mapaV2 = _lerBaseCompetenciasV2(ss);
  var compNorm = competenciaId.toUpperCase().trim();
  var competenciaV2 = mapaV2[compNorm] || null;
  if (!competenciaV2) {
    // Fallback: tentar StateManager
    var compLegado = StateManager.getCompetencia(competenciaId);
    if (compLegado) {
      competenciaV2 = {
        codigo: compLegado.competencia_id,
        nome: compLegado.nome,
        descricao: compLegado.descricao,
        pilar: compLegado.categoria,
        cargo: compLegado.cargo,
        descritores: []
      };
    }
  }
  if (!competenciaV2) {
    return { erro: true, mensagem: 'Competencia nao encontrada: ' + competenciaId };
  }
  Logger.log('REA: Competencia — ' + competenciaV2.nome);

  // 5. Criar sessao
  var sessaoId = 'rea_' + Utilities.getUuid().replace(/-/g, '').substring(0, 12);
  var cicloId = _reaObterCicloAtivo(ss) || 'ciclo_rea';
  var agora = new Date().toISOString();

  var state = {
    sessao_id: sessaoId,
    ciclo_id: cicloId,
    colaborador_id: email,
    competencia_id: competenciaId,
    competencia: competenciaV2.nome || '',
    status: 'ativa',
    fase: 'reavaliacao',
    history: [],
    cenarios: [],
    baseline: avaliacaoOriginal,
    aprofundamentos_cenario1: 0,
    cenario_atual: 0,
    created_at: agora,
    updated_at: agora,
    tipo: REA_TIPO_SESSAO,
    colaborador: colaborador
  };

  // Salvar sessao no StateManager
  StateManager.saveSessionState(state);

  // Salvar no Drive
  try {
    DriveStorage.saveConversation(state);
  } catch (e) {
    Logger.log('REA: Erro ao salvar no Drive (init): ' + e.message);
  }

  // 6. Construir system prompt
  var systemPrompt = _reaBuildSystemPrompt(colaborador, avaliacaoOriginal, trilhaRealizada, competenciaV2);

  // 7. Gerar mensagem de abertura
  var primeiroNome = colaborador.nome ? colaborador.nome.split(' ')[0] : 'voce';
  var userPromptAbertura = 'Inicie a conversa de reavaliacao com ' + primeiroNome +
    '. Use o roteiro de ABERTURA. Seja acolhedor(a) e natural.';

  var respostaIA = _reaChamarIA(systemPrompt, [
    { role: 'user', content: userPromptAbertura }
  ]);

  // 8. Parsear META e salvar
  var meta = _parseMeta(respostaIA);
  var textoVisivel = _stripInvisible(respostaIA);

  _salvarTurno(state, 'system', systemPrompt);
  _salvarTurno(state, 'user', userPromptAbertura);
  _salvarTurno(state, 'assistant', respostaIA);

  // Atualizar last_activity
  try {
    StateManager.updateLastActivity(sessaoId);
  } catch (e) {}

  Logger.log('REA: Sessao criada — ' + sessaoId);

  return {
    erro: false,
    sessao_id: sessaoId,
    mensagem_abertura: textoVisivel,
    meta: meta
  };
}


// ═══════════════════════════════════════════════════════════════════════
// 2. CONTINUAR REAVALIACAO — Processar cada turno
// ═══════════════════════════════════════════════════════════════════════

/**
 * Processa mensagem do colaborador e retorna resposta da IA.
 *
 * @param {string} sessaoId — ID da sessao de reavaliacao
 * @param {string} mensagemColaborador — Texto enviado pelo colaborador
 * @return {Object} { texto, meta, encerrada, erro }
 */
function continuarReavaliacao(sessaoId, mensagemColaborador) {
  _carregarCFG();

  // 1. Carregar sessao
  var session = StateManager.getSession(sessaoId);
  if (!session) {
    return { erro: true, mensagem: 'Sessao nao encontrada: ' + sessaoId };
  }
  if (session.status === 'concluida') {
    return { erro: true, mensagem: 'Sessao ja concluida.' };
  }

  // Preparar state para _salvarTurno
  var state = {
    sessao_id: sessaoId,
    ciclo_id: session.ciclo_id,
    colaborador_id: session.colaborador_id
  };

  // 2. Adicionar mensagem do colaborador ao historico
  var msgLimpa = _norm(mensagemColaborador);
  if (!msgLimpa || msgLimpa.length < 3) {
    return { erro: true, mensagem: 'Mensagem muito curta. Por favor, elabore mais.' };
  }

  _salvarTurno(state, 'user', msgLimpa);

  // 3. Reconstruir historico para a IA
  var historico = _reaReconstruirHistorico(sessaoId, session);

  // Adicionar a nova mensagem do colaborador
  historico.push({ role: 'user', content: msgLimpa });

  // 4. Extrair system prompt (primeiro turno do historico no Drive)
  var systemPrompt = _reaExtrairSystemPrompt(sessaoId, session);

  // 5. Enviar para IA
  var respostaIA = _reaChamarIA(systemPrompt, historico);

  // 6. Parsear META
  var meta = _parseMeta(respostaIA);
  var textoVisivel = _stripInvisible(respostaIA);

  // 7. Salvar resposta da IA
  _salvarTurno(state, 'assistant', respostaIA);

  // Atualizar last_activity
  try {
    StateManager.updateLastActivity(sessaoId);
  } catch (e) {}

  // 8. Verificar encerramento
  var encerrada = false;
  if (meta && meta.encerrar === true) {
    encerrada = true;
    _reaFinalizarSessao(sessaoId);
  } else if (meta && meta.turno >= REA_MAX_TURNOS) {
    // Forcar encerramento apos maximo de turnos
    encerrada = true;
    _reaFinalizarSessao(sessaoId);
  }

  Logger.log('REA: Turno ' + (meta ? meta.turno : '?') + ' — encerrar: ' + encerrada);

  return {
    erro: false,
    texto: textoVisivel,
    meta: meta,
    encerrada: encerrada
  };
}


// ═══════════════════════════════════════════════════════════════════════
// 3. FINALIZAR SESSAO — Extrair JSON qualitativo
// ═══════════════════════════════════════════════════════════════════════

/**
 * Finaliza sessao e extrai resumo qualitativo via IA.
 *
 * @param {string} sessaoId — ID da sessao
 * @return {Object|null} payload qualitativo ou null se erro
 */
function _reaFinalizarSessao(sessaoId) {
  _carregarCFG();
  Logger.log('REA: Finalizando sessao ' + sessaoId);

  var session = StateManager.getSession(sessaoId);
  if (!session) {
    Logger.log('REA: Sessao nao encontrada para finalizar: ' + sessaoId);
    return null;
  }

  // 1. Reconstruir historico completo
  var historico = _reaReconstruirHistorico(sessaoId, session);

  // Formatar conversa como texto para o prompt de extracao
  var conversaTexto = '';
  for (var i = 0; i < historico.length; i++) {
    var turno = historico[i];
    if (turno.role === 'user') {
      conversaTexto += 'COLABORADOR: ' + turno.content + '\n\n';
    } else if (turno.role === 'assistant') {
      conversaTexto += 'MENTOR IA: ' + _stripInvisible(turno.content) + '\n\n';
    }
  }

  if (!conversaTexto || conversaTexto.length < 50) {
    Logger.log('REA: Conversa muito curta para extracao');
    StateManager.updateSessionStatus(sessaoId, 'concluida');
    return null;
  }

  // 2. Enviar para IA com prompt de extracao
  var extractionPrompt = _reaBuildExtractionPrompt();
  var userPrompt = 'CONVERSA COMPLETA:\n\n' + conversaTexto +
    '\n\n---\nAgora extraia o JSON qualitativo conforme as instrucoes.';

  var respostaExtracao;
  try {
    respostaExtracao = _reaChamarIASingle(extractionPrompt, userPrompt);
  } catch (e) {
    Logger.log('REA: Erro na extracao qualitativa: ' + e.message);
    StateManager.updateSessionStatus(sessaoId, 'concluida');
    return null;
  }

  // 3. Parsear JSON
  var payloadQualitativo = null;
  try {
    payloadQualitativo = _extrairJSON(respostaExtracao);
  } catch (e) {
    Logger.log('REA: Erro ao parsear JSON qualitativo: ' + e.message);
    Logger.log('REA: Resposta bruta: ' + respostaExtracao.substring(0, 500));
  }

  // 4. Salvar no StateManager
  if (payloadQualitativo) {
    try {
      _reaUpdateSessionField(sessaoId, 'payload_reavaliacao', JSON.stringify(payloadQualitativo));
    } catch (e) {
      Logger.log('REA: Erro ao salvar payload: ' + e.message);
    }
  }

  // 5. Atualizar status
  StateManager.updateSessionStatus(sessaoId, 'concluida');

  // 6. Salvar no Drive tambem
  try {
    var state = {
      sessao_id: sessaoId,
      ciclo_id: session.ciclo_id,
      colaborador_id: session.colaborador_id
    };
    DriveStorage.updateConversation(sessaoId, session.ciclo_id, session.colaborador_id, {
      status: 'concluida',
      payload_reavaliacao: payloadQualitativo,
      updated_at: new Date().toISOString()
    });
  } catch (e) {
    Logger.log('REA: Erro ao atualizar Drive: ' + e.message);
  }

  Logger.log('REA: Sessao finalizada com sucesso — ' + sessaoId);
  return payloadQualitativo;
}


// ═══════════════════════════════════════════════════════════════════════
// 4. SYSTEM PROMPT — Construcao do prompt completo
// ═══════════════════════════════════════════════════════════════════════

/**
 * Constroi system prompt completo para a conversa de reavaliacao.
 *
 * @param {Object} colaborador — Dados do colaborador (StateManager.getColaborador)
 * @param {Object} avaliacaoOriginal — { nivel, nota, pontos_fortes, pontos_atencao, descritores }
 * @param {Object} trilhaRealizada — { pilulas, desafios_realizados, semanas_completadas }
 * @param {Object} competenciaV2 — Dados da Competencias_v2
 * @return {string} System prompt completo
 */
function _reaBuildSystemPrompt(colaborador, avaliacaoOriginal, trilhaRealizada, competenciaV2) {
  var nome = colaborador.nome ? colaborador.nome.split(' ')[0] : 'colaborador(a)';
  var cargo = colaborador.cargo || 'profissional';
  var compNome = competenciaV2.nome || 'a competencia';
  var nivel = avaliacaoOriginal.nivel || '?';

  // Descritores com gap (pontos de atencao)
  var descritoresGap = avaliacaoOriginal.pontos_atencao || 'nao identificados';

  // Descritores foco da trilha
  var descritoresFoco = '';
  if (trilhaRealizada.descritores_foco && trilhaRealizada.descritores_foco.length > 0) {
    descritoresFoco = trilhaRealizada.descritores_foco.join(', ');
  } else {
    descritoresFoco = 'conteudo geral da competencia';
  }

  // Desafios realizados
  var desafiosTexto = '';
  if (trilhaRealizada.desafios_realizados && trilhaRealizada.desafios_realizados.length > 0) {
    desafiosTexto = trilhaRealizada.desafios_realizados.join('; ');
  } else {
    desafiosTexto = 'nenhum micro-desafio registrado';
  }

  // Resumo da competencia (descritores V2)
  var descritoresResumo = '';
  if (competenciaV2.descritores && competenciaV2.descritores.length > 0) {
    var nomes = [];
    for (var d = 0; d < competenciaV2.descritores.length; d++) {
      var desc = competenciaV2.descritores[d];
      nomes.push((desc.codigo || ('D' + (d + 1))) + ': ' + (desc.nome_curto || desc.nome || ''));
    }
    descritoresResumo = nomes.join('\n    ');
  }

  // Perfil CIS (se disponivel)
  var blocoCIS = '';
  try {
    var cisDados = getCISParaPDI(
      colaborador.perfil_disc || '',
      colaborador.trait_scores || {},
      {}
    );
    if (cisDados && cisDados.length > 50) {
      blocoCIS = '\n\nPERFIL COMPORTAMENTAL (CIS):\n' + cisDados;
    }
  } catch (e) {
    Logger.log('REA: CIS nao disponivel — ' + e.message);
  }

  // Pontos fortes da avaliacao original
  var pontosFortes = avaliacaoOriginal.pontos_fortes || 'nao registrados';

  // Competencia resumida (para uso no roteiro)
  var compResumida = compNome.length > 40 ? compNome.substring(0, 40) + '...' : compNome;

  var prompt = 'Voce e a Mentor IA da Vertho. Esta conduzindo a conversa de REAVALIACAO\n' +
    'com ' + nome + ', apos 14 semanas de trilha de desenvolvimento.\n\n' +

    'SEU OBJETIVO:\n' +
    'Investigar o que MUDOU NA PRATICA — nao o que a pessoa aprendeu em teoria.\n' +
    'Buscar evidencias concretas de mudanca comportamental.\n\n' +

    'O QUE VOCE SABE:\n' +
    '- Na avaliacao inicial (Cenario A), ' + nome + ' ficou no nivel ' + nivel + ' em ' + compNome + '\n' +
    '- Pontos fortes identificados: ' + pontosFortes + '\n' +
    '- Os pontos de atencao eram: ' + descritoresGap + '\n' +
    '- A trilha focou em: ' + descritoresFoco + '\n' +
    '- Os micro-desafios foram: ' + desafiosTexto + '\n' +
    '- Semanas completadas: ' + (trilhaRealizada.semanas_completadas || 0) + ' de 14\n';

  if (descritoresResumo) {
    prompt += '- Descritores da competencia:\n    ' + descritoresResumo + '\n';
  }

  if (blocoCIS) {
    prompt += blocoCIS + '\n';
  }

  prompt += '\nROTEIRO DA CONVERSA (adaptar ao fluxo natural):\n\n' +

    '1. ABERTURA (acolhimento):\n' +
    '   "Oi, ' + nome + '! Passamos por uma jornada juntos nos ultimos meses.\n' +
    '    Agora quero entender como foi pra voce na pratica."\n\n' +

    '2. MUDANCA GERAL (aberta):\n' +
    '   "Pensando no seu dia a dia como ' + cargo + ', o que mudou na forma\n' +
    '    como voce lida com ' + compResumida + ' desde o inicio da trilha?"\n\n' +

    '3. EVIDENCIA CONCRETA (ancorada no gap):\n' +
    '   "Voce mencionou {algo}. Me conta uma situacao ESPECIFICA em que\n' +
    '    voce agiu diferente do que teria feito antes."\n\n' +

    '4. DESCRITOR ESPECIFICO (o maior gap):\n' +
    '   "Na sua avaliacao inicial, um ponto de atencao era {ponto_atencao}.\n' +
    '    Como voce ve isso hoje? Mudou alguma coisa?"\n\n' +

    '5. DIFICULDADE PERSISTENTE:\n' +
    '   "O que ainda e dificil pra voce em ' + compResumida + '?\n' +
    '    Tem algo que voce tentou e nao funcionou?"\n\n' +

    '6. ENCERRAMENTO:\n' +
    '   "Obrigada por compartilhar, ' + nome + '. Na proxima semana teremos\n' +
    '    uma ultima atividade — um novo cenario para voce responder."\n\n' +

    'REGRAS:\n' +
    '- Tom de mentor — curioso, acolhedor, sem julgamento\n' +
    '- NUNCA dizer o nivel ou nota da pessoa\n' +
    '- NUNCA citar descritores por codigo (D1, D2)\n' +
    '- Buscar FATOS, nao opinioes ("o que voce FEZ" > "o que voce ACHA")\n' +
    '- Se a pessoa so fala em teoria, redirecionar: "E na pratica, como foi?"\n' +
    '- Maximo ' + REA_MAX_TURNOS + ' turnos — nao se estender\n' +
    '- Use [META]{"turno":N,"encerrar":false}[/META] ao final de CADA resposta\n' +
    '- No ultimo turno (encerramento), use [META]{"turno":N,"encerrar":true}[/META]\n' +
    '- O campo "turno" deve ser o numero sequencial da sua resposta (1, 2, 3...)\n';

  return prompt;
}


// ═══════════════════════════════════════════════════════════════════════
// 5. EXTRACTION PROMPT — Prompt para finalizacao qualitativa
// ═══════════════════════════════════════════════════════════════════════

/**
 * Retorna o prompt de extracao qualitativa para a finalizacao.
 *
 * @return {string} System prompt para extracao
 */
function _reaBuildExtractionPrompt() {
  return 'Voce e um analista de desenvolvimento humano da Vertho.\n' +
    'Recebera a transcricao completa de uma conversa de reavaliacao entre\n' +
    'a Mentor IA e um colaborador, realizada apos 14 semanas de trilha de desenvolvimento.\n\n' +

    'Sua tarefa: extrair um JSON qualitativo estruturado a partir da conversa.\n\n' +

    'FORMATO EXATO DO JSON:\n' +
    '```json\n' +
    '{\n' +
    '  "resumo_qualitativo": "3-4 linhas resumindo a evolucao percebida",\n' +
    '  "evidencias_por_descritor": [\n' +
    '    {\n' +
    '      "descritor": "D1",\n' +
    '      "evidencia_relatada": "descricao da evidencia mencionada",\n' +
    '      "nivel_percebido": 2,\n' +
    '      "confianca": "alta|media|baixa",\n' +
    '      "citacao_literal": "trecho exato da fala do colaborador"\n' +
    '    }\n' +
    '  ],\n' +
    '  "gaps_persistentes": ["D4", "D6"],\n' +
    '  "consciencia_do_gap": "alta|media|baixa",\n' +
    '  "conexao_cis": "como o perfil CIS apareceu na conversa",\n' +
    '  "recomendacao_ciclo2": "foco sugerido para o proximo ciclo"\n' +
    '}\n' +
    '```\n\n' +

    'INSTRUCOES:\n' +
    '- "resumo_qualitativo": Sintetize a evolucao percebida em 3-4 frases.\n' +
    '- "evidencias_por_descritor": Para cada descritor mencionado na conversa,\n' +
    '  extraia a evidencia concreta relatada. Use o codigo do descritor (D1, D2...).\n' +
    '  nivel_percebido: 1=GAP, 2=Em Desenvolvimento, 3=META, 4=Referencia.\n' +
    '  confianca: "alta" se relatou fato concreto, "media" se generalizou,\n' +
    '  "baixa" se ficou apenas na teoria.\n' +
    '  citacao_literal: copie a fala exata do colaborador entre aspas.\n' +
    '- "gaps_persistentes": Descritores que o colaborador NAO mencionou melhoria\n' +
    '  ou admitiu que ainda sao dificeis.\n' +
    '- "consciencia_do_gap": Se o colaborador reconhece suas limitacoes.\n' +
    '- "conexao_cis": Como o perfil comportamental natural apareceu na conversa\n' +
    '  (ex: "perfil S alto — colaborador mencionou que ouve mais antes de agir").\n' +
    '  Se nao houve conexao clara, escreva "nao identificado".\n' +
    '- "recomendacao_ciclo2": O que o proximo ciclo de desenvolvimento deveria focar.\n\n' +

    'IMPORTANTE:\n' +
    '- Retorne APENAS o JSON, sem texto antes ou depois.\n' +
    '- Se nao houver evidencia para um descritor, NAO o inclua no array.\n' +
    '- Seja criterioso: so marque confianca "alta" se houver fato concreto com situacao, acao e resultado.\n';
}


// ═══════════════════════════════════════════════════════════════════════
// 6. LOTE — Iniciar reavaliacao em lote
// ═══════════════════════════════════════════════════════════════════════

/**
 * Menu: inicia reavaliacao para todos os colaboradores que completaram a trilha.
 * Cria sessoes de reavaliacao para quem ainda nao tem.
 */
function iniciarReavaliacaoLote() {
  _carregarCFG();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  // Identificar colaboradores que completaram trilha (14 semanas)
  var elegíveis = _reaIdentificarElegiveis(ss);

  if (elegíveis.length === 0) {
    ui.alert('Reavaliacao', 'Nenhum colaborador elegivel encontrado.\n\nCriterio: ter completado a trilha (14 semanas).', ui.ButtonSet.OK);
    return;
  }

  // Verificar quem ja tem sessao de reavaliacao
  var jaComSessao = _reaVerificarSessoesExistentes(ss, elegíveis);
  var pendentes = elegíveis.filter(function(e) {
    return !jaComSessao[e.email + '|' + e.competenciaId];
  });

  if (pendentes.length === 0) {
    ui.alert('Reavaliacao', 'Todos os ' + elegíveis.length + ' colaboradores elegiveis ja possuem sessao de reavaliacao.', ui.ButtonSet.OK);
    return;
  }

  var resp = ui.alert(
    'Reavaliacao em Lote',
    pendentes.length + ' colaboradores elegiveis (de ' + elegíveis.length + ' no total).\n\n' +
    'Criar sessoes de reavaliacao para todos?',
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  var criados = 0;
  var erros = 0;

  for (var i = 0; i < pendentes.length; i++) {
    var p = pendentes[i];
    try {
      SpreadsheetApp.getActive().toast(
        'Criando reavaliacao ' + (i + 1) + ' de ' + pendentes.length + '...',
        'Reavaliacao', 3
      );

      var resultado = iniciarReavaliacaoConversacional(p.email, p.competenciaId);
      if (resultado && !resultado.erro) {
        criados++;
      } else {
        erros++;
        Logger.log('REA Lote: Erro para ' + p.email + ' — ' + (resultado ? resultado.mensagem : 'desconhecido'));
      }
    } catch (e) {
      erros++;
      Logger.log('REA Lote: Excecao para ' + p.email + ' — ' + e.message);
    }

    // Pausa entre chamadas para nao estourar quota
    if (i < pendentes.length - 1) {
      Utilities.sleep(2000);
    }
  }

  SpreadsheetApp.getActive().toast(
    'Concluido: ' + criados + ' sessoes criadas' + (erros > 0 ? ', ' + erros + ' erros' : ''),
    'Reavaliacao em Lote', 10
  );
  Logger.log('REA Lote: ' + criados + ' criados, ' + erros + ' erros');
}


// ═══════════════════════════════════════════════════════════════════════
// 7. GPT ROUTING — Mesma logica do projeto
// ═══════════════════════════════════════════════════════════════════════

/**
 * Chama IA com historico multi-turno (conversa).
 * Detecta modelo GPT e roteia para OpenAI se necessario.
 *
 * @param {string} systemPrompt — System prompt
 * @param {Array} messages — Array de { role, content }
 * @return {string} Resposta da IA
 */
function _reaChamarIA(systemPrompt, messages) {
  var modelo = _CFG.modelo || Config.MODEL_CONVERSA;
  var thinking = _CFG.thinking || false;

  // Filtrar mensagens — apenas user e assistant (sem system inline)
  var mensagensFiltradas = [];
  for (var i = 0; i < messages.length; i++) {
    var msg = messages[i];
    if (msg.role === 'user' || msg.role === 'assistant') {
      // Limpar META das respostas do assistant para nao confundir
      var content = msg.role === 'assistant' ? _stripInvisible(msg.content) : msg.content;
      if (content && content.length > 0) {
        mensagensFiltradas.push({ role: msg.role, content: content });
      }
    }
  }

  // Detectar GPT/OpenAI
  var isOpenAI = modelo && (
    modelo.indexOf('gpt') >= 0 ||
    modelo.indexOf('o1-') >= 0 ||
    modelo.indexOf('o3-') >= 0 ||
    modelo.indexOf('o4-') >= 0 ||
    modelo.indexOf('openai') >= 0
  );

  if (isOpenAI) {
    return _reaChamarOpenAI(modelo, systemPrompt, mensagensFiltradas, thinking);
  }

  return _reaChamarClaude(modelo, systemPrompt, mensagensFiltradas, thinking);
}

/**
 * Chama IA para prompt unico (sem historico multi-turno).
 * Usa _ia4ClaudeRawV2 ou _ia4OpenAIRawV2 diretamente.
 *
 * @param {string} systemPrompt — System prompt
 * @param {string} userPrompt — User prompt
 * @return {string} Resposta da IA
 */
function _reaChamarIASingle(systemPrompt, userPrompt) {
  var modelo = _CFG.modelo || Config.MODEL_PDI;
  var thinking = _CFG.thinking || false;

  return _ia4ClaudeRawV2(modelo, systemPrompt, userPrompt, thinking);
}

/**
 * Chamada Claude com historico multi-turno.
 *
 * @param {string} modelo — Modelo Claude
 * @param {string} systemPrompt — System prompt
 * @param {Array} messages — Array de { role, content }
 * @param {boolean} usarThinking — Usar extended thinking
 * @return {string} Texto da resposta
 */
function _reaChamarClaude(modelo, systemPrompt, messages, usarThinking) {
  var maxTok = 4096;  // Conversa — respostas curtas
  var payload = {
    model: modelo,
    max_tokens: maxTok,
    system: systemPrompt,
    messages: messages,
    temperature: 0.4
  };

  if (usarThinking) {
    payload.thinking = { type: 'enabled', budget_tokens: Math.floor(maxTok * 0.5) };
    delete payload.temperature;
  }

  var hdrs = {
    'x-api-key': _getApiKey('CLAUDE'),
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json'
  };
  if (usarThinking) {
    hdrs['anthropic-beta'] = 'interleaved-thinking-2025-05-14';
  }

  var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    headers: hdrs,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  if (resp.getResponseCode() !== 200) {
    throw new Error('Claude REA ' + resp.getResponseCode() + ': ' + resp.getContentText());
  }

  var body = JSON.parse(resp.getContentText());
  if (body.stop_reason === 'max_tokens') {
    Logger.log('REA: Resposta Claude TRUNCADA (max_tokens atingido)');
  }

  var blocos = body.content.filter(function(b) { return b.type === 'text'; });
  return blocos[blocos.length - 1].text;
}

/**
 * Chamada OpenAI com historico multi-turno.
 *
 * @param {string} modelo — Modelo OpenAI
 * @param {string} systemPrompt — System prompt
 * @param {Array} messages — Array de { role, content }
 * @param {boolean} usarThinking — Usar reasoning
 * @return {string} Texto da resposta
 */
function _reaChamarOpenAI(modelo, systemPrompt, messages, usarThinking) {
  var maxTok = 4096;

  var allMessages = [{ role: 'system', content: systemPrompt }];
  for (var i = 0; i < messages.length; i++) {
    allMessages.push(messages[i]);
  }

  var payload = {
    model: modelo,
    max_completion_tokens: maxTok,
    messages: allMessages,
    temperature: 0.4
  };

  if (usarThinking) {
    payload.reasoning_effort = 'high';
    delete payload.temperature;
  }

  var hdrs = {
    'Authorization': 'Bearer ' + _getApiKey('OPENAI'),
    'Content-Type': 'application/json'
  };

  var resp = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
    method: 'post',
    headers: hdrs,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  if (resp.getResponseCode() !== 200) {
    throw new Error('OpenAI REA ' + resp.getResponseCode() + ': ' + resp.getContentText());
  }

  var body = JSON.parse(resp.getContentText());
  var choice = body.choices && body.choices[0];
  if (!choice || !choice.message) {
    throw new Error('OpenAI REA: resposta sem choices');
  }

  return choice.message.content;
}


// ═══════════════════════════════════════════════════════════════════════
// FUNCOES AUXILIARES PRIVADAS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Carrega avaliacao original do Cenario A (aba Respostas).
 *
 * @param {Spreadsheet} ss
 * @param {string} email
 * @param {string} competenciaId
 * @return {Object|null} { nivel, nota, pontos_fortes, pontos_atencao, descritores, payload }
 */
function _reaCarregarAvaliacaoOriginal(ss, email, competenciaId) {
  var ws = ss.getSheetByName(REA_ABA_RESPOSTAS);
  if (!ws) {
    Logger.log('REA: Aba ' + REA_ABA_RESPOSTAS + ' nao encontrada');
    return null;
  }

  var data = ws.getDataRange().getValues();
  if (data.length < 2) return null;

  var emailNorm = String(email).toLowerCase().trim();
  var compNorm = String(competenciaId).toLowerCase().trim();

  // Col B (1) = E-mail, Col F (5) = ID Competencia
  // Col Q (16) = Nivel IA4, Col R (17) = Nota IA4
  // Col S (18) = Pontos Fortes, Col T (19) = Pontos de Atencao
  // Col W (22) = Payload IA4

  for (var r = 1; r < data.length; r++) {
    var rowEmail = String(data[r][1] || '').toLowerCase().trim();
    var rowComp = String(data[r][5] || '').toLowerCase().trim();

    if (rowEmail === emailNorm && rowComp === compNorm) {
      var payloadRaw = String(data[r][22] || '');
      var parsedPayload = null;
      if (payloadRaw && payloadRaw.length > 10) {
        try {
          parsedPayload = JSON.parse(payloadRaw);
        } catch (e) {
          Logger.log('REA: Erro ao parsear payload Respostas: ' + e.message);
        }
      }

      // Extrair descritores do payload se disponivel
      var descritores = [];
      if (parsedPayload && parsedPayload.descritores) {
        descritores = parsedPayload.descritores;
      }

      return {
        nivel: String(data[r][16] || ''),
        nota: String(data[r][17] || ''),
        pontos_fortes: String(data[r][18] || ''),
        pontos_atencao: String(data[r][19] || ''),
        descritores: descritores,
        payload: parsedPayload
      };
    }
  }

  return null;
}


/**
 * Carrega dados da trilha realizada pelo colaborador.
 *
 * @param {Spreadsheet} ss
 * @param {string} email
 * @param {string} competenciaId
 * @return {Object} { pilulas, desafios_realizados, semanas_completadas, descritores_foco }
 */
function _reaCarregarTrilha(ss, email, competenciaId) {
  var resultado = {
    pilulas: [],
    desafios_realizados: [],
    semanas_completadas: 0,
    descritores_foco: []
  };

  var wsTri = ss.getSheetByName(REA_ABA_TRILHAS);
  if (!wsTri) {
    Logger.log('REA: Aba ' + REA_ABA_TRILHAS + ' nao encontrada');
    return resultado;
  }

  var data = wsTri.getDataRange().getValues();
  if (data.length < 2) return resultado;

  var emailNorm = String(email).toLowerCase().trim();
  var compNorm = _norm(competenciaId).toLowerCase();
  var descritoresSet = {};
  var maxSemana = 0;

  // Colunas da aba Trilhas (1-indexed convertido para 0-indexed)
  // F4T_EMAIL=1, F4T_COMPETENCIA=2, F4T_SEMANA=4, F4T_TIPO_SEMANA=5,
  // F4T_TITULO=6, F4T_DESCRITOR=9, F4T_STATUS=11

  for (var r = 1; r < data.length; r++) {
    var rowEmail = String(data[r][0] || '').toLowerCase().trim();  // col A (0-indexed)
    var rowComp = _norm(String(data[r][1] || '')).toLowerCase();   // col B

    if (rowEmail === emailNorm && rowComp.indexOf(compNorm) >= 0) {
      var semana = parseInt(data[r][3]) || 0;     // col D
      var tipoSemana = String(data[r][4] || '');   // col E
      var titulo = String(data[r][5] || '');        // col F
      var descritor = String(data[r][8] || '');     // col I
      var status = String(data[r][10] || '');       // col K

      resultado.pilulas.push({
        semana: semana,
        tipo: tipoSemana,
        titulo: titulo,
        descritor: descritor,
        status: status
      });

      // Contar semanas completadas
      if (semana > maxSemana && status.toLowerCase().indexOf('conclu') >= 0) {
        maxSemana = semana;
      }

      // Coletar descritores foco
      if (descritor && descritor.length > 0) {
        descritoresSet[descritor] = true;
      }

      // Identificar micro-desafios (semanas de implementacao)
      if (tipoSemana && tipoSemana.toLowerCase().indexOf('impl') >= 0) {
        if (titulo && titulo.length > 0) {
          resultado.desafios_realizados.push('Sem ' + semana + ': ' + titulo);
        }
      }
    }
  }

  resultado.semanas_completadas = maxSemana;
  resultado.descritores_foco = Object.keys(descritoresSet);

  return resultado;
}


/**
 * Reconstroi historico de mensagens a partir do Drive e/ou StateManager.
 * Retorna apenas mensagens user/assistant (sem system).
 *
 * @param {string} sessaoId
 * @param {Object} session — Sessao do StateManager
 * @return {Array} Array de { role, content }
 */
function _reaReconstruirHistorico(sessaoId, session) {
  var historico = [];

  // Tentar Drive primeiro (mais completo)
  try {
    var turnos = DriveStorage.getHistory(sessaoId, session.ciclo_id, session.colaborador_id);
    if (turnos && turnos.length > 0) {
      for (var i = 0; i < turnos.length; i++) {
        var t = turnos[i];
        if (t.role === 'user' || t.role === 'assistant') {
          historico.push({ role: t.role, content: t.content });
        }
      }
      if (historico.length > 0) return historico;
    }
  } catch (e) {
    Logger.log('REA: Erro ao ler historico do Drive: ' + e.message);
  }

  // Fallback: StateManager history (JSON na aba Sessoes)
  if (session.history) {
    var hist = session.history;
    if (typeof hist === 'string') {
      try { hist = JSON.parse(hist); } catch (e) { hist = []; }
    }
    if (Array.isArray(hist)) {
      for (var j = 0; j < hist.length; j++) {
        var h = hist[j];
        if (h.role === 'user' || h.role === 'assistant') {
          historico.push({ role: h.role, content: h.content });
        }
      }
    }
  }

  return historico;
}


/**
 * Extrai system prompt do primeiro turno salvo (system) no Drive.
 * Fallback: reconstruir a partir dos dados atuais.
 *
 * @param {string} sessaoId
 * @param {Object} session
 * @return {string} System prompt
 */
function _reaExtrairSystemPrompt(sessaoId, session) {
  // Tentar extrair do Drive
  try {
    var turnos = DriveStorage.getHistory(sessaoId, session.ciclo_id, session.colaborador_id);
    if (turnos && turnos.length > 0 && turnos[0].role === 'system') {
      return turnos[0].content;
    }
  } catch (e) {
    Logger.log('REA: Erro ao ler system prompt do Drive: ' + e.message);
  }

  // Fallback do StateManager history
  if (session.history) {
    var hist = session.history;
    if (typeof hist === 'string') {
      try { hist = JSON.parse(hist); } catch (e) { hist = []; }
    }
    if (Array.isArray(hist) && hist.length > 0 && hist[0].role === 'system') {
      return hist[0].content;
    }
  }

  // Ultimo fallback: reconstruir prompt (menos ideal pois dados podem ter mudado)
  Logger.log('REA: System prompt nao encontrado — reconstruindo');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var colaborador = StateManager.getColaborador(session.colaborador_id);
  var avaliacao = _reaCarregarAvaliacaoOriginal(ss, session.colaborador_id, session.competencia_id);
  var trilha = _reaCarregarTrilha(ss, session.colaborador_id, session.competencia_id);
  var mapaV2 = _lerBaseCompetenciasV2(ss);
  var compV2 = mapaV2[String(session.competencia_id).toUpperCase().trim()] || null;

  if (colaborador && avaliacao && compV2) {
    return _reaBuildSystemPrompt(colaborador, avaliacao, trilha, compV2);
  }

  // Prompt minimo de emergencia
  return 'Voce e a Mentor IA da Vertho conduzindo reavaliacao com o colaborador. ' +
    'Investigue mudancas praticas apos a trilha de desenvolvimento. ' +
    'Use [META]{"turno":N,"encerrar":false}[/META] ao final de cada resposta.';
}


/**
 * Identifica colaboradores elegiveis para reavaliacao (completaram 14 semanas).
 *
 * @param {Spreadsheet} ss
 * @return {Array} Array de { email, nome, competenciaId, competenciaNome }
 */
function _reaIdentificarElegiveis(ss) {
  var elegiveis = [];

  // Ler aba Capacitacao ou Respostas para encontrar quem tem trilha
  var wsRespostas = ss.getSheetByName(REA_ABA_RESPOSTAS);
  var wsTrilhas = ss.getSheetByName(REA_ABA_TRILHAS);

  if (!wsRespostas || !wsTrilhas) {
    Logger.log('REA Lote: Abas Respostas ou Trilhas nao encontradas');
    return elegiveis;
  }

  // Coletar emails com trilha completa (semana >= 14)
  var trilhaData = wsTrilhas.getDataRange().getValues();
  var completou = {};  // email|compId → true

  for (var t = 1; t < trilhaData.length; t++) {
    var tEmail = String(trilhaData[t][0] || '').toLowerCase().trim();
    var tComp = String(trilhaData[t][1] || '').trim();
    var tSemana = parseInt(trilhaData[t][3]) || 0;
    var tStatus = String(trilhaData[t][10] || '').toLowerCase();

    if (tEmail && tSemana >= 14 && tStatus.indexOf('conclu') >= 0) {
      completou[tEmail + '|' + tComp.toLowerCase()] = tComp;
    }
  }

  // Cruzar com Respostas para pegar competenciaId e nome
  var respData = wsRespostas.getDataRange().getValues();
  var jaAdicionado = {};

  for (var r = 1; r < respData.length; r++) {
    var rEmail = String(respData[r][1] || '').toLowerCase().trim();
    var rNome = String(respData[r][2] || '');
    var rCompId = String(respData[r][5] || '').trim();
    var rCompNome = String(respData[r][6] || '');

    var chave = rEmail + '|' + rCompId.toLowerCase();
    if (completou[chave] && !jaAdicionado[chave]) {
      elegiveis.push({
        email: rEmail,
        nome: rNome,
        competenciaId: rCompId,
        competenciaNome: rCompNome
      });
      jaAdicionado[chave] = true;
    }
  }

  Logger.log('REA Lote: ' + elegiveis.length + ' colaboradores elegiveis identificados');
  return elegiveis;
}


/**
 * Verifica quais colaboradores ja possuem sessao de reavaliacao.
 *
 * @param {Spreadsheet} ss
 * @param {Array} elegiveis — Lista de { email, competenciaId }
 * @return {Object} Mapa email|compId → true
 */
function _reaVerificarSessoesExistentes(ss, elegiveis) {
  var mapa = {};
  var wsSessoes = ss.getSheetByName(Config.SHEET_SESSOES);
  if (!wsSessoes) return mapa;

  var data = wsSessoes.getDataRange().getValues();
  if (data.length < 2) return mapa;

  var headers = data[0];
  var iColabId = -1, iCompId = -1, iFase = -1, iStatus = -1;

  for (var h = 0; h < headers.length; h++) {
    var hNorm = String(headers[h]).toLowerCase().trim();
    if (hNorm === 'colaborador_id') iColabId = h;
    else if (hNorm === 'competencia_id') iCompId = h;
    else if (hNorm === 'fase') iFase = h;
    else if (hNorm === 'status') iStatus = h;
  }

  if (iColabId < 0 || iFase < 0) return mapa;

  for (var r = 1; r < data.length; r++) {
    var fase = String(data[r][iFase] || '').toLowerCase();
    var status = String(data[r][iStatus] || '').toLowerCase();
    if (fase === 'reavaliacao' && (status === 'ativa' || status === 'concluida')) {
      var colabId = String(data[r][iColabId] || '').toLowerCase().trim();
      var compId = String(data[r][iCompId] || '').trim();
      mapa[colabId + '|' + compId] = true;
    }
  }

  return mapa;
}


/**
 * Obtem o ciclo ativo da aba Ciclos_Avaliacao.
 *
 * @param {Spreadsheet} ss
 * @return {string|null} ID do ciclo ativo
 */
function _reaObterCicloAtivo(ss) {
  var wsCiclos = ss.getSheetByName(Config.SHEET_CICLOS || 'Ciclos_Avaliacao');
  if (!wsCiclos) return null;

  var data = wsCiclos.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    var status = String(data[r][5] || '').toLowerCase().trim();  // col F = status
    if (status === 'ativo' || status === 'em_andamento') {
      return String(data[r][0] || '');  // col A = ID do ciclo
    }
  }

  return null;
}


/**
 * Atualiza campo customizado na sessao (ex: payload_reavaliacao).
 * Garante que a coluna exista, criando-a se necessario.
 *
 * @param {string} sessaoId
 * @param {string} campo
 * @param {*} valor
 */
function _reaUpdateSessionField(sessaoId, campo, valor) {
  var ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(Config.SHEET_SESSOES);
  if (!ws) return;

  var data = ws.getDataRange().getValues();
  var headers = data[0];

  // Encontrar ou criar coluna
  var colIdx = -1;
  for (var h = 0; h < headers.length; h++) {
    if (String(headers[h]).trim() === campo) {
      colIdx = h;
      break;
    }
  }

  if (colIdx < 0) {
    // Criar coluna
    colIdx = headers.length;
    ws.getRange(1, colIdx + 1).setValue(campo);
  }

  // Encontrar linha da sessao
  var iSessId = -1;
  for (var s = 0; s < headers.length; s++) {
    if (String(headers[s]).trim() === 'sessao_id') {
      iSessId = s;
      break;
    }
  }
  if (iSessId < 0) return;

  for (var r = 1; r < data.length; r++) {
    if (String(data[r][iSessId]) === String(sessaoId)) {
      ws.getRange(r + 1, colIdx + 1).setValue(valor);
      return;
    }
  }
}
