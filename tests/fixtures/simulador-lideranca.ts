import { linhasDaVariante } from '@/lib/simuladores/lideranca/matriz-global';
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
export function avaliacao(): Avaliacao {
  return {
    sintese:
      'Você investigou antes de decidir, mas pode explorar melhor o fluxo de trabalho.',
    proximaPratica: 'Pergunte como um pedido chega e por quais etapas passa.',
    descritores: linhasDaVariante('lider').map((d, i) => ({
      codigo: d.cod_desc,
      nivel: i === 0 ? 3 : null,
      justificativa:
        i === 0
          ? 'Registrou a intenção de investigar antes de concluir.'
          : 'Não houve oportunidade de observar este comportamento.',
      evidencias:
        i === 0 ? [{ fonte: 'planejamento', turno: 0, trecho: PLANO }] : [],
    })),
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
    avaliador: avaliacao(),
  };
  const valor = saidas[etapa] as any;
  validar?.(valor);
  return valor;
};
