/**
 * Captura a estrutura do tenant `acme` (fonte de verdade do demo) num FIXTURE
 * congelado: lib/demo/acme-demo-fixture.json. O reset do ACME Demo semeia a
 * partir desse JSON (não do acme VIVO) → a demo fica imune a mexidas no acme.
 *
 * Rode este script quando quiser ATUALIZAR o golden state do demo:
 *   node scripts/capture-acme-fixture.mjs
 *
 * Guarda os `id` de origem (competências/cenários) para o remapeamento no reset.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';

const SOURCE_SLUG = 'acme';
const OUT = 'lib/demo/acme-demo-fixture.json';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const must = async (label, p) => { const r = await p; if (r.error) throw new Error(`${label}: ${r.error.message}`); return r.data; };

async function main() {
  const empresa = await must('empresa',
    sb.from('empresas').select('segmento, sys_config, ui_config, default_locale').eq('slug', SOURCE_SLUG).single());
  const source = await must('empresa id', sb.from('empresas').select('id').eq('slug', SOURCE_SLUG).single());
  const sid = source.id;

  const competencias = await must('competencias', sb.from('competencias').select('*').eq('empresa_id', sid).order('cargo').order('cod_comp'));
  const cargos = await must('cargos', sb.from('cargos_empresa').select('*').eq('empresa_id', sid).order('nome'));
  const top10 = await must('top10', sb.from('top10_cargos').select('*').eq('empresa_id', sid).order('cargo').order('posicao'));
  const cenarios = await must('cenarios', sb.from('banco_cenarios').select('*').eq('empresa_id', sid).order('created_at'));

  const fixture = {
    _meta: { source: SOURCE_SLUG, capturedAt: new Date().toISOString(), note: 'Golden state congelado do ACME Demo. Regenerar com scripts/capture-acme-fixture.mjs.' },
    empresa,
    competencias: competencias || [],
    cargos: cargos || [],
    top10: top10 || [],
    cenarios: cenarios || [],
  };
  writeFileSync(OUT, JSON.stringify(fixture, null, 2) + '\n');
  console.log(`Fixture salvo em ${OUT}`);
  console.log(`  competencias=${fixture.competencias.length} cargos=${fixture.cargos.length} top10=${fixture.top10.length} cenarios=${fixture.cenarios.length}`);
}

main().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
