/**
 * Refaz a redação final dos fechamentos em que ela falhou ou não coube no prazo
 * (19/09/2026).
 *
 * POR QUE ELE EXISTE
 * ──────────────────
 * Quando a nota muda depois do scorer e a redação final não sai (duas tentativas
 * falharam ou o prazo acabou), a pessoa recebe a DEVOLUTIVA MÍNIMA: montada das
 * notas finais, coerente, mas curta. Este script produz a devolutiva completa
 * pelas mesmas regras do fechamento (`redigirDevolutivaFinal`) e troca o texto.
 * A lista sai da degradação `fechamento-redacao-falhou` ou do próprio slot
 * (`feedback.redacao_final.status`).
 *
 * O QUE ELE NÃO FAZ
 * ─────────────────
 * Não pontua de novo e não regera o relatório pelo núcleo (dispararia o
 * encadeamento da jornada): troca só o `resumo_avaliacao` do slot e do relatório.
 * A auditoria gravada continua sendo a da devolutiva mínima.
 *
 * USO
 *   npx tsx scripts/refazer-redacao-fechamento.ts --empresa=<empresa_id> [--trilha=<trilha_id>] [--aplicar]
 *
 *   sem --trilha   lista e processa os fechamentos da empresa com redação falhou/pulada-sem-tempo
 *   sem --aplicar  só mostra o texto que sairia (a chamada da IA acontece e custa ~US$ 0,03)
 */
process.loadEnvFile('.env.local');
import { tenantDb } from '@/lib/tenant-db';
import { refazerRedacaoFechamento } from '@/lib/season-engine/fechamento-core';

const args = process.argv.slice(2);
const arg = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const empresaId = arg('empresa');
const trilhaPedida = arg('trilha');
const aplicar = args.includes('--aplicar');

async function pendentes(empresa: string): Promise<string[]> {
  const { data, error } = await tenantDb(empresa).from('temporada_semana_progresso')
    .select('trilha_id')
    .in('feedback->redacao_final->>status', ['falhou', 'pulada-sem-tempo']);
  if (error) throw new Error(`falha ao listar os fechamentos pendentes: ${error.message}`);
  return (data || []).map((r: any) => r.trilha_id);
}

async function main() {
  if (!empresaId) {
    console.error('uso: npx tsx scripts/refazer-redacao-fechamento.ts --empresa=<empresa_id> [--trilha=<trilha_id>] [--aplicar]');
    process.exit(1);
  }
  const alvos = trilhaPedida ? [trilhaPedida] : await pendentes(empresaId);
  console.log(`${alvos.length} fechamento(s) ${trilhaPedida ? 'pedido(s)' : 'com redação pendente'}; ${aplicar ? 'GRAVANDO' : 'só prévia, nada é gravado'}`);

  let falhas = 0;
  for (const trilhaId of alvos) {
    const r = await refazerRedacaoFechamento(trilhaId, { empresaId, aplicar });
    // `in`, não `!r.ok`: com `strict: false` a união por booleano não estreita.
    if ('erro' in r) {
      // "nada a refazer" é informação (a redação já saiu), não falha do script.
      if (!r.erro.startsWith('nada a refazer')) falhas++;
      console.log(`- ${trilhaId}: ${r.erro}`);
      continue;
    }
    console.log(`- ${trilhaId}: redação ${r.status}${r.aplicado ? ', gravada no slot e no relatório' : ''}`);
    for (const w of r.warnings) console.log(`    aviso: ${w}`);
    if (r.resumo) console.log(JSON.stringify(r.resumo, null, 2));
  }
  if (aplicar) console.log('Obs.: a degradação fechamento-redacao-falhou fica no histórico; a auditoria gravada é a da devolutiva mínima.');
  if (falhas) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
