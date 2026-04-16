// ═══════════════════════════════════════════════════════════════════════════════
// VERTHO — FASE 4: PAINEL DO COLABORADOR v1
// Arquivo: Fase4_Painel.gs — adicione ao projeto GAS
//
// Rota: ?view=painel&token=XXX  (requer OTP — token gerado pelo Fase4_OTP.gs)
// Dados: semana atual, pílula, progresso, pontos, streak, badges, meta coletiva
// Lê: Fase4_Envios + Capacitacao (dados reais) + Fase4_Envios gestor (meta coletiva)
// ═══════════════════════════════════════════════════════════════════════════════

// ── VIEWS_PROTEGIDAS no Main.gs: adicione 'painel' ao array ──────────────────
// var VIEWS_PROTEGIDAS = ['dashboard', 'tutor', 'painel'];

// Configurações de gamificação (espelha Fase4_Gamificacao quando existir)
var PAI_PTS_PILULA    = 5;
var PAI_PTS_EVIDENCIA = 5;
var PAI_PTS_QUIZ      = 10;
var PAI_PTS_STREAK    = 10;
var PAI_STREAK_CICLO  = 3;

var PAI_BADGES = [
  { id: 'explorador', nome: 'Explorador',  icon: '🌱', semanas: 5,  desc: 'Completou 5 semanas'  },
  { id: 'dedicado',   nome: 'Dedicado',    icon: '🔥', semanas: 10, desc: 'Completou 10 semanas' },
  { id: 'mestre',     nome: 'Mestre',      icon: '🏆', semanas: 14, desc: 'Concluiu a trilha'    }
];


