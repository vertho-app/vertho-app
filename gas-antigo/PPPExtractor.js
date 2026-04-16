// =====================================================================
// VERTHO — PPPExtractor.gs
//
// Extrai dados estruturados do PPP (Projeto Político-Pedagógico) de
// cada escola via IA. O texto extraído é usado como contexto na geração
// de cenários (Fase2_Cenarios.gs e Cenariobgenerator.gs).
//
// Fluxo:
//   1. Analista preenche aba PPP_Escolas com nome da escola + ID do PDF
//   2. extrairPPPsMenu() processa cada escola com status "Pendente"
//   3. PDF é convertido via OCR do Drive → texto bruto
//   4. Texto enviado para Claude → extração estruturada (10 seções)
//   5. Texto estruturado gravado na aba PPP_Escolas (col D)
//
// Dependências: Config.gs, AIRouter.gs
// =====================================================================

var PPP = {
  SHEET_NAME: 'PPP_Escolas',
  COL_ESCOLA:     1,  // A
  COL_FILE_ID:    2,  // B
  COL_STATUS:     3,  // C
  COL_EXTRACAO:   4,  // D — texto estruturado extraído
  COL_EXTRACTED:  5,  // E — timestamp
  COL_VALORES:    6   // F — JSON array com valores organizacionais da escola
};

// Valores-base sugeridos pelo Vertho (a escola pode adaptar/adicionar)
var VALORES_BASE = [
  'Etica e integridade',
  'Respeito a dignidade humana',
  'Compromisso com a aprendizagem',
  'Responsabilidade publica'
];


// ═══════════════════════════════════════════════════════════════════════
// PROMPT DE EXTRAÇÃO — v1.0
// ═══════════════════════════════════════════════════════════════════════

