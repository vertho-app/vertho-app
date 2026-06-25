/** Smoke do Vertex em PROD: dispara gerar-video-modulo (roteiro mínimo, 2 cenas
 *  SEM avatar → sem HeyGen) e confirma que a NARRAÇÃO (Vertex) passa. Paciente com
 *  o cold start do 1º run pós-deploy. Limpa a row de teste no fim.
 *  Rodar: npx tsx scripts/_smoke-vertex.ts */
import './_env';
import { createClient } from '@supabase/supabase-js';
import { tasks, runs } from '@trigger.dev/sdk';
import { normalizarRoteiro } from '../lib/video/roteiro-prompt';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const log = (...a: any[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

const roteiro: any = normalizarRoteiro({
  title: 'Smoke Vertex', theme: 'teste', deck_invariant: true, disc_sensitive_fields: ['narration'],
  scenes: [
    { id: 's1', type: 'concept_reveal', title: 'Narração na Vertex', bullets: ['voz clara', 'sem teto', 'no ar'], icons: ['voz', 'foco', 'feito'], narration: 'Este é um teste rápido da narração pela Vertex. A voz está clara? Sim, e sem o teto de cota diária.', key_idea: 'teste', source_anchor: 'IDEIA_PRINCIPAL', estimated_words: 20 },
    { id: 's2', type: 'steps_flow', title: 'Pronto', items: ['gerar', 'ouvir', 'confirmar'], narration: 'A migração para a Vertex resolveu o limite de cem por dia. Agora a produção escala sem travar.', key_idea: 'teste', source_anchor: 'IDEIA_PRINCIPAL', estimated_words: 18 },
  ],
} as any);

const CELL = { modulo: 'bbcd7218-faef-4da9-9622-2464f4ab6741', empresa: '0d99fed1-1710-40e3-b32e-7a95c7d023fe', cargo: 'Gestão Escolar', disc: 'I' };

async function main() {
  const { data: novo, error } = await sb.from('videos_gerados').insert({ modulo_base_id: CELL.modulo, empresa_id: CELL.empresa, cargo: CELL.cargo, disc_dominante: CELL.disc, status: 'processing', etapa: 'roteiro', roteiro, created_by: 'smoke:vertex' }).select('id').maybeSingle();
  if (error || !novo) throw new Error('insert: ' + (error?.message || ''));
  const videoId = novo.id as string;
  const REGION = process.env.SMOKE_REGION || 'eu-central-1';
  const handle = await tasks.trigger('gerar-video-modulo', { videoId, roteiro }, { region: REGION } as any);
  log('run:', handle.id, '· região:', REGION, '· videoId:', videoId, '· aguardando…');

  let result: 'ok' | 'fail' | 'timeout' = 'timeout', prev = '';
  for (let i = 0; i < 140; i++) { // ~14 min
    await new Promise((r) => setTimeout(r, 6000));
    let runStatus = '?';
    try { const rr: any = await runs.retrieve(handle.id); runStatus = rr.status; } catch { /* */ }
    const { data: row } = await sb.from('videos_gerados').select('etapa,status,error').eq('id', videoId).maybeSingle();
    const et = row?.etapa, st = row?.status, er = row?.error;
    const key = `${runStatus}|${et}|${st}`;
    if (key !== prev) { prev = key; log(`  run=${runStatus} · etapa=${et} · status=${st}` + (er ? ' · erro: ' + String(er).slice(0, 160) : '')); }

    if (er) { log(/tts|vertex|aiplatform|\b40[013]\b|token|credential|service.account|role/i.test(String(er)) ? '❌ FALHA na narração (provável env Vertex no dashboard)' : '❌ erro não-TTS'); result = 'fail'; break; }
    if (st === 'render_queued' || (et && et !== 'roteiro' && et !== 'narracao')) { log('✅ NARRAÇÃO via VERTEX OK em produção! (passou de narracao → ' + et + '/' + st + ')'); result = 'ok'; break; }
    if (['FAILED', 'CRASHED', 'SYSTEM_FAILURE'].includes(runStatus)) { log('❌ run falhou:', runStatus); result = 'fail'; break; }
  }

  // limpeza: cancela se ainda ativo + remove a row de teste
  try { const rr: any = await runs.retrieve(handle.id); if (!rr.isCompleted) await runs.cancel(handle.id).catch(() => {}); } catch { /* */ }
  await sb.from('videos_gerados').delete().eq('id', videoId);
  log('limpeza ok ·', result === 'ok' ? 'VERTEX CONFIRMADO ✅' : result === 'fail' ? 'FALHOU ❌' : 'inconclusivo (timeout) ⏱');
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
