// =====================================================================
// VERTHO - CriarSessoesLote.gs  (v2)
//
// Logica de atribuicao por quadrimestre:
//   - Escola define 1 competencia por quadrimestre
//   - Nivel 1-2 nessa competencia → avalia essa competencia
//   - Nivel 3-4 nessa competencia → avalia a de maior gap no Top 5
//
// Dependencias: Config.gs, StateManager.gs
// =====================================================================


/**
 * Menu: abre seletor visual de competencias por cargo.
 */
function criarSessoesLoteMenu() {
  var html = HtmlService
    .createHtmlOutputFromFile('SeletorCompFase3')
    .setWidth(560)
    .setHeight(540)
    .setSandboxMode(HtmlService.SandboxMode.IFRAME);
  SpreadsheetApp.getUi().showModalDialog(html, '📋 Criar Sessões — Fase 3');
}

/**
 * Chamado pelo dialog para carregar cargos e suas competencias Top 5.
 */
function carregarDadosSeletorFase3() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var top5PorCargo = _lerTop5PorCargo(ss);
  var cargos = Object.keys(top5PorCargo);

  if (cargos.length === 0) {
    throw new Error("Nenhum cargo com Top 5 encontrado na aba Cargos (col U).");
  }

  var resultado = [];

  for (var ci = 0; ci < cargos.length; ci++) {
    var cargoNorm = cargos[ci];
    var comps = top5PorCargo[cargoNorm];

    // Formatar nome do cargo
    var cargoDisplay = cargoNorm.charAt(0).toUpperCase() + cargoNorm.slice(1);

    // Buscar nomes das competencias
    var competencias = [];
    for (var i = 0; i < comps.length; i++) {
      var compNome = comps[i];
      try {
        var compObj = StateManager.getCompetencia(comps[i]);
        if (compObj && compObj.nome) compNome = compObj.nome;
      } catch(e) {}
      competencias.push({ id: comps[i], nome: compNome });
    }

    resultado.push({
      cargoKey: cargoNorm,
      cargoDisplay: cargoDisplay,
      competencias: competencias
    });
  }

  return resultado;
}

/**
 * Chamado pelo dialog ao confirmar selecao.
 * @param {Object} selecao - { "professor(a)": "C023", "coordenador(a) pedagógico(a)": "C003" }
 */
function executarCriacaoSessoesFase3(selecao) {
  var ui = SpreadsheetApp.getUi();

  // Pedir nome do ciclo
  var respCiclo = ui.prompt(
    "Nome do Ciclo",
    "Nome do ciclo (ex: 'Q1 2026'):",
    ui.ButtonSet.OK_CANCEL
  );
  if (respCiclo.getSelectedButton() !== ui.Button.OK) return;
  var nomeCiclo = respCiclo.getResponseText().trim();
  if (!nomeCiclo) { ui.alert("Cancelado."); return; }

  var resultado = criarSessoesLote(nomeCiclo, selecao);

  // Resumo
  var resumo = "Ciclo: " + nomeCiclo + "\nID: " + resultado.ciclo_id + "\n\n";

  var keys = Object.keys(selecao);
  for (var i = 0; i < keys.length; i++) {
    var cargoDisplay = keys[i].charAt(0).toUpperCase() + keys[i].slice(1);
    var compId = selecao[keys[i]];
    var compNome = compId;
    try {
      var obj = StateManager.getCompetencia(compId);
      if (obj && obj.nome) compNome = compId + " — " + obj.nome;
    } catch(e) {}
    resumo += "• " + cargoDisplay + ": " + compNome + "\n";
  }

  resumo += "\nColaboradores: " + resultado.total_colaboradores
    + "\nNivel 1-2 (comp quadrimestre): " + resultado.nivel_1_2
    + "\nNivel 3-4 (maior gap): " + resultado.nivel_3_4
    + "\nSem dados Fase 1: " + resultado.sem_dados
    + "\nSessoes criadas: " + resultado.sessoes_criadas
    + "\nErros: " + resultado.erros;

  ui.alert("Sessoes Criadas!", resumo, ui.ButtonSet.OK);
}


/**
 * Cria sessoes para todos os colaboradores de um ciclo.
 *
 * @param {string} nomeCiclo
 * @param {Object} compPorCargo - { "professor(a)": "C023", "coordenador(a) pedagógico(a)": "C003" }
 * @param {Object} [opcoes] - { colaboradores: ['email@x.com'] }
 */
