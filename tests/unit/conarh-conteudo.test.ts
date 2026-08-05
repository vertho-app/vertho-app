import { describe, it, expect } from 'vitest';
import conteudoJson from '@/app/conarh/_data/conteudo.json';
import type { ConteudoConarh, ReguaVitrine } from '@/app/conarh/_data/types';
import { formatarNota, lerRespostas } from '@/lib/conarh/leitura';

/**
 * CONARH 52 — integridade do pacote de conteúdo da demo.
 *
 * O conteúdo é um JSON solto lido com `as unknown as ConteudoConarh` (o cast
 * não valida nada), e quem descobre um campo faltando é o expositor, em pé,
 * na frente do visitante. Estas asserções são a única coisa entre um typo e
 * o estande.
 *
 * O caso que motivou o guard: a porta 2 passou a rodar o CENÁRIO da régua
 * escolhida na porta 1 (04/08/2026). Uma régua sem cenário — ou com duas
 * respostas no mesmo nível — quebra a tela ou, pior, mostra uma leitura que
 * não fecha com a matriz que o visitante acabou de ver.
 *
 * Em 05/08/2026 o mecanismo virou o CENÁRIO RESPONDIDO (as 4 perguntas da
 * IA3, o visitante classifica). O que passou a poder quebrar em silêncio: uma
 * resposta sem trecho de evidência (a tela promete "auditável" e mostra um
 * campo vazio), perguntas que deixam de seguir a régua da IA3 e viram
 * entrevista, e a nota da etapa 3 divergindo da que a etapa 2 deriva das
 * mesmas respostas.
 */

const conteudo = conteudoJson as unknown as ConteudoConarh;

function reguas(): ReguaVitrine[] {
  const { porta1 } = conteudo;
  return [
    {
      id: 'caso',
      eixo: porta1.eixo ?? '',
      competencia: porta1.competencia,
      introducao: porta1.introducao,
      descritores: porta1.descritores,
      cenario: porta1.cenario!,
    },
    ...(porta1.reguas_vitrine ?? []),
  ];
}

