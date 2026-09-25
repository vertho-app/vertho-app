-- 270: avatar compartilhado pelas células DISC de um mesmo módulo e cargo
--
-- O avatar (abertura + fecho na HeyGen) é ~US$ 0,59 de um vídeo de ~US$ 0,90, e cada
-- célula DISC do mesmo módulo pagava o seu, com textos quase iguais. Com
-- `VIDEO_AVATAR_GRUPO=on` (env do Trigger), o Kit escreve a abertura e o fecho 1× por
-- grupo (empresa × módulo × cargo, sem tom DISC), a 1ª célula (a "mãe") gera o avatar
-- e as irmãs reaproveitam o clipe. Ver docs/GERADOR-VIDEO-MODULO.md.
--
-- `chave` = hash de empresa, módulo, cargo, contexto do cargo e do PPP e versão do
-- prompt dos textos (`lib/video/avatar-grupo.ts` `chaveGrupoAvatar`): mudou qualquer um,
-- é outro grupo. `avatar` guarda os assets da mãe (mp4, mp3, timing, duração) e
-- `f0_hz` a altura medida no take dela, que é o alvo do portão para o miolo das irmãs.
-- `assinatura` = voz, modelo TTS, elenco, direção, foto, motor e fps do avatar; a irmã
-- só reaproveita se a dela bater.
--
-- Só o service_role lê e escreve (o Kit e as tasks do Trigger). Idempotente.

CREATE TABLE IF NOT EXISTS public.video_avatar_grupo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text NOT NULL UNIQUE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  modulo_base_id uuid NOT NULL REFERENCES public.modulos_base_conteudo(id),
  cargo text NOT NULL,
  intro jsonb NOT NULL,
  outro jsonb NOT NULL,
  mae_video_id uuid REFERENCES public.videos_gerados(id) ON DELETE SET NULL,
  avatar jsonb,
  f0_hz real,
  assinatura text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pronto', 'erro')),
  erro text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS video_avatar_grupo_empresa_idx ON public.video_avatar_grupo(empresa_id, modulo_base_id);

ALTER TABLE public.video_avatar_grupo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.video_avatar_grupo FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_avatar_grupo TO service_role;

COMMENT ON TABLE public.video_avatar_grupo IS
  'Avatar (abertura + fecho) compartilhado pelas células DISC de um módulo × cargo × empresa. A mãe gera, as irmãs reaproveitam. Só service_role.';

ALTER TABLE public.videos_gerados
  ADD COLUMN IF NOT EXISTS avatar_grupo_id uuid REFERENCES public.video_avatar_grupo(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS videos_gerados_avatar_grupo_idx
  ON public.videos_gerados(avatar_grupo_id) WHERE avatar_grupo_id IS NOT NULL;

COMMENT ON COLUMN public.videos_gerados.avatar_grupo_id IS
  'Grupo de avatar compartilhado (mig 270). NULL = a célula gera o próprio avatar, como sempre.';

NOTIFY pgrst, 'reload schema';

-- Rollback manual (desligue VIDEO_AVATAR_GRUPO antes; os vídeos prontos não mudam):
--   ALTER TABLE public.videos_gerados DROP COLUMN IF EXISTS avatar_grupo_id;
--   DROP TABLE IF EXISTS public.video_avatar_grupo;
