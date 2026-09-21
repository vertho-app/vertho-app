/** Históricos editoriais fictícios para a sala demo. Sem chamadas de IA.
 * As notas passam pelos mesmos consolidadores e contratos dos treinos reais.
 * Datas relativas mantêm a vitrine dentro dos filtros de 7/30/90 dias.
 */
import { createHash } from 'node:crypto';
import { abrirSessao, consolidar } from '@/lib/recepcao/core';
import { aplicarMatrizAtendimento, rubricaAvaliavel } from '@/lib/recepcao/matriz-avaliacao';
import type { Cenario } from '@/lib/recepcao/schema';
import type { Insumos } from '@/lib/recepcao/model';
import { RECEPCAO_SESSAO, VENDAS_SESSAO } from '@/lib/status';
import { COMPETENCIAS_PACE, MATRIZ_VERSION } from '@/lib/simulador-vendas/matriz';
import { validarMatriz } from '@/lib/simulador-vendas/matriz-avaliacao';
import { pontuacaoMatriz } from '@/lib/simulador-vendas/escala';
import { REGUA_VERSION, relatorioSchema, type Estado as EstadoVendas } from '@/lib/simulador-vendas/schema';
import { linhasDaVariante, type VarianteLideranca } from '@/lib/simuladores/lideranca/matriz-global';
import { gravarAvaliacao, linhasDoEncontro } from '@/lib/simulador-lideranca/avaliacao';
import { EPISODIOS } from '@/lib/simulador-lideranca/episodios';
import { VERSAO, type Estado as EstadoLideranca, type Episodio } from '@/lib/simulador-lideranca/schema';

