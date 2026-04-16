// ═══════════════════════════════════════════════════════════════════════════════
// PlenariaEvolucao.js — Relatório Consolidado de Plenária de EVOLUÇÃO
// Vertho Mentor IA
//
// Relatório SEPARADO da Plenária Inicial (relatorio_plenaria.js).
// Agrega dados da aba Evolucao e Evolucao_Descritores para gerar visão
// coletiva de quem evoluiu, onde, quanto e recomendações para ciclo 2.
// ═══════════════════════════════════════════════════════════════════════════════

var _PLEVO_ABA_EVOLUCAO     = 'Evolucao';
var _PLEVO_ABA_DESCRITORES  = 'Evolucao_Descritores';
var _PLEVO_PASTA_ID         = '107Sq2qVxlrmQGkKvTKT3JQ6XUQQ1r5HX'; // Mesma pasta dos relatórios
var _PLEVO_LOGO_ID          = '1hBzuxzTNN4OEcii4BD6nHx8NgC6CQp9J';


// ── PONTO DE ENTRADA ────────────────────────────────────────────────────────

function gerarPlenariaEvolucao() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  _carregarCFG();
  SpreadsheetApp.getActive().toast('Coletando dados de evolução...', '📈 Plenária Evolução', 10);

  var dados = _plevoColetarDados(ss);
  if (!dados || dados.totalColaboradores === 0) {
    SpreadsheetApp.getUi().alert('Nenhum dado de evolução encontrado.\nRode "Relatório de Evolução" antes.');
    return;
  }

  var modelo = (_CFG && _CFG.modelo) || Config.MODEL_RELATORIO;
  SpreadsheetApp.getActive().toast(
    '[' + Config.modelLabel(modelo) + ']\n' + dados.totalColaboradores + ' profissionais analisados',
    '📈 Gerando plenária de evolução...', 30
  );

  var systemPrompt = _plevoBuildSystemPrompt();
  var userPrompt   = _plevoBuildUserPrompt(dados);
  var analise      = _plevoChamarIA(systemPrompt, userPrompt, modelo);

  SpreadsheetApp.getActive().toast('Gerando PDF...', '📈 Plenária Evolução', 10);
  var url = _plevoSalvarDoc(analise, dados);

  SpreadsheetApp.getActive().toast('Plenária de Evolução gerada! ' + url, '✅ Concluído', 15);
}


// ═══════════════════════════════════════════════════════════════════════════════
// 1. COLETA DE DADOS DA ABA EVOLUCAO + EVOLUCAO_DESCRITORES
// ═══════════════════════════════════════════════════════════════════════════════

