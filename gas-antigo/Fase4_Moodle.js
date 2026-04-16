// ═══════════════════════════════════════════════════════════════════════════════
// VERTHO — FASE 4: INTEGRAÇÃO MOODLE v1
// Arquivo: Fase4_Moodle.js — adicione ao projeto GAS
//
// Recursos:
//   · moodleCrearUsuario            → cria conta Moodle para o colaborador
//   · moodleMatricular              → matricula no curso da competência
//   · moodleProvisaonarColaborador  → fluxo completo (criar + matricular)
//   · moodleProvisionarTodos        → provisiona todos os colaboradores ativos
//   · moodleImportarCatalogo        → importa atividades Moodle → aba "Moodle_Catalogo"
//   · moodleAplicarCatalogo         → Moodle_Catalogo (c/ semana) → atualiza URLs na Trilhas
//   · moodleAtualizarSequencias     → propaga as URLs para o JSON das sequências
//   · moodleStatusSemanalColaborador→ checa conclusão de curso
//   · diagnosticoMoodle             → testa conexão e lista funções disponíveis
//
// ── SETUP (fazer UMA VEZ antes de usar) ─────────────────────────────────────
//
//  1. Moodle Admin:
//     → Administração do site → Plugins → Serviços web → Visão geral
//     → Seguir o checklist:
//        a) Habilitar serviços web
//        b) Habilitar o protocolo REST
//        c) Criar serviço personalizado "Vertho GAS" com as funções abaixo
//        d) Criar token para usuário administrador
//
//  2. Funções necessárias no serviço web Moodle:
//        core_webservice_get_site_info
//        core_user_create_users
//        core_user_get_users
//        enrol_manual_enrol_users
//        core_course_get_courses
//        core_course_get_contents
//        core_completion_get_activities_completion_status
//
//  3. No GAS (editor de script):
//     → Projeto → Propriedades do projeto → Propriedades do script
//     → Adicionar:  MOODLE_TOKEN = <token copiado do Moodle>
//
//  4. Rode moodleListarCursosLog() no editor e copie o JSON gerado.
//     → Propriedades do script → MOODLE_CURSOS = <json>
//        Exemplo: {"Comunicação Eficaz":3,"Liderança":4}
//
//  5. Rode diagnosticoMoodle() para confirmar a conexão.
// ═══════════════════════════════════════════════════════════════════════════════

var MOODLE_URL = 'https://academia.vertho.ai';

// ── Token — lido das Propriedades do Script ───────────────────────────────────
function _moodle_token() {
  var t = PropertiesService.getScriptProperties().getProperty('MOODLE_TOKEN');
  if (!t) throw new Error(
    'MOODLE_TOKEN não configurado.\n' +
    'Vá em Projeto → Propriedades → Propriedades do script e adicione MOODLE_TOKEN.'
  );
  return t;
}


// ═══════════════════════════════════════════════════════════════════════════════
// HELPER CENTRAL — chama o webservice Moodle REST (protocolo clássico)
// POST /webservice/rest/server.php — auth via wstoken no payload
// ═══════════════════════════════════════════════════════════════════════════════
function _moodle_chamada(wsfunction, params) {
  var payload = {
    wstoken:            _moodle_token(),
    wsfunction:         wsfunction,
    moodlewsrestformat: 'json'
  };
  var p = params || {};
  Object.keys(p).forEach(function(k) { payload[k] = String(p[k]); });

  var resp = UrlFetchApp.fetch(MOODLE_URL + '/webservice/rest/server.php', {
    method:             'post',
    payload:            payload,
    muteHttpExceptions: true
  });

  var data;
  try {
    data = JSON.parse(resp.getContentText());
  } catch(e) {
    throw new Error('Moodle: resposta inválida — ' + resp.getContentText().substring(0, 200));
  }

  if (data && data.exception) {
    throw new Error('Moodle [' + (data.errorcode || data.exception) + ']: ' + data.message);
  }
  return data;
}


// ═══════════════════════════════════════════════════════════════════════════════
// USUÁRIOS
// ═══════════════════════════════════════════════════════════════════════════════

