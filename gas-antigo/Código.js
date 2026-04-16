// ═══════════════════════════════════════════════════════════════════════════════
// VERTHO — codigo.gs  v7
//
// NOVIDADES v7 em relação ao v6:
//
//   1. API KEYS → ScriptProperties (com fallback hardcoded)
//      - Constantes _FALLBACK_KEY_CLAUDE / _FALLBACK_KEY_GEMINI ficam aqui.
//      - _getApiKey('CLAUDE') / _getApiKey('GEMINI') lê ScriptProperties primeiro.
//      - O Painel (Config) pode sobrescrever as chaves sem editar código.
//
//   2. PRÉ-FLIGHT SILENCIOSO antes de rodarIA1
//      - _verificarTriggers() roda automaticamente no início de rodarIA1().
//      - Auto-configura: masterSpreadsheetId, aba Respostas, colunas de envio.
//      - Avisa (sem bloquear) sobre triggers não instalados.
//      - Sem UI.alert — apenas log e retorno de array para o Painel.
//
//   3. E-MAIL COMO ID DO COLABORADOR
//      - A coluna "E-mail Corporativo" da aba Colaboradores é o identificador único.
//      - popularCenarios() grava o e-mail na col 1 de Cenarios.
//      - dispararEmailsDoDia() e rodarIA4() agrupam por e-mail.
//      - Toda busca de perfil/gestor usa o e-mail como chave.
//      - Nenhuma coluna de ID separada é necessária.
//
//   4. INTERFACE SEPARADA (Interface.gs + Interface.html)
//      - Este arquivo NÃO contém: mostrarInterface, getStatusDashboard,
//        getConfiguracoes, salvarConfiguracoes, testarConexaoAPIs, getLog,
//        limparLog, _addLog, painelXxx().
//      - _addLog() vive em Interface.gs (escopo global compartilhado).
// ═══════════════════════════════════════════════════════════════════════════════


// ───────────────────────────────────────────────────────────────────────────────
// CONFIGURAÇÃO
// ───────────────────────────────────────────────────────────────────────────────

// Fallbacks hardcoded — usados quando ScriptProperties não tem a chave configurada.
// Para alterar via Painel: aba Config → salvar → ScriptProperties terá prioridade.
// ⚠️ Chaves REMOVIDAS do código — configure via ScriptProperties:
//    cfg_key_claude  →  sua chave Anthropic
//    cfg_key_gemini  →  sua chave Google AI Studio
const _FALLBACK_KEY_CLAUDE = '';
const _FALLBACK_KEY_GEMINI = '';

const MODEL_HAIKU  = 'claude-haiku-4-5-20251001';
const MODEL_GEMINI_PRO = 'gemini-3.1-flash-lite-preview'; // Gemini 2.0 Flash — Check IA (rápido)
const MODEL_SONNET = 'claude-sonnet-4-6';
const MODEL_OPUS   = 'claude-opus-4-6';
const MAX_TOK      = 64000;
// Tokens de saída por modelo
// Opus = 128k | Sonnet/Haiku/Gemini = 64k (independente de thinking)
// Gemini usa MAX_TOK (controlado na chamada)
function _maxTokens(model) {
  if (!model) return MAX_TOK;
  if (model.includes('opus'))   return 128000;
  if (model.includes('claude')) return 64000;
  return MAX_TOK;
}

// ── Controle de parada ────────────────────────────────────────────────────────
function pararScript() {
  PropertiesService.getScriptProperties().setProperty('PARAR_SCRIPT', 'true');
  SpreadsheetApp.getActive().toast('🛑 Sinal de parada enviado — o script para após o item atual.', 'Parar', 5);
}

/**
 * Para TUDO: sinaliza parada + limpa triggers de continuação + limpa propriedades de lote.
 * Chamado pelo botão PARAR no header do painel.
 */
function pararTudoGlobal() {
  var props = PropertiesService.getScriptProperties();

  // 1. Sinalizar parada para scripts em execução
  props.setProperty('PARAR_SCRIPT', 'true');

  // 2. Limpar propriedades de continuação automática
  var propsContinuacao = ['_banco_continuar', '_banco_gerados', '_banco_erros', '_sim_continuar'];
  propsContinuacao.forEach(function(p) { props.deleteProperty(p); });

  // 3. Remover triggers de continuação automática
  var triggersRemovidos = 0;
  var triggersAlvo = ['_continuarGeracaoBanco', '_continuarSimulacao'];
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var handler = triggers[i].getHandlerFunction();
    if (triggersAlvo.indexOf(handler) >= 0) {
      ScriptApp.deleteTrigger(triggers[i]);
      triggersRemovidos++;
    }
  }

  var msg = 'Parada enviada.';
  if (triggersRemovidos > 0) msg += ' ' + triggersRemovidos + ' trigger(s) de continuação cancelado(s).';
  SpreadsheetApp.getActive().toast('🛑 ' + msg, 'PARAR TUDO', 5);
  return msg;
}
function _limparParada() {
  PropertiesService.getScriptProperties().deleteProperty('PARAR_SCRIPT');
}
function _deveParar() {
  return PropertiesService.getScriptProperties().getProperty('PARAR_SCRIPT') === 'true';
}

var _CFG = { provedor: 'CLAUDE', modelo: MODEL_SONNET, thinking: false, thinkingMode: 'disabled' };

/**
 * Carrega o provedor e modelo das ScriptProperties para _CFG.
 * Deve ser chamado no início de toda função que usa a API de IA.
 * Garante que a configuração salva na interface seja respeitada
 * mesmo em novas instâncias de execução (menu, trigger, etc).
 */
function _carregarCFG() {
  const p = PropertiesService.getScriptProperties();
  const provedor = p.getProperty('cfg_provedor');
  const modelo   = p.getProperty('cfg_modelo');
  const thinking = p.getProperty('cfg_thinking'); // 'disabled'|'adaptive'|'max_effort'
  if (provedor) _CFG.provedor = provedor;
  if (modelo)   _CFG.modelo   = modelo;
  if (thinking) {
    _CFG.thinkingMode = thinking;
    _CFG.thinking     = thinking !== 'disabled';
  }
}

// E-mail remetente — deve ser alias verificado na conta Google do script
const EMAIL_REMETENTE = 'diagnostico@vertho.ai';
const NOME_REMETENTE  = 'Vertho';

// Cadência
const INTERVALO_FORMS = 1;  // 1 form por dia por colaborador
const DIAS_REENVIO    = 5;  // reenviar após 5 dias sem resposta
const ABA_RESPOSTAS   = 'Respostas';

// IDs do template de PDI e pasta do Drive
const IA4_ID_TEMPLATE         = '17BMU-vH3-APNghr_DbzP4oCP_AbAA6vZ5rcAoBlRAaY';
const IA4_ID_PASTA            = '19RO21ZeHu3cOvZM7FecHtxkKsVy-QtZH';
const DOSSIE_ID_TEMPLATE      = '16Ec-Mf3JgFj-DDlBdbacTroJF_WSRNCrOxGFzryq8Bw';
// v7.1: Pasta dedicada para Relatório do Gestor e Relatório RH
var PASTA_RELATORIOS = '107Sq2qVxlrmQGkKvTKT3JQ6XUQQ1r5HX';

// Template do Google Form (tem o header/banner configurado manualmente)
// makeCopy() preserva a imagem de header automaticamente
const FORM_TEMPLATE_ID = '1bCZf4VVDRvCAfwoaGnfjSQQVqy4nO-AqmoRD7RKKKJo';
const ID_PASTA_FORMS   = '1PbKT_y4FkfX6W83fKEPI1OhQBXtQVIU_';

function _getMasterId() {
  return PropertiesService.getScriptProperties().getProperty('masterSpreadsheetId')
    || SpreadsheetApp.getActiveSpreadsheet().getId();
}

/**
 * Retorna a API key do provedor solicitado.
 * Prioridade: ScriptProperties → fallback hardcoded.
 * @param {'CLAUDE'|'GEMINI'|'OPENAI'} nome
 */
function _getApiKey(nome) {
  const p = PropertiesService.getScriptProperties();
  if (nome === 'CLAUDE') return p.getProperty('ANTHROPIC_API_KEY') || p.getProperty('cfg_key_claude') || _FALLBACK_KEY_CLAUDE;
  if (nome === 'GEMINI') return p.getProperty('GEMINI_API_KEY') || p.getProperty('cfg_key_gemini') || _FALLBACK_KEY_GEMINI;
  if (nome === 'OPENAI') return p.getProperty('OPENAI_API_KEY') || '';
  return '';
}

/**
 * Diagnóstico rápido das chaves API — rode direto no editor GAS (▶ Run).
 * Testa Claude e Gemini e exibe o resultado num alert.
 */
function diagnosticarChavesAPI() {
  const keyClaude = _getApiKey('CLAUDE');
  const keyGemini = _getApiKey('GEMINI');
  let msg = '🔑 DIAGNÓSTICO DE CHAVES API\n\n';

  // ── Claude ────────────────────────────────────────────────────────────────
  if (!keyClaude) {
    msg += '❌ CLAUDE: chave não encontrada.\n';
    msg += '   → Adicione "cfg_key_claude" em:\n';
    msg += '      GAS Editor → Engrenagem (⚙) → Propriedades do script\n\n';
  } else {
    msg += '✅ CLAUDE: chave encontrada (' + keyClaude.slice(0,15) + '...)\n';
    try {
      const resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
        method: 'post',
        headers: {
          'x-api-key': keyClaude,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          model: MODEL_HAIKU,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'ping' }],
        }),
        muteHttpExceptions: true,
      });
      const code = resp.getResponseCode();
      if (code === 200) {
        msg += '   🟢 Conexão OK\n\n';
      } else {
        const body = JSON.parse(resp.getContentText());
        msg += '   🔴 HTTP ' + code + ': ' + (body.error && body.error.message ? body.error.message : resp.getContentText().slice(0,100)) + '\n\n';
      }
    } catch(e) {
      msg += '   🔴 Erro: ' + e.message + '\n\n';
    }
  }

  // ── Gemini ────────────────────────────────────────────────────────────────
  if (!keyGemini) {
    msg += '❌ GEMINI: chave não encontrada.\n';
    msg += '   → Adicione "cfg_key_gemini" em:\n';
    msg += '      GAS Editor → Engrenagem (⚙) → Propriedades do script\n';
  } else {
    msg += '✅ GEMINI: chave encontrada (' + keyGemini.slice(0,15) + '...)\n';
    try {
      const url  = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=' + keyGemini;
      const resp = UrlFetchApp.fetch(url, {
        method: 'post',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
          generationConfig: { maxOutputTokens: 5 },
        }),
        muteHttpExceptions: true,
      });
      const code = resp.getResponseCode();
      if (code === 200) {
        msg += '   🟢 Conexão OK\n';
      } else {
        const body = JSON.parse(resp.getContentText());
        msg += '   🔴 HTTP ' + code + ': ' + (body.error && body.error.message ? body.error.message : resp.getContentText().slice(0,100)) + '\n';
      }
    } catch(e) {
      msg += '   🔴 Erro: ' + e.message + '\n';
    }
  }

  SpreadsheetApp.getUi().alert(msg);
}

function criarSessaoTesteMenu() {
  var email = SpreadsheetApp.getUi().prompt('E-mail do colaborador para teste:').getResponseText();
  if (!email) return;
  var id = criarSessaoTeste(email);
  SpreadsheetApp.getUi().alert('Sessão criada!\n\nID: ' + id + '\n\nAcesse o Web App e digite o e-mail: ' + email);
}

function mostrarURLWebApp() {
  SpreadsheetApp.getUi().alert('Para obter a URL:\n\n1. Deploy > New deployment\n2. Type: Web App\n3. Execute as: Me\n4. Who has access: Anyone\n5. Copie a URL gerada');
}

// ───────────────────────────────────────────────────────────────────────────────
// DADOS DE REFERÊNCIA
// ───────────────────────────────────────────────────────────────────────────────

const PARES_MAPEAMENTO = [
  ['OTIMISTA',               'REALISTA',                  'I'],
  ['COMUNICATIVO',           'ANALISTA',                  'I'],
  ['GENERALISTA',            'DETALHISTA',                'D'],
  ['ESTILO AGRESSIVO',       'ESTILO CONSULTIVO',         'D'],
  ['MELHOR EM FALAR',        'MELHOR EM OUVIR',           'I'],
  ['AVERSO A ROTINA',        'ROTINEIRO',                 'D'],
  ['DELEGA',                 'CENTRALIZA',                'D'],
  ['COMPREENSIVO',           'IMPARCIAL',                 'S'],
  ['CASUAL',                 'FORMAL',                    'C'],
  ['FOCO EM RELACIONAMENTOS','FOCO NAS TAREFAS',          'S'],
  ['ORIENTAÇÃO A RESULTADOS','ORIENTAÇÃO A PROCESSOS',    'D'],
  ['EMOCIONAL',              'RACIONAL',                  'S'],
  ['DINÂMICO',               'ESTÁVEL',                   'D'],
  ['AGE COM FIRMEZA',        'AGE COM CONSENTIMENTO',     'D'],
  ['COMANDANTE',             'CONCILIADOR',               'D'],
  ['ASSUME RISCOS',          'PRUDENTE',                  'D'],
  ['OBJETIVO',               'SISTEMÁTICO',               'D'],
  ['CRIA DO ZERO',           'APRIMORA O QUE JÁ EXISTE',  'I'],
  ['MULTITAREFAS',           'ESPECIALISTA',              'I'],
  ['INSPIRADOR',             'TÉCNICO',                   'I'],
  ['EXTROVERTIDO',           'INTROVERTIDO',              'I'],
  ['OUSADO',                 'CONSERVADOR',               'D'],
  ['AGE COM VELOCIDADE',     'AGE COM PLANEJAMENTO',      'D'],
  ['PRÁTICO',                'TEÓRICO',                   'D'],
];

const ESCALA_DISC = [
  { max: 20,  label: 'Muito baixo'       },
  { max: 40,  label: 'Baixo'             },
  { max: 60,  label: 'Alto'              },
  { max: 80,  label: 'Muito alto'        },
  { max: 100, label: 'Extremamente alto' },
];

function escalaDisc(score) {
  for (const faixa of ESCALA_DISC) {
    if (score <= faixa.max) return `${faixa.label} (${score})`;
  }
  return `Extremamente alto (${score})`;
}

const GAP_NATURAL = {
  'Alto D': ['Empatia', 'Paciência', 'Escuta ativa', 'Consenso'],
  'Alto I': ['Organização', 'Detalhismo', 'Consistência', 'Análise'],
  'Alto S': ['Assertividade', 'Confronto direto', 'Velocidade', 'Gestão de mudança'],
  'Alto C': ['Decisão sob incerteza', 'Flexibilidade', 'Velocidade', 'Relações informais'],
  'Baixo D': ['Tomada de decisão', 'Firmeza', 'Direcionamento'],
  'Baixo I': ['Expressão verbal', 'Influência', 'Entusiasmo público'],
  'Baixo S': ['Paciência', 'Estabilidade emocional', 'Empatia consistente'],
  'Baixo C': ['Rigor', 'Planejamento', 'Atenção a regras'],
};


// ───────────────────────────────────────────────────────────────────────────────
// MENU — Vertho IA (reorganizado Mar/2026)
//
// Fase 1: Preparação
// Fase 2: Diagnóstico (coleta)
// Fase 3: Avaliação Geral (IA4 + entregas)
// Fase 4: Capacitação (em desenvolvimento)
// Fase 5: Avaliação de Aprendizagem (conversacional)
// Dashboard: transversal
// Utilitários: ferramentas auxiliares e de teste
// ───────────────────────────────────────────────────────────────────────────────

function onOpen() {
  var ui   = SpreadsheetApp.getUi();
  var menu = ui.createMenu('🤖 Vertho IA');

  menu.addItem('🖥️  Painel de Controle', 'mostrarInterface');
  menu.addSeparator();

  // ── Fase 1 — Preparação ──
  menu.addSubMenu(ui.createMenu('📐 Fase 1 — Preparação')
    .addItem('📋 Assessment CIS (Webapp)',               'abrirCISAssessment')
    .addItem('🔄 Sincronizar CIS → Colaboradores',      'sincronizarCIScomPipeline')
    .addSeparator()
    .addItem('📄  Extrair PPPs das Escolas',             'extrairPPPsMenu')
    .addItem('▶  IA 1 — Top Competências por Cargo',    'rodarIA1')
    .addItem('🎯  Selecionar Competências Workshop',    'abrirSeletorComp')
    .addItem('▶  IA 2 — Gabarito 4 Telas CIS',         'rodarIA2')
    .addSeparator()
    .addItem('📦 Gerar Banco de Cenários',              'gerarBancoCenarios')
    .addItem('🔄 Regenerar Cenário Selecionado',        'regenerarCenarioBanco')
    .addItem('🔍 Check IA — Validar Banco',             'checkBancoCenarios'));

  // ── Fase 2 — Diagnóstico ──
  menu.addSubMenu(ui.createMenu('📮 Fase 2 — Diagnóstico')
    .addItem('📧 Configurar cadência de e-mails',       'configurarCadenciaEmail')
    .addItem('▶  Disparar e-mails agora (manual)',      'dispararEmailsDoDia')
    .addItem('⏹  Parar cadência de e-mails',            'pararCadenciaEmail')
    .addItem('📊 Ver status de envios',                 'verStatusEnvios')
    .addItem('🔄 Coletar respostas agora (manual)',     'coletarRespostas'));

  // ── Fase 3 — Avaliação ──
  menu.addSubMenu(ui.createMenu('🧠 Fase 3 — Avaliação')
    .addItem('▶  IA 4 — Avaliar Respostas',             'rodarIA4')
    .addItem('🔍 Check IA — Validar Avaliações',        'checkAvaliacoes')
    .addSeparator()
    .addItem('📄 Gerar PDIs Descritores',               'gerarPDIsDescritores')
    .addItem('📄 Gerar PDIs Foresea',                   'gerarPDIsDescritoresForesea')
    .addItem('📧 Enviar PDIs Descritores',              'enviarPDIsDescritoresMenu')
    .addSeparator()
    .addItem('📂 Relatório do Gestor',                  'gerarDossieGestorManual')
    .addItem('📊 Relatório Consolidado RH',             'gerarRelatorioRHManual')
    .addItem('📋 Relatório de Plenária',               'gerarRelatorioPlenaria')
    .addItem('📋 Plenária Foresea',                    'gerarRelatorioPlenariaForesea'));

  // ── Fase 4 — Capacitação ──
  menu.addSubMenu(ui.createMenu('📚 Fase 4 — Capacitação')
    .addItem('📦 Popular Catálogo Base (864 linhas)',    'popularCatalogoBase')
    .addItem('🔗 Match Moodle → Catálogo',              'matchMoodleCatalogo')
    .addItem('🤖 Gerar Resumos para Tutor IA',          'gerarResumosTutor')
    .addSeparator()
    .addItem('⬇️  Importar Catálogo Moodle',            'moodleImportarCatalogo')
    .addItem('📚 Catalogar Conteúdos (IA)',              'catalogarConteudosMoodle')
    .addItem('🔄 Reset Catálogo Enriquecido',           'catalogarConteudosReset')
    .addItem('📊 Cobertura de Conteúdo',                'gerarCoberturaConteudo')
    .addSeparator()
    .addItem('🛤️ Montar Trilhas de Desenvolvimento',    'montarTrilhasLote')
    .addSeparator()
    .addItem('📋 Criar Ciclo de Avaliação',              'criarCicloMenu')
    .addItem('🚀 Iniciar Envio Semanal',                'iniciarFase4Menu')
    .addItem('⚙️ Configurar Triggers (Seg+Qui)',        'configurarTriggersFase4')
    .addItem('📧 Disparar Pílula Agora (manual)',       'triggerSegundaFase4')
    .addItem('📋 Disparar Evidência Agora (manual)',    'triggerQuintaFase4')
    .addSeparator()
    .addItem('🤖 Gerar Resumos para Tutor IA',          'gerarResumosTutor'));

  // ── Fase 5 — Reavaliação ──
  menu.addSubMenu(ui.createMenu('🗣️ Fase 5 — Reavaliação')
    .addItem('🗣️ Reavaliação Conversacional (Sem.15)',  'iniciarReavaliacaoLote')
    .addItem('📄 Gerar Relatórios de Evolução',         'gerarRelatoriosEvolucaoLote')
    .addItem('📊 Plenária de Evolução',                 'gerarPlenariaEvolucao')
    .addSeparator()
    .addItem('📋 Gerar Cenários B',                     'gerarCenariosBFase3')
    .addItem('📋 Criar Sessões em Lote',                'criarSessoesLoteMenu')
    .addSeparator()
    .addItem('📄 Gerar Relatórios Individuais',         'gerarRelatoriosFase3Menu')
    .addItem('📂 Relatório do Gestor',                  'gerarRelatoriosGestorFase3Menu')
    .addItem('📊 Relatório RH',                         'gerarRelatorioRHFase3Menu')
    .addSeparator()
    .addItem('📧 Enviar Relatórios Individuais',        'enviarRelatoriosIndividuaisFase3Menu')
    .addItem('📧 Enviar Relatórios Gestores',           'enviarRelatoriosGestorFase3Menu')
    .addItem('📧 Enviar Relatório RH',                  'enviarRelatorioRHFase3Menu'));

  // ── Dashboard ──
  menu.addSubMenu(ui.createMenu('📊 Dashboard')
    .addItem('🔄 Atualizar Dashboard',                  'atualizarDashboardFase3Menu')
    .addItem('🌐 Abrir Dashboard Web',                  'abrirDashboardWeb'));

  menu.addSeparator();

  // ── Utilitários ──
  menu.addSubMenu(ui.createMenu('⚙️ Utilitários')
    .addItem('🎭 Simular Respostas (Teste)',            'simularRespostas')
    .addItem('🗣️ Simular Conversas (Teste)',            'simularConversasFase3Menu')
    .addItem('🔄 Resetar Sessões (Teste)',              'resetarSessoesTeste')
    .addItem('📊 Ver Cenários B gerados',               'listarCenariosBGerados')
    .addItem('🧹 Limpar Sessões Abandonadas',           'limparSessoesAbandonadas')
    .addSeparator()
    .addItem('🔑 Diagnosticar Chaves API',              'diagnosticarChavesAPI'));

  menu.addToUi();
}

function criarAbaRespostas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  _garantirAbaRespostas(ss);
  SpreadsheetApp.getUi().alert('✅ Aba "Respostas" pronta.');
}


// ═══════════════════════════════════════════════════════════════════════════════
// PRÉ-FLIGHT — verificação automática antes de rodarIA1
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Verifica e auto-corrige pré-requisitos antes de processar.
 * NÃO exibe UI.alert — apenas registra no log e retorna array de avisos.
 * Chamado internamente por rodarIA1() e disponível para o Painel via
 * _coletarAvisosPreflight() em Interface.gs.
 *
 * @returns {string[]} Lista de avisos (vazia = tudo ok)
 */
function _verificarTriggers() {
  var avisos = [];
  try {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getScriptProperties();

  // 1. masterSpreadsheetId ───────────────────────────────────────────────────
  if (!props.getProperty('masterSpreadsheetId')) {
    props.setProperty('masterSpreadsheetId', ss.getId());
    _addLog('🔧 Preflight: masterSpreadsheetId configurado automaticamente.');
  }

  // 2. Aba Respostas ──────────────────────────────────────────────────────────
  if (!ss.getSheetByName(ABA_RESPOSTAS)) {
    _garantirAbaRespostas(ss);
    _addLog('🔧 Preflight: aba "' + ABA_RESPOSTAS + '" criada automaticamente.');
  }

  // 3. Colunas de envio na aba Cenarios ──────────────────────────────────────
  const wsCen = ss.getSheetByName('Banco_Cenarios');
  if (wsCen) {
    _garantirColunasEnvio(ss);
    _addLog('🔧 Preflight: colunas de envio verificadas na aba Cenarios.');
  }

  // 4. Trigger consolidarResposta ─────────────────────────────────────────────
  // Não é possível instalar trigger de formulário aqui (requer ID do form).
  // Apenas avisa.
  const temConsolidar = ScriptApp.getProjectTriggers()
    .some(t => t.getHandlerFunction() === 'consolidarResposta');
  if (!temConsolidar) {
    const msg = '⚠️ Trigger "consolidarResposta" não instalado — será criado automaticamente por gerarForms().';
    avisos.push(msg);
    _addLog('Preflight: ' + msg);
  }

  // 5. Trigger dispararEmailsDoDia ───────────────────────────────────────────
  const temCadencia = ScriptApp.getProjectTriggers()
    .some(t => t.getHandlerFunction() === 'dispararEmailsDoDia');
  if (!temCadencia) {
    const msg = '⚠️ Cadência de e-mails inativa — configure via Painel → Fase 2 após gerar os Forms.';
    avisos.push(msg);
    _addLog('Preflight: ' + msg);
  }

  } catch(e) {
    Logger.log('_verificarTriggers erro (nao critico): ' + e.message);
  }
  return avisos;
}


// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS GLOBAIS
// ═══════════════════════════════════════════════════════════════════════════════

function _norm(s) {
  return s ? String(s).replace(/\s+/g, ' ').trim() : '';
}

function _idx(headers, label) {
  const nl = _norm(label);
  let i = headers.findIndex(h => _norm(h) === nl);
  if (i >= 0) return i;
  const kw = nl.split(' ')[0].replace(/[()]/g, '');
  i = headers.findIndex(h => _norm(h).includes(kw));
  return i;
}

/**
 * Localiza a coluna "E-mail Corporativo" na linha de headers.
 * Aceita variações: "e-mail corporativo", "email corporativo", "e-mail corp."
 */
function _idxEmailColab(headers) {
  return headers.findIndex(h => {
    const n = _norm(String(h || '')).toLowerCase();
    return (n.includes('e-mail') || n.includes('email')) && n.includes('corporat');
  });
}


// ═══════════════════════════════════════════════════════════════════════════════
// IA 1 — FILTRO TOP 10 COMPETÊNCIAS
// ═══════════════════════════════════════════════════════════════════════════════

function rodarIA1() {
  _carregarCFG();
  // Pré-flight automático — silencioso, sem bloquear execução
  _verificarTriggers();

  const ss      = SpreadsheetApp.getActiveSpreadsheet();
  const wsCargo = ss.getSheetByName('Cargos');

  if (!wsCargo) {
    SpreadsheetApp.getUi().alert('Aba "Cargos" nao encontrada na planilha.');
    return;
  }

  const headers = wsCargo.getRange(4, 1, 1, wsCargo.getLastColumn()).getValues()[0];
  const dados   = wsCargo.getDataRange().getValues();
  const idx     = (l) => _idx(headers, l);

  const iStatus = idx('Status\nIA');
  if (iStatus < 0) {
    SpreadsheetApp.getUi().alert('❌ Coluna "Status IA" não encontrada na linha 4 da aba Cargos.');
    return;
  }

  let iCompInicio = headers.findIndex(h => _norm(h || '').startsWith('Comp. 1'));
  if (iCompInicio < 0) iCompInicio = 9;

  // V2: Tentar carregar de Competencias_v2 primeiro, fallback para legado
  var mapaV2 = _lerBaseCompetenciasV2(ss);
  var baseComp;
  if (mapaV2 && Object.keys(mapaV2).length > 0) {
    // Converter mapa V2 para formato array compatível com _chamarIA1
    baseComp = Object.keys(mapaV2).map(function(cod) {
      var c = mapaV2[cod];
      var descNomes = c.descritores.map(function(d) { return d.nome_curto; }).join('; ');
      return {
        id:          c.codigo,
        nome:        c.nome,
        categoria:   c.pilar,
        cargos:      c.cargo,
        descricao:   c.descricao,
        descritores: descNomes,
        palavras:    '',
        gap:         '',
        esperado:    '',
        perfis_gap:  '',
        traco1: '', traco2: '', traco3: '', traco4: ''
      };
    });
    Logger.log('rodarIA1: usando Competencias_v2 (' + baseComp.length + ' competencias)');
  } else {
    SpreadsheetApp.getUi().alert('Aba Competencias_v2 não encontrada ou vazia.\n\nPreencha a aba Competencias_v2 com as matrizes de competências.');
    return;
  }
  let processadas = 0;

  for (let r = 4; r < dados.length; r++) {
    const statusIA1 = _norm(String(dados[r][iStatus] || ''));
    // Processar qualquer linha com cargo preenchido.
    // Pular APENAS 'Top 10 Gerada' se o usuário não quiser reprocessar — mas
    // 'Gabarito Gerado' e 'Processando...' são da IA2 e não bloqueiam a IA1.
    // Para forçar re-run: basta apagar o status manualmente.
    if (statusIA1 === 'Processando...') continue;
    // Pular linhas realmente vazias (sem ID de cargo)
    if (!dados[r][idx('ID\nCargo')] && !dados[r][idx('Nome do Cargo')]) continue;

    wsCargo.getRange(r + 1, iStatus + 1).setValue('Processando...');
    SpreadsheetApp.flush();

    // Buscar escola: Empresa/Cliente primeiro, fallback para Área/Depto (col D = index 3)
    var empresaIA1 = String(dados[r][idx('Empresa\nCliente')] || '').trim();
    var iAreaIA1   = idx('Área /\nDepto.');
    if (iAreaIA1 < 0) iAreaIA1 = 3; // fallback col D
    var areaIA1    = String(dados[r][iAreaIA1] || '').trim();
    var escola     = empresaIA1 || areaIA1;
    var pppTexto = buscarPPPEscola(ss, escola);
    var contextoPPP = pppTexto ? formatarContextoPPP(pppTexto) : '';
    var valoresEscola = buscarValoresEscola(ss, escola);

    const input = {
      empresa:   escola,
      cargo:     dados[r][idx('Nome do Cargo')],
      area:      dados[r][idx('Área /\nDepto.')],
      descricao: dados[r][idx('Descrição do Cargo\n(responsabilidades)')],
      entregas:  dados[r][idx('Principais Entregas\nEsperadas')],
      valores:   valoresEscola.join(', '),
      contexto:  contextoPPP || dados[r][idx('Contexto Cultural\n(opcional)')] || '',
    };

    const resultado = _chamarIA1(baseComp, input);

    if (resultado.erro) {
      wsCargo.getRange(r + 1, iStatus + 1).setValue('Erro');
      if (iCompInicio >= 0) wsCargo.getRange(r + 1, iCompInicio + 1).setValue('❌ ' + resultado.mensagem);
      _addLog('❌ IA1 erro linha ' + (r + 1) + ': ' + resultado.mensagem);
      continue;
    }

    resultado.top10.forEach((comp, i) => {
      const txt = comp.id ? `${comp.id} | ${comp.nome} | ${comp.justificativa}` : '';
      wsCargo.getRange(r + 1, iCompInicio + 1 + i).setValue(txt);
    });

    const iJust = headers.findIndex(h => _norm(h).toLowerCase().includes('justificativa'));
    if (iJust >= 0 && resultado.justificativa) {
      wsCargo.getRange(r + 1, iJust + 1).setValue(resultado.justificativa);
    }

    wsCargo.getRange(r + 1, iStatus + 1).setValue('Top 10 Gerada');
    processadas++;
  }

  SpreadsheetApp.getUi().alert(
    processadas > 0
      ? `✅ ${processadas} cargo(s) processado(s).`
      : 'Nenhuma linha com cargo preenchido encontrada (ou todas já com Top 10 Gerada).'
  );
}

function _chamarIA1(baseComp, input) {
  // ── Pré-filtro por cargo ──────────────────────────────────────────────────
  // Normaliza o cargo do input para comparação parcial (case-insensitive)
  const cargoNorm = _norm(input.cargo || '').toLowerCase();

  // Filtra competências cujo campo 'cargos' menciona o cargo (ou variação)
  // Se nenhuma competência bater, usa a base completa como fallback
  let baseParaUsar = baseComp.filter(comp => {
    const cargosComp = _norm(comp.cargos || '').toLowerCase();
    if (!cargosComp) return true; // sem restrição de cargo → elegível para todos
    // Match parcial em qualquer direção
    return cargosComp.split(/[,;/]/).some(c => {
      const ct = c.trim();
      return ct && (cargoNorm.includes(ct) || ct.includes(cargoNorm) ||
                    // match por palavras-chave relevantes (ex: "professor" bate em "Professor(a)")
                    cargoNorm.split(/\s+/).some(w => w.length > 3 && ct.includes(w)));
    });
  });

  // Fallback: se filtro zerou, usa tudo (base com cargos genéricos ou cargo novo)
  if (baseParaUsar.length < 10) {
    _addLog(`⚠️ IA1: filtro por cargo retornou ${baseParaUsar.length} competências — usando base completa.`);
    baseParaUsar = baseComp;
  }

  const baseTexto = baseParaUsar.map(comp => {
    const tracos = [comp.traco1, comp.traco2, comp.traco3, comp.traco4].filter(Boolean).join(', ');
    const gap    = comp.perfis_gap ? ` | Gap natural: ${comp.perfis_gap}` : '';
    return `${comp.id} | ${comp.nome} | ${comp.categoria} | ${comp.descricao} | KW: ${comp.palavras}` +
           (tracos ? ` | Traços CIS: ${tracos}${gap}` : '');
  }).join('\n');

  const system =
    `Você é a IA de parametrização da Vertho.
` +
    `Selecione as 10 competências MAIS RELEVANTES da base para o cargo descrito.
` +
    `Retorne APENAS JSON válido, sem markdown:
` +
    `{"top10":[{"id":"C001","nome":"Nome","categoria":"Comportamental","justificativa":"Frase específica."},...], "justificativa_geral":"Parágrafo."}

` +
    `REGRAS — siga na ordem de prioridade:
` +
    `1. Exatamente 10 competências — nem mais, nem menos.
` +
    `2. TODAS as 10 devem ser da base fornecida — proibido inventar IDs.
` +
    `3. Selecione APENAS competências diretamente aplicáveis ao cargo descrito:
` +
    `   — Analise cargo, área, descrição e principais entregas.
` +
    `   — Elimine competências que não fazem sentido para esse cargo específico.
` +
    `4. Use descrição do cargo e entregas como critério principal de seleção.
` +
    `5. Use palavras-chave (KW) como critério de reforço.
` +
    `6. Use valores organizacionais como critério de desempate.
` +
    `7. USE OS TRAÇOS CIS como critério de desempate final:
` +
    `   — Prefira competências cujos Traços CIS alinham ao perfil típico do cargo.
` +
    `8. A justificativa de cada competência DEVE citar elemento específico do cargo.

` +
    `BASE DE COMPETÊNCIAS (id | nome | categoria | descrição | palavras-chave | Traços CIS | Gap natural):
` +
    `${baseTexto}`;

  const user =
    `EMPRESA: ${input.empresa}
` +
    `CARGO: ${input.cargo}
` +
    `ÁREA: ${input.area}
` +
    `DESCRIÇÃO DO CARGO: ${input.descricao}
` +
    `PRINCIPAIS ENTREGAS: ${input.entregas}
` +
    `VALORES ORGANIZACIONAIS: ${input.valores}
` +
    `CONTEXTO CULTURAL: ${input.contexto || 'Não informado'}`;

  return _chamarAPI(_CFG.modelo || MODEL_SONNET, system, user, (body) => {
    const parsed = _extrairJSON(body.content[0].text);
    return { erro: false, top10: parsed.top10, justificativa: parsed.justificativa_geral || '' };
  });
}


