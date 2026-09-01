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
  it('tem os cargos com matriz, cada um com prefixo próprio e cinco competências', () => {
    // Dois: professor e coordenação. A direção administra o programa (papel
    // `rh`) e não percorre jornada, então não tem matriz — cargo sem
    // participante apareceria vazio no ranking.
    expect(ROSTER_ESCOLAR.cargosConstruidos).toHaveLength(2);
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
  // carimbaria estes cargos com os prefixos do elenco COMERCIAL: "Professor(a)"
  // cairia no `else` e levaria 'GER', o do Gerente Comercial.
  it('não herdaria da derivação por nome os prefixos que declara', () => {
    const antigo = (nome: string) => (nome.startsWith('Analista') ? 'FIN'
      : nome.startsWith('Coordenador') ? 'OPS' : 'GER');
    for (const cargo of ROSTER_ESCOLAR.cargosConstruidos) {
      expect(antigo(cargo.nome), `${cargo.nome} coincidiria por acaso`).not.toBe(cargo.codPrefix);
    }
  });

  it('quem percorre a jornada é o professor, e a coordenação acompanha', () => {
    // Decisão do dono (01/09): a jornada completa é do professor; coordenação
    // não faz avaliação nem trilha, e por isso não responde competência
    // nenhuma. Ela continua no ranking de adequação, que lê as colunas
    // comportamentais e não os assessments.
    const completos = ROSTER_ESCOLAR.personas.filter((p) => p.scenario === 'completo');
    expect(completos).toHaveLength(1);
    expect(completos[0].cargo).toBe('Professor(a)');
    for (const persona of ROSTER_ESCOLAR.personas) {
      if (persona.role === 'gestor') {
        expect(persona.responder, `${persona.key} não deveria responder`).toHaveLength(0);
      }
    }
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

  // Decisão do dono (01/09): a persona da régua eliminatória fica na
  // COORDENAÇÃO, não na direção. O motivo vale como invariante: uma reprovação
  // só é legível ao lado de alguém do mesmo cargo que passa — ranking de um
  // não compara nada.
  it('cargo com jornada parcial tem com quem comparar', () => {
    const porCargo = new Map<string, number>();
    for (const persona of ROSTER_ESCOLAR.personas) {
      porCargo.set(persona.cargo, (porCargo.get(persona.cargo) || 0) + 1);
    }
    const parciais = ROSTER_ESCOLAR.personas.filter((persona) => persona.scenario === 'parcial');
    expect(parciais.length).toBeGreaterThan(0);
    for (const persona of parciais) {
      expect(porCargo.get(persona.cargo), `${persona.cargo} tem só ${persona.key}`)
        .toBeGreaterThanOrEqual(2);
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

  /**
   * O seed usava o texto COMERCIAL para qualquer ambiente, e a diretora da rede
   * aparecia dizendo "interesses do cliente e riscos comerciais". Além de ser a
   * demo errada na tela, é o texto que a IA4 avalia: a nota sairia de um
   * vocabulário que o segmento não fala.
   */
  it('as respostas do elenco não carregam jargão comercial', () => {
    const proibidos = [/cliente/i, /CRM/, /margem/i, /comercia(l|is)/i, /venda/i, /pipeline/i];
    const competencia = 'Planejamento e Organização';
    const persona = ROSTER_ESCOLAR.personas[0];
    const conjuntos = [
      ROSTER_ESCOLAR.respostas.padrao(competencia, persona),
      ROSTER_ESCOLAR.respostas.forte!(competencia, persona),
    ];
    for (const conjunto of conjuntos) {
      const texto = [conjunto.r1, conjunto.r2, conjunto.r3, conjunto.r4].join(' ');
      expect(texto.length).toBeGreaterThan(400);
      for (const proibido of proibidos) {
        expect(proibido.test(texto), `"${proibido}" aparece na resposta escolar`).toBe(false);
      }
    }
  });

  it('quem tem jornada completa responde no melhor caso', () => {
    for (const persona of ROSTER_ESCOLAR.personas) {
      if (persona.scenario === 'completo') expect(persona.estiloResposta).toBe('forte');
    }
  });

  /**
   * A régua é o que a IA3 e a IA4 leem, e o que aparece na tela do mapeamento.
   * O gerador genérico do motor repete os mesmos 6 rótulos ("Leitura do
   * contexto", "Comunicação com stakeholders") e o MESMO N1-N4 em toda
   * competência — foi por isso que 10 dos 15 primeiros cenários vieram com
   * mapa incoerente entre pergunta e descritor.
   */
  it('toda competência tem régua própria, com seis descritores', () => {
    expect(ROSTER_ESCOLAR.descritores).toBeDefined();
    for (const cargo of ROSTER_ESCOLAR.cargosConstruidos) {
      for (const [competencia] of cargo.competencias) {
        const regua = ROSTER_ESCOLAR.descritores![`${cargo.nome}::${competencia}`];
        expect(regua, `sem régua: ${cargo.nome} · ${competencia}`).toBeDefined();
        expect(regua).toHaveLength(6);
      }
    }
  });

  it('a régua não repete o mesmo nível entre descritores da competência', () => {
    // O gerador genérico dá o mesmo N3 a todos: com ele, a avaliação não
    // consegue diferenciar um descritor do outro.
    for (const [chave, regua] of Object.entries(ROSTER_ESCOLAR.descritores!)) {
      const nomes = new Set(regua.map((d) => d.nome_curto));
      const metas = new Set(regua.map((d) => d.n3_meta));
      expect(nomes.size, `${chave}: descritores repetidos`).toBe(regua.length);
      expect(metas.size, `${chave}: mesmo N3 em mais de um descritor`).toBe(regua.length);
      for (const descritor of regua) {
        expect(descritor.evidencias_esperadas.length, `${chave}/${descritor.nome_curto} sem evidências`).toBeGreaterThan(40);
      }
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
