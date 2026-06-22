/** Monitora o spike: poll videos_gerados + videos_personalizados até done/error. */
import { createClient } from '@supabase/supabase-js';
const ID = process.env.SPIKE_VIDEO_ID || '0cb2009e-52b3-4728-831b-28b255284ba0';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let last = '';
for (let i = 0; i < 120; i++) { // ~40min máx (20s × 120)
  const { data: v } = await sb.from('videos_gerados')
    .select('status, etapa, video_url, bunny_video_id, error').eq('id', ID).maybeSingle();
  const { data: p } = await sb.from('videos_personalizados')
    .select('nome_usado, status, video_url, error').eq('cell_video_id', ID);
  const persoStr = (p || []).map((x) => `${x.nome_usado}:${x.status}`).join(', ') || '—';
  const line = `deck=${v?.status}/${v?.etapa} · perso=[${persoStr}]`;
  if (line !== last) { log(line); last = line; }
  if (v?.status === 'error') { log('ERRO deck:', v.error); break; }
  if (v?.status === 'done') {
    log('DECK DONE →', v.video_url);
    // espera a saudação fechar (roda após o deck)
    const allDone = (p || []).length && (p || []).every((x) => x.status === 'done' || x.status === 'error');
    if (allDone) { for (const x of p) log(`  perso ${x.nome_usado}: ${x.status} ${x.video_url || x.error || ''}`); break; }
  }
  await sleep(20000);
}
log('monitor encerrado');
