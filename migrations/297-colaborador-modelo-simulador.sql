-- 297: modelo de clínica do simulador de atendimento, por pessoa (pacote de clínicas, onlabel, 23/10/2026).
--
-- No pacote de clínicas cada secretária treina numa das clínicas fictícias do simulador ("modelo"),
-- escolhida no cadastro pelo admin da vertho.ai, independente da clínica real em que ela trabalha
-- (`colaboradores.escola_id`) e do cargo. O simulador mostra a quem tem modelo só os casos daquele
-- modelo (`conteudo.modelo` do caso); quem não tem modelo continua vendo só os casos sem modelo, então
-- os outros tenants não mudam.
--
-- A lista de modelos válidos vive no código (`lib/recepcao/modelos-clinica.ts`), como a matriz do
-- simulador: aqui só o formato do código é conferido, para um valor torto não entrar por script.
-- Aditiva e idempotente. Nenhum dado existente muda (a coluna nasce nula em todas as linhas).

ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS recepcao_modelo text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'colaboradores_recepcao_modelo_formato' AND conrelid = 'public.colaboradores'::regclass
  ) THEN
    ALTER TABLE public.colaboradores
      ADD CONSTRAINT colaboradores_recepcao_modelo_formato
      CHECK (recepcao_modelo IS NULL OR recepcao_modelo ~ '^[a-z][a-z0-9_-]{1,39}$');
  END IF;
END $$;

COMMENT ON COLUMN public.colaboradores.recepcao_modelo IS
  'Modelo de clínica do simulador de atendimento em que a pessoa treina (código de lib/recepcao/modelos-clinica.ts). Nulo = sem modelo: vê só os casos sem modelo. Gravado pelo cadastro do admin no pacote de clínicas (sys_config.pacote_clinicas).';

NOTIFY pgrst, 'reload schema';

-- Rollback (se precisar):
-- ALTER TABLE public.colaboradores DROP CONSTRAINT IF EXISTS colaboradores_recepcao_modelo_formato;
-- ALTER TABLE public.colaboradores DROP COLUMN IF EXISTS recepcao_modelo;
