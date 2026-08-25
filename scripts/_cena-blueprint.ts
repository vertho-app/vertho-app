/* eslint-disable */
// AUDITORIA DE ALCANÇABILIDADE sobre a régua REAL. Zero IA.
//
// Responde, descritor por descritor: o nível-meta descreve algo que uma cena
// 1:1 de ~11 turnos consegue OBSERVAR, ou algo que só se promete ali?
//
// ⚠️ O resultado é RELATÓRIO, para humano assinar embaixo — não gate. A lista
// de marcadores é finita e erra por omissão. Ela existe para a coorte de gente
// real não ser gasta descobrindo um teto de desenho.
//
// Uso:
//   npx tsx scripts/_cena-blueprint.ts ibipeba "Gestão Escolar" DIR08
//   npx tsx scripts/_cena-blueprint.ts ibipeba "Gestão Escolar"        (toda a régua)
process.loadEnvFile('.env.local');

import { tenantDb } from '@/lib/tenant-db';
import { resolveTenant } from '@/lib/tenant-resolver';
import { auditarAlcancabilidade } from '@/lib/season-engine/cena/blueprint';
import type { DescritorDaRegua } from '@/lib/season-engine/cena/prompts';

const slug = process.argv[2];
const cargo = process.argv[3] || 'Gestão Escolar';
const soEsta = process.argv[4];

(async () => {
  const emp: any = await resolveTenant(slug);
  if (!emp) throw new Error(`empresa não encontrada: ${slug}`);

  const { data, error } = await tenantDb(emp.id).from('competencias')
    .select('cod_comp, cod_desc, nome, nome_curto, n3_meta')
    .eq('cargo', cargo)
    .order('cod_comp').order('cod_desc');
  if (error) throw new Error(`competencias: ${error.message}`);

  const porComp = new Map<string, any[]>();
  for (const d of (data ?? []) as any[]) {
    if (soEsta && d.cod_comp !== soEsta) continue;
    porComp.set(d.cod_comp, [...(porComp.get(d.cod_comp) ?? []), d]);
  }

  let totalDesc = 0, totalOutraParte = 0, totalTempo = 0;
  const compsAfetadas: string[] = [];

  for (const [cod, linhas] of porComp) {
    const descritores: DescritorDaRegua[] = linhas.map((d, i) => ({
      indice: i + 1,
      nomeCurto: d.nome_curto || d.cod_desc || `D${i + 1}`,
      descritorCompleto: '', n1: '', n2: '', n3: d.n3_meta || '', n4: '',
      evidenciasEsperadas: '', perguntasAlvo: '',
    }));
    totalDesc += descritores.length;

    const suspeitas = auditarAlcancabilidade(descritores);
    if (!suspeitas.length) continue;
    compsAfetadas.push(cod);
    totalOutraParte += new Set(suspeitas.filter((s) => s.risco === 'exige_outra_parte').map((s) => s.indice)).size;
    totalTempo += new Set(suspeitas.filter((s) => s.risco === 'exige_tempo').map((s) => s.indice)).size;

    console.log(`\n${'─'.repeat(78)}`);
    console.log(`${cod} — ${linhas[0].nome ?? ''}   (${descritores.length} descritores)`);
    for (const s of suspeitas) {
      const rotulo = s.risco === 'exige_outra_parte'
        ? 'PRECISA DA OUTRA PARTE'
        : 'PRECISA DE TEMPO     ';
      console.log(`  D${s.indice} ${s.nomeCurto.padEnd(26)} ${rotulo}  [${s.marcador}]`);
      console.log(`      ${s.trecho}`);
    }
    const limpos = descritores.filter((d) => !suspeitas.some((s) => s.indice === d.indice));
    console.log(`  → observáveis numa cena 1:1: ${limpos.length}/${descritores.length}` +
      `${limpos.length ? '  (' + limpos.map((d) => 'D' + d.indice).join(' ') + ')' : ''}`);
  }

  // ── O DENOMINADOR ─────────────────────────────────────────────────────────
  //
  // Sem ele isto seria a mesma armadilha do classificador que já foi removido
  // deste projeto: um detector que marca quase tudo não separa nada, e um que
  // marca quase nada não foi exercitado. O número tem de aparecer ao lado do
  // achado, sempre.
  console.log(`\n${'═'.repeat(78)}`);
  console.log(`DENOMINADOR — ${cargo} @ ${slug}`);
  console.log(`  competências analisadas:        ${porComp.size}`);
  console.log(`  descritores analisados:         ${totalDesc}`);
  console.log(`  suspeitos de exigir outra parte: ${totalOutraParte} (${(100 * totalOutraParte / Math.max(1, totalDesc)).toFixed(0)}%)`);
  console.log(`  suspeitos de exigir tempo:       ${totalTempo} (${(100 * totalTempo / Math.max(1, totalDesc)).toFixed(0)}%)`);
  console.log(`  competências com ao menos um:    ${compsAfetadas.length} de ${porComp.size}`);
  console.log('\n⚠️  Suspeita, não veredito. Cada linha acima precisa de um humano dizendo');
  console.log('   "sim, isso não dá para observar numa conversa" — ou recusando a marcação.\n');
})();
