/* eslint-disable */
/**
 * Smoke do modo `horizonte` do health-check contra o banco REAL (read-only: roda a
 * coleta + as regras, sem persistir nem alertar). O ponto é conferir que o alarme
 * ACUSA a lacuna que já sabemos existir — um check novo que passa verde na primeira
 * execução é indistinguível de um check quebrado.
 *
 * Uso: npx tsx --env-file=.env.local scripts/_smoke-horizonte.ts [semanasAdiante]
 */
import { createSupabaseAdmin } from '@/lib/supabase';
import { coletarHorizonteKits } from '@/lib/pipeline-health/coleta';
import { checarHorizonteKits } from '@/lib/pipeline-health/regras';

const SEMANAS = Number(process.argv[2] || 4);

async function main() {
  const sb = createSupabaseAdmin();
  const { data: empresas } = await sb.from('empresas').select('id, slug, is_demo');
  for (const emp of (empresas || []).filter((e: any) => !e.is_demo)) {
    const lacunas = await coletarHorizonteKits(sb, emp.id, SEMANAS);
    if (!lacunas.length) continue;
    const achados = checarHorizonteKits(lacunas);
    console.log(`\n=== ${emp.slug} · ${lacunas.length} tema(s) com lacuna em ${SEMANAS} semanas ===`);
    for (const a of achados) {
      console.log(`[${a.severidade.toUpperCase()}] ${a.titulo} — ${a.contagem} DISC`);
      for (const s of a.amostra || []) console.log(`   · ${s}`);
    }
    if (!achados.length) console.log('(nenhum achado — todos os temas cobertos)');
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
