/**
 * As perguntas de um Cenário B, lidas de `banco_cenarios.alternativas`.
 *
 * Módulo PURO (sem imports) de propósito: a tela do admin (componente de cliente)
 * lê as mesmas perguntas que a rota do fechamento serve, e `cenario-b.ts` puxa o
 * banco de degradação, que não pode ir para o bundle do browser.
 */

/**
 * Rótulo (dimensão) das quatro perguntas do B por célula, na ordem em que a pessoa
 * responde. É o que a rota serve e o scorer lê como `[DIMENSÃO] pergunta`.
 */
const ROTULOS_DO_B_POR_CELULA: Record<string, string> = { p1: 'SITUAÇÃO', p2: 'AÇÃO', p3: 'RACIOCÍNIO', p4: 'AUTOSSENSIBILIDADE' };

export interface PerguntaDoCenarioB {
  /** Chave em `alternativas` (`p1`, `p2`, ...). */
  chave: string;
  dimensao: string;
  texto: string;
}

/**
 * As perguntas de um B, na ordem de resposta: TODAS as chaves `pN` de
 * `alternativas` com texto, e não só `p1` a `p4`.
 *
 * O B por célula tem quatro (situação, ação, raciocínio, autossensibilidade). O
 * integrador do Onboarding tem uma POR COMPETÊNCIA (cinco, no desenho de hoje), e
 * `alternativas.competencia_por_pergunta` diz de qual cada uma é: esse nome vira a
 * dimensão que a pessoa vê e que o scorer lê junto da resposta. Fonte única da
 * rota do fechamento, da escolha (`cenarioBUsavel`) e da tela do admin: três
 * leituras de "quantas perguntas tem este B" divergiam no número 4.
 */
export function perguntasDoCenarioB(alternativas: any): PerguntaDoCenarioB[] {
  const alt = alternativas && typeof alternativas === 'object' && !Array.isArray(alternativas) ? alternativas : {};
  const porCompetencia = alt.competencia_por_pergunta && typeof alt.competencia_por_pergunta === 'object' ? alt.competencia_por_pergunta : {};
  const achadas: Array<{ chave: string; n: number }> = [];
  for (const chave of Object.keys(alt)) {
    const m = /^p([1-9]\d?)$/.exec(chave);
    if (m && String(alt[chave] ?? '').trim().length > 0) achadas.push({ chave, n: Number(m[1]) });
  }
  return achadas
    .sort((a, b) => a.n - b.n)
    .map(({ chave, n }) => {
      const doIntegrador = typeof porCompetencia[chave] === 'string' ? porCompetencia[chave].trim() : '';
      return { chave, dimensao: doIntegrador || ROTULOS_DO_B_POR_CELULA[chave] || `P${n}`, texto: alt[chave] };
    });
}
