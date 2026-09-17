import { describe, expect, it } from 'vitest';
import { resumoSemTratamentoDeGenero, semTratamentoDeGenero } from '@/lib/redacao-sem-genero';
import { textosDoRelatorio } from '@/lib/season-engine/relatorio-texto';
import { resumoDaAvaliacao } from '@/lib/season-engine/estado-fechamento';
import { normalizarResumoAvaliacao } from '@/lib/season-engine/resumo-avaliacao';

describe('revisão de tratamento sem inferir gênero', () => {
  it.each(['sozinha', 'sozinho'])('corrige o caso da devolutiva: %s', (palavra) => {
    expect(semTratamentoDeGenero(`O peso que você vem carregando ${palavra}.`))
      .toBe('O peso que você vem carregando por conta própria.');
    expect(semTratamentoDeGenero(`Você não precisa resolver tudo ${palavra}.`))
      .toBe('Você não precisa resolver tudo por conta própria.');
  });

  it.each([
    ['Você está preparada para conduzir.', 'Você está com preparo para conduzir.'],
    ['Você não estava preparado.', 'Você não estava com preparo.'],
    ['Você se sentia muito sobrecarregada.', 'Você se sentia com muita sobrecarga.'],
    ['Você ficou tão orgulhoso do resultado.', 'Você ficou com tanto orgulho do resultado.'],
    ['Você está menos motivada.', 'Você está com menos motivação.'],
    ['Você atuava como coordenadora pedagógica.', 'Você atuava na coordenação pedagógica.'],
    ['Você atua como coordenador pedagógico da escola.', 'Você atua na coordenação pedagógica da escola.'],
    ['Você trabalha como diretor escolar.', 'Você trabalha na direção escolar.'],
    ['Você atua como professor.', 'Você atua na docência.'],
  ])('preserva tempo, negação e intensidade: %s', (antes, depois) => {
    expect(semTratamentoDeGenero(antes)).toBe(depois);
    expect(semTratamentoDeGenero(depois)).toBe(depois);
  });

  it.each([
    'A equipe está preparada e a avaliação sozinha não basta.',
    'Você deixou a equipe preparada.',
    'Você viu a professora trabalhando sozinha.',
    'Você está com a tarefa preparada.',
    'Você afirmou que a professora está cansada.',
    'Você atua com uma coordenadora pedagógica.',
    'Você atua como professor dedicado.',
    'Você trabalha como coordenador técnico.',
    'Você está preparado(a).',
    'Você está preparado/preparada.',
    'Você não precisa ser a única peça do jogo.',
    'A professora Ana ficou orgulhosa. Ela conduziu a reunião.',
    'Você ficou cansadamente repetindo o mesmo argumento.',
  ])('não confunde outros sujeitos ou palavras: %s', (texto) => {
    expect(semTratamentoDeGenero(texto)).toBe(texto);
  });

  it.each([
    '"Você está preparada."', "'Você está preparado.'", '“Você vem carregando sozinha.”',
    '‘Você está sobrecarregada.’', '«Você está cansado.»', '`Você está motivada.`',
  ])('preserva fala literal: %s', (citacao) => {
    const texto = `Você está preparada. Foi dito: ${citacao} Você está motivado.`;
    expect(semTratamentoDeGenero(texto)).toBe(`Você está com preparo. Foi dito: ${citacao} Você está com motivação.`);
  });

  it('preserva ausência e valores não textuais', () => {
    for (const v of [null, undefined, 2.7, '', {}, []]) expect(semTratamentoDeGenero(v)).toBe(v);
  });

  it('preserva citações com quebra de linha e blocos citados em Markdown', () => {
    for (const literal of ['"Na reunião:\nVocê está preparada."', '> Você está preparada.\n> Você vem carregando sozinha.']) {
      expect(semTratamentoDeGenero(`${literal}\n\nVocê está motivada.`)).toBe(`${literal}\n\nVocê está com motivação.`);
    }
  });
});