// ═══════════════════════════════════════════════════════════════════════════════
// IA 2 — GABARITO DAS 4 TELAS CIS
// ═══════════════════════════════════════════════════════════════════════════════

function rodarIA2() {
  _carregarCFG();
  const ss      = SpreadsheetApp.getActiveSpreadsheet();
  const wsCargo = ss.getSheetByName('Cargos');
  if (!wsCargo) { SpreadsheetApp.getUi().alert('Aba "Cargos" nao encontrada.'); return; }

  const headers = wsCargo.getRange(4, 1, 1, wsCargo.getLastColumn()).getValues()[0];
  const dados   = wsCargo.getDataRange().getValues();
  const idx     = (l) => _idx(headers, l);

  const iStatus = idx('Status\nIA');
  const iTela1  = headers.findIndex(h => _norm(h || '').includes('TELA 1'));
  const iTela2  = headers.findIndex(h => _norm(h || '').includes('TELA 2'));
  const iTela3  = headers.findIndex(h => _norm(h || '').includes('TELA 3'));
  const iTela4  = headers.findIndex(h => _norm(h || '').includes('TELA 4'));
  const iComp1  = headers.findIndex(h => _norm(h || '').startsWith('Comp. 1'));
  const iTop5   = headers.findIndex(h => _norm(h || '').toLowerCase().includes('top 5'));
  var iCargo  = headers.findIndex(h => _norm(h || '').toLowerCase().includes('nome do cargo'));
  if (iCargo < 0) iCargo = 2; // fallback col C

  const subComps  = _montarSubCompetencias();

  // V2: Tentar Competencias_v2 primeiro, fallback para legado
  var mapaV2 = _lerBaseCompetenciasV2(ss);
  var baseComp;
  if (mapaV2 && Object.keys(mapaV2).length > 0) {
    baseComp = Object.keys(mapaV2).map(function(cod) {
      var c = mapaV2[cod];
      var descNomes = c.descritores.map(function(d) { return d.nome_curto; }).join('; ');
      return {
        id: c.codigo, nome: c.nome, categoria: c.pilar, cargos: c.cargo,
        descricao: c.descricao, descritores: descNomes,
        palavras: '', gap: '', esperado: '', perfis_gap: '',
        traco1: '', traco2: '', traco3: '', traco4: ''
      };
    });
  } else {
    SpreadsheetApp.getUi().alert('Aba Competencias_v2 não encontrada ou vazia.');
    return;
  }
  let processadas = 0;

  for (let r = 4; r < dados.length; r++) {
    const cargo = _norm(String(dados[r][iCargo] || ''));
    if (!cargo) continue;
    // Sem filtro de status — processa todas as linhas com cargo preenchido

    const top5Raw = iTop5 >= 0 ? String(dados[r][iTop5] || '').trim() : '';
    if (!top5Raw || top5Raw.toLowerCase().includes('preencher')) {
      wsCargo.getRange(r + 1, iStatus + 1).setValue('Erro');
      if (iTela1 >= 0) wsCargo.getRange(r + 1, iTela1 + 1).setValue('❌ Preencha o Top 5 Workshop.');
      continue;
    }

    const ids5 = top5Raw.split(',').map(s => s.trim()).filter(Boolean);
    const top10todas = [];
    for (let i = 0; i < 10; i++) {
      if (dados[r][iComp1 + i]) top10todas.push(dados[r][iComp1 + i]);
    }
    const top5 = ids5.map(id => {
      const match = top10todas.find(c => c.startsWith(id));
      return match || id;
    });

    wsCargo.getRange(r + 1, iStatus + 1).setValue('Processando...');
    SpreadsheetApp.flush();

    // Buscar escola: Empresa/Cliente primeiro, fallback para Área/Depto (col D)
    var empresaIA2 = String(dados[r][idx('Empresa\nCliente')] || '').trim();
    var iAreaIA2   = idx('Área /\nDepto.'); if (iAreaIA2 < 0) iAreaIA2 = 3;
    var areaIA2    = String(dados[r][iAreaIA2] || '').trim();
    var escolaIA2  = empresaIA2 || areaIA2;

    // Buscar contexto PPP e valores da PPP_Escolas
    var pppTextoIA2 = buscarPPPEscola(ss, escolaIA2);
    var contextoPPPia2 = pppTextoIA2 ? formatarContextoPPP(pppTextoIA2) : '';
    var valoresEscolaIA2 = buscarValoresEscola(ss, escolaIA2);

    var modeloIA2Label = _CFG.modelo || MODEL_SONNET;
    SpreadsheetApp.getActive().toast(
      '[' + (Config.modelLabel ? Config.modelLabel(modeloIA2Label) : modeloIA2Label) + '] ' + cargo + ' | ' + escolaIA2 + ' (' + (processadas + 1) + ')',
      '🎯 IA 2 — Gabarito CIS', 30
    );

    const input = {
      empresa:    escolaIA2,
      cargo:      dados[r][idx('Nome do Cargo')],
      area:       areaIA2,
      descricao:  dados[r][idx('Descrição do Cargo\n(responsabilidades)')],
      entregas:   dados[r][idx('Principais Entregas\nEsperadas')],
      valores:    valoresEscolaIA2.join(', '),
      contexto:   contextoPPPia2 || dados[r][idx('Contexto Cultural\n(opcional)')] || '',
      top10:      top5,
    };

    const resultado = _chamarIA2(input, subComps);

    if (resultado.erro) {
      wsCargo.getRange(r + 1, iStatus + 1).setValue('Erro');
      if (iTela1 >= 0) wsCargo.getRange(r + 1, iTela1 + 1).setValue(resultado.mensagem);
      continue;
    }

    const g  = resultado.gabarito;
    const t3 = g.tela3;
    const t4 = g.tela4;

    if (iTela1 >= 0) wsCargo.getRange(r + 1, iTela1 + 1).setValue(g.tela1.join(', '));
    if (iTela2 >= 0) wsCargo.getRange(r + 1, iTela2 + 1).setValue(
      g.tela2.map(c => `${c.nome}: ${c.faixa_min} → ${c.faixa_max}`).join('\n')
    );
    if (iTela3 >= 0) wsCargo.getRange(r + 1, iTela3 + 1).setValue(
      `Executor: ${t3.executor}%\nMotivador: ${t3.motivador}%\nMetódico: ${t3.metodico}%\nSistemático: ${t3.sistematico}%`
    );
    if (iTela4 >= 0) wsCargo.getRange(r + 1, iTela4 + 1).setValue(
      `D: ${t4.D.min} → ${t4.D.max}\nI: ${t4.I.min} → ${t4.I.max}\nS: ${t4.S.min} → ${t4.S.max}\nC: ${t4.C.min} → ${t4.C.max}`
    );

    wsCargo.getRange(r + 1, iStatus + 1).setValue('Gabarito Gerado');
    processadas++;
  }

  SpreadsheetApp.getUi().alert(
    processadas > 0
      ? `✅ ${processadas} gabarito(s) gerado(s).`
      : 'Nenhuma linha pendente encontrada (todas ja tem gabarito ou falta Top 5).'
  );
}

function _montarSubCompetencias() {
  const mapa = {
    D: ['Ousadia', 'Comando', 'Objetividade', 'Assertividade'],
    I: ['Persuasão', 'Extroversão', 'Entusiasmo', 'Sociabilidade'],
    S: ['Empatia', 'Paciência', 'Persistência', 'Planejamento'],
    C: ['Organização', 'Detalhismo', 'Prudência', 'Concentração'],
  };
  return Object.entries(mapa).flatMap(([dim, nomes]) =>
    nomes.map(nome => ({ dim, nome }))
  );
}

function _chamarIA2(input, subComps) {
  const subTexto  = subComps.map(s => `${s.nome} (dim. ${s.dim})`).join(', ');
  const paresText = PARES_MAPEAMENTO.map(p => `${p[0]} × ${p[1]}`).join(', ');

  // ── SEM dados da aba CIS_IA_Referencia ──
  // O gabarito deve emergir do raciocínio sobre o cargo + escola.
  // Teste A/B mostrou que injetar a base vicia o resultado.

  const system = `Voce e a IA de perfil comportamental da Vertho.
Sua tarefa: dado um cargo, suas responsabilidades, entregas e competencias priorizadas,
RACIOCINE sobre qual perfil comportamental ideal este cargo exige nesta escola.

=== HIERARQUIA DE FONTES (ordem de prioridade) ===
1. DESCRICAO DO CARGO E CONTEXTO DA ESCOLA — fonte primaria.
   O perfil deve emergir das responsabilidades reais, do publico atendido,
   da estrutura organizacional e dos desafios especificos daquela escola.
2. SINAIS EXPLICITOS DO TEXTO — palavras, enfases e prioridades que
   o texto do cargo/escola traz. Se o texto enfatiza "gestao administrativa
   e articulacao com reitoria", isso e sinal de D mais alto. Se enfatiza
   "mediacao e acolhimento", isso e sinal de S/I mais alto.
3. CONHECIMENTO COMPORTAMENTAL COMO CAMADA DE ENRIQUECIMENTO — use seu
   conhecimento sobre DISC/CIS apenas para refinar e nuancar. Ele nao deve
   dominar a inferencia principal nem transformar o perfil em arquetipo generico.
4. REGRA DE OURO: Nunca use conhecimento generico para sobrescrever sinais
   claros do caso.

=== REGRAS DE INFERENCIA ===
Antes de gerar o gabarito, faca uma HIPOTESE-BASE do perfil usando APENAS
a descricao do cargo e o contexto da escola. Depois, use conhecimento
comportamental APENAS para:
  ✅ Confirmar hipoteses ja sustentadas pelo caso
  ✅ Acrescentar nuances plausiveis
  ✅ Levantar hipoteses secundarias com menor confianca

NAO FACA:
  ❌ Nao aumente D, C, assertividade, objetividade ou centralizacao sem
     2+ sinais convergentes no texto do cargo
  ❌ Nao aumente S ou Empatia automaticamente so porque e cargo educacional —
     Empatia Extremamente Alto deve exigir evidencia especifica, nao ser default
  ❌ Nao transforme perfis diferentes em versoes do mesmo "bom profissional escolar"
  ❌ Nao conclua tracos fortes com base em uma unica pista verbal

REGRA DE EVIDENCIA MINIMA:
  - Para subir materialmente uma dimensao: 2+ sinais convergentes no caso
  - Para 1 sinal fraco: hipotese secundaria, linguagem de baixa confianca
  - Para 0 sinais: nao incluir

=== REGRAS DE DIFERENCIACAO OBRIGATORIA ===
Dentro da MESMA escola, cargos diferentes DEVEM gerar perfis DISC diferentes.

| Aspecto | Diretor | Coordenador | Professor |
|---------|---------|-------------|-----------|
| D (Dominancia) | MAIS ALTO — decide, posiciona | MEDIO — articula, medeia | MAIS BAIXO — colabora |
| I (Influencia) | Alta — inspira, mobiliza | Alta — persuade, engaja | Variavel |
| S (Estabilidade) | MAIS BAIXA — imprevistos | Alta — mantem processos | MAIS ALTA — rotina, paciencia |
| C (Conformidade) | Variavel | MAIS ALTA — indicadores | Variavel |
| Executor | MAIS ALTO | Baixo-Medio | MAIS BAIXO |
| Motivador | Medio-Alto | Medio | MAIS ALTO |
| Metodico | Medio | MAIS ALTO | Medio-Alto |
| Sistematico | Medio | Medio-Alto | Baixo-Medio |

Se ao finalizar os 3 cargos tiverem a MESMA faixa DISC, PARE e REVISE.
REGRA: Pelo menos 2 dos 4 fatores DISC devem ter faixas DIFERENTES entre
Diretor e Professor da mesma escola.

=== REGRAS DE ESCRITA ===
A saida deve preservar a SINGULARIDADE do caso.
NAO REPITA o mesmo pacote de adjetivos entre perfis diferentes.
Se voce ja usou estes termos nos perfis anteriores, questione se sao
realmente sustentados NESTE caso:
  detalhista, sistematico, prudente, tecnico, formal, consultivo, centraliza

=== CHECKLIST PRE-ENTREGA (verifique antes de finalizar) ===
[ ] 1. Este perfil parece o cargo/escola original?
[ ] 2. Estou elevando D/C sem 2+ sinais convergentes?
[ ] 3. Estou inflando S/Empatia so porque e educador?
[ ] 4. Estou repetindo os mesmos adjetivos dos perfis anteriores?
[ ] 5. O DISC deste cargo e DIFERENTE dos outros cargos da mesma escola?
[ ] 6. A Tela 2 tem entre 6-10 sub-competencias (nao todas 16)?

=== FORMATO DE SAIDA ===
APENAS JSON valido sem markdown. Inclua raciocinio_estruturado:
{"gabarito":{"tela1":["CARACTERISTICA",...],"tela2":[{"nome":"Empatia","dimensao":"S","faixa_min":"Alto (41-60)","faixa_max":"Muito alto (61-80)"}],"tela3":{"executor":10,"motivador":40,"metodico":35,"sistematico":15},"tela4":{"D":{"min":"Baixo (21-40)","max":"Muito alto (61-80)"},"I":{"min":"Alto (41-60)","max":"Extremamente alto (81-100)"},"S":{"min":"Alto (41-60)","max":"Muito alto (61-80)"},"C":{"min":"Muito baixo (0-20)","max":"Alto (41-60)"}}},"raciocinio_estruturado":{"sinais_do_caso":["sinal 1","sinal 2"],"leitura_principal":"interpretacao direta dos sinais","nuances_cis":"o que o conhecimento comportamental acrescenta","hipoteses_baixa_confianca":"palpites que precisam validacao","diferenciais_vs_outros_cargos":"como este perfil se diferencia do Coordenador e do Professor"}}

TELA 1 — Caracteristicas do perfil ideal (pares de opostos):
  Pares disponiveis: ${paresText}
  Selecione ate 20 caracteristicas para ESTE cargo.
  REGRA: cada par e espectro — escolha UM lado.

TELA 2 — Sub-competencias CIS com faixas ideais:
  Sub-competencias disponiveis: ${subTexto}
  SELECIONE entre 6 e 10 MAIS RELEVANTES para este cargo.
  NAO inclua todas as 16.
  Faixas: Muito baixo (0-20) | Baixo (21-40) | Alto (41-60) | Muito alto (61-80) | Extremamente alto (81-100)

TELA 3 — Estilo de lideranca (soma = 100%):
  Executor + Motivador + Metodico + Sistematico = 100 exatamente.

TELA 4 — Faixas DISC ideais:
  Faixa min a max independente para D, I, S, C.`;

  const user = `ESCOLA: ${input.empresa}
CARGO: ${input.cargo}
DESCRICAO DO CARGO: ${input.descricao}
ENTREGAS ESPERADAS: ${input.entregas}
VALORES DA ESCOLA: ${input.valores}
TOP 5 COMPETENCIAS SELECIONADAS: ${input.top10.join(', ')}
${input.contexto ? '\nCONTEXTO DA ESCOLA (PPP):\n' + input.contexto.substring(0, 2000) : ''}

INSTRUCAO CRITICA:
1. Leia a descricao e entregas do cargo. Identifique 3-5 SINAIS EXPLICITOS de perfil comportamental.
2. Forme uma HIPOTESE-BASE do perfil ANTES de aplicar qualquer referencia comportamental.
3. Use seu conhecimento CIS APENAS para refinar, nunca para substituir.
4. Garanta que este perfil e DIFERENTE dos outros cargos desta escola.
5. Preencha raciocinio_estruturado mostrando seus sinais e diferenciais.`;

  return _chamarAPI(_CFG.modelo || MODEL_SONNET, system, user, (body) => {
    const parsed = _extrairJSON(body.content[0].text);
    const t3 = parsed.gabarito.tela3;
    const soma = t3.executor + t3.motivador + t3.metodico + t3.sistematico;
    if (soma !== 100) throw new Error(`Tela 3: soma ${soma} ≠ 100`);
    return { erro: false, gabarito: parsed.gabarito, raciocinio: parsed.raciocinio_estruturado || null };
  });
}


// ═══════════════════════════════════════════════════════════════════════════════
// IA 3 — GERAÇÃO DE CENÁRIOS E PERGUNTAS
// ═══════════════════════════════════════════════════════════════════════════════

