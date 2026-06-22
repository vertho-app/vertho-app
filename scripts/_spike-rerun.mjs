/**
 * Re-run do spike com os 2 ajustes: (a) sem cumprimento no avatar_intro (remove
 * "Oi!"/"Olá" do início da narração — o fix do prompt cobre roteiros NOVOS; aqui
 * o roteiro é reusado, então limpamos na mão), (b) o bundle já está sem transição
 * de slides. Render em 720p (VIDEO_RENDER_SCALE no env).
 */
import { createClient } from '@supabase/supabase-js';
import { tasks } from '@trigger.dev/sdk';

const SOURCE_ID = process.env.SPIKE_SOURCE_ID || '6d34f305-c0a8-4ae6-a501-150a182ccb2e';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// remove cumprimento solto do início da fala (Oi/Olá/Bem-vindo/Tudo bem + pontuação)
const stripGreeting = (t) => String(t || '').replace(/^\s*(oi|ol[áa]( pessoal| a todos| gente)?|bem[- ]vind[oa]s?|tudo bem)[\s!,.…-]+/i, '').replace(/^\s+/, '');

const { data: src, error: e1 } = await sb.from('videos_gerados')
  .select('modulo_base_id, empresa_id, cargo, disc_dominante, roteiro').eq('id', SOURCE_ID).maybeSingle();
if (e1 || !src?.roteiro) throw new Error('fonte/roteiro ausente: ' + (e1?.message || SOURCE_ID));

const roteiro = JSON.parse(JSON.stringify(src.roteiro));
const intro = (roteiro.scenes || []).find((s) => s.type === 'avatar_intro');
if (intro) {
  const antes = intro.narration;
  intro.narration = stripGreeting(intro.narration);
  log('avatar_intro antes:', JSON.stringify(antes.slice(0, 50)));
  log('avatar_intro depois:', JSON.stringify(intro.narration.slice(0, 50)));
}

const { data: novo, error: e2 } = await sb.from('videos_gerados').insert({
  modulo_base_id: src.modulo_base_id, empresa_id: src.empresa_id, cargo: src.cargo,
  disc_dominante: src.disc_dominante, status: 'processing', etapa: 'roteiro', roteiro,
  created_by: 'spike:rerun-fixes',
}).select('id').maybeSingle();
if (e2 || !novo?.id) throw new Error('falha insert: ' + (e2?.message || ''));
log('novo videoId:', novo.id);

const handle = await tasks.trigger('gerar-video-modulo', { videoId: novo.id, roteiro });
log('disparado · run:', handle.id, '· monitore videoId=', novo.id);
