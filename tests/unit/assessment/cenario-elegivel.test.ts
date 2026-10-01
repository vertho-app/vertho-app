import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CHAVE_NOTA_MINIMA, notaMinimaDoTenant, cenarioAtendeNotaMinima,
  escolherCenarioDaCompetencia, selecionarCenariosElegiveis, notaMinimaDaEmpresa,
} from '@/lib/assessment/cenario-elegivel';

/**
 * 01/10/2026: nada filtrava cenário por nota — um com 58 chegava à pessoa igual a um com 90. A régua é opt-in
 * por empresa (`sys_config.cenario_nota_minima`), porque as outras empresas têm cenários antigos medidos por
 * outro auditor e um corte global os esconderia de uma vez ("não vamos reavaliar o passado").
 */
const lerFonte = (rel: string) => readFileSync(resolve(__dirname, '../../..', rel), 'utf8');

const cen = (id: string, comp: string, nota: number | null, ppp: string | null = null) => ({ id, competencia_id: comp, ppp_escola_id: ppp, nota_check: nota });

describe('notaMinimaDoTenant — opt-in por empresa', () => {
  it('sem a chave (ou inválida) o filtro está DESLIGADO', () => {
    for (const cfg of [null, undefined, {}, { [CHAVE_NOTA_MINIMA]: null }, { [CHAVE_NOTA_MINIMA]: 0 }, { [CHAVE_NOTA_MINIMA]: -5 }, { [CHAVE_NOTA_MINIMA]: 101 }, { [CHAVE_NOTA_MINIMA]: 'x' }, { [CHAVE_NOTA_MINIMA]: '' }]) {
      expect(notaMinimaDoTenant(cfg), JSON.stringify(cfg)).toBeNull();
    }
  });
  it('número ou string numérica liga o corte', () => {
    expect(notaMinimaDoTenant({ cenario_nota_minima: 80 })).toBe(80);
    expect(notaMinimaDoTenant({ cenario_nota_minima: '80' })).toBe(80);
    expect(notaMinimaDoTenant({ cenario_nota_minima: 100 })).toBe(100);
  });
});

describe('cenarioAtendeNotaMinima', () => {
  it('sem corte: tudo atende (inclusive sem nota) — o comportamento das outras empresas não muda', () => {
    expect(cenarioAtendeNotaMinima({ nota_check: 10 }, null)).toBe(true);
    expect(cenarioAtendeNotaMinima({ nota_check: null }, null)).toBe(true);
    expect(cenarioAtendeNotaMinima(null, null)).toBe(true);
  });
  it('com corte: a fronteira é >= (79 não, 80 sim) e FAIL-CLOSED para nota ausente', () => {
    expect(cenarioAtendeNotaMinima({ nota_check: 79 }, 80)).toBe(false);
    expect(cenarioAtendeNotaMinima({ nota_check: 80 }, 80)).toBe(true);
    expect(cenarioAtendeNotaMinima({ nota_check: null }, 80)).toBe(false);
    expect(cenarioAtendeNotaMinima({}, 80)).toBe(false);
    expect(cenarioAtendeNotaMinima(null, 80)).toBe(false);
    // string não é nota: nunca passa por coerção
    expect(cenarioAtendeNotaMinima({ nota_check: '90' as any }, 80)).toBe(false);
  });
});

describe('escolherCenarioDaCompetencia — PPP > rede > mais recente, SÓ entre os aptos', () => {
  it('sem corte mantém a ordem histórica: PPP da pessoa > rede > primeiro', () => {
    const rows = [cen('r1', 'c', 50), cen('p1', 'c', 50, 'P1'), cen('r2', 'c', 50)];
    expect(escolherCenarioDaCompetencia(rows, 'P1', null)?.id).toBe('p1');
    expect(escolherCenarioDaCompetencia(rows, 'PX', null)?.id).toBe('r1');
    expect(escolherCenarioDaCompetencia([cen('a', 'c', 1, 'P2'), cen('b', 'c', 1, 'P3')], 'PX', null)?.id).toBe('a');
  });
  it('com corte, o PPP reprovado cede ao de rede aprovado (o apto vence a preferência)', () => {
    const rows = [cen('p1', 'c', 60, 'P1'), cen('rede', 'c', 88)];
    expect(escolherCenarioDaCompetencia(rows, 'P1', 80)?.id).toBe('rede');
  });
  it('com corte, o PPP aprovado continua vencendo o de rede', () => {
    const rows = [cen('rede', 'c', 95), cen('p1', 'c', 82, 'P1')];
    expect(escolherCenarioDaCompetencia(rows, 'P1', 80)?.id).toBe('p1');
  });
  it('com corte e NENHUM apto: não serve (null), nem o "menos pior"', () => {
    expect(escolherCenarioDaCompetencia([cen('a', 'c', 79), cen('b', 'c', null)], null, 80)).toBeNull();
    expect(escolherCenarioDaCompetencia([], null, 80)).toBeNull();
    expect(escolherCenarioDaCompetencia(null, null, 80)).toBeNull();
  });
});

