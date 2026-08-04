import { describe, it, expect } from 'vitest';
import conteudoJson from '@/app/conarh/_data/conteudo.json';
import type { ConteudoConarh, ReguaVitrine } from '@/app/conarh/_data/types';

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
  it('tem 3 réguas, cada uma com eixo próprio e ≥5 descritores', () => {
    const lista = reguas();
    expect(lista).toHaveLength(3);
    expect(new Set(lista.map((r) => r.eixo)).size).toBe(3);
    for (const r of lista) {
      expect(r.descritores.length, r.competencia).toBeGreaterThanOrEqual(5);
      expect(new Set(r.descritores.map((d) => d.cod)).size, r.competencia).toBe(
        r.descritores.length,
      );
    }
  });

  it('toda régua tem cenário — inclusive a do caso, que a porta 2 usa por padrão', () => {
    for (const r of reguas()) {
      expect(r.cenario, r.competencia).toBeTruthy();
      expect(r.cenario.situacao.length, r.competencia).toBeGreaterThan(80);
      expect(r.cenario.pergunta.length, r.competencia).toBeGreaterThan(10);
    }
  });

  it('cada cenário tem exatamente 4 respostas, uma por nível N1–N4', () => {
    for (const r of reguas()) {
      const niveis = r.cenario.respostas.map((x) => x.nivel).sort();
      expect(niveis, r.competencia).toEqual([1, 2, 3, 4]);
      expect(new Set(r.cenario.respostas.map((x) => x.id)).size, r.competencia).toBe(4);
      for (const resp of r.cenario.respostas) {
        for (const campo of ['texto', 'evidencia', 'justificativa', 'limite'] as const) {
          expect(resp[campo]?.trim(), `${r.competencia}/${resp.id}/${campo}`).toBeTruthy();
        }
      }
    }
  });

  it('as respostas NÃO estão em ordem crescente de nível', () => {
    // Se estivessem, o visitante acertaria por posição em vez de por critério
    // — e a demo mediria a capacidade dele de ler uma lista ordenada.
    for (const r of reguas()) {
      const ordem = r.cenario.respostas.map((x) => x.nivel);
      expect(ordem, r.competencia).not.toEqual([1, 2, 3, 4]);
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

  it('a prancheta (fallback de papel) continua com o registro escrito', () => {
    // A tela trocou o registro pelo cenário; o papel não. Apagar o registro
    // do JSON deixaria /conarh/prancheta em branco no dia da queda de rede.
    expect(conteudo.porta2.registro_conversa.length).toBeGreaterThan(200);
    expect(conteudo.porta2.registro_trechos.length).toBeGreaterThanOrEqual(3);
    expect(conteudo.porta2.descritores.length).toBeGreaterThanOrEqual(5);
  });
});
