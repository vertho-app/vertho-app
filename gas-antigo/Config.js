// =====================================================================
// VERTHO - Config.gs  (v3)
//
// Configuracao central. Leitura de API keys via _getApiKey() do codigo.gs.
//
// MUDANCAS v3:
// - Adicionado WEBAPP_URL (via ScriptProperties — nunca hardcoded)
// - Adicionado _getWebAppUrl() como função central para todos os arquivos
// - Modelos corrigidos: gemini-2.0-flash / claude-sonnet-4-6-20250514
// - Fallbacks de modelo atualizados
// =====================================================================

var Config = {

  // ── IDs de Planilha ────────────────────────────────────────────────
  get MAIN_SHEET_ID() {
    return SpreadsheetApp.getActiveSpreadsheet().getId();
  },

  // ── API Keys (via codigo.gs) ───────────────────────────────────────
  get ANTHROPIC_API_KEY() { return _getApiKey("CLAUDE"); },
  get GEMINI_API_KEY()    { return _getApiKey("GEMINI"); },
  get OPENAI_API_KEY()    { return _getApiKey("OPENAI"); },
  ANTHROPIC_VERSION: "2023-06-01",

  // ── Web App URL (nunca hardcoded — sempre via ScriptProperties) ────
  get WEBAPP_URL() {
    return PropertiesService.getScriptProperties().getProperty('WEBAPP_URL') || '';
  },

  // ── Modelos ────────────────────────────────────────────────────────
  get MODEL_CONVERSA() {
    return PropertiesService.getScriptProperties().getProperty('cfg_f3_conversa')
      || "claude-haiku-4-5-20251001";
  },
  get MODEL_PDI() {
    return PropertiesService.getScriptProperties().getProperty('cfg_f3_avaliacao')
      || "claude-haiku-4-5-20251001";
  },
  get MODEL_CENARIO_B() {
    return PropertiesService.getScriptProperties().getProperty('cfg_f3_avaliacao')
      || "claude-haiku-4-5-20251001";
  },
  get MODEL_VALIDACAO() {
    return PropertiesService.getScriptProperties().getProperty('cfg_f3_validacao')
      || "gemini-3.1-flash-lite-preview";           // ← corrigido (era gemini-3-flash-preview)
  },
  get MODEL_RELATORIO() {
    return PropertiesService.getScriptProperties().getProperty('cfg_f3_relatorio')
      || "claude-haiku-4-5-20251001";
  },

  // ── Limites de Conversa ────────────────────────────────────────────
  MAX_APROFUNDAMENTOS:         10,   // Claude decide, codigo limita em 10
  MAX_CENARIOS_POR_SESSAO:      1,   // Apenas 1 cenario B por sessao
  SESSION_TIMEOUT_MINUTES:    240,
  MIN_MESSAGE_LENGTH:          10,   // Caracteres minimos na resposta
  MAX_MESSAGE_LENGTH:        4096,   // Truncar mensagens muito longas
  MAX_OUTPUT_TOKENS_RELATORIO: 64000,

  // ── Evidencias (Claude decide, mas com guia) ──────────────────────
  MIN_EVIDENCIAS_PARA_ENCERRAR: 2,   // Minimo de evidencias explicitas
  CONFIANCA_MINIMA_ENCERRAR:   80,   // Confianca minima para encerrar

  // ── Thinking ──────────────────────────────────────────────────────
  get THINKING_MODE() {
    return PropertiesService.getScriptProperties().getProperty('cfg_thinking')
      || "disabled";   // "disabled" | "adaptive" (Sonnet) | "max_effort" (Opus)
  },
  THINKING_BUDGET_MAX:        65536,  // max_effort (Opus) — 64k thinking + 64k resposta = 128k
  THINKING_BUDGET_ADAPTIVE:   32768,  // adaptive (Sonnet)

  // Helper: label para toasts com modelo + thinking
  modelLabel: function(modelo) {
    var m = modelo || this.MODEL_PDI;
    var tk = this.THINKING_MODE;
    if (m.indexOf('gpt') >= 0 || m.indexOf('o1-') >= 0 || m.indexOf('o3-') >= 0 || m.indexOf('o4-') >= 0 || m.indexOf('openai') >= 0) return m + ' (OpenAI)';
    if (tk === 'disabled' || m.indexOf('gemini') >= 0) return m;
    if (tk === 'max_effort') return m + ' | thinking: max';
    if (tk === 'adaptive') return m + ' | thinking: adaptive';
    return m;
  },

  // Helper: temperatura para Gemini — Gemini 3.x usa 1.0 como padrão
  geminiTemp: function(modelo, phase) {
    modelo = modelo || this.MODEL_VALIDACAO || '';
    if (modelo.indexOf('gemini-3') >= 0) return 1.0;
    return this.TEMPERATURE[phase] || 0.3;
  },

  // ── Tokens ─────────────────────────────────────────────────────────
  MAX_OUTPUT_TOKENS_CONVERSA:  1024,
  MAX_OUTPUT_TOKENS_EVAL:     32768,
  MAX_OUTPUT_TOKENS_GEMINI:   65536,  // Gemini 3.1 Pro suporta até 65k
  MAX_OUTPUT_TOKENS_PDI:      4096,
  THINKING_BUDGET_EVAL:       10240,

  // ── Temperaturas por fase ──────────────────────────────────────────
  // Nota: Gemini 3.x usa temperatura padrão 1.0 (ver geminiTemp())
  TEMPERATURE: {
    introducao:     0.5,
    cenario:        0.3,
    aprofundamento: 0.3,
    encerramento:   0.4,
    avaliacao:      0.1,
    diagnostico:    0.1,
    validacao:      0.1,
    pdi:            0.4,
    cenario_b:      0.5,
    relatorio:      0.4
  },

  // ── Retry ──────────────────────────────────────────────────────────
  MAX_RETRIES:  3,
  RETRY_DELAYS: [0, 2000, 5000],

  // ── Drive Storage ──────────────────────────────────────────────────
  DRIVE_FOLDER_CONVERSAS: "Vertho_Conversas",

  // ── Nomes das Abas ─────────────────────────────────────────────────
  SHEET_COLABORADORES:   "Colaboradores",
  SHEET_COMPETENCIAS:    "Competencias_v2",
  SHEET_CENARIOS:        "Banco_Cenarios",
  SHEET_CENARIOS_B:      "Cenarios_B",
  SHEET_RESPOSTAS:       "Respostas",
  SHEET_SESSOES:         "Sessoes",
  SHEET_RESULTADOS_DIAG: "Resultados_Diagnostico",
  SHEET_RESULTADOS_AVAL: "Resultados_Avaliacao",
  SHEET_VALIDACOES:      "Validacoes",
  SHEET_ACOES_PENDENTES: "Acoes_Pendentes",
  SHEET_CICLOS:          "Ciclos_Avaliacao"
};

// =====================================================================
// HELPER GLOBAL — URL do Web App
// Uso: _getWebAppUrl() em qualquer arquivo .gs
// Fonte: Propriedades do Script → WEBAPP_URL
// =====================================================================
function _getWebAppUrl() {
  return Config.WEBAPP_URL;
}


