/* eslint-disable */
// Re-audita os MESMOS módulos-base com um auditor diferente e mostra o
// veredito lado a lado.
//
// POR QUE (medido 14/08): o piloto do DIR08 reprovou 2 de 3, contra 2,4% de
// reprovação no acervo existente (212 módulos). A comparação, porém, era entre
// RÉGUAS DIFERENTES: os 212 foram auditados por `gpt-5.4`, e o DIR08 é o
// primeiro a passar por `gpt-5.6-terra` (`gpt-5.6-luna`, do mesmo 5.6, reprovou
// 0 de 18). Sem re-auditar o mesmo conteúdo com o auditor antigo, "o conteúdo
// piorou" e "o auditor endureceu" são indistinguíveis — e a diferença decide se
// o conserto é no prompt do autor ou na escolha do auditor.
//
// A auditoria é DESTRUTIVA (sobrescreve `auditoria_ia`), então o veredito
// anterior é impresso antes e devolvido no resumo.
//
// Uso: npx tsx scripts/_comparar-auditor-mb.ts <slug> <modelo> [--desde=Nmin] [--aplicar]
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { auditarModulosCore } from '@/lib/modulo-base-auditor';

const SLUG = process.argv[2] || 'macae';
const MODELO = process.argv[3];
const MIN = Number((process.argv.find((a) => a.startsWith('--desde='))?.slice(8)) || 60);
const APLICAR = process.argv.includes('--aplicar');

async function main() {
  if (!MODELO) throw new Error('informe o modelo do auditor (ex.: gpt-5.4)');
  const sb = createSupabaseAdmin();
  const { data: emp } = await sb.from('empresas').select('id').eq('slug', SLUG).single();
  if (!emp) throw new Error('empresa não encontrada: ' + SLUG);

  const desde = new Date(Date.now() - MIN * 60_000).toISOString();
  const { data: mbs, error } = await sb.from('modulos_base_conteudo')
    .select('id, descritor, nivel_entrada, nivel_destino, auditoria_ia, auditado_por_modelo')
    .eq('empresa_id', (emp as any).id).gte('created_at', desde).order('nivel_entrada');
  if (error) throw new Error(error.message);
  if (!mbs?.length) { console.log('nenhum módulo no período'); return; }

  const antes = new Map<string, { nota: any; veredito: any; auditor: any }>();
  console.log(`${mbs.length} módulo(s) — veredito ATUAL:`);
  for (const m of mbs as any[]) {
    const a = { nota: m.auditoria_ia?.nota, veredito: m.auditoria_ia?.veredito, auditor: m.auditado_por_modelo };
    antes.set(m.id, a);
    console.log(`  ${m.nivel_entrada}→${m.nivel_destino}  ${String(a.nota).padStart(4)} ${String(a.veredito).padEnd(24)} (${a.auditor})`);
  }
  if (!APLICAR) { console.log(`\n(dry-run — rode com --aplicar para re-auditar com ${MODELO})`); return; }

  console.log(`\nre-auditando com ${MODELO}…`);
  const r = await auditarModulosCore(sb, (mbs as any[]).map((m) => m.id), { modelo: MODELO, promoverParaRevisao: false });
  console.log(`${r.ok} auditado(s)${r.falhas?.length ? `, falhas: ${r.falhas.join(' | ')}` : ''}`);
  // Sem isto o resumo abaixo compara o veredito com ele mesmo e imprime
  // "0 mudaram" — que se lê como "o auditor concorda", quando na verdade
  // NENHUMA auditoria rodou (foi o que aconteceu com `gpt-5.4`, sem acesso no
  // projeto). Comparação que não distingue "igual" de "não mediu" é pior que
  // não medir.
  if (!r.ok) {
    console.log(`\n❌ NADA foi re-auditado com ${MODELO} — os vereditos abaixo são os ANTIGOS. Nenhuma conclusão possível.`);
    return;
  }

  const { data: depois } = await sb.from('modulos_base_conteudo')
    .select('id, nivel_entrada, nivel_destino, auditoria_ia, auditado_por_modelo')
    .in('id', (mbs as any[]).map((m) => m.id)).order('nivel_entrada');

  console.log(`\ntransição      antes (${antes.values().next().value?.auditor})        depois (${MODELO})`);
  let mudou = 0;
  for (const m of (depois || []) as any[]) {
    const a = antes.get(m.id)!;
    const d = { nota: m.auditoria_ia?.nota, veredito: m.auditoria_ia?.veredito };
    if (a.veredito !== d.veredito) mudou++;
    console.log(`  ${m.nivel_entrada}→${m.nivel_destino}   ${String(a.nota).padStart(4)} ${String(a.veredito).padEnd(22)} → ${String(d.nota).padStart(4)} ${d.veredito}`);
  }
  console.log(`\n${mudou}/${(depois || []).length} mudaram de veredito ao trocar SÓ o auditor.`);
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
