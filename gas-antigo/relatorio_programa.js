// ═══════════════════════════════════════════════════════════════════════════════
// VERTHO — relatorio_programa.gs  v3.7
// ═══════════════════════════════════════════════════════════════════════════════

// Pasta dedicada para Relatório RH e Relatório do Gestor
var PASTA_RELATORIOS = '107Sq2qVxlrmQGkKvTKT3JQ6XUQQ1r5HX';

function gerarRelatorioRHManual() {
  _carregarCFG();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  SpreadsheetApp.getActive().toast('Coletando dados de todas as equipes...', '📊 Relatório RH', 8);
  _addLog('📊 Iniciando geração do Relatório Consolidado RH...');
  try {
    const dados = _coletarDadosPrograma(ss);
    if (!dados || dados.totalColaboradores === 0) {
      SpreadsheetApp.getUi().alert(
        '⚠️ Nenhum colaborador avaliado encontrado.\n\n' +
        'Execute a IA 4 (Avaliar Respostas) antes de gerar o Relatório do Programa.'
      );
      return;
    }
    SpreadsheetApp.getActive().toast(`[${Config.modelLabel(_CFG.modelo)}]\n${dados.totalColaboradores} colaboradores carregados. Chamando IA...`, '📊 Relatório RH', 8);
    const analise = _iaAnalisarPrograma(dados);
    SpreadsheetApp.getActive().toast('Gerando documento...', '📊 Relatório RH', 8);
    const pdfFile = _criarDocRelatorioRH(dados, analise, ss);
    _addLog(`✅ Relatório RH gerado: ${pdfFile.getName()}`);
    SpreadsheetApp.getUi().alert(
      `✅ Relatório Consolidado gerado!\n\n` +
      `📊 ${dados.totalColaboradores} colaboradores · ${dados.totalEquipes} equipe(s)\n\n` +
      `O relatório foi salvo na pasta do programa e enviado aos destinatários configurados.\n\n` +
      `Acesse em: ${pdfFile.getUrl()}`
    );
  } catch (e) {
    const msg = `Erro ao gerar Relatório RH: ${e.message}`;
    Logger.log(msg + '\nStack: ' + (e.stack || 'N/A'));
    _addLog('❌ ' + msg);
    SpreadsheetApp.getUi().alert('❌ ' + msg);
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// 1. COLETA DE DADOS
// ═══════════════════════════════════════════════════════════════════════════════

function _coletarDadosPrograma(ss) {
  const wsRespostas = ss.getSheetByName(ABA_RESPOSTAS);
  const wsColab     = ss.getSheetByName('Colaboradores');
  if (!wsRespostas) throw new Error('Aba "' + ABA_RESPOSTAS + '" não encontrada.');

  const headers = wsRespostas.getRange(1, 1, 1, wsRespostas.getLastColumn()).getValues()[0];
  const dados   = wsRespostas.getDataRange().getValues();

  const iIdColab   = _rpIdx(headers, 'ID Colaborador', 'e-mail');
  const iNomeColab = _rpIdx(headers, 'Nome Colaborador');
  const iEmpresa   = _rpIdx(headers, 'Empresa');
  const iCargo     = _rpIdx(headers, 'Cargo');
  const iNomeComp  = _rpIdx(headers, 'Nome Competência');
  const iNivel     = _rpIdx(headers, 'Nível IA4');
  const iNota      = _rpIdx(headers, 'Nota IA4');
  const iStatus    = _rpIdx(headers, 'Status IA 4');
  const iPayload   = _rpIdx(headers, 'Payload IA4');

  const gestoresPorColab = wsColab ? _mapearGestoresPorColab(wsColab) : {};
  const areasPorColab    = wsColab ? _rpMapearAreas(wsColab) : {};
  const porColab = {};

  dados.slice(1).forEach(row => {
    const status = _norm(String(row[iStatus] || '')).toLowerCase();
    if (!row[iNomeColab]) return;
    if (status !== 'avaliado' && status !== 'pdf enviado' && status !== 'pdf gerado') return;
    const emailColab = _norm(String(row[iIdColab] || ''));
    if (!emailColab) return;

    let payload = {};
    const rawPayload = row[iPayload];
    if (rawPayload && String(rawPayload).trim()) {
      try { payload = JSON.parse(String(rawPayload)); } catch(_) {}
    }

    const nivel  = parseInt(row[iNivel]) || payload.nivel || 1;
    const nota   = parseFloat((row[iNota] || '0').toString().replace(',', '.')) || nivel;
    const check  = payload.check_coerencia || null;
    const perfil = payload.perfil_dados    || null;

    if (!porColab[emailColab]) {
      const gest = gestoresPorColab[emailColab.toLowerCase()] || gestoresPorColab[emailColab] || {};
      porColab[emailColab] = {
        email: emailColab,
        nome:  _norm(String(row[iNomeColab] || '')),
        cargo: _norm(String(row[iCargo]     || '')),
        empresa:     _norm(String(row[iEmpresa] || '')),
        area:        areasPorColab[emailColab.toLowerCase()] || '',
        nomeGestor:  gest.nome  || '',
        emailGestor: gest.email || '',
        perfilDisc:  perfil || null,
        itens: [],
      };
    }
    porColab[emailColab].itens.push({
      comp:            _norm(String(row[iNomeComp] || '')),
      nivel, nota,
      alertaCoer:      check?.alerta        || '🟢',
      classCoer:       check?.classificacao || 'Alta Coerência',
      diagnosticoCoer: check?.diagnostico   || '',
    });
  });

  const colabs = Object.values(porColab).filter(c => c.itens.length > 0);
  if (colabs.length === 0) return { totalColaboradores: 0 };

  const porEquipe = {};
  colabs.forEach(colab => {
    const chave = colab.emailGestor || ('_sem_gestor_' + colab.area);
    if (!porEquipe[chave]) {
      porEquipe[chave] = { nomeGestor: colab.nomeGestor || '(sem gestor)',
        emailGestor: colab.emailGestor || '', empresa: colab.empresa, colabs: [] };
    }
    porEquipe[chave].colabs.push(colab);
  });

  const distAlertas = { '🔴': 0, '🟠': 0, '🟡': 0, '🟢': 0 };
  const ordemPior   = { '🔴': 0, '🟠': 1, '🟡': 2, '🟢': 3 };
  colabs.forEach(c => {
    const pior = c.itens.reduce((p, it) =>
      (ordemPior[it.alertaCoer] ?? 9) < (ordemPior[p] ?? 9) ? it.alertaCoer : p, '🟢');
    distAlertas[pior] = (distAlertas[pior] || 0) + 1;
  });

  const alertaScore = { '🟢': 4, '🟡': 3, '🟠': 2, '🔴': 1 };
  const todosItens  = colabs.flatMap(c => c.itens);
  const icom = todosItens.length > 0
    ? (todosItens.reduce((s, it) => s + (alertaScore[it.alertaCoer] || 2), 0) / todosItens.length).toFixed(2)
    : '—';

  const notasPorComp = {};
  todosItens.forEach(it => {
    if (!it.comp) return;
    if (!notasPorComp[it.comp]) notasPorComp[it.comp] = { soma: 0, n: 0, alertas: {} };
    notasPorComp[it.comp].soma += it.nota;
    notasPorComp[it.comp].n++;
    notasPorComp[it.comp].alertas[it.alertaCoer] = (notasPorComp[it.comp].alertas[it.alertaCoer] || 0) + 1;
  });
  const rankingCompetencias = Object.entries(notasPorComp)
    .map(([comp, d]) => ({
      comp,
      media:      parseFloat((d.soma / d.n).toFixed(2)),
      n:          d.n,
      alertas:    d.alertas,
      pctCritico: Math.round(((d.alertas['🔴'] || 0) / d.n) * 100),
    }))
    .sort((a, b) => a.media - b.media);

  const discAgregado = { D: [], I: [], S: [], C: [] };
  colabs.forEach(c => {
    if (!c.perfilDisc) return;
    const p = c.perfilDisc;
    if (p.d !== undefined) {
      discAgregado.D.push(Number(p.d) || 0);
      discAgregado.I.push(Number(p.i) || 0);
      discAgregado.S.push(Number(p.s) || 0);
      discAgregado.C.push(Number(p.c) || 0);
    }
  });
  const discMedias = {};
  ['D','I','S','C'].forEach(dim => {
    const arr = discAgregado[dim];
    discMedias[dim] = arr.length > 0 ? Math.round(arr.reduce((s,v) => s+v, 0) / arr.length) : null;
  });

  const rankingEquipes = Object.values(porEquipe).map(eq => {
    const alertasEq = { '🔴': 0, '🟠': 0, '🟡': 0, '🟢': 0 };
    const notasEq   = [];
    eq.colabs.forEach(c => {
      const piorC = c.itens.reduce((p, it) =>
        (alertaScore[it.alertaCoer] ?? 9) < (alertaScore[p] ?? 9) ? it.alertaCoer : p, '🟢');
      alertasEq[piorC] = (alertasEq[piorC] || 0) + 1;
      c.itens.forEach(it => notasEq.push(it.nota));
    });
    const mediaEq = notasEq.length > 0
      ? parseFloat((notasEq.reduce((s,v)=>s+v,0)/notasEq.length).toFixed(2)) : 0;
    const indicePrioridade =
      (alertasEq['🔴'] * 4) + (alertasEq['🟠'] * 2) + (alertasEq['🟡'] * 1) - (mediaEq * 0.5);
    return { nomeGestor: eq.nomeGestor, emailGestor: eq.emailGestor, empresa: eq.empresa,
      nColabs: eq.colabs.length, alertas: alertasEq, mediaGeral: mediaEq, indicePrioridade };
  }).sort((a, b) => b.indicePrioridade - a.indicePrioridade);

  // ── Contagem de trilhas para estimativa de esforço (AJUSTE 8) ─────────────
  let totalTrilhasGuiadas  = 0;
  let totalTrilhasExpansao = 0;
  colabs.forEach(c => {
    c.itens.forEach(it => {
      if (it.nota < 3) totalTrilhasGuiadas++;
      else             totalTrilhasExpansao++;
    });
  });

  return {
    empresa:            colabs[0]?.empresa || '',
    totalColaboradores: colabs.length,
    totalEquipes:       Object.keys(porEquipe).length,
    distAlertas, icom, discMedias, rankingCompetencias, rankingEquipes, porEquipe, colabs,
    totalTrilhasGuiadas, totalTrilhasExpansao,
    geradoEm: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'),
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// 2. ANÁLISE IA  (v3.3 — prompt revisado)
// ═══════════════════════════════════════════════════════════════════════════════

function _iaAnalisarPrograma(dados) {
  const resumoEquipes = dados.rankingEquipes.map((eq, i) =>
    `${i+1}. ${eq.nomeGestor} (${eq.nColabs} colabs) | Média: ${eq.mediaGeral} | ` +
    `🔴${eq.alertas['🔴']} 🟠${eq.alertas['🟠']} 🟡${eq.alertas['🟡']} 🟢${eq.alertas['🟢']}`
  ).join('\n');

  // AJUSTE 3: usar apenas nomes das competências (sem códigos)
  const resumoComps = dados.rankingCompetencias.slice(0, 10).map(c => {
    // Remove código se existir (ex: "2.1 Comunicação" → "Comunicação")
    const nomeClean = c.comp.replace(/^\d+[\.\-]\d*\s*/, '').trim() || c.comp;
    return `${nomeClean}: média ${c.media} | ${c.n} avaliações | ${c.pctCritico}% em 🔴`;
  }).join('\n');

  const discTexto = ['D','I','S','C'].map(dim => {
    const v = dados.discMedias[dim];
    return v !== null ? `${dim}=${v}` : null;
  }).filter(Boolean).join(' | ');

  const pctAtencao = dados.totalColaboradores > 0
    ? Math.round(((dados.distAlertas['🔴'] + dados.distAlertas['🟠'] + dados.distAlertas['🟡']) / dados.totalColaboradores) * 100)
    : 0;

  const prompt =
    `Você é a IA de desenvolvimento organizacional da Vertho.\n` +
    `Analise o mapeamento completo do programa e gere o Relatório Consolidado para o RH.\n\n` +

    `=== CONTEXTO CRÍTICO DA METODOLOGIA VERTHO ===\n` +
    `• As avaliações NÃO são autoavaliações nem 360°. A nota é gerada pela IA Vertho cruzando o perfil comportamental CIS do colaborador com o desempenho no Simulador PACE (cenários situacionais).\n` +
    `• Portanto, NÃO existe viés de aprovação, viés social ou leniência — a IA que avalia é a mesma que gera este relatório.\n` +
    `• Se a ausência de alertas vermelhos ocorrer, interprete como coerência genuína entre perfil e desempenho, NÃO como viés.\n` +
    `• NUNCA use os códigos numéricos das competências (ex: "2.1", "3.4"). Use SEMPRE o nome completo.\n\n` +

    `=== DADOS DO PROGRAMA ===\n` +
    `Empresa: ${dados.empresa}\n` +
    `Total colaboradores: ${dados.totalColaboradores} | Total equipes: ${dados.totalEquipes}\n` +
    `ICoM (Índice Coerência Médio): ${dados.icom}/4.00\n` +
    `Distribuição alertas: 🔴${dados.distAlertas['🔴']} 🟠${dados.distAlertas['🟠']} ` +
    `🟡${dados.distAlertas['🟡']} 🟢${dados.distAlertas['🟢']}\n` +
    `Percentual em atenção (🔴+🟠+🟡): ${pctAtencao}%\n` +
    `Trilhas geradas: ${dados.totalTrilhasGuiadas} trilhas guiadas (gaps) + ${dados.totalTrilhasExpansao} trilhas de expansão\n` +
    (discTexto ? `Perfil DISC médio da empresa: ${discTexto}\n` : '') +
    `\nCOMPETÊNCIAS (piores primeiro — use apenas o NOME, sem código numérico):\n${resumoComps}\n` +
    `\nEQUIPES (mais prioritárias primeiro):\n${resumoEquipes}\n\n` +

    `=== MISSÃO ===\n` +
    `Gere análise estratégica com EXATAMENTE os campos abaixo. Regras:\n` +
    `• sintese_empresa: 3 frases sobre o estado atual — direto, sem jargão. Sem mencionar "IA" nem "modelo".\n` +
    `• sintese_para_diretoria: versão executiva de 2 frases para a diretoria.\n` +
    `• competencia_foco.nome: nome da competência (SEM código numérico) recomendada para o 1º ciclo.\n` +
    `• competencia_foco.justificativa: por que essa competência agora — cite frequência e impacto.\n` +
    `• competencia_foco.abrangencia: "Transversal (todos os cargos)" ou nomear cargos específicos.\n` +
    `• ranking_equipes[].recomendacao: "Iniciar imediatamente" | "Iniciar no ciclo 2" | "Monitorar — equipe estável".\n` +
    `• ranking_equipes[].justificativa: 1 frase específica.\n` +
    `• perfil_gestores[]: gestores que precisam de atenção especial do RH.\n` +
    `• perfil_gestores[].situacao: o que torna essa equipe complexa (OBRIGATÓRIO, nunca vazio).\n` +
    `• perfil_gestores[].suporte_recomendado: ação concreta que o RH deve executar para apoiar este gestor (OBRIGATÓRIO, nunca vazio — ex: "Sessões de coaching individual", "Reunião semanal de alinhamento", "Workshop de feedback").\n` +

    `• recomendacoes_rh: objeto com 4 alavancas de ação.\n` +
    `  - td: array de ações de T&D (treinamento e desenvolvimento).\n` +
    `  - gestao: array de ações de gestão/liderança.\n` +
    `  - processos: array de melhorias de processo.\n` +
    `  - contratacao: array de recomendações de contratação/realocação.\n` +
    `• equilibrio_disc: 1 frase sobre quais dimensões DISC estão em falta no time e como equilibrar.\n` +

    `• plano_inicio.semana_1: array de objetos {"acao":"...","responsavel":"..."} — ações da semana 1 (sem mencionar "IA"). Responsável = quem executa (ex: "RH", "Gestor", "RH + Gestor", "Coordenação").\n` +
    `• plano_inicio.semana_2: array de objetos {"acao":"...","responsavel":"..."} — ações da semana 2.\n` +
    `• plano_inicio.mes_1: array de objetos {"acao":"...","responsavel":"..."} — ações estruturais no mês 1.\n` +

    `• riscos_implantacao[]: riscos PRÁTICOS de implantação do programa. Deve incluir:\n` +
    `  - Baixa adesão ou conflitos de agenda\n` +
    `  - Defensividade dos avaliados ao receberem resultados\n` +
    `  - Falta de tempo do gestor para acompanhar trilhas\n` +
    `  - Necessidade de comunicação prévia com diretoria e coordenadores\n` +
    `  Cada risco: {"risco":"...","impacto":"...","mitigacao":"..."}\n` +

    `• alertas_risco[]: padrões nos DADOS que podem comprometer o programa.\n` +
    `  REGRA: NÃO mencione "viés de aprovação" nem "leniência". Lembre que a nota é gerada pela IA Vertho, sem autoavaliação.\n` +
    `  Cada alerta: {"alerta":"...","impacto":"...","acao_recomendada":"..."}\n` +

    `• mapeamento_esforco: objeto com estimativa de esforço.\n` +
    `  - trilhas_guiadas: ${dados.totalTrilhasGuiadas}\n` +
    `  - trilhas_expansao: ${dados.totalTrilhasExpansao}\n` +
    `  - tempo_medio_semanal: string estimando minutos por semana por colaborador (ex: "15 a 20 min/semana").\n` +
    `  - resumo: 1 frase consolidando o esforço para o RH apresentar à diretoria.\n` +

    `• risco_institucional_nivel: "Alto" | "Moderado" | "Baixo".\n` +
    `• risco_institucional_descricao: 1 frase sobre o principal risco institucional.\n\n` +

    `Retorne APENAS JSON sem markdown:\n` +
    `{"sintese_empresa":"...","sintese_para_diretoria":"...","risco_institucional_nivel":"...",` +
    `"risco_institucional_descricao":"...","competencia_foco":{"nome":"...","justificativa":"...","abrangencia":"..."},` +
    `"ranking_equipes":[{"nome_gestor":"...","recomendacao":"...","justificativa":"..."}],` +
    `"perfil_gestores":[{"nome_gestor":"...","situacao":"...","suporte_recomendado":"..."}],` +
    `"recomendacoes_rh":{"td":["..."],"gestao":["..."],"processos":["..."],"contratacao":["..."]},` +
    `"equilibrio_disc":"...",` +
    `"plano_inicio":{"semana_1":[{"acao":"...","responsavel":"..."}],"semana_2":[{"acao":"...","responsavel":"..."}],"mes_1":[{"acao":"...","responsavel":"..."}]},` +
    `"riscos_implantacao":[{"risco":"...","impacto":"...","mitigacao":"..."}],` +
    `"alertas_risco":[{"alerta":"...","impacto":"...","acao_recomendada":"..."}],` +
    `"mapeamento_esforco":{"trilhas_guiadas":${dados.totalTrilhasGuiadas},"trilhas_expansao":${dados.totalTrilhasExpansao},"tempo_medio_semanal":"...","resumo":"..."}}`;

  let tentativa = 0;
  while (tentativa < 3) {
    tentativa++;
    try {
      const provedor = _CFG.provedor || 'CLAUDE';
      const modelo   = _CFG.modelo   || MODEL_SONNET;
      let textoRaw = provedor === 'GEMINI'
        ? _ia4GeminiRaw(modelo, prompt)
        : _ia4ClaudeRaw(modelo, prompt, false);
      let limpo = textoRaw.replace(/```json/gi, '').replace(/```/g, '').trim();
      const ini = limpo.indexOf('{'), fim = limpo.lastIndexOf('}') + 1;
      if (ini !== -1 && fim > ini) limpo = limpo.substring(ini, fim);
      return JSON.parse(limpo);
    } catch (e) {
      _addLog(`⚠️ IA Relatório RH tentativa ${tentativa}: ${e.message}`);
      if (tentativa >= 3) throw new Error(`IA falhou após 3 tentativas: ${e.message}`);
      Utilities.sleep(3000 * tentativa);
    }
  }
  return {};
}


// ═══════════════════════════════════════════════════════════════════════════════
// 3. RENDERIZAÇÃO DO DOCUMENTO  (v3.3)
// ═══════════════════════════════════════════════════════════════════════════════

var _PAGE_W = 468;

function _criarDocRelatorioRH(dados, analise, ss) {
  const hoje    = dados.geradoEm;
  const empresa = dados.empresa || 'Empresa';
  const nomeDoc = `Relatório Consolidado — ${empresa} — ${hoje.split(' ')[0].replace(/\//g,'-')}`;

  const folder       = DriveApp.getFolderById(PASTA_RELATORIOS);
  const templateFile = DriveApp.getFileById('1Ji9z9MCrEiIdcnSOLY87Y9RvT8jNHL7QJvT8d2pL5mM');
  const docFile      = templateFile.makeCopy(nomeDoc, folder);
  const doc          = DocumentApp.openById(docFile.getId());
  const body         = doc.getBody();

  const found = body.findText('\\{\\{CONTEUDO_RH\\}\\}');
  if (found) {
    found.getElement().getParent().asParagraph().setText(' ');
  }

  const C_TITULO   = '#0F2B54';
  const C_DESTAQUE = '#C55A11';
  const C_VERDE    = '#1A7A4A';
  const C_VERMELHO = '#8B1A1A';

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════
  function _safe(v) {
    if (v === null || v === undefined) return ' ';
    const s = String(v).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
    return s !== '' ? s : ' ';
  }
  // AJUSTE 3: limpa código numérico de competência
  function _compNome(raw) {
    const s = _safe(raw);
    return s.replace(/^\d+[\.\-]\d*\s*/, '').trim() || s;
  }
  function _fitWidths(desejadas) {
    const soma = desejadas.reduce((s,v) => s + v, 0);
    if (soma <= _PAGE_W) return desejadas;
    const fator = _PAGE_W / soma;
    return desejadas.map(w => Math.round(w * fator));
  }

  function _h2(txt, cor) {
    const p = body.appendParagraph(_safe(txt));
    p.setHeading(DocumentApp.ParagraphHeading.HEADING2);
    p.editAsText().setForegroundColor(cor || C_TITULO).setBold(true);
    return p;
  }
  function _h3(txt) {
    const p = body.appendParagraph(_safe(txt));
    p.setHeading(DocumentApp.ParagraphHeading.HEADING3);
    p.editAsText().setForegroundColor(C_TITULO);
    return p;
  }
  function _sp() {
    body.appendParagraph(' ').editAsText().setFontSize(4);
  }
  function _hr() {
    body.appendHorizontalRule();
  }
  function _txt(s, cor, sz) {
    body.appendParagraph(_safe(s))
      .editAsText().setFontSize(sz || 10).setForegroundColor(cor || '#333333').setBold(false);
  }

  function _t2(rows, labelW) {
    const lW = labelW || 180;
    const vW = _PAGE_W - lW;
    const t = body.appendTable();
    t.setBorderWidth(0);
    rows.forEach(([label, val, bgL, bgV], i) => {
      const bL  = bgL || (i % 2 === 0 ? '#D6E4F7' : '#E3EEF9');
      const bV  = bgV || (i % 2 === 0 ? '#F7FBFF' : '#FFFFFF');
      const row = t.appendTableRow();
      const c1  = row.appendTableCell(_safe(label));
      c1.setBackgroundColor(bL); c1.setWidth(lW);
      c1.setPaddingTop(6); c1.setPaddingBottom(6);
      c1.setPaddingLeft(10); c1.setPaddingRight(6);
      c1.editAsText().setBold(true).setForegroundColor(C_TITULO).setFontSize(10);
      const c2 = row.appendTableCell(_safe(val));
      c2.setBackgroundColor(bV); c2.setWidth(vW);
      c2.setPaddingTop(6); c2.setPaddingBottom(6);
      c2.setPaddingLeft(10); c2.setPaddingRight(10);
      c2.editAsText().setBold(false).setForegroundColor('#0F2B54').setFontSize(10);
    });
    return t;
  }

  function _tHeader(titulo, cor, conteudo) {
    const t  = body.appendTable();
    t.setBorderWidth(0);
    const rH = t.appendTableRow();
    const cH = rH.appendTableCell(_safe(titulo));
    cH.setBackgroundColor(cor); cH.setWidth(_PAGE_W);
    cH.setPaddingTop(7); cH.setPaddingBottom(7);
    cH.setPaddingLeft(12); cH.setPaddingRight(12);
    cH.editAsText().setBold(true).setForegroundColor('#FFFFFF').setFontSize(11);
    const rC   = t.appendTableRow();
    const cell = rC.appendTableCell(' ');
    cell.setBackgroundColor('#F7FBFF'); cell.setWidth(_PAGE_W);
    cell.setPaddingTop(10); cell.setPaddingBottom(10);
    cell.setPaddingLeft(14); cell.setPaddingRight(14);
    const lines = Array.isArray(conteudo) ? conteudo : [conteudo];
    const safeLines = lines.map(l => _safe(l)).filter(l => l.trim() !== '');
    if (safeLines.length === 0) safeLines.push(' ');
    const firstPara = cell.getChild(0).asParagraph();
    firstPara.setText(safeLines[0]);
    firstPara.editAsText().setFontSize(10).setForegroundColor('#0F2B54').setBold(false);
    for (let i = 1; i < safeLines.length; i++) {
      cell.appendParagraph(safeLines[i])
        .editAsText().setFontSize(10).setForegroundColor('#0F2B54').setBold(false);
    }
    return t;
  }

  // helper: tabela 3 colunas para riscos/alertas
  function _tRiscos3col(titulo, corHeader, items, col1Label, col2Label, col3Label, col1Key, col2Key, col3Key) {
    if (!items || items.length === 0) return;
    if (titulo && titulo.trim() !== '') _h3(titulo);
    const ws = _fitWidths([160, 155, 153]);
    const t = body.appendTable();
    t.setBorderWidth(0);
    const rH = t.appendTableRow();
    [col1Label, col2Label, col3Label].forEach((lbl, i) => {
      const c = rH.appendTableCell(_safe(lbl));
      c.setBackgroundColor(corHeader); c.setWidth(ws[i]);
      c.setPaddingTop(5); c.setPaddingBottom(5);
      c.setPaddingLeft(8); c.setPaddingRight(8);
      c.editAsText().setBold(true).setForegroundColor('#FFFFFF').setFontSize(8);
    });
    items.forEach((item, i) => {
      const bg = i % 2 === 0 ? '#FFF8F0' : '#FFFBF5';
      const r = t.appendTableRow();
      [item[col1Key], item[col2Key], item[col3Key]].forEach((txt, j) => {
        const c = r.appendTableCell(_safe(txt));
        c.setBackgroundColor(bg); c.setWidth(ws[j]);
        c.setPaddingTop(5); c.setPaddingBottom(5);
        c.setPaddingLeft(8); c.setPaddingRight(8);
        c.editAsText().setFontSize(8).setForegroundColor('#0F2B54').setBold(false);
      });
    });
    _sp();
  }


  // ════════════════════════════════════════════════════════════════════════════
  // SEÇÃO 1: Visão Executiva
  // ════════════════════════════════════════════════════════════════════════════
  _h2('1. Visão Executiva da Empresa');

  const risco    = dados.distAlertas['🔴'] + dados.distAlertas['🟠'];
  const pctRisco = dados.totalColaboradores > 0
    ? Math.round((risco / dados.totalColaboradores) * 100) : 0;

  _t2([
    ['📊  Total mapeado',       `${dados.totalColaboradores} colaboradores em ${dados.totalEquipes} equipe(s)`],
    ['🔴  Em risco crítico',    `${dados.distAlertas['🔴']} colaboradores (Incoerência Alta)`],
    ['🟠  Atenção moderada',    `${dados.distAlertas['🟠']} colaboradores (Incoerência Moderada)`],
    ['🟡  Potencial represado', `${dados.distAlertas['🟡']} colaboradores`],
    ['🟢  Alta coerência',      `${dados.distAlertas['🟢']} colaboradores`],
    ['📈  ICoM da empresa',     `${dados.icom} / 4.00  (Índice de Coerência Médio)`],
    ['🚨  Risco institucional', `${_safe(analise.risco_institucional_nivel)} — ${pctRisco}% da empresa em atenção`],
  ], 180);
  _sp();

  if (analise.sintese_empresa) {
    _tHeader('📋  Situação Atual da Organização', C_TITULO,
      analise.sintese_empresa.split('. ').map(s => s.trim()).filter(Boolean)
        .map(s => s.endsWith('.') ? s : s + '.'));
    _sp();
  }
  if (analise.sintese_para_diretoria) {
    _tHeader('🎯  Síntese para a Diretoria', C_DESTAQUE, analise.sintese_para_diretoria);
    _sp();
  }
  if (analise.risco_institucional_descricao) {
    const corRisco = (analise.risco_institucional_nivel || '').toLowerCase() === 'alto' ? C_VERMELHO
                   : (analise.risco_institucional_nivel || '').toLowerCase() === 'moderado' ? '#C55A11'
                   : C_VERDE;
    _tHeader(`🚨  Risco Institucional: ${_safe(analise.risco_institucional_nivel)}`, corRisco,
      analise.risco_institucional_descricao);
    _sp();
  }

  // ── DISC ───────────────────────────────────────────────────────────────────
  const dimDisc    = ['D','I','S','C'];
  const discLabels = { D: 'D — Execução / Resultado', I: 'I — Comunicação / Engajamento',
                       S: 'S — Acolhimento / Escuta',  C: 'C — Organização / Processos' };
  const temDisc = dimDisc.some(d => dados.discMedias[d] !== null);
  if (temDisc) {
    _h3('🎨  DNA Comportamental da Empresa (DISC Médio)');
    const discW = _fitWidths([140, 60, 180, 88]);
    const tDisc = body.appendTable();
    tDisc.setBorderWidth(0);
    const rHD = tDisc.appendTableRow();
    ['Dimensão','Média','Barra de Intensidade','Nível'].forEach((col, i) => {
      const c = rHD.appendTableCell(col);
      c.setBackgroundColor(C_TITULO); c.setWidth(discW[i]);
      c.setPaddingTop(5); c.setPaddingBottom(5);
      c.setPaddingLeft(8); c.setPaddingRight(8);
      c.editAsText().setBold(true).setForegroundColor('#FFFFFF').setFontSize(9);
    });
    dimDisc.forEach(d => {
      const media = dados.discMedias[d];
      if (media === null) return;
      const barras = Math.round(media / 10);
      const fill   = '█'.repeat(Math.max(0, Math.min(10, barras))) +
                     '░'.repeat(10 - Math.max(0, Math.min(10, barras)));
      const nivel  = media >= 70 ? 'Muito alto' : media >= 50 ? 'Alto' : media >= 30 ? 'Médio' : 'Baixo';
      const rD = tDisc.appendTableRow();
      [[discLabels[d], discW[0]], [`${media}`, discW[1]], [`[${fill}]`, discW[2]], [nivel, discW[3]]].forEach(([txt,w]) => {
        const c = rD.appendTableCell(_safe(txt));
        c.setBackgroundColor('#F7FBFF'); c.setWidth(w);
        c.setPaddingTop(5); c.setPaddingBottom(5);
        c.setPaddingLeft(8); c.setPaddingRight(8);
        c.editAsText().setFontSize(9).setForegroundColor('#0F2B54').setBold(false);
      });
    });
    _sp();
    // Equilíbrio DISC (AJUSTE 5)
    if (analise.equilibrio_disc) {
      _tHeader('⚖️  Equilíbrio DISC — Recomendação', '#2471A3', analise.equilibrio_disc);
      _sp();
    }
  }

  // AJUSTE 2: sem quebra de página — apenas separador visual
  _hr();

  // ════════════════════════════════════════════════════════════════════════════
  // SEÇÃO 2: Ranking de Equipes
  // ════════════════════════════════════════════════════════════════════════════
  _h2('2. Ranking de Equipes por Prioridade de Início');
  _txt('Ordenado por Índice de Prioridade — combina concentração de alertas críticos, heterogeneidade e nível médio.', '#666666', 9);
  _sp();

  const eqW = _fitWidths([24, 120, 40, 34, 34, 34, 34, 48, 110]);
  const tEq = body.appendTable();
  tEq.setBorderWidth(0);
  const rHEq = tEq.appendTableRow();
  [['#',0],['Gestor',1],['Eq.',2],['🔴',3],['🟠',4],['🟡',5],['🟢',6],['Média',7],['Recomendação',8]]
    .forEach(([col,idx]) => {
      const c = rHEq.appendTableCell(_safe(col));
      c.setBackgroundColor(C_TITULO); c.setWidth(eqW[idx]);
      c.setPaddingTop(4); c.setPaddingBottom(4);
      c.setPaddingLeft(4); c.setPaddingRight(4);
      c.editAsText().setBold(true).setForegroundColor('#FFFFFF').setFontSize(8);
    });

  const recIA = {};
  (analise.ranking_equipes || []).forEach(r => {
    recIA[_norm(r.nome_gestor || '').toLowerCase()] = r.recomendacao || '';
  });
  dados.rankingEquipes.forEach((eq, i) => {
    const rec   = recIA[_norm(eq.nomeGestor).toLowerCase()] || '—';
    const bgRec = rec.includes('imediatamente') ? '#FFE0E0'
                : rec.includes('ciclo 2')       ? '#FFF3E0' : '#E8F5E9';
    const rEq = tEq.appendTableRow();
    [
      [`${i+1}`,0,'#F0F4FA',false],
      [eq.nomeGestor,1,'#F7FBFF',true],
      [`${eq.nColabs}`,2,'#F7FBFF',false],
      [`${eq.alertas['🔴']||0}`,3,'#FFE8E8',false],
      [`${eq.alertas['🟠']||0}`,4,'#FFF3E0',false],
      [`${eq.alertas['🟡']||0}`,5,'#FFFDE7',false],
      [`${eq.alertas['🟢']||0}`,6,'#E8F5E9',false],
      [`${eq.mediaGeral}`,7,'#F0F4FA',false],
      [rec,8,bgRec,true],
    ].forEach(([txt,idx,bg,bold]) => {
      const c = rEq.appendTableCell(_safe(txt));
      c.setBackgroundColor(bg); c.setWidth(eqW[idx]);
      c.setPaddingTop(4); c.setPaddingBottom(4);
      c.setPaddingLeft(4); c.setPaddingRight(4);
      c.editAsText().setFontSize(8).setForegroundColor('#0F2B54').setBold(bold);
    });
  });
  _sp();

  if ((analise.ranking_equipes || []).length > 0) {
    _h3('Justificativas das Recomendações');
    analise.ranking_equipes.forEach(r => {
      if (!r.justificativa) return;
      body.appendParagraph(_safe(`▸  ${r.nome_gestor}  —  ${r.recomendacao}`))
        .editAsText().setFontSize(10).setBold(true).setForegroundColor(C_TITULO);
      body.appendParagraph(_safe(r.justificativa))
        .editAsText().setFontSize(9).setBold(false).setForegroundColor('#555555').setItalic(true);
    });
    _sp();
  }

  _hr();

  // ════════════════════════════════════════════════════════════════════════════
  // SEÇÃO 3: Gaps de Competências
  // ════════════════════════════════════════════════════════════════════════════
  _h2('3. Gaps de Competências — Empresa Inteira');
  _txt('Ordenado da maior lacuna à melhor performance. Média: escala 1 (Nível 1) a 4 (Nível 4).', '#666666', 9);
  _sp();

  const compW = _fitWidths([190, 65, 50, 75, 88]);
  const tComp = body.appendTable();
  tComp.setBorderWidth(0);
  const rHComp = tComp.appendTableRow();
  [['Competência',0],['Avaliações',1],['Média',2],['% Crítico 🔴',3],['Status',4]]
    .forEach(([col,idx]) => {
      const c = rHComp.appendTableCell(_safe(col));
      c.setBackgroundColor(C_TITULO); c.setWidth(compW[idx]);
      c.setPaddingTop(5); c.setPaddingBottom(5);
      c.setPaddingLeft(6); c.setPaddingRight(6);
      c.editAsText().setBold(true).setForegroundColor('#FFFFFF').setFontSize(8);
    });
  dados.rankingCompetencias.forEach((ci, i) => {
    const status  = ci.media < 2 ? '⚠️ Gap crítico' : ci.media < 3 ? '🔶 Desenvolver' : '✅ Adequado';
    const bgMedia = ci.media < 2 ? '#FFE0E0' : ci.media < 3 ? '#FFF3E0' : '#E8F5E9';
    const rC = tComp.appendTableRow();
    // AJUSTE 3: _compNome remove código numérico
    [
      [_compNome(ci.comp),0,i%2===0?'#F7FBFF':'#FAFAFA',false],
      [`${ci.n}`,1,'#F7FBFF',false],
      [`${ci.media}`,2,bgMedia,true],
      [`${ci.pctCritico}%`,3,'#F7FBFF',false],
      [status,4,bgMedia,false],
    ].forEach(([txt,idx,bg,bold]) => {
      const c = rC.appendTableCell(_safe(txt));
      c.setBackgroundColor(bg); c.setWidth(compW[idx]);
      c.setPaddingTop(4); c.setPaddingBottom(4);
      c.setPaddingLeft(6); c.setPaddingRight(6);
      c.editAsText().setFontSize(8).setForegroundColor('#0F2B54').setBold(bold);
    });
  });
  _sp();

  if (analise.competencia_foco) {
    const cf = analise.competencia_foco;
    _tHeader(`🎯  Competência-Foco Recomendada para o 1º Ciclo: ${_compNome(cf.nome)}`, C_VERDE, [
      `Justificativa: ${_safe(cf.justificativa)}`,
      `Abrangência: ${_safe(cf.abrangencia)}`,
    ]);
    _sp();
  }

  _hr();

  // ════════════════════════════════════════════════════════════════════════════
  // SEÇÃO 4: Perfil dos Gestores
  // ════════════════════════════════════════════════════════════════════════════
  _h2('4. Perfil dos Gestores — Prontidão para Conduzir o Desenvolvimento');

  if ((analise.perfil_gestores || []).length === 0) {
    _txt('Todos os gestores foram identificados como aptos para conduzir o desenvolvimento de forma autônoma.', C_VERDE, 10);
  } else {
    _txt('Gestores que necessitam de atenção ou suporte do RH antes do início das trilhas:', '#555555', 9);
    _sp();
    const gestW = _fitWidths([130, 190, 148]);
    const tGest = body.appendTable();
    tGest.setBorderWidth(0);
    const rHGest = tGest.appendTableRow();
    [['Gestor',0],['Situação da Equipe',1],['Suporte Recomendado pelo RH',2]]
      .forEach(([col,idx]) => {
        const c = rHGest.appendTableCell(_safe(col));
        c.setBackgroundColor(C_DESTAQUE); c.setWidth(gestW[idx]);
        c.setPaddingTop(5); c.setPaddingBottom(5);
        c.setPaddingLeft(8); c.setPaddingRight(8);
        c.editAsText().setBold(true).setForegroundColor('#FFFFFF').setFontSize(9);
      });
    analise.perfil_gestores.forEach((pg, i) => {
      const bg = i%2===0 ? '#FFF3E0' : '#FFFBF5';
      const rG = tGest.appendTableRow();
      const suporte = _safe(pg.suporte_recomendado) === ' '
        ? 'Acompanhamento próximo do RH durante as primeiras semanas do programa.'
        : _safe(pg.suporte_recomendado);
      [[pg.nome_gestor,0],[pg.situacao,1],[suporte,2]].forEach(([txt,idx]) => {
        const c = rG.appendTableCell(_safe(txt));
        c.setBackgroundColor(bg); c.setWidth(gestW[idx]);
        c.setPaddingTop(6); c.setPaddingBottom(6);
        c.setPaddingLeft(8); c.setPaddingRight(8);
        c.editAsText().setFontSize(9).setForegroundColor('#0F2B54').setBold(false);
      });
    });
  }
  _sp();

  _hr();

  // ════════════════════════════════════════════════════════════════════════════
  // SEÇÃO 5: Plano de Início (AJUSTE 1: sem mencionar IA)
  // ════════════════════════════════════════════════════════════════════════════
  _h2('5. Plano de Início do Programa');
  _txt('Cronograma sugerido com base nos dados agregados de todo o programa.', '#666666', 9);
  _sp();

  if (analise.plano_inicio) {
    const pi = analise.plano_inicio;
    const fases = [
      ['⚡ Semana 1', '#C0392B', pi.semana_1 || []],
      ['📋 Semana 2', '#2471A3', pi.semana_2 || []],
      ['🚀 Mês 1',    '#1A7A4A', pi.mes_1    || []],
    ];
    const colW = _fitWidths([360, 108]);
    fases.forEach(([titulo, cor, itens]) => {
      if (!itens || itens.length === 0) return;
      const t = body.appendTable();
      t.setBorderWidth(0);
      // Header da fase — 2 colunas para manter consistência
      const rH = t.appendTableRow();
      const cH1 = rH.appendTableCell(_safe(titulo));
      cH1.setBackgroundColor(cor); cH1.setWidth(colW[0]);
      cH1.setPaddingTop(6); cH1.setPaddingBottom(6);
      cH1.setPaddingLeft(10); cH1.setPaddingRight(6);
      cH1.editAsText().setBold(true).setForegroundColor('#FFFFFF').setFontSize(9);
      const cH2 = rH.appendTableCell(' ');
      cH2.setBackgroundColor(cor); cH2.setWidth(colW[1]);
      cH2.setPaddingTop(6); cH2.setPaddingBottom(6);
      cH2.setPaddingLeft(6); cH2.setPaddingRight(6);
      cH2.editAsText().setFontSize(9).setForegroundColor(cor);
      // Sub-header Ação | Responsável
      const rSub = t.appendTableRow();
      [['Ação', colW[0]], ['Responsável', colW[1]]].forEach(([lbl, w]) => {
        const c = rSub.appendTableCell(_safe(lbl));
        c.setBackgroundColor('#E8EEF5'); c.setWidth(w);
        c.setPaddingTop(4); c.setPaddingBottom(4);
        c.setPaddingLeft(10); c.setPaddingRight(6);
        c.editAsText().setBold(true).setFontSize(8).setForegroundColor(C_TITULO);
      });
      // Linhas de ação
      itens.forEach((item, i) => {
        const bg = i % 2 === 0 ? '#F7FBFF' : '#FFFFFF';
        const rI = t.appendTableRow();
        const acao = typeof item === 'string' ? item : (item.acao || ' ');
        const resp = typeof item === 'string' ? ' ' : (item.responsavel || ' ');
        const c1 = rI.appendTableCell(_safe(`• ${acao}`));
        c1.setBackgroundColor(bg); c1.setWidth(colW[0]);
        c1.setPaddingTop(4); c1.setPaddingBottom(4);
        c1.setPaddingLeft(10); c1.setPaddingRight(6);
        c1.editAsText().setFontSize(8).setForegroundColor('#0F2B54').setBold(false);
        const c2 = rI.appendTableCell(_safe(resp));
        c2.setBackgroundColor(bg); c2.setWidth(colW[1]);
        c2.setPaddingTop(4); c2.setPaddingBottom(4);
        c2.setPaddingLeft(8); c2.setPaddingRight(6);
        c2.editAsText().setFontSize(8).setForegroundColor('#0F2B54').setBold(false);
      });
    });
    _sp();
  }

  _hr();

  // ════════════════════════════════════════════════════════════════════════════
  // SEÇÃO 6: Recomendações de RH (AJUSTE 5 — NOVA)
  // ════════════════════════════════════════════════════════════════════════════
  _h2('6. Recomendações Estratégicas para o RH');

  if (analise.recomendacoes_rh) {
    const rh = analise.recomendacoes_rh;
    const alavancas = [
      ['🎓  T&D (Treinamento e Desenvolvimento)', '#1A7A4A', rh.td],
      ['👥  Gestão e Liderança',                  '#2471A3', rh.gestao],
      ['⚙️  Processos',                           '#7D3C98', rh.processos],
      ['🔍  Contratação e Realocação',             '#C0392B', rh.contratacao],
    ];
    alavancas.forEach(([titulo, cor, itens]) => {
      if (!itens || itens.length === 0) return;
      const t = body.appendTable();
      t.setBorderWidth(0);
      const rH = t.appendTableRow();
      const cH = rH.appendTableCell(_safe(titulo));
      cH.setBackgroundColor(cor); cH.setWidth(_PAGE_W);
      cH.setPaddingTop(6); cH.setPaddingBottom(6);
      cH.setPaddingLeft(12); cH.setPaddingRight(12);
      cH.editAsText().setBold(true).setForegroundColor('#FFFFFF').setFontSize(10);
      itens.forEach((item, i) => {
        const rI = t.appendTableRow();
        const cI = rI.appendTableCell(_safe(`• ${item}`));
        cI.setBackgroundColor(i % 2 === 0 ? '#F7FBFF' : '#FFFFFF'); cI.setWidth(_PAGE_W);
        cI.setPaddingTop(5); cI.setPaddingBottom(5);
        cI.setPaddingLeft(16); cI.setPaddingRight(12);
        cI.editAsText().setFontSize(9).setForegroundColor('#0F2B54').setBold(false);
      });
    });
    _sp();
  }

  _hr();

  // ════════════════════════════════════════════════════════════════════════════
  // SEÇÃO 7: Mapeamento de Esforço (AJUSTE 8 — NOVA)
  // ════════════════════════════════════════════════════════════════════════════
  _h2('7. Mapeamento de Esforço do Programa');

  const me = analise.mapeamento_esforco || {};
  _t2([
    ['📚  Trilhas guiadas (gaps)',    `${dados.totalTrilhasGuiadas} trilhas geradas na Verthoflix`],
    ['🚀  Trilhas de expansão',       `${dados.totalTrilhasExpansao} trilhas geradas na Verthoflix`],
    ['⏱️  Tempo médio por colaborador', _safe(me.tempo_medio_semanal || '15 a 20 min/semana')],
    ['👥  Total de colaboradores',     `${dados.totalColaboradores}`],
  ], 200);
  _sp();

  if (me.resumo) {
    _tHeader('📊  Resumo de Esforço para a Diretoria', '#2471A3', me.resumo);
    _sp();
  }

  _hr();

  // ════════════════════════════════════════════════════════════════════════════
  // SEÇÃO 8: Riscos de Implantação (AJUSTE 6 — NOVA)
  // ════════════════════════════════════════════════════════════════════════════
  _h2('8. Riscos de Implantação e Mitigação');
  _txt('Riscos práticos que o RH deve antecipar antes de iniciar o programa.', '#666666', 9);

  _tRiscos3col(
    ' ', C_VERMELHO,
    analise.riscos_implantacao || [],
    'Risco', 'Impacto', 'Mitigação',
    'risco', 'impacto', 'mitigacao'
  );

  // ── Alertas de dados ──────────────────────────────────────────────────────
  if ((analise.alertas_risco || []).length > 0) {
    _tRiscos3col(
      '⚠️  Alertas nos Dados do Programa', C_DESTAQUE,
      analise.alertas_risco,
      'Alerta', 'Impacto', 'Ação Recomendada',
      'alerta', 'impacto', 'acao_recomendada'
    );
  }

  _hr();

  // ════════════════════════════════════════════════════════════════════════════
  // SEÇÃO 9: Dashboard
  // ════════════════════════════════════════════════════════════════════════════
  _h2('9. Dashboard Interativo');
  const lookerUrl = _getLookerUrl('');
  if (lookerUrl) {
    const tLK = body.appendTable();
    tLK.setBorderWidth(0);
    const rLK = tLK.appendTableRow();
    const qrBlob = _gerarQRCode(lookerUrl);
    const linkW  = qrBlob ? Math.round(_PAGE_W * 0.72) : _PAGE_W;
    const linkCell = rLK.appendTableCell(' ');
    linkCell.setBackgroundColor('#EEF3FB'); linkCell.setWidth(linkW);
    linkCell.setPaddingTop(14); linkCell.setPaddingBottom(14);
    linkCell.setPaddingLeft(16); linkCell.setPaddingRight(8);
    const linkPara = linkCell.getChild(0).asParagraph();
    linkPara.setText(' ');
    linkPara.appendText('🔗  Acessar o Dashboard Completo do Programa')
      .setLinkUrl(lookerUrl)
      .setFontSize(11).setForegroundColor('#1155CC').setBold(true);
    linkCell.appendParagraph('Filtros disponíveis: por equipe, área, cargo, perfil DISC, nível de alerta')
      .editAsText().setFontSize(9).setForegroundColor('#555555').setItalic(true).setBold(false);
    if (qrBlob) {
      try {
        const qrW = _PAGE_W - linkW;
        const qrCell = rLK.appendTableCell(' ');
        qrCell.setBackgroundColor('#EEF3FB'); qrCell.setWidth(qrW);
        qrCell.setPaddingTop(6); qrCell.setPaddingBottom(6);
        qrCell.setPaddingLeft(10); qrCell.setPaddingRight(10);
        qrCell.getChild(0).asParagraph()
          .appendInlineImage(qrBlob).setWidth(100).setHeight(100);
      } catch(_) {}
    }
    _sp();
  } else {
    _txt('⚠️  Nenhuma URL do Dashboard configurada.', '#C55A11', 10);
    _sp();
  }

  _hr();

  // ════════════════════════════════════════════════════════════════════════════
  // RODAPÉ METODOLÓGICO (AJUSTE 4 — NOVO)
  // ════════════════════════════════════════════════════════════════════════════
  _h3('📐  Nota Metodológica');

  const tMet = body.appendTable();
  tMet.setBorderWidth(0);
  const metRows = [
    ['ICoM (Índice de Coerência Médio)',
     'Média aritmética do score de coerência de todos os itens avaliados, numa escala de 1 a 4, onde 4 = coerência máxima entre perfil e desempenho.'],
    ['O que é "incoerência"',
     'Ocorre quando o desempenho observado no Simulador PACE diverge significativamente do que seria esperado dado o perfil comportamental (CIS) do colaborador — indicando um gap de competência ou de adaptação ao contexto.'],
    ['🔴 Incoerência Alta',
     'Nota < 1,5 — Gap crítico. Requer intervenção imediata com trilha guiada.'],
    ['🟠 Incoerência Moderada',
     'Nota 1,5 a 2,4 — Atenção. Desenvolvimento prioritário com acompanhamento do gestor.'],
    ['🟡 Potencial Represado',
     'Nota 2,5 a 3,4 — Colaborador tem potencial, mas não o demonstra plenamente. Trilha de expansão recomendada.'],
    ['🟢 Alta Coerência',
     'Nota ≥ 3,5 — Perfil e desempenho alinhados. Manter e aproveitar como referência no time.'],
    ['⚠️ Atenção',
     'Alta coerência pode significar que o colaborador é consistente com seu perfil comportamental — mesmo que o nível absoluto da competência esteja baixo. Por isso, o ICoM deve ser lido junto com a média de nota.'],
  ];
  metRows.forEach(([label, desc], i) => {
    const bg = i % 2 === 0 ? '#F0F4FA' : '#FAFAFA';
    const rM = tMet.appendTableRow();
    const c1 = rM.appendTableCell(_safe(label));
    c1.setBackgroundColor(bg); c1.setWidth(160);
    c1.setPaddingTop(5); c1.setPaddingBottom(5);
    c1.setPaddingLeft(8); c1.setPaddingRight(6);
    c1.editAsText().setBold(true).setFontSize(8).setForegroundColor(C_TITULO);
    const c2 = rM.appendTableCell(_safe(desc));
    c2.setBackgroundColor(bg); c2.setWidth(_PAGE_W - 160);
    c2.setPaddingTop(5); c2.setPaddingBottom(5);
    c2.setPaddingLeft(8); c2.setPaddingRight(10);
    c2.editAsText().setBold(false).setFontSize(8).setForegroundColor('#333333');
  });
  _sp();

  // ── Rodapé final ──────────────────────────────────────────────────────────
  _hr();
  body.appendParagraph(
    'Este relatório foi gerado automaticamente pela plataforma Vertho. ' +
    'Pode ser regerado a qualquer momento via Painel → Fase 3 → Gerar Relatório RH. ' +
    `Última geração: ${hoje}.`
  ).editAsText().setFontSize(8).setForegroundColor('#999999').setItalic(true).setBold(false);

  // ── Salvar Doc e converter para PDF ────────────────────────────────────────
  doc.saveAndClose();
  const pdfBlob = DriveApp.getFileById(docFile.getId()).getAs(MimeType.PDF);
  const pdfName = nomeDoc + '.pdf';
  const pdfFile = folder.createFile(pdfBlob).setName(pdfName);
  docFile.setTrashed(true);

  PropertiesService.getScriptProperties().setProperty('relatorio_rh_gerado_em', hoje);
  _rpEnviarRelatorio(pdfFile, dados, analise, empresa, hoje);
  return pdfFile;
}


// ═══════════════════════════════════════════════════════════════════════════════
// 4. ENVIO POR E-MAIL
// ═══════════════════════════════════════════════════════════════════════════════

function _rpEnviarRelatorio(pdfFile, dados, analise, empresa, hoje) {
  const props     = PropertiesService.getScriptProperties();
  const emailsRaw = props.getProperty('cfg_emails_rh') || '';
  let destinatarios = emailsRaw.split(',').map(e => e.trim()).filter(Boolean);
  if (destinatarios.length === 0) {
    destinatarios = [Session.getEffectiveUser().getEmail()];
    _addLog('⚠️ Nenhum destinatário RH configurado — enviando para o dono do script.');
  }

  const assunto   = `[Vertho] Relatório Consolidado do Programa — ${empresa} — ${hoje}`;
  const cfNome    = analise.competencia_foco?.nome || '—';
  const topEquipe = (dados.rankingEquipes[0]?.nomeGestor) || '—';
  const pdfBlob   = pdfFile.getBlob();

  const corpoTxt =
    `Relatório Consolidado do Programa Vertho\n\n` +
    `Empresa: ${empresa}\nTotal: ${dados.totalColaboradores} colaboradores · ${dados.totalEquipes} equipe(s)\n` +
    `ICoM: ${dados.icom}/4.00 | Risco: ${analise.risco_institucional_nivel || '—'}\n\n` +
    `Competência-foco recomendada: ${cfNome}\nEquipe prioritária: ${topEquipe}\n\n` +
    `O relatório completo está disponível no link abaixo ou em anexo neste e-mail.\n\nEquipe Vertho`;

  const corpoHtml =
    `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#333">` +
    `<div style="background:#0F2B54;padding:20px;border-radius:8px 8px 0 0">` +
    `<h2 style="color:#fff;margin:0">Vertho — Relatório Consolidado</h2></div>` +
    `<div style="padding:20px;background:#f9f9f9;border-radius:0 0 8px 8px">` +
    `<p><strong>${empresa}</strong> | ${hoje}</p>` +
    `<table style="border-collapse:collapse;width:100%">` +
    `<tr><td style="padding:6px 12px;background:#D6E4F7;width:40%;font-weight:bold">Total mapeado</td>` +
    `<td style="padding:6px 12px;background:#F7FBFF">${dados.totalColaboradores} colaboradores · ${dados.totalEquipes} equipe(s)</td></tr>` +
    `<tr><td style="padding:6px 12px;background:#E3EEF9;font-weight:bold">ICoM</td>` +
    `<td style="padding:6px 12px;background:#FFFFFF">${dados.icom}/4.00</td></tr>` +
    `<tr><td style="padding:6px 12px;background:#D6E4F7;font-weight:bold">Risco institucional</td>` +
    `<td style="padding:6px 12px;background:#F7FBFF">${analise.risco_institucional_nivel || '—'}</td></tr>` +
    `<tr><td style="padding:6px 12px;background:#E3EEF9;font-weight:bold">Competência-foco</td>` +
    `<td style="padding:6px 12px;background:#FFFFFF">${cfNome}</td></tr>` +
    `<tr><td style="padding:6px 12px;background:#D6E4F7;font-weight:bold">Equipe prioritária</td>` +
    `<td style="padding:6px 12px;background:#F7FBFF">${topEquipe}</td></tr>` +
    `</table>` +
    `<div style="margin:24px 0;text-align:center">` +
    `<a href="${pdfFile.getUrl()}" style="background:#0F2B54;color:#fff;padding:12px 28px;` +
    `border-radius:6px;text-decoration:none;font-size:14px;font-weight:bold">Abrir Relatório Completo</a></div>` +
    `<p style="font-size:11px;color:#888;margin-top:12px">📎 O relatório também está em anexo neste e-mail.</p>` +
    `<hr style="border:none;border-top:1px solid #ddd;margin:16px 0">` +
    `<p style="font-size:11px;color:#999">Vertho · diagnostico@vertho.ai · ` +
    `Gerado automaticamente em ${hoje}</p></div></div>`;

  destinatarios.forEach(email => {
    try {
      GmailApp.sendEmail(email, assunto, corpoTxt, {
        from: EMAIL_REMETENTE, name: NOME_REMETENTE,
        htmlBody: corpoHtml, replyTo: EMAIL_REMETENTE,
        attachments: [pdfBlob],
      });
      _addLog(`📧 Relatório RH (PDF) enviado para: ${email}`);
    } catch (eAlias) {
      try {
        GmailApp.sendEmail(email, assunto, corpoTxt, {
          name: NOME_REMETENTE, htmlBody: corpoHtml, attachments: [pdfBlob],
        });
        _addLog(`📧 Relatório RH (PDF) enviado (sem alias) para: ${email}`);
      } catch (e2) {
        _addLog(`❌ Falha ao enviar relatório para ${email}: ${e2.message}`);
      }
    }
  });
}


// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS PRIVADOS
// ═══════════════════════════════════════════════════════════════════════════════

function _rpIdx(headers, ...candidatos) {
  for (const c of candidatos) {
    const norm = _norm(c).toLowerCase();
    const i = headers.findIndex(h => _norm(String(h || '')).toLowerCase() === norm);
    if (i >= 0) return i;
  }
  const norm = _norm(candidatos[0]).toLowerCase();
  return headers.findIndex(h => _norm(String(h || '')).toLowerCase().includes(norm));
}

function _rpSafe(v) {
  if (v === null || v === undefined) return ' ';
  const s = String(v).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
  return s !== '' ? s : ' ';
}

function _rpMapearAreas(wsColab) {
  if (!wsColab) return {};
  try {
    const dados   = wsColab.getDataRange().getValues();
    const headers = dados[3] || [];
    const iEmail  = _idxEmailColab(headers);
    const iArea   = headers.findIndex(h => {
      const n = _norm(String(h || '')).toLowerCase();
      return n.includes('área') || n.includes('area') || n.includes('depto') || n.includes('departamento');
    });
    if (iEmail < 0 || iArea < 0) return {};
    const mapa = {};
    dados.slice(4).forEach(row => {
      const email = _norm(String(row[iEmail] || '')).toLowerCase();
      const area  = _norm(String(row[iArea]  || ''));
      if (email && area) mapa[email] = area;
    });
    return mapa;
  } catch (e) {
    Logger.log('_rpMapearAreas erro: ' + e.message);
    return {};
  }
}