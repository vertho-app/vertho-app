-- 210 — Turmas (coortes) como unidade operacional entre empresa e participante.
--
-- Proposta completa em docs/TURMAS.md. O problema em uma frase: o relógio do
-- PARTICIPANTE já existe (week-gating libera semana por `trilhas.data_inicio`,
-- por pessoa), mas o relógio do OPERADOR não — painel, ações em lote, gates de
-- etapa e cadência tomam `empresa_id` como unidade. Enquanto o cliente tinha uma
-- coorte só os dois coincidiam; Macaé (127 diretores em diagnóstico fechado +
-- 156 professores começando) quebrou a coincidência.
--
-- Esta migration é NEUTRA em comportamento: cria o schema e faz o backfill de
-- UMA turma por empresa. Uma turma = exatamente o que acontece hoje. Quem passa
-- a usar turma é o código das sprints seguintes.
--
-- ─── Decisões que o SQL abaixo materializa ────────────────────────────────
--
-- 1. FK COMPOSTA EM TODO VÍNCULO. O app roda em `service_role` (BYPASSRLS), então
--    a única garantia real de que turma, membro e trilha são do mesmo tenant é a
--    que o Postgres impõe. `references colaboradores(id)` PARECE isolamento e não
--    é: não valida `empresa_id`. Daí os `unique (id, empresa_id)` como alvo.
--
-- 2. VÍNCULO É TABELA, NÃO CAMPO no colaborador. Existe estado de turma ANTES de
--    existir trilha (Macaé: 283 pessoas, 0 trilhas), e a composição da safra é
--    decisão do operador — não `where cargo = 'Diretor'`. Um campo guardaria
--    "turma atual"; não guarda quem foi selecionado, quando e por quem.
--
-- 3. UMA PARTICIPAÇÃO ATIVA POR PESSOA, via índice PARCIAL. Sem isso o resolvedor
--    de config fica sem critério quando alguém está em duas turmas. E note que
--    NÃO há unique total em (turma_id, colaborador_id): ele proibiria justamente
--    o histórico de quem sai e volta — reentrada é linha nova, a anterior fica
--    'concluido'/'removido' com `saiu_em`.
--
-- 4. A UNIQUE DE `trilhas` NÃO MUDA. Trocá-la por (turma_membro_id,
--    numero_temporada) quebraria o upsert atômico do header (trilha-core.ts:772,
--    F-C1 do FMEA) e — pior — `turma_membro_id` é NULL em trilha legada, e UNIQUE
--    não deduplica NULL no Postgres: a atomicidade morreria exatamente no caminho
--    de compatibilidade. `turma_membro_id` entra como CARIMBO, ao lado de
--    `programa_modo`/`programa_config`.
--
-- 5. TURMA ≠ JORNADA. Com jornadas sequenciais (DUO = 2 trilhas, mig 199) a
--    pessoa segue na MESMA turma nas duas. A turma é a safra de entrada; a
--    jornada é o ciclo de conteúdo dentro dela.
--
-- Sem policy de propósito: RLS ligada + zero policy = só service_role lê/escreve,
-- que é a postura correta para tabela sem consumidor de browser (ver mig 206/208).
-- Idempotente: pode rodar duas vezes.

-- ════════════════════════════════════════════════════════════════════════
-- 1) Alvo das FKs compostas
-- ════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'colaboradores_id_empresa_ux') THEN
    ALTER TABLE colaboradores ADD CONSTRAINT colaboradores_id_empresa_ux UNIQUE (id, empresa_id);
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════
-- 2) turmas
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS turmas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome        text NOT NULL,                    -- "Diretores escolares — 2026.2"
  status      text NOT NULL DEFAULT 'planejada'
                CHECK (status IN ('planejada','diagnostico','trilhas_em_geracao','em_jornada','concluida','arquivada')),
  -- Segunda-feira canônica da safra. A geração de trilha usa ESTA data em vez de
  -- `nextMondayISO()` quando a participação tem turma (ver docs/TURMAS.md §1).
  data_inicio date,
  -- Override TIPADO da config (lib/turmas/chaves.ts decide o que pode morar aqui).
  -- Merge genérico com `||` perderia `false`, e aí a turma nunca conseguiria
  -- DESLIGAR o que a empresa ligou — que é metade do caso de uso.
  sys_config  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT turmas_id_empresa_ux UNIQUE (id, empresa_id)  -- alvo das FKs compostas
);

CREATE UNIQUE INDEX IF NOT EXISTS turmas_empresa_nome_ux
  ON turmas (empresa_id, lower(nome));
CREATE INDEX IF NOT EXISTS turmas_empresa_status_idx
  ON turmas (empresa_id, status);

ALTER TABLE turmas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON turmas FROM anon, authenticated;

COMMENT ON TABLE turmas IS
  'Safra/edição do programa dentro de uma empresa. Unidade de escopo para painel, ações em lote, gates de etapa e calendário (docs/TURMAS.md).';

