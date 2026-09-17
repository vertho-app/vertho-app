/**
 * Leitura do `resumo_avaliacao` do fechamento, que existe em DUAS FORMAS.
 *
 * 🔴 `Medido: 14/09/2026` nos 39 Evolution Reports da base:
 *   · **objeto** `{ mensagem_geral, principal_avanco, principal_ponto_de_atencao,
 *     evidencias_citadas }` nos 2 relatórios de tenant REAL (Ibipeba e o piloto);
 *   · **string** crua nos 37 dos três tenants de DEMO, porque o fixture
 *     (`lib/demo/evolucao-nucleo.ts`) declara `resumo_avaliacao: string`.
 *
 * Quem escrever tela olhando a demo renderiza a string e quebra em produção
 * ("Objects are not valid as a React child"); quem olhar só a produção acessa
 * `.mensagem_geral` e a demo fica MUDA, sem erro nenhum. As duas formas chegam
 * ao mesmo componente, então a normalização tem que ser fonte única: já havia um
 * `typeof … === 'object' ? … : …` inline na aba de auditoria da semana 14, que é
 * como essa decisão começa a divergir.
 *
 * Aqui não se conserta o fixture de propósito: o formato gravado é histórico de
 * tenant real também (um relatório de 03/07), e telas precisam ler o que está no
 * banco, não o que o gerador de hoje produziria.
 */

import { resumoSemTratamentoDeGenero, semTratamentoDeGenero } from '@/lib/redacao-sem-genero';

export interface ResumoAvaliacao {
  /** O texto que a pessoa lê. Sempre presente quando a função devolve algo. */
  mensagem: string;
  avanco: string | null;
  atencao: string | null;
  /** Trechos citados pelo avaliador. Vazio quando a forma não os traz. */
  evidencias: string[];
  /**
   * O FECHO do relatório, escrito para a pessoa em segunda pessoa (17/09/2026).
   * `null` em tudo que foi gerado antes: esses relatórios fecham com o
   * `insight_geral` do extrator, e não foram regerados (decisão do dono).
   */
  mensagemFinal: string | null;
  /** 0 a 3 ações. Vazio é resposta legítima, não campo faltando. */
  proximosPassos: string[];
}

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo ? limpo : null;
}

export function normalizarResumoAvaliacao(valor: unknown): ResumoAvaliacao | null {
  valor = resumoSemTratamentoDeGenero(valor);
  const comoTexto = texto(valor);
  if (comoTexto) return { mensagem: comoTexto, avanco: null, atencao: null, evidencias: [], mensagemFinal: null, proximosPassos: [] };

  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;

  const bruto = valor as Record<string, unknown>;
  const mensagem = texto(bruto.mensagem_geral);
  const avanco = texto(bruto.principal_avanco);
  const atencao = texto(bruto.principal_ponto_de_atencao);
  const evidencias = Array.isArray(bruto.evidencias_citadas)
    ? bruto.evidencias_citadas.map(texto).filter((e): e is string => e != null)
    : [];
  const mensagemFinal = texto(bruto.mensagem_final);
  const proximosPassos = Array.isArray(bruto.proximos_passos)
    ? bruto.proximos_passos.map(texto).filter((p): p is string => p != null).slice(0, 3)
    : [];

  // Sem mensagem não há resumo a mostrar: um objeto com só as evidências
  // renderizaria um bloco com título e nenhuma leitura.
  if (!mensagem) return null;
  return { mensagem, avanco, atencao, evidencias, mensagemFinal, proximosPassos };
}

/** Como o relatório FECHA: a última mensagem e o que vem depois dela. */
export interface FechoDoRelatorio {
  mensagemFinal: string | null;
  proximosPassos: string[];
}

/**
 * O fecho do relatório, das DUAS gerações.
 *
 * 🔴 POR QUE ISTO É FONTE ÚNICA (17/09/2026). O fecho mudou de autor. Até aqui a
 * "Mensagem final" era o `insight_geral` do EXTRATOR da conversa, cujo trabalho
 * é auditar base de evidência, e ele escrevia como auditor: `Medido:` 7 dos 10
 * relatórios de Ibipeba abriam em terceira pessoa ("A colaboradora demonstra…")
 * e 9 comentavam o próprio instrumento ("a dimensão não foi acessada na
 * conversa", "não trouxe evidência mesmo após duas tentativas da IA") no
 * fechamento do documento que a pessoa leva para casa. Agora o fecho nasce de
 * quem já fala COM ela, o prompt do fechamento, junto da devolutiva de abertura.
 *
 * E "Próximos passos" era uma seção que só a DEMONSTRAÇÃO tinha: `proximo_passo`
 * vinha de `reflexao.proximo_passo`, que o prompt da semana 13 nunca pediu.
 * `Medido:` 37 de 37 relatórios dos tenants de demo preenchidos pelo fixture,
 * **0 de 10** em Ibipeba. A vitrine mostrava a seção; a produção, nunca.
 *
 * Os relatórios já entregues NÃO foram regerados (decisão do dono), então o
 * fallback não é transição: é o que aqueles 47 documentos têm para sempre.
 */
export function fechoDoRelatorio(evolutionReport: unknown): FechoDoRelatorio {
  if (!evolutionReport || typeof evolutionReport !== 'object') return { mensagemFinal: null, proximosPassos: [] };
  const er = evolutionReport as Record<string, unknown>;
  const resumo = normalizarResumoAvaliacao(er.resumo_avaliacao);
  const passoAntigo = texto(semTratamentoDeGenero(er.proximo_passo));
  return {
    mensagemFinal: resumo?.mensagemFinal ?? texto(semTratamentoDeGenero(er.insight_geral)),
    proximosPassos: resumo?.proximosPassos.length ? resumo.proximosPassos : (passoAntigo ? [passoAntigo] : []),
  };
}
