// =====================================================================
// VERTHO - RelatorioRHFase3.gs
//
// Gera relatorio consolidado para o RH — visao empresa inteira.
// Ve TODOS os colaboradores de TODOS os cargos.
//
// Conteudo:
//   1. Resumo executivo (a escola evoluiu?)
//   2. Indicadores quantitativos (% evolucao, media, desvio)
//   3. Comparativo Fase 1 vs Fase 3 consolidado
//   4. Visao por cargo (comparativo entre cargos)
//   5. Competencias criticas (onde mais precisa investir)
//   6. Sugestao de treinamentos/formacoes
//   7. Perfil DISC organizacional
//   8. Plano de acao para o RH
//
// Template: {{RELATORIO_DINAMICO}}
// Output: PDF na pasta de relatorios RH
//
// Dependencias: Config.gs, AIRouter.gs
// =====================================================================

var RELRH_F3_TEMPLATE = '1_QV6fQxCzL15hADMPMQFsImFA3yx2BUIhj4bHTUZCSo';
var RELRH_F3_PASTA    = '1ZGzvSXLRX03tYWvK865rdRVdjpLtlcUN';


// ══════════════════════════════════════════════════════════════════════
// MENU
// ══════════════════════════════════════════════════════════════════════

function gerarRelatorioRHFase3Menu() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.alert(
    "Gerar Relatório RH — Fase 3",
    "Gera relatório consolidado com visão de empresa inteira.\n\n"
    + "Inclui: indicadores, comparativo F1→F3, visão por cargo,\n"
    + "competências críticas, sugestão de treinamentos e plano de ação.\n\n"
    + "Custo: ~1 chamada Claude.\n\nContinuar?",
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  var resultado = gerarRelatorioRHFase3();
  ui.alert(
    "Relatório RH Gerado!",
    resultado.ok ? "PDF salvo na pasta Relatórios RH Fase 3." : "Erro: " + resultado.erro,
    ui.ButtonSet.OK
  );
}


// ══════════════════════════════════════════════════════════════════════
// PRINCIPAL
// ══════════════════════════════════════════════════════════════════════

function gerarRelatorioRHFase3() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log("=== GERANDO RELATÓRIO RH — FASE 3 ===");

  try {
    // 1. Coletar todos os dados
    var dados = _rhColetarDados(ss);
    Logger.log("Colaboradores com sessões: " + dados.total_colaboradores);
    if (dados.total_colaboradores === 0) {
      return { ok: false, erro: "Nenhuma sessão concluída encontrada." };
    }

    // 2. Calcular indicadores
    var indicadores = _rhCalcularIndicadores(dados);
    Logger.log("Indicadores calculados: média geral F3=" + indicadores.media_geral_f3.toFixed(2));

    // 3. Gerar conteúdo via IA
    var relatorio = _rhGerarConteudoIA(dados, indicadores);
    Logger.log("Conteúdo IA gerado");

    // 4. Criar documento
    var templateFile = DriveApp.getFileById(RELRH_F3_TEMPLATE);
    var folder = DriveApp.getFolderById(RELRH_F3_PASTA);
    _rhCriarDocumento(templateFile, folder, relatorio, dados, indicadores);

    Logger.log("=== RELATÓRIO RH GERADO COM SUCESSO ===");
    return { ok: true };
  } catch (e) {
    Logger.log("ERRO relatório RH: " + e.message);
    return { ok: false, erro: e.message };
  }
}


// ══════════════════════════════════════════════════════════════════════
// COLETA DE DADOS
// ══════════════════════════════════════════════════════════════════════

