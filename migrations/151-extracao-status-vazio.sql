-- Status 'vazio' para extrações: o material foi processado com sucesso, mas NÃO
-- gerou módulos porque não é aderente ao pilar/competência direcionados (modo
-- exclusivo). Não é erro — é um resultado válido que precisa ser sinalizado
-- distinto de 'error' (falha real) e de 'done' (gerou módulos).

ALTER TABLE extracoes_video DROP CONSTRAINT IF EXISTS extracoes_video_status_check;
ALTER TABLE extracoes_video ADD CONSTRAINT extracoes_video_status_check
  CHECK (status IN ('processing', 'done', 'error', 'vazio'));
