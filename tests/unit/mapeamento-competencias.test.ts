import { describe, expect, it } from 'vitest';
import { colaboradoresComMapeamentoCompleto } from '@/lib/mapeamento-competencias';

describe('conclusão do mapeamento de competências', () => {
  const cargos = [
    { nome: 'Vendas', top5_workshop: ['Negociação', 'Comunicação'] },
    { nome: 'Financeiro', top5_workshop: ['Precisão'] },
  ];
  const pessoas = [
    { id: 'completo', cargo: 'Vendas' },
    { id: 'parcial', cargo: 'Vendas' },
    { id: 'financeiro', cargo: 'Financeiro' },
    { id: 'sem-cargo', cargo: 'Desconhecido' },
  ];

  it('exige todas as competências do Top 5, não apenas uma linha de assessment', () => {
    const completos = colaboradoresComMapeamentoCompleto(pessoas, cargos, [
      { colaborador_id: 'completo', competencia: 'Negociação' },
      { colaborador_id: 'completo', competencia: 'Comunicação' },
      { colaborador_id: 'parcial', competencia: 'Negociação' },
      { colaborador_id: 'financeiro', competencia: 'Precisão' },
    ]);
    expect([...completos].sort()).toEqual(['completo', 'financeiro']);
    expect(completos.has('parcial')).toBe(false);
  });

  it('tolera diferenças de caixa e espaço sem aceitar competência alheia', () => {
    const completos = colaboradoresComMapeamentoCompleto(pessoas, cargos, [
      { colaborador_id: 'completo', competencia: ' negociação ' },
      { colaborador_id: 'completo', competencia: 'COMUNICAÇÃO' },
      { colaborador_id: 'parcial', competencia: 'Outra' },
    ]);
    expect([...completos]).toEqual(['completo']);
  });
});
