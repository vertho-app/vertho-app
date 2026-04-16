-- 005: Tabela PPP_Escolas — extração estruturada via IA
-- Suporta: PDF (upload), site (URL), import JSON

CREATE TABLE IF NOT EXISTS ppp_escolas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  escola      TEXT NOT NULL,
  fonte       TEXT DEFAULT 'pdf' CHECK (fonte IN ('pdf', 'site', 'json')),
  url_site    TEXT,                -- URL do site (quando fonte = 'site')
  status      TEXT NOT NULL DEFAULT 'pendente'
                CHECK (status IN ('pendente', 'processando', 'extraido', 'erro')),
  extracao    TEXT,                -- texto estruturado extraído (10 seções)
  valores     JSONB DEFAULT '[]',  -- valores/princípios organizacionais
  erro_msg    TEXT,
  extracted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ppp_escolas_unique ON ppp_escolas(empresa_id, escola);
CREATE INDEX IF NOT EXISTS idx_ppp_escolas_empresa ON ppp_escolas(empresa_id);

CREATE TRIGGER set_ppp_escolas_updated_at
  BEFORE UPDATE ON ppp_escolas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE ppp_escolas ENABLE ROW LEVEL SECURITY;

CREATE POLICY ppp_escolas_tenant ON ppp_escolas
  USING (empresa_id = public.get_empresa_id());
