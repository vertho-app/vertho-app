/* eslint-disable */
// Prova que o UNIQUE parcial de `videos_gerados` (mig 188) faz o que promete.
//
// Constraint que ninguém tentou violar é constraint decorativa: um WHERE errado na
// definição, ou uma coluna nullable esquecida, e ela deixa passar exatamente o caso
// que deveria barrar. Este script tenta os DOIS lados contra o banco real:
//   · duas células VIVAS da mesma tupla → tem que falhar
//   · uma célula em 'error' na mesma tupla → tem que ser aceita (senão o re-disparo
//     após falha, que é como a recuperação funciona hoje, ficaria impossível)
// Limpa tudo que criar.
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';

async function main() {
  const sb = createSupabaseAdmin();
  const { data: alvo } = await sb.from('videos_gerados')
    .select('modulo_base_id, empresa_id, cargo, disc_dominante').eq('status', 'done').limit(1).maybeSingle();
  if (!alvo) throw new Error('nenhuma célula done para testar');
  const tupla = alvo as any;
  const criados: string[] = [];
  let ok = 0, falhas = 0;

  // 1) duplicata VIVA → deve ser barrada
  const { data: dup, error: errDup } = await sb.from('videos_gerados')
    .insert({ ...tupla, status: 'processing' }).select('id').maybeSingle();
  if (errDup && /duplicate key|unique/i.test(errDup.message)) {
    ok++; console.log('✅ duplicata viva BARRADA pelo UNIQUE');
  } else if (dup) {
    falhas++; criados.push((dup as any).id);
    console.log('❌ FALHA: duplicata viva foi ACEITA — a constraint não protege');
  } else {
    falhas++; console.log(`❌ erro inesperado: ${errDup?.message}`);
  }

  // 2) linha em 'error' na mesma tupla → deve ser aceita
  const { data: err, error: errErr } = await sb.from('videos_gerados')
    .insert({ ...tupla, status: 'error', error: 'teste de constraint' }).select('id').maybeSingle();
  if (err) {
    ok++; criados.push((err as any).id);
    console.log('✅ linha em error na mesma célula ACEITA (re-disparo após falha segue possível)');
  } else {
    falhas++; console.log(`❌ FALHA: error na mesma célula foi barrado — quebraria a recuperação (${errErr?.message})`);
  }

  for (const id of criados) await sb.from('videos_gerados').delete().eq('id', id);
  console.log(`\nlimpeza: ${criados.length} linha(s) de teste removida(s)`);
  console.log(`${ok} ok · ${falhas} falha(s)`);
  if (falhas) process.exit(1);
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