function _buildPromptExtracaoPPP(textoPPP) {

  var system = [
    'Voce e um especialista em analise de documentos educacionais brasileiros.',
    'Sua tarefa e extrair de um Projeto Politico-Pedagogico (PPP) as informacoes',
    'necessarias para contextualizar cenarios de avaliacao de competencias docentes.',
    '',
    'IMPORTANTE: Extraia APENAS o que esta explicito ou claramente implicito no documento.',
    'Nao invente, nao complemente com conhecimento geral.',
    'Se uma secao nao existir no PPP, escreva "Nao declarado no PPP".',
    '',
    'REGRA DE CONCISAO: Seja direto e objetivo em cada secao.',
    '- Secoes descritivas: maximo 5 frases curtas cada.',
    '- Tabelas: maximo 10 linhas.',
    '- Listas: maximo 8 itens.',
    'Priorize COMPLETAR TODAS AS 10 SECOES ao inves de detalhar demais cada uma.',
    'E OBRIGATORIO entregar da secao 1 ate a secao 10 completas. NAO pare antes.'
  ].join('\n');

  var user = [
    'Analise o PPP a seguir e produza a extracao no formato especificado abaixo.',
    '',
    '---',
    '## PPP DA ESCOLA:',
    '',
    textoPPP.substring(0, 80000),
    '',
    '---',
    '## FORMATO DE EXTRACAO:',
    'Produza o resultado EXATAMENTE nesta estrutura, usando os delimitadores indicados.',
    'Cada secao deve ser concisa mas completa.',
    '',
    '===INICIO DA EXTRACAO===',
    '',
    '### 1. PERFIL DA ESCOLA',
    '- **Nome:** [nome completo da escola]',
    '- **Rede:** [municipal / estadual / federal / privada]',
    '- **Etapas atendidas:** [Ed. Infantil / EF1 / EF2 / EM — listar todas]',
    '- **Modalidades:** [regular / integral / EJA / educacao especial]',
    '- **Localizacao:** [municipio, UF, zona urbana ou rural]',
    '- **Porte:** [n aprox de alunos, turmas e professores]',
    '- **Turno:** [matutino / vespertino / integral / noturno]',
    '',
    '### 2. COMUNIDADE E CONTEXTO',
    'Descreva em 3-5 frases o perfil socioeconomico das familias, a origem dos alunos,',
    'e qualquer caracteristica marcante da comunidade atendida (vulnerabilidade social,',
    'diversidade cultural, ruralidade, etc.).',
    '',
    '### 3. IDENTIDADE PEDAGOGICA',
    '- **Missao:** [transcrever ou sintetizar]',
    '- **Visao:** [transcrever ou sintetizar]',
    '- **Principios declarados:** [listar os principios norteadores, maximo 8]',
    '- **Concepcao de educacao:** [resumir em 2-3 frases como a escola entende o papel da educacao]',
    '- **Concepcao de curriculo:** [disciplinar / interdisciplinar / transdisciplinar — descrever como organizam]',
    '- **Concepcao de avaliacao:** [formativa / somativa / processual — descrever como praticam]',
    '',
    '### 4. PRATICAS PEDAGOGICAS DESCRITAS',
    'Liste TODAS as praticas, projetos, programas e metodologias que o PPP descreve como',
    'parte do cotidiano da escola. Para cada uma, indique:',
    '',
    '| Pratica | Etapa/Serie | Descricao (1 frase) | Frequencia |',
    '|---------|-------------|---------------------|------------|',
    '| [nome]  | [etapa]     | [o que e]           | [semanal/semestral/anual/permanente] |',
    '',
    'Inclua: projetos interdisciplinares, programas permanentes, atividades diferenciadas,',
    'estudos do meio, saidas de estudo, oficinas, clubes, eletivas, assembleias, recuperacao,',
    'tutoria, mentoria, horta, laboratorio, biblioteca, etc.',
    '',
    '### 5. ABORDAGEM DE INCLUSAO E DIVERSIDADE',
    'Descreva em 3-5 frases como a escola trata:',
    '- Educacao especial / inclusiva (AEE, ensino colaborativo, PEI, sala de recursos)',
    '- Diversidade etnico-racial (projetos, programas, acoes afirmativas)',
    '- Genero e sexualidade (se mencionado)',
    '- Qualquer outro eixo de diversidade declarado',
    '',
    '### 6. ESTRUTURA DE GESTAO E PARTICIPACAO',
    'Descreva em 3-5 frases:',
    '- Como e a gestao (democratica? centralizada?)',
    '- Instancias de participacao (conselho de escola, APM, gremio, conselhos de classe)',
    '- Como as familias participam da vida escolar',
    '- Como os professores se organizam (reunioes pedagogicas, trabalho coletivo, coordenacao por area)',
    '',
    '### 7. INFRAESTRUTURA E RECURSOS',
    'Liste os espacos e recursos pedagogicos disponiveis mencionados no PPP:',
    '- Espacos: [laboratorios, biblioteca, auditorio, quadra, horta, sala de informatica, etc.]',
    '- Recursos tecnologicos: [computadores, projetores, internet, plataformas digitais]',
    '- Limitacoes declaradas: [problemas de infraestrutura mencionados]',
    '',
    '### 8. DESAFIOS E METAS DECLARADOS',
    'Liste os principais desafios que a escola reconhece e as metas para o periodo:',
    '',
    '**Desafios:**',
    '1. [desafio]',
    '2. [desafio]',
    '...',
    '',
    '**Metas:**',
    '1. [meta]',
    '2. [meta]',
    '...',
    '',
    '### 9. VOCABULARIO E LINGUAGEM DA ESCOLA',
    'Liste termos, siglas e expressoes especificas que a escola usa em seu cotidiano e que',
    'devem aparecer nos cenarios para soarem autenticos. Exemplos: nomes de projetos, siglas',
    'internas, nomes de espacos, cargos especificos, etc.',
    '',
    '| Termo/Sigla | Significado |',
    '|-------------|-------------|',
    '| [termo]     | [o que significa naquele contexto] |',
    '',
    '### 10. COMPETENCIAS DOCENTES PRIORIZADAS',
    'Com base no que o PPP descreve como expectativas, praticas e desafios, INFIRA quais',
    'competencias docentes sao mais valorizadas ou mais demandadas nesta escola.',
    'Liste no maximo 6, em ordem de relevancia:',
    '',
    '1. [competencia] — Justificativa: [por que o PPP indica isso]',
    '2. [competencia] — Justificativa: [por que o PPP indica isso]',
    '...',
    '',
    '===FIM DA EXTRACAO==='
  ].join('\n');

  return { system: system, user: user };
}