function _rhColetarDados(ss) {
  // Sessoes concluidas
  var wsSessoes = ss.getSheetByName(Config.SHEET_SESSOES || "Sessoes");
  var wsColab = ss.getSheetByName(Config.SHEET_COLABORADORES || "Colaboradores");
  var wsResp = ss.getSheetByName("Respostas");

  // Ler colaboradores
  var colaboradores = {};
  if (wsColab) {
    var dataColab = wsColab.getDataRange().getValues();
    for (var r = 4; r < dataColab.length; r++) {
      var email = String(dataColab[r][6] || "").trim().toLowerCase();
      if (!email) continue;
      var discD = Number(dataColab[r][13]) || 0;
      var discI = Number(dataColab[r][14]) || 0;
      var discS = Number(dataColab[r][15]) || 0;
      var discC = Number(dataColab[r][16]) || 0;
      var scores = { D: discD, I: discI, S: discS, C: discC };
      var dom = "D"; var maxS = 0;
      for (var k in scores) { if (scores[k] > maxS) { maxS = scores[k]; dom = k; } }
      colaboradores[email] = {
        nome: String(dataColab[r][1] || "").trim(),
        cargo: String(dataColab[r][3] || "").trim(),
        disc: scores,
        disc_dominante: dom
      };
    }
  }

  // Ler Fase 1
  var fase1 = {};
  if (wsResp) {
    var dataResp = wsResp.getDataRange().getValues();
    for (var r = 1; r < dataResp.length; r++) {
      var email = String(dataResp[r][1] || "").trim().toLowerCase();
      var compId = String(dataResp[r][5] || "").trim().toLowerCase();
      if (!email || !compId) continue;
      if (!fase1[email]) fase1[email] = {};
      fase1[email][compId] = {
        nivel: Number(dataResp[r][16]) || 0,
        nota: Number(dataResp[r][17]) || 0
      };
    }
  }

  // Ler sessoes concluidas
  var membros = [];
  var porCargo = {};
  var porCompetencia = {};
  var discCount = { D: 0, I: 0, S: 0, C: 0 };

  if (wsSessoes) {
    var dataSess = wsSessoes.getDataRange().getValues();
    var headers = dataSess[0];
    var idx = {};
    for (var c = 0; c < headers.length; c++) {
      var h = String(headers[c]).toLowerCase().trim();
      if (h === "sessao_id") idx.sessaoId = c;
      if (h === "colaborador_id") idx.email = c;
      if (h === "competencia_id") idx.compId = c;
      if (h === "competencia") idx.comp = c;
      if (h === "status") idx.status = c;
      if (h === "nivel") idx.nivel = c;
      if (h === "nota_decimal") idx.nota = c;
      if (h === "confianca") idx.conf = c;
      if (h === "lacuna") idx.lacuna = c;
    }

    var processados = {};
    for (var r = 1; r < dataSess.length; r++) {
      var status = String(dataSess[r][idx.status] || "").toLowerCase();
      if (status !== "concluida") continue;
      var email = String(dataSess[r][idx.email] || "").toLowerCase().trim();
      if (!email) continue;

      var compId = String(dataSess[r][idx.compId] || "").toLowerCase();
      var comp = String(dataSess[r][idx.comp] || "");
      var nivelF3 = Number(dataSess[r][idx.nivel]) || 0;
      var notaF3 = Number(dataSess[r][idx.nota]) || 0;
      var lacuna = String(dataSess[r][idx.lacuna] || "");
      var colab = colaboradores[email] || {};
      var cargo = colab.cargo || "Sem cargo";
      var f1 = (fase1[email] || {})[compId] || {};
      var nivelF1 = Math.floor(Number(f1.nivel) || 0);
      var evolucao = nivelF3 > nivelF1 ? "subiu" : (nivelF3 < nivelF1 ? "desceu" : "manteve");

      // DISC
      if (!processados[email]) {
        processados[email] = true;
        if (colab.disc_dominante) discCount[colab.disc_dominante]++;
      }

      var registro = {
        nome: colab.nome || email,
        cargo: cargo,
        email: email,
        competencia: comp,
        competencia_id: compId,
        nivel_fase1: nivelF1,
        nivel_fase3: nivelF3,
        nota_fase3: notaF3,
        evolucao: evolucao,
        lacuna: lacuna
      };

      membros.push(registro);

      // Por cargo
      if (!porCargo[cargo]) porCargo[cargo] = [];
      porCargo[cargo].push(registro);

      // Por competencia
      if (!porCompetencia[comp]) porCompetencia[comp] = [];
      porCompetencia[comp].push(registro);
    }
  }

  return {
    membros: membros,
    por_cargo: porCargo,
    por_competencia: porCompetencia,
    disc_distribuicao: discCount,
    total_colaboradores: Object.keys(processados || {}).length,
    total_avaliacoes: membros.length
  };
}


// ══════════════════════════════════════════════════════════════════════
// INDICADORES QUANTITATIVOS
// ══════════════════════════════════════════════════════════════════════

function _rhCalcularIndicadores(dados) {
  var niveisF1 = [], niveisF3 = [];
  var subiram = 0, mantiveram = 0, desceram = 0;

  for (var i = 0; i < dados.membros.length; i++) {
    var m = dados.membros[i];
    if (m.nivel_fase1 > 0) niveisF1.push(m.nivel_fase1);
    if (m.nivel_fase3 > 0) niveisF3.push(m.nivel_fase3);
    if (m.evolucao === "subiu") subiram++;
    else if (m.evolucao === "desceu") desceram++;
    else mantiveram++;
  }

  var mediaF1 = niveisF1.length > 0 ? niveisF1.reduce(function(a,b){return a+b;}, 0) / niveisF1.length : 0;
  var mediaF3 = niveisF3.length > 0 ? niveisF3.reduce(function(a,b){return a+b;}, 0) / niveisF3.length : 0;

  // Desvio padrao F3
  var somaQuad = 0;
  for (var i = 0; i < niveisF3.length; i++) {
    somaQuad += Math.pow(niveisF3[i] - mediaF3, 2);
  }
  var desvioF3 = niveisF3.length > 0 ? Math.sqrt(somaQuad / niveisF3.length) : 0;

  // % por nivel F3
  var contNiveis = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (var i = 0; i < niveisF3.length; i++) {
    var n = Math.floor(niveisF3[i]);
    if (n >= 1 && n <= 4) contNiveis[n]++;
  }

  var total = dados.total_avaliacoes || 1;

  // Por cargo
  var porCargo = {};
  for (var cargo in dados.por_cargo) {
    var regs = dados.por_cargo[cargo];
    var nivs = regs.map(function(r) { return r.nivel_fase3; }).filter(function(n) { return n > 0; });
    var media = nivs.length > 0 ? nivs.reduce(function(a,b){return a+b;},0) / nivs.length : 0;
    var subiu = regs.filter(function(r) { return r.evolucao === "subiu"; }).length;
    porCargo[cargo] = {
      total: regs.length,
      media_f3: media,
      pct_evolucao: regs.length > 0 ? Math.round(subiu / regs.length * 100) : 0
    };
  }

  // Por competencia — identificar criticas
  var porComp = {};
  for (var comp in dados.por_competencia) {
    var regs = dados.por_competencia[comp];
    var nivs = regs.map(function(r) { return r.nivel_fase3; }).filter(function(n) { return n > 0; });
    var media = nivs.length > 0 ? nivs.reduce(function(a,b){return a+b;},0) / nivs.length : 0;
    var n1n2 = regs.filter(function(r) { return r.nivel_fase3 <= 2; }).length;
    porComp[comp] = {
      total: regs.length,
      media_f3: media,
      pct_nivel_1_2: regs.length > 0 ? Math.round(n1n2 / regs.length * 100) : 0,
      lacunas: regs.map(function(r) { return r.lacuna; }).filter(function(l) { return l && l.length > 5; })
    };
  }

  return {
    media_geral_f1: mediaF1,
    media_geral_f3: mediaF3,
    desvio_f3: desvioF3,
    pct_subiram: Math.round(subiram / total * 100),
    pct_mantiveram: Math.round(mantiveram / total * 100),
    pct_desceram: Math.round(desceram / total * 100),
    subiram: subiram,
    mantiveram: mantiveram,
    desceram: desceram,
    dist_niveis: contNiveis,
    por_cargo: porCargo,
    por_competencia: porComp
  };
}


