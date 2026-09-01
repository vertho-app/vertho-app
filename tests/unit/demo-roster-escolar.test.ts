import { describe, expect, it } from 'vitest';
import { ROSTER_COMERCIAL, ROSTER_ESCOLAR } from '@/lib/demo/rosters';
import { UNIDADES_ESCOLARES } from '@/lib/demo/rosters/escolar';
import { deriveProfile } from '@/lib/disc-mapeamento';

/**
 * O elenco da Rede de Escolas ACME. As invariantes aqui são as mesmas que o
 * roster comercial respeita — a diferença é que este nasceu depois da camada de
 * roster existir, então ele é a prova de que a camada serve para um segundo
 * segmento e não só para descrever o primeiro.
 */

const cargosDoRoster = new Set(ROSTER_ESCOLAR.cargosConstruidos.map((cargo) => cargo.nome));
const competenciasPorCargo = new Map(
  ROSTER_ESCOLAR.cargosConstruidos.map((cargo) =>
    [cargo.nome, cargo.competencias.map(([nome]) => nome)] as [string, string[]]),
);

describe('roster escolar: a Rede de Escolas ACME', () => {
  it('tem os três cargos com prefixo próprio e cinco competências cada', () => {
    expect(ROSTER_ESCOLAR.cargosConstruidos).toHaveLength(3);
    const prefixos = ROSTER_ESCOLAR.cargosConstruidos.map((cargo) => cargo.codPrefix);
    expect(new Set(prefixos).size).toBe(prefixos.length);
    for (const cargo of ROSTER_ESCOLAR.cargosConstruidos) {
      expect(cargo.codPrefix).toMatch(/^[A-Z]{3}$/);
      expect(cargo.competencias).toHaveLength(5);
      for (const [nome, descricao] of cargo.competencias) {
        expect(nome.length).toBeGreaterThan(3);
        expect(descricao.length).toBeGreaterThan(40);
      }
    }
  });

  // A heurística antiga do motor (`startsWith('Analista')`, `includes('Coordenador')`)
  // daria 'GER' para dois destes três cargos, colidindo o `cod_comp`.
  it('não herdaria prefixo utilizável da derivação por nome', () => {
    const antigo = (nome: string) => (nome.startsWith('Analista') ? 'FIN'
      : nome.startsWith('Coordenador') ? 'OPS' : 'GER');
    const derivados = ROSTER_ESCOLAR.cargosConstruidos.map((cargo) => antigo(cargo.nome));
    expect(new Set(derivados).size).toBeLessThan(derivados.length);
  });

  it('põe a competência com acervo dentro do Top 5 de quem tem jornada', () => {
    // Sem isso a trilha nasce sem conteúdo: o resolver casa por
    // (competência × descritor), e o acervo de origem vive nestas duas.
    expect(competenciasPorCargo.get('Diretor(a) Escolar'))
      .toContain('Planejamento e Organização');
    expect(competenciasPorCargo.get('Coordenador(a) Pedagógico(a)'))
      .toContain('Colaboração docente e cultura formativa');
  });

  it('o foco de cada cargo é uma competência dele', () => {
    for (const cargo of ROSTER_ESCOLAR.cargosConstruidos) {
      expect(cargo.competencias_foco.length).toBeGreaterThan(0);
      for (const foco of cargo.competencias_foco) {
        expect(competenciasPorCargo.get(cargo.nome)).toContain(foco);
      }
    }
  });

  it('toda persona aponta para um cargo do roster e responde o que existe nele', () => {
    for (const persona of ROSTER_ESCOLAR.personas) {
      expect(cargosDoRoster, `${persona.key} é ${persona.cargo}`).toContain(persona.cargo);
      for (const competencia of persona.responder) {
        expect(competenciasPorCargo.get(persona.cargo), `${persona.key} responde "${competencia}"`)
          .toContain(competencia);
      }
    }
  });

  // Régua do produto: DISC soma 200 e `perfil_dominante` é o que o mapeamento
  // deriva. Número que a plataforma não produz não pode aparecer numa demo, e
  // a ORDEM das letras não é decorativa — a primeira ancora a geração do kit.
  it('as personas seguem a régua DISC do produto', () => {
    for (const persona of ROSTER_ESCOLAR.personas) {
      const disc = {
        D: persona.d_natural,
        I: persona.i_natural,
        S: persona.s_natural,
        C: persona.c_natural,
      };
      expect(disc.D + disc.I + disc.S + disc.C, `soma de ${persona.key}`).toBe(200);
      expect(persona.perfil_dominante, `perfil de ${persona.key}`).toBe(deriveProfile(disc));
    }
  });

  it('mantém os três estados de jornada que fazem a demo contar uma história', () => {
    const cenarios = ROSTER_ESCOLAR.personas.map((persona) => persona.scenario);
    expect(cenarios).toContain('completo');
    expect(cenarios).toContain('parcial');
    expect(cenarios).toContain('novo');
    // Quem está "completo" responde o cargo inteiro; quem é "novo" não responde nada.
    for (const persona of ROSTER_ESCOLAR.personas) {
      if (persona.scenario === 'completo') {
        expect(persona.responder).toHaveLength(competenciasPorCargo.get(persona.cargo)!.length);
      }
      if (persona.scenario === 'novo') expect(persona.responder).toHaveLength(0);
    }
  });

  it('a rede tem unidades, e cada persona vive em uma delas', () => {
    const unidades = new Set(UNIDADES_ESCOLARES.map((unidade) => unidade.nome));
    expect(unidades.size).toBe(3);
    for (const persona of ROSTER_ESCOLAR.personas) {
      expect(unidades, `${persona.key} em "${persona.area_depto}"`).toContain(persona.area_depto);
    }
  });

  it('todo liderado aponta para um gestor que existe no elenco', () => {
    const gestores = new Map(ROSTER_ESCOLAR.personas
      .filter((persona) => persona.role === 'gestor')
      .map((persona) => [persona.email, persona]));
    for (const persona of ROSTER_ESCOLAR.personas) {
      if (!persona.gestor_email) continue;
      const gestor = gestores.get(persona.gestor_email);
      expect(gestor, `gestor de ${persona.key}`).toBeDefined();
      // O vínculo do produto é por e-mail, mas a tela lê o NOME: os dois têm
      // de descrever a mesma pessoa, senão a demo mostra um gestor e filtra
      // por outro.
      expect(persona.gestor_nome).toBe(gestor!.nome_completo);
      // Ninguém é gestor de si mesmo (a listagem de liderados exclui o próprio
      // id, então um autovínculo produz uma equipe vazia sem erro).
      expect(persona.gestor_email).not.toBe(persona.email);
    }
  });

  it('a Mantenedora administra o programa e fica fora da jornada', () => {
    expect(ROSTER_ESCOLAR.administradora.role).toBe('rh');
    expect(ROSTER_ESCOLAR.personas.map((persona) => persona.key))
      .not.toContain(ROSTER_ESCOLAR.administradora.key);
    // O cargo dela não tem matriz no tenant, como no elenco comercial.
    expect(cargosDoRoster).not.toContain(ROSTER_ESCOLAR.administradora.cargo);
  });

  it('a sala ao vivo cobre as três visões, com gente que existe no elenco', () => {
    const emails = new Set([
      ...ROSTER_ESCOLAR.personas.map((persona) => persona.email),
      ROSTER_ESCOLAR.administradora.email,
    ]);
    expect(ROSTER_ESCOLAR.salaApresentacao.map((acesso) => acesso.presentationRoleKey))
      .toEqual(['usuario', 'gestor', 'rh']);
    for (const acesso of ROSTER_ESCOLAR.salaApresentacao) {
      expect(emails, `sala: ${acesso.email}`).toContain(acesso.email);
    }
  });

  it('não reaproveita e-mail nem chave do elenco comercial', () => {
    const comercial = new Set([
      ...ROSTER_COMERCIAL.personas.map((persona) => persona.email),
      ROSTER_COMERCIAL.administradora.email,
    ]);
    for (const persona of ROSTER_ESCOLAR.personas) {
      expect(comercial, `${persona.email} colide com o comercial`).not.toContain(persona.email);
    }
    expect(comercial).not.toContain(ROSTER_ESCOLAR.administradora.email);
  });

  it('não declara cargo principal de fixture, porque todos nascem construídos', () => {
    expect(ROSTER_ESCOLAR.cargoPrincipal).toBeNull();
    expect(ROSTER_ESCOLAR.cargoPrincipalTop5).toHaveLength(0);
    expect(ROSTER_ESCOLAR.cargosExcluidosDoFixture.size).toBe(0);
  });
});
