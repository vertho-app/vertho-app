-- ─────────────────────────────────────────────────────────────────────────
-- 103 — Radar Empresas: expansão curada do mapa CNAE→Segmento (ponto 6)
--
-- Data-driven: mapeia os CNAEs SEM segmento de MAIOR volume em Jundiaí
-- que SÃO aderentes à Vertho (classe 5díg / subclasse 7díg — vence a
-- divisão 2díg no match por prefixo mais específico).
--
-- DELIBERADAMENTE fora (não-aderentes de alto volume): holdings,
-- serviços domésticos, imobiliário, organizações religiosas/associações,
-- agro, construção civil pulverizada/autônoma. Mantê-los sem segmento
-- = não-elegíveis no funil endereçável (desinfla o TAM local — ponto 1).
--
-- + coluna `subsegmento` (Saúde→Estética, etc) p/ abordagem/insight.
-- Não plugada no score; disponível pra IA/listas.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE radarempresas_cnae_segmento
  ADD COLUMN IF NOT EXISTS subsegmento TEXT;

INSERT INTO radarempresas_cnae_segmento
  (cnae_prefixo, prefixo_len, segmento_key, people_intensity_score,
   leadership_complexity_score, onboarding_need_score,
   standardization_need_score, commercial_fit_score, is_priority,
   subsegmento, notes)
VALUES
-- Força comercial / vendas terceirizadas
('7319002','7','industria_comercial', 75,70,75,65,82,true ,'Promoção de vendas','7319002 Promoção de vendas — equipe comercial'),
-- Saúde / estética (clínica de estética é alvo; cabeleireiro é varejo)
('96025','5','saude_clinicas',        80,65,78,78,76,true ,'Estética e beleza','96025 Estética — clínica/atendimento'),
('96021','5','varejo_especializado',  75,55,65,65,58,false,'Salão de beleza','96021 Cabeleireiro/manicure — micro intensivo'),
-- Consultoria / serviços profissionais B2B
('7020400','7','servicos_b2b_pessoas',76,76,75,60,82,true ,'Consultoria de gestão','7020400 Consultoria empresarial'),
('7112000','7','servicos_b2b_pessoas',74,74,72,66,74,true ,'Engenharia','7112000 Serviços de engenharia'),
('6911701','7','servicos_b2b_pessoas',66,66,62,56,58,false,'Advocacia','6911701 Serviços advocatícios'),
('6920601','7','servicos_b2b_pessoas',66,60,66,62,60,false,'Contabilidade','6920601 Contabilidade'),
-- Varejo / serviços ao consumidor com equipe
('45200','5','varejo_especializado',  76,66,72,76,66,true ,'Oficina mecânica','45200 Manutenção de veículos'),
('45307','5','varejo_especializado',  70,60,70,66,66,false,'Autopeças','45307 Comércio de peças'),
('45205','5','varejo_especializado',  68,58,66,68,60,false,'Estética automotiva','45205 Lavagem/polimento veículos'),
('9511800','7','tecnologia_digital',  62,60,66,56,62,false,'Assistência técnica TI','9511800 Reparação de computadores'),
('7911200','7','varejo_especializado',72,62,72,72,62,false,'Agência de viagens','7911200 Agências de viagens')
ON CONFLICT (cnae_prefixo) DO UPDATE SET
  segmento_key = EXCLUDED.segmento_key,
  people_intensity_score = EXCLUDED.people_intensity_score,
  leadership_complexity_score = EXCLUDED.leadership_complexity_score,
  onboarding_need_score = EXCLUDED.onboarding_need_score,
  standardization_need_score = EXCLUDED.standardization_need_score,
  commercial_fit_score = EXCLUDED.commercial_fit_score,
  is_priority = EXCLUDED.is_priority,
  subsegmento = EXCLUDED.subsegmento,
  notes = EXCLUDED.notes;

SELECT 'cnae_segmento_total' AS check, COUNT(*) AS n FROM radarempresas_cnae_segmento
UNION ALL SELECT 'com_subsegmento', COUNT(*) FROM radarempresas_cnae_segmento WHERE subsegmento IS NOT NULL
UNION ALL SELECT 'subclasse_7d', COUNT(*) FROM radarempresas_cnae_segmento WHERE prefixo_len = 7
UNION ALL SELECT 'classe_5d', COUNT(*) FROM radarempresas_cnae_segmento WHERE prefixo_len = 5;