-- ════════════════════════════════════════════════════════════════════════
-- 3) turma_membros — a PARTICIPAÇÃO
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS turma_membros (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL,
  turma_id        uuid NOT NULL,
  colaborador_id  uuid NOT NULL,
  status          text NOT NULL DEFAULT 'ativo'
                    CHECK (status IN ('ativo','removido','concluido')),
  entrou_em       date NOT NULL DEFAULT current_date,
  saiu_em         date,
  -- Exceção da PARTICIPAÇÃO, não da pessoa. `colaboradores.programa_modo` é
  -- global: um override 'piloto' numa turma seguiria valendo meses depois, em
  -- outra safra, sem ninguém perceber.
  config_override jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT turma_membros_turma_fk
    FOREIGN KEY (turma_id, empresa_id)       REFERENCES turmas(id, empresa_id) ON DELETE CASCADE,
  CONSTRAINT turma_membros_colab_fk
    FOREIGN KEY (colaborador_id, empresa_id) REFERENCES colaboradores(id, empresa_id) ON DELETE CASCADE,
  CONSTRAINT turma_membros_id_empresa_ux UNIQUE (id, empresa_id)  -- alvo da FK de trilhas
);

-- Uma participação ATIVA por pessoa (decisão 3 do cabeçalho).
CREATE UNIQUE INDEX IF NOT EXISTS turma_membros_ativo_unico_ux
  ON turma_membros (empresa_id, colaborador_id) WHERE status = 'ativo';
CREATE INDEX IF NOT EXISTS turma_membros_turma_idx
  ON turma_membros (turma_id, status);
CREATE INDEX IF NOT EXISTS turma_membros_colab_idx
  ON turma_membros (colaborador_id);

ALTER TABLE turma_membros ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON turma_membros FROM anon, authenticated;

COMMENT ON TABLE turma_membros IS
  'Participação de um colaborador numa turma. Reentrada = linha nova (a anterior fica concluido/removido com saiu_em); só UMA pode estar ativa por pessoa.';

-- ════════════════════════════════════════════════════════════════════════
-- 4) Carimbo na trilha + turma na auditoria
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE trilhas ADD COLUMN IF NOT EXISTS turma_membro_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trilhas_turma_membro_fk') THEN
    ALTER TABLE trilhas ADD CONSTRAINT trilhas_turma_membro_fk
      FOREIGN KEY (turma_membro_id, empresa_id)
      REFERENCES turma_membros(id, empresa_id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS trilhas_turma_membro_idx
  ON trilhas (turma_membro_id) WHERE turma_membro_id IS NOT NULL;

COMMENT ON COLUMN trilhas.turma_membro_id IS
  'CARIMBO da participação que originou a trilha (mig 210). NULL = trilha legada: resolve config como antes (empresa → default), sem erro.';

ALTER TABLE admin_audit_log ADD COLUMN IF NOT EXISTS turma_id uuid;
COMMENT ON COLUMN admin_audit_log.turma_id IS
  'Escopo da ação em lote (mig 210). NULL = ação de empresa inteira ou anterior às turmas.';

-- ════════════════════════════════════════════════════════════════════════
-- 5) Backfill — UMA turma por empresa que tenha gente
-- ════════════════════════════════════════════════════════════════════════
--
-- Uma turma = comportamento idêntico ao de hoje. O `status` é inferido do estado
-- real (tem trilha ativa → em_jornada; tem resposta → diagnostico; senão
-- planejada) e o `data_inicio` é o mais frequente entre as trilhas ativas — a
-- data que de fato rege o calendário da coorte. Empresa sem colaborador não
-- ganha turma: turma vazia é ruído no painel.

INSERT INTO turmas (empresa_id, nome, status, data_inicio)
SELECT
  e.id,
  'Turma inicial',
  CASE
    WHEN EXISTS (SELECT 1 FROM trilhas t WHERE t.empresa_id = e.id AND t.status = 'ativa') THEN 'em_jornada'
    WHEN EXISTS (SELECT 1 FROM respostas r WHERE r.empresa_id = e.id)                      THEN 'diagnostico'
    ELSE 'planejada'
  END,
  (SELECT t.data_inicio
     FROM trilhas t
    WHERE t.empresa_id = e.id AND t.status = 'ativa' AND t.data_inicio IS NOT NULL
    GROUP BY t.data_inicio
    ORDER BY count(*) DESC, t.data_inicio ASC
    LIMIT 1)
FROM empresas e
WHERE EXISTS (SELECT 1 FROM colaboradores c WHERE c.empresa_id = e.id)
  AND NOT EXISTS (SELECT 1 FROM turmas tu WHERE tu.empresa_id = e.id);

-- Membros: todos os colaboradores da empresa. `entrou_em` = data de cadastro,
-- não `current_date` — o backfill não deve inventar que todo mundo entrou hoje.
INSERT INTO turma_membros (empresa_id, turma_id, colaborador_id, status, entrou_em)
SELECT c.empresa_id, tu.id, c.id, 'ativo', c.created_at::date
FROM colaboradores c
JOIN turmas tu ON tu.empresa_id = c.empresa_id AND tu.nome = 'Turma inicial'
WHERE NOT EXISTS (
  SELECT 1 FROM turma_membros m
   WHERE m.colaborador_id = c.id AND m.status = 'ativo'
);

-- Carimbo retroativo nas trilhas existentes.
UPDATE trilhas t
   SET turma_membro_id = m.id
  FROM turma_membros m
 WHERE m.colaborador_id = t.colaborador_id
   AND m.empresa_id     = t.empresa_id
   AND m.status         = 'ativo'
   AND t.turma_membro_id IS NULL;
