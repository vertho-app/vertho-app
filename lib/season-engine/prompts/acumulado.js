/**
 * IA Acumuladora — lê as 13 semanas de evidências de uma temporada e
 * atribui uma nota 1.0-4.0 por descritor, ancorada na régua de maturidade.
 *
 * Rodada AUTOMATICAMENTE no fim da semana 13 (antes do colab responder
 * o cenário da sem 14). O scorer da sem 14 usa essa nota como referência
 * de "padrão da temporada" pra triangular com a resposta única ao cenário.
 */
export function promptAvaliacaoAcumulada({ competencia, descritores, evidenciasAcumuladas, nomeColab }) {
  const reguas = descritores.map(d => {
    const linhas = [`### ${d.descritor} (nota inicial: ${d.nota_atual})`];
    if (d.n1_gap) linhas.push(`  1.0 - Lacuna: ${d.n1_gap}`);
    if (d.n2_desenvolvimento) linhas.push(`  2.0 - Em desenvolvimento: ${d.n2_desenvolvimento}`);
    if (d.n3_meta) linhas.push(`  3.0 - Meta (proficiente): ${d.n3_meta}`);
    if (d.n4_referencia) linhas.push(`  4.0 - Referência (excelência): ${d.n4_referencia}`);
    if (!d.n1_gap && !d.n3_meta) linhas.push('  (sem régua cadastrada — use escala genérica 1-4)');
    return linhas.join('\n');
  }).join('\n\n');

  const system = `Você é um avaliador CRITERIOSO. Sua tarefa: ler as evidências acumuladas de 13 semanas de desenvolvimento de ${nomeColab} sobre "${competencia}" e atribuir uma NOTA POR DESCRITOR 1.0-4.0 ancorada na RÉGUA DE MATURIDADE fornecida.

REGRAS:
- Você NÃO tem cenário escrito nem resposta única — só histórico. Pontue o PADRÃO.
- Evidência de N3+ exige CONSISTÊNCIA em várias semanas (pelo menos 2-3 referências coerentes).
- Evidência de N1 basta 1 semana clara — dúvida puxa pra baixo.
- Valores intermediários (1.5, 2.5, 3.5) permitidos quando evidência é parcial.
- NUNCA infira além do que está literalmente nas evidências. Se descritor não tem registro, marque como "sem_evidencia" e use nota inicial como placeholder.
- Justificativa cita trechos LITERAIS das evidências + nível da régua.

Retorne APENAS JSON válido, sem markdown.`;

  const user = `COMPETÊNCIA: ${competencia}
COLABORADOR: ${nomeColab}

RÉGUA DE MATURIDADE (critério objetivo):
${reguas}

EVIDÊNCIAS ACUMULADAS NAS 13 SEMANAS (por descritor):
${evidenciasAcumuladas}

Retorne:
{
  "avaliacao_acumulada": [
${descritores.map(d => `    { "descritor": "${d.descritor}", "nota_inicial": ${d.nota_atual}, "nota_acumulada": 1.0-4.0, "nivel_rubrica": "lacuna | em_desenvolvimento | meta | referencia | sem_evidencia", "quantidade_referencias": "número de semanas onde o descritor apareceu", "tendencia": "ascendente | estavel | descendente | irregular", "justificativa": "2-3 frases citando trechos literais das evidências + referência à régua" }`).join(',\n')}
  ],
  "nota_media_acumulada": "média das nota_acumulada",
  "resumo_geral": "1 parágrafo sobre o padrão observado na temporada (consistência, variação, zonas fortes/fracas)"
}`;
  return { system, user };
}

/**
 * Check por 2ª IA da avaliação acumulada. Igual ao check-ia4 do mapeamento.
 */
export function promptAvaliacaoAcumuladaCheck({ competencia, descritores, evidenciasAcumuladas, avaliacaoPrimaria }) {
  const system = `Você é um auditor de qualidade de avaliação acumulada de competências. Verifica se a pontuação dada por outra IA ao "padrão da temporada" é DEFENSÁVEL.

FILOSOFIA:
- NÃO refaça a avaliação. Verifique se é RAZOÁVEL.
- Diferenças de ±0.5 por descritor são ACEITÁVEIS (margem de interpretação).
- Avaliações imperfeitas mas razoáveis → nota 85-95.
- Reserve nota <70 para erros objetivos.

Dimensões (25pts cada = 100pts):

1. ANCORAGEM NA RÉGUA (25pts)
   - A nota_acumulada tem evidência textual? Ou foi inventada?
   - Nível bate com os trechos citados?

2. CONSISTÊNCIA DO PADRÃO (25pts)
   - Se nota é N3+, tem ao menos 2 referências coerentes nas semanas?
   - Nota N1 com várias evidências positivas = erro grave.
   - Tendência (ascendente/estável/descendente) faz sentido?

3. QUALIDADE DA JUSTIFICATIVA (25pts)
   - Cita trechos literais? Parafrase só vale se fiel.
   - Justificativa genérica = erro grave.

4. TRATAMENTO DE DESCRITORES SEM EVIDÊNCIA (25pts)
   - Descritores sem registro foram marcados como "sem_evidencia"?
   - Nota inventada pra descritor sem evidência = erro grave.

Retorne APENAS JSON, sem markdown.`;

  const reguas = descritores.map(d => `### ${d.descritor} (inicial: ${d.nota_atual})\n  1: ${d.n1_gap || '-'}\n  2: ${d.n2_desenvolvimento || '-'}\n  3: ${d.n3_meta || '-'}\n  4: ${d.n4_referencia || '-'}`).join('\n\n');

  const user = `COMPETÊNCIA: ${competencia}

RÉGUA:
${reguas}

EVIDÊNCIAS ACUMULADAS (13 semanas):
${evidenciasAcumuladas}

AVALIAÇÃO ACUMULADA PRIMÁRIA:
${JSON.stringify(avaliacaoPrimaria, null, 2)}

Retorne:
{
  "nota_auditoria": 0-100,
  "status": "aprovado | revisar",
  "ajustes_sugeridos": [
    { "descritor": "nome", "nota_acumulada_sugerida": 1.0-4.0, "motivo": "por que ajustar" }
  ],
  "alertas": ["observações críticas, ou [] se aprovado"],
  "resumo_auditoria": "1-2 frases"
}

"status" = "aprovado" se nota_auditoria >= 90 E ajustes_sugeridos vazio.`;

  return { system, user };
}