function rodarIA3() {
  _carregarCFG();
  // ⚠️  popularCenarios() NÃO é chamado aqui.
  // As duas operações são independentes:
  //   1. "Popular aba Cenários" — cria/atualiza as linhas base
  //   2. "Rodar IA 3"           — gera os cenários, skipando linhas já "Gerado"
  // Chamar popularCenarios() aqui limparia os cenários já gerados a cada execução.
  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const wsCen     = ss.getSheetByName('Banco_Cenarios');
  const wsCenBase = ss.getSheetByName('Cenarios Base');

  // Guard: aba vazia → pedir que rode "Popular Cenários" antes
  if (!wsCen || wsCen.getLastRow() < 5) {
    SpreadsheetApp.getUi().alert(
      '\u26a0\ufe0f Aba "Cenarios" est\u00e1 vazia ou sem dados.\n\nRode primeiro: Vertho \u2192 3. Cen\u00e1rios & Forms \u2192 Popular aba Cen\u00e1rios.'
    );
    return;
  }

  const headers = wsCen.getRange(4, 1, 1, wsCen.getLastColumn()).getValues()[0];
  const dados   = wsCen.getDataRange().getValues();
  const idx     = (l) => _idx(headers, l);

  const iStatus = headers.findIndex(h => _norm(h || '').toLowerCase().includes('status'));
  // Col 1 de Cenarios agora guarda o e-mail — usamos como ID do colaborador
  const iIdColab = 0;
  const iCompCol = (() => {
    let i = headers.findIndex(h => /compet[eê]ncia/i.test(_norm(h || '')));
    if (i < 0) i = headers.findIndex(h => _norm(h || '').toLowerCase().includes('compet'));
    return i;
  })();
  const iCtx         = headers.findIndex(h => _norm(h || '').toLowerCase().includes('contexto'));
  const iPersonagens = headers.findIndex(h => _norm(h || '').toLowerCase().includes('personagens'));
  const iSituacao    = headers.findIndex(h =>
    _norm(h || '').toLowerCase().includes('situação-gatilho') ||
    _norm(h || '').toLowerCase().includes('situacao-gatilho') ||
    _norm(h || '').toLowerCase().includes('gatilho')
  );
  const iP1 = headers.findIndex(h => _norm(h || '').toLowerCase().includes('p1'));
  const iP2 = headers.findIndex(h => _norm(h || '').toLowerCase().includes('p2'));
  const iP3 = headers.findIndex(h => _norm(h || '').toLowerCase().includes('p3'));
  const iP4        = headers.findIndex(h => _norm(h || '').toLowerCase().includes('p4'));
  const iCobertura = headers.findIndex(h => /cobertura/i.test(_norm(h || '')));

  // V2: ler de Competencias_v2
  const mapaV2 = _lerBaseCompetenciasV2(ss);
  const baseComp = Object.keys(mapaV2).map(function(cod) {
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
  const baseCenarios = _lerCenariosBase(wsCenBase);
  let processadas    = 0;

  for (let r = 4; r < dados.length; r++) {
    const statusAtual = iStatus >= 0 ? _norm(dados[r][iStatus] || '') : '';
    const temId   = dados[r][iIdColab];
    const temComp = iCompCol >= 0 && dados[r][iCompCol];
    if (!temId || !temComp) continue;
    // Skip se já gerado com P4 preenchida. Se "Gerado" mas P4 vazia, re-processa para completar.
    const p4Val = iP4 >= 0 ? _norm(String(dados[r][iP4] || '')) : 'ok';
    if ((statusAtual === 'Gerado' && p4Val !== '') || statusAtual === 'Processando...') continue;

    if (iStatus >= 0) wsCen.getRange(r + 1, iStatus + 1).setValue('Processando...');
    SpreadsheetApp.flush();

    const input = {
      colaborador: dados[r][idx('Nome\nColaborador')],
      empresa:     dados[r][idx('Empresa')],
      cargo:       dados[r][idx('Cargo')],
      perfil:      dados[r][idx('Perfil\nDominante\n(ex: Alto D, Alto I)')],
      cis_d:       Number(dados[r][idx('D\nNatural')]) || 0,
      cis_i:       Number(dados[r][idx('I\nNatural')]) || 0,
      cis_s:       Number(dados[r][idx('S\nNatural')]) || 0,
      cis_c:       Number(dados[r][idx('C\nNatural')]) || 0,
      competencia: dados[r][idx('Competência\n(ID | Nome | Tipo)')],
    };

    const compId   = input.competencia.split('|')[0].trim();
    const compTipo = input.competencia.includes('Processo') ? 'Processo' : 'Comportamental';
    const compData = baseComp.find(c => c.id === compId) || {};
    const cenBase  = compTipo === 'Processo'
      ? (baseCenarios.find(c => c.id === compId) || null)
      : null;

    const resultado = _chamarIA3(input, compData, compTipo, cenBase);

    if (resultado.erro) {
      if (iStatus >= 0) wsCen.getRange(r + 1, iStatus + 1).setValue('Erro');
      if (iCtx >= 0) wsCen.getRange(r + 1, iCtx + 1).setValue(resultado.mensagem);
      continue;
    }

    const s = resultado.scenario;
    if (iCtx >= 0)         wsCen.getRange(r + 1, iCtx + 1).setValue(s.contexto);
    if (iPersonagens >= 0) wsCen.getRange(r + 1, iPersonagens + 1).setValue(s.personagens);
    if (iSituacao >= 0)    wsCen.getRange(r + 1, iSituacao + 1).setValue(s.situacao);
    if (iP1 >= 0)          wsCen.getRange(r + 1, iP1 + 1).setValue(s.p1);
    if (iP2 >= 0)          wsCen.getRange(r + 1, iP2 + 1).setValue(s.p2);
    if (iP3 >= 0)          wsCen.getRange(r + 1, iP3 + 1).setValue(s.p3);
    if (iP4 >= 0)          wsCen.getRange(r + 1, iP4 + 1).setValue(s.p4);
    if (resultado.cobertura && iCobertura >= 0) wsCen.getRange(r + 1, iCobertura + 1).setValue(JSON.stringify(resultado.cobertura));
    if (iStatus >= 0)      wsCen.getRange(r + 1, iStatus + 1).setValue('Gerado');
    processadas++;
  }

  SpreadsheetApp.getUi().alert(
    processadas > 0
      ? `✅ ${processadas} cenário(s) gerado(s).`
      : 'Nenhuma linha com e-mail e Competência preenchidos encontrada.'
  );
}

function _chamarIA3(input, compData, compTipo, cenBase) {
  const traitos = [];
  if (input.cis_d >= 60) traitos.push('Alto D');
  if (input.cis_i >= 60) traitos.push('Alto I');
  if (input.cis_s >= 60) traitos.push('Alto S');
  if (input.cis_c >= 60) traitos.push('Alto C');
  if (input.cis_d <= 35) traitos.push('Baixo D');
  if (input.cis_i <= 35) traitos.push('Baixo I');
  if (input.cis_s <= 35) traitos.push('Baixo S');
  if (input.cis_c <= 35) traitos.push('Baixo C');

  const gapDesc = traitos.length > 0
    ? traitos.map(t => `${t}: dificuldade natural com ${(GAP_NATURAL[t] || []).join(', ')}`).join('; ')
    : 'Perfil equilibrado';

  // Descritores comportamentais da competência — usados para planejar cobertura
  const listaDescritores = (compData.descritores || '')
    .split(/[;,\n]/).map(function(d) { return d.trim(); }).filter(function(d) { return d.length > 0; });

  const coberturaBlock = listaDescritores.length > 0
    ? '\n\nDESCRITORES DA COMPETÊNCIA (' + listaDescritores.length + ' no total):\n'
      + listaDescritores.map(function(d, i) { return (i + 1) + '. ' + d; }).join('\n')
      + '\n\nETAPA 1 — MAPEIE A COBERTURA (faça isso ANTES de criar o cenário):\n'
      + '• Distribua os ' + listaDescritores.length + ' descritores pelas 4 perguntas.\n'
      + '• Primário = foco principal (a pergunta extrai evidência DIRETA desse descritor).\n'
      + '• Secundário = evidência complementar que emerge naturalmente da resposta.\n'
      + '• Regra: cada descritor deve ser PRIMÁRIO em exatamente 1 pergunta.\n'
      + '• Distribua equilibrado: ~2 primários por pergunta (mín. 1, máx. 3).\n\n'
      + 'ETAPA 2 — CRIE O CENÁRIO:\n'
      + '• O CONTEXTO e a SITUAÇÃO-GATILHO são o pano de fundo ÚNICO para todas as 4 perguntas.\n'
      + '• As 4 perguntas exploram o mesmo cenário de ângulos diferentes — não crie situações separadas.'
    : '';

  const jsonFormat = listaDescritores.length > 0
    ? '{"cobertura":[{"questao":"p1","descritores_primarios":["..."],"descritores_secundarios":["..."]},'
      + '{"questao":"p2","descritores_primarios":["..."],"descritores_secundarios":[]},'
      + '{"questao":"p3","descritores_primarios":["..."],"descritores_secundarios":[]},'
      + '{"questao":"p4","descritores_primarios":["..."],"descritores_secundarios":[]}],'
      + '"scenario":{"contexto":"...","personagens":"...","situacao":"...","p1":"...","p2":"...","p3":"...","p4":"..."}}'
    : '{"scenario":{"contexto":"...","personagens":"...","situacao":"...","p1":"...","p2":"...","p3":"...","p4":"..."}}';

  const instrucaoTipo = compTipo === 'Processo' && cenBase
    ? `TIPO: PROCESSO — Adapte o cenário-base ao contexto do colaborador.
CENÁRIO-BASE:
Contexto: ${cenBase.contexto}
Personagens: ${cenBase.personagens}
Gatilho: ${cenBase.gatilho}
P1 base: ${cenBase.p1_base}
P2 base: ${cenBase.p2_base}
P3 base: ${cenBase.p3_base}
P4 sugerida (adapte ao gap CIS do colaborador): ${cenBase.p4_base || '(crie uma pergunta que ataque diretamente o gap CIS identificado)'}`
    : `TIPO: COMPORTAMENTAL — Crie cenário 100% original.`;

  const system =
    `Você é a IA de diagnóstico da Vertho. Crie cenários que extraiam evidências reais de comportamento.

REGRAS OBRIGATÓRIAS:
• P4 É OBRIGATÓRIA — sem ela o JSON é inválido. Ela ataca o gap CIS identificado.
• P4 começa com "Quando você..." ou "Em situações onde..." — sempre uma pergunta aberta.
• Se houver TRAÇOS EXIGIDOS com GAP CRÍTICO (⚠️), a P4 DEVE atacar esse traço específico.
• Personagens com nomes brasileiros reais. Tom de conversa cotidiana.
• GAP CIS do colaborador: ${gapDesc}${coberturaBlock}

ESTRUTURA DAS DIMENSÕES:
• P1 → SITUAÇÃO: como o colaborador compreende e contextualiza o problema.
• P2 → AÇÃO: o que faria concretamente, passos específicos e rastreáveis.
• P3 → RACIOCÍNIO: como pensa diante de dilemas ou conflitos de perspectiva.
• P4 → AUTOSSENSIBILIDADE: reações internas, gaps CIS — ${gapDesc}

RETORNE APENAS JSON (sem markdown, sem comentários):
${jsonFormat}`;

  // Traços que a competência EXIGE e correlação com o perfil do colaborador
  const tracosComp = [compData.traco1, compData.traco2, compData.traco3, compData.traco4].filter(Boolean);
  const DIM_TRACO = {
    'Dominância': 'D', 'Comando': 'D', 'Objetividade': 'D', 'Assertividade': 'D', 'Ousadia': 'D',
    'Persuasão': 'I', 'Extroversão': 'I', 'Entusiasmo': 'I', 'Sociabilidade': 'I', 'Influência': 'I', 'Social': 'I',
    'Empatia': 'S', 'Paciência': 'S', 'Persistência': 'S', 'Planejamento': 'S', 'Estabilidade': 'S', 'Conformidade': 'S',
    'Organização': 'C', 'Detalhismo': 'C', 'Prudência': 'C', 'Concentração': 'C', 'Sistemático': 'C',
  };
  const SCORE_COLAB = { D: input.cis_d, I: input.cis_i, S: input.cis_s, C: input.cis_c };
  const tensoes = tracosComp.map(traco => {
    const dim = DIM_TRACO[traco];
    if (!dim) return null;
    const score = SCORE_COLAB[dim] || 0;
    const nivel = score >= 60 ? 'Alto' : score >= 40 ? 'Médio' : 'Baixo';
    const alerta = score < 40 ? ` ⚠️ GAP CRÍTICO — score ${score} (Baixo ${dim})` : score < 60 ? ` (score ${score}, desenvolver)` : ` (score ${score}, ponto forte)`;
    return `Traço "${traco}" (dim. ${dim}) → colaborador: ${nivel}${alerta}`;
  }).filter(Boolean);

  const tensaoTexto = tensoes.length
    ? `\nTRAÇOS EXIGIDOS × PERFIL DO COLABORADOR:\n${tensoes.join('\n')}`
    : '';

  const user =
    `COLABORADOR: ${input.colaborador} | EMPRESA: ${input.empresa} | CARGO: ${input.cargo}
PERFIL CIS: ${input.perfil} (D=${input.cis_d}, I=${input.cis_i}, S=${input.cis_s}, C=${input.cis_c})
GAP GERAL: ${gapDesc}${tensaoTexto}
COMPETÊNCIA: ${compData.nome || input.competencia}
DESCRIÇÃO: ${compData.descricao || ''} | ESPERADO: ${compData.esperado || ''}
${instrucaoTipo}`;

  return _chamarAPI(_CFG.modelo || MODEL_SONNET, system, user, (body) => {
    const parsed = _extrairJSON(body.content[0].text);
    if (!parsed.scenario) throw new Error('JSON sem campo "scenario"');

    // P4 ausente: gera fallback baseado no gap em vez de falhar a linha inteira
    if (!parsed.scenario.p4 || String(parsed.scenario.p4).trim() === '') {
      const gapPrincipal = traitos.length > 0
        ? (GAP_NATURAL[traitos[0]] || []).join(', ')
        : 'sua área de desenvolvimento';
      parsed.scenario.p4 = `Quando você precisa lidar com situações que exigem ${gapPrincipal}, como costuma agir? O que normalmente acontece internamente nesse momento?`;
      _addLog(`⚠️ IA3: P4 ausente para ${input.colaborador} / ${compData.nome || input.competencia} — fallback aplicado.`);
    }

    return { erro: false, scenario: parsed.scenario, cobertura: parsed.cobertura || null };
  });
}


// ═══════════════════════════════════════════════════════════════════════════════
// POPULAR CENÁRIOS  — v7: e-mail como ID do colaborador
// ═══════════════════════════════════════════════════════════════════════════════

function popularCenarios() {
  const ss       = SpreadsheetApp.getActiveSpreadsheet();
  const wsColab  = ss.getSheetByName('Colaboradores');
  const wsCargos = ss.getSheetByName('Cargos');
  const wsCen    = ss.getSheetByName('Banco_Cenarios');

  if (!wsColab || !wsCargos || !wsCen) {
    SpreadsheetApp.getUi().alert('❌ Aba não encontrada. Verifique: Colaboradores, Cargos, Cenarios.');
    return;
  }

  // V2: ler competências de Competencias_v2
  const mapaV2 = _lerBaseCompetenciasV2(ss);
  if (!mapaV2 || Object.keys(mapaV2).length === 0) {
    SpreadsheetApp.getUi().alert('❌ Aba Competencias_v2 não encontrada ou vazia.');
    return;
  }
  const baseComp = {};
  Object.keys(mapaV2).forEach(function(cod) {
    var c = mapaV2[cod];
    baseComp[cod] = { nome: c.nome, tipo: c.pilar || 'Comportamental' };
  });

  const dadosCargos   = wsCargos.getDataRange().getValues();
  const headersCargos = dadosCargos[3];
  const gCg = (l) => headersCargos.findIndex(h => _norm(h).toLowerCase().includes(l.toLowerCase()));

  const iNomeCargo = gCg('nome do cargo');
  const iEmpCargo  = gCg('empresa');
  const iTop5Col   = headersCargos.findIndex(h => _norm(h || '').toLowerCase().includes('top 5'));
  const iComp1     = headersCargos.findIndex(h => _norm(h || '').startsWith('Comp. 1'));

  const baseCargos = {};
  dadosCargos.slice(4).forEach(row => {
    const nomeCargo = _norm(row[iNomeCargo]);
    const empresa   = _norm(row[iEmpCargo]);
    if (!nomeCargo) return;

    let top5 = [];
    const top5Raw = iTop5Col >= 0 ? _norm(row[iTop5Col] || '') : '';
    if (top5Raw && !top5Raw.toLowerCase().includes('preencher') && !top5Raw.toLowerCase().includes('ia')) {
      top5 = top5Raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    }
    if (top5.length === 0 && iComp1 >= 0) {
      for (let i = 0; i < 5; i++) {
        const cell = _norm(row[iComp1 + i] || '');
        if (cell && !cell.toLowerCase().includes('ia')) {
          const id = cell.split('|')[0].trim().toUpperCase();
          if (id && id.startsWith('C')) top5.push(id);
        }
      }
    }

    baseCargos[nomeCargo] = { nomeCargo, top5, empresa };
  });

  // ── Ler Colaboradores — e-mail como identificador único ───────────────────
  const dadosColab   = wsColab.getDataRange().getValues();
  const headersColab = dadosColab[3];
  const gCl = (l) => headersColab.findIndex(h => _norm(h).toLowerCase().includes(l.toLowerCase()));

  const iEmailColab = _idxEmailColab(headersColab);
  const iNomeColab  = gCl('nome completo');
  const iCargoColab = gCl('cargo');
  const iPerfil     = gCl('perfil comportamental');
  const iD          = gCl('d natural');
  const iI          = gCl('i natural');
  const iS          = gCl('s natural');
  const iCC         = gCl('c natural');

  if (iEmailColab < 0) {
    SpreadsheetApp.getUi().alert('❌ Coluna "E-mail Corporativo" não encontrada na aba Colaboradores (linha 4).');
    return;
  }

  const cargosSemTop5 = Object.values(baseCargos)
    .filter(c => c.top5.length === 0)
    .map(c => c.nomeCargo);

  if (cargosSemTop5.length > 0) {
    const continuar = SpreadsheetApp.getUi().alert(
      '⚠️ Atenção',
      `Cargos sem Top 5:\n\n${cargosSemTop5.join('\n')}\n\nContinuar mesmo assim?`,
      SpreadsheetApp.getUi().ButtonSet.YES_NO
    );
    if (continuar !== SpreadsheetApp.getUi().Button.YES) return;
  }

  // Construir mapa email|compId → número da linha na planilha
  // Só marca como "completo" se status === 'Gerado' E contexto preenchido
  let   dadosCen   = wsCen.getDataRange().getValues();
  const iCenEmail  = 0;   // col A = email
  const iCenComp   = 10;  // col K = Competência (sem col Nº Comp)
  const iCenStatus = 11;  // col L = Status IA 3
  const iCenCtx    = 12;  // col M = Contexto

  const mapaLinhas      = {};  // email|compId → número da linha (1-based)
  const linhasCompletas = new Set();

  dadosCen.slice(4).forEach((row, idx) => {
    const email   = _norm(String(row[iCenEmail] || ''));
    const compRaw = _norm(String(row[iCenComp]  || ''));
    const compId  = compRaw.split('|')[0].trim().toUpperCase();
    if (!email || !compId) return;
    const chave      = email + '|' + compId;
    const linhaSheet = idx + 5;  // slice(4) = offset 4, +1 para 1-based
    mapaLinhas[chave] = linhaSheet;
    const status = _norm(String(row[iCenStatus] || '')).toLowerCase();
    const ctx    = _norm(String(row[iCenCtx]    || ''));
    if (status === 'gerado' && ctx) linhasCompletas.add(chave);
  });

  // ── Deletar linhas de competências removidas da seleção ──────────────────
  // Calcular quais chaves devem existir (email × top5 atual de cada cargo)
  const chavesEsperadas = new Set();
  dadosColab.slice(4).forEach(row => {
    const emailColab = _norm(row[iEmailColab] || '');
    if (!emailColab) return;
    const cargoNome  = iCargoColab >= 0 ? _norm(row[iCargoColab]) : '';
    let cargoData    = baseCargos[cargoNome] || null;
    if (!cargoData) {
      const todos = Object.values(baseCargos).filter(x => x.top5.length > 0);
      if (todos.length === 1) cargoData = todos[0];
    }
    if (!cargoData || cargoData.top5.length === 0) return;
    cargoData.top5.forEach(compId => {
      chavesEsperadas.add(emailColab + '|' + compId.toUpperCase());
    });
  });

  // Deletar do final para o início (para não deslocar índices)
  const linhasParaDeletar = [];
  dadosCen.slice(4).forEach((row, idx) => {
    const email  = _norm(String(row[iCenEmail] || ''));
    const compRaw = _norm(String(row[iCenComp] || ''));
    const compId  = compRaw.split('|')[0].trim().toUpperCase();
    if (!email || !compId) return;
    const chave = email + '|' + compId;
    if (!chavesEsperadas.has(chave)) {
      linhasParaDeletar.push(idx + 5); // linha real na planilha
    }
  });
  // Deletar de baixo para cima
  linhasParaDeletar.sort((a, b) => b - a).forEach(lr => wsCen.deleteRow(lr));
  if (linhasParaDeletar.length > 0) {
    _addLog(`🗑 Popular Cenários: ${linhasParaDeletar.length} linha(s) removida(s) (competências fora da seleção).`);
    // Re-ler dados após deleção
    dadosCen = wsCen.getDataRange().getValues();
    Object.keys(mapaLinhas).forEach(k => delete mapaLinhas[k]);
    linhasCompletas.clear();
    dadosCen.slice(4).forEach((row, idx) => {
      const email   = _norm(String(row[iCenEmail] || ''));
      const compRaw = _norm(String(row[iCenComp]  || ''));
      const compId  = compRaw.split('|')[0].trim().toUpperCase();
      if (!email || !compId) return;
      const chave      = email + '|' + compId;
      const linhaSheet = idx + 5;
      mapaLinhas[chave] = linhaSheet;
      const status = _norm(String(row[iCenStatus] || '')).toLowerCase();
      const ctx    = _norm(String(row[iCenCtx]    || ''));
      if (status === 'gerado' && ctx) linhasCompletas.add(chave);
    });
  }

  // linhaAtual começa após todas as linhas existentes
  const ultimaLinha = wsCen.getLastRow();
  let linhaAtual = Math.max(5, ultimaLinha + 1);
  let totalLinhas = 0;
  let ignoradas = 0;
  const avisos = [];

  dadosColab.slice(4).forEach(row => {
    // v7: e-mail é o identificador
    const emailColab = _norm(row[iEmailColab] || '');
    const nomeColab  = _norm(row[iNomeColab]  || '');
    if (!emailColab || !nomeColab) return;

    const cargoNome = iCargoColab >= 0 ? _norm(row[iCargoColab]) : '';
    const d = Number(row[iD]) || 0;
    const i = Number(row[iI]) || 0;
    const s = Number(row[iS]) || 0;
    const c = Number(row[iCC]) || 0;
    const perfilRaw = iPerfil >= 0 ? _norm(row[iPerfil]) : '';
    const perfil = perfilRaw || _inferirPerfil(d, i, s, c);

    let cargoData = baseCargos[cargoNome] || null;

    if (!cargoData) {
      const todos = Object.values(baseCargos).filter(x => x.top5.length > 0);
      if (todos.length === 1) {
        cargoData = todos[0];
      } else if (todos.length > 1) {
        avisos.push(`${emailColab} (${nomeColab}): cargo "${cargoNome || 'não preenchido'}" não encontrado.`);
        return;
      } else {
        avisos.push(`${emailColab} (${nomeColab}): nenhum cargo com Top 5.`);
        return;
      }
    }

    if (cargoData.top5.length === 0) {
      avisos.push(`${emailColab} (${nomeColab}): cargo sem Top 5.`);
      return;
    }

    cargoData.top5.forEach((compId, compIdx) => {
      const comp      = baseComp[compId];
      const compNome  = comp ? comp.nome : compId;
      const compTipo  = comp ? comp.tipo : 'Comportamental';
      const compTexto = `${compId} | ${compNome} | ${compTipo}`;

      const chave = emailColab + '|' + compId;

      // Se completo (Gerado + contexto preenchido): pular
      if (linhasCompletas.has(chave)) {
        ignoradas++;
        return;
      }

      // Se existe mas incompleto: atualizar in-place; senão: nova linha ao final
      const linhaEscrever = mapaLinhas[chave] || linhaAtual;
      if (!mapaLinhas[chave]) linhaAtual++;  // só avança se for linha nova

      // Col 1 = e-mail (ID do colaborador), header permanece "ID Colaborador"
      wsCen.getRange(linhaEscrever, 1, 1, 11).setValues([[
        emailColab,                          // col 1: e-mail como ID
        nomeColab,
        cargoData.empresa || '',
        cargoData.nomeCargo || '',
        '',                                  // col 5: idCargo (não mais usado)
        perfil,
        d, i, s, c,
        compTexto,
      ]]);

      totalLinhas++;
    });
  });

  let msg = '';
  if (totalLinhas > 0) msg += `✅ ${totalLinhas} linha(s) adicionada(s) ou atualizada(s).\n`;
  if (ignoradas > 0) msg += `ℹ️ ${ignoradas} linha(s) já com cenário gerado — ignoradas.\n`;
  if (avisos.length > 0) msg += `\n⚠️ Avisos:\n${avisos.join('\n')}`;
  if (msg) SpreadsheetApp.getUi().alert('📋 Popular Cenários\n\n' + msg.trim());
  return totalLinhas;
}

function _inferirPerfil(d, i, s, c) {
  const scores = [['D', d], ['I', i], ['S', s], ['C', c]];
  const altos = scores.filter(([, v]) => v >= 60).map(([t]) => `Alto ${t}`);
  return altos.length > 0 ? altos.join(', ') : 'Perfil equilibrado';
}


// ═══════════════════════════════════════════════════════════════════════════════
// GERADOR DE FORMS
// ═══════════════════════════════════════════════════════════════════════════════

function gerarForms() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('masterSpreadsheetId', ss.getId());
  _garantirAbaRespostas(ss);
  _garantirColunasEnvio(ss);

  // Limpar automaticamente triggers da arquitetura antiga (1 por form → limite 20)
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'consolidarResposta')
    .forEach(t => ScriptApp.deleteTrigger(t));

  const wsCen   = ss.getSheetByName('Banco_Cenarios');
  const headers = wsCen.getRange(4, 1, 1, wsCen.getLastColumn()).getValues()[0];
  const dados   = wsCen.getDataRange().getValues();
  const idx     = (l) => _idx(headers, l);

  const iAprovado = (() => {
    let i = headers.findIndex(h => _norm(h || '').toLowerCase().includes('ajustar'));
    if (i >= 0) return i;
    i = headers.findIndex(h => _norm(h || '').toLowerCase().includes('aprovado'));
    if (i >= 0) return i;
    return headers.findIndex(h => _norm(h || '').toLowerCase().includes('não usar'));
  })();

  if (iAprovado < 0) {
    SpreadsheetApp.getUi().alert('❌ Coluna de aprovação não encontrada na aba Cenarios.');
    return;
  }

  let iLink = headers.findIndex(h => _norm(h || '').toLowerCase().includes('link'));
  if (iLink < 0) {
    const lastCol = wsCen.getLastColumn();
    wsCen.getRange(4, lastCol + 1).setValue('Link do Form');
    iLink = lastCol;
  }

  const props = PropertiesService.getScriptProperties();

  // ── Auto-limpeza: remover triggers por form da arquitetura antiga ────────────
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'consolidarResposta')
    .forEach(t => ScriptApp.deleteTrigger(t));

  let gerados = 0;

  for (let r = 4; r < dados.length; r++) {
    const row = dados[r];
    // Col U aceita "Sim" (padrão da planilha) ou "Aprovado" (legado)
    const valAprov = _norm(row[iAprovado] || '').toLowerCase();
    if (valAprov !== 'sim' && valAprov !== 'aprovado') continue;

    const linkRaw       = row[iLink];
    const linkExistente = linkRaw ? String(linkRaw).trim() : '';
    // Aceitar links do Google Forms em qualquer formato
    const formJaExiste  = linkExistente.length > 10 && (
      linkExistente.startsWith('https://docs.google.com/forms') ||
      linkExistente.startsWith('https://forms.gle') ||
      linkExistente.startsWith('https')
    );

    // v7: col 1 de Cenarios já contém o e-mail
    const emailColab = _norm(row[0] || '');
    const nomeColab  = row[idx('Nome\nColaborador')]                           || '';
    const cargo      = row[idx('Cargo')]                                       || '';
    const empresa    = row[idx('Empresa')]                                     || '';
    const compCell   = row[idx('Competência\n(ID | Nome | Tipo)')]            || '';
    const compId     = compCell.split('|')[0].trim();
    const compNome   = compCell.split('|')[1]?.trim() || compCell;

    const contexto    = row[idx('Contexto\ndo Cenário\n(pano de fundo)')]         || '';
    const personagens = row[idx('Personagens\n(quem está envolvido)')]             || '';
    const situacao    = row[idx('Situação-Gatilho\n(o que aconteceu)')]            || '';
    const p1 = row[idx('P1 — Situação\n(contextualizar\no que aconteceu)')]        || '';
    const p2 = row[idx('P2 — Ação\n(o que fez /\nfaria concretamente)')]           || '';
    const p3 = row[idx('P3 — Raciocínio\n(por quê /\ncomo pensou)')]              || '';
    const p4 = row[idx('P4 — CIS\n(pergunta que ataca\no gap natural do perfil)')] || '';

    const primeiroNome = nomeColab.split(' ')[0] || nomeColab;

    // Pular se form já foi criado (link presente na coluna Link do Form)
    if (formJaExiste) {
      _addLog(`⏭ Form já existe para ${nomeColab} — ${compNome}: ${linkExistente}`);
      continue;
    }

    // Criar form novo
    const form = FormApp.create(`Diagnóstico — ${primeiroNome} — ${compNome}`);

    // Adicionar imagem do header como primeiro item do form
    // (DriveApp.getFileById preserva a imagem original do Drive)
    try {
      const imgBlob = DriveApp.getFileById(FORM_TEMPLATE_ID).getBlob();
      form.addImageItem()
        .setImage(imgBlob)
        .setAlignment(FormApp.Alignment.CENTER)
        .setTitle('');
    } catch(eImg) {
      _addLog('⚠️ Imagem do header não carregada: ' + eImg.message);
    }

    // Título + descrição (texto cinza abaixo do banner — boas-vindas breves)
    form.setTitle(`Diagnóstico — ${primeiroNome} — ${compNome}`);
    form.setDescription(
      `Olá, ${primeiroNome}! Este diagnóstico faz parte do seu Programa Vertho.\n` +
      `Responda com base na sua experiência real — não existe certo ou errado.\n` +
      `⏱ Tempo estimado: 8–12 min.`
    );

    // Cenário em destaque no corpo do form (negrito, visível)
    form.addSectionHeaderItem()
      .setTitle(`📍 CENÁRIO`)
      .setHelpText(
        `${contexto}\n\n` +
        `👥 Personagens: ${personagens}\n\n` +
        `⚡ O que aconteceu: ${situacao}`
      );

    form.setConfirmationMessage(
      `Obrigado, ${primeiroNome}! Suas respostas foram registradas.\n` +
      `Em breve você receberá o próximo cenário. Fique de olho no canal que você escolheu!`
    );

    const itemP1 = form.addParagraphTextItem().setTitle(p1).setRequired(true);
    const itemP2 = form.addParagraphTextItem().setTitle(p2).setRequired(true);
    const itemP3 = form.addParagraphTextItem().setTitle(p3).setRequired(true);
    const itemP4 = form.addParagraphTextItem()
      .setTitle(p4)
      .setHelpText('Seja honesto — não existe resposta certa nesta pergunta.')
      .setRequired(true);

    const itemEscala = form.addScaleItem()
      .setTitle('Como você classificaria este cenário com base no seu dia a dia?')
      .setLabels('Nada representativo', 'Extremamente representativo')
      .setBounds(1, 10)
      .setRequired(true);

    const itemPref = form.addMultipleChoiceItem()
      .setTitle('Como prefere receber o seu PDI?')
      .setHelpText('Seu Plano de Desenvolvimento Individual será enviado pelo canal que você escolher.')
      .setRequired(true);

    const paginaTelefone = form.addPageBreakItem().setTitle('📱 Número para WhatsApp');
    const itemTelefone = form.addTextItem()
      .setTitle('Qual o seu número de WhatsApp? (com DDD)')
      .setHelpText('Exemplo: 11 99999-9999')
      .setRequired(true);

    itemPref.setChoices([
      itemPref.createChoice('E-mail',   FormApp.PageNavigationType.SUBMIT),
      itemPref.createChoice('WhatsApp', paginaTelefone),
      itemPref.createChoice('Ambos',    paginaTelefone),
    ]);

    const sheetFilho = SpreadsheetApp.create(`Respostas — ${nomeColab} — ${compNome}`);
    form.setDestination(FormApp.DestinationType.SPREADSHEET, sheetFilho.getId());

    // Mover form e planilha de respostas para a pasta configurada
    try {
      const pastaForms = DriveApp.getFolderById(ID_PASTA_FORMS);
      DriveApp.getFileById(form.getId()).moveTo(pastaForms);
      DriveApp.getFileById(sheetFilho.getId()).moveTo(pastaForms);
    } catch(ePasta) {
      _addLog('⚠️ Não foi possível mover form para pasta: ' + ePasta.message);
    }

    // v7: emailColab armazenado nos metadados (é o ID do colaborador)
    props.setProperty(`form_${form.getId()}`, JSON.stringify({
      emailColab, compId, compNome, nomeColab, cargo, empresa,
      linhaSheet: r + 1,
      itemIds: {
        p1: itemP1.getId(), p2: itemP2.getId(),
        p3: itemP3.getId(), p4: itemP4.getId(),
        escala: itemEscala.getId(), prefPdi: itemPref.getId(),
        telefone: itemTelefone.getId(),
      },
    }));

    // Sem trigger por form — coleta via coletarRespostas() (trigger de tempo único)
    wsCen.getRange(r + 1, iLink + 1).setValue(form.getPublishedUrl());

    const iDataEnvio   = _getColEnvio(headers, 'Data Envio',   wsCen);
    const iNReenvios   = _getColEnvio(headers, 'Nº Reenvios',  wsCen);
    const iStatusEnvio = _getColEnvio(headers, 'Status Envio', wsCen);
    if (iStatusEnvio >= 0) wsCen.getRange(r + 1, iStatusEnvio + 1).setValue('Pendente');
    if (iNReenvios   >= 0) wsCen.getRange(r + 1, iNReenvios   + 1).setValue(0);

    gerados++;
  }

  // ── Auto-instalar trigger de coleta (1 trigger, escala ilimitada) ───────────
  const temColetor = ScriptApp.getProjectTriggers()
    .some(t => t.getHandlerFunction() === 'coletarRespostas');
  if (!temColetor) {
    ScriptApp.newTrigger('coletarRespostas').timeBased().everyMinutes(15).create();
    _addLog('🔄 Coletor de respostas instalado automaticamente (a cada 15 min).');
  }

  SpreadsheetApp.getUi().alert(
    gerados > 0
      ? `✅ ${gerados} form(s) gerado(s).\n\nPróximo passo: "📧 Configurar cadência de e-mails".`
      : 'Nenhuma linha com "Sim" na coluna de validação (col U) sem form gerado. Preencha "Sim" nas linhas desejadas.'
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// CADÊNCIA DE E-MAILS
// ═══════════════════════════════════════════════════════════════════════════════

function configurarCadenciaEmail() {
  const ui   = SpreadsheetApp.getUi();
  const resp = ui.prompt(
    '📧 Cadência de E-mails',
    'Em que hora do dia deseja enviar os e-mails? (0-23, padrão: 8)',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  let hora = parseInt(resp.getResponseText().trim(), 10);
  if (isNaN(hora) || hora < 0 || hora > 23) hora = 8;

  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'dispararEmailsDoDia')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('dispararEmailsDoDia')
    .timeBased().everyDays(1).atHour(hora).create();

  PropertiesService.getScriptProperties().setProperty('cadenciaHora', String(hora));
  _addLog(`📧 Cadência configurada: ${hora}h`);

  ui.alert(
    `✅ Cadência configurada!\n\n` +
    `E-mails serão enviados diariamente às ${hora}h.\n` +
    `• 1 form por colaborador por dia\n` +
    `• Reenvio automático após ${DIAS_REENVIO} dias sem resposta`
  );
}

function pararCadenciaEmail() {
  const removidos = ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'dispararEmailsDoDia');
  removidos.forEach(t => ScriptApp.deleteTrigger(t));
  _addLog('⏹ Cadência de e-mails pausada.');
  SpreadsheetApp.getUi().alert(
    removidos.length > 0
      ? '⏹ Cadência pausada. Nenhum novo envio será feito.'
      : 'Nenhum trigger de cadência ativo encontrado.'
  );
}