describe('selecionarCenariosElegiveis — um por competência', () => {
  it('sem corte: um por competência, como a função que existia na rota', () => {
    const r = selecionarCenariosElegiveis([cen('a', 'c1', 10), cen('b', 'c1', 20, 'P1'), cen('c', 'c2', 30)], 'P1', null);
    expect(r.map((x) => x.id).sort()).toEqual(['b', 'c']);
  });
  it('com corte: a competência sem cenário apto SAI da lista (e as outras seguem)', () => {
    const r = selecionarCenariosElegiveis([cen('a', 'c1', 79), cen('c', 'c2', 85), cen('d', 'c3', null)], null, 80);
    expect(r.map((x) => x.id)).toEqual(['c']);
  });
  it('lista vazia ou nula não quebra', () => {
    expect(selecionarCenariosElegiveis(null, null, 80)).toEqual([]);
    expect(selecionarCenariosElegiveis([], null, null)).toEqual([]);
  });
});

describe('notaMinimaDaEmpresa — falha de leitura não desliga o corte em silêncio', () => {
  const sbCom = (resp: any) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => resp }) }) }) });
  it('lê o corte do sys_config', async () => {
    expect(await notaMinimaDaEmpresa(sbCom({ data: { sys_config: { cenario_nota_minima: 80 } }, error: null }), 'e')).toEqual({ notaMinima: 80 });
    expect(await notaMinimaDaEmpresa(sbCom({ data: { sys_config: {} }, error: null }), 'e')).toEqual({ notaMinima: null });
  });
  it('erro de leitura volta COM o erro (o chamador recusa servir), não como "sem corte"', async () => {
    const r = await notaMinimaDaEmpresa(sbCom({ data: null, error: { message: 'boom' } }), 'e');
    expect(r.error).toMatch(/boom/);
    expect(r.notaMinima).toBeNull();
  });
});

describe('os pontos que servem cenário usam a MESMA régua (guard de fonte)', () => {
  it('a rota /api/assessment usa a função compartilhada, sem cópia local, e não manda a nota ao navegador', () => {
    const f = lerFonte('app/api/assessment/route.ts');
    expect(f).toMatch(/from '@\/lib\/assessment\/cenario-elegivel'/);
    expect(f).not.toMatch(/^function selecionarCenariosElegiveis/m);
    expect((f.match(/selecionarCenariosElegiveis\(cenariosRaw, pppEscolaId, nm\.notaMinima\)/g) || []).length).toBe(2); // GET e POST
    expect((f.match(/notaMinimaDaEmpresa\(/g) || []).length).toBe(2);
    expect(f).toMatch(/nota_check: _nota/); // GET remove a métrica interna da resposta
    expect(f).toMatch(/if \(nm\.error\) return NextResponse\.json/);
  });
  it('o dashboard usa a mesma função nos DOIS pontos: o resolvedor das competências e a busca do cenário do dia', () => {
    const f = lerFonte('app/dashboard/assessment/assessment-actions.ts');
    expect(f).toMatch(/from '@\/lib\/assessment\/cenario-elegivel'/);
    // Ponto A: o resolvedor escolhe pela régua única (sem a cópia "PPP > rede > primeiro" local)
    expect(f).toMatch(/escolherCenarioDaCompetencia\(rows, pppEscolaId, nm\.notaMinima\)/);
    expect(f).not.toMatch(/rows\.find\(\(r: any\) => !r\.ppp_escola_id\)/);
    expect(f).toMatch(/if \(nm\.error\) throw new Error\(nm\.error\)/);
    // Ponto B: sem cenário apto no resolvedor a busca cai POR COMPETÊNCIA — o corte vale de novo ali
    expect(f).toMatch(/cenarioAtendeNotaMinima\(cen, nmDoDia\.notaMinima\)/);
    expect(f).toMatch(/if \(nmDoDia\.error\) return \{ error: nmDoDia\.error \}/);
    // a nota é métrica interna: o payload do cenário do dia continua sem ela
    const payload = f.slice(f.indexOf('cenarioDoDia: {'), f.indexOf('cenarioDoDia: {') + 600);
    expect(payload).not.toMatch(/nota_check/);
  });
  it('a rota do chat escolhe o cenário pela mesma função e NÃO abre sessão sem cenário apto quando o corte está ligado', () => {
    const f = lerFonte('app/api/chat/route.ts');
    expect(f).toMatch(/escolherCenarioDaCompetencia\(cands as any\[\], pppEscolaId, nm\.notaMinima\)/);
    expect(f).toMatch(/nm\.notaMinima != null && !cenario/);
    expect(f).toMatch(/cenario_sem_nota_minima/);
  });
});
