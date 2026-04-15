-- 035: remove tabelas do sistema legado de capacitação (fase3/fase4).
-- Substituído pelo Motor de Temporadas (trilhas + temporada_semana_progresso).
-- Código que usava essas tabelas já foi removido no commit anterior.

DROP TABLE IF EXISTS tutor_log;
DROP TABLE IF EXISTS fase4_progresso;