// ═══════════════════════════════════════════════════════════════════════
// MENU — Extrair PPPs
// ═══════════════════════════════════════════════════════════════════════

function extrairPPPsMenu() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var ws = _garantirAbaPPP(ss);

  // ── Auto-importar PDFs da pasta do Drive (se configurada) ─────────
  var folderId = PropertiesService.getScriptProperties().getProperty('PPP_FOLDER_ID') || '';
  if (folderId) {
    var importados = _importarPPPsDaPasta(ws, folderId);
    if (importados > 0) {
      SpreadsheetApp.flush();
      SpreadsheetApp.getActive().toast(importados + ' arquivo(s) importados da pasta do Drive', '📁 PPP', 5);
    }
  } else if (ws.getLastRow() < 2) {
    // Sem pasta configurada e aba vazia — perguntar
    var respPasta = ui.prompt(
      'Pasta de PPPs no Drive',
      'Cole a URL ou ID da pasta do Google Drive que contem os PDFs dos PPPs:',
      ui.ButtonSet.OK_CANCEL
    );
    if (respPasta.getSelectedButton() === ui.Button.OK) {
      folderId = _extrairDriveId(respPasta.getResponseText());
      if (folderId) {
        PropertiesService.getScriptProperties().setProperty('PPP_FOLDER_ID', folderId);
        var importados2 = _importarPPPsDaPasta(ws, folderId);
        SpreadsheetApp.flush();
        SpreadsheetApp.getActive().toast(importados2 + ' arquivo(s) importados', '📁 PPP', 5);
      }
    }
  }

  // ── Montar lista de pendentes ─────────────────────────────────────
  if (ws.getLastRow() < 2) {
    ui.alert('Nenhum PPP encontrado.\n\nColoque PDFs na pasta do Drive ou preencha manualmente a aba PPP_Escolas.');
    return;
  }

  var data = ws.getDataRange().getValues();
  var pendentes = [];
  for (var r = 1; r < data.length; r++) {
    var escola = String(data[r][PPP.COL_ESCOLA - 1] || '').trim();
    var fileIdRaw = String(data[r][PPP.COL_FILE_ID - 1] || '').trim();
    var fileId = _extrairDriveId(fileIdRaw);
    var status = String(data[r][PPP.COL_STATUS - 1] || '').toLowerCase().trim();
    if (escola && fileId && (status === 'pendente' || status === '' || status === 'erro')) {
      pendentes.push({ row: r + 1, escola: escola, fileId: fileId });
    }
  }

  if (pendentes.length === 0) {
    ui.alert('Nenhuma escola pendente para extrair.\n\nTodas ja foram processadas ou verifique a coluna Status (C).');
    return;
  }

  var resp = ui.alert(
    'Extrair PPPs',
    pendentes.length + ' escola(s) pendente(s) para processar.\n\nContinuar?',
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  var extraidos = 0, erros = 0;

  var modeloLabel = '';
  try { modeloLabel = '[' + Config.modelLabel(PropertiesService.getScriptProperties().getProperty('cfg_modelo') || '') + '] '; } catch(e) {}

  for (var i = 0; i < pendentes.length; i++) {
    if (_deveParar()) { _limparParada(); break; }
    var item = pendentes[i];
    SpreadsheetApp.getActive().toast(
      modeloLabel + item.escola + ' (' + (i + 1) + '/' + pendentes.length + ')',
      '📄 Extraindo PPP', 30
    );

    ws.getRange(item.row, PPP.COL_STATUS).setValue('Processando...');

    try {
      var texto = _lerTextoPDF(item.fileId);
      if (!texto || texto.length < 100) {
        throw new Error('Texto extraido do PDF muito curto (' + (texto || '').length + ' chars)');
      }

      var extracao = _extrairPPPViaIA(texto);

      // Sheets tem limite de ~50k chars por célula — truncar se necessário
      var MAX_CELL = 49000;
      if (extracao.length > MAX_CELL) {
        Logger.log('PPP ' + item.escola + ': truncado de ' + extracao.length + ' para ' + MAX_CELL + ' chars');
        extracao = extracao.substring(0, MAX_CELL) + '\n\n[... TRUNCADO — texto original tinha ' + extracao.length + ' chars]';
      }

      ws.getRange(item.row, PPP.COL_EXTRACAO).setValue(extracao);
      ws.getRange(item.row, PPP.COL_STATUS).setValue('Extraido');
      ws.getRange(item.row, PPP.COL_EXTRACTED).setValue(new Date().toISOString());

      // Extrair valores da seção 11 do PPP e preencher col F
      var valoresExtraidos = _extrairValoresDoPPP(extracao);
      ws.getRange(item.row, PPP.COL_VALORES).setValue(JSON.stringify(valoresExtraidos));
      extraidos++;

    } catch (e) {
      Logger.log('ERRO PPP ' + item.escola + ': ' + e.message);
      ws.getRange(item.row, PPP.COL_STATUS).setValue('Erro: ' + e.message.substring(0, 200));
      erros++;
    }

    SpreadsheetApp.flush();
    if (i < pendentes.length - 1) Utilities.sleep(3000);
  }

  ui.alert('Extracao de PPPs concluida!\n\nExtraidos: ' + extraidos + '\nErros: ' + erros);
}


