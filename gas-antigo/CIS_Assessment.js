// =====================================================================
// CIS_Assessment.js — Vertho CIS Assessment (Server-side)
//
// Recebe resultados do webapp CIS_Webapp.html, grava na aba
// "CIS Assessment" e sincroniza scores DISC com a aba Colaboradores.
// =====================================================================

// ── Configuração ──
var CIS_SHEET_NAME  = 'CIS Assessment';
var CIS_WEBAPP_FILE = 'CIS_Webapp';

// =====================================================================
// CONSULTAR RESULTADO EXISTENTE
// =====================================================================

/**
 * Verifica se o email já tem resultado CIS. Se sim, retorna os scores.
 * Chamado pelo webapp para decidir se mostra o assessment ou os resultados.
 * @param {string} email
 * @return {Object} { exists: boolean, scores: {...}, profileLabel: string } ou { exists: false }
 */
function consultarResultadoCIS(email) {
  if (!email) return { exists: false };
  email = String(email).trim().toLowerCase();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName(CIS_SHEET_NAME);
  if (!ws || ws.getLastRow() < 2) return { exists: false };

  var dados = ws.getDataRange().getValues();
  // Busca último resultado (mais recente) para o email
  var resultado = null;
  for (var i = dados.length - 1; i >= 1; i--) {
    if (String(dados[i][0] || '').trim().toLowerCase() === email) {
      resultado = dados[i];
      break;
    }
  }

  if (!resultado) return { exists: false };

  // Montar objeto de scores a partir da linha
  var hdr = dados[0];
  var _fh = function(label) {
    var ln = label.toLowerCase();
    for (var h = 0; h < hdr.length; h++) {
      if (String(hdr[h] || '').toLowerCase().indexOf(ln) >= 0) return h;
    }
    return -1;
  };

  var iPerfil = _fh('perfil');
  var iD = _fh('dominân'); var iI = _fh('influên'); var iS = _fh('estabil'); var iC = _fh('conform');
  var iExec = _fh('executivo'); var iMotiv = _fh('motivador'); var iMetod = _fh('metód'); var iSist = _fh('sistemát');

  // DISC Natural
  var disc = {};
  if (iD >= 0) disc.D = Number(resultado[iD]) || 0;
  if (iI >= 0) disc.I = Number(resultado[iI]) || 0;
  if (iS >= 0) disc.S = Number(resultado[iS]) || 0;
  if (iC >= 0) disc.C = Number(resultado[iC]) || 0;

  // DISC Adaptado
  var iDA = _fh('dominân'); // Will match first "Dominância" (Natural) — need adapted columns
  var iCA_adapt = _fh('conformidade\nadapt'); if (iCA_adapt < 0) iCA_adapt = _fh('conform');
  var iDA_adapt = _fh('dominância\nadapt');   if (iDA_adapt < 0) iDA_adapt = _fh('dominân');
  var iIA_adapt = _fh('influência\nadapt');   if (iIA_adapt < 0) iIA_adapt = _fh('influên');
  var iSA_adapt = _fh('estabilidade\nadapt'); if (iSA_adapt < 0) iSA_adapt = _fh('estabil');
  // Adapted columns are K-N (indices 10-13 in the sheet)
  var discA = {};
  // Headers: Col 10=Conformidade Adaptada, 11=Dominância Adaptada, 12=Influência Adaptada, 13=Estabilidade Adaptada
  if (resultado[10] != null) discA.C = Number(resultado[10]) || 0;
  if (resultado[11] != null) discA.D = Number(resultado[11]) || 0;
  if (resultado[12] != null) discA.I = Number(resultado[12]) || 0;
  if (resultado[13] != null) discA.S = Number(resultado[13]) || 0;

  // Liderança
  var lead = {};
  if (iExec >= 0) lead.Executivo = Number(resultado[iExec]) || 0;
  if (iMotiv >= 0) lead.Motivador = Number(resultado[iMotiv]) || 0;
  if (iMetod >= 0) lead.Metodico = Number(resultado[iMetod]) || 0;
  if (iSist >= 0) lead.Sistematico = Number(resultado[iSist]) || 0;

  // Competências (colunas após liderança)
  var compNames = ['Ousadia','Comando','Objetividade','Assertividade','Persuasão','Extroversão',
    'Entusiasmo','Sociabilidade','Empatia','Paciência','Persistência','Planejamento',
    'Organização','Detalhismo','Prudência','Concentração'];
  var comp = {};
  compNames.forEach(function(cn) {
    var ic = _fh(cn.substring(0,5).toLowerCase());
    if (ic >= 0) comp[cn] = Number(resultado[ic]) || 0;
  });

  // Preferências de Aprendizagem
  var prefNames = ['video_short','video_long','text','audio','infographic','exercise','mentor','case'];
  var prefLabels = ['Pref Vídeo\nCurto','Pref Vídeo\nLongo','Pref Texto','Pref Áudio','Pref Infográfico','Pref Exercício','Pref Mentor','Pref Estudo'];
  var prefs = {};
  for (var p = 0; p < prefNames.length; p++) {
    var ip = _fh(prefLabels[p].substring(0,8).toLowerCase());
    if (ip >= 0) prefs[prefNames[p]] = Number(resultado[ip]) || 0;
  }

  return {
    exists: true,
    profileLabel: iPerfil >= 0 ? String(resultado[iPerfil] || '') : '',
    disc: disc,
    discAdapted: discA,
    leadership: lead,
    competencies: comp,
    learnPrefs: prefs
  };
}


