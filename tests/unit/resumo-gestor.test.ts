// O texto que o gestor recebe depois de responder VER.
//
// Tudo aqui é da parte PURA (agrupar + formatar), que é onde moram as decisões
// de produto — a leitura do banco não tem regra nenhuma que valha um teste.
//
// Invariantes (cada `it` prova uma):
//   1. Os grupos saem na ordem do RETORNO por conversa, não da gravidade.
//   2. Grupo acima do teto vira contagem e não lista ninguém.
//   3. O número de conversas é CALCULADO — nunca fixo.
//   4. Grupo vazio não aparece (e não conta como conversa).
//   5. Equipe sem pendência tem texto próprio, não uma lista vazia.
//   6. Vinte e cinco pessoas cabem folgado no limite da janela.
//   7. `classificarSemana` põe "linha ausente" e "pendente" no MESMO grupo.
//   8. Singular e plural acompanham a contagem.
import { describe, it, expect } from 'vitest';
import {
  agruparPessoas, formatarResumo, classificarSemana, listarNomes, primeiroNome,
  MAX_NOMES_POR_GRUPO, type PessoaNaSemana, type ResumoEquipe,
} from '@/lib/notifications/resumo-gestor';

const pessoa = (nome: string, chave: PessoaNaSemana['chave']): PessoaNaSemana => ({ nome, chave });

function resumo(over: Partial<ResumoEquipe> = {}): ResumoEquipe {
  return {
    gestorPrimeiroNome: 'Carla',
    equipe: 11,
    avancaram: 8,
    grupos: [],
    retomaram: [],
    semana: 5,
    ...over,
  };
}

describe('agrupamento', () => {
  it('a ordem é a do retorno por conversa: a um passo vem primeiro', () => {
    const g = agruparPessoas([
      pessoa('Diego Matos', 'nao_abriu'),
      pessoa('Carlos Pereira', 'parou_no_meio'),
      pessoa('Marina Souza', 'a_um_passo'),
    ]);

    expect(g.map((x) => x.chave)).toEqual(['a_um_passo', 'parou_no_meio', 'nao_abriu']);
  });

  it('grupo vazio não aparece', () => {
    const g = agruparPessoas([pessoa('Marina Souza', 'a_um_passo')]);
    expect(g).toHaveLength(1);
  });

  it(`até ${MAX_NOMES_POR_GRUPO} nomes o grupo lista; acima disso vira contagem`, () => {
    const oito = Array.from({ length: MAX_NOMES_POR_GRUPO }, (_, i) => pessoa(`Pessoa ${i}`, 'nao_abriu'));
    expect(agruparPessoas(oito)[0].nomes).toHaveLength(MAX_NOMES_POR_GRUPO);

    const nove = [...oito, pessoa('Pessoa 8', 'nao_abriu')];
    const g = agruparPessoas(nove)[0];
    // Não lista PARTE: escolher 8 de 9 pela ordem da query decidiria por acaso
    // quem é nomeado, e sugeriria que só esses precisam de algo.
    expect(g.nomes).toEqual([]);
    expect(g.total).toBe(9);
  });
});

