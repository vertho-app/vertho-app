// =====================================================================
// VERTHO — Fase2_Cenarios.gs  (Modelo Temático v2)
//
// MUDANÇA DE MODELO:
//   ANTES: IA 3 gerava um cenário personalizado por colaborador.
//   AGORA: Um cenário FIXO por cargo × escola × competência, compartilhado
//          por todos os colaboradores com o mesmo cargo na mesma escola.
//
// FLUXO:
//   1. gerarBancoCenarios()   → gera cenários temáticos por cargo × escola × comp
//   2. Banco_Cenarios sheet   → armazena (aprovação manual opcional)
//   3. getDiagnosticoData()   → busca do banco pelo cargo do colaborador
//   4. IA de avaliação        → recebe 4 respostas + régua → classifica
//   5. Feedback + PDI         → personalizado por perfil CIS (separado)
//
// DEPENDÊNCIAS: Código.gs (_chamarAPI, _lerBaseCompetencias, _norm, _extrairJSON)
// =====================================================================

// ─── Constantes do banco ──────────────────────────────────────────────
var BANCO = {
  SHEET_NAME:       'Banco_Cenarios',
  COL_CARGO:        1,   // A
  COL_ESCOLA:       2,   // B  (escola/unidade — col Area de Colaboradores)
  COL_COMP_ID:      3,   // C
  COL_COMP_NOME:    4,   // D
  COL_STATUS:       5,   // E  (Gerado | Aprovado | Revisão | Erro)
  COL_TITULO:       6,   // F
  COL_CONTEXTO:     7,   // G
  COL_P1:           8,   // H
  COL_P2:           9,   // I
  COL_P3:          10,   // J
  COL_P4:          11,   // K
  COL_COBERTURA:   12,   // L  (JSON)
  COL_DIFERENCIAIS:13,   // M  (JSON)
  COL_DATA:        14,   // N
  COL_CIS_GATILHO: 15,   // O
  COL_CIS_DISCRIMINA:16, // P
  HEADER_ROW: 1
};

// ═══════════════════════════════════════════════════════════════════════
// MENU — Gerar Banco de Cenários
// ═══════════════════════════════════════════════════════════════════════

function gerarBancoCenarios() {
  _carregarCFG();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  _garantirAbaBanco(ss);

  var wsCargos = ss.getSheetByName('Cargos');
  if (!wsCargos) {
    SpreadsheetApp.getUi().alert('Aba Cargos nao encontrada.');
    return;
  }

  // V2: Tentar Competencias_v2 primeiro, fallback para legado
  var mapaV2 = _lerBaseCompetenciasV2(ss);
  var baseComp;
  if (mapaV2 && Object.keys(mapaV2).length > 0) {
    // Converter mapa V2 para formato array compatível com _bancoParsearParesCargoComp
    baseComp = Object.keys(mapaV2).map(function(cod) {
      var c = mapaV2[cod];
      return {
        id: c.codigo, nome: c.nome, categoria: c.pilar, cargos: c.cargo,
        descricao: c.descricao,
        descritores: c.descritores.map(function(d) { return d.nome_curto; }).join('; '),
        _descritoresV2: c.descritores,  // dados completos para uso no prompt
        gap: '', esperado: '', perfis_gap: '', palavras: '',
        traco1: '', traco2: '', traco3: '', traco4: ''
      };
    });
    Logger.log('gerarBancoCenarios: usando V2 (' + baseComp.length + ' competencias)');
  } else {
    SpreadsheetApp.getUi().alert('Aba Competencias_v2 não encontrada ou vazia.');
    return;
  }
  var pares = _bancoParsearParesCargoComp(wsCargos, baseComp);

  if (pares.length === 0) {
    SpreadsheetApp.getUi().alert('Nenhum par cargo x competencia encontrado.\nVerifique a aba Cargos (linha 4 = cabecalho, comp em colunas Comp. 1, Comp. 2...).');
    return;
  }

  var existentes = _bancoCenariosExistentes(ss);
  var pendentes  = pares.filter(function(p) {
    return !existentes[p.cargo.toLowerCase() + '|' + (p.escola || '').toLowerCase() + '|' + p.compId.toLowerCase()];
  });

  if (pendentes.length === 0) {
    SpreadsheetApp.getUi().alert(
      'Banco ja completo!\n' + pares.length + ' cenarios existentes.\nNenhum novo par cargo x competencia encontrado.'
    );
    return;
  }

  var ui   = SpreadsheetApp.getUi();
  var resp = ui.alert(
    'Gerar Banco de Cenarios',
    pendentes.length + ' novos cenarios para gerar (de ' + pares.length + ' pares cargo x competencia).\n\nContinuar?',
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  _gerarBancoLote(ss, pendentes, 0, pendentes.length);
}

// ── Constante de lote (máx cenários por execução GAS de 6 min) ──
var BANCO_MAX_POR_LOTE = 2;

/**
 * Processa até BANCO_MAX_POR_LOTE cenários e agenda continuação automática.
 */
function _gerarBancoLote(ss, pendentes, inicio, total) {
  var gerados = 0, erros = 0;
  var fim = Math.min(inicio + BANCO_MAX_POR_LOTE, pendentes.length);

  for (var i = inicio; i < fim; i++) {
    if (_deveParar()) { _limparParada(); break; }
    var par = pendentes[i];
    SpreadsheetApp.getActive().toast(
      '[' + Config.modelLabel(_CFG.modelo || MODEL_SONNET) + ']\n' +
      par.cargo + ' x ' + par.escola + ' x ' + par.compNome +
      ' (' + (i + 1) + '/' + total + ')',
      'Gerando Banco de Cenarios', 30
    );
    try {
      _gerarEGravarCenarioBanco(ss, par);
      gerados++;
    } catch (e) {
      Logger.log('ERRO ' + par.cargo + ' x ' + par.compId + ': ' + e.message);
      erros++;
      _gravarErroBanco(ss, par, e.message);
    }
    if (i < fim - 1) Utilities.sleep(2000);
  }

  SpreadsheetApp.flush();

  // Se ainda tem pendentes, agendar continuação
  var processados = fim;
  if (processados < pendentes.length && !_deveParar()) {
    SpreadsheetApp.getActive().toast(
      'Lote concluido: ' + gerados + ' gerados, ' + erros + ' erros.\n' +
      'Continuando automaticamente... (' + processados + '/' + total + ')',
      '⏳ Banco de Cenarios', 5
    );
    // Salvar estado para continuação via trigger
    var props = PropertiesService.getScriptProperties();
    props.setProperty('_banco_continuar', 'sim');
    props.setProperty('_banco_gerados', String((Number(props.getProperty('_banco_gerados')) || 0) + gerados));
    props.setProperty('_banco_erros', String((Number(props.getProperty('_banco_erros')) || 0) + erros));

    // Trigger para continuar em 10 segundos
    ScriptApp.newTrigger('_continuarGeracaoBanco')
      .timeBased()
      .after(10 * 1000)
      .create();
    return;
  }

  // Finalizado — somar com acumulados de lotes anteriores
  var props = PropertiesService.getScriptProperties();
  var totalGerados = (Number(props.getProperty('_banco_gerados')) || 0) + gerados;
  var totalErros = (Number(props.getProperty('_banco_erros')) || 0) + erros;

  // Limpar estado
  props.deleteProperty('_banco_continuar');
  props.deleteProperty('_banco_gerados');
  props.deleteProperty('_banco_erros');

  // Verificação pós-geração: cobertura CIS por escola
  var alertasCIS = _verificarCoberturaCISPorEscola(ss);

  var msgFinal = 'Banco de cenarios concluido!\n\nGerados: ' + totalGerados + '\nErros: ' + totalErros;
  if (alertasCIS.length > 0) {
    msgFinal += '\n\n⚠️ COBERTURA CIS:\n' + alertasCIS.join('\n');
  }

  SpreadsheetApp.getActive().toast(msgFinal, '✅ Banco Completo', 15);
  try { SpreadsheetApp.getUi().alert(msgFinal); } catch(e) {}
}

/**
 * Função chamada pelo trigger de continuação automática.
 */
function _continuarGeracaoBanco() {
  // Limpar trigger que nos chamou
  var triggers = ScriptApp.getProjectTriggers();
  for (var t = 0; t < triggers.length; t++) {
    if (triggers[t].getHandlerFunction() === '_continuarGeracaoBanco') {
      ScriptApp.deleteTrigger(triggers[t]);
    }
  }

  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('_banco_continuar') !== 'sim') return;

  _carregarCFG();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Recarregar competências e pares
  var wsCargos = ss.getSheetByName('Cargos');
  if (!wsCargos) return;

  // V2: sempre ler de Competencias_v2
  var mapaV2 = _lerBaseCompetenciasV2(ss);
  if (!mapaV2 || Object.keys(mapaV2).length === 0) {
    Logger.log('_bancoContinuarGeracao: Competencias_v2 vazia — abortando');
    return;
  }
  var baseComp = Object.keys(mapaV2).map(function(cod) {
    var c = mapaV2[cod];
    return {
      id: c.codigo, nome: c.nome, categoria: c.pilar, cargos: c.cargo,
      descricao: c.descricao,
      descritores: c.descritores.map(function(d) { return d.nome_curto; }).join('; '),
      _descritoresV2: c.descritores,
      gap: '', esperado: '', perfis_gap: '', palavras: '',
      traco1: '', traco2: '', traco3: '', traco4: ''
    };
  });

  var pares = _bancoParsearParesCargoComp(wsCargos, baseComp);
  var existentes = _bancoCenariosExistentes(ss);
  var pendentes = pares.filter(function(p) {
    return !existentes[p.cargo.toLowerCase() + '|' + (p.escola || '').toLowerCase() + '|' + p.compId.toLowerCase()];
  });

  if (pendentes.length === 0) {
    // Tudo pronto — finalizar
    var totalGerados = Number(props.getProperty('_banco_gerados')) || 0;
    var totalErros = Number(props.getProperty('_banco_erros')) || 0;
    props.deleteProperty('_banco_continuar');
    props.deleteProperty('_banco_gerados');
    props.deleteProperty('_banco_erros');
    SpreadsheetApp.getActive().toast('Banco completo! Gerados: ' + totalGerados + ' | Erros: ' + totalErros, '✅', 10);
    return;
  }

  _gerarBancoLote(ss, pendentes, 0, pares.length);
}

/**
 * Verifica se os cenários gerados cobrem diferentes fatores DISC por escola.
 * Lê cis_gatilho de cada cenário no Banco e verifica distribuição.
 * Retorna array de alertas (vazio se tudo ok).
 */
function _verificarCoberturaCISPorEscola(ss) {
  var ws = ss.getSheetByName(BANCO.SHEET_NAME);
  if (!ws || ws.getLastRow() < 2) return [];

  var headers = ws.getRange(1, 1, 1, ws.getLastColumn()).getValues()[0];
  var iEscola = headers.findIndex(function(h) { return (h || '').toString().toLowerCase().includes('escola'); });
  var iCIS = headers.findIndex(function(h) { return (h || '').toString().toLowerCase().includes('cis_gatilho'); });
  if (iEscola < 0 || iCIS < 0) return [];

  var data = ws.getDataRange().getValues();
  var porEscola = {};

  for (var r = 1; r < data.length; r++) {
    var escola = String(data[r][iEscola] || '').trim();
    var cisGatilho = String(data[r][iCIS] || '').toLowerCase();
    if (!escola || !cisGatilho) continue;

    if (!porEscola[escola]) porEscola[escola] = { D: 0, I: 0, S: 0, C: 0, total: 0 };

    // Detectar fator DISC mencionado no cis_gatilho
    if (cisGatilho.includes('alto d') || cisGatilho.includes('baixo d') || cisGatilho.includes('pressao') || cisGatilho.includes('urgencia') || cisGatilho.includes('decisao')) porEscola[escola].D++;
    if (cisGatilho.includes('alto i') || cisGatilho.includes('baixo i') || cisGatilho.includes('conflito relacional') || cisGatilho.includes('persuasao') || cisGatilho.includes('confrontar')) porEscola[escola].I++;
    if (cisGatilho.includes('alto s') || cisGatilho.includes('baixo s') || cisGatilho.includes('mudanca') || cisGatilho.includes('resistencia') || cisGatilho.includes('rotina')) porEscola[escola].S++;
    if (cisGatilho.includes('alto c') || cisGatilho.includes('baixo c') || cisGatilho.includes('informacao incompleta') || cisGatilho.includes('analise') || cisGatilho.includes('dados')) porEscola[escola].C++;
    porEscola[escola].total++;
  }

  var alertas = [];
  var escolas = Object.keys(porEscola);
  for (var e = 0; e < escolas.length; e++) {
    var esc = escolas[e];
    var stats = porEscola[esc];
    if (stats.total < 3) continue; // poucos cenários, não avaliar

    var faltam = [];
    if (stats.D < 2) faltam.push('D/pressao (' + stats.D + '/2)');
    if (stats.I < 2) faltam.push('I/relacional (' + stats.I + '/2)');
    if (stats.S < 1) faltam.push('S/mudanca (' + stats.S + '/1)');
    if (stats.C < 1) faltam.push('C/informacao (' + stats.C + '/1)');

    if (faltam.length > 0) {
      alertas.push(esc + ': falta cobertura CIS em ' + faltam.join(', '));
    }
  }

  return alertas;
}

