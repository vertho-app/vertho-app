-- 298: portal do RC no contrato de representação v6 (reunião de sócios, 23/10/2026).
--
-- Decisões do dono que mudam o esquema (todas aditivas):
--
--   1. REGISTRO AUTOMÁTICO (7.1): o registro de cliente livre vale como aceite da
--      vertho.ai na hora. "Livre" = o CNPJ básico (8 primeiros dígitos) ou o
--      código INEP da escola não estão com outro representante nem na lista de
--      reserva da vertho.ai. `sales_accounts.cnpj_raiz` (gerada) e
--      `codigo_inep` permitem essa conferência; `sales_reservas` é a lista de
--      reserva (os clientes, leads e negociações da 7.3).
--   2. PROTEÇÃO POR MOVIMENTAÇÃO (7.5 e 7.6): vale enquanto houver movimentação,
--      aviso aos 60 dias sem movimento, liberação aos 90.
--      `sales_opportunities.last_movement_at` guarda a última; o contato
--      registrado por canal entra em `sales_activity_notes` (kind 'contato' +
--      `canal`).
--   3. PAGAMENTO QUE NÃO É MENSAL (10.2 e 10.3): a vertho.ai informa na aprovação
--      quantos pagamentos o cliente faz e em que mês sai o primeiro (o prazo do
--      cliente). A comissão continua por Parcela Mensal Equivalente, na data do
--      pagamento que a cobre.
--   4. MODELO DE INDICAÇÃO (consultores, 10% conforme o recebimento, cliente a
--      cliente): terceiro valor de `compensation_model` e tipo de evento
--      'indicacao', lançado pelo admin a cada recebimento.
--   5. METAS (Anexo IV): anual, com marcos trimestrais acumulados.
--   6. AJUDA DE CUSTO E INÍCIO DO CONTRATO SÓ PARA O ADMIN: tabela própria, fora de
--      `sales_representatives` (que o portal devolve ao navegador do RC). Base da
--      provisão de 1/12 (art. 27 j da Lei 4.886/65).
--   7. EQUIPE DO REPRESENTANTE (21.4): vários logins para o mesmo representante PJ.
--   8. `sales_proposals.accepted_recorded_at`: data do aceite registrado (metas e
--      relatórios). `accepted_at` é do aceite pela página pública e significa
--      outra coisa.
--
-- Idempotente: pode ser reaplicada.

-- ── 1) Conferência por CNPJ básico e INEP + lista de reserva ────────────────

ALTER TABLE public.sales_accounts ADD COLUMN IF NOT EXISTS codigo_inep text;
-- Mesma regra de `normalizarCnpj` (lib/sales/duplicidade.ts): sem pontuação, em
-- maiúsculas, 12 posições de letra ou dígito (CNPJ alfanumérico, julho/2026) e 2
-- dígitos verificadores. Fora desse formato, NULL: texto solto não vira raiz.
ALTER TABLE public.sales_accounts ADD COLUMN IF NOT EXISTS cnpj_raiz text
  GENERATED ALWAYS AS (
    CASE WHEN upper(regexp_replace(coalesce(cnpj, ''), '[^0-9A-Za-z]', '', 'g')) ~ '^[0-9A-Z]{12}[0-9]{2}$'
         THEN substring(upper(regexp_replace(cnpj, '[^0-9A-Za-z]', '', 'g')) from 1 for 8)
    END
  ) STORED;
CREATE INDEX IF NOT EXISTS idx_sales_accounts_cnpj_raiz ON public.sales_accounts (cnpj_raiz);
CREATE INDEX IF NOT EXISTS idx_sales_accounts_codigo_inep ON public.sales_accounts (codigo_inep);

COMMENT ON COLUMN public.sales_accounts.codigo_inep IS
  'Código INEP da escola, quando a conta veio da base do Mercado Potencial. Identifica a escola na conferência de registro e na carteira (mig 298).';
COMMENT ON COLUMN public.sales_accounts.cnpj_raiz IS
  'CNPJ básico (8 primeiras posições), gerado a partir de `cnpj` quando ele tem o formato de CNPJ: matriz e filiais são o mesmo cliente (contrato do RC, 10.6). Mig 298.';

CREATE TABLE IF NOT EXISTS public.sales_reservas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text NOT NULL,
  cnpj_raiz   text,
  codigo_inep text,
  motivo      text,
  criado_por  text,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_reservas_identificador CHECK (cnpj_raiz IS NOT NULL OR codigo_inep IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_sales_reservas_cnpj_raiz ON public.sales_reservas (cnpj_raiz);
CREATE INDEX IF NOT EXISTS idx_sales_reservas_codigo_inep ON public.sales_reservas (codigo_inep);
COMMENT ON TABLE public.sales_reservas IS
  'Lista de reserva da vertho.ai (contrato do RC, 7.3): clientes, leads próprios e negociações diretas. Registro de RC que esbarra aqui vai para a fila de validação em vez do aceite automático. Mig 298.';

-- ── 2) Proteção por movimentação ───────────────────────────────────────────

