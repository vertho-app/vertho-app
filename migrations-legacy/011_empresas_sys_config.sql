-- 010: Configurações dinâmicas por tenant
-- Armazena modelo de IA, API keys do cliente, cadência de envios

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS sys_config JSONB DEFAULT '{
    "ai": {
      "modelo_padrao": "claude-sonnet-4-6",
      "anthropic_key": null,
      "gemini_key": null,
      "openai_key": null,
      "thinking": false
    },
    "cadencia": {
      "fase4_dia_pilula": 1,
      "fase4_dia_evidencia": 4,
      "fase4_hora": 8,
      "email_ativo": true,
      "whatsapp_ativo": true
    },
    "envios": {
      "email_remetente": null,
      "email_alias": null
    }
  }'::jsonb;
