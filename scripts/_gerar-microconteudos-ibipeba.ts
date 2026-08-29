/* eslint-disable */
// Onda 1: gera micro_conteudos (texto+case) dos 5 pares (cargo × competência) com MB
// pronto no piloto Ibipeba. Headless (passa sb service-role → pula a sessão), cargo-safe
// (descritores por cargo), idempotente (pula o que já existe). Concorrência 4.
// Rodar: npx tsx scripts/_gerar-microconteudos-ibipeba.ts
process.loadEnvFile('.env.local');

const EMPRESA = '0d99fed1-1710-40e3-b32e-7a95c7d023fe'; // Ibipeba
const FORMATOS = ['texto', 'case'];
const PARES: Array<{ cargo: string; competencia: string }> = [
  // ONDA 2 (DIR02): só o par que faltava. Onda 1 (os outros 5) já está no banco
  // (idempotência pularia de qualquer jeito).
  { cargo: 'Gestão Escolar',         competencia: 'Autocuidado e resiliência emocional' },
];
const CONCURRENCY = 4;

(async () => {
  const { createSupabaseAdmin } = await import('@/lib/supabase');
  const { gerarConteudoIA } = await import('@/actions/conteudos');
  const { Client } = await import('pg');
  const sb = createSupabaseAdmin();

  // Descritores POR CARGO (cargo-safe) de cada par.
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  type Job = { cargo: string; competencia: string; descritor: string; formato: string };
  const jobs: Job[] = [];
  for (const p of PARES) {
    const r = await pg.query(
      `select distinct nome_curto from competencias where empresa_id=$1 and nome=$2 and cargo=$3 and nome_curto is not null order by nome_curto`,
      [EMPRESA, p.competencia, p.cargo]);
    const descritores = r.rows.map((x: any) => x.nome_curto);
    for (const d of descritores) for (const f of FORMATOS) jobs.push({ cargo: p.cargo, competencia: p.competencia, descritor: d, formato: f });
  }
  await pg.end();
  console.log(`Total de jobs: ${jobs.length} (${PARES.length} pares × ~6 descritores × ${FORMATOS.length} formatos)\n`);

  let ok = 0, pulados = 0, erros = 0, done = 0;
  const t0 = Date.now();
  async function runOne(j: Job) {
    const tag = `${j.cargo.split(' ')[0]}/${j.competencia.slice(0, 18)}/${j.formato}/${j.descritor.slice(0, 22)}`;
    try {
      const r: any = await gerarConteudoIA({
        formato: j.formato, competencia: j.competencia, descritor: j.descritor,
        cargo: j.cargo, nivelMin: 1.0, nivelMax: 2.0, contexto: 'generico',
        empresaId: EMPRESA, sb,
      });
      done++;
      if (r?.success && r?.skipped) { pulados++; console.log(`[${done}/${jobs.length}] ⏭️  ${tag} (já existe)`); }
      else if (r?.success) { ok++; console.log(`[${done}/${jobs.length}] ✅ ${tag}`); }
      else { erros++; console.log(`[${done}/${jobs.length}] ❌ ${tag} :: ${r?.error}`); }
    } catch (e: any) {
      done++; erros++; console.log(`[${done}/${jobs.length}] 💥 ${tag} :: ${e?.message || e}`);
    }
  }

  // Pool de concorrência simples.
  let idx = 0;
  async function worker() { while (idx < jobs.length) { const j = jobs[idx++]; await runOne(j); } }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const min = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`\n=== FIM em ${min} min === gerados: ${ok} | já existiam: ${pulados} | erros: ${erros} | total: ${jobs.length}`);
})().catch((e) => { console.error('FATAL:', e?.message || e); process.exit(1); });
