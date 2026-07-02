-- ============================================================================
-- 154: Programa por COLABORADOR + carimbo do modo na TRILHA
-- ============================================================================
--
-- Separação de responsabilidades (fonte única por camada):
--   colaboradores.programa_modo — "o que GERAR pra esta pessoa?"
--     NULL = herda o default da empresa (sys_config.programa_modo).
--     Permite misturar modos no MESMO tenant (novatos em onboarding,
--     veteranos em regular, lead em piloto) sem tenant separado.
--   empresas.sys_config.programa_modo — default do tenant (inalterado).
--   trilhas.programa_modo — "com que regras ESTA trilha roda até o fim?"
--     Carimbado na GERAÇÃO. O runtime (reflexão/fechamento/evolution report)
--     resolve o ProgramaConfig do carimbo — trocar o modo da empresa NÃO
--     afeta mais trilhas em andamento (mesmo princípio do spec_version).
--     NULL = trilha legada → fallback pro comportamento atual (sys_config).
--
-- Valores: 'regular_duo' | 'regular_single' | 'onboarding' | 'piloto'.
-- Sem CHECK proposital (JSONB da empresa também não tem) — o mapeamento
-- vive em lib/season-engine/programa-config.ts (getProgramaConfigByModo,
-- desconhecido → DUO, fail-safe do default global).
--
-- Reversível: DROP COLUMN em ambas.
-- ============================================================================

ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS programa_modo TEXT DEFAULT NULL;
ALTER TABLE trilhas ADD COLUMN IF NOT EXISTS programa_modo TEXT DEFAULT NULL;

COMMENT ON COLUMN colaboradores.programa_modo IS
'Override do programa PARA GERAÇÃO de trilha deste colaborador: regular_duo | regular_single | onboarding | piloto. NULL = herda empresas.sys_config.programa_modo. Precedência: colaborador → empresa → DUO (ver lib/season-engine/programa-config.ts).';

COMMENT ON COLUMN trilhas.programa_modo IS
'Carimbo do modo com que a trilha foi GERADA (regular_duo | regular_single | onboarding | piloto). Fonte de verdade do RUNTIME (rotas de reflexão/fechamento/evolution report) — congela as regras da trilha. NULL = legado → runtime cai no sys_config da empresa.';
