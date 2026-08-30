import { describe, expect, it } from 'vitest';
import {
  ACME_DEMO_FIT_RANKING_ROLES,
  ACME_DEMO_FIT_VARIETY_KEYS,
  acmeDemoFitRankingPath,
  buildAcmeFitRankingNarratives,
} from '@/lib/demo/acme-fit-rankings';
import { ACME_DEMO_REPORT_DIRECTORY, ACME_DEMO_WITHOUT_PROFILE_KEYS } from '@/lib/demo/acme-rh-report-fixture';
import { PERSONAS } from '@/lib/demo/reset-acme-demo';

describe('rankings demonstrativos de adequação da ACME', () => {
  it('cobre os quatro cargos e as 28 pessoas que têm perfil comportamental', () => {
    const people = [...PERSONAS, ...ACME_DEMO_REPORT_DIRECTORY]
      .filter((person) => !ACME_DEMO_WITHOUT_PROFILE_KEYS.includes(person.key as any));
    const actual = Object.fromEntries(ACME_DEMO_FIT_RANKING_ROLES.map((role) => [
      role.cargo,
      people.filter((person) => person.cargo === role.cargo).length,
    ]));
    const expected = Object.fromEntries(ACME_DEMO_FIT_RANKING_ROLES.map((role) => [role.cargo, role.expectedPeople]));

    expect(actual).toEqual(expected);
    expect(people).toHaveLength(28);
  });

  it('usa caminhos estáveis compatíveis com o leitor da tela do gestor', () => {
    expect(acmeDemoFitRankingPath('empresa-123', 'Coordenador de Operações', 1788102000000)).toBe(
      'final/adequacao-cargo/empresa-123-Coordenador20de20OperaC3A7C3B5es-1788102000000.json',
    );
  });

  it('mantém os perfis de variedade válidos e restritos ao diretório fictício', () => {
    const people = ACME_DEMO_FIT_VARIETY_KEYS.map((key) =>
      ACME_DEMO_REPORT_DIRECTORY.find((person) => person.key === key),
    );
    expect(people.every(Boolean)).toBe(true);
    expect(people.map((person) => (
      person!.d_natural + person!.i_natural + person!.s_natural + person!.c_natural
    ))).toEqual(ACME_DEMO_FIT_VARIETY_KEYS.map(() => 200));
  });

  it('gera narrativas demonstrativas para todos os estados sem depender de IA', () => {
    const person = (status: string, nome: string) => ({
      nome,
      status,
      beta: { pct: status === 'recomendado' ? 92 : 74 },
      competencia: { pct: 88, aplicavel: true },
      lideranca: { pct: 0, aplicavel: false },
      discScore: { pct: 82, aplicavel: true },
      mapeamento: { pct: 90, aplicavel: true },
      gaps: [{ traco: 'Organização', fitPct: 58 }],
      knockoutEvidencias: status === 'bloqueado'
        ? [{ traco: 'Persistência', ehBloco: false, valorBruto: 35, piso: 55 }]
        : [],
    });
    const data = {
      pessoas: [
        person('recomendado', 'Pessoa Recomendada'),
        person('recomendado_com_ressalvas', 'Pessoa com Ressalvas'),
        person('abaixo_do_corte', 'Pessoa em Desenvolvimento'),
        person('bloqueado', 'Pessoa Bloqueada'),
      ],
    } as any;

    const narratives = buildAcmeFitRankingNarratives(data);
    expect(Object.keys(narratives)).toHaveLength(4);
    expect(narratives['Pessoa Recomendada']).toContain('92%');
    expect(narratives['Pessoa com Ressalvas']).toContain('Organização');
    expect(narratives['Pessoa em Desenvolvimento']).toContain('requer desenvolvimento');
    expect(narratives['Pessoa Bloqueada']).toContain('requisito');
  });
});