ALTER TABLE public.sales_opportunities ADD COLUMN IF NOT EXISTS last_movement_at timestamptz;
UPDATE public.sales_opportunities
   SET last_movement_at = COALESCE(protection_start_date::timestamptz, created_at)
 WHERE last_movement_at IS NULL AND attribution_status = 'validada';
COMMENT ON COLUMN public.sales_opportunities.last_movement_at IS
  'Última movimentação (contato registrado com evidência, mudança de estágio, proposta criada, submetida ou enviada). A proteção vale até ela + 90 dias (contrato do RC, 7.5). Mig 298.';
ALTER TABLE public.sales_opportunities ADD COLUMN IF NOT EXISTS aviso_60_em timestamptz;
COMMENT ON COLUMN public.sales_opportunities.aviso_60_em IS
  'Quando o RC recebeu o e-mail de 60 dias sem movimentação. Volta a NULL a cada movimentação, para o próximo ciclo avisar de novo. Mig 298.';

ALTER TABLE public.sales_activity_notes DROP CONSTRAINT IF EXISTS sales_activity_notes_kind_check;
ALTER TABLE public.sales_activity_notes ADD CONSTRAINT sales_activity_notes_kind_check
  CHECK (kind = ANY (ARRAY['nota', 'followup', 'renovacao', 'risco', 'expansao', 'contato']));
ALTER TABLE public.sales_activity_notes ADD COLUMN IF NOT EXISTS canal text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_activity_notes_canal_check'
                   AND conrelid = 'public.sales_activity_notes'::regclass) THEN
    ALTER TABLE public.sales_activity_notes ADD CONSTRAINT sales_activity_notes_canal_check
      CHECK (canal IS NULL OR canal IN ('email', 'telefone', 'whatsapp', 'reuniao_online', 'visita', 'outro'));
  END IF;
END $$;
COMMENT ON COLUMN public.sales_activity_notes.canal IS
  'Canal do contato registrado (kind = contato): email, telefone, whatsapp, reuniao_online, visita ou outro. Mig 298.';

-- ── 3) Cronograma de pagamento e data do aceite ─────────────────────────────

ALTER TABLE public.sales_proposals ADD COLUMN IF NOT EXISTS payment_count integer;
ALTER TABLE public.sales_proposals ADD COLUMN IF NOT EXISTS first_payment_offset_months integer NOT NULL DEFAULT 0;
ALTER TABLE public.sales_proposals ADD COLUMN IF NOT EXISTS accepted_recorded_at timestamptz;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_proposals_payment_count_check'
                   AND conrelid = 'public.sales_proposals'::regclass) THEN
    ALTER TABLE public.sales_proposals ADD CONSTRAINT sales_proposals_payment_count_check
      CHECK (payment_count IS NULL OR (payment_count >= 1 AND payment_count <= 360));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_proposals_first_payment_offset_check'
                   AND conrelid = 'public.sales_proposals'::regclass) THEN
    ALTER TABLE public.sales_proposals ADD CONSTRAINT sales_proposals_first_payment_offset_check
      CHECK (first_payment_offset_months >= 0 AND first_payment_offset_months <= 24);
  END IF;
END $$;
UPDATE public.sales_proposals SET accepted_recorded_at = updated_at
 WHERE status = 'accepted' AND representante_id IS NOT NULL AND accepted_recorded_at IS NULL;
COMMENT ON COLUMN public.sales_proposals.payment_count IS
  'Quantos pagamentos o cliente faz (1 = à vista). NULL = um por mês de vigência. A comissão segue por Parcela Mensal Equivalente, na data do pagamento que a cobre (contrato do RC, 10.2 e 10.3). Mig 298.';
COMMENT ON COLUMN public.sales_proposals.first_payment_offset_months IS
  'Meses entre o aceite e o 1º pagamento do cliente (o prazo de pagamento dele). A previsão de comissão anda junto. Mig 298.';
COMMENT ON COLUMN public.sales_proposals.accepted_recorded_at IS
  'Quando o aceite da proposta de RC foi registrado (pelo RC ou pela vertho.ai). Base das metas. Diferente de accepted_at, que é o aceite pela página pública. Mig 298.';

-- ── 4) Modelo de indicação ──────────────────────────────────────────────────

ALTER TABLE public.sales_representatives DROP CONSTRAINT IF EXISTS sales_representatives_compensation_model_check;
ALTER TABLE public.sales_representatives ADD CONSTRAINT sales_representatives_compensation_model_check
  CHECK (compensation_model IN ('sem_ajuda', 'com_ajuda', 'indicacao'));
ALTER TABLE public.sales_proposals DROP CONSTRAINT IF EXISTS sales_proposals_compensation_model_check;
ALTER TABLE public.sales_proposals ADD CONSTRAINT sales_proposals_compensation_model_check
  CHECK (compensation_model IS NULL OR compensation_model IN ('sem_ajuda', 'com_ajuda', 'indicacao'));