// ═══════════════════════════════════════════════════════════════════════
// LEITURA DE PDF VIA OCR DO DRIVE
// ═══════════════════════════════════════════════════════════════════════

/**
 * Lê texto de qualquer arquivo do Drive (PDF, DOCX, DOC, TXT, Google Docs).
 * - Google Docs: lê diretamente via DocumentApp
 * - TXT: lê via getBlob().getDataAsString()
 * - PDF/DOCX/DOC: converte para Google Docs via Drive API (OCR) e lê o texto
 */
function _lerTextoPDF(fileId) {
  var file = DriveApp.getFileById(fileId);
  var mime = file.getMimeType();

  // Google Docs — leitura direta
  if (mime === 'application/vnd.google-apps.document') {
    var doc = DocumentApp.openById(fileId);
    return doc.getBody().getText();
  }

  // TXT / plain text — leitura direta do blob
  if (mime === 'text/plain') {
    return file.getBlob().getDataAsString('UTF-8');
  }

  // PDF, DOCX, DOC, RTF, ODT — converter via Drive API OCR
  var resource = {
    title: '_temp_ppp_ocr_' + Date.now(),
    mimeType: 'application/vnd.google-apps.document'
  };
  var copy = Drive.Files.copy(resource, fileId, { ocr: true });

  try {
    var doc = DocumentApp.openById(copy.id);
    var texto = doc.getBody().getText();
    return texto;
  } finally {
    try { DriveApp.getFileById(copy.id).setTrashed(true); } catch(e) {}
  }
}


// ═══════════════════════════════════════════════════════════════════════
// EXTRAÇÃO VIA IA (Claude)
// ═══════════════════════════════════════════════════════════════════════

function _extrairPPPViaIA(textoPPP) {
  var prompt = _buildPromptExtracaoPPP(textoPPP);

  // Usar fase 'ppp' para ter max tokens (64k Claude / 16k GPT)
  var response = AIRouter.callClaude({
    systemStatic: prompt.system,
    systemCompetencia: '',
    messages: [{ role: 'user', content: prompt.user }]
  }, 'ppp');

  // Extrair conteudo entre os delimitadores
  var match = response.match(/===INICIO DA EXTRACAO===([\s\S]*?)===FIM DA EXTRACAO===/);
  if (match) {
    return match[1].trim();
  }

  // Fallback: se nao achou delimitadores, retorna tudo (pode ter sido gerado sem eles)
  var cleaned = response.replace(/```markdown|```/g, '').trim();
  if (cleaned.length < 100) {
    throw new Error('IA retornou conteudo muito curto (' + cleaned.length + ' chars)');
  }

  return cleaned;
}


// ═══════════════════════════════════════════════════════════════════════
// BUSCA — Usado pelos geradores de cenário
// ═══════════════════════════════════════════════════════════════════════

/**
 * Retorna o texto estruturado do PPP para uma escola.
 * @param {Spreadsheet} ss
 * @param {string} escola  Nome da escola (match case-insensitive)
 * @returns {string|null}  Texto extraído do PPP ou null
 */
