-- Frente final dos Módulos-Base: substitui revisão humana cruzada por
-- Dual-IA (autora gera, auditora valida) — alinhado ao padrão de IA4/Pulso/
-- Cenários do projeto. Spec: docs/MODULOS-BASE-CONTEUDO.md.

ALTER TABLE public.modulos_base_conteudo
  ADD COLUMN IF NOT EXISTS auditoria_ia         JSONB,
  ADD COLUMN IF NOT EXISTS auditado_em          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auditado_por_modelo  TEXT,
  ADD COLUMN IF NOT EXISTS auditado_em_versao   INTEGER;

-- Índice pra encontrar módulos que precisam (re-)auditoria
CREATE INDEX IF NOT EXISTS modulo_base_auditoria_pendente
  ON public.modulos_base_conteudo (status, auditado_em)
  WHERE status = 'revisao';

COMMENT ON COLUMN public.modulos_base_conteudo.auditoria_ia IS
  'Veredito + problemas + recomendações da IA auditora. Schema: { veredito: aprovado|aprovado_com_ressalvas|reprovado, problemas: [{categoria,descricao,gravidade,campo_afetado}], recomendacoes: [], confianca: 0-1 }';
COMMENT ON COLUMN public.modulos_base_conteudo.auditado_em_versao IS
  'Versão do módulo no momento da auditoria. Publicação só é permitida se o módulo não mudou desde aqui (auditado_em_versao = versao atual).';
