/* eslint-disable */
// READ-ONLY: lista as boxes Hetzner ativas, idade e LABELS.
//
// Os labels importam: `ensure-render-worker.ts` conta as boxes vivas com
// `label_selector=role%3Drender-worker` para decidir o fan-out. Se uma box de render
// não carregar esse label, ela fica invisível para o contador — e o orquestrador
// provisiona outra por cima, achando que não há nenhuma. Box efêmera esquecida é
// custo silencioso; box invisível ao contador é custo silencioso que se multiplica.
import { readFileSync } from 'fs';

const TOKEN = (() => {
  for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const i = l.indexOf('='); if (i < 0) continue;
    const k = l.slice(0, i).trim();
    if (/hetzner/i.test(k) && !/render_backend/i.test(k)) {
      const v = l.slice(i + 1).trim().replace(/^"|"$/g, '');
      if (v.length > 10) return v;
    }
  }
  return null;
})();
if (!TOKEN) throw new Error('token Hetzner ausente no .env.local');

const H = (p: string) => fetch('https://api.hetzner.cloud/v1/' + p, { headers: { Authorization: 'Bearer ' + TOKEN } }).then((r) => r.json());

async function main() {
  const todas = ((await H('servers')) as any).servers || [];
  const comLabel = ((await H('servers?label_selector=role%3Drender-worker')) as any).servers || [];
  const idsComLabel = new Set(comLabel.map((s: any) => s.id));

  console.log(`boxes ativas: ${todas.length} · vistas pelo contador de fan-out (role=render-worker): ${comLabel.length}`);
  for (const s of todas) {
    const min = Math.round((Date.now() - new Date(s.created).getTime()) / 60_000);
    const labels = Object.entries(s.labels || {}).map(([k, v]) => `${k}=${v}`).join(',') || '(sem labels)';
    const visivel = idsComLabel.has(s.id) ? '👁 contada' : '⚠️ INVISÍVEL ao fan-out';
    console.log(`  · ${s.name} · ${s.server_type?.name} · ${s.status} · ${min}min · ${visivel}`);
    console.log(`      labels: ${labels}`);
  }
  if (!todas.length) console.log('  (nenhuma — nada consumindo)');
  if (todas.length > comLabel.length) {
    console.log(`\n⚠️ ${todas.length - comLabel.length} box(es) fora do label_selector: o orquestrador não as enxerga e pode provisionar por cima.`);
  }
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
