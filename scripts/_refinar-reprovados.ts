/* eslint-disable */
// Refina os módulos-base REPROVADOS de uma empresa, um a um, e reporta a nota
// antes/depois. Headless — o loop roda aqui, não numa aba do admin.
//
// POR QUE (14/08): `aprovarPublicar` RECUSA veredito reprovado, e só `publicado`
// é visível para o resolver da trilha. Então módulo reprovado não é "nota
// baixa": é trabalho parado. O refino consome o feedback específico da auditora
// — muito mais dirigido que tentar antecipar as regras no prompt do autor, que
// foi o caminho que me custou duas correções de rota hoje — e `refinarModuloCore`
// já tem guarda anti-regressão: se a nota cair, reverte para o snapshot.
//
// Uso: npx tsx scripts/_refinar-reprovados.ts <slug> [--max=N] [--aplicar]
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { refinarModuloCore } from '@/lib/modulo-base-refino';

const SLUG = process.argv[2] || 'macae';
const MAX = Number((process.argv.find((a) => a.startsWith('--max='))?.slice(6)) || 50);
const APLICAR = process.argv.includes('--aplicar');

async function main() {
  const sb = createSupabaseAdmin();
  const { data: emp } = await sb.from('empresas').select('id').eq('slug', SLUG).single();
  if (!emp) throw new Error('empresa não encontrada: ' + SLUG);

  const { data: mbs, error } = await sb.from('modulos_base_conteudo')
    .select('id, descritor, nivel_entrada, nivel_destino, auditoria_ia')
    .eq('empresa_id', (emp as any).id)
    .eq('auditoria_ia->>veredito', 'reprovado')
    .order('id').limit(MAX);
  if (error) throw new Error(error.message);
  if (!mbs?.length) { console.log('nenhum módulo reprovado.'); return; }

  console.log(`${mbs.length} reprovado(s)${APLICAR ? '' : ' (dry-run)'}:`);
  for (const m of mbs as any[]) {
    console.log(`  ${m.nivel_entrada}→${m.nivel_destino}  ${String(m.descritor).slice(0, 34).padEnd(36)} nota ${m.auditoria_ia?.nota}`);
  }
  if (!APLICAR) { console.log('\n(rode com --aplicar)'); return; }

  let melhorou = 0, igual = 0, falhou = 0;
  for (const [i, m] of (mbs as any[]).entries()) {
    const antes = Number(m.auditoria_ia?.nota);
    const r: any = await refinarModuloCore(sb, m.id);
    if (r?.error) { falhou++; console.log(`  [${i + 1}/${mbs.length}] ❌ ${r.error}`); continue; }
    // A auditoria pós-refino é quem decide; `refinarModuloCore` reverte sozinho
    // se piorar, então a nota lida aqui já é a que ficou gravada.
    const { data: pos } = await sb.from('modulos_base_conteudo')
      .select('auditoria_ia').eq('id', m.id).maybeSingle();
    const depois = Number((pos as any)?.auditoria_ia?.nota);
    const veredito = (pos as any)?.auditoria_ia?.veredito;
    if (depois > antes) melhorou++; else igual++;
    console.log(`  [${i + 1}/${mbs.length}] ${m.nivel_entrada}→${m.nivel_destino} ${String(m.descritor).slice(0, 28).padEnd(30)} ${antes} → ${depois} ${veredito}`);
  }
  console.log(`\n${melhorou} melhoraram · ${igual} sem ganho · ${falhou} falharam`);

  const { count } = await sb.from('modulos_base_conteudo')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', (emp as any).id).eq('auditoria_ia->>veredito', 'reprovado');
  console.log(`restam ${count ?? '?'} reprovado(s) — só os NÃO reprovados podem ser publicados.`);
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
