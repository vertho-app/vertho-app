-- 277 — Exemplo de cenário POR PROPOSTA.
--
-- POR QUE EXISTE (pedido do dono, 05/10/2026, vendo a PROP-2026-0010)
--
-- O exemplo de cenário do documento da proposta era UMA constante por segmento, em
-- `lib/sales/proposal-document.ts`: toda proposta que não fosse de escola mostrava o mesmo
-- caso. Primeiro uma expedição de caminhões (que chegou a uma rede de academias que tinha
-- ouvido "hipercustomizado"), depois, ao trocar por um gerente de loja, o problema inverso
-- para as demais propostas corporativas. DECISÃO: o exemplo passa a ser gravado NA proposta,
-- gerado no painel de revisão do orçamento pelo caminho do Banco de Cenários (IA3) e
-- revisado por gente antes de ir ao cliente. Proposta sem exemplo gravado continua usando a
-- constante do segmento (`cenario_exemplo IS NULL`).
--
-- FORMATO (jsonb), validado SEMPRE por `normalizarExemploGravado` antes de virar texto de
-- cliente (`lib/sales/cenario-exemplo.ts`): { rotulo, situacao, perguntas: [{nome, pergunta}] x4,
-- origem: { cargo, segmento, competencia, nota, status, gerador, auditor, geradoEm, comFicha,
-- editado } }. `origem` é metadado INTERNO (nota e modelos) e nunca chega ao documento.
--
-- COMPATIBILIDADE: aditivo e nulo por padrão. Nenhuma linha existente muda de valor, e o
-- código só escreve a coluna quando há exemplo, então a ordem migration → deploy não é
-- crítica para criar proposta (mas é para ler: `carregarOrcamento` seleciona a coluna).
--
-- SEM índice: a coluna não é filtro de nada, só se lê junto com a linha da proposta.
-- SEM CHECK de tipo: a validação de forma e de tamanho é do código, que é quem conhece os
-- limites, e um CHECK duplicado divergiria na primeira mudança de limite.

ALTER TABLE sales_proposals ADD COLUMN IF NOT EXISTS cenario_exemplo jsonb;

COMMENT ON COLUMN sales_proposals.cenario_exemplo IS
  'Exemplo de cenário DESTA proposta (mig 277): { rotulo, situacao, perguntas[4]{nome,pergunta}, origem }. Gerado pela IA3 no painel de revisão do orçamento e revisado por gente. NULL = o documento usa o exemplo padrão do segmento. TEXTO QUE O CLIENTE LÊ: ler sempre por normalizarExemploGravado (lib/sales/cenario-exemplo.ts), nunca cru. origem.nota e origem.gerador são internos e não saem no documento.';

NOTIFY pgrst, 'reload schema';

-- Rollback (se precisar):
-- ALTER TABLE sales_proposals DROP COLUMN IF EXISTS cenario_exemplo;
