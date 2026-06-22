/**
 * Spike PRODUÇÃO-IDÊNTICA (exceto Hetzner) em 1080p. Reusa o roteiro real de uma
 * célula existente, cria um novo registro videos_gerados e dispara o MESMO
 * orquestrador de produção (`gerar-video-modulo`). Com RENDER_BACKEND=trigger e
 * VIDEO_RENDER_SCALE ausente (→ scale 1 = 1080p), roda todo o pipeline de prod:
 * narração (Vindemiatrix) → avatar HeyGen → render 1080p → master + SFX →
 * saudação natural dos colaboradores da célula.
 *
 * Rodar: node --env-file=.env.local scripts/_spike-prod-1080.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { tasks } from '@trigger.dev/sdk';

const SOURCE_ID = process.env.SPIKE_SOURCE_ID || '6d34f305-c0a8-4ae6-a501-150a182ccb2e'; // Gestão Escolar/I
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const sb = createClient(SUPA, SRK, { auth: { persistSession: false } });

const { data: src, error: e1 } = await sb.from('videos_gerados')
  .select('modulo_base_id, empresa_id, cargo, disc_dominante, roteiro')
  .eq('id', SOURCE_ID).maybeSingle();
if (e1 || !src) throw new Error('fonte não encontrada: ' + (e1?.message || SOURCE_ID));
if (!src.roteiro) throw new Error('fonte sem roteiro');
log('célula:', src.cargo, '/', src.disc_dominante, '· cenas:', (src.roteiro.scenes || []).length, '· empresa:', src.empresa_id);

const { data: novo, error: e2 } = await sb.from('videos_gerados').insert({
  modulo_base_id: src.modulo_base_id,
  empresa_id: src.empresa_id,
  cargo: src.cargo,
  disc_dominante: src.disc_dominante,
  status: 'processing',
  etapa: 'roteiro',
  roteiro: src.roteiro,
  created_by: 'spike:prod-1080',
}).select('id').maybeSingle();
if (e2 || !novo?.id) throw new Error('falha ao criar registro: ' + (e2?.message || ''));
log('novo videoId:', novo.id);

const handle = await tasks.trigger('gerar-video-modulo', { videoId: novo.id, roteiro: src.roteiro });
log('disparado gerar-video-modulo · run:', handle.id);
log('acompanhe: videos_gerados.id =', novo.id, '· e videos_personalizados.cell_video_id =', novo.id);
