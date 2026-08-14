/* eslint-disable */
// Reavalia (IA4) as respostas de uma competência para reancorar as notas nos
// descritores OFICIAIS, e limpa os descritores livres que sobrarem.
//
// POR QUE (medido 14/08): a trilha ancora no descritor que veio da AVALIAÇÃO.
// Quando os 38 diretores de Macaé foram avaliados, C007 era UMA linha sem
// descritor nenhum, então `carregarContextoRespostaIA4` montava a régua do
// prompt VAZIA e a IA nomeou o que via no cenário — 104 descritores distintos
// para 8 conceitos, colados ao caso ("Comunicação diferenciada por parte
// (Renata x Mãe)"). Resultado: a trilha piloto morreu com "Sem conteúdo para
// GERENCIAMENTO DE CONFLITOS × Decisão proporcional com consciência de custo".
//
// Não é remendo: com os 8 descritores semeados, o MESMO pipeline agora injeta
// a régua completa (cod_desc + N1..N4) e `resolverNomeOficial` casa o eco de
// volta ao `nome_curto`. Mapear os nomes velhos por semelhança foi tentado e
// medido — 76 de 104 com confiança < 0,7 — e inventaria uma régua tão
// arbitrária quanto a atual.
//
// ORDEM IMPORTA: reavalia PRIMEIRO (o upsert cria as linhas oficiais), limpa
// DEPOIS. O inverso deixaria a pessoa sem avaliação nenhuma se a IA falhasse no
// meio. As `respostas` não são tocadas — muda só a leitura que a IA fez delas.
//
// Uso: npx tsx scripts/_reancorar-avaliacoes.ts <slug> <cod_comp> [--cargo=X] [--max=N] [--aplicar]
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { avaliarUmaRespostaCore, carregarContextoLoteIA4, IA4_COLAB_COLS } from '@/lib/ia4-avaliacao';
import { getModelForTask } from '@/lib/ai-tasks';

const SLUG = process.argv[2] || 'macae';
const COD = process.argv[3] || 'C007';
const CARGO = process.argv.find((a) => a.startsWith('--cargo='))?.slice(8) || 'Diretor(a) Escolar';
const MAX = Number((process.argv.find((a) => a.startsWith('--max='))?.slice(6)) || 999);
const APLICAR = process.argv.includes('--aplicar');
const MODELO = process.argv.find((a) => a.startsWith('--modelo='))?.slice(9) || '';

