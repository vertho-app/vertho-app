-- 232 — desafio da SEMANA: uma tarefa que cobre os DOIS descritores entregues
--
-- POR QUE UMA TABELA NOVA, e não um campo em `kits`
-- ─────────────────────────────────────────────────
-- `kits` é 1 por (brief × DISC), e `kit_briefs` é idempotente por
-- (empresa × competência × DESCRITOR × nível × cargo × contexto). A chave da
-- matriz inteira é o descritor ÚNICO — é por ele que o conteúdo casa, e é por
-- ele que a pílula é montada. Um desafio de PAR não cabe nessa chave: forçá-lo
-- ali exigiria um brief cujo `descritor` fosse "A + B", e `descritor` é
-- justamente o campo que o resolvedor de conteúdo usa para achar o material
-- (ver o aviso em lib/descritor-humano.ts: a limpeza é de exibição, o dado é
-- chave). Renomear a chave para caber uma peça nova quebraria o casamento que
-- funciona hoje.
--
-- O QUE ESTA TABELA É
-- ───────────────────
-- A TAREFA da semana, quando a semana entrega dois descritores da mesma
-- competência. As duas pílulas continuam vindo de `kits` (uma por descritor);
-- o que passa a ser único é a tarefa, e ela é escrita OLHANDO OS DOIS.
--
-- 🔴 O QUE ISTO CUSTA, medido em 27/08/2026 (registrar para não descobrir depois):
--
--            descritores distintos | células (cargo×DISC) | pares | células por par
--   ibipeba              37        |        150           |  251  |      355
--   macae                 8        |         32           |   47  |      103
--
-- A matriz por PAR é ~2,5× a matriz por descritor, e cresce muito pior: o par
-- vem do blueprint de CADA pessoa, então 37 descritores geram 251 pares. Kit por
-- descritor é reaproveitado entre pessoas; kit por par quase não é. Quem for
-- mexer no volume de geração precisa saber disso antes, não depois.
--
-- ⚠️ `empresa_id` é NOT NULL de propósito. `kit_briefs` aceita NULL (kit global),
-- e um UNIQUE com coluna nula NÃO impede duplicata — NULL nunca é igual a NULL.
-- Seria a mesma classe do índice parcial que já quebrou upsert aqui (42P10 no
-- PostgREST). Não existe caso de par global hoje: o par vem do blueprint, que é
-- por empresa. Se um dia existir, a decisão é explícita, não um acidente de NULL.

CREATE TABLE IF NOT EXISTS kit_desafios_semana (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  competencia    text NOT NULL,
  /**
   * Descritores COMO VIERAM do plano (com código da matriz, se houver) — servem
   * ao prompt e à leitura humana. NÃO são a chave.
   */
  descritores    text[] NOT NULL,
  /**
   * A CHAVE: os mesmos descritores normalizados (sem código, sem acento, caixa
   * baixa) e ORDENADOS. Ordenar é deliberado — [A,B] e [B,A] são a mesma semana
   * e devem reusar a mesma tarefa; sem isso a matriz dobraria por acidente de
   * ordenação do blueprint.
   */
  descritores_norm text[] NOT NULL,
  cargo          text NOT NULL DEFAULT 'todos',
  disc           text NOT NULL,
  /**
   * { desafio_texto, acao_observavel, criterio_de_execucao, por_que_cabe_na_semana }
   * — mesma forma de `kits.desafio`, para o consumidor não precisar saber de
   * qual das duas fontes a tarefa veio.
   */
  desafio        jsonb NOT NULL,
  status         text NOT NULL DEFAULT 'published',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kit_desafios_semana_disc_valido CHECK (disc IN ('D', 'I', 'S', 'C')),
  CONSTRAINT kit_desafios_semana_par CHECK (array_length(descritores_norm, 1) >= 2)
);

-- Idempotência da célula. Sem coluna nula na chave, um UNIQUE simples basta —
-- ver o aviso sobre empresa_id acima.
CREATE UNIQUE INDEX IF NOT EXISTS uq_kit_desafios_semana_celula
  ON kit_desafios_semana (empresa_id, competencia, descritores_norm, cargo, disc);

CREATE INDEX IF NOT EXISTS idx_kit_desafios_semana_empresa
  ON kit_desafios_semana (empresa_id, competencia);

ALTER TABLE kit_desafios_semana ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON kit_desafios_semana FROM anon;
REVOKE ALL ON kit_desafios_semana FROM authenticated;

COMMENT ON TABLE kit_desafios_semana IS
  'A TAREFA da semana quando ela entrega 2 descritores da MESMA competência — escrita olhando os dois. As pílulas continuam vindo de kits (uma por descritor); o que é único é a tarefa. Chave: (empresa, competência, descritores_norm ORDENADOS, cargo, DISC).';
COMMENT ON COLUMN kit_desafios_semana.descritores_norm IS
  'Chave de reuso: descritores normalizados (normDescritor) e ORDENADOS. [A,B] e [B,A] são a mesma semana — sem ordenar, a matriz dobraria por acidente de ordenação do blueprint.';
COMMENT ON COLUMN kit_desafios_semana.empresa_id IS
  'NOT NULL de propósito: UNIQUE com coluna nula não impede duplicata (NULL nunca é igual a NULL), e o par vem do blueprint, que é por empresa.';

NOTIFY pgrst, 'reload schema';
