import { describe, expect, it } from 'vitest';
import {
  colaboradoresComMapeamentoCompleto,
  distribuicaoMapeamento,
  progressoMapeamentoPorPessoa,
} from '@/lib/mapeamento-competencias';

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

  describe('progresso em degraus (x de N)', () => {
    const assessments = [
      { colaborador_id: 'completo', competencia: 'Negociação' },
      { colaborador_id: 'completo', competencia: 'Comunicação' },
      { colaborador_id: 'parcial', competencia: 'Negociação' },
      { colaborador_id: 'parcial', competencia: 'Fora do Top 5' },
      { colaborador_id: 'financeiro', competencia: 'Precisão' },
    ];

    it('conta só competências do Top 5 do cargo, e dá 0 a quem não começou', () => {
      const p = progressoMapeamentoPorPessoa([...pessoas, { id: 'nada', cargo: 'Vendas' }], cargos, assessments);
      expect(p.get('completo')).toEqual({ feitas: 2, total: 2 });
      expect(p.get('parcial')).toEqual({ feitas: 1, total: 2 });
      expect(p.get('nada')).toEqual({ feitas: 0, total: 2 });
      expect(p.get('financeiro')).toEqual({ feitas: 1, total: 1 });
    });

    it('cargo sem Top 5 vira total 0, e não "0 de N"', () => {
      const p = progressoMapeamentoPorPessoa(pessoas, cargos, assessments);
      expect(p.get('sem-cargo')).toEqual({ feitas: 0, total: 0 });
    });

    it('a distribuição soma as pessoas, incluindo quem está em 0', () => {
      const p = progressoMapeamentoPorPessoa([...pessoas, { id: 'nada', cargo: 'Vendas' }], cargos, assessments);
      const d = distribuicaoMapeamento(p);
      expect(d.reduce((n, g) => n + g.pessoas, 0)).toBe(5);
      expect(d.find((g) => g.feitas === 0 && g.total === 2)?.pessoas).toBe(1);
      expect(d.find((g) => g.feitas === 1 && g.total === 2)?.pessoas).toBe(1);
      expect(d.find((g) => g.total === 0)?.pessoas).toBe(1);
    });

    it('o degrau "completo" coincide com colaboradoresComMapeamentoCompleto', () => {
      const p = progressoMapeamentoPorPessoa(pessoas, cargos, assessments);
      const viaDegrau = [...p].filter(([, v]) => v.total > 0 && v.feitas === v.total).map(([id]) => id).sort();
      expect(viaDegrau).toEqual([...colaboradoresComMapeamentoCompleto(pessoas, cargos, assessments)].sort());
    });
  });
});