function buscarPPPEscola(ss, escola) {
  if (!escola) return null;

  var ws = ss.getSheetByName(PPP.SHEET_NAME);
  if (!ws || ws.getLastRow() < 2) return null;

  var escolaNorm = escola.toLowerCase().trim();
  var data = ws.getDataRange().getValues();

  for (var r = 1; r < data.length; r++) {
    var rowEscola = String(data[r][PPP.COL_ESCOLA - 1] || '').toLowerCase().trim();
    var status = String(data[r][PPP.COL_STATUS - 1] || '').toLowerCase().trim();

    if (rowEscola === escolaNorm && status === 'extraido') {
      var extracao = String(data[r][PPP.COL_EXTRACAO - 1] || '');
      if (extracao.length < 50) return null;
      return extracao;
    }
  }

  return null;
}


/**
 * Extrai uma seção específica do texto do PPP.
 * @param {string} pppTexto  Texto completo da extração
 * @param {string} secao     Nome da seção (ex: "PERFIL DA ESCOLA", "COMUNIDADE E CONTEXTO")
 * @returns {string}  Conteúdo da seção ou ''
 */
function extrairSecaoPPP(pppTexto, secao) {
  if (!pppTexto || !secao) return '';

  // Match entre ### N. SECAO e a próxima ### ou fim
  var pattern = new RegExp('###\\s*\\d+\\.\\s*' + secao + '([\\s\\S]*?)(?=###\\s*\\d+\\.|$)', 'i');
  var m = pppTexto.match(pattern);
  return m ? m[1].trim() : '';
}


/**
 * Formata contexto do PPP para injeção em prompts de cenário.
 * Seleciona as seções mais relevantes para o cenário, truncando a ~4000 chars.
 * @param {string} pppTexto  Texto completo da extração
 * @returns {string}  Texto formatado para o prompt
 */
function formatarContextoPPP(pppTexto) {
  if (!pppTexto || typeof pppTexto !== 'string') return '';

  // Seções prioritárias para cenários (na ordem de relevância)
  var secoesPrioritarias = [
    'PERFIL DA ESCOLA',
    'COMUNIDADE E CONTEXTO',
    'PRATICAS PEDAGOGICAS DESCRITAS',
    'DESAFIOS E METAS DECLARADOS',
    'VOCABULARIO E LINGUAGEM DA ESCOLA',
    'IDENTIDADE PEDAGOGICA',
    'ABORDAGEM DE INCLUSAO E DIVERSIDADE',
    'ESTRUTURA DE GESTAO E PARTICIPACAO'
  ];

  var parts = [];
  var totalChars = 0;
  var MAX_CHARS = 4000;

  for (var i = 0; i < secoesPrioritarias.length; i++) {
    if (totalChars >= MAX_CHARS) break;

    var conteudo = extrairSecaoPPP(pppTexto, secoesPrioritarias[i]);
    if (!conteudo) continue;

    // Truncar seções individuais longas
    var maxSecao = (i < 3) ? 800 : 500;  // mais espaço para seções prioritárias
    if (conteudo.length > maxSecao) conteudo = conteudo.substring(0, maxSecao) + '...';

    var header = secoesPrioritarias[i];
    var bloco = '## ' + header + '\n' + conteudo;
    parts.push(bloco);
    totalChars += bloco.length;
  }

  return parts.join('\n\n');
}


// ═══════════════════════════════════════════════════════════════════════
// BUSCA DE VALORES — Usado pela avaliação e cenários
// ═══════════════════════════════════════════════════════════════════════

/**
 * Retorna array de valores organizacionais da escola.
 * Se col F estiver vazia, retorna VALORES_BASE como fallback.
 * @param {Spreadsheet} ss
 * @param {string} escola  Nome da escola
 * @returns {string[]}  Array de valores (ex: ["Etica e integridade", ...])
 */