export const DEMO_SIMULADORES_VERSION = 'demo-simuladores-v1';
export function idDemoSimulador(chave: string) {
  const h = createHash('sha256').update(`${DEMO_SIMULADORES_VERSION}:${chave}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export const dataDemo = (agora: Date, dias: number) => new Date(agora.getTime() - dias * 86400000).toISOString();
const nivel = (pessoa: number, competencia: number, tentativa = 0) => Math.min(4, ([3, 3, 2, 3, 4][(pessoa + competencia) % 5]) + tentativa) as 1 | 2 | 3 | 4;

export function treinoAtendimentoDemo(cenario: Cenario, id: string, pessoa: number, tentativa: number) {
  const s = abrirSessao(aplicarMatrizAtendimento(cenario), 0);
  s.id = id;
  const falas = [
    'Entendo o transtorno. Quero ouvir o que aconteceu e qual é a sua prioridade para resolvermos isso.',
    'Vou conferir as informações disponíveis antes de confirmar. Pode me contar o que já foi combinado?',
    'Vamos seguir o procedimento informado e encaminhar o que depende da equipe responsável. Não consigo prometer algo que ainda não foi confirmado.',
    'Vou registrar o pedido neste canal, informar quem acompanha e combinar o retorno. Esse próximo passo atende à sua necessidade?',
  ];
  s.historico = [
    { id: 'm0', role: 'assistant', content: cenario.paciente.abertura },
    ...falas.map((content, i) => ({ id: `m${i + 1}`, role: 'user' as const, content })),
    { id: 'm5', role: 'assistant', content: 'Sim, entendi o encaminhamento e vou aguardar o retorno neste canal.' },
  ];
  const insumos: Insumos = {
    dimensoes: rubricaAvaliavel(s.cenario).map((d, i) => ({
      id: d.id, classificacao: `n${nivel(pessoa, Math.floor(i / 6), tentativa)}` as 'n1' | 'n2' | 'n3' | 'n4',
      justificativa: `Exemplo demonstrativo de ${d.nome}: ${d.niveis![`n${nivel(pessoa, Math.floor(i / 6), tentativa)}` as 'n1' | 'n2' | 'n3' | 'n4']}`,
      evidencias: [{ mensagemId: `m${1 + Math.floor(i / 8)}`, trecho: falas[Math.floor(i / 8)] }],
      oportunidades: [{ mensagemId: 'm0', trecho: cenario.paciente.abertura }],
    })),
    ocorrencias: [],
    desfecho: { tipo: s.cenario.desfechos.includes('encaminhado') ? 'encaminhado' : 'inconclusivo', justificativa: 'Exemplo fictício: demanda acolhida e próximo passo encaminhado; a resolução posterior ainda depende de confirmação.', evidencias: [{ mensagemId: 'm4', trecho: falas[3] }, { mensagemId: 'm5', trecho: s.historico.at(-1)!.content }] },
    feedback: {
      acerto: 'Você escutou a demanda e explicou os limites do atendimento sem prometer uma solução ainda não confirmada.',
      melhoria: 'Torne o retorno verificável: confirme o responsável e o horário específico do próximo contato.',
      novaTentativa: 'Refaça a conversa combinando responsável, prazo e canal, e peça à pessoa que confirme o entendimento.',
    },
  };
  s.relatorio = consolidar(s, insumos);
  s.status = RECEPCAO_SESSAO.CONCLUIDA;
  s.respostas = falas.length;
  s.motivoFim = 'Treino demonstrativo concluído';
  return { ...s, demoFixture: DEMO_SIMULADORES_VERSION };
}

export function treinoVendasDemo(id: string, nome: string, pessoa: number, tentativa: number, em: string): EstadoVendas & { demoFixture: string } {
  const planejamento = 'Vou entender o objetivo da operação, o impacto dos atrasos, quem participa da decisão e os critérios de sucesso. Quero sair com um próximo passo acordado, sem prometer resultado antes do diagnóstico.';
  const falas = [
    'Obrigada pelo seu tempo. Podemos começar pelo que vocês querem melhorar e pelo que seria um bom resultado desta conversa?',
    'Como os atrasos afetam a equipe hoje? Quem mais sente esse impacto e que alternativas vocês já tentaram?',
    'Pelo que entendi, previsibilidade é a prioridade. Podemos comparar um piloto de uma equipe com a expansão completa, considerando esforço, prazo e riscos?',
    'Proponho validar o piloto com a operação na quinta-feira. Você confirma quem decide e quais indicadores precisamos apresentar para seguir?',
  ];
  const mensagens: EstadoVendas['mensagens'] = falas.flatMap((texto, i) => [
    { id: `${id}-${i}-v`, turno: i * 2 + 1, autor: 'vendedor' as const, texto, fase: (['preparar', 'analisar', 'cocriar', 'engajar'] as const)[i] },
    { id: `${id}-${i}-c`, turno: i * 2 + 2, autor: 'cliente' as const, texto: ['Quero entender se conseguimos reduzir retrabalho.', 'A equipe perde tempo com informações dispersas e já tentou planilhas.', 'Prefiro começar com uma equipe e avaliar a adesão.', 'Vou envolver a operação e confirmar os indicadores até quinta-feira.'][i], fase: (['preparar', 'analisar', 'cocriar', 'engajar'] as const)[i] },
  ]);
  const Matriz = validarMatriz({ versao: MATRIZ_VERSION, descritores: COMPETENCIAS_PACE.flatMap((c, ci) => c.descritores.map((d) => {
    const fora = ['E5', 'E6'].includes(d.codigo);
    const plano = c.codigo === 'PL';
    const fi = Math.max(0, ci - 1);
    return { codigo: d.codigo, nivel: fora ? null : nivel(pessoa, ci, tentativa), justificativa: fora ? 'A execução posterior não é observável nesta reunião.' : `Exemplo demonstrativo: ${d.nome}. ${d.niveis[`n${nivel(pessoa, ci, tentativa)}` as 'n1' | 'n2' | 'n3' | 'n4']}`, evidencias: fora ? [] : [{ origem: plano ? 'planejamento' : 'conversa', turno: plano ? null : fi * 2 + 1, citacao: plano ? planejamento : falas[fi] }] };
  })) }, { planejamento, mensagens });
  const relatorio = relatorioSchema.parse({
    ...pontuacaoMatriz(Matriz, REGUA_VERSION), Matriz,
    Preparacao: 'Abriu a conversa com propósito e pediu concordância sobre a pauta.',
    Analise: 'Investigou o problema e suas consequências; pode aprofundar os critérios de decisão.',
    Cocriacao: 'Comparou alternativas de implantação e reconheceu os riscos de cada opção.',
    Engajamento: 'Encaminhou uma validação com a operação; falta confirmar a participação de todos os decisores.',
    Resumo: 'Treino fictício de venda consultiva: da descoberta da necessidade à combinação de um piloto.',
    Recomendacoes: [{ titulo: 'Confirme os critérios de sucesso', descricao: 'Antes de apresentar a proposta, peça ao cliente os indicadores que usará para decidir.', prioritaria: true }],
    Resultado: 'nao_fechou', Preco_final: '', Compromissos_obtidos: 'Validar o piloto com a operação na quinta-feira.',
    Beneficios_ocultos_descobertos: [], Objecoes_profundas_descobertas: [], Violacoes: [],
  });
  return {
    id, revisao: 0, status: VENDAS_SESSAO.CONCLUIDA, nivel: 2, nomeVendedor: nome,
    briefing: 'Demonstração fictícia de uma solução para organizar a operação e reduzir retrabalho. Objetivo: avaliar um piloto com critérios de sucesso definidos em conjunto.',
    prompts: { criador: { hash: '', versao: 'demo', modelo: '' }, cliente: { hash: '', versao: 'demo', modelo: '' }, moderador: { hash: '', versao: 'demo', modelo: '' }, intencao: { hash: '', versao: 'demo', modelo: '' }, gerente: { hash: '', versao: 'demo', modelo: '' } },
    cenario: { contexto_vendedor: 'Você conversa com Ana, responsável por uma operação que quer reduzir retrabalho. Descubra as necessidades e combine um próximo passo. Pessoas e situação fictícias.', contexto_gerente: 'Registro editorial de demonstração.', personagem: { nome: 'Ana', cargo: 'Gerente de Operações', empresa: 'Horizonte Exemplo', cidade: 'São Paulo', personalidade_pace: 'Conforme', traco_dominante: 'Busca clareza', tom_linguagem: 'Objetivo', historia: 'Avalia alternativas para organizar a operação.', personalidade_nivel: { nivel: 'Pleno', descricao: 'Compara alternativas.', nota_corte_objecao: 0, nota_corte_preco: 0, cenarios_validos: [], regra_avaliacao: 'Matriz PACE' }, negociacao: { nome_vendedor: nome, objecoes: [{ descricao: 'Precisamos validar o esforço de implantação.', minimo_aceitavel: 'Piloto com apoio da operação.', ideal: 'Critérios de sucesso e responsáveis acordados.' }], objecoes_profundas: [], beneficios_ocultos: [{ nome: 'Previsibilidade', categoria: 'Operação', prova_esperada: 'Indicadores do piloto', gatilho_descoberta: 'Investigar o impacto dos atrasos.', peso: 1 }], preco: { minimo_aceitavel: '', ideal: '' }, notas_cortes: { negociacao_objecoes: 0, negociacao_preco: 0 } } } },
    fase: 'engajar', mensagens, planejamento, moderacoes: [], intencao: null, relatorio,
    feedback: { realismo: 4, desafio: 3 + pessoa % 2, interacao: 4, utilidade: 5, aprendizado: 4, comentario: tentativa ? 'Consegui melhorar as perguntas e combinar um próximo passo mais claro.' : 'A prática me ajudou a perceber onde faltava aprofundar a necessidade do cliente.' },
    criadoEm: em, encerradoEm: new Date(Date.parse(em) + 12 * 60000).toISOString(), recibos: [], versaoRegua: REGUA_VERSION, demoFixture: DEMO_SIMULADORES_VERSION,
  };
}

const CONVERSAS_LIDERANCA = [
  ['Quero entender os atrasos antes de concluir a causa. Pode me contar um exemplo e quem pediu cada entrega?', 'Vamos separar fatos de hipóteses e comparar as prioridades com a capacidade disponível. O que precisa de apoio?', 'Vamos centralizar os pedidos e revisar as prioridades amanhã. Eu converso com quem solicitou; você registra os conflitos para avaliarmos juntos.'],
  ['Quero combinar uma responsabilidade que ajude no seu desenvolvimento. O que você já consegue fazer e onde precisa de apoio?', 'Você pode assumir a primeira versão com o apoio da Camila na revisão. Vamos conferir a capacidade antes de acrescentar outra entrega.', 'Vamos revisar juntos na quinta-feira. Traga sua proposta e suas dúvidas; a decisão sobre o caminho continua com você dentro dos limites combinados.'],
  ['Na reunião, houve interrupções antes de Bruno terminar. Quero ouvir sua perspectiva e entender o impacto na equipe.', 'Qualidade é importante, e precisamos preservar espaço para aprender. Como podemos combinar uma revisão que ajude sem tomar a tarefa da outra pessoa?', 'Vamos combinar uma revisão com perguntas antes de refazer a entrega. Na próxima reunião, ouviremos a proposta inteira e depois discutiremos os ajustes.'],
  ['Quero entender a urgência e o impacto de adiar esta entrega. A equipe já tem dois compromissos para amanhã.', 'Podemos reduzir o escopo de amanhã ou negociar o prazo da outra entrega. Vou explicitar os riscos para decidirmos com os responsáveis.', 'Vamos validar o escopo mínimo hoje e comunicar a mudança às pessoas afetadas. Eu assumo esse alinhamento e confirmo a prioridade por escrito.'],
  ['Quero ouvir um exemplo concreto do impacto da minha orientação. O que ajudou e o que dificultou o trabalho?', 'Percebo que combinei autonomia, mas voltei a decidir sem ouvir sua proposta. Minha hipótese sobre o risco não considerou o que você já sabia.', 'Vou reformular: você apresenta as alternativas e recomenda um caminho; eu ajudo a avaliar os riscos. Vamos observar essa mudança na próxima revisão.'],
];
export function jornadaLiderancaDemo(chave: string, variante: VarianteLideranca, pessoa: number, quantidade: number, agora: Date, modelos: EstadoLideranca['modelos'], prompts: EstadoLideranca['prompts']) {
  const matriz = linhasDaVariante(variante);
  const concluidos: Episodio[] = Array.from({ length: quantidade }, (_, indice) => {
    const falas = CONVERSAS_LIDERANCA[indice];
    const e: Episodio = {
      id: idDemoSimulador(`${chave}:encontro:${indice}`), indice, repeticao: false,
      iniciadoEm: dataDemo(agora, 12 - indice * 2), encerradoEm: dataDemo(agora, 12 - indice * 2 - 0.01),
      contexto: `Situação fictícia de demonstração. ${EPISODIOS[indice].objetivo}`, plano: 'Ouvir a perspectiva da pessoa, separar fatos de hipóteses e combinar um próximo passo verificável.',
      mensagens: falas.flatMap((texto, i) => [
        { turno: i * 2 + 1, autor: 'lider' as const, texto },
        { turno: i * 2 + 2, autor: 'personagem' as const, texto: ['Posso explicar o que aconteceu e o que ainda está difícil.', 'Esse caminho ajuda; preciso de clareza sobre a prioridade e o apoio disponível.', 'Combinado. Vou registrar o próximo passo para revisarmos juntos.'][i] },
      ]),
      reflexao: 'Percebi que ouvir antes de propor ajudou a entender o problema. Na próxima conversa vou confirmar prazo e critério de sucesso com mais precisão.',
      antecedentes: [], consequencia: { narrativa: 'A conversa terminou com um próximo passo combinado e espaço para acompanhamento.', acordos: [{ descricao: falas[2], turno: 5, trecho: falas[2] }], pendencias: ['Verificar na próxima conversa se o combinado foi realizado.'] }, avaliacao: null,
    };
    const linhas = linhasDoEncontro(matriz, indice);
    e.avaliacao = gravarAvaliacao({ sintese: 'Você abriu espaço para ouvir, discutiu alternativas e encaminhou um acordo. O próximo passo é acompanhar o efeito do combinado.', proximaPratica: 'Retome um fato específico e confirme responsável, prazo e critério de sucesso com a pessoa.', descritores: linhas.map((d, i) => ({ codigo: d.cod_desc, nivel: nivel(pessoa, Math.floor(i / 6), indice > 2 ? 1 : 0), justificativa: `Exemplo demonstrativo de ${d.nome_curto}: ${d.n3_meta}`, evidencias: [{ fonte: 'fala', turno: 1 + (i % 3) * 2, trecho: falas[i % 3] }] })) }, e, linhas);
    return e;
  });
  const estado: EstadoLideranca & { demoFixture: string } = { versao: VERSAO, matriz, modelos, prompts, ativo: null, concluidos, recibos: [], demoFixture: DEMO_SIMULADORES_VERSION };
  return estado;
}
