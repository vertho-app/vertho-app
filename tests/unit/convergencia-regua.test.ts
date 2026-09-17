import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CONVERGENCIA,
  CORTE_CONFIRMADA,
  CORTE_PARCIAL,
  classificarConvergencia,
  rotuloConvergencia,
  avancoExibido,
  formatarAvanco,
} from '@/lib/season-engine/convergencia';

/**
 * A régua de convergência decide o veredito que a pessoa lê no relatório e que
 * o gestor lê no painel. Ela nasceu privada dentro do motor e ganhou um arquivo
 * quando o fixture da demo virou um segundo produtor — este teste existe para
 * que a segunda cópia não volte por descuido.
 */
describe('Régua de convergência', () => {
  it('exige delta E leitura qualitativa para confirmar', () => {
    // Delta grande sozinho NÃO confirma: é a diferença entre "o número subiu"
    // e "a mudança foi percebida". Trocar o `&&` por `||` no motor faz este
    // caso virar confirmada e o teste falhar.
    expect(classificarConvergencia({ nota_pre: 2, nota_pos: 3, nivel_percebido: null }))
      .toBe(CONVERGENCIA.PARCIAL);
    expect(classificarConvergencia({ nota_pre: 2, nota_pos: 3, nivel_percebido: 3 }))
      .toBe(CONVERGENCIA.CONFIRMADA);
  });

  it('a leitura qualitativa NÃO sustenta parcial sozinha: "+0,1" é estável (17/09/2026)', () => {
    // Antes, 2,0 → 2,1 com a conversa mostrando evolução saía "Evolução parcial",
    // e o contador não conseguia dizer "avanço de pelo menos 0,2" sem mentir.
    expect(classificarConvergencia({ nota_pre: 2, nota_pos: 2.1, nivel_percebido: 3 }))
      .toBe(CONVERGENCIA.ESTAVEL);
    expect(classificarConvergencia({ nota_pre: 2, nota_pos: 2.2, nivel_percebido: 3 }))
      .toBe(CONVERGENCIA.PARCIAL);
  });

  it('avanço exibido 0,0 é ESTÁVEL mesmo com leitura qualitativa positiva (16/09/2026)', () => {
    // O caso real: 2,5 → 2,3 com qualitativa 3, saía "0,0 · Evolução
    // parcial" no PDF. O veredito não pode afirmar avanço ao lado de um zero.
    expect(classificarConvergencia({ nota_pre: 2.5, nota_pos: 2.3, nivel_percebido: 3 }))
      .toBe(CONVERGENCIA.ESTAVEL);
    expect(classificarConvergencia({ nota_pre: 2, nota_pos: 2, nivel_percebido: 3 }))
      .toBe(CONVERGENCIA.ESTAVEL);
    // A fronteira é o número EXIBIDO: +0,04 aparece como "0,0" e +0,16 como
    // "+0,2", que já é parcial mesmo sendo menos que 0,2 cru.
    expect(classificarConvergencia({ nota_pre: 2, nota_pos: 2.04, nivel_percebido: 3 }))
      .toBe(CONVERGENCIA.ESTAVEL);
    expect(classificarConvergencia({ nota_pre: 2, nota_pos: 2.16, nivel_percebido: null }))
      .toBe(CONVERGENCIA.PARCIAL);
  });

  it('NÃO existe veredito de regressão: queda entra como estável', () => {
    // Decisão do dono (01/09/2026): ninguém desaprende uma competência, então
    // uma nota que cai descreve a variação do instrumento, não a pessoa. Se
    // alguém reintroduzir um piso de regressão, estes casos ficam vermelhos.
    expect(classificarConvergencia({ nota_pre: 2, nota_pos: 1.85, nivel_percebido: null }))
      .toBe(CONVERGENCIA.ESTAVEL);
    expect(classificarConvergencia({ nota_pre: 3.5, nota_pos: 1.2, nivel_percebido: null }))
      .toBe(CONVERGENCIA.ESTAVEL);
    expect(Object.values(CONVERGENCIA)).not.toContain('regressao');
    expect(rotuloConvergencia('regressao')).toBe('Sem medição');
  });

  it('trata as fronteiras dos cortes como inclusivas para o lado melhor', () => {
    expect(classificarConvergencia({ nota_pre: 2, nota_pos: 2 + CORTE_PARCIAL, nivel_percebido: null }))
      .toBe(CONVERGENCIA.PARCIAL);
    // 2 + 0,5 = 2,5 confirma com a conversa sustentando, mesmo sem chegar ao
    // Nível 3 (a meta saiu da régua em 17/09/2026).
    expect(classificarConvergencia({ nota_pre: 2, nota_pos: 2 + CORTE_CONFIRMADA, nivel_percebido: 2.5 }))
      .toBe(CONVERGENCIA.CONFIRMADA);
    expect(classificarConvergencia({ nota_pre: 2, nota_pos: 2.4, nivel_percebido: 2.5 }))
      .toBe(CONVERGENCIA.PARCIAL);
    expect(classificarConvergencia({ nota_pre: 2, nota_pos: 1.9, nivel_percebido: null }))
      .toBe(CONVERGENCIA.ESTAVEL);
  });

  it('o corte compara o avanço que a pessoa lê: "+0,2" nunca sai Estável (16/09/2026)', () => {
    // Os pares reais: em ponto flutuante as duas subtrações dão 0,19999…, e
    // os descritores saíam "+0,2 · Estável" (1,0 → 1,2 e 1,3 → 1,5, pares gravados).
    expect(1.2 - 1.0).toBeLessThan(CORTE_PARCIAL);
    expect(classificarConvergencia({ nota_pre: 1.0, nota_pos: 1.2, nivel_percebido: null }))
      .toBe(CONVERGENCIA.PARCIAL);
    expect(classificarConvergencia({ nota_pre: 1.3, nota_pos: 1.5, nivel_percebido: 1 }))
      .toBe(CONVERGENCIA.PARCIAL);
    // Varre toda nota de uma casa, com e sem conversa mostrando evolução: parcial
    // ou confirmada acontece exatamente quando o número exibido é 0,2 ou mais.
    for (let a = 10; a <= 40; a++) {
      for (let b = 10; b <= 40; b++) {
        const [pre, pos] = [a / 10, b / 10];
        const exibido = avancoExibido(pre, pos) as number;
        for (const nivel_percebido of [null, 4]) {
          const v = classificarConvergencia({ nota_pre: pre, nota_pos: pos, nivel_percebido });
          expect(v !== CONVERGENCIA.ESTAVEL, `${pre} → ${pos} exibe +${exibido} (conversa ${nivel_percebido})`).toBe(exibido >= CORTE_PARCIAL);
        }
      }
    }
  });

  it('rotula sem expor o vocabulário do banco', () => {
    expect(rotuloConvergencia(CONVERGENCIA.ESTAVEL)).toBe('Estável');
    expect(rotuloConvergencia(null)).toBe('Sem medição');
    expect(rotuloConvergencia('valor_que_nao_existe')).toBe('Sem medição');
  });

  /**
   * O avanço exibido tem PISO EM ZERO (decisão do dono, 14/09/2026): se a régua
   * não afirma regressão, a tela não mostra "-0,2" ao lado de "Estável". O caso
   * real, em produção, é o descritor "Organização do plano": 2,3 → 2,1, que
   * é ruído do instrumento (desvio de 0,07, amplitude até 0,33) e aparecia como
   * piora no relatório que o gestor lê.
   */
  it('o avanço exibido nunca é negativo', () => {
    expect(avancoExibido(2.3, 2.1)).toBe(0);
    expect(formatarAvanco(2.3, 2.1)).toBe('0.0');
    expect(formatarAvanco(2, 2)).toBe('0.0');
    expect(formatarAvanco(2, 2.3)).toBe('+0.3');
    expect(formatarAvanco(2.1, 2.8)).toBe('+0.7');
  });

  it('arredonda antes do piso, para não exibir "+0.0"', () => {
    // 0,04 de avanço não sobrevive a uma casa decimal: vira o piso, não um
    // sinal de mais seguido de zero. (2,05 fica de fora de propósito: o float
    // de `2.05 - 2` é 0,04999…, e testar a fronteira exata em binário mede o
    // IEEE 754, não a régua.)
    expect(formatarAvanco(2, 2.04)).toBe('0.0');
    expect(formatarAvanco(2, 2.06)).toBe('+0.1');
  });

  it('nota ausente não vira zero', () => {
    // Zero afirma "manteve o patamar"; sem nota não há o que afirmar. E
    // `Number(null)` é 0, então a guarda tem que ser explícita: sem ela,
    // `avancoExibido(null, 2.5)` devolvia +2,5 de avanço inventado.
    expect(avancoExibido(null, 2.5)).toBeNull();
    expect(avancoExibido('', 2.5)).toBeNull();
    expect(formatarAvanco(2.5, undefined)).toBeNull();
    expect(formatarAvanco('n/a', 2)).toBeNull();
  });

  /**
   * O motor tem que CONSUMIR a régua, não reimplementá-la. Sem esta asserção,
   * alguém pode colar de volta um `if (delta >= 0.5)` dentro do core e os dois
   * caminhos passam a divergir em silêncio, que é exatamente o histórico da
   * régua nota→nível nesta base.
   */
  it('o motor de Evolution Report não tem régua própria', () => {
    const core = readFileSync('lib/season-engine/evolution-report-core.ts', 'utf8');
    expect(core).toContain("from './convergencia'");
    expect(core).not.toContain('function classificarConvergencia');
    expect(core).not.toMatch(/'evolucao_confirmada'/);
    expect(core).not.toMatch(/'estagnacao'/);
  });
});

