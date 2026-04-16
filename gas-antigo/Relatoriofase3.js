// =====================================================================
// VERTHO - RelatorioFase3.gs
//
// Gera relatorio individual da Fase 3 (Avaliacao Conversacional)
// para cada colaborador com sessoes concluidas.
//
// Template: usa {{NOME}}, {{CARGO}}, {{RELATORIO_DINAMICO}}
// Output: PDF na pasta de relatorios
//
// Dependencias: Config.gs, StateManager.gs, AIRouter.gs
// =====================================================================

var RELATORIO_F3_TEMPLATE = '1496JseTk7Dy00cShjTMRf1mK-x8E1YjvysXds1ZzO_I';
var RELATORIO_F3_PASTA    = '10vCvITcUMjGnFRcbShr14axxa4B7ZJGQ';


// ══════════════════════════════════════════════════════════════════════
// MENU
// ══════════════════════════════════════════════════════════════════════

function gerarRelatoriosFase3Menu() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.alert(
    "Gerar Relatorios Fase 3",
    "Isso vai gerar relatorios para todos os colaboradores com sessoes concluidas.\n\n"
    + "Custo estimado: ~1 chamada Claude por colaborador.\n\nContinuar?",
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  var resultado = gerarRelatoriosFase3();
  ui.alert(
    "Relatorios Gerados!",
    "PDFs gerados: " + resultado.gerados + "\n"
    + "Erros: " + resultado.erros + "\n\n"
    + "Pasta: Relatorios",
    ui.ButtonSet.OK
  );
}


// ══════════════════════════════════════════════════════════════════════
// PRINCIPAL
// ══════════════════════════════════════════════════════════════════════

/**
 * Gera relatorios para todos os colaboradores com sessoes Fase 3 concluidas.
 * @param {Object} [opcoes] - { colaboradores: ['email@x.com'], cicloId: 'ciclo_xxx' }
 */
function gerarRelatoriosFase3(opcoes) {
  opcoes = opcoes || {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var folder = DriveApp.getFolderById(RELATORIO_F3_PASTA);
  var templateFile = DriveApp.getFileById(RELATORIO_F3_TEMPLATE);

  Logger.log("=== GERANDO RELATORIOS FASE 3 ===");

  // 1. Coletar todas as sessoes concluidas agrupadas por colaborador
  var sessoesPorColab = _coletarSessoesConcluidas(ss, opcoes);
  var emails = Object.keys(sessoesPorColab);
  Logger.log("Colaboradores com sessoes: " + emails.length);

  var gerados = 0, erros = 0;

  for (var i = 0; i < emails.length; i++) {
    if (_deveParar()) { _limparParada(); break; }
    var email = emails[i];
    var dados = sessoesPorColab[email];

    SpreadsheetApp.getActive().toast(
      "[" + Config.modelLabel(Config.MODEL_RELATORIO) + "]\nGerando: " + dados.nome + " (" + (i+1) + "/" + emails.length + ")",
      "Relatorios Fase 3", 5
    );

    try {
      // 2. Coletar dados completos
      var colaborador = StateManager.getColaborador(email);
      var dadosFase1 = _coletarDadosFase1(ss, email);
      var reguasPorComp = _coletarReguas(colaborador);

      // 3. Chamar Claude para gerar o relatorio
      var relatorioIA = _gerarConteudoIA(colaborador, dados.sessoes, dadosFase1, reguasPorComp);

      if (!relatorioIA || relatorioIA.erro) {
        Logger.log("ERRO IA para " + email + ": " + (relatorioIA ? relatorioIA.mensagem : "null"));
        erros++;
        continue;
      }

      // 4. Criar o documento a partir do template
      _criarDocumento(templateFile, folder, colaborador, dados, relatorioIA, dadosFase1);
      gerados++;

    } catch(e) {
      Logger.log("ERRO relatorio " + email + ": " + e.message);
      erros++;
    }
  }

  Logger.log("=== RESULTADO: " + gerados + " gerados, " + erros + " erros ===");
  return { gerados: gerados, erros: erros };
}


// ══════════════════════════════════════════════════════════════════════
// COLETA DE DADOS
// ══════════════════════════════════════════════════════════════════════

function _coletarSessoesConcluidas(ss, opcoes) {
  var ws = ss.getSheetByName(Config.SHEET_SESSOES || "Sessoes");
  if (!ws) return {};

  var data = ws.getDataRange().getValues();
  var headers = data[0];
  var iEmail = _colIdx(headers, "colaborador_id");
  var iStatus = _colIdx(headers, "status");
  var iCompId = _colIdx(headers, "competencia_id");
  var iComp = _colIdx(headers, "competencia");
  var iNivel = _colIdx(headers, "nivel");
  var iConf = _colIdx(headers, "confianca");
  var iEvid = _colIdx(headers, "evidencias");
  var iLacuna = _colIdx(headers, "lacuna");
  var iValid = _colIdx(headers, "validacao");
  var iCiclo = _colIdx(headers, "ciclo_id");

  var resultado = {};

  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    if (String(row[iStatus]).toLowerCase() !== "concluida") continue;

    // Filtro por ciclo
    if (opcoes.cicloId && String(row[iCiclo]) !== opcoes.cicloId) continue;

    var email = String(row[iEmail]).toLowerCase().trim();

    // Filtro por colaboradores
    if (opcoes.colaboradores && opcoes.colaboradores.length > 0) {
      if (opcoes.colaboradores.indexOf(email) < 0) continue;
    }

    if (!resultado[email]) {
      // Buscar nome
      var colab = null;
      try { colab = StateManager.getColaborador(email); } catch(e) {}
      resultado[email] = {
        nome: colab ? colab.nome : email,
        cargo: colab ? colab.cargo : "",
        sessoes: []
      };
    }

    var validacao = null;
    try { validacao = JSON.parse(row[iValid] || "null"); } catch(e) {}
    var evidencias = null;
    try { evidencias = JSON.parse(row[iEvid] || "[]"); } catch(e) {}

    resultado[email].sessoes.push({
      competencia_id: String(row[iCompId] || ""),
      competencia: String(row[iComp] || ""),
      nivel: Number(row[iNivel]) || 0,
      confianca: Number(row[iConf]) || 0,
      evidencias: evidencias || [],
      lacuna: String(row[iLacuna] || ""),
      validacao: validacao
    });
  }

  return resultado;
}

