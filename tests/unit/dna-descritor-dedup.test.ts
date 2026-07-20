import { describe, it, expect } from 'vitest';
import { stripCodigoDescritor, chaveDescritor } from '@/lib/dna-organizacional/aggregate';
import { resolverNomeOficial } from '@/lib/descritores';

/**
 * Regressão 20/07/2026 — "Retrato de Competências" (Coordenação) mostrava cada
 * descritor DUAS vezes: "Busca de apoio" (grid admin) e "COO03_D6 — Busca de
 * apoio" (IA4), com percentuais diferentes. O regex antigo
 * (`^[A-Z]?\d+(\.\d+)*`) aceitava no máximo UMA letra antes dos dígitos, então
 * não reconhecia o prefixo "COO03_D6".
 */
describe('stripCodigoDescritor', () => {
  it('remove o prefixo COO03_Dn (o caso que escapava)', () => {
    expect(stripCodigoDescritor('COO03_D6 — Busca de apoio')).toBe('Busca de apoio');
    expect(stripCodigoDescritor('COO03_D1 — Consciência de limites')).toBe('Consciência de limites');
  });

  it('segue removendo os formatos antigos', () => {
    expect(stripCodigoDescritor('G09.6 — Escuta ativa')).toBe('Escuta ativa');
    expect(stripCodigoDescritor('V02.4 - Feedback')).toBe('Feedback');
  });

  it('preserva o descritor puro e a acentuação/caixa', () => {
    expect(stripCodigoDescritor('Consciência de limites')).toBe('Consciência de limites');
    expect(stripCodigoDescritor('Regulação sob pressão')).toBe('Regulação sob pressão');
  });

  it('não come um travessão que faz parte do texto', () => {
    // Sem prefixo de código antes do travessão, nada deve ser removido.
    expect(stripCodigoDescritor('Escuta ativa — e empática')).toBe('Escuta ativa — e empática');
  });

  it('REGRESSÃO 20/07 (2ª rodada): remove código em SUFIXO parentético', () => {
    // O eco da IA4 alternou formato NO MESMO DIA: prefixo às 13:09, sufixo às
    // 13:02. O strip só de prefixo deixou "Busca de apoio (COO03_D6)" passar.
    expect(stripCodigoDescritor('Busca de apoio (COO03_D6)')).toBe('Busca de apoio');
    expect(stripCodigoDescritor('Consciência de limites (COO03_D1)')).toBe('Consciência de limites');
  });

  it('não come parêntese legítimo de conteúdo (sem dígito = não é código)', () => {
    expect(stripCodigoDescritor('Comunicação (escrita)')).toBe('Comunicação (escrita)');
  });
});

describe('resolverNomeOficial', () => {
  const REGUA = [
    { cod_desc: 'COO03_D6', nome_curto: 'Busca de apoio' },
    { cod_desc: 'COO03_D1', nome_curto: 'Consciência de limites' },
  ];

  it('resolve pelo CÓDIGO presente no eco, em qualquer formato', () => {
    expect(resolverNomeOficial('COO03_D6 — Busca de apoio', REGUA)).toBe('Busca de apoio');
    expect(resolverNomeOficial('Busca de apoio (COO03_D6)', REGUA)).toBe('Busca de apoio');
  });

  it('o código VENCE o texto ecoado (modelo trocou o nome, código certo)', () => {
    // Caso real apontado pelo check: "nomes/códigos trocados" na avaliação.
    expect(resolverNomeOficial('COO03_D1 — Busca de apoio e rede', REGUA)).toBe('Consciência de limites');
  });

  it('sem código, resolve pela chave canônica do nome', () => {
    expect(resolverNomeOficial('busca de APOIO', REGUA)).toBe('Busca de apoio');
  });

  it('sem match algum, devolve o eco sem código (nunca perde a avaliação)', () => {
    expect(resolverNomeOficial('Descritor novo (XYZ01_D9)', REGUA)).toBe('Descritor novo');
  });
});

describe('chaveDescritor', () => {
  it('as duas variantes do mesmo descritor colidem na mesma chave', () => {
    expect(chaveDescritor('COO03_D6 — Busca de apoio')).toBe(chaveDescritor('Busca de apoio'));
    expect(chaveDescritor('COO03_D2 — Regulação sob pressão')).toBe(chaveDescritor('Regulação sob pressão'));
  });

  it('tolera diferença de acento, caixa e espaçamento', () => {
    expect(chaveDescritor('Consciência  de LIMITES')).toBe(chaveDescritor('consciencia de limites'));
  });

  it('descritores realmente distintos NÃO colidem', () => {
    expect(chaveDescritor('Busca de apoio')).not.toBe(chaveDescritor('Limites profissionais'));
  });
});
