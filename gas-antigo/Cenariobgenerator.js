// =====================================================================
// VERTHO - CenarioBGenerator.gs  (Fase 3 v3)
//
// Gera Cenarios B para a IA Conversacional com base em:
// - Cenario A original (para NAO repetir)
// - Resultado da IA 4 (nivel + nota + lacunas + pontos de atencao)
// - PDI gerado (focos de desenvolvimento + checklist tatico)
// - Perfil DISC + scores CIS do colaborador
// - Regua de maturidade completa (evidencias-chave por nivel)
// - Respostas do diagnostico (Forms)
//
// Fluxo: Claude gera -> Gemini valida -> grava na aba Cenarios_B
//
// Dependencias: Config.gs, AIRouter.gs, StateManager.gs
// =====================================================================

var CenarioBGenerator = {

  /**
   * Gera cenarios B para TODOS os colaboradores de um ciclo.
   * Chamado pelo menu antes de liberar o Web App.
   */
  gerarCenariosBLote: function() {
    var ui = SpreadsheetApp.getUi();
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // Garantir aba Cenarios_B existe
    this._garantirAbaCenariosB(ss);

    // Ler colaboradores para mapear cargo+escola
    var wsCen = ss.getSheetByName(Config.SHEET_CENARIOS);
    if (!wsCen) { ui.alert("Aba Cenarios nao encontrada"); return; }

    var dataCen = wsCen.getDataRange().getValues();

    // Ler escola (area) de cada colaborador da aba Colaboradores
    var emailToEscola = {};
    var wsColab = ss.getSheetByName(Config.SHEET_COLABORADORES);
    if (wsColab) {
      var dataColab = wsColab.getDataRange().getValues();
      for (var rc = 4; rc < dataColab.length; rc++) {
        var eml = String(dataColab[rc][6] || "").toLowerCase().trim();
        var esc = String(dataColab[rc][4] || "").trim();
        if (eml) emailToEscola[eml] = esc;
      }
    }

    // Agrupar por cargo + escola + competencia
    var sessoes = {};
    for (var r = 4; r < dataCen.length; r++) {
      var email = String(dataCen[r][0] || "").toLowerCase().trim();
      var cargo = String(dataCen[r][3] || "").trim();
      var escola = emailToEscola[email] || "";
      var compRaw = String(dataCen[r][10] || "");
      var compParts = compRaw.split("|");
      var compId = compParts[0] ? compParts[0].trim() : "";
      var compNome = compParts[1] ? compParts[1].trim() : "";

      if (!cargo || !compId) continue;

      var key = cargo + "|" + escola + "|" + compId;
      if (sessoes[key]) continue;

      // Buscar contexto PPP, valores e gabarito CIS da escola
      var contextoPPP = '';
      var valoresEscola = VALORES_BASE;
      var gabaritoCIS = null;
      try {
        var pppTexto = buscarPPPEscola(ss, escola);
        if (pppTexto) contextoPPP = formatarContextoPPP(pppTexto);
        valoresEscola = buscarValoresEscola(ss, escola);
        gabaritoCIS = _buscarGabaritoCISCargo(ss, cargo, escola);
      } catch(e) {}

      sessoes[key] = {
        cargo: cargo,
        escola: escola,
        contextoPPP: contextoPPP,
        valores: valoresEscola,
        gabaritoCIS: gabaritoCIS,
        competencia_id: compId,
        competencia_nome: compNome,
        cenario_a: {
          descricao: String(dataCen[r][12] || ""),
          personagens: String(dataCen[r][13] || ""),
          situacao_gatilho: String(dataCen[r][14] || ""),
          p1: String(dataCen[r][15] || ""),
          p2: String(dataCen[r][16] || ""),
          p3: String(dataCen[r][17] || ""),
          p4: String(dataCen[r][18] || "")
        }
      };
    }

    // Verificar cenarios B ja existentes (evitar duplicatas)
    var existentes = this._cenariosBExistentes(ss);

    // Gerar cenario B para cada grupo cargo+escola+comp
    var keys = Object.keys(sessoes);
    var gerados = 0;
    var pulados = 0;
    var erros = 0;

    for (var i = 0; i < keys.length; i++) {
      if (_deveParar()) { _limparParada(); break; }
      var sessao = sessoes[keys[i]];

      // Pular se ja existe cenario B
      var chave = sessao.cargo.toLowerCase() + "|" + sessao.escola.toLowerCase() + "|" + sessao.competencia_id.toUpperCase();
      if (existentes[chave]) {
        Logger.log("PULANDO (ja existe): " + chave);
        pulados++;
        continue;
      }

      SpreadsheetApp.getActive().toast(
        "[" + Config.modelLabel(Config.MODEL_PDI) + "]\n" + sessao.cargo + " / " + sessao.escola + " / " + sessao.competencia_nome + " (" + (i+1) + "/" + keys.length + ")",
        "Gerando Cenarios B", 5
      );

      try {
        var resultado = this._gerarCenarioB(sessao, ss);
        if (resultado) gerados++;
      } catch (e) {
        Logger.log("Erro cenario B " + sessao.email + " / " + sessao.competencia_id + ": " + e.message);
        erros++;
      }

      if (i < keys.length - 1) Utilities.sleep(2000);
    }

    ui.alert("Cenarios B gerados!\n\n"
      + "Gerados: " + gerados + "\n"
      + "Ja existiam: " + pulados + "\n"
      + "Erros: " + erros + "\n"
      + "Total: " + keys.length);
  },

  /**
   * Gera 1 cenario B para um colaborador + competencia.
   */
  _gerarCenarioB: function(sessao, ss) {
    var comp = StateManager.getCompetencia(sessao.competencia_id);

    // V2: Buscar descritores completos
    var descritoresV2 = null;
    try {
      var mapaV2 = _lerBaseCompetenciasV2(ss);
      if (mapaV2) {
        var compV2 = mapaV2[sessao.competencia_id.toUpperCase()];
        if (compV2) descritoresV2 = compV2.descritores;
      }
    } catch(e) {}

    // Buscar regua completa
    var reguaCompleta = "";
    try {
      reguaCompleta = StateManager.getReguaMaturidade(sessao.cargo, comp ? comp.nome : sessao.competencia_nome) || "";
    } catch(e) {}

    // Buscar tracos CIS da competencia
    var tracosCIS = (comp && comp.tracos_cis) ? comp.tracos_cis : [];

    // Montar prompt enriquecido
    var prompt = this._buildPromptGeracaoB(sessao, comp, reguaCompleta, tracosCIS);

    // Chamar Claude
    var response = AIRouter.callClaude({
      systemStatic: prompt.system,
      systemCompetencia: "",
      messages: [{ role: "user", content: prompt.user }]
    }, "cenario_b");

    var cenarioB = this._parsearCenarioB(response);
    if (!cenarioB) {
      throw new Error("Nao foi possivel parsear cenario B");
    }

    // Validar com Gemini
    var validacao = this._validarCenarioB(cenarioB, sessao, comp, reguaCompleta);

    // Gravar
    this._gravarCenarioB(ss, sessao, cenarioB, validacao);

    return cenarioB;
  },

  /**
   * Monta prompt enriquecido com baseline completo.
   */
  _buildPromptGeracaoB: function(sessao, comp, reguaCompleta, tracosCIS) {
    // ── SYSTEM PROMPT — Papel + Regras de Construção ──
    var system = [
      '<PAPEL>',
      'Voce e um especialista em avaliacao de competencias docentes com 20 anos de experiencia',
      'em escolas brasileiras. Sua especialidade e criar cenarios situacionais que funcionam como',
      'instrumentos diagnosticos — situacoes realistas que, pela forma como o professor responde,',
      'revelam seu nivel de maturidade em uma competencia especifica.',
      '',
      'Cada cenario deve funcionar como uma "radiografia": a resposta do professor vai revelar',
      'naturalmente em qual nivel da regua ele se encontra, sem que ele saiba que esta sendo classificado.',
      '</PAPEL>',
      '',
      '<TAREFA>',
      'Crie um CENARIO B complementar ao cenario A ja existente.',
      'O cenario B usa a MESMA competencia mas com situacao-gatilho DIFERENTE.',
      '',
      'O cenario B e COMPARTILHADO por todos os profissionais de um mesmo cargo na escola.',
      'NAO e personalizado por individuo — deve ser padronizado, justo e comparavel.',
      '',
      'Gere 4 perguntas de inspiracao para as 4 dimensoes conversacionais:',
      '  - Situacao: como compreende o problema',
      '  - Acao: passos concretos que tomaria',
      '  - Raciocinio: dilemas e decisoes',
      '  - Autossensibilidade: reacoes internas e autoconhecimento',
      'As perguntas sao INSPIRACAO para a IA conversacional, nao para leitura literal.',
      '</TAREFA>',
      '',
      '<REGRAS_DE_CONSTRUCAO>',
      '',
      '1. REALISMO CONTEXTUAL',
      '   - Use APENAS elementos que existem na escola (espacos, projetos, cargos, instancias)',
      '     conforme descrito no contexto do PPP',
      '   - Use o vocabulario e as siglas da escola — o professor deve reconhecer o cenario',
      '     como algo que poderia acontecer no seu dia a dia',
      '   - Nomeie personagens (alunos, colegas, pais) com nomes brasileiros comuns e plausiveis',
      '   - NAO use nomes de colaboradores reais — use personagens genericos com cargos reais',
      '   - Inclua serie/ano, disciplina e momento especifico',
      '',
      '2. ESTRUTURA DO DILEMA',
      '   - O cenario apresenta uma SITUACAO-PROBLEMA concreta, nao uma pergunta teorica',
      '   - O dilema deve ter tensao real: interesses conflitantes, urgencia, recursos limitados',
      '   - A situacao deve ser complexa o suficiente para que NAO exista resposta obvia',
      '   - Evite situacoes extremas — foque em dilemas pedagogicos cotidianos',
      '',
      '3. PODER DISCRIMINANTE',
      '   - O cenario deve permitir respostas nos 4 niveis de maturidade',
      '   - N1: resposta funcional mas limitada (generica, reativa)',
      '   - N2: intencao presente mas sem metodo ou consistencia',
      '   - N3: acoes concretas, estruturadas e alinhadas a competencia',
      '   - N4: articulacao de multiplas dimensoes, formacao de outros, impacto institucional',
      '   - A DIFERENCA entre niveis esta na complexidade da articulacao, nao no tamanho',
      '',
      '4. DIVERSIDADE EM RELACAO AO CENARIO A',
      '   - Situacao-gatilho OBRIGATORIAMENTE diferente',
      '   - Varie: momento do dia/ano, atores envolvidos, tipo de dilema',
      '   - Se cenario A foca sala de aula, cenario B pode focar equipe ou comunidade',
      '   - Se cenario A envolve familias, cenario B pode envolver gestao ou colegas',
      '',
      '</REGRAS_DE_CONSTRUCAO>',
      '',
      '<FORMATO_DE_SAIDA>',
      'Responda APENAS com JSON valido (sem markdown):',
      '{',
      '  "descricao": "contexto do cenario B (80-150 palavras, pano de fundo realista)",',
      '  "personagens": "quem esta envolvido (personagens genericos com cargos reais)",',
      '  "situacao_gatilho": "o que aconteceu (DIFERENTE do cenario A)",',
      '  "pergunta_aprofund_1": "Dimensao SITUACAO",',
      '  "pergunta_aprofund_2": "Dimensao ACAO",',
      '  "pergunta_raciocinio": "Dimensao RACIOCINIO",',
      '  "pergunta_cis": "Dimensao AUTOSSENSIBILIDADE",',
      '  "objetivo_conversacional": "O que esta conversa deve evidenciar",',
      '  "referencia_avaliacao": {',
      '    "nivel_1": "que tipo de resposta indica nivel 1",',
      '    "nivel_2": "que tipo de resposta indica nivel 2",',
      '    "nivel_3": "que tipo de resposta indica nivel 3",',
      '    "nivel_4": "que tipo de resposta indica nivel 4"',
      '  },',
      '  "faceta_avaliada": "qual aspecto especifico da competencia este cenario captura",',
      '  "dilema_etico_embutido": {',
      '    "valor_testado": "nome do valor que o cenario provoca",',
      '    "onde_aparece": "breve descricao do momento do dilema",',
      '    "caminho_facil": "o que faria se cedesse",',
      '    "caminho_etico": "o que faria mantendo o valor"',
      '  }',
      '}',
      '</FORMATO_DE_SAIDA>'
    ].join("\n");

    // ── USER PROMPT — Dados específicos ──
    var user = [];

    // Cargo
    user.push('<CARGO>');
    user.push(sessao.cargo);
    user.push('</CARGO>');
    user.push('');

    // Competência e régua
    user.push('<COMPETENCIA>');
    user.push('Nome: ' + (comp ? comp.nome : sessao.competencia_nome));
    if (comp && comp.descricao) user.push('Descricao: ' + comp.descricao);
    user.push('');

    // V2: Descritores detalhados com N1-N4 e evidências
    if (descritoresV2 && descritoresV2.length > 0) {
      user.push('DESCRITORES (6 descritores com niveis):');
      descritoresV2.forEach(function(d, i) {
        user.push('');
        user.push('D' + (i + 1) + ': ' + d.cod + ' — ' + d.nome_curto);
        user.push('  N1: ' + d.n1);
        user.push('  N3: ' + d.n3);
        if (d.evidencia) user.push('  Evidencia: ' + d.evidencia);
      });
      user.push('');
      user.push('COBERTURA: As 4 perguntas devem cobrir os 6 descritores.');
    } else if (comp && comp.descritores) {
      user.push('Descritores: ' + comp.descritores);
    }
    user.push('</COMPETENCIA>');
    user.push('');

    user.push('<REGUA_DE_MATURIDADE>');
    if (reguaCompleta) {
      user.push(reguaCompleta);
    } else if (comp) {
      user.push('Nivel 1 — Emergente: ' + (comp.nivel1 || ''));
      user.push('Nivel 2 — Em desenvolvimento: ' + (comp.nivel2 || ''));
      user.push('Nivel 3 — Proficiente: ' + (comp.nivel3 || ''));
      user.push('Nivel 4 — Referencia: ' + (comp.nivel4 || ''));
    }
    user.push('</REGUA_DE_MATURIDADE>');
    user.push('');

    // Contexto PPP
    user.push('<CONTEXTO_DA_ESCOLA>');
    if (sessao.contextoPPP) {
      user.push(sessao.contextoPPP);
    } else {
      user.push('Escola: ' + (sessao.escola || 'Escola publica municipal'));
    }
    user.push('</CONTEXTO_DA_ESCOLA>');
    user.push('');

    // Valores organizacionais da escola
    var vals = sessao.valores || VALORES_BASE;
    user.push('<VALORES_DA_ESCOLA>');
    vals.forEach(function(v, i) { user.push((i + 1) + '. ' + v); });
    user.push('');
    user.push('REGRA: O cenario B DEVE conter pelo menos 1 dilema onde o caminho mais');
    user.push('facil/rapido entra em conflito com um dos valores acima.');
    user.push('O dilema deve ser DIFERENTE do cenario A. NAO explicitar — emergir naturalmente.');
    user.push('</VALORES_DA_ESCOLA>');
    user.push('');

    // Perfil CIS ideal do cargo (gabarito da IA2)
    if (sessao.gabaritoCIS && sessao.gabaritoCIS.resumo) {
      user.push('<PERFIL_CIS_IDEAL_DO_CARGO>');
      user.push('Perfil comportamental ideal para "' + sessao.cargo + '" nesta escola:');
      user.push(sessao.gabaritoCIS.resumo);
      user.push('');
      user.push('O cenario B deve PROVOCAR os comportamentos que este perfil exige.');
      user.push('Se DISC ideal tem D Alto → decisao sob pressao. I Alto → engajamento.');
      user.push('S Alto → mediacao e processos. C Alto → analise e conformidade.');
      user.push('</PERFIL_CIS_IDEAL_DO_CARGO>');
      user.push('');
    } else if (tracosCIS.length > 0) {
      // Fallback: traços antigos
      user.push('<TRACOS_CIS>');
      for (var t = 0; t < tracosCIS.length; t++) {
        user.push('- ' + tracosCIS[t]);
      }
      user.push('O cenario DEVE forcar comportamentos ligados a estes tracos.');
      user.push('</TRACOS_CIS>');
      user.push('');
    }

    // Cenário A (para NÃO repetir)
    if (sessao.cenario_a && sessao.cenario_a.descricao) {
      user.push('<CENARIO_A_NAO_REPETIR>');
      user.push('Contexto: ' + sessao.cenario_a.descricao);
      if (sessao.cenario_a.personagens) user.push('Personagens: ' + sessao.cenario_a.personagens);
      if (sessao.cenario_a.situacao_gatilho) user.push('Gatilho: ' + sessao.cenario_a.situacao_gatilho);
      user.push('</CENARIO_A_NAO_REPETIR>');
    }

    return { system: system, user: user.join("\n") };
  },

  /**
   * Parseia JSON do cenario B da resposta do Claude.
   */
  _parsearCenarioB: function(response) {
    try {
      var cleaned = response.replace(/```json|```/g, "").trim();
      return JSON.parse(cleaned);
    } catch (e) {
      var match = response.match(/\{[\s\S]*\}/);
      if (match) {
        try { return JSON.parse(match[0]); } catch (e2) {}
      }
      return null;
    }
  },

  /**
   * Valida cenario B com Gemini — contexto COMPLETO (mesmo que geracao).
   */
  _validarCenarioB: function(cenarioB, sessao, comp, reguaCompleta) {
    var prompt = [];

    prompt.push("Voce e um auditor de qualidade de cenarios de avaliacao comportamental da plataforma Vertho.");
    prompt.push("Valide o cenario B considerando TODOS estes criterios:");
    prompt.push("");
    prompt.push("1. O cenario B e DIFERENTE do cenario A? (situacao-gatilho diferente, nao apenas refraseado)");
    prompt.push("2. O cenario e realista para o cargo '" + sessao.cargo + "' na escola '" + (sessao.escola || 'nao informada') + "'?");
    prompt.push("3. O cenario FORCA comportamentos ligados aos descritores da competencia?");
    prompt.push("4. As perguntas de inspiracao cobrem as 4 dimensoes (Situacao, Acao, Raciocinio, Autossensibilidade)?");
    prompt.push("5. O cenario permite diferenciar os 4 niveis da regua? (verifique com as evidencias-chave)");
    prompt.push("6. O objetivo conversacional esta claro e conectado a competencia?");
    prompt.push("");

    // Cenario A
    prompt.push("== CENARIO A (nao deve repetir) ==");
    prompt.push("Contexto: " + sessao.cenario_a.descricao);
    prompt.push("Gatilho: " + sessao.cenario_a.situacao_gatilho);
    prompt.push("");

    // Cenario B
    prompt.push("== CENARIO B (a validar) ==");
    prompt.push(JSON.stringify(cenarioB, null, 2));
    prompt.push("");

    // Competencia
    prompt.push("== COMPETENCIA: " + (comp ? comp.nome : sessao.competencia_nome));
    if (comp && comp.descricao) prompt.push("Definicao: " + comp.descricao);
    prompt.push("");

    // Regua completa
    if (reguaCompleta) {
      prompt.push("== REGUA DE AVALIACAO COMPLETA ==");
      prompt.push(reguaCompleta);
      prompt.push("");
    }

    // Tracos CIS da competencia
    var tracosCIS = (comp && comp.tracos_cis) ? comp.tracos_cis : [];
    if (tracosCIS.length > 0) {
      prompt.push("== TRACOS CIS RELEVANTES PARA ESTA COMPETENCIA ==");
      for (var t = 0; t < tracosCIS.length; t++) {
        prompt.push("- " + tracosCIS[t]);
      }
      prompt.push("");
    }

    // Cargo e escola
    prompt.push("== CARGO: " + sessao.cargo + " ==");
    if (sessao.escola) prompt.push("== ESCOLA/UNIDADE: " + sessao.escola + " ==");
    prompt.push("");

    prompt.push("== INSTRUCAO ==");
    prompt.push("Avalie cada um dos criterios. Se QUALQUER criterio critico falhar (1, 2, 6), reprove.");
    prompt.push("Na duvida, peca ajuste em vez de aprovar.");
    prompt.push("");
    prompt.push("Responda APENAS com JSON:");
    prompt.push('{"status":"aprovado|ajustar|reprovar","criterios_ok":[1,2,3],"criterios_falha":[5,7],"motivo":"explicacao curta","sugestoes":"o que ajustar se necessario"}');

    try {
      var response = AIRouter.callGemini({ fullText: prompt.join("\n") });
      var cleaned = response.replace(/```json|```/g, "").trim();
      var match = cleaned.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    } catch (e) {
      Logger.log("Erro validacao Gemini cenario B: " + e.message);
    }

    return { status: "pendente", motivo: "Erro na validacao automatica" };
  },

  /**
   * Grava cenario B na aba Cenarios_B.
   */
  _gravarCenarioB: function(ss, sessao, cenarioB, validacao) {
    var ws = ss.getSheetByName(Config.SHEET_CENARIOS_B);
    if (!ws) {
      this._garantirAbaCenariosB(ss);
      ws = ss.getSheetByName(Config.SHEET_CENARIOS_B);
    }

    ws.appendRow([
      sessao.cargo,
      sessao.escola || "",
      sessao.competencia_id,
      cenarioB.descricao || "",
      cenarioB.personagens || "",
      cenarioB.situacao_gatilho || "",
      cenarioB.pergunta_aprofund_1 || "",
      cenarioB.pergunta_aprofund_2 || "",
      cenarioB.pergunta_raciocinio || "",
      cenarioB.pergunta_cis || "",
      cenarioB.objetivo_conversacional || "",
      validacao.status || "pendente",
      validacao.motivo || "",
      validacao.sugestoes || "",
      new Date().toISOString()
    ]);
  },

  /**
   * Retorna cenarios B ja existentes para evitar duplicatas.
   */
  _cenariosBExistentes: function(ss) {
    var existentes = {};
    var ws = ss.getSheetByName(Config.SHEET_CENARIOS_B);
    if (!ws) return existentes;

    var data = ws.getDataRange().getValues();
    for (var r = 1; r < data.length; r++) {
      var cargo = String(data[r][0] || "").toLowerCase().trim();
      var escola = String(data[r][1] || "").toLowerCase().trim();
      var compId = String(data[r][2] || "").toUpperCase().trim();
      if (cargo && compId) {
        existentes[cargo + "|" + escola + "|" + compId] = true;
      }
    }
    return existentes;
  },

  /**
   * Cria aba Cenarios_B se nao existe.
   */
  _garantirAbaCenariosB: function(ss) {
    var ws = ss.getSheetByName(Config.SHEET_CENARIOS_B);
    if (ws) return;

    ws = ss.insertSheet(Config.SHEET_CENARIOS_B);
    ws.appendRow([
      "cargo",
      "escola",
      "competencia_id",
      "descricao",
      "personagens",
      "situacao_gatilho",
      "pergunta_aprofund_1",
      "pergunta_aprofund_2",
      "pergunta_raciocinio",
      "pergunta_cis",
      "objetivo_conversacional",
      "validacao_status",
      "validacao_motivo",
      "validacao_sugestoes",
      "created_at"
    ]);

    ws.getRange(1, 1, 1, 15).setFontWeight("bold");
    Logger.log("Aba " + Config.SHEET_CENARIOS_B + " criada");
  }
};


// ── Helper global para resolver score de traco CIS ──────────────────

function _resolverScoreTraco(tracoNome, traitScores, traitAliases) {
  if (!traitScores) return null;

  // Match direto
  var score = traitScores[tracoNome] || null;

  // Via alias
  if (!score && traitAliases) {
    var alias = traitAliases[tracoNome.toLowerCase()];
    if (alias) score = traitScores[alias] || null;
  }

  // Match parcial
  if (!score) {
    var keys = Object.keys(traitScores);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].toLowerCase().indexOf(tracoNome.toLowerCase()) >= 0
          || tracoNome.toLowerCase().indexOf(keys[i].toLowerCase()) >= 0) {
        score = traitScores[keys[i]];
        break;
      }
    }
  }

  return score;
}


// ── Funcao de menu ───────────────────────────────────────────────────

function gerarCenariosBFase3() {
  CenarioBGenerator.gerarCenariosBLote();
}