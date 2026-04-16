// ═══════════════════════════════════════════════════════════════════════════════
// VERTHO — FASE 4: CAPACITAÇÃO v5
// Bloco 1: 2 e-mails/semana · Semanas de implementação · Aba Capacitacao
//          Triggers separados (seg + qui) · Fallback no motor de atribuição
//          Contrato pedagógico · E-mails do gestor (sem 0, 1, 7, 14)
//          Nudge de inatividade (2+ semanas sem engajamento)
// ═══════════════════════════════════════════════════════════════════════════════

// ── NOMES DAS ABAS ─────────────────────────────────────────────────────────────
var F4_ABA_TRILHAS       = 'Trilhas';
var F4_ABA_ENVIOS        = 'Fase4_Envios';
var F4_ABA_CAPACITACAO   = 'Capacitacao';
var F4_ABA_RESPOSTAS     = 'Respostas';
var F4_ABA_CICLOS        = 'Ciclos_Avaliacao';
var F4_ABA_COMPETENCIAS  = 'Competencias_v2';
var F4_ABA_COLABORADORES = 'Colaboradores';
var F4_TOTAL_SEMANAS     = 14;

// Semanas de implementação (sem conteúdo novo — só prática)
var F4_SEMANAS_IMPL = [4, 8, 12];

// ── COLUNAS ABA Respostas (1-indexed) ─────────────────────────────────────────
var F4R_EMAIL     = 2;   // col B
var F4R_NOME      = 3;   // col C
var F4R_CARGO     = 5;   // col E
var F4R_ID_COMP   = 6;   // col F
var F4R_NOME_COMP = 7;   // col G
var F4R_NIVEL_IA4 = 17;  // col Q

// ── COLUNAS ABA Competencias (dados a partir da L5) ───────────────────────────
var F4C_ID   = 1;  // col A
var F4C_NOME = 2;  // col B

// ── COLUNAS ABA Ciclos_Avaliacao ──────────────────────────────────────────────
var F4CI_STATUS       = 6;  // col F
var F4CI_COMPETENCIAS = 7;  // col G — JSON {"cargo":"C007",...}
var F4CI_DATA         = 4;  // col D

// ── COLUNAS ABA Trilhas (v2: 11 colunas) ────────────────────────────────────
var F4T_EMAIL         = 1;
var F4T_COMPETENCIA   = 2;
var F4T_NIVEL_ENTRADA = 3;
var F4T_SEMANA        = 4;
var F4T_TIPO_SEMANA   = 5;
var F4T_TITULO        = 6;
var F4T_URL           = 7;
var F4T_DESCRICAO     = 8;
var F4T_DESCRITOR     = 9;
var F4T_NOTA_DESC     = 10;
var F4T_FONTE         = 11;
var F4T_STATUS        = 12;

// ── COLUNAS ABA Fase4_Envios ──────────────────────────────────────────────────
var F4E_NOME        = 1;
var F4E_EMAIL       = 2;
var F4E_CARGO       = 3;
var F4E_DATA_INICIO = 4;
var F4E_SEMANA_ATU  = 5;
var F4E_ULTIMO_ENV  = 6;   // último e-mail de pílula (segunda)
var F4E_ULT_EVID    = 7;   // último e-mail de evidência (quinta)
var F4E_STATUS      = 8;   // Ativo | Concluído | Pausado
var F4E_SEQUENCIA   = 9;   // JSON com as pílulas
var F4E_CONTRATO    = 10;  // JSON com o contrato pedagógico
var F4E_GESTOR_EMAIL= 11;  // e-mail do gestor
var F4E_WHATSAPP   = 12;  // WhatsApp (ex: 11999999999)

// ── COLUNAS ABA Capacitacao ───────────────────────────────────────────────────
var F4CAP_EMAIL        = 1;
var F4CAP_SEMANA       = 2;
var F4CAP_TIPO         = 3;   // 'pilula' | 'evidencia' | 'implementacao'
var F4CAP_PILULA_OK    = 4;   // TRUE/FALSE
var F4CAP_EVIDENCIA    = 5;   // texto registrado
var F4CAP_DATA_REG     = 6;
var F4CAP_PONTOS       = 7;   // pts acumulados nesta semana


// ═══════════════════════════════════════════════════════════════════════════════
// INICIAR FASE 4 — chamado pelo botão no painel
// emailAlvo: string ou null para todos
// gestorEmail: e-mail do gestor responsável (opcional)
// ═══════════════════════════════════════════════════════════════════════════════
function iniciarFase4(emailAlvo, gestorEmail) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var wsEnv = _f4_garantirAbas(ss);
  var wsRes = ss.getSheetByName(F4_ABA_RESPOSTAS);
  var wsTri = ss.getSheetByName(F4_ABA_TRILHAS);
  var wsCic = ss.getSheetByName(F4_ABA_CICLOS);
  if (!wsRes)  throw new Error('Aba "' + F4_ABA_RESPOSTAS + '" não encontrada.');
  if (!wsTri)  throw new Error('Aba "' + F4_ABA_TRILHAS + '" não encontrada. Execute criarEstruturaFase4() primeiro.');
  // Ciclos é opcional — sem ele, usa competência de menor nota

  var mapaFoco = wsCic ? _f4_lerMapaFoco(wsCic) : {};
  if (Object.keys(mapaFoco).length === 0) {
    Logger.log('Nenhum ciclo ativo — usando competência de menor nota para cada colaborador.');
  }

  var dictComp = _f4_lerDictCompetencias(ss);
  var gaps     = _f4_lerGaps(wsRes, emailAlvo);
  var trilhas  = _f4_lerTrilhas(wsTri);

  if (Object.keys(gaps).length === 0) {
    SpreadsheetApp.getUi().alert('Nenhum colaborador encontrado.');
    return;
  }

  var hoje      = new Date();
  var iniciados = 0;
  var semTrilha = [];
  var fallbacks = [];

  for (var email in gaps) {
    if (_f4_jaIniciado(wsEnv, email)) { Logger.log('Já iniciado: ' + email); continue; }

    var colab     = gaps[email];
    var cargoNorm = colab.cargo.trim().toLowerCase();
    var idFoco    = mapaFoco[cargoNorm] || null;
    var nomeFoco  = idFoco ? (dictComp[idFoco.toUpperCase()] || '') : '';

    var resultado = _f4_montarSequencia(colab.competencias, trilhas, nomeFoco, email);
    var sequencia = resultado.sequencia;
    var fallback  = resultado.fallback; // null | 'generico' | 'sem_conteudo'

    if (fallback === 'sem_gap') {
      Logger.log('Pulando ' + colab.nome + ' — sem gap (todos N4)');
      continue;
    }
    if (fallback === 'sem_conteudo') {
      semTrilha.push(colab.nome);
      // Inscrevemos mesmo sem trilha — pilulas serao puladas ate popular a aba Trilhas
    } else if (fallback) {
      fallbacks.push(colab.nome + ' → ' + fallback);
    }

    // Gera contrato pedagógico
    var contrato = _f4_gerarContrato(colab, nomeFoco, sequencia);

    wsEnv.appendRow([
      colab.nome,
      email,
      colab.cargo,
      hoje,
      1,           // semana atual
      '',          // último e-mail pílula
      '',          // último e-mail evidência
      'Ativo',
      JSON.stringify(sequencia),
      JSON.stringify(contrato),
      gestorEmail || '',
      colab.whatsapp || ''  // col 12 — WhatsApp
    ]);

    // Boas-vindas: e-mail + WhatsApp se disponível
    _f4_enviarBoasVindas(colab.nome, email, colab.whatsapp || '', contrato, sequencia[0]);
    Utilities.sleep(300);

    iniciados++;
  }

  // E-mail de kickoff para o gestor (semana 0)
  if (gestorEmail && iniciados > 0) {
    _f4_enviarEmailGestorKickoff(gestorEmail, iniciados);
  }

  var msg = iniciados + ' colaborador(es) iniciado(s) na Fase 4.';
  if (fallbacks.length)  msg += '\n\n⚠️ Conteúdo genérico (sem pílula exata):\n' + fallbacks.join('\n');
  if (semTrilha.length)  msg += '\n\n\u26a0\ufe0f Inscrito sem trilha \u2014 p\u00edlulas ser\u00e3o puladas at\u00e9 popular a aba "Trilhas":\n' + semTrilha.join('\n');
  SpreadsheetApp.getUi().alert(msg);
}