ALTER TABLE public.sales_commission_events DROP CONSTRAINT IF EXISTS sales_commission_events_type_check;
ALTER TABLE public.sales_commission_events ADD CONSTRAINT sales_commission_events_type_check
  CHECK (type = ANY (ARRAY['aquisicao', 'recorrente', 'renovacao', 'expansao', 'chargeback', 'indicacao']));

-- ── 5) Metas (Anexo IV) ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sales_metas (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  representante_id        uuid NOT NULL REFERENCES public.sales_representatives(id),
  periodo_inicio          date NOT NULL,
  meta_anual              numeric NOT NULL CHECK (meta_anual >= 0),
  marco_t1                numeric CHECK (marco_t1 IS NULL OR marco_t1 >= 0),
  marco_t2                numeric CHECK (marco_t2 IS NULL OR marco_t2 >= 0),
  marco_t3                numeric CHECK (marco_t3 IS NULL OR marco_t3 >= 0),
  ativacao_pipeline       numeric CHECK (ativacao_pipeline IS NULL OR ativacao_pipeline >= 0),
  primeiro_contrato_meses integer CHECK (primeiro_contrato_meses IS NULL OR primeiro_contrato_meses > 0),
  atualizado_por          text,
  atualizado_em           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_metas_periodo_unico UNIQUE (representante_id, periodo_inicio)
);
CREATE INDEX IF NOT EXISTS idx_sales_metas_rep ON public.sales_metas (representante_id);
COMMENT ON TABLE public.sales_metas IS
  'Metas do RC (contrato, Anexo IV): soma do Valor Total do Contrato das propostas aceitas no período anual, com marcos trimestrais acumulados (o do 4º trimestre é a meta anual), mais os marcos de ativação. Mig 298.';

-- ── 6) Ajuda de custo e início do contrato (só o admin lê) ──────────────────

CREATE TABLE IF NOT EXISTS public.sales_remuneracao_rc (
  representante_id   uuid PRIMARY KEY REFERENCES public.sales_representatives(id),
  ajuda_custo_mensal numeric CHECK (ajuda_custo_mensal IS NULL OR ajuda_custo_mensal >= 0),
  contrato_inicio    date,
  atualizado_por     text,
  atualizado_em      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.sales_remuneracao_rc IS
  'Ajuda de custo fixa e início do contrato de cada RC. Só o admin lê: fica fora de sales_representatives, que o portal devolve ao navegador do RC. Base da provisão de indenização de 1/12 (Lei 4.886/65, art. 27 j). Mig 298.';

-- ── 7) Equipe do representante (21.4) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sales_representative_users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  representante_id uuid NOT NULL REFERENCES public.sales_representatives(id),
  email            text NOT NULL,
  name             text NOT NULL,
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  criado_por       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_representative_users_email_unico UNIQUE (email)
);
CREATE INDEX IF NOT EXISTS idx_sales_representative_users_rep ON public.sales_representative_users (representante_id);
COMMENT ON TABLE public.sales_representative_users IS
  'Integrantes da equipe de um representante PJ (contrato do RC, 21.4): cada um tem login próprio e enxerga o portal do representante. A comissão é do representante. Mig 298.';

-- ── Segurança: RLS on + sem policy + revoke = service_role-only ─────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sales_reservas', 'sales_metas', 'sales_remuneracao_rc', 'sales_representative_users'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

-- Rollback (se precisar):
-- DROP TABLE IF EXISTS public.sales_representative_users;
-- DROP TABLE IF EXISTS public.sales_remuneracao_rc;
-- DROP TABLE IF EXISTS public.sales_metas;
-- DROP TABLE IF EXISTS public.sales_reservas;
-- ALTER TABLE public.sales_commission_events DROP CONSTRAINT IF EXISTS sales_commission_events_type_check;
-- ALTER TABLE public.sales_commission_events ADD CONSTRAINT sales_commission_events_type_check CHECK (type = ANY (ARRAY['aquisicao','recorrente','renovacao','expansao','chargeback']));
-- (compensation_model: voltar as CHECKs para ('sem_ajuda','com_ajuda') só se nenhum RC estiver em 'indicacao')
-- ALTER TABLE public.sales_proposals DROP COLUMN IF EXISTS accepted_recorded_at, DROP COLUMN IF EXISTS first_payment_offset_months, DROP COLUMN IF EXISTS payment_count;
-- ALTER TABLE public.sales_activity_notes DROP COLUMN IF EXISTS canal;
-- ALTER TABLE public.sales_opportunities DROP COLUMN IF EXISTS aviso_60_em, DROP COLUMN IF EXISTS last_movement_at;
-- ALTER TABLE public.sales_accounts DROP COLUMN IF EXISTS cnpj_raiz, DROP COLUMN IF EXISTS codigo_inep;