async function main() {
  const sb = createSupabaseAdmin();
  const { data: emp } = await sb.from('empresas').select('id').eq('slug', SLUG).single();
  if (!emp) throw new Error('empresa não encontrada: ' + SLUG);
  const empresaId = (emp as any).id;
  const tdb = tenantDb(empresaId);

  const { data: oficiais } = await sb.from('competencias')
    .select('id, cod_desc, nome_curto, nome')
    .eq('empresa_id', empresaId).eq('cod_comp', COD).not('cod_desc', 'is', null).order('cod_desc');
  if (!oficiais?.length) throw new Error(`${COD} não tem descritores oficiais — rode o seed antes.`);
  const nomeComp = (oficiais as any[])[0].nome;
  const nomesOficiais = (oficiais as any[]).map((o) => o.nome_curto);
  console.log(`${COD} "${nomeComp}" · ${oficiais.length} descritores oficiais`);

  // Todas as linhas de `competencias` desta competência (a antiga, sem cod_desc,
  // é a que `respostas.competencia_id` referencia).
  const { data: todasComp } = await sb.from('competencias').select('id')
    .eq('empresa_id', empresaId).eq('cod_comp', COD);
  const compIds = (todasComp || []).map((c: any) => c.id);

  const { data: colabs } = await sb.from('colaboradores')
    .select('id').eq('empresa_id', empresaId).eq('cargo', CARGO);
  const colabIds = new Set((colabs || []).map((c: any) => c.id));

  const { data: resps, error } = await tdb.from('respostas')
    .select('*').in('competencia_id', compIds).order('id');
  if (error) throw new Error(error.message);
  const alvo = (resps || []).filter((r: any) => colabIds.has(r.colaborador_id)).slice(0, MAX);

  const { count: livresAntes } = await sb.from('descriptor_assessments')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId).eq('competencia', nomeComp).not('descritor', 'in', `(${nomesOficiais.map((n) => `"${n}"`).join(',')})`);

  console.log(`${alvo.length} resposta(s) de ${CARGO} · ${livresAntes ?? '?'} avaliação(ões) hoje em descritor livre`);
  if (!APLICAR) { console.log('\n(dry-run — rode com --aplicar)'); return; }

  // O modelo tem de ser RESOLVIDO aqui: `callAI` faz `aiConfig?.model ||
  // 'claude-sonnet-4-6'` e NÃO consulta `getModelForTask` — o taskKey só marca
  // o custo no ledger. Na tela do admin quem escolhe é o operador; num script,
  // aiConfig vazio significa rodar no 4.6 sem perceber (foi o que aconteceu na
  // primeira tentativa desta reancoragem).
  const modelo = MODELO || await getModelForTask(empresaId, 'ia4_avaliacao');
  console.log(`modelo: ${modelo}`);
  const { empresa, contextoPPP } = await carregarContextoLoteIA4(tdb, sb, empresaId);
  let ok = 0; const erros: string[] = [];
  // A limpeza é escopada a QUEM foi reavaliado nesta execução. Sem isto, um
  // `--max=1` reavalia uma pessoa e apaga o descritor livre das 38 — as outras
  // 37 ficariam sem avaliação nenhuma, e o piloto que existe para reduzir risco
  // seria o que causa o estrago.
  const reavaliados = new Set<string>();
  // Reancorar deveria trocar o NOME do descritor, não a severidade da nota. Se
  // a média cair de forma sistemática, a régua no prompt está mudando o
  // julgamento — e aí 38 pessoas trocam de nível sem que ninguém tenha decidido
  // isso. Só dá para saber medindo antes/depois POR PESSOA, e a média antiga
  // some assim que a limpeza roda: por isso é lida aqui, não depois.
  const deltas: number[] = [];
  for (const [i, resp] of alvo.entries()) {
    const { data: cs } = await tdb.from('colaboradores').select(IA4_COLAB_COLS).in('id', [resp.colaborador_id]);
    const colab = cs?.[0] || {};
    const { data: antesRows } = await sb.from('descriptor_assessments')
      .select('nota').eq('colaborador_id', resp.colaborador_id).eq('competencia', nomeComp);
    const mediaAntes = (antesRows || []).length
      ? (antesRows as any[]).reduce((s, x) => s + Number(x.nota), 0) / (antesRows as any[]).length : NaN;

    const r = await avaliarUmaRespostaCore(tdb, sb, resp, colab, empresa, contextoPPP, { model: modelo });
    if (!r.success) { erros.push(`${colab?.nome_completo || resp.colaborador_id}: ${r.error}`); console.log(`  [${i + 1}/${alvo.length}] ❌ ${r.error}`); continue; }
    ok++;
    reavaliados.add(resp.colaborador_id);

    const { data: depoisRows } = await sb.from('descriptor_assessments')
      .select('nota, descritor').eq('colaborador_id', resp.colaborador_id).eq('competencia', nomeComp);
    const novos = (depoisRows || []).filter((x: any) => nomesOficiais.includes(x.descritor));
    const mediaDepois = novos.length ? novos.reduce((s: number, x: any) => s + Number(x.nota), 0) / novos.length : NaN;
    if (Number.isFinite(mediaAntes) && Number.isFinite(mediaDepois)) deltas.push(mediaDepois - mediaAntes);
    const d = Number.isFinite(mediaAntes) ? (mediaDepois - mediaAntes).toFixed(2) : '—';
    console.log(`  [${i + 1}/${alvo.length}] ✅ ${String(colab?.nome_completo || '').slice(0, 30).padEnd(32)} média ${Number.isFinite(mediaAntes) ? mediaAntes.toFixed(2) : '—'} → ${mediaDepois.toFixed(2)} (${d})`);
  }
  if (deltas.length) {
    const medio = deltas.reduce((s, x) => s + x, 0) / deltas.length;
    const piores = deltas.filter((d) => d < -0.5).length;
    console.log(`\nΔ médio da nota: ${medio.toFixed(2)} · ${piores}/${deltas.length} caíram mais de 0,5`);
    if (medio < -0.4) console.log('⚠ queda sistemática — a régua no prompt está mudando o JULGAMENTO, não só o nome. Confira antes de seguir para os demais.');
  }
  console.log(`\n${ok}/${alvo.length} reavaliadas${erros.length ? `, ${erros.length} com erro` : ''}`);
  for (const e of erros) console.log(`  ✗ ${e}`);

  if (!ok) { console.log('\n❌ nenhuma reavaliação passou — NADA será apagado.'); return; }

  // Limpeza: só agora, só o que ficou fora da régua, e só de quem foi
  // reavaliado AGORA. Se a reavaliação falhou para alguém, a linha velha dessa
  // pessoa é a única avaliação que ela tem — apagar deixaria o colaborador sem
  // nota, e o sintoma apareceria lá na frente, como trilha que não nasce.
  const { data: livres } = await sb.from('descriptor_assessments')
    .select('id, colaborador_id, descritor')
    .eq('empresa_id', empresaId).eq('competencia', nomeComp);
  const paraApagar = (livres || []).filter((l: any) =>
    !nomesOficiais.includes(l.descritor) && reavaliados.has(l.colaborador_id));
  console.log(`\n${paraApagar.length} linha(s) em descritor livre a remover (de ${reavaliados.size} colaborador(es) reavaliado(s))`);
  if (paraApagar.length) {
    const { error: eDel } = await sb.from('descriptor_assessments')
      .delete().in('id', paraApagar.map((l: any) => l.id));
    if (eDel) throw new Error(eDel.message);
    console.log(`✅ removidas`);
  }
  if (erros.length) console.log(`⚠ ${erros.length} colaborador(es) sem reavaliação — seguem na régua antiga, confira antes do blueprint`);

  // Contagem SEPARADA: dizer "todas na régua oficial" somando o total é falso
  // enquanto houver gente não reavaliada — e é o tipo de frase que faz alguém
  // parar de conferir.
  const { data: finais } = await sb.from('descriptor_assessments')
    .select('descritor, colaborador_id').eq('empresa_id', empresaId).eq('competencia', nomeComp);
  const doCargo = (finais || []).filter((x: any) => colabIds.has(x.colaborador_id));
  const naRegua = doCargo.filter((x: any) => nomesOficiais.includes(x.descritor)).length;
  console.log(`${naRegua}/${doCargo.length} avaliações de ${CARGO} em ${nomeComp} na régua oficial (${doCargo.length - naRegua} ainda em descritor livre).`);
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
