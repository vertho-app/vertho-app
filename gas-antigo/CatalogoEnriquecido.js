// ═══════════════════════════════════════════════════════════════════════════════
// CatalogoEnriquecido.js — Catalogação de conteúdos Moodle via IA
// Vertho Mentor IA
//
// Lê a aba Moodle_Catalogo, envia batches de 25 para a IA e grava
// o resultado enriquecido na aba Catalogo_Enriquecido.
//
// Competências e descritores: lidos DINAMICAMENTE da aba "Competencias_v2".
// Modelo: segue _CFG (cfg_provedor / cfg_modelo das ScriptProperties).
// Trigger encadeado: se estourar 5 min, agenda continuação automática.
//
// Dependências: Código.js (_CFG, _carregarCFG, _ia4ClaudeRaw, _ia4GeminiRaw,
//               _getApiKey, _norm, _deveParar, _limparParada, _lerBaseCompetenciasV2)
// ═══════════════════════════════════════════════════════════════════════════════

var _CAT_BATCH_SIZE  = 8;  // Reduzido: cada seção tem muitos módulos → prompt grande
var _CAT_MAX_MS      = 5 * 60 * 1000;
var _CAT_ABA_ORIGEM  = 'Moodle_Catalogo';
var _CAT_ABA_DEST    = 'Catalogo_Enriquecido';
var _CAT_PROP_OFFSET = 'CAT_ENR_OFFSET';


// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT — parte fixa (regras + formato de saída)
// A seção de competências é injetada dinamicamente pela função _catBuildSystemPrompt()
// ═══════════════════════════════════════════════════════════════════════════════

function _catBuildSystemPrompt(competencias, reguas, cargosLista) {
  // ── Montar seção de competências AGRUPADA POR CARGO ──────────────────────
  var secaoComps = [];
  cargosLista.forEach(function(cargo) {
    secaoComps.push('── CARGO: ' + cargo.toUpperCase() + ' ──');
    competencias.forEach(function(c) {
      if (c.cargo !== cargo) return;
      secaoComps.push('  ' + c.nome + ':');
      var descTxt = String(c.descritores || '');
      var descList = descTxt.split(/[|\n;]/).map(function(d) { return d.trim(); }).filter(Boolean);
      if (descList.length > 0) {
        secaoComps.push('    Descritores: ' + descList.join(' | '));
      }
      var reguaTexto = reguas[c.cargo + '|' + c.nome] || '';
      if (reguaTexto) {
        secaoComps.push('    Regua: ' + reguaTexto.substring(0, 400));
      }
    });
    secaoComps.push('');
  });

  return [
    'Voce e o Catalogador de Conteudos Educacionais da Vertho.',
    'Sua tarefa e classificar CURSOS Moodle para CADA CARGO separadamente.',
    'Cada cargo tem seu proprio conjunto de competencias e descritores.',
    '',
    'REGRA FUNDAMENTAL: um mesmo curso pode (e frequentemente deve) gerar MULTIPLAS',
    'classificacoes — uma para cada cargo ao qual o conteudo se aplica.',
    'Cada classificacao tem competencia e descritores ESPECIFICOS daquele cargo.',
    '',
    '═══════════════════════════════════════════════════════',
    'COMPETENCIAS POR CARGO',
    '(use EXATAMENTE estes nomes de competencias e descritores)',
    '═══════════════════════════════════════════════════════',
    '',
  ].concat(secaoComps).concat([
    '═══════════════════════════════════════════════════════',
    'REGRAS DE CATALOGACAO',
    '═══════════════════════════════════════════════════════',
    '',
    '1. COMPETENCIA:',
    '   - Analise os TITULOS DOS MODULOS para determinar a competencia real.',
    '   - O campo competencia DEVE ser EXATAMENTE um dos nomes listados acima para o cargo.',
    '   - Se o conteudo nao se encaixa em NENHUMA competencia daquele cargo, NAO gere entrada para ele.',
    '   - Se for transversal, escolha a principal e indique a secundaria.',
    '',
    '2. DESCRITORES: Retorne ate 3 campos separados:',
    '   - descritor_1: o descritor MAIS abordado (objeto com numero e nome EXATO da lista)',
    '   - descritor_2: o segundo mais abordado (ou null)',
    '   - descritor_3: o terceiro mais abordado (ou null)',
    '   Use numeros e nomes EXATOS da lista do cargo correspondente.',
    '',
    '3. NIVEL IDEAL: inteiro 1 a 4 baseado na regua de maturidade:',
    '   1=basico, 2=intermediario, 3=avancado, 4=excelencia.',
    '',
    '4. CARGO: o cargo especifico desta classificacao (professor, coordenador ou diretor).',
    '   Cada entrada do array deve ter UM UNICO cargo.',
    '   Se o curso se aplica a 2 cargos, gere 2 entradas separadas,',
    '   cada uma com a competencia e descritores daquele cargo.',
    '',
    '5. CONFIANCA: "alta", "media" ou "baixa".',
    '',
    '6. Itens como "Avisos", "Seja bem-vindo", "Curso Demo" → tipo "administrativo", sem cargo.',
    '',
    '7. NOTA: observacao livre quando necessario.',
    '',
    '8. TEMPO ESTIMADO: minutos, ~5/modulo texto, ~10/exercicio, ~15-20/SCORM. Multiplos de 5.',
    '',
    '',
    '═══════════════════════════════════════════════════════',
    'FORMATO DE SAIDA — APENAS JSON (array)',
    '═══════════════════════════════════════════════════════',
    '',
    'Retorne UM OBJETO POR CURSO x CARGO. O mesmo course_id pode aparecer varias vezes.',
    '',
    '[',
    '  {',
    '    "course_id": "6",',
    '    "cargo": "diretor",',
    '    "competencia": "Lideranca instrucional",',
    '    "competencia_secundaria": null,',
    '    "descritor_1": {"numero": 1, "nome": "Direcao pedagogica"},',
    '    "descritor_2": {"numero": 3, "nome": "Apoio a liderancas"},',
    '    "descritor_3": null,',
    '    "nivel_ideal": 2,',
    '    "tempo_estimado_min": 15,',
    '    "confianca": "alta",',
    '    "tipo": "conteudo",',
    '    "nota": null',
    '  },',
    '  {',
    '    "course_id": "6",',
    '    "cargo": "coordenador",',
    '    "competencia": "Gestao pedagogica e curricular",',
    '    "competencia_secundaria": null,',
    '    "descritor_1": {"numero": 2, "nome": "Planejamento curricular"},',
    '    "descritor_2": {"numero": 5, "nome": "Acompanhamento de resultados"},',
    '    "descritor_3": null,',
    '    "nivel_ideal": 2,',
    '    "tempo_estimado_min": 15,',
    '    "confianca": "alta",',
    '    "tipo": "conteudo",',
    '    "nota": null',
    '  }',
    ']',
  ]).join('\n');
}


// ═══════════════════════════════════════════════════════════════════════════════
// PONTO DE ENTRADA
// ═══════════════════════════════════════════════════════════════════════════════

