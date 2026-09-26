/**
 * O check que faltava no bloco C.
 *
 * O exercício de custo/qualidade de 25-27/08 nasceu de "os artefatos
 * IRREVERSÍVEIS não têm auditor" — e depois passou três dias otimizando modelos
 * DENTRO desse buraco. O PDI é o caso mais agudo: sai em PDF, vai para a pessoa
 * avaliada, e nada confere o que o gerador escreveu.
 *
 * Estes testes cobrem a camada ESTRUTURAL, que é a que mais paga: verifica as
 * promessas LITERAIS do prompt (`acao_principal` igual à do blueprint,
 * `checklist` com 3 itens, 2ª pessoa, sem jargão em inglês). O que um `===`
 * resolve não deve custar uma chamada de IA.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DUAL_IA_PARES, DEFAULT_TASK_MODELS, familiaDoModelo } from '@/lib/ai-tasks';
import {
  aplicarSprintDoBlueprint, auditarPdiEstrutural, combinarRodadasSemanticas, consolidarAuditoriaPdi,
  PDI_AUDIT_SYSTEM, RODADAS_SEMANTICAS, type ObjetivoBlueprint, type PdiAuditCheck,
} from '@/lib/relatorios/pdi-audit';

const OBJETIVOS: ObjetivoBlueprint[] = [{
  competencia: 'Comunicação Assertiva',
  acao_principal: 'Conduzir uma conversa de alinhamento por semana com a equipe',
  acao_apoio: 'Registrar os acordos por escrito no mesmo dia',
  ritual: 'Revisão de 10 minutos toda sexta',
}];

function pdiBom(): any {
  return {
    perfil_comportamental: { descricao: 'Elizângela, seu perfil combina firmeza e escuta.' },
    mensagem_final: 'Pequenas mudanças geram grande impacto.',
    competencias: [{
      nome: 'Comunicação Assertiva',
      nivel: 2,
      flag: true,
      melhorar: ['Fechar a conversa com um acordo explícito'],
      dicas_desenvolvimento: ['Quando sentir resistência, diga: me ajuda a entender.'],
      feedback: 'Você sustenta bem a posição e às vezes deixa o combinado implícito.',
      sprint: {
        acao_principal: 'Conduzir uma conversa de alinhamento por semana com a equipe',
        acao_apoio: 'Registrar os acordos por escrito no mesmo dia',
        ritual: 'Revisão de 10 minutos toda sexta',
        checklist: ['Marcar a conversa', 'Registrar o acordo', 'Revisar na sexta'],
      },
      estudo_recomendado: [{ titulo: 'Devolutiva que sustenta o combinado' }],
    }],
  };
}

const id = (checks: any[], k: string) => checks.find((c) => c.id === k)!;

describe('auditoria estrutural do PDI', () => {
  it('um PDI íntegro passa em tudo', () => {
    const checks = auditarPdiEstrutural(pdiBom(), OBJETIVOS);
    expect(checks.filter((c) => c.status !== 'pass')).toEqual([]);
    expect(consolidarAuditoriaPdi(checks, 1).status).toBe('pass');
  });

  // Este é o check que justifica o arquivo: o prompt manda COPIAR a ação do
  // blueprint ("acao_principal ← acao_principal (igual)"). Se o modelo
  // reescreve, o PDI promete um movimento que a trilha não sustenta — e nada
  // no produto notava.
  it('🔴 pega o sprint reescrito em vez de copiado do blueprint', () => {
    const pdi = pdiBom();
    pdi.competencias[0].sprint.acao_principal = 'Fazer reuniões mais frequentes com o time';
    const c = id(auditarPdiEstrutural(pdi, OBJETIVOS), 'sprint-do-blueprint');
    expect(c.status).toBe('fail');
    expect(c.ocorrencias[0]).toContain('acao_principal');
  });

  it('gap sem caminho é FALHA, não aviso', () => {
    const pdi = pdiBom();
    pdi.competencias[0].melhorar = [];
    const c = id(auditarPdiEstrutural(pdi, OBJETIVOS), 'gap-sem-acao');
    expect(c.status).toBe('fail');
    expect(c.ocorrencias).toContain('Comunicação Assertiva');
  });

  it('competência SEM flag e sem "melhorar" não é acusada', () => {
    const pdi = pdiBom();
    pdi.competencias[0].flag = false;
    pdi.competencias[0].melhorar = [];
    expect(id(auditarPdiEstrutural(pdi, OBJETIVOS), 'gap-sem-acao').status).toBe('pass');
  });

  it('checklist fora de 3 itens', () => {
    const pdi = pdiBom();
    pdi.competencias[0].sprint.checklist = ['só um'];
    const c = id(auditarPdiEstrutural(pdi, OBJETIVOS), 'checklist-3');
    expect(c.status).toBe('warn');
    expect(c.ocorrencias[0]).toContain('1 item');
  });

  it('perfil em 3ª pessoa — o prompt proíbe nominalmente', () => {
    const pdi = pdiBom();
    pdi.perfil_comportamental.descricao = 'O perfil de Elizângela combina firmeza e escuta.';
    expect(id(auditarPdiEstrutural(pdi, OBJETIVOS), 'perfil-2a-pessoa').status).toBe('warn');
  });

  it('jargão em inglês no texto entregue', () => {
    const pdi = pdiBom();
    pdi.competencias[0].feedback = 'Seu feedback ao time é direto.';
    const c = id(auditarPdiEstrutural(pdi, OBJETIVOS), 'jargao-ingles');
    expect(c.status).toBe('warn');
    expect(c.ocorrencias[0]).toContain('feedback');
  });

  // ⚠️ Substring pega "casos", "casa", "casamento". Um auditor que acusa
  // "casos" ensina todo mundo a ignorá-lo — que é pior que não existir.
  it('NÃO acusa jargão dentro de palavra portuguesa', () => {
    const pdi = pdiBom();
    pdi.competencias[0].feedback = 'Em casos assim, a casa toda percebe o insighter.';
    expect(id(auditarPdiEstrutural(pdi, OBJETIVOS), 'jargao-ingles').status).toBe('pass');
  });

  // 25/09/2026: o cenário de Macaé entrega à personagem um "feedback escrito", e
  // o PDI que fala DESSE feedback usa a palavra que a pessoa leu (8 de 9
  // ocorrências nos 10 PDIs regerados). Jargão que a fonte já usa não é do gerador.
  it('NÃO acusa o termo que o cenário ou a resposta da pessoa já usam', () => {
    const pdi = pdiBom();
    pdi.competencias[0].feedback = 'Na resposta sobre o feedback escrito da coordenação, você propôs rever o registro.';
    const fonte = 'CENÁRIO: Renata entrega um feedback escrito apontando registros incompletos.';
    expect(id(auditarPdiEstrutural(pdi, OBJETIVOS, fonte), 'jargao-ingles').status).toBe('pass');
  });

  it('continua acusando o jargão que o gerador trouxe por conta própria', () => {
    const pdi = pdiBom();
    pdi.competencias[0].feedback = 'Sobre o feedback escrito: o insight é priorizar.';
    const c = id(auditarPdiEstrutural(pdi, OBJETIVOS, 'CENÁRIO: um feedback escrito.'), 'jargao-ingles');
    expect(c.status).toBe('warn');
    // A ocorrência é "<campo>: <termos>", e o campo se chama `feedback`: olha só os termos.
    expect(c.ocorrencias[0].split(': ')[1]).toBe('insight');
  });

  // O modo de falha que este projeto já catalogou: check que passa por não ter
  // o que olhar. Sem blueprint não há com o que comparar — isso é AUSÊNCIA DE
  // FONTE, não aprovação.
  it('sem blueprint, o check de sprint AVISA em vez de passar por vacuidade', () => {
    const c = id(auditarPdiEstrutural(pdiBom(), null), 'sprint-do-blueprint');
    expect(c.status).toBe('warn');
    expect(c.detalhe).toMatch(/ausência de fonte/i);
  });

  it('PDI sem competências é FALHA — zero achados sobre zero não é aprovação', () => {
    const checks = auditarPdiEstrutural({ competencias: [] }, OBJETIVOS);
    expect(consolidarAuditoriaPdi(checks, 0).status).toBe('fail');
  });
});

/**
 * 🔴 A JORNADA (25/09/2026): uma competência com 2-3 objetivos, um por ciclo, e
 * UM sprint. O check antigo indexava os objetivos num Map por competência, ficava
 * com o ÚLTIMO e reprovava 58 de 60 PDIs reais comparando o sprint (tirado do 1º)
 * com o objetivo errado. Formato do blueprint real de uma professora de Macaé.
 */
