/**
 * Spike de render na CCX33 SEM HeyGen: reconstrói render_inputprops a partir dos
 * assets que sobraram no Storage do render fd7cbc19 (avatar .mp4 nas pontas +
 * narração .mp3 no miolo), enfileira como render_queued e a CCX33 (worker idle)
 * renderiza. Mede o tempo real (8 cores dedicados) sem custo de HeyGen.
 *
 * Rodar: npx tsx scripts/spike-ccx33-render.ts  (precisa ffprobe no PATH)
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { montarInputProps, exportCaptionsToSrt, exportCaptionsToVtt, type AssetMap } from '../lib/video/montar-inputprops';

const exec = promisify(execFile);
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';
const env: Record<string, string> = {};
for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL, SRK = env.SUPABASE_SERVICE_ROLE_KEY;
const JOB = 'fd7cbc19-02b3-4520-9db0-16440b0a9b24'; // jobId dos assets no Storage
const isAvatar = (t: string) => t === 'avatar_intro' || t === 'avatar_outro';

async function dur(url: string): Promise<number> {
  const { stdout } = await exec(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', url]);
  return parseFloat(String(stdout).trim()) || 0;
}

async function main() {
  // roteiro que fd7cbc19 usou (reuso de 5ff3b1ca)
  const r = await fetch(`${SUPA}/rest/v1/videos_gerados?id=eq.5ff3b1ca-2223-428c-87cb-73426c4f6b01&select=roteiro,modulo_base_id`, {
    headers: { apikey: SRK, Authorization: `Bearer ${SRK}` },
  });
  const row = (await r.json())[0];
  const roteiro = row.roteiro;

  // AssetMap: avatar→.mp4, demais→.mp3 (mesmos arquivos do render original)
  const pub = (f: string) => `${SUPA}/storage/v1/object/public/video-assets/${JOB}/${f}`;
  const assets: AssetMap = {};
  for (const s of roteiro.scenes) {
    const url = pub(`${s.id}.${isAvatar(s.type) ? 'mp4' : 'mp3'}`);
    const d = await dur(url);
    assets[s.id] = { src: url, durationSec: d };
    console.log(`  ${s.id} (${s.type}) ${d.toFixed(1)}s`);
  }

  const props = montarInputProps(roteiro, assets, { fps: 30, width: 1920, height: 1080 });
  console.log(`props: ${props.scenes.length} cenas · ${props.totalFrames} frames · ${(props.totalFrames / props.fps).toFixed(0)}s`);

  const body = JSON.stringify({
    modulo_base_id: row.modulo_base_id, status: 'render_queued', etapa: 'render',
    roteiro, render_inputprops: props, render_scale: 0.6667,
    srt: exportCaptionsToSrt(props.captions), vtt: exportCaptionsToVtt(props.captions),
    created_by: 'spike-ccx33-noheygen',
  });
  const ins = await fetch(`${SUPA}/rest/v1/videos_gerados`, {
    method: 'POST', headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body,
  });
  const vid = (await ins.json())[0].id;
  writeFileSync('scripts/_ccx33-vid.txt', vid);
  console.log(`\nENFILEIRADO render_queued · videoId=${vid} · totalFrames=${props.totalFrames}`);
}
main().catch((e) => { console.error('ERRO', e?.message || e); process.exit(1); });
