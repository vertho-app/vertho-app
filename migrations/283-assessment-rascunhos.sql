-- 283: rascunho das respostas do mapeamento de competências (09/10/2026).
--
-- A tela do assessment guardava P1 a P4 só na memória do navegador até o envio
-- final. Em 08/10/2026 uma pessoa de Ibipeba respondeu três das quatro perguntas,
-- a sessão caiu ("saiu"), e ao voltar não havia nada: as respostas nunca chegaram
-- ao banco. Aqui fica o que a pessoa já escreveu, gravado a cada pergunta e
-- enquanto ela digita, e apagado quando a resposta definitiva é salva.
--
-- Uma linha por (pessoa, trilho, competência). O `cenario_id` guarda para QUAL
-- cenário o texto foi escrito: se o cenário servido mudar (regerado), o rascunho
-- não é oferecido (o texto responderia outra situação).
--
-- Texto livre da pessoa: isolamento por guard (`tenant-read-guard` e
-- `tenant-mutation-guard`), não por policy. RLS ligada SEM policy nega tudo para
-- anon/authenticated; o app lê e grava por service-role, sempre com empresa_id.
--
-- Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS assessment_rascunhos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL,
  trilho text NOT NULL DEFAULT 'cargo',
  competencia_id uuid NOT NULL REFERENCES competencias(id) ON DELETE CASCADE,
  cenario_id uuid NOT NULL REFERENCES banco_cenarios(id) ON DELETE CASCADE,
  r1 text NOT NULL DEFAULT '',
  r2 text NOT NULL DEFAULT '',
  r3 text NOT NULL DEFAULT '',
  r4 text NOT NULL DEFAULT '',
  pergunta_atual smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assessment_rascunhos_colab_fk
    FOREIGN KEY (colaborador_id, empresa_id) REFERENCES colaboradores(id, empresa_id) ON DELETE CASCADE,
  CONSTRAINT assessment_rascunhos_trilho_check CHECK (trilho IN ('cargo', 'lideranca')),
  CONSTRAINT assessment_rascunhos_pergunta_check CHECK (pergunta_atual BETWEEN 0 AND 3),
  CONSTRAINT assessment_rascunhos_tamanho_check CHECK (
    char_length(r1) <= 5000 AND char_length(r2) <= 5000 AND char_length(r3) <= 5000 AND char_length(r4) <= 5000
  ),
  CONSTRAINT assessment_rascunhos_unico UNIQUE (empresa_id, colaborador_id, trilho, competencia_id)
);

CREATE INDEX IF NOT EXISTS assessment_rascunhos_colab_idx
  ON assessment_rascunhos (colaborador_id, empresa_id);
CREATE INDEX IF NOT EXISTS assessment_rascunhos_cenario_idx
  ON assessment_rascunhos (cenario_id);
CREATE INDEX IF NOT EXISTS assessment_rascunhos_competencia_idx
  ON assessment_rascunhos (competencia_id);

ALTER TABLE assessment_rascunhos ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE assessment_rascunhos IS
  'Rascunho das respostas P1-P4 do mapeamento de competências (mig 283). Gravado a cada pergunta e com debounce enquanto a pessoa digita; apagado quando a resposta definitiva vai para `respostas`. Só é oferecido de volta para o MESMO cenário.';
COMMENT ON COLUMN assessment_rascunhos.trilho IS 'Qual mapeamento: cargo (Top 5 do cargo) ou lideranca (programa de prontidão).';
COMMENT ON COLUMN assessment_rascunhos.cenario_id IS 'Cenário para o qual o texto foi escrito; se o cenário servido mudar, o rascunho não volta.';
COMMENT ON COLUMN assessment_rascunhos.pergunta_atual IS 'Índice 0-3 da pergunta em que a pessoa estava, para a tela reabrir no mesmo ponto.';
COMMENT ON COLUMN assessment_rascunhos.updated_at IS 'Última gravação do rascunho (o app escreve o instante a cada salvamento).';

-- Rollback (se precisar):
-- DROP TABLE IF EXISTS assessment_rascunhos;