// ─── Regenerar cenário selecionado (linha ativa na planilha) ──────────
function regenerarCenarioBanco() {
  _carregarCFG();
  var ui  = SpreadsheetApp.getUi();
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var ws  = ss.getSheetByName(BANCO.SHEET_NAME);
  if (!ws) { ui.alert('Aba Banco_Cenarios nao encontrada. Rode "Gerar Banco" primeiro.'); return; }

  var linha = ws.getActiveRange().getRow();
  if (linha < 2) { ui.alert('Selecione uma linha de dados do banco.'); return; }

  var row    = ws.getRange(linha, 1, 1, BANCO.COL_DATA).getValues()[0];
  var cargo  = String(row[BANCO.COL_CARGO   - 1] || '').trim();
  var escola = String(row[BANCO.COL_ESCOLA  - 1] || '').trim();
  var compId = String(row[BANCO.COL_COMP_ID - 1] || '').trim();
  if (!cargo || !compId) { ui.alert('Linha sem cargo ou competencia.'); return; }

  var resp = ui.alert('Regenerar cenario?', cargo + ' x ' + escola + ' x ' + compId + '\n\nIsto substituira o conteudo atual da linha.', ui.ButtonSet.YES_NO);
  if (resp !== ui.Button.YES) return;

  // V2: ler de Competencias_v2
  var mapaV2 = _lerBaseCompetenciasV2(ss);
  var compV2 = mapaV2[compId.toUpperCase()] || null;
  if (!compV2) { ui.alert('Competencia ' + compId + ' nao encontrada na aba Competencias_v2.'); return; }
  var compData = {
    id: compV2.codigo, nome: compV2.nome, categoria: compV2.pilar, cargos: compV2.cargo,
    descricao: compV2.descricao,
    descritores: compV2.descritores.map(function(d) { return d.nome_curto; }).join('; '),
    _descritoresV2: compV2.descritores,
    gap: '', esperado: '', perfis_gap: '', palavras: '',
    traco1: '', traco2: '', traco3: '', traco4: ''
  };

  var par = _bancoBuildPar(cargo, compId, compData, escola);

  try {
    var resultado = _gerarCenarioBanco(par);
    _gravarCenarioBancoNaLinha(ws, linha, resultado);
    ui.alert('Cenario regenerado com sucesso!');
  } catch (e) {
    ui.alert('Erro ao regenerar: ' + e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// GERAÇÃO — Prompt v2 Temático
// ═══════════════════════════════════════════════════════════════════════

function _gerarEGravarCenarioBanco(ss, par) {
  var resultado = _gerarCenarioBanco(par);
  _gravarCenarioBanco(ss, par, resultado);
}

function _gerarCenarioBanco(par) {
  var prompt = _buildPromptCenarioBanco(par);

  var modeloCfg = _CFG.modelo || MODEL_SONNET;

  // Retry: até 2 tentativas (JSON truncado é o erro mais comum)
  var ultimoErro = '';
  for (var tentativa = 1; tentativa <= 2; tentativa++) {
    var resultado = _chamarAPI(modeloCfg, prompt.system, prompt.user, function(body) {
      var texto = body.content ? body.content[0].text : (body.choices ? body.choices[0].message.content : '');
      var parsed = _extrairJSON(texto);
      if (!parsed || !parsed.cenario) throw new Error('JSON sem campo "cenario"');
      if (!parsed.perguntas || parsed.perguntas.length < 4) throw new Error('Menos de 4 perguntas no JSON');
      return parsed;
    });

    if (!resultado.erro) return resultado;
    ultimoErro = resultado.mensagem || 'Erro na chamada da API';
    Logger.log('_gerarCenarioBanco tentativa ' + tentativa + '/2 falhou: ' + ultimoErro);
    if (tentativa < 2) Utilities.sleep(3000);
  }

  throw new Error(ultimoErro);
}

function _buildPromptCenarioBanco(par) {
  // ── JSON de saída esperado (mantém compatibilidade com parser/gravador) ──
  var jsonExemplo = {
    cargo: '...',
    competencia: { codigo: '...', nome: '...', descricao: '...' },
    descritores: [
      {numero:1,cod:'XX01_D1',nome:'...'},{numero:2,cod:'XX01_D2',nome:'...'},
      {numero:3,cod:'XX01_D3',nome:'...'},{numero:4,cod:'XX01_D4',nome:'...'},
      {numero:5,cod:'XX01_D5',nome:'...'},{numero:6,cod:'XX01_D6',nome:'...'}
    ],
    cenario: {
      titulo: '...',
      contexto: '... (250-400 palavras, personagens nomeados, dados concretos, pressao institucional)'
    },
    perguntas: [
      { numero:1, texto:'...', descritores_primarios:[1,2], descritores_secundarios:[3], o_que_diferencia_niveis:'N1:... | N2:... | N3:... | N4:...' },
      { numero:2, texto:'...', descritores_primarios:[3,4], descritores_secundarios:[1], o_que_diferencia_niveis:'N1:... | N2:... | N3:... | N4:...' },
      { numero:3, texto:'...', descritores_primarios:[5,6], descritores_secundarios:[2], o_que_diferencia_niveis:'N1:... | N2:... | N3:... | N4:...' },
      { numero:4, texto:'...', descritores_primarios:[1,5], descritores_secundarios:[4], o_que_diferencia_niveis:'N1:... | N2:... | N3:... | N4:...' }
    ],
    cobertura: {
      descritor_1:{primario_em:[1,4],secundario_em:[]},
      descritor_2:{primario_em:[1],secundario_em:[3]},
      descritor_3:{primario_em:[2],secundario_em:[1]},
      descritor_4:{primario_em:[2],secundario_em:[4]},
      descritor_5:{primario_em:[3,4],secundario_em:[2]},
      descritor_6:{primario_em:[3],secundario_em:[]}
    },
    dilema_etico_embutido: {
      valor_testado: 'nome do valor que o cenario provoca',
      onde_aparece: 'breve descricao do momento do cenario onde o dilema emerge',
      caminho_facil: 'o que o profissional faria se cedesse (ex: omitir, favorecer, ignorar)',
      caminho_etico: 'o que o profissional faria se mantivesse o valor'
    },
    cis_gatilho: 'Alto S: resistencia a mudanca quando dados contradizem a pratica estabelecida',
    cis_discrimina: 'Alto D: impoe nova diretriz sem consulta | Alto S: adia decisao buscando consenso | Alto I: suaviza o dado para nao confrontar | Alto C: questiona validade do instrumento antes de agir'
  };

  // ── SYSTEM PROMPT — Papel + Regras de Construção ──
  var system = [
    '<PAPEL>',
    'Voce e um especialista em avaliacao de competencias docentes com 20 anos de experiencia',
    'em escolas brasileiras. Sua especialidade e criar cenarios situacionais que funcionam como',
    'instrumentos diagnosticos — situacoes realistas que, pela forma como o professor responde,',
    'revelam seu nivel de maturidade em uma competencia especifica.',
    '',
    'Cada cenario deve funcionar como uma "radiografia": a resposta do professor vai revelar',
    'naturalmente em qual nivel da regua ele se encontra, sem que ele saiba que esta sendo classificado.',
    '</PAPEL>',
    '',
    '<TAREFA>',
    'Crie UM cenario situacional e 4 perguntas tematicas para avaliar a competencia descrita,',
    'considerando o cargo, a regua de maturidade e o contexto da escola.',
    '',
    'O cenario e as perguntas serao usados para TODOS os profissionais daquele cargo na escola.',
    'Devem ser padronizados, justos e comparaveis — NAO sao personalizados por individuo.',
    '',
    'Cada pergunta cobre 2-3 descritores como foco primario.',
    'TODOS os descritores devem ser cobertos pelas 4 perguntas.',
    '</TAREFA>',
    '',
    '<LIMITES_DUROS>',
    'CONTEXTO: maximo 900 caracteres.',
    'CADA PERGUNTA: maximo 200 caracteres.',
    'TENSOES: maximo 1 central + 1 complicador (total 2).',
    'STAKEHOLDERS COM NOME: maximo 2. Demais sao "a coordenadora", "uma familia", "a Secretaria".',
    'DADOS NUMERICOS: 1 dado principal. "42% nao alfabetizados" e suficiente.',
    'PRESSOES EXTERNAS: 1 (Secretaria OU familia OU supervisao — NAO as 3).',
    'PERSONAGENS NOMEADOS: usar nomes UNICOS neste banco. Max 3 aparicoes do mesmo nome nos 27 cenarios.',
    '',
    'LIMITE NOMES: So quem CRIA a tensao principal merece nome.',
    '  Quem apenas cobra ou pressiona e generico: "a coordenadora", "uma familia", "a Secretaria".',
    '',
    'LIMITE TENSOES: Max 1 tensao central + 1 complicador.',
    '  Pressoes externas: escolher UMA (Secretaria OU familia OU supervisao), nao as 3.',
    '  Teste: se pode ignorar metade das tensoes e responder bem, tem tensao demais.',
    '',
    'LIMITE FORMULA: NAO seguir sempre a mesma cadencia P1=decisao, P2=criterio, P3=pessoa, P4=acompanhamento.',
    '  Em pelo menos 1 das 4 perguntas, usar tipo alternativo:',
    '  - Surpresa: "No meio da sua acao, X acontece. O que muda?"',
    '  - Dilema etico: "Voce sabe que Y e o certo, mas Z tem custo. O que faz?"',
    '  - Reacao a derrota: "Sua proposta foi vetada. Como procede?"',
    '  - Autocritica: "Olhando para tras, o que teria feito diferente?"',
    '  - Evidencia concreta: "Mostre exatamente o que registra/documenta."',
    '  - Escala: "E se fossem 8 turmas em vez de 1?"',
    '</LIMITES_DUROS>',
    '',
    '<REGRAS_DE_CONSTRUCAO>',
    '',
    '1. ESTRUTURA DO CENARIO — FOTOGRAFIA, NAO ROMANCE',
    '   CONTEXTO (max 900 chars):',
    '   ├── 1 tensao central — o dilema que a pessoa TEM que resolver',
    '   ├── 1 complicador — o que torna a situacao mais dificil',
    '   └── max 2 stakeholders com nome — os atores que importam',
    '',
    '   TESTE: Leia so o contexto. Se precisa de mais de 10 segundos',
    '   para entender qual e o problema central, tem informacao demais.',
    '   Se a pessoa pode ignorar metade das tensoes e dar boa resposta, CORTE.',
    '',
    '2. REALISMO CONTEXTUAL',
    '   - Use APENAS elementos que existem na escola (espacos, projetos, cargos) conforme PPP',
    '   - Use vocabulario e siglas da escola',
    '   - Inclua serie/ano, momento especifico',
    '   - 1 dado concreto (numero, prazo ou porcentagem)',
    '   - REGRA DE STAKEHOLDERS: so quem CRIA a tensao merece nome.',
    '     Quem "cobra" ou "pressiona" e generico: "a Secretaria", "uma familia"',
    '',
    '3. ESTRUTURA NARRATIVA VARIADA',
    '   - Cenarios do MESMO cargo na MESMA escola DEVEM ter estruturas DIFERENTES',
    '   - Variar: momento (antes/durante/depois), escala (individual/grupal/institucional),',
    '     gatilho (dado/conflito/evento inesperado), palco (sala/reuniao/corredor)',
    '   - ABERTURAS: Max 3/9 cenarios por escola com "Voce esta conduzindo/revisando..."',
    '     Alternar: "E segunda-feira...", "Na saida...", "Ao abrir o e-mail...",',
    '     "Durante o intervalo...", comeco direto pelo dado/evento',
    '   - PROIBIDO: "Faltando X dias..." em mais de 1/3 cenarios',
    '',
    '4. DECISAO FORCADA — REGRA DE OURO',
    '   Se a pessoa pode responder SEM ABRIR MAO DE NADA, o cenario nao funciona.',
    '',
    '   4 PERGUNTAS (max 200 chars cada, tom direto):',
    '   P1: ESCOLHA — "X contesta. Voce valida e abre debate, ou mantem foco nos dados?',
    '       O que faz primeiro e o que perde ao escolher?"',
    '   P2: COMO — "Como executa, sabendo que X vai resistir?"',
    '   P3: TENSAO HUMANA — "Como lida com a pessoa que resiste/sofre?"',
    '   P4: SUSTENTABILIDADE — "Como sabe que funcionou e o que muda se nao funcionar?"',
    '   ANTI-PADRAO: NUNCA "Como voce lidaria com essa situacao?" → permite resposta vaga',
    '',
    '5. COBERTURA DE DESCRITORES',
    '   - Cada pergunta cobre 2-3 descritores PRIMARIOS',
    '   - Cada descritor PRIMARIO em pelo menos 1 pergunta',
    '   - Nenhum descritor sem cobertura',
    '',
    '6. REGRAS POR CARGO',
    '   - PROFESSOR: pelo menos 1 cenario com gatilho EM SALA em tempo real',
    '     (recusa de aluno, briga, turma dispersa, mae na porta, choro)',
    '   - DIRETOR: decisao estrategica com impacto institucional',
    '   - COORDENADOR: articulacao entre partes (professores, gestao, familias)',
    '',
    '7. FRICCAO OBRIGATORIA',
    '   Cada pergunta deve ser IMPOSSIVEL de responder com discurso pedagogico generico.',
    '   Tecnicas obrigatorias (usar pelo menos 2 por cenario):',
    '   - Ancorar no dado: "Os 42%...", "A ficha em branco...", "A frase que ela disse..."',
    '   - Pedir sequencia: "Em que ordem?" forca priorizacao',
    '   - Citar a fala do outro: "Ela disse X. O que voce responde?"',
    '   - Pedir o concreto: "Que palavras usa?", "O que exatamente registra?"',
    '   - Proibir saida facil: "...sem delegar para a coordenacao", "...sabendo que nao ha verba"',
    '   TESTE: Se resposta de 2 linhas genericas ("eu conversaria, ouviria, construiriamos juntos")',
    '   parece N3, a pergunta esta frouxa. Reescrever.',
    '',
    '8. HIERARQUIA DE FONTES CIS',
    '   O perfil CIS do cargo e referencia, nao prescricao.',
    '   Ordem de prioridade: 1) Descricao do cargo e contexto → 2) Competencia e descritores → 3) CIS',
    '   CIS serve para: escolher TIPO de tensao que revela blind spot daquele perfil,',
    '     calibrar gatilho, antecipar como perfis diferentes responderiam.',
    '   CIS NAO serve para: adicionar tensoes artificiais, forcar caracteristicas, sobrescrever descritores.',
    '',
    '9. VARIACAO DE ABERTURA',
    '   Nunca comecar 2 cenarios do mesmo cargo/escola com a mesma estrutura.',
    '   Proibido repetir em mais de 1/3: "Faltando X...", "Voce esta conduzindo...", "Voce esta revisando..."',
    '   Variar: inicio pelo dado, temporal concreto ("E quarta, 9h10"), provocacao externa,',
    '     descoberta ("Ao abrir os registros..."), in medias res ("Na reuniao, ela interrompe...")',
    '',
    '10. DIFERENCIACAO OBRIGATORIA',
    '   Mesmo cargo/escola com outros cenarios: gatilho DIFERENTE, estrutura P1-P4 com pelo menos',
    '     1 tipo de pergunta diferente, stakeholder central outra pessoa.',
    '   Mesma competencia em escola diferente: contexto LOCAL (PPP), complicador DIFERENTE.',
    '',
    '</REGRAS_DE_CONSTRUCAO>',
    '',
    '<FORMATO_DE_SAIDA>',
    'Responda APENAS com JSON valido (sem markdown, sem texto adicional).',
    'REGRA CRITICA: O JSON DEVE estar completo e valido. NUNCA trunque o JSON.',
    'Se perceber que o JSON esta ficando muito longo, prefira textos mais diretos',
    'mas NUNCA corte o JSON no meio — sempre feche todas as chaves e colchetes.',
    '',
    JSON.stringify(jsonExemplo, null, 2),
    '</FORMATO_DE_SAIDA>',
    '',
    '<CHECKLIST_QUALIDADE>',
    'Antes de finalizar, verifique CADA item:',
    '',
    'CONTENCAO:',
    '[ ] Contexto tem no maximo 900 caracteres?',
    '[ ] Cada pergunta tem no maximo 200 caracteres?',
    '[ ] Ha no maximo 1 tensao + 1 complicador?',
    '[ ] Ha no maximo 2 stakeholders com nome?',
    '[ ] O problema central e identificavel em 10 segundos de leitura?',
    '[ ] Pressoes externas sao no maximo 1 (Secretaria OU familia OU supervisao)?',
    '',
    'ESTRUTURA:',
    '[ ] Abertura NAO e "Voce esta conduzindo/revisando" se os outros 2 ja comecam assim?',
    '[ ] Estrutura narrativa DIFERENTE dos outros do mesmo cargo/escola?',
    '[ ] Nomes dos personagens sao UNICOS neste banco (max 2 aparicoes)?',
    '',
    'DECISAO:',
    '[ ] P1 forca ESCOLHA com criterio (nao "como voce lidaria")?',
    '[ ] P2 pede COMO com obstáculo?',
    '[ ] P3 aborda TENSAO HUMANA (pessoa que resiste/sofre)?',
    '[ ] P4 pede ACOMPANHAMENTO verificavel?',
    '',
    'DISCRIMINACAO:',
    '[ ] Resposta N2 seria VISIVELMENTE diferente de N3?',
    '[ ] NAO e possivel dar boa resposta ignorando o complicador?',
    '[ ] o_que_diferencia_niveis mostra progressao clara N1 a N4?',
    '',
    'CONTEXTUALIZACAO:',
    '[ ] Elementos do PPP presentes (espacos, projetos, vocabulario)?',
    '[ ] Dilema etico natural emerge da situacao (nao explicito)?',
    '[ ] dilema_etico_embutido preenchido?',
    '',
    'CARGO PROFESSOR:',
    '[ ] Pelo menos 1 cenario com gatilho EM SALA?',
    '[ ] Pressao direta de aluno/familia?',
    '',
    'ANTI-FORMULA:',
    '[ ] Pelo menos 1 das 4 perguntas e de tipo alternativo (surpresa, dilema, derrota, autocritica, evidencia, escala)?',
    '[ ] A estrutura P1-P4 e DIFERENTE dos outros cenarios deste cargo/escola?',
    '[ ] A abertura NAO repete o padrao dos outros cenarios deste cargo/escola?',
    '',
    'FRICCAO:',
    '[ ] P1 pode ser respondida com discurso generico de 2 linhas? Se sim, REESCREVER.',
    '[ ] P2 pode ser respondida com discurso generico de 2 linhas? Se sim, REESCREVER.',
    '[ ] P3 pode ser respondida com discurso generico de 2 linhas? Se sim, REESCREVER.',
    '[ ] P4 pode ser respondida com discurso generico de 2 linhas? Se sim, REESCREVER.',
    '[ ] Pelo menos 2 perguntas usam tecnica de friccao (dado concreto, sequencia, fala do outro, pedido concreto, saida bloqueada)?',
    '',
    'CIS:',
    '[ ] cis_gatilho identifica pelo menos 1 traco DISC testado?',
    '[ ] cis_discrimina mostra como pelo menos 3 perfis responderiam diferente?',
    '[ ] O gatilho CIS e coerente com o perfil ideal do cargo fornecido?',
    '</CHECKLIST_QUALIDADE>'
  ].join('\n');

  // ── USER PROMPT — Dados específicos ──
  var userParts = [];

  // Cargo
  userParts.push('<CARGO>');
  userParts.push(par.cargo);
  userParts.push('</CARGO>');
  userParts.push('');

  // Competência + Descritores
  userParts.push('<COMPETENCIA>');
  userParts.push('Nome: ' + par.compId + ' - ' + par.compNome);
  userParts.push('Descricao: ' + (par.compDescricao || ''));
  userParts.push('');

  // V2: Descritores detalhados com N1-N4, evidências e perguntas-alvo
  if (par.descritoresV2 && par.descritoresV2.length > 0) {
    userParts.push('DESCRITORES (6 descritores com niveis, evidencias e perguntas-alvo):');
    userParts.push('');
    par.descritoresV2.forEach(function(d, i) {
      userParts.push('DESCRITOR ' + (i + 1) + ': ' + d.cod + ' — ' + d.nome_curto);
      userParts.push('Descricao: ' + d.completo);
      userParts.push('N1 (Emergente): ' + d.n1);
      userParts.push('N3 (Proficiente): ' + d.n3);
      if (d.evidencia) userParts.push('Evidencia esperada: ' + d.evidencia);
      if (d.pergunta_alvo) userParts.push('Pergunta-alvo: ' + d.pergunta_alvo);
      userParts.push('');
    });
    userParts.push('REGRA DE COBERTURA: Cada pergunta cobre >=2 descritores como primarios.');
    userParts.push('As 4 perguntas JUNTAS cobrem TODOS os 6 descritores.');
    userParts.push('Use as perguntas-alvo como INSPIRACAO (nao copiar literalmente).');
  } else {
    // Fallback legado
    var numDesc = par.descritores.length;
    var descritoresTexto = numDesc > 0
      ? par.descritores.map(function(d, i) { return (i + 1) + '. ' + d; }).join('\n')
      : '(descritores nao cadastrados)';
    userParts.push('Descritores:');
    userParts.push(descritoresTexto);
  }
  userParts.push('</COMPETENCIA>');
  userParts.push('');

  // Régua de maturidade
  userParts.push('<REGUA_DE_MATURIDADE>');
  if (par.regua) {
    userParts.push(par.regua);
  } else {
    userParts.push('Nivel 1 — Emergente: ' + (par.nivel1 || '(nao definido)'));
    userParts.push('Nivel 2 — Em desenvolvimento: ' + (par.nivel2 || '(nao definido)'));
    userParts.push('Nivel 3 — Proficiente: ' + (par.nivel3 || '(nao definido)'));
    userParts.push('Nivel 4 — Referencia: ' + (par.nivel4 || '(nao definido)'));
  }
  userParts.push('</REGUA_DE_MATURIDADE>');
  userParts.push('');

  // Contexto da escola (PPP)
  userParts.push('<CONTEXTO_DA_ESCOLA>');
  if (par.contextoPPP) {
    userParts.push(par.contextoPPP);
  } else {
    userParts.push('Escola: ' + (par.escola || 'Escola publica municipal'));
    userParts.push('Segmento: Escola publica municipal - Ensino Fundamental');
  }
  userParts.push('</CONTEXTO_DA_ESCOLA>');
  userParts.push('');

  // Valores organizacionais da escola
  var vals = par.valores || VALORES_BASE;
  userParts.push('<VALORES_DA_ESCOLA>');
  vals.forEach(function(v, i) { userParts.push((i + 1) + '. ' + v); });
  userParts.push('');
  userParts.push('REGRA DE VALORES: O cenario DEVE conter pelo menos 1 dilema onde o');
  userParts.push('caminho mais facil/rapido entra em conflito com um dos valores acima.');
  userParts.push('NAO explicitar o dilema — ele deve emergir NATURALMENTE da situacao.');
  userParts.push('O cenario testa competencia E valor simultaneamente.');
  userParts.push('</VALORES_DA_ESCOLA>');
  userParts.push('');

  // Perfil CIS ideal do cargo (gabarito da IA2)
  if (par.gabaritoCIS && par.gabaritoCIS.resumo) {
    userParts.push('<INSTRUCAO_USO_CIS>');
    userParts.push('O perfil CIS abaixo e o perfil IDEAL para este cargo nesta escola. Use-o para:');
    userParts.push('1. Escolher o TIPO de gatilho que revela pontos cegos deste perfil');
    userParts.push('   (ex: se perfil ideal tem Alto S, crie pressao de mudanca/urgencia)');
    userParts.push('2. Preencher cis_gatilho e cis_discrimina no JSON de saida');
    userParts.push('3. Calibrar a tensao — o cenario deve ser desafiador para ESTE perfil');
    userParts.push('');
    userParts.push('NAO use o CIS para:');
    userParts.push('- Adicionar tensoes artificiais ao cenario');
    userParts.push('- Mencionar termos como "DISC", "perfil", "comportamental" no cenario');
    userParts.push('- Criar cenarios que so 1 perfil conseguiria responder');
    userParts.push('  (qualquer pessoa responde, mas o PERFIL influencia COMO responde)');
    userParts.push('</INSTRUCAO_USO_CIS>');
    userParts.push('');
    userParts.push('<PERFIL_CIS_IDEAL_DO_CARGO>');
    userParts.push(par.gabaritoCIS.resumo);
    userParts.push('</PERFIL_CIS_IDEAL_DO_CARGO>');
  }

  return { system: system, user: userParts.join('\n') };
}

// ═══════════════════════════════════════════════════════════════════════
// GRAVAÇÃO NO BANCO
// ═══════════════════════════════════════════════════════════════════════

function _gravarCenarioBanco(ss, par, resultado) {
  var ws = ss.getSheetByName(BANCO.SHEET_NAME);
  if (!ws) return;

  var p    = resultado.perguntas || [];
  var getP = function(n) { return (p[n] && p[n].texto) ? String(p[n].texto) : ''; };

  var diferenciais = JSON.stringify(p.map(function(q) {
    return { numero: q.numero, o_que_diferencia_niveis: q.o_que_diferencia_niveis || '' };
  }));

  ws.appendRow([
    par.cargo,
    par.escola || '',
    par.compId,
    par.compNome,
    'Gerado',
    (resultado.cenario && resultado.cenario.titulo)   || '',
    (resultado.cenario && resultado.cenario.contexto) || '',
    getP(0), getP(1), getP(2), getP(3),
    JSON.stringify(resultado.cobertura || {}),
    diferenciais,
    new Date().toISOString(),
    resultado.cis_gatilho || '',
    resultado.cis_discrimina || ''
  ]);
}

function _gravarCenarioBancoNaLinha(ws, linha, resultado) {
  var p    = resultado.perguntas || [];
  var getP = function(n) { return (p[n] && p[n].texto) ? String(p[n].texto) : ''; };
  var diferenciais = JSON.stringify(p.map(function(q) {
    return { numero: q.numero, o_que_diferencia_niveis: q.o_que_diferencia_niveis || '' };
  }));

  ws.getRange(linha, BANCO.COL_STATUS).setValue('Gerado');
  ws.getRange(linha, BANCO.COL_TITULO).setValue((resultado.cenario && resultado.cenario.titulo)   || '');
  ws.getRange(linha, BANCO.COL_CONTEXTO).setValue((resultado.cenario && resultado.cenario.contexto) || '');
  ws.getRange(linha, BANCO.COL_P1).setValue(getP(0));
  ws.getRange(linha, BANCO.COL_P2).setValue(getP(1));
  ws.getRange(linha, BANCO.COL_P3).setValue(getP(2));
  ws.getRange(linha, BANCO.COL_P4).setValue(getP(3));
  ws.getRange(linha, BANCO.COL_COBERTURA).setValue(JSON.stringify(resultado.cobertura || {}));
  ws.getRange(linha, BANCO.COL_DIFERENCIAIS).setValue(diferenciais);
  ws.getRange(linha, BANCO.COL_DATA).setValue(new Date().toISOString());
  ws.getRange(linha, BANCO.COL_CIS_GATILHO).setValue(resultado.cis_gatilho || '');
  ws.getRange(linha, BANCO.COL_CIS_DISCRIMINA).setValue(resultado.cis_discrimina || '');
}

function _gravarErroBanco(ss, par, mensagem) {
  var ws = ss.getSheetByName(BANCO.SHEET_NAME);
  if (!ws) return;
  var row = [];
  for (var c = 0; c < BANCO.COL_DATA; c++) row.push('');
  row[BANCO.COL_CARGO    - 1] = par.cargo;
  row[BANCO.COL_ESCOLA   - 1] = par.escola || '';
  row[BANCO.COL_COMP_ID  - 1] = par.compId;
  row[BANCO.COL_COMP_NOME- 1] = par.compNome;
  row[BANCO.COL_STATUS   - 1] = 'Erro';
  row[BANCO.COL_TITULO   - 1] = mensagem;
  row[BANCO.COL_DATA     - 1] = new Date().toISOString();
  ws.appendRow(row);
}

// ═══════════════════════════════════════════════════════════════════════
// BUSCA DO BANCO — usada por Diagnosticofase2.gs
// ═══════════════════════════════════════════════════════════════════════

/**
 * Busca cenarios do Banco_Cenarios pelo cargo do colaborador.
 * Retorna array compativel com o formato esperado por getDiagnosticoData.
 */
function bancoBuscarCenarios(ss, colab) {
  var ws = ss.getSheetByName(BANCO.SHEET_NAME);
  if (!ws || ws.getLastRow() < 2) return [];

  var data        = ws.getRange(2, 1, ws.getLastRow() - 1, BANCO.COL_DATA).getValues();
  var cargoColab  = _norm(String(colab.cargo  || '')).toLowerCase().trim();
  var escolaColab = _norm(String(colab.area || colab.escola || '')).toLowerCase().trim();
  var resultados  = [];
  var compVistas  = {};

  // Debug: log first row values for comparison
  if (data.length > 0) {
    var dbgCargo = _norm(String(data[0][BANCO.COL_CARGO - 1] || '')).toLowerCase().trim();
    var dbgEscola = _norm(String(data[0][BANCO.COL_ESCOLA - 1] || '')).toLowerCase().trim();
    Logger.log('bancoBuscar: colab cargo=[' + cargoColab + '] escola=[' + escolaColab + '] | banco[0] cargo=[' + dbgCargo + '] escola=[' + dbgEscola + ']');
  }

  for (var i = 0; i < data.length; i++) {
    var cargo  = _norm(String(data[i][BANCO.COL_CARGO    - 1] || '')).toLowerCase().trim();
    var escola = _norm(String(data[i][BANCO.COL_ESCOLA   - 1] || '')).toLowerCase().trim();
    var compId = String(data[i][BANCO.COL_COMP_ID  - 1] || '').trim();
    var status = String(data[i][BANCO.COL_STATUS   - 1] || '').toLowerCase().trim();

    if (cargo !== cargoColab) continue;
    if (escola !== escolaColab) continue;
    if (status !== 'gerado' && status !== 'aprovado') continue;
    if (!compId || compVistas[compId.toLowerCase()]) continue;
    compVistas[compId.toLowerCase()] = true;

    resultados.push({
      compId:      compId,
      compNome:    String(data[i][BANCO.COL_COMP_NOME - 1] || ''),
      contexto:    String(data[i][BANCO.COL_CONTEXTO  - 1] || ''),
      personagens: '',   // v2: embutido no contexto narrativo
      gatilho:     '',   // v2: embutido no contexto narrativo
      p1:          String(data[i][BANCO.COL_P1 - 1] || ''),
      p2:          String(data[i][BANCO.COL_P2 - 1] || ''),
      p3:          String(data[i][BANCO.COL_P3 - 1] || ''),
      p4:          String(data[i][BANCO.COL_P4 - 1] || ''),
      titulo:      String(data[i][BANCO.COL_TITULO - 1] || '')
    });
  }

  return resultados;
}

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

function _garantirAbaBanco(ss) {
  var ws = ss.getSheetByName(BANCO.SHEET_NAME);
  if (ws) return ws;

  ws = ss.insertSheet(BANCO.SHEET_NAME);
  ws.appendRow([
    'Cargo', 'Escola', 'Comp. ID', 'Comp. Nome', 'Status',
    'Cenario Titulo', 'Cenario Contexto',
    'P1', 'P2', 'P3', 'P4',
    'Cobertura JSON', 'Diferenciais N1-N4', 'Data Geracao',
    'CIS Gatilho', 'CIS Discrimina'
  ]);
  ws.getRange(1, 1, 1, 16).setFontWeight('bold').setBackground('#0f2240').setFontColor('#ffffff');
  ws.setFrozenRows(1);
  ws.setColumnWidth(1, 180); ws.setColumnWidth(2, 200); ws.setColumnWidth(3, 80);
  ws.setColumnWidth(4, 160); ws.setColumnWidth(5, 90);  ws.setColumnWidth(6, 200);
  ws.setColumnWidth(7, 350); ws.setColumnWidth(8, 280); ws.setColumnWidth(9, 280);
  ws.setColumnWidth(10,280); ws.setColumnWidth(11,280); ws.setColumnWidth(12, 80);
  ws.setColumnWidth(13, 80); ws.setColumnWidth(14,160);
  Logger.log('Aba ' + BANCO.SHEET_NAME + ' criada');
  return ws;
}

function _bancoCenariosExistentes(ss) {
  var existentes = {};
  var ws = ss.getSheetByName(BANCO.SHEET_NAME);
  if (!ws || ws.getLastRow() < 2) return existentes;
  var data = ws.getRange(2, 1, ws.getLastRow() - 1, 5).getValues();
  for (var i = 0; i < data.length; i++) {
    var cargo  = String(data[i][0] || '').toLowerCase().trim();
    var escola = String(data[i][1] || '').toLowerCase().trim();
    var compId = String(data[i][2] || '').toLowerCase().trim();
    var status = String(data[i][4] || '').toLowerCase().trim();
    if (cargo && compId && status !== 'erro') existentes[cargo + '|' + escola + '|' + compId] = true;
  }
  return existentes;
}

/** Parseia pares Cargo x Escola x Competencia das abas Cargos e Colaboradores. */
function _bancoParsearParesCargoComp(wsCargos, baseComp) {
  var pares    = [];
  var vistos   = {};
  var mapaComp = {};
  baseComp.forEach(function(c) { mapaComp[String(c.id).trim()] = c; });

  // Escola vem direto da aba Cargos (col "Área/Depto" = col D)
  // Cada linha de cargo JÁ tem sua escola — não precisa cruzar com Colaboradores

  var dados   = wsCargos.getDataRange().getValues();
  if (dados.length < 5) return pares;
  var headers = dados[3];

  var gH = function(label) {
    return headers.findIndex(function(h) {
      return h && _norm(h).toLowerCase().includes(label.toLowerCase());
    });
  };

  var iNome  = gH('nome do cargo');
  var iEscola = gH('area');  if (iEscola < 0) iEscola = gH('depto');  if (iEscola < 0) iEscola = gH('empresa');
  var iTop5  = headers.findIndex(function(h) { return h && _norm(String(h)).toLowerCase().includes('top 5'); });
  var iComp1 = headers.findIndex(function(h) { return h && /Comp\.?\s*1/i.test(_norm(String(h))); });

  for (var r = 4; r < dados.length; r++) {
    var cargo = iNome >= 0 ? _norm(String(dados[r][iNome] || '')).trim() : '';
    if (!cargo) continue;

    var escola = iEscola >= 0 ? _norm(String(dados[r][iEscola] || '')).trim() : '';

    var compIds = [];
    var top5Raw = iTop5 >= 0 ? _norm(String(dados[r][iTop5] || '')) : '';
    if (top5Raw && !top5Raw.toLowerCase().includes('ia') && !top5Raw.toLowerCase().includes('preencher')) {
      compIds = top5Raw.split(',').map(function(s) { return s.trim().toUpperCase(); }).filter(Boolean);
    }
    if (compIds.length === 0 && iComp1 >= 0) {
      for (var c = 0; c < 5; c++) {
        var cell = _norm(String(dados[r][iComp1 + c] || ''));
        if (!cell || cell.toLowerCase().includes('ia')) continue;
        var id = cell.split('|')[0].trim().toUpperCase();
        if (id && id.startsWith('C')) compIds.push(id);
      }
    }

    // Para cada competência desta linha cargo × escola
    compIds.forEach(function(compId) {
      var compData = mapaComp[compId];
      if (!compData) return;
      var key = cargo.toLowerCase() + '|' + escola.toLowerCase() + '|' + compId.toLowerCase();
      if (vistos[key]) return;
      vistos[key] = true;
      pares.push(_bancoBuildPar(cargo, compId, compData, escola));
    });
  }

  return pares;
}

function _bancoBuildPar(cargo, compId, compData, escola) {
  // V2: descritores são objetos com N1-N4
  var descritoresV2 = compData._descritoresV2 || null;
  var descritoresTexto;
  if (descritoresV2 && descritoresV2.length > 0) {
    descritoresTexto = descritoresV2.map(function(d) { return d.nome_curto; });
  } else {
    descritoresTexto = (compData.descritores || '')
      .split(/[;,\n]/).map(function(d) { return d.trim(); }).filter(function(d) { return d.length > 0; });
  }

  // V2: Gerar régua a partir dos descritores (sem buscar aba Regua Maturidade)
  var reguaCompleta = '';
  if (descritoresV2 && descritoresV2.length > 0) {
    reguaCompleta = _gerarReguaDeDescritores({
      codigo: compId, nome: compData.nome || compId, descritores: descritoresV2
    });
  } else {
    try { reguaCompleta = StateManager.getReguaMaturidade(cargo, compData.nome || '') || ''; } catch(e) {}
  }

  // Buscar contexto PPP e valores da escola
  var contextoPPP = '';
  var valores = VALORES_BASE;
  var gabaritoCIS = null;
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var pppTexto = buscarPPPEscola(ss, escola);
    if (pppTexto) contextoPPP = formatarContextoPPP(pppTexto);
    valores = buscarValoresEscola(ss, escola);
    gabaritoCIS = _buscarGabaritoCISCargo(ss, cargo, escola);
  } catch(e) { Logger.log('_bancoBuildPar: erro ao buscar PPP/valores/CIS: ' + e.message); }

  return {
    cargo:          cargo,
    escola:         escola || '',
    compId:         String(compId).trim(),
    compNome:       compData.nome      || compId,
    compDescricao:  compData.descricao || '',
    descritores:    descritoresTexto,
    descritoresV2:  descritoresV2,     // objetos completos com N1-N4
    regua:          reguaCompleta,
    contextoPPP:    contextoPPP,
    valores:        valores,
    gabaritoCIS:    gabaritoCIS,
    nivel1:         compData.gap      || '',
    nivel2:         compData.esperado || '',
    nivel3:         '',
    nivel4:         ''
  };
}

/**
 * Busca o gabarito CIS ideal do cargo (Telas 1-4) na aba Cargos.
 * Match por cargo + escola (col C "Nome do Cargo" + col D "Área/Depto").
 * @returns {Object|null}  { tela1, tela2, tela3, tela4, resumo }
 */
function _buscarGabaritoCISCargo(ss, cargo, escola) {
  var wsCargos = ss.getSheetByName('Cargos');
  if (!wsCargos || wsCargos.getLastRow() < 5) return null;

  var headers = wsCargos.getRange(4, 1, 1, wsCargos.getLastColumn()).getValues()[0];
  var _h = function(label) {
    return headers.findIndex(function(h) { return h && _norm(h).toLowerCase().includes(label.toLowerCase()); });
  };

  var iCargo  = _h('nome do cargo');
  var iEscola = _h('area'); if (iEscola < 0) iEscola = _h('depto'); if (iEscola < 0) iEscola = _h('empresa');
  var iTela1 = _h('tela 1');
  var iTela2 = _h('tela 2');  if (iTela2 < 0) iTela2 = _h('competencias cis'); if (iTela2 < 0) iTela2 = _h('competências cis');
  var iTela3 = _h('tela 3');  if (iTela3 < 0) iTela3 = _h('estilo');
  var iTela4 = _h('tela 4');  if (iTela4 < 0) iTela4 = _h('perfil disc');

  if (iCargo < 0 || (iTela1 < 0 && iTela4 < 0)) return null;

  var dados = wsCargos.getDataRange().getValues();
  var cargoNorm = cargo.toLowerCase().trim();
  var escolaNorm = (escola || '').toLowerCase().trim();

  for (var r = 4; r < dados.length; r++) {
    var rowCargo = _norm(String(dados[r][iCargo] || '')).toLowerCase().trim();
    var rowEscola = iEscola >= 0 ? _norm(String(dados[r][iEscola] || '')).toLowerCase().trim() : '';

    if (rowCargo === cargoNorm && (escolaNorm === '' || rowEscola === escolaNorm)) {
      var t1 = iTela1 >= 0 ? String(dados[r][iTela1] || '') : '';
      var t2 = iTela2 >= 0 ? String(dados[r][iTela2] || '') : '';
      var t3 = iTela3 >= 0 ? String(dados[r][iTela3] || '') : '';
      var t4 = iTela4 >= 0 ? String(dados[r][iTela4] || '') : '';

      if (!t1 && !t2 && !t3 && !t4) return null;

      // Montar resumo compacto para injeção no prompt
      var resumoParts = [];
      if (t3) resumoParts.push('ESTILO: ' + t3.replace(/\n/g, ' | '));
      if (t4) resumoParts.push('DISC IDEAL: ' + t4.replace(/\n/g, ' | '));
      if (t1) resumoParts.push('CARACTERISTICAS: ' + t1.substring(0, 300));
      if (t2) resumoParts.push('SUB-COMPETENCIAS CIS: ' + t2.substring(0, 400));

      return {
        tela1: t1,
        tela2: t2,
        tela3: t3,
        tela4: t4,
        resumo: resumoParts.join('\n')
      };
    }
  }

  return null;
}


// =======================================================================
// CHECK IA — VALIDACAO AUTOMATICA DO BANCO DE CENARIOS (Gemini)
// =======================================================================
// Avalia cada cenario+4 perguntas do Banco_Cenarios usando Gemini.
// Criterios especificos do modelo tematico v2:
//   1. Cobertura de descritores (25 pts)
//   2. Qualidade do cenario     (25 pts)
//   3. Qualidade das perguntas  (25 pts)
//   4. Discriminacao de niveis  (25 pts)
// Nota >= 90 = Aprovado (auto-muda Status na planilha)
// =======================================================================

function checkBancoCenarios() {
  _carregarCFG();
  _limparParada();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName(BANCO.SHEET_NAME);
  if (!ws) {
    SpreadsheetApp.getUi().alert('Aba Banco_Cenarios nao encontrada. Rode "Gerar Banco" primeiro.');
    return;
  }

  if (ws.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('Banco_Cenarios esta vazio.');
    return;
  }

  // Garantir colunas de output
  var iNota  = _bancoGarantirColCheck(ws, 'Nota Check',          '#0F2B54');
  var iCheck = _bancoGarantirColCheck(ws, 'Status Check',        '#0F2B54');
  var iJust  = _bancoGarantirColCheck(ws, 'Justificativa Check', '#0F2B54');
  var iSug   = _bancoGarantirColCheck(ws, 'Sugestao Check',      '#1A56DB');

  var THRESHOLD = 80;
  var avaliados = 0, aprovados = 0, revisar = 0, pulados = 0;

  var data = ws.getRange(2, 1, ws.getLastRow() - 1, Math.max(BANCO.COL_DATA, iNota + 1)).getValues();

  for (var r = 0; r < data.length; r++) {
    var row = data[r];

    var cargo    = String(row[BANCO.COL_CARGO    - 1] || '').trim();
    var compId   = String(row[BANCO.COL_COMP_ID  - 1] || '').trim();
    var compNome = String(row[BANCO.COL_COMP_NOME- 1] || '').trim();
    var status   = String(row[BANCO.COL_STATUS   - 1] || '').toLowerCase().trim();
    var contexto = String(row[BANCO.COL_CONTEXTO - 1] || '').trim();
    var p1       = String(row[BANCO.COL_P1       - 1] || '').trim();

    if (!cargo || !compId || !contexto || !p1) continue;
    if (status !== 'gerado' && status !== 'revisao') continue;

    // Pular se ja tem nota valida
    var notaExist = (iNota >= 0 && row[iNota]) ? String(row[iNota]).trim() : '';
    if (notaExist && notaExist !== '0' && notaExist !== 'Erro') { pulados++; continue; }

    if (_deveParar()) { _limparParada(); break; }

    SpreadsheetApp.getActive().toast(
      '[' + Config.modelLabel(_CFG.modelo || MODEL_SONNET) + ']\n' + cargo + ' x ' + String(row[BANCO.COL_ESCOLA - 1] || '').trim() + ' x ' + compNome + ' (' + (avaliados + 1) + ')',
      'Check IA Banco', 10
    );

    var cobertura = String(row[BANCO.COL_COBERTURA    - 1] || '');
    var difer     = String(row[BANCO.COL_DIFERENCIAIS - 1] || '');

    var resultado = _checkUmCenarioBanco({
      cargo:         cargo,
      compId:        compId,
      compNome:      compNome,
      contexto:      contexto,
      p1:            p1,
      p2:            String(row[BANCO.COL_P2 - 1] || ''),
      p3:            String(row[BANCO.COL_P3 - 1] || ''),
      p4:            String(row[BANCO.COL_P4 - 1] || ''),
      cobertura:     cobertura,
      diferenciais:  difer
    });

    var linha = r + 2; // +2 porque data começa da linha 2

    if (resultado.erro) {
      if (iNota  >= 0) ws.getRange(linha, iNota  + 1).setValue('Erro');
      if (iCheck >= 0) ws.getRange(linha, iCheck + 1).setValue('Erro');
      if (iJust  >= 0) ws.getRange(linha, iJust  + 1).setValue(resultado.mensagem);
      Logger.log('Check IA erro linha ' + linha + ': ' + resultado.mensagem);
      avaliados++;
      continue;
    }

    var nota       = resultado.nota;
    var statusChk  = nota >= THRESHOLD ? 'Aprovado' : 'Revisar';
    var bg         = nota >= THRESHOLD ? '#D4EDDA'   : '#FFF3CD';

    if (iNota  >= 0) ws.getRange(linha, iNota  + 1).setValue(nota).setBackground(bg);
    if (iCheck >= 0) ws.getRange(linha, iCheck + 1).setValue(statusChk).setBackground(bg);
    if (iJust  >= 0) ws.getRange(linha, iJust  + 1).setValue(resultado.justificativa);
    if (iSug   >= 0) ws.getRange(linha, iSug   + 1).setValue(resultado.sugestao || '');

    // Auto-aprovar no campo Status principal
    if (statusChk === 'Aprovado') {
      ws.getRange(linha, BANCO.COL_STATUS).setValue('Aprovado');
    }

    avaliados++;
    if (statusChk === 'Aprovado') aprovados++; else revisar++;
    SpreadsheetApp.flush();
  }

  SpreadsheetApp.getUi().alert(
    'Check IA Banco — Concluido\n\n' +
    'Aprovados (>=' + THRESHOLD + '): ' + aprovados + '\n' +
    'Revisar (<' + THRESHOLD + '): ' + revisar + '\n' +
    'Ja avaliados (pulados): ' + pulados + '\n' +
    'Total avaliados agora: ' + avaliados
  );
}

function _checkUmCenarioBanco(inp) {
  var system = [
    'Voce e um avaliador especialista em Design de Diagnostico Comportamental para o contexto educacional.',
    '',
    'Avalie o cenario e as 4 perguntas com base em 4 dimensoes (25 pts cada, total 100):',
    '',
    '1. COBERTURA DE DESCRITORES (25 pts)',
    '   - Todos os descritores da competencia aparecem como PRIMARIOS em pelo menos 1 pergunta?',
    '   - A distribuicao e equilibrada?',
    '   - Nenhum descritor ficou sem cobertura?',
    '',
    '2. QUALIDADE DO CENARIO (25 pts)',
    '   - O cenario e realista para o cargo indicado?',
    '   - DENSIDADE CONTROLADA: no maximo 2-3 tensoes centrais que CONVERGEM para 1 dilema?',
    '     (NAO deve ter 6-8 tensoes empilhadas)',
    '   - Max 2 personagens com nome (demais referenciados pelo papel: "a coordenadora", "a Secretaria")',
    '   - Inclui pelo menos 1 dado concreto (numero, prazo, porcentagem)?',
    '   - O problema central e identificavel em 10 segundos de leitura?',
    '   - Para Professor: pelo menos 1 cenario tem gatilho ACONTECENDO EM SALA?',
    '',
    '3. QUALIDADE DAS PERGUNTAS (25 pts)',
    '   - As perguntas sao abertas e FORCAM DECISAO (nao "como voce lidaria...")?',
    '   - Progressao: P1=ESCOLHA com criterio, P2=TRADE-OFF real, P3=ACAO CONCRETA com risco, P4=ACOMPANHAMENTO?',
    '   - Nenhuma pergunta induz a resposta certa?',
    '   - As perguntas sao coerentes com o cenario (nao poderiam ser feitas sem ele)?',
    '   - TESTE: Se a pessoa pode responder sem abrir mao de nada, a pergunta nao forca escolha',
    '',
    '4. DISCRIMINACAO DE NIVEIS (25 pts)',
    '   - O campo "o_que_diferencia_niveis" esta preenchido para cada pergunta?',
    '   - A progressao N1 -> N2 -> N3 -> N4 e clara e nao ambigua?',
    '   - N1 e generica/reativa, N4 e sistemica/formadora?',
    '   - Ha diferenca REAL entre N2 e N3 (nao apenas uma repeticao mais elaborada)?',
    '',
    'ERROS GRAVES (qualquer um forca nota maxima 60 e status Revisar):',
    '- Pergunta fechada (resposta sim/nao)',
    '- Algum descritor sem cobertura primaria',
    '- Cenario sem nenhum personagem nomeado',
    '- Perguntas sem relacao com o cenario',
    '- Campo o_que_diferencia_niveis vazio ou identico entre perguntas',
    '- Cenario com mais de 5 tensoes simultaneas (sobrecarregado)',
    '',
    'ERROS MENORES (penalizar -3 pts cada, nao forcar nota maxima):',
    '- Cenario com mais de 3 personagens nomeados',
    '- Pergunta tipo "Como voce lidaria..." sem forcar escolha especifica',
    '- Cenario comeca com "Faltando X dias..." (aceitavel 1 em 3, penalizar se padrao)',
    '',
    'Nota >= 80 = aprovado sem revisao humana.',
    'Para notas < 80, inclua em "sugestao" a versao reescrita do elemento mais fraco.',
    '',
    'Retorne APENAS JSON valido, sem markdown:',
    '{"nota":85,"erro_grave":false,"dimensoes":{"cobertura":22,"cenario":23,"perguntas":20,"niveis":20},"justificativa":"O que esta bom e o que precisa melhorar.","sugestao":"Versao reescrita do elemento mais fraco. Vazio se aprovado."}'
  ].join('\n');

  // Parsear cobertura para incluir no contexto
  var coberturaTexto = '';
  try {
    var cob = JSON.parse(inp.cobertura || '{}');
    var keys = Object.keys(cob);
    if (keys.length > 0) {
      coberturaTexto = '\nCOBERTURA MAPEADA:\n' + keys.map(function(k) {
        return k + ': primario_em=' + JSON.stringify(cob[k].primario_em) + ' secundario_em=' + JSON.stringify(cob[k].secundario_em);
      }).join('\n');
    }
  } catch(e) {}

  // Parsear diferenciais
  var diferenciaisTexto = '';
  try {
    var dif = JSON.parse(inp.diferenciais || '[]');
    if (dif.length > 0) {
      diferenciaisTexto = '\nDISCRIMINACAO DE NIVEIS:\n' + dif.map(function(d) {
        return 'Q' + d.numero + ': ' + (d.o_que_diferencia_niveis || '(vazio)');
      }).join('\n');
    }
  } catch(e) {}

  var user = [
    'CARGO: ' + inp.cargo,
    'COMPETENCIA: ' + inp.compId + ' - ' + inp.compNome,
    '',
    'CENARIO:',
    inp.contexto,
    '',
    'PERGUNTAS:',
    'Q1: ' + inp.p1,
    'Q2: ' + inp.p2,
    'Q3: ' + inp.p3,
    'Q4: ' + inp.p4,
    coberturaTexto,
    diferenciaisTexto
  ].join('\n');

  return _chamarAPI(_CFG.modelo || MODEL_SONNET, system, user, function(body) {
    var parsed = _extrairJSON(body.content[0].text);
    var nota = Number(parsed.nota) || 0;
    if (parsed.erro_grave === true && nota > 60) nota = 60;
    return {
      erro:          false,
      nota:          nota,
      erroGrave:     parsed.erro_grave === true,
      justificativa: parsed.justificativa || '',
      sugestao:      (parsed.sugestao || '').trim(),
      dimensoes:     parsed.dimensoes || {}
    };
  });
}

function _bancoGarantirColCheck(ws, label, bg) {
  var headers = ws.getRange(1, 1, 1, ws.getLastColumn()).getValues()[0];
  var idx = headers.findIndex(function(h) {
    return h && h.toString().toLowerCase().includes(label.toLowerCase());
  });
  if (idx >= 0) return idx;

  var nc = ws.getLastColumn();
  ws.getRange(1, nc + 1).setValue(label)
    .setBackground(bg).setFontColor('#FFFFFF').setFontWeight('bold');
  SpreadsheetApp.flush();
  return nc; // 0-indexed
}


// =======================================================================
// IA4 v2 — PROMPT DE AVALIACAO COM MODELO TEMATICO + PERFIL CIS COMPLETO
// =======================================================================

// ══════════════════════════════════════════════════════════════════════════════
// CALL 1 — AVALIAÇÃO: descritores + consolidação + feedback + pontos fortes/gaps
// ══════════════════════════════════════════════════════════════════════════════
function _buildIA4v2SystemPrompt_Avaliacao() {
  return [
    'Voce e o Motor de Avaliacao de Competencias da Vertho Mentor IA.',
    'Sua tarefa e avaliar as 4 respostas de um profissional a um cenario situacional,',
    'classificando-o nos 4 niveis de maturidade usando a regua fornecida,',
    'e gerar feedback personalizado.',
    '',
    '=== FILOSOFIA DA AVALIACAO ===',
    'Esta avaliacao usa o MODELO TEMATICO:',
    '- O profissional recebeu UM cenario padronizado e respondeu 4 perguntas tematicas',
    '- Cada pergunta cobre descritores especificos da competencia',
    '- Nivel 3 e o IDEAL (META). Qualquer nota abaixo de 3 e GAP',
    '- O perfil CIS NAO influencia a nota — influencia APENAS o feedback',
    '',
    '=== REGRAS DE AVALIACAO — INVIOAVEIS ===',
    '1. AVALIE SOMENTE COM BASE NA REGUA FORNECIDA. Nao invente criterios.',
    '2. EVIDENCIA OU NAO CONTA. Intencao nao e evidencia. "Eu faria..." generico nao e evidencia. Acao concreta descrita e evidencia.',
    '3. REGRA DE EVIDENCIA MINIMA: Resposta vaga, curta ou generica → maximo N1.',
    '4. NA DUVIDA ENTRE DOIS NIVEIS → ESCOLHER O INFERIOR. Sempre.',
    '5. RESPOSTA PERFEITA DEMAIS: Sem acoes concretas para o cenario → tende a N2-N3, nao N4.',
    '6. RESPOSTA QUE MISTURA NIVEIS: Priorizar o comportamento predominante. Limitacoes graves pesam mais.',
    '7. CONFIANCA: 0-100 por descritor. Abaixo de 70 = evidencia insuficiente.',
    '',
    '=== REGRA CRITICA — AUSENCIA DE MENCAO NAO E NIVEL 1 ===',
    'N1 significa postura EXCLUDENTE, PASSIVA ou que IGNORA a competencia — NAO significa "nao mencionou X".',
    'Se a resposta demonstra acoes concretas e intencionais em QUALQUER descritor, o nivel minimo dessa resposta e N2.',
    'NUNCA atribua N1 a quem demonstrou acao concreta, sistematica ou baseada em principios — mesmo que outros descritores nao tenham sido mencionados.',
    'Exemplo correto: resposta que aborda acolhimento de alunos haitianos + PDI de TEA = minimo N3 em Postura Inclusiva, mesmo sem mencionar familias.',
    'Exemplo errado: "Nao ha mencao a familias → N1". Ausencia de mencao a um topico nao cancela as evidencias existentes.',
    'TRAVA ANTI-REBAIXAMENTO: Se o profissional demonstrou acoes de N3 em qualquer resposta, o nivel geral MINIMO e N2, independente das travas normais.',
    '',
    '=== PROCESSO DE AVALIACAO — 2 ETAPAS ===',
    '',
    'ETAPA 1 — AVALIACAO POR DESCRITOR (para cada uma das 4 respostas):',
    'a) Identifique os descritores PRIMARIOS daquela pergunta (conforme mapeamento fornecido)',
    'b) Extraia evidencias textuais literais da resposta',
    'c) Compare com a regua de maturidade (N1, N2, N3, N4)',
    'd) Atribua uma NOTA DECIMAL com 2 casas (ex: 1.50, 2.33, 3.00) para cada descritor.',
    '   Use a regua: 1.00 = inicio do N1, 2.00 = inicio do N2, 3.00 = META, 4.00 = Referencia.',
    '   Valores intermediarios indicam transicao (ex: 1.67 = demonstra alguns comportamentos de N2 mas nao consistente).',
    'e) Atribua confianca (0-100)',
    'f) Se houver evidencias de descritores SECUNDARIOS, registre tambem',
    '',
    'ETAPA 2 — CONSOLIDACAO + FEEDBACK:',
    'a) Cada descritor tem UMA nota_decimal final = media das notas decimais quando aparece em multiplas respostas (2 casas, ex: 1.67, 2.33)',
    '   O campo "nivel" e o inteiro arredondado para BAIXO (ex: 1.67 → nivel 1, 2.33 → nivel 2)',
    'b) media_descritores = media aritmetica das 6 nota_decimal dos descritores',
    'c) Travas: (i) Descritor critico N1 → nivel geral maximo N2; (ii) Mais de 3 descritores N1 → nivel geral N1; (iii) Arredondar para baixo (2.6 = N2)',
    'd) Nivel geral: 1, 2, 3 ou 4',
    'e) GAP = 3 - nivel geral (se positivo)',
    'f) Feedback: positivo e construtivo, sem jargao ("nao dizer seu D e 72"), tom de mentor.',
    '   ABRIR com o que o profissional fez bem, CONECTAR gaps ao perfil DISC (tom natural).',
    '',
    '=== REGRA ANTI-ALUCINACAO (CRITICA) ===',
    'PROIBIDO inventar QUALQUER dado que nao esteja explicitamente nas respostas ou nos dados fornecidos:',
    '- NAO inventar nomes de pessoas, colegas ou personagens',
    '- NAO inventar dados da escola/empresa',
    '- NAO inventar situacoes que o profissional nao mencionou',
    '- Use APENAS: nome do profissional, cargo, competencia e trechos reais das respostas',
    '',
    'CAMPOS OBRIGATORIOS — o JSON e invalido se qualquer um estiver vazio:',
    '- feedback: NUNCA pode ser vazio ou generico.',
    '- descritores_destaque.pontos_fortes: pelo menos 1 item.',
    '- descritores_destaque.gaps_prioritarios: todos os descritores com nivel < 3.',
    '',
    'Retorne APENAS JSON valido, sem markdown, sem texto antes ou depois.',
    '',
    'Schema:',
    '{"profissional":"","cargo":"","competencia":{"codigo":"","nome":""},',
    '"avaliacao_por_resposta":{',
    '  "R1":{"descritores_avaliados":[{"numero":1,"nome":"","nivel":2.33,"confianca":85,"evidencia":"trecho literal"}]},',
    '  "R2":{"descritores_avaliados":[]},',
    '  "R3":{"descritores_avaliados":[]},',
    '  "R4":{"descritores_avaliados":[]}',
    '},',
    '"consolidacao":{',
    '  "notas_por_descritor":{"1":{"nome":"","nota_decimal":1.67,"nivel":2,"confianca":85}},',
    '  "media_descritores":2.25,"nivel_geral":2,"gap":1,"confianca_geral":77,',
    '  "travas_aplicadas":["Nenhuma trava aplicada"]',
    '},',
    '"descritores_destaque":{',
    '  "pontos_fortes":[{"descritor":"","nivel":3,"evidencia_resumida":""}],',
    '  "gaps_prioritarios":[{"descritor":"","nivel":1,"o_que_faltou":""}]',
    '},',
    '"feedback":""',
    '}'
  ].join('\n');
}

// ══════════════════════════════════════════════════════════════════════════════
// CALL 2 — PDI + VALORES: recomendações PDI (com CIS) + avaliação de valores
// ══════════════════════════════════════════════════════════════════════════════
function _buildIA4v2SystemPrompt_PDIValores() {
  return [
    'Voce e o Motor de PDI e Avaliacao de Valores da Vertho Mentor IA.',
    'Voce recebera o RESULTADO DA AVALIACAO (niveis por descritor, gaps, feedback) e deve gerar:',
    '1. Recomendacoes de PDI personalizadas pelo perfil CIS',
    '2. Avaliacao de alinhamento a valores organizacionais',
    '',
    '=== PERFIL CIS — 3 DIMENSOES ===',
    '',
    'DISC (COMO age):',
    'Alto D (>=60): diretivo, decide rapido, centraliza. Feedback: valorizar assertividade, mostrar que ouvir produz resultados mais duradouros.',
    'Baixo D (<=35): evita confronto. Feedback: mostrar que posicionar-se protege a equipe.',
    'Alto I (>=60): persuasivo, busca aprovacao. Feedback: mostrar que firmeza fortalece a confianca.',
    'Baixo I (<=35): reservado. Feedback: valorizar foco e consistencia.',
    'Alto S (>=60): evita conflito. Feedback: mostrar que posicionar-se protege quem precisa.',
    'Baixo S (<=35): impaciente. Feedback: mostrar que sustentar o processo e tao importante quanto iniciar.',
    'Alto C (>=60): criterioso. Feedback: mostrar que flexibilidade nao compromete qualidade.',
    'Baixo C (<=35): informal. Feedback: mostrar que estrutura minima potencializa a inovacao.',
    '',
    'VALORES MOTIVADORES (POR QUE age — guia "por_que_importa" do PDI):',
    'TEORICO: PDI com fundamentacao, estudos de caso, pesquisa.',
    'ECONOMICO: PDI com metas com indicadores claros, ganhos tangiveis.',
    'ESTETICO: PDI com acoes que melhorem ambiente e experiencia.',
    'SOCIAL: PDI com mentoria, acolhimento, desenvolvimento de pessoas.',
    'POLITICO: PDI com lideranca, projetos de visibilidade.',
    'RELIGIOSO: PDI conectando a proposito e missao transformadora.',
    '',
    'TIPOS PSICOLOGICOS (COMO aprende — guia "como_desenvolver" do PDI):',
    'SENSORIAL: acoes praticas com instrucoes claras, checklists, observacao.',
    'INTUITIVO: visao do todo, conexoes entre conceitos, liberdade de explorar.',
    'RACIONAL (T): dados e evidencias, frameworks, modelos logicos.',
    'EMOCIONAL (F): historias, relatos, impacto nas pessoas.',
    'INTROVERTIDO: acoes individuais ou pequenos grupos, reflexao.',
    'EXTROVERTIDO: acoes colaborativas, grupos de estudo, troca com pares.',
    '',
    '=== REGRAS DO PDI ===',
    '- 3 prioridades, focadas nos descritores GAP (nivel < 3)',
    '- Acoes concretas com prazo (30 dias)',
    '- NUNCA sugerir livros/podcasts/cursos externos',
    '- "por_que_importa": conectar ao valor motivador dominante',
    '- "como_desenvolver": formato do tipo psicologico dominante',
    '- "barreira_provavel": conectar ao padrao DISC',
    '- Se precisar exemplificar, use linguagem generica: "sua equipe", "os colegas", "a instituicao"',
    '',
    '=== AVALIACAO DE VALORES ORGANIZACIONAIS ===',
    '',
    'Para cada valor da escola, analise as 4 respostas e classifique:',
    '',
    'ALINHADO: A resposta e coerente com o valor, mesmo quando havia pressao ou incentivo para agir diferente.',
    'TENSAO: O profissional reconhece o valor mas cede parcialmente sob pressao.',
    '  Ha intencao sem consistencia. O perfil DISC pode explicar a origem da tensao — registre isso.',
    'VIOLACAO: A resposta contradiz diretamente o valor.',
    '  Exemplos: favorecimento explicito, omissao diante de discriminacao, manipulacao de informacoes.',
    'SEM_EVIDENCIA: O cenario e as respostas nao permitiram avaliar este valor.',
    '',
    'REGRAS DE VALORES:',
    '- Avalie com generosidade no beneficio da duvida. TENSAO ≠ VIOLACAO.',
    '- Tensao e humana e esperada — e onde o desenvolvimento acontece.',
    '- Violacao e excepcional e deve ser registrada com evidencia inequivoca.',
    '- Nao avalie valores que o cenario nao provocou (use SEM_EVIDENCIA).',
    '- A avaliacao de valor NAO altera o nivel da competencia — sao dimensoes independentes.',
    '- Se houver TENSAO, conecte ao perfil DISC (ex: "Alto S tende a ceder para preservar harmonia").',
    '',
    '=== REGRA ANTI-ALUCINACAO (CRITICA) ===',
    'PROIBIDO inventar QUALQUER dado que nao esteja explicitamente nas respostas ou nos dados fornecidos.',
    'Use APENAS: nome do profissional, cargo, competencia e trechos reais das respostas.',
    '',
    'CAMPOS OBRIGATORIOS:',
    '- recomendacoes_pdi: SEMPRE 3 itens com todos os campos preenchidos.',
    '- avaliacao_valores: SEMPRE 1 item por valor da escola.',
    '',
    'Retorne APENAS JSON valido, sem markdown, sem texto antes ou depois.',
    '',
    'Schema:',
    '{"recomendacoes_pdi":[',
    '  {"prioridade":1,"descritor_foco":"","nivel_atual":2,"nivel_meta":3,',
    '   "acao":"","por_que_importa":"","como_desenvolver":"","barreira_provavel":""}',
    '],',
    '"avaliacao_valores":[',
    '  {"valor":"","status":"alinhado|tensao|violacao|sem_evidencia",',
    '   "evidencia":"o que observei na resposta",',
    '   "trecho_resposta":"citacao direta",',
    '   "conexao_perfil":"como o DISC explica se tensao"}',
    ']}'
  ].join('\n');
}

// Alias legado para compatibilidade — retorna prompt da Call 1
function _buildIA4v2SystemPrompt() {
  return _buildIA4v2SystemPrompt_Avaliacao();
}

function _buildIA4v2UserPrompt(inp) {
  var cis = inp.cis || {};
  var parts = [
    'Avalie as respostas abaixo.',
    '',
    '=== DADOS DO PROFISSIONAL ===',
    'NOME: ' + inp.nome,
    'CARGO: ' + inp.cargo,
    'ESCOLA/EMPRESA: ' + inp.escola,
    '',
    'PERFIL CIS — SCORES BRUTOS:',
    'DISC: D = ' + (cis.d || 0) + ' | I = ' + (cis.i || 0) + ' | S = ' + (cis.s || 0) + ' | C = ' + (cis.c || 0),
    'VALORES MOTIVADORES: Teorico = ' + (cis.val_teorico || 0) + ' | Economico = ' + (cis.val_economico || 0) + ' | Estetico = ' + (cis.val_estetico || 0),
    '   Social = ' + (cis.val_social || 0) + ' | Politico = ' + (cis.val_politico || 0) + ' | Religioso = ' + (cis.val_religioso || 0),
    'TIPOS PSICOLOGICOS: Sensorial = ' + (cis.tp_sensorial || 0) + ' | Intuitivo = ' + (cis.tp_intuitivo || 0),
    '   Racional = ' + (cis.tp_racional || 0) + ' | Emocional = ' + (cis.tp_emocional || 0) + ' | Introvertido = ' + (cis.tp_introvertido || 0) + ' | Extrovertido = ' + (cis.tp_extrovertido || 0),
    ''
  ];

  // CIS filtrado: interpretações dos traços dominantes para avaliação/PDI
  if (inp.cisFiltrado) {
    parts.push('PERFIL CIS — INTERPRETACAO (tracos dominantes):');
    parts.push(inp.cisFiltrado);
    parts.push('');
  }

  // Alertas CIS (scores extremos)
  if (inp.cisRiscos) {
    parts.push('ALERTAS CIS (scores extremos):');
    parts.push(inp.cisRiscos);
    parts.push('');
  }

  // Contexto PPP da escola
  if (inp.contextoPPP) {
    parts.push('=== CONTEXTO DA ESCOLA (PPP) ===');
    parts.push(inp.contextoPPP);
    parts.push('');
  }

  parts.push('=== COMPETENCIA AVALIADA ===');
  parts.push('CODIGO: ' + inp.compId);
  parts.push('NOME: ' + inp.compNome);
  parts.push('DESCRICAO: ' + inp.compDescricao);
  parts.push('');

  // V2: Injetar descritores com N1-N4 individuais + evidências
  if (inp.descritoresV2 && inp.descritoresV2.length > 0) {
    parts.push('=== DESCRITORES (avalie CADA UM separadamente) ===');
    parts.push('');
    inp.descritoresV2.forEach(function(d, i) {
      parts.push('DESCRITOR ' + (i + 1) + ': ' + d.cod + ' — ' + d.nome_curto);
      parts.push('Descricao: ' + d.completo);
      parts.push('N1 (Emergente): ' + d.n1);
      parts.push('N2 (Em desenvolvimento): ' + d.n2);
      parts.push('N3 (Proficiente): ' + d.n3);
      parts.push('N4 (Referencia): ' + d.n4);
      if (d.evidencia) parts.push('Evidencia esperada: ' + d.evidencia);
      parts.push('');
    });
    parts.push('REGRAS DE CONSOLIDACAO:');
    parts.push('- Avalie CADA descritor (N1 a N4) usando os niveis acima');
    parts.push('- nivel_geral = media dos 6 descritores, arredondada para BAIXO');
    parts.push('- REGRA DO PISO: qualquer descritor N1 → nivel geral MAXIMO N2');
    parts.push('- REGRA DO N4: precisa 5/6 descritores em N4 e nenhum abaixo de N3');
    parts.push('- nota_decimal = media aritmetica exata (ex: 2.17)');
  } else {
    parts.push('DESCRITORES:');
    parts.push(inp.descritores || '');
    parts.push('');
    parts.push('=== REGUA DE MATURIDADE COMPLETA ===');
    parts.push(inp.regua || '');
  }

  parts.push('');
  parts.push('=== CENARIO APRESENTADO ===');
  parts.push(inp.cenario || '');
  parts.push('');
  parts.push('=== MAPEAMENTO DESCRITORES x PERGUNTAS ===');
  parts.push(inp.cobertura || '');
  parts.push('');
  parts.push('=== RESPOSTAS DO PROFISSIONAL ===');
  parts.push('PERGUNTA 1: ' + inp.p1);
  parts.push('RESPOSTA 1: ' + inp.r1);
  parts.push('');
  parts.push('PERGUNTA 2: ' + inp.p2);
  parts.push('RESPOSTA 2: ' + inp.r2);
  parts.push('');
  parts.push('PERGUNTA 3: ' + inp.p3);
  parts.push('RESPOSTA 3: ' + inp.r3);
  parts.push('');
  parts.push('PERGUNTA 4: ' + inp.p4);
  parts.push('RESPOSTA 4: ' + inp.r4);
  parts.push('');
  parts.push('=== VALORES ORGANIZACIONAIS DA ESCOLA ===');
  var valsList = (inp.valores && inp.valores.length > 0) ? inp.valores : VALORES_BASE;
  parts.push(valsList.map(function(v, i) { return (i + 1) + '. ' + v; }).join('\n'));
  parts.push('');
  parts.push('Avalie o alinhamento do profissional a CADA valor acima, usando as classificacoes:');
  parts.push('ALINHADO | TENSAO | VIOLACAO | SEM_EVIDENCIA');

  return parts.join('\n');
}

// ══════════════════════════════════════════════════════════════════════════════
// User prompt da Call 2 — PDI + Valores (recebe resultado da Call 1)
// ══════════════════════════════════════════════════════════════════════════════
function _buildIA4v2UserPrompt_PDIValores(inp, avaliacaoResult) {
  var cis = inp.cis || {};
  var parts = [
    'Gere recomendacoes de PDI e avalie o alinhamento a valores organizacionais.',
    '',
    '=== DADOS DO PROFISSIONAL ===',
    'NOME: ' + inp.nome,
    'CARGO: ' + inp.cargo,
    'ESCOLA/EMPRESA: ' + inp.escola,
    '',
    'PERFIL CIS — SCORES BRUTOS:',
    'DISC: D = ' + (cis.d || 0) + ' | I = ' + (cis.i || 0) + ' | S = ' + (cis.s || 0) + ' | C = ' + (cis.c || 0),
    'VALORES MOTIVADORES: Teorico = ' + (cis.val_teorico || 0) + ' | Economico = ' + (cis.val_economico || 0) + ' | Estetico = ' + (cis.val_estetico || 0),
    '   Social = ' + (cis.val_social || 0) + ' | Politico = ' + (cis.val_politico || 0) + ' | Religioso = ' + (cis.val_religioso || 0),
    'TIPOS PSICOLOGICOS: Sensorial = ' + (cis.tp_sensorial || 0) + ' | Intuitivo = ' + (cis.tp_intuitivo || 0),
    '   Racional = ' + (cis.tp_racional || 0) + ' | Emocional = ' + (cis.tp_emocional || 0) + ' | Introvertido = ' + (cis.tp_introvertido || 0) + ' | Extrovertido = ' + (cis.tp_extrovertido || 0),
    ''
  ];

  // CIS filtrado
  if (inp.cisFiltrado) {
    parts.push('PERFIL CIS — INTERPRETACAO (tracos dominantes):');
    parts.push(inp.cisFiltrado);
    parts.push('');
  }
  if (inp.cisRiscos) {
    parts.push('ALERTAS CIS (scores extremos):');
    parts.push(inp.cisRiscos);
    parts.push('');
  }

  // Contexto PPP da escola
  if (inp.contextoPPP) {
    parts.push('=== CONTEXTO DA ESCOLA (PPP) ===');
    parts.push(inp.contextoPPP);
    parts.push('');
  }

  // Resultado da avaliação (Call 1)
  parts.push('=== RESULTADO DA AVALIACAO (gerado pela Call 1) ===');
  parts.push('COMPETENCIA: ' + inp.compNome + ' (' + inp.compId + ')');
  parts.push('NIVEL GERAL: N' + (avaliacaoResult.consolidacao ? avaliacaoResult.consolidacao.nivel_geral : '?'));
  parts.push('MEDIA DESCRITORES: ' + (avaliacaoResult.consolidacao ? avaliacaoResult.consolidacao.media_descritores : '?'));
  parts.push('');

  // Notas por descritor
  if (avaliacaoResult.consolidacao && avaliacaoResult.consolidacao.notas_por_descritor) {
    parts.push('NOTAS POR DESCRITOR:');
    var notas = avaliacaoResult.consolidacao.notas_por_descritor;
    Object.keys(notas).forEach(function(k) {
      var n = notas[k];
      parts.push('  ' + (n.nome || k) + ': N' + (n.nivel || '?') + ' (confianca: ' + (n.confianca || '?') + ')');
    });
    parts.push('');
  }

  // Gaps e fortes
  var dest = avaliacaoResult.descritores_destaque || {};
  if (dest.gaps_prioritarios && dest.gaps_prioritarios.length > 0) {
    parts.push('GAPS PRIORITARIOS:');
    dest.gaps_prioritarios.forEach(function(g) {
      parts.push('  - ' + g.descritor + ' (N' + g.nivel + '): ' + (g.o_que_faltou || ''));
    });
    parts.push('');
  }
  if (dest.pontos_fortes && dest.pontos_fortes.length > 0) {
    parts.push('PONTOS FORTES:');
    dest.pontos_fortes.forEach(function(p) {
      parts.push('  - ' + p.descritor + ' (N' + p.nivel + '): ' + (p.evidencia_resumida || ''));
    });
    parts.push('');
  }

  parts.push('FEEDBACK GERADO: ' + (avaliacaoResult.feedback || ''));
  parts.push('');

  // Respostas (para avaliação de valores)
  parts.push('=== RESPOSTAS DO PROFISSIONAL (para avaliacao de valores) ===');
  parts.push('PERGUNTA 1: ' + inp.p1);
  parts.push('RESPOSTA 1: ' + inp.r1);
  parts.push('');
  parts.push('PERGUNTA 2: ' + inp.p2);
  parts.push('RESPOSTA 2: ' + inp.r2);
  parts.push('');
  parts.push('PERGUNTA 3: ' + inp.p3);
  parts.push('RESPOSTA 3: ' + inp.r3);
  parts.push('');
  parts.push('PERGUNTA 4: ' + inp.p4);
  parts.push('RESPOSTA 4: ' + inp.r4);
  parts.push('');

  // Valores
  parts.push('=== VALORES ORGANIZACIONAIS DA ESCOLA ===');
  var valsList = (inp.valores && inp.valores.length > 0) ? inp.valores : VALORES_BASE;
  parts.push(valsList.map(function(v, i) { return (i + 1) + '. ' + v; }).join('\n'));
  parts.push('');
  parts.push('Avalie o alinhamento do profissional a CADA valor acima, usando as classificacoes:');
  parts.push('ALINHADO | TENSAO | VIOLACAO | SEM_EVIDENCIA');
  parts.push('');
  parts.push('Gere 3 recomendacoes de PDI focadas nos descritores GAP listados acima,');
  parts.push('personalizadas pelo perfil CIS do profissional.');

  return parts.join('\n');
}

function _bancoBuscarCobertura(ss, cargo, compId, escola) {
  var ws = ss.getSheetByName('Banco_Cenarios');
  if (!ws || ws.getLastRow() < 2) return null;
  var headers = ws.getRange(1, 1, 1, ws.getLastColumn()).getValues()[0];
  var _h = function(l) {
    return headers.findIndex(function(h) {
      return _norm(String(h || '')).toLowerCase().includes(l.toLowerCase());
    });
  };
  var iCargo  = _h('cargo');
  var iComp   = _h('comp. id');
  var iEscola = _h('escola');
  var iStatus = _h('status');
  var iCtx    = _h('contexto');
  var iCob    = _h('cobertura');
  var iP1 = _h('p1'); var iP2 = _h('p2'); var iP3 = _h('p3'); var iP4 = _h('p4');
  if (iCargo < 0 || iComp < 0) return null;
  var data = ws.getRange(2, 1, ws.getLastRow() - 1, ws.getLastColumn()).getValues();
  var cargoNorm  = _norm(cargo).toLowerCase().trim();
  var compIdNorm = compId.toLowerCase().trim();
  var escolaNorm = escola ? _norm(escola).toLowerCase().trim() : '';

  // Primeiro: match exato cargo + compId + escola
  if (escolaNorm && iEscola >= 0) {
    for (var i = 0; i < data.length; i++) {
      var rCargo  = _norm(String(data[i][iCargo]  || '')).toLowerCase().trim();
      var rComp   = String(data[i][iComp]          || '').toLowerCase().trim();
      var rEscola = _norm(String(data[i][iEscola]  || '')).toLowerCase().trim();
      var rStatus = String(data[i][iStatus]        || '').toLowerCase().trim();
      if (rCargo !== cargoNorm || rComp !== compIdNorm) continue;
      if (rEscola !== escolaNorm) continue;
      if (rStatus !== 'gerado' && rStatus !== 'aprovado') continue;
      return {
        contexto:  String(data[i][iCtx] || ''),
        cobertura: String(data[i][iCob] || ''),
        p1: iP1 >= 0 ? String(data[i][iP1] || '') : '',
        p2: iP2 >= 0 ? String(data[i][iP2] || '') : '',
        p3: iP3 >= 0 ? String(data[i][iP3] || '') : '',
        p4: iP4 >= 0 ? String(data[i][iP4] || '') : ''
      };
    }
  }

  // Fallback: match sem escola (compatibilidade)
  for (var i = 0; i < data.length; i++) {
    var rCargo  = _norm(String(data[i][iCargo]  || '')).toLowerCase().trim();
    var rComp   = String(data[i][iComp]          || '').toLowerCase().trim();
    var rStatus = String(data[i][iStatus]        || '').toLowerCase().trim();
    if (rCargo !== cargoNorm || rComp !== compIdNorm) continue;
    if (rStatus !== 'gerado' && rStatus !== 'aprovado') continue;
    return {
      contexto:  String(data[i][iCtx] || ''),
      cobertura: String(data[i][iCob] || ''),
      p1: iP1 >= 0 ? String(data[i][iP1] || '') : '',
      p2: iP2 >= 0 ? String(data[i][iP2] || '') : '',
      p3: iP3 >= 0 ? String(data[i][iP3] || '') : '',
      p4: iP4 >= 0 ? String(data[i][iP4] || '') : ''
    };
  }
  return null;
}

function _formatarCoberturaIA4(coberturaJson) {
  try {
    var cob = JSON.parse(coberturaJson || '[]');
    if (!Array.isArray(cob) || cob.length === 0) return '(mapeamento nao disponivel)';
    return cob.map(function(q) {
      var qNum = String(q.questao || '').replace('p', '');
      return 'Q' + qNum +
        ' — Primarios: '   + (q.descritores_primarios   || []).join(', ') +
        ' | Secundarios: ' + (q.descritores_secundarios || []).join(', ');
    }).join('\n');
  } catch(e) { return '(mapeamento nao disponivel)'; }
}

function _ia4ClaudeRawV2(model, systemPrompt, userPrompt, usarThinking) {
  // Roteamento GPT: detectar modelos OpenAI e desviar
  if (model && model.toLowerCase().indexOf('gpt') >= 0) {
    return _ia4OpenAIRawV2(model, systemPrompt, userPrompt, usarThinking);
  }

  var maxTok  = 64000;
  var payload = {
    model:      model,
    max_tokens: maxTok,
    system:     systemPrompt,
    messages:   [{ role: 'user', content: userPrompt }],
    temperature: 0.2
  };
  if (usarThinking) {
    payload.thinking  = { type: 'enabled', budget_tokens: Math.floor(maxTok * 0.5) };
    delete payload.temperature;
  }
  var hdrs = {
    'x-api-key':         _getApiKey('CLAUDE'),
    'anthropic-version': '2023-06-01',
    'content-type':      'application/json'
  };
  if (usarThinking) hdrs['anthropic-beta'] = 'interleaved-thinking-2025-05-14';
  var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', headers: hdrs,
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200)
    throw new Error('Claude ' + resp.getResponseCode() + ': ' + resp.getContentText());
  var body = JSON.parse(resp.getContentText());
  if (body.stop_reason === 'max_tokens') Logger.log('⚠️ Claude IA4: resposta TRUNCADA (max_tokens atingido)');
  var blocos = body.content.filter(function(b) { return b.type === 'text'; });
  return blocos[blocos.length - 1].text;
}

function _ia4OpenAIRawV2(model, systemPrompt, userPrompt, usarThinking) {
  var maxTok = 64000;
  var payload = {
    model: model,
    max_completion_tokens: maxTok,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.2
  };
  if (usarThinking) {
    payload.reasoning_effort = 'high';
    delete payload.temperature;
  }
  var hdrs = {
    'Authorization': 'Bearer ' + _getApiKey('OPENAI'),
    'Content-Type':  'application/json'
  };
  var resp = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
    method: 'post', headers: hdrs,
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200)
    throw new Error('OpenAI ' + resp.getResponseCode() + ': ' + resp.getContentText());
  var data = JSON.parse(resp.getContentText());
  if (data.choices[0].finish_reason === 'length') Logger.log('⚠️ OpenAI IA4: resposta TRUNCADA (max_completion_tokens atingido)');
  return data.choices[0].message.content;
}

