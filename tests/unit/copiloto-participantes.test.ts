import { describe, it, expect } from 'vitest';
import {
  cadeiraDoCargo,
  cadeirasPresentes,
  enriquecerComContatos,
  formatarParticipantes,
  fundirComDescobertos,
  marcarSemAchado,
  mesmaPessoa,
  nomeDoPerfil,
  normalizarPessoas,
  parsePerfisDePessoa,
  parseParticipantes,
} from '@/lib/copiloto/participantes';

describe('cadeiraDoCargo', () => {
  it('põe cada cargo na cadeira que ele ocupa na decisão', () => {
    expect(cadeiraDoCargo('CFO')).toBe('financeiro');
    expect(cadeiraDoCargo('Gerente de Controladoria')).toBe('financeiro');
    expect(cadeiraDoCargo('Head de T&D')).toBe('RH');
    expect(cadeiraDoCargo('Diretora de Recursos Humanos')).toBe('RH');
    expect(cadeiraDoCargo('Coordenadora Pedagógica')).toBe('RH');
    expect(cadeiraDoCargo('COO')).toBe('operações');
    expect(cadeiraDoCargo('Gerente de Logística')).toBe('operações');
    expect(cadeiraDoCargo('CTO')).toBe('TI');
    expect(cadeiraDoCargo('CEO')).toBe('patrocinador');
    expect(cadeiraDoCargo('Sócio-fundador')).toBe('patrocinador');
  });

  it('área vence hierarquia: um diretor de RH é RH, não patrocinador', () => {
    expect(cadeiraDoCargo('Diretor de RH')).toBe('RH');
    expect(cadeiraDoCargo('Diretor Financeiro')).toBe('financeiro');
    // Sem área declarada, quem dirige é quem banca.
    expect(cadeiraDoCargo('Diretor')).toBe('patrocinador');
  });

  it('não chuta cadeira para cargo que não reconhece', () => {
    expect(cadeiraDoCargo('')).toBeNull();
    expect(cadeiraDoCargo('Analista')).toBeNull();
    expect(cadeiraDoCargo('Consultor externo')).toBeNull();
  });
});

describe('parseParticipantes', () => {
  it('lê o formato que os chips do CRM produzem', () => {
    const lista = parseParticipantes('Maria Souza, Head de T&D; Paulo Reis, CFO');
    expect(lista).toEqual([
      { nome: 'Maria Souza', cargo: 'Head de T&D', seat: 'RH' },
      { nome: 'Paulo Reis', cargo: 'CFO', seat: 'financeiro' },
    ]);
  });

  it('quem foi digitado sem cargo continua na sala', () => {
    const lista = parseParticipantes('Ana Lima');
    expect(lista).toEqual([{ nome: 'Ana Lima', cargo: '', seat: null }]);
  });

  it('o cargo pode ter vírgula sem quebrar o nome', () => {
    const [p] = parseParticipantes('Renata Alves, Diretora de RH, unidade Sul');
    expect(p.nome).toBe('Renata Alves');
    expect(p.cargo).toBe('Diretora de RH, unidade Sul');
    expect(p.seat).toBe('RH');
  });

  it('campo vazio não inventa participante', () => {
    expect(parseParticipantes('')).toEqual([]);
    expect(parseParticipantes('  ;  ; ')).toEqual([]);
  });
});