function catalogarConteudosMoodle() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  // Confirmação antes de processar
  var wsDest = ss.getSheetByName(_CAT_ABA_DEST);
  if (wsDest && wsDest.getLastRow() > 1) {
    var resp = ui.alert(
      '⚠️ Atenção — Catálogo Enriquecido',
      'A aba "' + _CAT_ABA_DEST + '" já existe com ' + (wsDest.getLastRow() - 1) + ' linha(s).\n\n' +
      'Se os headers mudaram, a aba será LIMPA e recriada automaticamente.\n' +
      'Os resumos do Tutor IA serão regenerados (pode levar alguns minutos).\n\n' +
      'Deseja continuar?',
      ui.ButtonSet.YES_NO
    );
    if (resp !== ui.Button.YES) return;
  } else {
    var resp2 = ui.alert(
      'Catalogar Conteúdos Moodle',
      'Isso vai:\n' +
      '1. Ler cursos da aba Moodle_Catalogo\n' +
      '2. Classificar por competência e cargo via IA\n' +
      '3. Extrair conteúdo real do Moodle e gerar resumos para o Tutor IA\n\n' +
      'O processo pode levar alguns minutos. Deseja continuar?',
      ui.ButtonSet.YES_NO
    );
    if (resp2 !== ui.Button.YES) return;
  }

  _carregarCFG();

  var modelo   = _CFG.modelo   || MODEL_SONNET;
  var provedor = _CFG.provedor || 'CLAUDE';

  // ── 0. Ler competências de Competencias_v2 (prioridade) ou Competencias ────
  var mapaV2 = _lerBaseCompetenciasV2(ss);
  var competencias = [];
  var reguas = {};

  // Lookup para validação pós-IA: cargo|compNome → {nomeExato, descritores[]}
  var _catLookup = {};  // chave = "cargo_norm|comp_norm"
  var _catCargos = [];  // lista de cargos únicos

  if (mapaV2 && Object.keys(mapaV2).length > 0) {
    // V2: 1 entrada por cargo × competência (NÃO agrupar)
    var cargosSet = {};
    Object.keys(mapaV2).forEach(function(cod) {
      var c = mapaV2[cod];
      // Normalizar cargo para lookup (ex: "Professor(a)" → "professor")
      var cargoNorm = (c.cargo || '').toLowerCase().replace(/\(a\)/g, '').trim();
      // Nome limpo da competência (sem cargo entre parênteses)
      var nomeLimpo = (c.nome || '').replace(/\s*\([^)]*\)\s*$/, '').trim();

      var descTexto = c.descritores.map(function(d, i) {
        return (i + 1) + '. ' + d.nome_curto + ': ' + (d.completo || '').substring(0, 100);
      }).join(' | ');

      competencias.push({
        id:          cod,
        nome:        nomeLimpo,
        cargo:       cargoNorm,
        descritores: descTexto
      });

      // Lookup: cargo|comp → dados exatos
      var chave = cargoNorm + '|' + nomeLimpo.toLowerCase();
      _catLookup[chave] = {
        nomeExato: nomeLimpo,
        descritores: c.descritores.map(function(d, i) {
          return { numero: i + 1, nome: d.nome_curto };
        })
      };

      // Régua por cargo|comp
      reguas[cargoNorm + '|' + nomeLimpo] = c.descritores.map(function(d) {
        return d.nome_curto + ': N1=' + (d.n1||'').substring(0, 60) + ' | N3=' + (d.n3||'').substring(0, 60);
      }).join('\n');

      if (!cargosSet[cargoNorm]) { cargosSet[cargoNorm] = true; _catCargos.push(cargoNorm); }
    });
    Logger.log('Catálogo: ' + competencias.length + ' competências V2 (' + _catCargos.length + ' cargos)');
  } else {
    SpreadsheetApp.getUi().alert('Aba "Competencias_v2" não encontrada ou vazia.');
    return;
  }

  if (!competencias || !competencias.length) {
    SpreadsheetApp.getUi().alert('Nenhuma competência encontrada.');
    return;
  }

  Logger.log('Catálogo: ' + competencias.length + ' competências, ' + Object.keys(reguas).length + ' réguas carregadas');

  var systemPrompt = _catBuildSystemPrompt(competencias, reguas, _catCargos);

  // ── 1. Ler Moodle_Catalogo ─────────────────────────────────────────────────
  var wsOrig = ss.getSheetByName(_CAT_ABA_ORIGEM);
  if (!wsOrig || wsOrig.getLastRow() <= 1) {
    SpreadsheetApp.getUi().alert('Aba "' + _CAT_ABA_ORIGEM + '" não encontrada ou vazia.\nRode moodleImportarCatalogo() primeiro.');
    return;
  }

  var dados   = wsOrig.getDataRange().getValues();
  var headers = dados[0];
  var _semAc = function(s) { return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim(); };
  var _hc = function(l) { return headers.findIndex(function(h) { return _semAc(h).includes(l); }); };

  // Novo formato: 1 linha por curso
  var iComp     = _hc('compet');
  var iCurso    = _hc('curso');  if (iCurso < 0) iCurso = _hc('tit');
  var iUrl      = _hc('url curso'); if (iUrl < 0) iUrl = _hc('url');
  var iCourseId = _hc('course id'); if (iCourseId < 0) iCourseId = _hc('course');
  var iSecoes   = _hc('secoes');  if (iSecoes < 0) iSecoes = _hc('seca');
  var iModulos  = _hc('modulos'); if (iModulos < 0) iModulos = _hc('modul');

  if (iComp < 0 || iUrl < 0) {
    var hdrReal = headers.map(function(h,i) { return i + '="' + h + '"'; }).join(' | ');
    SpreadsheetApp.getUi().alert('Colunas Competência/URL não encontradas na aba ' + _CAT_ABA_ORIGEM
      + '\n\nHeaders encontrados:\n' + hdrReal
      + '\n\nRode moodleImportarCatalogo() para atualizar o formato.');
    return;
  }

  // Ler cursos (1 linha = 1 curso)
  var cursos = {};
  for (var r = 1; r < dados.length; r++) {
    var comp    = String(dados[r][iComp]     || '').trim();
    var curso   = iCurso >= 0 ? String(dados[r][iCurso] || '').trim() : comp;
    var url     = String(dados[r][iUrl]      || '').trim();
    var cId     = iCourseId >= 0 ? String(dados[r][iCourseId] || '').trim() : '';
    var secTxt  = iSecoes >= 0 ? String(dados[r][iSecoes] || '').trim() : '';
    var modTxt  = iModulos >= 0 ? String(dados[r][iModulos] || '').trim() : '';
    if (!comp) continue;

    // Extrair courseId da URL se não houver coluna
    if (!cId && url) {
      var match = url.match(/[?&]id=(\d+)/);
      if (match) cId = match[1];
    }

    var chave = cId || (r + '');
    if (!cursos[chave]) {
      cursos[chave] = {
        competencia: comp,
        courseId:     cId,
        cursoNome:   curso || comp,
        url_curso:   url || (cId ? MOODLE_URL + '/course/view.php?id=' + cId : ''),
        secoes:      secTxt ? secTxt.split(/\s*\|\s*/).filter(Boolean) : [],
        modulos:     modTxt ? modTxt.split(/\s*\|\s*/).filter(Boolean) : []
      };
    }
  }

  var cursoKeys = Object.keys(cursos).sort(function(a, b) {
    return cursos[a].competencia.localeCompare(cursos[b].competencia);
  });
  if (!cursoKeys.length) {
    SpreadsheetApp.getActive().toast('Nenhum curso para catalogar.', 'Catálogo', 5);
    return;
  }

  Logger.log('Catálogo: ' + cursoKeys.length + ' cursos encontrados (1 linha por courseId)');

  // ── 2. Offset (trigger encadeado) ──────────────────────────────────────────
  var props  = PropertiesService.getScriptProperties();
  var offset = parseInt(props.getProperty(_CAT_PROP_OFFSET) || '0');
  if (offset >= cursoKeys.length) {
    props.deleteProperty(_CAT_PROP_OFFSET);
    SpreadsheetApp.getActive().toast('Todos os cursos já foram catalogados.', '✅ Catálogo', 5);
    return;
  }

  // ── 3. Preparar aba destino (sempre valida headers) ────────────────────────
  var _CAT_HEADERS = [
    'Curso', 'URL Curso', 'Qtd Módulos', 'Módulos',
    'Cargo', 'Comp. Confirmada', 'Comp. Secundária',
    'Descritor 1', 'Descritor 2', 'Descritor 3',
    'Nível Ideal', 'Tempo Estimado (min)', 'Confiança', 'Tipo', 'Nota',
    'Course ID', 'Resumo Tutor', 'Transcrições'
  ];
  var wsDest = ss.getSheetByName(_CAT_ABA_DEST);
  if (!wsDest) {
    wsDest = ss.insertSheet(_CAT_ABA_DEST);
  }
  // Sempre garantir headers corretos (evita desalinhamento se formato mudou)
  var hdrAtual = wsDest.getLastRow() > 0
    ? wsDest.getRange(1, 1, 1, wsDest.getLastColumn()).getValues()[0]
    : [];
  var hdrOk = hdrAtual.length === _CAT_HEADERS.length
    && _CAT_HEADERS.every(function(h, i) { return _norm(hdrAtual[i] || '') === _norm(h); });
  if (!hdrOk) {
    // Headers desatualizados — limpar aba e recriar
    if (wsDest.getLastRow() > 0) wsDest.clear();
    wsDest.getRange(1, 1, 1, _CAT_HEADERS.length).setValues([_CAT_HEADERS])
      .setFontWeight('bold').setBackground('#0F2B54').setFontColor('#FFFFFF');
    wsDest.setFrozenRows(1);
    // Resetar offset para re-catalogar tudo com headers corretos
    props.setProperty(_CAT_PROP_OFFSET, '0');
    offset = 0;
    Logger.log('Catálogo: headers desatualizados — aba limpa e recriada.');
  }

  // ── 4. Processar cursos (em batches de até _CAT_BATCH_SIZE) ───────────────
  var startTime   = new Date().getTime();
  var batchNum    = 0;
  var processados = 0;

  for (var m = offset; m < cursoKeys.length; m += _CAT_BATCH_SIZE) {
    if (new Date().getTime() - startTime > _CAT_MAX_MS) {
      props.setProperty(_CAT_PROP_OFFSET, String(m));
      var restam = cursoKeys.length - m;
      SpreadsheetApp.getActive().toast(
        '[' + provedor + ': ' + modelo + ']\n' + processados + '/' + cursoKeys.length + ' cursos catalogados, ' + restam + ' restantes.\nContinuando em 1 min...',
        '⏳ Catálogo — lote encadeado', 10
      );
      _catAgendarContinuacao();
      return;
    }

    if (_deveParar()) { _limparParada(); break; }

    batchNum++;
    var batchKeys = cursoKeys.slice(m, m + _CAT_BATCH_SIZE);
    var batchLabel = batchNum + '/' + Math.ceil(cursoKeys.length / _CAT_BATCH_SIZE);

    SpreadsheetApp.getActive().toast(
      '[' + Config.modelLabel(modelo) + ']\nBatch ' + batchLabel + ' (' + batchKeys.length + ' cursos)',
      '📚 Catalogando cursos', 15
    );

    try {
      var batchInput = batchKeys.map(function(key) {
        var cur = cursos[key];
        var entrada = {
          course_id:   cur.courseId,
          curso:       cur.cursoNome,
          secoes:      cur.secoes,
          qtd_modulos: cur.modulos.length,
          modulos:     cur.modulos
        };
        return entrada;
      });

      var userPrompt = 'Cataloge os CURSOS abaixo. Cada curso tem secoes e modulos (atividades).\n'
        + 'Para CADA CURSO, gere UMA ENTRADA POR CARGO aplicavel (mesmo course_id pode aparecer varias vezes).\n'
        + 'Use competencias e descritores ESPECIFICOS de cada cargo, conforme a lista no system prompt.\n'
        + 'IMPORTANTE: estime tempo_estimado_min (minutos) baseado na quantidade de modulos.\n\n'
        + 'BATCH: ' + batchLabel + '\n\n'
        + 'CURSOS:\n' + JSON.stringify(batchInput, null, 2);

      var fullPrompt = systemPrompt + '\n\n--- USER ---\n\n' + userPrompt;

      Logger.log('Catálogo batch ' + batchLabel + ': enviando ' + batchKeys.length + ' cursos, prompt ~' + fullPrompt.length + ' chars');

      var textoRaw;
      if (provedor === 'GEMINI') {
        textoRaw = _ia4GeminiRaw(modelo, fullPrompt);
      } else if (modelo && modelo.toLowerCase().indexOf('gpt') >= 0) {
        textoRaw = _ia4OpenAIRawV2(modelo, systemPrompt, userPrompt, false);
      } else {
        textoRaw = _ia4ClaudeRaw(modelo, fullPrompt, false);
      }

      Logger.log('Catálogo batch ' + batchLabel + ': resposta recebida (' + (textoRaw||'').length + ' chars)');

      var resultado = _catParsearResultado(textoRaw);
      if (resultado && resultado.length > 0) {
        // Remover resumo_tutor do batch (vai ser gerado individualmente)
        resultado.forEach(function(r) { r.resumo_tutor = ''; });
        _catGravarBatchCursos(wsDest, resultado, batchKeys, cursos, modelo, _catLookup);
        processados += resultado.length;
        Logger.log('Catálogo batch ' + batchLabel + ': ' + resultado.length + ' cursos gravados OK');

        // ── 2ª chamada: gerar resumo_tutor individual por curso ──
        _catGerarResumosTutor(wsDest, resultado, batchKeys, cursos, modelo, provedor);
      } else {
        Logger.log('Catálogo batch ' + batchLabel + ': resultado vazio ou inválido. Raw início: ' + (textoRaw||'').substring(0, 300));
      }
    } catch(e) {
      Logger.log('Catálogo batch ' + batchLabel + ' ERRO: ' + e.message);
      batchKeys.forEach(function(key) {
        var cur = cursos[key];
        var proxLinha = wsDest.getLastRow() + 1;
        wsDest.getRange(proxLinha, 1, 1, 18).setValues([[
          cur.cursoNome, cur.url_curso, cur.modulos.length, '',
          '', 'ERRO', '', '', '', '', '', '', '', '', 'Erro IA: ' + e.message, cur.courseId, '', ''
        ]]);
      });
    }

    if (m + _CAT_BATCH_SIZE < cursoKeys.length) Utilities.sleep(2000);
  }

  // ── 5. Finalizar ──────────────────────────────────────────────────────────
  props.deleteProperty(_CAT_PROP_OFFSET);
  _catLimparTriggers();
  SpreadsheetApp.getActive().toast(
    '✅ Catalogação concluída!\n' + processados + ' cursos catalogados.',
    'Catálogo Enriquecido', 10
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function _catParsearResultado(texto) {
  var limpo = texto.replace(/```json/gi, '').replace(/```/g, '').trim();
  var ini = limpo.indexOf('[');
  var fim = limpo.lastIndexOf(']') + 1;
  if (ini < 0 || fim <= ini) return null;
  try {
    return JSON.parse(limpo.substring(ini, fim));
  } catch(e) {
    Logger.log('Catálogo parse erro: ' + e.message + '\nInício: ' + limpo.substring(0, 500));
    return null;
  }
}

// ── Normalizar nome para comparação fuzzy ────────────────────────────────────
function _catNorm(s) {
  return String(s || '').toLowerCase()
    .replace(/[áàâãä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i')
    .replace(/[óòôõö]/g, 'o').replace(/[úùûü]/g, 'u').replace(/[ç]/g, 'c')
    .replace(/[^a-z0-9]/g, '');
}

// ── Encontrar melhor match de competência (retorna nome exato da V2) ─────────
function _catMatchComp(nomeIA, lookup) {
  if (!nomeIA) return '';
  var low = nomeIA.toLowerCase();
  // Match exato
  if (lookup.compNomes[low]) return lookup.compNomes[low];
  // Match normalizado
  var norm = _catNorm(nomeIA);
  var melhor = '', melhorScore = 0;
  Object.keys(lookup.compNomes).forEach(function(k) {
    var kNorm = _catNorm(k);
    if (kNorm === norm) { melhor = lookup.compNomes[k]; melhorScore = 999; return; }
    // Substring match (um contém o outro)
    if (norm.length > 5 && (kNorm.indexOf(norm) >= 0 || norm.indexOf(kNorm) >= 0)) {
      var score = Math.min(norm.length, kNorm.length);
      if (score > melhorScore) { melhor = lookup.compNomes[k]; melhorScore = score; }
    }
  });
  return melhor || nomeIA; // Se não achou, manter original
}

// ── Formatar descritor forçando nome exato da V2 ────────────────────────────
function _catFmtDescExato(d, descritoresV2) {
  if (!d) return '';
  if (typeof d === 'object' && d.numero) {
    var num = parseInt(d.numero, 10);
    if (descritoresV2 && descritoresV2.length > 0) {
      for (var i = 0; i < descritoresV2.length; i++) {
        if (descritoresV2[i].numero === num) return descritoresV2[i].nome;
      }
    }
    return d.nome || '';
  }
  // Se veio como string, tentar extrair número e usar V2
  var m = String(d).match(/^D?(\d+)/i);
  if (m && descritoresV2) {
    var n = parseInt(m[1], 10);
    for (var j = 0; j < descritoresV2.length; j++) {
      if (descritoresV2[j].numero === n) return descritoresV2[j].nome;
    }
  }
  // Remover prefixo "D1 — " se existir
  return String(d).replace(/^D\d+\s*[—–-]\s*/i, '');
}

function _catGravarBatchCursos(wsDest, resultado, batchKeys, cursos, modelo, lookup) {
  // IA retorna 1 objeto por curso×cargo. Agrupar por course_id para localizar curso.
  var linhas = [];

  resultado.forEach(function(r) {
    var cid = String(r.course_id || r.secao_id || '');
    // Encontrar curso correspondente
    var cur = null;
    for (var k = 0; k < batchKeys.length; k++) {
      if (cursos[batchKeys[k]].courseId === cid) { cur = cursos[batchKeys[k]]; break; }
    }
    if (!cur) return;

    var cargoIA = String(r.cargo || '').toLowerCase().replace(/[()]/g, '').trim();
    var compIA  = String(r.competencia || r.competencia_confirmada || '').trim();
    // Remover cargo entre parênteses do nome da competência se a IA incluiu
    compIA = compIA.replace(/\s*\([^)]*\)\s*$/, '').trim();

    // Lookup para forçar nomes exatos
    var chave = cargoIA + '|' + compIA.toLowerCase();
    var ref = lookup[chave];

    // Se não achou match exato, tentar fuzzy
    if (!ref) {
      var compNorm = _catNorm(compIA);
      Object.keys(lookup).forEach(function(k) {
        if (ref) return;
        var parts = k.split('|');
        if (parts[0] === cargoIA && _catNorm(parts[1]) === compNorm) ref = lookup[k];
      });
    }
    // Último recurso: substring match
    if (!ref) {
      var compNorm2 = _catNorm(compIA);
      Object.keys(lookup).forEach(function(k) {
        if (ref) return;
        var parts = k.split('|');
        if (parts[0] === cargoIA && compNorm2.length > 5 &&
          (_catNorm(parts[1]).indexOf(compNorm2) >= 0 || compNorm2.indexOf(_catNorm(parts[1])) >= 0)) {
          ref = lookup[k];
        }
      });
    }

    var compExato = ref ? ref.nomeExato : compIA;
    var descV2   = ref ? ref.descritores : [];

    var modTitulos = cur.modulos.join(' | ');

    linhas.push([
      cur.cursoNome,
      cur.url_curso,
      cur.modulos.length,
      modTitulos.substring(0, 2000),
      cargoIA,
      compExato,
      r.competencia_secundaria ? String(r.competencia_secundaria).replace(/\s*\([^)]*\)\s*$/, '').trim() : '',
      _catFmtDescExato(r.descritor_1, descV2),
      _catFmtDescExato(r.descritor_2, descV2),
      _catFmtDescExato(r.descritor_3, descV2),
      r.nivel_ideal != null ? r.nivel_ideal : '',
      r.tempo_estimado_min != null ? r.tempo_estimado_min : '',
      r.confianca || '',
      r.tipo || '',
      r.nota || '',
      cur.courseId,
      String(r.resumo_tutor || '').substring(0, 10000),
      '' // Transcrições — preenchido pela 2ª chamada
    ]);
  });

  if (linhas.length > 0) {
    var proxLinha = wsDest.getLastRow() + 1;
    wsDest.getRange(proxLinha, 1, linhas.length, 18).setValues(linhas);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2ª CHAMADA: Resumo Tutor individual por curso (conteúdo real do Moodle)
// ═══════════════════════════════════════════════════════════════════════════════

function _catGerarResumosTutor(wsDest, resultado, batchKeys, cursos, modelo, provedor) {
  var cursosProcessados = {};
  var MAX_CELL = 49000; // Limite seguro (Sheets = 50k)

  resultado.forEach(function(r) {
    var cid = String(r.course_id || '');
    if (!cid || cursosProcessados[cid]) return;
    cursosProcessados[cid] = true;

    var cur = null;
    for (var k = 0; k < batchKeys.length; k++) {
      if (cursos[batchKeys[k]].courseId === cid) { cur = cursos[batchKeys[k]]; break; }
    }
    if (!cur) return;

    // ── 1. Extrair conteúdo do Moodle (páginas + labels + estrutura) ──
    var conteudoMoodle = '';
    try {
      conteudoMoodle = _tutor_extrairConteudoMoodle(parseInt(cid));
    } catch(e) {
      Logger.log('Resumo Tutor: extração Moodle falhou courseId=' + cid + ': ' + e.message);
    }

    // ── 2. Extrair transcrições de vídeos/áudios (separado do conteúdo de páginas) ──
    var transcricoes = '';
    try {
      transcricoes = _catExtrairTranscricoes(parseInt(cid));
    } catch(te) {
      Logger.log('Transcrições falhou courseId=' + cid + ': ' + te.message);
    }

    var conteudoTotal = conteudoMoodle;
    if (transcricoes) {
      conteudoTotal += '\n\n=== TRANSCRIÇÕES DE VÍDEOS/ÁUDIOS ===\n' + transcricoes;
    }

    if (!conteudoTotal || conteudoTotal.length < 100) {
      Logger.log('Resumo Tutor: sem conteúdo para courseId=' + cid + ', pulando.');
      return;
    }

    // ── 3. Competências abordadas ──
    var compsAbordadas = [];
    resultado.forEach(function(r2) {
      if (String(r2.course_id) === cid) {
        var comp = r2.competencia || r2.competencia_confirmada || '';
        var descs = [r2.descritor_1, r2.descritor_2, r2.descritor_3].filter(Boolean).map(function(d) {
          return typeof d === 'object' ? (d.nome || '') : String(d);
        }).filter(Boolean);
        compsAbordadas.push(comp + ' (' + (r2.cargo || '') + '): ' + descs.join(', '));
      }
    });

    // ── 4. Gerar resumo via IA ──
    var systemResumo = [
      'Voce e um especialista em educacao. Sua tarefa e gerar um RESUMO DETALHADO de um curso',
      'para ser usado por um Tutor IA que responde duvidas de colaboradores.',
      '',
      'O resumo sera a BASE DE CONHECIMENTO do tutor. Precisa ser completo o suficiente',
      'para que o tutor responda qualquer duvida sobre o conteudo.',
      '',
      'FORMATO DO RESUMO (2000-3000 palavras):',
      '1. VISAO GERAL: O que o curso ensina e por que e importante (2-3 paragrafos)',
      '2. CONCEITOS-CHAVE: Cada conceito importante explicado de forma clara',
      '3. APLICACAO PRATICA: Exemplos concretos do dia a dia escolar',
      '   (HTPC, sala de aula, reuniao pedagogica, conselho de classe, atendimento a familias)',
      '4. CONEXAO COM COMPETENCIAS: Como o conteudo desenvolve cada descritor',
      '5. PERGUNTAS FREQUENTES: 5-8 perguntas provaveis com respostas',
      '6. DICAS PRATICAS: Acoes concretas para a proxima semana',
      '',
      'REGRAS:',
      '- Linguagem acessivel, tom de mentor',
      '- Exemplos REAIS do contexto escolar brasileiro',
      '- Se o conteudo for superficial, ENRIQUEÇA com conhecimento pedagogico',
      '- NAO mencione "Moodle", "plataforma" ou termos de EAD'
    ].join('\n');

    var userResumo = [
      'CURSO: ' + cur.cursoNome,
      'COMPETENCIAS ABORDADAS:',
      compsAbordadas.join('\n'),
      '',
      'CONTEUDO DO CURSO:',
      conteudoTotal.substring(0, 20000), // Limitar input para não estourar contexto
      '',
      'Gere o resumo detalhado (2000-3000 palavras).'
    ].join('\n');

    try {
      var resumoTexto = '';
      if (provedor === 'GEMINI') {
        resumoTexto = _ia4GeminiRaw(modelo, systemResumo + '\n\n--- USER ---\n\n' + userResumo);
      } else if (modelo && modelo.toLowerCase().indexOf('gpt') >= 0) {
        resumoTexto = _ia4OpenAIRawV2(modelo, systemResumo, userResumo, false);
      } else {
        resumoTexto = _ia4ClaudeRawV2(modelo, systemResumo, userResumo, false);
      }

      if (resumoTexto && resumoTexto.length > 200) {
        // ── 5. Gravar resumo + transcrições para todas as linhas deste courseId ──
        var dadosDest = wsDest.getDataRange().getValues();
        for (var row = 1; row < dadosDest.length; row++) {
          var rowCid = String(dadosDest[row][15] || '').trim();
          if (rowCid === cid) {
            // Col 17 = Resumo Tutor
            wsDest.getRange(row + 1, 17).setValue(resumoTexto.substring(0, 10000));
            // Col 18 = Transcrições
            if (transcricoes) {
              if (transcricoes.length <= MAX_CELL) {
                wsDest.getRange(row + 1, 18).setValue(transcricoes);
              } else {
                // Fallback: salvar no Drive e colocar link na célula
                var driveUrl = _catSalvarTranscricaoDrive(cur.cursoNome, cid, transcricoes);
                wsDest.getRange(row + 1, 18).setValue(
                  transcricoes.substring(0, MAX_CELL - 200)
                  + '\n\n[TEXTO COMPLETO: ' + driveUrl + ']'
                );
              }
            }
          }
        }
        Logger.log('Resumo Tutor: courseId=' + cid + ' | resumo=' + resumoTexto.length + ' chars, transcricoes=' + transcricoes.length + ' chars');
      }
    } catch(re) {
      Logger.log('Resumo Tutor ERRO courseId=' + cid + ': ' + re.message);
    }

    Utilities.sleep(1500);
  });
}

/**
 * Extrai transcrições de vídeos/áudios de um curso via Worker Cloudflare.
 * Retorna texto concatenado com marcadores [VÍDEO N: título]
 */
function _catExtrairTranscricoes(courseId) {
  var workerUrl = PropertiesService.getScriptProperties().getProperty('TRANSCRIBE_WORKER_URL');
  if (!workerUrl) return '';

  var dados = _moodle_chamada('core_course_get_contents', { courseid: courseId });
  if (!dados || !Array.isArray(dados)) return '';

  var transcricoes = [];
  var videoCount = 0;

  for (var s = 0; s < dados.length; s++) {
    var modulos = dados[s].modules || [];
    for (var m = 0; m < modulos.length; m++) {
      var mod = modulos[m];
      var modNome = String(mod.name || '').trim();
      var modDesc = String(mod.description || '');
      var modType = String(mod.modname || '').toLowerCase();
      var fileUrl = '';

      // Detectar arquivos de mídia
      if (mod.contents && mod.contents.length > 0) {
        for (var fi = 0; fi < mod.contents.length; fi++) {
          var fc = mod.contents[fi];
          var mime = String(fc.mimetype || '').toLowerCase();
          var furl = String(fc.fileurl || '');
          if (mime.indexOf('audio') >= 0 || mime.indexOf('video') >= 0 ||
              furl.match(/\.(mp3|mp4|m4a|wav|ogg|webm|flac)(\?|$)/i)) {
            fileUrl = furl;
            break;
          }
        }
      }

      // Detectar YouTube em URL do módulo
      if (!fileUrl && modType === 'url') {
        var modUrl = String(mod.url || '');
        if (modUrl.match(/youtube\.com|youtu\.be/i)) fileUrl = modUrl;
        else if (modUrl.match(/\.(mp3|mp4|m4a|wav|ogg)(\?|$)/i)) fileUrl = modUrl;
      }

      // Detectar YouTube em embed na descrição
      if (!fileUrl) {
        var ytEmbed = modDesc.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (ytEmbed) fileUrl = 'https://www.youtube.com/watch?v=' + ytEmbed[1];
      }

      if (!fileUrl) continue;

      // Transcrever
      videoCount++;
      try {
        var resultado = _tutor_transcreverMidia(fileUrl);
        if (resultado && resultado.length > 50) {
          transcricoes.push('[VIDEO ' + videoCount + ': ' + modNome + ']\n' + resultado);
          Logger.log('Transcrição OK: ' + modNome + ' (' + resultado.length + ' chars)');
        } else {
          transcricoes.push('[VIDEO ' + videoCount + ': ' + modNome + ']\n(transcrição não disponível)');
        }
      } catch(te) {
        transcricoes.push('[VIDEO ' + videoCount + ': ' + modNome + ']\n(erro: ' + te.message + ')');
        Logger.log('Transcrição falhou: ' + modNome + ' | ' + te.message);
      }

      Utilities.sleep(500);
    }
  }

  return transcricoes.join('\n\n');
}

/**
 * Salva transcrição no Google Drive quando excede 50k chars.
 * Retorna URL do arquivo.
 */
function _catSalvarTranscricaoDrive(cursoNome, courseId, texto) {
  var nomeArquivo = 'Transcricao_' + courseId + '_' + cursoNome.replace(/[^a-zA-Z0-9\u00C0-\u00FF ]/g, '').substring(0, 40) + '.txt';
  var pasta = _catGetPastaTranscricoes();
  var arquivo = pasta.createFile(nomeArquivo, texto, 'text/plain');
  arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  Logger.log('Transcrição salva no Drive: ' + arquivo.getUrl());
  return arquivo.getUrl();
}

function _catGetPastaTranscricoes() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pastaRaiz = DriveApp.getFileById(ss.getId()).getParents().next();
  var subpastas = pastaRaiz.getFoldersByName('Transcricoes_Moodle');
  if (subpastas.hasNext()) return subpastas.next();
  return pastaRaiz.createFolder('Transcricoes_Moodle');
}


function _catAgendarContinuacao() {
  _catLimparTriggers();
  ScriptApp.newTrigger('catalogarConteudosMoodle').timeBased().after(60000).create();
}

function _catLimparTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'catalogarConteudosMoodle') ScriptApp.deleteTrigger(t);
  });
}

