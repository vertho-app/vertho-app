-- Serializa emissão + consumo de OTP das personas compartilhadas entre visitantes.
-- Nenhum token/e-mail é persistido; lease curta, recuperável após timeout da lambda.
create table if not exists public.demo_auth_locks (
  identity_key text primary key check (identity_key ~ '^[a-f0-9]{64}$'),
  owner uuid not null,
  expires_at timestamptz not null
);
alter table public.demo_auth_locks enable row level security;
revoke all on public.demo_auth_locks from public, anon, authenticated;
grant all on public.demo_auth_locks to service_role;

create or replace function public.demo_auth_lock_acquire(p_key text, p_owner uuid)
returns boolean language sql security invoker set search_path = public as $$
  with acquired as (
    insert into public.demo_auth_locks(identity_key, owner, expires_at)
    values (p_key, p_owner, clock_timestamp() + interval '60 seconds')
    on conflict (identity_key) do update
      set owner = excluded.owner, expires_at = excluded.expires_at
      where demo_auth_locks.expires_at < clock_timestamp()
    returning identity_key
  ) select exists(select 1 from acquired);
$$;
create or replace function public.demo_auth_lock_release(p_key text, p_owner uuid)
returns void language sql security invoker set search_path = public as $$
  delete from public.demo_auth_locks where identity_key = p_key and owner = p_owner;
$$;
revoke all on function public.demo_auth_lock_acquire(text, uuid) from public, anon, authenticated;
revoke all on function public.demo_auth_lock_release(text, uuid) from public, anon, authenticated;
grant execute on function public.demo_auth_lock_acquire(text, uuid) to service_role;
grant execute on function public.demo_auth_lock_release(text, uuid) to service_role;
notify pgrst, 'reload schema';