describe('pacote de conteúdo do CONARH', () => {
  it('tem as 3 competências da feira, com eixo próprio e 6 descritores cada', () => {
    // Seis em todas porque o seletor põe as três lado a lado: uma régua com
    // menos descritores que a vizinha faz o visitante achar que a competência
    // dele foi tratada por cima. Os nomes são travados aqui porque saem em
    // lona, folder e fala — mudar um exige mudar os quatro (05/08/2026).
    const lista = reguas();
    expect(lista.map((r) => r.competencia)).toEqual([
      'Liderança',
      'Relacionamento com Clientes',
      'Resolução de Problemas',
    ]);
    expect(new Set(lista.map((r) => r.eixo)).size).toBe(3);
    for (const r of lista) {
      expect(r.descritores.length, r.competencia).toBe(6);
      expect(new Set(r.descritores.map((d) => d.cod)).size, r.competencia).toBe(6);
    }
  });

  it('toda régua tem cenário e pessoa avaliada — a porta 2 abre por aí', () => {
    for (const r of reguas()) {
      expect(r.cenario, r.competencia).toBeTruthy();
      expect(r.cenario.situacao.length, r.competencia).toBeGreaterThan(80);
      expect(r.cenario.avaliado?.nome?.trim(), r.competencia).toBeTruthy();
      expect(r.cenario.avaliado?.cargo?.trim(), r.competencia).toBeTruthy();
      // A tela chama a pessoa pelo nome ("A conversa de Renata com a
      // plataforma"): nome composto ou com cargo embutido estoura o título.
      expect(r.cenario.avaliado.nome.split(' ').length, r.competencia).toBe(1);
    }
  });

  it('cada cenário tem 4 perguntas completas — foco, pergunta, resposta, trecho e leitura', () => {
    for (const r of reguas()) {
      expect(r.cenario.perguntas, r.competencia).toHaveLength(4);
      r.cenario.perguntas.forEach((p, i) => {
        for (const campo of ['pergunta', 'resposta', 'evidencia', 'leitura'] as const) {
          expect(p[campo]?.trim(), `${r.competencia}/pergunta ${i + 1}/${campo}`).toBeTruthy();
        }
        expect([1, 2, 3, 4], `${r.competencia}/pergunta ${i + 1}/nivel`).toContain(p.nivel);
      });
      for (const campo of ['justificativa', 'limite'] as const) {
        expect(r.cenario[campo]?.trim(), `${r.competencia}/${campo}`).toBeTruthy();
      }
    }
  });

  it('as 4 perguntas seguem a régua da IA3: focos na ordem, abertas e ≤200 chars', () => {
    // O prompt real (`lib/ia3-cenarios.ts`) fixa os quatro papéis e o teto de
    // 200 caracteres. Sem isto, a tela volta a exibir perguntas de entrevista
    // ("ficou marcada alguma data?") — um artefato que a plataforma não gera,
    // no meio da tela que existe para provar que ela gera.
    const FOCOS = ['Escolha', 'Execução', 'Tensão humana', 'Sustentação'];
    for (const r of reguas()) {
      expect(r.cenario.perguntas.map((p) => p.foco), r.competencia).toEqual(FOCOS);
      r.cenario.perguntas.forEach((p, i) => {
        expect(p.pergunta.length, `${r.competencia}/pergunta ${i + 1} (chars)`).toBeLessThanOrEqual(200);
        // Aberta: termina em interrogação e não oferece alternativas fechadas.
        expect(p.pergunta.trim().endsWith('?'), `${r.competencia}/pergunta ${i + 1} (aberta)`).toBe(true);
      });
      // Contexto do cenário: teto de 900 chars do prompt da IA3.
      expect(r.cenario.situacao.length, r.competencia).toBeLessThanOrEqual(900);
    }
  });

  it('as respostas mostram a pessoa ABAIXO da meta — é o que faz a demo ter assunto', () => {
    // Um conjunto lido em N3/N4 deixa a etapa 2 sem tensão (e a etapa 3 sem
    // lacuna para virar PDI). O material é de propósito N1/N2, e é isso que a
    // troca de mecanismo tem que preservar quando alguém editar o JSON.
    for (const r of reguas()) {
      const { nivel } = lerRespostas(r.cenario);
      expect(nivel, r.competencia).toBeLessThanOrEqual(2);
      const distintos = new Set(r.cenario.perguntas.map((p) => p.nivel));
      // Quatro respostas idênticas viram uma régua de um degrau só: a leitura
      // resposta a resposta não teria o que mostrar.
      expect(distintos.size, r.competencia).toBeGreaterThan(1);
    }
  });

  it('o descritor testado por cada cenário existe na matriz daquela régua', () => {
    // Sem isto a porta 2 abre a matriz num descritor inexistente: cai no
    // primeiro da lista, e a leitura passa a falar de outro comportamento.
    for (const r of reguas()) {
      const cods = r.descritores.map((d) => d.cod);
      expect(cods, r.competencia).toContain(r.cenario.descritor_cod);
    }
  });

  it('nota → nível é floor com clamp 1–4, como no motor', () => {
    // O motor faz `Math.floor(nota)` em quatro pontos independentes
    // (`actions/fase3.ts` ×2 + geral, `lib/blueprint/core.ts`,
    // `lib/relatorio-individual-prompt.ts`): a semântica é "atingiu o nível".
    // Arredondar promove meio degrau — 1,5 vira N2 — e a demo passa a mostrar
    // um número que o produto não mostraria. Foi o que aconteceu em 05/08.
    const comNiveis = (niveis: Array<1 | 2 | 3 | 4>) => ({
      perguntas: niveis.map((n) => ({ nivel: n })),
    });
    expect(lerRespostas(comNiveis([1, 2, 2, 1]) as never)).toEqual({ nota: 1.5, nivel: 1 });
    expect(lerRespostas(comNiveis([2, 3, 3, 2]) as never)).toEqual({ nota: 2.5, nivel: 2 });
    expect(lerRespostas(comNiveis([2, 2, 2, 3]) as never)).toEqual({ nota: 2.3, nivel: 2 });
    expect(lerRespostas(comNiveis([4, 4, 4, 4]) as never)).toEqual({ nota: 4, nivel: 4 });
    expect(lerRespostas(comNiveis([1, 1, 1, 1]) as never)).toEqual({ nota: 1, nivel: 1 });
  });

  it('todo leitura_motor do pacote tem nível = floor(nota)', () => {
    // A prancheta (papel) e a matriz mostram `N{nivel} ({nota})` lado a lado.
    // Três descritores do caso vinham com o nível arredondado — o expositor
    // mostraria 1,8 · N2 no papel e N1 na tela, no MESMO caso.
    const blocos = [conteudo.porta1.descritores, conteudo.porta2.descritores];
    for (const lista of blocos) {
      for (const d of lista) {
        const { nota, nivel } = d.leitura_motor;
        expect(nivel, `${d.cod} (nota ${nota})`).toBe(Math.min(4, Math.max(1, Math.floor(nota))));
      }
    }
  });

  it('a nota citada na etapa 3 é a que a etapa 2 deriva dos turnos', () => {
    // As duas telas falam do MESMO descritor da MESMA pessoa: a etapa 2 mostra
    // a leitura das respostas e a etapa 3 monta o PDI em cima dela. Se alguém
    // reescrever uma resposta (mudando a média) e não mexer no texto da etapa 3, o
    // visitante vê 1,5 numa tela e 1,8 na seguinte — e a demo perde a única
    // coisa que ela vende, que é as leituras baterem.
    const cenario = conteudo.porta1.cenario!;
    const { nota, nivel } = lerRespostas(cenario);
    expect(conteudo.porta3.lacuna).toContain(cenario.descritor_cod);
    expect(conteudo.porta3.lacuna).toContain(`${formatarNota(nota)} (N${nivel})`);
  });

  it('o PDI declara os 4 insumos, incluindo perfil comportamental e aprendizagem', () => {
    // A etapa 3 vende "ninguém escreveu à mão". O que sustenta a frase são os
    // insumos: tirar o perfil comportamental ou o modelo de aprendizagem da
    // lista transforma a promessa de personalização em texto de template —
    // e é justamente o par que a etapa 4 mostra em ação (DISC × formato).
    const { insumos } = conteudo.porta3;
    expect(insumos.map((i) => i.rotulo)).toEqual([
      'Matriz de competências',
      'Diagnóstico',
      'Perfil comportamental (DISC)',
      'Modelo de aprendizagem',
    ]);
    for (const i of insumos) {
      expect(i.valor?.trim(), `${i.rotulo}/valor`).toBeTruthy();
      expect(i.efeito?.trim(), `${i.rotulo}/efeito`).toBeTruthy();
    }
    // O diagnóstico citado aqui é o descritor que a etapa 2 avaliou.
    expect(insumos[1].valor).toContain(conteudo.porta1.cenario!.descritor_cod);
  });

  it('a prancheta (fallback de papel) continua com o registro escrito', () => {
    // A tela trocou o registro pelo cenário; o papel não. Apagar o registro
    // do JSON deixaria /conarh/prancheta em branco no dia da queda de rede.
    expect(conteudo.porta2.registro_conversa.length).toBeGreaterThan(200);
    expect(conteudo.porta2.registro_trechos.length).toBeGreaterThanOrEqual(3);
    expect(conteudo.porta2.descritores.length).toBeGreaterThanOrEqual(5);
  });
});
