// =====================================================================
// VERTHO - RelatorioGestorFase3.gs
//
// Gera relatorio consolidado por gestor (Fase 3):
//   - Coordenador(a) → ve professores da sua equipe
//   - Diretor(a)     → ve todos os colaboradores
//
// Conteudo:
//   1. Tabela resumo (nome x comp x nivel F1 x nivel F3 x evolucao)
//   2. Ranking de atencao (quem mais precisa de suporte)
//   3. Analise consolidada por competencia (padroes da equipe)
//   4. Perfil DISC da equipe (distribuicao)
//   5. Recomendacoes para o gestor
//
// Template: {{GESTOR}}, {{CARGO_GESTOR}}, {{RELATORIO_DINAMICO}}
// Output: PDF na pasta de relatorios do gestor
//
// Dependencias: Config.gs, StateManager.gs, AIRouter.gs
// =====================================================================

var RELGESTOR_F3_TEMPLATE = '1v_9OR6ALGzrP1mWcPySMwgvkzrBAjFsTYnUigbbsh-Q';
var RELGESTOR_F3_PASTA    = '1PoSewN-VBM3_e6PI6xsjxZRmxYweqz8X';


// ══════════════════════════════════════════════════════════════════════
// MENU
// ══════════════════════════════════════════════════════════════════════

function gerarRelatoriosGestorFase3Menu() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.alert(
    "Gerar Relatorios do Gestor — Fase 3",
    "Gera relatorio consolidado para cada Coordenador e Diretor.\n\n"
    + "Cada gestor recebe a visao da sua equipe com:\n"
    + "- Tabela resumo (evolucao Fase 1 → Fase 3)\n"
    + "- Ranking de atencao\n"
    + "- Analise por competencia\n"
    + "- Perfil DISC da equipe\n"
    + "- Recomendacoes\n\n"
    + "Custo: ~1 chamada Claude por gestor.\n\nContinuar?",
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  var resultado = gerarRelatoriosGestorFase3();
  ui.alert(
    "Relatorios do Gestor Gerados!",
    "PDFs gerados: " + resultado.gerados + "\n"
    + "Erros: " + resultado.erros,
    ui.ButtonSet.OK
  );
}


// ══════════════════════════════════════════════════════════════════════
// PRINCIPAL
// ══════════════════════════════════════════════════════════════════════

function gerarRelatoriosGestorFase3() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log("=== GERANDO RELATORIOS DO GESTOR — FASE 3 ===");

  // 1. Coletar sessoes concluidas
  var sessoesPorColab = _rgColetarSessoes(ss);
  var emails = Object.keys(sessoesPorColab);
  Logger.log("Colaboradores com sessoes concluidas: " + emails.length);
  if (emails.length === 0) return { gerados: 0, erros: 0 };

  // 2. Coletar dados dos colaboradores (DISC, cargo, gestor)
  var colaboradores = _rgColetarColaboradores(ss);

  // 3. Coletar dados Fase 1
  var dadosFase1 = _rgColetarDadosFase1(ss);

  // 4. Identificar gestores e suas equipes
  var gestores = _rgIdentificarGestores(colaboradores, sessoesPorColab);
  Logger.log("Gestores identificados: " + gestores.length);

  // 5. Gerar relatorio por gestor
  var templateFile = DriveApp.getFileById(RELGESTOR_F3_TEMPLATE);
  var folder = DriveApp.getFolderById(RELGESTOR_F3_PASTA);
  var gerados = 0, erros = 0;

  for (var g = 0; g < gestores.length; g++) {
    if (_deveParar()) { _limparParada(); break; }
    var gestor = gestores[g];
    Logger.log("Gerando relatorio para: " + gestor.nome + " (" + gestor.cargo + ") — equipe: " + gestor.equipe.length);

    SpreadsheetApp.getActive().toast(
      "[" + Config.modelLabel(Config.MODEL_RELATORIO) + "]\n" + gestor.nome + " (" + (g + 1) + "/" + gestores.length + ")",
      "Relatorio do Gestor", 10
    );

    try {
      // Montar dados da equipe
      var dadosEquipe = _rgMontarDadosEquipe(gestor, sessoesPorColab, colaboradores, dadosFase1);

      // Gerar conteudo via IA
      var relatorio = _rgGerarConteudoIA(gestor, dadosEquipe);

      // Criar documento
      _rgCriarDocumento(templateFile, folder, gestor, relatorio, dadosEquipe);

      gerados++;
      Logger.log("OK: " + gestor.nome);
    } catch (e) {
      Logger.log("ERRO relatorio gestor " + gestor.nome + ": " + e.message);
      erros++;
    }

    if (g < gestores.length - 1) Utilities.sleep(2000);
  }

  Logger.log("=== RESULTADO: " + gerados + " gerados, " + erros + " erros ===");
  return { gerados: gerados, erros: erros };
}


// ══════════════════════════════════════════════════════════════════════
// COLETA DE DADOS
// ══════════════════════════════════════════════════════════════════════

