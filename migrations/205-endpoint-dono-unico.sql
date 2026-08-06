-- 205 — um dono ativo por assinatura, garantido pelo BANCO.
--
-- A assinatura de Web Push pertence ao navegador, não à conta. A rota de
-- registro já desativa endpoints com a mesma URL pertencentes a outro
-- colaborador — mas isso é "ler, decidir, escrever" em código, e duas
-- requisições simultâneas passam as duas: ambas leem "sem outro dono", ambas
-- seguem, e o mesmo aparelho fica ativo para duas pessoas. O sintoma seria o
-- pior possível: A recebendo notificação com o conteúdo de B.
--
-- Índice único parcial resolve a corrida por construção, e de brinde torna a
-- rota FAIL-CLOSED: se a desativação do dono anterior não aconteceu, o upsert
-- viola o índice e a requisição falha, em vez de duplicar em silêncio.
--
-- Parcial (`WHERE enabled`) de propósito: linhas desativadas são histórico e
-- PODEM repetir a mesma URL — é assim que se sabe que um aparelho trocou de
-- dono. Um índice total apagaria essa história ou bloquearia o registro novo.
--
-- Pré-voo executado em 06/08 antes de aplicar: 5 linhas, 4 ativas, ZERO
-- duplicatas de endpoint entre ativas e zero endpoints nulos.

CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_endpoints_dono_unico
  ON notification_endpoints ((subscription->>'endpoint'))
  WHERE enabled;

COMMENT ON INDEX idx_notif_endpoints_dono_unico IS
  'Uma assinatura de push tem UM dono ativo. Garantia contra corrida entre dois registros simultâneos do mesmo aparelho por pessoas diferentes (A faz logout, B entra). Parcial: linhas desativadas guardam o histórico de troca de dono.';

-- Backfill do único registro desativado antes da mig 203: foi desligado pela
-- limpeza de duplicados de 05/08 (mesmo aparelho, PWA reinstalado). Deixar NULL
-- manteria exatamente a ambiguidade que a 203 veio eliminar.
UPDATE notification_endpoints
SET disabled_reason = 'reinstalacao'
WHERE NOT enabled AND disabled_reason IS NULL;

-- Rollback (se precisar):
-- DROP INDEX IF EXISTS idx_notif_endpoints_dono_unico;
