-- ─────────────────────────────────────────────────────────────────────────
-- 104 — Radar Empresas: denylist CNAE (modelo híbrido)
--
-- Inverte parcialmente o modelo: além da allowlist curada
-- (radarempresas_cnae_segmento — sinal rico), tudo que NÃO está na
-- allowlist E NÃO está nesta denylist vira "aderente genérico" (pesos
-- medianos, score_confidence teto 'media'). O que está aqui é
-- não-elegível (não entra no funil).
--
-- Critério da denylist: setores que NÃO têm equipe a desenvolver /
-- NÃO compram desenvolvimento de pessoas. NÃO inclui comércio nem
-- saúde (são alvo premium — varejo/clínicas são segmentos #1).
-- low_team_probability continua filtrando micro/autônomo dentro de
-- divisões mistas (construção/artístico), por isso elas ficam fora
-- da denylist (construtora/produtora grande é alvo genérico válido).
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS radarempresas_cnae_denylist (
  cnae_prefixo  TEXT PRIMARY KEY,
  prefixo_len   INTEGER NOT NULL,
  motivo        TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE radarempresas_cnae_denylist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS radarempresas_cnae_denylist_perm ON radarempresas_cnae_denylist;
CREATE POLICY radarempresas_cnae_denylist_perm ON radarempresas_cnae_denylist
  FOR ALL USING (true) WITH CHECK (true);

INSERT INTO radarempresas_cnae_denylist (cnae_prefixo, prefixo_len, motivo) VALUES
('01','2','Agricultura/pecuária — sem equipe corporativa a desenvolver'),
('02','2','Produção florestal — idem agro'),
('03','2','Pesca/aquicultura — idem agro'),
('68','2','Atividades imobiliárias — não compra desenvolvimento de pessoas'),
('6462','4','Holdings não-financeiras — sem operação/equipe'),
('6463','4','Outras sociedades de participação'),
('6470','4','Fundos de investimento — sem equipe'),
('84','2','Administração pública — não é cliente B2B comercial'),
('94','2','Organizações associativas/sindicais/religiosas — não-comercial'),
('97','2','Serviços domésticos — empregador doméstico, não B2B'),
('99','2','Organismos internacionais/extraterritoriais')
ON CONFLICT (cnae_prefixo) DO NOTHING;

SELECT 'cnae_denylist' AS tabela, COUNT(*) AS n FROM radarempresas_cnae_denylist;