// Busca usuário por e-mail. Retorna {id, username, email, fullname, ...} ou null.
function moodleGetUsuario(email) {
  email = String(email || '').toLowerCase().trim();
  var res = _moodle_chamada('core_user_get_users', {
    'criteria[0][key]':   'email',
    'criteria[0][value]': email
  });
  var users = res && res.users;
  return (users && users.length > 0) ? users[0] : null;
}

// Cria conta Moodle. Idempotente: se já existir, retorna o usuário sem criar duplicata.
function moodleCrearUsuario(nome, email) {
  email = String(email || '').toLowerCase().trim();

  var existing = moodleGetUsuario(email);
  if (existing) {
    Logger.log('Moodle: usuário já existe — ' + email + ' (id=' + existing.id + ')');
    return existing;
  }

  var partes    = nome.trim().split(/\s+/);
  var firstname = partes[0] || 'Colaborador';
  var lastname  = partes.slice(1).join(' ') || 'Vertho';
  var username  = email.split('@')[0].toLowerCase().replace(/[^a-z0-9._\-]/g, '').substring(0, 25)
                  + '_' + Math.floor(Math.random() * 900 + 100);
  var password  = _moodle_gerarSenha();

  var res = _moodle_chamada('core_user_create_users', {
    'users[0][username]':  username,
    'users[0][password]':  password,
    'users[0][firstname]': firstname,
    'users[0][lastname]':  lastname,
    'users[0][email]':     email,
    'users[0][auth]':      'manual',
    'users[0][lang]':      'pt_br',
    'users[0][timezone]':  'America/Sao_Paulo'
  });

  if (!res || !res[0] || !res[0].id) {
    throw new Error('Falha ao criar usuário Moodle para ' + email + ': ' + JSON.stringify(res));
  }
  Logger.log('Moodle: criado — ' + nome + ' <' + email + '> id=' + res[0].id);
  return moodleGetUsuario(email) || { id: res[0].id, email: email, username: username };
}

// Gera senha que satisfaz os critérios padrão do Moodle
function _moodle_gerarSenha() {
  var u = 'ABCDEFGHJKMNPQRSTUVWXYZ', l = 'abcdefghjkmnpqrstuvwxyz',
      d = '23456789', s = '@#$!', a = u + l + d + s;
  var p = u[Math.floor(Math.random()*u.length)] + l[Math.floor(Math.random()*l.length)]
        + d[Math.floor(Math.random()*d.length)] + s[Math.floor(Math.random()*s.length)];
  for (var i = 0; i < 6; i++) p += a[Math.floor(Math.random()*a.length)];
  return p.split('').sort(function() { return Math.random()-.5; }).join('');
}

// Cache email → moodleId em ScriptProperties
function _moodle_cacheSet(email, moodleId) {
  var raw = PropertiesService.getScriptProperties().getProperty('MOODLE_USER_IDS') || '{}';
  var m = {}; try { m = JSON.parse(raw); } catch(e) {}
  m[email.toLowerCase()] = moodleId;
  PropertiesService.getScriptProperties().setProperty('MOODLE_USER_IDS', JSON.stringify(m));
}
function _moodle_cacheGet(email) {
  var raw = PropertiesService.getScriptProperties().getProperty('MOODLE_USER_IDS') || '{}';
  try { return JSON.parse(raw)[email.toLowerCase()] || null; } catch(e) { return null; }
}
function moodleGetId(email) {
  var cached = _moodle_cacheGet(email);
  if (cached) return cached;
  var user = moodleGetUsuario(email);
  if (user && user.id) { _moodle_cacheSet(email, user.id); return user.id; }
  return null;
}


// ═══════════════════════════════════════════════════════════════════════════════
// MATRÍCULAS
// ═══════════════════════════════════════════════════════════════════════════════

// roleId 5 = student. Idempotente — Moodle ignora se já matriculado.
function moodleMatricular(moodleUserId, courseId, roleId) {
  roleId = roleId || 5;
  _moodle_chamada('enrol_manual_enrol_users', {
    'enrolments[0][roleid]':   roleId,
    'enrolments[0][userid]':   moodleUserId,
    'enrolments[0][courseid]': courseId
  });
  Logger.log('Moodle: id=' + moodleUserId + ' matriculado no curso id=' + courseId);
}