describe('apresentação de avaliações já gravadas', () => {
  const resumo = {
    mensagem_geral: 'Você vem carregando sozinha. A equipe está preparada.',
    principal_avanco: 'Você está mais preparado.',
    principal_ponto_de_atencao: 'Você se sente sobrecarregada.',
    evidencias_citadas: ['Você está preparada.'],
  };

  it('revisa só a narrativa; citações, notas e entrada continuam intactas', () => {
    const dados = {
      colab: { nome: 'Pessoa Teste', cargo: 'Gestão' },
      evolutionReport: {
        resumo_avaliacao: resumo, insight_geral: 'Você está cansada.', proximo_passo: 'Você pode trabalhar sozinho.',
        resumo: { parciais: 1 },
        descritores: [{ antes: 'Você estava sobrecarregada.', depois: 'Você está preparada.', nota_pre: 1.3, nota_pos: 2.7, convergencia: 'evolucao_parcial' }],
      },
      momentos: [{ insight: 'Você ficou motivada.' }],
      missoes: [{ compromisso: 'Você vai conduzir sozinho.', sintese: 'Você está engajada.' }],
      sem14: { resumo_avaliacao: resumo, nota_media_pos: 2.7, resposta: 'Você está preparada.', cenario: 'Você atua como professora.' },
    };
    const antes = structuredClone(dados);
    const revisado = textosDoRelatorio(dados);
    expect(revisado.sem14.resumo_avaliacao.mensagem_geral).toBe('Você vem carregando por conta própria. A equipe está preparada.');
    expect(revisado.evolutionReport.resumo_avaliacao).toEqual(resumoSemTratamentoDeGenero(resumo));
    expect(revisado.evolutionReport.descritores[0]).toEqual({ ...antes.evolutionReport.descritores[0], antes: 'Você estava com sobrecarga.', depois: 'Você está com preparo.' });
    expect(revisado.evolutionReport.insight_geral).toBe('Você está com cansaço.');
    expect(revisado.evolutionReport.proximo_passo).toBe('Você pode trabalhar por conta própria.');
    expect(revisado.momentos[0].insight).toBe('Você ficou com motivação.');
    expect(revisado.missoes[0]).toEqual({ compromisso: 'Você vai conduzir por conta própria.', sintese: 'Você está com engajamento.' });
    expect(revisado.sem14.resumo_avaliacao.evidencias_citadas).toEqual(resumo.evidencias_citadas);
    expect(revisado.sem14.resposta).toBe(antes.sem14.resposta);
    expect(revisado.sem14.cenario).toBe(antes.sem14.cenario);
    expect(revisado.sem14.nota_media_pos).toBe(2.7);
    expect(revisado.evolutionReport.resumo).toEqual(antes.evolutionReport.resumo);
    expect(dados).toEqual(antes);
    expect(textosDoRelatorio(revisado)).toEqual(revisado);
  });

  it('o resumo da tela de fechamento e o do admin usam a mesma revisão', () => {
    const feedback = { nota_media_pre: 1.3, nota_media_pos: 2.7, delta_medio: 1.4, spec_version: 1, resumo_avaliacao: resumo };
    expect(resumoDaAvaliacao(feedback)).toEqual({ ...feedback, resumo_avaliacao: resumoSemTratamentoDeGenero(resumo) });
    expect(normalizarResumoAvaliacao(resumo)).toEqual({
      mensagem: 'Você vem carregando por conta própria. A equipe está preparada.',
      avanco: 'Você está com mais preparo.', atencao: 'Você se sente com sobrecarga.', evidencias: resumo.evidencias_citadas,
      // Fixture anterior ao fecho de 17/09/2026: sem `mensagem_final` nem passos.
      mensagemFinal: null, proximosPassos: [],
    });
  });

  it('também lê a forma legada string e não inventa campos ausentes', () => {
    expect(normalizarResumoAvaliacao('Você está preparada.')?.mensagem).toBe('Você está com preparo.');
    expect(resumoSemTratamentoDeGenero({ evidencias_citadas: ['Você está preparada.'] }))
      .toEqual({ evidencias_citadas: ['Você está preparada.'] });
    for (const v of [null, undefined, [], 3]) expect(resumoSemTratamentoDeGenero(v)).toBe(v);
  });
});
