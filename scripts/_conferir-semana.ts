/**
 * "O conteúdo da semana N está pronto?" — respondido pelo CONSUMIDOR, não pela tabela.
 *
 * 🔴 POR QUE NÃO DÁ PARA RESPONDER COM SQL
 * ────────────────────────────────────────
 * Nesta base, a entrega é resolvida na LEITURA:
 *  - `conteudo.desafio_texto` gravado é PLACEHOLDER; o real vem do Kit por (DISC × cargo),
 *    no overlay;
 *  - conteúdo de kit é DISC-específico e **só aparece** depois do overlay;
 *  - `formatos_disponiveis` NUNCA contém vídeo — quem diz se há vídeo é o deck da célula.
 *
 * Um `SELECT` na `trilhas` responde o que está GRAVADO e erra a pergunta. Este script
 * reusa `coletarEntregasPrevistas` — a mesma função do preflight do health, que aplica
 * `overlayKitNaSemana` com os mesmos flags do caminho real — e depois passa o resultado
 * por `regrasPreflight`, que é a régua de "pronto".
 *
 * USO
 *   npx tsx scripts/_conferir-semana.ts --empresa=<slug> [--detalhe]
 *
 * A pílula alvo sai da CADÊNCIA da empresa: o script escolhe duas datas cujo dia da
 * semana casa com `fase4_dia_pilula` e `fase4_dia_pilula2`, exatamente como o cron faria.
 */
process.loadEnvFile('.env.local');

import { createSupabaseAdmin } from '../lib/supabase';
import { coletarEntregasPrevistas, diaDaSemanaBRT } from '../lib/pipeline-health/coleta';
import { regrasPreflight } from '../lib/pipeline-health/regras';

const args = process.argv.slice(2);
const slug = args.find((a) => a.startsWith('--empresa='))?.split('=')[1];
const detalhe = args.includes('--detalhe');

/** Primeira data (a partir de hoje) cujo dia-da-semana BRT é `dia`. */
function dataDoDia(dia: number): Date {
  const base = new Date();
  for (let i = 0; i < 8; i++) {
    const d = new Date(base.getTime() + i * 24 * 3600_000);
    if (diaDaSemanaBRT(d) === dia) return d;
  }
  return base;
}

async function main() {
  if (!slug) throw new Error('--empresa=<slug> é obrigatório');
  const sb = createSupabaseAdmin();

  const { data: emp, error } = await sb.from('empresas')
    .select('id, nome, sys_config').eq('slug', slug).maybeSingle();
  if (error) throw new Error(`empresas: ${error.message}`);
  if (!emp) throw new Error(`empresa ${slug} não encontrada`);

  const cad = (emp.sys_config as any)?.cadencia || {};
  const dias = { 1: cad.fase4_dia_pilula ?? 1, 2: cad.fase4_dia_pilula2 ?? 2 };
  console.log(`${emp.nome} · cadência: P1 no dia ${dias[1]}, P2 no dia ${dias[2]}\n`);

  for (const p of [1, 2] as const) {
    const { entregas, pilulaAlvo } = await coletarEntregasPrevistas(sb, emp.id, dataDoDia(dias[p]));
    console.log(`── PÍLULA ${p} (alvo resolvido: ${pilulaAlvo ?? 'nenhuma'}) ──`);
    if (!entregas.length) {
      console.log('  0 entregas previstas — ninguém ativo, ou a semana não é de conteúdo.\n');
      continue;
    }

    const semanas = [...new Set(entregas.map((e) => e.semana))].sort();
    console.log(`  ${entregas.length} pessoas · semana(s): ${semanas.join(', ')}`);
    console.log(`  com kit aplicado : ${entregas.filter((e) => e.temKit).length}/${entregas.length}`);
    console.log(`  com core         : ${entregas.filter((e) => e.coreId).length}/${entregas.length}`);
    console.log(`  desafio real     : ${entregas.filter((e) => !e.desafioPlaceholder).length}/${entregas.length}`);
    console.log(`  com telefone ok  : ${entregas.filter((e) => e.telefoneValido).length}/${entregas.length}`);
    const comVideo = entregas.filter((e) => e.formatosDisponiveis.includes('video')).length;
    console.log(`  com vídeo pronto : ${comVideo}/${entregas.length}`);

    const achados = regrasPreflight(entregas);
    if (!achados.length) console.log('  ✅ nenhum achado do preflight');
    for (const a of achados) {
      console.log(`  ${a.severidade === 'critico' ? '🔴' : '⚠️ '} [${a.id}] ${a.titulo} — ${a.contagem}`);
      if (detalhe && a.amostra?.length) for (const s of a.amostra) console.log(`       · ${s}`);
    }

    if (detalhe) {
      console.log('\n  detalhe por pessoa:');
      for (const e of entregas) {
        console.log(`   - ${e.nome} [${e.cargo}/${e.disc}] sem${e.semana} · descritor="${e.descritor ?? '—'}"`
          + ` · kit=${e.temKit ? 'sim' : 'NÃO'} · core=${e.coreId ? 'sim' : 'NÃO'}`
          + ` · anuncia=${e.formatoAnunciado} · entrega=[${e.formatosDisponiveis.join(',') || 'NENHUM'}]`
          + ` · desafio=${e.desafioPlaceholder ? 'PLACEHOLDER' : 'real'}`);
      }
    }
    console.log('');
  }
}

main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