/**
 * As TELAS também são consumidoras do rótulo, e foi por elas que a divergência
 * entrou. `Medido: 14/09/2026`: o PDF dizia "Estável" (usa `rotuloConvergencia`)
 * enquanto `/admin/evolucao` e `/dashboard/gestor/equipe-evolucao` diziam
 * "Estagnação" à mão, e a tela de admin ainda mostrava um quarto card e uma
 * quarta coluna de REGRESSÃO, veredito removido da régua em 01/09, com ZERO
 * ocorrências nos 234 descritores medidos de toda a base. Número que não pode
 * sair de 0 ocupava um quarto do resumo, e o dono perguntou o que aquilo era.
 */
describe('as telas de evolução não inventam vocabulário', () => {
  const LOCALES = ['pt-BR', 'pt-PT', 'es-ES', 'en-US'];
  const ADMIN = readFileSync('app/admin/evolucao/page.tsx', 'utf8');
  const GESTOR = readFileSync('app/dashboard/gestor/equipe-evolucao/page.tsx', 'utf8');

  it('o painel do gestor lê o rótulo da régua em vez de escrevê-lo', () => {
    expect(GESTOR).toContain("from '@/lib/season-engine/convergencia'");
    expect(GESTOR).toContain('rotuloConvergencia(CONVERGENCIA.ESTAVEL)');
    expect(GESTOR).not.toContain("label: 'Estagnação'");
  });

  it('o rótulo de "estável" no pt-BR é o mesmo da régua', () => {
    const msgs = JSON.parse(readFileSync('messages/pt-BR.json', 'utf8'));
    expect(msgs.AdminEvolution.statuses.estagnacao).toBe(rotuloConvergencia(CONVERGENCIA.ESTAVEL));
  });

  it('nenhum locale oferece rótulo para um veredito que a régua não produz', () => {
    for (const locale of LOCALES) {
      const msgs = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8'));
      const chaves = Object.keys(msgs.AdminEvolution.statuses);
      expect(chaves.sort()).toEqual(Object.values(CONVERGENCIA).slice().sort());
    }
  });

  it('a tela de admin não conta nem pinta regressão', () => {
    expect(ADMIN).not.toContain('regressoes');
    expect(ADMIN).not.toContain('d.regressao');
    // O resumo agregado e as barras derivam de CONV: três vereditos, três colunas.
    expect(ADMIN).toContain('grid-cols-3');
  });
});

