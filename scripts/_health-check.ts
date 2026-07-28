/* eslint-disable */
// Roda o health-check do pipeline headless (mesmo núcleo do cron), sem persistir
// nem alertar por padrão — para inspecionar antes de confiar no automático.
//
// Uso:  npx tsx scripts/_health-check.ts preflight [YYYY-MM-DD]
//       npx tsx scripts/_health-check.ts postflight [YYYY-MM-DD]
//       npx tsx scripts/_health-check.ts estrutural
//       npx tsx scripts/_health-check.ts horizonte [semanasAdiante]
process.loadEnvFile('.env.local');
import { rodarPreflight, rodarPostflight, rodarEstrutural, rodarHorizonte, montarAlerta } from '@/lib/pipeline-health/core';

const MODO = (process.argv[2] || 'preflight') as 'preflight' | 'postflight' | 'estrutural' | 'horizonte';
const SEM_DATA = MODO === 'estrutural' || MODO === 'horizonte';
const DATA = process.argv[3] ? new Date(process.argv[3] + 'T12:00:00Z') : new Date(Date.now() + 24 * 3600_000);

async function main() {
  const resultados = MODO === 'estrutural' ? [await rodarEstrutural()]
    : MODO === 'horizonte' ? await rodarHorizonte(Number(process.argv[3]) || undefined)
    : MODO === 'preflight' ? await rodarPreflight(DATA) : await rodarPostflight(DATA);

  console.log(`=== HEALTH-CHECK · ${MODO}${!SEM_DATA ? ` · alvo ${DATA.toISOString().slice(0, 10)}` : ''} ===\n`);
  if (!resultados.length) { console.log('(nenhuma empresa com entrega nesse dia)'); return; }

  for (const r of resultados) {
    const icone = r.severidade === 'critico' ? '🔴' : r.severidade === 'aviso' ? '🟠' : '✅';
    console.log(`${icone} ${r.empresaSlug || 'global'} · ${r.severidade} · ${r.achados.length} achado(s) · ${r.duracaoMs}ms${r.erro ? ` · ERRO: ${r.erro}` : ''}`);
    for (const a of r.achados) {
      console.log(`   [${a.severidade}] ${a.titulo} — ${a.contagem}`);
      console.log(`      ${a.detalhe}`);
      if (a.amostra?.length) for (const s of a.amostra) console.log(`        · ${s}`);
      if (a.acao) console.log(`      → ${a.acao}`);
    }
  }
  const alerta = montarAlerta(resultados);
  console.log(`\nalerta: ${alerta ? `SIM — "${alerta.assunto}"` : 'não (nada crítico)'}`);
}
main().catch((e) => { console.error('ERRO FATAL:', e?.message || e); process.exit(1); });
