/**
 * Semana 14 — cenário final que integra todos os descritores da temporada.
 * Após resposta, a IA pontua cada descritor de 1.0 a 4.0.
 */
export function promptEvolutionScenarioGen({ competencia, descritores, cargo, contexto }) {
  const system = `Você é um designer de casos para avaliação final de competências. Cria cenário REALISTA que força escolhas difíceis e integra múltiplos descritores.`;
  const user = `Crie o CENÁRIO FINAL de uma temporada de 14 semanas para avaliar TODOS os descritores abaixo integrados numa única situação.

CONTEXTO:
- Cargo: ${cargo}
- Setor: ${contexto}
- Competência: ${competencia}
- Descritores avaliados: ${descritores.map(d => d.descritor).join(', ')}

COMPLEXIDADE: COMPLETO
- 1 tensão central
- 1 fator complicador
- 1 dilema ético embutido
- 2 stakeholders nomeados com posições conflitantes

REGRAS:
1. Teste da resposta genérica: se "conversaria com todos e buscaria consenso" funciona, o cenário está fraco
2. Força escolhas reais
3. Todos os descritores devem ter relevância prática na situação

FORMATO MARKDOWN:

## [Título impactante]

**Contexto:** [3-4 linhas]

**Tensão central:** [1-2 linhas]

**Fator complicador:** [1-2 linhas]

**Dilema ético:** [1 linha]

**Stakeholders:**
- **[Nome]** ([papel]): [posição]
- **[Nome]** ([papel]): [posição]

**Como você conduziria esta situação, considerando TODOS os aspectos acima?**

Retorne APENAS o markdown do cenário.`;
  return { system, user };
}

/**
 * Avalia a resposta do colaborador, pontuando cada descritor ancorado
 * na régua de maturidade (n1_gap, n2_desenvolvimento, n3_meta, n4_referencia).
 *
 * @param {Array} descritores - [{descritor, nota_atual, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia}]
 */
export function promptEvolutionScenarioScore({ competencia, descritores, cenario, resposta, nomeColab }) {
  const system = `Você é um avaliador rigoroso e CRITERIOSO. Pontue cada descritor ancorado na RÉGUA DE MATURIDADE observável fornecida — NÃO julgue livremente. Retorne APENAS JSON válido, sem markdown.`;

  const reguas = descritores.map(d => {
    const linhas = [`### ${d.descritor} (nota inicial: ${d.nota_atual})`];
    if (d.n1_gap) linhas.push(`  1.0 - Lacuna: ${d.n1_gap}`);
    if (d.n2_desenvolvimento) linhas.push(`  2.0 - Em desenvolvimento: ${d.n2_desenvolvimento}`);
    if (d.n3_meta) linhas.push(`  3.0 - Meta (proficiente): ${d.n3_meta}`);
    if (d.n4_referencia) linhas.push(`  4.0 - Referência (excelência): ${d.n4_referencia}`);
    if (!d.n1_gap && !d.n3_meta) linhas.push('  (sem régua cadastrada — use escala genérica 1-4)');
    return linhas.join('\n');
  }).join('\n\n');

  const user = `COMPETÊNCIA: ${competencia}

CENÁRIO:
${cenario}

RESPOSTA DE ${nomeColab}:
"${resposta}"

RÉGUA DE MATURIDADE (use como critério OBJETIVO):
${reguas}

REGRAS DE PONTUAÇÃO:
- Compare a resposta de ${nomeColab} com os comportamentos descritos na régua
- Aceite valores intermediários (1.5, 2.5, 3.5) quando o comportamento está entre 2 níveis
- Justificativa DEVE citar trecho específico da resposta + referenciar o nível da régua
- Seja rigoroso: 4.0 só se demonstrou claramente o comportamento de referência

Retorne JSON:
{
  "avaliacao_por_descritor": [
${descritores.map(d => `    { "descritor": "${d.descritor}", "nota_pre": ${d.nota_atual}, "nota_pos": 1.0-4.0, "nivel_rubrica": "lacuna | em_desenvolvimento | meta | referencia", "justificativa": "cite trecho + nível da régua" }`).join(',\n')}
  ],
  "nota_media_pos": "número (média)",
  "resumo_avaliacao": "1 parágrafo com devolutiva pra ${nomeColab}"
}`;
  return { system, user };
}
