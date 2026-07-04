-- 160 — Flag durável de tenant de demonstração (gate de envio)
--
-- CONTEXTO: os flags sys_config.cadencia.email_ativo/whatsapp_ativo eram
-- COSMÉTICOS (nenhum código os lia). A única proteção real contra disparo a
-- pessoas reais no ambiente de demo eram as personas @vertho.ai sem telefone —
-- um contato REAL adicionado durante a demo (ou via allow_open_signup) ainda
-- podia receber WhatsApp/e-mail.
--
-- Esta coluna é a FONTE ÚNICA e explícita de "este tenant é demonstração".
-- O guard lib/demo/envio-guard.ts a lê e BLOQUEIA todo disparo em lote +
-- magic link/signup nesses tenants. Vale para qualquer tenant-demo futuro:
-- basta marcar is_demo=true (o reset do acme-demo já seta).
--
-- ESCOPO: só acme-demo agora. NÃO marcamos cbtd (showcase+captura — capta leads
-- reais, precisa enviar). Novos sandboxes de treino: setar is_demo=true.

ALTER TABLE empresas ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_empresas_is_demo ON empresas (is_demo) WHERE is_demo = true;

UPDATE empresas SET is_demo = true WHERE slug = 'acme-demo';
