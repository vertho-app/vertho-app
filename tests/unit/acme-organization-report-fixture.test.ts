import { describe, expect, it } from 'vitest';
import {
  ACME_DEMO_ORGANIZATION_COMPETENCIES,
  criarDnaOrganizacionalAcmeDemo,
  criarNarrativaDnaAcmeDemo,
  criarPerfilOrganizacionalAcmeDemo,
} from '@/lib/demo/acme-organization-report-fixture';

function people(total: number) {
  return Array.from({ length: total }, (_, index) => ({
    id: `person-${index + 1}`,
    nome_completo: `Pessoa ${String(index + 1).padStart(2, '0')}`,
    email: `pessoa${index + 1}@demo.invalid`,
    cargo: index < 10 ? 'Representante Comercial' : index < 18 ? 'Analista Financeiro' : 'Coordenador de Operações',
    perfil_dominante: index < 28 ? (index % 2 ? 'DI' : 'CS') : null,
    d_natural: 30 + (index % 6) * 8,
    i_natural: 35 + (index % 5) * 9,
    s_natural: 40 + (index % 4) * 10,
    c_natural: 32 + (index % 7) * 8,
  }));
}

describe('relatórios organizacionais demonstrativos da ACME', () => {
  it('mantém o mesmo funil do panorama em ambos os documentos', () => {
    const directory = people(30);
    const mappedIds = new Set(directory.slice(0, 25).map((person) => person.id));
    const profile = criarPerfilOrganizacionalAcmeDemo(directory);
    const dna = criarDnaOrganizacionalAcmeDemo(directory, mappedIds);

    expect(profile.avaliados).toBe(28);
    expect(profile.porCargo?.map((group) => group.n)).toEqual([10, 10, 8]);
    expect(dna.totalColaboradores).toBe(30);
    expect(dna.avaliados).toBe(25);
    expect(dna.competencias).toHaveLength(ACME_DEMO_ORGANIZATION_COMPETENCIES.length);
    expect(dna.totalAvaliacoes).toBe(25 * 5 * 3);
    expect(dna.porCargo).toBeUndefined();
  });

  it('gera narrativa completa sem depender de IA durante a apresentação', () => {
    const directory = people(30);
    const dna = criarDnaOrganizacionalAcmeDemo(
      directory,
      new Set(directory.slice(0, 25).map((person) => person.id)),
    );
    const narrative = criarNarrativaDnaAcmeDemo(dna);

    expect(narrative.forcas).toHaveLength(3);
    expect(narrative.prioridades).toHaveLength(3);
    expect(narrative.acoes).toHaveLength(3);
    expect(narrative.intro).toContain('25 profissionais');
  });
});