function _ia4GeminiRawV2(model, systemPrompt, userPrompt) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model +
    ':generateContent?key=' + _getApiKey('GEMINI');
  var payload = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: { temperature: Config.geminiTemp(model, 'validacao'), responseMimeType: 'application/json', maxOutputTokens: 65536 }
  };
  var resp = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200)
    throw new Error('Gemini ' + resp.getResponseCode() + ': ' + resp.getContentText());
  return JSON.parse(resp.getContentText()).candidates[0].content.parts[0].text;
}


// Busca URL do Moodle para a competencia avaliada
// Prioridade: MOODLE_CURSOS (ScriptProperties) → Moodle_Catalogo → Trilhas
function _ia4v2BuscarMoodle(ss, compNome, compId, nivelAtual) {
  try {
    var compNorm = _norm(compNome).toLowerCase().trim();
    var compIdN  = (compId || '').toLowerCase().trim();
    var links    = [];
    var seen     = {};
    function addLink(u) {
      u = (u || '').trim();
      if (u && !seen[u]) { seen[u] = true; links.push(u); }
    }

    // 1. MOODLE_CURSOS — courseId direto (todas as competencias que batem)
    var cursosJson = PropertiesService.getScriptProperties().getProperty('MOODLE_CURSOS');
    if (cursosJson) {
      var cursos = JSON.parse(cursosJson);
      var keys   = Object.keys(cursos);
      for (var k = 0; k < keys.length && links.length < 3; k++) {
        var kNorm = _norm(keys[k]).toLowerCase().trim();
        if (kNorm.includes(compNorm) || compNorm.includes(kNorm)) {
          addLink('https://academia.vertho.ai/course/view.php?id=' + cursos[keys[k]]);
        }
      }
    }

    // 2. Moodle_Catalogo (novo formato: 1 linha por curso) — Competência | Curso | URL Curso
    if (links.length < 3) {
      var wsCat = ss.getSheetByName('Moodle_Catalogo');
      if (wsCat && wsCat.getLastRow() > 1) {
        var catHdr = wsCat.getRange(1, 1, 1, wsCat.getLastColumn()).getValues()[0];
        var _hCat = function(l) { return catHdr.findIndex(function(h) { return _norm(String(h||'')).toLowerCase().includes(l); }); };
        var iCatComp = _hCat('compet');
        var iCatUrl  = _hCat('url');
        if (iCatComp >= 0 && iCatUrl >= 0) {
          var catData = wsCat.getRange(2, 1, wsCat.getLastRow() - 1, wsCat.getLastColumn()).getValues();
          for (var c = 0; c < catData.length && links.length < 3; c++) {
            var rowComp = _norm(String(catData[c][iCatComp] || '')).toLowerCase().trim();
            var rowUrl  = String(catData[c][iCatUrl] || '').trim();
            if (!rowUrl) continue;
            if (rowComp.includes(compNorm) || compNorm.includes(rowComp) || rowComp.includes(compIdN)) {
              addLink(rowUrl);
            }
          }
        }
      }
    }

    // 3. Trilhas — coleta todos os matches, ordena por proximidade do nivel 3 (meta)
    if (links.length < 3) {
      var wsTri = ss.getSheetByName('Trilhas');
      if (wsTri && wsTri.getLastRow() > 1) {
        var triData = wsTri.getDataRange().getValues();
        var hdr     = triData[0];
        var _h      = function(l) { return hdr.findIndex(function(h) { return _norm(String(h||'')).toLowerCase().includes(l); }); };
        var iC = _h('competenc'), iN = _h('nivel'), iU = _h('url');
        if (iC >= 0 && iU >= 0) {
          var cands = [];
          for (var t = 1; t < triData.length; t++) {
            var rc = _norm(String(triData[t][iC]||'')).toLowerCase().trim();
            var rn = iN >= 0 ? (Number(triData[t][iN]) || 0) : 0;
            var ru = String(triData[t][iU]||'').trim();
            if (!ru) continue;
            if (rc.includes(compNorm) || compNorm.includes(rc)) {
              cands.push({ nivel: rn, url: ru });
            }
          }
          // Prioridade: N3 (meta) primeiro, depois por proximidade
          cands.sort(function(a, b) { return Math.abs(a.nivel - 3) - Math.abs(b.nivel - 3); });
          for (var ci = 0; ci < cands.length && links.length < 3; ci++) {
            addLink(cands[ci].url);
          }
        }
      }
    }

    return links.slice(0, 3).join('\n');
  } catch(e) {
    Logger.log('_ia4v2BuscarMoodle erro: ' + e.message);
  }
  return '';
}


