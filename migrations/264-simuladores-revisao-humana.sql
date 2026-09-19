-- 264: revisão humana da devolutiva no simulador de vendas e no de liderança
-- (revisão dos simuladores de 18/09/2026, item 4.1).
--
-- Mesmo contrato de recepcao_revisoes (mig 241): quem acompanha a equipe registra
-- se concorda com a avaliação da IA ("concordo", "parcialmente", "discordo"), com o
-- motivo e as competências em questão. A revisão só se acrescenta: não altera a nota
-- original e não se edita. O id é o requestId do envio (reenvio idempotente).
--
-- Diferença deliberada em relação à recepcao_revisoes: ON DELETE CASCADE na sessão.
-- A exclusão unificada (mig 262), o expurgo do vendas (mig 250/251) e o reset do demo
-- apagam a sessão ou a jornada direto; sem cascata, uma revisão travaria a exclusão
-- com 23503. Revisão de uma sessão apagada não tem o que revisar.
--
-- Idempotente. RLS ligada e sem policy (o app é service_role; a defesa é o código e os
-- guards). Só SELECT e INSERT para service_role.

CREATE TABLE IF NOT EXISTS public.sim_vendas_revisoes (
  id uuid PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  sessao_id uuid NOT NULL,
  revisor_key text NOT NULL,
  revisor_nome text NOT NULL,
  parecer text NOT NULL CHECK (parecer IN ('concordo', 'parcialmente', 'discordo')),
  motivo text NOT NULL CHECK (length(motivo) BETWEEN 1 AND 4000),
  dimensoes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(dimensoes) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sim_vendas_revisoes_sessao_fk FOREIGN KEY (sessao_id, empresa_id)
    REFERENCES public.sim_vendas_sessoes(id, empresa_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS sim_vendas_revisoes_sessao
  ON public.sim_vendas_revisoes(empresa_id, sessao_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.sim_lideranca_revisoes (
  id uuid PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  jornada_id uuid NOT NULL,
  revisor_key text NOT NULL,
  revisor_nome text NOT NULL,
  parecer text NOT NULL CHECK (parecer IN ('concordo', 'parcialmente', 'discordo')),
  motivo text NOT NULL CHECK (length(motivo) BETWEEN 1 AND 4000),
  dimensoes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(dimensoes) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sim_lideranca_revisoes_jornada_fk FOREIGN KEY (jornada_id, empresa_id)
    REFERENCES public.sim_lideranca_jornadas(id, empresa_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS sim_lideranca_revisoes_jornada
  ON public.sim_lideranca_revisoes(empresa_id, jornada_id, created_at DESC);

ALTER TABLE public.sim_vendas_revisoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sim_lideranca_revisoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sim_vendas_revisoes, public.sim_lideranca_revisoes FROM anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.sim_vendas_revisoes, public.sim_lideranca_revisoes TO service_role;

COMMENT ON TABLE public.sim_vendas_revisoes IS
  'Revisão humana da devolutiva de um treino do simulador de vendas (mig 264). Só INSERT; a nota original não muda.';
COMMENT ON TABLE public.sim_lideranca_revisoes IS
  'Revisão humana da devolutiva de uma jornada do simulador de liderança (mig 264). Só INSERT; a nota original não muda.';
COMMENT ON COLUMN public.sim_vendas_revisoes.id IS 'requestId do envio: reenviar o mesmo pedido não duplica.';
COMMENT ON COLUMN public.sim_vendas_revisoes.revisor_key IS 'owner_key de quem revisou (colab:<id> ou admin:<id>); nunca o dono do treino.';
COMMENT ON COLUMN public.sim_vendas_revisoes.parecer IS 'concordo, parcialmente ou discordo da avaliação da IA.';
COMMENT ON COLUMN public.sim_vendas_revisoes.motivo IS 'Justificativa do parecer, com dados pessoais comuns mascarados antes de gravar.';
COMMENT ON COLUMN public.sim_vendas_revisoes.dimensoes IS 'Códigos das competências comentadas (PL, P, A, C, E).';
COMMENT ON COLUMN public.sim_lideranca_revisoes.id IS 'requestId do envio: reenviar o mesmo pedido não duplica.';
COMMENT ON COLUMN public.sim_lideranca_revisoes.revisor_key IS 'owner_key de quem revisou (colab:<id> ou admin:<id>); nunca o dono da jornada.';
COMMENT ON COLUMN public.sim_lideranca_revisoes.parecer IS 'concordo, parcialmente ou discordo da avaliação da IA.';
COMMENT ON COLUMN public.sim_lideranca_revisoes.motivo IS 'Justificativa do parecer, com dados pessoais comuns mascarados antes de gravar.';
COMMENT ON COLUMN public.sim_lideranca_revisoes.dimensoes IS 'Códigos das competências da matriz global de liderança comentadas.';

NOTIFY pgrst, 'reload schema';

-- Rollback (se precisar):
-- DROP TABLE IF EXISTS public.sim_lideranca_revisoes;
-- DROP TABLE IF EXISTS public.sim_vendas_revisoes;
