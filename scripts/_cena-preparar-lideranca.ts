/* eslint-disable */
// Prepara o insumo do piloto do Modo Cena: gera os cenários da competência de
// LIDERANÇA para a coorte do Ibipeba (as pessoas sem nenhuma resposta).
//
// POR QUE EXISTE (medido 24/08/2026): o banco só tem cenário para as duas
// competências configuradas como foco do cargo — Autocuidado e Planejamento.
// Liderança pedagógica tem ZERO. A cena é montada a partir de `banco_cenarios`
// (contexto + as 4 perguntas com `descritores_primarios`), então sem cenário
// não existe cena. Não é engenharia: é rodar a geração que o pipeline já faz.
//
// ⚠️ O CENÁRIO DE DIRETOR É POR ESCOLA. Ibipeba é rede com 11 PPPs, e os
// cenários de Gestão Escolar existentes são 11 por escola + 1 de rede. Gerar um
// só e aplicá-lo à rede inteira aplicaria o projeto pedagógico de uma unidade
// sorteada a todas as outras — o mesmo erro que o guard de PPP existe para
// impedir. Aqui só se geram as escolas que a COORTE realmente ocupa (4 de 11).
//
// ⚠️ O MAPA DA ESCOLA TEM DOIS SALTOS: `colaboradores.escola_id` NÃO é
// `ppp_escolas.id` (medido: 0 de 35 casam). O caminho é
// `colaboradores.escola_id → escolas.ppp_escola_id → ppp_escolas.id`.
// Passar o `escola_id` cru como `pppEscolaId` geraria cenário ancorado em nada,
// sem erro nenhum na tela.
//
// Uso:
//   npx tsx scripts/_cena-preparar-lideranca.ts             # dry-run: só mostra o plano
//   npx tsx scripts/_cena-preparar-lideranca.ts --executar   # gera e checa
process.loadEnvFile('.env.local');

import { tenantDb } from '@/lib/tenant-db';
import { resolveTenant } from '@/lib/tenant-resolver';
import { gerarCenarioIA3Core, checkCenarioIA3Core, regenerarCenarioIA3ComTrava } from '@/lib/ia3-cenarios';
import { getModelForTask } from '@/lib/ai-tasks';

const SLUG = 'ibipeba';
const EXECUTAR = process.argv.includes('--executar');
/** `--regenerar [N]` roda o ciclo champion/challenger nos cenários pendentes. */
const REGENERAR = process.argv.includes('--regenerar');
const RODADAS = (() => {
  const i = process.argv.indexOf('--regenerar');
  const n = Number(process.argv[i + 1]);
  return Number.isInteger(n) && n > 0 ? n : 3;
})();
/** Piso de `aprovado_com_ressalvas` no check — abaixo disto o cenário não serve. */
const PISO_ACEITAVEL = 80;

