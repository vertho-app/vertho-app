-- 021: Atualizar competências base com cargo/função sugerido

-- Educação
UPDATE competencias_base SET cargo = 'Diretor' WHERE segmento = 'educacao' AND cod_comp IN ('GE01', 'EDU-01', 'EDU-02', 'EDU-05', 'EDU-06', 'EDU-08');
UPDATE competencias_base SET cargo = 'Coordenador' WHERE segmento = 'educacao' AND cod_comp IN ('COM01', 'EDU-03', 'EDU-04', 'EDU-07', 'EDU-11', 'EDU-13');
UPDATE competencias_base SET cargo = 'Professor' WHERE segmento = 'educacao' AND cod_comp IN ('PED01', 'EDU-09', 'EDU-10', 'EDU-12', 'EDU-14', 'EDU-15', 'RES01');

-- Corporativo
UPDATE competencias_base SET cargo = 'Diretor' WHERE segmento = 'corporativo' AND cod_comp IN ('LID02', 'CORP-01', 'CORP-03', 'CORP-12');
UPDATE competencias_base SET cargo = 'Gerente' WHERE segmento = 'corporativo' AND cod_comp IN ('COM02', 'CORP-02', 'CORP-06', 'CORP-07', 'CORP-09', 'CORP-14', 'PLA02');
UPDATE competencias_base SET cargo = 'Analista' WHERE segmento = 'corporativo' AND cod_comp IN ('RES02', 'CORP-04', 'CORP-05', 'CORP-08', 'CORP-10', 'CORP-11', 'NEG01');
UPDATE competencias_base SET cargo = 'Consultor' WHERE segmento = 'corporativo' AND cod_comp IN ('CORP-13', 'CORP-15');

-- Inserir novas competências base (se não existem)
INSERT INTO competencias_base (segmento, cod_comp, nome, pilar, cargo, descricao) VALUES
  ('educacao', 'EDU-11', 'Mediação de Conflitos', 'Comunicação', 'Coordenador', 'Capacidade de mediar e resolver conflitos entre alunos, professores e famílias.'),
  ('educacao', 'EDU-12', 'Práticas Pedagógicas Diferenciadas', 'Gestão', 'Professor', 'Competência para adaptar metodologias às necessidades individuais dos alunos.'),
  ('educacao', 'EDU-13', 'Engajamento Familiar', 'Cultura', 'Coordenador', 'Habilidade de construir parcerias com famílias para fortalecer o processo educativo.'),
  ('educacao', 'EDU-14', 'Gestão do Tempo e Prioridades', 'Gestão', 'Professor', 'Capacidade de organizar rotinas, priorizar demandas e cumprir prazos.'),
  ('educacao', 'EDU-15', 'Desenvolvimento Profissional Contínuo', 'Cultura', 'Professor', 'Disposição para buscar formação continuada e aplicar novos conhecimentos.'),
  ('corporativo', 'CORP-11', 'Colaboração e Trabalho em Equipe', 'Cultura', 'Analista', 'Capacidade de trabalhar de forma cooperativa e compartilhar conhecimentos.'),
  ('corporativo', 'CORP-12', 'Gestão de Mudanças', 'Liderança', 'Diretor', 'Competência para conduzir transformação organizacional com empatia e visão.'),
  ('corporativo', 'CORP-13', 'Negociação e Influência', 'Comunicação', 'Consultor', 'Conduzir negociações complexas e influenciar stakeholders.'),
  ('corporativo', 'CORP-14', 'Tomada de Decisão sob Pressão', 'Estratégia', 'Gerente', 'Decidir com agilidade e assertividade em cenários de incerteza e urgência.'),
  ('corporativo', 'CORP-15', 'Foco no Cliente', 'Cultura', 'Consultor', 'Orientação para entender necessidades do cliente e entregar valor.')
ON CONFLICT DO NOTHING;