function buscarValoresEscola(ss, escola) {
  if (!escola) return VALORES_BASE;

  var ws = ss.getSheetByName(PPP.SHEET_NAME);
  if (!ws || ws.getLastRow() < 2) return VALORES_BASE;

  var escolaNorm = escola.toLowerCase().trim();
  var data = ws.getDataRange().getValues();

  for (var r = 1; r < data.length; r++) {
    var rowEscola = String(data[r][PPP.COL_ESCOLA - 1] || '').toLowerCase().trim();
    if (rowEscola === escolaNorm) {
      var valRaw = String(data[r][PPP.COL_VALORES - 1] || '').trim();
      if (!valRaw) return VALORES_BASE;
      try {
        var parsed = JSON.parse(valRaw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch(e) {
        // Tentar interpretar como lista separada por ;
        var items = valRaw.split(/[;\n]/).map(function(v) { return v.trim(); }).filter(Boolean);
        if (items.length > 0) return items;
      }
      return VALORES_BASE;
    }
  }

  return VALORES_BASE;
}


// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Importa TODOS os arquivos de uma pasta do Drive para a aba PPP_Escolas.
 * Aceita: PDF, DOCX, DOC, TXT, Google Docs — qualquer arquivo da pasta.
 * Usa o nome do arquivo (sem extensão) como nome da escola.
 * NUNCA sobrescreve linhas existentes — pula arquivos já presentes (match por fileId).
 * @param {Sheet} ws  Aba PPP_Escolas
 * @param {string} folderId  ID da pasta no Drive
 * @returns {number}  Quantidade de arquivos importados
 */
function _importarPPPsDaPasta(ws, folderId) {
  var folder;
  try {
    folder = DriveApp.getFolderById(folderId);
  } catch(e) {
    Logger.log('_importarPPPsDaPasta: pasta nao encontrada: ' + folderId + ' — ' + e.message);
    return 0;
  }

  // Coletar IDs já presentes na aba — NUNCA sobrescrever
  var existentes = {};
  if (ws.getLastRow() >= 2) {
    var data = ws.getRange(2, PPP.COL_FILE_ID, ws.getLastRow() - 1, 1).getValues();
    for (var r = 0; r < data.length; r++) {
      var id = _extrairDriveId(String(data[r][0] || ''));
      if (id) existentes[id] = true;
    }
  }

  // Iterar TODOS os arquivos da pasta (sem filtro de tipo)
  var importados = 0;
  var files = folder.getFiles();

  while (files.hasNext()) {
    var file = files.next();
    var fileId = file.getId();

    if (existentes[fileId]) continue;  // já está na aba — NÃO sobrescrever

    var nomeArquivo = file.getName()
      .replace(/\.(pdf|docx?|txt|odt|rtf)$/i, '')  // remover extensões comuns
      .replace(/^PPP[\s_-]*/i, '')                   // remover prefixo "PPP" comum
      .trim();

    var nomeEscola = nomeArquivo || 'Escola ' + (ws.getLastRow());

    ws.appendRow([nomeEscola, fileId, 'Pendente', '', '', '']);
    existentes[fileId] = true;
    importados++;
  }

  return importados;
}


/**
 * Extrai valores/princípios organizacionais do texto COMPLETO do PPP.
 * Varre o documento inteiro buscando por padrões de valores/princípios.
 * Estratégia:
 *   1. Busca linhas "VALOR: xxx" (formato explícito)
 *   2. Busca blocos após palavras-chave: "princípios", "valores", "norteadores"
 *   3. Busca listas numeradas/marcadas após essas palavras-chave
 * @param {string} pppTexto  Texto completo da extração do PPP
 * @returns {string[]}  Array de valores/princípios
 */
function _extrairValoresDoPPP(pppTexto) {
  if (!pppTexto) return ['Nao encontrado no PPP'];

  var linhas = pppTexto.split('\n');
  var valoresExplicitos = [];
  var kwMatch = null;   // { linha: idx, resto: texto após ":" }
  var kwPrioridade = 99; // menor = melhor (principios=0, valores=1, diretrizes=2)

  var keywords = [
    { re: /\*?\*?princ[ií]pios\s*(declarados|norteadores|institucionais|pedag[oó]gicos|fundamentais)?[^:]*:\*?\*?\s*/i, prio: 0 },
    { re: /\*?\*?valores\s*(organizacionais|institucionais|da escola|norteadores)?[^:]*:\*?\*?\s*/i, prio: 1 },
    { re: /\*?\*?diretrizes\s*(norteadoras|pedag[oó]gicas)?[^:]*:\*?\*?\s*/i, prio: 2 }
  ];

  // Passe único: busca VALOR: explícito + melhor match de keyword
  for (var i = 0; i < linhas.length; i++) {
    var linha = linhas[i];

    // Check "VALOR: xxx"
    var matchVal = linha.match(/^VALOR:\s*(.+)/i);
    if (matchVal) {
      var val = matchVal[1].replace(/\*\*/g, '').trim();
      if (val && val.length > 3 && val.length < 100) valoresExplicitos.push(val);
    }

    // Check keywords (guardar o de maior prioridade)
    for (var k = 0; k < keywords.length; k++) {
      if (keywords[k].prio >= kwPrioridade) continue; // já achamos algo melhor
      var matchKw = linha.match(keywords[k].re);
      if (matchKw) {
        kwMatch = { idx: i, resto: linha.substring(matchKw.index + matchKw[0].length).trim() };
        kwPrioridade = keywords[k].prio;
      }
    }
  }

  // Prioridade 1: VALOR: explícito
  if (valoresExplicitos.length >= 2) return valoresExplicitos.slice(0, 8);

  // Prioridade 2: extrair lista após keyword encontrada
  if (kwMatch) {
    var items = [];

    // Conteúdo na mesma linha após ":"
    if (kwMatch.resto.length > 5) {
      items = kwMatch.resto.split(/[,;]/)
        .map(function(s) { return s.replace(/\*\*/g, '').replace(/^[-•*\d.)\s]+/, '').trim(); })
        .filter(function(s) { return s.length > 3 && s.length < 80; });
    }

    // Se não achou na mesma linha, buscar lista nas linhas seguintes (max 12)
    if (items.length < 2) {
      items = [];
      for (var n = kwMatch.idx + 1; n < Math.min(kwMatch.idx + 13, linhas.length); n++) {
        var l = linhas[n].trim();
        if (/^#{1,4}\s/.test(l) || /^\*\*[A-Z]/.test(l)) {
          if (items.length > 0) break;
          continue;
        }
        if (l === '' && items.length > 0) break;
        if (l === '') continue;
        if (/^[-•*]\s/.test(l) || /^\d+[.)]\s/.test(l)) {
          var item = l.replace(/^[-•*\d.)\s]+/, '').replace(/\*\*/g, '').trim();
          if (item.length > 3 && item.length < 80) items.push(item);
        }
      }
    }

    if (items.length >= 2) return items.slice(0, 8);
  }

  return ['Nao encontrado no PPP'];
}


