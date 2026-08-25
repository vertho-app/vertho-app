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

import { writeFileSync } from 'node:fs';
import { tenantDb } from '@/lib/tenant-db';
import { resolveTenant } from '@/lib/tenant-resolver';
import { buscarContextoPPP } from '@/lib/ia2-gabarito';
import { callAIChat } from '@/actions/ai-client';
import {
  abrirCena, extrairEvidenciasCena, gerarPersona, transcrever, triarAdequacao, turnoCena,
  type ContextoCena, type DescritorDaRegua, type EstadoCena, type PersonaInterlocutor,
} from '@/lib/season-engine/cena/core';
import { consolidarCena, montarBeatsDaCena, type PerguntaIA3 } from '@/lib/season-engine/cena/beats';
import { validarSaidaDaCena, saidaConfiavel } from '@/lib/season-engine/cena/validar-saida';

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

function systemAluno(cargo: string, nivel: 1 | 2 | 3 | 4, descritores: DescritorDaRegua[]) {
  const faixa = { 1: 'n1', 2: 'n2', 3: 'n3', 4: 'n4' }[nivel] as 'n1' | 'n2' | 'n3' | 'n4';
  return `Você é ${cargo} e está numa conversa difícil de trabalho, ao vivo.

Você NÃO é assistente. Você é esta pessoa, respondendo em tempo real.

═══ SEU NÍVEL DE MATURIDADE ═══
Você se comporta EXATAMENTE assim — nem melhor, nem pior:
${descritores.map((d) => `- ${d.nomeCurto}: ${d[faixa]}`).join('\n')}

═══ COMO RESPONDER ═══
- Português do Brasil, primeira pessoa, no máximo 70 palavras.
- Fala de conversa, não de redação. Sem títulos, sem listas, sem "em primeiro lugar".
- Não narre o que você está fazendo. Fale.
- NUNCA mencione nível, competência, descritor, avaliação ou que isto é uma simulação.
- Se o seu nível é baixo, deixe as fraquezas aparecerem naturalmente: generalize,
  desconverse, prometa sem critério, ceda cedo ou endureça sem escutar. Não corrija o rumo.`;
}

