/**
 * O prompt do IA2 é o que produz TODOS os perfis ideais da plataforma — e a
 * calibração deles nasce aqui, não no motor.
 *
 * `Medido: 10/09/2026` na base inteira: a faixa `"Alto (41-60)" → "Muito alto
 * (61-80)"`, que era **o literal do exemplo dentro do prompt**, aparecia em 144
 * de 219 subcompetências (65,8%), em 14 cargos. Na tela4, cujo exemplo já era
 * variado, a mesma faixa fica em 44,6%. O modelo copia o exemplo — então o
 * exemplo é regra, e este arquivo protege isso.
 *
 * O outro defeito: o prompt mandava "garanta que este perfil é DIFERENTE dos
 * outros cargos desta empresa" e nunca passava os outros cargos. Instrução que o
 * modelo não tem como cumprir não é instrução — em Ibipeba os três cargos de
 * gestão saíram indistinguíveis (índice de separação 0,47, abaixo do acaso).
 */
import { describe, it, expect } from 'vitest';
import { montarPromptIA2, resumirGabaritoParaIrmaos, FAIXAS_VALIDAS } from '@/lib/ia2-gabarito';

const BASE = {
  cargoNome: 'Coordenador de Operações',
  compNomes: ['Priorização', 'Comunicação'],
  detalhe: { descricao: 'Coordena rotinas operacionais.', eh_lideranca: true },
  contextoPPP: '',
  valores: ['Ética'],
  empresa: { nome: 'ACME', segmento: 'Serviços' },
};

describe('o exemplo do JSON não ancora numa faixa só', () => {
  it('mostra mais de uma faixa e mais de uma direção na tela2', () => {
    const { system } = montarPromptIA2(BASE);
    const bloco = system.slice(system.indexOf('"subcompetencias"'), system.indexOf('"tela3"'));

    const faixas = new Set(FAIXAS_VALIDAS.filter((f) => bloco.includes(`"${f}"`)));
    // Com um exemplo de faixa única, 65,8% da base saiu com ela. Três faixas
    // distintas no exemplo tiram a âncora.
    expect(faixas.size).toBeGreaterThanOrEqual(3);

    for (const dir of ['floor', 'target', 'ceiling']) {
      expect(bloco).toContain(`"direcao": "${dir}"`);
    }
  });

  it('o exemplo não usa a mesma faixa que dominou a base como piso de prioridade alta', () => {
    const { system } = montarPromptIA2(BASE);
    const bloco = system.slice(system.indexOf('"subcompetencias"'), system.indexOf('"tela3"'));
    const alta = bloco.split('\n').find((l) => l.includes('"prioridade": "alta"') && l.includes('"floor"'));
    // Um traço decisivo com piso na metade da escala não exclui ninguém.
    expect(alta).toBeDefined();
    expect(alta).not.toContain('"faixa_min": "Alto (41-60)"');
  });
});

describe('a regra de discriminação está no system', () => {
  it('exige que a faixa exclua alguém e nomeia o efeito do floor', () => {
    const { system } = montarPromptIA2(BASE);
    expect(system).toContain('quem seria excluído por ela?');
    // Sem dizer o que `floor` faz no scoring, "faixa larga" é abstrato.
    expect(system).toMatch(/floor.*credita 100%|credita 100%.*floor/s);
    expect(system).toContain('VARIE as faixas');
  });
});

describe('os cargos irmãos entram no prompt', () => {
  it('sem irmãos, o bloco não aparece (empresa com um cargo só)', () => {
    const { user } = montarPromptIA2(BASE);
    expect(user).not.toContain('OS OUTROS CARGOS DESTA EMPRESA');
  });

  it('com irmãos, o prompt LISTA os perfis e exige diferença nas TELAS', () => {
    const { user } = montarPromptIA2({
      ...BASE,
      irmaos: [
        { cargo: 'Analista Financeiro', resumo: 'Detalhismo Muito alto (61-80)→Extremamente alto (81-100) (floor, alta)' },
        { cargo: 'Gerente Comercial', resumo: 'Comando Alto (41-60)→Muito alto (61-80) (floor, alta)' },
      ],
    });
    expect(user).toContain('OS OUTROS CARGOS DESTA EMPRESA');
    expect(user).toContain('• Analista Financeiro: Detalhismo');
    expect(user).toContain('• Gerente Comercial: Comando');
    // O ponto: a diferença tem de estar nas faixas, não só na prosa. O prompt
    // antigo pedia diferença e nunca mostrava de quem se diferenciar.
    expect(user).toContain('NAS TELAS');
    expect(user).toContain('não apenas na');
  });

  it('cada irmão sai em uma linha própria — não colados numa só', () => {
    const { user } = montarPromptIA2({
      ...BASE,
      irmaos: [{ cargo: 'A', resumo: 'x' }, { cargo: 'B', resumo: 'y' }],
    });
    expect(user).toContain('• A: x\n• B: y');
  });
});

describe('resumirGabaritoParaIrmaos', () => {
  it('leva faixa, direção e prioridade — é o que precisa contrastar', () => {
    const r = resumirGabaritoParaIrmaos({
      tela2: { subcompetencias: [{ nome: 'Comando', faixa_min: 'Alto (41-60)', faixa_max: 'Muito alto (61-80)', direcao: 'floor', prioridade: 'alta' }] },
      tela3: { executor: 35, motivador: 20, metodico: 30, sistematico: 15 },
    });
    expect(r).toContain('Comando Alto (41-60)→Muito alto (61-80) (floor, alta)');
    expect(r).toContain('executor 35');
    expect(r).toContain('motivador 20');
  });

  it('gabarito vazio não vira string quebrada', () => {
    expect(resumirGabaritoParaIrmaos({})).toContain('sem subcompetências');
    expect(resumirGabaritoParaIrmaos(null)).toContain('sem subcompetências');
  });
});