// ═══════════════════════════════════════════════════════════════════════════════
// CURSOS E ATIVIDADES
// ═══════════════════════════════════════════════════════════════════════════════

// Lista todos os cursos (exceto id=1 que é o site-course).
function moodleListarCursos() {
  var res = _moodle_chamada('core_course_get_courses', {});
  return Array.isArray(res) ? res.filter(function(c) { return c.id && c.id > 1; }) : [];
}

// Retorna as seções e módulos de um curso.
function moodleGetConteudo(courseId) {
  return _moodle_chamada('core_course_get_contents', { courseid: courseId }) || [];
}

// Extrai mapa { nomeAtividade → url } de todas as atividades do curso.
// Suporta URL, arquivo, SCORM, página, quiz, fórum, etc.
function moodleMapearAtividades(courseId) {
  var sections = moodleGetConteudo(courseId);
  var mapa = {};
  sections.forEach(function(sec) {
    (sec.modules || []).forEach(function(mod) {
      if (!mod.name) return;
      var url = null;
      if      (mod.url)                          url = mod.url;
      else if (mod.modname === 'scorm')          url = MOODLE_URL + '/mod/scorm/view.php?id=' + mod.id;
      else if (mod.contents && mod.contents[0]) url = mod.contents[0].fileurl || (MOODLE_URL + '/mod/' + mod.modname + '/view.php?id=' + mod.id);
      else                                       url = MOODLE_URL + '/mod/' + mod.modname + '/view.php?id=' + mod.id;
      if (url) mapa[mod.name] = url;
    });
  });
  return mapa;
}

// Imprime cursos no log e gera JSON para MOODLE_CURSOS.
// Rode no editor após configurar o token.
function moodleListarCursosLog() {
  var cursos = moodleListarCursos();
  Logger.log('═══ CURSOS MOODLE (' + cursos.length + ') ═══');
  cursos.forEach(function(c) {
    Logger.log('ID ' + c.id + '  |  ' + c.fullname + '  [' + c.shortname + ']');
  });
  var mapa = {};
  cursos.forEach(function(c) { mapa[c.fullname] = c.id; });
  Logger.log('\n══ COPIE para a propriedade MOODLE_CURSOS: ══\n' + JSON.stringify(mapa, null, 2));
  Logger.log('(Projeto → Propriedades do script → MOODLE_CURSOS)');
}


// ═══════════════════════════════════════════════════════════════════════════════
// MAPEAMENTO COMPETÊNCIA → COURSE ID
// ═══════════════════════════════════════════════════════════════════════════════

function moodleGetMapaCursos() {
  var raw = PropertiesService.getScriptProperties().getProperty('MOODLE_CURSOS') || '{}';
  try { return JSON.parse(raw); } catch(e) { return {}; }
}

// Busca courseId: exata → case-insensitive → parcial
function moodleGetCursoId(competencia) {
  if (!competencia) return null;
  var mapa = moodleGetMapaCursos();
  if (mapa[competencia]) return mapa[competencia];
  var norm = competencia.trim().toLowerCase();
  for (var k in mapa) {
    if (k.trim().toLowerCase() === norm) return mapa[k];
  }
  for (var k2 in mapa) {
    var n = k2.trim().toLowerCase();
    if (n.indexOf(norm) >= 0 || norm.indexOf(n) >= 0) return mapa[k2];
  }
  return null;
}


// ═══════════════════════════════════════════════════════════════════════════════
// CATÁLOGO MOODLE
// Fluxo:
//   1. moodleImportarCatalogo()  → cria aba "Moodle_Catalogo" com TODAS as atividades
//   2. Analista preenche coluna "Semana" em cada linha
//   3. moodleAplicarCatalogo()   → lê Moodle_Catalogo e atualiza col URL na aba Trilhas
//   4. moodleAtualizarSequencias() → Trilhas → JSONs de sequência (botão "Acessar pílula")
// ═══════════════════════════════════════════════════════════════════════════════

