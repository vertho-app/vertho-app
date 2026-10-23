-- 299: apresentação personalizada que o RC gera pelo portal (decisão do dono de
-- 23/10/2026, item 8: "personalizada, ele gera pelo portal; os vídeos ficam para
-- outro momento").
--
-- Uma página pública por link (`/apresentacao/[token]`), sem preço: a história
-- da vertho.ai no segmento do cliente (escola ou empresa), com o nome dele, o
-- contexto que o RC confirmou e o contato do RC. O conteúdo institucional é o
-- mesmo do documento da proposta (`conteudoInstitucional`, lib/sales/proposal-document.ts).
--
-- `contexto` é o texto que o RC CONFIRMOU para o cliente ler (a necessidade
-- identificada é nota interna e só entra se ele mantiver). `revogada_em` tira o
-- link do ar sem apagar o histórico de aberturas.
--
-- Idempotente: pode ser reaplicada.

CREATE TABLE IF NOT EXISTS public.sales_apresentacoes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  representante_id uuid NOT NULL REFERENCES public.sales_representatives(id),
  opportunity_id   uuid REFERENCES public.sales_opportunities(id) ON DELETE CASCADE,
  account_id       uuid REFERENCES public.sales_accounts(id) ON DELETE CASCADE,
  token            text NOT NULL,
  cliente_nome     text,
  segmento         text NOT NULL CHECK (segmento IN ('educacao', 'corporativo')),
  contexto         text,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  view_count       integer NOT NULL DEFAULT 0,
  first_viewed_at  timestamptz,
  last_viewed_at   timestamptz,
  revogada_em      timestamptz,
  CONSTRAINT sales_apresentacoes_token_unico UNIQUE (token)
);
CREATE INDEX IF NOT EXISTS idx_sales_apresentacoes_opp ON public.sales_apresentacoes (opportunity_id);
CREATE INDEX IF NOT EXISTS idx_sales_apresentacoes_rep ON public.sales_apresentacoes (representante_id);

COMMENT ON TABLE public.sales_apresentacoes IS
  'Apresentação personalizada que o RC gera pelo portal: página pública /apresentacao/[token], sem preço, com o conteúdo institucional do segmento, o nome do cliente, o contexto confirmado pelo RC e o contato dele. Mig 299.';
COMMENT ON COLUMN public.sales_apresentacoes.contexto IS
  'Texto que o RC confirmou para o cliente ler na apresentação. A necessidade identificada da oportunidade é nota interna e só entra se ele mantiver. Mig 299.';

-- Segurança: RLS on + sem policy + revoke = service_role-only.
ALTER TABLE public.sales_apresentacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_apresentacoes FROM anon, authenticated;

-- Rollback (se precisar):
-- DROP TABLE IF EXISTS public.sales_apresentacoes;