describe('jornada: vários objetivos na mesma competência', () => {
  const COMP = 'Autocuidado e bem-estar profissional';
  const JORNADA: ObjetivoBlueprint[] = [
    { competencia: COMP, id: 'obj-1', acao_principal: 'Toda segunda-feira, antes da primeira aula, preencho uma lista com as tarefas da semana', acao_apoio: 'Ao final de cada semana, registro em uma linha o que foi reorganizado', ritual: 'Cinco minutos na segunda-feira de manhã, antes do início das aulas' },
    { competencia: COMP, id: 'obj-2', acao_principal: 'Quando identificar conflito entre a agenda e uma nova demanda, aviso a coordenação no mesmo dia', acao_apoio: 'Registro a ocorrência no diário de bordo', ritual: 'Ao final de cada semana, verificar na lista se houve conflito' },
    { competencia: COMP, id: 'obj-3', acao_principal: 'Após cada reunião pedagógica em que recebo devolutiva, anoto em ficha o que vou ajustar', acao_apoio: 'Guardo as fichas junto ao caderno de planejamento', ritual: 'Reservar os cinco primeiros minutos após cada reunião pedagógica' },
  ];
  const pdiJornada = (sprint: Record<string, string>): any => ({
    ...pdiBom(),
    competencias: [{ ...pdiBom().competencias[0], nome: COMP, sprint: { ...sprint, checklist: ['a', 'b', 'c'] } }],
  });
  const doObj = (i: number) => ({ acao_principal: JORNADA[i].acao_principal!, acao_apoio: JORNADA[i].acao_apoio!, ritual: JORNADA[i].ritual! });

  it('🔴 sprint copiado do objetivo do 1º ciclo PASSA (o check antigo reprovava)', () => {
    const c = id(auditarPdiEstrutural(pdiJornada(doObj(0)), JORNADA), 'sprint-do-blueprint');
    expect(c.status, c.ocorrencias.join(' | ')).toBe('pass');
  });

  it('sprint de outro ciclo reprova, nomeando campo e objetivo', () => {
    const c = id(auditarPdiEstrutural(pdiJornada(doObj(2)), JORNADA), 'sprint-do-blueprint');
    expect(c.status).toBe('fail');
    expect(c.ocorrencias.join(' | ')).toContain('acao_principal');
    expect(c.ocorrencias.join(' | ')).toContain('obj-1');
  });

  it('🔴 misturar ciclos reprova: "apoio" = ação principal do objetivo 2 (16 de 58 PDIs reais)', () => {
    const c = id(auditarPdiEstrutural(pdiJornada({ ...doObj(0), acao_apoio: JORNADA[1].acao_principal! }), JORNADA), 'sprint-do-blueprint');
    expect(c.status).toBe('fail');
    expect(c.ocorrencias).toHaveLength(1);
    expect(c.ocorrencias[0]).toContain('acao_apoio');
  });

  it('ponto final a mais não é outra ação', () => {
    const s = doObj(0);
    const c = id(auditarPdiEstrutural(pdiJornada({ ...s, ritual: `${s.ritual}.` }), JORNADA), 'sprint-do-blueprint');
    expect(c.status).toBe('pass');
  });

  it('sprint numa competência que o blueprint não cobre reprova (antes passava por vacuidade)', () => {
    const outra: ObjetivoBlueprint[] = [{ ...JORNADA[0], competencia: 'Outra competência' }];
    const c = id(auditarPdiEstrutural(pdiJornada(doObj(0)), outra), 'sprint-do-blueprint');
    expect(c.status).toBe('fail');
    expect(c.ocorrencias[0]).toMatch(/sem objetivo correspondente/);
  });

  it('o overlay copia o objetivo do 1º ciclo, e o check passa por construção', () => {
    const pdi = pdiJornada({ acao_principal: 'reescrita pelo modelo', acao_apoio: JORNADA[1].acao_principal!, ritual: 'outro ritual' });
    const tocadas = aplicarSprintDoBlueprint(pdi, JORNADA);
    expect(tocadas).toEqual([COMP]);
    expect(pdi.competencias[0].sprint).toMatchObject(doObj(0));
    // O que o overlay NÃO copia fica: o checklist é do modelo.
    expect(pdi.competencias[0].sprint.checklist).toEqual(['a', 'b', 'c']);
    expect(id(auditarPdiEstrutural(pdi, JORNADA), 'sprint-do-blueprint').status).toBe('pass');
  });

  it('competência sem objetivo no blueprint fica intocada pelo overlay', () => {
    const pdi = pdiJornada({ acao_principal: 'do modelo', acao_apoio: 'x', ritual: 'y' });
    expect(aplicarSprintDoBlueprint(pdi, [{ ...JORNADA[0], competencia: 'Outra' }])).toEqual([]);
    expect(pdi.competencias[0].sprint.acao_principal).toBe('do modelo');
    expect(aplicarSprintDoBlueprint(pdi, null)).toEqual([]);
  });
});

