-- ─────────────────────────────────────────────────────────────────────────
-- 087 — Habilita auto-cadastro (open signup) na empresa "bett".
--
-- Quando ativo, usuários que digitarem um email não cadastrado em
-- bett.vertho.ai/login veem um modal de cadastro em vez de erro.
-- O modal cria o colaborador com role='colaborador' e dispara magic-link
-- por email + WhatsApp (telefone obrigatório no cadastro).
--
-- Para desativar: trocar `'true'::jsonb` por `'false'::jsonb`.
-- Para ativar em outras empresas: trocar `slug = 'bett'` pelo slug desejado.
-- ─────────────────────────────────────────────────────────────────────────

UPDATE empresas
SET sys_config = jsonb_set(
  COALESCE(sys_config, '{}'::jsonb),
  '{allow_open_signup}',
  'true'::jsonb,
  true
)
WHERE slug = 'bett';

-- Confirmação visual: mostra a empresa atualizada
SELECT slug, nome, sys_config->'allow_open_signup' AS allow_open_signup
FROM empresas
WHERE slug = 'bett';
