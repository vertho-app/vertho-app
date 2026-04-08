-- Modelo de Fit v2 — Persistência

-- Perfil ideal do cargo (pode usar gabarito existente ou override)
ALTER TABLE cargos_empresa ADD COLUMN IF NOT EXISTS fit_perfil_ideal JSONB DEFAULT NULL;
ALTER TABLE cargos_empresa ADD COLUMN IF NOT EXISTS fit_versao TEXT DEFAULT '2.0';

-- Resultados individuais de Fit
CREATE TABLE IF NOT EXISTS fit_resultados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  colaborador_id UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  cargo_id UUID REFERENCES cargos_empresa(id) ON DELETE SET NULL,
  cargo_nome TEXT NOT NULL,
  versao_modelo TEXT DEFAULT '2.0',
  fit_final NUMERIC NOT NULL,
  classificacao TEXT,
  recomendacao TEXT,
  score_base NUMERIC,
  fator_critico NUMERIC,
  fator_excesso NUMERIC,
  score_mapeamento NUMERIC,
  score_competencias NUMERIC,
  score_lideranca NUMERIC,
  score_disc NUMERIC,
  resultado_json JSONB,            -- JSON completo (blocos, gaps, leitura)
  leitura_executiva TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE fit_resultados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_full_fit" ON fit_resultados FOR ALL USING (true);
CREATE INDEX IF NOT EXISTS idx_fit_empresa ON fit_resultados(empresa_id);
CREATE INDEX IF NOT EXISTS idx_fit_colab ON fit_resultados(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_fit_cargo ON fit_resultados(empresa_id, cargo_nome);