/**
 * O auditor semântico reprovava 46 de 55 PDIs sozinho (25/09/2026): sem dizer o
 * que é afirmação SOBRE A PESSOA nem o que é grave, tudo virava `fail`. As
 * âncoras abaixo são de CONTEÚDO da régua, não de formatação.
 */
describe('auditor semântico: escopo e gravidade', () => {
  it('tira do escopo a leitura do perfil em tom de tendência e as ações do plano', () => {
    expect(PDI_AUDIT_SYSTEM).toMatch(/NÃO É ACHADO/);
    expect(PDI_AUDIT_SYSTEM).toMatch(/tom de TENDÊNCIA/);
    expect(PDI_AUDIT_SYSTEM).toMatch(/AÇÕES do plano/);
  });

  it('fail só para o que faria a pessoa ler algo FALSO sobre si', () => {
    expect(PDI_AUDIT_SYSTEM).toMatch(/fail, SÓ quando o CONTEÚDO é falso/);
    expect(PDI_AUDIT_SYSTEM).toMatch(/afirma como FATO/);
    expect(PDI_AUDIT_SYSTEM).toMatch(/inventa detalhe do cenário/);
  });

  it('traz exemplo dos três casos: fail, warn e não-achado', () => {
    expect(PDI_AUDIT_SYSTEM).toMatch(/- fail \(sem_lastro\):/);
    expect(PDI_AUDIT_SYSTEM).toMatch(/- warn \(sem_lastro\):/);
    expect(PDI_AUDIT_SYSTEM).toMatch(/- NÃO é achado:/);
  });
});