// =====================================================================
// SERVIR WEBAPP
// =====================================================================

/**
 * Retorna o HTML do webapp CIS para uso em modais ou webapps.
 * Não usa doGet (já existe em Main.js).
 */
function serveCISWebapp() {
  return HtmlService.createHtmlOutputFromFile(CIS_WEBAPP_FILE)
    .setTitle('Vertho — Assessment Comportamental')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Abre o webapp CIS como modal dialog na planilha.
 * Adicionar ao menu Vertho: .addItem('Assessment CIS', 'abrirCISAssessment')
 */
function abrirCISAssessment() {
  // Gravar SPREADSHEET_ID para uso via doPost externo
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) {
    PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  }
  var html = HtmlService.createHtmlOutputFromFile(CIS_WEBAPP_FILE)
    .setWidth(600)
    .setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, 'Vertho — Assessment Comportamental');
}

// =====================================================================
// RECEBER DADOS DO WEBAPP
// =====================================================================

/**
 * Chamado pelo webapp via google.script.run quando o assessment é concluído.
 *
 * @param {Object} payload - Dados completos do assessment
 * @param {Object} payload.userData - { name, email, gender }
 * @param {Object} payload.scores - Resultado do calculateScores()
 * @param {Array}  payload.discNatural - Rankings brutos Etapa 1
 * @param {Array}  payload.discAdapted - Rankings brutos Etapa 2
 * @param {Array}  payload.sprangerRankings - Rankings brutos Etapa 3
 * @return {Object} { success, id, profileLabel, message }
 */