function _plevoColetarDados(ss) {
  var wsEvo  = ss.getSheetByName(_PLEVO_ABA_EVOLUCAO);
  var wsDesc = ss.getSheetByName(_PLEVO_ABA_DESCRITORES);
  if (!wsEvo || wsEvo.getLastRow() < 2) return { totalColaboradores: 0 };

  var evoData  = wsEvo.getDataRange().getValues();
  var evoH     = evoData[0];
  var _h = function(label) {
    var lNorm = _norm(label).toLowerCase();
    return evoH.findIndex(function(h) { return _norm(h || '').toLowerCase().indexOf(lNorm) >= 0; });
  };

  var iEmail    = _h('email');
  var iNome     = _h('nome');
  var iCargo    = _h('cargo');
  var iEscola   = _h('escola');
  var iCompId   = _h('competencia_id');
  var iCompNome = _h('competencia_nome');
  var iNotaA    = _h('nota_a');
  var iNivelA   = _h('nivel_a');
  var iNotaB    = _h('nota_b');
  var iNivelB   = _h('nivel_b');
  var iDelta    = _h('delta');
  var iDescSub  = _h('descritores_subiram');
  var iConvRes  = _h('convergencia_resumo');
  var iGaps     = _h('gaps_persistentes');
  var iFoco     = _h('foco_ciclo2');

  var colaboradores = [];
  var porCargo = {};
  var porEscola = {};
  var porComp = {};
  var totalDelta = 0;
  var totalDescSub = 0;

  for (var r = 1; r < evoData.length; r++) {
    var row = evoData[r];
    var email = String(row[iEmail] || '').trim();
    if (!email) continue;

    var cargo    = String(row[iCargo] || '').trim();
    var escola   = String(row[iEscola] || '').trim();
    var compNome = String(row[iCompNome] || '').trim();
    var delta    = Number(row[iDelta]) || 0;
    var descSub  = Number(row[iDescSub]) || 0;
    var nivelA   = Number(row[iNivelA]) || 0;
    var nivelB   = Number(row[iNivelB]) || 0;

    var entry = {
      email: email,
      nome: String(row[iNome] || '').trim(),
      cargo: cargo,
      escola: escola,
      compId: String(row[iCompId] || '').trim(),
      compNome: compNome,
      notaA: Number(row[iNotaA]) || 0,
      nivelA: nivelA,
      notaB: Number(row[iNotaB]) || 0,
      nivelB: nivelB,
      delta: delta,
      descSub: descSub,
      convergencia: String(row[iConvRes] || '').trim(),
      gaps: String(row[iGaps] || '').trim(),
      foco: String(row[iFoco] || '').trim()
    };

    colaboradores.push(entry);
    totalDelta += delta;
    totalDescSub += descSub;

    // Agrupar por cargo
    if (!porCargo[cargo]) porCargo[cargo] = [];
    porCargo[cargo].push(entry);

    // Agrupar por escola
    if (!porEscola[escola]) porEscola[escola] = [];
    porEscola[escola].push(entry);

    // Agrupar por competência
    if (!porComp[compNome]) porComp[compNome] = [];
    porComp[compNome].push(entry);
  }

  // Ler descritores detalhados
  var descritores = [];
  if (wsDesc && wsDesc.getLastRow() >= 2) {
    var descData = wsDesc.getDataRange().getValues();
    var descH = descData[0];
    var _hd = function(label) {
      var lN = _norm(label).toLowerCase();
      return descH.findIndex(function(h) { return _norm(h || '').toLowerCase().indexOf(lN) >= 0; });
    };
    var idEmail2  = _hd('email');
    var idDesc    = _hd('descritor_nome'); if (idDesc < 0) idDesc = _hd('descritor');
    var idNivelA2 = _hd('nivel_a');
    var idNivelB2 = _hd('nivel_b');
    var idConv    = _hd('convergencia');

    for (var d = 1; d < descData.length; d++) {
      descritores.push({
        email:       String(descData[d][idEmail2] || '').trim(),
        descritor:   String(descData[d][idDesc] || '').trim(),
        nivelA:      Number(descData[d][idNivelA2]) || 0,
        nivelB:      Number(descData[d][idNivelB2]) || 0,
        convergencia: String(descData[d][idConv] || '').trim()
      });
    }
  }

  // Calcular padrões de convergência
  var convCounts = { confirmada: 0, parcial: 0, sem_evolucao: 0, invisivel: 0 };
  descritores.forEach(function(d) {
    var c = d.convergencia.toLowerCase().replace(/[^a-z_]/g, '');
    if (c.indexOf('confirmada') >= 0) convCounts.confirmada++;
    else if (c.indexOf('parcial') >= 0) convCounts.parcial++;
    else if (c.indexOf('sem') >= 0) convCounts.sem_evolucao++;
    else if (c.indexOf('invisivel') >= 0) convCounts.invisivel++;
  });

  // Gaps persistentes mais comuns
  var gapCount = {};
  colaboradores.forEach(function(c) {
    (c.gaps || '').split(/[,|;]/).forEach(function(g) {
      g = g.trim();
      if (g) gapCount[g] = (gapCount[g] || 0) + 1;
    });
  });
  var topGaps = Object.keys(gapCount).sort(function(a, b) { return gapCount[b] - gapCount[a]; }).slice(0, 10);

  return {
    totalColaboradores: colaboradores.length,
    deltaMedia: colaboradores.length > 0 ? (totalDelta / colaboradores.length).toFixed(2) : 0,
    descSubMedia: colaboradores.length > 0 ? (totalDescSub / colaboradores.length).toFixed(1) : 0,
    colaboradores: colaboradores,
    porCargo: porCargo,
    porEscola: porEscola,
    porComp: porComp,
    descritores: descritores,
    convergencia: convCounts,
    topGaps: topGaps,
    gapCount: gapCount
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// 2. PROMPTS
// ═══════════════════════════════════════════════════════════════════════════════

function _plevoBuildSystemPrompt() {
  return [
    'Voce e o Motor de Plenaria de Evolucao da Vertho Mentor IA.',
    'Sua tarefa e analisar dados AGREGADOS de evolucao de um grupo de profissionais da educacao',
    'apos um ciclo de 14 semanas de capacitacao, e produzir um relatorio coletivo para plenaria.',
    '',
    'ESTE RELATORIO E DIFERENTE DA PLENARIA INICIAL.',
    'A Plenaria Inicial mostra o diagnostico. Esta mostra a EVOLUCAO.',
    '',
    'ESTRUTURA DO RELATORIO:',
    '',
    '1. VISAO GERAL DA EVOLUCAO',
    '   - Delta medio do grupo',
    '   - % de colaboradores que subiram de nivel',
    '   - Descritores com maior evolucao coletiva',
    '',
    '2. ANALISE POR CARGO',
    '   - Para cada cargo: delta medio, gaps persistentes mais comuns, destaques',
    '',
    '3. ANALISE POR COMPETENCIA',
    '   - Para cada competencia: evolucao media, descritores que mais evoluiram,',
    '     descritores com gap persistente',
    '',
    '4. CONVERGENCIA DE EVIDENCIAS',
    '   - % de descritores com evolucao confirmada (cenario + conversa convergem)',
    '   - % com evolucao parcial (so uma fonte confirma)',
    '   - % sem evolucao',
    '   - Padroes: "Se muitos parciais, pode indicar aprendizado teorico sem mudanca pratica"',
    '',
    '5. GAPS PERSISTENTES — ALERTA INSTITUCIONAL',
    '   - Listar os descritores com mais gaps persistentes',
    '   - Padroes coletivos: "3 de 6 diretores ainda com gap em D4"',
    '   - Conexao com perfil CIS coletivo se disponivel',
    '',
    '6. RECOMENDACOES PARA CICLO 2',
    '   - Descritores prioritarios para o proximo ciclo',
    '   - Formato de trilha sugerido (baseado no que funcionou)',
    '   - Acoes institucionais recomendadas',
    '',
    'REGRAS:',
    '- Dados sao ANONIMOS — NUNCA mencionar nomes de colaboradores',
    '- Usar estatisticas e porcentagens, nao casos individuais',
    '- Tom institucional, construtivo, orientado a acao',
    '- Celebrar avancos antes de apontar gaps',
    '- Texto em portugues brasileiro',
    '- Responda APENAS o texto do relatorio, sem JSON',
    '- Use markdown para formatacao (##, **negrito**, listas)'
  ].join('\n');
}

function _plevoBuildUserPrompt(dados) {
  var lines = [];
  lines.push('═══ DADOS AGREGADOS DE EVOLUCAO ═══');
  lines.push('Total de colaboradores: ' + dados.totalColaboradores);
  lines.push('Delta medio (nota): ' + dados.deltaMedia);
  lines.push('Media de descritores que subiram: ' + dados.descSubMedia + ' de 6');
  lines.push('');

  // Convergência
  var conv = dados.convergencia;
  var totalConv = conv.confirmada + conv.parcial + conv.sem_evolucao + conv.invisivel;
  lines.push('═══ CONVERGENCIA DE EVIDENCIAS (total: ' + totalConv + ' descritores) ═══');
  lines.push('Confirmada: ' + conv.confirmada + ' (' + (totalConv > 0 ? Math.round(conv.confirmada / totalConv * 100) : 0) + '%)');
  lines.push('Parcial: ' + conv.parcial + ' (' + (totalConv > 0 ? Math.round(conv.parcial / totalConv * 100) : 0) + '%)');
  lines.push('Sem evolucao: ' + conv.sem_evolucao + ' (' + (totalConv > 0 ? Math.round(conv.sem_evolucao / totalConv * 100) : 0) + '%)');
  lines.push('Invisivel: ' + conv.invisivel);
  lines.push('');

  // Por cargo
  lines.push('═══ POR CARGO ═══');
  Object.keys(dados.porCargo).forEach(function(cargo) {
    var grupo = dados.porCargo[cargo];
    var deltaSum = grupo.reduce(function(s, c) { return s + c.delta; }, 0);
    var deltaMed = (deltaSum / grupo.length).toFixed(2);
    var subiramNivel = grupo.filter(function(c) { return c.nivelB > c.nivelA; }).length;
    lines.push(cargo + ': ' + grupo.length + ' profissionais | Delta medio: ' + deltaMed + ' | Subiram nivel: ' + subiramNivel);
  });
  lines.push('');

  // Por competência
  lines.push('═══ POR COMPETENCIA ═══');
  Object.keys(dados.porComp).forEach(function(comp) {
    var grupo = dados.porComp[comp];
    var deltaSum = grupo.reduce(function(s, c) { return s + c.delta; }, 0);
    var deltaMed = (deltaSum / grupo.length).toFixed(2);
    var gapsComp = [];
    grupo.forEach(function(c) {
      if (c.gaps) gapsComp.push(c.gaps);
    });
    lines.push(comp + ': ' + grupo.length + ' avaliados | Delta medio: ' + deltaMed + ' | Gaps: ' + (gapsComp.join('; ') || 'nenhum'));
  });
  lines.push('');

  // Gaps mais frequentes
  lines.push('═══ GAPS PERSISTENTES MAIS FREQUENTES ═══');
  dados.topGaps.forEach(function(g) {
    lines.push(g + ': ' + dados.gapCount[g] + ' ocorrencias');
  });

  return lines.join('\n');
}


// ═══════════════════════════════════════════════════════════════════════════════
// 3. CHAMAR IA
// ═══════════════════════════════════════════════════════════════════════════════

function _plevoChamarIA(systemPrompt, userPrompt, modelo) {
  var isGPT = modelo && modelo.toLowerCase().indexOf('gpt') >= 0;
  var texto;
  if (isGPT) {
    texto = _ia4OpenAIRawV2(systemPrompt, userPrompt, modelo, false);
  } else {
    texto = _ia4ClaudeRawV2(systemPrompt, userPrompt, modelo, false);
  }
  return texto || '';
}


// ═══════════════════════════════════════════════════════════════════════════════
// 4. GERAR DOCUMENTO
// ═══════════════════════════════════════════════════════════════════════════════

function _plevoSalvarDoc(analise, dados) {
  var titulo = 'Plenária de Evolução — ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy');

  // Criar documento Google Docs
  var doc = DocumentApp.create(titulo);
  var body = doc.getBody();

  // Logo (se disponível)
  try {
    var logo = DriveApp.getFileById(_PLEVO_LOGO_ID).getBlob();
    var img = body.appendImage(logo);
    img.setWidth(200);
    img.setHeight(60);
  } catch(e) {
    Logger.log('PlenariaEvolucao: logo não encontrada — ' + e.message);
  }

  body.appendParagraph(titulo)
    .setHeading(DocumentApp.ParagraphHeading.HEADING1)
    .setForegroundColor('#0F2B54');

  body.appendParagraph(dados.totalColaboradores + ' profissionais | Delta médio: ' + dados.deltaMedia)
    .setForegroundColor('#666666');

  body.appendHorizontalRule();

  // Inserir análise da IA
  var paragrafos = analise.split('\n');
  paragrafos.forEach(function(p) {
    p = p.trim();
    if (!p) { body.appendParagraph(''); return; }

    if (p.match(/^##\s/)) {
      body.appendParagraph(p.replace(/^##\s*/, ''))
        .setHeading(DocumentApp.ParagraphHeading.HEADING2)
        .setForegroundColor('#0F2B54');
    } else if (p.match(/^###\s/)) {
      body.appendParagraph(p.replace(/^###\s*/, ''))
        .setHeading(DocumentApp.ParagraphHeading.HEADING3)
        .setForegroundColor('#0D9488');
    } else if (p.match(/^[-*]\s/)) {
      body.appendListItem(p.replace(/^[-*]\s*/, ''));
    } else {
      // Converter **negrito**
      var par = body.appendParagraph('');
      var partes = p.split(/(\*\*[^*]+\*\*)/g);
      partes.forEach(function(parte) {
        if (parte.match(/^\*\*.*\*\*$/)) {
          par.appendText(parte.replace(/\*\*/g, '')).setBold(true);
        } else if (parte) {
          par.appendText(parte);
        }
      });
    }
  });

  // Rodapé
  body.appendHorizontalRule();
  body.appendParagraph('Relatório gerado automaticamente pela Vertho Mentor IA — ' +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm"))
    .setForegroundColor('#999999')
    .setFontSize(8);

  doc.saveAndClose();

  // Mover para pasta
  try {
    var file = DriveApp.getFileById(doc.getId());
    var pasta = DriveApp.getFolderById(_PLEVO_PASTA_ID);
    pasta.addFile(file);
    DriveApp.getRootFolder().removeFile(file);
  } catch(e) {
    Logger.log('PlenariaEvolucao: não moveu para pasta — ' + e.message);
  }

  return doc.getUrl();
}
