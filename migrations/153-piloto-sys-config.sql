-- ============================================================================
-- 153: Modo Piloto — chave `programa_modo: 'piloto'` em `empresas.sys_config`
-- ============================================================================
--
-- Esta migration NÃO altera DDL (análoga à 090). Documenta no banco, via
-- COMMENT, o novo valor reconhecido pela engine de trilha em `sys_config`.
--
-- Modo Piloto = degustação de 2 semanas: 1 competência, 4 conteúdos
-- (2/semana, cada um sobre 1 descritor distinto — top-4 por gap), resolvidos
-- pela via EXISTENTE (formato-core preferência×taxa + opcionais no switch).
-- Diagnóstico completo (DISC, mapeamento, DNA, Fit v2) roda inalterado.
-- Fechamento completo: cenário (banco_cenarios tipo cenario_b) + avaliação
-- IA, com trava de piso piloto-only (nota_pos_exibido >= baseline, bruto
-- preservado, piso_aplicado marcado, spec_version 'piloto-v1').
--
-- Não é produto novo — só config. Regular DUO / regular_single / Onboarding
-- permanecem byte-idênticos. Aplicada via Supabase Studio. Reversível:
-- basta restaurar o COMMENT anterior.
-- ============================================================================

COMMENT ON COLUMN empresas.sys_config IS
'Configuração de sistema por empresa (JSONB). Chaves reconhecidas em 2026-07:
- programa_modo: ''regular'' | ''onboarding'' | ''regular_single'' | ''piloto'' (default regular DUO)
  · piloto = degustação 2 semanas, 1 competência, 4 conteúdos (2/semana, top-4 descritores
    por gap), fechamento completo (cenário B + avaliação IA com trava de piso piloto-only)
- fase_carreira_default: ''junior'' | ''pleno'' | ''senior''
- nivel_meta_alvo: 2 | 3 (default 3)
- duracao_semanas: number (default 14)
- num_competencias_trilha: number (default 2 — Regular DUO)
- cadencia_template: ''linear'' | ''espiral'' (default linear)
- competencias_onboarding / competencias_regular_duo: text[] (overrides manuais)
- ai_model, cadencia, envios: configs pré-existentes
Ver lib/season-engine/programa-config.ts pro contrato vivo.';
