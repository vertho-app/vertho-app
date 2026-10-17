-- 289: histórico de blueprint e PDI sobrescritos (17/10/2026).
--
-- `development_blueprints` e `relatorios` (tipo individual) guardam UMA linha por
-- pessoa, e a geração é upsert: regerar apaga a versão anterior. Na 2ª jornada de
-- Ibipeba (Temporada 2, outra competência) isso apagaria o blueprint e o PDI da
-- Temporada 1 de 25 pessoas, e a regra do dono é que o que a pessoa fez é evidência
-- dela e não se apaga. Antes de sobrescrever, o escritor copia a linha atual para cá
-- (`lib/artefatos-historico.ts`); se a cópia falha, a sobrescrita não acontece.
--
-- O PDF não é copiado: desde o R-67 (04/10) o caminho no bucket leva um carimbo de
-- tempo, então o arquivo antigo continua lá e basta guardar o `pdf_path`.
--
-- Uma linha por VERSÃO: (tipo, origem_id, gerado_em) é único, e o escritor grava com
-- ON CONFLICT DO NOTHING, então uma regeração que falha depois de arquivar e é
-- refeita não duplica o histórico.
--
-- Isolamento por código (service-role + `tenantDb`, guards `tenant-read-guard` e
-- `tenant-mutation-guard`); RLS ligada SEM policy nega tudo para anon/authenticated.
-- Excluir a pessoa leva o histórico junto (FK composta com CASCADE, como a 283).
--
-- Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS artefatos_jornada_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL,
  tipo text NOT NULL,
  origem_id uuid NOT NULL,
  conteudo jsonb NOT NULL,
  pdf_path text,
  spec_version int,
  auditoria jsonb,
  auditado_em timestamptz,
  gerado_em timestamptz NOT NULL,
  arquivado_em timestamptz NOT NULL DEFAULT now(),
  motivo text NOT NULL DEFAULT 'sobrescrito',
  CONSTRAINT artefatos_jornada_historico_colab_fk
    FOREIGN KEY (colaborador_id, empresa_id) REFERENCES colaboradores(id, empresa_id) ON DELETE CASCADE,
  CONSTRAINT artefatos_jornada_historico_tipo_check CHECK (tipo IN ('blueprint', 'pdi')),
  CONSTRAINT artefatos_jornada_historico_versao_unica UNIQUE (tipo, origem_id, gerado_em)
);

CREATE INDEX IF NOT EXISTS artefatos_jornada_historico_pessoa_idx
  ON artefatos_jornada_historico (colaborador_id, empresa_id, tipo, gerado_em DESC);

ALTER TABLE artefatos_jornada_historico ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE artefatos_jornada_historico IS
  'Versões anteriores de blueprint (development_blueprints) e PDI (relatorios tipo individual), copiadas pelo escritor ANTES de cada sobrescrita (mig 289). Uma linha por versão.';
COMMENT ON COLUMN artefatos_jornada_historico.tipo IS 'blueprint = development_blueprints; pdi = relatorios com tipo individual.';
COMMENT ON COLUMN artefatos_jornada_historico.origem_id IS 'id da linha viva que foi sobrescrita (a linha continua existindo com o conteúdo novo).';
COMMENT ON COLUMN artefatos_jornada_historico.conteudo IS 'O JSON da versão anterior: development_blueprints.blueprint ou relatorios.conteudo (com a auditoria do PDI dentro).';
COMMENT ON COLUMN artefatos_jornada_historico.pdf_path IS 'Caminho do PDF da versão anterior no bucket relatorios-pdf (só PDI). O arquivo não é copiado: o caminho tem carimbo de tempo e não é sobrescrito.';
COMMENT ON COLUMN artefatos_jornada_historico.spec_version IS 'spec_version do blueprint arquivado (nulo no PDI).';
COMMENT ON COLUMN artefatos_jornada_historico.auditoria IS 'Auditoria do blueprint arquivado (a do PDI mora dentro de conteudo).';
COMMENT ON COLUMN artefatos_jornada_historico.auditado_em IS 'Quando o blueprint arquivado foi auditado (nulo no PDI).';
COMMENT ON COLUMN artefatos_jornada_historico.gerado_em IS 'gerado_em da versão arquivada: é o que diz a qual jornada ela pertence (lib/turmas/janela.ts).';
COMMENT ON COLUMN artefatos_jornada_historico.arquivado_em IS 'Quando a versão foi copiada para cá (instante da sobrescrita).';
COMMENT ON COLUMN artefatos_jornada_historico.motivo IS 'Por que foi arquivada; hoje sempre sobrescrito (regeração).';

NOTIFY pgrst, 'reload schema';

-- Rollback (se precisar):
-- DROP TABLE IF EXISTS artefatos_jornada_historico;
