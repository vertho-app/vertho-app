#!/usr/bin/env node
/**
 * Recalcula total_estado e total_brasil em diag_ica_snapshots a partir
 * dos próprios dados (média simples por uf×ano×rede e ano×rede).
 *
 * Por que: o XLSX/CSV oficial do ICA nem sempre traz colunas de benchmark
 * (TX_ALFABETIZACAO_UF / TX_ALFABETIZACAO_BR). Quando vier null, este script
 * popula os campos a partir das próprias taxas municipais já carregadas.
 *
 * Uso:
 *   node scripts/recompute-ica-benchmarks.mjs
 *
 * Rode após cada nova ingestão de ICA via /admin/radar.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env.local');
  process.exit(1);
}
const sb = createClient(URL, KEY);

async function main() {
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from('diag_ica_snapshots')
      .select('uf, ano, rede, taxa')
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    all = all.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(`Carregado: ${all.length} snapshots`);

  const media = (rows) => {
    const v = rows.map((r) => Number(r.taxa)).filter((t) => Number.isFinite(t) && t > 0);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };
  const byUF = new Map();
  const byBR = new Map();
  for (const r of all) {
    const kU = `${r.uf}|${r.ano}|${r.rede}`;
    const kB = `${r.ano}|${r.rede}`;
    (byUF.get(kU) ?? byUF.set(kU, []).get(kU)).push(r);
    (byBR.get(kB) ?? byBR.set(kB, []).get(kB)).push(r);
  }
  const benchUF = new Map([...byUF].map(([k, rows]) => [k, media(rows)]));
  const benchBR = new Map([...byBR].map(([k, rows]) => [k, media(rows)]));

  let atualizados = 0;
  let erros = 0;
  for (const [kU, vU] of benchUF) {
    if (vU == null) continue;
    const [uf, ano, rede] = kU.split('|');
    const vBR = benchBR.get(`${ano}|${rede}`);
    const { error } = await sb
      .from('diag_ica_snapshots')
      .update({
        total_estado: Number(vU.toFixed(2)),
        total_brasil: vBR != null ? Number(vBR.toFixed(2)) : null,
      })
      .eq('uf', uf)
      .eq('ano', Number(ano))
      .eq('rede', rede);
    if (error) {
      erros++;
      console.warn(`[erro] ${kU}: ${error.message}`);
    } else {
      atualizados++;
    }
  }
  console.log(`Concluído. ${atualizados} grupos atualizados${erros ? ` · ${erros} erros` : ''}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