function iniciarFase4ParaTodos()          { iniciarFase4(null, null); }
function iniciarFase4UmColaborador(email) { iniciarFase4(email, null); }

function iniciarFase4Menu() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.alert(
    '🚀 Iniciar Envio Semanal',
    'Isso vai provisionar TODOS os colaboradores avaliados na aba Fase4_Envios e enviar o e-mail de boas-vindas.\n\n' +
    'Pré-requisitos:\n' +
    '• Trilhas montadas (Fase 4 → Montar Trilhas)\n' +
    '• Avaliações concluídas (IA4)\n\n' +
    'Deseja continuar?',
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;
  iniciarFase4ParaTodos();
}


// ═══════════════════════════════════════════════════════════════════════════════
// CRIAR CICLO DE AVALIAÇÃO (menu interativo)
// ═══════════════════════════════════════════════════════════════════════════════

function criarCicloMenu() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Ler competências disponíveis agrupadas por cargo
  var mapaV2 = _lerBaseCompetenciasV2(ss);
  if (!mapaV2 || Object.keys(mapaV2).length === 0) {
    ui.alert('Aba Competencias_v2 não encontrada ou vazia.');
    return;
  }

  // Agrupar por cargo
  var porCargo = {};
  var keys = Object.keys(mapaV2);
  for (var i = 0; i < keys.length; i++) {
    var c = mapaV2[keys[i]];
    var cargo = (c.cargo || '').trim().toLowerCase();
    if (!cargo) continue;
    if (!porCargo[cargo]) porCargo[cargo] = [];
    // Evitar duplicatas de competência
    var jaExiste = porCargo[cargo].some(function(x) { return x.codigo === c.codigo; });
    if (!jaExiste) {
      porCargo[cargo].push({ codigo: c.codigo, nome: c.nome });
    }
  }

  var cargos = Object.keys(porCargo).sort();
  if (cargos.length === 0) {
    ui.alert('Nenhum cargo encontrado em Competencias_v2.');
    return;
  }

  // 2. Nome do ciclo
  var respNome = ui.prompt(' Novo Ciclo', 'Nome do ciclo (ex: "Ciclo 1 — 2026"):', ui.ButtonSet.OK_CANCEL);
  if (respNome.getSelectedButton() !== ui.Button.OK) return;
  var nomeCiclo = respNome.getResponseText().trim() || ('Ciclo ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM'));

  // 3. Para cada cargo, perguntar a competência foco
  var compFoco = {};
  for (var ci = 0; ci < cargos.length; ci++) {
    var cargo = cargos[ci];
    var comps = porCargo[cargo];
    var lista = comps.map(function(c, idx) { return (idx + 1) + '. ' + c.nome + ' (' + c.codigo + ')'; }).join('\n');

    var respComp = ui.prompt(
      '🎯 Competência Foco — ' + cargo.charAt(0).toUpperCase() + cargo.slice(1),
      'Escolha a competência foco para "' + cargo + '":\n\n' + lista + '\n\n' +
      'Digite o NÚMERO (1-' + comps.length + ') ou deixe vazio para usar menor nota:',
      ui.ButtonSet.OK_CANCEL
    );
    if (respComp.getSelectedButton() !== ui.Button.OK) return;

    var escolha = parseInt(respComp.getResponseText().trim());
    if (escolha >= 1 && escolha <= comps.length) {
      compFoco[cargo] = comps[escolha - 1].codigo;
    }
    // Se vazio, não adiciona ao JSON → fallback menor nota
  }

  // 4. Gravar na aba Ciclos_Avaliacao
  var wsCic = ss.getSheetByName(F4_ABA_CICLOS);
  if (!wsCic) {
    wsCic = ss.insertSheet(F4_ABA_CICLOS);
    wsCic.getRange(1, 1, 1, 8).setValues([[
      'ciclo_id', 'cliente_id', 'nome', 'data_inicio', 'data_fim', 'status', 'competencias', 'created_at'
    ]]);
    wsCic.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#0F2B54').setFontColor('#FFFFFF');
    wsCic.setFrozenRows(1);
  }

  // Desativar ciclos anteriores
  var dadosCic = wsCic.getDataRange().getValues();
  for (var r = 1; r < dadosCic.length; r++) {
    if (String(dadosCic[r][5]).trim().toLowerCase() === 'ativo') {
      wsCic.getRange(r + 1, 6).setValue('concluido');
    }
  }

  var hoje = new Date();
  var novoId = dadosCic.length; // próximo ID
  var jsonComp = Object.keys(compFoco).length > 0 ? JSON.stringify(compFoco) : '{}';

  wsCic.appendRow([
    novoId,
    'ibipeba',
    nomeCiclo,
    hoje,
    '',  // data_fim (preenchido ao concluir)
    'ativo',
    jsonComp,
    hoje
  ]);

  // Resumo
  var resumo = '✅ Ciclo criado: "' + nomeCiclo + '"\n\n';
  if (Object.keys(compFoco).length > 0) {
    resumo += 'Competências foco:\n';
    for (var cf in compFoco) {
      var nomeComp = '';
      var compsC = porCargo[cf] || [];
      for (var j = 0; j < compsC.length; j++) {
        if (compsC[j].codigo === compFoco[cf]) { nomeComp = compsC[j].nome; break; }
      }
      resumo += '  • ' + cf + ' → ' + nomeComp + ' (' + compFoco[cf] + ')\n';
    }
  } else {
    resumo += 'Sem competência foco — cada colaborador usará a de menor nota.';
  }
  resumo += '\n\nCiclos anteriores foram marcados como "concluido".';

  ui.alert(resumo);
  Logger.log('Ciclo criado: ' + nomeCiclo + ' | Foco: ' + jsonComp);
}


