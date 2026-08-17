/* eslint-disable */
// O que CADA pessoa vai receber amanhã: formato anunciado × formatos entregáveis.
//
// Usa a coleta do próprio pré-voo (mesmo código da entrega, regra de ouro do
// health) e imprime a DISTRIBUIÇÃO — o preflight só mostra o que virou achado, e
// "está ok" não diz qual formato foi prometido a quem.
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { coletarEntregasPrevistas } from '@/lib/pipeline-health/coleta';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const SLUG = arg('empresa') || 'macae';
const DATA = new Date((arg('data') || new Date(Date.now() + 24 * 3600_000).toISOString().slice(0, 10)) + 'T12:00:00Z');

async function main() {
  const sb = createSupabaseAdmin();
  const { data: emp } = await sb.from('empresas').select('id, nome').eq('slug', SLUG).maybeSingle();
  if (!emp) throw new Error(`empresa ${SLUG} não encontrada`);

  const { entregas, pilulaAlvo } = await coletarEntregasPrevistas(sb, (emp as any).id, DATA);
  console.log(`${(emp as any).nome} · alvo ${DATA.toISOString().slice(0, 10)} · pílula ${pilulaAlvo ?? '-'} · ${entregas.length} pessoa(s)\n`);

  const porAnunciado = new Map<string, number>();
  const porConjunto = new Map<string, number>();
  let semKit = 0, placeholder = 0;
  for (const e of entregas) {
    porAnunciado.set(e.formatoAnunciado, (porAnunciado.get(e.formatoAnunciado) || 0) + 1);
    const k = [...e.formatosDisponiveis].sort().join('+') || '(nenhum)';
    porConjunto.set(k, (porConjunto.get(k) || 0) + 1);
    if (!e.temKit) semKit++;
    if (e.desafioPlaceholder) placeholder++;
  }

  console.log('formato ANUNCIADO (o que a mensagem promete):');
  for (const [f, n] of [...porAnunciado].sort((a, b) => b[1] - a[1])) console.log(`  ${f}: ${n}`);

  console.log('\nformatos ENTREGÁVEIS (o que a semana tem):');
  for (const [c, n] of [...porConjunto].sort((a, b) => b[1] - a[1])) console.log(`  ${c}: ${n}`);

  console.log(`\nsem kit: ${semKit} · desafio placeholder: ${placeholder}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
