-- Flag para indicar se o cargo é de liderança.
-- Quando false, o bloco "Liderança" do Fit v2 é excluído do cálculo
-- e os outros 3 blocos (Mapeamento, Competências, DISC) têm seus pesos
-- redistribuídos automaticamente.
ALTER TABLE cargos_empresa ADD COLUMN IF NOT EXISTS eh_lideranca BOOLEAN DEFAULT true;

COMMENT ON COLUMN cargos_empresa.eh_lideranca IS
'Quando false, o bloco Liderança do Fit v2 é excluído. Default true (compat)';