// ── Reset (para rodar do zero) ───────────────────────────────────────────────
function catalogarConteudosReset() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName(_CAT_ABA_DEST);

  var linhas = ws ? (ws.getLastRow() - 1) : 0;
  var msg = linhas > 0
    ? 'Isso vai EXCLUIR a aba "' + _CAT_ABA_DEST + '" com ' + linhas + ' linha(s) de dados,\nincluindo todos os resumos do Tutor IA.\n\nEssa ação não pode ser desfeita. Deseja continuar?'
    : 'Isso vai resetar o catálogo para rodar do zero.\nDeseja continuar?';

  var resp = ui.alert('Reset Catálogo Enriquecido', msg, ui.ButtonSet.YES_NO);
  if (resp !== ui.Button.YES) return;

  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(_CAT_PROP_OFFSET);
  _catLimparTriggers();

  if (ws) ss.deleteSheet(ws);

  SpreadsheetApp.getActive().toast('Reset! Aba removida e offset zerado.\nRode catalogarConteudosMoodle() para recomeçar.', 'Catálogo', 5);
}


// ═══════════════════════════════════════════════════════════════════════════════
// POPULAR CATÁLOGO BASE — Gera 864+ linhas (todas as combinações possíveis)
// Descritor × Nível × Cargo × Seq, com Status "vazio"
// ═══════════════════════════════════════════════════════════════════════════════

