/* eslint-disable */
/**
 * READ-ONLY: os 2 briefs ungrounded do projetomacae têm módulo-base resolvível hoje?
 *
 * O achado `brief-ungrounded` do health estrutural diz que o kit nasceu sem matéria-prima
 * canônica. Reancorar o brief SEM regerar o conteúdo silenciaria o alarme e deixaria o
 * conteúdo genérico no lugar — teatro de conformidade. Então a pergunta certa é: existe MB
 * para regerar em cima? Se não existir, o item não é corrigível aqui (depende de extração
 * de manuscrito) e tem que ficar aberto com esse motivo.
 *
 * Uso: npx tsx --env-file=.env.local scripts/_probe-mb-macae-briefs.ts
 */
import { createSupabaseAdmin } from '@/lib/supabase';
import { resolverModuloBaseParaConteudo } from '@/lib/season-engine/modulo-base-integration';

const EMP_SLUG = 'projetomacae';

async function main() {
  const sb = createSupabaseAdmin();
  const { data: emp } = await sb.from('empresas').select('id').eq('slug', EMP_SLUG).maybeSingle();
  if (!emp) throw new Error('tenant não encontrado');

  const { data: briefs } = await sb.from('kit_briefs')
    .select('id, competencia, descritor, cargo, nivel_min, nivel_max, contexto')
    .eq('empresa_id', emp.id).is('modulo_base_id', null);

  for (const b of (briefs || [])) {
    const r: any = await resolverModuloBaseParaConteudo(sb, {
      competenciaNome: b.competencia, descritor: b.descritor, cargo: b.cargo,
      empresaId: emp.id, nivelMin: Number(b.nivel_min ?? 1),
    });
    const mb = r?.modulo;
    console.log(`${String(b.competencia).padEnd(22)} | ${String(b.descritor).padEnd(20)} | ${b.cargo} | N${b.nivel_min}-${b.nivel_max}`);
    console.log(mb
      ? `   → ${String(mb.descritor).slice(0, 34).padEnd(34)} [${String(mb.id).slice(0, 8)}] ${r.criterio}`
      : '   → NENHUM MB resolvível (depende de extração de manuscrito)');
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
