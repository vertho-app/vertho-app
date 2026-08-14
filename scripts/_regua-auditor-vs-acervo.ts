/* eslint-disable */
// Aplica o auditor ATUAL a uma amostra do acervo JÁ PUBLICADO e compara com a
// nota gravada. Não persiste nada.
//
// POR QUE (14/08): o piloto do DIR08 reprovou 2 de 3 e eu tratei isso como
// defeito do conteúdo, usando como baseline os 224 módulos publicados de
// ibipeba/projetomacae (2,4% de reprovação). A baseline era inválida: aqueles
// módulos foram auditados por `gpt-5.4`/`gpt-5.6-luna` em jun-jul, e em 22/07 o
// projeto moveu as checagens para `gpt-5.6-terra` (ia-cost-catalog.ts:679). O
// acervo NUNCA passou pela régua vigente. Re-auditar os mesmos 3 módulos só
// trocando o auditor já mudou 2 de 3 vereditos — então "o DIR08 é ruim" e "o
// Terra é mais duro que a régua com que o acervo foi construído" seguem
// indistinguíveis até medir o acervo bom sob o auditor novo.
//
// Uso: npx tsx scripts/_regua-auditor-vs-acervo.ts <slug> [--n=6] [--modelo=gpt-5.6-terra]
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { auditarModuloCore } from '@/lib/modulo-base-auditor';

const SLUG = process.argv[2] || 'ibipeba';
const N = Number((process.argv.find((a) => a.startsWith('--n='))?.slice(4)) || 6);
const MODELO = process.argv.find((a) => a.startsWith('--modelo='))?.slice(9) || undefined;

async function main() {
  const sb = createSupabaseAdmin();
  const { data: emp } = await sb.from('empresas').select('id').eq('slug', SLUG).single();
  if (!emp) throw new Error('empresa não encontrada: ' + SLUG);

  // `.order('id')` para a amostra ser a MESMA entre execuções — sem isso, duas
  // rodadas medem linhas diferentes e a comparação não significa nada.
  const { data: mbs, error } = await sb.from('modulos_base_conteudo')
    .select('id, descritor, nivel_entrada, nivel_destino, auditoria_ia, auditado_por_modelo')
    .eq('empresa_id', (emp as any).id).eq('status', 'publicado').order('id').limit(N);
  if (error) throw new Error(error.message);
  if (!mbs?.length) { console.log('nenhum módulo publicado'); return; }

  console.log(`${mbs.length} módulo(s) PUBLICADOS de ${SLUG}, auditados SEM gravar${MODELO ? ` (modelo ${MODELO})` : ' (auditor configurado)'}\n`);
  let concordam = 0, reprovadosAgora = 0, medidos = 0;
  for (const m of mbs as any[]) {
    const antes = { nota: m.auditoria_ia?.nota, veredito: m.auditoria_ia?.veredito, auditor: m.auditado_por_modelo };
    const r: any = await auditarModuloCore(sb, m.id, MODELO, false);
    if (r?.error || !r?.auditoria) { console.log(`  ⚠ ${String(m.descritor).slice(0, 30)}: ${r?.error || 'sem veredito'}`); continue; }
    medidos++;
    const d = { nota: r.auditoria.nota, veredito: r.auditoria.veredito };
    if (d.veredito === antes.veredito) concordam++;
    if (d.veredito === 'reprovado') reprovadosAgora++;
    const flag = d.veredito === antes.veredito ? ' ' : '≠';
    console.log(`${flag} ${m.nivel_entrada}→${m.nivel_destino} ${String(m.descritor).slice(0, 28).padEnd(30)} ${String(antes.nota).padStart(4)} ${String(antes.veredito).padEnd(22)}(${antes.auditor}) → ${String(d.nota).padStart(4)} ${d.veredito}`);
  }
  if (!medidos) { console.log('\n❌ nenhum módulo pôde ser auditado — nada a concluir.'); return; }
  console.log(`\n${concordam}/${medidos} mantêm o veredito · ${reprovadosAgora}/${medidos} REPROVADOS pela régua atual`);
  console.log(reprovadosAgora > medidos / 3
    ? '→ a régua atual reprova boa parte do acervo que está em produção: o desvio é do AUDITOR, não do DIR08.'
    : '→ a régua atual aprova o acervo publicado: o desvio do DIR08 é do CONTEÚDO.');
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
