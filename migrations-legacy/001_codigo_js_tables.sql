-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRAÇÃO: codigo.js → Supabase
-- Origem: gas-antigo/Código.js (v7) — planilha Vertho Mentor IA
--
-- Convenções:
--   • empresa_id (UUID) em toda tabela — chave para RLS multi-tenant
--   • created_at / updated_at automáticos
--   • E-mail do colaborador continua sendo identificador de negócio
--   • Campos JSON para dados semi-estruturados (payload IA, cobertura, etc.)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. EMPRESAS (tabela raiz — referenciada por todas as outras)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS empresas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. COLABORADORES  (aba "Colaboradores" — headers na linha 4)
--    PK de negócio = email; identificador técnico = UUID
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS colaboradores (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  email               TEXT NOT NULL,
  nome_completo       TEXT,
  cargo               TEXT,
  area_depto          TEXT,
  -- Perfil comportamental (CIS)
  perfil_dominante    TEXT,          -- ex: "Alto D", "Alto I"
  d_natural           NUMERIC,
  i_natural           NUMERIC,
  s_natural           NUMERIC,
  c_natural           NUMERIC,
  -- Valores motivadores
  val_teorico         NUMERIC,
  val_economico       NUMERIC,
  val_estetico        NUMERIC,
  val_social          NUMERIC,
  val_politico        NUMERIC,
  val_religioso       NUMERIC,
  -- Tipos psicológicos
  tp_sensor_intuitivo     TEXT,
  tp_racional_emocional   TEXT,
  tp_introvertido_extrovertido TEXT,
  -- Contato
  whatsapp            TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, email)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CARGOS  (aba "Cargos" — headers na linha 4)
