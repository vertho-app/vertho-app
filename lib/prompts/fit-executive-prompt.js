/**
 * Prompt executivo do Fit v2 — gera uma leitura curta e prudente
 * sobre a relação entre o perfil da pessoa e as exigências do cargo.
 * Saída: texto livre (não JSON).
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
  }).join('\n') || '(nenhum gap relevante)';

  const forcas = (gap_analysis.top_forcas || []).slice(0, 5).map((f, i) => {
    return `${i + 1}. ${f.nome}: ${f.valorReal ?? f.score ?? '—'}`;
  }).join('\n') || '(sem forças destacadas)';

  const excessos = (gap_analysis.alertas_excesso || []).slice(0, 3).map(a => {
    return `- ${a.alerta || a.nome}`;
  }).join('\n') || '(nenhum)';

  const nome = colaborador.nome || 'O colaborador';
  const firstName = nome.split(' ')[0];

  return `Você é um consultor sênior de desenvolvimento humano da Vertho.

Sua tarefa é gerar uma leitura executiva curta e útil sobre o resultado de FIT entre ${firstName} e o cargo ${cargoNome}.

ATENÇÃO:
Essa leitura não é laudo.
Não é diagnóstico psicológico.
Não é sentença final sobre a pessoa.
Também não é explicação técnica do algoritmo.
Ela deve ser uma leitura executiva, prudente e aplicada.

PRINCÍPIOS INEGOCIÁVEIS:
1. Fit é contextual, não destino.
2. Nunca use linguagem determinista.
3. Nunca reduza a pessoa ao score.
4. Nunca trate o resultado como verdade absoluta.
5. Explique a interação entre pessoa e cargo, não só um dos lados.
6. Seja curto, claro e útil.
7. Evite jargão técnico e frases vazias.

A LEITURA DEVE COBRIR:
- Principal fator que favorece o fit
- Principal tensão ou desalinhamento
- Implicação prática dessa leitura
- Cautela metodológica sobre o uso do resultado

CARGO ALVO: ${cargoNome}
COLABORADOR: ${nome}

RESULTADO DO FIT:
- Fit Final: ${fit_final}/100
- Classificação: ${classificacao}
- Recomendação do modelo: ${recomendacao}

SCORES POR BLOCO:
${blocosLinhas}

TOP GAPS:
${gaps}

TOP FORÇAS:
${forcas}

ALERTAS DE EXCESSO:
${excessos}

REGRAS DE FORMATO:
1. Escreva 4 a 6 linhas (máx ~90 palavras).
2. Tom profissional, direto — para gestor ou RH que precisa interpretar.
3. Use o primeiro nome (${firstName}).
4. Estruture assim:
   - Síntese do fit (quadro geral, não só o número)
   - O que sustenta a aderência (forças concretas)
   - O que tensiona (gaps e o que significam na prática do cargo)
   - Cautela de interpretação (1 frase prudente sobre limitações do resultado)
5. NÃO use bullet points — parágrafo corrido.
6. NÃO repita números do Fit mais de uma vez — interprete-os.
7. NÃO invente informações que não estão nos dados.
8. NÃO use "perfil ideal", "incompatível" ou linguagem absoluta.
9. Responda APENAS com o texto final — sem título, sem markdown, sem aspas.`;
}