function _rgColetarSessoes(ss) {
  var ws = ss.getSheetByName(Config.SHEET_SESSOES || "Sessoes");
  if (!ws) return {};

  var data = ws.getDataRange().getValues();
  if (data.length < 2) return {};

  var headers = data[0];
  var idx = {};
  for (var c = 0; c < headers.length; c++) {
    var h = String(headers[c]).toLowerCase().trim();
    if (h === "colaborador_id") idx.email = c;
    if (h === "competencia_id") idx.compId = c;
    if (h === "competencia") idx.comp = c;
    if (h === "status") idx.status = c;
    if (h === "nivel") idx.nivel = c;
    if (h === "nota_decimal") idx.nota = c;
    if (h === "confianca") idx.conf = c;
    if (h === "evidencias") idx.evid = c;
    if (h === "lacuna") idx.lacuna = c;
    if (h === "validacao") idx.valid = c;
  }

  var result = {};
  for (var r = 1; r < data.length; r++) {
    var status = String(data[r][idx.status] || "").toLowerCase();
    if (status !== "concluida") continue;

    var email = String(data[r][idx.email] || "").toLowerCase().trim();
    if (!email) continue;

    if (!result[email]) result[email] = [];
    result[email].push({
      competencia_id: String(data[r][idx.compId] || ""),
      competencia: String(data[r][idx.comp] || ""),
      nivel: Number(data[r][idx.nivel]) || 0,
      nota_decimal: Number(data[r][idx.nota]) || 0,
      confianca: Number(data[r][idx.conf]) || 0,
      lacuna: String(data[r][idx.lacuna] || ""),
      validacao: String(data[r][idx.valid] || "")
    });
  }
  return result;
}

function _rgColetarColaboradores(ss) {
  var ws = ss.getSheetByName(Config.SHEET_COLABORADORES || "Colaboradores");
  if (!ws) return {};

  var data = ws.getDataRange().getValues();
  var headerRow = 3; // row 4 = index 3
  var result = {};

  for (var r = headerRow + 1; r < data.length; r++) {
    var email = String(data[r][6] || "").trim().toLowerCase(); // Col G
    if (!email) continue;

    var nome = String(data[r][1] || "").trim();  // Col B
    var cargo = String(data[r][3] || "").trim();  // Col D

    // DISC Natural: cols N-Q (13-16)
    var discD = Number(data[r][13]) || 0;
    var discI = Number(data[r][14]) || 0;
    var discS = Number(data[r][15]) || 0;
    var discC = Number(data[r][16]) || 0;

    // Perfil dominante
    var scores = { D: discD, I: discI, S: discS, C: discC };
    var dominante = "D";
    var maxScore = 0;
    for (var k in scores) {
      if (scores[k] > maxScore) { maxScore = scores[k]; dominante = k; }
    }

    // Perfil comportamental (col M = 12)
    var perfilDesc = String(data[r][12] || "").trim();

    result[email] = {
      email: email,
      nome: nome,
      cargo: cargo,
      disc: { D: discD, I: discI, S: discS, C: discC },
      disc_dominante: dominante,
      perfil_desc: perfilDesc
    };
  }
  return result;
}

function _rgColetarDadosFase1(ss) {
  var ws = ss.getSheetByName("Respostas");
  if (!ws) return {};

  var data = ws.getDataRange().getValues();
  var result = {};

  for (var r = 1; r < data.length; r++) {
    var email = String(data[r][1] || "").trim().toLowerCase(); // Col B
    var compId = String(data[r][5] || "").trim().toLowerCase(); // Col F
    var nivel = Number(data[r][16]) || 0; // Col Q
    var nota = Number(data[r][17]) || 0;  // Col R

    if (!email || !compId) continue;
    if (!result[email]) result[email] = {};
    result[email][compId] = { nivel: nivel, nota: nota };
  }
  return result;
}

function _rgIdentificarGestores(colaboradores, sessoesPorColab) {
  var gestores = [];
  var emailsComSessao = Object.keys(sessoesPorColab);

  for (var email in colaboradores) {
    var c = colaboradores[email];
    var cargoNorm = c.cargo.toLowerCase();

    if (cargoNorm.indexOf("coordenador") >= 0) {
      // Coordenador → vê todos que NÃO são coordenador/diretor + si mesmo se tiver sessão
      var equipe = [];
      for (var i = 0; i < emailsComSessao.length; i++) {
        var membroEmail = emailsComSessao[i];
        var membro = colaboradores[membroEmail] || {};
        var membroCargo = (membro.cargo || "").toLowerCase();
        // Inclui: professores, auxiliares, etc. (qualquer um que não seja coordenador/diretor)
        var ehGestor = membroCargo.indexOf("coordenador") >= 0 || membroCargo.indexOf("diretor") >= 0;
        if (!ehGestor) {
          equipe.push(membroEmail);
        }
      }
      // Incluir o próprio coordenador se tiver sessão (vê seus próprios dados também)
      if (sessoesPorColab[email] && equipe.indexOf(email) < 0) {
        equipe.push(email);
      }

      if (equipe.length > 0) {
        gestores.push({
          email: email,
          nome: c.nome,
          cargo: c.cargo,
          tipo: "coordenador",
          equipe: equipe
        });
      }

    } else if (cargoNorm.indexOf("diretor") >= 0) {
      // Diretor → vê todos que tem sessão concluída (incluindo coordenadores e si mesmo)
      var equipe = [];
      for (var i = 0; i < emailsComSessao.length; i++) {
        equipe.push(emailsComSessao[i]);
      }

      if (equipe.length > 0) {
        gestores.push({
          email: email,
          nome: c.nome,
          cargo: c.cargo,
          tipo: "diretor",
          equipe: equipe
        });
      }
    }
  }

  // Se nenhum gestor foi encontrado mas há sessões concluídas,
  // criar relatório para o dono da planilha (fallback para testes)
  if (gestores.length === 0 && emailsComSessao.length > 0) {
    Logger.log("Nenhum gestor identificado — gerando relatório geral para o dono do script");
    var ownerEmail = Session.getActiveUser().getEmail().toLowerCase();
    var ownerName = (colaboradores[ownerEmail] || {}).nome || "Gestor";
    var ownerCargo = (colaboradores[ownerEmail] || {}).cargo || "Administrador";
    gestores.push({
      email: ownerEmail,
      nome: ownerName,
      cargo: ownerCargo,
      tipo: "admin",
      equipe: emailsComSessao
    });
  }

  return gestores;
}


