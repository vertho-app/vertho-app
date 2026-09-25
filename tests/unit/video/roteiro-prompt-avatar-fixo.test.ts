import { describe, it, expect } from 'vitest';
import { buildRoteiroPrompt, type ModuloParaRoteiro } from '@/lib/video/roteiro-prompt';

/**
 * Prompt do roteiro com e sem o avatar FIXO do grupo (25/09/2026).
 *
 * O invariante que vale mais que qualquer outro aqui: SEM `avatarFixo`, o prompt sai
 * BYTE A BYTE igual ao de antes da mudança. O snapshot foi gravado com o código
 * anterior à mudança e não pode ser regravado por quem só queria o teste verde —
 * regravar exige explicar, no commit, por que o prompt de produção mudou.
 */

const MODULO: ModuloParaRoteiro = {
  titulo: 'Organização e priorização · N1→N2',
  descritor: 'Organização e priorização',
  competenciaNome: 'Autocuidado e bem-estar profissional',
  nivel_entrada: 'N1',
  nivel_destino: 'N2',
  conteudo_central: {
    ideia_principal: 'Priorizar é decidir o que não fazer agora.',
    explicacao_expandida: 'Sem critério, a urgência alheia decide o dia.',
    principios: [{ nome: 'Critério explícito', explicacao: 'Decida antes de a demanda chegar.' }],
  },
  conteudo_aplicavel: {
    exemplos_universais: { aplicacao_adequada: 'Blindar um bloco para o planejamento.', aplicacao_inadequada: 'Responder tudo na hora.' },
    erros_comuns: [{ erro: 'Tratar tudo como urgente.' }],
    boas_praticas: [{ o_que_fazer: 'Listar as demandas da semana.' }],
    situacoes_tipicas: [{ contexto: 'Conselho de classe', desafio: 'relatórios atrasados' }],
  },
  locale: 'pt-BR',
  cargoBloco: 'CARGO: Professor(a).',
  pppBrief: 'Escola de tempo integral com foco em projetos.',
  discDominante: 'C',
  desafioTexto: 'Liste as três demandas que mais roubaram seu planejamento esta semana.',
};

const FIXO = {
  intro: { title: 'O que decide o seu dia', subtitle: 'Critério antes da urgência', narration: 'Quando tudo chega ao mesmo tempo, quem decide o seu dia é a urgência de outra pessoa. Hoje você vai ver como trocar essa lógica por um critério que é seu, claro e defensável.' },
  outro: { title: 'Sua próxima escolha', subtitle: 'O que sai da lista primeiro?', narration: 'Você já sabe o que protege o seu planejamento. Olhe para a sua semana com calma. Qual demanda vai sair da lista primeiro, e com que critério?' },
};

describe('buildRoteiroPrompt · sem avatar fixo (legado)', () => {
  it('é byte a byte o prompt de antes da mudança (snapshot gravado antes)', () => {
    const { system, user } = buildRoteiroPrompt(MODULO);
    expect(system).toMatchSnapshot('system');
    expect(user).toMatchSnapshot('user');
  });

  it('`avatarFixo: null` é o mesmo que não passar', () => {
    expect(buildRoteiroPrompt({ ...MODULO, avatarFixo: null } as any)).toEqual(buildRoteiroPrompt(MODULO));
  });
});

describe('buildRoteiroPrompt · com avatar fixo do grupo', () => {
  const { system } = buildRoteiroPrompt({ ...MODULO, avatarFixo: FIXO });

  it('manda copiar EXATAMENTE os textos das duas cenas de avatar', () => {
    expect(system).toContain(JSON.stringify(FIXO.intro.narration));
    expect(system).toContain(JSON.stringify(FIXO.outro.narration));
    expect(system).toContain(JSON.stringify(FIXO.intro.title));
    expect(system).toContain(JSON.stringify(FIXO.outro.subtitle));
    expect(system).toMatch(/Copie EXATAMENTE/);
  });

  it('desconta as palavras fixas do orçamento do miolo', () => {
    const fixas = [FIXO.intro.narration, FIXO.outro.narration].reduce((s, t) => s + t.trim().split(/\s+/).length, 0);
    expect(system).toContain(`já somam ${fixas} palavras`);
    expect(system).toContain(`entre ${440 - fixas} e ${540 - fixas} palavras`);
  });

  it('tom DISC só no miolo, e o desafio do Kit sai do outro e vai para a última cena do miolo', () => {
    expect(system).toMatch(/tom do perfil vale SÓ para as cenas do MIOLO/);
    expect(system).toMatch(/ÚLTIMA cena do MIOLO[^]*Liste as três demandas/);
    expect(system).not.toMatch(/o avatar_outro deve FECHAR conduzindo a pessoa a ESTE desafio/);
  });

  it('sem desafio, o bloco fixo entra mesmo assim (vídeo fora do Kit)', () => {
    const p = buildRoteiroPrompt({ ...MODULO, desafioTexto: null, avatarFixo: FIXO });
    expect(p.system).toMatch(/ABERTURA E FECHO FIXOS/);
    expect(p.system).not.toMatch(/DESAFIO DA SEMANA/);
  });
});
