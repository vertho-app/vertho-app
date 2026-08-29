// Rodada 2 do diagnóstico: corrige colunas e refina duplicatas por status.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 1. F-C5 refinado: duplicatas SÓ entre células vivas (status <> 'error') — o índice é parcial
const r = await sb.from('videos_gerados').select('modulo_base_id, empresa_id, cargo, disc_dominante, status');
const porStatusVg = {};
for (const v of r.data ?? []) porStatusVg[v.status] = (porStatusVg[v.status] ?? 0) + 1;
console.log('videos_gerados por status:', porStatusVg);
const vivas = (r.data ?? []).filter((v) => v.status !== 'error');
const cells = new Map();
for (const v of vivas) {
  const k = [v.modulo_base_id, v.empresa_id, v.cargo, v.disc_dominante].join('|');
  cells.set(k, (cells.get(k) ?? 0) + 1);
}
const dupsVivas = [...cells.entries()].filter(([, n]) => n > 1);
console.log('F-C5 · células VIVAS: %d | duplicadas vivas: %d', cells.size, dupsVivas.length);
for (const [k, n] of dupsVivas.slice(0, 6)) console.log('  dup x%d: %s', n, k);

// 2. pipeline_health_runs com a coluna certa
const h = await sb.from('pipeline_health_runs').select('modo, criado_em, severidade, data_alvo').order('criado_em', { ascending: false }).limit(15);
console.log('\npipeline_health_runs (15 mais recentes):');
if (h.error) console.log('  ERRO:', h.error.message);
for (const row of h.data ?? []) console.log(' ', row.criado_em, row.modo, row.severidade, 'alvo:', row.data_alvo);

// 3. kit_briefs com erro visível
const k = await sb.from('kit_briefs').select('*').limit(3);
console.log('\nkit_briefs amostra:');
if (k.error) console.log('  ERRO:', k.error.message);
else console.log('  colunas:', Object.keys(k.data?.[0] ?? {}).join(', '), '| linhas amostra:', k.data?.length);

// 4. cron_execucoes: a tabela existe? quantas linhas no total?
const c = await sb.from('cron_execucoes').select('*', { count: 'exact', head: true });
console.log('\ncron_execucoes: total de linhas =', c.count, c.error ? `ERRO: ${c.error.message}` : '');

// 5. Duplicatas de micro_conteudos com empresa preenchida vs demo (contexto do F-C6)
const m = await sb.from('micro_conteudos').select('competencia, descritor, formato, cargo, empresa_id, kit_id');
const mk = new Map();
for (const b of m.data ?? []) {
  const key = [b.competencia, b.descritor, b.formato, b.cargo, b.empresa_id, b.kit_id].join('|');
  mk.set(key, (mk.get(key) ?? 0) + 1);
}
const porEmpresa = {};
for (const [key, n] of mk) if (n > 1) { const emp = key.split('|')[4] || '(global)'; porEmpresa[emp] = (porEmpresa[emp] ?? 0) + 1; }
console.log('\nF-C6 · grupos duplicados por empresa_id:', porEmpresa);
