// =====================================================================
// VERTHO - DashboardWebFase3.gs
//
// Serve dashboard executivo como página web.
// O cliente acessa a URL e vê KPIs, gráficos e tabelas interativas.
//
// Como servir:
//   1. Deploy separado: crie um novo deployment (Web app)
//      com doGetDashboard como entry point
//   OU
//   2. Adicione rota no doGet existente:
//      if (e.parameter.view === 'dashboard') return serveDashboard();
//
// Dependências: DashboardFase3.gs (para coleta de dados)
// =====================================================================


/**
 * Entry point para o dashboard web.
 * Serve a página HTML com tela de login.
 * Os dados são carregados via google.script.run após identificação.
 */
function serveDashboard() {
  var template = HtmlService.createTemplateFromFile('Dashboardwebfase3_html');
  return template.evaluate()
    .setTitle('Vertho — Dashboard Fase 3')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Identifica o usuário e retorna dados filtrados por hierarquia.
 * Chamado pelo frontend via google.script.run.
 *
 * Hierarquia:
 *   - Professor(a) → vê apenas os próprios dados
 *   - Coordenador(a) → vê professores + si mesmo
 *   - Diretor(a) → vê tudo
 *   - Admin/RH (cfg_emails_rh) → vê tudo
 *
 * @param {string} email - e-mail digitado na tela de login
 * @returns {Object} { success, userName, cargo, nivel_acesso, dashData }
 */
function getDashboardData(email) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  email = String(email || "").toLowerCase().trim();
  if (!email) return { success: false, message: "Informe seu e-mail." };

  // Verificar se é admin/RH
  var props = PropertiesService.getScriptProperties();
  var emailsRH = String(props.getProperty('cfg_emails_rh') || "").toLowerCase();
  var isAdmin = emailsRH.indexOf(email) >= 0;

  // Buscar na aba Colaboradores
  var wsColab = ss.getSheetByName(Config.SHEET_COLABORADORES || "Colaboradores");
  var usuario = null;
  var todosColaboradores = {};

  if (wsColab) {
    var dataColab = wsColab.getDataRange().getValues();
    for (var r = 4; r < dataColab.length; r++) {
      var colEmail = String(dataColab[r][6] || "").trim().toLowerCase();
      if (!colEmail) continue;
      var colab = {
        email: colEmail,
        nome: String(dataColab[r][1] || "").trim(),
        cargo: String(dataColab[r][3] || "").trim()
      };
      todosColaboradores[colEmail] = colab;
      if (colEmail === email) usuario = colab;
    }
  }

  if (!usuario && !isAdmin) {
    return { success: false, message: "E-mail não encontrado. Verifique e tente novamente." };
  }

  // Determinar nível de acesso
  var nivelAcesso, cargoNorm;
  if (isAdmin && !usuario) {
    nivelAcesso = "admin";
    cargoNorm = "admin";
    usuario = { email: email, nome: "Administrador", cargo: "RH / Admin" };
  } else {
    cargoNorm = (usuario.cargo || "").toLowerCase();
    if (cargoNorm.indexOf("diretor") >= 0 || isAdmin) {
      nivelAcesso = "diretor";
    } else if (cargoNorm.indexOf("coordenador") >= 0) {
      nivelAcesso = "coordenador";
    } else {
      nivelAcesso = "colaborador";
    }
  }

  // Coletar TODOS os dados
  var todosDados = _dbColetarTudo(ss);

  // Filtrar por hierarquia
  var dadosFiltrados;
  if (nivelAcesso === "diretor" || nivelAcesso === "admin") {
    // Vê tudo
    dadosFiltrados = todosDados;
  } else if (nivelAcesso === "coordenador") {
    // Vê professores (não-gestores) + si mesmo
    dadosFiltrados = todosDados.filter(function(d) {
      if (d.email === email) return true;
      var dCargo = (d.cargo || "").toLowerCase();
      return dCargo.indexOf("coordenador") < 0 && dCargo.indexOf("diretor") < 0;
    });
  } else {
    // Colaborador: vê apenas os próprios dados
    dadosFiltrados = todosDados.filter(function(d) { return d.email === email; });
  }

  // Calcular indicadores com dados filtrados
  var concluidos = dadosFiltrados.filter(function(d) { return d.status.toLowerCase() === "concluida"; });
  var total = concluidos.length || 1;
  var subiram = concluidos.filter(function(d) { return d.evolucao === "Subiu"; }).length;
  var mantiveram = concluidos.filter(function(d) { return d.evolucao === "Manteve"; }).length;
  var desceram = concluidos.filter(function(d) { return d.evolucao === "Desceu"; }).length;

  var niveisF1 = concluidos.map(function(d){return d.nivel_fase1}).filter(function(n){return n>0});
  var niveisF3 = concluidos.map(function(d){return d.nivel_fase3}).filter(function(n){return n>0});
  var mediaF1 = niveisF1.length > 0 ? niveisF1.reduce(function(a,b){return a+b},0)/niveisF1.length : 0;
  var mediaF3 = niveisF3.length > 0 ? niveisF3.reduce(function(a,b){return a+b},0)/niveisF3.length : 0;

  var porCargo = {};
  for (var i = 0; i < concluidos.length; i++) {
    var c = concluidos[i].cargo || "Sem cargo";
    if (!porCargo[c]) porCargo[c] = {total:0,somaF1:0,somaF3:0,subiram:0};
    porCargo[c].total++;
    porCargo[c].somaF1 += concluidos[i].nivel_fase1;
    porCargo[c].somaF3 += concluidos[i].nivel_fase3;
    if (concluidos[i].evolucao === "Subiu") porCargo[c].subiram++;
  }

  var porComp = {};
  for (var i = 0; i < concluidos.length; i++) {
    var comp = concluidos[i].competencia || "?";
    if (!porComp[comp]) porComp[comp] = {total:0,somaF1:0,somaF3:0,n1n2:0};
    porComp[comp].total++;
    porComp[comp].somaF1 += concluidos[i].nivel_fase1;
    porComp[comp].somaF3 += concluidos[i].nivel_fase3;
    if (concluidos[i].nivel_fase3 <= 2) porComp[comp].n1n2++;
  }

  var discCount = {D:0,I:0,S:0,C:0};
  var emailsContados = {};
  for (var i = 0; i < dadosFiltrados.length; i++) {
    var em = dadosFiltrados[i].email;
    if (emailsContados[em]) continue;
    emailsContados[em] = true;
    var dd = dadosFiltrados[i].disc_dominante;
    if (dd && discCount[dd] !== undefined) discCount[dd]++;
  }

  var distNiveis = {1:0,2:0,3:0,4:0};
  for (var i = 0; i < concluidos.length; i++) {
    var n = Math.floor(concluidos[i].nivel_fase3);
    if (n>=1 && n<=4) distNiveis[n]++;
  }

  return {
    success: true,
    userName: usuario.nome,
    cargo: usuario.cargo,
    nivel_acesso: nivelAcesso,
    dashData: {
      kpis: {
        totalColaboradores: Object.keys(emailsContados).length,
        totalAvaliacoes: concluidos.length,
        pendentes: dadosFiltrados.length - concluidos.length,
        mediaF1: Math.round(mediaF1 * 100) / 100,
        mediaF3: Math.round(mediaF3 * 100) / 100,
        pctSubiram: Math.round(subiram / total * 100),
        pctMantiveram: Math.round(mantiveram / total * 100),
        pctDesceram: Math.round(desceram / total * 100),
        subiram: subiram,
        mantiveram: mantiveram,
        desceram: desceram
      },
      evolucao: { Subiu: subiram, Manteve: mantiveram, Desceu: desceram },
      distNiveis: distNiveis,
      disc: discCount,
      porCargo: porCargo,
      porComp: porComp,
      ranking: concluidos
        .filter(function(d) { return d.nivel_fase3 <= 2; })
        .sort(function(a, b) { return a.nivel_fase3 - b.nivel_fase3; })
        .slice(0, 10),
      todos: concluidos
    }
  };
}