function verStatusEnvios() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const wsCen = ss.getSheetByName('Banco_Cenarios');
  if (!wsCen) { SpreadsheetApp.getUi().alert('Aba Cenarios não encontrada.'); return; }

  const headers = wsCen.getRange(4, 1, 1, wsCen.getLastColumn()).getValues()[0];
  const dados   = wsCen.getDataRange().getValues();

  const iNome        = _idx(headers, 'Nome\nColaborador');
  const iStatusEnvio = headers.findIndex(h => _norm(h || '') === 'Status Envio');
  const iDataEnvio   = headers.findIndex(h => _norm(h || '') === 'Data Envio');
  const iNReenvios   = headers.findIndex(h => _norm(h || '') === 'Nº Reenvios');

  let pendente = 0, enviado = 0, respondido = 0;
  const linhasEnviadas = [];

  dados.slice(4).forEach(row => {
    if (!row[iNome]) return;
    const st = iStatusEnvio >= 0 ? _norm(row[iStatusEnvio] || '') : '';
    if      (st === 'Pendente')    pendente++;
    else if (st === 'Enviado')   { enviado++; linhasEnviadas.push(`• ${row[iNome]} — ${row[iDataEnvio] ? Utilities.formatDate(new Date(row[iDataEnvio]), Session.getScriptTimeZone(), 'dd/MM') : '?'} (${row[iNReenvios] || 0} reenvio(s))`); }
    else if (st === 'Respondido')  respondido++;
  });

  SpreadsheetApp.getUi().alert(
    `📊 STATUS DE ENVIOS\n\n` +
    `✅ Respondido : ${respondido}\n` +
    `📤 Enviado    : ${enviado}\n` +
    `⏳ Pendente   : ${pendente}\n\n` +
    (linhasEnviadas.length > 0 ? `Aguardando:\n${linhasEnviadas.join('\n')}` : '')
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// DISPARO DIÁRIO — v7: email = idColab
// ═══════════════════════════════════════════════════════════════════════════════

function dispararEmailsDoDia() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var wsCen = ss.getSheetByName('Banco_Cenarios');
  var wsCol = ss.getSheetByName('Colaboradores');
  var wsRes = ss.getSheetByName('Respostas');
  if (!wsCen) { Logger.log('dispararEmailsDoDia: aba Banco_Cenarios não encontrada'); return; }
  if (!wsCol) { Logger.log('dispararEmailsDoDia: aba Colaboradores não encontrada'); return; }

  // ── WebApp URL ──
  var props = PropertiesService.getScriptProperties();
  var baseUrl = props.getProperty('WEBAPP_URL') || '';
  if (!baseUrl) {
    try { baseUrl = ScriptApp.getService().getUrl(); } catch(e) {}
  }
  if (!baseUrl) {
    Logger.log('dispararEmailsDoDia: WEBAPP_URL não configurada.');
    try { SpreadsheetApp.getUi().alert('WEBAPP_URL não configurada nas ScriptProperties.'); } catch(e) {}
    return;
  }

  // ── 1. Ler Colaboradores (header linha 4, dados linha 5+) ──
  var dadosCol = wsCol.getDataRange().getValues();
  var headersCol = dadosCol[3] || [];
  var _nh = function(s) { return String(s||'').toLowerCase().replace(/[\s._\-\/]+/g,'').replace(/[áàâãéèêíìóòôúùç]/g, function(c) {
    return 'aaaaeeeiiooouuc'.charAt('áàâãéèêíìóòôúùç'.indexOf(c));
  }); };
  var _fhc = function(label) {
    var ln = _nh(label);
    return headersCol.findIndex(function(h) { return _nh(h).indexOf(ln) >= 0; });
  };
  var iColEmail = _fhc('mail');
  var iColNome  = _fhc('nome');
  var iColCargo = _fhc('cargo');
  var iColFone  = headersCol.findIndex(function(h) {
    var n = _nh(h); return n.indexOf('whatsapp') >= 0 || n.indexOf('telefone') >= 0 || n.indexOf('fone') >= 0;
  });

  if (iColEmail < 0) {
    Logger.log('dispararEmailsDoDia: coluna email não encontrada em Colaboradores.');
    return;
  }

  var colaboradores = [];
  for (var r = 4; r < dadosCol.length; r++) {
    var email = String(dadosCol[r][iColEmail] || '').trim().toLowerCase();
    if (!email) continue;
    colaboradores.push({
      email: email,
      nome:  iColNome >= 0 ? String(dadosCol[r][iColNome] || '').trim() : '',
      cargo: iColCargo >= 0 ? String(dadosCol[r][iColCargo] || '').trim() : '',
      fone:  iColFone >= 0 ? String(dadosCol[r][iColFone] || '').trim() : ''
    });
  }

  // ── 2. Ler Banco_Cenarios — cenários por cargo×competência ──
  var dadosCen = wsCen.getDataRange().getValues();
  var headersCen = dadosCen[0] || [];
  var _fhb = function(label) {
    var ln = _nh(label);
    return headersCen.findIndex(function(h) { return _nh(h).indexOf(ln) >= 0; });
  };
  var iCenCargo = _fhb('cargo');
  var iCenCompId = _fhb('compid');
  var iCenCompNome = _fhb('compnome');

  // Agrupar cenários por cargo (normalizado)
  var cenariosPorCargo = {};
  for (var c = 1; c < dadosCen.length; c++) {
    var cargo = iCenCargo >= 0 ? String(dadosCen[c][iCenCargo] || '').trim().toLowerCase().replace(/[()]/g, '').replace(/\s+/g, '') : '';
    if (!cargo) continue;
    if (!cenariosPorCargo[cargo]) cenariosPorCargo[cargo] = [];
    cenariosPorCargo[cargo].push({
      compId:   iCenCompId >= 0 ? String(dadosCen[c][iCenCompId] || '').trim() : '',
      compNome: iCenCompNome >= 0 ? String(dadosCen[c][iCenCompNome] || '').trim() : ''
    });
  }

  // ── 3. Ler Respostas — quem já respondeu ──
  var jaRespondeu = {};
  if (wsRes) {
    var dadosRes = wsRes.getDataRange().getValues();
    var hdrRes = dadosRes[0] || [];
    var iResEmail = hdrRes.findIndex(function(h) { return _nh(h).indexOf('mail') >= 0; });
    var iResComp = hdrRes.findIndex(function(h) { return _nh(h).indexOf('idcompet') >= 0 || _nh(h).indexOf('competencia') >= 0; });
    if (iResEmail >= 0) {
      for (var rr = 1; rr < dadosRes.length; rr++) {
        var reEmail = String(dadosRes[rr][iResEmail] || '').trim().toLowerCase();
        var reComp = iResComp >= 0 ? String(dadosRes[rr][iResComp] || '').trim() : '';
        if (reEmail) {
          if (!jaRespondeu[reEmail]) jaRespondeu[reEmail] = {};
          if (reComp) jaRespondeu[reEmail][reComp.toLowerCase()] = true;
        }
      }
    }
  }

  // ── 4. Para cada colaborador sem avaliação → enviar email ──
  var hoje = new Date();
  var enviados = 0;
  var registros = [];
  var tz = Session.getScriptTimeZone();
  var prazo = new Date(hoje);
  prazo.setDate(prazo.getDate() + 7);
  var prazoStr = Utilities.formatDate(prazo, tz, 'dd/MM/yyyy');

  colaboradores.forEach(function(colab) {
    var cargoNorm = colab.cargo.toLowerCase().replace(/[()]/g, '').replace(/\s+/g, '');
    // Match flexível: "diretoraescolar" contém "diretora", "professora" contém "professora"
    var cenarios = cenariosPorCargo[cargoNorm] || [];
    if (!cenarios.length) {
      // Fallback: buscar cargo do banco que esteja contido no cargo do colaborador (ou vice-versa)
      var cargoKeys = Object.keys(cenariosPorCargo);
      for (var ck = 0; ck < cargoKeys.length; ck++) {
        if (cargoNorm.indexOf(cargoKeys[ck]) >= 0 || cargoKeys[ck].indexOf(cargoNorm) >= 0) {
          cenarios = cenariosPorCargo[cargoKeys[ck]];
          break;
        }
      }
    }
    if (!cenarios.length) {
      Logger.log('Sem cenários para cargo: ' + colab.cargo + ' (' + colab.email + ')');
      return;
    }

    // Verificar quais competências ainda não foram avaliadas
    var pendentes = cenarios.filter(function(cen) {
      if (!cen.compNome && !cen.compId) return false; // pular cenários sem nome
      var resps = jaRespondeu[colab.email] || {};
      return !resps[cen.compId.toLowerCase()] && !resps[cen.compNome.toLowerCase()];
    });

    // Deduplica por compId (mesmo cenário pode ter múltiplas linhas)
    var vistos = {};
    pendentes = pendentes.filter(function(p) {
      var key = p.compId || p.compNome;
      if (vistos[key]) return false;
      vistos[key] = true;
      return true;
    });

    if (!pendentes.length) {
      Logger.log('Todas competências já avaliadas: ' + colab.email);
      return;
    }

    // Montar link com email
    var link = baseUrl + '?view=diagnostico&email=' + encodeURIComponent(colab.email);
    var primeiroNome = colab.nome.split(' ')[0] || colab.nome;
    var listaComps = pendentes.map(function(p) { return p.compNome || p.compId; }).filter(Boolean).join(', ');

    // ── Enviar email ──
    try {
      MailApp.sendEmail({
        to: colab.email,
        subject: 'Sua avaliacao de competencias esta pronta - Vertho',
        htmlBody: '<div style="max-width:540px;margin:0 auto;font-family:Arial,sans-serif;color:#1C2E4A">'
          + '<h2 style="color:#0D9488">Ola, ' + primeiroNome + '!</h2>'
          + '<p>Sua avaliacao de competencias esta pronta. Voce sera avaliado(a) em <strong>'
          + pendentes.length + ' competencia(s)</strong>:</p>'
          + '<p style="background:#f0f9ff;padding:12px;border-radius:8px;border-left:4px solid #0D9488">'
          + listaComps + '</p>'
          + '<p>Responda ate <strong>' + prazoStr + '</strong>. Tempo estimado: 8-12 minutos por competencia.</p>'
          + '<p><a href="' + link + '" style="display:inline-block;padding:14px 28px;background:#0D9488;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Iniciar Avaliacao</a></p>'
          + '<p style="font-size:12px;color:#999">Vertho Mentor IA</p>'
          + '</div>'
      });
      enviados++;
      var canais = 'email';
      Logger.log('Email enviado: ' + colab.email + ' | ' + pendentes.length + ' competencias pendentes');
    } catch(mailErr) {
      Logger.log('Erro email ' + colab.email + ': ' + mailErr.message);
      var canais = 'erro';
    }

    // ── WhatsApp (se tiver telefone) ──
    if (colab.fone) {
      try {
        var msgWpp = 'Ola, ' + primeiroNome + '! Sua avaliacao Vertho esta pronta. '
          + pendentes.length + ' competencia(s) pendente(s). '
          + 'Acesse: ' + link + ' (8-12 min por competencia)';
        _enviarTextoWpp(colab.fone, msgWpp);
        canais = canais === 'email' ? 'email+whatsapp' : 'whatsapp';
        Logger.log('WhatsApp enviado: ' + colab.email);
      } catch(wppErr) {
        Logger.log('Erro WhatsApp ' + colab.email + ': ' + wppErr.message);
      }
    }

    // Registrar envio
    registros.push([
      colab.email,
      colab.nome,
      colab.cargo,
      listaComps,
      hoje,
      canais || 'email',
      'enviado'
    ]);
  });

  // ── 5. Gravar registros na aba Envios_Diagnostico ──
  if (registros.length > 0) {
    var wsEnvDiag = ss.getSheetByName('Envios_Diagnostico');
    if (!wsEnvDiag) {
      wsEnvDiag = ss.insertSheet('Envios_Diagnostico');
      wsEnvDiag.getRange(1, 1, 1, 7).setValues([['Email', 'Nome', 'Cargo', 'Competencias Pendentes', 'Data Envio', 'Canal', 'Status']])
        .setFontWeight('bold').setBackground('#0F2B54').setFontColor('#FFFFFF');
      wsEnvDiag.setFrozenRows(1);
    }
    var proxLinha = wsEnvDiag.getLastRow() + 1;
    wsEnvDiag.getRange(proxLinha, 1, registros.length, 7).setValues(registros);
  }

  Logger.log('dispararEmailsDoDia: ' + enviados + ' email(s) enviado(s).');

  try {
    SpreadsheetApp.getUi().alert(
      enviados > 0
        ? enviados + ' email(s) enviado(s) com link para avaliacao.'
        : 'Nenhum envio: todos ja foram avaliados ou sem cenarios para o cargo.'
    );
  } catch(e) {}
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSOLIDADOR DE RESPOSTAS — v7: usa emailColab do metadata
// ═══════════════════════════════════════════════════════════════════════════════

function consolidarResposta(e) {
  const formId  = e.source.getId();
  const props   = PropertiesService.getScriptProperties();
  const metaRaw = props.getProperty(`form_${formId}`);

  if (!metaRaw) { Logger.log('consolidarResposta: metadados não encontrados para form ' + formId); return; }

  const meta = JSON.parse(metaRaw);
  const ids  = meta.itemIds || {};
  const allR = e.response.getItemResponses();
  const getById = (id) => {
    if (!id) return '';
    const ir = allR.find(r => r.getItem().getId() === id);
    return ir ? ir.getResponse() : '';
  };

  const r1       = getById(ids.p1);
  const r2       = getById(ids.p2);
  const r3       = getById(ids.p3);
  const r4       = getById(ids.p4);
  const escala   = getById(ids.escala);
  const prefPdi  = getById(ids.prefPdi);
  const telefone = getById(ids.telefone);

  const masterId = props.getProperty('masterSpreadsheetId');
  if (!masterId) { Logger.log('consolidarResposta: masterSpreadsheetId não encontrado'); return; }

  const ss          = SpreadsheetApp.openById(masterId);
  const wsRespostas = _garantirAbaRespostas(ss);

  // v7: emailColab é o campo de identificação (col "ID Colaborador" = e-mail, sem coluna extra de e-mail)
  // Status IA 4 fica na col X, criada por _garantirColunasIA4 — não é populada aqui
  wsRespostas.appendRow([
    new Date(),
    meta.emailColab  || '',   // B: ID Colaborador = e-mail
    meta.nomeColab   || '',   // C
    meta.empresa     || '',   // D
    meta.cargo       || '',   // E
    meta.compId      || '',   // F
    meta.compNome    || '',   // G
    prefPdi,                  // H
    telefone,                 // I
    r1, r2, r3, r4,           // J-M
    escala,                   // N
    'Forms',                  // O
  ]);

  _marcarRespondidoNaCenarios(ss, meta.emailColab, meta.compId);
}

/**
 * v7: busca por e-mail (col 1 de Cenarios) + compId.
 */
function _marcarRespondidoNaCenarios(ss, emailColab, compId) {
  const wsCen = ss.getSheetByName('Banco_Cenarios');
  if (!wsCen) return;

  const headers = wsCen.getRange(4, 1, 1, wsCen.getLastColumn()).getValues()[0];
  const dados   = wsCen.getDataRange().getValues();

  const iCompCell    = (() => {
    let i = headers.findIndex(h => /compet[eê]ncia/i.test(_norm(h || '')));
    if (i < 0) i = headers.findIndex(h => _norm(h || '').toLowerCase().includes('compet'));
    return i;
  })();
  const iStatusEnvio = headers.findIndex(h => _norm(h || '') === 'Status Envio');
  if (iStatusEnvio < 0) return;

  for (let r = 4; r < dados.length; r++) {
    const rowEmail  = _norm(dados[r][0] || '');  // col 1 = e-mail
    const rowCompId = iCompCell >= 0 ? _norm(dados[r][iCompCell] || '').split('|')[0].trim() : '';
    if (rowEmail === emailColab && rowCompId.toUpperCase() === compId.toUpperCase()) {
      wsCen.getRange(r + 1, iStatusEnvio + 1).setValue('Respondido');
      return;
    }
  }
}

function _garantirAbaRespostas(ss) {
  let ws = ss.getSheetByName(ABA_RESPOSTAS);
  if (!ws) {
    ws = ss.insertSheet(ABA_RESPOSTAS);
    // Colunas A-O (15 colunas).
    // "ID Colaborador" = e-mail do colaborador (v7 — sem coluna extra de e-mail).
    // "Status IA 4" é criado em col X por _garantirColunasIA4 (após todas as colunas de análise).
    const cab = [
      'Timestamp', 'ID Colaborador', 'Nome Colaborador', 'Empresa', 'Cargo',
      'ID Competência', 'Nome Competência', 'Preferência PDI', 'WhatsApp (DDD + número)',
      'R1 — Situação', 'R2 — Ação', 'R3 — Raciocínio', 'R4 — CIS (gap)',
      'Representatividade (1-10)', 'Canal',
      // P-V = colunas IA4 (geradas por _garantirColunasIA4)
      // X   = Status IA 4 (gerado por _garantirColunasIA4 ao final)
    ];
    ws.getRange(1, 1, 1, cab.length).setValues([cab])
      .setBackground('#0F2B54').setFontColor('#FFFFFF').setFontWeight('bold');
    ws.setFrozenRows(1);
  }
  return ws;
}

/**
 * Garante que a aba Cenarios tenha colunas de controle de envio
 * (Link, Status Envio, Data Envio, Reenvios).
 */
function _garantirColunasEnvio(ss) {
  var ws = ss.getSheetByName('Banco_Cenarios');
  if (!ws) return;
  var headers = ws.getRange(1, 1, 1, ws.getLastColumn()).getValues()[0];
  var colsNecessarias = ['Link Diagnóstico', 'Status Envio', 'Data Envio', 'Reenvios'];
  colsNecessarias.forEach(function(col) {
    var existe = headers.some(function(h) { return h && _norm(h).toLowerCase().includes(col.toLowerCase().substring(0, 8)); });
    if (!existe) {
      var nc = ws.getLastColumn() + 1;
      ws.getRange(1, nc).setValue(col)
        .setBackground('#0F2B54').setFontColor('#FFFFFF').setFontWeight('bold');
    }
  });
}

function _enviarFormPorEmail({ emailColab, nomeColab, compNome, link, prazoStr, eReenvio, nReenvios }) {
  const primeiroNome = nomeColab.split(' ')[0] || nomeColab;
  const assunto = eReenvio
    ? `Lembrete: seu diagnóstico Vertho aguarda resposta`
    : `Seu diagnóstico Vertho está pronto — responda até ${prazoStr}`;

  const corpo =
    `Olá, ${primeiroNome}!\n\n` +
    (eReenvio ? `Este é um lembrete sobre seu diagnóstico ainda não respondido.\n\n` : `Chegou a hora do seu próximo diagnóstico Vertho!\n\n`) +
    `Prazo para responder: ${prazoStr}\n\n${link}\n\n` +
    `Tempo estimado: 8 a 12 minutos.\n\nEquipe Vertho`;

  const corpoHtml =
    `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333">` +
    `<div style="background:#0f2b54;padding:24px;border-radius:8px 8px 0 0"><h2 style="color:#fff;margin:0">Vertho — Diagnóstico de Competências</h2></div>` +
    `<div style="padding:24px;background:#f9f9f9;border-radius:0 0 8px 8px">` +
    `<p>Olá, <strong>${primeiroNome}</strong>!</p>` +
    (eReenvio ? `<p>Lembrete sobre seu diagnóstico aguardando resposta.</p>` : `<p>Chegou a hora do seu próximo diagnóstico Vertho!</p>`) +
    `<p><strong>Prazo para responder: ${prazoStr}</strong></p>` +
    `<div style="text-align:center;margin:32px 0"><a href="${link}" style="background:#0f2b54;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:bold">Acessar Diagnóstico</a></div>` +
    `<p style="font-size:13px;color:#666">Tempo estimado: 8 a 12 minutos.</p>` +
    `<hr style="border:none;border-top:1px solid #ddd;margin:20px 0">` +
    `<p style="font-size:12px;color:#999">Vertho · diagnostico@vertho.ai</p>` +
    `</div></div>`;

  try {
    GmailApp.sendEmail(emailColab, assunto, corpo, {
      from: EMAIL_REMETENTE, name: NOME_REMETENTE, htmlBody: corpoHtml, replyTo: EMAIL_REMETENTE,
    });
    return true;
  } catch (e) {
    Logger.log(`_enviarFormPorEmail: erro alias para ${emailColab}: ${e.message} — tentando fallback`);
    try {
      GmailApp.sendEmail(emailColab, assunto, corpo, { name: NOME_REMETENTE, htmlBody: corpoHtml });
      return true;
    } catch (e2) {
      Logger.log(`_enviarFormPorEmail: fallback falhou: ${e2.message}`);
      return false;
    }
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// INSTALAÇÃO DO TRIGGER
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// COLETOR DE RESPOSTAS — 1 trigger de tempo, escala para N colaboradores
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Varre TODOS os forms da aba Cenarios, lê as respostas diretamente pela API do
 * FormApp e consolida as novas na aba Respostas.
 *
 * Por que esta abordagem escala:
 *   • 1 trigger de tempo único (independe do nº de forms)
 *   • Cada execução processa todos os forms em < 6 min (limite Apps Script)
 *   • Idempotente: nunca duplica — verifica se email+compId já existe em Respostas
 *
 * Chamada por: trigger de tempo (a cada 15/30/60 min) OU manual pelo menu.
 */
function coletarRespostas() {
  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const wsCen     = ss.getSheetByName('Banco_Cenarios');
  const props     = PropertiesService.getScriptProperties();
  const masterId  = props.getProperty('masterSpreadsheetId') || ss.getId();

  if (!wsCen) { _addLog('⚠️ coletarRespostas: aba Cenarios não encontrada.'); return; }

  const headersCen = wsCen.getRange(4, 1, 1, wsCen.getLastColumn()).getValues()[0];
  const dadosCen   = wsCen.getDataRange().getValues();
  const iLink      = headersCen.findIndex(h => _norm(h || '').toLowerCase().includes('link'));
  const iStatus    = headersCen.findIndex(h => _norm(h || '').toLowerCase().includes('status envio'));
  const iEmail     = 0; // col A = email (v7)

  if (iLink < 0) { _addLog('⚠️ coletarRespostas: coluna "Link do Form" não encontrada.'); return; }

  // Construir índice de respostas já consolidadas: "email|compId" → true
  const wsRespostas = _garantirAbaRespostas(SpreadsheetApp.openById(masterId));
  const headersRes  = wsRespostas.getRange(1, 1, 1, wsRespostas.getLastColumn()).getValues()[0];
  const iResEmail   = (() => { let i = headersRes.findIndex(h => _norm(h || '') === 'ID Colaborador'); return i >= 0 ? i : headersRes.findIndex(h => _norm(h || '').toLowerCase() === 'e-mail'); })();
  const iResComp    = headersRes.findIndex(h => _norm(h || '') === 'ID Competência');
  const dadosRes    = wsRespostas.getLastRow() > 1
    ? wsRespostas.getRange(2, 1, wsRespostas.getLastRow() - 1, wsRespostas.getLastColumn()).getValues()
    : [];
  const jaConsolidado = new Set();
  dadosRes.forEach(row => {
    const em = _norm(String(row[iResEmail] || ''));
    const cp = _norm(String(row[iResComp]  || ''));
    if (em && cp) jaConsolidado.add(em + '|' + cp);
  });

  let processados = 0;
  let erros       = 0;

  for (let r = 4; r < dadosCen.length; r++) {
    const row        = dadosCen[r];
    const emailColab = _norm(String(row[iEmail] || ''));
    const link       = iLink >= 0 ? String(row[iLink] || '').trim() : '';
    const statusEnv  = iStatus >= 0 ? _norm(String(row[iStatus] || '')) : '';

    if (!emailColab || !link || !link.startsWith('https')) continue;
    if (statusEnv === 'Respondido') continue; // já processado

    // Extrair formId da URL
    const matchId = link.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (!matchId) continue;
    const formId = matchId[1];

    // Recuperar metadados salvos em ScriptProperties
    const metaRaw = props.getProperty('form_' + formId);
    if (!metaRaw) continue; // form sem metadata (não gerado por este sistema)
    const meta = JSON.parse(metaRaw);
    const chave = _norm(meta.emailColab || '') + '|' + _norm(meta.compId || '');
    if (jaConsolidado.has(chave)) continue; // já existe na aba Respostas

    // Abrir form e verificar respostas
    let form;
    try { form = FormApp.openById(formId); } catch(e) {
      _addLog('⚠️ coletarRespostas: não foi possível abrir form ' + formId + ': ' + e.message);
      erros++;
      continue;
    }

    const respostas = form.getResponses();
    if (respostas.length === 0) continue; // ninguém respondeu ainda

    // Usar a resposta mais recente (última)
    const resp    = respostas[respostas.length - 1];
    const allR    = resp.getItemResponses();
    const ids     = meta.itemIds || {};
    const getById = (id) => {
      if (!id) return '';
      const ir = allR.find(r => r.getItem().getId() === id);
      return ir ? ir.getResponse() : '';
    };

    const r1       = getById(ids.p1);
    const r2       = getById(ids.p2);
    const r3       = getById(ids.p3);
    const r4       = getById(ids.p4);
    const escala   = getById(ids.escala);
    const prefPdi  = getById(ids.prefPdi);
    const telefone = getById(ids.telefone);

    // Gravar na aba Respostas
    wsRespostas.appendRow([
      resp.getTimestamp(),
      meta.emailColab  || '',
      meta.nomeColab   || '',
      meta.empresa     || '',
      meta.cargo       || '',
      meta.compId      || '',
      meta.compNome    || '',
      prefPdi,
      telefone,
      r1, r2, r3, r4,
      escala,
      'Forms',
    ]);

    jaConsolidado.add(chave); // atualizar índice local para esta execução

    // Marcar como Respondido na aba Cenarios
    _marcarRespondidoNaCenarios(SpreadsheetApp.openById(masterId), meta.emailColab, meta.compId);
    processados++;
    _addLog('✅ Resposta coletada: ' + meta.nomeColab + ' / ' + meta.compNome);
  }

  if (processados > 0 || erros > 0) {
    _addLog('📊 coletarRespostas: ' + processados + ' nova(s) resposta(s) | ' + erros + ' erro(s).');
  }
  return processados;
}


/**
 * Instala um trigger de tempo único para coletarRespostas().
 * Intervalo recomendado: 15 a 30 minutos.
 * Substitui definitivamente a arquitetura de 1 trigger por form.
 */
function configurarColetorRespostas() {
  const ui   = SpreadsheetApp.getUi();
  const resp = ui.prompt(
    '🔄 Coletor Automático de Respostas',
    'A cada quantos minutos verificar novos formulários respondidos?\n' +
    'Valores permitidos: 1, 5, 10, 15, 30 (padrão: 15)',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  const opcoesValidas = [1, 5, 10, 15, 30];
  let minutos = parseInt(resp.getResponseText().trim(), 10);
  if (!opcoesValidas.includes(minutos)) minutos = 15;

  // Remover coletor anterior se existir
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'coletarRespostas')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('coletarRespostas')
    .timeBased().everyMinutes(minutos).create();

  PropertiesService.getScriptProperties().setProperty('coletorMinutos', String(minutos));
  _addLog('🔄 Coletor de respostas configurado: a cada ' + minutos + ' minutos.');

  ui.alert(
    '✅ Coletor automático ativado!\n\n' +
    '• Intervalo: a cada ' + minutos + ' minutos\n' +
    '• Apenas 1 trigger instalado (sem limite por nº de forms)\n' +
    '• Funciona com qualquer quantidade de colaboradores\n\n' +
    'Para coletar agora: menu → Fase 2 → Coletar respostas agora'
  );
}


/**
 * Remove o trigger do coletor automático.
 */
function pararColetorRespostas() {
  const removidos = ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'coletarRespostas');
  removidos.forEach(t => ScriptApp.deleteTrigger(t));
  _addLog('⏹ Coletor automático de respostas pausado.');
  SpreadsheetApp.getUi().alert(
    removidos.length > 0
      ? '⏹ Coletor pausado. Você pode coletar manualmente pelo menu.'
      : 'Nenhum coletor ativo encontrado.'
  );
}


/**
 * Remove TODOS os triggers de consolidarResposta (arquitetura antiga).
 * Use se vier de uma versão anterior que instalava 1 trigger por form.
 */
function limparTriggersForms() {
  const todos = ScriptApp.getProjectTriggers();
  let removidos = 0;
  todos.forEach(t => {
    if (t.getHandlerFunction() === 'consolidarResposta') {
      ScriptApp.deleteTrigger(t);
      removidos++;
    }
  });
  const restantes = ScriptApp.getProjectTriggers().length;
  _addLog('🧹 limparTriggersForms: ' + removidos + ' triggers removidos | ' + restantes + ' restantes.');
  SpreadsheetApp.getUi().alert(
    '✅ Limpeza concluída.\n\n' +
    '• Triggers de forms removidos: ' + removidos + '\n' +
    '• Triggers restantes no projeto: ' + restantes + '\n\n' +
    'Próximo passo: ative o Coletor Automático (menu → Fase 2 → Configurar coletor).'
  );
}


function instalarTriggerFormulario() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'consolidarResposta')
    .forEach(t => ScriptApp.deleteTrigger(t));

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('masterSpreadsheetId', ss.getId());
  _garantirAbaRespostas(ss);
  _garantirColunasEnvio(ss);

  SpreadsheetApp.getUi().alert(
    '✅ Configuração concluída.\n\n' +
    '• masterSpreadsheetId salvo\n' +
    '• Aba "Respostas" criada\n' +
    '• Colunas de envio verificadas\n\n' +
    'Próximos passos:\n1. Gerar Forms\n2. Configurar cadência de e-mails'
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS: LEITURA DAS BASES
// ═══════════════════════════════════════════════════════════════════════════════

function _lerBaseCompetenciasLegado(wsComp) {
  const dados   = wsComp.getDataRange().getValues();
  const headers = dados[3];
  const g = (l) => headers.findIndex(h => h && h.replace(/\s+/g, ' ').trim() === l.replace(/\s+/g, ' ').trim());

  return dados.slice(4)
    .filter(r => r[g('ID')] && String(r[g('ID')]).trim() !== '')
    .map(r => ({
      id:          r[g('ID')],
      nome:        r[g('Nome da Competência')]        || '',
      categoria:   r[g('Categoria')]                  || '',
      cargos:      r[g('Cargo Aplicável')] || r[g('Cargos Aplicável')] || '',
      descricao:   r[g('Descrição')]                  || '',
      descritores: r[g('Descritores Comportamentais')] || '',
      palavras:    r[g('Palavras-chave (separadas por vírgula)')] || '',
      gap:         r[g('BASICO')]                     || '',
      esperado:    r[g('ESPERADO')]                   || '',
      perfis_gap:  r[g('Perfis com Gap Natural (ex: Alto S, Baixo D)')] || '',
      traco1:      r[10] || '',  // col K
      traco2:      r[11] || '',  // col L
      traco3:      r[12] || '',  // col M
      traco4:      r[13] || '',  // col N
    }));
}

// ═══════════════════════════════════════════════════════════════════════
// COMPETENCIAS V2 — 12×6 com N1-N4 por descritor
// ═══════════════════════════════════════════════════════════════════════

/**
 * Lê aba Competencias_v2 (1 linha por descritor, 216 linhas total).
 * Retorna mapa de competências agrupadas por código, com descritores embarcados.
 * @param {Spreadsheet} ss
 * @returns {Object} { "DIR01": { nome, pilar, descricao, cargo, descritores: [{cod, nome_curto, completo, n1, n2, n3, n4, evidencia, pergunta_alvo}] } }
 */
function _lerBaseCompetenciasV2(ss) {
  var ws = ss.getSheetByName('Competencias_v2');
  if (!ws || ws.getLastRow() < 2) {
    Logger.log('_lerBaseCompetenciasV2: aba nao encontrada ou vazia');
    return {};
  }

  var dados = ws.getDataRange().getValues();
  var headers = dados[0];
  var _semAcento = function(s) {
    return s.toLowerCase()
      .replace(/[áàâãä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i')
      .replace(/[óòôõö]/g, 'o').replace(/[úùûü]/g, 'u').replace(/[ç]/g, 'c')
      .replace(/[^a-z0-9]/g, '');
  };
  var _h = function(label) {
    var labelNorm = _semAcento(label);
    return headers.findIndex(function(h) {
      if (!h) return false;
      return _semAcento(h.toString()).includes(labelNorm);
    });
  };

  // Mapear colunas (aceita variações: "Cód.Comp", "Cod_Comp", "Competência", etc.)
  var iCargo     = _h('cargo');
  var iPilar     = _h('pilar');
  var iCodComp   = _h('codcomp');
  var iComp      = _h('competencia');
  var iDescComp  = _h('descricao');
  var iCodDesc   = _h('coddesc');
  var iNomeCurto = _h('nomecurto');
  var iCompleto  = _h('descritorcompleto'); if (iCompleto < 0) iCompleto = _h('desccompleto');
  var iN1        = _h('n1');
  var iN2        = _h('n2');
  var iN3        = _h('n3');
  var iN4        = _h('n4');
  var iEvidencia = _h('evidencia');
  var iPergunta  = _h('pergunta');

  if (iCodComp < 0 || iCodDesc < 0) {
    Logger.log('_lerBaseCompetenciasV2: colunas obrigatorias nao encontradas (Cod_Comp, Cod_Desc)');
    return {};
  }

  var mapa = {};

  for (var r = 1; r < dados.length; r++) {
    var row = dados[r];
    var codComp = String(row[iCodComp] || '').trim().toUpperCase();
    if (!codComp) continue;

    // Criar entrada da competência se não existe
    if (!mapa[codComp]) {
      mapa[codComp] = {
        codigo:      codComp,
        nome:        iComp >= 0 ? String(row[iComp] || '').trim() : codComp,
        pilar:       iPilar >= 0 ? String(row[iPilar] || '').trim() : '',
        descricao:   iDescComp >= 0 ? String(row[iDescComp] || '').trim() : '',
        cargo:       iCargo >= 0 ? String(row[iCargo] || '').trim() : '',
        descritores: []
      };
    }

    // Adicionar descritor
    var codDesc = String(row[iCodDesc] || '').trim();
    if (!codDesc) continue;

    mapa[codComp].descritores.push({
      cod:           codDesc,
      nome_curto:    iNomeCurto >= 0 ? String(row[iNomeCurto] || '').trim() : codDesc,
      completo:      iCompleto >= 0 ? String(row[iCompleto] || '').trim() : '',
      n1:            iN1 >= 0 ? String(row[iN1] || '').trim() : '',
      n2:            iN2 >= 0 ? String(row[iN2] || '').trim() : '',
      n3:            iN3 >= 0 ? String(row[iN3] || '').trim() : '',
      n4:            iN4 >= 0 ? String(row[iN4] || '').trim() : '',
      evidencia:     iEvidencia >= 0 ? String(row[iEvidencia] || '').trim() : '',
      pergunta_alvo: iPergunta >= 0 ? String(row[iPergunta] || '').trim() : '',
    });
  }

  Logger.log('_lerBaseCompetenciasV2: ' + Object.keys(mapa).length + ' competencias carregadas');
  return mapa;
}

/**
 * Gera texto de régua de maturidade a partir dos descritores v2.
 * Substitui a régua holística da aba Regua_Maturidade.
 * @param {Object} comp  Competência do mapa v2 (com descritores[])
 * @returns {string}  Texto da régua formatada
 */
function _gerarReguaDeDescritores(comp) {
  if (!comp || !comp.descritores || comp.descritores.length === 0) return '';

  var linhas = [];
  linhas.push('COMPETENCIA: ' + comp.codigo + ' — ' + comp.nome);
  linhas.push('');

  for (var n = 1; n <= 4; n++) {
    linhas.push('=== NIVEL ' + n + ' ===');
    comp.descritores.forEach(function(d) {
      var nivelText = d['n' + n] || '(nao definido)';
      linhas.push(d.cod + ' (' + d.nome_curto + '): ' + nivelText);
    });
    linhas.push('');
  }

  return linhas.join('\n');
}

/**
 * Cria aba Competencias_v2 com headers se não existe.
 */
function _garantirAbaCompV2(ss) {
  var ws = ss.getSheetByName('Competencias_v2');
  if (ws) return ws;

  ws = ss.insertSheet('Competencias_v2');
  ws.appendRow([
    'Cargo', 'Pilar', 'Cód.Comp', 'Competência', 'Descrição',
    'Cód.Desc', 'Nome Curto', 'Descritor Completo',
    'N1–GAP', 'N2–Em Desenvolvimento', 'N3–META', 'N4–Referência',
    'Evidências Esperadas', 'Perguntas-alvo'
  ]);
  ws.getRange(1, 1, 1, 14).setFontWeight('bold').setBackground('#0f2240').setFontColor('#ffffff');
  ws.setFrozenRows(1);
  ws.setColumnWidths(1, 2, 120);
  ws.setColumnWidth(3, 80);
  ws.setColumnWidth(4, 250);
  ws.setColumnWidth(5, 300);
  ws.setColumnWidth(6, 90);
  ws.setColumnWidth(7, 200);
  ws.setColumnWidth(8, 300);
  ws.setColumnWidths(9, 4, 250);
  ws.setColumnWidth(13, 300);
  ws.setColumnWidth(14, 300);
  Logger.log('Aba Competencias_v2 criada');
  return ws;
}

function criarAbaCompV2Menu() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = _garantirAbaCompV2(ss);
  if (ws.getLastRow() > 1) {
    SpreadsheetApp.getUi().alert('Aba Competencias_v2 ja existe com ' + (ws.getLastRow() - 1) + ' linhas.');
  } else {
    SpreadsheetApp.getUi().alert('Aba Competencias_v2 criada!\n\nCole seus dados (1 linha por descritor, 216 linhas):\n\nColunas: Cargo | Pilar | Cod_Comp | Competencia | Desc_Comp | Cod_Desc | Nome_Curto | Desc_Completo | N1 | N2 | N3 | N4 | Evidencia | Pergunta_Alvo');
  }
}


function _lerCenariosBase(wsCenBase) {
  if (!wsCenBase) return [];
  const dados   = wsCenBase.getDataRange().getValues();
  const headers = dados[2];

  // Busca exata primeiro, depois parcial (tolerante a variações de header)
  const g = (l) => {
    const norm = l.replace(/\s+/g, ' ').trim().toLowerCase();
    let i = headers.findIndex(h => h && h.replace(/\s+/g, ' ').trim().toLowerCase() === norm);
    if (i >= 0) return i;
    // Fallback: match parcial pela primeira palavra-chave relevante
    const kw = norm.split(/[\s\n]/)[0];
    return headers.findIndex(h => h && h.replace(/\s+/g, ' ').trim().toLowerCase().includes(kw));
  };

  // Índices flexíveis — aceita qualquer variação do cabeçalho de P4
  const iP4 = (() => {
    const candidatos = ['Pergunta 4', 'P4', 'CIS', 'gap natural', 'gap'];
    for (const kw of candidatos) {
      const i = headers.findIndex(h => h && h.toLowerCase().includes(kw.toLowerCase()));
      if (i >= 0) return i;
    }
    return -1;
  })();

  return dados.slice(3)
    .filter(r => r[g('ID_Competência')])
    .map(r => ({
      id:          r[g('ID_Competência')],
      contexto:    r[g('Contexto do Cenário\n(pano de fundo universal)')] || '',
      personagens: r[g('Personagens\n(quem está envolvido)')] || '',
      gatilho:     r[g('Situação-Gatilho\n(o que acontece)')] || '',
      p1_base:     r[g('Pergunta 1\n(Situação — contextualizar)')] || '',
      p2_base:     r[g('Pergunta 2\n(Ação — o que faria)')] || '',
      p3_base:     r[g('Pergunta 3\n(Raciocínio — por quê)')] || '',
      p4_base:     iP4 >= 0 ? (r[iP4] || '') : '',  // P4 — pergunta CIS do gap natural
    }));
}


// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: EXTRAÇÃO DE JSON
// ═══════════════════════════════════════════════════════════════════════════════

function _extrairJSON(texto) {
  let limpo = texto.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const inicio = limpo.indexOf('{');
  if (inicio === -1) throw new Error('Nenhum JSON encontrado');

  // Brace-counting que respeita strings (ignora { } dentro de "...")
  let prof = 0, fim = -1, dentroString = false, escape = false;
  for (let i = inicio; i < limpo.length; i++) {
    var ch = limpo[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { dentroString = !dentroString; continue; }
    if (dentroString) continue;
    if (ch === '{') prof++;
    else if (ch === '}') { prof--; if (prof === 0) { fim = i; break; } }
  }
  if (fim === -1) throw new Error('JSON incompleto — chaves não fecharam (profundidade restante: ' + prof + ')');

  var jsonStr = limpo.substring(inicio, fim + 1);

  // Tentativa 1: parse direto
  try { return JSON.parse(jsonStr); } catch (e1) {
    // Tentativa 2: sanitizar controle chars, trailing commas
    var sanitizado = jsonStr
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']');
    try { return JSON.parse(sanitizado); } catch (e2) {
      // Tentativa 3: corrigir aspas duplas não escapadas dentro de valores
      // Ex: "texto": "ele disse "olá" para ela" → "ele disse \"olá\" para ela"
      var corrigido = sanitizado.replace(
        /:\s*"((?:[^"\\]|\\.)*)"/g,
        function(match) { return match; } // preserva matches válidos
      );
      // Remover newlines literais dentro de strings JSON
      corrigido = corrigido.replace(/"([^"]*)\n([^"]*)"/g, function(m, p1, p2) {
        return '"' + p1 + '\\n' + p2 + '"';
      });
      try { return JSON.parse(corrigido); } catch (e3) {
        Logger.log('_extrairJSON: TODAS as tentativas falharam. Pos erro ~' + e1.message);
        Logger.log('_extrairJSON: JSON início: ' + jsonStr.substring(0, 500));
        Logger.log('_extrairJSON: JSON fim: ' + jsonStr.substring(jsonStr.length - 500));
        throw new Error(e1.message);
      }
    }
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: CHAMADA À API — usa _getApiKey() em vez das constantes diretas
// ═══════════════════════════════════════════════════════════════════════════════

function _chamarAPI(model, system, user, parser) {
  const provedor    = _CFG.provedor || 'CLAUDE';
  const modeloFinal = (model === MODEL_HAIKU || model === MODEL_SONNET || model === MODEL_OPUS)
    ? (_CFG.modelo || model) : model;

  // Rotear para OpenAI se o modelo for GPT (independente do provedor configurado)
  if (modeloFinal && (modeloFinal.indexOf('gpt') >= 0 || modeloFinal.indexOf('o1-') >= 0 || modeloFinal.indexOf('o3-') >= 0 || modeloFinal.indexOf('o4-') >= 0)) {
    return _chamarOpenAI(modeloFinal, system, user, parser);
  }

  return provedor === 'GEMINI'
    ? _chamarGemini(modeloFinal, system, user, parser)
    : _chamarClaude(modeloFinal, system, user, parser, _CFG.thinking || false);
}

function _chamarClaude(model, system, user, parser, thinking) {
  const maxTok   = _maxTokens(model);
  const thinkMode = _CFG.thinkingMode || (thinking ? 'adaptive' : 'disabled');
  const isThinking = thinkMode !== 'disabled';
  // budget_tokens: opus max_effort usa 80% do maxTok; adaptive usa 50%
  const budget   = thinkMode === 'max_effort'
    ? Math.floor(maxTok * 0.8)
    : Math.floor(maxTok * 0.5);
  const payload  = { model, max_tokens: maxTok, system, messages: [{ role: 'user', content: user }] };
  if (isThinking) {
    if (thinkMode === 'max_effort') {
      // Opus: max_effort (raciocínio máximo) + budget_tokens para adaptive paralelo
      payload.thinking  = { type: 'enabled', budget_mode: 'max_effort', budget_tokens: budget };
    } else {
      // Sonnet: adaptive thinking com budget_tokens proporcional
      payload.thinking  = { type: 'enabled', budget_tokens: budget };
    }
    payload._useBetas   = true;
  }
  try {
    const resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      headers: Object.assign({
        'x-api-key': _getApiKey('CLAUDE'),
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      }, payload._useBetas ? { 'anthropic-beta': 'interleaved-thinking-2025-05-14' } : {}),
      payload: JSON.stringify((() => { const p = Object.assign({}, payload); delete p._useBetas; return p; })()),
      muteHttpExceptions: true,
    });
    const status = resp.getResponseCode();
    const body   = JSON.parse(resp.getContentText());
    if (status !== 200) return { erro: true, mensagem: `Erro API Claude ${status}: ${body.error?.message || 'desconhecido'}` };
    const textBlock = body.content.filter(b => b.type === 'text').pop();
    return parser({ content: [textBlock] });
  } catch (e) {
    return { erro: true, mensagem: `Exceção Claude: ${e.message}` };
  }
}

function _chamarOpenAI(model, system, user, parser) {
  const maxTok = 16384;
  const thinkingMode = _CFG.thinking || 'disabled';
  const useReasoning = thinkingMode === 'reasoning_high' && model === 'gpt-5.4';

  const payload = {
    model: model,
    max_completion_tokens: maxTok,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
  };

  if (useReasoning) {
    payload.reasoning_effort = 'high';
  } else {
    payload.temperature = 0.4;
  }
  try {
    const resp = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + _getApiKey('OPENAI'),
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    const status = resp.getResponseCode();
    const body = JSON.parse(resp.getContentText());
    if (status !== 200) return { erro: true, mensagem: `Erro API OpenAI ${status}: ${body.error?.message || 'desconhecido'}` };
    const text = body.choices[0].message.content;
    // Adaptar para formato compatível com parser Claude (body.content[0].text)
    return parser({ content: [{ type: 'text', text: text }] });
  } catch(e) {
    return { erro: true, mensagem: `Exceção OpenAI: ${e.message}` };
  }
}