/**
 * A competência de liderança de cada cargo, por CÓDIGO.
 *
 * ⚠️ Escolhidas a dedo, não por busca no nome. `DIR12 Liderança digital e
 * inovação pedagógica` e `SED12 Liderança digital e inteligência de dados`
 * casariam com qualquer filtro por "liderança" e são competências de
 * TECNOLOGIA — o piloto mediria fluência digital achando que mede liderança.
 *
 * ═══ O QUE JÁ FOI MEDIDO SOBRE A ESCOLHA (24/08/2026) ═══
 *
 * `DIR01 Liderança pedagógica` foi a 1ª escolha e devolveu **0 de 5 cenários
 * aprovados**, dois com a mesma frase do check: *"o mapa declara avaliar
 * Observação de práticas (D2), mas nenhuma pergunta exige que o avaliado
 * observe aulas"*. `DIR08` foi a 2ª e reprovou o 1º cenário (D5, Reparação).
 *
 * ⚠️ NÃO escolha por prior. Duas tentativas de prever qual competência serve
 * falharam, e a 2ª falhou pior: a triagem de IA se CONTRADIZ entre modelos sobre
 * o mesmo texto — Sonnet 4.6 dá 3 descritores fora para DIR08 e 1 para DIR01;
 * Opus 5 inverte, dando 1 e 0, justamente na competência que o check reprovou
 * cinco vezes. Duas leituras opostas valem zero como critério.
 *
 * ⚠️ E NÃO use `perguntas_alvo` para inferir a natureza do descritor. Cheguei a
 * escrever um classificador em cima disso e ele estava errado na raiz: as
 * perguntas-alvo são o roteiro da CONVERSA DE EVIDÊNCIAS, escritas em tom
 * retrospectivo para **todo** descritor da matriz — DIR09, que produz cenário
 * aprovado, tem "me conte um imprevisto que ameaçou um plano" exatamente como
 * DIR01 tem "quando foi a última vez que observou uma aula".
 *
 * O único juiz com verdade observada é o CHECK da 2ª IA. Use `--sondar`.
 *
 * ⚠️ `nota_check` NÃO ordena competências. O prompt do check manda "ERROS
 * GRAVES forçam nota máxima 60" e o código clampa — então sete cenários
 * empataram em EXATAMENTE 60, com as dimensões somando 60 em cada um por
 * back-fill do modelo. O 60 é teto, não medida: comparar 60 com 58 é comparar
 * dois erros graves. O sinal binário é o que vale — passou de 80 ou não.
 *
 * Placar medido (24/08), por tentativas até um `aprovado_com_ressalvas`:
 *   SED04 Liderança técnico-pedagógica ... 85, 1 de 1  ← escolhida
 *   DIR04 Comunicação e Influência ....... 83, 1 de 1  ← escolhida
 *   DIR01 Liderança pedagógica ........... 84, 1 de 5
 *   DIR08 Gestão de conflitos ............ 60, 0 de 5
 *   DIR11 · SED06 · SED07 ................ 60, 0 de 1 cada
 *
 * A ressalva das duas escolhidas é a MESMA e é de forma, não de mérito:
 * contexto longo demais. `aprovado` puro exige 90+, patamar que só DIR09 e
 * DIR02 alcançaram — e elas tiveram 12 tentativas cada.
 */
const ALVOS_PADRAO = [
  { cargo: 'Gestão Escolar', codComp: 'DIR04' },      // Comunicação e Influência pedagógica
  { cargo: 'Gestão Educacional', codComp: 'SED04' },  // Liderança técnico-pedagógica
];

/**
 * `--sondar "Cargo:COD,Cargo:COD"` gera UM cenário por competência (o de rede),
 * em vez do lote por escola, para deixar o CHECK escolher a competência do
 * piloto.
 *
 * ⚠️ Existe porque escolher por prior falhou duas vezes em 24/08: primeiro por
 * nome (DIR01 — reprovada 5 de 5 pelo check), depois pela triagem de IA (DIR08 —
 * primeira reprovada). E a própria triagem se contradiz entre modelos: Sonnet
 * 4.6 dá 3 descritores fora para DIR08 e 1 para DIR01; Opus 5 inverte, dando 1 e
 * 0. Duas leituras opostas do mesmo texto valem zero como critério.
 *
 * O check da 2ª IA é o único juiz com verdade observada aqui — ele reprovou
 * DIR01 com razão nomeada e aprovou 7 de 12 em DIR09. Sondar custa ~US$ 0,35 por
 * competência e responde o que dois palpites não responderam.
 */
function alvosDaLinhaDeComando() {
  const i = process.argv.indexOf('--sondar');
  if (i < 0) return { alvos: ALVOS_PADRAO, sondagem: false };
  const alvos = String(process.argv[i + 1] ?? '').split(',').map((par) => {
    const [cargo, codComp] = par.split(':').map((x) => x.trim());
    if (!cargo || !codComp) throw new Error(`--sondar espera "Cargo:COD", recebido "${par}"`);
    return { cargo, codComp };
  });
  if (!alvos.length) throw new Error('--sondar sem alvos');
  return { alvos, sondagem: true };
}

const { alvos: ALVOS, sondagem: SONDAGEM } = alvosDaLinhaDeComando();