describe('texto', () => {
  it('o número de conversas é calculado, não fixo', () => {
    const quatro = formatarResumo(resumo({
      grupos: agruparPessoas([
        pessoa('A A', 'a_um_passo'), pessoa('B B', 'parou_no_meio'), pessoa('C C', 'nao_abriu'),
      ]),
    }));
    // Maiúscula: vem depois de um ponto final. Verde não pega ortografia —
    // esta asserção existe porque o texto saiu "empurrão. três conversas".
    expect(quatro).toContain('empurrão. Três conversas dão conta.');

    const uma = formatarResumo(resumo({ grupos: agruparPessoas([pessoa('A A', 'a_um_passo')]) }));
    // Com um grupo só, "três conversas" seria uma mensagem que se contradiz.
    expect(uma).toContain('É uma conversa só');
    expect(uma).not.toContain('três');
  });

  it('o link do painel vem de quem chama, porque o host é do tenant', () => {
    const com = formatarResumo(resumo({
      grupos: agruparPessoas([pessoa('Ana Lima', 'a_um_passo')]),
      linkPainel: 'https://macae.vertho.ai/dashboard/gestor',
    }));
    expect(com).toContain('https://macae.vertho.ai/dashboard/gestor');

    // Sem link, o texto não inventa um domínio — mandaria o gestor de uma
    // empresa para o host de outra.
    const sem = formatarResumo(resumo({ grupos: agruparPessoas([pessoa('Ana Lima', 'a_um_passo')]) }));
    expect(sem).toContain('está no painel.');
    expect(sem).not.toContain('vertho.ai');
  });

  it('grupo acima do teto aparece como contagem no texto', () => {
    const muitos = Array.from({ length: 10 }, (_, i) => pessoa(`Pessoa ${i}`, 'nao_abriu'));
    const t = formatarResumo(resumo({ grupos: agruparPessoas(muitos) }));

    expect(t).toContain('10 pessoas. Aqui um recado à turma');
    expect(t).not.toContain('Pessoa 0');
  });

  it('equipe sem pendência tem texto próprio', () => {
    const t = formatarResumo(resumo({ grupos: [], avancaram: 11 }));
    expect(t).toContain('ninguém da sua equipe está parado');
    expect(t).toContain('11 pessoas avançaram');
    expect(t).not.toContain('empurrão');
  });

  it('singular e plural acompanham a contagem', () => {
    const um = formatarResumo(resumo({ grupos: agruparPessoas([pessoa('Ana Lima', 'a_um_passo')]) }));
    expect(um).toContain('1 pessoa da sua equipe precisa de um empurrão');

    const zero = formatarResumo(resumo({ grupos: [], avancaram: 1 }));
    expect(zero).toContain('1 pessoa avançou');
  });

  it('vinte e cinco pessoas cabem folgado no limite da janela', () => {
    const pessoas: PessoaNaSemana[] = [
      ...Array.from({ length: 5 }, (_, i) => pessoa(`Nome Sobrenome${i}`, 'a_um_passo')),
      ...Array.from({ length: 4 }, (_, i) => pessoa(`Outro Sobrenome${i}`, 'parou_no_meio')),
      ...Array.from({ length: 16 }, (_, i) => pessoa(`Terceiro Sobrenome${i}`, 'nao_abriu')),
    ];
    const t = formatarResumo(resumo({
      grupos: agruparPessoas(pessoas),
      retomaram: ['Ana Ribeiro', 'Pedro Lima'],
    }));

    expect(t.length).toBeLessThan(4096);
    expect(t).toContain('25 pessoas da sua equipe precisam');
    // O grupo de 16 passou do teto; os de 5 e 4 seguem nominais.
    expect(t).toContain('Nome Sobrenome0');
    expect(t).not.toContain('Terceiro Sobrenome0');
    expect(t).toContain('Ana Ribeiro e Pedro Lima voltaram a avançar');
  });

  it('não usa quebra de linha proibida em parâmetro — porque não é parâmetro', () => {
    // Texto livre dentro da janela PODE ter \n. Se algum dia alguém tentar
    // mandar isto como variável de template, a Meta recusa a mensagem inteira.
    const t = formatarResumo(resumo({ grupos: agruparPessoas([pessoa('Ana Lima', 'a_um_passo')]) }));
    expect(t).toContain('\n');
  });
});

describe('classificação da semana', () => {
  it('linha ausente e pendente caem no MESMO grupo', () => {
    // As duas formas existem no banco; separá-las criaria dois grupos para o
    // mesmo estado, e o gestor veria a mesma pendência dividida em duas listas.
    expect(classificarSemana(null)).toBe('nao_abriu');
    expect(classificarSemana(undefined)).toBe('nao_abriu');
    expect(classificarSemana({ status: 'pendente', conteudo_consumido: false })).toBe('nao_abriu');
  });

  it('consumiu o conteúdo e não concluiu = a um passo', () => {
    expect(classificarSemana({ status: 'em_andamento', conteudo_consumido: true })).toBe('a_um_passo');
  });

  it('em andamento sem consumir = parou no meio', () => {
    expect(classificarSemana({ status: 'em_andamento', conteudo_consumido: false })).toBe('parou_no_meio');
  });

  it('concluída não entra em grupo nenhum', () => {
    expect(classificarSemana({ status: 'concluido', conteudo_consumido: true })).toBe('concluida');
  });
});

describe('nomes', () => {
  it('lista com e, não com vírgula no fim', () => {
    expect(listarNomes(['Ana'])).toBe('Ana');
    expect(listarNomes(['Ana', 'Pedro'])).toBe('Ana e Pedro');
    expect(listarNomes(['Ana', 'Pedro', 'Marina'])).toBe('Ana, Pedro e Marina');
  });

  it('primeiro nome não quebra com entrada torta', () => {
    expect(primeiroNome('Carla Souza Lima')).toBe('Carla');
    expect(primeiroNome('  Carla  ')).toBe('Carla');
    expect(primeiroNome(null)).toBe('você');
    expect(primeiroNome('')).toBe('você');
  });
});