// ══════════════════════════════════════════════════════════════════════
// GERACAO VIA IA
// ══════════════════════════════════════════════════════════════════════

function _rhGerarConteudoIA(dados, indicadores) {
  var system = [
    "Você é um especialista em desenvolvimento organizacional educacional da plataforma Vertho.",
    "Gere um RELATÓRIO CONSOLIDADO DE RH da Fase 3 (Avaliação Conversacional).",
    "",
    "Este relatório é para o departamento de RH / Treinamento. Visão estratégica de empresa inteira.",
    "Tom: analítico, estratégico, orientado a decisões de investimento em pessoas.",
    "Linguagem escolar: HTPC, formação continuada, reunião de planejamento.",
    "",
    "REGRAS:",
    "- Níveis SEMPRE numéricos (1 a 4).",
    "- DISC como hipótese útil, não determinismo.",
    "- Conecte TUDO ao impacto nos alunos.",
    "- Sugira treinamentos ESPECÍFICOS (não genéricos).",
    "- Máximo 3 ações prioritárias por horizonte temporal.",
    "- Escreva em português CORRETO com acentuação completa.",
    "",
    "VOCABULÁRIO ESCOLAR (OBRIGATÓRIO):",
    "- NUNCA use 'pipeline de lideranças' → use 'formação de novas lideranças educacionais'.",
    "- NUNCA use 'ROI' → use 'impacto visível na aprendizagem e captação de alunos'.",
    "- NUNCA use 'accountability' → use 'cultura de corresponsabilidade'.",
    "- NUNCA use 'stakeholders' → use 'comunidade escolar' ou 'famílias e equipe'.",
    "- NUNCA use 'deliverables', 'KPIs', 'sprint' → use linguagem escolar.",
    "- Use: HTPC, formação continuada, reunião de planejamento, conselho de classe (só para notas),",
    "  coordenação pedagógica, projeto político-pedagógico, captação de alunos.",
    "",
    "RESTRIÇÃO REALISTA DE RECURSOS:",
    "- Para CADA treinamento sugerido, inclua estimativa de carga horária e custo relativo (baixo/médio/alto).",
    "- Ordene por prioridade SE o orçamento for curto (qual fazer primeiro?).",
    "- Nunca proponha mais de 3 ações simultâneas sem explicitar a ordem de prioridade.",
    "",
    "DECISÕES EXPLÍCITAS:",
    "- Se identificar risco de saída de colaborador, inclua ação concreta (entrevista de retenção, plano B).",
    "- Se identificar colaborador que não evoluiu após desenvolvimento, explicite a decisão-chave:",
    "  prazo, critérios de reavaliação e consequência se não houver evolução.",
    "- Essas decisões devem aparecer num quadro 'Decisões-Chave' — não espalhadas no texto.",
    "",
    "RESPONDA SOMENTE EM JSON. Sem texto antes ou depois. Sem ```json.",
    "",
    "IMPORTANTE: Escreva TODO o conteúdo em português CORRETO com acentuação completa.",
    "",
    '{',
    '  "resumo_executivo": "4-6 linhas: a escola evoluiu? Panorama geral, principal conquista, principal risco",',
    '',
    '  "comparativo_f1_f3": {',
    '    "analise": "3-4 linhas: como a escola se moveu entre fases. Houve evolução real ou estagnação?",',
    '    "destaque_positivo": "1-2 linhas: maior conquista coletiva",',
    '    "destaque_atencao": "1-2 linhas: maior preocupação"',
    '  },',
    '',
    '  "visao_por_cargo": [',
    '    {',
    '      "cargo": "nome do cargo",',
    '      "analise": "2-3 linhas: como este grupo se comportou, padrões observados",',
    '      "ponto_forte": "1 linha",',
    '      "ponto_critico": "1 linha"',
    '    }',
    '  ],',
    '',
    '  "competencias_criticas": [',
    '    {',
    '      "competencia": "nome",',
    '      "nivel_criticidade": "CRITICA|ATENCAO|ESTAVEL",',
    '      "motivo": "2-3 linhas: por que precisa de investimento",',
    '      "impacto_alunos": "1 linha: como isso afeta as crianças"',
    '    }',
    '  ],',
    '',
    '  "treinamentos_sugeridos": [',
    '    {',
    '      "titulo": "nome do treinamento/formação",',
    '      "competencias_alvo": ["comp1", "comp2"],',
    '      "publico": "para quem (cargo ou grupo)",',
    '      "formato": "workshop 4h / formação continuada quinzenal / mentoria individual / etc",',
    '      "carga_horaria": "estimativa (ex: 4h, 8h em 2 encontros, 12h ao longo de 6 semanas)",',
    '      "custo_relativo": "baixo (interno) | médio (facilitador externo pontual) | alto (programa completo)",',
    '      "prioridade": "URGENTE|IMPORTANTE|DESEJAVEL",',
    '      "prioridade_se_orcamento_curto": "1 = faça este primeiro, 2 = segundo, 3 = se sobrar verba",',
    '      "justificativa": "1-2 linhas conectando dados ao treinamento"',
    '    }',
    '  ],',
    '',
    '  "perfil_disc_organizacional": {',
    '    "descricao": "2-3 linhas: composição da escola como organização (hipótese)",',
    '    "implicacao_pedagogica": "como a composição pode impactar o trabalho com os alunos"',
    '  },',
    '',
    '  "decisoes_chave": [',
    '    {',
    '      "colaborador": "nome (ou grupo)",',
    '      "situacao": "1-2 linhas: qual o problema/risco identificado",',
    '      "acao_imediata": "o que fazer ESTA SEMANA (ex: entrevista de retenção, conversa individual)",',
    '      "criterio_reavaliacao": "em quanto tempo e com qual critério reavaliar (ex: 3 meses, subir para nível 2)",',
    '      "consequencia": "o que fazer se não houver evolução (ex: mudança de função, acompanhamento intensivo)"',
    '    }',
    '  ],',
    '',
    '  "plano_acao_rh": {',
    '    "curto_prazo": {',
    '      "titulo": "ação para as próximas 2 semanas",',
    '      "descricao": "o que o RH deve fazer",',
    '      "impacto": "resultado esperado"',
    '    },',
    '    "medio_prazo": {',
    '      "titulo": "ação para os próximos 1-2 meses",',
    '      "descricao": "o que o RH deve fazer",',
    '      "impacto": "resultado esperado"',
    '    },',
    '    "longo_prazo": {',
    '      "titulo": "ação para o próximo semestre",',
    '      "descricao": "o que o RH deve fazer",',
    '      "impacto": "resultado esperado"',
    '    }',
    '  },',
    '',
    '  "mensagem_final": "2-3 linhas: visão estratégica para o RH"',
    '}'
  ].join("\n");

  // Montar dados
  var compCriticas = [];
  for (var comp in indicadores.por_competencia) {
    var ic = indicadores.por_competencia[comp];
    compCriticas.push({
      competencia: comp,
      media: ic.media_f3.toFixed(2),
      pct_nivel_1_2: ic.pct_nivel_1_2 + "%",
      total: ic.total,
      lacunas_resumo: ic.lacunas.slice(0, 3).join(" | ")
    });
  }
  compCriticas.sort(function(a, b) { return parseFloat(a.media) - parseFloat(b.media); });

  var cargos = [];
  for (var cargo in indicadores.por_cargo) {
    var pc = indicadores.por_cargo[cargo];
    cargos.push({
      cargo: cargo,
      total: pc.total,
      media_f3: pc.media_f3.toFixed(2),
      pct_evolucao: pc.pct_evolucao + "%"
    });
  }

  var user = [
    "INDICADORES QUANTITATIVOS:",
    "- Total de colaboradores avaliados: " + dados.total_colaboradores,
    "- Total de avaliações (colaborador x competência): " + dados.total_avaliacoes,
    "- Média geral Fase 1: " + indicadores.media_geral_f1.toFixed(2),
    "- Média geral Fase 3: " + indicadores.media_geral_f3.toFixed(2),
    "- Desvio padrão Fase 3: " + indicadores.desvio_f3.toFixed(2),
    "- Evoluíram: " + indicadores.subiram + " (" + indicadores.pct_subiram + "%)",
    "- Mantiveram: " + indicadores.mantiveram + " (" + indicadores.pct_mantiveram + "%)",
    "- Regrediram: " + indicadores.desceram + " (" + indicadores.pct_desceram + "%)",
    "- Distribuição Fase 3: N1=" + indicadores.dist_niveis[1]
      + " N2=" + indicadores.dist_niveis[2]
      + " N3=" + indicadores.dist_niveis[3]
      + " N4=" + indicadores.dist_niveis[4],
    "",
    "DISC ORGANIZACIONAL: D=" + dados.disc_distribuicao.D
      + " I=" + dados.disc_distribuicao.I
      + " S=" + dados.disc_distribuicao.S
      + " C=" + dados.disc_distribuicao.C,
    "",
    "DADOS POR CARGO:",
    JSON.stringify(cargos, null, 2),
    "",
    "COMPETÊNCIAS (ordenadas por média — mais críticas primeiro):",
    JSON.stringify(compCriticas, null, 2),
    "",
    "TODOS OS REGISTROS INDIVIDUAIS:",
    JSON.stringify(dados.membros, null, 2)
  ].join("\n");

  try {
    var prompt = {
      systemStatic: system,
      systemCompetencia: "",
      messages: [{ role: "user", content: user }]
    };

    var response = AIRouter.callClaude(prompt, "relatorio");
    Logger.log("Resposta IA: " + response.length + " chars");
    var cleaned = response.replace(/```json|```/g, "").trim();
    var match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (e) {
        // JSON truncado — tentar reparar fechando chaves/colchetes abertos
        Logger.log("JSON truncado, tentando reparar: " + e.message);
        var truncated = match[0];
        // Contar chaves e colchetes abertos
        var openBraces = (truncated.match(/\{/g) || []).length;
        var closeBraces = (truncated.match(/\}/g) || []).length;
        var openBrackets = (truncated.match(/\[/g) || []).length;
        var closeBrackets = (truncated.match(/\]/g) || []).length;
        // Remover ultima propriedade incompleta (apos ultima virgula valida)
        truncated = truncated.replace(/,\s*"[^"]*"?\s*:?\s*[^,}\]]*$/, "");
        // Fechar colchetes e chaves pendentes
        for (var b = 0; b < openBrackets - closeBrackets; b++) truncated += "]";
        for (var b = 0; b < openBraces - closeBraces; b++) truncated += "}";
        try {
          var repaired = JSON.parse(truncated);
          Logger.log("JSON reparado com sucesso");
          return repaired;
        } catch (e2) {
          Logger.log("Reparo falhou: " + e2.message);
          throw new Error("JSON truncado e irreparável. Aumente MAX_OUTPUT_TOKENS_RELATORIO ou use modelo mais forte.");
        }
      }
    }
    throw new Error("JSON não encontrado na resposta");
  } catch (e) {
    Logger.log("ERRO IA relatório RH: " + e.message);
    throw e;
  }
}