describe('confirmada não depende do nível de chegada (17/09/2026)', () => {
  it('+1,1 que para no Nível 2 confirma quando a conversa sustenta', () => {
    // De 02/09 a 17/09 isto era "parcial" por não chegar ao N3, e saía em verde
    // claro ao lado de um "+1,0" confirmado. O card mostra o avanço, não o nível.
    expect(classificarConvergencia({ nota_pre: 1.5, nota_pos: 2.6, nivel_percebido: 2.4 }))
      .toBe(CONVERGENCIA.CONFIRMADA);
    expect(classificarConvergencia({ nota_pre: 1.68, nota_pos: 2.58, nivel_percebido: 2.6 }))
      .toBe(CONVERGENCIA.CONFIRMADA);
  });

  it('avanço grande sem a conversa sustentar continua parcial', () => {
    expect(classificarConvergencia({ nota_pre: 1.5, nota_pos: 2.6, nivel_percebido: null }))
      .toBe(CONVERGENCIA.PARCIAL);
    expect(classificarConvergencia({ nota_pre: 1.5, nota_pos: 2.6, nivel_percebido: 1.5 }))
      .toBe(CONVERGENCIA.PARCIAL);
  });

  it('a assinatura não aceita mais meta de nível', () => {
    const fonte = readFileSync('lib/season-engine/convergencia.ts', 'utf8');
    expect(fonte).not.toMatch(/nivelMeta|alcancouMeta|NIVEL_META_CONFIRMADA\s*=/);
  });
});
