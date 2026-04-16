-- 006: Competências base Vertho (template global)
-- Sem empresa_id — são globais, usadas como template ao criar nova empresa

CREATE TABLE IF NOT EXISTS competencias_base (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segmento    TEXT NOT NULL CHECK (segmento IN ('educacao', 'corporativo')),
  cod_comp    TEXT NOT NULL,
  nome        TEXT NOT NULL,
  pilar       TEXT,
  descricao   TEXT,
  cod_desc    TEXT,
  nome_curto  TEXT,
  descritor_completo TEXT,
  n1_gap      TEXT,
  n2_desenvolvimento TEXT,
  n3_meta     TEXT,
  n4_referencia TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comp_base_segmento ON competencias_base(segmento);
CREATE INDEX IF NOT EXISTS idx_comp_base_cod ON competencias_base(segmento, cod_comp);

-- Trigger updated_at
CREATE TRIGGER set_competencias_base_updated_at
  BEFORE UPDATE ON competencias_base
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed: Educação
INSERT INTO competencias_base (segmento, cod_comp, nome, pilar, descricao) VALUES
  ('educacao', 'GE01', 'Gestão de Equipe', 'Gestão', 'Capacidade de liderar, motivar e desenvolver equipes escolares'),
  ('educacao', 'COM01', 'Comunicação Assertiva', 'Relacional', 'Comunicar com clareza, escuta ativa e empatia'),
  ('educacao', 'PED01', 'Práticas Pedagógicas', 'Pedagógico', 'Domínio de metodologias e práticas de ensino-aprendizagem'),
  ('educacao', 'PLA01', 'Planejamento Estratégico', 'Gestão', 'Planejar, organizar e priorizar ações estratégicas'),
  ('educacao', 'RES01', 'Resolução de Conflitos', 'Relacional', 'Mediar e resolver conflitos de forma construtiva'),
  ('educacao', 'INO01', 'Inovação Educacional', 'Pedagógico', 'Abertura para novas práticas e tecnologias educacionais'),
  ('educacao', 'AVA01', 'Avaliação e Feedback', 'Pedagógico', 'Avaliar desempenho e dar feedback construtivo'),
  ('educacao', 'CLI01', 'Clima Escolar', 'Relacional', 'Promoção de ambiente escolar acolhedor e produtivo'),
  ('educacao', 'LID01', 'Liderança Pedagógica', 'Gestão', 'Condução de reuniões, HTPC e formação continuada'),
  ('educacao', 'INC01', 'Inclusão e Diversidade', 'Relacional', 'Práticas inclusivas e respeito à diversidade'),
  ('educacao', 'DAD01', 'Gestão por Dados', 'Gestão', 'Uso de indicadores e evidências para tomada de decisão'),
  ('educacao', 'FAM01', 'Relação Família-Escola', 'Relacional', 'Vínculos e comunicação eficaz com famílias');

-- Seed: Corporativo
INSERT INTO competencias_base (segmento, cod_comp, nome, pilar, descricao) VALUES
  ('corporativo', 'LID02', 'Liderança de Times', 'Gestão', 'Engajar, delegar e desenvolver equipes de alta performance'),
  ('corporativo', 'COM02', 'Comunicação Corporativa', 'Relacional', 'Comunicar com clareza em reuniões, apresentações e e-mails'),
  ('corporativo', 'PLA02', 'Planejamento e Execução', 'Gestão', 'Definir metas, planejar sprints e garantir entregas'),
  ('corporativo', 'NEG01', 'Negociação e Influência', 'Relacional', 'Conduzir negociações e influenciar stakeholders'),
  ('corporativo', 'RES02', 'Resolução de Problemas', 'Técnico', 'Analisar causa raiz e propor soluções eficazes'),
  ('corporativo', 'INO02', 'Inovação e Melhoria Contínua', 'Técnico', 'Propor melhorias em processos, produtos e serviços'),
  ('corporativo', 'CLI02', 'Foco no Cliente', 'Relacional', 'Entender necessidades e garantir satisfação do cliente'),
  ('corporativo', 'DAD02', 'Gestão por Indicadores', 'Gestão', 'Tomar decisões baseadas em dados e KPIs'),
  ('corporativo', 'COL01', 'Colaboração e Trabalho em Equipe', 'Relacional', 'Cooperar entre áreas e construir sinergia'),
  ('corporativo', 'ADA01', 'Adaptabilidade', 'Técnico', 'Adaptar-se a mudanças e ambientes de incerteza'),
  ('corporativo', 'GES01', 'Gestão de Projetos', 'Gestão', 'Planejar escopo, prazo, custo e qualidade de projetos'),
  ('corporativo', 'INT01', 'Inteligência Emocional', 'Relacional', 'Autorregulação, empatia e gestão de conflitos interpessoais');
