-- 188 · Consolida células de vídeo duplicadas e impede novas (F-C5).
--
-- `resolverCelulaVideo`/`dispararVideoDoKit` fazem SELECT-then-INSERT e
-- `videos_gerados` NÃO tem UNIQUE por célula: dois disparos concorrentes criam duas
-- linhas e dois renders pagos. O número cresce sozinho — 18 em 17/07, 22 em 27/07.
--
-- Efeitos além do custo:
--  · a entrega serve `.order('created_at',desc).limit(1)` — as cópias são invisíveis,
--    mas seus `videos_personalizados` continuam contando nas métricas, produzindo
--    "personalizado travado" para gente que TEM vídeo com nome (visto em 27/07);
--  · a reconciliação F-V1 mediria 83 pessoas/16 células em vez de 25/5, e gastaria
--    um render por cópia para curar as MESMAS pessoas.
--
-- SEGURANÇA DESTA MIGRATION (medido em 27/07, antes de escrever):
--   perdedoras: 37 · personalizados nelas: 130
--   dos 130 → 0 precisam migrar, 0 precisam promover, 130 são redundantes
--   (a MESMA pessoa já tem 'done' na célula vencedora)
--   vencedoras: 76, todas com status='done'
-- Ou seja: ninguém perde vídeo. Backup das linhas fora do repo antes de aplicar
-- (scripts/_backup-celulas-duplicadas.ts) — `videos_personalizados.cell_video_id`
-- é ON DELETE CASCADE, então apagar a célula leva os personalizados dela junto.
--
-- ⚠️ NÃO cobre o Bunny: os MP4 das cópias continuam lá (storage órfão). Apagar de lá
-- exige checar que nenhum outro registro aponta para o mesmo guid — trabalho à parte.

BEGIN;

-- Vencedora = a MAIS RECENTE não-error, exatamente o critério de resolverCelulaVideo.
-- Eleger por outro critério (ex.: "a que tem mais personalizados") trocaria o vídeo
-- que as pessoas estão vendo agora — consolidar não pode mudar a entrega.
CREATE TEMP TABLE _consolidacao ON COMMIT DROP AS
WITH ranked AS (
  SELECT id, modulo_base_id, empresa_id, cargo, disc_dominante,
         ROW_NUMBER() OVER (
           PARTITION BY modulo_base_id, empresa_id, cargo, disc_dominante
           ORDER BY created_at DESC
         ) AS rn
  FROM videos_gerados
  WHERE status <> 'error'
)
SELECT p.id AS perdedora, v.id AS vencedora
FROM ranked p
JOIN ranked v
  ON v.modulo_base_id = p.modulo_base_id AND v.empresa_id IS NOT DISTINCT FROM p.empresa_id
 AND v.cargo IS NOT DISTINCT FROM p.cargo AND v.disc_dominante IS NOT DISTINCT FROM p.disc_dominante
 AND v.rn = 1
WHERE p.rn > 1;

-- GUARDA: aborta se alguém fosse perder o vídeo nominal. A análise diz que os 130
-- personalizados das perdedoras são redundantes; se essa premissa não valer no
-- momento da aplicação (linha nova entre a análise e o COMMIT), a migration para
-- em vez de apagar. Preferir falhar a destruir.
DO $$
DECLARE em_risco int;
BEGIN
  SELECT count(*) INTO em_risco
  FROM videos_personalizados vp
  JOIN _consolidacao c ON vp.cell_video_id = c.perdedora
  WHERE vp.status = 'done'
    AND NOT EXISTS (
      SELECT 1 FROM videos_personalizados v2
      WHERE v2.cell_video_id = c.vencedora AND v2.colaborador_id = vp.colaborador_id AND v2.status = 'done');
  IF em_risco > 0 THEN
    RAISE EXCEPTION 'ABORTADO: % personalizado(s) done sem equivalente na vencedora — migrar antes de apagar', em_risco;
  END IF;
END $$;

-- Apaga as perdedoras. O CASCADE leva os personalizados redundantes.
DELETE FROM videos_gerados vg USING _consolidacao c WHERE vg.id = c.perdedora;

-- Impede novas. Parcial em `status <> 'error'`: uma tentativa que falhou pode
-- coexistir com o re-disparo (é assim que a recuperação funciona hoje), mas duas
-- células VIVAS da mesma tupla passam a ser impossíveis.
-- COALESCE porque em UNIQUE dois NULLs não colidem entre si.
CREATE UNIQUE INDEX IF NOT EXISTS uq_videos_gerados_celula
  ON videos_gerados (
    modulo_base_id,
    COALESCE(empresa_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(cargo, ''),
    COALESCE(disc_dominante, '')
  )
  WHERE status <> 'error';

COMMENT ON INDEX uq_videos_gerados_celula IS
  'F-C5: uma célula viva por (módulo × empresa × cargo × DISC). Parcial em status<>error para permitir re-disparo após falha.';

COMMIT;

-- Rollback:
-- DROP INDEX IF EXISTS uq_videos_gerados_celula;
-- (as linhas apagadas só voltam pelo backup JSON — ver scripts/_backup-celulas-duplicadas.ts)