// ══════════════════════════════════════════════════════════════════════
// MONTAR DADOS DA EQUIPE
// ══════════════════════════════════════════════════════════════════════

function _rgMontarDadosEquipe(gestor, sessoesPorColab, colaboradores, dadosFase1) {
  var membros = [];
  var discCount = { D: 0, I: 0, S: 0, C: 0 };

  for (var i = 0; i < gestor.equipe.length; i++) {
    var email = gestor.equipe[i];
    var colab = colaboradores[email] || {};
    var sessoes = sessoesPorColab[email] || [];
    var fase1 = dadosFase1[email] || {};

    // Contar DISC dominante
    if (colab.disc_dominante) discCount[colab.disc_dominante]++;

    var competencias = [];
    for (var s = 0; s < sessoes.length; s++) {
      var sess = sessoes[s];
      var compId = sess.competencia_id.toLowerCase();
      var f1 = fase1[compId] || {};

      var nivelAnterior = Math.floor(Number(f1.nivel) || 0);
      var nivelAtual = Math.floor(Number(sess.nivel) || 0);
      var evolucao = nivelAtual > nivelAnterior ? "subiu" : (nivelAtual < nivelAnterior ? "desceu" : "manteve");

      competencias.push({
        competencia: sess.competencia,
        competencia_id: sess.competencia_id,
        nivel_fase1: nivelAnterior,
        nivel_fase3: nivelAtual,
        evolucao: evolucao,
        lacuna: sess.lacuna,
        confianca: sess.confianca
      });
    }

    membros.push({
      nome: colab.nome || email,
      cargo: colab.cargo || "",
      email: email,
      disc_dominante: colab.disc_dominante || "?",
      perfil_desc: colab.perfil_desc || "",
      competencias: competencias
    });
  }

  // Ranking de atencao: ordenar por nivel mais baixo na Fase 3
  var ranking = [];
  for (var m = 0; m < membros.length; m++) {
    for (var c = 0; c < membros[m].competencias.length; c++) {
      var comp = membros[m].competencias[c];
      ranking.push({
        nome: membros[m].nome,
        competencia: comp.competencia,
        nivel_fase3: comp.nivel_fase3,
        evolucao: comp.evolucao,
        lacuna: comp.lacuna
      });
    }
  }
  ranking.sort(function(a, b) {
    if (a.nivel_fase3 !== b.nivel_fase3) return a.nivel_fase3 - b.nivel_fase3;
    if (a.evolucao === "desceu" && b.evolucao !== "desceu") return -1;
    return 0;
  });

  return {
    membros: membros,
    ranking: ranking.slice(0, 10), // top 10 atencao
    disc_distribuicao: discCount,
    total_equipe: membros.length
  };
}


// ══════════════════════════════════════════════════════════════════════
// GERACAO VIA IA
// ══════════════════════════════════════════════════════════════════════

