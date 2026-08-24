-- B11 da auditoria 22/08 — `upsertRelatorioAgregado` é read-modify-write e não é atômico.
--
-- O comentário original explicava CORRETAMENTE por que `onConflict` não servia:
-- UNIQUE não detecta conflito em NULL, e o relatório agregado tem
-- `colaborador_id IS NULL`. Só que a saída escolhida — select + update/insert —
-- é uma CORRIDA: dois cliques no botão de admin (o caso normal, não o raro)
-- fazem os dois lados lerem "não existe" e inserirem.
--
-- `colab_key` resolve a origem do problema: com a coluna gerada, o agregado
-- deixa de ser NULL para efeito de índice e o upsert nativo passa a funcionar.
--
-- ⚠️ Tem de ser coluna GERADA, não índice de expressão: o `onConflict` do
-- PostgREST nomeia COLUNAS, e `coalesce(...)` num índice não é nomeável ali.
-- ⚠️ E não pode ser índice PARCIAL: com predicado, o PostgREST devolve 42P10
-- (mordeu em 07/08, no primeiro envio real).
--
-- É o padrão que a base já usa: `uq_micro_conteudos_core`, `uq_videos_gerados_celula`.
-- Conferido antes de aplicar: zero duplicatas de (empresa_id, tipo, colaborador_id).
--
-- Idempotente: pode rodar de novo sem efeito.

ALTER TABLE relatorios
  ADD COLUMN IF NOT EXISTS colab_key uuid
  GENERATED ALWAYS AS (coalesce(colaborador_id, '00000000-0000-0000-0000-000000000000'::uuid)) STORED;

COMMENT ON COLUMN relatorios.colab_key IS
  'colaborador_id com NULL colapsado no uuid zero (B11, 24/08/2026). Existe para o índice único alcançar o relatório AGREGADO — UNIQUE não detecta conflito em NULL — e para o upsert nativo poder nomeá-la em onConflict.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_relatorios_agregado
  ON relatorios (empresa_id, tipo, colab_key);
