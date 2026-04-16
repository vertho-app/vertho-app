-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRAÇÃO 003: Catálogo Enriquecido, Referências CIS e Moodle
-- Origem: gas-antigo/ → CatalogoEnriquecido.js, CISReferencia.js, Fase4_Moodle.js
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CATALOGO_ENRIQUECIDO
--    Classificação de cursos Moodle por competência, descritor e nível.
--    1 linha = 1 curso × cargo (mesmo curso pode gerar múltiplas linhas).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalogo_enriquecido (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  cargo               TEXT,
  competencia_nome    TEXT,
  cod_comp            TEXT,
  descritor           TEXT,
  cod_desc            TEXT,
  nivel_transicao     TEXT,           -- ex: "N1→N2", "N2→N3"
  conteudo_seq        TEXT,           -- sequência de conteúdo
  semana_uso          INT,            -- semana da trilha onde é usado
  tipo                TEXT,           -- 'conteudo' | 'administrativo'
  curso_moodle        TEXT,           -- nome do curso no Moodle
  url_moodle          TEXT,           -- URL direta
  course_id           TEXT,           -- ID do curso no Moodle
  tags                TEXT,
  resumo_tutor        TEXT,           -- ~500 palavras para o Tutor IA
  transcricao         TEXT,           -- transcrição de vídeos
  status              TEXT,           -- 'classificado' | 'pendente' | 'erro'
  confianca           NUMERIC,        -- 0-100 confiança da classificação IA
  ultima_atualizacao  TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CIS_REFERENCIA
--    Base de conhecimento CIS — dimensões DISC, valores e tipos.
--    Dados estáticos de referência (não mudam por empresa).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cis_referencia (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  teoria              TEXT,           -- 'DISC' | 'Valores' | 'Tipos'
  dimensao            TEXT,           -- ex: 'D', 'I', 'S', 'C', 'Teórico', etc.
  intensidade         TEXT,           -- 'Alto' | 'Baixo' | 'Neutro'
  categoria           TEXT,
  conteudo            TEXT,           -- descrição resumida
  uso_no_sistema      TEXT,           -- como o sistema usa esse dado
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CIS_IA_REFERENCIA
--    Base expandida CIS para prompts de IA — interpretação operacional.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cis_ia_referencia (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                 UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  teoria                     TEXT,
  dimensao                   TEXT,
  intensidade                TEXT,
  categoria                  TEXT,
  conteudo_resumo            TEXT,
  conteudo_detalhado         TEXT,
  sinal_observavel           TEXT,      -- sinais visíveis em respostas
  hipotese_interpretativa    TEXT,      -- como interpretar no contexto escolar
  risco_se_em_excesso        TEXT,      -- risco se traço for extremo
  usar_para_cenario          TEXT,      -- como usar na geração de cenários
  usar_para_pdi              TEXT,      -- como usar na geração de PDI
  uso_operacional            TEXT,      -- uso no sistema como um todo
  aplicacao_escola           TEXT,      -- aplicação específica em contexto escolar
  confianca_inferencia       TEXT,      -- nível de confiança da inferência
  nao_concluir_isoladamente  TEXT,      -- aviso: não avaliar este traço sozinho
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. MOODLE_CATALOGO
--    Catálogo de cursos importados do Moodle LMS.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS moodle_catalogo (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  competencia         TEXT,           -- competência vinculada
  curso_moodle        TEXT,           -- nome do curso
  url_curso           TEXT,           -- URL direta
  course_id           TEXT,           -- ID Moodle
  qtd_secoes          INT,
  qtd_modulos         INT,
  secoes              TEXT,           -- lista de seções (texto)
  modulos             TEXT,           -- lista de módulos (texto)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ═══════════════════════════════════════════════════════════════════════════════
-- ÍNDICES
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE INDEX idx_cat_enriq_empresa      ON catalogo_enriquecido(empresa_id);
CREATE INDEX idx_cat_enriq_comp         ON catalogo_enriquecido(empresa_id, cod_comp);
CREATE INDEX idx_cat_enriq_cargo        ON catalogo_enriquecido(empresa_id, cargo);
CREATE INDEX idx_cis_ref_empresa        ON cis_referencia(empresa_id);
CREATE INDEX idx_cis_ia_ref_empresa     ON cis_ia_referencia(empresa_id);
CREATE INDEX idx_moodle_cat_empresa     ON moodle_catalogo(empresa_id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS + TRIGGERS (mesmo padrão das migrations anteriores)
-- ═══════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'catalogo_enriquecido',
      'cis_referencia',
      'cis_ia_referencia',
      'moodle_catalogo'
    ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (empresa_id = public.get_empresa_id())',
      t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (empresa_id = public.get_empresa_id())',
      t || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (empresa_id = public.get_empresa_id()) WITH CHECK (empresa_id = public.get_empresa_id())',
      t || '_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (empresa_id = public.get_empresa_id())',
      t || '_delete', t);
  END LOOP;
END
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'catalogo_enriquecido',
      'cis_referencia',
      'cis_ia_referencia',
      'moodle_catalogo'
    ])
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t, t);
  END LOOP;
END
$$;