async function falaDoAluno(
  cargo: string, nivel: 1 | 2 | 3 | 4, descritores: DescritorDaRegua[], estado: EstadoCena,
) {
  // O papel se inverte: o que o interlocutor disse é 'user' para o aluno.
  const msgs = estado.historico.map((m) => ({
    role: (m.role === 'assistant' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: m.content.replace(/\[META\][\s\S]*?\[\/META\]/g, '').trim(),
  }));
  return (await callAIChat(systemAluno(cargo, nivel, descritores), msgs, MODELO_ALUNO, 1200, {
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
    const fora = t?.se_parcial_quais_descritores_ficam_de_fora ?? [];
    const marca = { adequada: '++', parcial: ' ~', inadequada: '--' }[t?.veredito ?? 'parcial'] ?? ' ?';
    console.log(`${marca}  ${codComp}  ${String(nome).padEnd(46)} ${t?.veredito ?? 'erro'}${fora.length ? `  (fora: ${fora.map((d) => `D${d}`).join(',')})` : ''}`);
    if (t?.justificativa) console.log(`    ${t.justificativa}`);
    linhas.push({ codComp, nome, ...t });
  }

  // ⚠️ NÃO ranquear pelo RÓTULO. Na 1ª rodada (24/08) as 13 competências
  // voltaram "parcial" — o prompt manda preferir "parcial" na dúvida — e o
  // resumo dizia "0 de 13 adequadas", inútil para escolher. O que separa é
  // QUANTOS descritores caem fora: variou de 1 a 4, e o check da 2ª IA depois
  // confirmou a ordem, reprovando DIR08, que a triagem punha com 3 fora.
  const contarFora = (l: any) => {
    const declarados = Array.isArray(l?.se_parcial_quais_descritores_ficam_de_fora)
      ? l.se_parcial_quais_descritores_ficam_de_fora.length : 0;
    const porDescritor = Array.isArray(l?.por_descritor)
      ? l.por_descritor.filter((d: any) => d?.cabe === 'nao').length : 0;
    // O maior dos dois: o modelo às vezes preenche só um dos campos.
    return Math.max(declarados, porDescritor);
  };
  const ranking = [...linhas].sort((a, b) => contarFora(a) - contarFora(b));
  console.log('\nRANKING — quantos descritores a cena NÃO alcança (menor é melhor)\n');
  for (const l of ranking) {
    const parciais = Array.isArray(l?.por_descritor)
      ? l.por_descritor.filter((d: any) => d?.cabe === 'parcial').length : 0;
    console.log(`  ${contarFora(l)} fora · ${parciais} parcial   ${l.codComp}  ${String(l.nome).slice(0, 44)}`);
  }
  const melhor = ranking[0];
  console.log(`\nMelhor candidata: ${melhor?.codComp} — ${melhor?.nome} (${contarFora(melhor)} fora)\n`);
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
        { beats: ctx.beats, beatsCumpridos: estado.beatsCumpridos })
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

  const { beats, erros } = montarBeatsDaCena((alt.perguntas || []) as PerguntaIA3[], descritores.length);
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
  };

  console.log(`\nCENA — ${slug} / ${cargo} / ${codComp}`);
  console.log(`Cenário: "${ctx.cenario.titulo}" (${cen.status_check ?? 'sem check'}${cen.nota_check ? ` ${cen.nota_check}` : ''})`);
  console.log(`Cobertura declarada: ${beats.map((b) => `beat${b.numero}→${b.descritores.map((d) => `D${d}`).join('+')}`).join('  ')}`);

  // A MESMA persona nos dois braços: se cada nível enfrentasse um interlocutor
  // diferente, a diferença de nota poderia ser do personagem, não do avaliado.
  const persona = await gerarPersona(ctx, { ledger: { empresaId: emp.id } });
  console.log(`\nInterlocutor: ${persona.quem} (${persona.relacao})`);
  console.log(`Cede quando: ${persona.o_que_faz_ceder}`);

  const saidaParcial = arg('saida', `cena-${slug}-${codComp.toLowerCase()}.json`);
  const gravar = (rs: any[]) => writeFileSync(
    saidaParcial,
    JSON.stringify({ cenarioId: cen.id, ctx: { ...ctx, descritores }, persona, rodadas: rs }, null, 2),
  );

  /**
   * Grava DEPOIS DE CADA CENA, não no fim.
   *
   * 🔴 Custo medido (24/08/2026): uma rodada de n=5 foi interrompida com 9 das
   * 10 cenas já extraídas, e **US$ 3,48 viraram zero resultado** — o script
   * montava `rodadas` em memória e só serializava na última linha. Trabalho de
   * 40 minutos que não sobrevive a um Ctrl+C não é medição, é aposta.
   *
   * O arquivo parcial também serve de retomada: dá para ler o que já rodou em
   * vez de repagar tudo.
   */
  const rodadas: any[] = [];
  for (const nivel of niveis) {
    rodadas.push(await rodarUmaCena(ctx, persona, cargo, nivel, teto, emp.id));
    gravar(rodadas);
    console.log(`  … ${rodadas.length}/${niveis.length} cenas gravadas em ${saidaParcial}`);
  }

  console.log(`\n${'═'.repeat(72)}\nRELATÓRIO DA FASE 0\n${'═'.repeat(72)}`);
  for (const r of rodadas) {
    const c = r.consolidacao;
    console.log(`\n[aluno N${r.nivel}]  turnos ${r.estado.turno}  fim: ${r.estado.motivoFim}`);
    console.log(`  beats cumpridos:      ${r.estado.beatsCumpridos.join(', ') || 'nenhum'}`);
    console.log(`  cobertura:            ${c ? `${c.cobertura.medidos}/${c.cobertura.total}` : 'sem extração'}`);
    console.log(`  descritores sem sinal:${c?.semSinal.length ? ' ' + c.semSinal.map((d: number) => `D${d}`).join(', ') : ' nenhum'}`);
    console.log(`  nota média / nível:   ${c?.media ?? '—'} / ${c?.nivel ? `N${c.nivel}` : '—'}`);
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

  const comNota = rodadas.filter((r) => r.consolidacao?.media != null);
  if (comNota.length >= 2) {
    const menor = comNota[0], maior = comNota[comNota.length - 1];
    const delta = Number((maior.consolidacao.media - menor.consolidacao.media).toFixed(2));
    console.log(`\nDISCRIMINAÇÃO  N${menor.nivel}=${menor.consolidacao.media}  N${maior.nivel}=${maior.consolidacao.media}  delta=${delta}`);
    console.log(delta >= 0.5
      ? '  → o instrumento separa os níveis.'
      : '  → NÃO separa. A cena não discrimina; corrigir o prompt antes de seguir.');
  }

  const saida = arg('saida', `cena-${slug}-${codComp.toLowerCase()}.json`);
  writeFileSync(saida, JSON.stringify({ cenarioId: cen.id, ctx: { ...ctx, descritores }, persona, rodadas }, null, 2));
  console.log(`\n→ ${saida}\n`);
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
