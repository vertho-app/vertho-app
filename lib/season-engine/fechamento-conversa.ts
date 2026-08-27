/**
 * A conversa da semana terminou de FATO, ou a IA foi cortada no ar?
 *
 * 🔴 POR QUE ISTO EXISTE (medido 27/08/2026)
 * ─────────────────────────────────────────
 * As três conversas da semana (socrática, analítica e de missão prática) davam
 * a conversa por encerrada por CONTAGEM: `finished = turnosDeIA >= teto`,
 * avaliado DEPOIS de a IA já ter falado. Ninguém olhava o que ela tinha escrito.
 * Se o último turno saiu como pergunta, a tela imprimia "✓ Conversa concluída"
 * embaixo de uma pergunta que a pessoa não podia mais responder.
 *
 * Não era caso raro. Nas **86** conversas de Evidências concluídas:
 *   · 23 (27%) chegaram ao bloco de fechamento;
 *   · 45 (52%) terminaram com a IA abrindo o SEGUNDO desafio da semana;
 *   · 18 (21%) terminaram no meio de um aprofundamento.
 *
 * E o estrago não é só de tela: o extrator roda sobre esse transcript, e o
 * fechamento é onde o insight e o compromisso são ditos. `compromisso_proxima`
 * saiu VAZIO em **48 das 63** conversas cortadas (76%), contra 3 das 23 que
 * fecharam (13%) — e é ele que a semana seguinte e o painel de Evidências leem.
 *
 * O contador continua existindo: ele é o TETO. O que ele não pode ser é o
 * roteiro. Quem decide que a conversa acabou é a última fala ter fechado.
 */
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';

/**
 * A última fala da IA é um fechamento?
 *
 * Régua deliberadamente conservadora: os três roteiros da semana de conteúdo e
 * de aplicação mandam o mesmo par de marcadores no bloco de fechamento (`✅` no
 * veredito e `🎯` no próximo passo), e nenhum deles termina em pergunta.
 * Validada contra o histórico — reproduz exatamente a classificação manual das
 * 96 conversas concluídas (23 de 86 na socrática, 6 de 10 nas de aplicação),
 * sem nenhum caso em que os marcadores apareçam junto com pergunta final.
 *
 * ⚠️ `marcadores: false` para a conversa qualitativa da semana 13: o fechamento
 * dela é em PROSA (síntese da evolução + frase final), sem bullets — exigir os
 * marcadores ali daria falso negativo em 100% dos casos e a rede de segurança
 * gastaria uma chamada extra por conversa, sempre. Lá a régua é só "não termina
 * perguntando", que é o sintoma que se quer impedir.
 *
 * Falso negativo aqui custa uma chamada de IA; falso positivo custa a conversa
 * terminar no ar de novo. Na dúvida, responde `false`.
 */
export function pareceFechamento(
  texto: string | null | undefined,
  opts: { marcadores?: boolean } = {},
): boolean {
  const s = String(texto || '').trim();
  if (!s) return false;
  if (s.endsWith('?')) return false;
  if (opts.marcadores === false) return true;
  return s.includes('✅') && s.includes('🎯');
}

/**
 * Preâmbulo da SEGUNDA tentativa. A primeira já pediu o fechamento pelo
 * roteiro do turno; se ela não fechou, repetir a mesma instrução tende a
 * repetir o mesmo resultado — o que muda aqui é dizer que a resposta anterior
 * foi descartada e que não existe próximo turno.
 */
export function reforcoDeFechamento(fechamentoSuffix: string): string {
  return `⚠️ ENCERRAMENTO FORÇADO — LEIA ANTES DE ESCREVER.

A conversa ACABOU. Esta é a última mensagem e a pessoa NÃO poderá responder.
Sua tentativa anterior fez uma pergunta ou abriu assunto novo, e foi DESCARTADA.
Escreva agora SOMENTE o fechamento, no formato abaixo. Nenhuma pergunta —
nem retórica, nem "faz sentido?", nem convite a continuar depois.

${fechamentoSuffix}`;
}

/**
 * Registra que uma conversa foi encerrada sem fechamento mesmo após a segunda
 * tentativa. Best-effort (nunca lança) — o mesmo contrato de `registrarDegradacao`.
 */
export async function registrarConversaSemFechamento(
  sb: any,
  args: { empresaId: string | null; colaboradorId: string | null; semana: number; tipoConversa: string; tentativas: number },
): Promise<void> {
  await registrarDegradacao({
    fluxo: 'chat',
    tipo: DEGRADACAO.CONVERSA_SEM_FECHAMENTO,
    chave: `${args.colaboradorId || 'sem-colab'}:${args.semana}`,
    empresaId: args.empresaId,
    colaboradorId: args.colaboradorId,
    severidade: 'aviso',
    detalhe: { semana: args.semana, tipo_conversa: args.tipoConversa, tentativas: args.tentativas },
  }, sb);
}
