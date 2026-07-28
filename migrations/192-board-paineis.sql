-- 192: /board — fila e histórico dos painéis multi-modelo
--
-- O /board (admin/vertho/board) é ferramenta INTERNA do Rodrigo: ele faz a
-- pergunta pela web, um worker que roda na MÁQUINA DELE pega o pedido e executa
-- os quatro CLIs (claude/codex/kimi/agy), e o resultado volta pra cá.
--
-- Por que fila e não chamada direta: os quatro modelos rodam por ASSINATURA,
-- como processos locais autenticados na conta pessoal. A Vercel não alcança
-- esses processos — então a web enfileira e a máquina executa. Consequência
-- assumida: se o worker não estiver rodando, o pedido fica 'pendente' (é isso
-- que a coluna `iniciado_em` deixa visível na tela em vez de esconder).
--
-- Tabela NÃO é multi-tenant: não tem empresa_id porque não pertence a nenhum
-- cliente. O isolamento é a rota (/admin/vertho/*, atrás do gate do admin) —
-- nunca exponha isto em rota pública.
-- Idempotente.

CREATE TABLE IF NOT EXISTS board_paineis (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  iniciado_em   TIMESTAMPTZ,
  concluido_em  TIMESTAMPTZ,

  -- pedido
  titulo        TEXT,
  pergunta      TEXT NOT NULL,
  contexto      TEXT,
  contexto_dir  TEXT,
  motores       TEXT[] NOT NULL DEFAULT ARRAY['claude','codex','kimi','gemini'],

  -- execução
  status        TEXT NOT NULL DEFAULT 'pendente',
  progresso     JSONB NOT NULL DEFAULT '[]'::jsonb,
  erro          TEXT,

  -- resultado (o retorno inteiro de rodarPainel)
  resultado     JSONB,
  resumo        TEXT,
  segundos      INTEGER,
  custo_usd     NUMERIC(10,4),

  criado_por    TEXT
);

COMMENT ON TABLE board_paineis IS
  'Fila + histórico dos painéis multi-modelo do /board. Web enfileira, worker local executa (os CLIs rodam por assinatura na máquina do Rodrigo). Sem empresa_id de propósito: não é dado de cliente.';

COMMENT ON COLUMN board_paineis.status IS
  'pendente (esperando o worker pegar) | rodando | concluido | erro | cancelado. Validação em código, sem CHECK, para não travar migration em estado novo.';
COMMENT ON COLUMN board_paineis.iniciado_em IS
  'Quando o worker pegou o pedido. NULL com status=pendente há muito tempo = worker desligado, não painel lento — a tela usa isso para avisar.';
COMMENT ON COLUMN board_paineis.progresso IS
  'Eventos do worker em ordem ([{fase,letra,ok,segundos,em}]). É o que dá andamento na tela sem precisar de websocket.';
COMMENT ON COLUMN board_paineis.contexto_dir IS
  'Pasta de apoio na máquina local (ex.: ~/.claude/painel/contexto/<assunto>). Caminho do worker, não do servidor — a Vercel nunca lê isto.';
COMMENT ON COLUMN board_paineis.resultado IS
  'Retorno completo de rodarPainel: autores, rodada1, rodada2, convergencia, sintese, metricas.';
COMMENT ON COLUMN board_paineis.custo_usd IS
  'Custo equivalente reportado pelo CLI do Claude. Métrica de referência — a execução é coberta pela assinatura, não faturada por token.';

-- Fila do worker: pega o mais antigo pendente.
CREATE INDEX IF NOT EXISTS idx_board_paineis_fila
  ON board_paineis (status, criado_em)
  WHERE status IN ('pendente', 'rodando');

-- Listagem da tela: mais recentes primeiro.
CREATE INDEX IF NOT EXISTS idx_board_paineis_recentes
  ON board_paineis (criado_em DESC);

-- App roda 100% service-role (bypassa RLS); RLS aqui é a rede de segurança
-- para o caso de a tabela ser alcançada por chave anon.
ALTER TABLE board_paineis ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

-- Rollback (se precisar):
-- DROP INDEX IF EXISTS idx_board_paineis_recentes;
-- DROP INDEX IF EXISTS idx_board_paineis_fila;
-- DROP TABLE IF EXISTS board_paineis;
