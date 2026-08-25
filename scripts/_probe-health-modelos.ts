/**
 * Roda o R14 (modelos configurados ainda existem?) contra os dados REAIS.
 *
 * Os testes unitários cobrem a regra com fixtures; isto exercita o COLETOR —
 * listagem por família, mapeamento de id, config dos tenants. Sem esta passada,
 * o R14 seria mais um check que passa porque nunca olhou nada de verdade.
 *
 *   node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/_probe-health-modelos.ts
 */
import { createSupabaseAdmin } from '../lib/supabase';
import { inspecionarModelosConfigurados } from '../lib/pipeline-health/coleta-modelos';
import { checarModelosConfigurados } from '../lib/pipeline-health/regras';

async function main() {
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('empresas').select('nome, sys_config');
  const cfgs = (data || []).map((e: any) => ({ nome: e.nome, sysConfig: e.sys_config }));
  console.log(`empresas lidas: ${cfgs.length}`);

  const obs = await inspecionarModelosConfigurados(cfgs);
  console.log(`modelos distintos configurados: ${obs.length}\n`);
  for (const o of obs.sort((a, b) => String(a.familia).localeCompare(String(b.familia)))) {
    const existe = o.existeNoProvedor === null ? `CEGO (${o.motivoCegueira})` : (o.existeNoProvedor ? 'existe' : '🔴 NÃO EXISTE');
    console.log(`  ${o.modelo.padEnd(28)} ${String(o.familia).padEnd(10)} ${existe.padEnd(18)} rota=${o.temRota ? 'ok' : '🔴'} preço=${o.temPreco ? 'ok' : '🔴'}  ← ${o.origens.slice(0, 2).join(', ')}`);
  }

  const achados = checarModelosConfigurados(obs);
  console.log(`\nachados: ${achados.length}`);
  for (const a of achados) console.log(`  [${a.severidade}] ${a.id} × ${a.contagem} — ${a.titulo}\n     ${a.amostra?.join(' | ')}`);
  if (!achados.length) console.log('  ✅ nenhum modelo configurado está morto, sem rota ou sem preço');

  // ── Contraprova ────────────────────────────────────────────────────────────
  // "0 achados" é também o que um check CEGO devolve. Sem esta parte, a rodada
  // limpa acima não distingue "olhou e está tudo bem" de "não olhou nada" — que
  // é o pior defeito possível num instrumento de alarme, e já mordeu aqui (o
  // `kimi-k3` deu falso positivo na primeira rodada por lookup errado).
  // Injeta o id REALMENTE morto do incidente, contra a rede de verdade.
  const adversarial = await inspecionarModelosConfigurados([
    ...cfgs,
    { nome: 'TENANT_SINTETICO', sysConfig: { ai: { modelos: { ia3_check: 'gpt-5.4' } } } },
  ]);
  const achadosAdv = checarModelosConfigurados(adversarial);
  const pegou = achadosAdv.some((a) => a.id === 'modelo-inexistente'
    && a.amostra?.some((s) => s.startsWith('gpt-5.4 ')));
  console.log(`\ncontraprova (injeta gpt-5.4, morto no provedor): ${pegou ? '✅ o check ACUSOU' : '🔴 o check NÃO acusou — está cego'}`);
  process.exit(pegou ? 0 : 1);
}

main();