var _CAT_BASE_HEADERS = [
  'Cargo', 'Competência', 'Cod_Comp', 'Descritor', 'Cod_Desc',
  'Nível Transição', 'Conteúdo Seq', 'Semana Uso', 'Tipo',
  'Curso Moodle', 'URL Moodle', 'Course ID', 'Tags',
  'Resumo Tutor', 'Transcrição', 'Status', 'Confiança', 'Última Atualização'
];

/**
 * Gera a estrutura base do Catálogo Enriquecido com todas as combinações possíveis.
 * Para cada descritor × nível (N1→N2, N2→N3) × seq (1, 2) → 1 linha.
 * Pede confirmação se a aba já existir.
 */
function popularCatalogoBase() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // ── Verificar aba existente ──
  var wsExist = ss.getSheetByName(_CAT_ABA_DEST);
  if (wsExist && wsExist.getLastRow() > 1) {
    var resp = ui.alert(
      'Popular Catálogo Base',
      'A aba "' + _CAT_ABA_DEST + '" já existe com ' + (wsExist.getLastRow() - 1) + ' linhas.\n\n'
        + 'Isso vai SUBSTITUIR todo o conteúdo (incluindo resumos e transcrições).\n'
        + 'Deseja continuar?',
      ui.ButtonSet.YES_NO
    );
    if (resp !== ui.Button.YES) return;
  }

  // ── Ler Competencias_v2 ──
  var mapaV2 = _lerBaseCompetenciasV2(ss);
  if (!mapaV2 || Object.keys(mapaV2).length === 0) {
    ui.alert('Aba "Competencias_v2" não encontrada ou vazia.');
    return;
  }

  var niveis = ['N1→N2', 'N2→N3'];
  var seqs = [1, 2];
  var linhas = [];

  // ── Gerar todas as combinações ──
  var codComps = Object.keys(mapaV2);
  for (var i = 0; i < codComps.length; i++) {
    var c = mapaV2[codComps[i]];
    var cargo = c.cargo || '';
    var compNome = c.nome || '';
    var codComp = c.codigo || codComps[i];

    for (var d = 0; d < c.descritores.length; d++) {
      var desc = c.descritores[d];
      var descNome = desc.nome_curto || '';
      var codDesc = codComp + '_D' + (d + 1);

      for (var n = 0; n < niveis.length; n++) {
        for (var s = 0; s < seqs.length; s++) {
          linhas.push([
            cargo,                    // 1: Cargo
            compNome,                 // 2: Competência
            codComp,                  // 3: Cod_Comp
            descNome,                 // 4: Descritor
            codDesc,                  // 5: Cod_Desc
            niveis[n],                // 6: Nível Transição
            seqs[s],                  // 7: Conteúdo Seq
            String(seqs[s]),          // 8: Semana Uso ("1" ou "2")
            '',                       // 9: Tipo
            '',                       // 10: Curso Moodle
            '',                       // 11: URL Moodle
            '',                       // 12: Course ID
            '',                       // 13: Tags
            '',                       // 14: Resumo Tutor
            '',                       // 15: Transcrição
            'vazio',                  // 16: Status
            '',                       // 17: Confiança
            ''                        // 18: Última Atualização
          ]);
        }
      }
    }
  }

  // ── Criar/recriar aba ──
  if (wsExist) ss.deleteSheet(wsExist);
  var ws = ss.insertSheet(_CAT_ABA_DEST);

  // Headers
  ws.getRange(1, 1, 1, _CAT_BASE_HEADERS.length).setValues([_CAT_BASE_HEADERS])
    .setFontWeight('bold').setBackground('#0F2B54').setFontColor('#FFFFFF');
  ws.setFrozenRows(1);

  // Dados
  if (linhas.length > 0) {
    ws.getRange(2, 1, linhas.length, _CAT_BASE_HEADERS.length).setValues(linhas);
  }

  // Larguras
  ws.setColumnWidth(1, 120);   // Cargo
  ws.setColumnWidth(2, 200);   // Competência
  ws.setColumnWidth(4, 180);   // Descritor
  ws.setColumnWidth(10, 200);  // Curso Moodle
  ws.setColumnWidth(11, 250);  // URL Moodle

  var msg = linhas.length + ' linhas geradas (' + codComps.length + ' competências × ' + niveis.length + ' níveis × ' + seqs.length + ' seqs).\n'
    + 'Rode "Match Moodle → Catálogo" para preencher com conteúdos existentes.';
  SpreadsheetApp.getActive().toast(msg, 'Catálogo Base', 10);
  Logger.log('popularCatalogoBase: ' + linhas.length + ' linhas');
}