interface Item {
  cargo: string;
  codComp: string;
  competencia: string;
  competenciaId: string;
  pppEscolaId: string | null;
  escola: string;
  pessoas: number;
  jaExiste: boolean;
}

async function montarPlano(empresaId: string): Promise<Item[]> {
  const tdb = tenantDb(empresaId);
  const itens: Item[] = [];

  for (const alvo of ALVOS) {
    // `competencia_id` do cenário aponta para UMA das 6 linhas de descritor da
    // competência (o pipeline resolve o cod_comp a partir dela). Fixar a
    // primeira por cod_desc torna a execução repetível — sem `order`, duas
    // rodadas escolheriam âncoras diferentes.
    const { data: descs, error: errD } = await tdb.from('competencias')
      .select('id, cod_desc, nome')
      .eq('cargo', alvo.cargo).eq('cod_comp', alvo.codComp).order('cod_desc');
    if (errD) throw new Error(`competencias ${alvo.codComp}: ${errD.message}`);
    if (!descs?.length) throw new Error(`sem descritores para ${alvo.cargo}/${alvo.codComp}`);
    const competenciaId = (descs[0] as any).id;
    const competencia = (descs[0] as any).nome;
    const idsDaComp = new Set((descs as any[]).map((d) => d.id));

    // A coorte: quem não tem NENHUMA resposta. São essas pessoas que farão a
    // cena como cenário de entrada — as demais já foram avaliadas por escrito, e
    // medir a rodada 2 delas com outro instrumento compararia réguas diferentes.
    const { data: colabs, error: errC } = await tdb.from('colaboradores')
      .select('id, escola_id').eq('cargo', alvo.cargo);
    if (errC) throw new Error(`colaboradores: ${errC.message}`);

    const { data: resp, error: errR } = await tdb.from('respostas').select('colaborador_id');
    if (errR) throw new Error(`respostas: ${errR.message}`);
    const comResposta = new Set((resp || []).map((r: any) => r.colaborador_id));
    const coorte = (colabs || []).filter((c: any) => !comResposta.has(c.id));
    if (!coorte.length) continue;

    // colaboradores.escola_id → escolas.ppp_escola_id → ppp_escolas.id
    const escolaIds = [...new Set(coorte.map((c: any) => c.escola_id).filter(Boolean))];
    const mapaEscola = new Map<string, { nome: string; ppp: string | null }>();
    if (escolaIds.length) {
      const { data: escolas, error: errE } = await tdb.from('escolas')
        .select('id, nome, ppp_escola_id').in('id', escolaIds);
      if (errE) throw new Error(`escolas: ${errE.message}`);
      (escolas || []).forEach((e: any) => mapaEscola.set(e.id, { nome: e.nome, ppp: e.ppp_escola_id }));
    }

    const { data: existentes, error: errB } = await tdb.from('banco_cenarios')
      .select('id, ppp_escola_id, competencia_id').eq('cargo', alvo.cargo);
    if (errB) throw new Error(`banco_cenarios: ${errB.message}`);
    const jaTem = new Set(
      (existentes || [])
        .filter((b: any) => idsDaComp.has(b.competencia_id))
        .map((b: any) => String(b.ppp_escola_id ?? 'REDE')),
    );

    // Agrupa a coorte por PPP: uma pessoa sem escola (ou escola sem PPP) cai no
    // cenário de REDE, que é o que os cargos de secretaria já usam.
    const porPpp = new Map<string, { escola: string; ppp: string | null; pessoas: number }>();
    for (const c of coorte as any[]) {
      const info = c.escola_id ? mapaEscola.get(c.escola_id) : undefined;
      const ppp = info?.ppp ?? null;
      const chave = String(ppp ?? 'REDE');
      const nome = ppp ? (info?.nome ?? '(escola sem nome)') : '(rede — sem escola vinculada)';
      const atual = porPpp.get(chave);
      if (atual) atual.pessoas += 1;
      else porPpp.set(chave, { escola: nome, ppp, pessoas: 1 });
    }

    for (const [chave, v] of porPpp) {
      itens.push({
        cargo: alvo.cargo, codComp: alvo.codComp, competencia, competenciaId,
        pppEscolaId: v.ppp, escola: v.escola, pessoas: v.pessoas,
        jaExiste: jaTem.has(chave),
      });
    }
  }
  return itens;
}

