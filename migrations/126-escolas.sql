-- Registro canônico de ESCOLAS por empresa (rede), para cenários por escola/PPP.
-- Hoje a escola do colaborador vive como texto livre em colaboradores.area_depto
-- (~15 variações inconsistentes em Ibipeba; só 4 têm PPP). Esta tabela canoniza
-- e liga ao PPP; o vínculo colaborador→escola passa a ser por FK.

create table if not exists escolas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  ppp_escola_id uuid references ppp_escolas(id) on delete set null,
  -- central = Secretaria/administrativo/time interno (NÃO é escola → usa rede)
  is_central boolean not null default false,
  -- rótulos crus de area_depto que foram fundidos nesta escola (auditoria do mapeamento)
  area_depto_origens text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists escolas_empresa_idx on escolas(empresa_id);
create unique index if not exists escolas_empresa_nome_ux on escolas(empresa_id, lower(nome));

-- Vínculo colaborador → escola (nullable; null = sem escola → contexto de rede).
alter table colaboradores add column if not exists escola_id uuid references escolas(id) on delete set null;
create index if not exists colaboradores_escola_idx on colaboradores(escola_id);
