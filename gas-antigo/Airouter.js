// =====================================================================
// VERTHO - AIRouter.gs  (Fase 3 v6 — COM EXTENDED THINKING)
//
// Extended Thinking ativavel pelo Painel de Controle:
//   - disabled: sem thinking (padrao)
//   - adaptive: Sonnet — raciocinio intermediario
//   - max_effort: Opus — raciocinio maximo
//
// Thinking so se aplica a fases de analise (avaliacao, relatorio,
// cenario_b). Conversa NUNCA usa thinking (seria lento demais).
// =====================================================================

var AIRouter = {

  /**
   * Chama Claude com suporte a Extended Thinking.
   * Modelo, tokens e thinking lidos do Config (ScriptProperties/Painel).
   */
  callClaude: function(prompt, phase) {
    // ── Modelo por fase ──────────────────────────────────────────────
    var model;
    if (phase === "relatorio") {
      model = Config.MODEL_RELATORIO || Config.MODEL_PDI;
    } else if (phase === "pdi" || phase === "cenario_b" || phase === "avaliacao"
      || phase === "diagnostico" || phase === "feedback") {
      model = Config.MODEL_PDI;
    } else {
      model = Config.MODEL_CONVERSA;
    }

    // ── Se modelo é GPT/OpenAI, rotear automaticamente ─────────────
    if (model && (model.indexOf('gpt') >= 0 || model.indexOf('o1-') >= 0 || model.indexOf('o3-') >= 0 || model.indexOf('o4-') >= 0 || model.indexOf('openai') >= 0)) {
      return this.callOpenAI(prompt, phase);
    }

    // ── Tokens por fase ──────────────────────────────────────────────
    var maxTokens;
    if (phase === "ppp" || phase === "relatorio") {
      maxTokens = Config.MAX_OUTPUT_TOKENS_RELATORIO || 16384;
    } else if (phase === "avaliacao" || phase === "diagnostico") {
      maxTokens = Config.MAX_OUTPUT_TOKENS_EVAL || 8192;
    } else if (phase === "pdi" || phase === "cenario_b" || phase === "feedback") {
      maxTokens = Config.MAX_OUTPUT_TOKENS_PDI || 4096;
    } else {
      maxTokens = Config.MAX_OUTPUT_TOKENS_CONVERSA || 1024;
    }

    // ── Thinking — so para fases de analise, nunca conversa ─────────
    var thinkingMode = Config.THINKING_MODE || "disabled";
    var usaThinking = false;
    var budgetTokens = 0;

    // Fases que se beneficiam de thinking
    var fasesComThinking = ["avaliacao", "diagnostico", "relatorio", "cenario_b"];
    var fasePermiteThinking = fasesComThinking.indexOf(phase) >= 0;

    if (fasePermiteThinking && thinkingMode !== "disabled") {
      // Verificar se o modelo suporta thinking
      var isOpus = model.indexOf("opus") >= 0;
      var isSonnet = model.indexOf("sonnet") >= 0;

      if (thinkingMode === "max_effort" && isOpus) {
        usaThinking = true;
        budgetTokens = Config.THINKING_BUDGET_MAX || 32768;
      } else if (thinkingMode === "adaptive" && (isSonnet || isOpus)) {
        usaThinking = true;
        budgetTokens = Config.THINKING_BUDGET_ADAPTIVE || 10240;
      } else if (thinkingMode === "max_effort" && isSonnet) {
        // Fallback: Opus mode selecionado mas modelo e Sonnet → usa adaptive
        usaThinking = true;
        budgetTokens = Config.THINKING_BUDGET_ADAPTIVE || 10240;
      }
      // Haiku/Gemini: thinking ignorado silenciosamente
    }

    // Se thinking ativo, max_tokens = budget + espaço p/ resposta
    // Opus max_effort: até 128k | Sonnet adaptive: até 65k
    if (usaThinking) {
      var isOpusModel = model.indexOf("opus") >= 0;
      var teto = isOpusModel ? 131072 : 65536;
      var minTotal = budgetTokens + maxTokens;
      maxTokens = Math.min(Math.max(minTotal, 65536), teto);
    }

    // ── System blocks ────────────────────────────────────────────────
    var systemBlocks = [];
    if (prompt.systemStatic) {
      systemBlocks.push({ type: "text", text: prompt.systemStatic, cache_control: { type: "ephemeral" } });
    }
    if (prompt.systemCompetencia) {
      systemBlocks.push({ type: "text", text: prompt.systemCompetencia, cache_control: { type: "ephemeral" } });
    }

    // ── Montar payload ───────────────────────────────────────────────
    var payload = {
      model: model,
      max_tokens: maxTokens,
      messages: prompt.messages || []
    };

    // IMPORTANTE: Quando thinking esta ativo, NAO enviar temperature
    if (usaThinking) {
      payload.thinking = {
        type: "enabled",
        budget_tokens: budgetTokens
      };
      // temperature NAO pode ser enviada com thinking
    } else {
      payload.temperature = Config.TEMPERATURE[phase] || 0.3;
    }

    if (systemBlocks.length > 0) {
      payload.system = systemBlocks;
    }

    Logger.log("AIRouter: model=" + model + " phase=" + phase
      + " max_tokens=" + maxTokens
      + " thinking=" + (usaThinking ? thinkingMode + " (budget=" + budgetTokens + ")" : "off"));

    return this._callWithRetry("claude", payload);
  },

  /**
   * Chama OpenAI (GPT-4o, etc.)
   * Aceita o mesmo formato de prompt que callClaude.
   */
  callOpenAI: function(prompt, phase) {
    var model = PropertiesService.getScriptProperties().getProperty('cfg_openai_modelo')
      || 'gpt-5.4-mini';

    var maxTokens;
    if (phase === 'ppp' || phase === 'relatorio') maxTokens = Config.MAX_OUTPUT_TOKENS_RELATORIO || 64000;
    else if (phase === 'avaliacao' || phase === 'diagnostico') maxTokens = Config.MAX_OUTPUT_TOKENS_EVAL || 32768;
    else if (phase === 'pdi' || phase === 'cenario_b' || phase === 'feedback') maxTokens = Config.MAX_OUTPUT_TOKENS_PDI || 4096;
    else maxTokens = Config.MAX_OUTPUT_TOKENS_CONVERSA || 1024;

    var messages = [];

    // System message
    var systemParts = [];
    if (prompt.systemStatic) systemParts.push(prompt.systemStatic);
    if (prompt.systemCompetencia) systemParts.push(prompt.systemCompetencia);
    if (systemParts.length > 0) {
      messages.push({ role: 'system', content: systemParts.join('\n\n') });
    }

    // User/assistant messages
    var msgs = prompt.messages || [];
    for (var i = 0; i < msgs.length; i++) {
      messages.push({ role: msgs[i].role, content: msgs[i].content });
    }

    // Verificar se reasoning está habilitado
    var thinkingMode = PropertiesService.getScriptProperties().getProperty('cfg_thinking') || 'disabled';
    var useReasoning = thinkingMode === 'reasoning_high' && model === 'gpt-5.4';

    var payload = {
      model: model,
      max_completion_tokens: maxTokens,
      messages: messages
    };

    if (useReasoning) {
      payload.reasoning_effort = 'high';
    } else {
      payload.temperature = Config.TEMPERATURE[phase] || 0.3;
    }

    Logger.log('AIRouter: OpenAI model=' + model + ' phase=' + phase + ' max_completion_tokens=' + maxTokens + (useReasoning ? ' reasoning=high' : ''));
    return this._callWithRetry('openai', payload, model);
  },

  /**
   * Chama Gemini para validacao.
   */
  callGemini: function(prompt, modelId) {
    var model = modelId || Config.MODEL_VALIDACAO;
    var fullText = prompt.fullText;
    if (!fullText) {
      var parts = [];
      if (prompt.system) parts.push(prompt.system);
      if (prompt.messages) {
        for (var i = 0; i < prompt.messages.length; i++) {
          var m = prompt.messages[i];
          var speaker = m.role === "user" ? "Colaborador" : "Mentor IA";
          parts.push(speaker + ": " + m.content);
        }
      }
      fullText = parts.join("\n\n");
    }
    var payload = {
      contents: [{ parts: [{ text: fullText }] }],
      generationConfig: {
        maxOutputTokens: Config.MAX_OUTPUT_TOKENS_GEMINI || Config.MAX_OUTPUT_TOKENS_EVAL || 4096,
        temperature: Config.geminiTemp(model, 'validacao')
      }
    };
    return this._callWithRetry("gemini", payload, model);
  },

  // ── Retry logic ────────────────────────────────────────────────────

  _callWithRetry: function(provider, payload, modelId) {
    var lastError;
    for (var attempt = 0; attempt < Config.MAX_RETRIES; attempt++) {
      if (Config.RETRY_DELAYS[attempt] > 0) {
        Utilities.sleep(Config.RETRY_DELAYS[attempt]);
      }
      try {
        if (provider === "claude") {
          return this._fetchClaude(payload);
        } else if (provider === "openai") {
          return this._fetchOpenAI(payload);
        } else {
          return this._fetchGemini(payload, modelId);
        }
      } catch (error) {
        lastError = error;
        Logger.log("AIRouter: tentativa " + (attempt + 1) + "/" + Config.MAX_RETRIES
          + " (" + provider + "): " + error.message);
        if (error.message.indexOf("401") >= 0 || error.message.indexOf("403") >= 0) {
          throw error;
        }
        if (error.message.indexOf("400") >= 0) {
          throw error;
        }
      }
    }
    throw new Error("API " + provider + " falhou apos " + Config.MAX_RETRIES + " tentativas: " + lastError.message);
  },

  // ── Fetch Claude ───────────────────────────────────────────────────

  _fetchClaude: function(payload) {
    var url = "https://api.anthropic.com/v1/messages";
    var response = UrlFetchApp.fetch(url, {
      method: "post",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": Config.ANTHROPIC_API_KEY,
        "anthropic-version": Config.ANTHROPIC_VERSION
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var code = response.getResponseCode();
    var body = response.getContentText();

    if (code === 429) throw new Error("429 Rate limit");
    if (code !== 200) {
      Logger.log("Claude ERRO " + code + ": " + body.substring(0, 500));
      throw new Error("Claude API " + code + ": " + body.substring(0, 300));
    }

    var data = JSON.parse(body);

    // Extrair texto — ignorar blocos de thinking (type: "thinking")
    var result = [];
    for (var i = 0; i < data.content.length; i++) {
      if (data.content[i].type === "text") {
        result.push(data.content[i].text);
      }
      // Log thinking summary se existir
      if (data.content[i].type === "thinking") {
        var thinkLen = (data.content[i].thinking || "").length;
        Logger.log("AIRouter: thinking block recebido (" + thinkLen + " chars)");
      }
    }
    return result.join("");
  },

  // ── Fetch OpenAI ──────────────────────────────────────────────────

  _fetchOpenAI: function(payload) {
    var url = 'https://api.openai.com/v1/chat/completions';
    var response = UrlFetchApp.fetch(url, {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + Config.OPENAI_API_KEY
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var code = response.getResponseCode();
    var body = response.getContentText();

    if (code === 429) throw new Error('429 Rate limit');
    if (code !== 200) {
      Logger.log('OpenAI ERRO ' + code + ': ' + body.substring(0, 500));
      throw new Error('OpenAI API ' + code + ': ' + body.substring(0, 300));
    }

    var data = JSON.parse(body);
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('OpenAI: resposta vazia ou sem choices');
    }
    return data.choices[0].message.content;
  },

  // ── Fetch Gemini ───────────────────────────────────────────────────

  _fetchGemini: function(payload, modelId) {
    var url = "https://generativelanguage.googleapis.com/v1beta/models/"
      + modelId + ":generateContent?key=" + Config.GEMINI_API_KEY;

    var response = UrlFetchApp.fetch(url, {
      method: "post",
      headers: { "Content-Type": "application/json" },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var code = response.getResponseCode();
    if (code !== 200) {
      Logger.log("Gemini ERRO " + code + ": " + response.getContentText().substring(0, 500));
      throw new Error("Gemini API " + code + ": " + response.getContentText().substring(0, 300));
    }

    var data = JSON.parse(response.getContentText());
    if (!data.candidates || !data.candidates[0]) {
      throw new Error("Gemini: resposta vazia ou bloqueada");
    }
    return data.candidates[0].content.parts[0].text;
  }
};