function salvarResultadoCIS(payload) {
  // getActiveSpreadsheet() é null quando chamado via doPost externo
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    var sheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (sheetId) {
      ss = SpreadsheetApp.openById(sheetId);
    } else {
      throw new Error('Planilha nao encontrada. Configure SPREADSHEET_ID nas ScriptProperties.');
    }
  }
  var ws = ss.getSheetByName(CIS_SHEET_NAME);

  // Criar aba se não existir
  if (!ws) {
    ws = ss.insertSheet(CIS_SHEET_NAME);
    _criarCabecalhoCIS(ws);
  }

  var userData = payload.userData;
  var scores   = payload.scores;
  var disc         = scores.disc;
  var discA        = scores.discA;
  var leadership   = scores.leadership;
  var spranger     = scores.spranger;
  var competencies = scores.competencies;
  var profileLabel = scores.profileLabel;
  var timestamp    = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd HH:mm:ss');
  var id           = _gerarIdCIS(ws);

  // Preferências de aprendizagem
  var lp = payload.learnPrefs || {};

  // Montar linha de dados
  var row = [
    // Identificação
    userData.email,                          // A: E-mail
    userData.gender,                         // B: Gênero
    id,                                      // C: ID
    userData.name.toUpperCase(),              // D: Nome
    '',                                      // E: Empresa (preenchido depois)
    profileLabel,                            // F: Perfil

    // DISC Natural
    disc.D,                                  // G: Dominância
    disc.I,                                  // H: Influência
    disc.S,                                  // I: Estabilidade
    disc.C,                                  // J: Conformidade

    // DISC Adaptado
    discA.C,                                 // K: Conformidade Adaptada
    discA.D,                                 // L: Dominância Adaptada
    discA.I,                                 // M: Influência Adaptada
    discA.S,                                 // N: Estabilidade Adaptada

    // Estilos de Liderança (aceita com ou sem acento)
    leadership.Executivo,                                          // O: Executivo
    leadership.Motivador,                                          // P: Motivador
    leadership['Metódico']  || leadership['Metodico']  || 0,       // Q: Metódico
    leadership['Sistemático'] || leadership['Sistematico'] || 0,   // R: Sistemático

    // 16 Competências
    competencies['Ousadia']      || 0,       // S
    competencies['Comando']      || 0,       // T
    competencies['Objetividade'] || 0,       // U
    competencies['Assertividade']|| 0,       // V
    competencies['Persuasão']    || competencies['Persuasao']    || 0,  // W
    competencies['Extroversão']  || competencies['Extroversao']  || 0,  // X
    competencies['Entusiasmo']   || 0,       // Y
    competencies['Sociabilidade']|| 0,       // Z
    competencies['Empatia']      || 0,       // AA
    competencies['Paciência']    || competencies['Paciencia']    || 0,  // AB
    competencies['Persistência'] || competencies['Persistencia'] || 0,  // AC
    competencies['Planejamento'] || 0,       // AD
    competencies['Organização']  || competencies['Organizacao']  || 0,  // AE
    competencies['Detalhismo']   || 0,       // AF
    competencies['Prudência']    || competencies['Prudencia']    || 0,  // AG
    competencies['Concentração'] || competencies['Concentracao'] || 0,  // AH

    // Preferências de Aprendizagem (8 formatos, 1-5 estrelas)
    lp.video_short || 0,                     // AI: Pref Vídeo Curto
    lp.video_long  || 0,                     // AJ: Pref Vídeo Longo
    lp.text        || 0,                     // AK: Pref Texto
    lp.audio       || 0,                     // AL: Pref Áudio
    lp.infographic || 0,                     // AM: Pref Infográfico
    lp.exercise    || 0,                     // AN: Pref Exercício
    lp.mentor      || 0,                     // AO: Pref Mentor IA
    lp['case']     || 0,                     // AP: Pref Estudo de Caso

    // Metadata
    timestamp,                               // AQ: Timestamp
    'webapp'                                 // AR: Origem
  ];

  ws.appendRow(row);
  Logger.log('CIS Assessment salvo — ID: ' + id + ', Perfil: ' + profileLabel);

  // ── 2. Salvar rankings brutos (se fornecidos) ──
  var rawRankings = payload.rawRankings;
  if (rawRankings) {
    _salvarRankingsBrutos(ss, id, userData, rawRankings, timestamp);
  }

  return {
    success: true,
    id: id,
    profileLabel: profileLabel,
    message: 'Assessment salvo com sucesso. ID: ' + id
  };
}


// =====================================================================
// HELPERS
// =====================================================================

/**
 * Cria cabeçalho formatado na aba CIS Assessment.
 * @param {Sheet} ws - Aba destino
 */
function _criarCabecalhoCIS(ws) {
  var headers = [
    'E-mail', 'Gênero', 'ID', 'Nome', 'Empresa', 'Perfil',
    'Dominância', 'Influência', 'Estabilidade', 'Conformidade',
    'Conformidade\nAdaptada', 'Dominância\nAdaptada', 'Influência\nAdaptada', 'Estabilidade\nAdaptada',
    'Executivo', 'Motivador', 'Metódico', 'Sistemático',
    'Ousadia', 'Comando', 'Objetividade', 'Assertividade',
    'Persuasão', 'Extroversão', 'Entusiasmo', 'Sociabilidade',
    'Empatia', 'Paciência', 'Persistência', 'Planejamento',
    'Organização', 'Detalhismo', 'Prudência', 'Concentração',
    'Pref Vídeo\nCurto', 'Pref Vídeo\nLongo', 'Pref Texto', 'Pref Áudio',
    'Pref Infográfico', 'Pref Exercício', 'Pref Mentor IA', 'Pref Estudo\nde Caso',
    'Timestamp', 'Origem'
  ];

  ws.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Formatação — paleta navy Vertho
  var headerRange = ws.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#0F2B54');
  headerRange.setFontColor('#00C9B7');
  headerRange.setFontWeight('bold');
  headerRange.setFontSize(9);
  headerRange.setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  headerRange.setVerticalAlignment('middle');
  headerRange.setHorizontalAlignment('center');

  // Larguras de coluna
  ws.setColumnWidth(1, 220);  // E-mail
  ws.setColumnWidth(4, 250);  // Nome
  ws.setRowHeight(1, 50);
  ws.setFrozenRows(1);

  Logger.log('Aba "' + CIS_SHEET_NAME + '" criada com cabeçalho formatado.');
}