// Cria (ou sobrescreve) a aba "Moodle_Catalogo" — 1 LINHA POR CURSO.
// Módulos e seções são agrupados dentro do curso.
// Colunas: A=Competência | B=Curso (nome Moodle) | C=URL Curso | D=Course ID |
//          E=Qtd Seções | F=Qtd Módulos | G=Seções (resumo) | H=Módulos (lista)
function moodleImportarCatalogo() {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var mapa = moodleGetMapaCursos();
  if (!Object.keys(mapa).length) {
    SpreadsheetApp.getUi().alert(
      'Configure MOODLE_CURSOS nas propriedades do script antes de importar.\n\n' +
      'Rode moodleListarCursosLog() no editor para obter os IDs.'
    );
    return;
  }

  // Cria ou limpa a aba
  var wsNome = 'Moodle_Catalogo';
  var ws = ss.getSheetByName(wsNome);
  if (!ws) {
    ws = ss.insertSheet(wsNome);
  } else {
    ws.clearContents();
  }

  var header = [['Competência', 'Curso (Moodle)', 'URL Curso', 'Course ID',
                 'Qtd Seções', 'Qtd Módulos', 'Seções', 'Módulos']];
  ws.getRange(1, 1, 1, 8).setValues(header).setFontWeight('bold').setBackground('#f3f3f3');

  var linhas = [], cursosComErro = [];
  var nomes = Object.keys(mapa).sort();

  nomes.forEach(function(nome) {
    var courseId = mapa[nome];
    try {
      var sections = moodleGetConteudo(courseId);
      var urlCurso = MOODLE_URL + '/course/view.php?id=' + courseId;
      var secoesNomes = [];
      var modulosNomes = [];

      sections.forEach(function(sec) {
        var secName = (sec.name || 'Sem nome').trim();
        if (secName && secName !== 'Geral' && secName !== 'General') {
          secoesNomes.push(secName);
        }
        (sec.modules || []).forEach(function(mod) {
          if (mod.name) modulosNomes.push(mod.name.trim());
        });
      });

      linhas.push([
        nome,
        nome,
        urlCurso,
        String(courseId),
        secoesNomes.length,
        modulosNomes.length,
        secoesNomes.join(' | ').substring(0, 2000),
        modulosNomes.join(' | ').substring(0, 3000)
      ]);
    } catch(e) {
      cursosComErro.push(nome + ' [id=' + courseId + ']: ' + e.message);
    }
  });

  if (linhas.length > 0) {
    ws.getRange(2, 1, linhas.length, 8).setValues(linhas);
  }

  ws.setColumnWidth(1, 200);
  ws.setColumnWidth(2, 250);
  ws.setColumnWidth(3, 350);
  ws.setColumnWidth(7, 400);
  ws.setColumnWidth(8, 500);

  var msg = '✅ ' + linhas.length + ' cursos importados do Moodle para a aba "' + wsNome + '".\n' +
            '(agrupados por Course ID — 1 linha por curso)\n\n' +
            '👉 Rode catalogarConteudosMoodle() para enriquecer com IA.';
  if (cursosComErro.length) {
    msg += '\n\n⚠️ ' + cursosComErro.length + ' curso(s) com erro:\n' + cursosComErro.join('\n');
  }
  SpreadsheetApp.getUi().alert(msg);
}