/**
 * Ciclo de regeneração — o caminho NORMAL do pipeline, não um remendo.
 *
 * 🔴 MEDIDO EM 24/08/2026, e derruba a conclusão que eu vinha tirando o dia
 * inteiro: **toda** competência do acervo com cenário `aprovado` passou por
 * regeneração — COO03 9 de 9, DIR02 7 de 7, DIR09 8 de 8, COO06 6 de 6. As
 * geradas hoje têm 0 ou 1 e média 60-68, contra 93-95 do acervo.
 *
 * Ou seja: eu estava comparando PRIMEIRA TENTATIVA com DEPOIS DO CICLO e
 * atribuindo a diferença à competência escolhida — trocando de competência três
 * vezes por causa de um número que media outra coisa. O gargalo não era a
 * competência; era eu não estar rodando o pipeline até o fim.
 *
 * A trava (`travaRegeneracao`) só aplica a candidata se a nota não piorar, então
 * iterar é monotônico por construção — a lição de 23/07, quando um cenário de 88
 * virou 58 com um clique.
 */
async function regenerarPendentes(sbRaw: any, empresaId: string, modelo: string) {
  const tdb = tenantDb(empresaId);
  const alvos: Array<{ id: string; nota: number | null; comp: string }> = [];

  for (const alvo of ALVOS) {
    const { data: descs, error: errD } = await tdb.from('competencias')
      .select('id').eq('cargo', alvo.cargo).eq('cod_comp', alvo.codComp);
    if (errD) throw new Error(`competencias: ${errD.message}`);
    const ids = new Set((descs || []).map((d: any) => d.id));

    const { data: cens, error: errB } = await tdb.from('banco_cenarios')
      .select('id, nota_check, status_check, competencia_id').eq('cargo', alvo.cargo);
    if (errB) throw new Error(`banco_cenarios: ${errB.message}`);

    (cens || [])
      .filter((c: any) => ids.has(c.competencia_id) && (c.nota_check ?? 0) < PISO_ACEITAVEL)
      .forEach((c: any) => alvos.push({ id: c.id, nota: c.nota_check, comp: alvo.codComp }));
  }

  if (!alvos.length) { console.log('\nNada pendente — todos já passam do piso.\n'); return; }
  console.log(`\nREGENERANDO ${alvos.length} cenário(s) · até ${RODADAS} rodada(s) · piso ${PISO_ACEITAVEL}\n`);

  for (const a of alvos) {
    let nota = a.nota ?? 0;
    const trilha: string[] = [String(a.nota ?? '—')];
    for (let r = 1; r <= RODADAS && nota < PISO_ACEITAVEL; r++) {
      const res = await regenerarCenarioIA3ComTrava(sbRaw, { cenarioId: a.id, aiConfig: { model: modelo } });
      if (!res.success) { trilha.push(`erro(${res.error})`); break; }
      // `aplicado: false` = a candidata veio pior e a trava a descartou. A nota
      // NÃO muda, e insistir mais uma rodada é legítimo — o gerador é estocástico.
      nota = res.nota ?? nota;
      trilha.push(`${res.nota}${res.aplicado === false ? '(descartada)' : ''}`);
    }
    const ok = nota >= PISO_ACEITAVEL;
    console.log(`  ${ok ? '✓' : '✗'} ${a.comp} ${a.id.slice(0, 8)}  ${trilha.join(' → ')}`);
  }
}

