import { describe, expect, it } from 'vitest';
import { progressoDiagnostico, type PessoaDiagnostico } from '@/lib/diagnostico-progresso';

const SEIS = ['Cliente', 'Equipe', 'Agilidade', 'Resiliência', 'Rotina', 'Simplicidade'];

function pessoa(id: string, cargo: string | null, perfil: string | null = 'SC'): PessoaDiagnostico {
  return { id, nome_completo: id, cargo, perfil_dominante: perfil };
}

describe('progresso do Diagnóstico no painel da Fase 2', () => {
  it('forma da Amazon Bowling em 02/10/2026: 14 pessoas, 6 competências por cargo, 1 sem Perfil', () => {
    const cargos = [{ nome: 'Loja', top5_workshop: SEIS }, { nome: 'Eventos', top5_workshop: SEIS }];
    const pessoas = [
      pessoa('marisa', 'Eventos'),
      pessoa('iara', 'Loja', null),
      ...Array.from({ length: 12 }, (_, i) => pessoa(`p${i}`, 'Loja')),
    ];
    const p = progressoDiagnostico(pessoas, cargos, [{ colaborador_id: 'marisa', competencia_nome: 'Cliente' }], null);

    expect(p.total).toBe(14);
    expect(p.responderam.map((x) => x.id)).toEqual(['marisa']);
    expect(p.podemResponder).toHaveLength(12);
    expect(p.faltaPerfil.map((x) => x.id)).toEqual(['iara']);
    // 14 × 6, não 13 × 2 (o "26" que a tela mostrava).
    expect(p.cenarios).toEqual({ respondidos: 1, esperados: 84 });
  });

  it('o esperado vem do Top 5 de CADA cargo, não de um número fixo', () => {
    const cargos = [{ nome: 'A', top5_workshop: ['X'] }, { nome: 'B', top5_workshop: ['X', 'Y', 'Z'] }];
    const p = progressoDiagnostico([pessoa('a', 'A'), pessoa('b', 'B')], cargos, [], null);
    expect(p.cenarios.esperados).toBe(4);
  });

  it('conta competência distinta do Top 5: repetida conta 1, fora do Top 5 não conta, sem teto de 2', () => {
    const cargos = [{ nome: 'Loja', top5_workshop: SEIS }];
    const respostas = [
      ...SEIS.map((c) => ({ colaborador_id: 'a', competencia_nome: c })),
      { colaborador_id: 'a', competencia_nome: 'Cliente' },
      { colaborador_id: 'a', competencia_nome: 'Outra matriz' },
      { colaborador_id: 'b', competencia_nome: '  equipe ' },
    ];
    const p = progressoDiagnostico([pessoa('a', 'Loja'), pessoa('b', 'Loja')], cargos, respostas, null);
    expect(p.cenarios).toEqual({ respondidos: 7, esperados: 12 });
  });

  it('sem Perfil vira grupo próprio; com fonte externa de perfil a pessoa já pode responder', () => {
    const cargos = [{ nome: 'Loja', top5_workshop: SEIS }];
    const semPerfil = [pessoa('x', 'Loja', null)];
    expect(progressoDiagnostico(semPerfil, cargos, [], null).faltaPerfil).toHaveLength(1);
    const externa = progressoDiagnostico(semPerfil, cargos, [], 'opq32');
    expect(externa.faltaPerfil).toHaveLength(0);
    expect(externa.podemResponder).toHaveLength(1);
  });

  it('quem respondeu antes da trava conta como respondeu, mesmo sem Perfil', () => {
    const cargos = [{ nome: 'Loja', top5_workshop: SEIS }];
    const p = progressoDiagnostico([pessoa('x', 'Loja', null)], cargos, [{ colaborador_id: 'x', competencia_nome: 'Rotina' }], null);
    expect(p.responderam).toHaveLength(1);
    expect(p.faltaPerfil).toHaveLength(0);
  });

  it('cargo sem Top 5 não entra na conta de cenários nem passa por "falta o Perfil"', () => {
    const cargos = [{ nome: 'Loja', top5_workshop: SEIS }, { nome: 'Vazio', top5_workshop: [] }];
    const p = progressoDiagnostico([pessoa('a', 'Vazio', null), pessoa('b', 'Sem cadastro'), pessoa('c', 'Loja')], cargos, [], null);
    expect(p.semCompetencias.map((x) => x.id)).toEqual(['a', 'b']);
    expect(p.faltaPerfil).toHaveLength(0);
    expect(p.cenarios.esperados).toBe(6);
  });

  it('os grupos são disjuntos e somam o total', () => {
    const cargos = [{ nome: 'Loja', top5_workshop: SEIS }];
    const pessoas = [pessoa('r', 'Loja'), pessoa('s', 'Nenhum'), pessoa('f', 'Loja', null), pessoa('p', 'Loja')];
    const p = progressoDiagnostico(pessoas, cargos, [{ colaborador_id: 'r', competencia_nome: 'Cliente' }], null);
    const ids = [...p.responderam, ...p.semCompetencias, ...p.faltaPerfil, ...p.podemResponder].map((x) => x.id);
    expect(ids.sort()).toEqual(['f', 'p', 'r', 's']);
    expect(ids).toHaveLength(p.total);
  });
});
