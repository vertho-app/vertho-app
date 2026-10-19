import { describe, it, expect } from 'vitest';
import {
  AMBIENTES_DEMO_DO_RC,
  DEMO_PERSONAS_POR_TENANT,
  personasDemoDoTenant,
} from '@/lib/sales/demo-personas';
import { PERSONAS as PERSONAS_COMERCIAIS, DEMO_RH_PERSONA } from '@/lib/demo/rosters/comercial';
import { PERSONAS_ESCOLARES, DIRECAO_PERSONA } from '@/lib/demo/rosters/escolar';

/**
 * A lista de personas do portal do RC é escrita à mão (o roster escolar
 * carrega a régua inteira e não pode ir para o portal). Quem garante que ela
 * não diverge do elenco que o reset semeia é este teste: e-mail que não existe
 * no tenant só falha DEPOIS do clique do vendedor ("Personas do demo não
 * encontradas"), e a casa errada abre a coordenação na tela do professor.
 */
const ELENCO_DO_RESET: Record<keyof typeof DEMO_PERSONAS_POR_TENANT, ReadonlyArray<{ email: string; role: string }>> = {
  'acme-demo': [...PERSONAS_COMERCIAIS, DEMO_RH_PERSONA],
  gruposinal: [...PERSONAS_COMERCIAIS, DEMO_RH_PERSONA],
  'escolas-acme': [...PERSONAS_ESCOLARES, DIRECAO_PERSONA],
};

const casaDoPapel = (role: string) => (role === 'gestor' ? '/dashboard/gestor' : '/dashboard');

describe('personas do Ambiente de Demonstração do RC', () => {
  for (const [slug, personas] of Object.entries(DEMO_PERSONAS_POR_TENANT)) {
    const elenco = ELENCO_DO_RESET[slug as keyof typeof DEMO_PERSONAS_POR_TENANT];

    it(`${slug}: toda persona existe no elenco que o reset semeia`, () => {
      const emails = new Set(elenco.map((p) => p.email));
      const fora = personas.filter((p) => !emails.has(p.email)).map((p) => p.email);
      expect(fora).toEqual([]);
    });

    it(`${slug}: cada persona abre na casa do PAPEL que tem no tenant`, () => {
      for (const p of personas) {
        const noElenco = elenco.find((e) => e.email === p.email);
        expect(p.nextPath, `${p.key} (${noElenco?.role})`).toBe(casaDoPapel(String(noElenco?.role)));
      }
    });

    it(`${slug}: chaves únicas`, () => {
      expect(new Set(personas.map((p) => p.key)).size).toBe(personas.length);
    });
  }

  it('a escola tem professor, coordenação e direção, com a coordenação na visão de equipe', () => {
    const escola = personasDemoDoTenant('escolas-acme')!;
    expect(new Set(escola.map((p) => p.papel))).toEqual(new Set(['Professor(a)', 'Coordenação', 'Direção']));
    expect(escola.filter((p) => p.papel === 'Coordenação').every((p) => p.nextPath === '/dashboard/gestor')).toBe(true);
  });

  it('todo ambiente do seletor tem elenco', () => {
    for (const a of AMBIENTES_DEMO_DO_RC) {
      expect(personasDemoDoTenant(a.slug)?.length, a.slug).toBeGreaterThan(0);
    }
    expect(AMBIENTES_DEMO_DO_RC.map((a) => a.slug)).toEqual(['acme-demo', 'escolas-acme']);
  });

  it('slug fora da allowlist não vira elenco', () => {
    expect(personasDemoDoTenant('constructor')).toBeNull();
    expect(personasDemoDoTenant('outra-empresa')).toBeNull();
  });
});