// ═══════════════════════════════════════════════════════════════════════════════
// TRIGGER DE SEGUNDA — 8h: envia e-mail de pílula
// ═══════════════════════════════════════════════════════════════════════════════
function triggerSegundaFase4() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var wsEnv = ss.getSheetByName(F4_ABA_ENVIOS);
  if (!wsEnv) return;

  var dados = wsEnv.getDataRange().getValues();
  var hoje  = new Date();

  for (var i = 1; i < dados.length; i++) {
    var linha  = dados[i];
    if (String(linha[F4E_STATUS - 1]).trim() !== 'Ativo') continue;

    var email       = String(linha[F4E_EMAIL - 1]).trim();
    var nome        = String(linha[F4E_NOME - 1]).trim();
    var semanaAtual = parseInt(linha[F4E_SEMANA_ATU - 1]) || 1;
    var gestorEmail = String(linha[F4E_GESTOR_EMAIL - 1]).trim();
    var sequencia   = [];

    try { sequencia = JSON.parse(String(linha[F4E_SEQUENCIA - 1])); }
    catch(e) { Logger.log('Erro seq: ' + email); continue; }

    // Concluiu
    if (semanaAtual > F4_TOTAL_SEMANAS) {
      wsEnv.getRange(i + 1, F4E_STATUS).setValue('Concluído');
      _f4_enviarEmailConclusao(nome, email, gestorEmail);
      continue;
    }

    var ehImpl = F4_SEMANAS_IMPL.indexOf(semanaAtual) >= 0;
    var pilula = (!ehImpl && semanaAtual <= sequencia.length) ? sequencia[semanaAtual - 1] : null;

    // Check-in do gestor nas semanas 1 e 7
    if ((semanaAtual === 1 || semanaAtual === 7) && gestorEmail) {
      _f4_enviarEmailGestorCheckin(gestorEmail, semanaAtual, nome, wsEnv, dados);
    }

    var wppFone = String(linha[F4E_WHATSAPP - 1] || '').trim();

    try {
      if (ehImpl) {
        _f4_despacharSegunda(nome, email, wppFone, semanaAtual, null, true);
      } else if (pilula) {
        _f4_despacharSegunda(nome, email, wppFone, semanaAtual, pilula, false);
      }
      wsEnv.getRange(i + 1, F4E_ULTIMO_ENV).setValue(hoje);
      _f4_registrarCapacitacao(ss, email, semanaAtual, ehImpl ? 'implementacao' : 'pilula', false, '', 0);
      Logger.log('✅ Seg S' + semanaAtual + ' → ' + email);
    } catch(e) {
      Logger.log('❌ Seg: ' + email + ' | ' + e.message);
    }

    Utilities.sleep(500);
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// TRIGGER DE QUINTA — 8h: solicita evidência de aplicação
// ═══════════════════════════════════════════════════════════════════════════════
function triggerQuintaFase4() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var wsEnv = ss.getSheetByName(F4_ABA_ENVIOS);
  if (!wsEnv) return;

  var dados = wsEnv.getDataRange().getValues();
  var hoje  = new Date();

  for (var i = 1; i < dados.length; i++) {
    var linha  = dados[i];
    if (String(linha[F4E_STATUS - 1]).trim() !== 'Ativo') continue;

    var email       = String(linha[F4E_EMAIL - 1]).trim();
    var nome        = String(linha[F4E_NOME - 1]).trim();
    var semanaAtual = parseInt(linha[F4E_SEMANA_ATU - 1]) || 1;
    var gestorEmail = String(linha[F4E_GESTOR_EMAIL - 1]).trim();
    var sequencia   = [];
    try { sequencia = JSON.parse(String(linha[F4E_SEQUENCIA - 1])); }
    catch(e) { continue; }

    var ehImpl  = F4_SEMANAS_IMPL.indexOf(semanaAtual) >= 0;
    var pilula  = (!ehImpl && semanaAtual <= sequencia.length) ? sequencia[semanaAtual - 1] : null;
    var conceito = pilula ? pilula.titulo : 'o que praticou nas últimas semanas';

    // Verifica inatividade (2+ semanas sem pílula)
    _f4_verificarInatividade(wsEnv, i, nome, email, gestorEmail, semanaAtual, dados);

    var wppFoneQ = String(linha[F4E_WHATSAPP - 1] || '').trim();

    try {
      _f4_despacharQuinta(nome, email, wppFoneQ, semanaAtual, conceito, ehImpl);
      wsEnv.getRange(i + 1, F4E_ULT_EVID).setValue(hoje);
      // Avança semana (após quinta — ciclo completo da semana)
      wsEnv.getRange(i + 1, F4E_SEMANA_ATU).setValue(semanaAtual + 1);
      Logger.log('✅ Qui S' + semanaAtual + ' → ' + email);
    } catch(e) {
      Logger.log('❌ Qui: ' + email + ' | ' + e.message);
    }

    // Check-in final: semana 14 na quinta → avisa gestor para agendar
    if (semanaAtual === 14 && gestorEmail) {
      _f4_enviarEmailGestorCheckinFinal(gestorEmail, nome);
    }

    Utilities.sleep(500);
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURAR TRIGGERS (execute uma vez manualmente)
// ═══════════════════════════════════════════════════════════════════════════════
function configurarTriggersFase4() {
  // Remove triggers antigos
  ScriptApp.getProjectTriggers().forEach(function(t) {
    var fn = t.getHandlerFunction();
    if (fn === 'triggerSegundaFase4' || fn === 'triggerQuintaFase4' || fn === 'triggerSemanalFase4') {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Trigger de segunda — 8h (pílula)
  ScriptApp.newTrigger('triggerSegundaFase4')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(8)
    .create();

  // Trigger de quinta — 8h (evidência)
  ScriptApp.newTrigger('triggerQuintaFase4')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.THURSDAY)
    .atHour(8)
    .create();

  SpreadsheetApp.getUi().alert(
    'Triggers configurados!\n' +
    '📧 Segunda 8h → E-mail de pílula\n' +
    ' Quinta 8h  → E-mail de evidência'
  );
}

// Alias para compatibilidade
function configurarTriggerFase4() { configurarTriggersFase4(); }


// ═══════════════════════════════════════════════════════════════════════════════
// CRIAR ESTRUTURA DE ABAS (execute uma vez)
// ═══════════════════════════════════════════════════════════════════════════════
function criarEstruturaFase4() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Trilhas (v2: 11 colunas)
  var _TRI_HEADERS = ['Email','Competência','Nível Entrada','Semana','Tipo Semana',
    'Título da Pílula','URL Moodle','Descrição Breve','Descritor Foco','Fonte','Status'];
  var wsTri = ss.getSheetByName(F4_ABA_TRILHAS);
  if (!wsTri) {
    wsTri = ss.insertSheet(F4_ABA_TRILHAS);
    wsTri.getRange(1, 1, 1, _TRI_HEADERS.length).setValues([_TRI_HEADERS])
      .setFontWeight('bold').setBackground('#0f2b54').setFontColor('#fff');
    wsTri.setFrozenRows(1);
    wsTri.setColumnWidths(1, _TRI_HEADERS.length, 150);
    wsTri.setColumnWidth(8, 300); // Descrição Breve
  } else if (wsTri.getLastColumn() < _TRI_HEADERS.length) {
    // Migrar headers antigos para v2
    wsTri.getRange(1, 1, 1, _TRI_HEADERS.length).setValues([_TRI_HEADERS])
      .setFontWeight('bold').setBackground('#0f2b54').setFontColor('#fff');
  }

  // Fase4_Envios
  if (!ss.getSheetByName(F4_ABA_ENVIOS)) {
    var wsEnv = ss.insertSheet(F4_ABA_ENVIOS);
    wsEnv.appendRow(['Nome','E-mail','Cargo','Data Início','Semana Atual','Último Pílula','Último Evidência','Status','Sequência (JSON)','Contrato (JSON)','Gestor E-mail','WhatsApp']);
    wsEnv.getRange(1,1,1,11).setFontWeight('bold').setBackground('#0f2b54').setFontColor('#fff');
    wsEnv.setFrozenRows(1);
    wsEnv.setColumnWidths(9,2,400);
  }

  // Capacitacao
  if (!ss.getSheetByName(F4_ABA_CAPACITACAO)) {
    var wsCap = ss.insertSheet(F4_ABA_CAPACITACAO);
    wsCap.appendRow(['E-mail','Semana','Tipo','Pílula OK','Evidência','Data Registro','Pontos']);
    wsCap.getRange(1,1,1,7).setFontWeight('bold').setBackground('#0f2b54').setFontColor('#fff');
    wsCap.setFrozenRows(1);
    wsCap.setColumnWidth(5, 400);
  }

  SpreadsheetApp.getUi().alert(
    'Estrutura da Fase 4 criada!\n\n' +
    '1. Preencha a aba "Trilhas" com os cursos do Moodle.\n' +
    '2. Execute configurarTriggersFase4() para ativar os dois triggers.\n' +
    '3. Use "Iniciar Fase 4" no painel para cada cliente.\n\n' +
    'Abas criadas: Trilhas · Fase4_Envios · Capacitacao'
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// STATUS PARA O PAINEL
// ═══════════════════════════════════════════════════════════════════════════════
function getStatusFase4() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var wsEnv = ss.getSheetByName(F4_ABA_ENVIOS);
  if (!wsEnv) return { ativos:0, concluidos:0, pausados:0, total:0 };

  var dados = wsEnv.getDataRange().getValues();
  var ativos=0, concluidos=0, pausados=0;
  for (var i=1; i<dados.length; i++) {
    var s = String(dados[i][F4E_STATUS-1]).trim();
    if (s==='Ativo')     ativos++;
    if (s==='Concluído') concluidos++;
    if (s==='Pausado')   pausados++;
  }
  return { ativos:ativos, concluidos:concluidos, pausados:pausados, total:ativos+concluidos+pausados };
}


// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRAR EVIDÊNCIA — chamado pelo WebApp (?view=evidencia)
// ═══════════════════════════════════════════════════════════════════════════════
function registrarEvidenciaFase4(email, semana, textoAcao, textoResultado) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var wsEnv = ss.getSheetByName(F4_ABA_ENVIOS);
  if (!wsEnv) return { ok: false, msg: 'Sistema indisponível.' };

  // Valida que colaborador está ativo
  var dados = wsEnv.getDataRange().getValues();
  var encontrado = false;
  for (var i=1; i<dados.length; i++) {
    if (String(dados[i][F4E_EMAIL-1]).trim().toLowerCase() === email.toLowerCase()
        && String(dados[i][F4E_STATUS-1]).trim() === 'Ativo') {
      encontrado = true;
      break;
    }
  }
  if (!encontrado) return { ok: false, msg: 'Colaborador não encontrado ou inativo.' };

  var evidencia = JSON.stringify({ acao: textoAcao, resultado: textoResultado });
  _f4_registrarCapacitacao(ss, email, semana, 'evidencia', true, evidencia, 5);

  return { ok: true, msg: 'Evidência registrada! +5 pontos.' };
}


// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS — LEITURA DE DADOS
// ═══════════════════════════════════════════════════════════════════════════════

function _f4_garantirAbas(ss) {
  var wsEnv = ss.getSheetByName(F4_ABA_ENVIOS);
  if (!wsEnv) {
    wsEnv = ss.insertSheet(F4_ABA_ENVIOS);
    wsEnv.appendRow(['Nome','E-mail','Cargo','Data Início','Semana Atual','Último Pílula','Último Evidência','Status','Sequência (JSON)','Contrato (JSON)','Gestor E-mail','WhatsApp']);
    wsEnv.getRange(1,1,1,11).setFontWeight('bold').setBackground('#0f2b54').setFontColor('#fff');
    wsEnv.setFrozenRows(1);
    wsEnv.setColumnWidths(9,2,400);
  }
  // Cria Capacitacao se não existir
  if (!ss.getSheetByName(F4_ABA_CAPACITACAO)) {
    var wsCap = ss.insertSheet(F4_ABA_CAPACITACAO);
    wsCap.appendRow(['E-mail','Semana','Tipo','Pílula OK','Evidência','Data Registro','Pontos']);
    wsCap.getRange(1,1,1,7).setFontWeight('bold').setBackground('#0f2b54').setFontColor('#fff');
    wsCap.setFrozenRows(1);
    wsCap.setColumnWidth(5, 400);
  }
  return wsEnv;
}

// Lê ciclo ativo mais recente → mapa cargo_lowercase → ID competência foco
function _f4_lerMapaFoco(wsCic) {
  var dados = wsCic.getDataRange().getValues();
  var melhor = null, melhorData = null;
  for (var i=1; i<dados.length; i++) {
    if (String(dados[i][F4CI_STATUS-1]).trim().toLowerCase() !== 'ativo') continue;
    var d = new Date(String(dados[i][F4CI_DATA-1]));
    if (!melhorData || d > melhorData) { melhorData = d; melhor = dados[i]; }
  }
  if (!melhor) return {};
  var obj = {};
  try { obj = JSON.parse(String(melhor[F4CI_COMPETENCIAS-1]).trim()); } catch(e) { return {}; }
  var mapa = {};
  for (var cargo in obj) mapa[cargo.trim().toLowerCase()] = String(obj[cargo]).trim();
  return mapa;
}

// ID → Nome de competência
function _f4_lerDictCompetencias(ss) {
  var mapaV2 = _lerBaseCompetenciasV2(ss);
  var dict   = {};
  var keys   = Object.keys(mapaV2);
  for (var i = 0; i < keys.length; i++) {
    var c = mapaV2[keys[i]];
    if (c.codigo && c.nome) dict[c.codigo] = c.nome;
  }
  return dict;
}

// Lê gaps: email → { nome, cargo, competencias[] }
function _f4_lerGaps(wsRes, emailAlvo) {
  var dados = wsRes.getDataRange().getValues();
  var map   = {};
  for (var i=1; i<dados.length; i++) {
    var l      = dados[i];
    var email  = String(l[F4R_EMAIL-1]).trim().toLowerCase();
    var nome   = String(l[F4R_NOME-1]).trim();
    var cargo  = String(l[F4R_CARGO-1]).trim();
    var idComp = String(l[F4R_ID_COMP-1]).trim().toUpperCase();
    var nomeCp = String(l[F4R_NOME_COMP-1]).trim();
    var nivel  = parseInt(l[F4R_NIVEL_IA4-1]) || 0;
    if (!email || !nomeCp || nivel <= 0) continue;
    if (emailAlvo && email !== emailAlvo.toLowerCase()) continue;
    if (!map[email]) map[email] = { nome:nome, cargo:cargo, competencias:[], whatsapp:'' };
    var jaEx = map[email].competencias.some(function(c){ return c.idComp===idComp; });
    if (!jaEx) map[email].competencias.push({ nome:nomeCp, nivel:nivel, idComp:idComp });
  }
  return map;
}

// Lê trilhas (v3: 12 colunas — inclui Nota Descritor)
function _f4_lerTrilhas(wsTri) {
  var dados = wsTri.getDataRange().getValues();
  var arr   = [];
  for (var i = 1; i < dados.length; i++) {
    var l = dados[i];
    if (!l[F4T_COMPETENCIA - 1]) continue;
    arr.push({
      email:        String(l[F4T_EMAIL - 1] || '').trim(),
      competencia:  String(l[F4T_COMPETENCIA - 1]).trim(),
      nivelEntrada: parseInt(l[F4T_NIVEL_ENTRADA - 1]) || 1,
      semana:       parseInt(l[F4T_SEMANA - 1]) || 1,
      tipoSemana:   String(l[F4T_TIPO_SEMANA - 1] || '').trim(),
      titulo:       String(l[F4T_TITULO - 1] || '').trim(),
      url:          String(l[F4T_URL - 1] || '').trim(),
      descricao:    String(l[F4T_DESCRICAO - 1] || '').trim(),
      descritorFoco:String(l[F4T_DESCRITOR - 1] || '').trim(),
      notaDescritor:parseFloat(l[F4T_NOTA_DESC - 1]) || 0,
      fonte:        String(l[F4T_FONTE - 1] || '').trim(),
      status:       String(l[F4T_STATUS - 1] || 'pendente').trim()
    });
  }
  return arr;
}

function _f4_jaIniciado(wsEnv, email) {
  var dados = wsEnv.getDataRange().getValues();
  for (var i=1; i<dados.length; i++) {
    if (String(dados[i][F4E_EMAIL-1]).trim().toLowerCase() === email.toLowerCase()) return true;
  }
  return false;
}

// Registra linha na aba Capacitacao
function _f4_registrarCapacitacao(ss, email, semana, tipo, pilulaOk, evidencia, pontos) {
  var wsCap = ss.getSheetByName(F4_ABA_CAPACITACAO);
  if (!wsCap) return;
  wsCap.appendRow([email, semana, tipo, pilulaOk, evidencia, new Date(), pontos]);
}

// Verifica inatividade: 2+ semanas sem pílula → nudge + alerta gestor
function _f4_verificarInatividade(wsEnv, idx, nome, email, gestorEmail, semanaAtual, dados) {
  var ultPilula = dados[idx][F4E_ULTIMO_ENV-1];
  if (!ultPilula) return;

  var diasSem = (new Date() - new Date(ultPilula)) / (1000 * 60 * 60 * 24);
  if (diasSem < 14) return;

  Logger.log('⚠️ Inatividade detectada: ' + email + ' (' + Math.round(diasSem) + ' dias)');

  // Nudge para o colaborador — e-mail + WPP
  var html = _f4_wrapEmail(
    '<p style="color:#0f2b54;font-size:15px;margin:0 0 8px">Olá, <strong>' + nome.split(' ')[0] + '</strong>!</p>' +
    '<p style="color:#64748b;font-size:14px;line-height:1.6;margin:0 0 20px">Notamos que faz mais de 2 semanas sem atividade na sua trilha. Estamos aqui para apoiar — qualquer dificuldade, fale com seu gestor ou acesse o Tutor IA.</p>' +
    '<a href="https://script.google.com/macros/s/AKfycbw8amze2KniDCPGsBnJnotNgZzeFNIvqIHqePH2_44XkXEH12WaLH_SABKPY73XYgRTjQ/exec?view=dashboard" style="display:inline-block;background:linear-gradient(135deg,#34c5cc,#2ba8af);color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:600;font-size:14px">Retomar minha trilha →</a>'
  );
  GmailApp.sendEmail(email, 'Sua trilha está esperando por você — Vertho', '', { htmlBody: html, name: 'Vertho — Mentor IA' });
  // WPP (complementar ao e-mail, não substitui)
  var wppInativ = dados[idx][F4E_WHATSAPP - 1] ? String(dados[idx][F4E_WHATSAPP - 1]).trim() : '';
  if (wppInativ) _wpp_enviarTexto(wppInativ, _wpp_textoInatividade(nome));

  // Alerta para o gestor
  if (gestorEmail) {
    var htmlG = _f4_wrapEmail(
      '<p style="color:#0f2b54;font-size:15px;margin:0 0 8px">Atenção, gestor(a)!</p>' +
      '<p style="color:#64748b;font-size:14px;line-height:1.6;margin:0 0 20px"><strong>' + nome + '</strong> está há mais de 2 semanas sem acessar a trilha de desenvolvimento (Semana atual: ' + semanaAtual + ').</p>' +
      '<p style="color:#64748b;font-size:14px">Recomendamos uma conversa breve para entender possíveis obstáculos.</p>'
    );
    GmailApp.sendEmail(gestorEmail, 'Alerta de inatividade — ' + nome + ' | Vertho', '', { htmlBody: htmlG, name: 'Vertho — Mentor IA' });
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// MOTOR DE ATRIBUIÇÃO COM FALLBACK (doc seção 8.2)
// Retorna { sequencia: [], fallback: null | 'generico' | 'sem_conteudo' }
// ═══════════════════════════════════════════════════════════════════════════════
function _f4_montarSequencia(comps, trilhas, nomeFoco, emailColab) {
  var compSel = null, nivelSel = null, fallback = null;

  // 1. Gap na competência foco (N1 ou N2)
  if (nomeFoco) {
    var focoNorm = nomeFoco.trim().toLowerCase();
    for (var i=0; i<comps.length; i++) {
      if (comps[i].nome.trim().toLowerCase() === focoNorm && comps[i].nivel <= 2) {
        compSel = comps[i].nome; nivelSel = comps[i].nivel;
        Logger.log('→ Foco: ' + compSel + ' N' + nivelSel);
        break;
      }
    }
  }

  // 2. Menor nota com gap (≤ N3)
  if (!compSel) {
    var comGap = comps.filter(function(c){ return c.nivel<=3; });
    comGap.sort(function(a,b){ return a.nivel-b.nivel; });
    if (comGap.length > 0) {
      compSel = comGap[0].nome; nivelSel = comGap[0].nivel;
      Logger.log('→ Menor nota: ' + compSel + ' N' + nivelSel);
    }
  }

  if (!compSel) return { sequencia: [], fallback: 'sem_gap' };

  // 3. Busca pílulas da trilha do colaborador (email + competência)
  var emailNorm = (emailColab || '').trim().toLowerCase();
  var compNorm = compSel.trim().toLowerCase();

  var match = trilhas.filter(function(t) {
    var matchComp = t.competencia.trim().toLowerCase() === compNorm;
    var matchEmail = emailNorm ? (t.email.trim().toLowerCase() === emailNorm) : true;
    return matchComp && matchEmail;
  });

  // Fallback: competência sem filtro de email (trilhas genéricas)
  if (match.length === 0) {
    match = trilhas.filter(function(t) {
      return t.competencia.trim().toLowerCase() === compNorm;
    });
    if (match.length > 0) {
      fallback = 'generico — ' + compSel + ' (sem trilha individual, usando genérico)';
      Logger.log('⚠️ Fallback genérico: ' + compSel);
    }
  }

  // Sem conteúdo — flag para admin
  if (match.length === 0) {
    Logger.log('❌ Sem conteúdo para: ' + compSel);
    return { sequencia: [], fallback: 'sem_conteudo' };
  }

  match.sort(function(a,b){ return a.semana-b.semana; });

  var seq = [];
  for (var m=0; m<match.length && seq.length<F4_TOTAL_SEMANAS; m++) {
    // Insere semanas de implementação na posição certa
    var numSemana = seq.length + 1;
    // Pula para a próxima pílula se a semana atual é de implementação
    while (F4_SEMANAS_IMPL.indexOf(numSemana) >= 0) {
      seq.push({ semana:numSemana, tipo:'implementacao', competencia:compSel });
      numSemana++;
      if (numSemana > F4_TOTAL_SEMANAS) break;
    }
    if (numSemana > F4_TOTAL_SEMANAS) break;
    seq.push({
      semana:      numSemana,
      tipo:        'pilula',
      competencia: compSel,
      nivel:       nivelSel,
      titulo:      match[m].titulo,
      url:         match[m].url,
      descricao:   match[m].descricao
    });
  }

  return { sequencia: seq, fallback: fallback };
}


// ═══════════════════════════════════════════════════════════════════════════════
// CONTRATO PEDAGÓGICO (doc seção 2.2)
// ═══════════════════════════════════════════════════════════════════════════════
function _f4_gerarContrato(colab, nomeFoco, sequencia) {
  var pGap = colab.competencias.filter(function(c){
    return nomeFoco && c.nome.trim().toLowerCase() === nomeFoco.trim().toLowerCase();
  });
  var gapDescricao = pGap.length > 0 ? nomeFoco + ' (Nível ' + pGap[0].nivel + ')' : nomeFoco || 'competência principal';

  return {
    competencia: nomeFoco || (sequencia.length > 0 ? sequencia[0].competencia : ''),
    foco: gapDescricao,
    meta_aprendizagem: 'Ao final das 14 semanas, você será capaz de demonstrar ' + gapDescricao + ' de forma consistente em situações do cotidiano escolar.',
    criterio_conclusao: { pilulas_min: 9, evidencias_min: 8, checkins: 3 },
    evidencia_transferencia: 'Pelo menos 3 registros mostrando aplicação prática com resultado observado.',
    duracao: '14 semanas | ~30 min/semana | 100% online + check-ins'
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// E-MAILS
// ═══════════════════════════════════════════════════════════════════════════════

// Template base (wrapper de todos os e-mails)
function _f4_wrapEmail(conteudo) {
  return '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f4f7fb;border-radius:12px;overflow:hidden">'
    + '<div style="background:#0f2b54;padding:18px 32px;display:flex;align-items:center;gap:10px">'
    + '<span style="color:#34c5cc;font-size:19px;font-weight:700;letter-spacing:.5px">Vertho</span>'
    + '<span style="color:#fff;font-size:12px;opacity:.55">Mentor IA</span>'
    + '</div>'
    + '<div style="padding:30px 32px">'
    + conteudo
    + '<p style="color:#94a3b8;font-size:11px;text-align:center;margin-top:28px;border-top:1px solid #e2e8f0;padding-top:16px">Vertho © 2026 — Plataforma de Desenvolvimento de Competências</p>'
    + '</div>'
    + '</div>';
}

// Barra de progresso reutilizável
function _f4_barraProgresso(semana) {
  var pct = Math.round(semana / F4_TOTAL_SEMANAS * 100);
  return '<div style="background:#fff;border-radius:10px;padding:14px 20px;border:1px solid #e2e8f0;margin-top:20px">'
    + '<p style="font-size:11px;color:#64748b;margin:0 0 6px">Progresso — Semana ' + semana + ' de ' + F4_TOTAL_SEMANAS + '</p>'
    + '<div style="display:flex;align-items:center;gap:10px">'
    + '<div style="flex:1;height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden">'
    + '<div style="width:' + pct + '%;height:100%;background:linear-gradient(90deg,#34c5cc,#9e4edd);border-radius:4px"></div>'
    + '</div>'
    + '<span style="font-size:12px;color:#64748b;white-space:nowrap">' + pct + '%</span>'
    + '</div>'
    + '</div>';
}

// URL base do WebApp
var F4_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbw8amze2KniDCPGsBnJnotNgZzeFNIvqIHqePH2_44XkXEH12WaLH_SABKPY73XYgRTjQ/exec';

// ── E-mail de boas-vindas com contrato pedagógico ─────────────────────────────
function _f4_enviarEmailBoasVindas(nome, email, contrato, primeiraPilula) {
  var fn = nome.split(' ')[0];
  var corpo = '<p style="color:#0f2b54;font-size:15px;margin:0 0 4px">Olá, <strong>' + fn + '</strong>!</p>'
    + '<p style="color:#64748b;font-size:13px;margin:0 0 20px">Sua trilha de desenvolvimento está pronta. Confira seu contrato pedagógico:</p>'
    + '<div style="background:#fff;border-radius:12px;padding:20px 24px;border:2px solid #34c5cc;margin-bottom:20px;font-family:monospace;font-size:13px;line-height:1.7;color:#1e293b">'
    + '<strong>SUA TRILHA DE DESENVOLVIMENTO</strong><br><br>'
    + 'Competência: ' + (contrato.competencia || '—') + '<br>'
    + 'Foco: ' + (contrato.foco || '—') + '<br><br>'
    + '<strong>META DE APRENDIZAGEM:</strong><br>'
    + '"' + contrato.meta_aprendizagem + '"<br><br>'
    + '<strong>CRITÉRIO DE CONCLUSÃO:</strong><br>'
    + '✅ Completar pelo menos ' + contrato.criterio_conclusao.pilulas_min + ' de 11 pílulas<br>'
    + '✅ Registrar ' + contrato.criterio_conclusao.evidencias_min + ' evidências de aplicação<br>'
    + '✅ Participar dos 3 check-ins com seu gestor<br><br>'
    + '<strong>EVIDÊNCIA MÍNIMA:</strong><br>'
    + contrato.evidencia_transferencia + '<br><br>'
    + contrato.duracao
    + '</div>'
    + (primeiraPilula && primeiraPilula.tipo === 'pilula' ? (
      '<div style="background:#fff;border-radius:10px;padding:18px 20px;border:1px solid #e2e8f0;margin-bottom:16px">'
      + '<p style="font-size:11px;color:#34c5cc;font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin:0 0 6px">Primeira pílula — Semana 1</p>'
      + (primeiraPilula.url && primeiraPilula.url.indexOf('http') === 0
          ? '<a href="' + primeiraPilula.url + '" style="display:block;font-size:16px;font-weight:600;color:#0f2b54;margin:0 0 12px;text-decoration:underline">' + primeiraPilula.titulo + '</a>'
          : '<p style="font-size:16px;font-weight:600;color:#0f2b54;margin:0 0 12px">' + primeiraPilula.titulo + '</p>')
      + (primeiraPilula.url && primeiraPilula.url.indexOf('http') === 0
          ? '<a href="' + primeiraPilula.url + '" style="display:inline-block;background:linear-gradient(135deg,#34c5cc,#2ba8af);color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:13px">Acessar no Moodle →</a>'
          : '<p style="font-size:12px;color:#94a3b8;font-style:italic">URL do Moodle ainda não configurada.</p>')
      + '</div>'
    ) : '')
    + '<p style="color:#64748b;font-size:13px">Você receberá um e-mail toda <strong>segunda-feira</strong> com a pílula da semana, e na <strong>quinta-feira</strong> para registrar sua evidência de aplicação.</p>';

  GmailApp.sendEmail(email,
    'Sua trilha de desenvolvimento começou! — Vertho',
    '',
    { htmlBody: _f4_wrapEmail(corpo), name: 'Vertho — Mentor IA' }
  );
}

// ── Segunda-feira: pílula normal ──────────────────────────────────────────────
function _f4_enviarEmailPilula(nome, email, semana, pilula) {
  var fn    = nome.split(' ')[0];
  var corpo = '<p style="color:#0f2b54;font-size:15px;margin:0 0 4px">Olá, <strong>' + fn + '</strong>!</p>'
    + '<p style="color:#64748b;font-size:13px;margin:0 0 20px">Semana <strong>' + semana + '</strong> de <strong>' + F4_TOTAL_SEMANAS + '</strong> — sua pílula chegou!</p>'
    + '<div style="background:#fff;border-radius:12px;padding:22px 24px;border:1px solid #e2e8f0;margin-bottom:16px">'
    + '<p style="font-size:11px;color:#34c5cc;font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin:0 0 4px">Competência desta semana</p>'
    + '<p style="font-size:19px;font-weight:700;color:#0f2b54;margin:0 0 4px">' + pilula.competencia + '</p>'
    + '<span style="display:inline-block;background:#e0f7f8;color:#0f2b54;font-size:11px;font-weight:700;padding:2px 10px;border-radius:20px;margin-bottom:14px">Nível ' + (pilula.nivel||'') + '</span>'
    + (pilula.url && pilula.url.indexOf('http') === 0
        ? '<a href="' + pilula.url + '" style="display:block;font-size:16px;font-weight:600;color:#0f2b54;margin:0 0 6px;text-decoration:underline">' + pilula.titulo + '</a>'
        : '<p style="font-size:16px;font-weight:600;color:#1e293b;margin:0 0 6px">' + pilula.titulo + '</p>')
    + (pilula.descricao ? '<p style="color:#64748b;font-size:13px;line-height:1.6;margin:0 0 18px">' + pilula.descricao + '</p>' : '')
    + (pilula.url && pilula.url.indexOf('http') === 0
        ? '<a href="' + pilula.url + '" style="display:inline-block;background:linear-gradient(135deg,#34c5cc,#2ba8af);color:#fff;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:600;font-size:14px">Acessar pílula no Moodle →</a>'
        : '<p style="font-size:12px;color:#94a3b8;font-style:italic">URL do Moodle ainda não configurada.</p>')
    + '</div>'
    + '<p style="color:#64748b;font-size:13px">Assista, leia ou ouça. Depois <strong>tente aplicar durante a semana</strong>.</p>'
    + '<p style="color:#64748b;font-size:13px"> Dúvidas? O <strong>Tutor IA</strong> está disponível hoje e amanhã (terça): <a href="' + F4_WEBAPP_URL + '?view=tutor" style="color:#34c5cc">acessar tutor</a></p>'
    + _f4_barraProgresso(semana);

  GmailApp.sendEmail(email,
    'Semana ' + semana + ' | ' + pilula.competencia + ' — Vertho',
    '',
    { htmlBody: _f4_wrapEmail(corpo), name: 'Vertho — Mentor IA' }
  );
}

// ── Segunda-feira: semana de implementação ────────────────────────────────────
function _f4_enviarEmailImplementacao(nome, email, semana) {
  var fn = nome.split(' ')[0];

  // Buscar micro-desafio da aba Trilhas
  var desafio = _f4_buscarMicroDesafio(email, semana);
  var desafioHtml = '';
  if (desafio.titulo) {
    desafioHtml = '<div style="background:#fffbeb;border-radius:12px;padding:18px 22px;border-left:4px solid #f59e0b;margin-bottom:16px">'
      + '<p style="font-size:15px;font-weight:700;color:#0f2b54;margin:0 0 8px">Seu desafio desta semana:</p>'
      + '<p style="color:#334155;font-size:14px;line-height:1.6;margin:0 0 10px">' + _ia4Safe(desafio.descricao || desafio.titulo) + '</p>'
      + (desafio.descritor ? '<p style="color:#64748b;font-size:12px;margin:0">Descritor foco: <strong>' + _ia4Safe(desafio.descritor) + '</strong></p>' : '')
      + '</div>';
  }

  var corpo = '<p style="color:#0f2b54;font-size:15px;margin:0 0 4px">Ol\u00e1, <strong>' + fn + '</strong>!</p>'
    + '<div style="background:#fff;border-radius:12px;padding:22px 24px;border:2px solid #f59e0b;margin-bottom:16px;text-align:center">'
    + '<p style="font-size:18px;font-weight:700;color:#0f2b54;margin:0 0 8px">Semana ' + semana + ' \u2014 Hora de Praticar!</p>'
    + '<p style="color:#64748b;font-size:14px;line-height:1.6;margin:0">N\u00e3o h\u00e1 conte\u00fado novo esta semana. Seu objetivo \u00e9 <strong>aplicar na pr\u00e1tica</strong> o que aprendeu.</p>'
    + '</div>'
    + desafioHtml
    + '<p style="color:#64748b;font-size:13px;line-height:1.6">Na quinta-feira, voc\u00ea vai registrar como foi a experi\u00eancia. Pode ser um texto curto ou \u00e1udio de 1 minuto.</p>'
    + _f4_barraProgresso(semana);

  GmailApp.sendEmail(email,
    'Semana ' + semana + ' \u2014 Hora de praticar! | Vertho',
    '',
    { htmlBody: _f4_wrapEmail(corpo), name: 'Vertho \u2014 Mentor IA' }
  );
}

/**
 * Busca o micro-desafio da aba Trilhas para a semana de aplicação.
 */
function _f4_buscarMicroDesafio(email, semana) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var wsTri = ss.getSheetByName(F4_ABA_TRILHAS);
  if (!wsTri || wsTri.getLastRow() < 2) return {};

  var dados = wsTri.getDataRange().getValues();
  var emailNorm = String(email || '').trim().toLowerCase();

  for (var i = 1; i < dados.length; i++) {
    var rowEmail = String(dados[i][F4T_EMAIL - 1] || '').trim().toLowerCase();
    var rowSemana = parseInt(dados[i][F4T_SEMANA - 1]) || 0;
    var rowTipo = String(dados[i][F4T_TIPO_SEMANA - 1] || '').trim().toLowerCase();

    if (rowEmail === emailNorm && rowSemana === semana && rowTipo === 'aplicacao') {
      return {
        titulo: String(dados[i][F4T_TITULO - 1] || '').trim(),
        descricao: String(dados[i][F4T_DESCRICAO - 1] || '').trim(),
        descritor: String(dados[i][F4T_DESCRITOR - 1] || '').trim()
      };
    }
  }
  return {};
}

// ── Quinta-feira: solicita evidência (semana normal) ─────────────────────────
function _f4_enviarEmailEvidencia(nome, email, semana, conceito) {
  var fn    = nome.split(' ')[0];
  var urlEv = F4_WEBAPP_URL + '?view=evidencia&semana=' + semana + '&email=' + encodeURIComponent(email);
  var corpo = '<p style="color:#0f2b54;font-size:15px;margin:0 0 4px">Olá, <strong>' + fn + '</strong>!</p>'
    + '<p style="color:#64748b;font-size:13px;margin:0 0 20px">Como foi a semana? Você tentou aplicar <strong>' + conceito + '</strong>?</p>'
    + '<div style="background:#fff;border-radius:12px;padding:22px 24px;border:1px solid #e2e8f0;margin-bottom:16px">'
    + '<p style="font-size:15px;font-weight:600;color:#0f2b54;margin:0 0 6px"> Registre em 2 minutos</p>'
    + '<p style="color:#64748b;font-size:13px;line-height:1.5;margin:0 0 16px">Pode ser por texto ou áudio (1 min). Sua reflexão ajuda a consolidar o aprendizado.</p>'
    + '<a href="' + urlEv + '" style="display:inline-block;background:linear-gradient(135deg,#34c5cc,#2ba8af);color:#fff;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:600;font-size:14px">Registrar evidência →</a>'
    + '</div>'
    + _f4_barraProgresso(semana);

  GmailApp.sendEmail(email,
    'Semana ' + semana + ' — Registre sua evidência | Vertho',
    '',
    { htmlBody: _f4_wrapEmail(corpo), name: 'Vertho — Mentor IA' }
  );
}

// ── Quinta-feira: evidência de implementação ─────────────────────────────────
function _f4_enviarEmailEvidenciaImpl(nome, email, semana) {
  var fn    = nome.split(' ')[0];
  var urlEv = F4_WEBAPP_URL + '?view=evidencia&semana=' + semana + '&email=' + encodeURIComponent(email);
  var corpo = '<p style="color:#0f2b54;font-size:15px;margin:0 0 4px">Olá, <strong>' + fn + '</strong>!</p>'
    + '<p style="color:#64748b;font-size:13px;margin:0 0 20px">Semana de prática — como foi? Conseguiu aplicar algo das últimas semanas?</p>'
    + '<div style="background:#fff;border-radius:12px;padding:22px 24px;border:1px solid #e2e8f0;margin-bottom:16px">'
    + '<p style="font-size:13px;color:#64748b;margin:0 0 16px">Lembre-se: a mudança acontece na prática, não no vídeo. </p>'
    + '<a href="' + urlEv + '" style="display:inline-block;background:linear-gradient(135deg,#34c5cc,#2ba8af);color:#fff;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:600;font-size:14px">Registrar evidência →</a>'
    + '</div>'
    + _f4_barraProgresso(semana);

  GmailApp.sendEmail(email,
    'Semana ' + semana + ' (implementação) — Registre | Vertho',
    '',
    { htmlBody: _f4_wrapEmail(corpo), name: 'Vertho — Mentor IA' }
  );
}

// ── Conclusão da Fase 4 ───────────────────────────────────────────────────────
function _f4_enviarEmailConclusao(nome, email, gestorEmail) {
  var fn    = nome.split(' ')[0];
  var corpo = '<div style="text-align:center;padding:10px 0">'
    + '<p style="font-size:48px;margin:0 0 12px"></p>'
    + '<h2 style="color:#0f2b54;font-size:22px;margin:0 0 10px">Parabéns, ' + fn + '!</h2>'
    + '<p style="color:#64748b;font-size:14px;line-height:1.7;max-width:400px;margin:0 auto 20px">Você concluiu todas as <strong>' + F4_TOTAL_SEMANAS + ' semanas</strong> do plano de desenvolvimento. Em breve você receberá o convite para a <strong>Avaliação de Aprendizagem (Fase 5)</strong>.</p>'
    + '<div style="background:#e0f7f8;border-radius:10px;padding:14px 20px;display:inline-block">'
    + '<span style="color:#0f2b54;font-size:13px;font-weight:600">Próximo passo: Fase 5 — Avaliação de Aprendizagem</span>'
    + '</div>'
    + '</div>';

  GmailApp.sendEmail(email,
    'Parabéns! Você concluiu a Fase 4 — Vertho',
    '',
    { htmlBody: _f4_wrapEmail(corpo), name: 'Vertho — Mentor IA' }
  );

  // Informa gestor
  if (gestorEmail) {
    var corpoG = '<p style="color:#0f2b54;font-size:15px;margin:0 0 8px">Olá, gestor(a)!</p>'
      + '<p style="color:#64748b;font-size:14px;line-height:1.6"><strong>' + nome + '</strong> concluiu a Fase 4 de Capacitação e está pronto(a) para a Avaliação de Aprendizagem (Fase 5). O sistema enviará o convite em breve.</p>';
    GmailApp.sendEmail(gestorEmail, nome + ' concluiu a Fase 4 | Vertho', '', { htmlBody: _f4_wrapEmail(corpoG), name: 'Vertho — Mentor IA' });
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// E-MAILS DO GESTOR (doc seção 5.5)
// ═══════════════════════════════════════════════════════════════════════════════

// Semana 0 — kickoff (chamado dentro de iniciarFase4)
function _f4_enviarEmailGestorKickoff(gestorEmail, qtdColaboradores) {
  var corpo = '<p style="color:#0f2b54;font-size:15px;margin:0 0 8px">Olá, gestor(a)!</p>'
    + '<p style="color:#64748b;font-size:14px;line-height:1.6;margin:0 0 16px">O ciclo da Fase 4 começa amanhã com <strong>' + qtdColaboradores + ' colaborador(es)</strong>. Seus 3 check-ins no ciclo:</p>'
    + '<div style="background:#fff;border-radius:10px;padding:18px 22px;border:1px solid #e2e8f0;margin-bottom:16px">'
    + '<table style="width:100%;border-collapse:collapse;font-size:13px">'
    + '<tr style="color:#34c5cc;font-weight:700"><td style="padding:4px 8px">Semana</td><td style="padding:4px 8px">Formato</td><td style="padding:4px 8px">Duração</td></tr>'
    + '<tr><td style="padding:6px 8px;border-top:1px solid #f1f5f9">● Semana 1</td><td style="padding:6px 8px;border-top:1px solid #f1f5f9">Grupo (4-5 por competência)</td><td style="padding:6px 8px;border-top:1px solid #f1f5f9">30 min</td></tr>'
    + '<tr><td style="padding:6px 8px;border-top:1px solid #f1f5f9">● Semana 7</td><td style="padding:6px 8px;border-top:1px solid #f1f5f9">Grupo (4-5 por competência)</td><td style="padding:6px 8px;border-top:1px solid #f1f5f9">30 min</td></tr>'
    + '<tr><td style="padding:6px 8px;border-top:1px solid #f1f5f9">● Semana 14</td><td style="padding:6px 8px;border-top:1px solid #f1f5f9">Individual (1 a 1)</td><td style="padding:6px 8px;border-top:1px solid #f1f5f9">15 min</td></tr>'
    + '</table>'
    + '</div>'
    + '<p style="color:#64748b;font-size:13px">Os roteiros de cada check-in serão enviados na semana correspondente.</p>';

  GmailApp.sendEmail(gestorEmail,
    'Fase 4 começa amanhã — seus 3 check-ins | Vertho',
    '',
    { htmlBody: _f4_wrapEmail(corpo), name: 'Vertho — Mentor IA' }
  );
}

// Semanas 1 e 7 — check-in em grupo (chamado pelo trigger de segunda)
function _f4_enviarEmailGestorCheckin(gestorEmail, semana, nomeColab, wsEnv, dados) {
  // Coleta todos os colaboradores ativos na mesma semana para sugerir grupos
  var listaColab = [];
  for (var i=1; i<dados.length; i++) {
    if (String(dados[i][F4E_STATUS-1]).trim() === 'Ativo'
        && String(dados[i][F4E_GESTOR_EMAIL-1]).trim().toLowerCase() === gestorEmail.toLowerCase()) {
      listaColab.push(String(dados[i][F4E_NOME-1]).trim());
    }
  }

  var isMeio = semana === 7;
  var roteiro = isMeio
    ? '<strong>Roteiro — Check-in de Meio (Sem. 7, 30 min):</strong><br>'
      + '• Abertura (5 min): "Estamos na metade. Vamos ver o que cada um tentou."<br>'
      + '• Rodada (20 min): O que tentou aplicar? Onde travou? Foco para próximas 7 semanas?<br>'
      + '• Fechamento (5 min): Incentivar troca entre pares.'
    : '<strong>Roteiro — Check-in Inicial (Sem. 1, 30 min):</strong><br>'
      + '• Abertura (5 min): "Nas próximas 14 semanas, vocês vão trabalhar uma competência."<br>'
      + '• Rodada (20 min): Principal ponto de desenvolvimento? Situação do dia a dia a melhorar? Evidência concreta na sem. 7?<br>'
      + '• Fechamento (5 min): "Estou aqui para apoiar."';

  var corpo = '<p style="color:#0f2b54;font-size:15px;margin:0 0 8px">Olá, gestor(a)!</p>'
    + '<p style="color:#64748b;font-size:14px;line-height:1.6;margin:0 0 16px">Esta semana é a hora do <strong>check-in ' + (isMeio ? 'de meio' : 'inicial') + '</strong> com sua equipe.</p>'
    + '<div style="background:#fff;border-radius:10px;padding:18px 22px;border:1px solid #e2e8f0;margin-bottom:16px;font-size:13px;color:#475569;line-height:1.8">'
    + roteiro
    + '</div>'
    + '<div style="background:#f8fafc;border-radius:10px;padding:14px 18px;border:1px solid #e2e8f0;margin-bottom:0">'
    + '<p style="font-size:12px;font-weight:700;color:#0f2b54;margin:0 0 6px">Colaboradores ativos (' + listaColab.length + '):</p>'
    + '<p style="font-size:13px;color:#64748b;margin:0">' + listaColab.join(' · ') + '</p>'
    + '</div>';

  GmailApp.sendEmail(gestorEmail,
    'Semana ' + semana + ' — Check-in ' + (isMeio ? 'de meio' : 'inicial') + ' | Vertho',
    '',
    { htmlBody: _f4_wrapEmail(corpo), name: 'Vertho — Mentor IA' }
  );
}

// Semana 14 — check-in final individual (chamado pelo trigger de quinta)
function _f4_enviarEmailGestorCheckinFinal(gestorEmail, nomeColab) {
  var corpo = '<p style="color:#0f2b54;font-size:15px;margin:0 0 8px">Olá, gestor(a)!</p>'
    + '<p style="color:#64748b;font-size:14px;line-height:1.6;margin:0 0 16px"><strong>' + nomeColab + '</strong> está na semana 14 — último check-in. Agende 15 minutos individuais.</p>'
    + '<div style="background:#fff;border-radius:10px;padding:18px 22px;border:1px solid #e2e8f0;margin-bottom:0;font-size:13px;color:#475569;line-height:1.8">'
    + '<strong>Roteiro — Check-in Final (15 min):</strong><br>'
    + '1. O que mudou na sua prática desde o início? (3 min)<br>'
    + '2. Conte uma situação concreta em que agiu diferente. (3 min)<br>'
    + '3. O que faria diferente se começasse de novo? (3 min)<br>'
    + '4. Na semana que vem começa a Fase 5 (avaliação por IA conversacional). Como se sente? (3 min)<br>'
    + '5. Registre: observação + comprometimento percebido. (3 min)'
    + '</div>';

  GmailApp.sendEmail(gestorEmail,
    'Check-in final — ' + nomeColab + ' (Semana 14) | Vertho',
    '',
    { htmlBody: _f4_wrapEmail(corpo), name: 'Vertho — Mentor IA' }
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// DESPACHADORES DE CANAL DUAL (e-mail + WhatsApp)
// Lógica: E-mail é sempre enviado. WhatsApp é adicional se número disponível.
// ═══════════════════════════════════════════════════════════════════════════════

// Boas-vindas: e-mail + WPP
function _f4_enviarBoasVindas(nome, email, wppFone, contrato, primeiraPilula) {
  _f4_enviarEmailBoasVindas(nome, email, contrato, primeiraPilula);
  if (wppFone) {
    try {
      _wpp_enviarTexto(wppFone, _wpp_textoBoasVindas(nome, contrato, primeiraPilula));
    } catch(e) { Logger.log('WPP boas-vindas erro: ' + e.message); }
  }
}

// Segunda-feira: pílula ou semana de implementação
function _f4_despacharSegunda(nome, email, wppFone, semana, pilula, ehImpl) {
  // E-mail (sempre)
  if (ehImpl) {
    _f4_enviarEmailImplementacao(nome, email, semana);
  } else if (pilula) {
    _f4_enviarEmailPilula(nome, email, semana, pilula);
  }

  // WhatsApp (adicional)
  if (wppFone) {
    try {
      var txt = ehImpl
        ? _wpp_textoImpl(nome, semana)
        : _wpp_textoPilula(nome, semana, pilula);
      _wpp_enviarTexto(wppFone, txt);
    } catch(e) { Logger.log('WPP segunda erro: ' + e.message); }
  }
}

// Quinta-feira: evidência (normal ou implementação)
function _f4_despacharQuinta(nome, email, wppFone, semana, conceito, ehImpl) {
  var urlEvid = F4_WEBAPP_URL + '?view=evidencia&semana=' + semana + '&email=' + encodeURIComponent(email);

  // E-mail (sempre)
  if (ehImpl) {
    _f4_enviarEmailEvidenciaImpl(nome, email, semana);
  } else {
    _f4_enviarEmailEvidencia(nome, email, semana, conceito);
  }

  // WhatsApp (adicional)
  if (wppFone) {
    try {
      var txt = ehImpl
        ? _wpp_textoEvidenciaImpl(nome, semana, urlEvid)
        : _wpp_textoEvidencia(nome, semana, conceito, urlEvid);
      _wpp_enviarTexto(wppFone, txt);
    } catch(e) { Logger.log('WPP quinta erro: ' + e.message); }
  }
}