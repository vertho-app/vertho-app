-- Personalização do vídeo gerado por CÉLULA: (módulo × empresa × cargo × DISC
-- dominante). Um vídeo é reaproveitado por todos os colaboradores da mesma
-- célula. PPP entra como contexto da empresa (não compõe a chave).
ALTER TABLE videos_gerados
  ADD COLUMN IF NOT EXISTS cargo text,                    -- nome do cargo (NULL = vídeo genérico do módulo)
  ADD COLUMN IF NOT EXISTS disc_dominante text;           -- 'D' | 'I' | 'S' | 'C' (NULL = sem personalização DISC)

-- Lookup da célula (resolução lazy + cache): pega o vídeo pronto/encaminhando
-- da célula exata. NULLs (genérico) coexistem com as variantes personalizadas.
CREATE INDEX IF NOT EXISTS idx_videos_gerados_celula
  ON videos_gerados (modulo_base_id, empresa_id, cargo, disc_dominante, created_at DESC);
