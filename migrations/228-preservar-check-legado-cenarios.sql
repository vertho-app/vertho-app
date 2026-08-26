-- 228 — Preserva a nota do auditor LEGADO antes do re-check (25/08/2026).
--
-- POR QUÊ
-- ───────
-- `Medido:` a base tem 134 cenários checados e DUAS populações incompatíveis,
-- separadas por uma data — a padronização de 22/07 que levou todas as
-- dupla-checagens para o `gpt-5.6-terra`:
--
--   guardada >= 88 : 104 cenários, checados entre 14/04 e 05/08
--                    → apenas 2 de 104 DEPOIS de 22/07
--   guardada <  88 :  30 cenários
--                    → 22 de 30 depois de 22/07
--
-- Ou seja: 78% da base carrega nota de um auditor que não roda mais. Aqueles
-- `aprovado` não comparam com nada produzido hoje.
--
-- Como isso foi medido, e por que não é opinião: re-checando 24 cenários pelo
-- caminho IDÊNTICO ao de produção, as notas BAIXAS reproduziram exatamente
-- (58→58, 60→60, 84→84 — mesmo auditor, reprodutibilidade ±2) e as ALTAS
-- desabaram (92→38, 92→35, 98→54). Spearman(guardada, Terra) = **−0,32**, que
-- não significa ordem invertida: é artefato de misturar dois auditores na mesma
-- amostra. Três famílias independentes (Terra, Gemini 3.7, Qwen 3.8) concordam
-- que a dimensão mais fraca do acervo é `contencao_sobriedade` — o auditor
-- legado é que era generoso.
--
-- O QUE ESTA MIGRATION FAZ
-- ────────────────────────
-- Só copia. Não decide nada, não apaga nada, não re-checa nada. Depois dela o
-- re-check pode sobrescrever `nota_check`/`status_check` sem que o julgamento
-- anterior desapareça — sem isto, 104 pareceres viravam pó e ninguém
-- conseguiria explicar por que um cenário "aprovado" em junho virou "revisar"
-- em agosto.
--
-- Idempotente: o `where ... legado is null` faz a 2ª execução não fazer nada, e
-- em especial impede que um re-check já aplicado seja copiado por cima do
-- legado verdadeiro.

alter table public.banco_cenarios
  add column if not exists nota_check_legado integer,
  add column if not exists status_check_legado text,
  add column if not exists checked_at_legado timestamptz,
  add column if not exists auditor_legado text;

comment on column public.banco_cenarios.nota_check_legado is
  'Nota do auditor anterior à padronização de 22/07/2026 (mig 228). Preservada antes do re-check sob o Terra — as duas escalas NÃO são comparáveis.';

update public.banco_cenarios
set nota_check_legado   = nota_check,
    status_check_legado = status_check,
    checked_at_legado   = checked_at,
    auditor_legado      = 'pre-terra-22-07'
where nota_check is not null
  and nota_check_legado is null
  and (checked_at is null or checked_at < '2026-07-22'::timestamptz);