// ══════════════════════════════════════════════════════════════════════
// CRIACAO DO DOCUMENTO
// ══════════════════════════════════════════════════════════════════════

function _rhCriarDocumento(templateFile, folder, relatorio, dados, indicadores) {
  var ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd-MM-yyyy");
  var copia = templateFile.makeCopy("Relatório RH Fase 3 — " + ts, folder);
  var doc = DocumentApp.openById(copia.getId());
  var body = doc.getBody();

  var range = body.findText("\\{\\{RELATORIO_DINAMICO\\}\\}");
  if (!range) { doc.saveAndClose(); return; }

  var parentPar = range.getElement().getParent();
  var idx = body.getChildIndex(parentPar);
  parentPar.asParagraph().setText(" ");

  var C_TITULO = "#0F2B54";
  var C_SUBTITULO = "#2471A3";
  var C_TEXTO = "#0F2B54";
  var C_VERDE = "#27AE60";
  var C_VERMELHO = "#C0392B";
  var C_AMARELO = "#F39C12";

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

  // ── 2. INDICADORES QUANTITATIVOS ───────────────────────────────────

  var h2 = body.insertParagraph(idx++, "📊 Indicadores Quantitativos");
  h2.setHeading(DocumentApp.ParagraphHeading.HEADING2)
    .setForegroundColor(C_TITULO).editAsText().setBold(true);
  body.insertParagraph(idx++, " ");

  var tInd = body.insertTable(idx++);
  tInd.setBorderWidth(0);

  var indicadoresArr = [
    { label: "Colaboradores avaliados", valor: String(dados.total_colaboradores) },
    { label: "Avaliações realizadas", valor: String(dados.total_avaliacoes) },
    { label: "Média geral Fase 1", valor: indicadores.media_geral_f1.toFixed(2) },
    { label: "Média geral Fase 3", valor: indicadores.media_geral_f3.toFixed(2) },
    { label: "Evolução média", valor: (indicadores.media_geral_f3 - indicadores.media_geral_f1 >= 0 ? "+" : "") + (indicadores.media_geral_f3 - indicadores.media_geral_f1).toFixed(2) },
    { label: "Desvio padrão Fase 3", valor: indicadores.desvio_f3.toFixed(2) }
  ];

  for (var ii = 0; ii < indicadoresArr.length; ii++) {
    var indRow = tInd.appendTableRow();
    indRow.appendTableCell(indicadoresArr[ii].label)
      .setBackgroundColor(ii % 2 === 0 ? "#F7F9FC" : "#FFFFFF").setWidth(260)
      .setPaddingTop(6).setPaddingBottom(6).setPaddingLeft(10).setPaddingRight(10)
      .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_TEXTO);
    indRow.appendTableCell(indicadoresArr[ii].valor)
      .setBackgroundColor(ii % 2 === 0 ? "#F7F9FC" : "#FFFFFF").setWidth(210)
      .setPaddingTop(6).setPaddingBottom(6).setPaddingLeft(10).setPaddingRight(10)
      .editAsText().setBold(true).setFontSize(10).setForegroundColor(C_TITULO);
  }

  body.insertParagraph(idx++, " ");

  // Evolução
  var tEvol = body.insertTable(idx++);
  tEvol.setBorderWidth(0);
  var evolItems = [
    { emoji: "⬆️", label: "Evoluíram", val: indicadores.subiram + " (" + indicadores.pct_subiram + "%)", bg: "#E8F5E9", cor: C_VERDE },
    { emoji: "➡️", label: "Mantiveram", val: indicadores.mantiveram + " (" + indicadores.pct_mantiveram + "%)", bg: "#FFFDE7", cor: C_AMARELO },
    { emoji: "⬇️", label: "Regrediram", val: indicadores.desceram + " (" + indicadores.pct_desceram + "%)", bg: "#FEF5F5", cor: C_VERMELHO }
  ];
  for (var ei = 0; ei < evolItems.length; ei++) {
    var eRow = tEvol.appendTableRow();
    eRow.appendTableCell(evolItems[ei].emoji + " " + evolItems[ei].label + ": " + evolItems[ei].val)
      .setBackgroundColor(evolItems[ei].bg).setWidth(470)
      .setPaddingTop(6).setPaddingBottom(6).setPaddingLeft(12).setPaddingRight(12)
      .editAsText().setBold(true).setFontSize(10).setForegroundColor(evolItems[ei].cor);
  }

  body.insertParagraph(idx++, " ");

  // ── 3. COMPARATIVO FASE 1 vs FASE 3 ───────────────────────────────

  if (relatorio.comparativo_f1_f3) {
    var h3 = body.insertParagraph(idx++, "📈 Comparativo Fase 1 → Fase 3");
    h3.setHeading(DocumentApp.ParagraphHeading.HEADING2)
      .setForegroundColor(C_TITULO).editAsText().setBold(true);
    body.insertParagraph(idx++, " ");

    if (relatorio.comparativo_f1_f3.analise) {
      body.insertParagraph(idx++, relatorio.comparativo_f1_f3.analise)
        .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_TEXTO);
    }

    var tComp = body.insertTable(idx++);
    tComp.setBorderWidth(0);
    if (relatorio.comparativo_f1_f3.destaque_positivo) {
      tComp.appendTableRow().appendTableCell("✅ " + relatorio.comparativo_f1_f3.destaque_positivo)
        .setBackgroundColor("#E8F5E9").setWidth(470)
        .setPaddingTop(6).setPaddingBottom(6).setPaddingLeft(10).setPaddingRight(10)
        .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_VERDE);
    }
    if (relatorio.comparativo_f1_f3.destaque_atencao) {
      tComp.appendTableRow().appendTableCell(" ").setWidth(470).setPaddingTop(2).setPaddingBottom(2);
      tComp.appendTableRow().appendTableCell("⚠️ " + relatorio.comparativo_f1_f3.destaque_atencao)
        .setBackgroundColor("#FFF3E0").setWidth(470)
        .setPaddingTop(6).setPaddingBottom(6).setPaddingLeft(10).setPaddingRight(10)
        .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_AMARELO);
    }
    body.insertParagraph(idx++, " ");
  }

  // ── 4. VISÃO POR CARGO ─────────────────────────────────────────────

  if (relatorio.visao_por_cargo && relatorio.visao_por_cargo.length > 0) {
    var h4 = body.insertParagraph(idx++, "👥 Visão por Cargo");
    h4.setHeading(DocumentApp.ParagraphHeading.HEADING2)
      .setForegroundColor(C_TITULO).editAsText().setBold(true);
    body.insertParagraph(idx++, " ");

    // Tabela resumo por cargo
    var tCargo = body.insertTable(idx++);
    tCargo.setBorderWidth(1);
    var hCargo = tCargo.appendTableRow();
    var clabels = ["Cargo", "Avaliações", "Média F3", "% Evolução"];
    var cwidths = [180, 80, 80, 80];
    for (var ci = 0; ci < clabels.length; ci++) {
      var cc = hCargo.appendTableCell(clabels[ci]);
      cc.setBackgroundColor(C_TITULO).setWidth(cwidths[ci])
        .setPaddingTop(6).setPaddingBottom(6).setPaddingLeft(6).setPaddingRight(6);
      if (ci >= 1) cc.getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      cc.editAsText().setBold(true).setForegroundColor("#FFFFFF").setFontSize(9);
    }

    for (var cargo in indicadores.por_cargo) {
      var pc = indicadores.por_cargo[cargo];
      var cRow = tCargo.appendTableRow();
      cRow.appendTableCell(_rhSafe(cargo)).setWidth(180)
        .setPaddingTop(4).setPaddingBottom(4).setPaddingLeft(6).setPaddingRight(6)
        .editAsText().setBold(true).setFontSize(9).setForegroundColor(C_TEXTO);
      var ccT = cRow.appendTableCell(String(pc.total)).setWidth(80)
        .setPaddingTop(4).setPaddingBottom(4).setPaddingLeft(6).setPaddingRight(6);
      ccT.getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      ccT.editAsText().setBold(false).setFontSize(9).setForegroundColor(C_TEXTO);
      var ccM = cRow.appendTableCell(pc.media_f3.toFixed(2)).setWidth(80)
        .setPaddingTop(4).setPaddingBottom(4).setPaddingLeft(6).setPaddingRight(6);
      ccM.getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      ccM.editAsText().setBold(true).setFontSize(9).setForegroundColor(C_TEXTO);
      var ccE = cRow.appendTableCell(pc.pct_evolucao + "%").setWidth(80)
        .setPaddingTop(4).setPaddingBottom(4).setPaddingLeft(6).setPaddingRight(6);
      ccE.getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      var corEvol = pc.pct_evolucao >= 50 ? C_VERDE : (pc.pct_evolucao >= 25 ? C_AMARELO : C_VERMELHO);
      ccE.editAsText().setBold(true).setFontSize(9).setForegroundColor(corEvol);
    }

    body.insertParagraph(idx++, " ");

    // Análise narrativa por cargo
    for (var vi = 0; vi < relatorio.visao_por_cargo.length; vi++) {
      var vc = relatorio.visao_por_cargo[vi];
      body.insertParagraph(idx++, _rhSafe(vc.cargo || ""))
        .setHeading(DocumentApp.ParagraphHeading.HEADING3)
        .setForegroundColor(C_SUBTITULO).editAsText().setBold(true);
      if (vc.analise) body.insertParagraph(idx++, vc.analise)
        .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_TEXTO);
      if (vc.ponto_forte || vc.ponto_critico) {
        var tVC = body.insertTable(idx++);
        tVC.setBorderWidth(0);
        if (vc.ponto_forte) {
          tVC.appendTableRow().appendTableCell("✅ " + vc.ponto_forte)
            .setBackgroundColor("#F1F8F0").setWidth(470)
            .setPaddingTop(4).setPaddingBottom(4).setPaddingLeft(10).setPaddingRight(10)
            .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_VERDE);
        }
        if (vc.ponto_critico) {
          tVC.appendTableRow().appendTableCell("⚠️ " + vc.ponto_critico)
            .setBackgroundColor("#FFFBF5").setWidth(470)
            .setPaddingTop(4).setPaddingBottom(4).setPaddingLeft(10).setPaddingRight(10)
            .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_AMARELO);
        }
      }
      body.insertParagraph(idx++, " ");
    }
  }

  // ── 5. COMPETÊNCIAS CRÍTICAS ───────────────────────────────────────

  if (relatorio.competencias_criticas && relatorio.competencias_criticas.length > 0) {
    var h5 = body.insertParagraph(idx++, "🎯 Competências Críticas — Onde Investir");
    h5.setHeading(DocumentApp.ParagraphHeading.HEADING2)
      .setForegroundColor(C_TITULO).editAsText().setBold(true);
    body.insertParagraph(idx++, " ");

    var tCrit = body.insertTable(idx++);
    tCrit.setBorderWidth(0);

    for (var ci = 0; ci < relatorio.competencias_criticas.length; ci++) {
      var cc = relatorio.competencias_criticas[ci];
      var urgencia = String(cc.nivel_criticidade || "").toUpperCase();
      var bgCrit, corCrit;
      if (urgencia === "CRITICA") { bgCrit = "#C0392B"; corCrit = "#FFFFFF"; }
      else if (urgencia === "ATENCAO") { bgCrit = "#F39C12"; corCrit = "#FFFFFF"; }
      else { bgCrit = "#27AE60"; corCrit = "#FFFFFF"; }

      tCrit.appendTableRow().appendTableCell(_rhSafe(cc.competencia) + " — " + urgencia)
        .setBackgroundColor(bgCrit).setWidth(470)
        .setPaddingTop(6).setPaddingBottom(4).setPaddingLeft(10).setPaddingRight(10)
        .editAsText().setBold(true).setFontSize(10).setForegroundColor(corCrit);

      if (cc.motivo) {
        var bgMotivo = urgencia === "CRITICA" ? "#FEF5F5" : (urgencia === "ATENCAO" ? "#FFFBF0" : "#F0FFF5");
        tCrit.appendTableRow().appendTableCell("  " + cc.motivo)
          .setBackgroundColor(bgMotivo).setWidth(470)
          .setPaddingTop(4).setPaddingBottom(4).setPaddingLeft(16).setPaddingRight(10)
          .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_TEXTO);
      }
      if (cc.impacto_alunos) {
        tCrit.appendTableRow().appendTableCell("  🎒 " + cc.impacto_alunos)
          .setBackgroundColor("#FFFDE7").setWidth(470)
          .setPaddingTop(2).setPaddingBottom(6).setPaddingLeft(16).setPaddingRight(10)
          .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_TEXTO);
      }
      tCrit.appendTableRow().appendTableCell(" ").setWidth(470)
        .setPaddingTop(1).setPaddingBottom(1).setBackgroundColor("#FFFFFF");
    }
    body.insertParagraph(idx++, " ");
  }

  // ── 6. TREINAMENTOS SUGERIDOS ──────────────────────────────────────

  if (relatorio.treinamentos_sugeridos && relatorio.treinamentos_sugeridos.length > 0) {
    var h6 = body.insertParagraph(idx++, "📚 Formações e Treinamentos Sugeridos");
    h6.setHeading(DocumentApp.ParagraphHeading.HEADING2)
      .setForegroundColor(C_TITULO).editAsText().setBold(true);
    body.insertParagraph(idx++, " ");

    for (var ti = 0; ti < relatorio.treinamentos_sugeridos.length; ti++) {
      var tr = relatorio.treinamentos_sugeridos[ti];
      var prioLabel = String(tr.prioridade || "").toUpperCase();
      var corPrio = prioLabel === "URGENTE" ? "#C0392B" : (prioLabel === "IMPORTANTE" ? "#2471A3" : "#1A7A4A");
      var bgPrio = prioLabel === "URGENTE" ? "#FEF5F5" : (prioLabel === "IMPORTANTE" ? "#F0F7FF" : "#F0FFF5");

      var tTr = body.insertTable(idx++);
      tTr.setBorderWidth(0);

      tTr.appendTableRow().appendTableCell((ti + 1) + ". " + _rhSafe(tr.titulo) + " [" + prioLabel + "]")
        .setBackgroundColor(corPrio).setWidth(470)
        .setPaddingTop(8).setPaddingBottom(8).setPaddingLeft(12).setPaddingRight(12)
        .editAsText().setBold(true).setForegroundColor("#FFFFFF").setFontSize(10);

      var detalhes = [];
      if (tr.publico) detalhes.push("Público: " + tr.publico);
      if (tr.formato) detalhes.push("Formato: " + tr.formato);
      if (tr.carga_horaria) detalhes.push("Carga: " + tr.carga_horaria);
      if (tr.custo_relativo) detalhes.push("Custo: " + tr.custo_relativo);
      if (tr.competencias_alvo && tr.competencias_alvo.length > 0) {
        detalhes.push("Competências: " + tr.competencias_alvo.join(", "));
      }

      tTr.appendTableRow().appendTableCell("  " + detalhes.join("  |  "))
        .setBackgroundColor(bgPrio).setWidth(470)
        .setPaddingTop(4).setPaddingBottom(4).setPaddingLeft(16).setPaddingRight(10)
        .editAsText().setBold(false).setFontSize(9).setItalic(true).setForegroundColor(C_TEXTO);

      if (tr.prioridade_se_orcamento_curto) {
        tTr.appendTableRow().appendTableCell("  💰 Se orçamento curto — prioridade " + tr.prioridade_se_orcamento_curto)
          .setBackgroundColor(bgPrio).setWidth(470)
          .setPaddingTop(2).setPaddingBottom(4).setPaddingLeft(16).setPaddingRight(10)
          .editAsText().setBold(true).setFontSize(9).setForegroundColor(C_TITULO);
      }

      if (tr.justificativa) {
        tTr.appendTableRow().appendTableCell("  " + tr.justificativa)
          .setBackgroundColor(bgPrio).setWidth(470)
          .setPaddingTop(4).setPaddingBottom(8).setPaddingLeft(16).setPaddingRight(10)
          .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_TEXTO);
      }
      body.insertParagraph(idx++, " ");
    }
  }

  // ── 7. PERFIL DISC ORGANIZACIONAL ──────────────────────────────────

  if (relatorio.perfil_disc_organizacional) {
    var h7 = body.insertParagraph(idx++, "🧬 Perfil Comportamental da Organização");
    h7.setHeading(DocumentApp.ParagraphHeading.HEADING2)
      .setForegroundColor(C_TITULO).editAsText().setBold(true);
    body.insertParagraph(idx++, " ");

    var dd = dados.disc_distribuicao;
    body.insertParagraph(idx++, "Composição: D=" + dd.D + " | I=" + dd.I + " | S=" + dd.S + " | C=" + dd.C
      + " (" + dados.total_colaboradores + " colaboradores)")
      .editAsText().setBold(false).setFontSize(10).setItalic(true).setForegroundColor(C_TEXTO);

    if (relatorio.perfil_disc_organizacional.descricao) {
      body.insertParagraph(idx++, relatorio.perfil_disc_organizacional.descricao)
        .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_TEXTO);
    }
    if (relatorio.perfil_disc_organizacional.implicacao_pedagogica) {
      var tDO = body.insertTable(idx++);
      tDO.setBorderWidth(0);
      tDO.appendTableRow().appendTableCell("🎒 Implicação pedagógica")
        .setBackgroundColor("#E3EEF9").setWidth(470)
        .setPaddingTop(6).setPaddingBottom(4).setPaddingLeft(10).setPaddingRight(10)
        .editAsText().setBold(true).setFontSize(10).setForegroundColor(C_TITULO);
      tDO.appendTableRow().appendTableCell("  " + relatorio.perfil_disc_organizacional.implicacao_pedagogica)
        .setBackgroundColor("#F7FBFF").setWidth(470)
        .setPaddingTop(4).setPaddingBottom(8).setPaddingLeft(16).setPaddingRight(10)
        .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_TEXTO);
    }
    body.insertParagraph(idx++, " ");
  }

  // ── 8. DECISÕES-CHAVE ──────────────────────────────────────────────

  if (relatorio.decisoes_chave && relatorio.decisoes_chave.length > 0) {
    var hDec = body.insertParagraph(idx++, "⚡ Decisões-Chave e Critérios");
    hDec.setHeading(DocumentApp.ParagraphHeading.HEADING2)
      .setForegroundColor(C_TITULO).editAsText().setBold(true);
    body.insertParagraph(idx++, " ");

    body.insertParagraph(idx++, "Situações que exigem decisão do RH com prazo e critério claros:")
      .editAsText().setBold(false).setFontSize(10).setItalic(true).setForegroundColor(C_TEXTO);
    body.insertParagraph(idx++, " ");

    for (var di = 0; di < relatorio.decisoes_chave.length; di++) {
      var dec = relatorio.decisoes_chave[di];
      var tDec = body.insertTable(idx++);
      tDec.setBorderWidth(0);

      // Header com nome
      tDec.appendTableRow().appendTableCell("⚡ " + _rhSafe(dec.colaborador || ""))
        .setBackgroundColor("#1a1548").setWidth(470)
        .setPaddingTop(8).setPaddingBottom(8).setPaddingLeft(12).setPaddingRight(12)
        .editAsText().setBold(true).setForegroundColor("#FFFFFF").setFontSize(10);

      // Situação
      if (dec.situacao) {
        tDec.appendTableRow().appendTableCell("  Situação: " + dec.situacao)
          .setBackgroundColor("#F5F3FF").setWidth(470)
          .setPaddingTop(6).setPaddingBottom(4).setPaddingLeft(16).setPaddingRight(10)
          .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_TEXTO);
      }

      // Ação imediata
      if (dec.acao_imediata) {
        tDec.appendTableRow().appendTableCell("  🔴 Ação imediata: " + dec.acao_imediata)
          .setBackgroundColor("#FEF5F5").setWidth(470)
          .setPaddingTop(4).setPaddingBottom(4).setPaddingLeft(16).setPaddingRight(10)
          .editAsText().setBold(true).setFontSize(10).setForegroundColor(C_VERMELHO);
      }

      // Critério de reavaliação
      if (dec.criterio_reavaliacao) {
        tDec.appendTableRow().appendTableCell("  📅 Reavaliação: " + dec.criterio_reavaliacao)
          .setBackgroundColor("#F0F7FF").setWidth(470)
          .setPaddingTop(4).setPaddingBottom(4).setPaddingLeft(16).setPaddingRight(10)
          .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_TEXTO);
      }

      // Consequência
      if (dec.consequencia) {
        tDec.appendTableRow().appendTableCell("  ⚠️ Se não evoluir: " + dec.consequencia)
          .setBackgroundColor("#FFF3E0").setWidth(470)
          .setPaddingTop(4).setPaddingBottom(8).setPaddingLeft(16).setPaddingRight(10)
          .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_AMARELO);
      }

      body.insertParagraph(idx++, " ");
    }
  }

  // ── 9. PLANO DE AÇÃO RH ───────────────────────────────────────────

  if (relatorio.plano_acao_rh) {
    var h9 = body.insertParagraph(idx++, "🚀 Plano de Ação — RH / T&D");
    h9.setHeading(DocumentApp.ParagraphHeading.HEADING2)
      .setForegroundColor(C_TITULO).editAsText().setBold(true);
    body.insertParagraph(idx++, " ");

    var horizontes = [
      { key: "curto_prazo", label: "📅 Curto Prazo (2 semanas)", cor: "#C0392B", bg: "#FEF5F5" },
      { key: "medio_prazo", label: "📆 Médio Prazo (1-2 meses)", cor: "#2471A3", bg: "#F0F7FF" },
      { key: "longo_prazo", label: "🗓️ Longo Prazo (próximo semestre)", cor: "#1A7A4A", bg: "#F0FFF5" }
    ];

    for (var hi = 0; hi < horizontes.length; hi++) {
      var hz = horizontes[hi];
      var acao = relatorio.plano_acao_rh[hz.key];
      if (!acao) continue;

      var tPl = body.insertTable(idx++);
      tPl.setBorderWidth(0);

      tPl.appendTableRow().appendTableCell(hz.label + ": " + _rhSafe(acao.titulo || ""))
        .setBackgroundColor(hz.cor).setWidth(470)
        .setPaddingTop(8).setPaddingBottom(8).setPaddingLeft(12).setPaddingRight(12)
        .editAsText().setBold(true).setForegroundColor("#FFFFFF").setFontSize(10);

      if (acao.descricao) {
        tPl.appendTableRow().appendTableCell("  " + acao.descricao)
          .setBackgroundColor(hz.bg).setWidth(470)
          .setPaddingTop(6).setPaddingBottom(4).setPaddingLeft(16).setPaddingRight(10)
          .editAsText().setBold(false).setFontSize(10).setForegroundColor(C_TEXTO);
      }
      if (acao.impacto) {
        tPl.appendTableRow().appendTableCell("  📊 " + acao.impacto)
          .setBackgroundColor(hz.bg).setWidth(470)
          .setPaddingTop(2).setPaddingBottom(8).setPaddingLeft(16).setPaddingRight(10)
          .editAsText().setBold(false).setFontSize(10).setItalic(true).setForegroundColor(C_TEXTO);
      }
      body.insertParagraph(idx++, " ");
    }
  }

  // ── 10. MENSAGEM FINAL ─────────────────────────────────────────────

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
    var pdfFile = folder.createFile(pdf).setName("Relatório RH Fase 3 — " + ts + ".pdf");
    Logger.log("PDF gerado: " + pdfFile.getName());
    DriveApp.getFileById(copia.getId()).setTrashed(true);
  } catch (e) {
    Logger.log("Erro ao gerar PDF: " + e.message);
  }
}


function _rhSafe(text) {
  var s = String(text || "").replace(/[\\$]/g, "").trim();
  return s.length > 0 ? s : " ";
}