// Lê a aba "Moodle_Catalogo" (apenas linhas com Semana preenchida) e insere
// novas linhas na aba Trilhas para cada pílula ainda não cadastrada.
// Critério de duplicidade: mesma Competência + mesma URL.
// Seguro: nunca apaga nem edita linhas existentes na Trilhas.
function moodleAplicarCatalogo() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var wsCat = ss.getSheetByName('Moodle_Catalogo');
  var wsTri = ss.getSheetByName(F4_ABA_TRILHAS);

  if (!wsCat) {
    SpreadsheetApp.getUi().alert('Aba "Moodle_Catalogo" não encontrada.\nRode moodleImportarCatalogo() primeiro.');
    return;
  }
  if (!wsTri) {
    SpreadsheetApp.getUi().alert('Aba "' + F4_ABA_TRILHAS + '" não encontrada.');
    return;
  }

  var catDados = wsCat.getDataRange().getValues();
  var triDados = wsTri.getDataRange().getValues();

  // Monta conjunto de chaves já existentes na Trilhas: norm(competência) + "||" + url
  var existentes = {};
  for (var j = 1; j < triDados.length; j++) {
    var eComp = _moodle_normalizar(String(triDados[j][F4T_COMPETENCIA - 1]));
    var eUrl  = String(triDados[j][F4T_URL - 1]).trim();
    if (eComp && eUrl) existentes[eComp + '||' + eUrl] = true;
  }

  var novasLinhas = [], adicionados = 0, pulados = 0, semSemana = 0;

  for (var i = 1; i < catDados.length; i++) {
    var comp   = String(catDados[i][0]).trim();
    var semana = String(catDados[i][1]).trim();
    var titulo = String(catDados[i][2]).trim();
    var url    = String(catDados[i][3]).trim();

    if (!comp) continue;
    if (!semana) { semSemana++; continue; }
    if (!url || url.indexOf('http') !== 0) continue;

    var chave = _moodle_normalizar(comp) + '||' + url;
    if (existentes[chave]) { pulados++; continue; }

    // Nova linha: [Competência, Nível, Semana, Título, URL, Descrição]
    novasLinhas.push([comp, 1, parseInt(semana) || semana, titulo, url, '']);
    existentes[chave] = true; // evita duplicatas dentro do mesmo lote
    adicionados++;
  }

  if (novasLinhas.length > 0) {
    var ultima = wsTri.getLastRow();
    wsTri.getRange(ultima + 1, 1, novasLinhas.length, 6).setValues(novasLinhas);
  }

  var msg = '\u2705 ' + adicionados + ' pílula(s) adicionadas à aba Trilhas.' +
            '\n\u23ed\ufe0f  ' + pulados + ' já existentes (puladas).';
  if (semSemana > 0) {
    msg += '\n\u2139\ufe0f ' + semSemana + ' linha(s) sem semana preenchida no catálogo (ignoradas).';
  }
  if (adicionados > 0) {
    msg += '\n\n\ud83d\udca1 Após revisar a Trilhas, rode moodleAtualizarSequencias() para ativar os links no painel.';
  }
  SpreadsheetApp.getUi().alert(msg);
}


// Helpers internos
function _moodle_normalizar(str) {
  return String(str || '').toLowerCase()
    .replace(/[áàãâä]/g,'a').replace(/[éèêë]/g,'e').replace(/[íìîï]/g,'i')
    .replace(/[óòõôö]/g,'o').replace(/[úùûü]/g,'u').replace(/ç/g,'c')
    .replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim();
}


