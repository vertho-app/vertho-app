-- 012: Ajustes para o Motor Conversacional Fase 3

-- Lacuna como numeric (-2 a 0) em vez de text
ALTER TABLE sessoes_avaliacao
  ALTER COLUMN lacuna TYPE NUMERIC(3,1) USING lacuna::numeric;

-- Índice faltante em competencia_id
CREATE INDEX IF NOT EXISTS idx_sessoes_aval_comp ON sessoes_avaliacao(competencia_id);

-- Índice composto para busca de sessão ativa
CREATE INDEX IF NOT EXISTS idx_sessoes_aval_active
  ON sessoes_avaliacao(colaborador_id, competencia_id, status)
  WHERE status = 'em_andamento';
