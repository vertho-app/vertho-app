-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRAÇÃO 002: Academia, Gestão e Fase 4
-- Origem: gas-antigo/ → TrilhaBuilder.js, Fase4.js, Fase4 evidencia.js,
--         Evolucao.js, PlenariaEvolucao.js
--
-- Convenções (mesmas da 001):
--   • empresa_id (UUID) em toda tabela — chave para RLS multi-tenant
--   • created_at / updated_at automáticos (reusa set_updated_at() da 001)
--   • FK para colaboradores(id) quando possível
--   • JSONB para estruturas semi-estruturadas (sequência, contrato, payload)
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TRILHAS
--    Trilha personalizada de 14 semanas por colaborador × competência.
--    Cada linha = 1 semana de conteúdo.
--    Origem: aba "Trilhas" — TrilhaBuilder.js
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trilhas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  colaborador_id      UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  email               TEXT NOT NULL,

  -- Competência e nível de entrada
  competencia_id      TEXT,                        -- código (ex: "DIR01")
  competencia_nome    TEXT NOT NULL,
  nivel_entrada       INT,                         -- 1, 2 ou 3

  -- Semana
  semana              INT NOT NULL CHECK (semana BETWEEN 1 AND 14),
  tipo_semana         TEXT NOT NULL DEFAULT 'pilula',  -- 'pilula' | 'implementacao' | 'revisao'

  -- Conteúdo da semana
  titulo              TEXT,                        -- título da pílula / micro-desafio
  url                 TEXT,                        -- URL Moodle ou externo
  descricao           TEXT,                        -- descrição breve do conteúdo

  -- Descritor alvo
  descritor_foco      TEXT,                        -- nome do descritor trabalhado
  nota_descritor      NUMERIC,                     -- nota IA4 do descritor (define prioridade)

  -- Rastreabilidade
  fonte               TEXT,                        -- 'catalogo_enriquecido' | 'moodle' | 'manual'
  status              TEXT DEFAULT 'pendente',     -- 'pendente' | 'enviada' | 'concluida'

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Uma trilha por (empresa, email, competência, semana)
  UNIQUE (empresa_id, email, competencia_id, semana)
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. FASE4_ENVIOS
--    Controle de inscrição e orquestração da Fase 4 (14 semanas).
--    1 linha por colaborador ativo no programa.
--    Origem: aba "Fase4_Envios" — Fase4.js
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fase4_envios (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  colaborador_id      UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  email               TEXT NOT NULL,
  nome                TEXT,
  cargo               TEXT,

  -- Progresso
  data_inicio         DATE,                        -- data de início do programa
  semana_atual        INT DEFAULT 0,               -- semana corrente (0-14)
  ultimo_envio_pilula TIMESTAMPTZ,                 -- último e-mail de pílula (segunda)
  ultimo_envio_evidencia TIMESTAMPTZ,              -- último e-mail de evidência (quinta)

  -- Status
  status              TEXT DEFAULT 'Ativo',        -- 'Ativo' | 'Concluído' | 'Pausado'

  -- Sequência de 14 semanas (JSONB) — array de objetos:
  -- [{ semana, tipo, competencia, nivel, titulo, url, descricao, descritor }]
  sequencia           JSONB DEFAULT '[]',

  -- Contrato pedagógico (JSONB):
  -- { competencia, foco, meta_aprendizagem, criterio_conclusao: {}, duracao }
  contrato            JSONB,

  -- Gestor
  gestor_email        TEXT,
  whatsapp            TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (empresa_id, email)
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CAPACITACAO
--    Registro de evidências e conclusão de pílulas durante Fase 4.
--    1 linha por (colaborador × semana × tipo de atividade).
--    Origem: aba "Capacitacao" — Fase4.js, Fase4 evidencia.js
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS capacitacao (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  colaborador_id      UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  email               TEXT NOT NULL,

  -- Referência
  semana              INT NOT NULL CHECK (semana BETWEEN 1 AND 14),
  tipo                TEXT NOT NULL,               -- 'pilula' | 'evidencia' | 'implementacao'
  competencia_id      TEXT,                        -- competência vinculada

  -- Conclusão
  pilula_ok           BOOLEAN DEFAULT FALSE,       -- pílula foi acessada/concluída?

  -- Evidência (preenchida quando tipo = 'evidencia')
  -- JSONB para flexibilidade: { acao: "...", resultado: "..." }
  evidencia           JSONB,
  evidencia_texto     TEXT,                        -- versão texto plano (fallback)

  -- Gamificação
  pontos              INT DEFAULT 0,               -- pontos acumulados (ex: 5 por evidência)
  data_registro       TIMESTAMPTZ DEFAULT now(),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Uma entrada por (empresa, email, semana, tipo)
  UNIQUE (empresa_id, email, semana, tipo)
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. EVOLUCAO
--    Comparativo Cenário A (Forms Fase 1) × Cenário B (Conversa/Reavaliação).
--    1 linha por (colaborador × competência).
--    Origem: aba "Evolucao" — Evolucao.js
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS evolucao (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  colaborador_id      UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  email               TEXT NOT NULL,

  -- Identificação
  nome                TEXT,
  cargo               TEXT,
  area_escola         TEXT,                        -- escola / unidade / área

  -- Competência
  competencia_id      TEXT NOT NULL,
  competencia_nome    TEXT,

  -- Cenário A (avaliação inicial — Forms/Diagnóstico)
  nota_a              NUMERIC,                     -- nota decimal Cenário A
  nivel_a             INT,                         -- nível inteiro (1-4)

  -- Cenário B (reavaliação — conversa semana 15)
  nota_b              NUMERIC,                     -- nota decimal Cenário B
  nivel_b             INT,                         -- nível inteiro (1-4)

  -- Delta
  delta_nota          NUMERIC GENERATED ALWAYS AS (nota_b - nota_a) STORED,
  delta_nivel         INT GENERATED ALWAYS AS (nivel_b - nivel_a) STORED,

  -- Análise qualitativa
  descritores_subiram TEXT,                        -- quais descritores evoluíram
  convergencia_resumo TEXT,                        -- confirmada | parcial | sem_evolucao
  consciencia_gap     TEXT,                        -- o colaborador reconhece o gap?
  gaps_persistentes   TEXT,                        -- gaps que não foram superados
  foco_ciclo2         TEXT,                        -- descritor prioritário para ciclo 2
  feedback            TEXT,                        -- feedback textual ao colaborador

  -- Payload completo da análise de fusão (JSONB)
  -- Contém: delta por descritor, evidências cruzadas, conexão CIS, recomendações
  payload_fusao       JSONB,

  -- Status
  data_geracao        DATE,
  status              TEXT DEFAULT 'Gerado',       -- 'Gerado' | 'Enviado' | 'Erro'

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (empresa_id, email, competencia_id)
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. EVOLUCAO_DESCRITORES
--    Evolução granular por descritor (N1-N4) — 1 linha por descritor avaliado.
--    Permite ver exatamente qual descritor melhorou, piorou ou estagnou.
--    Origem: aba "Evolucao_Descritores" — Evolucao.js
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS evolucao_descritores (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  colaborador_id      UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  email               TEXT NOT NULL,

  -- Referência
  competencia_id      TEXT NOT NULL,
  descritor_cod       TEXT,                        -- código do descritor (ex: "D1")
  descritor_nome      TEXT,                        -- nome curto do descritor

  -- Níveis comparativos
  nivel_a             INT,                         -- nível Cenário A (1-4)
  nivel_b             INT,                         -- nível Cenário B (1-4)
  delta               NUMERIC GENERATED ALWAYS AS (nivel_b - nivel_a) STORED,

  -- Evidências
  evidencia_cenario_b TEXT,                        -- evidência extraída do cenário B
  evidencia_conversa  TEXT,                        -- evidência da conversa semana 15
  citacao             TEXT,                        -- trecho literal citado

  -- Análise
  convergencia        TEXT,                        -- 'confirmada' | 'parcial' | 'sem_evolucao' | 'invisivel'
  conexao_cis         TEXT,                        -- conexão com perfil DISC/CIS
  confianca           NUMERIC,                     -- 0-100 (confiança na análise)

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (empresa_id, email, competencia_id, descritor_cod)
);


-- ═══════════════════════════════════════════════════════════════════════════════
-- ÍNDICES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Trilhas
CREATE INDEX idx_trilhas_empresa         ON trilhas(empresa_id);
CREATE INDEX idx_trilhas_email           ON trilhas(empresa_id, email);
CREATE INDEX idx_trilhas_comp            ON trilhas(empresa_id, email, competencia_id);

-- Fase 4 Envios
CREATE INDEX idx_fase4_envios_empresa    ON fase4_envios(empresa_id);
CREATE INDEX idx_fase4_envios_email      ON fase4_envios(empresa_id, email);
CREATE INDEX idx_fase4_envios_status     ON fase4_envios(empresa_id, status);

-- Capacitação
CREATE INDEX idx_capacitacao_empresa     ON capacitacao(empresa_id);
CREATE INDEX idx_capacitacao_email       ON capacitacao(empresa_id, email);
CREATE INDEX idx_capacitacao_semana      ON capacitacao(empresa_id, email, semana);

-- Evolução
CREATE INDEX idx_evolucao_empresa        ON evolucao(empresa_id);
CREATE INDEX idx_evolucao_email          ON evolucao(empresa_id, email);
CREATE INDEX idx_evolucao_comp           ON evolucao(empresa_id, competencia_id);

-- Evolução Descritores
CREATE INDEX idx_evo_desc_empresa        ON evolucao_descritores(empresa_id);
CREATE INDEX idx_evo_desc_email          ON evolucao_descritores(empresa_id, email);
CREATE INDEX idx_evo_desc_comp           ON evolucao_descritores(empresa_id, email, competencia_id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- Reutiliza a função public.get_empresa_id() criada na Migration 001.
-- Padrão: SELECT/INSERT/UPDATE/DELETE filtrado por empresa_id do JWT.
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'trilhas',
      'fase4_envios',
      'capacitacao',
      'evolucao',
      'evolucao_descritores'
    ])
  LOOP
    -- Ativar RLS
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    -- Policy SELECT
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (empresa_id = public.get_empresa_id())',
      t || '_select', t
    );

    -- Policy INSERT
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (empresa_id = public.get_empresa_id())',
      t || '_insert', t
    );

    -- Policy UPDATE
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (empresa_id = public.get_empresa_id()) WITH CHECK (empresa_id = public.get_empresa_id())',
      t || '_update', t
    );

    -- Policy DELETE
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (empresa_id = public.get_empresa_id())',
      t || '_delete', t
    );
  END LOOP;
END
$$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- TRIGGERS: updated_at automático
-- Reutiliza a função set_updated_at() criada na Migration 001.
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'trilhas',
      'fase4_envios',
      'capacitacao',
      'evolucao',
      'evolucao_descritores'
    ])
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t, t
    );
  END LOOP;
END
$$;