// Extrai o primeiro JSON object completo de uma string (brace-counting)
// Mais robusto que lastIndexOf('}') quando a IA retorna texto após o JSON
function _ia4ExtrairJSON(texto) {
  var s = (texto || '').replace(/```json/g, '').replace(/```/g, '').trim();
  var start = s.indexOf('{');
  if (start < 0) return s;
  var depth = 0, inStr = false, esc = false, fim = -1;
  for (var i = start; i < s.length; i++) {
    var c = s[i];
    if (esc)           { esc = false; continue; }
    if (c === '\\' && inStr) { esc = true;  continue; }
    if (c === '"')     { inStr = !inStr; continue; }
    if (!inStr) {
      if      (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { fim = i; break; } }
    }
  }
  var jsonStr = fim >= 0 ? s.slice(start, fim + 1) : s.slice(start);

  // Reparo de JSON truncado: fechar chaves/colchetes pendentes
  if (fim < 0) {
    Logger.log('⚠️ _ia4ExtrairJSON: JSON truncado detectado — tentando reparar');
    // Remover valor incompleto no final (string não fechada, etc.)
    jsonStr = jsonStr.replace(/,\s*"[^"]*"?\s*:\s*"?[^"]*$/, '');
    jsonStr = jsonStr.replace(/,\s*$/, '');
    // Contar chaves/colchetes abertos e fechar
    var openBraces = 0, openBrackets = 0, inS = false, esc3 = false;
    for (var r = 0; r < jsonStr.length; r++) {
      var cr = jsonStr[r];
      if (esc3) { esc3 = false; continue; }
      if (cr === '\\' && inS) { esc3 = true; continue; }
      if (cr === '"') { inS = !inS; continue; }
      if (!inS) {
        if (cr === '{') openBraces++;
        else if (cr === '}') openBraces--;
        else if (cr === '[') openBrackets++;
        else if (cr === ']') openBrackets--;
      }
    }
    for (var b = 0; b < openBrackets; b++) jsonStr += ']';
    for (var b = 0; b < openBraces; b++) jsonStr += '}';
  }

  // Sanitizar: newlines dentro de strings JSON (inválido) e trailing commas
  // Estratégia: percorrer char a char, escapar \n \r \t APENAS dentro de strings
  var result = [], inStr2 = false, esc2 = false;
  for (var j = 0; j < jsonStr.length; j++) {
    var ch = jsonStr[j];
    if (esc2) { result.push(ch); esc2 = false; continue; }
    if (ch === '\\' && inStr2) { result.push(ch); esc2 = true; continue; }
    if (ch === '"') { inStr2 = !inStr2; result.push(ch); continue; }
    if (inStr2) {
      // Dentro de string: escapar control chars
      if (ch === '\n') { result.push('\\n'); continue; }
      if (ch === '\r') { result.push('\\r'); continue; }
      if (ch === '\t') { result.push('\\t'); continue; }
      var code = ch.charCodeAt(0);
      if (code < 0x20 || (code >= 0x7F && code <= 0x9F)) { result.push(' '); continue; }
    }
    result.push(ch);
  }
  jsonStr = result.join('')
    .replace(/,\s*}/g, '}')
    .replace(/,\s*]/g, ']');

  return jsonStr;
}
// v2d
