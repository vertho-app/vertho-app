/**
 * Prompt executivo do Fit v2 — gera uma leitura de 4-6 linhas para o gestor,
 * a partir do resultado já calculado pela engine (calcularFit).
 *
 * Entrada: objeto resultado do fit (com `blocos`, `gap_analysis`, `fit_final`
 * etc — mesmo shape retornado por `calcularFit` / `loadRankingCargo`).
 * Saída: string prompt para o LLM.
 *
 * O LLM deve responder APENAS com o texto final (não JSON).
 */
export function buildFitExecutivePrompt({ resultado, cargoNome }) {
  const {
    fit_final,
    classificacao,
    recomendacao,
    blocos = {},
    gap_analysis = {},
    colaborador = {},
  } = resultado || {};

  const blocosLinhas = Object.entries(blocos)
    .map(([k, v]) => {
      const score = v?.score != null ? Number(v.score).toFixed(0) : '—';
      const peso = v?.peso != null ? Math.round(Number(v.peso) * 100) : null;
      const pesoTxt = peso != null ? ` · peso ${peso}%` : '';
      return `- ${k}: ${score}${pesoTxt}`;
    })
    .join('\n');

  const gaps = (gap_analysis.top_gaps || []).slice(0, 5).map((g, i) => {
    const faixa = g.faixa ? ` (faixa ideal ${g.faixa})` : '';
    const trat = g.tratabilidade ? ` — ${g.tratabilidade}` : '';
    return `${i + 1}. ${g.nome}: ${g.valorReal ?? '—'}${faixa}${trat}`;
  }).join('\n') || '- (nenhum gap relevante)';

  const forcas = (gap_analysis.top_forcas || []).slice(0, 5).map((f, i) => {
    return `${i + 1}. ${f.nome}: ${f.valorReal ?? f.score ?? '—'}`;
  }).join('\n') || '- (sem forças destacadas)';

  const excessos = (gap_analysis.alertas_excesso || []).slice(0, 3).map(a => {
    return `- ${a.alerta || a.nome}`;
  }).join('\n') || '- (nenhum)';

  const nome = colaborador.nome || 'O colaborador';
  const firstName = nome.split(' ')[0];

  return `Você é um consultor sênior de desenvolvimento humano analisando a aderência de um colaborador a um cargo específico. Escreva uma leitura executiva objetiva para o gestor da área.

CARGO ALVO: ${cargoNome}
COLABORADOR: ${nome}

RESULTADO DO FIT v2:
- Fit Final: ${fit_final}/100
- Classificação: ${classificacao}
- Recomendação do modelo: ${recomendacao}

SCORES POR BLOCO:
${blocosLinhas}

TOP GAPS (prioridade decrescente):
${gaps}

TOP FORÇAS:
${forcas}

ALERTAS DE EXCESSO:
${excessos}

REGRAS:
1. Escreva 4 a 6 linhas (no máximo ~90 palavras).
2. Tom profissional, direto, acionável — você está falando para um gestor que precisa decidir.
3. Use o primeiro nome (${firstName}), não o nome completo.
4. Estruture assim:
   - Linha 1: síntese do fit (score + quadro geral).
   - Linha 2: principais forças (2-3 itens concretos).
   - Linha 3-4: principais gaps e o que eles significam no dia a dia do cargo.
   - Linha final: recomendação acionável (um de: "aderente e pronto", "desenvolvimento focado com PDI", "risco — avaliar realocação").
5. NÃO use bullet points, escreva em parágrafo corrido.
6. NÃO repita os números do Fit no texto mais de uma vez — interprete-os.
7. NÃO invente informações que não estão nos dados acima.
8. Responda APENAS com o texto final — sem título, sem markdown, sem aspas.`;
}
