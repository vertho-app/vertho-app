/* eslint-disable */
// Pré-aquecimento da demo: calcula o Fit dos 4 cargos do acme-demo.
//
// Por que existe: o reset noturno NÃO pré-computa `fit_resultados` — o
// colaborador nasce sem fit, e a aba Fit v2 de /admin/fit abre com a tabela
// vazia até alguém clicar "Calcular Fit" cargo a cargo. Numa apresentação isso
// é uma tela vazia na hora errada.
//
// Fidelidade ao botão: este script NÃO reimplementa o cálculo. Chama o mesmo
// núcleo (`calcularFitUnificado`) que `calcularFitIndividual` chama, com os
// mesmos argumentos, e grava as MESMAS colunas com o mesmo `onConflict`. Os 4
// cargos do acme-demo têm gabarito.tela4 e NÃO têm `fit_perfil_ideal`
// customizado → o `usarUnificado` da action é true em todos, que é o caminho
// replicado aqui. Nada de IA (a leitura executiva é do motor; a versão com IA
// é outra action, on-demand).
//
// Fail-closed: só roda se o tenant resolvido pelo slug for `is_demo`.
import './_env';
import { tenantDb } from '@/lib/tenant-db';
import { createSupabaseAdmin } from '@/lib/supabase';
import { calcularFitUnificado } from '@/lib/scoring/fit-v2-adapter';
import { excludeInternalEmails } from '@/lib/internal-emails';

const SLUG = 'acme-demo';

async function main() {
  const sb = createSupabaseAdmin();

  const { data: empresa, error: empErr } = await sb
    .from('empresas').select('id, nome, is_demo').eq('slug', SLUG).maybeSingle();
  if (empErr) throw new Error(`empresas: ${empErr.message}`);
  if (!empresa) throw new Error(`tenant ${SLUG} não encontrado`);
  if (!empresa.is_demo) throw new Error(`ABORTADO: ${SLUG} não é is_demo — este script só toca tenant de demonstração`);
  console.log(`tenant: ${empresa.nome} (${empresa.id}) is_demo=${empresa.is_demo}`);

  const tdb = tenantDb(empresa.id);

  const { data: cargos, error: cargoErr } = await tdb.from('cargos_empresa')
    .select('id, nome, gabarito, fit_perfil_ideal, eh_lideranca').order('nome');
  if (cargoErr) throw new Error(`cargos_empresa: ${cargoErr.message}`);

  let totalOk = 0;
  const falhas: string[] = [];

  for (const cargo of cargos || []) {
    const gab = cargo.gabarito
      ? (typeof cargo.gabarito === 'string' ? JSON.parse(cargo.gabarito) : cargo.gabarito)
      : null;
    if (!gab?.tela4 || cargo.fit_perfil_ideal) {
      falhas.push(`${cargo.nome}: caminho legado (gabarito.tela4=${!!gab?.tela4}, perfil_ideal=${!!cargo.fit_perfil_ideal}) — NÃO calculado por este script`);
      continue;
    }

    // Mesmo seletor da action: cargo + d_natural presente, sem contas internas.
    const { data: colabs, error: colabErr } = await excludeInternalEmails(
      tdb.from('colaboradores').select('*').eq('cargo', cargo.nome).not('d_natural', 'is', null)
    );
    if (colabErr) { falhas.push(`${cargo.nome}: ${colabErr.message}`); continue; }
    if (!colabs?.length) { console.log(`  ${cargo.nome}: 0 colaboradores com DISC`); continue; }

    for (const colab of colabs) {
      const r = calcularFitUnificado(gab, colab, { ehLideranca: cargo.eh_lideranca, cargoNome: cargo.nome });
      if (!r || r.success === false) {
        falhas.push(`${cargo.nome}/${colab.nome_completo}: ${r?.error || 'motor devolveu null'}`);
        continue;
      }
      const { error: saveErr } = await tdb.from('fit_resultados').upsert({
        colaborador_id: colab.id,
        cargo_id: cargo.id,
        cargo_nome: cargo.nome,
        versao_modelo: '2.0',
        fit_final: r.fit_final,
        classificacao: r.classificacao,
        recomendacao: r.recomendacao,
        score_base: r.score_base,
        fator_critico: r.fatores.fator_critico,
        fator_excesso: r.fatores.fator_excesso,
        score_mapeamento: r.blocos.mapeamento.score,
        score_competencias: r.blocos.competencias.score,
        score_lideranca: r.blocos.lideranca?.score ?? null,
        score_disc: r.blocos.disc.score,
        resultado_json: r,
        leitura_executiva: r.leitura_executiva,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'empresa_id,colaborador_id' }).select('id');
      if (saveErr) { falhas.push(`${cargo.nome}/${colab.nome_completo}: upsert ${saveErr.message}`); continue; }
      totalOk++;
      console.log(`  ${cargo.nome} · ${colab.nome_completo}: fit ${r.fit_final} (${r.classificacao}) — ${r.recomendacao}`);
    }
  }

  console.log(`\n${totalOk} fit(s) gravado(s).`);
  if (falhas.length) {
    console.log(`${falhas.length} falha(s):`);
    for (const f of falhas) console.log(`  ! ${f}`);
  }
}

main().catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