/**
 * 2ª calibragem (25/09/2026), depois de conferir 6 PDIs reprovados CONTRA AS
 * RESPOSTAS no banco: o defeito real e dominante era o traço da personagem do
 * cenário colado na pessoa (fail); dois achados eram paráfrase fiel e inferência
 * com "pode indicar" (não deviam derrubar o PDI). A régua virou o CONTEÚDO.
 */
describe('auditor semântico: a régua é o conteúdo, não a forma', () => {
  it('traço ou situação da PERSONAGEM atribuído à pessoa é fail, e o oposto da resposta também', () => {
    const fail = PDI_AUDIT_SYSTEM.slice(PDI_AUDIT_SYSTEM.indexOf('fail, SÓ quando'), PDI_AUDIT_SYSTEM.indexOf('warn, SÓ quando'));
    expect(fail).toMatch(/PERSONAGEM do cenário/);
    expect(fail).toMatch(/OPOSTO do que ela respondeu/);
  });

  it('paráfrase fiel da resposta não é achado', () => {
    const naoAchado = PDI_AUDIT_SYSTEM.slice(PDI_AUDIT_SYSTEM.indexOf('═══ O QUE NÃO É ACHADO'), PDI_AUDIT_SYSTEM.indexOf('═══ O QUE VOCÊ PROCURA'));
    expect(naoAchado).toMatch(/PARÁFRASE FIEL/);
    expect(PDI_AUDIT_SYSTEM).toMatch(/- NÃO é achado:[^\n]*\n[^\n]*\n[^\n]*\(paráfrase fiel\)/);
  });
});

