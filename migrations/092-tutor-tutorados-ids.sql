-- ============================================================================
-- 092: Papel Tutor — escopo de tutorados (Modo Onboarding — Fase 4)
-- ============================================================================
--
-- Adiciona `tutorados_ids UUID[]` em `colaboradores` para o papel "tutor".
-- Tutor = subset do papel Gestor, com escopo restrito a um conjunto pequeno
-- de colaboradores tutorados (não a uma equipe inteira por area_depto).
--
-- Validação semântica fica no código (lib/authz.ts: canTutorAccess); a coluna
-- só guarda o conjunto de tutorados. Index GIN pra busca rápida (tutorados_ids
-- contém colab_id).
--
-- A coluna `role` em `colaboradores` é TEXT livre (sem enum DDL), então não
-- precisa ALTER TYPE — basta o app aceitar 'tutor' (validRoles em
-- /admin/empresas/[id]/configuracoes/actions.ts).
--
-- Reversível: DROP COLUMN colaboradores.tutorados_ids;
-- ============================================================================

ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS tutorados_ids UUID[] DEFAULT '{}'::UUID[];

-- Index GIN: permite query "quais tutores cuidam deste colab?"
CREATE INDEX IF NOT EXISTS idx_colaboradores_tutorados_ids
  ON colaboradores USING GIN (tutorados_ids);

COMMENT ON COLUMN colaboradores.tutorados_ids IS
'Tutor (role=tutor): array com os IDs dos colaboradores que ele acompanha.
Vazio = sem escopo (não vê ninguém). Em outros roles é ignorado.';
