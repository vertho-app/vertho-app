import { linhasDaVariante, type LinhaMatriz } from '@/lib/simuladores/lideranca/matriz-global';
import { linhasDoEncontro } from '@/lib/simulador-lideranca/avaliacao';
import {
  VERSAO,
  type Estado,
  type Avaliacao,
  type Episodio,
  type Gerar,
} from '@/lib/simulador-lideranca/schema';
export const PLANO =
  'Vou ouvir exemplos concretos antes de concluir e combinar uma revisão do fluxo.';
export const FALA =
  'Vamos revisar os pedidos juntos amanhã e definir uma prioridade por vez.';
export const REFLEXAO =
  'Percebi que concluí cedo demais. Vou perguntar pelos fatos antes de propor uma solução.';
export function estado(): Estado {
  return {
    versao: VERSAO,
    matriz: linhasDaVariante('lider'),
    modelos: {
      abertura: 'modelo',
      personagem: 'modelo',
      consequencia: 'modelo',
      avaliador: 'modelo',
    },
    prompts: {
      abertura: 'reservado',
      personagem: 'reservado',
      consequencia: 'reservado',
      avaliador: 'reservado',
    },
    ativo: null,
    concluidos: [],
    recibos: [],
  };
}
/**
 * Avaliação v2 de um encontro: só os descritores do encontro (foco + 2
 * secundárias). Duas notas: a preparação sustenta o D1 de Comunicação (a única
 * fonte de planejamento aceita) e uma fala sustenta o D1 da competência em foco.
 */
export function avaliacao(indice = 0, variante: 'lider' | 'futuro' = 'lider'): Avaliacao {
  return avaliacaoDasLinhas(linhasDoEncontro(linhasDaVariante(variante), indice));
}
export function avaliacaoDasLinhas(linhas: LinhaMatriz[]): Avaliacao {
  const foco = linhas[0].nome;
  return {
    sintese:
      'Você investigou antes de decidir, mas pode explorar melhor o fluxo de trabalho.',
    proximaPratica: 'Pergunte como um pedido chega e por quais etapas passa.',
    descritores: linhas.map((d) => {
      const plano = d.nome === 'Comunicação e Conversas de Liderança' && /_D1$/.test(d.cod_desc);
      const fala = d.nome === foco && /_D1$/.test(d.cod_desc) && !plano;
      return {
        codigo: d.cod_desc,
        nivel: plano || fala ? 3 : null,
        justificativa: plano || fala
          ? 'Você registrou a intenção de investigar antes de concluir.'
          : 'Não houve oportunidade de observar este comportamento.',
        evidencias: plano
          ? [{ fonte: 'planejamento' as const, turno: 0, trecho: PLANO }]
          : fala
            ? [{ fonte: 'fala' as const, turno: 1, trecho: FALA }]
            : [],
      };
    }),
  };
}
export function episodio(indice = 0): Episodio {
  return {
    id: '10000000-0000-4000-8000-000000000010',
    indice,
    repeticao: false,
    iniciadoEm: '2026-09-17T12:00:00Z',
    encerradoEm: null,
    contexto:
      'A equipe Horizonte atrasou duas entregas. Ana pediu uma conversa para entender as prioridades.',
    plano: PLANO,
    mensagens: [
      {
        turno: 0,
        autor: 'personagem',
        texto: 'Estou preocupada com os atrasos. Podemos conversar?',
      },
      ...[1, 2, 3].flatMap((turno) => [
        { turno, autor: 'lider' as const, texto: FALA },
        {
          turno,
          autor: 'personagem' as const,
          texto: 'Posso trazer os pedidos para revisarmos juntos.',
        },
      ]),
    ],
    reflexao: null,
    antecedentes: [],
    consequencia: null,
    avaliacao: null,
  };
}
export const gerarFixture: Gerar = async (etapa, dados, validar) => {
  const saidas = {
    abertura: {
      contexto:
        'A equipe Horizonte atrasou duas entregas. Ana pediu uma conversa para entender as prioridades.',
      fala: 'Estou preocupada com os atrasos. Podemos conversar?',
    },
    personagem: {
      fala: 'Posso trazer os pedidos para revisarmos juntos. Quem confirma a prioridade quando chegam dois pedidos?',
    },
    consequencia: {
      narrativa:
        'A equipe terá uma revisão dos pedidos amanhã. Ainda falta combinar como resolver novas demandas conflitantes.',
      acordos: [
        { descricao: 'Revisar os pedidos amanhã.', turno: 1, trecho: FALA },
      ],
      pendencias: ['Definir um ponto único de entrada para os pedidos.'],
    },
    avaliador: avaliacaoDasLinhas((dados as { matriz?: LinhaMatriz[] })?.matriz ?? linhasDoEncontro(linhasDaVariante('lider'), 0)),
  };
  const valor = saidas[etapa] as any;
  validar?.(valor);
  return valor;
};
