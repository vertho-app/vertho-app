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
  auditarPdiEstrutural, consolidarAuditoriaPdi,
  type ObjetivoBlueprint,
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

  it('falha do auditor NÃO vira aprovação silenciosa', () => {
    // O catch tem de EMPURRAR um achado, não só logar.
    const trecho = core.slice(core.indexOf('taskKey: \'pdi_check\''), core.indexOf('relatorio.auditoria ='));
    expect(trecho).toMatch(/status: 'fail'/);
    expect(trecho).toMatch(/NÃO é aprovação/i);
  });

  it('o par está declarado e é cross-família', () => {
    const par = DUAL_IA_PARES.find((p) => p.auditor === 'pdi_check');
    expect(par, 'pdi_check não está em DUAL_IA_PARES').toBeTruthy();
    expect(familiaDoModelo(DEFAULT_TASK_MODELS[par!.gerador]))
      .not.toBe(familiaDoModelo(DEFAULT_TASK_MODELS.pdi_check));
  });
});