/**
 * Gera próximo ID sequencial para CIS (série 2000001+).
 * @param {Sheet} ws - Aba CIS Assessment
 * @return {number} Próximo ID
 */
function _gerarIdCIS(ws) {
  var lastRow = ws.getLastRow();
  if (lastRow <= 1) return 2000001;
  var lastId = ws.getRange(lastRow, 3).getValue();
  return (typeof lastId === 'number' ? lastId : 2000000) + 1;
}


// =====================================================================
// RANKINGS BRUTOS — Salva drag-and-drop de cada etapa
// =====================================================================

var CIS_RAW_SHEET = 'CIS Rankings Brutos';

/**
 * Salva os rankings brutos das 3 etapas na aba CIS Rankings Brutos.
 */
function _salvarRankingsBrutos(ss, id, userData, rawRankings, timestamp) {
  var wsRaw = ss.getSheetByName(CIS_RAW_SHEET);
  if (!wsRaw) {
    wsRaw = ss.insertSheet(CIS_RAW_SHEET);
    _criarCabecalhoRaw(wsRaw);
  }

  var nome = (userData.name || '').toUpperCase();
  var email = userData.email || '';

  // Etapa 1 — 10 grupos × 4 posições (DISC Natural)
  var etapa1 = rawRankings.etapa1 || [];
  for (var g1 = 0; g1 < etapa1.length; g1++) {
    var grupo1 = etapa1[g1];
    var labels1 = [], fatores1 = [];
    for (var p1 = 0; p1 < grupo1.length; p1++) {
      labels1.push(grupo1[p1].label || '');
      fatores1.push(grupo1[p1].disc || '');
    }
    // Pad para 6 posições
    while (labels1.length < 6) { labels1.push(''); fatores1.push(''); }
    var rawRow1 = [id, email, nome, 'Etapa 1', g1 + 1]
      .concat(labels1.slice(0, 6)).concat(fatores1.slice(0, 6)).concat([timestamp]);
    wsRaw.appendRow(rawRow1);
  }

  // Etapa 2 — 10 grupos × 4 posições (DISC Adaptado)
  var etapa2 = rawRankings.etapa2 || [];
  for (var g2 = 0; g2 < etapa2.length; g2++) {
    var grupo2 = etapa2[g2];
    var labels2 = [], fatores2 = [];
    for (var p2 = 0; p2 < grupo2.length; p2++) {
      labels2.push(grupo2[p2].label || '');
      fatores2.push(grupo2[p2].disc || '');
    }
    while (labels2.length < 6) { labels2.push(''); fatores2.push(''); }
    var rawRow2 = [id, email, nome, 'Etapa 2', g2 + 1]
      .concat(labels2.slice(0, 6)).concat(fatores2.slice(0, 6)).concat([timestamp]);
    wsRaw.appendRow(rawRow2);
  }

  // Etapa 3 — 10 grupos × 6 posições (Spranger/Valores)
  var etapa3 = rawRankings.etapa3 || [];
  for (var g3 = 0; g3 < etapa3.length; g3++) {
    var grupo3 = etapa3[g3];
    var labels3 = [], valores3 = [];
    for (var p3 = 0; p3 < grupo3.length; p3++) {
      labels3.push(grupo3[p3].label || '');
      valores3.push(grupo3[p3].value || '');
    }
    while (labels3.length < 6) { labels3.push(''); valores3.push(''); }
    var rawRow3 = [id, email, nome, 'Etapa 3', g3 + 1]
      .concat(labels3.slice(0, 6)).concat(valores3.slice(0, 6)).concat([timestamp]);
    wsRaw.appendRow(rawRow3);
  }

  Logger.log('CIS Rankings Brutos salvos — ' + etapa1.length + '+' + etapa2.length + '+' + etapa3.length + ' grupos');
}

/**
 * Cria cabeçalho da aba de rankings brutos.
 */
function _criarCabecalhoRaw(ws) {
  var headers = [
    'ID', 'E-mail', 'Nome', 'Etapa', 'Grupo',
    'Pos 1', 'Pos 2', 'Pos 3', 'Pos 4', 'Pos 5', 'Pos 6',
    'Fator 1', 'Fator 2', 'Fator 3', 'Fator 4', 'Fator 5', 'Fator 6',
    'Timestamp'
  ];
  ws.getRange(1, 1, 1, headers.length).setValues([headers]);
  var hr = ws.getRange(1, 1, 1, headers.length);
  hr.setBackground('#0F2B54').setFontColor('#00C9B7').setFontWeight('bold').setFontSize(9);
  hr.setHorizontalAlignment('center');
  ws.setFrozenRows(1);
}


