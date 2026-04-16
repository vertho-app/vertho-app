-- 013: RBAC explícito — papel por colaborador + admin de plataforma
-- Remove dependência de regex em cargo para determinar permissões

-- 1. Coluna role na tabela colaboradores (papel no contexto da empresa)
ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'colaborador'
  CHECK (role IN ('colaborador', 'gestor', 'rh'));

-- 2. Índice para queries por role
CREATE INDEX IF NOT EXISTS idx_colaboradores_role ON colaboradores(empresa_id, role);

-- 3. Migração legado: preencher role baseado no cargo (executa uma única vez)
-- Depois desta migration, a aplicação lê SOMENTE o campo role.
UPDATE colaboradores SET role = 'rh'
WHERE role = 'colaborador'
  AND cargo IS NOT NULL
  AND lower(cargo) ~ '\m(rh|diretor|diretora|ceo|superintendente)\M';

UPDATE colaboradores SET role = 'gestor'
WHERE role = 'colaborador'
  AND cargo IS NOT NULL
  AND lower(cargo) ~ '\m(coordenador|coordenadora|gestor|gestora|gerente|supervisor|supervisora)\M';

-- 4. Tabela de admins de plataforma (cross-tenant)
CREATE TABLE IF NOT EXISTS platform_admins (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE,
  nome       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed: admins iniciais (mesmo email que estava no NEXT_PUBLIC_ADMIN_EMAILS)
INSERT INTO platform_admins (email, nome) VALUES
  ('rodrigo@vertho.ai', 'Rodrigo'),
  ('rodrigodnaves@gmail.com', 'Rodrigo (pessoal)')
ON CONFLICT (email) DO NOTHING;

-- 5. Índice para lookup rápido
CREATE INDEX IF NOT EXISTS idx_platform_admins_email ON platform_admins(email);