/**
 * 3ª calibragem (25/09/2026), dono: "alerta tem que ser minoria e reprovação a
 * exceção". Com 2 rodadas, 6 de 10 PDIs regerados saíam com alerta, e lidos à
 * mão: 1 defeito real, 3 escorregões do gerador (a proposta para a personagem
 * escrita como ação feita) e 2 miudezas que ninguém mudaria. Alerta passou a
 * ser só o que um revisor MUDARIA no texto.
 */
describe('auditor semântico: alerta é o que um revisor mudaria', () => {
  const warn = PDI_AUDIT_SYSTEM.slice(PDI_AUDIT_SYSTEM.indexOf('warn, SÓ quando'), PDI_AUDIT_SYSTEM.indexOf('═══ EXEMPLOS'));
  const naoAchado = PDI_AUDIT_SYSTEM.slice(PDI_AUDIT_SYSTEM.indexOf('═══ O QUE NÃO É ACHADO'), PDI_AUDIT_SYSTEM.indexOf('═══ O QUE VOCÊ PROCURA'));

  it('warn é enquadramento de fato real, extrapolação da ausência, análise inteira genérica ou desproporção', () => {
    expect(warn).toMatch(/revisor MUDARIA/);
    expect(warn).toMatch(/PROPÔS para a personagem/);
    expect(warn).toMatch(/AUSÊNCIA/);
    expect(warn).toMatch(/análise INTEIRA/);
  });

  it('na dúvida, não lista', () => {
    expect(warn).toMatch(/Na dúvida entre warn e não-achado, NÃO liste/);
  });

  it('inferência cautelosa ancorada e frase de abertura/fechamento saíram do warn', () => {
    expect(warn).not.toMatch(/pode indicar/);
    expect(warn).not.toMatch(/frase genérica/);
    expect(naoAchado).toMatch(/INFERÊNCIA CAUTELOSA/);
    expect(naoAchado).toMatch(/abertura ou fechamento/);
  });
});

describe('consolidação', () => {
  it('um fail derruba; warn não', () => {
    const base = auditarPdiEstrutural(pdiBom(), OBJETIVOS);
    expect(consolidarAuditoriaPdi(base, 1).status).toBe('pass');
    expect(consolidarAuditoriaPdi([...base, { id: 'x', categoria: 'semantica', titulo: 'T', status: 'warn', detalhe: '', ocorrencias: [] }], 1).status).toBe('warn');
    expect(consolidarAuditoriaPdi([...base, { id: 'y', categoria: 'semantica', titulo: 'T', status: 'fail', detalhe: '', ocorrencias: [] }], 1).status).toBe('fail');
  });

  it('o resumo NOMEIA o que falhou — "2 problemas" não aciona ninguém', () => {
    const pdi = pdiBom();
    pdi.competencias[0].sprint.acao_principal = 'outra coisa';
    const r = consolidarAuditoriaPdi(auditarPdiEstrutural(pdi, OBJETIVOS), 1);
    expect(r.resumo).toContain('sprint veio do blueprint');
  });

  it('carrega o DENOMINADOR — quantas competências foram olhadas', () => {
    expect(consolidarAuditoriaPdi([], 7).competenciasAuditadas).toBe(7);
  });
});

/**
 * Fail só quando as rodadas concordam (25/09/2026). Com o gerador que vê as
 * respostas, todo fail que sobrou nos 10 PDIs regerados era de UMA rodada só, e
 * nenhum tinha conteúdo falso: o veredito estava sendo decidido pelo ruído.
 */