function _rgGerarConteudoIA(gestor, dadosEquipe) {
  var primeiroNome = (gestor.nome || "").split(" ")[0] || "Gestor";

  var system = [
    "Voce e um especialista em desenvolvimento de equipes educacionais da plataforma Vertho.",
    "Gere um RELATORIO DO GESTOR consolidado da Fase 3 (Avaliacao Conversacional).",
    "",
    "O relatorio sera entregue ao GESTOR (" + primeiroNome + ", " + gestor.cargo + ").",
    "Tom: profissional, estrategico, acionavel. Linguagem escolar (nao corporativa).",
    "",
    "═══════════════════════════════════════════════════════",
    "REGRAS DE OURO — OBRIGATORIAS",
    "═══════════════════════════════════════════════════════",
    "",
    "LINGUAGEM ESCOLAR:",
    "- Use HTPC, reuniao de planejamento, formacao continuada.",
    "- NUNCA use 'checkpoints', 'protocolos estruturados', 'stakeholders', 'deliverables'.",
    "- NUNCA use 'Conselho de Classe' para dinamicas de planejamento ou colaboracao.",
    "  Conselho de Classe e reuniao administrativa (notas, aprovacao). O espaco correto",
    "  para dinamicas pedagogicas e o HTPC ou Reuniao de Planejamento.",
    "",
    "NIVEIS E SCORES:",
    "- Niveis SEMPRE NUMERICOS (1 a 4). Nunca 'Gap', 'Em Desenvolvimento', etc.",
    "- NUNCA mencione scores DISC numericos (D=66). Descreva em linguagem acessivel.",
    "",
    "DISC COMO HIPOTESE (NAO DETERMINISMO):",
    "- Apresente o perfil DISC como LENTE UTIL, nao como explicacao definitiva.",
    "- Use 'pode indicar', 'tende a favorecer', 'sugere uma inclinacao'.",
    "- NUNCA 'a equipe NAO TEM ancora emocional porque falta perfil S'.",
    "- SIM: 'a composicao atual pode tornar mais desafiador manter ritmos lentos de escuta'.",
    "",
    "PROIBICOES ABSOLUTAS:",
    "- NUNCA sugira quadros publicos de acompanhamento individual (humilhacao publica).",
    "  Use acompanhamento privado: conversa individual, ferramenta compartilhada entre gestor e colaborador.",
    "- NUNCA sugira dinamicas que parecam infantilizadas ou forcadas.",
    "  Prefira formatos VOLUNTARIOS, CURTOS e ORGANICOS.",
    "  Exemplo: 'Abra a HTPC com 2 minutos de agradecimentos rapidos e voluntarios'",
    "  Em vez de: 'Cada um escreve num papel e le em voz alta'.",
    "- NUNCA sugira mais de 3 acoes. O gestor escolar vive no caos. 5 acoes = paralisia.",
    "",
    "CELEBRAR EVOLUCAO:",
    "- Se alguem subiu de nivel, DESTAQUE com forca. Ex: 'Lucas ja demonstrou evolucao",
    "  concreta ao pedir ajuda pela primeira vez — isso e um marco.'",
    "- Reconhecer progresso motiva mais do que apontar gaps.",
    "",
    "CONTEXTO ESCOLAR:",
    "- Reconheca pressao, calendario, rotina antes de sugerir.",
    "- Conecte TODA recomendacao ao IMPACTO NAS CRIANCAS.",
    "- Inclua alerta de timing: 'Essas acoes precisam comecar na proxima semana.'",
    "",
    "═══════════════════════════════════════════════════════",
    "ESTRUTURA JSON",
    "═══════════════════════════════════════════════════════",
    "",
    "RESPONDA SOMENTE EM JSON. Sem texto antes ou depois. Sem ```json.",
    "",
    "IMPORTANTE: Escreva TODO o conteudo em portugues CORRETO com acentuacao completa",
    "(acoes, nao, voce, evolucao, criancas, pedagogico, etc). Este prompt esta sem acentos",
    "por limitacao tecnica, mas o relatorio DEVE ter acentuacao perfeita.",
    "",
    '{',
    '  "resumo_executivo": "3-5 linhas: visao geral, pontos fortes coletivos, principal desafio",',
    '',
    '  "destaques_evolucao": [',
    '    "Frase celebrando evolucao concreta de quem subiu de nivel (1 por pessoa que evoluiu)"',
    '  ],',
    '',
    '  "ranking_qualificado": [',
    '    {',
    '      "nome": "nome",',
    '      "competencia": "competencia",',
    '      "nivel_fase3": 0,',
    '      "urgencia": "URGENTE|IMPORTANTE|ACOMPANHAR",',
    '      "motivo_curto": "1 frase: POR QUE precisa de atencao (ex: perfeccionismo paralisa, impacta prazo)"',
    '    }',
    '  ],',
    '',
    '  "analise_por_competencia": [',
    '    {',
    '      "competencia": "nome",',
    '      "media_nivel": 0,',
    '      "qtd_nivel_1": 0, "qtd_nivel_2": 0, "qtd_nivel_3": 0, "qtd_nivel_4": 0,',
    '      "padrao_observado": "2-3 linhas: o que a equipe faz bem e onde trava coletivamente",',
    '      "acao_gestor": "1-2 acoes praticas — HTPC, reuniao de planejamento, conversa individual"',
    '    }',
    '  ],',
    '',
    '  "perfil_disc_equipe": {',
    '    "descricao": "2-3 linhas: como a composicao PODE impactar a dinamica (hipotese, nao certeza)",',
    '    "forca_coletiva": "o que a composicao tende a favorecer",',
    '    "risco_coletivo": "o que pode ser mais desafiador — como HIPOTESE, nao determinismo"',
    '  },',
    '',
    '  "acoes": {',
    '    "esta_semana": [',
    '      {',
    '        "titulo": "titulo curto (acao rapida, comecavel ja)",',
    '        "descricao": "o que fazer, como — linguagem escolar, formato organico",',
    '        "impacto_alunos": "como reflete nas criancas"',
    '      }',
    '    ],',
    '    "proximas_semanas": [',
    '      {',
    '        "titulo": "titulo curto (acao de medio prazo, 2-4 semanas)",',
    '        "descricao": "o que fazer, como — acompanhamento privado, nunca publico",',
    '        "impacto_alunos": "como reflete nas criancas"',
    '      }',
    '    ],',
    '    "medio_prazo": [',
    '      {',
    '        "titulo": "titulo curto (acao estrutural, 1-2 meses)",',
    '        "descricao": "formacao, revisao de processos — sem pressa",',
    '        "impacto_alunos": "como reflete nas criancas"',
    '      }',
    '    ],',
    '    "acao_principal": "REPITA o titulo da acao mais importante. O gestor deve focar NESTA primeiro."',
    '  },',
    '',
    '  "papel_do_gestor": {',
    '    "semanal": "O que o gestor deve fazer TODA SEMANA (1-2 linhas, acao concreta)",',
    '    "quinzenal": "O que o gestor deve fazer A CADA 15 DIAS (1-2 linhas)",',
    '    "proximo_ciclo": "O que preparar para o PROXIMO CICLO de reavaliacao (1-2 linhas)"',
    '  },',
    '',
    '  "mensagem_final": "2-3 linhas: motivacional + alerta de timing + voce e o mediador"',
    '}',
    "",
    "IMPORTANTE: Maximo 1 acao por horizonte (esta_semana, proximas_semanas, medio_prazo).",
    "Total maximo: 3 acoes. O gestor vive no caos — 3 e o limite."
  ].join("\n");

  var user = [
    "GESTOR: " + gestor.nome,
    "CARGO: " + gestor.cargo,
    "TOTAL EQUIPE: " + dadosEquipe.total_equipe,
    "",
    "DISTRIBUICAO DISC: D=" + dadosEquipe.disc_distribuicao.D
      + " I=" + dadosEquipe.disc_distribuicao.I
      + " S=" + dadosEquipe.disc_distribuicao.S
      + " C=" + dadosEquipe.disc_distribuicao.C,
    "",
    "DADOS POR MEMBRO DA EQUIPE:",
    JSON.stringify(dadosEquipe.membros, null, 2),
    "",
    "RANKING DE ATENCAO (quem mais precisa de suporte):",
    JSON.stringify(dadosEquipe.ranking, null, 2)
  ].join("\n");

  try {
    var prompt = {
      systemStatic: system,
      systemCompetencia: "",
      messages: [{ role: "user", content: user }]
    };

    var response = AIRouter.callClaude(prompt, "relatorio");
    var cleaned = response.replace(/```json|```/g, "").trim();
    var match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("JSON nao encontrado na resposta");
  } catch (e) {
    Logger.log("ERRO IA relatorio gestor: " + e.message);
    throw e;
  }
}


