/**
 * Avisa quem tem RELATÓRIO PRONTO e nunca soube disso.
 *
 * POR QUE UM SCRIPT, E NÃO UM GATILHO NA GERAÇÃO
 * ──────────────────────────────────────────────
 * O relatório individual é gerado em LOTE — dezenas seguidas, no mesmo minuto.
 * Disparar uma mensagem por relatório gerado seria uma rajada no mesmo número
 * que a Meta restringiu em 11/08/2026 (155 mensagens a 2s derrubaram o canal em
 * 1min47). Aqui o envio é deliberado, com teto por execução e espaçamento entre
 * mensagens.
 *
 * O QUE ELE CORRIGE: medido em 15/08/2026, ~120 pessoas responderam a avaliação
 * e nunca receberam aviso de que o resultado saiu — o template `resultado_perfil`
 * está APROVADO desde sempre e não tinha consumidor nenhum.
 *
 * USO
 *   npx tsx scripts/_avisar-perfil-pronto.ts --empresa=<slug>              # dry-run
 *   npx tsx scripts/_avisar-perfil-pronto.ts --empresa=<slug> --limite=10 --executar
 *
 * ⚠️ COMEÇAR PEQUENO. Depois da primeira leva, conferir o `quality_rating` do
 * número (a R12 do health lê isso) antes de aumentar. Uma leva grande que gera
 * bloqueios não se desfaz.
 */
process.loadEnvFile('.env.local');

import { createSupabaseAdmin } from '../lib/supabase';
import { enviarPorTemplate } from '../lib/notifications/pilula-template';
import { tenantUrl } from '../lib/domain';

const args = process.argv.slice(2);
const executar = args.includes('--executar');
const slug = args.find((a) => a.startsWith('--empresa='))?.split('=')[1];
/** Teto conservador de propósito: leva pequena, medir, então repetir. */
const limite = Number(args.find((a) => a.startsWith('--limite='))?.split('=')[1]) || 10;
/** Espaçamento entre mensagens. A cadência do canal é política, não detalhe. */
const INTERVALO_MS = 6_000;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!slug) throw new Error('--empresa=<slug> é obrigatório (envio em massa não roda sem alvo explícito)');
  if (!process.env.WHATSAPP_TEMPLATE_PERFIL) {
    throw new Error('WHATSAPP_TEMPLATE_PERFIL não configurada — sem template aprovado, a Meta recusa com 132001');
  }

  const sb = createSupabaseAdmin();

  const { data: empresa, error: eE } = await sb.from('empresas')
    .select('id, slug, nome').eq('slug', slug).maybeSingle();
  if (eE) throw new Error(`empresas: ${eE.message}`);
  if (!empresa) throw new Error(`empresa ${slug} não encontrada`);

  // Quem tem relatório individual pronto.
  const { data: relatorios, error: eR } = await sb.from('relatorios')
    .select('colaborador_id')
    .eq('empresa_id', empresa.id)
    .eq('tipo', 'individual')
    .not('colaborador_id', 'is', null);
  if (eR) throw new Error(`relatorios: ${eR.message}`);

  const comRelatorio = [...new Set((relatorios || []).map((r: any) => r.colaborador_id))];
  if (!comRelatorio.length) {
    console.log(`${empresa.nome}: ninguém com relatório individual.`);
    return;
  }

  // Quem JÁ recebeu este aviso — a idempotência do reenvio. Sem isto, rodar o
  // script duas vezes manda a mesma mensagem duas vezes, e num canal de trabalho
  // isso é pior que não mandar.
  const { data: jaAvisados } = await sb.from('notification_deliveries')
    .select('colaborador_id')
    .eq('empresa_id', empresa.id)
    .eq('kind', 'perfil')
    .eq('status', 'sucesso');
  const avisados = new Set((jaAvisados || []).map((d: any) => d.colaborador_id));

  const { data: colabs, error: eC } = await sb.from('colaboradores')
    .select('id, nome_completo, whatsapp, telefone')
    .eq('empresa_id', empresa.id)
    .in('id', comRelatorio);
  if (eC) throw new Error(`colaboradores: ${eC.message}`);

  const alvos = (colabs || [])
    .filter((c: any) => !avisados.has(c.id))
    .filter((c: any) => c.whatsapp || c.telefone)
    .slice(0, limite);

  const semTelefone = (colabs || []).filter((c: any) => !c.whatsapp && !c.telefone).length;

  console.log(`${empresa.nome}: ${comRelatorio.length} com relatório · ${avisados.size} já avisados · ${semTelefone} sem telefone`);
  console.log(`→ enviando para ${alvos.length} (teto ${limite})${executar ? '' : ' — DRY-RUN'}\n`);

  const baseUrl = tenantUrl(empresa.slug);
  let ok = 0, falha = 0;

  for (const c of alvos as any[]) {
    const telefone = c.whatsapp || c.telefone;
    if (!executar) {
      console.log(`  [dry] ${c.nome_completo} · ${String(telefone).slice(0, 6)}…`);
      continue;
    }

    const r = await enviarPorTemplate('perfil', {
      telefone, nome: (c.nome_completo || 'Colaborador').split(' ')[0],
      semana: 1, tema: '', slug: empresa.slug, baseUrl,
      formato: null, pilula: null,
      empresaId: empresa.id, colaboradorId: c.id,
      dedupeKey: `perfil-pronto:${c.id}`,
    });

    if (r.ok) { ok++; console.log(`  ✓ ${c.nome_completo}`); }
    else { falha++; console.error(`  ✗ ${c.nome_completo}: ${r.reason}`); }

    await dormir(INTERVALO_MS);
  }

  if (executar) {
    console.log(`\n${ok} enviadas, ${falha} falhas.`);
    console.log('⚠️ Antes da próxima leva: conferir o quality_rating do número (health R12).');
  }
}

main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
