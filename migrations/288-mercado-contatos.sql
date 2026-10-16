-- 288: Mercado Potencial, contatos enriquecidos das escolas (busca web + Hunter).
--
-- Uma linha por escola (codigo_inep), gravada de uma vez (upsert): o PostgREST não tem transação, e
-- duas tabelas abririam espaço para escrita pela metade. Só entra dado CONFIRMADO na página que o
-- modelo citou (lib/mercado-potencial/enriquecimento/verificar.ts); o resto é descartado antes de gravar.
--
-- DADO PESSOAL: `responsaveis` (nome, cargo e e-mail de quem a escola publica como direção ou
-- coordenação). Base legal: legítimo interesse (LGPD art. 7º, IX e art. 10), com origem, data e validade
-- guardadas: `expira_em` (180 dias) e a leitura da exportação ignoram linha vencida. Quem pede para não
-- ser contatado entra em `mercado_contatos_supressao` e sai de `responsaveis`.
-- Acesso: só service-role (o app). RLS + revoke + deny-all é a rede de segurança (padrão da mig 276).
--
-- Aditiva e idempotente: só cria. Nenhuma tabela existente é alterada.

CREATE TABLE IF NOT EXISTS mercado_escola_contatos (
  codigo_inep text PRIMARY KEY,
  site text,
  site_confere_endereco boolean,
  telefones jsonb NOT NULL DEFAULT '[]'::jsonb,    -- [{ numero, rotulo, fonte_url }] só os confirmados na página
  emails jsonb NOT NULL DEFAULT '[]'::jsonb,       -- [{ endereco, rotulo, fonte_url }] institucionais confirmados
  whatsapp jsonb NOT NULL DEFAULT '[]'::jsonb,     -- [{ numero, rotulo, fonte_url }]
  responsaveis jsonb NOT NULL DEFAULT '[]'::jsonb, -- DADO PESSOAL: [{ nome, cargo, fonte_url, email, email_status, email_score, email_origem }]
  nivel text CHECK (nivel IN ('A', 'B', 'C')),
  -- 'a_completar' = a etapa do Hunter ainda não rodou; 'sem_creditos' e 'indisponivel' = tentou e não pôde.
  -- Os três podem ser completados depois SEM pagar a busca web de novo.
  hunter_status text NOT NULL DEFAULT 'a_completar'
    CHECK (hunter_status IN ('ok', 'a_completar', 'sem_nomes', 'sem_creditos', 'indisponivel')),
  observacao text,                                  -- contagens do que foi descartado; nunca nome nem e-mail
  custo_usd numeric(8, 4) NOT NULL DEFAULT 0,       -- busca web desta escola
  hunter_creditos numeric(6, 1) NOT NULL DEFAULT 0,
  coletado_por text NOT NULL,                       -- e-mail de quem pediu o enriquecimento
  coletado_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz NOT NULL,                   -- validade do dado pessoal
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- Reaplicável: o primeiro valor desta coluna era 'pendente', que colide com o vocabulário de status do repo
-- (guard status-literal) e com o do progresso. A tabela nasceu minutos antes, vazia, e passou a 'a_completar'.
-- Este bloco leva uma base onde a 288 já rodou ao mesmo estado de uma base nova.
UPDATE mercado_escola_contatos SET hunter_status = 'a_completar' WHERE hunter_status = 'pendente';
ALTER TABLE mercado_escola_contatos DROP CONSTRAINT IF EXISTS mercado_escola_contatos_hunter_status_check;
ALTER TABLE mercado_escola_contatos ALTER COLUMN hunter_status SET DEFAULT 'a_completar';
ALTER TABLE mercado_escola_contatos ADD CONSTRAINT mercado_escola_contatos_hunter_status_check
  CHECK (hunter_status IN ('ok', 'a_completar', 'sem_nomes', 'sem_creditos', 'indisponivel'));

CREATE INDEX IF NOT EXISTS idx_mercado_contatos_expira ON mercado_escola_contatos (expira_em);
CREATE INDEX IF NOT EXISTS idx_mercado_contatos_coletado ON mercado_escola_contatos (coletado_em);

COMMENT ON TABLE mercado_escola_contatos IS 'Mercado Potencial: contatos enriquecidos por escola. Contém DADO PESSOAL em responsaveis (validade em expira_em). Só service-role.';
COMMENT ON COLUMN mercado_escola_contatos.responsaveis IS 'DADO PESSOAL: nome, cargo e e-mail de responsáveis publicados no site oficial da escola.';

CREATE TABLE IF NOT EXISTS mercado_contatos_supressao (
  email text PRIMARY KEY CHECK (email = lower(email)),
  motivo text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  criado_por text NOT NULL
);

COMMENT ON TABLE mercado_contatos_supressao IS 'E-mails que NÃO podem ser contatados nem exportados (pedido de remoção). Conferida ao gravar e ao exportar.';

-- ── Postura de acesso ─────────────────────────────────────────────────────
-- App roda 100% service-role (BYPASSRLS); RLS + revoke + policy deny-all é a
-- rede de segurança caso a tabela seja alcançada por chave anon (padrão da mig 276).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mercado_escola_contatos', 'mercado_contatos_supressao'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON %I FROM anon', t);
    EXECUTE format('REVOKE ALL ON %I FROM authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_sem_acesso_direto', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
      t || '_sem_acesso_direto', t
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
