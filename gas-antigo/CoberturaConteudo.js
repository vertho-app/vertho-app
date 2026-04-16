// ═══════════════════════════════════════════════════════════════════════════════
// CoberturaConteudo.js — Matriz de cobertura: Competências × Descritores × Nível
// Vertho Mentor IA
//
// Cruza Competencias_v2 (todas as combinações possíveis) com Catalogo_Enriquecido
// (conteúdo existente) para identificar gaps de conteúdo por cargo, competência,
// descritor e faixa de nível.
//
// Aba gerada: Cobertura_Conteudo
// ═══════════════════════════════════════════════════════════════════════════════

var _COB_ABA = 'Cobertura_Conteudo';

/**
 * Gera a matriz de cobertura de conteúdo.
 * Cruza V2 × Catálogo Enriquecido e sinaliza gaps.
 */
function gerarCoberturaConteudo() {
  var ss = _cobSpreadsheet();

  // ── 1. Ler Competencias_v2 (todas as combinações cargo×comp×descritor) ────
  var v2 = _cobLerV2(ss);
  if (!v2.length) {
    // Debug: diferenciar entre "aba não existe" e "colunas não encontradas"
    var ws = _cobFindSheet(ss, ['Competencias_v2', 'Competências_v2', 'Competencias_V2', 'Competencias v2', 'CompetenciasV2']);
    var abas = ss.getSheets().map(function(s) { return s.getName(); }).join(', ');
    if (!ws) {
      SpreadsheetApp.getUi().alert('Aba Competencias_v2 não encontrada.\n\nAbas existentes: ' + abas);
    } else {
      var hdr = ws.getLastRow() > 0 ? ws.getRange(1, 1, 1, ws.getLastColumn()).getValues()[0] : [];
      var hdrNorm = hdr.map(function(h, i) { return i + '="' + h + '" → ' + _cobNormH(String(h)); });
      SpreadsheetApp.getUi().alert('Aba encontrada (' + ws.getName() + ', ' + ws.getLastRow() + ' linhas, ' + ws.getLastColumn() + ' colunas)'
        + '\nMas colunas obrigatórias não mapeadas.'
        + '\n\nHeaders:\n' + hdrNorm.join('\n')
        + '\n\nBuscando: "competencia" e "nomecurto"');
    }
    return;
  }

  // ── 2. Ler Catalogo_Enriquecido (conteúdo existente) ─────────────────────
  var catalogo = _cobLerCatalogo(ss);

  // ── 3. Cruzar e montar matriz ─────────────────────────────────────────────
  var resultado = _cobCruzar(v2, catalogo);

  // ── 4. Gravar aba ─────────────────────────────────────────────────────────
  _cobGravar(ss, resultado);

  SpreadsheetApp.getActive().toast(
    '✅ Matriz gerada!\n' + resultado.linhas.length + ' linhas, '
      + resultado.totalGaps + ' gaps identificados.',
    'Cobertura de Conteúdo', 10
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// LEITURAS
// ═══════════════════════════════════════════════════════════════════════════════

function _cobSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

// Normalização agressiva (sem espaços) — para header lookup
function _cobNormH(s) {
  return String(s || '').toLowerCase()
    .replace(/[áàâãä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i')
    .replace(/[óòôõö]/g, 'o').replace(/[úùûü]/g, 'u').replace(/[ç]/g, 'c')
    .replace(/[^a-z0-9]/g, '');
}

// Normalização suave (com espaços) — para match de nomes de comp/descritor
function _cobNorm(s) {
  return String(s || '').toLowerCase()
    .replace(/[áàâãä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i')
    .replace(/[óòôõö]/g, 'o').replace(/[úùûü]/g, 'u').replace(/[ç]/g, 'c')
    .replace(/\s+/g, ' ').trim();
}

/**
 * Lê Competencias_v2 e retorna array de {cargo, comp, descritor, codComp, codDesc}
 */
function _cobFindSheet(ss, nomes) {
  for (var i = 0; i < nomes.length; i++) {
    var ws = ss.getSheetByName(nomes[i]);
    if (ws && ws.getLastRow() >= 2) return ws;
  }
  // Fallback: procurar por substring
  var sheets = ss.getSheets();
  for (var j = 0; j < sheets.length; j++) {
    var nome = sheets[j].getName().toLowerCase();
    for (var k = 0; k < nomes.length; k++) {
      if (nome.indexOf(nomes[k].toLowerCase()) >= 0) return sheets[j];
    }
  }
  return null;
}

function _cobLerV2(ss) {
  var ws = _cobFindSheet(ss, ['Competencias_v2', 'Competências_v2', 'Competencias_V2', 'Competencias v2', 'CompetenciasV2']);
  if (!ws || ws.getLastRow() < 2) return [];

  var dados = ws.getDataRange().getValues();
  var hdr = dados[0];
  var _h = function(l) {
    var lNorm = _cobNormH(l);
    return hdr.findIndex(function(h) { return _cobNormH(String(h || '')).indexOf(lNorm) >= 0; });
  };

  var iCargo    = _h('cargo');
  var iComp     = _h('competencia');
  var iCodComp  = _h('codcomp');
  var iCodDesc  = _h('coddesc');
  var iNomeCurto= _h('nomecurto');

  if (iComp < 0 || iNomeCurto < 0) return [];

  var result = [];
  for (var r = 1; r < dados.length; r++) {
    var cargo   = iCargo >= 0 ? String(dados[r][iCargo] || '').trim() : '';
    var comp    = String(dados[r][iComp] || '').trim().replace(/\s*\([^)]*\)\s*$/, '');
    var desc    = String(dados[r][iNomeCurto] || '').trim();
    var codComp = iCodComp >= 0 ? String(dados[r][iCodComp] || '').trim() : '';
    var codDesc = iCodDesc >= 0 ? String(dados[r][iCodDesc] || '').trim() : '';
    if (!comp || !desc) continue;

    result.push({
      cargo:    cargo.replace(/\(a\)/g, '').trim().toLowerCase(),
      comp:     comp,
      descritor: desc,
      codComp:  codComp,
      codDesc:  codDesc
    });
  }
  return result;
}

/**
 * Lê Catalogo_Enriquecido e retorna array de {cargo, comp, descritores[], nivel}
 */
function _cobLerCatalogo(ss) {
  var ws = _cobFindSheet(ss, ['Catalogo_Enriquecido', 'Catálogo_Enriquecido', 'CatalogoEnriquecido']);
  if (!ws || ws.getLastRow() < 2) return [];

  var dados = ws.getDataRange().getValues();
  var hdr = dados[0];
  var _h = function(l) {
    var lNorm = _cobNormH(l);
    return hdr.findIndex(function(h) { return _cobNormH(String(h || '')).indexOf(lNorm) >= 0; });
  };

  var iCargo = _h('cargo');
  var iComp  = _h('comp. confirmada'); if (iComp < 0) iComp = _h('confirmada');
  var iD1    = _h('descritor 1');
  var iD2    = _h('descritor 2');
  var iD3    = _h('descritor 3');
  var iNivel = _h('nivel ideal'); if (iNivel < 0) iNivel = _h('nivel');
  var iTipo  = _h('tipo');
  var iCurso = _h('curso');
  var iUrl   = _h('url');

  if (iComp < 0) return [];

  var result = [];
  for (var r = 1; r < dados.length; r++) {
    var tipo = iTipo >= 0 ? String(dados[r][iTipo] || '').toLowerCase() : '';
    if (tipo === 'administrativo') continue;

    var comp = String(dados[r][iComp] || '').trim();
    if (!comp || comp === 'Indefinido' || comp === 'ERRO') continue;

    var descs = [];
    [iD1, iD2, iD3].forEach(function(idx) {
      if (idx >= 0) {
        var v = String(dados[r][idx] || '').trim();
        if (v) descs.push(v);
      }
    });

    result.push({
      cargo:      iCargo >= 0 ? String(dados[r][iCargo] || '').toLowerCase().trim() : '',
      comp:       comp.replace(/\s*\([^)]*\)\s*$/, ''),
      descritores: descs,
      nivel:      iNivel >= 0 ? (Number(dados[r][iNivel]) || 0) : 0,
      curso:      iCurso >= 0 ? String(dados[r][iCurso] || '').trim() : '',
      url:        iUrl >= 0 ? String(dados[r][iUrl] || '').trim() : ''
    });
  }
  return result;
}


// ═══════════════════════════════════════════════════════════════════════════════
// CRUZAMENTO
// ═══════════════════════════════════════════════════════════════════════════════

function _cobCruzar(v2, catalogo) {
  // Faixas de nível: conteúdo nível 1 ajuda transição N1→N2, nível 2 ajuda N2→N3, etc.
  var FAIXAS = [
    { label: 'N1→N2', niveis: [1] },
    { label: 'N2→N3', niveis: [2] }
  ];

  // Indexar catálogo: chave = "cargo|compNorm|descNorm" → {n1: [cursos], n2: [...], ...}
  var indice = {};
  catalogo.forEach(function(cat) {
    var cargoN = _cobNorm(cat.cargo);
    var compN  = _cobNorm(cat.comp);
    cat.descritores.forEach(function(d) {
      var descN = _cobNorm(d);
      var chave = cargoN + '|' + compN + '|' + descN;
      if (!indice[chave]) indice[chave] = {};
      var nKey = 'n' + cat.nivel;
      if (!indice[chave][nKey]) indice[chave][nKey] = [];
      indice[chave][nKey].push({ curso: cat.curso, url: cat.url });
    });
  });

  // Também indexar sem descritor (nível geral da competência para aquele cargo)
  var indiceComp = {};
  catalogo.forEach(function(cat) {
    var chave = _cobNorm(cat.cargo) + '|' + _cobNorm(cat.comp);
    if (!indiceComp[chave]) indiceComp[chave] = {};
    var nKey = 'n' + cat.nivel;
    if (!indiceComp[chave][nKey]) indiceComp[chave][nKey] = [];
    indiceComp[chave][nKey].push({ curso: cat.curso, url: cat.url });
  });

  var linhas = [];
  var totalGaps = 0;

  v2.forEach(function(item) {
    var cargoN = _cobNorm(item.cargo);
    var compN  = _cobNorm(item.comp);
    var descN  = _cobNorm(item.descritor);
    var chave  = cargoN + '|' + compN + '|' + descN;
    var chaveComp = cargoN + '|' + compN;

    var celulas = [];
    FAIXAS.forEach(function(faixa) {
      // Contar cursos que cobrem este descritor nesta faixa
      var cursos = [];
      var seen = {};
      faixa.niveis.forEach(function(n) {
        // Match direto por descritor
        var idx = indice[chave];
        if (idx && idx['n' + n]) {
          idx['n' + n].forEach(function(c) {
            if (!seen[c.url]) { seen[c.url] = true; cursos.push(c); }
          });
        }
      });

      // Se não achou match por descritor, verificar cobertura geral da comp
      var qtdDesc = cursos.length;
      var qtdComp = 0;
      if (qtdDesc === 0) {
        faixa.niveis.forEach(function(n) {
          var idxC = indiceComp[chaveComp];
          if (idxC && idxC['n' + n]) qtdComp += idxC['n' + n].length;
        });
      }

      var status, detalhe;
      if (qtdDesc >= 2) {
        status = '🟢';
        detalhe = qtdDesc + ' cursos';
      } else if (qtdDesc === 1) {
        status = '🟡';
        detalhe = '1 curso';
      } else if (qtdComp > 0) {
        status = '🟡';
        detalhe = 'Comp. coberta (' + qtdComp + '), descritor não';
      } else {
        status = '🔴';
        detalhe = 'Sem conteúdo';
        totalGaps++;
      }

      celulas.push({
        status: status,
        detalhe: detalhe,
        qtd: qtdDesc,
        cursos: cursos.map(function(c) { return c.curso; }).join(', ')
      });
    });

    linhas.push({
      cargo:    item.cargo,
      comp:     item.comp,
      descritor: item.descritor,
      codComp:  item.codComp,
      codDesc:  item.codDesc,
      faixas:   celulas
    });
  });

  return { linhas: linhas, totalGaps: totalGaps, faixas: FAIXAS };
}


// ═══════════════════════════════════════════════════════════════════════════════
// GRAVAÇÃO
// ═══════════════════════════════════════════════════════════════════════════════

function _cobGravar(ss, resultado) {
  var ws = ss.getSheetByName(_COB_ABA);
  if (ws) {
    ws.clear();
  } else {
    ws = ss.insertSheet(_COB_ABA);
  }

  var FAIXAS = resultado.faixas;

  // ── Headers ─────────────────────────────────────────────────────────────────
  var headers = ['Cargo', 'Competência', 'Descritor'];
  FAIXAS.forEach(function(f) {
    headers.push(f.label + ' Status');
    headers.push(f.label + ' Qtd');
    headers.push(f.label + ' Cursos');
  });
  headers.push('Cobertura Geral');

  ws.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold')
    .setBackground('#0F2B54')
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');
  ws.setFrozenRows(1);

  if (!resultado.linhas.length) return;

  // ── Dados ───────────────────────────────────────────────────────────────────
  var dados = resultado.linhas.map(function(lin) {
    var row = [
      lin.cargo,
      lin.comp,
      lin.descritor
    ];

    var gaps = 0, totFaixas = FAIXAS.length;
    lin.faixas.forEach(function(f) {
      row.push(f.status + ' ' + f.detalhe);
      row.push(f.qtd);
      row.push(f.cursos);
      if (f.status === '🔴') gaps++;
    });

    // Cobertura geral
    var cobertos = totFaixas - gaps;
    var pct = Math.round((cobertos / totFaixas) * 100);
    var geral;
    if (gaps === 0)          geral = '🟢 ' + pct + '%';
    else if (gaps < totFaixas) geral = '🟡 ' + pct + '%';
    else                       geral = '🔴 0%';
    row.push(geral);

    return row;
  });

  ws.getRange(2, 1, dados.length, headers.length).setValues(dados);

  // ── Formatação ──────────────────────────────────────────────────────────────
  // Larguras
  ws.setColumnWidth(1, 110);  // Cargo
  ws.setColumnWidth(2, 280);  // Competência
  ws.setColumnWidth(3, 250);  // Descritor

  for (var f = 0; f < FAIXAS.length; f++) {
    var base = 4 + (f * 3);
    ws.setColumnWidth(base, 180);     // Status
    ws.setColumnWidth(base + 1, 50);  // Qtd
    ws.setColumnWidth(base + 2, 200); // Cursos
  }

  // Colorir linhas com gaps
  for (var r = 0; r < dados.length; r++) {
    var rowNum = r + 2;
    var row = dados[r];
    var geral = row[row.length - 1];
    if (geral.indexOf('🔴') >= 0) {
      ws.getRange(rowNum, 1, 1, headers.length).setBackground('#FDE8E8');
    } else if (geral.indexOf('🟡') >= 0) {
      ws.getRange(rowNum, 1, 1, headers.length).setBackground('#FEF9E7');
    }
  }

  // Merge visual: agrupar linhas do mesmo cargo+comp
  var lastCargo = '', lastComp = '', startRow = 2;
  for (var i = 0; i < dados.length; i++) {
    var cargo = dados[i][0], comp = dados[i][1];
    var grupo = cargo + '|' + comp;
    var prevGrupo = lastCargo + '|' + lastComp;

    if (i > 0 && grupo !== prevGrupo) {
      // Separador visual: borda inferior na última linha do grupo anterior
      if (i - (startRow - 2) > 1) {
        ws.getRange(startRow, 1, i - (startRow - 2), 1).mergeVertically();
        ws.getRange(startRow, 2, i - (startRow - 2), 1).mergeVertically();
      }
      startRow = i + 2;
    }
    lastCargo = cargo;
    lastComp = comp;
  }
  // Último grupo
  if (dados.length - (startRow - 2) > 1) {
    ws.getRange(startRow, 1, dados.length - (startRow - 2) + 1, 1).mergeVertically();
    ws.getRange(startRow, 2, dados.length - (startRow - 2) + 1, 1).mergeVertically();
  }

  // Resumo final
  var totalLinhas = dados.length;
  var totalGapsN = resultado.totalGaps;
  var totalCobertos = (totalLinhas * FAIXAS.length) - totalGapsN;
  var totalPossivel = totalLinhas * FAIXAS.length;
  var pctGeral = totalPossivel > 0 ? Math.round((totalCobertos / totalPossivel) * 100) : 0;

  var resumoRow = totalLinhas + 3;
  ws.getRange(resumoRow, 1).setValue('RESUMO').setFontWeight('bold');
  ws.getRange(resumoRow, 2).setValue(
    'Total: ' + totalLinhas + ' descritores × ' + FAIXAS.length + ' faixas = '
    + totalPossivel + ' slots | Cobertos: ' + totalCobertos + ' (' + pctGeral + '%) | Gaps: ' + totalGapsN
  );
  ws.getRange(resumoRow, 1, 1, headers.length).setBackground('#E8F0FE').setFontWeight('bold');

  Logger.log('Cobertura gerada: ' + totalLinhas + ' linhas, ' + totalGapsN + ' gaps, ' + pctGeral + '% cobertura');
}