// ═══════════════════════════════════════════════════════════════════════════════
// ATUALIZAR SEQUÊNCIAS — propaga URLs da aba Trilhas para JSON em Fase4_Envios
// Match por competência + semana (mais confiável que por título).
// Rode APÓS moodleAplicarCatalogo() para que o painel mostre os botões "Acessar pílula".
// ═══════════════════════════════════════════════════════════════════════════════
function moodleAtualizarSequencias() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var wsTri = ss.getSheetByName(F4_ABA_TRILHAS);
  var wsEnv = ss.getSheetByName(F4_ABA_ENVIOS);
  if (!wsTri || !wsEnv) throw new Error('Abas necessárias não encontradas.');

  // Mapa primário:   norm(competencia) + "||" + semana  → url
  // Mapa secundário: norm(titulo)                       → url  (fallback)
  var trilhas   = wsTri.getDataRange().getValues();
  var mapaCS    = {}; // competencia+semana → url
  var mapaTit   = {}; // titulo → url (fallback)
  for (var t = 1; t < trilhas.length; t++) {
    var tComp = _moodle_normalizar(String(trilhas[t][F4T_COMPETENCIA - 1]));
    var tSem  = String(parseInt(trilhas[t][F4T_SEMANA - 1]) || '');
    var tTit  = String(trilhas[t][F4T_TITULO - 1]).trim();
    var tUrl  = String(trilhas[t][F4T_URL    - 1]).trim();
    if (!tUrl || tUrl.indexOf('http') !== 0) continue;
    if (tComp && tSem) mapaCS[tComp + '||' + tSem] = tUrl;
    if (tTit)          mapaTit[tTit] = tUrl;
  }

  var dados       = wsEnv.getDataRange().getValues();
  var atualizados = 0, itensOk = 0;

  for (var i = 1; i < dados.length; i++) {
    var status = String(dados[i][F4E_STATUS - 1]).trim();
    if (status !== 'Ativo' && status !== 'Concluído') continue;

    var seq = [];
    try { seq = JSON.parse(String(dados[i][F4E_SEQUENCIA - 1])); } catch(e) { continue; }

    var modified = false;
    seq.forEach(function(item) {
      // 1º: match por competencia + semana
      var chaveCS = _moodle_normalizar(item.competencia || '') + '||' + String(item.semana || '');
      var novaUrl = mapaCS[chaveCS];
      // 2º fallback: match por titulo
      if (!novaUrl && item.titulo) novaUrl = mapaTit[item.titulo];

      if (novaUrl && item.url !== novaUrl) {
        item.url = novaUrl;
        modified = true;
        itensOk++;
      }
    });

    if (modified) {
      wsEnv.getRange(i + 1, F4E_SEQUENCIA).setValue(JSON.stringify(seq));
      atualizados++;
    }
  }

  SpreadsheetApp.getUi().alert(
    '\u2705 ' + atualizados + ' sequência(s) atualizadas (' + itensOk + ' pílula(s) com link).\n\n' +
    'Recarregue o painel para ver os botões "Acessar pílula" ativos.'
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// CONCLUSÃO — verifica progresso no Moodle
// ═══════════════════════════════════════════════════════════════════════════════

// Retorna array [{cmid, modname, state, ...}]  state: 0=não feito, 1=feito, 2=feito c/ nota
function moodleGetConclusao(moodleUserId, courseId) {
  var res = _moodle_chamada('core_completion_get_activities_completion_status', {
    courseid: courseId,
    userid:   moodleUserId
  });
  return (res && res.statuses) ? res.statuses : [];
}

// % de atividades concluídas (0-100)
function moodleGetPctConclusao(moodleUserId, courseId) {
  var s = moodleGetConclusao(moodleUserId, courseId);
  if (!s.length) return 0;
  return Math.round(s.filter(function(x) { return parseInt(x.state) >= 1; }).length / s.length * 100);
}

// Retorna {concluido, pct, courseId} para o colaborador na competência atual
function moodleStatusSemanalColaborador(email, competencia) {
  email = String(email || '').toLowerCase().trim();
  var moodleId = moodleGetId(email);
  if (!moodleId) return { concluido: false, pct: 0, courseId: null };

  var courseId = moodleGetCursoId(competencia);
  if (!courseId) return { concluido: false, pct: 0, courseId: null };

  var pct = moodleGetPctConclusao(moodleId, courseId);
  return { concluido: pct >= 80, pct: pct, courseId: courseId };
}


// ═══════════════════════════════════════════════════════════════════════════════
// PROVISIONAMENTO — criar usuário + matricular nos cursos da sequência
// ═══════════════════════════════════════════════════════════════════════════════

// Provisiona UM colaborador (busca pelo e-mail na aba Fase4_Envios).
// Retorna {moodleId, matriculados, semMapa}
function moodleProvisaonarColaborador(email) {
  email = String(email || '').toLowerCase().trim();
  if (!email) throw new Error('E-mail obrigatório.');

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var wsEnv = ss.getSheetByName(F4_ABA_ENVIOS);
  if (!wsEnv) throw new Error('Aba ' + F4_ABA_ENVIOS + ' não encontrada.');

  var dados = wsEnv.getDataRange().getValues(), linha = null;
  for (var i = 1; i < dados.length; i++) {
    if (String(dados[i][F4E_EMAIL - 1]).trim().toLowerCase() === email) { linha = dados[i]; break; }
  }
  if (!linha) throw new Error('Colaborador não encontrado: ' + email);

  var nome = String(linha[F4E_NOME - 1]).trim();
  var seq  = [];
  try { seq = JSON.parse(String(linha[F4E_SEQUENCIA - 1])); } catch(e) {}

  // 1. Criar/localizar usuário
  var user     = moodleCrearUsuario(nome, email);
  var moodleId = user.id;
  _moodle_cacheSet(email, moodleId);

  // 2. Competências únicas na sequência
  var comps = {};
  seq.forEach(function(item) { if (item.competencia) comps[item.competencia] = true; });

  // 3. Matricular
  var matriculados = [], semMapa = [];
  Object.keys(comps).forEach(function(comp) {
    var cid = moodleGetCursoId(comp);
    if (cid) {
      try { moodleMatricular(moodleId, cid); matriculados.push(comp + ' (id=' + cid + ')'); }
      catch(e) { semMapa.push(comp + ' [erro: ' + e.message + ']'); }
    } else {
      semMapa.push(comp + ' [sem courseId]');
    }
  });

  Logger.log('Provisionado: ' + nome + ' <' + email + '> id=' + moodleId +
             ' | cursos: ' + (matriculados.join(', ') || '—') +
             (semMapa.length ? ' | sem mapa: ' + semMapa.join(', ') : ''));

  return { moodleId: moodleId, matriculados: matriculados, semMapa: semMapa };
}

// Provisiona TODOS os colaboradores Ativos/Concluídos.
function moodleProvisionarTodos() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var wsEnv = ss.getSheetByName(F4_ABA_ENVIOS);
  if (!wsEnv) throw new Error('Aba ' + F4_ABA_ENVIOS + ' não encontrada.');

  var dados = wsEnv.getDataRange().getValues(), ok = 0, erros = [];
  for (var i = 1; i < dados.length; i++) {
    var status = String(dados[i][F4E_STATUS - 1]).trim();
    if (status !== 'Ativo' && status !== 'Concluído') continue;
    var email = String(dados[i][F4E_EMAIL - 1]).trim();
    if (!email) continue;
    try {
      moodleProvisaonarColaborador(email);
      ok++;
      Utilities.sleep(600);
    } catch(e) {
      erros.push(email + ': ' + e.message);
    }
  }

  var msg = '\u2705 ' + ok + ' colaborador(es) provisionados no Moodle.';
  if (erros.length) msg += '\n\n\u274c ' + erros.length + ' erro(s):\n' + erros.join('\n');
  SpreadsheetApp.getUi().alert(msg);
}


