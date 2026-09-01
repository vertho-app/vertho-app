import { describe, expect, it } from 'vitest';
import { ROSTER_COMERCIAL } from '@/lib/demo/rosters/comercial';
import { focosValidosDemo } from '@/lib/demo/reset-acme-demo';

/**
 * O elenco saiu do motor do reset e virou dado (`lib/demo/rosters/`). Dois
 * campos que o motor DERIVAVA do nome do cargo passaram a ser declarados:
 * `codPrefix` (prefixo do código da competência) e `ehLideranca`.
 *
 * A derivação funcionava por acidente num elenco só. "Coordenador de Operações"
 * casava `startsWith('Analista')? : startsWith('Coordenador')?` na posição
 * certa; num roster escolar, "Coordenação Pedagógica" cairia no `else` e levaria
 * o prefixo do Gerente Comercial, colidindo o `cod_comp` de dois cargos.
 *
 * Aqui as duas implementações rodam contra os MESMOS cargos: a nova só vale se
 * reproduzir a antiga onde a antiga estava certa.
 */

/** A heurística que vivia dentro de `insertDemoExtraRoles`, preservada literal. */
const codPrefixAntigo = (nome: string) => (nome.startsWith('Analista') ? 'FIN'
  : nome.startsWith('Coordenador') ? 'OPS' : 'GER');
const ehLiderancaAntigo = (nome: string) => nome.includes('Coordenador') || nome.includes('Gerente');

describe('roster comercial: o elenco extraído do motor', () => {
  it('reproduz exatamente o que a derivação por nome produzia', () => {
    for (const cargo of ROSTER_COMERCIAL.cargosConstruidos) {
      expect({ nome: cargo.nome, cod: cargo.codPrefix, lid: cargo.ehLideranca }).toEqual({
        nome: cargo.nome,
        cod: codPrefixAntigo(cargo.nome),
        lid: ehLiderancaAntigo(cargo.nome),
      });
    }
    expect(ROSTER_COMERCIAL.cargosConstruidos).toHaveLength(3);
  });

  it('não repete prefixo de código entre cargos (a colisão seria em `cod_comp`)', () => {
    const prefixos = ROSTER_COMERCIAL.cargosConstruidos.map((cargo) => cargo.codPrefix);
    expect(new Set(prefixos).size).toBe(prefixos.length);
    for (const prefixo of prefixos) expect(prefixo).toMatch(/^[A-Z]{3}$/);
  });

  it('todo cargo construído chega com competências e um foco entre elas', () => {
    for (const cargo of ROSTER_COMERCIAL.cargosConstruidos) {
      expect(cargo.competencias.length).toBeGreaterThan(0);
      const nomes = cargo.competencias.map(([nome]) => nome);
      expect(cargo.competencias_foco.length).toBeGreaterThan(0);
      for (const foco of cargo.competencias_foco) expect(nomes).toContain(foco);
    }
  });

  it('toda persona aponta para um cargo que o roster semeia', () => {
    const cargosDoRoster = new Set([
      ROSTER_COMERCIAL.cargoPrincipal,
      ...ROSTER_COMERCIAL.cargosConstruidos.map((cargo) => cargo.nome),
    ]);
    for (const persona of ROSTER_COMERCIAL.personas) {
      expect(cargosDoRoster).toContain(persona.cargo);
    }
    // A administradora fica FORA das personas de propósito: ela não percorre a
    // jornada, e o cargo dela não tem matriz no tenant.
    expect(ROSTER_COMERCIAL.personas.map((p) => p.key))
      .not.toContain(ROSTER_COMERCIAL.administradora.key);
  });

  it('o que cada persona responde existe no cargo dela', () => {
    const competenciasPorCargo = new Map<string, string[]>([
      [ROSTER_COMERCIAL.cargoPrincipal, ROSTER_COMERCIAL.cargoPrincipalTop5],
      ...ROSTER_COMERCIAL.cargosConstruidos.map((cargo) =>
        [cargo.nome, cargo.competencias.map(([nome]) => nome)] as [string, string[]]),
    ]);
    for (const persona of ROSTER_COMERCIAL.personas) {
      const disponiveis = competenciasPorCargo.get(persona.cargo) || [];
      for (const competencia of persona.responder) {
        expect(disponiveis, `${persona.key} responde "${competencia}"`).toContain(competencia);
      }
    }
  });

  it('o foco do cargo principal sai do Top 5 dele', () => {
    for (const foco of ROSTER_COMERCIAL.cargoPrincipalFoco) {
      expect(ROSTER_COMERCIAL.cargoPrincipalTop5).toContain(foco);
    }
  });

  // `focosValidosDemo` decidia pelo literal 'Representante Comercial'; agora
  // pergunta ao roster. O default preserva quem já chamava com dois argumentos.
  it('focosValidosDemo continua fixando o foco do cargo principal', () => {
    const cargo = { nome: ROSTER_COMERCIAL.cargoPrincipal, competencias_foco: ['Coisa que não existe'] };
    expect(focosValidosDemo(cargo, ROSTER_COMERCIAL.cargoPrincipalTop5))
      .toEqual(ROSTER_COMERCIAL.cargoPrincipalFoco);
    expect(focosValidosDemo(cargo, ROSTER_COMERCIAL.cargoPrincipalTop5, ROSTER_COMERCIAL))
      .toEqual(ROSTER_COMERCIAL.cargoPrincipalFoco);
  });

  it('cargo fora do principal mantém o foco próprio, filtrado pelo Top 5', () => {
    const top5 = ['Coaching e Desenvolvimento de Vendedores', 'Negociação Estratégica e Suporte a Deals'];
    const cargo = { nome: 'Gerente Comercial', competencias_foco: ['Negociação Estratégica e Suporte a Deals', 'Fora do Top 5'] };
    expect(focosValidosDemo(cargo, top5, ROSTER_COMERCIAL))
      .toEqual(['Negociação Estratégica e Suporte a Deals']);
  });
});
