-- 191 · FKs com ON DELETE CASCADE em development_blueprints (F-I5 do docs/FMEA-PIPELINE.md).
--
-- A tabela (mig 175) foi criada SEM FK: deletar um colaborador ou uma empresa
-- NÃO apagava o blueprint — o órfão acumulava e o `auditarBlueprint` de órfão
-- falhava no gate "colaborador não encontrado". As FKs espelham o tratamento
-- que o baseline já dá a descriptor_assessments (000-baseline.sql:489-490).
--
-- Órfãos medidos em 27/07 via scripts/_limpar-blueprints-orfaos.mjs (dry-run):
-- 0 (37 blueprints, todos com colaborador e empresa vivos) — a constraint pode
-- ser aplicada DIRETO, sem delete prévio. Se em outro ambiente houver órfãos,
-- rodar o script com --aplicar ANTES desta migration (FK nova rejeita órfãos).
ALTER TABLE IF EXISTS public.development_blueprints
  ADD CONSTRAINT development_blueprints_colaborador_id_fkey
  FOREIGN KEY (colaborador_id) REFERENCES public.colaboradores(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.development_blueprints
  ADD CONSTRAINT development_blueprints_empresa_id_fkey
  FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;

-- Rollback:
-- ALTER TABLE public.development_blueprints DROP CONSTRAINT IF EXISTS development_blueprints_colaborador_id_fkey;
-- ALTER TABLE public.development_blueprints DROP CONSTRAINT IF EXISTS development_blueprints_empresa_id_fkey;

NOTIFY pgrst, 'reload schema';