function _chamarGemini(model, system, user, parser) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${_getApiKey('GEMINI')}`;
  // Gemini 3.x usa thinking_level. 'low' = rápido e suficiente para avaliação/check.
  // 'high' (padrão) pode ultrapassar o timeout de 6min do Apps Script.
  const isGemini3 = model.startsWith('gemini-3');
  const payload = {
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      maxOutputTokens: MAX_TOK,
      temperature: 0.3,
      ...(isGemini3 ? { thinkingConfig: { thinkingLevel: 'low' } } : {}),
    },
  };
  try {
    const resp = UrlFetchApp.fetch(url, {
      method: 'post', headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(payload), muteHttpExceptions: true,
    });
    const status = resp.getResponseCode();
    const body   = JSON.parse(resp.getContentText());
    if (status !== 200) return { erro: true, mensagem: `Erro Gemini ${status}: ${JSON.stringify(body.error)}` };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return parser({ content: [{ type: 'text', text }] });
  } catch (e) {
    return { erro: true, mensagem: `Exceção Gemini: ${e.message}` };
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// SELETOR DE COMPETÊNCIAS — dialog visual para selecionar a Top Workshop
// ═══════════════════════════════════════════════════════════════════════════════

function abrirSeletorComp() {
  const html = HtmlService
    .createHtmlOutputFromFile('SeletorComp')
    .setWidth(580)
    .setHeight(520)
    .setSandboxMode(HtmlService.SandboxMode.IFRAME);
  SpreadsheetApp.getUi().showModalDialog(html, '🎯 Selecionar Competências para Workshop');
}

// Chamado pelo dialog para carregar os dados
function carregarDadosSeletorComp() {
  const ss       = SpreadsheetApp.getActiveSpreadsheet();
  const wsCargos = ss.getSheetByName('Cargos');
  if (!wsCargos) throw new Error('Aba Cargos não encontrada.');

  // Carregar descrições da Competencias_v2 para exibir no seletor
  var mapaDescV2 = {};
  try {
    var v2 = _lerBaseCompetenciasV2(ss);
    if (v2) {
      Object.keys(v2).forEach(function(cod) {
        mapaDescV2[cod.toLowerCase()] = v2[cod].descricao || '';
      });
    }
  } catch(e) {}

  const headers = wsCargos.getRange(4, 1, 1, wsCargos.getLastColumn()).getValues()[0];
  const dados   = wsCargos.getDataRange().getValues();

  const _h  = (l) => headers.findIndex(h => _norm(h||'').toLowerCase().includes(l.toLowerCase()));
  const iNome  = _h('nome do cargo');
  const iEmp   = _h('empresa');
  var iArea  = _h('area');
  if (iArea < 0) iArea = _h('rea');  // fallback para "Área" com acento normalizado
  if (iArea < 0) iArea = _h('depto');  // fallback para "Depto"
  if (iArea < 0) {
    // Último fallback: col D (index 3) é tipicamente Área
    iArea = 3;
  }
  const iTop5  = _h('top 5');
  // Comp.1 a Comp.10: colunas que começam com 'Comp.'
  const iComps = headers.reduce((acc, h, i) => {
    if (_norm(h||'').match(/^comp\.\s*\d+$/i)) acc.push(i);
    return acc;
  }, []);

  const result = [];

  dados.slice(4).forEach((row, ri) => {
    const nomeCargo = _norm(String(row[iNome] || ''));
    if (!nomeCargo) return;

    // Escola: tentar Empresa/Cliente primeiro, fallback para Área/Depto
    const empresa = iEmp >= 0 ? _norm(String(row[iEmp] || '')) : '';
    const area    = iArea >= 0 ? _norm(String(row[iArea] || '')) : '';
    const escola  = empresa || area;

    // Ler Top 10 geradas pela IA1
    const comps = iComps.map(i => {
      const raw = _norm(String(row[i] || ''));
      if (!raw) return null;
      // Formato: "DIR01 | Nome da Competência | Justificativa..."
      const parts = raw.split('|');
      const id    = parts[0] ? parts[0].trim().toLowerCase() : '';
      const nome  = parts[1] ? parts[1].trim() : raw;
      // Usar descrição da Competencias_v2 ao invés da justificativa da IA1
      const descV2 = mapaDescV2[id] || '';
      const justIA = parts.slice(2).join('|').trim();
      return id ? { id, nome, just: descV2 || justIA, escola: escola } : null;
    }).filter(Boolean);

    if (comps.length === 0) return;

    // Ler seleção atual da col Top 5
    const top5Raw = iTop5 >= 0 ? _norm(String(row[iTop5] || '')) : '';
    const selecaoAtual = top5Raw
      ? top5Raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      : [];

    result.push({
      cargo:     nomeCargo + ' — ' + escola,
      cargoNome: nomeCargo,
      escola:    escola,
      rowIndex:  ri + 5,
      comps:     comps,
      selecao:   selecaoAtual,
      salvo:     selecaoAtual.length > 0,
    });
  });

  if (result.length === 0) {
    throw new Error('Nenhum cargo com Top 10 encontrada. Rode a IA 1 primeiro.');
  }
  return result;
}

// Chamado pelo dialog ao confirmar
function salvarSelecaoComp(payload) {
  const ss       = SpreadsheetApp.getActiveSpreadsheet();
  const wsCargos = ss.getSheetByName('Cargos');
  if (!wsCargos) throw new Error('Aba Cargos não encontrada.');

  const headers = wsCargos.getRange(4, 1, 1, wsCargos.getLastColumn()).getValues()[0];
  const iTop5   = headers.findIndex(h => _norm(h||'').toLowerCase().includes('top 5'));
  if (iTop5 < 0) throw new Error('Coluna "Top 5 Workshop" não encontrada.');

  payload.forEach(item => {
    const ids = item.ids.join(',');
    wsCargos.getRange(item.rowIndex, iTop5 + 1).setValue(ids);
  });

  _addLog(`✅ Seletor: ${payload.length} cargo(s) atualizados.`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIMULADOR DE RESPOSTAS — gera respostas fictícias para teste do pipeline
// ═══════════════════════════════════════════════════════════════════════════════

function simularRespostas() {
  _carregarCFG();
  _limparParada();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  _simularRespostasLote(ss, true); // true = com confirmação UI
}

/**
 * Continuação automática da simulação via trigger.
 * Roda sem UI (sem alert/prompt) — só processa lote e agenda próximo.
 */
function _continuarSimulacao() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === '_continuarSimulacao') ScriptApp.deleteTrigger(t);
  });
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('_sim_continuar') !== 'sim') return;
  props.deleteProperty('_sim_continuar');

  _carregarCFG();
  _limparParada();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  _simularRespostasLote(ss, false); // false = sem confirmação UI
}

/**
 * Core da simulação — usado tanto pelo menu (com UI) quanto pelo trigger (sem UI).
 */
function _simularRespostasLote(ss, comUI) {
  const wsBanco     = ss.getSheetByName('Banco_Cenarios');
  const wsRespostas = ss.getSheetByName(ABA_RESPOSTAS);
  const wsColab     = ss.getSheetByName('Colaboradores');

  if (!wsBanco || !wsRespostas || !wsColab) {
    if (comUI) SpreadsheetApp.getUi().alert('❌ Abas necessárias não encontradas (Banco_Cenarios, Respostas, Colaboradores).');
    return;
  }

  // ── Ler Banco_Cenarios ──
  const hBanco = wsBanco.getRange(1, 1, 1, wsBanco.getLastColumn()).getValues()[0];
  const dBanco = wsBanco.getDataRange().getValues();
  const _hb = (l) => hBanco.findIndex(h => _norm(h || '').toLowerCase().includes(l.toLowerCase()));
  const iBCargo = _hb('cargo');
  const iBEscola = _hb('escola');
  const iBCompId = _hb('comp. id') >= 0 ? _hb('comp. id') : _hb('comp id');
  const iBCompNome = _hb('comp. nome') >= 0 ? _hb('comp. nome') : _hb('comp nome');
  const iBCtx = _hb('contexto');
  const iBP1 = _hb('p1'); const iBP2 = _hb('p2'); const iBP3 = _hb('p3'); const iBP4 = _hb('p4');

  const cenarios = [];
  for (let r = 1; r < dBanco.length; r++) {
    const row = dBanco[r];
    const cargo = String(row[iBCargo] || '').trim();
    const compId = String(row[iBCompId] || '').trim();
    if (!cargo || !compId) continue;
    cenarios.push({
      cargo, escola: String(row[iBEscola] || '').trim(), compId,
      compNome: String(row[iBCompNome] || '').trim(),
      ctx: String(row[iBCtx] || ''),
      p1: String(row[iBP1] || ''), p2: String(row[iBP2] || ''),
      p3: String(row[iBP3] || ''), p4: String(row[iBP4] || '')
    });
  }

  // ── Ler Colaboradores ──
  const hColab = wsColab.getRange(4, 1, 1, wsColab.getLastColumn()).getValues()[0];
  const dColab = wsColab.getDataRange().getValues();
  const _hcol = (l) => hColab.findIndex(h => _norm(h || '').toLowerCase().includes(l.toLowerCase()));
  const iColEmail = _hcol('e-mail');
  const iColNome = _hcol('nome completo') >= 0 ? _hcol('nome completo') : _hcol('nome');
  const iColCargo = _hcol('cargo');
  const iColEscola = (() => { let i = _hcol('area'); if (i >= 0) return i; i = _hcol('depto'); if (i >= 0) return i; return _hcol('empresa'); })();

  const colaboradores = [];
  for (let r = 4; r < dColab.length; r++) {
    const row = dColab[r];
    const email = String(row[iColEmail] || '').trim().toLowerCase();
    const nome = String(row[iColNome] || '').trim();
    const cargo = String(row[iColCargo] || '').trim();
    const escola = String(row[iColEscola] || '').trim();
    if (!email || !cargo) continue;
    colaboradores.push({ email, nome, cargo, escola });
  }

  // ── Respostas existentes ──
  const hResp = wsRespostas.getRange(1, 1, 1, wsRespostas.getLastColumn()).getValues()[0];
  const _hr = (l) => hResp.findIndex(h => _norm(h || '').toLowerCase().includes(l.toLowerCase()));
  const iREmail = _hr('e-mail');
  const iRComp = _hr('id competência') >= 0 ? _hr('id competência') : _hr('id compet');
  const existentes = new Set();
  wsRespostas.getDataRange().getValues().slice(1).forEach(row => {
    const email = _norm(String(row[iREmail] || '')).toLowerCase();
    const compId = _norm(String(row[iRComp] || '')).toLowerCase();
    if (email && compId) existentes.add(`${email}|${compId}`);
  });

  // ── Perfis CIS ──
  const perfisCIS = _lerPerfisCISIA4(wsColab);

  // ── Descritores V2 (para enriquecer o simulador) ──
  const mapaV2 = _lerBaseCompetenciasV2(ss) || {};

  // ── Cruzar ──
  const _cargoMatch = (a, b) => {
    const na = a.toLowerCase().replace(/\s*(escolar|pedagogic[oa]|polivalente)\s*/g, '').trim();
    const nb = b.toLowerCase().replace(/\s*(escolar|pedagogic[oa]|polivalente)\s*/g, '').trim();
    return na === nb || na.includes(nb) || nb.includes(na);
  };
  const _escolaMatch = (a, b) => { if (!a || !b) return true; return a.toLowerCase().trim() === b.toLowerCase().trim(); };

  const pares = [];
  colaboradores.forEach(colab => {
    cenarios.forEach(cen => {
      if (!_cargoMatch(colab.cargo, cen.cargo)) return;
      if (!_escolaMatch(colab.escola, cen.escola)) return;
      const key = `${colab.email}|${cen.compId.toLowerCase()}`;
      if (existentes.has(key)) return;
      pares.push({ colab, cen });
    });
  });

  if (pares.length === 0) {
    const msg = 'Todas as respostas já foram simuladas.';
    SpreadsheetApp.getActive().toast(msg, '✅', 10);
    if (comUI) try { SpreadsheetApp.getUi().alert(msg); } catch(e) {}
    return;
  }

  if (comUI) {
    const resp = SpreadsheetApp.getUi().alert('Simular Respostas',
      pares.length + ' respostas para gerar.\n\nContinuar?', SpreadsheetApp.getUi().ButtonSet.YES_NO);
    if (resp !== SpreadsheetApp.getUi().Button.YES) return;
  }

  // ── Distribuição: 40% ruim, 40% médio, 20% bom ──
  const NIVEIS = ['ruim','ruim','ruim','ruim','medio','medio','medio','medio','bom','bom'];
  let gerados = 0, erros = 0;
  let nivelIdx = Math.floor(Math.random() * NIVEIS.length);
  const MAX_POR_LOTE = 3;

  for (let i = 0; i < Math.min(pares.length, MAX_POR_LOTE); i++) {
    if (_deveParar()) { _limparParada(); break; }
    const par = pares[i];
    const nivel = NIVEIS[nivelIdx % NIVEIS.length];
    nivelIdx++;

    const cisData = perfisCIS[par.colab.email] || {};
    const discStr = `D=${cisData.d||0} I=${cisData.i||0} S=${cisData.s||0} C=${cisData.c||0}`;

    SpreadsheetApp.getActive().toast(
      `[${Config.modelLabel(_CFG.modelo||'')}] ${par.colab.nome} — ${par.cen.compNome} [${nivel}]\n(${i+1}/${Math.min(pares.length, MAX_POR_LOTE)})`,
      '🎭 Simulando', 15);

    try {
      // Buscar descritores V2 da competência
      var descV2 = [];
      var compKey = par.cen.compId.toUpperCase();
      if (mapaV2[compKey] && mapaV2[compKey].descritores) descV2 = mapaV2[compKey].descritores;

      const resultado = _gerarRespostaSimulada({
        nome: par.colab.nome, cargo: par.colab.cargo, empresa: par.colab.escola,
        comp: par.cen.compId + ' | ' + par.cen.compNome,
        perfil: '', cis: discStr, tracos: cisData.tracos || [],
        ctx: par.cen.ctx, pers: '', gat: '',
        p1: par.cen.p1, p2: par.cen.p2, p3: par.cen.p3, p4: par.cen.p4,
        nivel: nivel,
        descritoresV2: descV2
      });
      if (resultado.erro) { erros++; continue; }

      const novaLinha = new Array(hResp.length).fill('');
      const _set = (label, val) => { const idx = _hr(label); if (idx >= 0) novaLinha[idx] = val; };
      _set('timestamp', new Date().toISOString());
      _set('e-mail', par.colab.email);
      _set('nome colaborador', par.colab.nome);
      _set('empresa', par.colab.escola);
      _set('cargo', par.colab.cargo);
      _set('id competência', par.cen.compId);
      _set('nome competência', par.cen.compNome);
      _set('preferência pdi', 'E-mail');
      _set('representatividade', Math.floor(Math.random() * 4) + (nivel === 'ruim' ? 3 : nivel === 'medio' ? 6 : 8));
      _set('r1', resultado.r1);
      _set('r2', resultado.r2);
      _set('r3', resultado.r3);
      _set('r4', resultado.r4);

      wsRespostas.appendRow(novaLinha);
      existentes.add(`${par.colab.email}|${par.cen.compId.toLowerCase()}`);
      gerados++;
      SpreadsheetApp.flush();
    } catch(e) {
      Logger.log('❌ Simulador erro: ' + par.colab.nome + ' — ' + e.message);
      erros++;
    }
    if (i < MAX_POR_LOTE - 1) Utilities.sleep(2000);
  }

  const restantes = pares.length - Math.min(pares.length, MAX_POR_LOTE);
  let msgFinal = `🎭 Simulador — Lote concluído\n\n✅ Geradas: ${gerados} | ❌ Erros: ${erros}`;

  if (restantes > 0) {
    msgFinal += `\n⏳ Restam ${restantes}. Continuando automaticamente...`;
    PropertiesService.getScriptProperties().setProperty('_sim_continuar', 'sim');
    ScriptApp.newTrigger('_continuarSimulacao').timeBased().after(10 * 1000).create();
  } else {
    msgFinal += '\n\n✅ Todas as respostas simuladas!';
  }
  msgFinal += '\n\nDistribuição: ~40% ruim | ~40% médio | ~20% bom';
  SpreadsheetApp.getActive().toast(msgFinal, '🎭 Simulador', 10);
  if (comUI && restantes <= 0) try { SpreadsheetApp.getUi().alert(msgFinal); } catch(e) {}
}

function _gerarRespostaSimulada(inp) {
  // Mapear nível a comportamento + nível da régua
  const nivelMap = {
    ruim: {
      desc: 'um colaborador com dificuldades reais: respostas vagas, sem exemplos concretos, confundindo situacao com opiniao, sem autocritica, minimizando o problema',
      regua: 'N1 (Emergente)',
      instrucao: 'Responda como quem NAO domina a competencia. Foque em acoes genericas ("eu conversaria", "buscaria resolver"). NAO cite dados, NAO proponha sequencias, NAO demonstre sistematicidade.'
    },
    medio: {
      desc: 'um colaborador em desenvolvimento: respostas parcialmente estruturadas, com algum exemplo concreto mas sem profundidade, reconhece o problema mas sem acao clara ou sustentavel',
      regua: 'N2 (Em Desenvolvimento)',
      instrucao: 'Responda como quem RECONHECE o problema mas age de forma INCONSISTENTE. Cite 1-2 acoes concretas mas sem metodo. Demonstre intencao sem estrutura. Misture boas ideias com execucao fragil.'
    },
    bom: {
      desc: 'um colaborador que demonstra dominio: resposta estruturada, exemplo especifico e real, raciocinio claro sobre causa e impacto, autocritica genuina',
      regua: 'N3-N4 (Proficiente/Referencia)',
      instrucao: 'Responda como quem DOMINA a competencia. Cite acoes concretas e sequenciadas. Demonstre criterio na escolha. Mencione acompanhamento e ajuste. Use linguagem que mostra sistematicidade.'
    }
  };
  const niv = nivelMap[inp.nivel] || nivelMap.medio;

  // Montar bloco de descritores V2 se disponível
  var descritoresBloco = '';
  if (inp.descritoresV2 && inp.descritoresV2.length > 0) {
    var linhas = inp.descritoresV2.map(function(d, i) {
      var nivelAlvo = inp.nivel === 'ruim' ? d.n1 : inp.nivel === 'medio' ? d.n2 : d.n3;
      return (i + 1) + '. ' + (d.nome_curto || d.cod) + '\n'
        + '   Nivel alvo (' + niv.regua + '): ' + (nivelAlvo || '')
        + (d.evidencia ? '\n   Evidencia esperada: ' + d.evidencia : '');
    });
    descritoresBloco = '\nDESCRITORES DA COMPETENCIA (calibre a resposta por estes):\n' + linhas.join('\n');
  }

  const system =
    `Voce e um simulador de respostas para assessment comportamental.
Gere as 4 respostas de um colaborador respondendo perguntas do seu formulario de avaliacao.

PERFIL DO COLABORADOR A SIMULAR:
${niv.desc}

INSTRUCAO DE CALIBRACAO:
${niv.instrucao}

REGRAS:
- Escreva SEMPRE em 1a pessoa, linguagem natural e informal, como alguem respondendo de verdade
- Use o perfil CIS para dar "sotaque": Alto D = direto e impaciente; Alto I = entusiasta e disperso; Alto S = hesitante e conciliador; Alto C = detalhista e rigido
- Cada resposta deve ter entre 80-200 palavras (como alguem digitando no celular)
- NAO use jargao pedagogico perfeito se o nivel e ruim/medio
- NAO faca todas as respostas no mesmo tom — varie entre mais e menos elaboradas
- As respostas devem ser CONSISTENTES com o nivel simulado em TODOS os descritores
${descritoresBloco}

Retorne APENAS JSON valido:
{"r1": "resposta P1", "r2": "resposta P2", "r3": "resposta P3", "r4": "resposta P4"}`;

  const user =
    `COLABORADOR: ${inp.nome} | CARGO: ${inp.cargo} | ESCOLA: ${inp.empresa}
COMPETENCIA AVALIADA: ${inp.comp}
PERFIL CIS: ${inp.cis}
NIVEL A SIMULAR: ${inp.nivel.toUpperCase()} (${niv.regua})

CENARIO:
${inp.ctx}

PERGUNTAS:
P1: ${inp.p1}
P2: ${inp.p2}
P3: ${inp.p3}
P4: ${inp.p4}`;

  return _chamarAPI(_CFG.modelo || MODEL_SONNET, system, user, (body) => {
    const parsed = _extrairJSON(body.content[0].text);
    return {
      erro: false,
      r1: parsed.r1 || '',
      r2: parsed.r2 || '',
      r3: parsed.r3 || '',
      r4: parsed.r4 || '',
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHECK IA — VALIDAÇÃO AUTOMÁTICA DE CENÁRIOS E PERGUNTAS (Gemini 3.1 Pro)
// ═══════════════════════════════════════════════════════════════════════════════

function checkCenarios() {
  _carregarCFG();
  _limparParada();
  const ss    = SpreadsheetApp.getActiveSpreadsheet();

  // Tentar Banco_Cenarios (novo) primeiro, fallback para Cenarios (legado)
  var wsCen = ss.getSheetByName('Banco_Cenarios');
  var isBanco = !!wsCen;
  if (!wsCen) wsCen = ss.getSheetByName('Banco_Cenarios');
  if (!wsCen) { SpreadsheetApp.getUi().alert('Aba Banco_Cenarios ou Cenarios nao encontrada.'); return; }

  const headerRow = isBanco ? 1 : 4;
  const dataStart = isBanco ? 1 : 4;  // 0-indexed para dados[]
  const headers = wsCen.getRange(headerRow, 1, 1, wsCen.getLastColumn()).getValues()[0];
  const dados   = wsCen.getDataRange().getValues();
  const _h = (label) => headers.findIndex(h => _norm(h||'').toLowerCase().includes(label.toLowerCase()));

  const iCargo  = _h('cargo');
  const iEscola = _h('escola');
  const iComp   = _h('competencia') >= 0 ? _h('competencia') : _h('competência');
  const iCtx    = _h('contexto');
  const iPers   = _h('personagens');
  const iGat    = _h('situacao') >= 0 ? _h('situacao') : _h('situação');
  const iP1     = _h('p1');
  const iP2     = _h('p2');
  const iP3     = _h('p3');
  const iP4     = _h('p4');
  const iDescr  = _h('descritores') >= 0 ? _h('descritores') : _h('cobertura');

  // Colunas de output
  const _garantirCol = (label, bg) => {
    let idx = headers.findIndex(h => _norm(h||'').toLowerCase().includes(label.toLowerCase()));
    if (idx < 0) {
      const nc = wsCen.getLastColumn();
      wsCen.getRange(headerRow, nc+1).setValue(
        label.includes('nota') ? 'Nota Check' :
        label.includes('status') ? 'Status Check' :
        label.includes('justif') ? 'Justificativa Check' : 'Sugestao Check'
      ).setBackground(bg).setFontColor('#FFFFFF').setFontWeight('bold');
      SpreadsheetApp.flush();
      idx = nc;
    }
    return idx;
  };

  const iNota  = _garantirCol('nota check',        '#0F2B54');
  const iCheck = _garantirCol('status check',      '#0F2B54');
  const iJust  = _garantirCol('justificativa check','#0F2B54');
  const iSug   = _garantirCol('sugestao check',    '#1A56DB');

  // Buscar PPP por escola (cache)
  var pppCache = {};

  const THRESHOLD = 90;
  var modeloCheck = _CFG.f3Validacao || _CFG.modelo || MODEL_GEMINI_PRO;
  let avaliados = 0, aprovados = 0, revisar = 0, pulados = 0;

  for (let r = dataStart; r < dados.length; r++) {
    const row = dados[r];
    var cargo = iCargo >= 0 ? String(row[iCargo]||'').trim() : '';
    var comp  = iComp  >= 0 ? String(row[iComp] ||'').trim() : '';
    if (!cargo && !comp) continue;

    // Pular já avaliados
    const notaExist = (iNota >= 0 && row[iNota]) ? String(row[iNota]).trim() : '';
    if (notaExist && notaExist !== '0' && notaExist !== 'Erro') { pulados++; continue; }

    if (_deveParar()) { _limparParada(); break; }

    var escola = iEscola >= 0 ? String(row[iEscola]||'').trim() : '';

    SpreadsheetApp.getActive().toast(
      '[' + Config.modelLabel(modeloCheck) + ']\n' + cargo + ' x ' + escola + ' x ' + comp,
      'Check IA: ' + (avaliados+1), 5
    );

    // PPP da escola (com cache)
    if (!pppCache[escola] && escola) {
      try { pppCache[escola] = formatarContextoPPP(buscarPPPEscola(ss, escola) || '') || ''; } catch(e) { pppCache[escola] = ''; }
    }

    const resultado = _checkUmCenario({
      cargo:  cargo,
      escola: escola,
      comp:   comp,
      ctx:    iCtx  >= 0 ? String(row[iCtx] ||'') : '',
      pers:   iPers >= 0 ? String(row[iPers]||'') : '',
      gat:    iGat  >= 0 ? String(row[iGat] ||'') : '',
      p1:     iP1   >= 0 ? String(row[iP1]  ||'') : '',
      p2:     iP2   >= 0 ? String(row[iP2]  ||'') : '',
      p3:     iP3   >= 0 ? String(row[iP3]  ||'') : '',
      p4:     iP4   >= 0 ? String(row[iP4]  ||'') : '',
      descritores: iDescr >= 0 ? String(row[iDescr]||'') : '',
      ppp:    pppCache[escola] || '',
    });

    if (resultado.erro) {
      wsCen.getRange(r+1, iNota+1).setValue('Erro');
      wsCen.getRange(r+1, iCheck+1).setValue('Erro');
      wsCen.getRange(r+1, iJust+1).setValue(resultado.mensagem);
      _addLog('Check IA erro L' + (r+1) + ': ' + resultado.mensagem);
      continue;
    }

    const nota   = resultado.nota;
    const status = nota >= THRESHOLD ? 'Aprovado' : 'Revisar';
    const bg     = nota >= THRESHOLD ? '#D4EDDA' : '#FFF3CD';

    wsCen.getRange(r+1, iNota+1).setValue(nota).setBackground(bg);
    wsCen.getRange(r+1, iCheck+1).setValue(status).setBackground(bg);
    wsCen.getRange(r+1, iJust+1).setValue(resultado.justificativa);
    if (iSug >= 0) wsCen.getRange(r+1, iSug+1).setValue(resultado.sugestao||'');

    avaliados++;
    if (status === 'Aprovado') aprovados++; else revisar++;
    SpreadsheetApp.flush();
    if (r < dados.length - 1) Utilities.sleep(2000);
  }

  SpreadsheetApp.getUi().alert(
    'Check IA — Concluido\n\n' +
    'Aprovados (>=' + THRESHOLD + '): ' + aprovados + '\n' +
    'Revisar (<' + THRESHOLD + '): ' + revisar + '\n' +
    'Ja avaliados (pulados): ' + pulados + '\n' +
    'Total avaliados agora: ' + avaliados
  );
}

function _checkUmCenario(inp) {
  const system =
    `Voce e um avaliador especialista em Assessment Comportamental para o contexto educacional brasileiro.
Avalie o cenario e as perguntas com base em 5 dimensoes (20pts cada, total 100):

1. ADERENCIA A COMPETENCIA (20pts): O cenario e perguntas avaliam a competencia indicada? Os descritores sao cobertos?
2. REALISMO CONTEXTUAL (20pts): Contexto e personagens sao criveis para o cargo/escola? Usa vocabulario do PPP?
3. CONTENCAO (20pts): Contexto tem max ~900 chars? Max 2 tensoes? Max 2 stakeholders com nome? Cada pergunta max ~200 chars?
4. FORCA DE DECISAO (20pts): P1 forca ESCOLHA? P2 pede COMO com obstaculo? P3 aborda tensao humana? P4 pede acompanhamento? Nenhuma pergunta permite resposta vaga tipo "como voce lidaria"?
5. PODER DISCRIMINANTE (20pts): Resposta N2 seria visivelmente diferente de N3? Nao e possivel dar boa resposta ignorando o complicador?

ERROS GRAVES — qualquer um forca nota max 60 e "Revisar":
- Pergunta fechada (sim/nao)
- Cenario com 4+ tensoes simultaneas (overdense)
- Contexto com 5+ stakeholders nomeados
- Pergunta que permite resposta generica sem escolha
- Competencia avaliada nao e a indicada

REGRAS DE QUALIDADE ADICIONAIS:
- Max 3/9 cenarios por escola podem comecar com "Voce esta conduzindo/revisando"
- Se cenario e de Professor, verificar se tem pressao EM SALA (nao so de coordenacao)
- Verificar se nomes de personagens sao unicos (nao repetir entre cenarios)
- Verificar se dilema etico emerge naturalmente da situacao

Seja rigoroso. Nota >= 90 = aprovado. Nota < 90 = revisar com sugestao concreta.

Retorne APENAS JSON valido:
{"nota":85,"erro_grave":false,"dimensoes":{"aderencia":18,"realismo":19,"contencao":16,"decisao":17,"discriminante":15},"justificativa":"O que esta bom e o que precisa melhorar.","sugestao":"Versao reescrita do elemento mais fraco. Vazio se aprovado.","alertas":["nome X repetido","abertura repetida"]}`;

  const user =
    `CARGO: ${inp.cargo} | ESCOLA: ${inp.escola || ''}
COMPETENCIA: ${inp.comp}

CENARIO:
Contexto: ${inp.ctx}
${inp.pers ? 'Personagens: ' + inp.pers : ''}
${inp.gat ? 'Situacao-Gatilho: ' + inp.gat : ''}

PERGUNTAS:
P1: ${inp.p1}
P2: ${inp.p2}
P3: ${inp.p3}
P4: ${inp.p4}

DESCRITORES DA COMPETENCIA:
${inp.descritores || '(nao informados)'}

