-- ─────────────────────────────────────────────────────────────────────────
-- 099 — Radar Empresas (Etapa 0: schema + seeds)
--
-- Módulo Vertho-INTERNO de inteligência comercial B2B. NÃO multi-tenant:
-- tabelas globais (sem empresa_id), guard por requireAdminAction().
-- Não confundir com o "Radar" educacional (diag_*, INEP).
--
-- Sócios fora do MVP (decisão — risco LGPD + volume).
-- CNPJ sempre TEXT. capital_social NUMERIC. RLS permissiva (padrão projeto).
-- Recorte MVP: Jundiaí/SP.
-- ─────────────────────────────────────────────────────────────────────────

-- ── Catálogos da Receita ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS radarempresas_cnaes (
  codigo      TEXT PRIMARY KEY,                 -- subclasse 7 díg ou classe
  descricao   TEXT NOT NULL,
  divisao     TEXT,                              -- 2 primeiros díg
  grupo       TEXT,                              -- 3 primeiros díg
  classe      TEXT,                              -- 5 primeiros díg
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS radarempresas_municipios (
  codigo_receita TEXT PRIMARY KEY,               -- código TOM/Receita
  nome           TEXT NOT NULL,
  uf             TEXT,
  codigo_ibge    TEXT,                           -- de-para p/ cruzar SIDRA
  regiao         TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_radaremp_mun_ibge
  ON radarempresas_municipios(codigo_ibge);

-- ── Empresas + Estabelecimentos (recorte tratado) ────────────────────────

CREATE TABLE IF NOT EXISTS radarempresas_empresas (
  cnpj_basico              TEXT PRIMARY KEY,     -- 8 díg
  razao_social             TEXT,
  natureza_juridica        TEXT,
  qualificacao_responsavel TEXT,
  capital_social           NUMERIC,
  porte_empresa            TEXT,                 -- 00 NA / 01 ME / 03 EPP / 05 demais
  ente_federativo          TEXT,
  fonte_version            TEXT,                 -- 'receita-2026-05'
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS radarempresas_estabelecimentos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj_completo       TEXT UNIQUE NOT NULL,      -- 14 díg
  cnpj_basico         TEXT NOT NULL REFERENCES radarempresas_empresas(cnpj_basico) ON DELETE CASCADE,
  cnpj_ordem          TEXT,
  cnpj_dv             TEXT,
  nome_fantasia       TEXT,
  is_matriz           BOOLEAN DEFAULT false,
  situacao_cadastral  TEXT,                      -- 02 = ativa (filtrado no MVP)
  is_active           BOOLEAN DEFAULT true,
  cnae_principal      TEXT,
  cnae_principal_desc TEXT,
  cnaes_secundarios   TEXT[],
  uf                  TEXT,
  municipio_cod       TEXT,                      -- código Receita
  municipio_nome      TEXT,
  bairro              TEXT,
  cep                 TEXT,
  email               TEXT,
  telefone_1          TEXT,
  telefone_2          TEXT,
  has_email           BOOLEAN DEFAULT false,
  has_phone           BOOLEAN DEFAULT false,
  has_fantasia        BOOLEAN DEFAULT false,
  data_inicio_atividade TEXT,
  company_age_years   INTEGER,
  fonte_version       TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_radaremp_estab_uf_mun
  ON radarempresas_estabelecimentos(uf, municipio_cod);
CREATE INDEX IF NOT EXISTS idx_radaremp_estab_cnae
  ON radarempresas_estabelecimentos(cnae_principal);
CREATE INDEX IF NOT EXISTS idx_radaremp_estab_basico
  ON radarempresas_estabelecimentos(cnpj_basico);

-- ── Camada proprietária Vertho ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS radarempresas_segmentos (
  key                       TEXT PRIMARY KEY,    -- 'educacao_privada', ...
  nome                      TEXT NOT NULL,
  descricao                 TEXT,
  priority_level            INTEGER DEFAULT 3,   -- 1=alta .. 5=baixa
  default_pain_hypotheses   JSONB DEFAULT '[]'::jsonb,
  recommended_offers        JSONB DEFAULT '[]'::jsonb,
  is_flag_only              BOOLEAN DEFAULT false, -- ex: "expansão regional" (não-CNAE)
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now()
);

-- Mapa CNAE→Segmento. Suporta qualquer granularidade via prefixo:
-- match no score = registro com maior prefixo_len que prefixa o CNAE do estab.
CREATE TABLE IF NOT EXISTS radarempresas_cnae_segmento (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cnae_prefixo             TEXT NOT NULL,        -- '85' (div), '4711' (grupo)...
  prefixo_len              INTEGER NOT NULL,     -- 2/3/5/7 — maior = mais específico
  segmento_key             TEXT NOT NULL REFERENCES radarempresas_segmentos(key) ON DELETE CASCADE,
  people_intensity_score   INTEGER DEFAULT 50,  -- 0-100
  leadership_complexity_score INTEGER DEFAULT 50,
  onboarding_need_score    INTEGER DEFAULT 50,
  standardization_need_score INTEGER DEFAULT 50,
  commercial_fit_score     INTEGER DEFAULT 50,
  is_priority              BOOLEAN DEFAULT false,
  notes                    TEXT,
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now(),
  UNIQUE (cnae_prefixo)
);
CREATE INDEX IF NOT EXISTS idx_radaremp_cnaeseg_prefixo
  ON radarempresas_cnae_segmento(prefixo_len DESC, cnae_prefixo);

-- ── Contexto SIDRA (cache) ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS radarempresas_sidra_cache (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uf                 TEXT,
  municipio_ibge     TEXT,
  cnae_grupo         TEXT,
  ano                INTEGER,
  indicador_key      TEXT NOT NULL,
  indicador_nome     TEXT,
  valor              NUMERIC,
  fonte_tabela_sidra TEXT,
  sidra_query_json   JSONB,
  fetched_at         TIMESTAMPTZ DEFAULT now(),
  created_at         TIMESTAMPTZ DEFAULT now(),
  UNIQUE (municipio_ibge, cnae_grupo, ano, indicador_key)
);

-- ── Score + Insight ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS radarempresas_scores (
  estabelecimento_id      UUID PRIMARY KEY REFERENCES radarempresas_estabelecimentos(id) ON DELETE CASCADE,
  cnpj_completo           TEXT NOT NULL,
  score_total             NUMERIC,              -- 0-100
  score_dor_pessoas       NUMERIC,
  score_capacidade_compra NUMERIC,
  score_fit_vertho        NUMERIC,
  score_contexto_setorial NUMERIC,
  classificacao           TEXT,                 -- abordar_agora|boa|nutrir|baixa
  score_explanation       JSONB,                -- parcelas auditáveis
  scoring_version         TEXT DEFAULT 'v1',
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_radaremp_scores_total
  ON radarempresas_scores(score_total DESC);
CREATE INDEX IF NOT EXISTS idx_radaremp_scores_classif
  ON radarempresas_scores(classificacao);

CREATE TABLE IF NOT EXISTS radarempresas_insights (
  estabelecimento_id   UUID PRIMARY KEY REFERENCES radarempresas_estabelecimentos(id) ON DELETE CASCADE,
  segmento_key         TEXT,
  pain_hypotheses      JSONB DEFAULT '[]'::jsonb,
  recommended_offer    TEXT,
  approach_angle       TEXT,
  sales_message_short  TEXT,
  sales_email_draft    TEXT,
  linkedin_message     TEXT,
  objections           JSONB DEFAULT '[]'::jsonb,
  confidence_level     TEXT DEFAULT 'medium',
  model_used           TEXT,
  prompt_version       TEXT,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

-- ── Listas de prospecção (interno Vertho — owner, não tenant) ────────────

CREATE TABLE IF NOT EXISTS radarempresas_listas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            TEXT NOT NULL,
  descricao       TEXT,
  owner_email     TEXT NOT NULL,                -- usuário Vertho
  filters_json    JSONB,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS radarempresas_lista_itens (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lista_id           UUID NOT NULL REFERENCES radarempresas_listas(id) ON DELETE CASCADE,
  estabelecimento_id UUID NOT NULL REFERENCES radarempresas_estabelecimentos(id) ON DELETE CASCADE,
  status             TEXT DEFAULT 'new',        -- new|reviewed|approved|contacted|meeting_scheduled|discarded
  notas              TEXT,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now(),
  UNIQUE (lista_id, estabelecimento_id)
);
CREATE INDEX IF NOT EXISTS idx_radaremp_listaitens_lista
  ON radarempresas_lista_itens(lista_id, status);

-- ── Operação: jobs + audit ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS radarempresas_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type        TEXT NOT NULL,                -- 'load_parquet'|'score'|'sidra_fetch'
  status          TEXT DEFAULT 'running',       -- running|done|failed
  source_name     TEXT,
  source_version  TEXT,
  rows_processed  INTEGER DEFAULT 0,
  rows_inserted   INTEGER DEFAULT 0,
  rows_failed     INTEGER DEFAULT 0,
  started_at      TIMESTAMPTZ DEFAULT now(),
  finished_at     TIMESTAMPTZ,
  error_message   TEXT,
  metadata_json   JSONB
);

CREATE TABLE IF NOT EXISTS radarempresas_audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_email     TEXT NOT NULL,
  action_type     TEXT NOT NULL,                -- export_leads|gerar_insight|criar_lista|...
  target_table    TEXT,
  target_id       TEXT,
  metadata_json   JSONB,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_radaremp_audit_created
  ON radarempresas_audit_logs(created_at DESC);

-- ── RLS permissiva (padrão do projeto — barreira real é requireAdminAction) ──
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'radarempresas_cnaes','radarempresas_municipios','radarempresas_empresas',
    'radarempresas_estabelecimentos','radarempresas_segmentos','radarempresas_cnae_segmento',
    'radarempresas_sidra_cache','radarempresas_scores','radarempresas_insights',
    'radarempresas_listas','radarempresas_lista_itens','radarempresas_jobs',
    'radarempresas_audit_logs'])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t || '_permissive', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (true) WITH CHECK (true);', t || '_permissive', t);
  END LOOP;
END $$;

-- ── Seed: 10 Segmentos Vertho ────────────────────────────────────────────
INSERT INTO radarempresas_segmentos (key, nome, descricao, priority_level, is_flag_only, default_pain_hypotheses, recommended_offers) VALUES
('educacao_privada', 'Educação privada', 'Escolas, cursos livres, idiomas, ensino técnico/superior privado', 1, false,
 '["retenção de professores","desenvolvimento docente","coordenação pedagógica","onboarding de educadores","padronização pedagógica","liderança escolar"]'::jsonb,
 '["Diagnóstico de Competências + PDI","Jornada de Liderança","Onboarding Inteligente","Pulso de Desenvolvimento"]'::jsonb),
('saude_clinicas', 'Saúde e clínicas', 'Clínicas médicas, odontologia, estética, laboratórios, redes de atendimento', 1, false,
 '["atendimento","padronização","liderança intermediária","treinamento rápido","experiência do paciente","rotatividade"]'::jsonb,
 '["Trilha de Atendimento","Jornada de Liderança","Onboarding Inteligente","Matriz de Competências"]'::jsonb),
('varejo_especializado', 'Varejo especializado', 'Lojas, farmácias, óticas, cosméticos, moda, franquias', 2, false,
 '["atendimento","vendas","turnover","onboarding","metas","liderança de loja"]'::jsonb,
 '["Trilha de Atendimento","Onboarding Inteligente","Jornada de Liderança"]'::jsonb),
('servicos_b2b_pessoas', 'Serviços B2B intensivos em pessoas', 'Facilities, limpeza, segurança, portaria, manutenção, terceirização', 1, false,
 '["supervisão","operação distribuída","absenteísmo","qualidade","padronização","liderança operacional"]'::jsonb,
 '["Jornada de Liderança","Matriz de Competências","Pulso de Desenvolvimento"]'::jsonb),
('logistica_transporte', 'Logística e transporte', 'Transporte, armazenagem, distribuição, correio', 2, false,
 '["coordenação operacional","segurança comportamental","liderança","comunicação","retenção","padronização"]'::jsonb,
 '["Jornada de Liderança","Trilha de Atendimento","Matriz de Competências"]'::jsonb),
('industria_operacao', 'Indústria com operação distribuída', 'Indústria de transformação com chão de fábrica', 3, false,
 '["liderança de chão de fábrica","sucessão","segurança","produtividade","treinamento técnico-comportamental","cultura"]'::jsonb,
 '["Jornada de Liderança","Matriz de Competências","Diagnóstico de Competências + PDI"]'::jsonb),
('industria_comercial', 'Indústria com força comercial', 'Indústria/atacado com equipe de vendas técnicas', 2, false,
 '["vendas técnicas","KAM","negociação","onboarding comercial","liderança comercial","efetividade comercial"]'::jsonb,
 '["Diagnóstico de Competências + PDI","Jornada de Liderança","Onboarding Inteligente"]'::jsonb),
('tecnologia_digital', 'Tecnologia e serviços digitais', 'TI, software, serviços de informação', 2, false,
 '["liderança jovem","cultura","crescimento rápido","feedback","onboarding","carreira"]'::jsonb,
 '["MentorIA para líderes","Pulso de Desenvolvimento","Jornada de Liderança"]'::jsonb),
('franquias_multiunidade', 'Franquias e redes multiunidade', 'Redes com múltiplas unidades operacionais', 1, false,
 '["padronização","cultura","treinamento","liderança local","expansão","atendimento"]'::jsonb,
 '["Onboarding Inteligente","Trilha de Atendimento","Jornada de Liderança","Matriz de Competências"]'::jsonb),
('expansao_regional', 'Empresas em expansão regional', 'Detectado por flag (multiunidade / crescimento), não por CNAE', 2, true,
 '["perda de padrão","liderança improvisada","onboarding","cultura","retenção"]'::jsonb,
 '["Onboarding Inteligente","Jornada de Liderança","Matriz de Competências"]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ── Seed: CNAE divisão → Segmento (bootstrap grosso; refina depois) ──────
-- prefixo_len=2 (divisão). O score casa o registro mais específico por prefixo.
INSERT INTO radarempresas_cnae_segmento
  (cnae_prefixo, prefixo_len, segmento_key, people_intensity_score, leadership_complexity_score, onboarding_need_score, standardization_need_score, commercial_fit_score, is_priority, notes)
VALUES
('85','2','educacao_privada',          90,80,85,80,85,true ,'Divisão 85 — Educação'),
('86','2','saude_clinicas',            90,75,80,85,80,true ,'Divisão 86 — Atenção à saúde humana'),
('47','2','varejo_especializado',      80,65,75,70,75,true ,'Divisão 47 — Comércio varejista'),
('80','2','servicos_b2b_pessoas',      85,70,75,80,75,true ,'Divisão 80 — Vigilância/segurança'),
('81','2','servicos_b2b_pessoas',      85,65,70,80,70,true ,'Divisão 81 — Serviços para edifícios (limpeza)'),
('82','2','servicos_b2b_pessoas',      70,60,65,70,65,false,'Divisão 82 — Serviços de escritório/apoio'),
('49','2','logistica_transporte',      75,65,65,75,60,false,'Divisão 49 — Transporte terrestre'),
('50','2','logistica_transporte',      70,60,60,70,55,false,'Divisão 50 — Transporte aquaviário'),
('51','2','logistica_transporte',      65,60,60,70,55,false,'Divisão 51 — Transporte aéreo'),
('52','2','logistica_transporte',      75,65,65,75,60,false,'Divisão 52 — Armazenagem/apoio ao transporte'),
('53','2','logistica_transporte',      70,60,60,70,55,false,'Divisão 53 — Correio e outras entregas'),
('46','2','industria_comercial',       70,70,75,65,85,true ,'Divisão 46 — Comércio atacadista (força comercial)'),
('62','2','tecnologia_digital',        70,75,75,55,70,true ,'Divisão 62 — Serviços de TI'),
('63','2','tecnologia_digital',        65,70,70,55,65,false,'Divisão 63 — Serviços de informação'),
('56','2','franquias_multiunidade',    85,60,75,80,65,true ,'Divisão 56 — Alimentação (proxy multiunidade)'),
('10','2','industria_operacao',        70,70,65,70,60,false,'Divisão 10 — Produtos alimentícios'),
('11','2','industria_operacao',        70,70,65,70,60,false,'Divisão 11 — Bebidas'),
('13','2','industria_operacao',        70,70,65,70,60,false,'Divisão 13 — Têxtil'),
('14','2','industria_operacao',        72,68,68,70,60,false,'Divisão 14 — Confecção'),
('15','2','industria_operacao',        70,68,65,70,60,false,'Divisão 15 — Couro/calçados'),
('16','2','industria_operacao',        68,68,62,68,58,false,'Divisão 16 — Madeira'),
('20','2','industria_operacao',        70,72,65,72,60,false,'Divisão 20 — Química'),
('22','2','industria_operacao',        70,70,65,70,60,false,'Divisão 22 — Borracha/plástico'),
('23','2','industria_operacao',        70,70,65,70,60,false,'Divisão 23 — Minerais não-metálicos'),
('25','2','industria_operacao',        72,70,65,70,60,false,'Divisão 25 — Produtos de metal'),
('28','2','industria_operacao',        72,72,68,70,62,false,'Divisão 28 — Máquinas e equipamentos'),
('31','2','industria_operacao',        72,68,68,70,60,false,'Divisão 31 — Móveis')
ON CONFLICT (cnae_prefixo) DO NOTHING;

-- ── Verificação ──────────────────────────────────────────────────────────
SELECT 'segmentos' AS tabela, COUNT(*) AS n FROM radarempresas_segmentos
UNION ALL SELECT 'cnae_segmento', COUNT(*) FROM radarempresas_cnae_segmento
UNION ALL SELECT 'estabelecimentos', COUNT(*) FROM radarempresas_estabelecimentos;