describe('rodadas do auditor semântico', () => {
  const sem = (status: 'pass' | 'warn' | 'fail', ocorrencias: string[] = [], id = 'sem-sem_lastro'): PdiAuditCheck =>
    ({ id, categoria: 'semantica', titulo: 'Afirmação sem lastro na evidência', status, detalhe: `d-${status}`, ocorrencias });
  const fora: PdiAuditCheck = { id: 'semantica-indisponivel', categoria: 'semantica', titulo: 'x', status: 'fail', detalhe: 'erro', ocorrencias: [] };

  it('o core roda 2', () => expect(RODADAS_SEMANTICAS).toBe(2));

  it('reprovado nas duas rodadas continua fail, com as ocorrências das duas sem repetir trecho', () => {
    const r = combinarRodadasSemanticas([
      [sem('fail', ['geral: "trecho A…" — porque 1'])],
      [sem('fail', ['geral: "trecho A…" — porque 2', 'geral: "trecho B…" — porque 3'])],
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].status).toBe('fail');
    expect(r[0].ocorrencias).toEqual(['geral: "trecho A…" — porque 1', 'geral: "trecho B…" — porque 3']);
  });

  it('reprovado em uma rodada só vira alerta, dizendo por quê', () => {
    const r = combinarRodadasSemanticas([[sem('fail', ['geral: "t…" — p'])], [sem('warn', ['geral: "u…" — q'])]]);
    expect(r[0].status).toBe('warn');
    expect(r[0].detalhe).toMatch(/Reprovado em 1 de 2 rodadas/);
    expect(consolidarAuditoriaPdi(r, 1).status).toBe('warn');
  });

  it('uma rodada reprova, a outra não acha nada: alerta, não aprovado nem reprovado', () => {
    const r = combinarRodadasSemanticas([[sem('fail', ['geral: "t…" — p'])], []]);
    expect(consolidarAuditoriaPdi(r, 1).status).toBe('warn');
  });

  it('alerta de uma rodada só, com a outra limpa, não vale (mas fica registrado)', () => {
    const r = combinarRodadasSemanticas([[sem('warn', ['geral: "t…" — p'])], []]);
    expect(consolidarAuditoriaPdi(r, 1).status).toBe('pass');
    expect(r[0].detalhe).toMatch(/Alerta em 1 de 2 rodadas do auditor: não confirmado/);
    expect(r[0].ocorrencias).toHaveLength(1);
  });

  it('alerta nas duas rodadas continua alerta', () => {
    const r = combinarRodadasSemanticas([[sem('warn', ['geral: "t…" — p'])], [sem('warn', ['geral: "u…" — q'], 'sem-generico')]]);
    expect(consolidarAuditoriaPdi(r, 1).status).toBe('warn');
  });

  it('reprovação numa rodada e alerta na outra: alerta (a reprovação isolada não some)', () => {
    const r = combinarRodadasSemanticas([[sem('fail', ['geral: "t…" — p'])], [sem('warn', ['geral: "u…" — q'], 'sem-generico')]]);
    expect(consolidarAuditoriaPdi(r, 1).status).toBe('warn');
    expect(r.every((c) => c.status === 'warn')).toBe(true);
  });

  it('rodada com reprovação ao lado de uma limpa: a reprovação e os alertas dela ficam como alerta', () => {
    const r = combinarRodadasSemanticas([[sem('fail', ['geral: "t…" — p']), sem('warn', ['geral: "u…" — q'], 'sem-generico')], []]);
    expect(r.map((c) => c.status)).toEqual(['warn', 'warn']);
  });

  it('as duas limpas: aprovado', () => {
    expect(consolidarAuditoriaPdi(combinarRodadasSemanticas([[], []]), 1).status).toBe('pass');
  });

  it('rodada que não rodou não vota: vale a outra, com aviso de rodada única', () => {
    const r = combinarRodadasSemanticas([[fora], [sem('fail', ['geral: "t…" — p'])]]);
    expect(r.find((c) => c.id === 'sem-sem_lastro')!.status).toBe('fail');
    expect(r.find((c) => c.id === 'semantica-rodada-unica')!.status).toBe('warn');
  });

  it('nenhuma rodada rodou: fail de auditoria indisponível (ausência não é aprovação)', () => {
    const r = combinarRodadasSemanticas([[fora], [fora]]);
    expect(r).toEqual([fora]);
    expect(consolidarAuditoriaPdi(r, 1).status).toBe('fail');
  });
});