/**
 * Extrai o ID do arquivo de uma URL do Google Drive ou retorna o ID limpo.
 * Aceita: URL completa, URL com /d/ID/, ou ID puro.
 */
function _extrairDriveId(input) {
  if (!input) return '';
  var s = String(input).trim();
  // URL tipo https://drive.google.com/file/d/XXXXX/view...
  var match = s.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (match) return match[1];
  // URL tipo https://drive.google.com/open?id=XXXXX
  match = s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (match) return match[1];
  // Já é um ID puro (sem / ou ?)
  if (/^[a-zA-Z0-9_-]{10,}$/.test(s)) return s;
  return s;
}

function _garantirAbaPPP(ss) {
  var ws = ss.getSheetByName(PPP.SHEET_NAME);
  if (ws) return ws;

  ws = ss.insertSheet(PPP.SHEET_NAME);
  ws.appendRow(['Escola', 'Arquivo Drive ID', 'Status', 'Extracao PPP', 'Extraido em', 'Valores']);
  ws.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#0f2240').setFontColor('#ffffff');
  ws.setFrozenRows(1);
  ws.setColumnWidth(1, 250);
  ws.setColumnWidth(2, 300);
  ws.setColumnWidth(3, 120);
  ws.setColumnWidth(4, 100);
  ws.setColumnWidth(5, 160);
  ws.setColumnWidth(6, 400);
  Logger.log('Aba ' + PPP.SHEET_NAME + ' criada');
  return ws;
}