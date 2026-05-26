-- 118: Fecha policies permissivas do Pulso.
--
-- O Pulso e um fluxo server-side: as telas/actions usam service_role apos
-- validar o usuario no app. Para anon/authenticated, as tabelas abaixo devem
-- ficar sem leitura/escrita direta via Data API.

DO $$
DECLARE
  tbl text;
  pol text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'pulse_ciclos',
    'pulse_assignments',
    'pulse_responses',
    'pulse_audit_logs',
    'pulse_classifications',
    'pulse_triangulations'
  ] LOOP
    IF to_regclass(format('public.%I', tbl)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

      FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = tbl
          AND policyname IN (
            'pulse_ciclos_permissive',
            'pulse_assignments_permissive',
            'pulse_responses_permissive',
            'pulse_audit_permissive',
            'pulse_cls_permissive',
            'pulse_tri_permissive'
          )
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, tbl);
      END LOOP;
    END IF;
  END LOOP;
END $$;