function criarSessoesLote(nomeCiclo, compPorCargo, opcoes) {
  opcoes = opcoes || {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cicloId = "ciclo_" + Date.now();
  var agora = new Date().toISOString();

  Logger.log("=== CRIANDO SESSOES EM LOTE ===");
  Logger.log("Ciclo: " + nomeCiclo);
  Logger.log("Competencias por cargo: " + JSON.stringify(compPorCargo));

  // ── 1. Ler Colaboradores ──────────────────────────────────────────
  var wsColab = ss.getSheetByName(Config.SHEET_COLABORADORES || "Colaboradores");
  if (!wsColab) throw new Error("Aba Colaboradores nao encontrada");

  var colabData = wsColab.getDataRange().getValues();
  // Header na linha 4 (index 3)
  var colabHeaderRow = 3;
  if (colabData.length <= 4) throw new Error("Aba Colaboradores vazia");

  // Col B (1) = Nome, Col D (3) = Cargo, Col G (6) = Email
  var colaboradores = [];
  for (var r = colabHeaderRow + 1; r < colabData.length; r++) {
    var email = String(colabData[r][6] || "").trim().toLowerCase();
    var nome = String(colabData[r][1] || "").trim();
    var cargo = String(colabData[r][3] || "").trim();
    if (!email || !cargo) continue;

    if (opcoes.colaboradores && opcoes.colaboradores.length > 0) {
      if (opcoes.colaboradores.indexOf(email) < 0) continue;
    }

    colaboradores.push({ email: email, nome: nome, cargo: cargo });
  }

  Logger.log("Colaboradores: " + colaboradores.length);

  // ── 2. Ler Top 5 Workshop por cargo (aba Cargos, col U) ──────────
  var top5PorCargo = _lerTop5PorCargo(ss);
  Logger.log("Top 5 por cargo: " + JSON.stringify(
    Object.keys(top5PorCargo).map(function(k) { return k + ": " + top5PorCargo[k].join(","); })
  ));

  // ── 3. Ler notas IA4 da aba Respostas ─────────────────────────────
  var notasPorColab = _lerNotasIA4(ss);

  // ── 4. Verificar cenarios B disponiveis ───────────────────────────
  var cenariosB = _lerCenariosBDisponiveis(ss);

  // ── 5. Atribuir competencia e criar sessoes ───────────────────────
  var sessoesCriadas = 0, erros = 0;
  var contNivel12 = 0, contNivel34 = 0, contSemDados = 0;
  var detalhes = [];

  for (var i = 0; i < colaboradores.length; i++) {
    var colab = colaboradores[i];
    var cargoNorm = colab.cargo.toLowerCase();

    // Encontrar a competencia do quadrimestre para este cargo
    var compQuadrimestre = _encontrarCompQuadrimestre(compPorCargo, cargoNorm);
    if (!compQuadrimestre) {
      Logger.log("AVISO: Sem comp quadrimestre para cargo '" + colab.cargo + "' (" + colab.email + ")");
      detalhes.push({ email: colab.email, status: "sem_comp_cargo", cargo: colab.cargo });
      continue;
    }

    // Buscar nota na competencia do quadrimestre
    var notasColab = notasPorColab[colab.email] || {};
    var notaQuadri = notasColab[compQuadrimestre.toLowerCase()] || null;
    var nivelQuadri = notaQuadri ? Math.floor(Number(notaQuadri.nivel) || 0) : 0;

    var compAtribuida = "";
    var motivo = "";

    if (!notaQuadri || nivelQuadri === 0) {
      // Sem dados da Fase 1 para esta competencia
      // Default: atribui a competencia do quadrimestre
      compAtribuida = compQuadrimestre;
      motivo = "sem_dados_fase1";
      contSemDados++;
      Logger.log(colab.email + ": sem dados Fase 1 para " + compQuadrimestre + " -> atribui comp quadrimestre");

    } else if (nivelQuadri <= 2) {
      // Nivel 1-2: faz a competencia do quadrimestre
      compAtribuida = compQuadrimestre;
      motivo = "nivel_" + nivelQuadri;
      contNivel12++;
      Logger.log(colab.email + ": nivel " + nivelQuadri + " em " + compQuadrimestre + " -> faz comp quadrimestre");

    } else {
      // Nivel 3-4: buscar maior gap no Top 5
      var top5 = _encontrarTop5(top5PorCargo, cargoNorm);
      var maiorGap = (top5 && top5.length > 0) ? _encontrarMaiorGap(notasColab, top5, compQuadrimestre) : null;
      if (maiorGap) {
        compAtribuida = maiorGap.compId;
        motivo = "nivel_" + nivelQuadri + "_gap_" + maiorGap.compId + "_nota_" + maiorGap.nota;
        contNivel34++;
        Logger.log(colab.email + ": nivel " + nivelQuadri + " em " + compQuadrimestre
          + " -> maior gap: " + maiorGap.compId + " (nota " + maiorGap.nota + ")");
      } else {
        // Nao tem notas das outras competencias -> atribui quadrimestre mesmo
        compAtribuida = compQuadrimestre;
        motivo = "nivel_" + nivelQuadri + "_sem_alternativa";
        contNivel12++;
        Logger.log(colab.email + ": nivel " + nivelQuadri + " mas sem notas alternativas -> comp quadrimestre");
      }
    }

    // Verificar se tem cenario B para esta competencia (por cargo+escola)
    var chaveCenario = (colab.cargo || "").toLowerCase() + "|" + (colab.area || colab.escola || "").toLowerCase() + "|" + compAtribuida.toUpperCase();
    if (!cenariosB[chaveCenario]) {
      Logger.log("AVISO: Cenario B nao encontrado para " + chaveCenario + " — sessao criada mesmo assim");
    }

    // Buscar nome da competencia
    var compNome = compAtribuida;
    try {
      var compObj = StateManager.getCompetencia(compAtribuida);
      if (compObj && compObj.nome) compNome = compObj.nome;
    } catch(e) {}

    // Criar sessao
    try {
      var sessaoId = Utilities.getUuid();
      StateManager.saveSessionState({
        sessao_id: sessaoId,
        ciclo_id: cicloId,
        colaborador_id: colab.email,
        competencia_id: compAtribuida,
        competencia: compNome,
        status: "pendente",
        fase: "nova",
        history: [],
        cenarios: [],
        baseline: null,
        aprofundamentos_cenario1: 0,
        aprofundamentos_cenario2: 0,
        contraexemplo_usado: false,
        cenario_atual: 0,
        created_at: agora,
        updated_at: agora,
        last_activity: agora
      });
      sessoesCriadas++;

      detalhes.push({
        email: colab.email,
        nome: colab.nome,
        cargo: colab.cargo,
        comp_quadrimestre: compQuadrimestre,
        nivel_quadrimestre: nivelQuadri,
        comp_atribuida: compAtribuida,
        comp_nome: compNome,
        motivo: motivo,
        status: "ok"
      });

    } catch(e) {
      Logger.log("ERRO criar sessao " + colab.email + ": " + e.message);
      erros++;
    }
  }

  // ── 6. Registrar Ciclo ────────────────────────────────────────────
  try {
    var wsCiclos = StateManager._ensureSheet(Config.SHEET_CICLOS, [
      "ciclo_id", "cliente_id", "nome", "data_inicio", "data_fim", "status", "competencias", "created_at"
    ]);
    wsCiclos.appendRow([
      cicloId, "", nomeCiclo, agora, "", "ativo",
      JSON.stringify(compPorCargo),
      agora
    ]);
  } catch(e) {
    Logger.log("ERRO registrar ciclo: " + e.message);
  }

  // ── 7. Log de detalhes ────────────────────────────────────────────
  Logger.log("=== DETALHES ===");
  for (var d = 0; d < detalhes.length; d++) {
    var det = detalhes[d];
    if (det.comp_atribuida) {
      Logger.log(det.email + " | " + det.comp_atribuida + " (" + det.motivo + ")");
    }
  }

  var resultado = {
    ciclo_id: cicloId,
    nome_ciclo: nomeCiclo,
    comp_por_cargo: compPorCargo,
    total_colaboradores: colaboradores.length,
    nivel_1_2: contNivel12,
    nivel_3_4: contNivel34,
    sem_dados: contSemDados,
    sessoes_criadas: sessoesCriadas,
    erros: erros,
    detalhes: detalhes
  };

  Logger.log("=== RESULTADO: " + sessoesCriadas + " sessoes, " + erros + " erros ===");
  return resultado;
}


// ══════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════

/**
 * Le Top 5 Workshop da aba Cargos (col U = col 21).
 * Retorna: { "professor(a)": ["C033","C023",...], "coordenador(a) pedagógico(a)": [...] }
 */
function _lerTop5PorCargo(ss) {
  var ws = ss.getSheetByName("Cargos");
  if (!ws) return {};

  var data = ws.getDataRange().getValues();
  var resultado = {};

  // Header na linha 4 (index 3), dados a partir de 5 (index 4)
  for (var r = 4; r < data.length; r++) {
    var cargoNome = String(data[r][2] || "").trim().toLowerCase(); // Col C = Nome do Cargo
    var top5Raw = String(data[r][20] || "").trim(); // Col U (index 20)
    if (!cargoNome || !top5Raw) continue;

    var comps = top5Raw.split(",").map(function(c) { return c.trim().toUpperCase(); }).filter(function(c) { return c; });
    resultado[cargoNome] = comps;
  }

  return resultado;
}

/**
 * Le notas IA4 da aba Respostas.
 * Retorna: { "email": { "c023": { nivel: 2, nota: 2.45 }, ... } }
 */
function _lerNotasIA4(ss) {
  var ws = ss.getSheetByName("Respostas");
  if (!ws) return {};

  var data = ws.getDataRange().getValues();
  var resultado = {};

  // Col B (1) = Email, Col F (5) = ID Competencia, Col Q (16) = Nivel, Col R (17) = Nota
  for (var r = 1; r < data.length; r++) {
    var email = String(data[r][1] || "").trim().toLowerCase();
    var compId = String(data[r][5] || "").trim().toLowerCase();
    var nivel = Number(data[r][16]) || 0;
    var nota = Number(data[r][17]) || 0;

    if (!email || !compId) continue;

    if (!resultado[email]) resultado[email] = {};
    resultado[email][compId] = { nivel: nivel, nota: nota };
  }

  return resultado;
}

/**
 * Le cenarios B existentes.
 * Retorna: { "cargo|escola|COMPID": true }
 */
function _lerCenariosBDisponiveis(ss) {
  var ws = ss.getSheetByName(Config.SHEET_CENARIOS_B || "Cenarios_B");
  if (!ws) return {};

  var data = ws.getDataRange().getValues();
  var resultado = {};

  // Nova estrutura: col 0=cargo, col 1=escola, col 2=compId
  for (var r = 1; r < data.length; r++) {
    var cargo = String(data[r][0] || "").trim().toLowerCase();
    var escola = String(data[r][1] || "").trim().toLowerCase();
    var compId = String(data[r][2] || "").trim().toUpperCase();
    if (cargo && compId) {
      resultado[cargo + "|" + escola + "|" + compId] = true;
    }
  }

  return resultado;
}

/**
 * Encontra Top 5 para um cargo (match flexivel).
 */
function _encontrarTop5(top5PorCargo, cargoNorm) {
  // Match exato
  if (top5PorCargo[cargoNorm]) return top5PorCargo[cargoNorm];

  // Match parcial
  var keys = Object.keys(top5PorCargo);
  for (var i = 0; i < keys.length; i++) {
    if (cargoNorm.indexOf(keys[i]) >= 0 || keys[i].indexOf(cargoNorm) >= 0) {
      return top5PorCargo[keys[i]];
    }
  }

  return null;
}

/**
 * Encontra a competencia do quadrimestre para um cargo (match flexivel).
 * @param {Object} compPorCargo - { "professor(a)": "C023", ... }
 * @param {string} cargoNorm - cargo normalizado (lowercase)
 */
function _encontrarCompQuadrimestre(compPorCargo, cargoNorm) {
  if (compPorCargo[cargoNorm]) return compPorCargo[cargoNorm];

  var keys = Object.keys(compPorCargo);
  for (var i = 0; i < keys.length; i++) {
    if (cargoNorm.indexOf(keys[i]) >= 0 || keys[i].indexOf(cargoNorm) >= 0) {
      return compPorCargo[keys[i]];
    }
  }

  return null;
}

/**
 * Encontra a competencia com maior gap (menor nota IA4) no Top 5,
 * excluindo a competencia do quadrimestre.
 */
function _encontrarMaiorGap(notasColab, top5, compQuadrimestre) {
  var menorNota = 999;
  var maiorGap = null;

  for (var i = 0; i < top5.length; i++) {
    var compId = top5[i];
    if (compId.toUpperCase() === compQuadrimestre.toUpperCase()) continue; // pular a do quadrimestre

    var dados = notasColab[compId.toLowerCase()] || null;
    if (!dados) continue;

    var nota = Number(dados.nota) || Number(dados.nivel) || 999;
    if (nota < menorNota) {
      menorNota = nota;
      maiorGap = { compId: compId, nota: nota, nivel: dados.nivel };
    }
  }

  return maiorGap;
}