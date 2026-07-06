-- 166 — Segmento "Comércio" no lugar de "Fundação" + pacote "Piloto"
--
-- • customer_type: troca 'fundacao' por 'comercio' (tem CHECK).
-- • product_package: adiciona 'piloto' (mantém 'completo'/'pulso' como legado).
-- Ordem: DROP dos constraints ANTES dos UPDATEs (senão migrar 'fundacao'→
-- 'comercio' viola o CHECK antigo, que não conhece 'comercio').

-- 1) Dropa os constraints antigos (nome robusto via pg_constraint).
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
   WHERE conrelid = 'sales_proposals'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%customer_type%';
  IF cname IS NOT NULL THEN EXECUTE format('ALTER TABLE sales_proposals DROP CONSTRAINT %I', cname); END IF;

  SELECT conname INTO cname FROM pg_constraint
   WHERE conrelid = 'sales_proposals'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%product_package%';
  IF cname IS NOT NULL THEN EXECUTE format('ALTER TABLE sales_proposals DROP CONSTRAINT %I', cname); END IF;
END $$;

-- 2) Migra dados existentes.
UPDATE sales_proposals SET customer_type = 'comercio' WHERE customer_type = 'fundacao';
UPDATE sales_accounts  SET segment       = 'comercio' WHERE segment       = 'fundacao';

-- 3) Recria os constraints já com os valores novos.
ALTER TABLE sales_proposals ADD CONSTRAINT sales_proposals_customer_type_check
  CHECK (customer_type IS NULL OR customer_type IN
    ('escola', 'empresa', 'rede_ensino', 'comercio', 'outro'));

ALTER TABLE sales_proposals ADD CONSTRAINT sales_proposals_product_package_check
  CHECK (product_package IS NULL OR product_package IN
    ('onboarding', 'completo', 'mentor_ia', 'pulso', 'piloto', 'custom'));