async function main() {
  const emp = await resolveTenant(SLUG);
  if (!emp) throw new Error(`empresa não encontrada: ${SLUG}`);
  const sbRaw = tenantDb(emp.id).raw;

  const planoCheio = await montarPlano(emp.id);
  // Sondagem: 1 cenário por competência (o de rede, ou o 1º se não houver),
  // porque a pergunta é "esta competência produz cenário aprovável?", e não
  // "quais escolas do piloto". Gerar por escola aqui multiplicaria o custo da
  // decisão por 5 sem responder nada a mais.
  if (REGENERAR) {
    const modelo = await getModelForTask(emp.id, 'ia3_cenarios');
    console.log(`\nmodelo de regeneração: ${modelo}`);
    await regenerarPendentes(sbRaw, emp.id, modelo);
    return;
  }

  const plano = SONDAGEM
    ? Object.values(
        planoCheio.reduce((acc: Record<string, Item>, i) => {
          const atual = acc[i.codComp];
          if (!atual || (atual.pppEscolaId !== null && i.pppEscolaId === null)) acc[i.codComp] = i;
          return acc;
        }, {}),
      )
    : planoCheio;
  const aGerar = plano.filter((i) => !i.jaExiste);

  console.log(`\nPLANO — cenários de LIDERANÇA · ${SLUG}\n`);
  console.log(`${'cargo'.padEnd(20)}${'comp'.padEnd(8)}${'escola'.padEnd(34)}${'pessoas'.padEnd(9)}status`);
  for (const i of plano) {
    console.log(
      i.cargo.padEnd(20) + i.codComp.padEnd(8) + i.escola.slice(0, 32).padEnd(34) +
      String(i.pessoas).padEnd(9) + (i.jaExiste ? 'já existe' : 'gerar'),
    );
  }
  console.log(`\n${aGerar.length} cenário(s) a gerar · ${plano.length - aGerar.length} já existe(m)`);
  console.log(`Competências: ${[...new Set(plano.map((i) => `${i.codComp} ${i.competencia}`))].join(' · ')}`);

  if (!EXECUTAR) {
    console.log('\nDRY-RUN — nada foi escrito. Repita com --executar para gerar.\n');
    return;
  }

  // Resolve e IMPRIME o modelo. `callAI` faz `aiConfig?.model || DEFAULT_MODEL`
  // e NÃO consulta `getModelForTask` — sem passar explicitamente, o lote roda no
  // default do wrapper e não no pino da task, e a tabela de custo passa a
  // descrever outra coisa. O check não precisa: `checkCenarioIA3Core` já resolve
  // `ia3_check` sozinho, mantendo o auditor cross-família.
  const modeloGeracao = await getModelForTask(emp.id, 'ia3_cenarios');
  const modeloCheck = await getModelForTask(emp.id, 'ia3_check');
  console.log(`\nGERANDO…  geração=${modeloGeracao}  check=${modeloCheck}\n`);

  const resultados: any[] = [];
  for (const i of aGerar) {
    const r = await gerarCenarioIA3Core(sbRaw, {
      empresaId: emp.id, cargoNome: i.cargo,
      competenciaId: i.competenciaId, pppEscolaId: i.pppEscolaId,
      aiConfig: { model: modeloGeracao },
    });
    if (!r.success) {
      console.log(`  ✗ ${i.cargo} / ${i.escola}: ${r.error}`);
      resultados.push({ ...i, ok: false, erro: r.error });
      continue;
    }
    // "Gerado" NÃO é "aprovado": o check da 2ª IA reprova de verdade — dos 12
    // cenários de Planejamento que existem hoje, 7 passaram. Contar geração
    // como sucesso é a mesma armadilha do job que fecha "N ok, 0 erros".
    const chk = await checkCenarioIA3Core(sbRaw, { cenarioId: r.cenarioId });
    console.log(`  ✓ ${i.cargo} / ${i.escola}: check ${chk.status ?? 'sem check'} ${chk.nota ?? ''}`);
    resultados.push({ ...i, ok: true, cenarioId: r.cenarioId, status: chk.status, nota: chk.nota });
  }

  const aprovados = resultados.filter((r) => r.status === 'aprovado').length;
  console.log(`\n${resultados.filter((r) => r.ok).length} gerado(s) · ${aprovados} aprovado(s) pelo check`);
  if (aprovados < resultados.length) {
    console.log('Os não aprovados precisam de regeneração com o feedback antes de virarem cena.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
