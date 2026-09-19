/**
 * Conversa de venda completa (plano guiado nas seis perguntas e 9 turnos pelas
 * quatro fases) para o ensaio real do avaliador do vendas. Fica aqui, e não no
 * ensaio, para o diagnóstico poder ser conferido contra uma saída gravada sem
 * pagar outra chamada.
 */
import { validarRelatorio } from '@/lib/simulador-vendas/core';
import { PROMPTS, PROMPT_VERSION, hashPrompt } from '@/lib/simulador-vendas/prompts';
import { ETAPAS, REGUA_VERSION, gerenteDocumentalSchema, type Estado } from '@/lib/simulador-vendas/schema';
import { normalizarRelatorio } from '@/lib/simulador-vendas/normalizacao';
import { comporPlano } from '@/lib/simulador-vendas/plano-guiado';
import pt from '@/messages/pt-BR.json';
import { estado } from './simulador-vendas';

export const RESPOSTAS_PLANO = [
  'Beatriz é diretora de operações da Horizonte, em Curitiba. Sei que a operação cresceu; preciso confirmar como controlam o estoque e quem sente o problema.',
  'Sair com um próximo passo com data: uma conversa com o financeiro ou um piloto. Se não der, ao menos confirmar o problema e quem decide.',
  'Hipótese 1: o controle é manual e gera divergência. Hipótese 2: falta previsibilidade para prometer prazo ao cliente. Perguntas: como controlam hoje, quanto tempo gastam, o que já deu errado.',
  'Vinte minutos, começando pelo diagnóstico e sem apresentar o sistema inteiro. Combino no início o que vamos cobrir.',
  'Módulo de estoque integrado às compras, com alerta de ruptura; posso propor piloto em uma filial. Exemplo de cliente do mesmo porte que reduziu conferência manual, a validar com ela.',
  'Prazo de implantação e integração com o ERP; preço sem aprovação do financeiro. Alternativa: piloto curto e mensalidade só depois da integração validada.',
];

export const CONVERSA_COMPLETA: Array<['vendedor' | 'cliente', 'preparar' | 'analisar' | 'cocriar' | 'engajar', string]> = [
  ['vendedor', 'preparar', 'Bom dia, Beatriz. Obrigada por separar esse tempo. Antes de falar de qualquer solução, queria entender como está a operação de vocês hoje. Pode ser?'],
  ['cliente', 'preparar', 'Pode. Tenho uns vinte minutos. O que você quer saber?'],
  ['vendedor', 'analisar', 'Como vocês administram o estoque hoje? Qual impacto isso tem para a equipe?'],
  ['cliente', 'analisar', 'Controlamos em planilha e num sistema antigo que não conversa com as compras. A equipe perde tempo conferindo tudo à mão e, no fim do mês, sempre aparece divergência.'],
  ['vendedor', 'analisar', 'Quanto tempo a equipe gasta nessa conferência por semana? E essas divergências já causaram falta de produto para algum cliente?'],
  ['cliente', 'analisar', 'Umas dez horas por semana, entre duas pessoas. E sim, no trimestre passado faltou insumo para um pedido grande e tivemos que pagar frete expresso.'],
  ['vendedor', 'analisar', 'Entendi. Se eu resumir: o problema não é só a planilha, é não ter previsibilidade de quanto vocês têm para prometer ao cliente. Faz sentido?'],
  ['cliente', 'analisar', 'Faz. Previsibilidade é exatamente o que a diretoria cobra de mim.'],
  ['vendedor', 'cocriar', 'Então, em vez de apresentar o sistema inteiro, proponho começar pelo módulo de estoque integrado às compras, com alerta de ruptura. Na sua visão, o que precisaria acontecer para isso funcionar aqui?'],
  ['cliente', 'cocriar', 'Precisaria integrar com o nosso ERP e não parar a operação. E o prazo me preocupa: não posso ter implantação arrastando três meses.'],
  ['vendedor', 'cocriar', 'A implantação desse módulo leva 30 dias, com a integração ao ERP feita pela nossa equipe. Se começarmos pela filial de Curitiba em duas semanas, como piloto, isso atende a sua preocupação?'],
  ['cliente', 'cocriar', 'Um piloto em Curitiba ajuda. Mas quanto isso custa?'],
  ['vendedor', 'cocriar', 'O módulo fica em R$ 2.400 por mês para a operação toda. No piloto, a mensalidade só começa quando você validar a integração. Comparando com as dez horas semanais e o frete expresso do trimestre, como isso fica para você?'],
  ['cliente', 'cocriar', 'Fica razoável, mas preciso levar para o financeiro.'],
  ['vendedor', 'engajar', 'Perfeito. Posso preparar um resumo de uma página com o problema, o piloto e o retorno esperado para você levar ao financeiro. Podemos marcar quinta uma conversa com você e o responsável do financeiro?'],
  ['cliente', 'engajar', 'Pode mandar o resumo hoje. Quinta às 10h funciona.'],
  ['vendedor', 'engajar', 'Combinado: envio o resumo hoje até as 18h e mando o convite para quinta às 10h. Obrigada, Beatriz.'],
  ['cliente', 'engajar', 'Obrigada, até quinta.'],
];

/** Sessão pace-7 em andamento, com o snapshot dos prompts atuais no modelo informado. */
export function estadoConversaCompleta(modelo: string): Estado {
  const titulos = Array.from({ length: 6 }, (_, i) => (pt as any).SimuladorVendas[`planningField${i + 1}`] as string);
  return {
    ...estado(),
    versaoRegua: REGUA_VERSION,
    nivel: 2,
    planejamento: comporPlano(RESPOSTAS_PLANO, titulos),
    mensagens: CONVERSA_COMPLETA.map(([autor, fase, texto], i) => ({ id: `m${i}`, turno: Math.floor(i / 2) + 1, autor, fase, texto })),
    prompts: Object.fromEntries(
      ETAPAS.map((e) => [e, { texto: PROMPTS[e], hash: hashPrompt(PROMPTS[e]), versao: PROMPT_VERSION, modelo }]),
    ) as Estado['prompts'],
  };
}

/**
 * Por que uma saída do gerente foi recusada: o gerador só registra o TIPO do erro.
 * Mesma leitura dele na pace-7 (documental, bruto): o que o gerente não devolve entra vazio.
 */
export function diagnosticarGerente(saida: string | null, erro: string | null, s: Estado): string | null {
  if (!saida) return erro;
  try {
    const lido = gerenteDocumentalSchema.parse(normalizarRelatorio(JSON.parse(saida)));
    validarRelatorio({
      P: 0, A: 0, C: 0, E: 0, Beneficios_ocultos_descobertos: [], Objecoes_profundas_descobertas: [],
      ...lido, Media: 0, Violacoes: [],
    } as any, s);
    return 'ok';
  } catch (e) {
    return String((e as Error).message).slice(0, 300);
  }
}