// ═══════════════════════════════════════════════════════════════════════════════
// SERVE PAINEL — chamado pelo doGet (após OTP validado no Main.gs)
// ═══════════════════════════════════════════════════════════════════════════════
function servePainel(token) {
  // Usa createHtmlOutput + substituição direta do token e baseUrl
  // (evita o motor createTemplate que pode falhar com strings longas)
  var safeToken = String(token || '').replace(/[^a-zA-Z0-9\-]/g, '');
  var baseUrl = '';
  try { baseUrl = getURLWebApp() || ''; } catch(e2) {}
  var html = _pai_html()
    .replace('<?= token ?>', safeToken)
    .replace('<?= baseUrl ?>', baseUrl);
  return HtmlService.createHtmlOutput(html)
    .setTitle('Meu Painel \u2014 Vertho')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ── DIAGNÓSTICO: rode essa função no editor GAS para verificar ──────────────
function diagnosticoPainel() {
  try {
    var html = _pai_html();
    Logger.log('OK - _pai_html() retornou ' + html.length + ' caracteres');
    Logger.log('Tem <?= token ?>: ' + html.includes('<?= token ?>'));
    Logger.log('Tem spinner: ' + html.includes('Carregando seu painel'));
    Logger.log('Tem mostrarErro: ' + html.includes('mostrarErro'));
  } catch(e) {
    Logger.log('ERRO em _pai_html(): ' + e.message);
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// DADOS DO PAINEL — chamado pelo frontend via google.script.run
// Retorna tudo que o painel precisa em uma única chamada
// ═══════════════════════════════════════════════════════════════════════════════
function getDadosPainel(email) {
  email = String(email || '').toLowerCase().trim();
  if (!email) return { erro: 'Sessão inválida.' };

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var wsEnv = ss.getSheetByName(F4_ABA_ENVIOS);
  var wsCap = ss.getSheetByName(F4_ABA_CAPACITACAO);

  if (!wsEnv) return { erro: 'Sistema indisponível. Tente novamente.' };

  // ── 1. Dados básicos do colaborador ────────────────────────────────────────
  var dadosEnv   = wsEnv.getDataRange().getValues();
  var linhaColab = null;

  for (var i = 1; i < dadosEnv.length; i++) {
    if (String(dadosEnv[i][F4E_EMAIL - 1]).trim().toLowerCase() === email) {
      linhaColab = dadosEnv[i];
      break;
    }
  }

  if (!linhaColab) return { erro: 'Colaborador não encontrado.' };

  var nome        = String(linhaColab[F4E_NOME - 1]).trim();
  var cargo       = String(linhaColab[F4E_CARGO - 1]).trim();
  var semanaAtual = parseInt(linhaColab[F4E_SEMANA_ATU - 1]) || 1;
  var status      = String(linhaColab[F4E_STATUS - 1]).trim();
  var gestorEmail = String(linhaColab[F4E_GESTOR_EMAIL - 1] || '').trim();
  var sequencia   = [];
  var contrato    = {};
  try { sequencia = JSON.parse(String(linhaColab[F4E_SEQUENCIA - 1])); } catch(e) {}
  try { contrato  = JSON.parse(String(linhaColab[F4E_CONTRATO  - 1])); } catch(e) {}

  // ── 2. Pílula da semana atual ───────────────────────────────────────────────
  var pilula     = null;
  var ehImpl     = false;
  var proxPilula = null;

  for (var s = 0; s < sequencia.length; s++) {
    var item = sequencia[s];
    if (item.semana === semanaAtual) {
      if (item.tipo === 'implementacao') { ehImpl = true; }
      else { pilula = item; }
    }
    // Próxima pílula real (não impl)
    if (item.semana > semanaAtual && item.tipo === 'pilula' && !proxPilula) {
      proxPilula = item;
    }
  }

  // ── 3. Pontos e streak — PLACEHOLDER (implementar em Fase4_Gamificacao.gs) ────
  var totalPontos    = null;  // null = exibir "—" no painel
  var streakAtual    = null;
  var maxStreak      = null;
  var semanasFeitas  = {};

  // Lê Capacitacao só para histórico de semanas (sem calcular pontos)
  if (wsCap) {
    var dadosCap = wsCap.getDataRange().getValues();
    for (var r = 1; r < dadosCap.length; r++) {
      var lc  = dadosCap[r];
      if (String(lc[0]).trim().toLowerCase() !== email) continue;
      var sem  = parseInt(lc[1]) || 0;
      var tipo = String(lc[2]).trim();
      if (!semanasFeitas[sem]) semanasFeitas[sem] = { pilula: false, evidencia: false };
      if (tipo === 'pilula' || tipo === 'implementacao') semanasFeitas[sem].pilula = true;
      if (tipo === 'evidencia') semanasFeitas[sem].evidencia = true;
    }
  }

  // ── 4. Badges — por semanas concluídas (independe de gamificação) ──────────
  var semanasConcluidas = Object.keys(semanasFeitas).filter(function(w) {
    return semanasFeitas[w].pilula && semanasFeitas[w].evidencia;
  }).length;

  var badges = PAI_BADGES.map(function(b) {
    return {
      id:          b.id,
      nome:        b.nome,
      icon:        b.icon,
      desc:        b.desc,
      conquistado: semanasConcluidas >= b.semanas
    };
  });

  // ── 5. Meta coletiva da equipe ─────────────────────────────────────────────
  var metaColetiva = _pai_calcularMetaColetiva(dadosEnv, wsCap, gestorEmail);

  // ── 6. Histórico resumido (últimas 5 semanas) ──────────────────────────────
  var historico = [];
  for (var hw = Math.max(1, semanaAtual - 4); hw < semanaAtual; hw++) {
    var sf2 = semanasFeitas[hw] || { pilula: false, evidencia: false };
    var itemSeq = null;
    for (var si = 0; si < sequencia.length; si++) {
      if (sequencia[si].semana === hw) { itemSeq = sequencia[si]; break; }
    }
    historico.push({
      semana:    hw,
      tipo:      itemSeq ? itemSeq.tipo : 'pilula',
      titulo:    itemSeq ? (itemSeq.titulo || 'Semana de Implementação') : '—',
      pilula:    sf2.pilula,
      evidencia: sf2.evidencia
    });
  }

  return {
    nome:             nome,
    cargo:            cargo,
    semanaAtual:      semanaAtual,
    totalSemanas:     F4_TOTAL_SEMANAS,
    status:           status,
    pct:              Math.round(semanaAtual / F4_TOTAL_SEMANAS * 100),
    ehImpl:           ehImpl,
    pilula:           pilula,
    proxPilula:       proxPilula,
    competencia:      contrato.competencia || (pilula ? pilula.competencia : ''),
    meta:             contrato.meta_aprendizagem || '',
    totalPontos:      totalPontos,
    streakAtual:      streakAtual,
    maxStreak:        maxStreak,
    semanasConcluidas:semanasConcluidas,
    badges:           badges,
    metaColetiva:     metaColetiva,
    historico:        historico
  };
}

// Calcula meta coletiva da equipe do gestor
function _pai_calcularMetaColetiva(dadosEnv, wsCap, gestorEmail) {
  var total = 0, acima75 = 0;
  var limiar = Math.ceil(F4_TOTAL_SEMANAS * 0.75); // ≥75% = 11 semanas

  for (var i = 1; i < dadosEnv.length; i++) {
    var l = dadosEnv[i];
    // Filtra pela equipe do gestor (se não tiver gestor, conta todos ativos)
    var mesmaEquipe = !gestorEmail ||
      String(l[F4E_GESTOR_EMAIL - 1] || '').trim().toLowerCase() === gestorEmail.toLowerCase();
    var ativo = String(l[F4E_STATUS - 1]).trim() === 'Ativo' ||
                String(l[F4E_STATUS - 1]).trim() === 'Concluído';
    if (!mesmaEquipe || !ativo) continue;

    total++;
    var emailMembro = String(l[F4E_EMAIL - 1]).trim().toLowerCase();
    var semMembro   = parseInt(l[F4E_SEMANA_ATU - 1]) || 0;
    // Concluído conta como 14
    if (String(l[F4E_STATUS - 1]).trim() === 'Concluído') semMembro = F4_TOTAL_SEMANAS;
    if (semMembro >= limiar) acima75++;
  }

  return {
    total:    total,
    acima75:  acima75,
    pct:      total > 0 ? Math.round(acima75 / total * 100) : 0,
    meta:     80,   // 80% da equipe (doc)
    atingida: total > 0 && (acima75 / total) >= 0.80
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// HTML DO PAINEL
// ═══════════════════════════════════════════════════════════════════════════════
function _pai_html() {
  return '<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n'
    + '<meta charset="utf-8">\n'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
    + '<title>Meu Painel — Vertho</title>\n'
    + '<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@500&display=swap" rel="stylesheet">\n'
    + '<style>\n'
    + ':root{'
    + '--navy:#0f2b54;--teal:#34c5cc;--teal2:#2ba8af;--purple:#9e4edd;'
    + '--gold:#f59e0b;--bg:#f0f4fa;--white:#fff;--border:#e2e8f0;'
    + '--text:#1e293b;--muted:#64748b;--radius:14px;'
    + '}\n'
    + '*{box-sizing:border-box;margin:0;padding:0}\n'
    + 'body{font-family:"DM Sans",sans-serif;background:var(--bg);color:var(--text);min-height:100vh}\n'

    // Header
    + '.header{background:var(--navy);padding:14px 20px;display:flex;align-items:center;gap:10px;position:sticky;top:0;z-index:10}\n'
    + '.logo{display:flex;align-items:center}\n'
    + '.user-chip{margin-left:auto;display:flex;align-items:center;gap:8px}\n'
    + '.avatar{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--teal),var(--purple));display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:700}\n'
    + '.user-name{color:#fff;font-size:13px;font-weight:500;opacity:.85}\n'

    // Layout
    + '.page{max-width:680px;margin:0 auto;padding:20px 16px 60px}\n'

    // Loading
    + '.loading{text-align:center;padding:80px 20px;color:var(--muted)}\n'
    + '.loading .spin{font-size:32px;display:inline-block;animation:spin 1s linear infinite}\n'
    + '@keyframes spin{to{transform:rotate(360deg)}}\n'

    // Cards
    + '.card{background:var(--white);border-radius:var(--radius);border:1px solid var(--border);margin-bottom:14px;overflow:hidden}\n'
    + '.card-header{padding:14px 18px 0;display:flex;align-items:center;gap:8px}\n'
    + '.card-title{font-size:11px;font-weight:700;color:var(--teal);text-transform:uppercase;letter-spacing:.7px}\n'
    + '.card-body{padding:14px 18px 18px}\n'

    // Hero card — semana atual
    + '.hero{background:linear-gradient(135deg,var(--navy) 60%,#1a3a6b);color:#fff;border:none}\n'
    + '.hero .card-title{color:var(--teal);opacity:.85}\n'
    + '.semana-num{font-size:48px;font-weight:700;font-family:"DM Mono",monospace;line-height:1;color:var(--teal)}\n'
    + '.semana-de{font-size:14px;color:#fff;opacity:.6;margin-left:4px}\n'
    + '.pilula-titulo{font-size:17px;font-weight:600;color:#fff;margin:10px 0 4px;line-height:1.4}\n'
    + '.comp-tag{display:inline-block;background:rgba(52,197,204,.15);color:var(--teal);font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;margin-bottom:14px}\n'
    + '.btn-moodle{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,var(--teal),var(--teal2));color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;font-size:13px;font-weight:700;border:none;cursor:pointer;transition:opacity .2s}\n'
    + '.btn-moodle:hover{opacity:.88}\n'
    + '.btn-outline{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.08);color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:600;border:1px solid rgba(255,255,255,.2);margin-left:8px;cursor:pointer;transition:opacity .2s}\n'
    + '.impl-aviso{background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.3);border-radius:10px;padding:12px 16px;font-size:13px;color:#fcd34d;margin-bottom:14px;line-height:1.5}\n'

    // Barra de progresso
    + '.prog-bar{height:8px;background:rgba(255,255,255,.15);border-radius:4px;margin-top:16px;overflow:hidden}\n'
    + '.prog-fill{height:100%;background:linear-gradient(90deg,var(--teal),var(--purple));border-radius:4px;transition:width .8s ease}\n'
    + '.prog-label{font-size:11px;color:rgba(255,255,255,.5);margin-top:4px}\n'

    // Stats row
    + '.stats-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}\n'
    + '.stat{background:var(--white);border-radius:var(--radius);border:1px solid var(--border);padding:16px;text-align:center}\n'
    + '.stat-val{font-size:32px;font-weight:700;font-family:"DM Mono",monospace;color:var(--navy);line-height:1}\n'
    + '.stat-val.teal{color:var(--teal)}\n'
    + '.stat-val.gold{color:var(--gold)}\n'
    + '.stat-val.purple{color:var(--purple)}\n'
    + '.stat-label{font-size:11px;color:var(--muted);margin-top:4px;font-weight:600;text-transform:uppercase;letter-spacing:.5px}\n'
    + '.stat-sub{font-size:10px;color:var(--muted);margin-top:2px}\n'

    // Badges
    + '.badges-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}\n'
    + '.badge-item{text-align:center;padding:14px 8px;border-radius:12px;border:1.5px solid var(--border);transition:all .2s}\n'
    + '.badge-item.on{border-color:var(--gold);background:#fffbeb}\n'
    + '.badge-item.off{opacity:.4;filter:grayscale(1)}\n'
    + '.badge-icon{font-size:28px;margin-bottom:6px}\n'
    + '.badge-nome{font-size:12px;font-weight:700;color:var(--navy)}\n'
    + '.badge-desc{font-size:10px;color:var(--muted);margin-top:2px}\n'

    // Meta coletiva
    + '.meta-bar-wrap{background:#f8fafc;border-radius:10px;padding:14px 16px}\n'
    + '.meta-bar{height:12px;background:var(--border);border-radius:6px;margin:8px 0;overflow:hidden;position:relative}\n'
    + '.meta-fill{height:100%;background:linear-gradient(90deg,var(--teal),var(--purple));border-radius:6px;transition:width .8s ease}\n'
    + '.meta-marker{position:absolute;top:-2px;width:2px;height:16px;background:var(--gold);border-radius:1px}\n'
    + '.meta-labels{display:flex;justify-content:space-between;font-size:11px;color:var(--muted)}\n'
    + '.meta-atingida{background:#ecfdf5;border:1px solid #6ee7b7;border-radius:10px;padding:10px 14px;font-size:13px;color:#065f46;font-weight:600;text-align:center;margin-top:8px}\n'

    // Histórico
    + '.hist-list{display:flex;flex-direction:column;gap:8px}\n'
    + '.hist-item{display:flex;align-items:center;gap:12px;padding:10px 14px;background:#f8fafc;border-radius:10px}\n'
    + '.hist-sem{font-family:"DM Mono",monospace;font-size:11px;color:var(--muted);font-weight:500;min-width:52px}\n'
    + '.hist-titulo{font-size:13px;color:var(--navy);flex:1;line-height:1.3}\n'
    + '.hist-chips{display:flex;gap:4px}\n'
    + '.chip{font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px}\n'
    + '.chip.ok{background:#dcfce7;color:#15803d}\n'
    + '.chip.miss{background:#f1f5f9;color:#94a3b8}\n'

    // Streak fire
    + '.streak-badge{display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#f59e0b,#ef4444);color:#fff;font-size:13px;font-weight:700;padding:6px 14px;border-radius:30px;margin-top:4px}\n'

    + '</style>\n'
    + '</head>\n<body>\n'

    + '<div class="header">'
    + '<div class="logo"><img src="data:image/png;base64,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" style="height:28px;display:block" alt="Vertho"></div>'
    + '<div class="user-chip">'
    + '<div class="avatar" id="av">?</div>'
    + '<span class="user-name" id="user-name-header">Carregando...</span>'
    + '</div>'
    + '</div>\n'

    + '<div class="page">\n'
    + '<div class="loading" id="loading"><div class="spin">⚙️</div><p style="margin-top:12px;font-size:13px">Carregando seu painel...</p></div>\n'
    + '<div id="conteudo" style="display:none"></div>\n'
    + '</div>\n'

    + '<script>\n'
    + 'var _token   = "<?= token ?>";\n'
    + 'var _baseUrl = "<?= baseUrl ?>";\n'
    + 'var _appUrl  = (_baseUrl && _baseUrl.indexOf("http") === 0) ? _baseUrl : null;\n'
    + 'var _email   = "";\n'
    + '\n'
    + 'window.onload = function() {\n'
    + '  google.script.run\n'
    + '    .withSuccessHandler(function(s) {\n'
    + '      if (!s) { window.top.location.href = (_appUrl || window.location.href.split("?")[0]) + "?view=painel"; return; }\n'
    + '      _email = s.email;\n'
    + '      carregarDados();\n'
    + '    })\n'
    + '    .withFailureHandler(function() { mostrarErro("Sessão expirada. Recarregue."); })\n'
    + '    .verificarSessao(_token);\n'
    + '};\n'
    + '\n'
    + 'function carregarDados() {\n'
    + '  google.script.run\n'
    + '    .withSuccessHandler(renderizar)\n'
    + '    .withFailureHandler(function() { mostrarErro("Erro ao carregar dados."); })\n'
    + '    .getDadosPainel(_email);\n'
    + '}\n'
    + '\n'
    + 'function renderizar(d) {\n'
    + '  if (d.erro) { mostrarErro(d.erro); return; }\n'
    + '  document.getElementById("loading").style.display = "none";\n'
    + '  var fn = (d.nome || "").split(" ")[0];\n'
    + '  document.getElementById("av").textContent          = fn ? fn[0].toUpperCase() : "?";\n'
    + '  document.getElementById("user-name-header").textContent = fn;\n'
    + '\n'
    + '  var html = "";\n'
    + '\n'
    // HERO
    + '  html += \'<div class="card hero">\';\n'
    + '  html += \'<div class="card-header"><span class="card-title">Minha Trilha</span></div>\';\n'
    + '  html += \'<div class="card-body">\';\n'
    + '  html += \'<div><span class="semana-num">\' + d.semanaAtual + \'</span><span class="semana-de"> / \' + d.totalSemanas + \'</span></div>\';\n'
    + '  if (d.competencia) html += \'<div class="comp-tag">\' + d.competencia + \'</div>\';\n'
    + '  if (d.ehImpl) {\n'
    + '    html += \'<div class="impl-aviso">🧘 <strong>Semana de Implementação</strong> — pratique o que aprendeu. Sem conteúdo novo esta semana.</div>\';\n'
    + '  } else if (d.pilula) {\n'
    + '    html += \'<div class="pilula-titulo">\' + d.pilula.titulo + \'</div>\';\n'
    + '    if (d.pilula.url && d.pilula.url.indexOf("http") === 0) {\n'
    + '      html += \'<a class="btn-moodle" href="\' + d.pilula.url + \'" target="_blank">\u25b6 Acessar p\u00edlula</a>\';\n'
    + '    } else {\n'
    + '      html += \'<p style=\"color:rgba(255,255,255,.55);font-size:12px;margin-top:8px;font-style:italic\">URL do Moodle ainda n\u00e3o configurada.</p>\';\n'
    + '    }\n'
    + '  } else {\n'
    + '    html += \'<div class="impl-aviso" style=\"background:rgba(52,197,204,.12);border-color:rgba(52,197,204,.35);color:rgba(255,255,255,.85)\">\uD83D\uDCEC Sua p\u00edlula chegar\u00e1 na <strong>segunda-feira</strong>. Aguarde!</div>\';\n'
    + '  }\n'
    + '  html += \'<a class="btn-outline" href="\' + (_appUrl || window.location.href.split("?")[0]) + \'?view=tutor&token=\' + _token + \'">🤖 Tutor IA</a>\';\n'
    + '  html += \'<div class="prog-bar"><div class="prog-fill" style="width:\' + d.pct + \'%"></div></div>\';\n'
    + '  html += \'<div class="prog-label">\' + d.pct + \'% concluído · \' + d.semanasConcluidas + \' semanas completas</div>\';\n'
    + '  html += \'</div></div>\';\n'
    + '\n'
    // STATS
    + '  html += \'<div class="stats-row">\';\n'
    + '  var ptsVal  = d.totalPontos  !== null ? d.totalPontos  : "—";\n'
    + '  var strkVal = d.streakAtual !== null ? d.streakAtual : "—";\n'
    + '  html += \'<div class="stat"><div class="stat-val teal">\' + ptsVal + \'</div><div class="stat-label">Pontos</div><div class="stat-sub">Em breve</div></div>\';\n'
    + '  html += \'<div class="stat">\';\n'
    + '  html += \'<div class="stat-val gold">\' + strkVal + \'</div>\';\n'
    + '  if (d.streakAtual !== null && d.streakAtual >= 3) html += \'<div class="streak-badge">🔥 \' + d.streakAtual + \' semanas seguidas!</div>\';\n'
    + '  html += \'<div class="stat-label">Streak atual</div>\';\n'
    + '  html += \'<div class="stat-sub">\'+ (d.maxStreak !== null ? "Máximo: " + d.maxStreak + " semanas" : "Em breve") + \'</div>\';\n'
    + '  html += \'</div>\';\n'
    + '  html += \'</div>\';\n'
    + '\n'
    // BADGES
    + '  html += \'<div class="card"><div class="card-header"><span class="card-title">Badges</span></div><div class="card-body">\';\n'
    + '  html += \'<div class="badges-grid">\';\n'
    + '  d.badges.forEach(function(b) {\n'
    + '    html += \'<div class="badge-item \' + (b.conquistado ? "on" : "off") + \'">\';\n'
    + '    html += \'<div class="badge-icon">\' + b.icon + \'</div>\';\n'
    + '    html += \'<div class="badge-nome">\' + b.nome + \'</div>\';\n'
    + '    html += \'<div class="badge-desc">\' + b.desc + \'</div>\';\n'
    + '    html += \'</div>\';\n'
    + '  });\n'
    + '  html += \'</div></div></div>\';\n'
    + '\n'
    // META COLETIVA
    + '  if (d.metaColetiva && d.metaColetiva.total > 1) {\n'
    + '    var mc = d.metaColetiva;\n'
    + '    html += \'<div class="card"><div class="card-header"><span class="card-title">Meta da Equipe</span></div><div class="card-body">\';\n'
    + '    html += \'<div class="meta-bar-wrap">\';\n'
    + '    html += \'<div style="font-size:13px;color:var(--navy);font-weight:600">\' + mc.acima75 + \' de \' + mc.total + \' pessoas com ≥75% da trilha</div>\';\n'
    + '    html += \'<div class="meta-bar">\';\n'
    + '    html += \'<div class="meta-fill" style="width:\' + mc.pct + \'%"></div>\';\n'
    + '    var markerLeft = Math.min(mc.meta, 98);\n'
    + '    html += \'<div class="meta-marker" style="left:\' + markerLeft + \'%"></div>\';\n'
    + '    html += \'</div>\';\n'
    + '    html += \'<div class="meta-labels"><span>\' + mc.pct + \'% da equipe</span><span>Meta: \' + mc.meta + \'%</span></div>\';\n'
    + '    html += \'</div>\';\n'
    + '    if (mc.atingida) html += \'<div class="meta-atingida">🎉 Meta coletiva atingida! Workshop especial desbloqueado.</div>\';\n'
    + '    html += \'</div></div>\';\n'
    + '  }\n'
    + '\n'
    // HISTÓRICO
    + '  if (d.historico && d.historico.length > 0) {\n'
    + '    html += \'<div class="card"><div class="card-header"><span class="card-title">Últimas semanas</span></div><div class="card-body">\';\n'
    + '    html += \'<div class="hist-list">\';\n'
    + '    d.historico.forEach(function(h) {\n'
    + '      html += \'<div class="hist-item">\';\n'
    + '      html += \'<div class="hist-sem">Sem \' + h.semana + \'</div>\';\n'
    + '      html += \'<div class="hist-titulo">\' + h.titulo + \'</div>\';\n'
    + '      html += \'<div class="hist-chips">\';\n'
    + '      html += \'<span class="chip \' + (h.pilula    ? "ok" : "miss") + \'">\' + (h.pilula    ? "✓ pílula"    : "pílula")    + \'</span>\';\n'
    + '      html += \'<span class="chip \' + (h.evidencia ? "ok" : "miss") + \'">\' + (h.evidencia ? "✓ evidência" : "evidência") + \'</span>\';\n'
    + '      html += \'</div></div>\';\n'
    + '    });\n'
    + '    html += \'</div></div></div>\';\n'
    + '  }\n'
    + '\n'
    // META de aprendizagem
    + '  if (d.meta) {\n'
    + '    html += \'<div class="card"><div class="card-header"><span class="card-title">Minha Meta</span></div>\';\n'
    + '    html += \'<div class="card-body" style="font-size:13px;color:var(--muted);line-height:1.7;font-style:italic">&ldquo;\' + d.meta + \'&rdquo;</div></div>\';\n'
    + '  }\n'
    + '\n'
    + '  document.getElementById("conteudo").innerHTML = html;\n'
    + '  document.getElementById("conteudo").style.display = "block";\n'
    + '}\n'
    + '\n'
    + 'function mostrarErro(msg) {\n'
    + '  var html = \'<div style=\"text-align:center;padding:50px 20px\">\';\n'
    + '  html += \'<div style=\"font-size:40px;margin-bottom:14px\">\u26a0\ufe0f</div>\';\n'
    + '  html += \'<p style=\"color:#ef4444;font-size:15px;font-weight:600;margin-bottom:6px\">\'  + msg + \'</p>\';\n'
    + '  html += \'<p style=\"color:#94a3b8;font-size:12px;margin-bottom:18px\">Verifique se voc\u00ea foi inscrito na Fase 4.</p>\';\n'
    + '  html += \'<button onclick=\"window.location.reload()\" style=\"background:none;border:1px solid #cbd5e1;border-radius:8px;padding:8px 18px;font-size:12px;cursor:pointer;color:#64748b;font-family:inherit\">\uD83D\uDD04 Tentar novamente</button>\';\n'
    + '  html += \'</div>\';\n'
    + '  document.getElementById("loading").innerHTML = html;\n'
    + '}\n'
    + '</script>\n'
    + '</body>\n</html>';
}