describe('enriquecerComContatos', () => {
  it('o cargo do CRM completa quem veio só com o nome', () => {
    const lista = enriquecerComContatos(parseParticipantes('Paulo Reis'), [
      { name: 'Paulo Reis', role: 'CFO' },
    ]);
    expect(lista[0]).toEqual({ nome: 'Paulo Reis', cargo: 'CFO', seat: 'financeiro' });
  });

  it('o CRM vence o que foi digitado, porque é a fonte que o cliente confirmou', () => {
    const lista = enriquecerComContatos(parseParticipantes('Paulo Reis, financeiro'), [
      { name: 'paulo reis', role: 'Diretor de Suprimentos' },
    ]);
    expect(lista[0].cargo).toBe('Diretor de Suprimentos');
  });

  it('quem não está no CRM mantém o que o vendedor escreveu', () => {
    const lista = enriquecerComContatos(parseParticipantes('Convidado Externo, CTO'), [
      { name: 'Outra Pessoa', role: 'CFO' },
    ]);
    expect(lista[0]).toEqual({ nome: 'Convidado Externo', cargo: 'CTO', seat: 'TI' });
  });

  it('contato sem cargo no CRM não apaga o cargo digitado', () => {
    const lista = enriquecerComContatos(parseParticipantes('Maria Souza, Head de T&D'), [
      { name: 'Maria Souza', role: null },
    ]);
    expect(lista[0].cargo).toBe('Head de T&D');
    expect(lista[0].seat).toBe('RH');
  });
});

describe('o que chega ao prompt', () => {
  it('cada linha diz nome, cargo e cadeira', () => {
    const texto = formatarParticipantes(parseParticipantes('Maria Souza, Head de T&D; Ana Lima'));
    expect(texto).toContain('- Maria Souza | Head de T&D | cadeira: RH');
    expect(texto).toContain('- Ana Lima | cargo não informado | cadeira: não identificada');
  });

  it('sem participantes, o prompt recebe o mesmo texto de antes', () => {
    expect(formatarParticipantes([])).toBe('não informados');
  });

  it('as cadeiras presentes saem sem repetição, para as rotas priorizarem', () => {
    const lista = parseParticipantes('Maria, Head de T&D; Renata, Coordenadora Pedagógica; Paulo, CFO');
    expect(cadeirasPresentes(lista)).toEqual(['RH', 'financeiro']);
  });
});

describe('normalizarPessoas', () => {
  const pessoa = (extra: Record<string, unknown> = {}) => ({
    nome: 'Ana Prado', cargo: 'Diretora de RH', defende_publicamente: 'Fala sobre formação de líderes.',
    fonte_url: 'https://exemplo.com.br/entrevista', confianca_identidade: 'confirmado', ...extra,
  });

  it('aceita o achado com nome, cargo e fonte', () => {
    const [p] = normalizarPessoas([pessoa()]);
    expect(p).toMatchObject({ name: 'Ana Prado', role: 'Diretora de RH', confidence: 'confirmado', verifiable: true });
  });

  it('homônimo declarado sai: falar da pessoa errada é pior que não falar', () => {
    expect(normalizarPessoas([pessoa({ confianca_identidade: 'incerto' })])).toEqual([]);
  });

  it('sem fonte não entra, como o resto do dossiê', () => {
    expect(normalizarPessoas([pessoa({ fonte_url: null })])).toEqual([]);
    expect(normalizarPessoas([pessoa({ fonte_url: 'não é url' })])).toEqual([]);
  });

  it('fonte de rede social entra marcada como não revalidável', () => {
    const [p] = normalizarPessoas([pessoa({ fonte_url: 'https://br.linkedin.com/in/ana-prado/pt' })]);
    expect(p.verifiable).toBe(false);
    // O achado continua valendo: quem não revalida somos nós, não o vendedor.
    expect(p.name).toBe('Ana Prado');
  });

  it('"provavel" entra rebaixado a inferência, não como confirmado', () => {
    const [p] = normalizarPessoas([pessoa({ confianca_identidade: 'provavel' })]);
    expect(p.confidence).toBe('inferencia');
  });

  it('não repete a mesma pessoa e respeita o teto', () => {
    const lista = normalizarPessoas([pessoa(), pessoa(), pessoa({ nome: 'Bruno Sá' }), pessoa({ nome: 'Caio Reis' })], 2);
    expect(lista.map((p) => p.name)).toEqual(['Ana Prado', 'Bruno Sá']);
  });

  it('lista vazia ou lixo não vira pessoa', () => {
    expect(normalizarPessoas(null)).toEqual([]);
    expect(normalizarPessoas([{ nome: 'Só nome' }])).toEqual([]);
  });
});

