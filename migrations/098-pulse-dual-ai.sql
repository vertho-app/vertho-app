-- ─────────────────────────────────────────────────────────────────────────
-- 098 — Pulso de Desenvolvimento (Etapa 4: Dual-IA + triangulação cache)
--
-- Adiciona:
--   - pulse_classifications: 1 linha por resposta aberta classificada.
--     Guarda saída do modelo classificador (themes/sentiment) E auditoria
--     (verificação por 2º modelo, com confidence_adjusted e divergências).
--   - pulse_triangulations: cache do resultado da triangulação por
--     (ciclo, group_type, group_key). Evita recomputar a cada acesso e
--     dá histórico.
--
-- Modelos default:
--   - classifier: claude-sonnet-4-6
--   - auditor: gemini-3-flash-preview (mais barato, foco em check)
-- Configurável via empresas.sys_config.ai.modelos.pulse_classify /
-- pulse_audit (ai-tasks.ts).
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pulse_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  ciclo_id UUID NOT NULL REFERENCES pulse_ciclos(id) ON DELETE CASCADE,
  response_id UUID NOT NULL REFERENCES pulse_responses(id) ON DELETE CASCADE,
  pulse_moment TEXT NOT NULL CHECK (pulse_moment IN ('T0', 'T2')),

  -- Saída modelo 1
  classifier_model TEXT NOT NULL,
  classifier_themes TEXT[] NOT NULL DEFAULT '{}',         -- chaves da taxonomia
  classifier_sentiment TEXT,                              -- 'positive' | 'neutral' | 'negative' | 'mixed'
  classifier_evidence TEXT,                               -- frase curta do texto que justifica
  classifier_confidence TEXT DEFAULT 'medium',            -- 'low'|'medium'|'high' (auto-reportado)
  classifier_raw_response TEXT,                           -- JSON bruto pra debug
  classifier_called_at TIMESTAMPTZ DEFAULT now(),

  -- Saída modelo 2 (auditoria) — pode ser null se ainda não auditado
  auditor_model TEXT,
  auditor_agrees BOOLEAN,                                 -- modelo 2 concorda com 1
  auditor_divergences JSONB,                              -- lista de temas que discorda
  auditor_confidence_adjusted TEXT,                       -- 'low'|'medium'|'high' final
  auditor_notes TEXT,
  auditor_called_at TIMESTAMPTZ,

  -- Confidence final usada na agregação
  final_confidence TEXT NOT NULL DEFAULT 'medium' CHECK (final_confidence IN ('low','medium','high')),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (response_id)
);

CREATE INDEX IF NOT EXISTS idx_pulse_cls_ciclo_momento
  ON pulse_classifications (ciclo_id, pulse_moment);
CREATE INDEX IF NOT EXISTS idx_pulse_cls_themes
  ON pulse_classifications USING GIN (classifier_themes);

ALTER TABLE pulse_classifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pulse_cls_permissive ON pulse_classifications;
CREATE POLICY pulse_cls_permissive ON pulse_classifications FOR ALL USING (true) WITH CHECK (true);


-- ─── pulse_triangulations (cache) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pulse_triangulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  ciclo_id UUID NOT NULL REFERENCES pulse_ciclos(id) ON DELETE CASCADE,
  group_type TEXT NOT NULL,                               -- 'company' | 'area' | 'cargo'
  group_key TEXT NOT NULL,
  respondent_count INTEGER NOT NULL,

  summary TEXT,
  accelerators_json JSONB DEFAULT '[]'::jsonb,
  blockers_json JSONB DEFAULT '[]'::jsonb,
  alerts_json JSONB DEFAULT '[]'::jsonb,
  recommendations_json JSONB DEFAULT '[]'::jsonb,
  divergences_json JSONB DEFAULT '[]'::jsonb,
  themes_json JSONB DEFAULT '[]'::jsonb,                  -- temas dominantes do texto aberto

  confidence_level TEXT NOT NULL DEFAULT 'medium' CHECK (confidence_level IN ('low','medium','high')),

  -- Metadados de quem gerou
  classifier_model TEXT,
  auditor_model TEXT,
  computed_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (ciclo_id, group_type, group_key)
);

CREATE INDEX IF NOT EXISTS idx_pulse_tri_ciclo
  ON pulse_triangulations (ciclo_id);

ALTER TABLE pulse_triangulations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pulse_tri_permissive ON pulse_triangulations;
CREATE POLICY pulse_tri_permissive ON pulse_triangulations FOR ALL USING (true) WITH CHECK (true);


-- ─── Verificação ──────────────────────────────────────────────────────────
SELECT 'pulse_classifications' AS tabela, COUNT(*) AS rows FROM pulse_classifications
UNION ALL SELECT 'pulse_triangulations', COUNT(*) FROM pulse_triangulations;
