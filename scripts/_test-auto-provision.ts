/**
 * TESTE do auto-provisionamento por clique: insere um vídeo de teste, dispara
 * gerar-video-modulo (eu-central-1) e observa o orquestrador subir a box de
 * render SOZINHO (ensureRenderWorker), drenar e se AUTODESTRUIR. Não provisiona
 * nada à mão — valida o caminho de produção. Limpa box órfã + linha no fim.
 * Rodar: npx tsx scripts/_test-auto-provision.ts
 */
import './_env';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { tasks } from '@trigger.dev/sdk';
import { normalizarRoteiro } from '../lib/video/roteiro-prompt';

const log = (...a: any[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TOKEN = (() => { for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const i = l.indexOf('='); if (i < 0) continue; const k = l.slice(0, i).trim(); if (/hetzner/i.test(k) && !/render_backend/i.test(k)) { const v = l.slice(i + 1).trim().replace(/^"|"$/g, ''); if (v.length > 10) return v; } } return ''; })();
const H = (p: string, opts: any = {}) => fetch('https://api.hetzner.cloud/v1/' + p, { ...opts, headers: { Authorization: 'Bearer ' + TOKEN, ...(opts.headers || {}) } }).then(async (r) => r.json().catch(() => ({})));
const renderBoxes = async () => (((await H('servers?label_selector=role%3Drender-worker')).servers) || []).map((s: any) => `${s.id}(${s.server_type?.name || '?'}/${s.status})`);

const CELL = { modulo: 'bbcd7218-faef-4da9-9622-2464f4ab6741', empresa: '0d99fed1-1710-40e3-b32e-7a95c7d023fe', cargo: 'Gestão Escolar', disc: 'I' };
const roteiro: any = normalizarRoteiro({
  title: 'Teste auto-provision', theme: 'teste', deck_invariant: true, disc_sensitive_fields: ['narration'],
  scenes: [
    { id: 'a', type: 'avatar_intro', title: 'Auto', subtitle: 'sobe sozinho', narration: 'Teste do provisionamento automático: a box de render deve subir sem ninguém provisionar à mão.', key_idea: 't', source_anchor: 'IDEIA_PRINCIPAL', estimated_words: 20 },
    { id: 'b', type: 'concept_reveal', title: 'Três sinais', bullets: ['sobe', 'drena', 'morre'], icons: ['processo', 'feito', 'voz'], narration: 'Três sinais: a box sobe do snapshot, drena a fila e se autodestrói quando a fila seca.', key_idea: 't', source_anchor: 'IDEIA_PRINCIPAL', estimated_words: 24 },
    { id: 'd', type: 'avatar_outro', title: 'Fim', subtitle: 'e agora?', narration: 'Se você está vendo este vídeo, o caminho automático funcionou de ponta a ponta.', key_idea: 't', source_anchor: 'IDEIA_PRINCIPAL', estimated_words: 16 },
  ],
} as any);

async function main() {
  const sb = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  let videoId: string | null = null;
  try {
    log('boxes de render ANTES:', (await renderBoxes()).join(', ') || 'nenhuma');
    const ins = await sb.query(`INSERT INTO videos_gerados (modulo_base_id,empresa_id,cargo,disc_dominante,status,etapa,roteiro,created_by) VALUES ($1,$2,$3,$4,'processing','roteiro',$5,'teste:auto-provision') RETURNING id`, [CELL.modulo, CELL.empresa, CELL.cargo, CELL.disc, roteiro]);
    videoId = ins.rows[0].id;
    log('videoId:', videoId, '· disparando gerar-video-modulo em eu-central-1…');
    const handle = await tasks.trigger('gerar-video-modulo', { videoId, roteiro }, { region: 'eu-central-1' } as any);
    log('run:', handle.id);

    let prev = '', prevBoxes = '';
    for (let i = 0; i < 320; i++) { // ~43 min (cx33 4-core é mais lento)
      await sleep(8000);
      const { rows } = await sb.query('SELECT status,etapa,video_url,error FROM videos_gerados WHERE id=$1', [videoId]);
      const r = rows[0]; const key = `${r?.etapa}|${r?.status}`;
      if (key !== prev) { prev = key; log('  vídeo: etapa=' + r?.etapa + ' status=' + r?.status + (r?.error ? ' ERRO: ' + String(r.error).slice(0, 160) : '')); }
      const boxes = (await renderBoxes()).join(', ');
      if (boxes !== prevBoxes) { prevBoxes = boxes; log('  boxes render:', boxes || 'nenhuma'); }
      if (r?.status === 'done' && r?.video_url) { log('✅ VÍDEO PRONTO → ' + r.video_url); log('aguardando self-destruct da box (ócio 5 min)…'); }
      if (r?.status === 'error') { log('❌ erro no job: ' + String(r.error).slice(0, 200)); break; }
      // sucesso total: vídeo done E nenhuma box restante (self-destruct ocorreu)
      if (r?.status === 'done' && r?.video_url && !boxes) { log('✅✅ FLUXO COMPLETO: box subiu sozinha, renderizou e se autodestruiu.'); break; }
    }
  } finally {
    // segurança: se sobrou box de render, deleta (não deixar máquina ligada)
    const left = ((await H('servers?label_selector=role%3Drender-worker')).servers) || [];
    for (const s of left) { log('limpando box órfã', s.id); await H('servers/' + s.id, { method: 'DELETE' }).catch(() => {}); }
    await sb.end().catch(() => {});
    log('FIM. (videoId de teste:', videoId, ')');
  }
}
main().catch((e) => { console.error('ERRO:', e?.stack || e?.message || e); process.exit(1); });