function _coletarDadosFase1(ss, email) {
  var ws = ss.getSheetByName("Respostas");
  if (!ws) return {};

  var data = ws.getDataRange().getValues();
  var resultado = {};

  for (var r = 1; r < data.length; r++) {
    var rowEmail = String(data[r][1] || "").toLowerCase().trim();
    if (rowEmail !== email) continue;

    var compId = String(data[r][5] || "").toLowerCase().trim();
    var nivel = Number(data[r][16]) || 0;
    var nota = data[r][17] || 0;
    var pontosFortes = String(data[r][18] || "");
    var pontosAtencao = String(data[r][19] || "");

    resultado[compId] = {
      nivel: nivel,
      nota: nota,
      pontos_fortes: pontosFortes,
      pontos_atencao: pontosAtencao
    };
  }

  return resultado;
}

function _coletarReguas(colaborador) {
  var cargo = (colaborador && colaborador.cargo) ? colaborador.cargo : "";
  var resultado = {};

  // Nao precisa carregar todas — a IA ja recebe os dados necessarios
  // So guardar o cargo para referencia
  resultado._cargo = cargo;
  return resultado;
}

function _colIdx(headers, name) {
  var n = String(name).toLowerCase().trim();
  return headers.findIndex(function(h) {
    return String(h).toLowerCase().trim() === n;
  });
}


// ══════════════════════════════════════════════════════════════════════
// GERACAO DE CONTEUDO VIA IA
// ══════════════════════════════════════════════════════════════════════