// =====================================================================
// INTEGRAÇÃO COM PIPELINE — Sincroniza CIS → Colaboradores
// =====================================================================

/**
 * Copia os scores DISC do último resultado CIS para a aba Colaboradores.
 * Busca flexível de colunas (findIndex com includes).
 * Aba Colaboradores: cabeçalho na linha 4 (índice 3), dados a partir da linha 5.
 */
function sincronizarCIScomPipeline() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    var sheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (sheetId) ss = SpreadsheetApp.openById(sheetId);
  }
  var wsCIS  = ss.getSheetByName(CIS_SHEET_NAME);
  var wsColab = ss.getSheetByName('Colaboradores');

  if (!wsCIS || !wsColab) {
    SpreadsheetApp.getUi().alert('Abas necessárias não encontradas (CIS Assessment e/ou Colaboradores).');
    return;
  }

  var cisData = wsCIS.getDataRange().getValues();

  // Cabeçalho da aba Colaboradores está na linha 4 (índice 3)
  var colabLastCol = wsColab.getLastColumn();
  var colabHeaders = wsColab.getRange(4, 1, 1, colabLastCol).getValues()[0];

  // Busca flexível de colunas — usa findIndex com includes para tolerância
  var iEmail  = _findColIndex(colabHeaders, 'mail');
  var iPerfil = _findColIndex(colabHeaders, 'Perfil CIS');
  var iD      = _findColIndex(colabHeaders, 'D Natural');
  var iI      = _findColIndex(colabHeaders, 'I Natural');
  var iS      = _findColIndex(colabHeaders, 'S Natural');
  var iC      = _findColIndex(colabHeaders, 'C Natural');

  if (iEmail === -1) {
    SpreadsheetApp.getUi().alert('Coluna com "mail" não encontrada na linha 4 da aba Colaboradores.');
    return;
  }

  // Dados de colaboradores começam na linha 5 (índice 4 se lidos do topo, ou índice 0 se lidos da linha 5)
  var colabLastRow = wsColab.getLastRow();
  if (colabLastRow < 5) {
    SpreadsheetApp.getUi().alert('Nenhum colaborador encontrado na aba Colaboradores (dados a partir da linha 5).');
    return;
  }

  var colabData = wsColab.getRange(5, 1, colabLastRow - 4, colabLastCol).getValues();
  var atualizados = 0;

  for (var r = 0; r < colabData.length; r++) {
    var email = colabData[r][iEmail];
    if (!email) continue;

    // Buscar na aba CIS (último resultado do e-mail)
    var cisRow = null;
    for (var c = cisData.length - 1; c >= 1; c--) {
      if (cisData[c][0] === email) { cisRow = cisData[c]; break; }
    }

    if (cisRow) {
      var rowNum = r + 5; // linha real na planilha (dados começam na 5)
      if (iPerfil >= 0) wsColab.getRange(rowNum, iPerfil + 1).setValue(cisRow[5]);
      if (iD >= 0)      wsColab.getRange(rowNum, iD + 1).setValue(cisRow[6]);
      if (iI >= 0)      wsColab.getRange(rowNum, iI + 1).setValue(cisRow[7]);
      if (iS >= 0)      wsColab.getRange(rowNum, iS + 1).setValue(cisRow[8]);
      if (iC >= 0)      wsColab.getRange(rowNum, iC + 1).setValue(cisRow[9]);
      atualizados++;
    }
  }

  Logger.log('Sincronização CIS concluída: ' + atualizados + ' colaborador(es) atualizado(s).');
  SpreadsheetApp.getUi().alert('Sincronização concluída. ' + atualizados + ' colaborador(es) atualizado(s).');
}

/**
 * Busca flexível de índice de coluna — retorna o primeiro header que contém o termo.
 * @param {Array} headers - Array de strings do cabeçalho
 * @param {string} termo - Texto a buscar (case-insensitive)
 * @return {number} Índice da coluna ou -1 se não encontrada
 */
function _findColIndex(headers, termo) {
  var termoLower = termo.toLowerCase();
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).toLowerCase().indexOf(termoLower) >= 0) {
      return i;
    }
  }
  return -1;
}
