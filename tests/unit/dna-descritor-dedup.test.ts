import { describe, it, expect } from 'vitest';
import { stripCodigoDescritor, chaveDescritor } from '@/lib/dna-organizacional/aggregate';

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