/**
 * Guard de CONSUMIDOR. O módulo puro acima pode estar impecável e não valer
 * nada: a lição que este projeto já pagou é que **config declarada ≠ config
 * aplicada** — a régua só existe se alguém a lê no caminho que roda.
 */
describe('o gerador do PDI CONSOME a auditoria', () => {
  const core = readFileSync(join(process.cwd(), 'lib/relatorios/individual-core.ts'), 'utf-8');

  it('roda as duas camadas', () => {
    expect(core, 'camada estrutural não é chamada').toMatch(/auditarPdiEstrutural\(/);
    expect(core, 'camada semântica não é chamada').toMatch(/promptAuditoriaPdi\(/);
    expect(core).toMatch(/taskKey: 'pdi_check'/);
  });

  it('roda as rodadas do auditor e as combina; o estrutural recebe o cenário e as respostas', () => {
    expect(core).toMatch(/Array\.from\(\{ length: RODADAS_SEMANTICAS \}, rodada\)/);
    expect(core).toMatch(/checks\.push\(\.\.\.combinarRodadasSemanticas\(rodadas\)\)/);
    expect(core).toMatch(/auditarPdiEstrutural\(relatorio, objetivosBlueprint, cenarioERespostas\)/);
  });

  it('PERSISTE o veredito — auditoria sem rastro é a que ninguém lê', () => {
    expect(core).toMatch(/relatorio\.auditoria = consolidarAuditoriaPdi\(/);
  });

  it('audita ANTES de gerar o PDF, não depois de entregar', () => {
    const iAudit = core.indexOf('consolidarAuditoriaPdi(');
    // ⚠️ `gerarPDFBuffer(` sem o `await` casa a DEFINIÇÃO da função, lá no topo
    // do arquivo — e aí a comparação de ordem testa outra coisa. A âncora tem de
    // ser a CHAMADA. (Terceira vez nesta sessão que um indexOf pega o alvo
    // errado; o padrão é sempre o mesmo: âncora genérica demais.)
    const iPdf = core.indexOf('await gerarPDFBuffer(');
    expect(iAudit).toBeGreaterThan(-1);
    expect(iPdf).toBeGreaterThan(-1);
    expect(iAudit, 'a auditoria roda depois do PDF — seria auditar coisa já entregue')
      .toBeLessThan(iPdf);
  });

  it('🔴 copia o sprint do blueprint ANTES de auditar (senão o check mede o modelo, não o documento)', () => {
    const iOverlay = core.indexOf('aplicarSprintDoBlueprint(relatorio');
    const iAudit = core.indexOf('auditarPdiEstrutural(relatorio');
    expect(iOverlay, 'o overlay do sprint não é chamado').toBeGreaterThan(-1);
    expect(iOverlay, 'o overlay roda depois da auditoria').toBeLessThan(iAudit);
  });

  it('falha do auditor NÃO vira aprovação silenciosa', () => {
    // O catch tem de EMPURRAR um achado, não só logar: tanto a rodada que falha
    // quanto o erro fora das rodadas viram o achado `fail` de "indisponível".
    const trecho = core.slice(core.indexOf('taskKey: \'pdi_check\''), core.indexOf('relatorio.auditoria ='));
    expect(trecho).toMatch(/return \[indisponivel\(e\)\]/);
    expect(trecho).toMatch(/checks\.push\(indisponivel\(e\)\)/);
    const achado = core.slice(core.indexOf('const indisponivel ='), core.indexOf('taskKey: \'pdi_check\''));
    expect(achado).toMatch(/status: 'fail'/);
    expect(achado).toMatch(/NÃO é aprovação/i);
  });

  it('o par está declarado e é cross-família', () => {
    const par = DUAL_IA_PARES.find((p) => p.auditor === 'pdi_check');
    expect(par, 'pdi_check não está em DUAL_IA_PARES').toBeTruthy();
    expect(familiaDoModelo(DEFAULT_TASK_MODELS[par!.gerador]))
      .not.toBe(familiaDoModelo(DEFAULT_TASK_MODELS.pdi_check));
  });
});