CONTEXTO DO PPP:
${(inp.ppp || '').substring(0, 500)}`;

  // Usar modelo de validação > modelo principal > Gemini
  var modeloCheck = _CFG.f3Validacao || _CFG.modelo || MODEL_GEMINI_PRO;
  return _chamarAPI(modeloCheck, system, user, (body) => {
    const parsed = _extrairJSON(body.content[0].text);
    // Erro grave: forçar nota <= 60 independente do calculado
    let nota = Number(parsed.nota) || 0;
    if (parsed.erro_grave === true && nota > 60) nota = 60;
    return {
      erro:          false,
      nota:          nota,
      erroGrave:     parsed.erro_grave === true,
      justificativa: parsed.justificativa || '',
      sugestao:      (parsed.sugestao || '').trim(),
      dimensoes:     parsed.dimensoes || {},
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// IA 4 — AVALIAÇÃO DAS RESPOSTAS
// ═══════════════════════════════════════════════════════════════════════════════

function rodarIA4() {
  _carregarCFG();
  _limparParada();
  const ss          = SpreadsheetApp.getActiveSpreadsheet();
  const wsRespostas = ss.getSheetByName(ABA_RESPOSTAS);
  const wsColab     = ss.getSheetByName('Colaboradores');

  if (!wsRespostas) { SpreadsheetApp.getUi().alert('❌ Aba "Respostas" não encontrada.'); return; }

  _garantirColunasIA4(wsRespostas);

  const DB        = _carregarBasesIA4(ss);
  // v7: _lerPerfisCISIA4 indexa por e-mail
  const perfisCIS = _lerPerfisCISIA4(wsColab);

  const headers = wsRespostas.getRange(1, 1, 1, wsRespostas.getLastColumn()).getValues()[0];
  const dados   = wsRespostas.getDataRange().getValues();

  const iIdColab   = (() => { let i = headers.findIndex(h => _norm(h) === 'ID Colaborador'); return i >= 0 ? i : headers.findIndex(h => _norm(h).toLowerCase() === 'e-mail'); })();
  const iNomeColab = headers.findIndex(h => _norm(h) === 'Nome Colaborador');
  const iEmpresa   = headers.findIndex(h => _norm(h) === 'Empresa');
  const iCargo     = headers.findIndex(h => _norm(h) === 'Cargo');
  const iIdComp    = headers.findIndex(h => _norm(h) === 'ID Competência');
  const iNomeComp  = headers.findIndex(h => _norm(h) === 'Nome Competência');
  const iR1        = headers.findIndex(h => _norm(h).includes('R1'));
  const iR2        = headers.findIndex(h => _norm(h).includes('R2'));
  const iR3        = headers.findIndex(h => _norm(h).includes('R3'));
  const iR4        = headers.findIndex(h => _norm(h).includes('R4'));
  const iEscala    = headers.findIndex(h => _norm(h).includes('Representatividade'));
  const iPrefPdi   = headers.findIndex(h => _norm(h) === 'Preferência PDI');
  const iNivel     = (() => {
    let i = headers.findIndex(h => _norm(h) === 'Nível IA4');
    if (i >= 0) return i;
    return headers.findIndex(h => _norm(h).toLowerCase().replace(/[^a-z0-9 ]/g,'').includes('nivel ia'));
  })();
  const iNota      = headers.findIndex(h => _norm(h) === 'Nota IA4');
  const iFortes    = headers.findIndex(h => _norm(h) === 'Pontos Fortes');
  const iAtencao   = headers.findIndex(h => _norm(h) === 'Pontos de Atenção');
  const iFeedback  = headers.findIndex(h => _norm(h) === 'Feedback IA4');
  const iLinks     = headers.findIndex(h => _norm(h) === 'Links Academia');
  const iPayload   = headers.findIndex(h => _norm(h) === 'Payload IA4');
  const iValStatus = headers.findIndex(h => _norm(h) === 'Valores Status');
  const iValPayload= headers.findIndex(h => _norm(h) === 'Valores Payload');
  // Busca 'Status IA 4' — usa a PRIMEIRA ocorrência (evita pegar duplicata criada erroneamente)
  const iStatus    = (() => {
    const exact = headers.findIndex(h => _norm(h) === 'Status IA 4');
    if (exact >= 0) return exact;
    // Fallback: qualquer coluna que contenha 'status' e 'ia'
    return headers.findIndex(h => {
      const n = _norm(h).toLowerCase();
      return n.includes('status') && (n.includes('ia') || n.includes('avalia'));
    });
  })();

  let processados = 0, erros = 0;
  SpreadsheetApp.getActive().toast('[' + Config.modelLabel(_CFG.modelo) + ']\nIniciando avaliação com IA...', '⏳ IA 4 Vertho', 5);

  for (let r = 1; r < dados.length; r++) {
    const row = dados[r];
    if (!row[iNomeColab] || !row[iNomeComp]) continue;

    // Ler status DIRETAMENTE da célula (não do cache do getValues) para garantir valor atual
    const statusCell  = iStatus >= 0
      ? String(wsRespostas.getRange(r + 1, iStatus + 1).getValue() || '').trim()
      : '';
    const statusArray = iStatus >= 0 ? String(row[iStatus] || '').trim() : '';
    // Usar o maior dos dois (célula tem prioridade sobre array em cache)
    const statusAtual = statusCell || statusArray;
    const _st = statusAtual.toLowerCase();

    if (_deveParar()) { _limparParada(); break; }
    _addLog(`IA4 L${r+1}: ${_norm(String(row[iNomeColab]||''))} | status="${statusAtual}"`);

    // Pular qualquer variação de avaliado/PDF
    if (_st === 'avaliado' || _st === 'processando...' || _st === 'pdf enviado' ||
        _st === 'pdf gerado' || _st === 'erro pdf' || _st.startsWith('erro pdf')) {
      _addLog(`⏭ IA4 skip: ${_norm(String(row[iNomeColab]||''))} — ${_norm(String(row[iNomeComp]||''))} [${statusAtual}]`);
      continue;
    }

    // v7: idColab é o e-mail (col "ID Colaborador")
    const emailColab = _norm(String(row[iIdColab] || ''));
    const nome       = _norm(String(row[iNomeColab] || ''));
    const cargo      = _norm(String(row[iCargo]     || ''));
    let   compNome   = _norm(String(row[iNomeComp]  || ''));
    const compId     = _norm(String(row[iIdComp]    || ''));
    const prefPdi    = iPrefPdi >= 0 ? _norm(String(row[iPrefPdi] || 'E-mail')) : 'E-mail';

    // V2: Carregar dados da competência de Competencias_v2 (via DB já carregado)
    let compData4 = null;
    {
      const idBusca = (compId || compNome || '').toUpperCase();
      if (idBusca && DB.competenciasV2) {
        // Buscar por código direto
        compData4 = DB.competenciasV2[idBusca] || null;
        // Fallback: buscar por nome
        if (!compData4) {
          const nomeNorm = idBusca.toLowerCase();
          const keys = Object.keys(DB.competenciasV2);
          for (let k = 0; k < keys.length; k++) {
            const c = DB.competenciasV2[keys[k]];
            if (c.nome && c.nome.toLowerCase().trim() === nomeNorm) { compData4 = c; break; }
          }
        }
        if (compData4 && (!compNome || /^[A-Za-z]{2,4}\d{2,4}$/.test(compNome))) {
          compNome = compData4.nome;
        }
      }
    }

    const chaveCompleta = _ia4Chave(`${cargo}_${compNome}`);
    const chaveSoComp   = _ia4Chave(compNome);
    const objRegua      = DB.reguas[chaveCompleta] || DB.reguas[chaveSoComp];
    const acadObj       = DB.academia[chaveCompleta] || DB.academia[chaveSoComp]
                       || DB.academia[_ia4Chave(`${cargo}_${compId}`)] || DB.academia[_ia4Chave(compId)] || null;

    if (!objRegua) {
      const msg = `ERRO: Régua não encontrada para "${compNome}" (cargo: "${cargo}")`;
      if (iStatus >= 0) wsRespostas.getRange(r + 1, iStatus + 1).setValue(msg);
      Logger.log(msg);
      erros++;
      continue;
    }

    // v7: lookup por e-mail
    const perfilCIS = perfisCIS[emailColab] || {};

    // CIS filtrado: interpretações textuais dos traços dominantes
    let cisFiltradoTexto = '';
    let cisRiscosTexto = '';
    try {
      var cisData = getCISParaPDI(perfilCIS);
      if (cisData) cisFiltradoTexto = formatarCISParaPrompt(cisData, perfilCIS);
      var riscos = getCISRiscos(perfilCIS);
      if (riscos && riscos.length > 0) cisRiscosTexto = riscos.join('\n');
    } catch(e) { Logger.log('CIS filtrado erro (nao-bloqueante): ' + e.message); }

    // PPP da escola
    const escolaColab = iEmpresa >= 0 ? String(row[iEmpresa] || '') : '';
    let contextoPPPTexto = '';
    try {
      var pppRaw = buscarPPPEscola(ss, escolaColab);
      if (pppRaw) contextoPPPTexto = formatarContextoPPP(pppRaw);
    } catch(e) { Logger.log('PPP erro (nao-bloqueante): ' + e.message); }

    // v2 — Modelo Temático + Perfil CIS Completo
    const bancoDados      = _bancoBuscarCobertura(ss, cargo, compId, escolaColab);
    const ia4CenarioText  = bancoDados ? bancoDados.contexto : '(cenario nao disponivel)';
    const ia4CoberturaText= bancoDados ? _formatarCoberturaIA4(bancoDados.cobertura) : '(mapeamento nao disponivel)';
    // V2: descritores vêm como array de objetos do Competencias_v2
    const ia4DescList     = compData4 && compData4.descritores && Array.isArray(compData4.descritores)
      ? compData4.descritores.map(function(d, idx) {
          return (idx + 1) + '. ' + (d.nome_curto || d.cod) + ': ' + (d.completo || '');
        }).join('\n')
      : '(nao disponivel)';
    const ia4CompDesc   = compData4 ? (compData4.descricao || '') : '';
    const ia4BancoP1    = bancoDados ? bancoDados.p1 : '';
    const ia4BancoP2    = bancoDados ? bancoDados.p2 : '';
    const ia4BancoP3    = bancoDados ? bancoDados.p3 : '';
    const ia4BancoP4    = bancoDados ? bancoDados.p4 : '';

    // Dados comuns para ambas as calls
    const inpComum = {
      nome:         nome,
      cargo:        cargo,
      escola:       escolaColab,
      cis:          perfilCIS,
      cisFiltrado:  cisFiltradoTexto,
      cisRiscos:    cisRiscosTexto,
      contextoPPP:  contextoPPPTexto,
      compId:       compId,
      compNome:     compNome,
      compDescricao:ia4CompDesc,
      descritores:  ia4DescList,
      descritoresV2: objRegua.descritoresV2 || null,
      regua:        objRegua.texto,
      cenario:      ia4CenarioText,
      cobertura:    ia4CoberturaText,
      p1: ia4BancoP1, p2: ia4BancoP2, p3: ia4BancoP3, p4: ia4BancoP4,
      r1: String(row[iR1] || ''), r2: String(row[iR2] || ''),
      r3: String(row[iR3] || ''), r4: String(row[iR4] || ''),
      valores: buscarValoresEscola(ss, escolaColab)
    };

    if (iStatus >= 0) wsRespostas.getRange(r + 1, iStatus + 1).setValue('Processando...');
    SpreadsheetApp.flush();

    const provedor    = _CFG.provedor || 'CLAUDE';
    const modeloFinal = _CFG.modelo   || MODEL_SONNET;

    // ═══════════════════════════════════════════════════════════════════
    // CALL 1 — AVALIAÇÃO: descritores + consolidação + feedback
    // ═══════════════════════════════════════════════════════════════════
    let dadosIA = null, tentativa = 0, erroMsg = '';
    while (!dadosIA && tentativa < 3) {
      tentativa++;
      try {
        const sysAvaliacao = _buildIA4v2SystemPrompt_Avaliacao();
        const promptAvaliacao = _buildIA4v2UserPrompt(inpComum);

        let jsonTexto = provedor === 'GEMINI'
          ? _ia4GeminiRawV2(modeloFinal, sysAvaliacao, promptAvaliacao)
          : _ia4ClaudeRawV2(modeloFinal, sysAvaliacao, promptAvaliacao, _CFG.thinking || false);

        var jsonLimpo = _ia4ExtrairJSON(jsonTexto);
        if (!jsonLimpo || jsonLimpo.length < 10) {
          Logger.log('⚠️ Call1 JSON muito curto. Bruto (500): ' + (jsonTexto || '').substring(0, 500));
          throw new Error('Call 1: resposta vazia ou sem JSON');
        }
        Logger.log('Call1 JSON: ' + jsonLimpo.length + ' chars');
        dadosIA = JSON.parse(jsonLimpo);

        if (!dadosIA.consolidacao || dadosIA.consolidacao.nivel_geral === undefined) {
          throw new Error('Call 1: consolidacao ausente');
        }
        if (!dadosIA.feedback || dadosIA.feedback.trim() === '') {
          throw new Error('Call 1: feedback vazio');
        }
      } catch (e) {
        erroMsg = 'Call1: ' + e.message;
        Logger.log('❌ Call1 tentativa ' + tentativa + '/3 — ' + nome + ': ' + e.message);
        dadosIA = null;
        Utilities.sleep(5000 * tentativa);
      }
    }

    if (!dadosIA) {
      if (iStatus >= 0) wsRespostas.getRange(r + 1, iStatus + 1).setValue('ERRO CALL1: ' + erroMsg);
      _addLog('❌ IA4 Call1 falhou: ' + nome + ' — ' + compNome + ': ' + erroMsg);
      erros++;
      continue;
    }

    // Gravar resultados da Call 1 imediatamente
    const nivelFinal = parseInt(dadosIA.consolidacao.nivel_geral) || 1;
    let nCalcRaw = Number(dadosIA.consolidacao.media_descritores);
    if (!isFinite(nCalcRaw) || isNaN(nCalcRaw)) nCalcRaw = nivelFinal;
    if (nCalcRaw > 10) nCalcRaw = nCalcRaw / 1000;
    const nCalc = Math.min(Math.max(nCalcRaw, 1.0), 4.0);
    const notaFormatada = nCalc.toFixed(2).replace('.', ',');
    const feedbackFn = dadosIA.feedback.trim();

    // Pontos fortes e gaps (com enrichment automático)
    const dest  = dadosIA.descritores_destaque || {};
    const notas = (dadosIA.consolidacao && dadosIA.consolidacao.notas_por_descritor) || {};
    const notasArr = Object.values(notas);

    let pfRaw = dest.pontos_fortes || [];
    if (pfRaw.length === 0) {
      const melhores = notasArr
        .sort(function(a,b){ return (b.nivel||0) - (a.nivel||0); })
        .slice(0, 2);
      pfRaw = melhores.map(function(n) {
        return { descritor: n.nome || '', nivel: n.nivel || 1, evidencia_resumida: 'Melhor desempenho identificado nesta competencia' };
      });
    }
    const fortes = pfRaw.map(function(p) {
      return p.descritor + ' (N' + p.nivel + '): ' + (p.evidencia_resumida || '');
    });

    let gpRaw = dest.gaps_prioritarios || [];
    if (gpRaw.length < 3) {
      const existentes = gpRaw.map(function(g){ return (g.descritor||'').toLowerCase(); });
      const extras = notasArr
        .filter(function(n){ return (n.nivel||0) < 3 && existentes.indexOf((n.nome||'').toLowerCase()) < 0; })
        .sort(function(a,b){ return (a.nivel||0) - (b.nivel||0); })
        .slice(0, 3 - gpRaw.length)
        .map(function(n){ return { descritor: n.nome, nivel: n.nivel, o_que_faltou: 'Ainda nao atingiu o nivel ideal (N3)' }; });
      gpRaw = gpRaw.concat(extras);
    }
    const atencao = gpRaw.map(function(g) {
      return g.descritor + ': ' + (g.o_que_faltou || '');
    });

    const linha = r + 1;
    if (iNivel    >= 0) wsRespostas.getRange(linha, iNivel    + 1).setValue(nivelFinal);
    if (iNota     >= 0) wsRespostas.getRange(linha, iNota     + 1).setValue(notaFormatada);
    if (iFortes   >= 0) wsRespostas.getRange(linha, iFortes   + 1).setValue(fortes.map(x => '✅ ' + x).join('\n'));
    if (iAtencao  >= 0) wsRespostas.getRange(linha, iAtencao  + 1).setValue(atencao.map(x => '🔸 ' + x).join('\n'));
    if (iFeedback >= 0) wsRespostas.getRange(linha, iFeedback + 1).setValue(feedbackFn);
    if (iStatus   >= 0) wsRespostas.getRange(linha, iStatus   + 1).setValue('Avaliado (PDI pendente)');

    // ── Gravar notas individuais dos descritores (D1-D6) ──────────────
    // Calcular média decimal a partir de avaliacao_por_resposta (R1-R4)
    var _hdrRow = wsRespostas.getRange(1, 1, 1, wsRespostas.getLastColumn()).getValues()[0];
    var _normH = function(s) { return String(s||'').toLowerCase().replace(/\s+/g,'').replace(/[áàâã]/g,'a').replace(/[éèê]/g,'e').replace(/[íì]/g,'i').replace(/[óòô]/g,'o').replace(/[úù]/g,'u'); };
    var apr = dadosIA.avaliacao_por_resposta || dadosIA.avaliacao_descritores || {};
    var descMedias = {};
    ['R1','R2','R3','R4'].forEach(function(rk) {
      var descs = (apr[rk] || {}).descritores_avaliados || [];
      descs.forEach(function(d) {
        var num = String(d.numero || '');
        if (!descMedias[num]) descMedias[num] = [];
        descMedias[num].push(Number(d.nivel) || 0);
      });
    });
    for (var di = 1; di <= 6; di++) {
      var colLabel = 'd' + di + 'nota';
      var colIdx = _hdrRow.findIndex(function(h) { return _normH(h) === colLabel; });
      if (colIdx < 0) continue;
      var avaliacoes = descMedias[String(di)];
      if (avaliacoes && avaliacoes.length > 0) {
        var soma = 0;
        for (var ai = 0; ai < avaliacoes.length; ai++) soma += avaliacoes[ai];
        var media = soma / avaliacoes.length;
        wsRespostas.getRange(linha, colIdx + 1).setValue(Number(media.toFixed(2)));
      } else if (notas[String(di)]) {
        // Fallback: usar nível inteiro da consolidação
        wsRespostas.getRange(linha, colIdx + 1).setValue(parseInt(notas[String(di)].nivel) || 0);
      }
    }
    SpreadsheetApp.flush();

    // ═══════════════════════════════════════════════════════════════════
    // CALL 2 — PDI + VALORES
    // ═══════════════════════════════════════════════════════════════════
    let dadosPDI = null;
    let tentativa2 = 0;
    while (!dadosPDI && tentativa2 < 3) {
      tentativa2++;
      try {
        const sysPDI = _buildIA4v2SystemPrompt_PDIValores();
        const promptPDI = _buildIA4v2UserPrompt_PDIValores(inpComum, dadosIA);

        let jsonTexto2 = provedor === 'GEMINI'
          ? _ia4GeminiRawV2(modeloFinal, sysPDI, promptPDI)
          : _ia4ClaudeRawV2(modeloFinal, sysPDI, promptPDI, _CFG.thinking || false);

        var jsonLimpo2 = _ia4ExtrairJSON(jsonTexto2);
        if (!jsonLimpo2 || jsonLimpo2.length < 10) {
          throw new Error('Call 2: resposta vazia ou sem JSON');
        }
        Logger.log('Call2 JSON: ' + jsonLimpo2.length + ' chars');
        dadosPDI = JSON.parse(jsonLimpo2);

        if (!dadosPDI.recomendacoes_pdi || dadosPDI.recomendacoes_pdi.length === 0) {
          throw new Error('Call 2: recomendacoes_pdi ausente');
        }
      } catch (e) {
        Logger.log('❌ Call2 tentativa ' + tentativa2 + '/3 — ' + nome + ': ' + e.message);
        dadosPDI = null;
        Utilities.sleep(5000 * tentativa2);
      }
    }

    // Gravar resultados da Call 2
    const _moodleLink = _ia4v2BuscarMoodle(ss, compNome, compId, nivelFinal);

    const payloadPDF = {
      nota_decimal:           notaFormatada,
      nivel:                  nivelFinal,
      cargo,
      prefPdi,
      definicao:              objRegua.descricao || '',
      feedback_personalizado: feedbackFn,
      plano: (() => {
        const pdi = dadosPDI ? (dadosPDI.recomendacoes_pdi || []) : [];
        return {
          semana_1_2: { foco: pdi[0] ? pdi[0].descritor_foco : 'PDI', acoes: pdi[0] ? [pdi[0].acao] : [] },
          semana_3:   { foco: pdi[1] ? pdi[1].descritor_foco : '',    acoes: pdi[1] ? [pdi[1].acao] : [] },
          semana_4:   { foco: pdi[2] ? pdi[2].descritor_foco : '',    acoes: pdi[2] ? [pdi[2].acao] : [] },
        };
      })(),
      dicas: [],
      cola:  [],
      links: _moodleLink,
      perfil_dados: null,
      check_coerencia:       null,
      consolidacao:          dadosIA.consolidacao          || null,
      avaliacao_descritores: dadosIA.avaliacao_por_resposta || null,
      recomendacoes_pdi:     dadosPDI ? dadosPDI.recomendacoes_pdi : null,
    };

    if (iPayload >= 0) wsRespostas.getRange(linha, iPayload + 1).setValue(JSON.stringify(payloadPDF));

    // Gravar avaliação de valores (da Call 2)
    const avalValores = dadosPDI ? (dadosPDI.avaliacao_valores || []) : [];
    if (avalValores.length > 0) {
      const resumoValores = avalValores.map(v => {
        const ico = v.status === 'alinhado' ? '✅' : v.status === 'tensao' ? '⚠️' : v.status === 'violacao' ? '🚩' : '—';
        return ico + ' ' + (v.valor || '');
      }).join('\n');
      if (iValStatus  >= 0) wsRespostas.getRange(linha, iValStatus  + 1).setValue(resumoValores);
      if (iValPayload >= 0) wsRespostas.getRange(linha, iValPayload + 1).setValue(JSON.stringify(avalValores));
    }

    if (iStatus >= 0) wsRespostas.getRange(linha, iStatus + 1).setValue(dadosPDI ? 'Avaliado' : 'Avaliado (sem PDI)');
    SpreadsheetApp.flush();

    processados++;
  }

  SpreadsheetApp.getUi().alert(
    `✅ IA 4 concluída!\n\n` +
    `📊 Avaliadas : ${processados}\n❌ Erros     : ${erros}\n\n` +
    `Revise na aba "Respostas" e use "📄 Gerar PDIs" após aprovação.`
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// GERAR PDIs
// ═══════════════════════════════════════════════════════════════════════════════

function gerarPDIs() {
  _carregarCFG();
  const ss          = SpreadsheetApp.getActiveSpreadsheet();
  const wsRespostas = ss.getSheetByName(ABA_RESPOSTAS);
  const wsColab     = ss.getSheetByName('Colaboradores');

  if (!wsRespostas) { SpreadsheetApp.getUi().alert('❌ Aba "Respostas" não encontrada.'); return; }

  const headers = wsRespostas.getRange(1, 1, 1, wsRespostas.getLastColumn()).getValues()[0];
  const dados   = wsRespostas.getDataRange().getValues();

  const iIdColab   = (() => { let i = headers.findIndex(h => _norm(h) === 'ID Colaborador'); return i >= 0 ? i : headers.findIndex(h => _norm(h).toLowerCase() === 'e-mail'); })();
  const iNomeColab = headers.findIndex(h => _norm(h) === 'Nome Colaborador');
  const iEmpresa   = headers.findIndex(h => _norm(h) === 'Empresa');
  const iCargo     = headers.findIndex(h => _norm(h) === 'Cargo');
  const iIdComp    = headers.findIndex(h => _norm(h) === 'ID Competência');
  const iNomeComp  = headers.findIndex(h => _norm(h) === 'Nome Competência');
  // Busca flexível — tolera variações de acento e espaço entre versões da planilha
  const _nsFlex = s => String(s||'').toLowerCase().replace(/[àáâãä]/g,'a').replace(/[éêë]/g,'e')
    .replace(/[íî]/g,'i').replace(/[óôõö]/g,'o').replace(/[úû]/g,'u').replace(/ç/g,'c')
    .replace(/\s+/g,' ').trim();
  const _findH  = (exact, partial) => {
    let i = headers.findIndex(h => _norm(h) === exact);
    if (i >= 0) return i;
    if (partial) i = headers.findIndex(h => _nsFlex(h).includes(_nsFlex(partial)));
    return i;
  };
  const iNivel     = _findH('Nível IA4',   'nivel ia');
  const iNota      = _findH('Nota IA4',    'nota ia');
  const iFortes    = _findH('Pontos Fortes', 'fortes');
  const iAtencao   = _findH('Pontos de Atenção', 'atencao');
  const iFeedback  = _findH('Feedback IA4', 'feedback');
  const iPayload   = _findH('Payload IA4',  'payload');
  const iStatus    = _findH('Status IA 4',  'status ia');
  const iPrefPdi   = headers.findIndex(h => _norm(h) === 'Preferência PDI');
  const iWhatsApp  = headers.findIndex(h => _norm(h).includes('WhatsApp'));
  const iD1 = _findH('D1 Nota', 'd1 nota');
  const iD2 = _findH('D2 Nota', 'd2 nota');
  const iD3 = _findH('D3 Nota', 'd3 nota');
  const iD4 = _findH('D4 Nota', 'd4 nota');
  const iD5 = _findH('D5 Nota', 'd5 nota');
  const iD6 = _findH('D6 Nota', 'd6 nota');

  // v7: idColab já é o e-mail — mapeamento direto, sem necessidade de lookup

  // V2: cache de nomes de competências para lookup rápido
  const _mapaV2Nomes = (function() {
    var m = _lerBaseCompetenciasV2(ss);
    var nomes = {};
    Object.keys(m).forEach(function(cod) { nomes[cod.toUpperCase()] = m[cod].nome; });
    return nomes;
  })();

  // Contar apenas competências avaliadas (avaliado ou pdf enviado) por colaborador
  const totalCompsPorColab = {};
  dados.slice(1).forEach(row => {
    if (!row[iNomeColab]) return;
    const st = iStatus >= 0 ? _norm(String(row[iStatus] || '')).toLowerCase() : '';
    if (st === 'pdf enviado') return;  // já enviado — não reenviar
    // Só conta linhas com payload válido
    try { JSON.parse(row[iPayload]); } catch (e) { return; }
    const email = _norm(String(row[iIdColab] || ''));
    totalCompsPorColab[email] = (totalCompsPorColab[email] || 0) + 1;
  });

  const grupos = {};
  dados.slice(1).forEach((row, idx) => {
    const nivel  = row[iNivel];
    const status = iStatus >= 0 ? _norm(String(row[iStatus] || '')).toLowerCase() : '';
    if (!row[iNomeColab] || !nivel) return;
    // Processar qualquer status exceto 'pdf enviado' (já enviado) — payload válido é suficiente
    if (status === 'pdf enviado') return;

    let dF;
    try { dF = JSON.parse(row[iPayload]); } catch (e) { return; } // sem payload → pular

    // v7: idColab = e-mail
    const emailColab = _norm(String(row[iIdColab] || ''));
    if (!grupos[emailColab]) {
      grupos[emailColab] = {
        idColab:  emailColab,
        nome:     _norm(String(row[iNomeColab] || '')),
        cargo:    dF.cargo || _norm(String(row[iCargo] || '')),
        empresa:  _norm(String(row[iEmpresa] || '')),
        email:    emailColab,           // e-mail = idColab
        prefPdi:  dF.prefPdi || (iPrefPdi >= 0 ? _norm(String(row[iPrefPdi] || '')) : 'E-mail'),
        wpp:      iWhatsApp >= 0 ? _norm(String(row[iWhatsApp] || '')) : '',
        itens:    [],
        linhas:   [],
      };
    }

    const nDecimal = parseFloat((row[iNota] || '0').toString().replace(',', '.')) || (parseInt(nivel) || 0);

    grupos[emailColab].itens.push({
      comp: (() => {
        const raw = _norm(String(row[iNomeComp] || ''));
        if (/^[Cc]\d{2,4}$/.test(raw) || !raw) {
          const idComp = _norm(String(row[iIdComp] || raw));
          // V2: lookup por código no cache
          if (idComp && _mapaV2Nomes[idComp.toUpperCase()]) {
            return _ia4Safe(_mapaV2Nomes[idComp.toUpperCase()]);
          }
          return raw || idComp;
        }
        return _ia4Safe(raw);
      })(),
      nivel:          parseInt(nivel) || 0,
      decimal:        nDecimal,
      definicao:      _ia4Safe(dF.definicao),
      fortes:         _ia4Safe(row[iFortes]),
      atencao:        _ia4Safe(row[iAtencao]),
      feedback:       _ia4Safe(dF.feedback_personalizado),
      plano30:        dF.plano  || null,
      dicasN3:        Array.isArray(dF.dicas) ? dF.dicas : [],
      perfil:         dF.perfil_dados || null,
      cola:           Array.isArray(dF.cola) ? dF.cola : [],
      links:          _ia4Safe(dF.links || 'Consulte seu consultor Vertho.'),
      check_coerencia: dF.check_coerencia || null,
    });
    grupos[emailColab].linhas.push(idx + 2);
  });

  // Exige todas as competências avaliadas
  const incompletos = [];
  Object.keys(grupos).forEach(email => {
    const totalEsperado  = totalCompsPorColab[email] || 0;
    const totalAvaliados = grupos[email].itens.length;
    if (totalAvaliados < totalEsperado) {
      incompletos.push(`• ${grupos[email].nome}: ${totalAvaliados}/${totalEsperado} avaliadas`);
      delete grupos[email];
    }
  });

  if (Object.keys(grupos).length === 0) {
    SpreadsheetApp.getUi().alert(
      `Nenhum colaborador com todas as competências avaliadas.\n\nExecute a IA 4 primeiro.\n\n` +
      (incompletos.length ? `Status:\n${incompletos.join('\n')}` : '')
    );
    return;
  }

  if (incompletos.length > 0) {
    const resp = SpreadsheetApp.getUi().alert(
      `⚠️ ${incompletos.length} colaborador(es) incompletos serão ignorados:\n\n` +
      incompletos.join('\n') + '\n\nContinuar?',
      SpreadsheetApp.getUi().ButtonSet.YES_NO
    );
    if (resp !== SpreadsheetApp.getUi().Button.YES) return;
  }

  const folder       = DriveApp.getFolderById(IA4_ID_PASTA);
  const templateFile = DriveApp.getFileById(IA4_ID_TEMPLATE);

  const C_TITULO    = '#0F2B54';
  const C_PERFIL_BG = '#EEF3FB';
  const C_FUNDO_POS = '#D9EAD3';
  const C_FUNDO_NEG = '#FCE5CD';
  const C_FLAG_RED  = '#CC0000';

  let pdfGerados = 0, pdfErros = 0;
  const total = Object.keys(grupos).length;

  SpreadsheetApp.getActive().toast(`Preparando ${total} PDI(s)...`, '⏳ Gerando PDFs', 5);

  for (const emailColab in grupos) {
    const prof = grupos[emailColab];
    SpreadsheetApp.getActive().toast(`📄 ${prof.nome}`, `⏳ PDFs: ${pdfGerados}/${total}`, 5);

    try {
      prof.itens.sort((a, b) => a.decimal - b.decimal);
      const menorNota = Math.min(...prof.itens.map(it => it.decimal));
      const idxMenor  = prof.itens.findIndex(it => it.decimal === menorNota);

      const copia = templateFile.makeCopy(`PDI — ${prof.nome}`, folder);
      const doc   = DocumentApp.openById(copia.getId());
      const body  = doc.getBody();

      body.replaceText('{{NOME}}',  _ia4Safe(prof.nome));
      body.replaceText('{{CARGO}}', _ia4Safe(prof.cargo));
      body.replaceText('Vertho\\.ai Gestão da Aprendizagem\\s*\n?', '');

      const range = body.findText('{{RELATORIO_DINAMICO}}');
      if (!range) { doc.saveAndClose(); pdfErros++; continue; }

      const parentPar = range.getElement().getParent();
      let idx = body.getChildIndex(parentPar);
      parentPar.asParagraph().setText(' ');

      // ── Bloco de perfil ────────────────────────────────────────────────────
      const dP = prof.itens[0].perfil;
      if (dP) {
        const pPerfilTit = body.insertParagraph(idx++, '🧠 Perfil Comportamental');
        pPerfilTit.setHeading(DocumentApp.ParagraphHeading.HEADING2)
          .setForegroundColor(C_TITULO).editAsText().setBold(true);

        const tP = body.insertTable(idx++);
        tP.setBorderWidth(0);
        const cP = tP.appendTableRow().appendTableCell();
        cP.setBackgroundColor(C_PERFIL_BG);
        _ia4LimparCelula(cP);
        const labels = {
          perfil:                  'Tipo de Perfil:',
          implicacao_no_cargo:     'Como esse perfil se manifesta:',
          alavanca_de_desenvolvimento: 'Alavanca de Crescimento:',
        };
        Object.keys(labels).forEach(k => { if (dP[k]) _ia4ParaMisto(cP, labels[k], dP[k]); });
        body.insertParagraph(idx++, ' ');
      }

      // ── Resumo de desempenho ───────────────────────────────────────────────
      const pResTit = body.insertParagraph(idx++, 'Resumo de Desempenho');
      pResTit.setHeading(DocumentApp.ParagraphHeading.HEADING2)
        .setForegroundColor(C_TITULO).editAsText().setBold(true);
      body.insertParagraph(idx++, ' ');

      const tRes = body.insertTable(idx++);
      tRes.setBorderWidth(0);
      prof.itens.forEach((it, iRes) => {
        const rRes = tRes.appendTableRow();
        const flag  = iRes === idxMenor ? '🚩 ' : '';
        const cNome = rRes.appendTableCell(flag + _ia4Safe(it.comp));
        rRes.appendTableCell(_ia4Estrelas(it.nivel));
        if (iRes === idxMenor) cNome.editAsText().setForegroundColor(C_FLAG_RED);
      });
      body.insertParagraph(idx++, ' ');

      // ── Competências ───────────────────────────────────────────────────────
      prof.itens.forEach((it, iComp) => {
        body.insertHorizontalRule(idx++);
        body.insertParagraph(idx++, ' ');

        const flag    = iComp === idxMenor ? '🚩 ' : '';
        const corComp = iComp === idxMenor ? C_FLAG_RED : C_TITULO;
        const pCTit   = body.insertParagraph(idx++, flag + _ia4Safe(it.comp));
        pCTit.setHeading(DocumentApp.ParagraphHeading.HEADING1)
          .setForegroundColor(corComp).editAsText().setBold(true);
        body.insertParagraph(idx++, ' ');

        const pDef = body.insertParagraph(idx++, it.definicao);
        pDef.setItalic(true).setForegroundColor('#666666').editAsText().setBold(false);
        body.insertParagraph(idx++, ' ');

        // Tabela FEZ BEM / MELHORAR
        const tAn = body.insertTable(idx++);
        tAn.setBorderWidth(1).setBorderColor('#CCCCCC');
        const rAn = tAn.appendTableRow();

        const cF = rAn.appendTableCell();
        cF.setBackgroundColor(C_FUNDO_POS);
        _ia4LimparCelula(cF);
        cF.appendParagraph('🔍 FEZ BEM:').editAsText().setBold(true).setItalic(false);
        _ia4Safe(it.fortes).split('\n').forEach(linha => {
          const p = cF.appendParagraph(_ia4Safe(linha));
          p.editAsText().setBold(false).setItalic(false);
          p.setSpacingAfter(4);
        });

        const cA = rAn.appendTableCell();
        cA.setBackgroundColor(C_FUNDO_NEG);
        _ia4LimparCelula(cA);
        cA.appendParagraph('⚠️ MELHORAR:').editAsText().setBold(true).setItalic(false);
        _ia4Safe(it.atencao).split('\n').forEach(linha => {
          const p = cA.appendParagraph(_ia4Safe(linha));
          p.editAsText().setBold(false).setItalic(false);
          p.setSpacingAfter(4);
        });
        body.insertParagraph(idx++, ' ');

        // Feedback
        body.insertParagraph(idx++, 'Feedback:').editAsText().setBold(true).setItalic(false);
        _ia4Safe(it.feedback).split(/\n\n|\n/).filter(p => p.trim()).forEach(paraTexto => {
          const pFB = body.insertParagraph(idx++, paraTexto.trim());
          pFB.editAsText().setBold(false).setItalic(false);
          pFB.setSpacingAfter(6);
        });
        body.insertParagraph(idx++, ' ');

        // Plano 30 dias
        if (it.plano30) {
          body.insertParagraph(idx++, '📅 Plano de Desenvolvimento — 30 Dias')
            .editAsText().setBold(true).setItalic(false);

          const tPl = body.insertTable(idx++);
          tPl.setBorderWidth(0);
          const cPl = tPl.appendTableRow().appendTableCell();
          cPl.setBackgroundColor('#E8F0FE');
          _ia4LimparCelula(cPl);
          _ia4Semana(cPl, '📅 Semanas 1-2:', it.plano30.semana_1_2);
          if (it.plano30.semana_3?.acoes?.length > 0) { cPl.appendParagraph(' '); _ia4Semana(cPl, '📅 Semana 3:', it.plano30.semana_3); }
          if (it.plano30.semana_4?.acoes?.length > 0) { cPl.appendParagraph(' '); _ia4Semana(cPl, '📅 Semana 4:', it.plano30.semana_4); }
          body.insertParagraph(idx++, ' ');
        }

        // Dicas
        if (it.dicasN3.length > 0) {
          body.insertParagraph(idx++, '🚀 Dicas de Desenvolvimento:')
            .editAsText().setBold(true).setItalic(false);
          it.dicasN3.forEach(d => {
            const p = body.insertParagraph(idx++, '• ' + _ia4Safe(d));
            p.editAsText().setBold(false).setItalic(false);
            p.setSpacingAfter(4);
          });
          body.insertParagraph(idx++, ' ');
        }

        // Links
        body.insertParagraph(idx++, '📚 Estudo Recomendado:').editAsText().setBold(true);
        const pLink = body.insertParagraph(idx++, _ia4Safe(it.links));
        pLink.setUnderline(true).setForegroundColor('#1155CC');
        body.insertParagraph(idx++, ' ');

        // Checklist
        if (it.cola && it.cola.length > 0) {
          const tChk = body.insertTable(idx++);
          tChk.setBorderWidth(1).setBorderColor('#0F2B54');
          const rChkH = tChk.appendTableRow();
          const cChkH = rChkH.appendTableCell('⚡ CHECKLIST TÁTICO');
          cChkH.setBackgroundColor('#0F2B54');
          cChkH.editAsText().setForegroundColor('#FFFFFF').setBold(true).setItalic(false).setFontSize(11);
          cChkH.setPaddingTop(6).setPaddingBottom(6).setPaddingLeft(10).setPaddingRight(10);

          it.cola.forEach((item, iChk) => {
            let limpo = _ia4Safe(item)
              .replace(/^[☐☑✅□✓\-•\s]+/, '')
              .replace(/\s*[\(\/]?\s*(sim|não|nao|yes|no)\s*[\)\/]?\s*$/i, '')
              .replace(/\.$/, '').trim();
            if (!limpo) return;
            const rChkI = tChk.appendTableRow();
            const cChkI = rChkI.appendTableCell('☐  ' + limpo);
            cChkI.setBackgroundColor(iChk % 2 === 0 ? '#FFFFFF' : '#F7FBFF');
            cChkI.editAsText().setBold(false).setItalic(false).setUnderline(false).setForegroundColor('#0F2B54').setFontSize(10);
            cChkI.setPaddingTop(5).setPaddingBottom(5).setPaddingLeft(14).setPaddingRight(10);
          });
          body.insertParagraph(idx++, ' ');
        }
      });

      doc.saveAndClose();

      const pdf = copia.getAs(MimeType.PDF);
      folder.createFile(pdf);
      copia.setTrashed(true);

      // E-mail ao colaborador
      if (prof.email && (prof.prefPdi.toLowerCase() === 'e-mail' || prof.prefPdi.toLowerCase() === 'ambos')) {
        const _opts = { name: NOME_REMETENTE, attachments: [pdf] };
        const _subj = 'Seu PDI Vertho — Plano de Desenvolvimento Individual';
        const _body = `Olá, ${prof.nome.split(' ')[0]}!\n\nSeu PDI Vertho está em anexo.\n\nEquipe Vertho`;
        try {
          GmailApp.sendEmail(prof.email, _subj, _body, { ..._opts, from: EMAIL_REMETENTE });
        } catch(_eAlias) {
          GmailApp.sendEmail(prof.email, _subj, _body, _opts);
          _addLog('⚠️ PDI enviado sem alias: ' + _eAlias.message);
        }
      }

      // WhatsApp: log para envio manual
      if ((prof.prefPdi.toLowerCase() === 'whatsapp' || prof.prefPdi.toLowerCase() === 'ambos') && prof.wpp) {
        _addLog(`📱 WhatsApp pendente — ${prof.nome} (${prof.wpp}): enviar PDI da pasta Drive`);
      }

      prof.linhas.forEach(l => wsRespostas.getRange(l, iStatus + 1).setValue('PDF Enviado'));
      pdfGerados++;

    } catch (e) {
      prof.linhas.forEach(l => wsRespostas.getRange(l, iStatus + 1).setValue('ERRO PDF: ' + e.message));
      _addLog(`❌ Erro PDF ${prof.nome}: ${e.message}`);
      pdfErros++;
    }
  }

  SpreadsheetApp.getActive().toast('Gerando Relatórios dos Gestores...', '📂 Aguarde', 5);
  const folderGestor = DriveApp.getFolderById(PASTA_RELATORIOS);
  const dossiesGerados = _gerarDossiesGestor(grupos, wsColab, folderGestor);

  SpreadsheetApp.getUi().alert(
    `📄 PDIs concluídos!\n\n` +
    `✅ Gerados e enviados: ${pdfGerados}\n❌ Erros: ${pdfErros}\n📦 Total: ${total}\n\n` +
    `📂 Dossiês do Gestor: ${dossiesGerados} gerado(s)`
  );
}

function verFilaIA4() {
  const ss          = SpreadsheetApp.getActiveSpreadsheet();
  const wsRespostas = ss.getSheetByName(ABA_RESPOSTAS);
  if (!wsRespostas) { SpreadsheetApp.getUi().alert('Aba Respostas não encontrada.'); return; }

  const headers = wsRespostas.getRange(1, 1, 1, wsRespostas.getLastColumn()).getValues()[0];
  const dados   = wsRespostas.getDataRange().getValues();
  const iStatus = headers.findIndex(h => _norm(h) === 'Status IA 4');
  const iNome   = headers.findIndex(h => _norm(h) === 'Nome Colaborador');

  const cnt = { pendente: 0, avaliado: 0, enviado: 0, erro: 0 };
  const pendentes = [];

  dados.slice(1).forEach(row => {
    if (!row[iNome]) return;
    const st = _norm(String(row[iStatus] || ''));
    if      (st === 'avaliado')    cnt.avaliado++;
    else if (st === 'pdf enviado') cnt.enviado++;
    else if (st.includes('erro')) cnt.erro++;
    else { cnt.pendente++; pendentes.push(`• ${row[iNome]}`); }
  });

  SpreadsheetApp.getUi().alert(
    `📋 FILA IA 4\n\n` +
    `⏳ Pendentes  : ${cnt.pendente}\n✅ Avaliados  : ${cnt.avaliado}\n` +
    `📄 PDF Enviado: ${cnt.enviado}\n❌ Erros      : ${cnt.erro}\n` +
    (pendentes.length > 0 ? `\nAguardando:\n${pendentes.slice(0, 15).join('\n')}` : '')
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS DA IA 4
// ═══════════════════════════════════════════════════════════════════════════════

function _carregarBasesIA4(ss) {
  const db = { reguas: {}, academia: {}, competenciasV2: {} };

  // V2: Gerar réguas a partir dos descritores de Competencias_v2
  const mapaV2 = _lerBaseCompetenciasV2(ss);
  if (mapaV2 && Object.keys(mapaV2).length > 0) {
    db.competenciasV2 = mapaV2;
    Object.keys(mapaV2).forEach(function(cod) {
      const comp = mapaV2[cod];
      const texto = _gerarReguaDeDescritores(comp);
      const obj = { texto: texto, descricao: comp.descricao || '', descritoresV2: comp.descritores };
      db.reguas[_ia4Chave(comp.cargo + '_' + comp.nome)] = obj;
      db.reguas[_ia4Chave(comp.nome)] = obj;
      db.reguas[_ia4Chave(comp.cargo + '_' + cod)] = obj;
      db.reguas[_ia4Chave(cod)] = obj;
    });
    Logger.log('_carregarBasesIA4: reguas V2 geradas para ' + Object.keys(mapaV2).length + ' competencias');
  } else {
    // Fallback legado: aba Regua Maturidade
    const wsRegua = ss.getSheetByName('Regua Maturidade');
    if (wsRegua) {
      const v = wsRegua.getDataRange().getValues();
      for (let i = 1; i < v.length; i++) {
        const cargo = _norm(String(v[i][0] || ''));
        const comp  = _norm(String(v[i][1] || ''));
        if (!comp) continue;
        const obj = { texto: v[i][2] ? String(v[i][2]) : '', descricao: v[i][3] ? String(v[i][3]) : '' };
        db.reguas[_ia4Chave(`${cargo}_${comp}`)] = obj;
        db.reguas[_ia4Chave(comp)]               = obj;
      }
    }
  }

  const wsAcad = ss.getSheetByName('Academia');
  if (wsAcad) {
    const v = wsAcad.getDataRange().getValues();
    for (let i = 1; i < v.length; i++) {
      const cargo = _norm(String(v[i][0] || ''));
      const id    = _norm(String(v[i][1] || ''));
      const nome  = _norm(String(v[i][2] || ''));
      if (!id && !nome) continue;
      const obj = { n1: v[i][3]?String(v[i][3]):'', n2: v[i][4]?String(v[i][4]):'', n3: v[i][5]?String(v[i][5]):'', n4: v[i][6]?String(v[i][6]):'' };
      if (id)   { db.academia[_ia4Chave(`${cargo}_${id}`)] = obj; db.academia[_ia4Chave(id)] = obj; }
      if (nome) { db.academia[_ia4Chave(`${cargo}_${nome}`)] = obj; db.academia[_ia4Chave(nome)] = obj; }
    }
  }

  return db;
}

/**
 * v7: indexa perfis CIS por e-mail do colaborador.
 */
function _lerPerfisCISIA4(wsColab) {
  if (!wsColab) return {};
  const dados   = wsColab.getDataRange().getValues();
  const headers = dados[3];
  const gCl = (l) => headers.findIndex(h => _norm(String(h || '')).toLowerCase().includes(l.toLowerCase()));

  const iEmail  = _idxEmailColab(headers);
  const iPerfil = gCl('perfil comportament');
  const iD      = gCl('d natural');
  const iI      = gCl('i natural');
  const iS      = gCl('s natural');
  const iC      = gCl('c natural');
  // Valores Motivadores (6 dimensoes)
  const iVTeo   = gCl('teoric');
  const iVEco   = gCl('econom');
  const iVEst   = gCl('estet');
  const iVSoc   = gCl('social');
  const iVPol   = gCl('politic');
  const iVRel   = gCl('religi');
  // Tipos Psicologicos (6 dimensoes)
  const iTPSen  = gCl('sensor');
  const iTPInt  = gCl('intuit');
  const iTPRac  = gCl('racion');
  const iTPEmo  = gCl('emocio');
  const iTPIv   = gCl('introvert');
  const iTPEv   = (() => { const i = gCl('extravert'); return i >= 0 ? i : gCl('extrovert'); })();

  const mapa = {};
  dados.slice(4).forEach(row => {
    const email = _norm(String(row[iEmail] || ''));
    if (!email) return;
    mapa[email] = {
      perfil:          iPerfil >= 0 ? _norm(String(row[iPerfil] || '')) : '',
      d:               Number(row[iD]) || 0,
      i:               Number(row[iI]) || 0,
      s:               Number(row[iS]) || 0,
      c:               Number(row[iC]) || 0,
      val_teorico:     iVTeo >= 0 ? (Number(row[iVTeo])  || 0) : 0,
      val_economico:   iVEco >= 0 ? (Number(row[iVEco])  || 0) : 0,
      val_estetico:    iVEst >= 0 ? (Number(row[iVEst])  || 0) : 0,
      val_social:      iVSoc >= 0 ? (Number(row[iVSoc])  || 0) : 0,
      val_politico:    iVPol >= 0 ? (Number(row[iVPol])  || 0) : 0,
      val_religioso:   iVRel >= 0 ? (Number(row[iVRel])  || 0) : 0,
      tp_sensorial:    iTPSen >= 0 ? (Number(row[iTPSen]) || 0) : 0,
      tp_intuitivo:    iTPInt >= 0 ? (Number(row[iTPInt]) || 0) : 0,
      tp_racional:     iTPRac >= 0 ? (Number(row[iTPRac]) || 0) : 0,
      tp_emocional:    iTPEmo >= 0 ? (Number(row[iTPEmo]) || 0) : 0,
      tp_introvertido: iTPIv  >= 0 ? (Number(row[iTPIv])  || 0) : 0,
      tp_extrovertido: iTPEv  >= 0 ? (Number(row[iTPEv])  || 0) : 0,
    };
  });
  return mapa;
}

function _garantirColunasIA4(wsRespostas) {
  const headers = wsRespostas.getRange(1, 1, 1, wsRespostas.getLastColumn()).getValues()[0];
  // Normaliza sem acentos para evitar duplicatas por diferença de encoding
  const _ns = s => String(s||'')
    .replace(/[À-Åà-å]/g,'a')
    .replace(/[È-Ëè-ë]/g,'e')
    .replace(/[Ì-Ïì-ï]/g,'i')
    .replace(/[Ò-Öò-ö]/g,'o')
    .replace(/[Ù-Üù-ü]/g,'u')
    .replace(/ç|Ç/g,'c')
    .replace(/\s+/g,' ').trim().toLowerCase();
  // 'Status IA 4' nunca é criada aqui — já existe antes das colunas de output
  ['Nível IA4','Nota IA4','Pontos Fortes','Pontos de Atenção','Feedback IA4',
   'Links Academia','Payload IA4','Data Avaliação IA4',
   'D1 Nota','D2 Nota','D3 Nota','D4 Nota','D5 Nota','D6 Nota'].forEach(col => {
    if (headers.findIndex(h => _ns(h) === _ns(col)) < 0) {
      const nc = wsRespostas.getLastColumn() + 1;
      wsRespostas.getRange(1, nc).setValue(col)
        .setBackground('#0F2B54').setFontColor('#FFFFFF').setFontWeight('bold');
      headers.push(col);
    }
  });
}

/**
 * Backfill: extrai notas D1-D6 do Payload IA4 para avaliações já feitas.
 * Chamar uma vez pelo menu ou console para popular as colunas retroativamente.
 */
function preencherNotasDescritores() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName('Respostas');
  if (!ws) { SpreadsheetApp.getUi().alert('Aba Respostas não encontrada.'); return; }

  // Garantir que as colunas D1-D6 existem
  _garantirColunasIA4(ws);

  var dados = ws.getDataRange().getValues();
  var headers = dados[0];
  var _ns = function(s) {
    return String(s||'').toLowerCase().replace(/[áàâãä]/g,'a').replace(/[éèêë]/g,'e')
      .replace(/[íìîï]/g,'i').replace(/[óòôõö]/g,'o').replace(/[úùûü]/g,'u')
      .replace(/ç/g,'c').replace(/\s+/g,' ').trim();
  };
  var _fh = function(label) {
    var ln = _ns(label);
    return headers.findIndex(function(h) { return _ns(h) === ln || _ns(h).indexOf(ln) >= 0; });
  };

  var iPayload = _fh('payload ia4');
  var iD = [_fh('d1 nota'), _fh('d2 nota'), _fh('d3 nota'), _fh('d4 nota'), _fh('d5 nota'), _fh('d6 nota')];

  if (iPayload < 0) { SpreadsheetApp.getUi().alert('Coluna "Payload IA4" não encontrada.'); return; }
  if (iD[0] < 0) { SpreadsheetApp.getUi().alert('Colunas D1-D6 Nota não encontradas. Rode rodarIA4 primeiro para criá-las.'); return; }

  var preenchidos = 0;
  for (var r = 1; r < dados.length; r++) {
    var raw = String(dados[r][iPayload] || '').trim();
    if (!raw || raw.charAt(0) !== '{') continue;

    try {
      var payload = JSON.parse(raw);
      var npd = (payload.consolidacao || {}).notas_por_descritor || {};
      var keys = Object.keys(npd);
      if (keys.length === 0) continue;

      // Calcular média decimal a partir de avaliacao_por_resposta (R1-R4)
      var apr = payload.avaliacao_por_resposta || payload.avaliacao_descritores || {};
      var descMedias = {};
      ['R1','R2','R3','R4'].forEach(function(rk) {
        var descs = (apr[rk] || {}).descritores_avaliados || [];
        descs.forEach(function(dd) {
          var num = String(dd.numero || '');
          if (!descMedias[num]) descMedias[num] = [];
          descMedias[num].push(Number(dd.nivel) || 0);
        });
      });

      var linha = r + 1;
      for (var d = 0; d < 6; d++) {
        if (iD[d] < 0) continue;
        var dKey = String(d + 1);
        var avaliacoes = descMedias[dKey];
        if (avaliacoes && avaliacoes.length > 0) {
          var soma = 0;
          for (var ai = 0; ai < avaliacoes.length; ai++) soma += avaliacoes[ai];
          var media = soma / avaliacoes.length;
          ws.getRange(linha, iD[d] + 1).setValue(Number(media.toFixed(2)));
        } else if (npd[dKey]) {
          ws.getRange(linha, iD[d] + 1).setValue(parseInt(npd[dKey].nivel) || 0);
        }
      }
      preenchidos++;
    } catch (e) { /* payload inválido, pular */ }
  }

  SpreadsheetApp.getActive().toast(preenchidos + ' linhas atualizadas com notas D1-D6.', 'Notas Descritores', 5);
  Logger.log('preencherNotasDescritores: ' + preenchidos + ' linhas atualizadas');
}

function _ia4Chave(s) {
  return _norm(s).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s_]/g, '').trim();
}

function _ia4Safe(val) {
  const s = (val !== null && val !== undefined) ? String(val).trim() : '';
  return s !== '' ? s : ' ';
}

function _ia4Estrelas(n) {
  const num = Math.min(Math.max(parseInt(n) || 0, 0), 4);
  return '★'.repeat(num) + '☆'.repeat(4 - num);
}

function _ia4LimparCelula(cell) {
  while (cell.getNumChildren() > 0) {
    const filho = cell.getChild(0);
    if (filho.getType() === DocumentApp.ElementType.PARAGRAPH &&
        filho.asParagraph().getText().trim() === '') {
      cell.removeChild(filho);
    } else { break; }
  }
}

function _ia4ParaMisto(cell, label, conteudo) {
  const lblStr  = _ia4Safe(label);
  const contStr = _ia4Safe(conteudo);
  const fullStr = lblStr + ' ' + contStr;
  const p = cell.appendParagraph(fullStr);
  const t = p.editAsText();
  t.setBold(0, lblStr.length - 1, true);
  if (fullStr.length > lblStr.length) t.setBold(lblStr.length, fullStr.length - 1, false);
  return p;
}

function _ia4Semana(cell, label, conteudo) {
  if (!conteudo) return;
  const pLabel = cell.appendParagraph(_ia4Safe(label));
  pLabel.editAsText().setBold(true).setItalic(false);
  pLabel.setSpacingAfter(2);

  if (typeof conteudo === 'object' && !Array.isArray(conteudo)) {
    if (conteudo.foco) {
      const pFoco = cell.appendParagraph('Foco: ' + _ia4Safe(conteudo.foco));
      pFoco.editAsText().setBold(false).setItalic(true);
      pFoco.setSpacingAfter(4);
    }
    (Array.isArray(conteudo.acoes) ? conteudo.acoes : []).forEach(acao => {
      if (!acao) return;
      const p = cell.appendParagraph('• ' + _ia4Safe(acao));
      p.editAsText().setBold(false).setItalic(false);
      p.setSpacingAfter(3);
    });
  } else if (typeof conteudo === 'string') {
    _ia4Safe(conteudo).split('\n').filter(l => l.trim()).forEach(linha => {
      const p = cell.appendParagraph('• ' + linha.trim());
      p.editAsText().setBold(false).setItalic(false);
      p.setSpacingAfter(3);
    });
  }
}

// ─── Chamadas RAW de API (retornam texto bruto) ────────────────────────────────

function _ia4ClaudeRaw(model, prompt, usarThinking) {
  const maxTok  = _maxTokens(model, usarThinking);
  const budget  = model && model.includes('opus') ? Math.floor(maxTok * 0.8) : Math.floor(maxTok * 0.5);
  const payload = {
    model,
    max_tokens: maxTok,
    messages:   [{ role: 'user', content: prompt }],
  };
  if (usarThinking) {
    payload.thinking = { type: 'enabled', budget_tokens: budget };
  } else {
    payload.temperature = 0.2;
  }
  const headers = Object.assign({
    'x-api-key': _getApiKey('CLAUDE'),
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  }, usarThinking ? { 'anthropic-beta': 'interleaved-thinking-2025-05-14' } : {});
  const resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() !== 200) throw new Error(`Claude ${resp.getResponseCode()}: ${resp.getContentText()}`);
  const blocos = JSON.parse(resp.getContentText()).content.filter(b => b.type === 'text');
  return blocos[blocos.length - 1].text;
}

function _ia4GeminiRaw(model, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${_getApiKey('GEMINI')}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: Config.geminiTemp(model, 'avaliacao'), responseMimeType: 'application/json', maxOutputTokens: 64000 },
  };
  const resp = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true,
  });
  if (resp.getResponseCode() !== 200) throw new Error(`Gemini ${resp.getResponseCode()}: ${resp.getContentText()}`);
  return JSON.parse(resp.getContentText()).candidates[0].content.parts[0].text;
}


// ═══════════════════════════════════════════════════════════════════════════════
// CHECK DE COERÊNCIA — e-mail ao gestor
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * v7: busca o e-mail do gestor a partir do e-mail do colaborador.
 */
function _buscarEmailGestor(emailColab, wsColab) {
  if (!wsColab || !emailColab) return null;
  try {
    const dados   = wsColab.getDataRange().getValues();
    const headers = dados[3];
    const iEmail  = _idxEmailColab(headers);
    // Busca coluna e-mail do gestor: prefere "gestor"+"email", aceita "e-mail" logo após emailColab
    const iGestor = (() => {
      let i = headers.findIndex(h => {
        const n = _norm(String(h||'')).toLowerCase();
        return n.includes('gestor') && (n.includes('e-mail') || n.includes('email'));
      });
      if (i >= 0) return i;
      // Fallback: "E-mail" imediatamente após o bloco do colaborador (padrão da planilha Vertho)
      if (iEmail >= 0) {
        // pula colunas intermediárias (Nome) até achar "e-mail" / "email"
        for (let j = iEmail + 1; j < headers.length; j++) {
          const n = _norm(String(headers[j]||'')).toLowerCase();
          if (n === 'e-mail' || n === 'email' || n.startsWith('e-mail') || n.startsWith('email')) return j;
        }
      }
      return -1;
    })();
    if (iEmail < 0 || iGestor < 0) return null;
    const linha  = dados.slice(4).find(row => _norm(String(row[iEmail] || '')).toLowerCase() === emailColab.toLowerCase());
    const email  = linha ? _norm(String(linha[iGestor] || '')) : '';
    return email || null;
  } catch (e) {
    Logger.log('_buscarEmailGestor: ' + e.message);
    return null;
  }
}

// Alerta de coerência: apenas no dossiê (não é mais enviado por e-mail).
// Função mantida como referência mas não é chamada.
function _montarEmailGestor(prof) {
  const itensComCheck = prof.itens.filter(it => it.check_coerencia && it.check_coerencia.alerta);
  if (itensComCheck.length === 0) return null;

  const ordem = { '🔴': 0, '🟠': 1, '🟡': 2, '🟢': 3 };
  itensComCheck.sort((a, b) => (ordem[a.check_coerencia.alerta]||9) - (ordem[b.check_coerencia.alerta]||9));

  const alertaGeral = itensComCheck[0].check_coerencia.alerta;
  const classGeral  = itensComCheck[0].check_coerencia.classificacao;

  let corpo =
    `Olá,\n\nO diagnóstico de ${prof.nome} (${prof.cargo}) foi concluído.\n\n` +
    `ALERTA GERAL: ${alertaGeral} ${classGeral}\n${'─'.repeat(55)}\n\n`;

  itensComCheck.forEach(it => {
    const cc = it.check_coerencia;
    corpo +=
      `${cc.alerta}  ${it.comp}\n   Classificação: ${cc.classificacao}\n` +
      `   Diagnóstico: ${cc.diagnostico}\n   Impacto no PDI: ${cc.impacto_pdi}\n\n`;
  });

  corpo +=
    `${'─'.repeat(55)}\nLEGENDA:\n` +
    `🔴 Incoerência Alta — agende 1-on-1 em até 7 dias.\n` +
    `🟠 Incoerência Moderada — simulações compatíveis com perfil.\n` +
    `🟡 Potencial Represado — PDI foca em confiança e aplicação.\n` +
    `🟢 Alta Coerência — PDI de aprofundamento.\n\nEquipe Vertho`;

  return corpo;
}


// ═══════════════════════════════════════════════════════════════════════════════
// RELATÓRIO DO GESTOR
// ═══════════════════════════════════════════════════════════════════════════════

function gerarDossieGestorManual() {
  _carregarCFG();
  const ss          = SpreadsheetApp.getActiveSpreadsheet();
  const wsRespostas = ss.getSheetByName(ABA_RESPOSTAS);
  const wsColab     = ss.getSheetByName('Colaboradores');
  if (!wsRespostas) { SpreadsheetApp.getUi().alert('❌ Aba Respostas não encontrada.'); return; }

  const headers    = wsRespostas.getRange(1, 1, 1, wsRespostas.getLastColumn()).getValues()[0];
  const dados      = wsRespostas.getDataRange().getValues();
  const iIdColab   = (() => { let i = headers.findIndex(h => _norm(h) === 'ID Colaborador'); return i >= 0 ? i : headers.findIndex(h => _norm(h).toLowerCase() === 'e-mail'); })();
  const iNomeColab = headers.findIndex(h => _norm(h) === 'Nome Colaborador');
  const iEmpresa   = headers.findIndex(h => _norm(h) === 'Empresa');
  const iCargo     = headers.findIndex(h => _norm(h) === 'Cargo');
  const iNomeComp  = headers.findIndex(h => _norm(h) === 'Nome Competência');
  const iIdComp    = headers.findIndex(h => _norm(h) === 'ID Competência');
  const iNivel     = headers.findIndex(h => _norm(h) === 'Nível IA4');
  const iNota      = headers.findIndex(h => _norm(h) === 'Nota IA4');
  const iFortes    = headers.findIndex(h => _norm(h) === 'Pontos Fortes');
  const iAtencao   = headers.findIndex(h => _norm(h) === 'Pontos de Atenção');
  const iPayload   = headers.findIndex(h => _norm(h) === 'Payload IA4');
  const iStatus    = headers.findIndex(h => _norm(h) === 'Status IA 4');

  // V2: cache de nomes de competências para lookup rápido
  const _mapaV2NomesGestor = (function() {
    var m = _lerBaseCompetenciasV2(ss);
    var nomes = {};
    Object.keys(m).forEach(function(cod) { nomes[cod.toUpperCase()] = m[cod].nome; });
    return nomes;
  })();

  const grupos = {};
  dados.slice(1).forEach((row, idx) => {
    const status = _norm(String(row[iStatus] || '')).toLowerCase();
    if (!row[iNomeColab]) return;
    if (status !== 'avaliado' && status !== 'pdf enviado') return;

    // Payload com fallback: se vazio ou JSON inválido, monta estrutura mínima
    // a partir das colunas individuais para não perder o colaborador
    let dF = {};
    const payloadRaw = row[iPayload];
    if (payloadRaw && String(payloadRaw).trim()) {
      try { dF = JSON.parse(String(payloadRaw)); } catch(e) {
        _addLog(`⚠️ Relatório do Gestor: payload inválido linha ${idx+2} — usando colunas individuais.`);
      }
    }
    // Garantir campos mínimos do dF a partir das colunas da planilha
    if (!dF.cargo)    dF.cargo    = _norm(String(row[iCargo]     || ''));
    if (!dF.prefPdi)  dF.prefPdi  = 'E-mail';
    if (!dF.feedback_personalizado) dF.feedback_personalizado = _norm(String(row[iFeedback] || ''));
    if (!dF.check_coerencia) dF.check_coerencia = null;
    if (!dF.perfil_dados)    dF.perfil_dados    = null;
    if (!dF.plano)           dF.plano           = null;
    if (!Array.isArray(dF.dicas)) dF.dicas      = [];
    if (!Array.isArray(dF.cola))  dF.cola        = [];
    if (!dF.links)           dF.links           = '';

    // Nível: necessário para o dossiê
    if (!row[iNivel] && !dF.nivel) return;

    const emailColab = _norm(String(row[iIdColab] || ''));
    if (!grupos[emailColab]) {
      grupos[emailColab] = {
        idColab:  emailColab,
        nome:     _norm(String(row[iNomeColab] || '')),
        cargo:    dF.cargo || _norm(String(row[iCargo] || '')),
        empresa:  _norm(String(row[iEmpresa] || '')),
        email:    emailColab,
        prefPdi:  dF.prefPdi || 'E-mail',
        wpp:      '',
        itens:    [],
        linhas:   [],
      };
    }

    const nivel    = parseInt(row[iNivel]) || 1;
    const nDecimal = parseFloat((row[iNota] || '0').toString().replace(',', '.')) || nivel;

    let compNome = _norm(String(row[iNomeComp] || ''));
    if (!compNome || /^[Cc]\d{2,4}$/.test(compNome)) {
      // V2: lookup por código no cache
      const idBusca = _norm(String(row[iIdComp] || compNome));
      if (idBusca && _mapaV2NomesGestor[idBusca.toUpperCase()]) {
        compNome = _mapaV2NomesGestor[idBusca.toUpperCase()];
      }
    }

    grupos[emailColab].itens.push({
      comp: compNome,
      nivel, decimal: nDecimal,
      definicao:  _ia4Safe(dF.definicao),
      fortes:     _ia4Safe(row[iFortes]),
      atencao:    _ia4Safe(row[iAtencao]),
      feedback:   _ia4Safe(dF.feedback_personalizado),
      plano30:    dF.plano  || null,
      dicasN3:    Array.isArray(dF.dicas) ? dF.dicas : [],
      perfil:     dF.perfil_dados || null,
      cola:       Array.isArray(dF.cola) ? dF.cola : [],
      links:      _ia4Safe(dF.links || ''),
      check_coerencia: dF.check_coerencia || null,
    });
    grupos[emailColab].linhas.push(idx + 2);
  });

  if (Object.keys(grupos).length === 0) {
    SpreadsheetApp.getUi().alert('Nenhum colaborador com avaliação encontrado.');
    return;
  }

// v7.1: Pasta dedicada para Relatório do Gestor
  const folder = DriveApp.getFolderById(PASTA_RELATORIOS);

  const n = _gerarDossiesGestor(grupos, wsColab, folder);
  SpreadsheetApp.getUi().alert(`📂 Relatório do Gestor\n\n✅ ${n} dossiê(s) gerado(s) e enviado(s).`);
}

function _gerarDossiesGestor(grupos, wsColab, folder) {
  // v7: _mapearGestoresPorColab indexa por e-mail do colaborador
  const gestoresPorColab = _mapearGestoresPorColab(wsColab);

  const porGestor = {};
  for (const emailColab in grupos) {
    const prof = grupos[emailColab];
    const gest = gestoresPorColab[emailColab.toLowerCase()] || gestoresPorColab[emailColab];
    if (!gest || !gest.email) {
      _addLog(`⚠️ Relatório do Gestor: colaborador "${prof.nome}" (${emailColab}) sem gestor mapeado — email não encontrado em Colaboradores.`);
      continue;
    }
    if (!porGestor[gest.email]) {
      porGestor[gest.email] = {
        nomeGestor:  gest.nome,
        emailGestor: gest.email,
        empresa:     prof.empresa,
        profs:       [],
      };
    }
    porGestor[gest.email].profs.push(prof);
  }

  const gestores = Object.keys(porGestor);
  if (gestores.length === 0) {
    // Diagnóstico detalhado para o usuário ver o que aconteceu
    const keysGrupos    = Object.keys(grupos);
    const keysGestores  = Object.keys(gestoresPorColab);
    const msg =
      `Relatório do Gestor: nenhum gestor mapeado.\n` +
      `Colaboradores em grupos: ${keysGrupos.join(', ') || 'nenhum'}\n` +
      `Chaves no mapa de gestores: ${keysGestores.join(', ') || 'nenhuma'}\n` +
      `wsColab recebido: ${wsColab ? 'sim' : 'null'}`;
    Logger.log(msg);
    SpreadsheetApp.getUi().alert('⚠️ Relatório do Gestor — Diagnóstico\n\n' + msg);
    return 0;
  }

  let gerados = 0;
  gestores.forEach(emailGestor => {
    const grp = porGestor[emailGestor];
    try {
      SpreadsheetApp.getActive().toast(`[${Config.modelLabel(_CFG.modelo)}]
