import { describe, it, expect } from 'vitest';
import {
  DEMO_PROSPECT_ROLES_POR_AMBIENTE,
  DEMO_PROSPECT_TENANTS,
} from '@/lib/demo/acme-prospect-config';
import { DEMO_TENANT_PROFILES } from '@/lib/demo/reset-acme-demo';
import { rosterDemo } from '@/lib/demo/rosters';

/**
 * Guard: a degustação só oferece cargo que PERCORRE a jornada.
 *
 * 🔴 O QUE ELE PEGA, e por que um teste comum não pegaria
 *
 * `acme-prospect-config` já declarava a invariante em prosa: "só entra cargo que
 * tem MATRIZ no tenant — oferecer um cargo sem matriz produziria uma degustação
 * que morre em 'Cenário para X ainda não foi gerado' na frente do prospect".
 * Prosa não é catraca.
 *
 * Medido em 08/09/2026: `Coordenador(a) Pedagógico(a)` estava sendo oferecido no
 * `escolas-acme` e tinha o Top 5 VAZIO. As duas decisões entraram com um dia de
 * diferença — 01/09 a degustação passou a oferecer o cargo, 02/09 o roster o pôs
 * em `cargosSemAssessment` para a coordenação não ser convidada a um mapeamento
 * que ela não faz — e nenhuma das duas estava errada sozinha. O que faltou foi
 * cruzar as duas listas.
 *
 * A verificação é ESTÁTICA (código contra código), então roda no CI sem banco:
 * `cargosSemAssessment` do roster é a declaração de quem NÃO percorre a jornada,
 * e o cargo oferecido na degustação é a promessa de que percorre.
 */
describe('guard: cargo oferecido na degustação percorre a jornada', () => {
  const ambientes = Object.keys(DEMO_PROSPECT_ROLES_POR_AMBIENTE);

  it('varre os ambientes de degustação (denominador visível)', () => {
    // Alvo vazio reporta verde: o guard tem que provar que olhou para algo.
    expect(ambientes.length).toBeGreaterThan(0);
    for (const slug of ambientes) {
      expect((DEMO_PROSPECT_ROLES_POR_AMBIENTE as any)[slug].length).toBeGreaterThan(0);
    }
  });

  it('🔴 nenhum cargo oferecido está em `cargosSemAssessment` do roster', () => {
    const violacoes: string[] = [];

    for (const slug of ambientes) {
      const perfil = (DEMO_TENANT_PROFILES as any)[slug];
      // Ambiente de degustação sem perfil de tenant não teria como ser semeado:
      // é uma inconsistência por si só.
      expect(perfil, `${slug} oferece degustação mas não tem perfil de tenant`).toBeTruthy();

      const roster = rosterDemo(perfil.roster);
      const semJornada = new Set((roster.cargosSemAssessment ?? []).map((c: string) => c.trim().toLowerCase()));
      for (const papel of (DEMO_PROSPECT_ROLES_POR_AMBIENTE as any)[slug]) {
        if (semJornada.has(String(papel.cargo).trim().toLowerCase())) {
          violacoes.push(`${slug}: "${papel.cargo}" tem Top 5 zerado (cargosSemAssessment) e é oferecido na degustação`);
        }
      }
    }

    expect(
      violacoes,
      `Cargo sem matriz na degustação — o prospect morre na etapa 01:\n${violacoes.join('\n')}`,
    ).toEqual([]);
  });

  it('todo ambiente de degustação está registrado nos dois lugares', () => {
    // `DEMO_PROSPECT_TENANTS` guarda o prefixo de e-mail do convidado, e é ele
    // que mantém a faxina de um ambiente dentro da própria casa. Um ambiente que
    // oferece cargos sem estar registrado ali criaria convidados que a limpeza
    // de OUTRO tenant trataria como resíduo.
    for (const slug of ambientes) {
      expect(
        (DEMO_PROSPECT_TENANTS as any)[slug],
        `${slug} oferece cargos mas não está em DEMO_PROSPECT_TENANTS`,
      ).toBeTruthy();
    }
  });
});