// ═══════════════════════════════════════════════════════════════════════════════
// DIAGNÓSTICO — rode no editor GAS para testar a integração completa
// ═══════════════════════════════════════════════════════════════════════════════
function diagnosticoMoodle() {
  try {
    var info = _moodle_chamada('core_webservice_get_site_info', {});
    Logger.log('\u2705 Moodle conectado!');
    Logger.log('Site:    ' + info.sitename);
    Logger.log('Versão:  ' + info.release);
    Logger.log('Usuário: ' + info.username + ' (id=' + info.userid + ')');

    var funcs  = (info.functions || []).map(function(f) { return f.name; });
    var needed = [
      'core_webservice_get_site_info', 'core_user_create_users', 'core_user_get_users',
      'enrol_manual_enrol_users', 'core_course_get_courses',
      'core_course_get_contents', 'core_completion_get_activities_completion_status'
    ];
    Logger.log('\nFunções no serviço web:');
    needed.forEach(function(f) {
      Logger.log((funcs.indexOf(f) >= 0 ? '  \u2705 ' : '  \u274c ') + f);
    });

    var mapa = moodleGetMapaCursos();
    Logger.log('\nMOODLE_CURSOS: ' + (Object.keys(mapa).length > 0
      ? JSON.stringify(mapa)
      : '\u26a0\ufe0f não configurado — rode moodleListarCursosLog()'));

  } catch(e) {
    Logger.log('\u274c Erro: ' + e.message);
    Logger.log('Verifique:\n  1. MOODLE_TOKEN nas propriedades do script\n  2. Serviços web habilitados no Moodle\n  3. Protocolo REST ativo');
  }
}
