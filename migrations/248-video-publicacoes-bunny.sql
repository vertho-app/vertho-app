-- Upload aceito não significa vídeo reproduzível. Outbox preserva a versão atual
-- enquanto Bunny codifica; o cron publica sem manter uma box de render ligada.
create table if not exists public.video_publicacoes (
  id uuid primary key default gen_random_uuid(),
  cell_video_id uuid not null references public.videos_gerados(id),
  colaborador_id uuid references public.colaboradores(id),
  bunny_video_id text not null unique,
  bunny_library text not null,
  video_url text not null,
  deck_fingerprint text not null,
  altura_minima integer not null default 720,
  estado text not null default 'pendente' check (estado in ('pendente','publicado','erro','obsoleto')),
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.video_publicacoes enable row level security;
create index if not exists video_publicacoes_pendentes_idx on public.video_publicacoes(created_at) where estado='pendente';
comment on table public.video_publicacoes is 'Outbox de publicação Bunny; acesso apenas de infraestrutura. Não re-renderizar para esperar encode.';