describe('fundirComDescobertos', () => {
  const descoberto = {
    name: 'Paulo Reis', role: 'CFO', publicStance: '', sourceUrl: 'https://exemplo.com/a',
    confidence: 'confirmado' as const, verifiable: true,
  };

  it('quem o vendedor informou vem primeiro e não é sobrescrito', () => {
    const lista = fundirComDescobertos(
      parseParticipantes('Paulo Reis, Diretor de Suprimentos'),
      [descoberto],
    );
    expect(lista[0].cargo).toBe('Diretor de Suprimentos');
    expect(lista[0].descoberto).toBeUndefined();
    expect(lista).toHaveLength(1);
  });

  it('o descoberto completa o cargo de quem veio só com o nome', () => {
    const lista = fundirComDescobertos(parseParticipantes('Paulo Reis'), [descoberto]);
    expect(lista[0]).toMatchObject({ nome: 'Paulo Reis', cargo: 'CFO', seat: 'financeiro' });
  });

  it('quem a pesquisa achou e não estava na lista entra marcado como descoberto', () => {
    const lista = fundirComDescobertos(parseParticipantes('Maria Souza, Head de T&D'), [descoberto]);
    expect(lista).toHaveLength(2);
    expect(lista[1]).toMatchObject({ nome: 'Paulo Reis', seat: 'financeiro', descoberto: true });
  });
});

describe('parsePerfisDePessoa', () => {
  it('aceita perfil de PESSOA e normaliza para uma forma só', () => {
    expect(parsePerfisDePessoa('https://br.linkedin.com/in/Maria-Souza-1a2b/pt'))
      .toEqual(['https://www.linkedin.com/in/maria-souza-1a2b']);
  });

  it('perfil de EMPRESA fica de fora: é o outro campo, com outra régua', () => {
    expect(parsePerfisDePessoa('https://linkedin.com/company/vertho')).toEqual([]);
    expect(parsePerfisDePessoa('https://instagram.com/vertho')).toEqual([]);
  });

  it('não repete o mesmo perfil escrito de dois jeitos', () => {
    const lista = parsePerfisDePessoa(
      'https://www.linkedin.com/in/paulo-reis  https://br.linkedin.com/in/paulo-reis/',
    );
    expect(lista).toHaveLength(1);
  });

  it('texto que não é perfil não vira âncora', () => {
    expect(parsePerfisDePessoa('não sei o linkedin dela')).toEqual([]);
    expect(parsePerfisDePessoa('')).toEqual([]);
  });
});

describe('nomeDoPerfil', () => {
  it('tira o sufixo que o LinkedIn acrescenta', () => {
    expect(nomeDoPerfil('https://www.linkedin.com/in/maria-souza-046a1068')).toBe('maria souza');
    expect(nomeDoPerfil('https://www.linkedin.com/in/paulo-reis')).toBe('paulo reis');
  });

  it('nome composto sobrevive', () => {
    expect(nomeDoPerfil('https://www.linkedin.com/in/ana-lucia-tarouquella-schilke'))
      .toBe('ana lucia tarouquella schilke');
  });
});

describe('marcarSemAchado', () => {
  const achado = {
    name: 'Maria Souza', role: 'Head de T&D', publicStance: 'Fala sobre trilhas.',
    sourceUrl: 'https://exemplo.com/a', confidence: 'confirmado' as const, verifiable: true,
  };

  it('quem estará na reunião e não apareceu vira ausência declarada', () => {
    const lista = marcarSemAchado(parseParticipantes('Maria Souza, Head de T&D; Paulo Reis, CFO'), [achado]);
    expect(lista).toHaveLength(2);
    expect(lista[1]).toMatchObject({
      name: 'Paulo Reis', role: 'CFO', sourceUrl: null, confidence: 'nao_confirmado', publicStance: '',
    });
  });

  it('não duplica quem já foi encontrado', () => {
    const lista = marcarSemAchado(parseParticipantes('maria souza'), [achado]);
    expect(lista).toHaveLength(1);
  });

  it('sem participantes informados, não inventa ausência', () => {
    expect(marcarSemAchado([], [achado])).toEqual([achado]);
  });
});

