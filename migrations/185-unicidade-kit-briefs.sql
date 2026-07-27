-- 185 · UNIQUE em kit_briefs por tema (F-C7 do docs/FMEA-PIPELINE.md).
--
-- `resolverOuCriarBrief` é SELECT-then-INSERT e o índice `idx_kit_briefs_tema`
-- (mig 142) NÃO é único: dois jobs do mesmo tema (lote de coorte + ação manual)
-- criam dois briefs. `precarregarKits` então escolhe por score com desempate
-- arbitrário e pode servir o brief errado — quebrando a premissa do Kit, que é os
-- 4 DISC dizerem a mesma coisa. Já ocorreu (existe `scripts/_fix-brief-duplicado.ts`).
--
-- Seguro aplicar agora: medido em 27/07, ZERO duplicatas por tupla hoje. A
-- constraint impede que voltem.
--
-- ⚠️ Por que só esta tabela nesta migration: as outras duas UNIQUE previstas no
-- FMEA (videos_gerados F-C5, micro_conteudos F-C6) exigem dedup ANTES, e o dedup
-- não é trivial — medido em 27/07, as 37 linhas perdedoras de `videos_gerados`
-- carregam 125 `videos_personalizados` em 'done'. Apagá-las arrancaria o vídeo com
-- nome de 125 entregas. Consolidar exige migrar os personalizados para a célula
-- vencedora tratando colisão de (cell_video_id, colaborador_id) — trabalho próprio,
-- não um efeito colateral desta migration.

-- `contexto` e `cargo` entram na chave porque são parte da identidade do tema
-- (o mesmo descritor gera briefs diferentes para MEI vs Educação).
-- COALESCE em empresa_id: NULL = brief global, e em UNIQUE dois NULLs não colidem
-- entre si — sem isso, N briefs globais idênticos continuariam possíveis.
CREATE UNIQUE INDEX IF NOT EXISTS uq_kit_briefs_tema
  ON kit_briefs (
    COALESCE(empresa_id, '00000000-0000-0000-0000-000000000000'::uuid),
    competencia, descritor, nivel_min, nivel_max, cargo, contexto
  );

COMMENT ON INDEX uq_kit_briefs_tema IS
  'F-C7: barra brief duplicado por tema. resolverOuCriarBrief é SELECT-then-INSERT; sem esta constraint, dois jobs concorrentes do mesmo tema criavam dois briefs e o overlay servia um deles arbitrariamente.';

-- Rollback:
-- DROP INDEX IF EXISTS uq_kit_briefs_tema;
