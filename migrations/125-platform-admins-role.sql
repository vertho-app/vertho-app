-- Tier do platform admin: 'master' (acesso total — default) ou 'socio' (admin
-- restrito: leitura ampla, sem ações destrutivas/geradoras).
-- Admins existentes viram 'master' automaticamente (default), nada muda.

alter table platform_admins add column if not exists role text not null default 'master';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'platform_admins_role_chk') then
    alter table platform_admins add constraint platform_admins_role_chk check (role in ('master', 'socio'));
  end if;
end $$;