function _gerarConteudoIA(colaborador, sessoes, dadosFase1, reguas) {
  var nome = colaborador ? colaborador.nome : "Colaborador";
  var cargo = colaborador ? colaborador.cargo : "";
  var primeiroNome = nome.split(" ")[0];

  // Montar perfil DISC
  var discInfo = "";
  if (colaborador && colaborador.disc_descricao) {
    discInfo = colaborador.disc_descricao;
  }

  // Montar comparativo por competencia
  var compData = [];
  var reguas = [];
  for (var i = 0; i < sessoes.length; i++) {
    var s = sessoes[i];
    var compId = s.competencia_id.toLowerCase();
    var fase1 = dadosFase1[compId] || null;

    // Buscar nome EXATO da aba Competencias
    var compNomeExato = s.competencia;
    try {
      var compObj = StateManager.getCompetencia(s.competencia_id);
      if (compObj && compObj.nome) compNomeExato = compObj.nome;
    } catch(e) {}

    compData.push({
      competencia: compNomeExato,
      competencia_id: s.competencia_id,
      fase1_nivel: fase1 ? Math.floor(Number(fase1.nivel) || 0) : "N/A",
      fase1_pontos_atencao: fase1 ? fase1.pontos_atencao : "",
      fase3_nivel: Math.floor(Number(s.nivel) || 0),
      fase3_evidencias: s.evidencias,
      fase3_lacuna: s.lacuna,
      fase3_confianca: s.confianca,
      validacao: s.validacao ? s.validacao.validacao : "N/A"
    });

    // Buscar regua completa para esta competencia
    try {
      var reguaComp = StateManager.getReguaMaturidade(cargo, compNomeExato);
      if (reguaComp) {
        reguas.push("== REGUA: " + s.competencia + " ==\n" + reguaComp);
      }
    } catch(e) {}
  }

  var system = [
    "Voce e um especialista em desenvolvimento de educadores da plataforma Vertho.",
    "Gere um RELATORIO INDIVIDUAL da Fase 3 (Avaliacao Conversacional).",
    "",
    "O relatorio sera entregue ao COLABORADOR (professor ou coordenador escolar) como devolutiva pessoal.",
    "Use o primeiro nome (" + primeiroNome + ") ao se dirigir a ele.",
    "",
    "=====================================================",
    "DIRETRIZES DE TOM E LINGUAGEM (SEGUIR RIGOROSAMENTE)",
    "=====================================================",
    "",
    "1. SANDWICHE PEDAGOGICO — Acolher antes de diagnosticar:",
    "   - Comece SEMPRE reconhecendo o esforco da fase de capacitacao e o valor do perfil",
    "   - Valide o que funciona ANTES de apontar gaps",
    "   - Ex: 'Sua agilidade em resolver problemas e o que mantem a escola funcionando.'",
    "   - So depois entre no diagnostico: 'E agora podemos refinar como essa forca se conecta com a equipe.'",
    "",
    "2. LINGUAGEM DE SALA DOS PROFESSORES (nao corporativa):",
    "   - NAO use: 'checkpoints', 'protocolo estruturado', 'liderancas informais', 'stakeholders'",
    "   - USE: 'HTPC', 'reuniao de planejamento', 'conselho de classe', 'combinados da equipe',",
    "     'professores mais experientes', 'rotina da semana pedagogica'",
    "   - O vocabulario deve soar natural para quem vive o dia a dia escolar",
    "",
    "3. TOM PROFESSOR-COACH (firme mas nunca punitivo):",
    "   - NAO use: 'autoritario(a)', 'nao investe suficientemente', 'aceita desmotivacao'",
    "   - USE: 'tende a...', 'ha sinais de...', 'um risco e...', 'pode ser percebido como...'",
    "   - Mesma informacao, zero defensividade",
    "   - Firmeza com empatia: 'Isso e treinavel e voce consegue melhorar com pequenas mudancas'",
    "",
    "4. RECONHECER O CAOS ESCOLAR:",
    "   - Antes de apontar que 'impoe decisoes sem escuta', reconheca POR QUE age assim",
    "   - Ex: 'Sabemos que a pressao do calendario escolar exige respostas rapidas,",
    "     mas ceder a urgencia esta custando o engajamento da equipe'",
    "   - A pessoa deve se sentir COMPREENDIDA, nao julgada",
    "",
    "5. CONTEXTUALIZAR REGRESSAO (nunca 'desceu' seco):",
    "   - Se o nivel caiu, EXPLIQUE o contexto na analise:",
    "   - Ex: 'O nivel recuou porque, diante de desafios mais complexos nesta fase,",
    "     a resposta automatica foi endurecer, em vez de mediar.'",
    "   - Na tabela o indicador visual permanece, mas a analise humaniza",
    "",
    "6. SCRIPTS PRONTOS E MICRO-PASSOS (nao conceitos abstratos):",
    "   - NAO use: 'invista em escuta genuina', 'use mediacao estruturada'",
    "   - USE scripts aplicaveis na segunda-feira:",
    "     * 'Na proxima resistencia, diga: Me ajuda a entender o que esta te preocupando'",
    "     * 'Faca 3 perguntas fixas: O que funcionou? O que travou? Que ajuste voce sugere?'",
    "     * 'Combinado de 15 min: ouvir A (5) + ouvir B (5) + acordo (5)'",
    "   - Cada recomendacao deve ter pelo menos 1 frase pronta que a pessoa possa usar amanha",
    "",
    "7. METAS EM PRIMEIRA PESSOA COM HORIZONTE CLARO:",
    "   - Proximos passos no formato:",
    "     'Nas proximas 4 semanas, em toda reuniao com conflito eu vou:",
    "      (1) ouvir cada pessoa por 3 min sem interromper;",
    "      (2) anotar as preocupacoes num papel;",
    "      (3) propor uma solucao construida junto.'",
    "   - Curtos, especificos, em primeira pessoa, com prazo",
    "",
    "8. IMPACTO NAS CRIANCAS:",
    "   - Em cada competencia, conecte a mudanca comportamental ao impacto nos alunos",
    "   - Ex: 'Quando voce ouvir mais os professores, eles vao planejar melhor",
    "     e as criancas vao sentir mais consistencia nas aulas.'",
    "   - Para educadores, esse e o 'porque' que motiva a mudanca",
    "",
    "9. NAO mencione scores numericos de DISC ou tracos (ex: D=66, I=49)",
    "10. Niveis SEMPRE NUMERICOS: 1, 2, 3 ou 4. NUNCA 'Gap', 'Em Desenvolvimento', etc.",
    "11. Criterios de nivel seguem RIGOROSAMENTE a regua de maturidade fornecida",
    "12. Nos proximos passos, use APENAS competencias que foram avaliadas. NAO invente outras",
    "",
    "=====================================================",
    "FORMATO DE RESPOSTA",
    "=====================================================",
    "",
    "RESPONDA SOMENTE EM JSON. Sem texto antes ou depois. Sem ```json.",
    "",
    "IMPORTANTE: Escreva TODO o conteudo em portugues CORRETO com acentuacao completa",
    "(acoes, nao, voce, evolucao, criancas, pedagogico, etc). Este prompt esta sem acentos",
    "por limitacao tecnica, mas o relatorio DEVE ter acentuacao perfeita.",
    "",
    "Estrutura do JSON:",
    '{',
    '  "acolhimento": "2-3 frases de abertura: reconhecer o esforco da capacitacao, explicar o objetivo do relatorio (te ajudar a evoluir com passos praticos), e mensagem de crescimento (isso e treinavel)",',
    '  "resumo_geral": "3-5 linhas de visao geral. Comece pelo que funciona (perfil, forcas), depois o diagnostico com tom empático. Reconheca o contexto escolar antes de apontar gaps.",',
    '  "perfil_disc": {',
    '    "descricao": "Como o perfil comportamental influencia o desempenho (2-3 paragrafos). Comece pelo valor do perfil para a escola. SEM scores numericos. Linguagem acessivel.",',
    '    "pontos_forca": ["2-3 forcas do perfil — comece reconhecendo o que mantem a escola funcionando"],',
    '    "pontos_atencao": ["2-3 areas de atencao — use tende a / ha sinais de / um risco e"]',
    '  },',
    '  "competencias": [',
    '    {',
    '      "nome": "nome EXATO da competencia",',
    '      "nivel_anterior": 0,',
    '      "nivel_atual": 0,',
    '      "evolucao": "subiu|manteve|desceu",',
    '      "analise": "3-5 linhas. Se desceu, contextualizar o porque (nao apenas dizer que desceu). Reconhecer o caos escolar. Tom professor-coach. Usar criterios da regua.",',
    '      "evidencias_destaque": ["2-3 comportamentos observados — em linguagem escolar, nao corporativa"],',
    '      "lacuna_principal": "O que ainda precisa desenvolver — com empatia e contexto",',
    '      "script_pratico": "1-2 frases PRONTAS que a pessoa pode usar amanha na escola. Ex: Na proxima resistencia, diga: Me ajuda a entender o que esta te preocupando",',
    '      "impacto_alunos": "1 frase conectando essa mudanca ao impacto nas criancas. Ex: Quando voce ouvir mais a equipe, os alunos vao sentir mais consistencia nas aulas.",',
    '      "recomendacao": "1-2 micro-passos praticos com horizonte claro. Em linguagem escolar."',
    '    }',
    '  ],',
    '  "proximos_passos": {',
    '    "prioridade_1": {',
    '      "competencia": "nome",',
    '      "meta_primeira_pessoa": "Nas proximas X semanas, eu vou: (1)... (2)... (3)...",',
    '      "prazo": "curto/medio/longo"',
    '    },',
    '    "prioridade_2": {',
    '      "competencia": "nome",',
    '      "meta_primeira_pessoa": "Nas proximas X semanas, eu vou: (1)... (2)... (3)...",',
    '      "prazo": "curto/medio/longo"',
    '    },',
    '    "prioridade_3": {',
    '      "competencia": "nome",',
    '      "meta_primeira_pessoa": "Nas proximas X semanas, eu vou: (1)... (2)... (3)...",',
    '      "prazo": "curto/medio/longo"',
    '    }',
    '  },',
    '  "mensagem_final": "2-3 linhas motivacionais. Reforcar que e treinavel, que pequenas mudancas geram grande impacto, e que o resultado positivo se reflete nas criancas."',
    '}'
  ].join("\n");

  // Perfil DISC sem scores numericos (para IA descrever em linguagem acessivel)
  var perfilDesc = "";
  if (colaborador) {
    perfilDesc = "Tipo de perfil: " + (colaborador.perfil_disc || "N/A");
    // Nao enviar scores numericos - a IA deve descrever sem jargao
  }

  var user = [
    "COLABORADOR: " + nome,
    "CARGO: " + cargo,
    "PERFIL COMPORTAMENTAL: " + (perfilDesc || "Nao disponivel"),
    "",
    "DADOS POR COMPETENCIA:",
    JSON.stringify(compData, null, 2),
    ""
  ];

  // Adicionar reguas completas
  if (reguas.length > 0) {
    user.push("REGUAS DE MATURIDADE (use RIGOROSAMENTE para classificar os niveis):");
    user.push(reguas.join("\n\n"));
  }

  var userText = user.join("\n");

  // Chamar Claude
  try {
    var prompt = {
      systemStatic: system,
      systemCompetencia: "",
      messages: [{ role: "user", content: userText }]
    };

    var response = AIRouter.callClaude(prompt, "relatorio");
    
    // Parsear JSON
    var cleaned = response.replace(/```json|```/g, "").trim();
    var match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }

    return { erro: true, mensagem: "Resposta nao contem JSON valido" };

  } catch(e) {
    return { erro: true, mensagem: e.message };
  }
}