// ═══════════════════════════════════════════════════════════════════════════════
// MATCH MOODLE → CATÁLOGO — Cruza cursos Moodle com linhas base via IA
// Para cada curso, a IA identifica quais descritores×níveis são cobertos.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Lê Moodle_Catalogo e, para cada curso, pede à IA quais descritores do
 * Catálogo Base são cobertos. Preenche Curso Moodle, URL, Tags, Status.
 */
function matchMoodleCatalogo() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  _carregarCFG();

  // ── 1. Ler catálogo base ──
  var wsCat = ss.getSheetByName(_CAT_ABA_DEST);
  if (!wsCat || wsCat.getLastRow() < 2) {
    ui.alert('Rode "Popular Catálogo Base" primeiro.');
    return;
  }
  var catData = wsCat.getDataRange().getValues();
  var catHdr = catData[0];

  // Índices de coluna (header-based)
  var _nh = function(s) { return String(s||'').toLowerCase().replace(/[\s_\-\.]+/g,'').replace(/[áàâãéèêíìóòôõúùç]/g, function(c) {
    return 'aaaaeeeiioooouuc'.charAt('áàâãéèêíìóòôõúùç'.indexOf(c)); }); };
  var _fh = function(label) {
    var ln = _nh(label);
    return catHdr.findIndex(function(h) { return _nh(h).indexOf(ln) >= 0; });
  };

  var iCargo    = _fh('cargo');
  var iComp     = _fh('competencia');
  var iCodComp  = _fh('codcomp');
  var iDesc     = _fh('descritor');
  var iCodDesc  = _fh('coddesc');
  var iNivel    = _fh('niveltransicao');
  var iSeq      = _fh('conteudoseq');
  var iSemana   = _fh('semanau');
  var iTipo     = _fh('tipo');
  var iCurso    = _fh('cursomoodle');
  var iUrl      = _fh('urlmoodle');
  var iCourseId = _fh('courseid');
  var iTags     = _fh('tags');
  var iStatus   = _fh('status');
  var iConf     = _fh('confianca');
  var iUpdate   = _fh('ultimaat');

  if (iCodDesc < 0 || iStatus < 0) {
    var dbg = catHdr.map(function(h, i) { return i + '=[' + h + ']→[' + _nh(h) + ']'; }).join('\n');
    ui.alert('Catálogo Base com formato incorreto.\n\niCodDesc=' + iCodDesc + ' iStatus=' + iStatus
      + '\n\nHeaders encontrados (' + catHdr.length + '):\n' + dbg);
    return;
  }

  // ── 2. Ler Moodle_Catalogo ──
  var wsMoodle = ss.getSheetByName(_CAT_ABA_ORIGEM);
  if (!wsMoodle || wsMoodle.getLastRow() < 2) {
    ui.alert('Aba "' + _CAT_ABA_ORIGEM + '" não encontrada. Rode "Importar Catálogo Moodle" primeiro.');
    return;
  }
  var mData = wsMoodle.getDataRange().getValues();
  var mHdr = mData[0];
  var _mh = function(l) { return mHdr.findIndex(function(h) { return _nh(h).indexOf(_nh(l)) >= 0; }); };
  var miComp = _mh('compet');
  var miCurso = _mh('curso');  if (miCurso < 0) miCurso = _mh('tit');
  var miUrl = _mh('urlcurso'); if (miUrl < 0) miUrl = _mh('url');
  var miCourseId = _mh('courseid');
  var miModulos = _mh('modulos');

  // ── 3. Carregar competências V2 para o prompt da IA ──
  var mapaV2 = _lerBaseCompetenciasV2(ss);
  if (!mapaV2 || Object.keys(mapaV2).length === 0) {
    ui.alert('Competencias_v2 não encontrada.');
    return;
  }

  // Montar lista de descritores únicos do catálogo base
  var descritoresBase = [];
  for (var r = 1; r < catData.length; r++) {
    var codD = String(catData[r][iCodDesc] || '');
    var nivT = String(catData[r][iNivel] || '');
    var cargo = String(catData[r][iCargo] || '');
    var key = codD + '|' + nivT + '|' + cargo;
    if (descritoresBase.indexOf(key) < 0) {
      descritoresBase.push(key);
    }
  }

  // ── 4. Para cada curso Moodle, perguntar à IA quais descritores cobre ──
  var modelo = _CFG.modelo || 'claude-sonnet-4-20250514';
  var totalMatches = 0;
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');

  // Montar referência de descritores para o prompt
  var descRef = [];
  Object.keys(mapaV2).forEach(function(cod) {
    var c = mapaV2[cod];
    c.descritores.forEach(function(d, idx) {
      descRef.push(cod + '_D' + (idx + 1) + ' | ' + c.cargo + ' | ' + c.nome + ' | ' + d.nome_curto);
    });
  });

  var systemPrompt = [
    'Voce e um classificador de conteudos educacionais.',
    'Recebera um curso do Moodle (titulo + modulos) e uma lista de descritores.',
    'Identifique QUAIS descritores este curso ajuda a desenvolver e em qual NIVEL.',
    '',
    'DESCRITORES DISPONIVEIS (Cod_Desc | Cargo | Competencia | Descritor):',
    descRef.join('\n'),
    '',
    'REGRAS:',
    '- Um curso pode cobrir MULTIPLOS descritores.',
    '- Para cada descritor coberto, informe o nivel: "N1→N2" (basico/introdutorio) ou "N2→N3" (intermediario/avancado).',
    '- Gere 2-5 tags relevantes por curso (palavras-chave do conteudo).',
    '- Informe o tipo: texto, video, podcast, exercicio, misto.',
    '- Confianca: alta (titulo claro), media (titulo ambiguo), baixa (generico).',
    '',
    'FORMATO DE SAIDA — JSON:',
    '{',
    '  "matches": [',
    '    { "cod_desc": "DIR01_D1", "nivel": "N1→N2", "cargo": "Diretor(a)" },',
    '    { "cod_desc": "DIR01_D3", "nivel": "N2→N3", "cargo": "Diretor(a)" }',
    '  ],',
    '  "tags": ["lideranca", "pedagogica", "feedback"],',
    '  "tipo": "misto",',
    '  "confianca": "alta"',
    '}'
  ].join('\n');

  for (var m = 1; m < mData.length; m++) {
    var cursoNome = miCurso >= 0 ? String(mData[m][miCurso] || '').trim() : '';
    var cursoUrl = miUrl >= 0 ? String(mData[m][miUrl] || '').trim() : '';
    var courseId = miCourseId >= 0 ? String(mData[m][miCourseId] || '').trim() : '';
    var modulos = miModulos >= 0 ? String(mData[m][miModulos] || '').trim() : '';
    if (!cursoNome) continue;

    SpreadsheetApp.getActive().toast('Classificando: ' + cursoNome + ' (' + m + '/' + (mData.length - 1) + ')', 'Match Moodle', 15);

    var userPrompt = 'CURSO: ' + cursoNome + '\nURL: ' + cursoUrl + '\nCOURSE ID: ' + courseId
      + '\nMODULOS:\n' + modulos.substring(0, 3000);

    try {
      var texto = '';
      var modeloLower = modelo.toLowerCase();
      if (modeloLower.indexOf('gpt') >= 0 || modeloLower.indexOf('o1') >= 0 || modeloLower.indexOf('o3') >= 0 || modeloLower.indexOf('o4') >= 0) {
        texto = _ia4OpenAIRawV2(modelo, systemPrompt, userPrompt, false);
      } else if (modeloLower.indexOf('gemini') >= 0) {
        texto = _ia4GeminiRawV2(modelo, systemPrompt, userPrompt);
      } else {
        texto = _ia4ClaudeRawV2(modelo, systemPrompt, userPrompt, false);
      }

      var json = null;
      try { json = JSON.parse(_ia4ExtrairJSON(texto)); } catch(pe) { json = null; }
      if (!json || !json.matches) {
        Logger.log('Match Moodle: JSON inválido para ' + cursoNome);
        continue;
      }

      var tags = (json.tags || []).join(', ');
      var tipo = json.tipo || 'misto';
      var conf = json.confianca || 'media';

      // Preencher linhas no catálogo base
      for (var mi = 0; mi < json.matches.length; mi++) {
        var match = json.matches[mi];
        var mCodDesc = String(match.cod_desc || '').toUpperCase();
        var mNivel = String(match.nivel || '');
        var mCargo = String(match.cargo || '').toLowerCase();

        // Debug primeiro match de cada curso
        if (mi === 0) {
          Logger.log('DEBUG match[0]: cod_desc="' + mCodDesc + '" nivel="' + mNivel + '" cargo="' + mCargo + '"');
          // Log primeira linha da base para comparar
          if (catData.length > 1) {
            Logger.log('DEBUG base[1]: cod_desc="' + String(catData[1][iCodDesc]||'').toUpperCase() + '" nivel="' + String(catData[1][iNivel]||'') + '" cargo="' + String(catData[1][iCargo]||'').toLowerCase() + '" status="' + String(catData[1][iStatus]||'') + '"');
          }
        }

        var found = false;
        // Buscar linha correspondente (prioriza seq com menor preenchimento)
        for (var cr = 1; cr < catData.length; cr++) {
          var rowCodDesc = String(catData[cr][iCodDesc] || '').toUpperCase();
          var rowNivel = String(catData[cr][iNivel] || '');
          var rowCargo = String(catData[cr][iCargo] || '').toLowerCase();
          var rowStatus = String(catData[cr][iStatus] || '');

          var mCargoNorm = mCargo.replace(/[()]/g, '').replace(/\s+/g, '');
          var rowCargoNorm = rowCargo.replace(/[()]/g, '').replace(/\s+/g, '');
          if (rowCodDesc === mCodDesc && rowNivel === mNivel
              && (rowCargoNorm.indexOf(mCargoNorm) >= 0 || mCargoNorm.indexOf(rowCargoNorm) >= 0)
              && rowStatus !== 'coberto') {
            // Preencher esta linha
            var rowNum = cr + 1; // 1-indexed
            if (iTipo >= 0)     wsCat.getRange(rowNum, iTipo + 1).setValue(tipo);
            if (iCurso >= 0)    wsCat.getRange(rowNum, iCurso + 1).setValue(cursoNome);
            if (iUrl >= 0)      wsCat.getRange(rowNum, iUrl + 1).setValue(cursoUrl);
            if (iCourseId >= 0) wsCat.getRange(rowNum, iCourseId + 1).setValue(courseId);
            if (iTags >= 0)     wsCat.getRange(rowNum, iTags + 1).setValue(tags);
            if (iStatus >= 0)   wsCat.getRange(rowNum, iStatus + 1).setValue('coberto');
            if (iConf >= 0)     wsCat.getRange(rowNum, iConf + 1).setValue(conf);
            if (iUpdate >= 0)   wsCat.getRange(rowNum, iUpdate + 1).setValue(now);

            // Atualizar cache local
            catData[cr][iStatus] = 'coberto';
            catData[cr][iCurso] = cursoNome;
            totalMatches++;
            break; // próximo match
          }
        }
      }

      Logger.log('Match Moodle: ' + cursoNome + ' → ' + json.matches.length + ' descritores cobertos');
    } catch(e) {
      Logger.log('Match Moodle ERRO: ' + cursoNome + ' | ' + e.message);
    }

    if (m < mData.length - 1) Utilities.sleep(1000);
  }

  // ── 5. Resumo ──
  var vazios = 0;
  for (var vr = 1; vr < catData.length; vr++) {
    if (String(catData[vr][iStatus] || '') === 'vazio') vazios++;
  }

  var msgFinal = totalMatches + ' matches realizados.\n'
    + vazios + ' linhas ainda vazias (gaps de conteúdo).\n'
    + 'Rode "Gerar Resumos para Tutor IA" para gerar resumos dos conteúdos cobertos.';
  SpreadsheetApp.getActive().toast(msgFinal, 'Match Moodle', 10);
  Logger.log('matchMoodleCatalogo: ' + totalMatches + ' matches, ' + vazios + ' vazios');
}
