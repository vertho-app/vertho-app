process.loadEnvFile('.env.local');
import { embedText } from '@/lib/embeddings';
async function main() {
  const t0 = Date.now();
  let ok = 0, err = 0, msg = '';
  for (let i = 0; i < 6; i++) {
    try { const r = await embedText(`teste de rate limit ${i}`); if (r?.vector) ok++; }
    catch (e: any) { err++; msg = String(e?.message || e).slice(0, 90); }
  }
  console.log(`6 chamadas seguidas em ${((Date.now()-t0)/1000).toFixed(1)}s → ok=${ok} erro=${err} ${msg}`);
}
main();
