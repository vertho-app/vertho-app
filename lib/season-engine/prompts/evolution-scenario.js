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
function tomDevolutivaPorPerfil(perfil) {
  const p = (perfil || '').toLowerCase();
  if (p.includes('d')) return 'Direto, objetivo. Nomeie resultado/ação específica. Evite floreios.';
  if (p.includes('i')) return 'Caloroso, reconheça esforço. Valide emoção sem enfeitar.';
  if (p.includes('s')) return 'Sereno, paciente. Reforce consistência e pontos sólidos antes de gaps.';
  if (p.includes('c')) return 'Estruturado, preciso. Explique critério e cite evidência literal.';
  return 'Tom neutro acolhedor.';
}

export function promptEvolutionScenarioScore({ competencia, descritores, cenario, resposta, nomeColab, perfilDominante, evidenciasAcumuladas, acumuladoPrimaria }) {
  const tomDevol = tomDevolutivaPorPerfil(perfilDominante);
  const system = `Você é um avaliador rigoroso e CRITERIOSO. A avaliação da semana 14 é o PONTO DE CHEGADA de uma temporada de 13 semanas — você NUNCA pontua só pela resposta ao cenário. Pontua pela TRIANGULAÇÃO da resposta com toda a evidência acumulada.

REGRAS OBJETIVAS (pontuação não varia por perfil, cargo ou estilo):
- Ancore EXCLUSIVAMENTE na RÉGUA DE MATURIDADE fornecida. Nada de julgamento livre.
- Valores intermediários (1.5, 2.5, 3.5) quando entre 2 níveis.
- Regressão (nota_pos < nota_pre) é possível — não force evolução.
- Nomeie explicitamente o delta vs mapeamento inicial: "evoluiu de X para Y" / "manteve em X" / "regrediu de X para Y".

COMO PONDERAR RESPOSTA AO CENÁRIO × EVIDÊNCIA ACUMULADA:
A evidência acumulada (13 semanas) tem PESO MAIOR que a resposta única ao cenário. Regra:

1. **CONSISTENTE** (cenário e acumulado apontam pro mesmo nível, diferença ≤ 0.5):
   → nota_pos = nível consolidado. "consistencia_com_acumulado": "consistente".

2. **DIVERGENTE — CENÁRIO SUPERIOR** (cenário sugere X, acumulado sugere X-1 ou menor):
   → Uma resposta escrita pode ser preparada/ensaiada. Não espelha padrão real.
   → Puxa a nota pra PERTO DO ACUMULADO, com pequena elevação (0.3-0.5) se o cenário for robusto.
   → "consistencia_com_acumulado": "divergente_cenario_superior". Justificativa EXPLICITA: "cenário mostrou X, mas evidência das 13 semanas aponta Y — por isso a nota pondera".

3. **DIVERGENTE — CENÁRIO INFERIOR** (cenário sugere X, acumulado sugere X+1 ou mais):
   → Resposta pode ter sido feita com pouco tempo/cansaço. Não apaga a evidência.
   → Puxa pra PERTO DO ACUMULADO, com pequena redução (0.3-0.5) se o cenário for claramente fraco.
   → "consistencia_com_acumulado": "divergente_cenario_inferior". Justificativa explicita.

4. **SEM EVIDÊNCIA ACUMULADA** (descritor sem registros nas 13 semanas):
   → Use APENAS cenário + régua. "consistencia_com_acumulado": "consistente" (com nota "sem_acumulado").

REGRAS DURAS (pisos e tetos):
- 4.0 só se acumulado E cenário demonstram claramente o comportamento de referência. Nunca só pelo cenário.
- Se acumulado mostra N1-2 em TODAS as semanas, nota_pos ≤ 2.5 independente do cenário.
- Se acumulado mostra N3 consistente em pelo menos 3 semanas, nota_pos ≥ 2.5 independente do cenário fraco.
- Cite trecho literal da resposta + trecho de evidência acumulada + nível da régua na justificativa.

REGRA PARA O resumo_avaliacao (devolutiva pro colab):
- Tom adaptado ao perfil DISC: ${tomDevol}
- Cite pelo menos 1 evidência das 13 semanas além do cenário (ex: "Na sem 5 você relatou X, isso reforça...").
- Conteúdo NUNCA muda por perfil — o que muda é a forma de dizer.

Retorne APENAS JSON válido, sem markdown.`;

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

RESPOSTA DE ${nomeColab} AO CENÁRIO:
"${resposta}"

RÉGUA DE MATURIDADE (use como critério OBJETIVO):
${reguas}

${acumuladoPrimaria ? `AVALIAÇÃO ACUMULADA (1ª IA já calculou a nota por descritor baseada nas 13 semanas — USE ISSO como referência de padrão da temporada):
${JSON.stringify(acumuladoPrimaria, null, 2)}

` : ''}EVIDÊNCIAS BRUTAS DAS 13 SEMANAS (pra triangular quando precisar):
${evidenciasAcumuladas || '(sem evidências registradas)'}

REGRAS DE PONTUAÇÃO:
- Compare a resposta de ${nomeColab} com os comportamentos descritos na régua
- Aceite valores intermediários (1.5, 2.5, 3.5) quando o comportamento está entre 2 níveis
- Justificativa DEVE citar trecho específico da resposta + referenciar o nível da régua
- Seja rigoroso: 4.0 só se demonstrou claramente o comportamento de referência

Retorne JSON:
{
  "avaliacao_por_descritor": [
${descritores.map(d => `    { "descritor": "${d.descritor}", "nota_pre": ${d.nota_atual}, "nota_pos": 1.0-4.0, "delta": "número (nota_pos - nota_pre)", "classificacao": "evoluiu | manteve | regrediu", "nivel_rubrica": "lacuna | em_desenvolvimento | meta | referencia", "consistencia_com_acumulado": "consistente | divergente_cenario_superior | divergente_cenario_inferior", "justificativa": "cite trecho literal da resposta + trecho da evidência acumulada + nível da régua + mencione explicitamente a evolução/manutenção/regressão vs mapeamento inicial (${d.nota_atual})" }`).join(',\n')}
  ],
  "nota_media_pre": "número (média das nota_pre)",
  "nota_media_pos": "número (média das nota_pos)",
  "delta_medio": "nota_media_pos - nota_media_pre",
  "resumo_avaliacao": "1 parágrafo com devolutiva pra ${nomeColab}, no tom DISC, citando deltas reais da tabela acima"
}`;
  return { system, user };
}
