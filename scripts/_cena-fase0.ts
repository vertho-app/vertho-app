/* eslint-disable */
// FASE 0 do Modo Cena — prova headless sobre a régua REAL do Ibipeba.
//
// Nada é persistido, nada é exposto: não há rota, action nem tela chamando o
// núcleo. Este script é o único consumidor. O objetivo é responder duas
// perguntas ANTES de qualquer interface existir:
//
//   1. A cena cobre os 6 descritores? (comando `cena`, campo `semSinal`)
//   2. O personagem sustenta a resistência, ou amolece? (campo `encerramentosNegados`)
//
// E uma terceira, que só apareceu ao ler a régua de verdade:
//
//   3. Quais competências sequer cabem numa cena? (comando `triagem`)
//
// O avaliado é um ALUNO SIMULADO — o mesmo padrão do simulador de temporada
// (`lib/season-engine/simulador-core.ts`): modelo barato instruído a responder
// no nível X. Roda a MESMA cena com um aluno N1 e um aluno N3 e compara. Se as
// notas não separarem, o instrumento não discrimina, e isso custou um dia em
// vez de um piloto inteiro.
//
// Uso:
//   npx tsx scripts/_cena-fase0.ts triagem ibipeba "Gestão Escolar"
//   npx tsx scripts/_cena-fase0.ts cena ibipeba DIR08
//   npx tsx scripts/_cena-fase0.ts cena ibipeba DIR08 --niveis 1,3 --saida cena-dir08.json
process.loadEnvFile('.env.local');

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tenantDb } from '@/lib/tenant-db';
import { resolveTenant } from '@/lib/tenant-resolver';
import { buscarContextoPPP } from '@/lib/ia2-gabarito';
import { callAIChat } from '@/actions/ai-client';
import {
  abrirCena, extrairEvidenciasCena, gerarPersona, transcrever, triarAdequacao, turnoCena,
  type ContextoCena, type DescritorDaRegua, type EstadoCena, type PersonaInterlocutor,
} from '@/lib/season-engine/cena/core';
import { consolidarCena, montarBeatsDaCena, type PerguntaIA3 } from '@/lib/season-engine/cena/beats';
import { promptAlunoSimulado } from '@/lib/season-engine/cena/prompts';
import {
  adquirirLock, baterLock, carregarShards, escreverAtomico, shardPath,
} from '@/lib/season-engine/cena/arquivo';
import { validarSaidaDaCena, saidaConfiavel } from '@/lib/season-engine/cena/validar-saida';
import { medirDitado, TETO_DITADO } from '@/lib/season-engine/cena/ditado';
import { medirFatosAflorados } from '@/lib/season-engine/cena/fatos';
import { auditarAlcancabilidade } from '@/lib/season-engine/cena/blueprint';

// O aluno é OVERHEAD de medição (netável pelo `source: 'simulator'`), mas o
// modelo dele NÃO é escolha de custo — é de validade da medida, por dois motivos:
//
// 1. COLUSÃO DE FAMÍLIA. Interlocutor e extrator são Claude. Um aluno Claude
//    tende a ser lido com complacência por um avaliador da mesma casa, e a nota
//    passa a medir parentesco. `simulador-core.ts` já registra a tentativa de
//    usar gpt-5.6-luna exatamente por isso — abandonada por 401 intermitente na
//    chave sk-proj. Kimi K3 é a alternativa com chave própria e funcionando.
// 2. A PERGUNTA EM ABERTO DA FASE 0. Os três alunos instruídos em N3 saíram N2,
//    e não deu para saber se o extrator é severo ou se o ator é que não sabia
//    encenar N3. Trocar o ator por um modelo de topo separa as duas hipóteses:
//    se as notas subirem, era o ator.
const MODELO_ALUNO = { model: 'kimi-k3' };
const LEDGER_SIM = { source: 'simulator' as const };

const arg = (nome: string, fallback = '') => {
  const i = process.argv.indexOf(`--${nome}`);
  return i > -1 ? String(process.argv[i + 1] ?? fallback) : fallback;
};

// ─────────────────────────────────────────────────────────────────────────────
// Leitura da régua
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve o slug pelo helper do produto em vez de abrir um cliente
 * service-role aqui. Não é preciosismo: `createSupabaseAdmin()` direto num
 * arquivo novo exige entrada na allowlist do guard de CI, e o guard só enxerga
 * arquivo VERSIONADO — a entrada ficaria "com folga" até o commit, deixando o
 * vermelho local que ninguém lê. Sem a chamada direta, não há dívida a declarar.
 */