📂 ${grp.nomeGestor} — chamando IA...`, '⏳ Relatório do Gestor', 5);
      const analise = _iaGerarDossie(grp);

      SpreadsheetApp.getActive().toast(`📂 ${grp.nomeGestor} — criando documento...`, '⏳ Relatório do Gestor', 5);
      let docFile;
      if (DOSSIE_ID_TEMPLATE) {
        // Usar template — preserva logo e rodapé via makeCopy()
        const templateFile = DriveApp.getFileById(DOSSIE_ID_TEMPLATE);
        const copia = templateFile.makeCopy(`Relatório do Gestor — ${grp.nomeGestor}`, folder);
        const doc   = DocumentApp.openById(copia.getId());
        const body  = doc.getBody();

        // Substituir marcadores simples de texto
        body.replaceText('\{\{GESTOR\}\}',  _norm(grp.nomeGestor || ''));
        body.replaceText('\{\{EMPRESA\}\}', _norm(grp.empresa    || ''));
        body.replaceText('\{\{DATA\}\}',    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy'));
        body.replaceText('\{\{N_COLAB\}\}', String(grp.profs ? grp.profs.length : ''));

        // Encontrar marcador {{CONTEUDO_DOSSIE}} e injetar conteúdo nesse ponto
        const range = body.findText('\{\{CONTEUDO_DOSSIE\}\}');
        if (range) {
          const par = range.getElement().getParent();
          const insertIdx = body.getChildIndex(par);
          par.asParagraph().setText(' ');  // limpa o marcador
          _renderizarDossieNoIndice(body, insertIdx, grp, analise);
        } else {
          // Marcador não encontrado — appenda no final (fallback)
          _renderizarDossie(body, grp, analise);
        }

        doc.saveAndClose();
        docFile = copia;
      } else {
        // Sem template — criar doc em branco (fallback)
        const doc = DocumentApp.create(`Relatório do Gestor — ${grp.nomeGestor}`);
        _renderizarDossie(doc.getBody(), grp, analise);
        doc.saveAndClose();
        docFile = DriveApp.getFileById(doc.getId());
      }

      SpreadsheetApp.getActive().toast(`📂 ${grp.nomeGestor} — gerando PDF...`, '⏳ Relatório do Gestor', 5);
      const pdfBlob = docFile.getAs(MimeType.PDF);
      const pdfFile = folder.createFile(pdfBlob).setName(`Relatório do Gestor — ${grp.nomeGestor}.pdf`);
      docFile.setTrashed(true);
      _addLog(`📂 Relatório do Gestor salvo no Drive: ${pdfFile.getName()}`);

      try {
        GmailApp.sendEmail(emailGestor,
          `[Vertho] RELATÓRIO DO GESTOR — diagnóstico da sua equipe`,
          `Olá, ${grp.nomeGestor.split(' ')[0]}!\n\n` +
          `O RELATÓRIO DO GESTOR com o diagnóstico completo da sua equipe está em anexo.\n\n` +
          `Equipe Vertho`,
          { name: NOME_REMETENTE, attachments: [pdfBlob],
            from: EMAIL_REMETENTE }
        );
      } catch(eMail) {
        // Fallback sem alias — pode acontecer se alias não configurado na conta
        GmailApp.sendEmail(emailGestor,
          `[Vertho] RELATÓRIO DO GESTOR — diagnóstico da sua equipe`,
          `Olá, ${grp.nomeGestor.split(' ')[0]}!\n\n` +
          `O RELATÓRIO DO GESTOR com o diagnóstico completo da sua equipe está em anexo.\n\n` +
          `Equipe Vertho`,
          { name: NOME_REMETENTE, attachments: [pdfBlob] }
        );
        _addLog('⚠️ Relatório do Gestor enviado sem alias: ' + eMail.message);
      }

      gerados++;
      _addLog(`📂 Relatório do Gestor enviado: ${grp.nomeGestor} <${emailGestor}>`);
    } catch (e) {
      const msgErro = `Dossiê ${grp.nomeGestor}: ${e.message}`;
      Logger.log(`${msgErro}\nStack: ${e.stack || 'N/A'}`);
      _addLog(`❌ Erro Relatório do Gestor: ${msgErro}`);
      // Toast é mais confiável que alert em contexto de erro
      try { SpreadsheetApp.getActive().toast(msgErro, '❌ Erro ao gerar Relatório do Gestor', 30); } catch(_) {}
      try { SpreadsheetApp.getUi().alert(`❌ Erro ao gerar Relatório do Gestor\n\n${msgErro}`); } catch(_) {}
    }
  });

  return gerados;
}

function _iaGerarDossie(grp) {
  const resumoProfs = grp.profs.map(prof => {
    const alertaGeral = prof.itens.reduce((pior, it) => {
      const ord = { '🔴': 0, '🟠': 1, '🟡': 2, '🟢': 3 };
      const al  = it.check_coerencia?.alerta || '🟢';
      return (ord[al] ?? 9) < (ord[pior] ?? 9) ? al : pior;
    }, '🟢');
    const perfilCIS = prof.itens[0]?.perfil?.perfil || 'Não informado';
    const comps = prof.itens.map(it =>
      `    - ${it.comp}: Nível ${it.nivel} | Alerta ${it.check_coerencia?.alerta || '🟢'} ${it.check_coerencia?.classificacao || 'Alta Coerência'} | Gap: ${_ia4Safe(it.atencao).split('\n')[0]}`
    ).join('\n');
    const gancho = prof.itens[0]?.plano30?.semana_1_2?.acoes?.[0] || 'Consultar PDI';
    return `COLABORADOR: ${prof.nome} (${prof.cargo}) | Perfil CIS: ${perfilCIS} | Alerta Geral: ${alertaGeral}\n${comps}\n  Missão Semana 1: ${gancho}`;
  }).join('\n\n');

  const prompt =
    `Você é a IA de desenvolvimento humano da Vertho. Analise o diagnóstico da equipe do gestor ${grp.nomeGestor}.\n\n` +
    `DADOS:\n${resumoProfs}\n\n` +
    `Gere o Dossiê completo com EXATAMENTE os campos abaixo. Regras obrigatórias:\n` +
    `• mapa_calor: barras 0-10 pela proporção D/I/S/C real da equipe. nivel: CRÍTICO/BAIXO/MÉDIO/ALTO.\n` +
    `• forcas_grupo: 2-3 pontos FORTES genuínos da equipe (não gaps). Frase curta, acionável.\n` +
    `• a_desenvolver_grupo: 2-3 lacunas coletivas. Frase curta, impacto no trabalho.\n` +
    `• dinamica_reuniao: dinâmica concreta de 20-30min para a próxima reunião pedagógica.\n` +
    `• plano_gestor: ações do GESTOR (não do colaborador). 7 dias = foque nos colaboradores com mais estrelas no ranking (mais urgentes: 🔴/🟠 com 4-5 estrelas), cite o nome; 30 dias = estrutural; 60 dias = estratégico. O plano DEVE ser coerente com o ranking — quem tem menos estrelas NÃO aparece como urgente em 7 dias.\n` +
    `• ranking[].gap_curto: máx 6 palavras, linguagem direta (ex: "Promete mas esquece o follow-up").\n` +
    `• ranking[].estrelas: 1-5 baseado na gravidade do impacto no trabalho.\n` +
    `• roteiros[NOME].ponto_forte: a competência mais forte desta pessoa e como usá-la como ANCORAGEM no início do feedback.\n` +
    `• roteiros[NOME].risco_oculto: o que acontece se o gestor NÃO agir — 1 frase direta sobre consequência real.\n` +
    `• roteiros[NOME].perguntas: exatamente 2 perguntas coaching, específicas para o perfil CIS desta pessoa.\n` +
    `• Todos os campos de texto: máx 3 frases. Direto ao ponto. Evite jargão.\n\n` +
    `Retorne APENAS JSON sem markdown:\n` +
    `{\n` +
    `  "executive_summary":{\n` +
    `    "situacao":"...",\n` +
    `    "risco":"...",\n` +
    `    "mapa_calor":{\n` +
    `      "D":{"barras":8,"nivel":"ALTO","risco":"Impaciência e atropelos"},\n` +
    `      "I":{"barras":7,"nivel":"ALTO","risco":"Boa energia, mas dispersos"},\n` +
    `      "S":{"barras":3,"nivel":"BAIXO","risco":"Pouca empatia com famílias"},\n` +
    `      "C":{"barras":2,"nivel":"CRÍTICO","risco":"Falta de padrão e documentação"}\n` +
    `    }\n` +
    `  },\n` +
    `  "forcas_e_gaps":{\n` +
    `    "forcas_grupo":["força 1","força 2"],\n` +
    `    "a_desenvolver_grupo":["gap 1","gap 2"],\n` +
    `    "dinamica_reuniao":{"foco":"...","tempo":"20min","descricao":"..."}\n` +
    `  },\n` +
    `  "raio_x":{"quimica_equipe":"...","gap_mais_comum":"...","perfis_dominantes":"...","recomendacao_lider":"..."},\n` +
    `  "ranking":[{"nome":"...","cargo":"...","perfil":"...","alerta":"🟠","classificacao":"...","gap_curto":"...","estrelas":3}],\n` +
    `  "roteiros":{"[NOME]":{"contexto":"...","ponto_forte":"...","falar":"...","nao_falar":"...","perguntas":["P1?","P2?"],"risco_oculto":"...","gancho_pdi":"..."}},\n` +
    `  "plano_gestor":{\n` +
    `    "dias_7":["ação urgente 1","ação urgente 2","ação urgente 3"],\n` +
    `    "dias_30":["ação estrutural 1","ação estrutural 2","ação estrutural 3"],\n` +
    `    "dias_60":["ação estratégica 1","ação estratégica 2","ação estratégica 3"]\n` +
    `  }\n` +
    `}`;

  let tentativa = 0;
  while (tentativa < 3) {
    tentativa++;
    try {
      const provedor = _CFG.provedor || 'CLAUDE';
      let jsonTexto = provedor === 'GEMINI'
        ? _ia4GeminiRaw(_CFG.modelo || 'gemini-3.1-flash-lite-preview', prompt)
        : _ia4ClaudeRaw(_CFG.modelo || MODEL_SONNET, prompt, false);
      let limpo = jsonTexto.replace(/```json/g, '').replace(/```/g, '').trim();
      const ini = limpo.indexOf('{'), fim = limpo.lastIndexOf('}') + 1;
      if (ini !== -1 && fim > ini) limpo = limpo.substring(ini, fim);
      return JSON.parse(limpo);
    } catch (e) {
      Logger.log(`_iaGerarDossie tentativa ${tentativa}: ${e.message}`);
      if (tentativa >= 3) {
        // Último erro — loga com mais detalhe para diagnóstico
        Logger.log(`_iaGerarDossie falhou 3x. Provedor: ${_CFG.provedor} | Modelo: ${_CFG.modelo} | Erro: ${e.stack || e.message}`);
      }
      Utilities.sleep(2000 * tentativa);
    }
  }
  return { raio_x: null, roteiros: {} };
}

/**
 * Versão do renderizarDossie para uso com template.
 * Insere o conteúdo a partir do índice idx no body,
 * usando insertParagraph para posicionar corretamente após o marcador.
 * Na prática, como o template só tem logo/header e rodapé fora do body,
 * o marcador fica sozinho no body — então append funciona igual.
 */
function _renderizarDossieNoIndice(body, startIdx, grp, analise) {
  // Remover todos os parágrafos vazios abaixo do marcador
  // (Google Docs sempre tem pelo menos 1 parágrafo vazio no final)
  // Depois disso, appendar normalmente — o resultado fica logo após o marcador
  _renderizarDossie(body, grp, analise);
}

// ═══════════════════════════════════════════════════════════════════════════════
// DOSSIÊ — GRÁFICO COMPARATIVO + LOOKER STUDIO + QR CODE
// ═══════════════════════════════════════════════════════════════════════════════

/** Retorna a URL do Looker Studio. Se parâmetro configurado, filtra por gestor. */
function _getLookerUrl(nomeGestor) {
  const p        = PropertiesService.getScriptProperties();
  const baseUrl  = p.getProperty('cfg_looker_url')
                || 'https://lookerstudio.google.com/u/0/reporting/e86b618e-4cdf-4fde-abef-6fc8d061e792/page/5Y9nF';
  if (!baseUrl) return null;
  const paramKey = (p.getProperty('cfg_looker_param') || '').trim();
  // Sem parâmetro configurado → URL fixa (mesmo dashboard para todos)
  if (!paramKey) return baseUrl;
  return `${baseUrl.replace(/\/$/, '')}?${paramKey}=${encodeURIComponent(nomeGestor)}`;
}

/**
 * Gera um gráfico de barras agrupadas com pontuação média por competência.
 * Retorna um InlineImage para inserir no Doc, ou null em caso de falha.
 * Usa uma planilha temporária (deletada ao final).
 */
/**
 * Converte decimal (0-5) para nível numérico para o gráfico.
 * CRÍTICO=1, BAIXO=2, MÉDIO=3, ALTO=4
 */
function _decimalToNivel(decimal) {
  if (decimal < 1) return 1; // CRÍTICO
  if (decimal < 2) return 2; // BAIXO
  if (decimal < 3) return 3; // MÉDIO
  return 4;                  // ALTO
}

/**
 * Gera um gráfico de barras (COLUMN) para um grupo de colaboradores.
 * Eixo Y: nível (1-5: CRÍTICO → EXCELENTE). Legenda abaixo.
 * Retorna Blob PNG ou null.
 */
function _gerarGrafico(profs, comps, titulo, ss) {
  const cores = ['#2471A3','#C0392B','#1A7A4A','#E67E22','#8E44AD','#17A589'];
  const header = ['Competência', ...profs.map(p => p.nome)];
  const rows = comps.map(comp => {
    const row = [comp];
    profs.forEach(prof => {
      const it = prof.itens.find(i => (i.comp || '').trim() === comp);
      row.push(it ? _decimalToNivel(it.decimal || 0) : 0);
    });
    return row;
  });

  const sheetName = titulo.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);
  const sheet = ss.insertSheet(sheetName);
  sheet.getRange(1, 1, rows.length + 1, header.length).setValues([header, ...rows]);

  const range = sheet.getRange(1, 1, rows.length + 1, header.length);
  const chart = sheet.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(range)
    .setPosition(1, 1, 0, 0)
    .setOption('title', titulo)
    .setOption('titleTextStyle', { fontSize: 10, bold: true, color: '#0F2B54' })
    .setOption('width',  260)
    .setOption('height', 280)
    .setOption('vAxis', {
      title: 'Nível (1=Crítico  2=Baixo  3=Médio  4=Alto)',
      minValue: 0, maxValue: 4,
      textStyle: { fontSize: 7 }
    })
    .setOption('hAxis', { textStyle: { fontSize: 7 }, slantedText: true, slantedTextAngle: 40 })
    .setOption('legend', { position: 'bottom', textStyle: { fontSize: 14, bold: true }, maxLines: 3 })
    .setOption('colors', cores.slice(0, profs.length))
    .setOption('isStacked', false)
    .build();

  sheet.insertChart(chart);
  SpreadsheetApp.flush();
  Utilities.sleep(2500);

  try {
    return sheet.getCharts()[0].getBlob().setName(titulo + '.png');
  } catch(e) {
    Logger.log('_gerarGrafico blob erro: ' + e.message);
    return null;
  }
}

/**
 * Gera dois gráficos lado a lado: Professores | Coordenadores.
 * Retorna { blobs: [blobProf, blobCoord], labels: ['Professores', 'Coordenadores'] }
 * Se só houver um grupo, retorna 1 blob.
 */
function _gerarGraficoComparativo(grp) {
  let ss = null;
  try {
    // Separar por função (cargo)
    const professores = grp.profs.filter(p =>
      (p.cargo || '').toLowerCase().includes('professor')
    );
    const coordenadores = grp.profs.filter(p =>
      !(p.cargo || '').toLowerCase().includes('professor')
    );

    // Planilha temporária única (múltiplas abas)
    ss = SpreadsheetApp.create('_vertho_tmp_chart_' + Date.now());
    const defaultSheet = ss.getActiveSheet();

    const grupos = [
      { profs: professores.length > 0 ? professores : grp.profs,
        titulo: professores.length > 0 ? 'Professores' : 'Equipe' },
      { profs: coordenadores,
        titulo: 'Coordenadores' },
    ].filter(g => g.profs.length > 0);

    if (grupos.length === 0) return null;

    // Competências por grupo (só as do cargo)
    const blobs = grupos.map(g => {
      const compsGrupo = [];
      g.profs.forEach(prof => {
        prof.itens.forEach(it => {
          const nome = (it.comp || '').trim();
          if (nome && !compsGrupo.includes(nome)) compsGrupo.push(nome);
        });
      });
      return compsGrupo.length > 0 ? _gerarGrafico(g.profs, compsGrupo, g.titulo, ss) : null;
    });
    try { ss.deleteSheet(defaultSheet); } catch(_) {}

    return { blobs: blobs.filter(Boolean), labels: grupos.map(g => g.titulo) };
  } catch (e) {
    Logger.log('_gerarGraficoComparativo erro: ' + e.message);
    return null;
  } finally {
    try { if (ss) DriveApp.getFileById(ss.getId()).setTrashed(true); } catch(_) {}
  }
}

/**
 * Gera um QR Code como Blob PNG via Google Charts API.
 * Retorna null em caso de falha.
 */
function _gerarQRCode(url) {
  try {
    const qrUrl  = `https://chart.googleapis.com/chart?chs=120x120&cht=qr&chl=${encodeURIComponent(url)}&choe=UTF-8`;
    const blob   = UrlFetchApp.fetch(qrUrl, { muteHttpExceptions: true }).getBlob().setName('qrcode.png');
    return blob;
  } catch (e) {
    Logger.log('_gerarQRCode erro: ' + e.message);
    return null;
  }
}