// ══════════════════════════════════════════════════════════════════════
// CRIACAO DO DOCUMENTO
// ══════════════════════════════════════════════════════════════════════

function _criarDocumento(templateFile, folder, colaborador, dados, relatorio, dadosFase1) {
  var nome = colaborador ? colaborador.nome : dados.nome;
  var cargo = colaborador ? colaborador.cargo : dados.cargo;

  // Copiar template
  var copia = templateFile.makeCopy("Relatorio Fase 3 — " + nome, folder);
  var doc = DocumentApp.openById(copia.getId());
  var body = doc.getBody();

  // Substituir placeholders
  body.replaceText("\\{\\{NOME\\}\\}", _safe(nome));
  body.replaceText("\\{\\{CARGO\\}\\}", _safe(cargo));

  // Encontrar {{RELATORIO_DINAMICO}}
  var range = body.findText("\\{\\{RELATORIO_DINAMICO\\}\\}");
  if (!range) {
    Logger.log("Placeholder RELATORIO_DINAMICO nao encontrado no template");
    doc.saveAndClose();
    return;
  }

  var parentPar = range.getElement().getParent();
  var idx = body.getChildIndex(parentPar);
  parentPar.asParagraph().setText(" ");

  // Cores
  var C_TITULO    = "#0F2B54";
  var C_SUBTITULO = "#2471A3";
  var C_TEXTO     = "#0F2B54";  // texto escuro padrao
  var C_PERFIL_BG = "#EEF3FB";
  var C_VERDE     = "#27AE60";
  var C_VERMELHO  = "#C0392B";
  var C_AMARELO   = "#F39C12";
  var C_FUNDO_POS = "#E8F5E9";
  var C_FUNDO_NEG = "#FFF3E0";

  // ── 0. ACOLHIMENTO ──────────────────────────────────────────────

  if (relatorio.acolhimento) {
    var tAcolh = body.insertTable(idx++);
    tAcolh.setBorderWidth(0);
    var cellAcolh = tAcolh.appendTableRow().appendTableCell();
    cellAcolh.setBackgroundColor("#E8F5E9")
      .setPaddingTop(12).setPaddingBottom(12).setPaddingLeft(14).setPaddingRight(14);
    while (cellAcolh.getNumChildren() > 1) cellAcolh.removeChild(cellAcolh.getChild(1));
    var pAcolh = cellAcolh.getChild(0).asParagraph();
    pAcolh.setText(relatorio.acolhimento);
    pAcolh.editAsText().setFontSize(10).setForegroundColor("#1B5E20").setItalic(true);
    body.insertParagraph(idx++, " ");
  }

  // ── 1. RESUMO GERAL ───────────────────────────────────────────────

  var h1 = body.insertParagraph(idx++, "Resumo da Avaliação");
  h1.setHeading(DocumentApp.ParagraphHeading.HEADING2)
    .setForegroundColor(C_TITULO).editAsText().setBold(true);
  body.insertParagraph(idx++, " ");

  if (relatorio.resumo_geral) {
    body.insertParagraph(idx++, relatorio.resumo_geral)
      .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_TEXTO);
    body.insertParagraph(idx++, " ");
  }

  // ── 2. RESUMO DE DESEMPENHO (tabela antes/depois) ──────────────────

  var h2 = body.insertParagraph(idx++, "Desempenho por Competência");
  h2.setHeading(DocumentApp.ParagraphHeading.HEADING2)
    .setForegroundColor(C_TITULO).editAsText().setBold(true);
  body.insertParagraph(idx++, " ");

  var tRes = body.insertTable(idx++);
  tRes.setBorderWidth(1);

  // Header
  var headerRow = tRes.appendTableRow();
  var headerLabels = ["Competência", "Nível Fase 1", "Nível Fase 3", "Evolução"];
  var headerWidths = [220, 90, 90, 80];
  var headerCenter = [false, true, true, true]; // centralizar colunas 1,2,3
  for (var hi = 0; hi < headerLabels.length; hi++) {
    var cell = headerRow.appendTableCell(headerLabels[hi]);
    cell.setBackgroundColor(C_TITULO).setWidth(headerWidths[hi])
      .setPaddingTop(6).setPaddingBottom(6).setPaddingLeft(8).setPaddingRight(8);
    if (headerCenter[hi]) {
      cell.getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    }
    cell.editAsText().setBold(true).setForegroundColor("#FFFFFF").setFontSize(9);
  }

  // Linhas
  var comps = relatorio.competencias || [];
  for (var ci = 0; ci < comps.length; ci++) {
    var c = comps[ci];
    var row = tRes.appendTableRow();
    var bgColor = ci % 2 === 0 ? "#FFFFFF" : "#F7F9FC";

    // Nome
    row.appendTableCell(c.nome || "")
      .setBackgroundColor(bgColor).setWidth(220)
      .setPaddingTop(5).setPaddingBottom(5).setPaddingLeft(8).setPaddingRight(8)
      .editAsText().setBold(true).setForegroundColor(C_TITULO).setFontSize(9);

    // Nivel anterior
    var nivelAntStr = c.nivel_anterior ? "Nível " + c.nivel_anterior : "N/A";
    var cellAnt = row.appendTableCell(_safe(nivelAntStr));
    cellAnt.setBackgroundColor(bgColor).setWidth(90)
      .setPaddingTop(5).setPaddingBottom(5).setPaddingLeft(8).setPaddingRight(8);
    cellAnt.getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    cellAnt.editAsText().setFontSize(9).setForegroundColor(C_TEXTO);

    // Nivel atual
    var nivelAtualStr = c.nivel_atual ? "Nível " + c.nivel_atual : "N/A";
    var cellAtual = row.appendTableCell(_safe(nivelAtualStr));
    cellAtual.setBackgroundColor(bgColor).setWidth(90)
      .setPaddingTop(5).setPaddingBottom(5).setPaddingLeft(8).setPaddingRight(8);
    cellAtual.getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    cellAtual.editAsText().setBold(true).setFontSize(9).setForegroundColor(C_TEXTO);

    // Evolucao
    var evolText = c.evolucao || "manteve";
    var evolEmoji = evolText === "subiu" ? "⬆️" : (evolText === "desceu" ? "⬇️" : "➡️");
    var evolColor = evolText === "subiu" ? C_VERDE : (evolText === "desceu" ? C_VERMELHO : C_AMARELO);
    row.appendTableCell(evolEmoji + " " + evolText)
      .setBackgroundColor(bgColor).setWidth(80)
      .setPaddingTop(5).setPaddingBottom(5).setPaddingLeft(8).setPaddingRight(8)
      .editAsText().setBold(true).setFontSize(9).setForegroundColor(evolColor);
  }

  body.insertParagraph(idx++, " ");

  // ── 3. PERFIL DISC ─────────────────────────────────────────────────

  if (relatorio.perfil_disc) {
    var h3 = body.insertParagraph(idx++, "🧠 Perfil Comportamental");
    h3.setHeading(DocumentApp.ParagraphHeading.HEADING2)
      .setForegroundColor(C_TITULO).editAsText().setBold(true);

    var tDisc = body.insertTable(idx++);
    tDisc.setBorderWidth(0);
    var cellDisc = tDisc.appendTableRow().appendTableCell();
    cellDisc.setBackgroundColor(C_PERFIL_BG)
      .setPaddingTop(10).setPaddingBottom(10).setPaddingLeft(12).setPaddingRight(12);

    // Limpar celula
    while (cellDisc.getNumChildren() > 1) cellDisc.removeChild(cellDisc.getChild(1));
    cellDisc.getChild(0).asParagraph().setText(" ");

    if (relatorio.perfil_disc.descricao) {
      cellDisc.appendParagraph(relatorio.perfil_disc.descricao)
        .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_TEXTO);
    }

    // Forca e Atencao
    if (relatorio.perfil_disc.pontos_forca && relatorio.perfil_disc.pontos_forca.length > 0) {
      cellDisc.appendParagraph(" ");
      var pF = cellDisc.appendParagraph("Pontos de força do perfil:");
      pF.editAsText().setBold(true).setFontSize(10).setForegroundColor(C_VERDE);
      for (var fi = 0; fi < relatorio.perfil_disc.pontos_forca.length; fi++) {
        cellDisc.appendParagraph("  ✅ " + relatorio.perfil_disc.pontos_forca[fi])
          .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_TEXTO);
      }
    }

    if (relatorio.perfil_disc.pontos_atencao && relatorio.perfil_disc.pontos_atencao.length > 0) {
      cellDisc.appendParagraph(" ");
      var pA = cellDisc.appendParagraph("Pontos de atenção:");
      pA.editAsText().setBold(true).setFontSize(10).setForegroundColor(C_AMARELO);
      for (var ai = 0; ai < relatorio.perfil_disc.pontos_atencao.length; ai++) {
        cellDisc.appendParagraph("  ⚠️ " + relatorio.perfil_disc.pontos_atencao[ai])
          .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_TEXTO);
      }
    }

    body.insertParagraph(idx++, " ");
  }

  // ── 4. ANALISE POR COMPETENCIA ─────────────────────────────────────

  for (var ci = 0; ci < comps.length; ci++) {
    var c = comps[ci];

    body.insertHorizontalRule(idx++);
    body.insertParagraph(idx++, " ");

    // Titulo da competencia
    var hComp = body.insertParagraph(idx++, "Competência: " + _safe(c.nome || ""));
    hComp.setHeading(DocumentApp.ParagraphHeading.HEADING2)
      .setForegroundColor(C_SUBTITULO).editAsText().setBold(true);

    // Badges nivel
    var nivelAntBadge = c.nivel_anterior ? "Nível " + c.nivel_anterior : "N/A";
    var nivelAtualBadge = c.nivel_atual ? "Nível " + c.nivel_atual : "N/A";
    var evolText = c.evolucao || "manteve";
    var evolEmoji = evolText === "subiu" ? "⬆️" : (evolText === "desceu" ? "⬇️" : "➡️");

    body.insertParagraph(idx++, "Fase 1: " + nivelAntBadge + "  →  Fase 3: " + nivelAtualBadge + "  " + evolEmoji)
      .editAsText().setBold(true).setFontSize(11).setForegroundColor(C_TITULO);
    body.insertParagraph(idx++, " ");

    // Analise
    if (c.analise) {
      body.insertParagraph(idx++, c.analise)
        .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_TEXTO);
      body.insertParagraph(idx++, " ");
    }

    // Evidencias e Lacuna em tabela
    var tEL = body.insertTable(idx++);
    tEL.setBorderWidth(0);

    // Evidencias
    if (c.evidencias_destaque && c.evidencias_destaque.length > 0) {
      var rEvid = tEL.appendTableRow();
      rEvid.appendTableCell("🔍 Comportamentos observados")
        .setBackgroundColor(C_FUNDO_POS).setWidth(480)
        .setPaddingTop(8).setPaddingBottom(4).setPaddingLeft(10).setPaddingRight(10)
        .editAsText().setBold(true).setFontSize(10).setForegroundColor(C_TITULO);

      for (var ei = 0; ei < c.evidencias_destaque.length; ei++) {
        tEL.appendTableRow().appendTableCell("  ▸ " + c.evidencias_destaque[ei])
          .setBackgroundColor("#F1F8F0").setWidth(480)
          .setPaddingTop(4).setPaddingBottom(4).setPaddingLeft(16).setPaddingRight(10)
          .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_TEXTO);
      }

      // Espacador
      tEL.appendTableRow().appendTableCell(" ").setWidth(480)
        .setPaddingTop(1).setPaddingBottom(1).setBackgroundColor("#FFFFFF");
    }

    // Lacuna
    if (c.lacuna_principal) {
      tEL.appendTableRow().appendTableCell("⚠️ Principal ponto de desenvolvimento")
        .setBackgroundColor(C_FUNDO_NEG).setWidth(480)
        .setPaddingTop(8).setPaddingBottom(4).setPaddingLeft(10).setPaddingRight(10)
        .editAsText().setBold(true).setFontSize(10).setForegroundColor(C_TITULO);

      tEL.appendTableRow().appendTableCell("  " + c.lacuna_principal)
        .setBackgroundColor("#FFFBF5").setWidth(480)
        .setPaddingTop(4).setPaddingBottom(8).setPaddingLeft(16).setPaddingRight(10)
        .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_TEXTO);

      tEL.appendTableRow().appendTableCell(" ").setWidth(480)
        .setPaddingTop(1).setPaddingBottom(1).setBackgroundColor("#FFFFFF");
    }

    // Recomendacao
    if (c.recomendacao) {
      tEL.appendTableRow().appendTableCell("🎯 Recomendação")
        .setBackgroundColor("#E3EEF9").setWidth(480)
        .setPaddingTop(8).setPaddingBottom(4).setPaddingLeft(10).setPaddingRight(10)
        .editAsText().setBold(true).setFontSize(10).setForegroundColor(C_TITULO);

      tEL.appendTableRow().appendTableCell("  " + c.recomendacao)
        .setBackgroundColor("#F7FBFF").setWidth(480)
        .setPaddingTop(4).setPaddingBottom(8).setPaddingLeft(16).setPaddingRight(10)
        .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_TEXTO);

      tEL.appendTableRow().appendTableCell(" ").setWidth(480)
        .setPaddingTop(1).setPaddingBottom(1).setBackgroundColor("#FFFFFF");
    }

    // Script pratico
    if (c.script_pratico) {
      tEL.appendTableRow().appendTableCell("💬 O que dizer na prática")
        .setBackgroundColor("#E8EAF6").setWidth(480)
        .setPaddingTop(8).setPaddingBottom(4).setPaddingLeft(10).setPaddingRight(10)
        .editAsText().setBold(true).setFontSize(10).setForegroundColor(C_TITULO);

      tEL.appendTableRow().appendTableCell("  " + c.script_pratico)
        .setBackgroundColor("#F5F5FF").setWidth(480)
        .setPaddingTop(4).setPaddingBottom(8).setPaddingLeft(16).setPaddingRight(10)
        .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_TEXTO);

      tEL.appendTableRow().appendTableCell(" ").setWidth(480)
        .setPaddingTop(1).setPaddingBottom(1).setBackgroundColor("#FFFFFF");
    }

    // Impacto nos alunos
    if (c.impacto_alunos) {
      tEL.appendTableRow().appendTableCell("🎒 Impacto nas crianças")
        .setBackgroundColor("#FFF8E1").setWidth(480)
        .setPaddingTop(8).setPaddingBottom(4).setPaddingLeft(10).setPaddingRight(10)
        .editAsText().setBold(true).setFontSize(10).setForegroundColor(C_TITULO);

      tEL.appendTableRow().appendTableCell("  " + c.impacto_alunos)
        .setBackgroundColor("#FFFDE7").setWidth(480)
        .setPaddingTop(4).setPaddingBottom(8).setPaddingLeft(16).setPaddingRight(10)
        .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_TEXTO);
    }

    body.insertParagraph(idx++, " ");
  }

  // ── 5. PROXIMOS PASSOS ─────────────────────────────────────────────

  if (relatorio.proximos_passos) {
    body.insertHorizontalRule(idx++);
    body.insertParagraph(idx++, " ");

    var hPP = body.insertParagraph(idx++, "🚀 Próximos Passos");
    hPP.setHeading(DocumentApp.ParagraphHeading.HEADING2)
      .setForegroundColor(C_TITULO).editAsText().setBold(true);
    body.insertParagraph(idx++, " ");

    var prioridadeKeys = ["prioridade_1", "prioridade_2", "prioridade_3"];
    var prioridadeLabels = ["1ª Prioridade", "2ª Prioridade", "3ª Prioridade"];
    var prioridadeCores = ["#C0392B", "#2471A3", "#1A7A4A"];
    var prioridadeBgs = ["#FEF5F5", "#F0F7FF", "#F0FFF5"];

    var tPP = body.insertTable(idx++);
    tPP.setBorderWidth(0);

    for (var pi = 0; pi < prioridadeKeys.length; pi++) {
      var pp = relatorio.proximos_passos[prioridadeKeys[pi]];
      if (!pp) continue;

      // Header da prioridade (sem repetir nome da competencia)
      var ppHeaderRow = tPP.appendTableRow();
      var ppLabel = prioridadeLabels[pi];
      if (pp.prazo) ppLabel += "  (Prazo: " + _safe(pp.prazo) + ")";
      var ppHeaderCell = ppHeaderRow.appendTableCell(ppLabel);
      ppHeaderCell.setBackgroundColor(prioridadeCores[pi]).setWidth(480)
        .setPaddingTop(8).setPaddingBottom(8).setPaddingLeft(12).setPaddingRight(12)
        .editAsText().setBold(true).setForegroundColor("#FFFFFF").setFontSize(10);

      // Meta em primeira pessoa
      var metaText = pp.meta_primeira_pessoa || pp.acao || "";
      if (metaText) {
        var ppMetaRow = tPP.appendTableRow();
        ppMetaRow.appendTableCell("  " + metaText)
          .setBackgroundColor(prioridadeBgs[pi]).setWidth(480)
          .setPaddingTop(8).setPaddingBottom(8).setPaddingLeft(16).setPaddingRight(12)
          .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_TEXTO);
      }

      // Espacador entre prioridades
      if (pi < prioridadeKeys.length - 1) {
        var spacerRow = tPP.appendTableRow();
        spacerRow.appendTableCell(" ").setWidth(480)
          .setPaddingTop(2).setPaddingBottom(2);
      }
    }

    body.insertParagraph(idx++, " ");
  }

  // ── 6. MENSAGEM FINAL ──────────────────────────────────────────────

  if (relatorio.mensagem_final) {
    body.insertHorizontalRule(idx++);
    body.insertParagraph(idx++, " ");
    body.insertParagraph(idx++, relatorio.mensagem_final)
      .editAsText().setFontSize(10).setItalic(true).setForegroundColor(C_TEXTO);
    body.insertParagraph(idx++, " ");
  }

  // Salvar e gerar PDF
  doc.saveAndClose();

  try {
    var pdf = DriveApp.getFileById(copia.getId()).getAs("application/pdf");
    var pdfFile = folder.createFile(pdf).setName("Relatorio Fase 3 — " + nome + ".pdf");
    Logger.log("PDF gerado: " + pdfFile.getName());

    // Remover o doc intermediario (manter so o PDF)
    DriveApp.getFileById(copia.getId()).setTrashed(true);
  } catch(e) {
    Logger.log("Erro ao gerar PDF: " + e.message + " (Doc salvo: " + copia.getName() + ")");
  }
}

function _safe(text) {
  var s = String(text || "").replace(/[\\$]/g, "").trim();
  return s.length > 0 ? s : " ";
}