async function empresaPorSlug(slug: string) {
  const t = await resolveTenant(slug);
  if (!t) throw new Error(`empresa não encontrada: ${slug}`);
  return t as any;
}

/** Os 6 descritores de uma competência, em ordem de cod_desc → índice 1..6. */
async function lerDescritores(empresaId: string, cargo: string, codComp: string): Promise<DescritorDaRegua[]> {
  const tdb = tenantDb(empresaId);
  const { data, error } = await tdb.from('competencias')
    .select('cod_comp, cod_desc, nome, nome_curto, descritor_completo, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia, evidencias_esperadas, perguntas_alvo')
    .eq('cargo', cargo).eq('cod_comp', codComp).order('cod_desc');
  if (error) throw new Error(`descritores ${codComp}: ${error.message}`);
  const linhas = (data || []) as any[];
  if (!linhas.length) throw new Error(`sem descritores para ${cargo} / ${codComp}`);

  return linhas.map((d, i) => ({
    indice: i + 1,
    nomeCurto: d.nome_curto || d.cod_desc || `D${i + 1}`,
    descritorCompleto: d.descritor_completo || '',
    n1: d.n1_gap || '', n2: d.n2_desenvolvimento || '',
    n3: d.n3_meta || '', n4: d.n4_referencia || '',
    evidenciasEsperadas: d.evidencias_esperadas || '',
    perguntasAlvo: d.perguntas_alvo || '',
  }));
}

/**
 * Contexto da organização para a persona. Vem do PPP da REDE, nunca de uma
 * escola sorteada: Ibipeba tem 11 PPPs (1 por escola), e `.limit(1)` aplicaria
 * o projeto de uma unidade à rede inteira, em silêncio.
 */
async function lerContextoEmpresa(empresaId: string, empresa: any): Promise<string> {
  const base = String(empresa?.nome ?? '');
  try {
    const ppp = await buscarContextoPPP(tenantDb(empresaId), { empresaId });
    return [base, ppp].filter(Boolean).join('\n\n');
  } catch {
    return base;
  }
}

/**
 * Escolhe o cenário do banco. Prefere APROVADO pela 2ª IA e ordena por
 * `created_at` — sem `order` explícito, `.limit(1)` devolve o que o planner
 * quiser, e a cena rodaria contra um cenário sorteado a cada execução.
 */
async function lerCenario(empresaId: string, cargo: string, codComp: string) {
  const tdb = tenantDb(empresaId);
  const { data, error } = await tdb.from('banco_cenarios')
    .select('id, titulo, descricao, alternativas, status_check, nota_check, competencia_id, cargo')
    .eq('cargo', cargo).order('created_at', { ascending: false });
  if (error) throw new Error(`banco_cenarios: ${error.message}`);

  const { data: descs, error: errD } = await tdb.from('competencias')
    .select('id').eq('cargo', cargo).eq('cod_comp', codComp);
  if (errD) throw new Error(`competencias: ${errD.message}`);
  const idsDaComp = new Set((descs || []).map((d: any) => d.id));

  const candidatos = (data || []).filter(
    (c: any) => idsDaComp.has(c.competencia_id) && Array.isArray(c.alternativas?.perguntas),
  );
  if (!candidatos.length) throw new Error(`sem cenário com perguntas para ${cargo} / ${codComp}`);

  return (candidatos.find((c: any) => c.status_check === 'aprovado') || candidatos[0]) as any;
}

// ─────────────────────────────────────────────────────────────────────────────
// Aluno simulado
// ─────────────────────────────────────────────────────────────────────────────

