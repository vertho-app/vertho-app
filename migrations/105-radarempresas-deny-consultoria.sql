-- ─────────────────────────────────────────────────────────────────────────
-- 105 — Radar Empresas: consultoria/participações fora do alvo
--
-- Decisão de produto: consultoria é majoritariamente PJ unipessoal de
-- consultor (sem equipe a desenvolver). Numa lista de prospecção
-- precisão > recall — melhor cortar todas que poluir com ruído. Perde
-- consultorias grandes legítimas (minoria), aceito.
--
-- 1) CNAEs de consultoria → denylist (inclui 7020400, que a migration
--    103 havia posto como B2B prioritário — revertido aqui: removido da
--    allowlist e movido pra denylist).
-- 2) O filtro de RAZÃO SOCIAL ("CONSULTORIA"/"PARTICIPAC") é aplicado
--    na camada de aplicação (caller), pois pega casos disfarçados em
--    CNAE de educação/saúde (ex.: "X Consultoria e Participações" com
--    CNAE 8550302). Documentado aqui; implementado em
--    scripts/radarempresas-score.ts + actions/radarempresas/scoring.ts.
-- ─────────────────────────────────────────────────────────────────────────

-- Remove consultoria de gestão da allowlist curada (era prioritário)
DELETE FROM radarempresas_cnae_segmento WHERE cnae_prefixo = '7020400';

-- CNAEs de consultoria → denylist
INSERT INTO radarempresas_cnae_denylist (cnae_prefixo, prefixo_len, motivo) VALUES
('7020400','7','Consultoria em gestão empresarial — majoritariamente PJ unipessoal'),
('6204000','7','Consultoria em TI — idem'),
('7319004','7','Consultoria em publicidade'),
('6920602','7','Consultoria/auditoria contábil — PJ profissional'),
('7490103','7','Consultoria agronômica'),
('6621502','7','Auditoria e consultoria atuarial')
ON CONFLICT (cnae_prefixo) DO NOTHING;

SELECT 'cnae_denylist' AS tabela, COUNT(*) AS n FROM radarempresas_cnae_denylist
UNION ALL SELECT 'allowlist_7020400_restante',
  COUNT(*) FROM radarempresas_cnae_segmento WHERE cnae_prefixo = '7020400';