--    Cada cargo tem até 10 competências geradas pela IA1
--    e um Top 5 selecionado para a IA2 (gabarito)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cargos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  id_cargo            TEXT,          -- código legado (ex: "CARGO-001")
  nome                TEXT NOT NULL,
  area_depto          TEXT,
  descricao           TEXT,          -- responsabilidades
  entregas_esperadas  TEXT,
  contexto_cultural   TEXT,
  -- IA1: Top 10 competências sugeridas (array de nomes/IDs)
  competencias_top10  JSONB DEFAULT '[]',
  justificativa_ia1   TEXT,
  -- IA2: Top 5 selecionado + gabarito (telas 1-4)
  top5_workshop       JSONB DEFAULT '[]',   -- IDs das competências selecionadas
  tela1               TEXT,
  tela2               TEXT,
  tela3               TEXT,
  tela4               TEXT,
  status_ia           TEXT,          -- 'Top 10 Gerada', 'Gabarito Gerado', 'Erro'
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. COMPETENCIAS  (aba "Competencias_v2" — headers na linha 1)
--    Catálogo: 1 linha por descritor, ~6 descritores por competência
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS competencias (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  cargo               TEXT,
  pilar               TEXT,
  cod_comp            TEXT NOT NULL,  -- ex: "DIR01", "REC02"
  nome                TEXT NOT NULL,
  descricao           TEXT,
  cod_desc            TEXT,           -- código do descritor
  nome_curto          TEXT,
  descritor_completo  TEXT,
  n1_gap              TEXT,
  n2_desenvolvimento  TEXT,
  n3_meta             TEXT,
  n4_referencia       TEXT,
  evidencias_esperadas TEXT,
  perguntas_alvo      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. BANCO_CENARIOS  (aba "Banco_Cenarios" — headers na linha 4)
--    Cenários gerados pela IA3 para cada colaborador × competência
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS banco_cenarios (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  colaborador_id      UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  email_colaborador   TEXT NOT NULL,
  nome_colaborador    TEXT,
  cargo               TEXT,
  perfil_dominante    TEXT,
  d_natural           NUMERIC,
  i_natural           NUMERIC,
  s_natural           NUMERIC,
  c_natural           NUMERIC,
  -- Competência avaliada (no GAS era "ID | Nome | Tipo")
  competencia_id      TEXT,
  competencia_nome    TEXT,
  competencia_tipo    TEXT,
  -- Cenário gerado
  contexto            TEXT,
  personagens         TEXT,
  situacao_gatilho    TEXT,
  p1_situacao         TEXT,
  p2_acao             TEXT,
  p3_raciocinio       TEXT,
  p4_cis              TEXT,
  cobertura           JSONB,          -- JSON com dados de cobertura de descritores
  -- Aprovação / Form
  status_aprovacao    TEXT,           -- 'Ajustar', 'Aprovado', 'Não Usar'
  link_form           TEXT,
  status_envio        TEXT,           -- 'Pendente', 'Enviado', 'Respondido'
  data_envio          TIMESTAMPTZ,
  n_reenvios          INT DEFAULT 0,
  -- Check IA (validação do cenário)
  nota_check          TEXT,
  status_check        TEXT,
  justificativa_check TEXT,
  sugestao_check      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RESPOSTAS  (aba "Respostas" — headers na linha 1)
--    Respostas dos formulários + resultado da avaliação IA4
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS respostas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  colaborador_id      UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  timestamp_resposta  TIMESTAMPTZ,
  email_colaborador   TEXT NOT NULL,
  nome_colaborador    TEXT,
  cargo               TEXT,
  competencia_id      TEXT,
  competencia_nome    TEXT,
  preferencia_pdi     TEXT,
  whatsapp            TEXT,
  -- Respostas do formulário
  r1_situacao         TEXT,
  r2_acao             TEXT,
  r3_raciocinio       TEXT,
  r4_cis              TEXT,
  representatividade  NUMERIC,        -- 1 a 10
  canal               TEXT,           -- 'Forms'
  -- Avaliação IA4 (descritores D1-D6)
  d1_nota             NUMERIC,
  d2_nota             NUMERIC,
  d3_nota             NUMERIC,
  d4_nota             NUMERIC,
  d5_nota             NUMERIC,
  d6_nota             NUMERIC,
  nivel_ia4           TEXT,
  nota_ia4            TEXT,
  pontos_fortes       TEXT,
  pontos_atencao      TEXT,
  feedback_ia4        TEXT,
  links_academia      TEXT,
  payload_ia4         JSONB,          -- JSON consolidado da avaliação
  -- Valores (módulo secundário)
  valores_status      TEXT,
  valores_payload     JSONB,
  status_ia4          TEXT,           -- status do processamento
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. ENVIOS_DIAGNOSTICO  (aba "Envios_Diagnostico" — headers na linha 1)
--    Log de envios de diagnóstico por e-mail / WhatsApp
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS envios_diagnostico (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id              UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  email                   TEXT NOT NULL,
  nome                    TEXT,
  cargo                   TEXT,
  competencias_pendentes  TEXT,
  data_envio              TIMESTAMPTZ,
  canal                   TEXT,        -- 'email', 'WhatsApp', 'Ambos'
  status                  TEXT,        -- 'enviado', 'respondido'
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. REGUA_MATURIDADE  (aba "Regua Maturidade" — tabela auxiliar)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS regua_maturidade (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  cargo       TEXT,
  competencia TEXT,
  texto       TEXT,
  descricao   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. ACADEMIA  (aba "Academia" — trilhas de aprendizagem por nível)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academia (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  cargo           TEXT,
  competencia_id  TEXT,
  nome            TEXT,
  n1              TEXT,
  n2              TEXT,
  n3              TEXT,
  n4              TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ═══════════════════════════════════════════════════════════════════════════════
-- ÍNDICES
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE INDEX idx_colaboradores_empresa    ON colaboradores(empresa_id);
CREATE INDEX idx_colaboradores_email      ON colaboradores(empresa_id, email);
CREATE INDEX idx_cargos_empresa           ON cargos(empresa_id);
CREATE INDEX idx_competencias_empresa     ON competencias(empresa_id);
CREATE INDEX idx_competencias_cod         ON competencias(empresa_id, cod_comp);
CREATE INDEX idx_banco_cenarios_empresa   ON banco_cenarios(empresa_id);
CREATE INDEX idx_banco_cenarios_colab     ON banco_cenarios(empresa_id, email_colaborador);
CREATE INDEX idx_respostas_empresa        ON respostas(empresa_id);
CREATE INDEX idx_respostas_colab          ON respostas(empresa_id, email_colaborador);
CREATE INDEX idx_envios_empresa           ON envios_diagnostico(empresa_id);
CREATE INDEX idx_regua_empresa            ON regua_maturidade(empresa_id);
CREATE INDEX idx_academia_empresa         ON academia(empresa_id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- Política: apenas usuários autenticados cuja claim `empresa_id` no JWT
-- corresponda ao empresa_id da linha podem SELECT/INSERT/UPDATE/DELETE.
--
-- No Supabase, configure o JWT custom claim `empresa_id` via auth hook
-- ou armazene o mapeamento user ↔ empresa em uma tabela auxiliar.
--
-- Aqui usamos:  auth.jwt() ->> 'empresa_id'
-- ═══════════════════════════════════════════════════════════════════════════════

-- Função helper para extrair empresa_id do JWT
CREATE OR REPLACE FUNCTION public.get_empresa_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'empresa_id')::UUID,
    (auth.jwt() ->> 'empresa_id')::UUID
  )
$$;

-- Macro: ativar RLS + criar policies para cada tabela
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'empresas',
      'colaboradores',
      'cargos',
      'competencias',
      'banco_cenarios',
      'respostas',
      'envios_diagnostico',
      'regua_maturidade',
      'academia'
    ])
  LOOP
    -- Ativar RLS
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    -- Policy SELECT
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (%s)',
      t || '_select',
      t,
      CASE t
        WHEN 'empresas' THEN 'id = public.get_empresa_id()'
        ELSE 'empresa_id = public.get_empresa_id()'
      END
    );

    -- Policy INSERT
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (%s)',
      t || '_insert',
      t,
      CASE t
        WHEN 'empresas' THEN 'id = public.get_empresa_id()'
        ELSE 'empresa_id = public.get_empresa_id()'
      END
    );

    -- Policy UPDATE
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
      t || '_update',
      t,
      CASE t
        WHEN 'empresas' THEN 'id = public.get_empresa_id()'
        ELSE 'empresa_id = public.get_empresa_id()'
      END,
      CASE t
        WHEN 'empresas' THEN 'id = public.get_empresa_id()'
        ELSE 'empresa_id = public.get_empresa_id()'
      END
    );

    -- Policy DELETE
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (%s)',
      t || '_delete',
      t,
      CASE t
        WHEN 'empresas' THEN 'id = public.get_empresa_id()'
        ELSE 'empresa_id = public.get_empresa_id()'
      END
    );
  END LOOP;
END
$$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- TRIGGER: updated_at automático
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'empresas',
      'colaboradores',
      'cargos',
      'competencias',
      'banco_cenarios',
      'respostas',
      'envios_diagnostico',
      'regua_maturidade',
      'academia'
    ])
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t, t
    );
  END LOOP;
END
$$;
