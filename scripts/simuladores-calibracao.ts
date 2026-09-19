/** Canário pago, opt-in. Conversas sintéticas em memória; nenhuma sessão é gravada.
 * Rodar pelo scripts/run-simuladores-calibracao.mts com --executar.
 * Qualidade é intenção do roteiro, não gabarito humano. Saídas para revisão em backups/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { callAI } from '@/actions/ai-client';
import { getModelForTask } from '@/lib/ai-tasks';
import { estadoConversaCompleta } from '../tests/fixtures/simulador-vendas-conversa';
import { executarCore } from '@/lib/simulador-vendas/core';
import {
  PROMPTS as PACE,
  mensagensDoPrompt,
} from '@/lib/simulador-vendas/prompts';
import { gerenteDocumentalSchema } from '@/lib/simulador-vendas/schema';
import { normalizarRelatorio } from '@/lib/simulador-vendas/normalizacao';
import { consolidarMatriz } from '@/lib/simulador-vendas/matriz-avaliacao';
import { linhasDaVariante } from '@/lib/simuladores/lideranca/matriz-global';
import { EPISODIOS } from '@/lib/simulador-lideranca/episodios';
import { PROMPTS as LID } from '@/lib/simulador-lideranca/prompts';
import { SAIDAS, schemaAvaliadorDoEncontro } from '@/lib/simulador-lideranca/schema';
import {
  diagnosticarAvaliacao,
  gravarAvaliacao,
  linhasDoEncontro,
  resumoAvaliacao,
} from '@/lib/simulador-lideranca/avaliacao';
import { dominioAtendimento } from '@/lib/recepcao/dominio';
import { catalogoInicial } from '@/lib/recepcao/catalogo';
import { aplicarMatrizAtendimento } from '@/lib/recepcao/matriz-avaliacao';
import { abrirSessao, encerrar } from '@/lib/recepcao/core';
import { geradorRecepcao } from '@/lib/recepcao/gerador';
if (!process.argv.includes('--executar'))
  throw Error('Canário pago: informe --executar.');
const dir =
  'backups/calibracao-simuladores-' +
  new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync(dir, { recursive: true });
const schema = (s: z.ZodType) => {
  const j = z.toJSONSchema(s, { target: 'draft-7' }) as Record<string, unknown>;
  delete j.$schema;
  return j;
};
const rodarIA = (
  prompt: string,
  dados: unknown,
  model: string,
  taskKey: string,
  formato: z.ZodType,
) =>
  callAI(
    prompt,
    typeof dados === 'string' ? dados : JSON.stringify(dados),
    { model },
    16000,
    {
      taskKey,
      source: 'piloto',
      locale: 'pt-BR',
      timeoutMs: 200000,
      maxRetries: 0,
      responses: {
        format: { name: 'calibracao', strict: true, schema: schema(formato) },
      },
    },
  );
type Caso = {
  id: string;
  simulador: string;
  qualidade: string;
  entrada: unknown;
  avaliar: () => Promise<any>;
};
const casos: Caso[] = [];
for (const qualidade of ['fraca', 'mediana', 'boa']) {
  const model = await getModelForTask(null, 'sim_vendas_gerente');
  const s = estadoConversaCompleta(model);
  if (qualidade !== 'boa') {
    s.planejamento =
      qualidade === 'fraca'
        ? 'Vou apresentar o produto e tentar fechar hoje.'
        : 'Vou perguntar pelo problema, apresentar o módulo e combinar um retorno.';
    const falas =
      qualidade === 'fraca'
        ? [
            'Nosso sistema é ótimo. Vamos contratar?',
            'É só trocar o sistema.',
            'Não preciso dos detalhes, o produto resolve.',
            'Todo mundo tem esse problema.',
            'O pacote completo é a melhor opção.',
            'Integração a gente vê depois.',
            'O preço é esse.',
            'Fale com o financeiro.',
            'Pode me procurar quando decidir.',
          ]
        : [
            'Bom dia, Beatriz. Podemos falar do estoque?',
            'Como funciona hoje?',
            'Entendi. Vocês gastam muito tempo?',
            'Certo, o problema é a planilha.',
            'Temos um módulo de estoque. O que acha?',
            'Podemos fazer um piloto.',
            'O preço é R$ 2.400 por mês.',
            'Posso enviar uma proposta para o financeiro?',
            'Vou enviar e depois retorno.',
          ];
    let i = 0;
    s.mensagens = s.mensagens.map((m) =>
      m.autor === 'vendedor' ? { ...m, texto: falas[i++] } : m,
    );
  }
  casos.push({
    id: 'vendas-' + qualidade,
    simulador: 'vendas',
    qualidade,
    entrada: s,
    avaliar: async () => {
      const final = await executarCore(
        structuredClone(s),
        {
          acao: 'encerrar',
          requestId: randomUUID(),
          sessaoId: s.id,
          revisao: s.revisao,
        },
        async (etapa, valores, validar) => {
          if (etapa !== 'gerente') throw Error('Etapa inesperada');
          const msg = mensagensDoPrompt(PACE.gerente, valores);
          const raw = await rodarIA(
            msg.system,
            msg.user,
            model,
            'sim_vendas_gerente',
            gerenteDocumentalSchema,
          );
          const r = {
            P: 0,
            A: 0,
            C: 0,
            E: 0,
            Beneficios_ocultos_descobertos: [],
            Objecoes_profundas_descobertas: [],
            ...gerenteDocumentalSchema.parse(
              normalizarRelatorio(JSON.parse(raw)),
            ),
            Media: 0,
            Violacoes: [],
          } as any;
          validar?.(r);
          return r;
        },
      );
      return {
        model,
        relatorio: final.relatorio,
        competencias: consolidarMatriz(final.relatorio!.Matriz!, s.versaoRegua),
      };
    },
  });
}
const contextos = [
  [
    'Como as demandas chegam e onde atrasam?',
    'Chegam por e-mail e mensagens. Duas prioridades mudaram sem aviso e uma entrega ficou sem informação.',
    'Vamos registrar as prioridades num quadro, rever toda segunda e checar sexta se reduziu atraso. O que falta?',
    'Preciso que as outras áreas respeitem o quadro.',
  ],
  [
    'Qual é o resultado esperado e qual parte você pode assumir?',
    'Posso preparar o relatório, mas preciso dos dados e dos critérios de qualidade.',
    'Você prepara até quinta, eu libero os dados hoje e revisamos um exemplo amanhã. Me diga como entendeu e se o prazo cabe.',
    'Cabe, desde que os dados cheguem hoje.',
  ],
  [
    'Percebi divergências entre o combinado e as últimas entregas. Como você vê esses episódios?',
    'As prioridades mudaram e não avisei porque achei que conseguiria entregar tudo.',
    'Entendo a pressão. Vamos combinar que você sinaliza riscos no dia e escolhemos a prioridade juntos. Como posso ajudar?',
    'Uma revisão curta na quarta me ajudaria.',
  ],
  [
    'Quais obstáculos impedem a colaboração entre vocês?',
    'Ana recebe urgências de fora e Bruno precisa refazer tarefas, mas não conversamos antes.',
    'Vamos ouvir os dois, registrar os conflitos no quadro e testar uma conversa diária de dez minutos por duas semanas. Qual ajuste vocês propõem?',
    'Podemos incluir quem pede urgências para negociar o que sai.',
  ],
  [
    'O que meus comportamentos ajudaram ou dificultaram para a equipe?',
    'Você resolve rápido, mas às vezes decide antes de ouvir e mudamos de direção sem entender.',
    'Reconheço que minha pressa pode silenciar vocês. Vou perguntar antes de decidir, registrar o motivo e pedir feedback na sexta. Como perceberemos mudança?',
    'Se conseguirmos apresentar alternativas antes da decisão e saber por que escolhemos uma.',
  ],
];
for (const variante of ['lider', 'futuro'] as const)
  for (let indice = 0; indice < 5; indice++) {
    if (variante === 'futuro' && indice > 0) continue;
    for (const qualidade of indice === 0
      ? ['fraca', 'mediana', 'boa']
      : ['boa']) {
      const matriz = linhasDaVariante(variante),
        linhas = linhasDoEncontro(matriz, indice),
        info = EPISODIOS[indice];
      const [pergunta, resposta, acordo, confirmacao] = contextos[indice];
      const mensagens = (
        qualidade === 'fraca'
          ? [
              'O atraso é falta de esforço. Faça do meu jeito.',
              resposta,
              'Não quero discutir, entregue tudo amanhã.',
              confirmacao,
              'Não vou rever minha decisão. Cumpra e pronto.',
              'Ainda tenho dúvidas sobre as prioridades.',
            ]
          : qualidade === 'mediana'
            ? [
                pergunta,
                resposta,
                'Precisamos melhorar. Tente se organizar e conversamos depois.',
                confirmacao,
                'Certo, me avise se aparecer dificuldade.',
                'Vou tentar, mas preciso que o combinado fique claro.',
              ]
            : [
                pergunta,
                resposta,
                acordo,
                confirmacao,
                'Quero checar se entendi: o obstáculo precisa ser combinado com quem depende da entrega. O que você mudaria nesse teste?',
                'Precisamos conferir na sexta se o acordo foi cumprido e ajustar o prazo quando surgir uma urgência.',
              ]
      ).map((texto, i) => ({
        texto,
        autor: i % 2 ? 'personagem' : 'lider',
        turno: Math.floor(i / 2) + 1,
      }));
      const plano =
        qualidade === 'boa'
          ? 'Vou ouvir exemplos, testar minha hipótese e combinar responsabilidades e prazo de revisão.'
          : 'Vou dizer como resolver e pedir melhora.';
      const reflexao =
        qualidade === 'boa'
          ? 'Minha pressa pode ter limitado a escuta; pedi a perspectiva da equipe e na próxima conversa vou testar as alternativas antes de concluir.'
          : 'Acho que fui bem, basta a equipe cumprir.';
      const ativo = {
        indice,
        plano,
        mensagens,
        reflexao,
        antecedentes: [],
      } as any;
      const entrada = {
        competenciaFoco: info.nome,
        competenciasSecundarias: info.secundarias,
        matriz: linhas,
        antecedentes: [],
        planejamento: plano,
        mensagens,
        reflexao,
      };
      casos.push({
        id: 'lideranca-' + variante + '-' + indice + '-' + qualidade,
        simulador: 'lideranca',
        qualidade,
        entrada,
        avaliar: async () => {
          const model = await getModelForTask(null, 'sim_lideranca_avaliador');
          const valor = SAIDAS.avaliador.parse(
            JSON.parse(
              await rodarIA(
                LID.avaliador,
                entrada,
                model,
                'sim_lideranca_avaliador',
                schemaAvaliadorDoEncontro(linhas.map(l=>l.cod_desc)),
              ),
            ),
          );
          try { diagnosticarAvaliacao(valor, ativo, linhas); }
          catch (e) { return {model, erro:(e as Error).message, saidaRecusada:valor}; }
          const relatorio = gravarAvaliacao(valor, ativo, linhas);
          return {
            model,
            relatorio,
            competencias: resumoAvaliacao(relatorio, matriz, indice)
              .competencias,
          };
        },
      });
    }
  }
for (const dominio of [
  'recepcao_medica',
  'atendimento_geral',
  'secretaria_escolar',
  'atendimento_loja',
])
  for (const qualidade of ['fraca', 'mediana', 'boa']) {
    const c = structuredClone(catalogoInicial[0]);
    c.dominio = dominio as any;
    c.ocorrenciasCriticas = dominioAtendimento(dominio).ocorrencias.map(
      (o) => o.id,
    );
    c.publico = {
      aviso: 'Caso inteiramente fictício.',
      canal: 'mensagens',
      titulo: 'Horário alterado',
      clinica: 'Unidade Exemplo',
      contexto:
        'Um atendimento agendado foi alterado e a pessoa precisa conciliar com o trabalho.',
      objetivo: 'Entender a restrição e combinar uma alternativa autorizada.',
      escopoAvaliacao: 'Somente reagendamento administrativo fictício.',
      secoes: [
        {
          titulo: 'Horários autorizados',
          itens: [
            'Terça às 16h ou quinta às 18h.',
            'Se nenhuma opção servir, a coordenação retorna amanhã até 12h neste chat, com autorização.',
          ],
        },
      ],
      procedimentos: [
        'Pergunte a disponibilidade antes de confirmar.',
        'Ofereça só os dois horários disponíveis.',
        'Confirme dia e hora escolhidos; encaminhe à coordenação somente com autorização.',
        'Não prometa encaixes, preços ou compensações.',
      ],
    };
    c.paciente = {
      nome: 'Marina',
      abertura:
        'Mudaram meu horário de novo e já reorganizei o trabalho. Preciso resolver.',
      fatos: [
        'Só consegue depois das 17h.',
        'Aceita quinta às 18h se confirmar.',
      ],
      comportamento: 'Frustrada; aceita alternativa clara.',
      limites: 'Não invente disponibilidade.',
    };
    c.variantes = [];
    const s = abrirSessao(aplicarMatrizAtendimento(c), 0);
    const falas =
      qualidade === 'fraca'
        ? [
            'É assim mesmo, não posso fazer nada.',
            'Só tenho terça às 16h, aceite ou desista.',
            'Então procure outro lugar.',
          ]
        : qualidade === 'mediana'
          ? [
              'Entendi. Qual horário pode?',
              'Tem quinta às 18h.',
              'Certo, fica quinta.',
            ]
          : [
              'Sinto pela mudança e pelo impacto no seu trabalho. Para encontrar uma opção viável, em quais horários você consegue?',
              'Então precisa ser depois das 17h. Temos quinta às 18h; terça às 16h não atende sua restrição. Quinta funciona para você?',
              'Combinado: seu atendimento fica confirmado para quinta às 18h na Unidade Exemplo. Quer que eu confira algum outro detalhe?',
            ];
    const respostas = [
      'Só consigo depois das 17h.',
      'Quinta às 18h funciona.',
      'Tudo certo, obrigada.',
    ];
    s.historico = [
      { id: 'm0', role: 'assistant', content: c.paciente.abertura },
      ...falas.flatMap(
        (content, i) =>
          [
            { id: 'm' + (i * 2 + 1), role: 'user', content },
            { id: 'm' + (i * 2 + 2), role: 'assistant', content: respostas[i] },
          ] as any[],
      ),
    ];
    s.respostas = 3;
    casos.push({
      id: 'atendimento-' + dominio + '-' + qualidade,
      simulador: 'atendimento',
      qualidade,
      entrada: s,
      avaliar: async () => {
        const ai = geradorRecepcao(null, null, true);
        const final = await encerrar(structuredClone(s), ai.gerar, ai.validar);
        return {
          relatorio: final.relatorio,
          competencias: final.relatorio?.competencias,
          chamadas: ai.chamadas,
        };
      },
    });
  }
const filtro = process.env.CALIBRACAO_SIMULADOR;
const selecionados = filtro ? casos.filter(c => c.simulador === filtro) : casos;
const tarefas = selecionados.flatMap((c) =>
  [1, 2].map((repeticao) => ({ c, repeticao })),
);
console.log(
  JSON.stringify({ casos: casos.length, avaliacoes: tarefas.length, dir }),
);
const resultados: any[] = [];
async function worker() {
  for (;;) {
    const item = tarefas.shift();
    if (!item) return;
    const { c, repeticao } = item;
    const inicio = Date.now();
    let saida: any;
    try {
      saida = await c.avaliar();
    } catch (e) {
      saida = { erro: (e as Error).message };
    }
    const linha = {
      caso: c.id,
      simulador: c.simulador,
      qualidadePretendida: c.qualidade,
      repeticao,
      segundos: (Date.now() - inicio) / 1000,
      entradaHash: createHash('sha256')
        .update(JSON.stringify(c.entrada))
        .digest('hex'),
      ...saida,
    };
    resultados.push(linha);
    writeFileSync(
      dir + '/' + c.id + '-' + repeticao + '.json',
      JSON.stringify({ entrada: c.entrada, ...linha }, null, 2),
    );
    writeFileSync(dir + '/resumo.json', JSON.stringify(resultados, null, 2));
    console.log(
      JSON.stringify({
        caso: c.id,
        repeticao,
        segundos: linha.segundos,
        erro: saida.erro ?? null,
        competencias: saida.competencias?.map((x: any) => ({
          codigo: x.codigo ?? x.nome,
          nivel: x.nivel,
          observados: x.observados,
        })),
      }),
    );
  }
}
await Promise.all([worker(), worker(), worker()]);
writeFileSync(
  dir + '/revisao-humana.csv',
  'caso;qualidade_pretendida;competencia;nivel_humano;motivo\n' +
    casos.map((c) => c.id + ';' + c.qualidade + ';;;').join('\n'),
);
console.log(
  JSON.stringify({
    concluidas: resultados.length,
    falhas: resultados.filter((r) => r.erro).length,
    dir,
  }),
);
