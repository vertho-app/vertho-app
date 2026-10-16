import { describe, it, expect } from 'vitest';
import { blueprintToTrilhaInputs } from '@/lib/blueprint/to-descriptors';
import { selectDescriptors } from '@/lib/season-engine/select-descriptors';
import { PROGRAMA_JORNADA } from '@/lib/season-engine/programa-config';

/**
 * Regra do dono (15/10/2026): descritor que já está em N3 ou N4 (nota ≥ 3.0) NÃO tem pílula. A vaga dele passa
 * para o descritor de MENOR nota da mesma competência. Antes, o prompt do blueprint dizia que ele "PODE ficar de
 * fora" (a IA decidia) e o caminho de reserva o PUXAVA "para elevar a Avançado" quando sobrava vaga.
 */
const COMP = 'Simplicidade';
const D = ['Objetividade', 'Praticidade', 'Comunicação simples', 'Uso de recursos', 'Descomplicação', 'Foco na execução'];

/** O caso da Marisa (Amazon): 5 descritores com lacuna e 1 em N3. */
const NOTAS = [1.0, 1.4, 1.8, 2.2, 2.6, 3.0];
const assessment = D.map((descritor, i) => ({ descritor, nota: NOTAS[i] }));

/** 6 semanas de conteúdo, 2 descritores distintos cada; o de nota 3.0 (D[5]) aparece nas semanas 3 e 6. */
function blueprint(pares: number[][]) {
  return {
    competencias: [{ nome: COMP, objetivos_30_dias: [{ id: 'obj-1', objetivo: 'x', acao_principal: 'y' }] }],
    trilha: {
      semanas: [
        ...pares.map((p, i) => ({
          semana: i + 1, tipo: 'conteudo', competencia_foco: [COMP],
          descritores_foco: p.map((k) => D[k]), objetivo_da_semana: 'o', conexao_com_pdi: ['obj-1'],
        })),
        { semana: 7, tipo: 'avaliacao', competencia_foco: [COMP], descritores_foco: [D[0]], conexao_com_pdi: ['obj-1'] },
      ],
    },
  };
}
const naSemana = (r: any, semana: number) => r.descritoresSelecionados.filter((d: any) => d.semanas_ids.includes(semana)).map((d: any) => d.descritor);

describe('blueprint → trilha: descritor sem lacuna não tem pílula', () => {
  it('o descritor em N3 sai de todas as semanas e a vaga vai para o de MENOR nota, com 2 distintos por semana', () => {
    const r: any = blueprintToTrilhaInputs(blueprint([[0, 1], [2, 3], [4, 5], [0, 1], [2, 3], [4, 5]]) as any, { [COMP]: assessment }, PROGRAMA_JORNADA);
    expect(r.error).toBeUndefined();
    expect(r.descritoresSelecionados.find((d: any) => d.descritor === D[5])).toBeUndefined();
    for (const semana of PROGRAMA_JORNADA.slotsConteudo) {
      const ds = naSemana(r, semana);
      expect(ds, `semana ${semana}`).toHaveLength(2);
      expect(new Set(ds).size, `semana ${semana} distintos`).toBe(2);
    }
    // Semanas 3 e 6 tinham [D4, D5]: D5 sai e entra o de menor nota que ainda não está na semana (D0).
    expect(naSemana(r, 3).sort()).toEqual([D[0], D[4]].sort());
    expect(naSemana(r, 6).sort()).toEqual([D[0], D[4]].sort());
    expect(r.descritoresSelecionados.every((d: any) => d.nota_atual < 3)).toBe(true);
    expect(r.avisos.some((a: string) => /sem lacuna: "Foco na execução"/.test(a))).toBe(true);
  });

  it('se o de menor nota já está na semana, a vaga vai para o PRÓXIMO de menor nota (nunca repete na mesma semana)', () => {
    const r: any = blueprintToTrilhaInputs(blueprint([[0, 5], [1, 2], [3, 4], [0, 1], [2, 3], [4, 0]]) as any, { [COMP]: assessment }, PROGRAMA_JORNADA);
    expect(naSemana(r, 1).sort()).toEqual([D[0], D[1]].sort());
  });

  it('competência SEM lacuna nenhuma fica como veio (a trilha não pode sair vazia)', () => {
    const todosProficientes = D.map((descritor, i) => ({ descritor, nota: 3 + i * 0.1 }));
    const r: any = blueprintToTrilhaInputs(blueprint([[0, 1], [2, 3], [4, 5], [0, 1], [2, 3], [4, 5]]) as any, { [COMP]: todosProficientes }, PROGRAMA_JORNADA);
    expect(r.error).toBeUndefined();
    expect(r.descritoresSelecionados).toHaveLength(6);
  });

  it('quando só UM descritor tem lacuna e ele já está na semana, o proficiente fica (a semana não perde a 2ª pílula) e isso vira aviso', () => {
    const umaLacuna = D.map((descritor, i) => ({ descritor, nota: i === 0 ? 1.2 : 3.5 }));
    const r: any = blueprintToTrilhaInputs(blueprint([[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 1]]) as any, { [COMP]: umaLacuna }, PROGRAMA_JORNADA);
    for (const semana of PROGRAMA_JORNADA.slotsConteudo) expect(naSemana(r, semana), `semana ${semana}`).toHaveLength(2);
    expect(r.avisos.some((a: string) => /ficou na semana/.test(a))).toBe(true);
  });
});

describe('caminho de reserva (selectDescriptors): proficiente não é puxado quando há lacuna', () => {
  const SLOTS = [1, 2, 3, 5, 6, 7, 9, 10, 11];

  it('com vaga sobrando, o descritor em N3 NÃO entra; a sobra vira reforço do de maior lacuna', () => {
    // 2 descritores com lacuna (2.2 e 2.6 → 1 semana cada) e 1 em N3: sobram 7 vagas.
    const sel = selectDescriptors([{ descritor: 'A', nota: 2.2 }, { descritor: 'B', nota: 2.6 }, { descritor: 'C', nota: 3.2 }], SLOTS);
    expect(sel.map((s) => s.descritor).sort()).toEqual(['A', 'B']);
    expect(sel.reduce((n, s) => n + s.semanas_alocadas, 0)).toBe(SLOTS.length);
    const a = sel.find((s) => s.descritor === 'A')!;
    const b = sel.find((s) => s.descritor === 'B')!;
    expect(a.semanas_alocadas).toBeGreaterThanOrEqual(b.semanas_alocadas);
  });

  it('sem lacuna nenhuma, os proficientes entram (a trilha não sai vazia)', () => {
    const sel = selectDescriptors([{ descritor: 'A', nota: 3.2 }, { descritor: 'B', nota: 3.6 }], SLOTS);
    expect(sel.map((s) => s.descritor).sort()).toEqual(['A', 'B']);
  });
});
