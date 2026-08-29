/* eslint-disable */
// Exporta as linhas que a consolidação (F-C5) vai apagar, ANTES de apagar.
//
// O backup vai para FORA do repositório (o repo é público e isto é dado de tenant).
// Não é burocracia: `videos_personalizados.cell_video_id` é ON DELETE CASCADE, então
// apagar uma célula leva junto os personalizados dela. A análise diz que todos os
// 130 são redundantes (a pessoa tem 'done' na vencedora) — o backup é o que permite
// provar isso depois, ou desfazer se a análise estiver errada.
//
// Uso:  npx tsx scripts/_backup-celulas-duplicadas.ts <arquivo.json>
process.loadEnvFile('.env.local');
import { writeFileSync } from 'fs';
import { createSupabaseAdmin } from '@/lib/supabase';

const DESTINO = process.argv[2];
if (!DESTINO) throw new Error('informe o caminho do arquivo de backup');

async function main() {
  const sb = createSupabaseAdmin();

  const { data: todas, error } = await sb.from('videos_gerados')
    .select('*').neq('status', 'error');
  if (error) throw new Error(`leitura de células: ${error.message}`);

  // Mesma eleição da entrega: `resolverCelulaVideo` serve a MAIS RECENTE não-error.
  // Eleger por outro critério aqui apagaria a que a pessoa está vendo.
  const porCelula = new Map<string, any[]>();
  for (const v of (todas as any[])) {
    const k = `${v.modulo_base_id}|${v.empresa_id}|${v.cargo}|${v.disc_dominante}`;
    if (!porCelula.has(k)) porCelula.set(k, []);
    porCelula.get(k)!.push(v);
  }
  const perdedoras: any[] = [];
  const vencedoras: any[] = [];
  for (const grupo of porCelula.values()) {
    grupo.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    vencedoras.push(grupo[0]);
    perdedoras.push(...grupo.slice(1));
  }

  const ids = perdedoras.map((p) => p.id);
  let persos: any[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error: e2 } = await sb.from('videos_personalizados').select('*').in('cell_video_id', ids.slice(i, i + 100));
    if (e2) throw new Error(`leitura de personalizados: ${e2.message}`);
    persos.push(...(data || []));
  }

  const dump = {
    gerado_em: new Date().toISOString(),
    motivo: 'consolidacao F-C5 (celulas de video duplicadas)',
    criterio_eleicao: 'vencedora = mais recente com status <> error (idêntico a resolverCelulaVideo)',
    totais: { celulas_logicas: porCelula.size, vencedoras: vencedoras.length, perdedoras: perdedoras.length, personalizados_nas_perdedoras: persos.length },
    perdedoras,
    personalizados_das_perdedoras: persos,
  };
  writeFileSync(DESTINO, JSON.stringify(dump, null, 2), 'utf8');
  console.log(`backup escrito: ${DESTINO}`);
  console.log(`  células lógicas: ${porCelula.size} · vencedoras: ${vencedoras.length} · perdedoras: ${perdedoras.length}`);
  console.log(`  personalizados nas perdedoras: ${persos.length}`);
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
