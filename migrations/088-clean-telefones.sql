-- ─────────────────────────────────────────────────────────────────────────
-- 088 — Normaliza colaboradores.telefone para formato E.164 com 55.
--
-- Convenção do app: TODOS os telefones devem ser salvos como string de
-- dígitos com prefixo 55 (ex: "5511912345678") — Z-API consome direto sem
-- precisar prefixar em runtime.
--
-- Etapa 1: Limpa máscaras (parênteses, traços, espaços, +) — só dígitos.
-- Etapa 2: Adiciona prefixo "55" em números que ficaram com 10/11 dígitos
--          (formato BR sem country code) e que ainda não começam com 55.
--
-- Idempotente: telefones já em E.164 (12 ou 13 dígitos com 55) não mudam.
-- Aplica em todos os tenants.
-- ─────────────────────────────────────────────────────────────────────────

-- Etapa 1: strip non-digits
UPDATE colaboradores
SET telefone = regexp_replace(telefone, '\D', '', 'g')
WHERE telefone IS NOT NULL
  AND telefone <> regexp_replace(telefone, '\D', '', 'g');

-- Etapa 2: prefixa 55 onde tem 10 ou 11 dígitos (BR sem country code)
UPDATE colaboradores
SET telefone = '55' || telefone
WHERE telefone IS NOT NULL
  AND length(telefone) IN (10, 11)
  AND telefone !~ '^55';

-- Verificação: lista colabs com telefone ainda fora do padrão (deve ser 0)
SELECT id, nome_completo, email, telefone, length(telefone) AS len
FROM colaboradores
WHERE telefone IS NOT NULL
  AND (
    telefone <> regexp_replace(telefone, '\D', '', 'g')  -- ainda com mask
    OR length(telefone) NOT IN (12, 13)                  -- comprimento errado
    OR telefone !~ '^55'                                 -- sem prefixo 55
  )
LIMIT 10;
