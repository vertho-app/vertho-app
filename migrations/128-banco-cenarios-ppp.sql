-- Cenário por PPP (não por escola): escolas que compartilham o mesmo PPP
-- compartilham UM cenário, evitando duplicação. ppp_escola_id null = rede.
alter table banco_cenarios add column if not exists ppp_escola_id uuid references ppp_escolas(id) on delete cascade;
create index if not exists banco_cenarios_ppp_idx on banco_cenarios(ppp_escola_id);
-- escola_id era a chave anterior (recém-criada, ainda sem dados em prod) — removida.
drop index if exists banco_cenarios_escola_idx;
alter table banco_cenarios drop column if exists escola_id;
