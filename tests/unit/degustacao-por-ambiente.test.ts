import { describe, expect, it } from 'vitest';
import {
  ACME_PROSPECT_ROLES,
  DEMO_PROSPECT_ROLES_POR_AMBIENTE,
  DEMO_PROSPECT_TENANTS,
  getPapelDaDegustacao,
  papeisDaDegustacao,
  validateAcmeProspectExperienceInput,
} from '@/lib/demo/acme-prospect-config';

/**
 * A degustação deixou de ser exclusiva do ACME.
 *
 * O que quebra em silêncio aqui é o CARGO: ele vira o `cargo` do colaborador
 * convidado, e é por ele que a etapa 01 acha o Top 5 e o cenário. Um papel do
 * elenco comercial num roteiro escolar produz um convidado cujo cargo não tem
 * matriz no tenant — e a demonstração morre em "Cenário para X ainda não foi
 * gerado" na frente do prospect, sem nada acusar antes.
 *
 * `Medido 01/09/2026:` no `escolas-acme` só Professor(a) e Coordenador(a)
 * Pedagógico(a) têm competências e cenário A gerado. Diretor(a) Escolar não
 * tem, de propósito — a direção administra o programa e fica fora da jornada.
 */
describe('degustação por ambiente', () => {
  it('cada ambiente oferece o próprio elenco de papéis', () => {
    expect(papeisDaDegustacao('acme-demo')).toBe(ACME_PROSPECT_ROLES);
    const escolar = papeisDaDegustacao('escolas-acme').map((r: any) => r.cargo);
    expect(escolar).toEqual(['Professor(a)', 'Coordenador(a) Pedagógico(a)']);
  });

  it('não oferece Diretor(a) Escolar: cargo sem matriz mataria a etapa 01', () => {
    const cargos = papeisDaDegustacao('escolas-acme').map((r: any) => r.cargo);
    expect(cargos).not.toContain('Diretor(a) Escolar');
  });

  it('papel de um ambiente NÃO vale no outro', () => {
    // o roleKey chega do cliente; sem esta régua, o convidado escolar nasceria
    // com cargo comercial
    expect(getPapelDaDegustacao('escolas-acme', 'representante-comercial')).toBeNull();
    expect(getPapelDaDegustacao('acme-demo', 'professor')).toBeNull();
    expect(getPapelDaDegustacao('escolas-acme', 'professor')?.cargo).toBe('Professor(a)');
  });

  it('a validação recusa o papel que não pertence ao ambiente', () => {
    const entrada = { nome: 'Marina Souza', empresa: 'Colégio Horizonte', roleKey: 'representante-comercial' };
    const escolar = validateAcmeProspectExperienceInput(entrada, 'escolas-acme');
    expect(escolar.ok).toBe(false);

    const noAcme = validateAcmeProspectExperienceInput(entrada, 'acme-demo');
    expect(noAcme.ok).toBe(true);
  });

  it('ambiente desconhecido cai no elenco do ACME, e não em lista vazia', () => {
    // lista vazia deixaria o formulário sem opção nenhuma — falha muda
    expect(papeisDaDegustacao('inexistente').length).toBeGreaterThan(0);
  });

  it('todo ambiente com papéis está registrado como tenant de degustação', () => {
    // a tela monta o seletor a partir de DEMO_PROSPECT_TENANTS; um ambiente com
    // papéis e sem registro nunca apareceria, e um registrado sem papéis
    // ofereceria o elenco errado por omissão
    for (const slug of Object.keys(DEMO_PROSPECT_ROLES_POR_AMBIENTE)) {
      expect(
        Object.prototype.hasOwnProperty.call(DEMO_PROSPECT_TENANTS, slug),
        `${slug} tem papéis mas não é tenant de degustação`,
      ).toBe(true);
    }
    for (const slug of Object.keys(DEMO_PROSPECT_TENANTS)) {
      expect(
        Object.prototype.hasOwnProperty.call(DEMO_PROSPECT_ROLES_POR_AMBIENTE, slug),
        `${slug} é tenant de degustação mas não declara papéis`,
      ).toBe(true);
    }
  });

  it('cada ambiente tem prefixo de e-mail PRÓPRIO — é o que separa as faxinas', () => {
    const prefixos = Object.values(DEMO_PROSPECT_TENANTS).map((t) => t.authPrefix);
    expect(new Set(prefixos).size).toBe(prefixos.length);
  });
});
