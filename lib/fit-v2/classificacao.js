// ── Classificação e Recomendação do Fit v2 ──────────────────────────────────

const FAIXAS = [
  { min: 85, max: 100, classificacao: 'Aderência Excelente', recomendacao: 'Aderente' },
  { min: 70, max: 84.99, classificacao: 'Aderência Alta', recomendacao: 'Aderente com PDI leve' },
  { min: 50, max: 69.99, classificacao: 'Aderência Razoável', recomendacao: 'Desenvolvimento' },
  { min: 30, max: 49.99, classificacao: 'Aderência Baixa', recomendacao: 'Risco' },
  { min: 0, max: 29.99, classificacao: 'Aderência Crítica', recomendacao: 'Não recomendado' },
];

export function classificar(fitFinal) {
  const score = Math.round(fitFinal * 10) / 10; // 1 casa decimal
  for (const faixa of FAIXAS) {
    if (score >= faixa.min) {
      return { classificacao: faixa.classificacao, recomendacao: faixa.recomendacao };
    }
  }
  return { classificacao: 'Aderência Crítica', recomendacao: 'Não recomendado' };
}

export function getFaixaDistribuicao(fitFinal) {
  if (fitFinal >= 85) return 'excelente';
  if (fitFinal >= 70) return 'alta';
  if (fitFinal >= 50) return 'razoavel';
  if (fitFinal >= 30) return 'baixa';
  return 'critica';
}

// ── Leitura executiva textual ───────────────────────────────────────────────

export function gerarLeituraExecutiva(resultado) {
  const { fit_final, blocos, gap_analysis } = resultado;
  const { classificacao } = classificar(fit_final);

  // Bloco mais forte e mais fraco
  const blocosArr = Object.entries(blocos).map(([k, v]) => ({ nome: k, score: v.score }));
  blocosArr.sort((a, b) => b.score - a.score);
  const maisForte = blocosArr[0];
  const maisFraco = blocosArr[blocosArr.length - 1];

  const nomesBlocos = { mapeamento: 'mapeamento comportamental', competencias: 'competências', lideranca: 'liderança', disc: 'perfil DISC' };

  const forcas = gap_analysis?.forcas || [];
  const gaps = gap_analysis?.top_gaps || [];

  let texto = '';

  if (fit_final >= 85) {
    texto = `Alta aderência para o cargo, com destaque em ${nomesBlocos[maisForte.nome] || maisForte.nome}`;
    if (forcas.length) texto += `. Pontos fortes: ${forcas.slice(0, 3).map(f => f.nome).join(', ')}`;
    texto += '.';
  } else if (fit_final >= 70) {
    texto = `Boa aderência ao cargo, com potencial de desenvolvimento`;
    if (maisFraco.score < 60) texto += `. Atenção em ${nomesBlocos[maisFraco.nome] || maisFraco.nome} (${maisFraco.score.toFixed(0)}pts)`;
    if (gaps.length) texto += `. Gaps principais: ${gaps.slice(0, 2).map(g => g.nome).join(', ')}`;
    texto += '.';
  } else if (fit_final >= 50) {
    texto = `Aderência razoável, com bom potencial porém com gaps`;
    if (gaps.length) texto += ` em ${gaps.slice(0, 3).map(g => g.nome).join(', ')}`;
    texto += `. Bloco mais fraco: ${nomesBlocos[maisFraco.nome] || maisFraco.nome} (${maisFraco.score.toFixed(0)}pts).`;
  } else if (fit_final >= 30) {
    texto = `Baixa aderência estrutural ao cargo. Necessidade de desenvolvimento extensivo`;
    if (gaps.length) texto += `, especialmente em ${gaps.slice(0, 2).map(g => g.nome).join(' e ')}`;
    texto += '.';
  } else {
    texto = `Aderência crítica ao cargo. Sugere-se reavaliação de posicionamento ou programa de desenvolvimento intensivo.`;
  }

  return texto;
}