// ══════════════════════════════════════════════════════════════════════
// CRIACAO DO DOCUMENTO
// ══════════════════════════════════════════════════════════════════════

function _rgCriarDocumento(templateFile, folder, gestor, relatorio, dadosEquipe) {
  var copia = templateFile.makeCopy("Relatorio Gestor Fase 3 — " + gestor.nome, folder);
  var doc = DocumentApp.openById(copia.getId());
  var body = doc.getBody();

  body.replaceText("\\{\\{GESTOR\\}\\}", _rgSafe(gestor.nome));
  body.replaceText("\\{\\{CARGO_GESTOR\\}\\}", _rgSafe(gestor.cargo));

  var range = body.findText("\\{\\{RELATORIO_DINAMICO\\}\\}");
  if (!range) { doc.saveAndClose(); return; }

  var parentPar = range.getElement().getParent();
  var idx = body.getChildIndex(parentPar);
  parentPar.asParagraph().setText(" ");

  var C_TITULO    = "#0F2B54";
  var C_SUBTITULO = "#2471A3";
  var C_TEXTO     = "#0F2B54";
  var C_VERDE     = "#27AE60";
  var C_VERMELHO  = "#C0392B";
  var C_AMARELO   = "#F39C12";

  // ── 1. RESUMO EXECUTIVO ────────────────────────────────────────────

  var h1 = body.insertParagraph(idx++, "Resumo Executivo");
  h1.setHeading(DocumentApp.ParagraphHeading.HEADING2)
    .setForegroundColor(C_TITULO).editAsText().setBold(true);
  body.insertParagraph(idx++, " ");

  if (relatorio.resumo_executivo) {
    body.insertParagraph(idx++, relatorio.resumo_executivo)
      .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_TEXTO);
    body.insertParagraph(idx++, " ");
  }

  // ── 2. DESTAQUES DE EVOLUCAO ───────────────────────────────────────

  if (relatorio.destaques_evolucao && relatorio.destaques_evolucao.length > 0) {
    var tEvol = body.insertTable(idx++);
    tEvol.setBorderWidth(0);
    tEvol.appendTableRow().appendTableCell("🎉 Destaques de Evolução")
      .setBackgroundColor("#E8F5E9").setWidth(470)
      .setPaddingTop(8).setPaddingBottom(4).setPaddingLeft(10).setPaddingRight(10)
      .editAsText().setBold(true).setFontSize(10).setForegroundColor(C_TITULO);

    for (var de = 0; de < relatorio.destaques_evolucao.length; de++) {
      tEvol.appendTableRow().appendTableCell("  ⬆️ " + _rgSafe(relatorio.destaques_evolucao[de]))
        .setBackgroundColor("#F1F8F0").setWidth(470)
        .setPaddingTop(4).setPaddingBottom(4).setPaddingLeft(16).setPaddingRight(10)
        .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_VERDE);
    }
    body.insertParagraph(idx++, " ");
  }

  // ── 3. TABELA RESUMO DA EQUIPE ─────────────────────────────────────

  var h2 = body.insertParagraph(idx++, "Evolução da Equipe — Fase 1 → Fase 3");
  h2.setHeading(DocumentApp.ParagraphHeading.HEADING2)
    .setForegroundColor(C_TITULO).editAsText().setBold(true);
  body.insertParagraph(idx++, " ");

  var tRes = body.insertTable(idx++);
  tRes.setBorderWidth(1);

  var headerRow = tRes.appendTableRow();
  var labels = ["Colaborador", "Competência", "Fase 1", "Fase 3", "Evolução"];
  var widths = [130, 150, 60, 60, 70];
  for (var hi = 0; hi < labels.length; hi++) {
    var cell = headerRow.appendTableCell(labels[hi]);
    cell.setBackgroundColor(C_TITULO).setWidth(widths[hi])
      .setPaddingTop(6).setPaddingBottom(6).setPaddingLeft(6).setPaddingRight(6);
    if (hi >= 2 && hi <= 3) cell.getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    cell.editAsText().setBold(true).setForegroundColor("#FFFFFF").setFontSize(9);
  }

  for (var m = 0; m < dadosEquipe.membros.length; m++) {
    var membro = dadosEquipe.membros[m];
    for (var c = 0; c < membro.competencias.length; c++) {
      var comp = membro.competencias[c];
      var bgColor = (m % 2 === 0) ? "#FFFFFF" : "#F7F9FC";
      var evolText = comp.evolucao || "manteve";
      var evolEmoji = evolText === "subiu" ? "⬆️" : (evolText === "desceu" ? "⬇️" : "➡️");
      var evolColor = evolText === "subiu" ? C_VERDE : (evolText === "desceu" ? C_VERMELHO : C_AMARELO);

      var row = tRes.appendTableRow();
      var nomeText = c === 0 ? membro.nome : "";
      row.appendTableCell(_rgSafe(nomeText)).setBackgroundColor(bgColor).setWidth(130)
        .setPaddingTop(4).setPaddingBottom(4).setPaddingLeft(6).setPaddingRight(6)
        .editAsText().setBold(c === 0).setFontSize(9).setForegroundColor(C_TEXTO);
      row.appendTableCell(_rgSafe(comp.competencia)).setBackgroundColor(bgColor).setWidth(150)
        .setPaddingTop(4).setPaddingBottom(4).setPaddingLeft(6).setPaddingRight(6)
        .editAsText().setBold(false).setFontSize(9).setForegroundColor(C_TEXTO);
      var cellF1 = row.appendTableCell(comp.nivel_fase1 ? "Nível " + comp.nivel_fase1 : "N/A");
      cellF1.setBackgroundColor(bgColor).setWidth(60).setPaddingTop(4).setPaddingBottom(4).setPaddingLeft(6).setPaddingRight(6);
      cellF1.getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      cellF1.editAsText().setBold(false).setFontSize(9).setForegroundColor(C_TEXTO);
      var cellF3 = row.appendTableCell(comp.nivel_fase3 ? "Nível " + comp.nivel_fase3 : "N/A");
      cellF3.setBackgroundColor(bgColor).setWidth(60).setPaddingTop(4).setPaddingBottom(4).setPaddingLeft(6).setPaddingRight(6);
      cellF3.getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      cellF3.editAsText().setBold(true).setFontSize(9).setForegroundColor(C_TEXTO);
      row.appendTableCell(evolEmoji + " " + evolText).setBackgroundColor(bgColor).setWidth(70)
        .setPaddingTop(4).setPaddingBottom(4).setPaddingLeft(6).setPaddingRight(6)
        .editAsText().setBold(true).setFontSize(9).setForegroundColor(evolColor);
    }
  }
  body.insertParagraph(idx++, " ");

  // ── 4. RANKING DE ATENCAO (qualificado) ────────────────────────────

  var h3 = body.insertParagraph(idx++, "🔴 Ranking de Atenção");
  h3.setHeading(DocumentApp.ParagraphHeading.HEADING2)
    .setForegroundColor(C_TITULO).editAsText().setBold(true);
  body.insertParagraph(idx++, " ");

  var tRank = body.insertTable(idx++);
  tRank.setBorderWidth(0);

  var rankData = relatorio.ranking_qualificado || dadosEquipe.ranking || [];
  for (var ri = 0; ri < rankData.length; ri++) {
    var rk = rankData[ri];
    var urgencia = String(rk.urgencia || "").toUpperCase();
    var icone, bgR;
    if (urgencia === "URGENTE") { icone = "🔴🔴🔴"; bgR = "#FEF5F5"; }
    else if (urgencia === "IMPORTANTE") { icone = "🔴🔴"; bgR = "#FFFBF0"; }
    else { icone = "🔴"; bgR = "#F0FFF5"; }

    var rRow = tRank.appendTableRow();
    var rankText = icone + "  " + _rgSafe(rk.nome) + " — " + _rgSafe(rk.competencia)
      + " (Nível " + (rk.nivel_fase3 || "?") + ")";
    rRow.appendTableCell(rankText)
      .setBackgroundColor(bgR).setWidth(470)
      .setPaddingTop(6).setPaddingBottom(2).setPaddingLeft(10).setPaddingRight(10)
      .editAsText().setBold(true).setFontSize(10).setForegroundColor(C_TEXTO);

    if (rk.motivo_curto) {
      tRank.appendTableRow().appendTableCell("      " + _rgSafe(rk.motivo_curto))
        .setBackgroundColor(bgR).setWidth(470)
        .setPaddingTop(0).setPaddingBottom(6).setPaddingLeft(24).setPaddingRight(10)
        .editAsText().setBold(false).setFontSize(9).setItalic(true).setForegroundColor(C_TEXTO);
    }
  }
  body.insertParagraph(idx++, " ");

  // ── 5. ANALISE POR COMPETENCIA ─────────────────────────────────────

  if (relatorio.analise_por_competencia) {
    var h4 = body.insertParagraph(idx++, "Análise por Competência");
    h4.setHeading(DocumentApp.ParagraphHeading.HEADING2)
      .setForegroundColor(C_TITULO).editAsText().setBold(true);
    body.insertParagraph(idx++, " ");

    for (var ai = 0; ai < relatorio.analise_por_competencia.length; ai++) {
      var ac = relatorio.analise_por_competencia[ai];
      body.insertParagraph(idx++, "Competência: " + _rgSafe(ac.competencia || ""))
        .setHeading(DocumentApp.ParagraphHeading.HEADING3)
        .setForegroundColor(C_SUBTITULO).editAsText().setBold(true);

      var distText = "Distribuição: Nível 1: " + (ac.qtd_nivel_1 || 0)
        + " | Nível 2: " + (ac.qtd_nivel_2 || 0)
        + " | Nível 3: " + (ac.qtd_nivel_3 || 0)
        + " | Nível 4: " + (ac.qtd_nivel_4 || 0);
      body.insertParagraph(idx++, distText)
        .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_TEXTO).setItalic(true);

      if (ac.padrao_observado) {
        body.insertParagraph(idx++, ac.padrao_observado)
          .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_TEXTO);
      }

      if (ac.acao_gestor) {
        var tAcao = body.insertTable(idx++);
        tAcao.setBorderWidth(0);
        tAcao.appendTableRow().appendTableCell("🎯 Ação do Gestor")
          .setBackgroundColor("#E3EEF9").setWidth(470)
          .setPaddingTop(6).setPaddingBottom(4).setPaddingLeft(10).setPaddingRight(10)
          .editAsText().setBold(true).setFontSize(10).setForegroundColor(C_TITULO);
        tAcao.appendTableRow().appendTableCell("  " + ac.acao_gestor)
          .setBackgroundColor("#F7FBFF").setWidth(470)
          .setPaddingTop(4).setPaddingBottom(8).setPaddingLeft(16).setPaddingRight(10)
          .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_TEXTO);
      }
      body.insertParagraph(idx++, " ");
    }
  }

  // ── 6. PERFIL DISC DA EQUIPE ───────────────────────────────────────

  if (relatorio.perfil_disc_equipe) {
    var h5 = body.insertParagraph(idx++, "Perfil Comportamental da Equipe");
    h5.setHeading(DocumentApp.ParagraphHeading.HEADING2)
      .setForegroundColor(C_TITULO).editAsText().setBold(true);
    body.insertParagraph(idx++, " ");

    var dd = dadosEquipe.disc_distribuicao;
    body.insertParagraph(idx++, "Composição: D=" + dd.D + " | I=" + dd.I + " | S=" + dd.S + " | C=" + dd.C
      + " (" + dadosEquipe.total_equipe + " membros)")
      .editAsText().setBold(false).setFontSize(10).setItalic(true).setForegroundColor(C_TEXTO);

    if (relatorio.perfil_disc_equipe.descricao) {
      body.insertParagraph(idx++, relatorio.perfil_disc_equipe.descricao)
        .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_TEXTO);
    }

    var tDisc = body.insertTable(idx++);
    tDisc.setBorderWidth(0);
    if (relatorio.perfil_disc_equipe.forca_coletiva) {
      tDisc.appendTableRow().appendTableCell("✅ O que a composição tende a favorecer")
        .setBackgroundColor("#E8F5E9").setWidth(470)
        .setPaddingTop(6).setPaddingBottom(4).setPaddingLeft(10).setPaddingRight(10)
        .editAsText().setBold(true).setFontSize(10).setForegroundColor(C_TITULO);
      tDisc.appendTableRow().appendTableCell("  " + relatorio.perfil_disc_equipe.forca_coletiva)
        .setBackgroundColor("#F1F8F0").setWidth(470)
        .setPaddingTop(4).setPaddingBottom(8).setPaddingLeft(16).setPaddingRight(10)
        .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_TEXTO);
    }
    if (relatorio.perfil_disc_equipe.risco_coletivo) {
      tDisc.appendTableRow().appendTableCell(" ").setWidth(470).setPaddingTop(2).setPaddingBottom(2);
      tDisc.appendTableRow().appendTableCell("⚠️ O que pode ser mais desafiador")
        .setBackgroundColor("#FFF3E0").setWidth(470)
        .setPaddingTop(6).setPaddingBottom(4).setPaddingLeft(10).setPaddingRight(10)
        .editAsText().setBold(true).setFontSize(10).setForegroundColor(C_TITULO);
      tDisc.appendTableRow().appendTableCell("  " + relatorio.perfil_disc_equipe.risco_coletivo)
        .setBackgroundColor("#FFFBF5").setWidth(470)
        .setPaddingTop(4).setPaddingBottom(8).setPaddingLeft(16).setPaddingRight(10)
        .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_TEXTO);
    }
    body.insertParagraph(idx++, " ");
  }

  // ── 7. ACOES POR HORIZONTE TEMPORAL ────────────────────────────────

  var acoes = relatorio.acoes || {};
  var temAcoes = (acoes.esta_semana && acoes.esta_semana.length > 0)
    || (acoes.proximas_semanas && acoes.proximas_semanas.length > 0)
    || (acoes.medio_prazo && acoes.medio_prazo.length > 0);

  if (temAcoes) {
    var h6 = body.insertParagraph(idx++, "🚀 Plano de Ação");
    h6.setHeading(DocumentApp.ParagraphHeading.HEADING2)
      .setForegroundColor(C_TITULO).editAsText().setBold(true);
    body.insertParagraph(idx++, " ");

    // Acao principal em destaque
    if (acoes.acao_principal) {
      var tPrinc = body.insertTable(idx++);
      tPrinc.setBorderWidth(0);
      tPrinc.appendTableRow().appendTableCell("⭐ COMECE POR AQUI: " + _rgSafe(acoes.acao_principal))
        .setBackgroundColor("#0F2B54").setWidth(470)
        .setPaddingTop(10).setPaddingBottom(10).setPaddingLeft(12).setPaddingRight(12)
        .editAsText().setBold(true).setForegroundColor("#FFFFFF").setFontSize(11);
      tPrinc.appendTableRow().appendTableCell("  Você não precisa fazer tudo na segunda-feira. Foque nesta ação primeiro. Quando virar rotina, avance para as próximas.")
        .setBackgroundColor("#EEF3FB").setWidth(470)
        .setPaddingTop(6).setPaddingBottom(8).setPaddingLeft(16).setPaddingRight(12)
        .editAsText().setBold(false).setFontSize(10).setItalic(true).setForegroundColor(C_TEXTO);
      body.insertParagraph(idx++, " ");
    }

    // Blocos por horizonte
    var horizontes = [
      { key: "esta_semana", label: "📅 Esta Semana", cor: "#C0392B", bg: "#FEF5F5" },
      { key: "proximas_semanas", label: "📆 Próximas 2-4 Semanas", cor: "#2471A3", bg: "#F0F7FF" },
      { key: "medio_prazo", label: "🗓️ Médio Prazo (1-2 meses)", cor: "#1A7A4A", bg: "#F0FFF5" }
    ];

    for (var hz = 0; hz < horizontes.length; hz++) {
      var h = horizontes[hz];
      var acoesHz = acoes[h.key] || [];
      if (acoesHz.length === 0) continue;

      var tHz = body.insertTable(idx++);
      tHz.setBorderWidth(0);
      tHz.appendTableRow().appendTableCell(h.label)
        .setBackgroundColor(h.cor).setWidth(470)
        .setPaddingTop(8).setPaddingBottom(8).setPaddingLeft(12).setPaddingRight(12)
        .editAsText().setBold(true).setForegroundColor("#FFFFFF").setFontSize(10);

      for (var ai = 0; ai < acoesHz.length; ai++) {
        var acao = acoesHz[ai];
        // Titulo
        tHz.appendTableRow().appendTableCell("  " + _rgSafe(acao.titulo || ""))
          .setBackgroundColor(h.bg).setWidth(470)
          .setPaddingTop(6).setPaddingBottom(2).setPaddingLeft(16).setPaddingRight(10)
          .editAsText().setBold(true).setFontSize(10).setForegroundColor(C_TEXTO);
        // Descricao
        if (acao.descricao) {
          tHz.appendTableRow().appendTableCell("  " + acao.descricao)
            .setBackgroundColor(h.bg).setWidth(470)
            .setPaddingTop(2).setPaddingBottom(4).setPaddingLeft(16).setPaddingRight(10)
            .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_TEXTO);
        }
        // Impacto alunos
        if (acao.impacto_alunos) {
          tHz.appendTableRow().appendTableCell("  🎒 " + acao.impacto_alunos)
            .setBackgroundColor("#FFFDE7").setWidth(470)
            .setPaddingTop(2).setPaddingBottom(6).setPaddingLeft(16).setPaddingRight(10)
            .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_TEXTO);
        }
      }
      body.insertParagraph(idx++, " ");
    }
  }

  // ── 8. PAPEL DO GESTOR NESTA FASE ──────────────────────────────────

  if (relatorio.papel_do_gestor) {
    var h7 = body.insertParagraph(idx++, "📋 Papel do Gestor nesta Fase");
    h7.setHeading(DocumentApp.ParagraphHeading.HEADING2)
      .setForegroundColor(C_TITULO).editAsText().setBold(true);
    body.insertParagraph(idx++, " ");

    var tPapel = body.insertTable(idx++);
    tPapel.setBorderWidth(0);

    var papelItems = [
      { icon: "🔄", label: "Semanal", text: relatorio.papel_do_gestor.semanal, bg: "#E3EEF9" },
      { icon: "📊", label: "Quinzenal", text: relatorio.papel_do_gestor.quinzenal, bg: "#EEF3FB" },
      { icon: "🎯", label: "Próximo ciclo", text: relatorio.papel_do_gestor.proximo_ciclo, bg: "#F7F9FC" }
    ];

    for (var pi = 0; pi < papelItems.length; pi++) {
      var p = papelItems[pi];
      if (!p.text) continue;
      tPapel.appendTableRow().appendTableCell(p.icon + " " + p.label)
        .setBackgroundColor(p.bg).setWidth(470)
        .setPaddingTop(6).setPaddingBottom(2).setPaddingLeft(10).setPaddingRight(10)
        .editAsText().setBold(true).setFontSize(10).setForegroundColor(C_TITULO);
      tPapel.appendTableRow().appendTableCell("  " + p.text)
        .setBackgroundColor(p.bg).setWidth(470)
        .setPaddingTop(2).setPaddingBottom(6).setPaddingLeft(16).setPaddingRight(10)
        .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_TEXTO);
      // Espacador
      tPapel.appendTableRow().appendTableCell(" ").setWidth(470)
        .setPaddingTop(1).setPaddingBottom(1).setBackgroundColor("#FFFFFF");
    }
    body.insertParagraph(idx++, " ");
  }

  // ── 9. MENSAGEM FINAL ──────────────────────────────────────────────

  if (relatorio.mensagem_final) {
    body.insertHorizontalRule(idx++);
    body.insertParagraph(idx++, " ");
    body.insertParagraph(idx++, relatorio.mensagem_final)
      .editAsText().setBold(false).setFontSize(10).setItalic(true).setForegroundColor(C_TEXTO);
  }

  // Salvar e gerar PDF
  doc.saveAndClose();
  try {
    var pdf = DriveApp.getFileById(copia.getId()).getAs("application/pdf");
    var pdfFile = folder.createFile(pdf).setName("Relatorio Gestor Fase 3 — " + gestor.nome + ".pdf");
    Logger.log("PDF gerado: " + pdfFile.getName());
    DriveApp.getFileById(copia.getId()).setTrashed(true);
  } catch (e) {
    Logger.log("Erro ao gerar PDF: " + e.message);
  }
}


// ── Helper ──────────────────────────────────────────────────────────

function _rgSafe(text) {
  var s = String(text || "").replace(/[\\$]/g, "").trim();
  return s.length > 0 ? s : " ";
}