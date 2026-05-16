/**
 * Exporta as ref tables pequenas do Supabase → out/ref/*.json.
 * São a camada PROPRIETÁRIA (curadoria Vertho), não dado bruto —
 * não mudam por run, o pipeline BR lê localmente. Rode quando a
 * curadoria (allowlist/denylist/tetos) mudar.
 *
 * npx tsx data-pipeline/radarempresas/br/19_dump_ref.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = readFileSync('.env.local', 'utf8').split('\n').filter((l) => l && !l.startsWith('#'))
  .reduce((a: any, l) => { const i = l.indexOf('='); if (i > 0) a[l.slice(0, i).trim()] = l.slice(i + 1).trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const OUT = process.env.OUT_DIR || 'data-pipeline/radarempresas/br/out';

async function main() {
  mkdirSync(`${OUT}/ref`, { recursive: true });
  const { data: mapa } = await sb.from('radarempresas_cnae_segmento')
    .select('cnae_prefixo, prefixo_len, segmento_key, people_intensity_score, leadership_complexity_score, onboarding_need_score, standardization_need_score, commercial_fit_score, is_priority');
  const { data: deny } = await sb.from('radarempresas_cnae_denylist').select('cnae_prefixo, prefixo_len');
  const { data: teto } = await sb.from('radarempresas_segmentos')
    .select('key, classificacao_teto').not('classificacao_teto', 'is', null);
  writeFileSync(`${OUT}/ref/cnae_segmento.json`, JSON.stringify(mapa || []));
  writeFileSync(`${OUT}/ref/cnae_denylist.json`, JSON.stringify(deny || []));
  writeFileSync(`${OUT}/ref/segmentos_teto.json`, JSON.stringify(teto || []));
  console.log(`ref: cnae_segmento=${mapa?.length} denylist=${deny?.length} tetos=${teto?.length} → ${OUT}/ref`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
