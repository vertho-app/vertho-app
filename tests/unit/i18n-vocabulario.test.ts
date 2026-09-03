import { describe, it, expect } from 'vitest';
import {
  aplicarGlossario,
  aplicarGlossarioEmTexto,
  normalizarGlossario,
} from '@/lib/i18n-vocabulario';
import ptBR from '@/messages/pt-BR.json';

/**
 * O glossário por tenant reescreve termos DENTRO das mensagens já carregadas.
 * É uma substituição de texto sobre o que a tela inteira renderiza, então os
 * casos-limite não são teóricos: uma troca dentro de `{count}` quebra a
 * mensagem em runtime, e um `\b` mal usado casa no meio de outra palavra.
 */
describe('glossário de vocabulário por tenant', () => {
  const escolar = { liderados: 'professores', liderado: 'professor', gestor: 'coordenador' };

  it('troca o termo preservando a caixa da frase', () => {
    expect(aplicarGlossarioEmTexto('Liderados', escolar)).toBe('Professores');
    expect(aplicarGlossarioEmTexto('seus liderados', escolar)).toBe('seus professores');
    expect(aplicarGlossarioEmTexto('LIDERADOS', escolar)).toBe('PROFESSORES');
  });

  it('não casa no MEIO de outra palavra', () => {
    // "gestor" dentro de "gestora" e de "congestor" (inventada, mas o padrão é
    // o mesmo): sem o limite explícito, os dois virariam "coordenador?".
    expect(aplicarGlossarioEmTexto('gestora', escolar)).toBe('gestora');
    expect(aplicarGlossarioEmTexto('congestor', escolar)).toBe('congestor');
    // E o termo isolado continua trocando.
    expect(aplicarGlossarioEmTexto('o gestor decide', escolar)).toBe('o coordenador decide');
  });

  it('🔴 respeita limite de palavra com ACENTO (onde `\\b` falharia)', () => {
    // Em JS, `\b` é definido sobre [A-Za-z0-9_]: letra acentuada não é word
    // char, então `/\bpós\b/` casa DENTRO de "após". O limite aqui é explícito.
    const g = { pós: 'depois' };
    expect(aplicarGlossarioEmTexto('após o prazo', g)).toBe('após o prazo');
    expect(aplicarGlossarioEmTexto('pós o prazo', g)).toBe('depois o prazo');

    // E o termo acentuado é alcançado quando está isolado.
    const g2 = { gestão: 'coordenação' };
    expect(aplicarGlossarioEmTexto('a gestão da rede', g2)).toBe('a coordenação da rede');
  });

  it('NÃO reescreve argumentos ICU nem marcação', () => {
    const g = { count: 'total', code: 'trecho' };
    // `{count}` é argumento da mensagem: trocá-lo faz a interpolação falhar em
    // runtime, quando alguém abre a tela — não no build.
    expect(aplicarGlossarioEmTexto('{count} pendentes', g)).toBe('{count} pendentes');
    // `<code>` é marcação: renomear a tag produz HTML inválido.
    expect(aplicarGlossarioEmTexto('use <code>gestor_email</code>', g))
      .toBe('use <code>gestor_email</code>');
  });

  it('aplica o termo mais LONGO primeiro', () => {
    // Sem a ordenação, "liderado" trocaria dentro de "liderados" e o plural
    // sairia de acidente de prefixo, não do que o glossário declara.
    expect(aplicarGlossarioEmTexto('liderados e liderado', escolar))
      .toBe('professores e professor');
  });

  it('percorre a árvore inteira de mensagens, incluindo arrays', () => {
    const messages = {
      ManagerDashboard: {
        titles: { team: 'Meus liderados' },
        lista: ['um liderado', 'dois'],
        naoTexto: 42,
      },
    };
    const saida: any = aplicarGlossario(messages, escolar);
    expect(saida.ManagerDashboard.titles.team).toBe('Meus professores');
    expect(saida.ManagerDashboard.lista).toEqual(['um professor', 'dois']);
    expect(saida.ManagerDashboard.naoTexto).toBe(42);
  });

  it('devolve o objeto ORIGINAL quando não há glossário', () => {
    const messages = { a: 'liderados' };
    // Identidade, não cópia: reconstruir a árvore inteira para não mudar nada é
    // o custo que a maioria dos tenants pagaria a cada request.
    expect(aplicarGlossario(messages, null)).toBe(messages);
    expect(aplicarGlossario(messages, {})).toBe(messages);
  });

  it('descarta glossário malformado em vez de quebrar as mensagens', () => {
    expect(normalizarGlossario(null)).toBeNull();
    expect(normalizarGlossario('texto')).toBeNull();
    expect(normalizarGlossario(['a', 'b'])).toBeNull();
    expect(normalizarGlossario({ liderado: 42 })).toBeNull();
    // Termo vazio casaria em toda parte; termo igual ao substituto é trabalho
    // sem efeito.
    expect(normalizarGlossario({ '': 'x', gestor: 'Gestor' })).toBeNull();
    expect(normalizarGlossario({ ' Gestor ': ' coordenador ' })).toEqual({ gestor: 'coordenador' });
  });

  it('um glossário vazio não altera NENHUMA mensagem', () => {
    // Prova a promessa feita ao dono: "o ACME e o escolar mantêm os atuais".
    const messages = { a: { b: 'Liderados e gestor' } };
    expect(aplicarGlossario(messages, normalizarGlossario(undefined))).toBe(messages);
  });

  /**
   * Contra as mensagens REAIS do produto, não contra um exemplo montado.
   *
   * Um fixture inventado prova que a função faz o que a função faz. O que
   * importa saber é o que acontece com as 4.000+ strings que o app carrega de
   * verdade — inclusive as que têm ICU, marcação e termos parecidos.
   */
  describe('sobre as mensagens reais de pt-BR', () => {
    const escolar = {
      liderados: 'professores',
      liderado: 'professor',
      gestor: 'coordenador',
      gestores: 'coordenadores',
    };
    const traduzido: any = aplicarGlossario(ptBR as any, escolar);

    it('reescreve os rótulos de papel na área do gestor', () => {
      expect((ptBR as any).ManagerDashboard.kpis.led).toBe('Liderados');
      expect(traduzido.ManagerDashboard.kpis.led).toBe('Professores');
    });

    it('não deixa NENHUM argumento ICU quebrado em toda a árvore', () => {
      // O modo de falha que importa: uma mensagem cujo `{count}` virou outra
      // coisa só falha quando alguém abre AQUELA tela. Aqui a árvore inteira é
      // comparada argumento a argumento.
      const argumentos = (obj: any, acc: string[] = []): string[] => {
        if (typeof obj === 'string') acc.push(...(obj.match(/\{[^{}]*\}/g) || []));
        else if (Array.isArray(obj)) obj.forEach((v) => argumentos(v, acc));
        else if (obj && typeof obj === 'object') Object.values(obj).forEach((v) => argumentos(v, acc));
        return acc;
      };
      const antes = argumentos(ptBR);
      const depois = argumentos(traduzido);
      expect(antes.length, 'sem argumentos ICU o teste não prova nada').toBeGreaterThan(50);
      expect(depois).toEqual(antes);
    });

    it('não inventa troca onde o termo não aparece', () => {
      // Denominador: quantas strings realmente mudaram. Se fosse a árvore
      // inteira, a substituição estaria casando em lugar errado.
      const contar = (a: any, b: any): number => {
        if (typeof a === 'string') return a === b ? 0 : 1;
        if (Array.isArray(a)) return a.reduce((n, v, i) => n + contar(v, b[i]), 0);
        if (a && typeof a === 'object') {
          return Object.keys(a).reduce((n, k) => n + contar(a[k], b?.[k]), 0);
        }
        return 0;
      };
      const mudadas = contar(ptBR, traduzido);
      expect(mudadas).toBeGreaterThan(0);
      // Folgado de propósito: o número exato é do conteúdo das mensagens e
      // mudaria a cada copy nova. O que se afirma é que a troca é CIRÚRGICA.
      expect(mudadas).toBeLessThan(60);
    });
  });
});
