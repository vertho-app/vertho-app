-- ─────────────────────────────────────────────────────────────────────────
-- 088 — Limpa telefones em colaboradores que foram salvos com máscara
-- (parênteses, traços, espaços, +). Mantém apenas dígitos.
--
-- Antes:  "(11) 91234-5678"  ou  "+55 11 9 1234-5678"
-- Depois: "11912345678"      ou  "5511912345678"
--
-- Idempotente: telefones já em dígitos puros não mudam.
-- Aplica em todos os tenants — convenção do app é salvar telefone como
-- string de dígitos.
-- ─────────────────────────────────────────────────────────────────────────

UPDATE colaboradores
SET telefone = regexp_replace(telefone, '\D', '', 'g')
WHERE telefone IS NOT NULL
  AND telefone <> regexp_replace(telefone, '\D', '', 'g');

-- Verificação: lista colabs com telefone "sujo" (deve retornar 0 linhas)
SELECT id, nome_completo, email, telefone
FROM colaboradores
WHERE telefone IS NOT NULL
  AND telefone <> regexp_replace(telefone, '\D', '', 'g')
LIMIT 5;
