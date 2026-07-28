/* eslint-disable */
// Regera as missões da semana 4 (aplicacao) do Ibipeba com a regra de 28/07:
// a missão cobre SÓ os descritores já entregues (semanas 1-3), não a competência
// inteira. Usa `montarSemanaAplicacao` — o MESMO código do build (reimplementar
// o prompt no script é a classe de bug "título ≠ blocos").
//
// Backup dos planos originais em backups/ ANTES de qualquer escrita (AGENTS.md).
//
// Uso: npx tsx scripts/_regerar-missoes-entregue.ts            # DRY-RUN (1 trilha, sem gravar)
//      npx tsx scripts/_regerar-missoes-entregue.ts --aplicar  # backup + rege ra as 37
process.loadEnvFile('.env.local');
import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { montarSemanaAplicacao } from '@/lib/season-engine/build-season';
import { PROGRAMA_REGULAR_DUO } from '@/lib/season-engine/programa-config';

const APLICAR = process.argv.includes('--aplicar');
const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe'; // Ibipeba
const SEMANA_MISSAO = 4;

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
const { data: trilhas, error } = await sb.from('trilhas')
  .select('id, colaborador_id, competencia_foco, competencias_foco, temporada_plano, descritores_selecionados, colaboradores!inner(cargo)')
  .eq('empresa_id', EMP);
if (error) { console.error('ERRO:', error.message); process.exit(1); }
console.log(`trilhas: ${trilhas.length}`);

const backup: any[] = [];
let regeneradas = 0, puladas = 0, falhas = 0;

for (const [i, t] of trilhas.entries()) {
  const plano: any[] = Array.isArray(t.temporada_plano?.semanas) ? t.temporada_plano.semanas : (Array.isArray(t.temporada_plano) ? t.temporada_plano : []);
  const idx = plano.findIndex((s: any) => s.semana === SEMANA_MISSAO && s.tipo === 'aplicacao');
  if (idx < 0) { console.log(`· ${t.id.slice(0, 8)} — sem semana ${SEMANA_MISSAO} aplicacao, pulando`); puladas++; continue; }

  const cargo = (t as any).colaboradores?.cargo;
  const comps = Array.isArray(t.competencias_foco) && t.competencias_foco.length > 1
    ? t.competencias_foco : [t.competencia_foco];

  try {
    const nova = await montarSemanaAplicacao(
      SEMANA_MISSAO, t.descritores_selecionados ?? [], t.competencia_foco,
      cargo, 'educacional', {}, PROGRAMA_REGULAR_DUO, comps,
    );

    const antes = plano[idx].descritores_cobertos ?? [];
    const depois = nova.descritores_cobertos ?? [];
    if (i === 0 || !APLICAR) {
      console.log(`\n· trilha ${t.id.slice(0, 8)} (${cargo})`);
      console.log(`  cobertos ANTES (${antes.length}):`, antes.slice(0, 14));
      console.log(`  cobertos DEPOIS (${depois.length}):`, depois);
      console.log(`  missão: ${(nova.missao?.texto ?? '').slice(0, 200)}`);
      if (!APLICAR) { console.log('\nDRY-RUN — rode com --aplicar para backup + gravar.'); process.exit(0); }
    }

    backup.push({ trilha_id: t.id, temporada_plano: t.temporada_plano });
    const planoNovo = [...plano];
    planoNovo[idx] = {
      ...plano[idx],
      competencias_cobertas: nova.competencias_cobertas,
      descritores_cobertos: nova.descritores_cobertos,
      missao: nova.missao,
      cenario: nova.cenario,
    };
    const novoPlano = Array.isArray(t.temporada_plano?.semanas)
      ? { ...t.temporada_plano, semanas: planoNovo } : planoNovo;
    const { error: upErr } = await sb.from('trilhas').update({ temporada_plano: novoPlano }).eq('id', t.id);
    if (upErr) throw new Error(upErr.message);
    regeneradas++;
    if ((i + 1) % 10 === 0) console.log(`  ... ${i + 1}/${trilhas.length}`);
  } catch (e: any) {
    falhas++;
    console.error(`✗ ${t.id.slice(0, 8)} (${cargo}): ${e?.message}`);
  }
}

if (APLICAR) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + 'Z';
  const path = `backups/trilhas-missao-entregue-${ts}.json`;
  writeFileSync(path, JSON.stringify({ quando: ts, semana: SEMANA_MISSAO, regra: 'missao cobre so o ja entregue (28/07)', planos_originais: backup }, null, 2));
  console.log(`\nBackup: ${path} (${backup.length} planos)`);
}
console.log(`\nregeneradas: ${regeneradas} | puladas: ${puladas} | falhas: ${falhas}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
