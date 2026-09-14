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

export interface ResumoAvaliacao {
  /** O texto que a pessoa lê. Sempre presente quando a função devolve algo. */
  mensagem: string;
  avanco: string | null;
  atencao: string | null;
  /** Trechos citados pelo avaliador. Vazio quando a forma não os traz. */
  evidencias: string[];
}

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo ? limpo : null;
}

export function normalizarResumoAvaliacao(valor: unknown): ResumoAvaliacao | null {
  const comoTexto = texto(valor);
  if (comoTexto) return { mensagem: comoTexto, avanco: null, atencao: null, evidencias: [] };

  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;

  const bruto = valor as Record<string, unknown>;
  const mensagem = texto(bruto.mensagem_geral);
  const avanco = texto(bruto.principal_avanco);
  const atencao = texto(bruto.principal_ponto_de_atencao);
  const evidencias = Array.isArray(bruto.evidencias_citadas)
    ? bruto.evidencias_citadas.map(texto).filter((e): e is string => e != null)
    : [];

  // Sem mensagem não há resumo a mostrar: um objeto com só as evidências
  // renderizaria um bloco com título e nenhuma leitura.
  if (!mensagem) return null;
  return { mensagem, avanco, atencao, evidencias };
}
