/* eslint-disable */
// Regera as missões de aplicação (semanas 4/8/12) do Ibipeba com a regra de 28/07:
// a missão cobre o BLOCO QUE ACABOU DE FECHAR (sem 4 → semanas 1-3; sem 8 →
// semanas 5-7) e só a última é cumulativa (sem 12 → as 9 semanas de conteúdo).
// Usa `montarSemanaAplicacao` — o MESMO código do build (reimplementar o prompt
// no script é a classe de bug "título ≠ blocos").
//
// Backup dos planos originais em backups/ ANTES de qualquer escrita (AGENTS.md).
//
// Uso: npx tsx scripts/_regerar-missoes-entregue.ts                       # DRY-RUN (1 trilha, sem gravar)
//      npx tsx scripts/_regerar-missoes-entregue.ts --aplicar             # backup + regera as 37 (sem 4)
//      npx tsx scripts/_regerar-missoes-entregue.ts --semanas=8,12 --aplicar
process.loadEnvFile('.env.local');
import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { montarSemanaAplicacao } from '@/lib/season-engine/build-season';
import { PROGRAMA_REGULAR_DUO } from '@/lib/season-engine/programa-config';

const APLICAR = process.argv.includes('--aplicar');
const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe'; // Ibipeba
const SEMANAS_MISSAO = (process.argv.find((a) => a.startsWith('--semanas='))?.split('=')[1] ?? '4')
  .split(',').map(Number);

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: trilhas, error } = await sb.from('trilhas')
    .select('id, colaborador_id, competencia_foco, competencias_foco, temporada_plano, descritores_selecionados, colaboradores!inner(cargo)')
    .eq('empresa_id', EMP);
  if (error) { console.error('ERRO:', error.message); process.exit(1); }
  console.log(`trilhas: ${trilhas.length} · semanas: ${SEMANAS_MISSAO.join(', ')}`);

  const backup: any[] = [];
  let regeneradas = 0, puladas = 0, falhas = 0;

  for (const [i, t] of trilhas.entries()) {
    const planoOriginal = Array.isArray(t.temporada_plano?.semanas)
      ? t.temporada_plano.semanas : (Array.isArray(t.temporada_plano) ? t.temporada_plano : []);
    let planoAtual = [...planoOriginal];
    const cargo = (t as any).colaboradores?.cargo;
    const comps = Array.isArray(t.competencias_foco) && t.competencias_foco.length > 1
      ? t.competencias_foco : [t.competencia_foco];
    let mudou = false;

    for (const SEMANA_MISSAO of SEMANAS_MISSAO) {
      const idx = planoAtual.findIndex((s: any) => s.semana === SEMANA_MISSAO && s.tipo === 'aplicacao');
      if (idx < 0) { if (i === 0) console.log(`· semana ${SEMANA_MISSAO} ausente, pulando`); continue; }

      try {
        const nova = await montarSemanaAplicacao(
          SEMANA_MISSAO, t.descritores_selecionados ?? [], t.competencia_foco,
          cargo, 'educacional', {}, PROGRAMA_REGULAR_DUO, comps,
        );
        if (i === 0 || !APLICAR) {
          console.log(`\n· trilha ${t.id.slice(0, 8)} (${cargo}) · semana ${SEMANA_MISSAO}`);
          console.log(`  cobertos ANTES (${(planoAtual[idx].descritores_cobertos ?? []).length}):`, planoAtual[idx].descritores_cobertos);
          console.log(`  cobertos DEPOIS (${(nova.descritores_cobertos ?? []).length}):`, nova.descritores_cobertos);
          console.log(`  missão: ${(nova.missao?.texto ?? '').slice(0, 180)}`);
          if (!APLICAR) { console.log('\nDRY-RUN — rode com --aplicar para backup + gravar.'); process.exit(0); }
        }
        planoAtual = planoAtual.map((s: any, j: number) => j === idx ? {
          ...s,
          competencias_cobertas: nova.competencias_cobertas,
          descritores_cobertos: nova.descritores_cobertos,
          missao: nova.missao,
          cenario: nova.cenario,
        } : s);
        mudou = true;
        regeneradas++;
      } catch (e: any) {
        falhas++;
        console.error(`✗ ${t.id.slice(0, 8)} (${cargo}) sem ${SEMANA_MISSAO}: ${e?.message}`);
      }
    }

    if (mudou && APLICAR) {
      backup.push({ trilha_id: t.id, temporada_plano: t.temporada_plano });
      const novoPlano = Array.isArray(t.temporada_plano?.semanas)
        ? { ...t.temporada_plano, semanas: planoAtual } : planoAtual;
      const { error: upErr } = await sb.from('trilhas').update({ temporada_plano: novoPlano }).eq('id', t.id);
      if (upErr) { falhas++; console.error(`✗ gravação ${t.id.slice(0, 8)}: ${upErr.message}`); continue; }
    }
    if (mudou && (i + 1) % 10 === 0) console.log(`  ... ${i + 1}/${trilhas.length}`);
  }

  if (APLICAR) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + 'Z';
    const path = `backups/trilhas-missao-entregue-${ts}.json`;
    writeFileSync(path, JSON.stringify({ quando: ts, semanas: SEMANAS_MISSAO, regra: 'missao cobre o bloco fechado; ultima e cumulativa (28/07)', planos_originais: backup }, null, 2));
    console.log(`\nBackup: ${path} (${backup.length} planos)`);
  }
  console.log(`\nmissões regeneradas: ${regeneradas} | falhas: ${falhas}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