describe('mesmaPessoa', () => {
  it('o apelido digitado é a pessoa do nome completo', () => {
    // O caso real: o vendedor escreveu "Bruno", a pesquisa devolveu "Bruno Bonito",
    // e o plano mostrava os dois, com o segundo dizendo "nada público encontrado".
    expect(mesmaPessoa('Bruno', 'Bruno Bonito')).toBe(true);
    expect(mesmaPessoa('Dayane', 'Dayane Lopes Correa Linares Santana')).toBe(true);
  });

  it('acento e caixa não separam a mesma pessoa', () => {
    expect(mesmaPessoa('Kétule Matos', 'ketule matos')).toBe(true);
  });

  it('pessoas diferentes continuam diferentes', () => {
    expect(mesmaPessoa('Bruno Bonito', 'Bruno Carvalho')).toBe(false);
    expect(mesmaPessoa('Ana Prado', 'Paulo Reis')).toBe(false);
  });

  it('nome curto demais não casa com ninguém', () => {
    expect(mesmaPessoa('Bo', 'Bruno Bonito')).toBe(false);
    expect(mesmaPessoa('', 'Bruno Bonito')).toBe(false);
  });
});

describe('a duplicata que apareceu no plano da Boehringer', () => {
  const bruno = {
    name: 'Bruno Bonito', role: 'Treinador corporativo', publicStance: 'Fala de aprendizagem aplicada.',
    sourceUrl: 'https://www.linkedin.com/in/bruno-bonito', confidence: 'inferencia' as const, verifiable: false,
  };

  it('quem foi encontrado não vira ausência declarada', () => {
    const lista = marcarSemAchado(parseParticipantes('Bruno; Dayane'), [bruno]);
    expect(lista.map((p) => p.name)).toEqual(['Bruno Bonito', 'Dayane']);
  });

  it('e não aparece duas vezes na lista de participantes', () => {
    const lista = fundirComDescobertos(parseParticipantes('Bruno'), [bruno]);
    expect(lista).toHaveLength(1);
    // O nome completo da pesquisa substitui o apelido: é o que vai no crachá.
    expect(lista[0].nome).toBe('Bruno Bonito');
    expect(lista[0].cargo).toBe('Treinador corporativo');
  });
});

describe('o perfil informado resolve a identidade', () => {
  const doPerfil = (extra: Record<string, unknown> = {}) => ({
    nome: 'Bruno Bonito', cargo: 'Treinador corporativo', defende_publicamente: 'Aprendizagem aplicada.',
    fonte_url: 'https://www.linkedin.com/in/bruno-bonito', confianca_identidade: 'provavel', ...extra,
  });

  it('achado na URL que o vendedor informou sobe para confirmado', () => {
    const [p] = normalizarPessoas([doPerfil()], 4, ['https://www.linkedin.com/in/bruno-bonito']);
    expect(p.confidence).toBe('confirmado');
  });

  it('sem perfil informado, continua inferência', () => {
    const [p] = normalizarPessoas([doPerfil()], 4, []);
    expect(p.confidence).toBe('inferencia');
  });

  it('perfil de OUTRA pessoa não confirma esta', () => {
    const [p] = normalizarPessoas([doPerfil()], 4, ['https://www.linkedin.com/in/dayane-santana']);
    expect(p.confidence).toBe('inferencia');
  });

  it('a âncora não ressuscita quem foi descartado por homônimo', () => {
    const lista = normalizarPessoas(
      [doPerfil({ confianca_identidade: 'incerto' })], 4, ['https://www.linkedin.com/in/bruno-bonito'],
    );
    expect(lista).toEqual([]);
  });
});