function _renderizarDossie(body, grp, analise) {
  const C_TITULO   = '#0F2B54';
  const C_SECAO    = '#0F2B54';
  const hoje       = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy');
  const exec       = analise?.executive_summary || null;
  const feg        = analise?.forcas_e_gaps     || null;
  const raiox      = analise?.raio_x            || null;
  const rankingIA  = analise?.ranking           || [];
  const roteiros   = analise?.roteiros          || {};
  const planoG     = analise?.plano_gestor      || null;

  const ordemAlerta = { '🔴': 0, '🟠': 1, '🟡': 2, '🟢': 3 };
  // Ordenar por estrelas da IA (desc) → alerta (asc) → média (asc)
  const profsOrdenados = [...grp.profs].sort((a, b) => {
    const getEstrelas = p => {
      const r = rankingIA.find(r => _norm(r.nome||'').toLowerCase() === _norm(p.nome).toLowerCase()) || {};
      if (r.estrelas) return r.estrelas;
      // fallback: pior alerta
      const ordemParaEst = { '🔴': 5, '🟠': 4, '🟡': 2, '🟢': 1 };
      const piorAl = p.itens.reduce((pior, it) => {
        const o = ordemAlerta[it.check_coerencia?.alerta || '🟢'] ?? 9;
        return o < (ordemAlerta[pior] ?? 9) ? (it.check_coerencia?.alerta || '🟢') : pior;
      }, '🟢');
      return ordemParaEst[piorAl] || 1;
    };
    const diffEst = getEstrelas(b) - getEstrelas(a); // desc: mais estrelas primeiro
    if (diffEst !== 0) return diffEst;
    const med = p => p.itens.reduce((s, it) => s + it.decimal, 0) / (p.itens.length || 1);
    return med(a) - med(b);
  });

  // helper: tabela de 2 colunas label|valor sem borda
  function _t2(rows, labelW) {
    const t = body.appendTable();
    t.setBorderWidth(0);
    rows.forEach(([label, valor, bgL, bgV], i) => {
      const bL = bgL || (i % 2 === 0 ? '#D6E4F7' : '#E3EEF9');
      const bV = bgV || (i % 2 === 0 ? '#FFFFFF'  : '#F7FBFF');
      const row = t.appendTableRow();
      row.appendTableCell(label)
        .setBackgroundColor(bL).setWidth(labelW || 170)
        .setPaddingTop(7).setPaddingBottom(7).setPaddingLeft(10).setPaddingRight(6)
        .editAsText().setBold(true).setForegroundColor(C_TITULO).setFontSize(10);
      row.appendTableCell(valor || '—')
        .setBackgroundColor(bV)
        .setPaddingTop(7).setPaddingBottom(7).setPaddingLeft(10).setPaddingRight(10)
        .editAsText().setBold(false).setForegroundColor('#0F2B54').setFontSize(10);
    });
    return t;
  }

  // helper: título de seção
  function _h2(txt) {
    body.appendParagraph(txt)
      .setHeading(DocumentApp.ParagraphHeading.HEADING2).setForegroundColor(C_TITULO);
  }
  function _h3(txt) {
    body.appendParagraph(txt)
      .setHeading(DocumentApp.ParagraphHeading.HEADING3).setForegroundColor(C_SECAO);
  }
  function _sp() { body.appendParagraph(' '); }
  function _hr() { body.appendHorizontalRule(); }

  // ══════════════════════════════════════════════════════════════════════════
  // CAPA
  // ══════════════════════════════════════════════════════════════════════════
  body.appendParagraph('RELATÓRIO DO GESTOR')
    .setHeading(DocumentApp.ParagraphHeading.HEADING1)
    .setForegroundColor(C_TITULO).editAsText().setBold(true);
  body.appendParagraph(`Gestor(a): ${grp.nomeGestor}`)
    .editAsText().setBold(true).setForegroundColor(C_SECAO);
  body.appendParagraph(`Empresa: ${grp.empresa} | Data: ${hoje} | ${grp.profs.length} colaborador(es)`)
    .editAsText().setBold(false);
  _sp(); _hr(); _sp();

  // ══════════════════════════════════════════════════════════════════════════
  // 1. VISÃO EXECUTIVA — Mapa de Calor + Risco
  // ══════════════════════════════════════════════════════════════════════════
  _h2('1. Visão Executiva');

  if (exec) {
    // Situação geral
    _t2([['📋  Situação da equipe', exec.situacao || '—']]);
    _sp();

    // Mapa de Calor DISC + Risco Institucional lado a lado
    const mc     = exec.mapa_calor || {};
    const tMC    = body.appendTable();
    tMC.setBorderWidth(0);

    // Cabeçalhos
    const rH = tMC.appendTableRow();
    rH.appendTableCell('📊  Mapa de Calor da Equipe (DISC)')
      .setBackgroundColor(C_TITULO).setWidth(285)
      .setPaddingTop(6).setPaddingBottom(6).setPaddingLeft(10).setPaddingRight(6)
      .editAsText().setBold(true).setForegroundColor('#FFFFFF').setFontSize(10);
    rH.appendTableCell('🚨  Risco Institucional')
      .setBackgroundColor('#8B1A1A').setWidth(195)
      .setPaddingTop(6).setPaddingBottom(6).setPaddingLeft(10).setPaddingRight(6)
      .editAsText().setBold(true).setForegroundColor('#FFFFFF').setFontSize(10);

    // Conteúdo
    const rC = tMC.appendTableRow();
    const discItems = [
      { k:'D', label:'D — Execução / Resultado'      },
      { k:'I', label:'I — Comunicação / Engajamento' },
      { k:'S', label:'S — Acolhimento / Escuta'      },
      { k:'C', label:'C — Organização / Processos'   },
    ];
    const mapaCell = rC.appendTableCell('')
      .setBackgroundColor('#F7FBFF').setWidth(285)
      .setPaddingTop(10).setPaddingBottom(10).setPaddingLeft(10).setPaddingRight(8);
    // Usar o parágrafo inicial da célula para o primeiro item
    let mapaFirst = true;
    discItems.forEach(({ k, label }) => {
      const d     = mc[k] || {};
      const bar   = Math.max(0, Math.min(10, d.barras || 5));
      const fill  = '█'.repeat(bar) + '░'.repeat(10 - bar);
      const nivel = d.nivel || '—';
      const risco = d.risco ? 'Risco: ' + d.risco : '';

      // Linha 1: DISC label (negrito)
      const pLabel = mapaFirst
        ? mapaCell.getChild(0).asParagraph()
        : mapaCell.appendParagraph('');
      mapaFirst = false;
      pLabel.clear();
      pLabel.appendText(label)
        .setItalic(false).setBold(true).setFontSize(9).setForegroundColor('#0F2B54');

      // Linha 2: [barra]  NIVEL
      mapaCell.appendParagraph('[' + fill + ']  ' + nivel)
        .editAsText().setItalic(false).setBold(false).setFontSize(9).setForegroundColor('#0F2B54');

      // Linha 3: Risco (vermelho itálico)
      if (risco) {
        mapaCell.appendParagraph(risco)
          .editAsText().setItalic(true).setBold(false).setFontSize(8).setForegroundColor('#8B0000');
      }

      // Linha em branco entre itens DISC
      mapaCell.appendParagraph('').editAsText().setFontSize(4);
    });

    const riscoTxt = exec.risco || '—';
    const riscoBg  = riscoTxt.toLowerCase().includes('alto') ? '#FFE0E0'
                   : riscoTxt.toLowerCase().includes('moderado') ? '#FFF3E0' : '#FFFDE7';
    rC.appendTableCell(riscoTxt)
      .setBackgroundColor(riscoBg).setWidth(195)
      .setPaddingTop(10).setPaddingBottom(10).setPaddingLeft(10).setPaddingRight(10)
      .editAsText().setForegroundColor('#8B0000').setFontSize(10).setBold(false);

    _sp();

    // ── Gráficos lado a lado: Professores | Coordenadores ────────────────
    const graficoResult = _gerarGraficoComparativo(grp);
    if (graficoResult && graficoResult.blobs && graficoResult.blobs.length > 0) {
      _h3('📊  Nível por Competência — Visão da Equipe');
      try {
        if (graficoResult.blobs.length === 1) {
          // Único grupo
          const img = body.appendImage(graficoResult.blobs[0]);
          img.setWidth(420);
        } else {
          // Dois gráficos lado a lado numa tabela sem borda
          const tGraf = body.appendTable();
          tGraf.setBorderWidth(0);
          const gRow = tGraf.appendTableRow();
          graficoResult.blobs.forEach((blob, gi) => {
            const gc = gRow.appendTableCell('')
              .setWidth(240)
              .setPaddingTop(0).setPaddingBottom(0)
              .setPaddingLeft(gi === 0 ? 0 : 8).setPaddingRight(gi === 0 ? 8 : 0);
            try {
              gc.getChild(0).asParagraph().appendInlineImage(blob)
                .setWidth(220).setHeight(240);
            } catch(eGI) {
              gc.getChild(0).asParagraph().appendText('Gráfico indisponível')
                .setFontSize(8).setForegroundColor('#999999');
            }
          });
        }
      } catch(eImg) {
        Logger.log('Inserir gráfico: ' + eImg.message);
      }
      _sp();
    }

  } else {
    body.appendParagraph('(Análise IA não disponível.)').setItalic(true);
    _sp();
  }
  _hr(); _sp();

  // ══════════════════════════════════════════════════════════════════════════
  // 2. FORÇAS & GAPS DA EQUIPE + DINÂMICA DE REUNIÃO
  // ══════════════════════════════════════════════════════════════════════════
  _h2('2. Forças & Gaps da Equipe');

  if (feg) {
    // Tabela 2 colunas: forças | a desenvolver
    const tFG = body.appendTable();
    tFG.setBorderWidth(1);
    const fgH = tFG.appendTableRow();
    fgH.appendTableCell('💪  Pontos Fortes')
      .setBackgroundColor('#1A6B3C').setWidth(240)
      .setPaddingTop(6).setPaddingBottom(6).setPaddingLeft(10).setPaddingRight(6)
      .editAsText().setBold(true).setForegroundColor('#FFFFFF').setFontSize(10);
    fgH.appendTableCell('🎯  A Desenvolver como Grupo')
      .setBackgroundColor('#7B3F00').setWidth(240)
      .setPaddingTop(6).setPaddingBottom(6).setPaddingLeft(10).setPaddingRight(6)
      .editAsText().setBold(true).setForegroundColor('#FFFFFF').setFontSize(10);

    const maxLen = Math.max(
      (feg.forcas_grupo || []).length,
      (feg.a_desenvolver_grupo || []).length
    );
    for (let i = 0; i < maxLen; i++) {
      const forca = (feg.forcas_grupo || [])[i] || '';
      const gap   = (feg.a_desenvolver_grupo || [])[i] || '';
      const dRow  = tFG.appendTableRow();
      dRow.appendTableCell(forca ? `✅  ${forca}` : '')
        .setBackgroundColor('#F0FFF4').setWidth(240)
        .setPaddingTop(6).setPaddingBottom(6).setPaddingLeft(10).setPaddingRight(8)
        .editAsText().setForegroundColor('#1A6B3C').setFontSize(10);
      dRow.appendTableCell(gap ? `⚠️  ${gap}` : '')
        .setBackgroundColor('#FFF8F0').setWidth(240)
        .setPaddingTop(6).setPaddingBottom(6).setPaddingLeft(10).setPaddingRight(8)
        .editAsText().setForegroundColor('#7B3F00').setFontSize(10);
    }
    _sp();

    // Dinâmica para próxima reunião
    if (feg.dinamica_reuniao) {
      const din = feg.dinamica_reuniao;
      _h3('🗓️  Dinâmica para a Próxima Reunião Pedagógica');
      _t2([
        ['🎯  Foco',      din.foco        || '—', '#D6E4F7', '#F7FBFF'],
        ['⏱️  Tempo',     din.tempo       || '—', '#E3EEF9', '#FFFFFF'],
        ['📋  Como fazer', din.descricao  || '—', '#D6E4F7', '#F7FBFF'],
      ], 140);
    }
    _sp();
  } else {
    body.appendParagraph('(Análise IA não disponível.)').setItalic(true);
    _sp();
  }
  _hr(); _sp();

  // ══════════════════════════════════════════════════════════════════════════
  // 3. RANKING DE ATENÇÃO
  // ══════════════════════════════════════════════════════════════════════════
  _h2('3. Ranking de Atenção');
  const tRank = body.appendTable([['#','Colaborador','Cargo','Perfil','Alerta','Prioridade','Gap Principal']]);
  tRank.setBorderWidth(1);
  const rankW = [18, 80, 78, 65, 70, 58, 111];  // total=480
  const rankH = tRank.getRow(0);
  for (let i = 0; i < rankH.getNumCells(); i++) {
    rankH.getCell(i).setWidth(rankW[i] || 80)
      .setBackgroundColor(C_TITULO)
      .setPaddingTop(5).setPaddingBottom(5).setPaddingLeft(6).setPaddingRight(4)
      .editAsText().setForegroundColor('#FFFFFF').setBold(true).setFontSize(9);
  }
  profsOrdenados.forEach((prof, i) => {
    const alertaGeral = prof.itens.reduce((pior, it) => {
      const o = ordemAlerta[it.check_coerencia?.alerta || '🟢'] ?? 9;
      return o < (ordemAlerta[pior] ?? 9) ? (it.check_coerencia?.alerta || '🟢') : pior;
    }, '🟢');
    const piorIt   = prof.itens.find(it => (it.check_coerencia?.alerta || '🟢') === alertaGeral) || prof.itens[0];
    const perfilCIS = prof.itens[0]?.perfil?.perfil || '—';
    const iaRank    = rankingIA.find(r => _norm(r.nome||'').toLowerCase() === _norm(prof.nome).toLowerCase()) || {};
    // Estrelas = prioridade de atenção: 🔴=★★★★★ urgente, 🟢=★ monitoramento
    // IA retorna 5=mais urgente (mesma escala). Fallback por alerta se IA não retornar.
    const ordemParaEstrelas = { '🔴': 5, '🟠': 4, '🟡': 2, '🟢': 1 };
    const nEstrelas = Math.max(1, Math.min(5, iaRank.estrelas
      ? iaRank.estrelas
      : (ordemParaEstrelas[alertaGeral] || 1)));
    const estrelas  = '★'.repeat(nEstrelas) + '☆'.repeat(5 - nEstrelas);
    const gapCurto  = iaRank.gap_curto
      || piorIt.atencao.split('\n')[0].replace(/^[🔸•\-\s]+/,'').trim().slice(0, 55);
    const classif   = piorIt.check_coerencia?.classificacao || '';
    const bg = alertaGeral === '🔴' ? '#FFE0E0' : alertaGeral === '🟠' ? '#FFF3E0'
             : alertaGeral === '🟡' ? '#FFFDE7' : '#F1F8F1';

    const dRow = tRank.appendTableRow();
    [String(i+1), prof.nome, prof.cargo, perfilCIS, `${alertaGeral} ${classif}`, estrelas, gapCurto]
      .forEach((val, ci) => dRow.appendTableCell(val)
        .setWidth(rankW[ci] || 80).setBackgroundColor(bg)
        .setPaddingTop(5).setPaddingBottom(5).setPaddingLeft(6).setPaddingRight(4)
        .editAsText().setForegroundColor('#0F2B54').setFontSize(9).setBold(false));
  });
  _sp();
  body.appendParagraph('Legenda de Alerta: 🔴 Ação imediata  |  🟠 Incoerência Moderada  |  🟡 Potencial Represado  |  🟢 Alta Coerência  |  ★★★★★ ação urgente → ★ monitoramento')
  body.appendParagraph('⚠️  Nota: o alerta CIS mede coerência comportamental. Colaboradores com 🟢 podem ter risco institucional elevado (ex: postura com famílias) e aparecer como prioridade no Plano de Ação.')
    .setItalic(true).editAsText().setForegroundColor('#666666').setBold(false).setFontSize(9);
  _sp(); _hr(); _sp();

  // ══════════════════════════════════════════════════════════════════════════
  // 4. ALERTAS DE COERÊNCIA — 1 linha por competência
  // ══════════════════════════════════════════════════════════════════════════
  _h2('4. Alertas de Coerência — CIS × Execução');
  profsOrdenados.forEach(prof => {
    _h3(`▶  ${prof.nome}  |  ${prof.cargo}`);
    prof.itens.forEach(it => {
      const cc = it.check_coerencia;
      if (!cc) return;
      const al = cc.alerta || '🟢';
      const bg = al === '🔴' ? '#FFE0E0' : al === '🟠' ? '#FFF3E0'
               : al === '🟡' ? '#FFFDE7' : '#F0FFF0';
      const resumo = cc.diagnostico ? cc.diagnostico.split('.')[0].trim() : cc.classificacao;
      const tCC = body.appendTable();
      tCC.setBorderWidth(0);
      tCC.appendTableRow().appendTableCell(`${al}  ${it.comp}  —  ${cc.classificacao}  ·  ${resumo}`)
        .setBackgroundColor(bg)
        .setPaddingTop(5).setPaddingBottom(5).setPaddingLeft(10).setPaddingRight(10)
        .editAsText().setBold(false).setFontSize(9).setForegroundColor('#0F2B54');
    });
    _sp();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 5. DASHBOARD — Looker Studio (link + QR Code)
  // ══════════════════════════════════════════════════════════════════════════
  const lookerUrl = _getLookerUrl(grp.nomeGestor);
  if (lookerUrl) {
    _h2('5. Dashboard');
    body.appendParagraph('Para visualizar maiores detalhes do mapeamento, consulte o dashboard.')
      .editAsText().setFontSize(9).setForegroundColor('#666666').setItalic(true);
    _sp();

    const tLK = body.appendTable();
    tLK.setBorderWidth(0);
    const lkRow = tLK.appendTableRow();

    // Coluna 1: link clicável
    const qrBlob = _gerarQRCode(lookerUrl);
    const linkW  = qrBlob ? 340 : 480;
    const linkCell = lkRow.appendTableCell('')
      .setBackgroundColor('#EEF3FB').setWidth(linkW)
      .setPaddingTop(10).setPaddingBottom(10).setPaddingLeft(12).setPaddingRight(8);
    const linkPara = linkCell.getChild(0).asParagraph();
    linkPara.appendText('🔗  Acesse o dashboard completo desta equipe')
      .setLinkUrl(lookerUrl).setFontSize(10).setForegroundColor('#1155CC').setBold(true);

    // Coluna 2: QR Code — só se disponível, sem mensagem de fallback
    if (qrBlob) {
      try {
        lkRow.appendTableCell('')
          .setBackgroundColor('#EEF3FB').setWidth(140)
          .setPaddingTop(6).setPaddingBottom(6).setPaddingLeft(10).setPaddingRight(10)
          .getChild(0).asParagraph().appendInlineImage(qrBlob)
          .setWidth(100).setHeight(100);
      } catch(eQR) {
        Logger.log('QR insert: ' + eQR.message);
      }
    }
    _sp();
  }
  _hr(); _sp();
  body.appendParagraph('').appendPageBreak();

  // ══════════════════════════════════════════════════════════════════════════
  // 6. ROTEIROS DE FEEDBACK
  // ══════════════════════════════════════════════════════════════════════════
  _h2('6. Roteiros de Feedback — Por Colaborador');
  profsOrdenados.forEach((prof, iPr) => {
    if (iPr > 0) body.appendParagraph('').appendPageBreak();
    const rot = roteiros[prof.nome] || null;
    _h3(`▶  ${prof.nome}  |  ${prof.cargo}`);
    const blocos = rot ? [
      ['💪 Ponto forte (ancoragem)',  rot.ponto_forte   || '—', '#E8F5E9', '#F1F8F0'],
      ['📌 Contexto',                 rot.contexto      || '—', '#D6E4F7', '#F7FBFF'],
      ['✅ O que falar',              rot.falar         || '—', '#E3EEF9', '#FFFFFF'],
      ['🚫 O que NÃO falar',          rot.nao_falar     || '—', '#FFF3E0', '#FFFBF5'],
      ['❓ Perguntas',                Array.isArray(rot.perguntas) ? rot.perguntas.map((p,i) => `${i+1}. ${p}`).join('\n') : '—', '#D6E4F7', '#F7FBFF'],
      ['⚠️ Risco se não agir',        rot.risco_oculto  || '—', '#FFE0E0', '#FFF5F5'],
      ['🎯 Gancho PDI',               rot.gancho_pdi    || '—', '#E3EEF9', '#FFFFFF'],
    ] : [['ℹ️ Aviso', 'Roteiro não gerado — verifique APIs.', '#FFF3E0', '#FFFBF5']];

    const tRot = body.appendTable();
    tRot.setBorderWidth(0);
    blocos.forEach(([label, valor, bgL, bgV]) => {
      const row = tRot.appendTableRow();
      row.appendTableCell(label)
        .setBackgroundColor(bgL || '#D6E4F7').setWidth(175)
        .setPaddingTop(7).setPaddingBottom(7).setPaddingLeft(10).setPaddingRight(6)
        .editAsText().setBold(true).setForegroundColor(C_TITULO).setFontSize(10);
      row.appendTableCell(valor)
        .setBackgroundColor(bgV || '#F7FBFF')
        .setPaddingTop(7).setPaddingBottom(7).setPaddingLeft(10).setPaddingRight(10)
        .editAsText().setBold(false).setForegroundColor('#0F2B54').setFontSize(10);
    });
    _sp();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 6. PLANO DE AÇÃO DO GESTOR
  // ══════════════════════════════════════════════════════════════════════════
  body.appendParagraph('').appendPageBreak();
  _h2('7. Plano de Ação — Para o Gestor');

  if (planoG) {
    const tPlan = body.appendTable();
    tPlan.setBorderWidth(1);
    const planH = tPlan.appendTableRow();
    [['⚡ Próximos 7 dias', '#C0392B'], ['📋 Próximos 30 dias', '#2471A3'], ['🚀 Próximos 60 dias', '#1A7A4A']]
      .forEach(([label, cor]) => {
        planH.appendTableCell(label)
          .setBackgroundColor(cor).setWidth(160)
          .setPaddingTop(7).setPaddingBottom(7).setPaddingLeft(10).setPaddingRight(6)
          .editAsText().setBold(true).setForegroundColor('#FFFFFF').setFontSize(10);
      });

    const d7  = planoG.dias_7  || [];
    const d30 = planoG.dias_30 || [];
    const d60 = planoG.dias_60 || [];
    const maxRows = Math.max(d7.length, d30.length, d60.length);
    for (let i = 0; i < maxRows; i++) {
      const dRow = tPlan.appendTableRow();
      [[d7[i], '#FEF5F5'], [d30[i], '#F0F7FF'], [d60[i], '#F0FFF5']].forEach(([txt, bg]) => {
        dRow.appendTableCell(txt ? `• ${txt}` : '')
          .setBackgroundColor(bg).setWidth(160)
          .setPaddingTop(6).setPaddingBottom(6).setPaddingLeft(10).setPaddingRight(8)
          .editAsText().setForegroundColor('#0F2B54').setFontSize(10).setBold(false);
      });
    }
    _sp();
  } else {
    body.appendParagraph('(Análise IA não disponível.)').setItalic(true);
    _sp();
  }
}


function _mapearGestoresPorColab(wsColab) {
  if (!wsColab) return {};
  try {
    const dados   = wsColab.getDataRange().getValues();
    const headers = dados[3];

    const iEmailColab = _idxEmailColab(headers);

    // Busca coluna "Nome" do gestor: prefere "gestor"+"nome", aceita "nome" imediato após email colab
    const iNomeGest = (() => {
      // 1. Coluna explícita com "gestor" e "nome"
      let i = headers.findIndex(h => {
        const n = _norm(String(h||'')).toLowerCase();
        return n.includes('gestor') && n.includes('nome');
      });
      if (i >= 0) return i;
      // 2. Coluna "Nome" logo após a coluna de e-mail do colaborador
      if (iEmailColab >= 0) {
        for (let j = iEmailColab + 1; j < headers.length; j++) {
          const n = _norm(String(headers[j]||'')).toLowerCase();
          if (n === 'nome' || n.startsWith('nome')) return j;
        }
      }
      return -1;
    })();

    // Busca coluna "E-mail" do gestor: prefere "gestor"+"email", aceita "e-mail" logo após nome gestor
    const iEmailGest = (() => {
      // 1. Coluna explícita com "gestor" e "e-mail"
      let i = headers.findIndex(h => {
        const n = _norm(String(h||'')).toLowerCase();
        return n.includes('gestor') && (n.includes('e-mail') || n.includes('email'));
      });
      if (i >= 0) return i;
      // 2. Coluna "E-mail" logo após a coluna "Nome" do gestor
      if (iNomeGest >= 0) {
        for (let j = iNomeGest + 1; j < headers.length; j++) {
          const n = _norm(String(headers[j]||'')).toLowerCase();
          if (n === 'e-mail' || n === 'email' || n.startsWith('e-mail') || n.startsWith('email')) return j;
        }
      }
      return -1;
    })();

    if (iEmailColab < 0 || iEmailGest < 0) {
      Logger.log(`_mapearGestoresPorColab: colunas não encontradas — iEmailColab=${iEmailColab}, iEmailGest=${iEmailGest}`);
      return {};
    }

    const mapa = {}; // chave: email do colab (lowercase) — chave única
    dados.slice(4).forEach(row => {
      const emailColab = _norm(String(row[iEmailColab] || ''));
      const nomeGest   = iNomeGest >= 0 ? _norm(String(row[iNomeGest]  || '')) : '';
      const emailGest  = _norm(String(row[iEmailGest] || ''));
      if (emailColab && emailGest) mapa[emailColab.toLowerCase()] = { nome: nomeGest, email: emailGest };
    });
    return mapa;
  } catch (e) {
    Logger.log('_mapearGestoresPorColab erro: ' + e.message);
    return {};
  }
}