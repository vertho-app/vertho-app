/**
 * Calibra o `ia3_check`: a nota guardada e a nota de hoje estão na mesma escala?
 *
 * O CONTROLE de 25/08 achou que quatro cenários da ACME Demo guardados com 92
 * voltavam com 38-60 pelo caminho IDÊNTICO ao de `checkCenarioIA3Core`
 * (mesmo prompt, modelo, teto, normalização) — delta médio −38. Enquanto isso
 * não fechar, `status_check` não compara no tempo e o bloco E1 não tem
 * instrumento: qualquer piloto de modelo ali mede contra uma régua que se mexeu.
 *
 * Este script separa TRÊS hipóteses que o controle não separava:
 *
 *  (A) É da ACME Demo. Ela tinha override de `ia3_check` para `gpt-5.4`, que
 *      morreu (403) e saiu na migration 227. Se só ela divergir, as notas de 92
 *      vieram de um auditor mais leniente e o resto da base está íntegro.
 *  (B) É do auditor de hoje contra TODO o histórico. Aí o problema é maior que
 *      o E1: nenhum `status_check` guardado compara com um novo.
 *  (C) É RUÍDO. Se o mesmo cenário, re-checado 3× pelo mesmo modelo, variar
 *      dezenas de pontos, então o limiar absoluto (>=90 aprovado, >=80
 *      ressalvas) está classificando aleatoriedade — e a régua é que está
 *      quebrada, não a nota.
 *
 * (C) é a mais importante e a mais barata: se o check não for reprodutível,
 * (A) e (B) viram irrelevantes.
 *
 *   node --env-file=.env.local node_modules/.bin/tsx scripts/_calibrar-ia3-check.ts
 */
import { setGlobalDispatcher, Agent } from 'undici';
import { createSupabaseAdmin } from '../lib/supabase';
import { callAI } from '../actions/ai-client';
import { extractJSON } from '../actions/utils';
import { montarCheckIA3Prompt, normalizarResultadoCheckIA3 } from '../lib/ia3-cenarios';

setGlobalDispatcher(new Agent({ headersTimeout: 900_000, bodyTimeout: 900_000 }));
const CHECKER = 'gpt-5.6-terra';

async function checar(sb: any, cen: any): Promise<number | null> {
  const { system, user } = await montarCheckIA3Prompt(sb, cen);
  const r = await callAI(system, user, { model: CHECKER }, 4096, {
    taskKey: 'ia3_check', source: 'calibracao', timeoutMs: 300_000,
  });
  const n = normalizarResultadoCheckIA3(await extractJSON(r));
  const nota = Number(n?.resultado?.nota ?? NaN);
  return Number.isFinite(nota) ? nota : null;
}

async function main() {
  const sb = createSupabaseAdmin();
  const { data: cenarios, error } = await sb.from('banco_cenarios')
    .select('id, titulo, descricao, cargo, competencia_id, empresa_id, ppp_escola_id, alternativas, nota_check, empresas!inner(nome)')
    .not('nota_check', 'is', null)
    .gte('nota_check', 88);
  if (error) { console.error('erro:', error.message); process.exit(1); }

  // Um cenário por tenant, para a amostra atravessar a base em vez de repetir
  // o mesmo tenant — que foi o limite do controle anterior.
  const porTenant = new Map<string, any>();
  for (const c of (cenarios || []) as any[]) {
    const nome = c.empresas?.nome || c.empresa_id;
    if (!porTenant.has(nome)) porTenant.set(nome, c);
  }
  console.log(`(A)/(B) — um cenário guardado com >=88 por tenant, re-checado 1×:\n`);

  const deltas: Array<{ tenant: string; guardada: number; nova: number; delta: number }> = [];
  for (const [tenant, cen] of porTenant) {
    try {
      const nova = await checar(sb, cen);
      if (nova === null) { console.log(`  ${tenant.slice(0, 34).padEnd(36)} sem nota no retorno`); continue; }
      const d = nova - cen.nota_check;
      deltas.push({ tenant, guardada: cen.nota_check, nova, delta: d });
      console.log(`  ${tenant.slice(0, 34).padEnd(36)} guardada ${String(cen.nota_check).padStart(3)} → ${String(nova).padStart(3)}  (${d >= 0 ? '+' : ''}${d})`);
    } catch (e: any) {
      console.log(`  ${tenant.slice(0, 34).padEnd(36)} 🔴 ${String(e?.message || e).slice(0, 50)}`);
    }
  }

  const soAcme = deltas.filter((d) => /ACME Demo/i.test(d.tenant));
  const outros = deltas.filter((d) => !/ACME Demo/i.test(d.tenant));
  const media = (l: typeof deltas) => (l.length ? l.reduce((s, x) => s + x.delta, 0) / l.length : NaN);
  console.log(`\n  delta ACME Demo: ${soAcme.length ? media(soAcme).toFixed(1) : '—'}   ·   delta OUTROS tenants: ${outros.length ? media(outros).toFixed(1) : '—'}`);

  // ── (C) reprodutibilidade ──
  const alvo = [...porTenant.values()][0];
  console.log(`\n(C) — o MESMO cenário, 3 re-checks seguidos (guardada ${alvo.nota_check}):`);
  const repetidas: number[] = [];
  for (let i = 0; i < 3; i++) {
    try { const n = await checar(sb, alvo); if (n !== null) { repetidas.push(n); console.log(`     rodada ${i + 1}: ${n}`); } }
    catch (e: any) { console.log(`     rodada ${i + 1}: 🔴 ${String(e?.message || e).slice(0, 40)}`); }
  }
  const amp = repetidas.length > 1 ? Math.max(...repetidas) - Math.min(...repetidas) : NaN;
  console.log(`     amplitude: ${Number.isFinite(amp) ? amp : '—'} ponto(s)`);

  console.log('\n── leitura ──');
  if (Number.isFinite(amp) && amp >= 15) {
    console.log('🔴 (C): o check NÃO é reprodutível — o mesmo cenário varia mais que a distância');
    console.log('   entre `aprovado` (>=90) e `revisar` (<80). O limiar absoluto está classificando');
    console.log('   ruído, e nenhuma comparação de modelo apoiada nele vale. Consertar a régua vem');
    console.log('   ANTES de qualquer decisão de modelo no E1.');
  } else if (outros.length && Math.abs(media(outros)) <= 10) {
    console.log('✅ (A): só a ACME Demo diverge — as notas dela vieram do gpt-5.4 morto. O resto');
    console.log('   da base está íntegro e o E1 volta a ter instrumento (re-checando a ACME Demo).');
  } else {
    console.log('🔴 (B): diverge em TODOS os tenants — o auditor de hoje não fala a mesma escala');
    console.log('   do histórico. Nenhum `status_check` guardado compara com um novo.');
  }
  process.exit(0);
}

main();
