-- ─────────────────────────────────────────────────────────────────────────
-- 096 — Pulso de Desenvolvimento (Etapa 1: coleta)
--
-- Cria as tabelas-base do módulo Pulso de Desenvolvimento — pesquisa T0/T2
-- com 12 perguntas Likert + 1 aberta cada, em 6 dimensões.
--
-- Decisões:
--   - Template das perguntas vive em código (lib/pulse/template.ts) — não
--     vira tabela enquanto não houver customização por empresa.
--   - "Jornada" = ciclo de pulso (empresa + nome + janela). T0/T2 manuais.
--   - Stage do módulo (experimental | calibrating | production) fica em
--     empresas.sys_config.pulse_stage — não precisa de DDL.
--
-- Privacidade:
--   - pulse_responses contém dados individuais (Likert + texto aberto)
--     usados pra personalização da jornada.
--   - Dashboards de gestor/RH consomem agregados via MV (Etapa 2).
--   - Threshold n>=7 aplicado em camada de aplicação (lib/pulse/anonymity.ts).
--   - pulse_audit_logs registra todo acesso a relatório agregado.
-- ─────────────────────────────────────────────────────────────────────────

-- ─── pulse_ciclos ─────────────────────────────────────────────────────────
-- Representa um ciclo de pulso de uma empresa (ex: "Macaé - 1º Sem 2026").
-- Admin cria, dispara T0, depois (semanas depois) dispara T2.

CREATE TABLE IF NOT EXISTS pulse_ciclos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,                          -- "1º Semestre 2026"
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'draft',        -- draft | t0_aberto | em_jornada | t2_aberto | encerrado
  t0_aberto_em TIMESTAMPTZ,
  t0_fechado_em TIMESTAMPTZ,
  t2_aberto_em TIMESTAMPTZ,
  t2_fechado_em TIMESTAMPTZ,
  created_by UUID,                             -- admin que criou (colaborador.id ou null se platform admin)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pulse_ciclos_empresa
  ON pulse_ciclos(empresa_id, status);

ALTER TABLE pulse_ciclos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pulse_ciclos_permissive ON pulse_ciclos;
CREATE POLICY pulse_ciclos_permissive ON pulse_ciclos FOR ALL USING (true) WITH CHECK (true);


-- ─── pulse_assignments ────────────────────────────────────────────────────
-- "Convite" pra um colab responder T0 ou T2 num ciclo.
-- UK garante 1 assignment por (ciclo, colab, momento) — evita duplicidade.

CREATE TABLE IF NOT EXISTS pulse_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  ciclo_id UUID NOT NULL REFERENCES pulse_ciclos(id) ON DELETE CASCADE,
  colaborador_id UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  pulse_moment TEXT NOT NULL CHECK (pulse_moment IN ('T0', 'T2')),
  status TEXT NOT NULL DEFAULT 'pending',      -- pending | started | completed | expired
  due_date DATE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (ciclo_id, colaborador_id, pulse_moment)
);

CREATE INDEX IF NOT EXISTS idx_pulse_assignments_colab
  ON pulse_assignments(colaborador_id, status);
CREATE INDEX IF NOT EXISTS idx_pulse_assignments_ciclo_status
  ON pulse_assignments(ciclo_id, pulse_moment, status);

ALTER TABLE pulse_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pulse_assignments_permissive ON pulse_assignments;
CREATE POLICY pulse_assignments_permissive ON pulse_assignments FOR ALL USING (true) WITH CHECK (true);


-- ─── pulse_responses ──────────────────────────────────────────────────────
-- Resposta a uma pergunta específica (1 linha por pergunta).
-- question_id é a chave do template em código (ex: "T0_D1_Q1").
-- numeric_answer pra Likert (1-5), text_answer pra aberta.

CREATE TABLE IF NOT EXISTS pulse_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  ciclo_id UUID NOT NULL REFERENCES pulse_ciclos(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES pulse_assignments(id) ON DELETE CASCADE,
  colaborador_id UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  pulse_moment TEXT NOT NULL CHECK (pulse_moment IN ('T0', 'T2')),
  question_id TEXT NOT NULL,                   -- "T0_D1_Q1" (chave do template TS)
  dimension_key TEXT NOT NULL,                 -- "clareza" | "condicoes" | ...
  numeric_answer SMALLINT CHECK (numeric_answer BETWEEN 1 AND 5),
  text_answer TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (assignment_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_pulse_responses_ciclo_momento
  ON pulse_responses(ciclo_id, pulse_moment);
CREATE INDEX IF NOT EXISTS idx_pulse_responses_dimensao
  ON pulse_responses(ciclo_id, pulse_moment, dimension_key);

ALTER TABLE pulse_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pulse_responses_permissive ON pulse_responses;
CREATE POLICY pulse_responses_permissive ON pulse_responses FOR ALL USING (true) WITH CHECK (true);


-- ─── pulse_audit_logs ─────────────────────────────────────────────────────
-- Quem acessou relatório agregado, quando, com que filtros.
-- Usado pra LGPD/compliance — não bloqueia operação, só registra.

CREATE TABLE IF NOT EXISTS pulse_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  actor_email TEXT NOT NULL,
  actor_role TEXT,                             -- 'admin' | 'rh' | 'gestor' | etc
  action_type TEXT NOT NULL,                   -- 'view_dashboard' | 'export_pdf' | 'view_triangulation'
  ciclo_id UUID REFERENCES pulse_ciclos(id) ON DELETE SET NULL,
  group_key TEXT,                              -- ex: 'area:Pedagogia' | 'cargo:Diretor'
  metadata_json JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pulse_audit_empresa
  ON pulse_audit_logs(empresa_id, created_at DESC);

ALTER TABLE pulse_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pulse_audit_permissive ON pulse_audit_logs;
CREATE POLICY pulse_audit_permissive ON pulse_audit_logs FOR ALL USING (true) WITH CHECK (true);


-- ─── Verificação ──────────────────────────────────────────────────────────
SELECT 'pulse_ciclos' AS tabela, COUNT(*) AS rows FROM pulse_ciclos
UNION ALL SELECT 'pulse_assignments', COUNT(*) FROM pulse_assignments
UNION ALL SELECT 'pulse_responses', COUNT(*) FROM pulse_responses
UNION ALL SELECT 'pulse_audit_logs', COUNT(*) FROM pulse_audit_logs;
