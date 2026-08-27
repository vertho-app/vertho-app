-- 233 — remove a tabela `pdis` (legado superado pelo Blueprint)
--
-- Por que (27/08/2026), com o que foi conferido antes de apagar:
--
--   linhas ................ 0
--   FK entrando/saindo .... nenhuma
--   views dependentes ..... nenhuma
--   policies .............. nenhuma
--   leitores .............. só `actions/fase4.ts`, que também era o escritor
--   telas que chamavam .... nenhuma (nenhum .tsx referencia gerarPDIs)
--
-- O que ela guardava — `objetivos` derivados do relatório — é hoje o
-- Development Blueprint (`objetivos_30_dias` por competência). Antecessor
-- superado, não funcionalidade perdida.
--
-- ⚠️ ORDEM IMPORTA, e é por isso que o código sai no MESMO commit:
-- `gerarPDIs`/`gerarPDIsDescritores` eram exports de um arquivo `'use server'`,
-- ou seja ENDPOINTS HTTP chamáveis (gatados por `ai.audit.regenerate`) mesmo
-- sem botão nenhum. Apagar a tabela sem apagar o código deixaria dois endpoints
-- estourando em `relation "pdis" does not exist` — pior que o estado anterior,
-- porque troca "gasta IA à toa" por "500 em produção".
--
-- Irreversível na prática: a tabela está vazia, então não há dado a preservar,
-- mas o DDL não volta sozinho. A decisão é de 27/08/2026 (Rodrigo).

DROP TABLE IF EXISTS pdis;

NOTIFY pgrst, 'reload schema';