async function falaDoAluno(
  cargo: string, nivel: 1 | 2 | 3 | 4, descritores: DescritorDaRegua[], estado: EstadoCena,
) {
  // O papel se inverte: o que o interlocutor disse é 'user' para o aluno.
  const msgs = estado.historico.map((m) => ({
    role: (m.role === 'assistant' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: m.content.replace(/\[META\][\s\S]*?\[\/META\]/g, '').trim(),
  }));
  /**
   * 🔴 3.000 e não 1.200: o Kimi K3 RACIOCINA, e o teto de saída é dividido
   * entre raciocínio e texto. Medido na fase 0e — uma cena morreu com
   * "resposta 200 com conteúdo VAZIO após 138 tokens de saída (123 deles de
   * raciocínio)". O wrapper falha alto nesse caso de propósito (devolver "" faria
   * o chamador tratar como resposta válida), então o sintoma é a cena inteira
   * quebrando no meio — depois de já ter pago todos os turnos anteriores.
   *
   * É a mesma armadilha já registrada para o Opus 5 nos tetos de `MAX_TOKENS`
   * do núcleo, aqui no ator, que ficou de fora quando o modelo trocou.
   */
  return (await callAIChat(promptAlunoSimulado(cargo, nivel, descritores), msgs, MODELO_ALUNO, 3000, {
    temperature: 0.8, reasoningEffort: 'low', taskKey: 'sim_aluno', ...LEDGER_SIM,
  })).trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Comandos
// ─────────────────────────────────────────────────────────────────────────────

async function cmdTriagem(slug: string, cargo: string) {
  const emp = await empresaPorSlug(slug);
  const tdb = tenantDb(emp.id);
  const { data, error } = await tdb.from('competencias')
    .select('cod_comp, nome').eq('cargo', cargo).order('cod_comp');
  if (error) throw new Error(error.message);

  const comps = [...new Map((data as any[]).map((c) => [c.cod_comp, c.nome])).entries()];
  console.log(`\nTRIAGEM DE ADEQUAÇÃO — ${slug} / ${cargo} · ${comps.length} competências\n`);

  const linhas: any[] = [];
  for (const [codComp, nome] of comps) {
    const descritores = await lerDescritores(emp.id, cargo, codComp);
    const t = await triarAdequacao(cargo, String(nome), descritores, { ledger: { empresaId: emp.id } });
    const fora = t?.descritores_que_impedem ?? [];
    const marca = t?.destino === 'cena' ? 'CENA   ' : 'ESCRITO';
    console.log(`${marca}  ${codComp}  ${String(nome).padEnd(46)}${fora.length ? `  impedem: ${fora.map((d) => `D${d}`).join(',')}` : ''}`);
    if (t?.justificativa) console.log(`    ${t.justificativa}`);
    linhas.push({ codComp, nome, ...t });
  }

  /**
   * O roteamento é BINÁRIO por competência, então o relatório é uma LISTA DE
   * DESTINOS — não um ranking.
   *
   * ⚠️ A versão anterior ranqueava por "quantos descritores caem fora", porque
   * o prompt mandava preferir "parcial" na dúvida e as 13 competências voltavam
   * parciais, deixando o rótulo inútil para escolher. Com destino binário o
   * rótulo volta a decidir; o contador vira diagnóstico de POR QUE foi para o
   * escrito, não critério de escolha.
   */
  const impedem = (l: any) => (Array.isArray(l?.descritores_que_impedem) ? l.descritores_que_impedem : []);
  const naCena = linhas.filter((l) => l.destino === 'cena');
  const noEscrito = linhas.filter((l) => l.destino !== 'cena');
  console.log(`${'='.repeat(72)}`);
  console.log(`ROTEAMENTO — ${naCena.length} para a CENA, ${noEscrito.length} para o CENÁRIO ESCRITO`);
  console.log('');
  for (const l of naCena) console.log(`  CENA     ${l.codComp}  ${String(l.nome).slice(0, 50)}`);
  for (const l of noEscrito) {
    const ds = impedem(l);
    console.log(`  ESCRITO  ${l.codComp}  ${String(l.nome).slice(0, 44)}` +
      `${ds.length ? `  — impedem: ${ds.map((d: number) => `D${d}`).join(',')}` : ''}`);
  }
  console.log('');
  const saida = arg('saida', `triagem-${slug}-${codigoArquivo(cargo)}.json`);
  writeFileSync(saida, JSON.stringify(linhas, null, 2));
  console.log(`→ ${saida}`);
}

const codigoArquivo = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function rodarUmaCena(
  ctx: ContextoCena, persona: PersonaInterlocutor, cargo: string, nivel: 1 | 2 | 3 | 4, teto: number,
  empresaId: string,
) {
  const opts = { tetoTurnos: teto, ledger: { empresaId } };
  let { estado, fala } = abrirCena(persona, ctx.beats[0].numero);
  console.log(`\n  [N${nivel}] INTERLOCUTOR: ${fala}`);

  while (!estado.concluida) {
    const msg = await falaDoAluno(cargo, nivel, ctx.descritores, estado);
    console.log(`  [N${nivel}] AVALIADO: ${msg}`);
    const r = await turnoCena(ctx, persona, estado, msg, opts);
    estado = r.estado;
    if (r.barrado) { console.log(`  [N${nivel}] << guarda barrou: ${r.barrado.veredito} >>`); continue; }
    console.log(`  [N${nivel}] INTERLOCUTOR: ${r.fala}`);
  }

  const extracao = await extrairEvidenciasCena(ctx, estado, opts);
  // A consolidação recebe os beats que REALMENTE aconteceram: descritor cujo
  // momento não foi criado é lacuna, mesmo que o extrator tenha escrito nota.
  const consolidacao = extracao
    ? consolidarCena(extracao.evidencias, ctx.descritores.length,
        { beats: ctx.beats, beatsCumpridos: estado.beatsCumpridos,
          observaveis: ctx.descritoresObservaveis })
    : null;
  /**
   * VALIDA ANTES DE DEIXAR VIRAR NÚMERO.
   *
   * Três rodadas de medição foram perdidas porque nada olhava o resultado —
   * média e nível sempre saem, inclusive sobre entrada sem sentido. Agora cada
   * cena é auditada, as violações viajam no JSON, e o relatório recusa agregar
   * se houver erro.
   */
  const violacoes = extracao && consolidacao
    ? validarSaidaDaCena({
        numDescritores: ctx.descritores.length,
        totalBeats: ctx.beats.length,
        turnos: estado.turno,
        beatsCumpridos: estado.beatsCumpridos,
        contrato: {
          armadilha: ctx.cenario.armadilhaGenerica,
          tradeoff: ctx.cenario.tradeoffTestado,
          complicador: ctx.cenario.fatorComplicador,
        },
        evidencias: extracao.evidencias,
        consolidacao,
        falasDoAvaliado: estado.historico.filter((m) => m.role === 'user').map((m) => m.content),
        historico: estado.historico,
        modo: ctx.modo,
      })
    : [{ severidade: 'erro' as const, campo: 'extracao', detalhe: 'extração ausente' }];

  const erros = violacoes.filter((x) => x.severidade === 'erro');
  const avisos = violacoes.filter((x) => x.severidade === 'aviso');
  if (erros.length) {
    console.log(`  [N${nivel}] ✗ SAÍDA INVÁLIDA — ${erros.length} erro(s):`);
    erros.slice(0, 8).forEach((x) => console.log(`        ${x.campo}: ${x.detalhe.slice(0, 150)}`));
  } else if (avisos.length) {
    console.log(`  [N${nivel}] ⚠ ${avisos.length} aviso(s) — resultado vale, mas leia`);
  }

  return {
    nivel, estado, extracao, consolidacao, violacoes,
    confiavel: saidaConfiavel(violacoes),
    transcricao: transcrever(estado),
  };
}

async function cmdCena(slug: string, codComp: string) {
  const cargo = arg('cargo', 'Gestão Escolar');
  const teto = Number(arg('teto', '14'));
  const niveis = arg('niveis', '1,3').split(',').map((n) => Number(n.trim())) as Array<1 | 2 | 3 | 4>;

  const emp = await empresaPorSlug(slug);
  const descritores = await lerDescritores(emp.id, cargo, codComp);
  const cen = await lerCenario(emp.id, cargo, codComp);
  const alt = cen.alternativas || {};
  /**
   * 🔴 OS CAMPOS FICAM NA RAIZ DE `alternativas`, NÃO EM `.cenario`.
   *
   * `montarAlternativasIA3` grava `tradeoff_testado`, `fator_complicador`,
   * `armadilha_de_resposta_generica` e `mapa_cobertura_descritores` no primeiro
   * nível; a chave `cenario` NÃO EXISTE em nenhuma linha do banco (conferido).
   * Ler `alt.cenario.*` devolvia `undefined` para tudo, e o `|| ''` transformava
   * isso em string vazia — sem erro, sem log, sem nada na tela.
   *
   * O custo foi real: as 20 cenas da fase 0 rodaram com a persona e o
   * interlocutor CEGOS à armadilha de resposta genérica, que é justamente o que
   * o personagem existe para recusar. O resultado "o personagem não amoleceu"
   * veio da teimosia do prompt, não do desenho. É a mesma classe de erro que
   * este projeto já tinha catalogado: ler campo que ninguém escreve.
   *
   * `.cenario` fica como fallback porque cenários antigos podem ter outra forma.
   */
  const cenObj = { ...(alt.cenario || {}), ...alt };

  /**
   * Quais descritores ESTA cena observa — decisão HUMANA, via `--observaveis`.
   *
   * A auditoria de `blueprint.ts` levanta a suspeita; ela não decide. Sem a
   * flag, a cena roda como antes (todos observáveis) e a suspeita é IMPRESSA:
   * o custo de não declarar tem de aparecer na tela, senão o teto de desenho
   * volta a ser lido como gap da pessoa.
   */
  const observaveis = arg('observaveis')
    ? arg('observaveis').split(',').map((n) => Number(n.trim())).filter(Number.isInteger)
    : undefined;
  const suspeitas = auditarAlcancabilidade(descritores);
  if (suspeitas.length && !observaveis) {
    console.log('\n⚠️  A auditoria de alcançabilidade levantou suspeita nestes descritores:');
    for (const sp of suspeitas) {
      console.log(`     D${sp.indice} ${sp.nomeCurto} — ${sp.risco} [${sp.marcador}]`);
    }
    console.log('     Rodando SEM --observaveis: eles entram na média como se a cena os medisse.');
  } else if (observaveis) {
    const fora = descritores.map((d) => d.indice).filter((i) => !observaveis.includes(i));
    console.log(`
→ cena observa D${observaveis.join(' D')}` +
      `${fora.length ? `  · fora do alcance: D${fora.join(' D')}` : ''}`);
  }

  const { beats, erros } = montarBeatsDaCena((alt.perguntas || []) as PerguntaIA3[], descritores.length, observaveis);
  if (erros.length) {
    // Falha alta na construção: cena montada sobre cenário com buraco produziria
    // nota com lacuna silenciosa, e nota vira PDI e trilha.
    console.error(`\nCENÁRIO INADEQUADO (${cen.id}):`);
    erros.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  const ctx: ContextoCena = {
    cargo,
    competencia: String(alt.competencia_nome || cenObj.competencia || codComp),
    contextoEmpresa: await lerContextoEmpresa(emp.id, emp),
    cenario: {
      titulo: cen.titulo || cenObj.titulo || '',
      contexto: cenObj.contexto || cen.descricao || '',
      tradeoffTestado: cenObj.tradeoff_testado || '',
      fatorComplicador: cenObj.fator_complicador || '',
      armadilhaGenerica: cenObj.armadilha_de_resposta_generica || '',
      stakeholders: cenObj.stakeholders_centrais || [],
    },
    descritores,
    beats,
    descritoresObservaveis: observaveis,
  };

  console.log(`\nCENA — ${slug} / ${cargo} / ${codComp}`);
  console.log(`Cenário: "${ctx.cenario.titulo}" (${cen.status_check ?? 'sem check'}${cen.nota_check ? ` ${cen.nota_check}` : ''})`);
  console.log(`Cobertura declarada: ${beats.map((b) => `beat${b.numero}→${b.descritores.map((d) => `D${d}`).join('+')}`).join('  ')}`);

  /**
   * A MESMA persona nos dois braços — e, com `--persona`, a mesma ENTRE RODADAS.
   *
   * 🔴 O comentário antigo parava na primeira metade e o código também: dentro
   * de uma execução a persona é única, mas `gerarPersona` é uma chamada de IA
   * no início de CADA execução. Medido em 25/08/2026, lendo os artefatos:
   *
   *     0c → Edileuza Nascimento
   *     0d → Fátima Nogueira
   *     0e → Fátima Nascimento
   *
   * Nomes, primeira fala e — o que importa — `o_que_faz_ceder` diferentes. Eu
   * publiquei "único fator alterado entre 0d e 0e: o encerramento" e isso era
   * FALSO: mudou o encerramento E o personagem. Toda comparação entre rodadas
   * que eu apresentei como contraste controlado é, na verdade, confundida —
   * inclusive a tabela que atribuía 0,10 ao andaime e 0,01 ao encerramento.
   *
   * Com `--persona <arquivo.json>` a rodada reusa a persona gravada, e aí o
   * contraste passa a ter só a variável que se quer medir. Sem a flag, gera
   * nova e AVISA, para ninguém repetir o meu erro por omissão.
   */
  const personaDe = arg('persona');
  let persona: PersonaInterlocutor;
  if (personaDe) {
    const anterior = JSON.parse(readFileSync(personaDe, 'utf-8'));
    if (!anterior?.persona?.o_que_faz_ceder) {
      throw new Error(`${personaDe} não tem persona gravada — comparação controlada exige a persona da rodada anterior`);
    }
    persona = anterior.persona as PersonaInterlocutor;
    console.log(`\n↺ persona REUSADA de ${personaDe} — contraste controlado`);
  } else {
    persona = await gerarPersona(ctx, { ledger: { empresaId: emp.id } });
    console.log('\n⚠️  persona NOVA (sem --persona): esta rodada NÃO é comparável com as anteriores');
  }
  console.log(`\nInterlocutor: ${persona.quem} (${persona.relacao})`);
  console.log(`Cede quando: ${persona.o_que_faz_ceder}`);

  const saidaParcial = arg('saida', `cena-${slug}-${codComp.toLowerCase()}.json`);
  const payload = (rs: any[]) => ({ cenarioId: cen.id, ctx: { ...ctx, descritores }, persona, rodadas: rs });
  const gravarCombinado = (rs: any[]) => {
    escreverAtomico(saidaParcial, payload(rs));
    const bytes = existsSync(saidaParcial) ? statSync(saidaParcial).size : 0;
    console.log(`  … ${rs.length}/${niveis.length} cenas no combinado ${saidaParcial} (${bytes} bytes)`);
  };

  /**
   * Grava CADA cena num shard atômico (`foo.r06.json`) ANTES de atualizar o
   * combinado. Retoma do primeiro shard ausente. Dois processos no mesmo
   * `--saida` batem no lock.
   *
   * 🔴 Fase 0c (25/08/2026): o log dizia 10, o arquivo tinha 9, a linha "6/10"
   * nunca saiu. `writeFileSync` truncava o destino; restart começava
   * `rodadas = []` e apagava o que já existia; dois processos se sobrescreviam.
   */
  const unlock = adquirirLock(saidaParcial);
  let rodadas: any[] = [];
  try {
    rodadas = carregarShards(saidaParcial, niveis.length) as any[];
    if (rodadas.length) {
      console.log(`  ↺ retomando de ${rodadas.length}/${niveis.length} shards já gravados`);
    }
    for (let i = rodadas.length; i < niveis.length; i++) {
      const nivel = niveis[i];
      const n = i + 1;
      console.log(`  ▶ cena ${n}/${niveis.length} N${nivel} — começando`);
      let r: any;
      try {
        r = await rodarUmaCena(ctx, persona, cargo, nivel, teto, emp.id);
      } catch (e: any) {
        r = {
          nivel, erro: String(e?.stack || e), confiavel: false,
          consolidacao: null, extracao: null, estado: null, transcricao: '',
          violacoes: [{ severidade: 'erro', campo: 'execucao', detalhe: String(e) }],
        };
        console.log(`  [N${nivel}] ✗ CENA ${n} QUEBROU — shard gravado como erro, as outras seguem`);
        console.log(`        ${String(e).slice(0, 200)}`);
      }
      const shard = shardPath(saidaParcial, n);
      escreverAtomico(shard, r);
      // Batimento: prova para a próxima retomada que este dono estava vivo.
      // Sem ele, o lock só teria o pid — e pid morto volta como "vivo" no Windows.
      baterLock(saidaParcial);
      rodadas.push(r);
      gravarCombinado(rodadas);
      console.log(`  ✔ cena ${n}/${niveis.length} shard ${shard}`);
    }
  } finally {
    unlock();
  }

  console.log(`\n${'═'.repeat(72)}\nRELATÓRIO DA FASE 0\n${'═'.repeat(72)}`);
  for (const r of rodadas) {
    if (r.erro || !r.estado) {
      console.log(`\n[aluno N${r.nivel}]  ✗ QUEBROU: ${String(r.erro || 'sem estado').slice(0, 180)}`);
      continue;
    }
    const c = r.consolidacao;
    console.log(`\n[aluno N${r.nivel}]  turnos ${r.estado.turno}  fim: ${r.estado.motivoFim}`);
    console.log(`  beats cumpridos:      ${r.estado.beatsCumpridos.join(', ') || 'nenhum'}`);
    console.log(`  cobertura:            ${c ? `${c.cobertura.medidos}/${c.cobertura.total}` : 'sem extração'}`);
    console.log(`  descritores sem sinal:${c?.semSinal.length ? ' ' + c.semSinal.map((d: number) => `D${d}`).join(', ') : ' nenhum'}`);
    if (c?.foraDoAlcance.length) {
      console.log(`  FORA DO ALCANCE:      ${c.foraDoAlcance.map((d: number) => `D${d}`).join(', ')} — a cena não os observa (não é gap da pessoa)`);
    }
    console.log(`  AUTONOMIA (rótulo):   ${c?.media ?? '—'} / ${c?.nivel ? `N${c.nivel}` : '—'}${c?.nivelSuprimidoPorque ? ` (suprimido: ${c.nivelSuprimidoPorque})` : ''}`);
    console.log(`  assistido (fim):      ${c?.encerramento.media ?? '—'} / ${c?.encerramento.nivel ? `N${c.encerramento.nivel}` : '—'}`);
    // Os dois observáveis do pré-registro da 0d. Sem eles a rodada não responde
    // o que ela foi feita para responder — e "o observável existe ANTES" é regra
    // desta base, não zelo.
    const dit = medirDitado(r.extracao?.evidencias ?? [], r.estado.historico);
    console.log(`  ditação nas citações: ${dit.ditadas}/${dit.ditadas + dit.proprias}` +
      `${dit.taxa == null ? ' (indecidível)' : ` = ${(100 * dit.taxa).toFixed(0)}%`}` +
      `${dit.taxa != null && dit.taxa > TETO_DITADO ? '  🔴 ACIMA DO TETO' : ''}`);
    const mf = medirFatosAflorados(
      persona.fatos?.enterrados, r.estado.historico,
      (r.estado.fatosRevelados ?? []).map((x: any) => x.descritor),
    );
    console.log(`  FATOS AFLORADOS:      ${mf.aflorados}/${mf.total}` +
      `${mf.porFato.length ? '  ' + mf.porFato.filter((f) => f.aflorou).map((f) => `D${f.descritor}`).join(' ') : ''}` +
      `${mf.divergentes.length ? `  ⚠ divergem: ${mf.divergentes.map((d) => `D${d}`).join(' ')}` : ''}`);
    console.log(`  interlocutor ditou:   ${r.estado.ditados.length}${r.estado.ditados.length ? ' ' + r.estado.ditados.map((d: any) => `t${d.turno}(${d.elemento})`).join(' ') : ''}`);
    console.log(`  encerramentos negados:${r.estado.encerramentosNegados.length} ${r.estado.encerramentosNegados.map((e: any) => `t${e.turno}/beat${e.beat}`).join(' ')}`);
    console.log(`  guarda barrou:        ${r.estado.bloqueios.length}`);
  }

  const invalidas = rodadas.filter((r: any) => !r.confiavel);
  if (invalidas.length) {
    console.log(`\n🔴 ${invalidas.length} de ${rodadas.length} cenas com SAÍDA INVÁLIDA.`);
    console.log('   Nenhuma agregação é publicada — três rodadas já foram perdidas por');
    console.log('   confiar num número que sempre sai. Corrija a causa e rode de novo.');
    console.log(`\n→ ${saidaParcial} (para diagnóstico)\n`);
    return;
  }

  /**
   * O agregado do pré-registro da 0d: por braço, autonomia e assistido, e as
   * duas taxas que dizem se a cena vale como medida. Impasse e turnos entram
   * porque foram PREVISTOS para subir — sem a linha, "subiu" vira impressão.
   */
  const braços = [...new Set(rodadas.map((r: any) => r.nivel))].sort();
  if (braços.length) {
    const md = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : '—');
    console.log(`
${'─'.repeat(72)}
POR BRAÇO
`);
    console.log('ator  n   autonomia            assistido   turnos  desfechos                 fatos   ditação');
    for (const nv of braços) {
      const g = rodadas.filter((r: any) => r.nivel === nv && r.consolidacao);
      if (!g.length) continue;
      const aut = md(g.map((r: any) => r.consolidacao.media).filter((n: any) => n != null));
      const ass = md(g.map((r: any) => r.consolidacao.encerramento.media).filter((n: any) => n != null));
      const turnos = md(g.map((r: any) => r.estado.turno));
      /**
       * DESFECHOS, não só impasse. Na 0d duas das três cenas N1 terminaram em
       * RUPTURA e a tabela só tinha coluna de impasse — o desfecho mais
       * dramático da rodada não aparecia em lugar nenhum. Ruptura vai acontecer
       * com gente real, e a política de retomada depende de saber quanto.
       */
      const desfechos = ['acordo', 'ruptura', 'impasse', 'teto']
        .map((m) => [m, g.filter((r: any) => r.estado.motivoFim === m).length] as const)
        .filter(([, n]) => n > 0)
        .map(([m, n]) => `${m}×${n}`)
        .join(' ') || '—';
      const fatos = g.map((r: any) => medirFatosAflorados(
        persona.fatos?.enterrados, r.estado.historico,
        (r.estado.fatosRevelados ?? []).map((x: any) => x.descritor),
      ));
      const fatosMed = fatos.length
        ? (fatos.reduce((a, f) => a + f.aflorados, 0) / fatos.length).toFixed(1) + '/' + (fatos[0]?.total ?? 0)
        : '—';
      const taxas = g.map((r: any) => medirDitado(r.extracao?.evidencias ?? [], r.estado.historico).taxa)
        .filter((t: any): t is number => t != null);
      const niveis = g.map((r: any) => `N${r.consolidacao.nivel ?? '-'}`).join(' ');
      console.log(`N${nv}    ${String(g.length).padEnd(3)} ${aut} [${niveis}]   ${ass}       ${turnos}    ` +
        `${desfechos.padEnd(25)} ${fatosMed.padEnd(7)} ${taxas.length ? (100 * taxas.reduce((a, b) => a + b, 0) / taxas.length).toFixed(0) + '%' : '—'}`);
    }
  }

  /**
   * Discriminação = distância entre as MÉDIAS dos braços.
   *
   * 🔴 Corrigido 25/08/2026: a versão anterior pegava a primeira e a última
   * cena da lista. Com uma cena por braço isso era a média; com n=3 virou
   * "sorteia uma de cada lado" — na 0d imprimiu delta 0,83 comparando duas
   * cenas individuais, quando a distância entre as médias é 0,86. Número
   * apresentado como conclusão tem de ser calculado como conclusão.
   */
  const comNota = rodadas.filter((r: any) => r.consolidacao?.media != null);
  const porNivel = new Map<number, number[]>();
  for (const r of comNota) porNivel.set(r.nivel, [...(porNivel.get(r.nivel) ?? []), r.consolidacao.media]);
  const medias = [...porNivel.entries()]
    .map(([nv, xs]) => ({ nv, m: xs.reduce((a, b) => a + b, 0) / xs.length, n: xs.length }))
    .sort((a, b) => a.nv - b.nv);
  if (medias.length >= 2) {
    const baixo = medias[0], alto = medias[medias.length - 1];
    const delta = Number((alto.m - baixo.m).toFixed(2));
    console.log(`\nDISCRIMINAÇÃO (autonomia, médias por braço)`);
    console.log(`  N${baixo.nv}=${baixo.m.toFixed(2)} (n=${baixo.n})   N${alto.nv}=${alto.m.toFixed(2)} (n=${alto.n})   delta=${delta}`);
    /**
     * 🔴 Veredito só a partir de n=3 por braço.
     *
     * A versão anterior imprimia "o instrumento separa os níveis" com UMA cena
     * de cada lado. É ruído com duas casas: na fase 0e uma única cena moveu a
     * folga entre os braços de 0,56 para 0,26. Julgamento de discriminação
     * sobre n=1 é a mesma classe do `.limit()` que decide — conclusão sorteada,
     * com cara de medida.
     */
    const MIN_POR_BRACO = 3;
    if (baixo.n < MIN_POR_BRACO || alto.n < MIN_POR_BRACO) {
      console.log(`  → SEM VEREDITO: ${MIN_POR_BRACO} cenas por braço é o mínimo. ` +
        'Com n menor, uma cena move o delta mais que o instrumento.');
    } else {
      console.log(delta >= 0.5
        ? '  → o instrumento separa os níveis.'
        : '  → NÃO separa. A cena não discrimina; corrigir o prompt antes de seguir.');
    }
  }

  gravarCombinado(rodadas);
  console.log(`\n→ ${saidaParcial}\n`);
}

async function main() {
  const cmd = process.argv[2];
  const slug = process.argv[3];
  if (cmd === 'triagem') return cmdTriagem(slug, process.argv[4] || 'Gestão Escolar');
  if (cmd === 'cena') return cmdCena(slug, process.argv[4]);
  console.log('uso: _cena-fase0.ts triagem <slug> "<cargo>"');
  console.log('     _cena-fase0.ts cena <slug> <COD_COMP> [--cargo "..."] [--niveis 1,3] [--teto 14]');
  process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
