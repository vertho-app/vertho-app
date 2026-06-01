-- Cenário por escola: cada (cargo × competência × escola) tem seu cenário, com o
-- PPP da escola. escola_id null = cenário de rede (colaboradores sem escola/central).
alter table banco_cenarios add column if not exists escola_id uuid references escolas(id) on delete cascade;
create index if not exists banco_cenarios_escola_idx on banco_cenarios(escola_id);
