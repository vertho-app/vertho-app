import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_PROSPECT_ROLES_POR_AMBIENTE } from '@/lib/demo/acme-prospect-config';
import { ACME_DEMO_MAPPED_KEYS, ACME_DEMO_REPORT_DIRECTORY } from '@/lib/demo/acme-rh-report-fixture';
import { cargoSemAssessment, jornadaDoCargoConstruido } from '@/lib/demo/rosters/cargo-sem-assessment';
import { DEMO_ROSTERS, ROSTER_COMERCIAL } from '@/lib/demo/rosters';

/**
 * Quem SÓ LIDERA não faz mapeamento nem jornada (decisão do dono em 16/09/2026
 * para a gestão comercial, a mesma da coordenação das escolas).
 *
 * 🔴 O QUE ESTE ARQUIVO PEGA. Declarar o cargo em `cargosSemAssessment` não
 * bastava: o Gerente Comercial é CONSTRUÍDO pelo reset, e o construtor gravava o
 * Top 5 cheio sem olhar a lista. O guard da degustação ficava verde (compara
 * código com código) e o banco seguia igual. E, com o Top 5 zerado de verdade, o
 * Marcelo continuaria no funil do ACME como mapeado: o DNA Organizacional
 * contaria 24 contra 25 e derrubaria o reset no meio, depois do wipe.
 */
const pessoasDoRoster = (roster: any) => [...roster.personas, ...(roster.diretorio ?? [])];

describe('cargo que só lidera', () => {
  it('a gestão comercial está declarada, e a coordenação das escolas continua', () => {
    expect(cargoSemAssessment(ROSTER_COMERCIAL, 'Gerente Comercial')).toBe(true);
    expect(cargoSemAssessment(ROSTER_COMERCIAL, '  gerente COMERCIAL ')).toBe(true);
    expect(cargoSemAssessment(ROSTER_COMERCIAL, 'Representante Comercial')).toBe(false);
    expect(cargoSemAssessment(DEMO_ROSTERS.escolar, 'Coordenador(a) Pedagógico(a)')).toBe(true);
    expect(cargoSemAssessment(DEMO_ROSTERS.escolar, 'Professor(a)')).toBe(false);
    expect(cargoSemAssessment(ROSTER_COMERCIAL, '')).toBe(false);
    expect(cargoSemAssessment(ROSTER_COMERCIAL, null)).toBe(false);
  });

  it('🔴 o cargo CONSTRUÍDO que só lidera nasce sem Top 5 e sem foco; os outros, com os cinco', () => {
    const construidos = ROSTER_COMERCIAL.cargosConstruidos;
    expect(construidos.length).toBeGreaterThan(1);

    const gerente = construidos.find((cargo) => cargo.nome === 'Gerente Comercial');
    expect(gerente).toBeTruthy();
    expect(jornadaDoCargoConstruido(ROSTER_COMERCIAL, gerente!)).toEqual({
      top5_workshop: [], competencia_foco: null, competencias_foco: [],
    });

    for (const cargo of construidos.filter((c) => !cargoSemAssessment(ROSTER_COMERCIAL, c.nome))) {
      const jornada = jornadaDoCargoConstruido(ROSTER_COMERCIAL, cargo);
      expect(jornada.top5_workshop).toEqual(cargo.competencias.map(([nome]) => nome));
      expect(jornada.top5_workshop).toHaveLength(5);
      expect(jornada.competencia_foco).toBe(cargo.competencias_foco[0]);
    }
  });

  it('🔴 o reset usa a MESMA régua nos quatro pontos do seed', () => {
    // Estático de propósito: o reset inteiro não roda sem banco, e a regressão
    // que importa é alguém voltar a gravar o Top 5 do cargo construído na mão.
    const fonte = readFileSync(path.resolve(__dirname, '../../lib/demo/reset-acme-demo.ts'), 'utf8');
    expect(fonte).not.toMatch(/top5_workshop:\s*role\.competencias/);
    expect(fonte).toContain('...jornadaDoCargoConstruido(roster, role)');
    expect(fonte).not.toContain('cargosSemAssessment?.includes');
    // seedCargos, seedRespostas e a central do RH
    expect(fonte.match(/cargoSemAssessment\(roster, /g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  for (const [chave, roster] of Object.entries(DEMO_ROSTERS)) {
    it(`🔴 ${chave}: ninguém que só lidera entra no funil, responde situação ou tem mapeamento completo`, () => {
      const semJornada = (roster.cargosSemAssessment ?? []);
      expect(semJornada.length, `${chave} sem cargo que só lidera: o guard não olharia nada`).toBeGreaterThan(0);

      const pessoas = pessoasDoRoster(roster);
      const lideres = pessoas.filter((pessoa: any) => cargoSemAssessment(roster, pessoa.cargo));
      expect(lideres.length).toBeGreaterThan(0);
      const chavesDosLideres = new Set(lideres.map((pessoa: any) => pessoa.key));

      const panorama = roster.panorama ?? {};
      const violacoes: string[] = [];
      for (const grupo of ['mapeados', 'emJornada', 'concluidos', 'atrasados'] as const) {
        for (const key of (panorama as any)[grupo] ?? []) {
          if (chavesDosLideres.has(key)) violacoes.push(`${grupo}: ${key}`);
        }
      }
      for (const pessoa of lideres as any[]) {
        if ((pessoa.responder ?? []).length > 0) violacoes.push(`responder: ${pessoa.key}`);
        if (pessoa.scenario === 'completo') violacoes.push(`scenario completo: ${pessoa.key}`);
      }
      expect(violacoes).toEqual([]);
    });
  }

  it('o funil do ACME não conta quem só lidera como mapeado (é o que o DNA confere no reset)', () => {
    const lideres = ACME_DEMO_REPORT_DIRECTORY.filter((pessoa) => cargoSemAssessment(ROSTER_COMERCIAL, pessoa.cargo));
    expect(lideres.map((pessoa) => pessoa.key)).toEqual(['marcelo']);
    for (const pessoa of lideres) expect(ACME_DEMO_MAPPED_KEYS).not.toContain(pessoa.key);
  });

  it('a degustação do ACME e do Grupo Sinal não oferece mais o Gerente Comercial', () => {
    for (const slug of ['acme-demo', 'gruposinal'] as const) {
      const cargos = DEMO_PROSPECT_ROLES_POR_AMBIENTE[slug].map((papel) => papel.cargo as string);
      expect(cargos.length).toBeGreaterThan(0);
      expect(cargos).not.toContain('Gerente Comercial');
    }
  });
});
