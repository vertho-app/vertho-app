-- 197 — Índices para escala (~1000 usuários simultâneos)
--
-- Dois pontos quentes identificados em auditoria de escala (ago/2026):
--
-- 1) respostas: queries por colaborador_id sozinho (dashboard do colaborador,
--    /api/assessment) não tinham índice líder — o índice existente é
--    (empresa_id, email_colaborador) e a UNIQUE é
--    (empresa_id, colaborador_id, competencia_id). respostas é a tabela que
--    mais cresce (1 linha por colaborador × competência × rodada).
--
-- 2) colaboradores: lookups por email puro (sem escopo de tenant) no caminho
--    de auth (lib/authz.ts, lib/auth/request-context.ts, lib/i18n-server.ts,
--    /api/assessment) — o único índice de email é (empresa_id, email).
--    O código já padroniza trim().toLowerCase(), então o índice é em
--    lower(email).
--
-- Aplicar com scripts/_criar-indices-escala.mjs (statement por statement —
-- CONCURRENTLY não roda dentro de transaction implícita de multi-statement).

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_respostas_colaborador
  ON public.respostas (colaborador_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_colaboradores_email_lower
  ON public.colaboradores (lower(email));
