/* eslint-disable */
/**
 * Chama `ensureRenderWorker()` à mão e IMPRIME o motivo da decisão.
 *
 * Existe porque quem provisiona é a task `trigger/gerar-video-modulo.ts` e, se a ladder
 * de tipos/locations do Hetzner estiver sem estoque (412 resource_unavailable é comum no
 * CX shared), o `reason` fica só no log da task — e a fila para em `rendering` com ZERO
 * box, indistinguível de "está renderizando". Medido em 28/07: 7 células em rendering e
 * 0 servidores na conta.
 *
 * Uso: npx tsx scripts/_ensure-render-box.ts
 */
process.loadEnvFile('.env.local');
if (!process.env.HCLOUD_TOKEN && process.env['Hetzner Cloud api token']) process.env.HCLOUD_TOKEN = process.env['Hetzner Cloud api token'];
import { ensureRenderWorker } from '@/lib/video/ensure-render-worker';

async function main() {
  console.log(`MAX_RENDER_BOXES=${process.env.MAX_RENDER_BOXES || '(default 4)'} · RENDER_JOBS_PER_BOX=${process.env.RENDER_JOBS_PER_BOX || '(default 3)'}`);
  console.log(`RENDER_SNAPSHOT_ID=${process.env.RENDER_SNAPSHOT_ID || '(AUSENTE)'} · HCLOUD_TOKEN=${process.env.HCLOUD_TOKEN ? 'ok' : '(AUSENTE)'} · DATABASE_URL=${process.env.DATABASE_URL ? 'ok' : '(AUSENTE)'}`);
  const r = await ensureRenderWorker();
  console.log('\nresultado:', JSON.stringify(r, null, 2));
}
main().then(() => process.exit(0)).catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
