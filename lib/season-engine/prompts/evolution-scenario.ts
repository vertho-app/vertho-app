/**
 * Semana 14 — cenário final que integra todos os descritores da temporada.
 * Após resposta, a IA pontua cada descritor por TRIANGULAÇÃO.
 */
interface DescritorRubrica {
  descritor: string;
  nota_atual?: number;
  n1_gap?: string;
  n2_desenvolvimento?: string;
  n3_meta?: string;
  n4_referencia?: string;
}

interface PromptEvolutionScenarioGenParams {
  competencia: string;
  descritores: DescritorRubrica[];
  cargo: string;
  contexto: string;
}

export function promptEvolutionScenarioGen({ competencia, descritores, cargo, contexto }: PromptEvolutionScenarioGenParams) {
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

function tomDevolutivaPorPerfil(perfil: string | null | undefined): string {
  const p = (perfil || '').toLowerCase();
  if (p.includes('d')) return 'Direto, objetivo. Nomeie resultado/ação específica. Evite floreios.';
  if (p.includes('i')) return 'Caloroso, reconheça esforço. Valide emoção sem enfeitar.';
  if (p.includes('s')) return 'Sereno, paciente. Reforce consistência e pontos sólidos antes de gaps.';
  if (p.includes('c')) return 'Estruturado, preciso. Explique critério e cite evidência literal.';
  return 'Tom neutro acolhedor.';
}

interface PromptEvolutionScenarioScoreParams {
  competencia: string;
  descritores: DescritorRubrica[];
  cenario: string;
  resposta: string;
  nomeColab: string;
  perfilDominante?: string | null;
  evidenciasAcumuladas?: string;
  acumuladoPrimaria?: unknown;
}

export function promptEvolutionScenarioScore({ competencia, descritores, cenario, resposta, nomeColab, perfilDominante, evidenciasAcumuladas, acumuladoPrimaria }: PromptEvolutionScenarioScoreParams) {
  const tomDevol = tomDevolutivaPorPerfil(perfilDominante);
  const system = `Você é um avaliador rigoroso e criterioso da Vertho.

Sua tarefa é calcular a AVALIAÇÃO FINAL da semana 14 por TRIANGULAÇÃO.

ATENÇÃO:
A semana 14 é o ponto de chegada.
Você NUNCA pontua só pela resposta ao cenário.
Você pontua pela triangulação entre:
- nota pré (baseline)
- avaliação acumulada das 13 semanas
- resposta ao cenário
- evidências acumuladas da temporada

OBJETIVO CENTRAL:
Determinar, por descritor, qual é a leitura final mais defensável do estado atual do colaborador, após a jornada completa.

PRINCÍPIOS INEGOCIÁVEIS:
1. Ancore EXCLUSIVAMENTE na régua de maturidade.
2. Use granularidade 0.1 (ex: 1.8, 2.3, 2.7).
3. Regressão é possível — não force evolução.
4. Evidência demonstrada pesa mais do que fala bonita.
5. Resposta ao cenário NÃO invalida automaticamente o acumulado.
6. Acumulado forte NÃO pode ser ignorado por um cenário fraco isolado.
7. Cenário muito bom, mas isolado, NÃO pode gerar nota final inflada sem sustentação.
8. DISC altera só o tom da devolutiva, nunca a nota.
9. Toda justificativa deve citar evidência do cenário + evidência acumulada + leitura da régua.

PONDERAÇÃO RESPOSTA × ACUMULADO:

1. CONSISTENTE (cenário e acumulado diferem ≤ 0.5):
   → nota_pos = nível consolidado coerente entre as duas fontes.

2. DIVERGENTE CENÁRIO SUPERIOR (cenário bem acima do acumulado):
   → Risco de resposta ensaiada/formulação pontual.
   → Puxa pra PERTO DO ACUMULADO com pequena elevação (0.3-0.5) se cenário for robusto.
   → Justificativa EXPLÍCITA.

3. DIVERGENTE CENÁRIO INFERIOR (cenário bem abaixo do acumulado):
   → Risco de cansaço/pressa/nervosismo.
   → Puxa pra PERTO DO ACUMULADO com pequena redução (0.3-0.5) se cenário for claramente fraco.
   → Justificativa EXPLÍCITA.

4. SEM EVIDÊNCIA ACUMULADA:
   → Use cenário + régua com prudência.
   → Explicite fragilidade metodológica.

REGRAS DURAS:
- 4.0 só se acumulado E cenário sustentarem referência.
- Acumulado N1-2 consistente → nota_pos ≤ 2.5 independente do cenário.
- Acumulado N3 consistente (3+ semanas) → nota_pos ≥ 2.5 independente do cenário fraco.

DEVOLUTIVA (resumo_avaliacao):
- Tom adaptado ao DISC: ${tomDevol}
- Conteúdo NUNCA muda por perfil — o que muda é a forma.
- Cite ao menos 1 evidência das 13 semanas além do cenário.
- Seja honesto, construtivo e não inflado.

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto antes ou depois.`;

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

RÉGUA DE MATURIDADE (critério OBJETIVO):
${reguas}

${acumuladoPrimaria ? `AVALIAÇÃO ACUMULADA (padrão das 13 semanas — USE como referência):
${JSON.stringify(acumuladoPrimaria, null, 2)}

` : ''}EVIDÊNCIAS DAS 13 SEMANAS (pra triangular):
${evidenciasAcumuladas || '(sem evidências registradas)'}

EXTRAIA o JSON abaixo com base na TRIANGULAÇÃO:
{
  "avaliacao_por_descritor": [
${descritores.map(d => `    {
      "descritor": "${d.descritor}",
      "nota_pre": ${d.nota_atual},
      "nota_acumulada": null,
      "nota_cenario": 1.0-4.0,
      "nota_pos": 1.0-4.0,
      "delta": 0.0,
      "classificacao": "evoluiu|manteve|regrediu",
      "nivel_rubrica": "lacuna|em_desenvolvimento|meta|referencia",
      "consistencia_com_acumulado": "consistente|divergente_cenario_superior|divergente_cenario_inferior|sem_evidencia_acumulada",
      "justificativa": "cite trecho do cenário + evidência acumulada + régua",
      "trecho_cenario": "trecho curto da resposta",
      "evidencia_acumulada": "trecho curto ou síntese fiel das 13 semanas",
      "limites_da_leitura": ["limite 1"]
    }`).join(',\n')}
  ],
  "nota_media_pre": 0.0,
  "nota_media_acumulada": 0.0,
  "nota_media_cenario": 0.0,
  "nota_media_pos": 0.0,
  "delta_medio": 0.0,
  "resumo_avaliacao": {
    "mensagem_geral": "devolutiva honesta e construtiva para ${nomeColab}",
    "evidencias_citadas": ["evidência 1", "evidência 2"],
    "principal_avanco": "texto curto",
    "principal_ponto_de_atencao": "texto curto"
  },
  "alertas_metodologicos": ["alerta 1"]
}

REGRAS:
- nota_cenario = nota baseada SOMENTE na resposta ao cenário + régua
- nota_pos = nota FINAL triangulada (cenário + acumulado + evidências)
- nota_acumulada = preencha com o valor da avaliação acumulada fornecida, ou null
- delta = nota_pos - nota_pre
- classificacao: evoluiu se delta > 0.3, regrediu se delta < -0.3, manteve se entre
- trecho_cenario e evidencia_acumulada devem ser curtos e fiéis
- limites_da_leitura: quando a triangulação tiver fragilidade
- alertas_metodologicos: divergências, base fraca, inflação
- Não force todos os descritores a evoluir`;

  return { system, user };
}

const CLASSIFICACOES = ['evoluiu', 'manteve', 'regrediu'];
const NIVEIS = ['lacuna', 'em_desenvolvimento', 'meta', 'referencia'];
const CONSISTENCIAS = ['consistente', 'divergente_cenario_superior', 'divergente_cenario_inferior', 'sem_evidencia_acumulada'];

export function validateEvolutionScenarioScore(parsed: any): any {
  if (!Array.isArray(parsed.avaliacao_por_descritor)) parsed.avaliacao_por_descritor = [];
  parsed.avaliacao_por_descritor = parsed.avaliacao_por_descritor.map((d: any) => {
    const clamp = (v: any) => v != null && typeof v === 'number' ? Math.max(1, Math.min(4, Math.round(v * 10) / 10)) : null;
    const nota_pre = clamp(d.nota_pre);
    const nota_pos = clamp(d.nota_pos);
    const delta = nota_pre != null && nota_pos != null ? Math.round((nota_pos - nota_pre) * 10) / 10 : null;
    return {
      descritor: d.descritor || '',
      nota_pre,
      nota_acumulada: clamp(d.nota_acumulada),
      nota_cenario: clamp(d.nota_cenario),
      nota_pos,
      delta,
      classificacao: CLASSIFICACOES.includes(d.classificacao) ? d.classificacao : (delta != null ? (delta > 0.3 ? 'evoluiu' : delta < -0.3 ? 'regrediu' : 'manteve') : 'manteve'),
      nivel_rubrica: NIVEIS.includes(d.nivel_rubrica) ? d.nivel_rubrica : 'em_desenvolvimento',
      consistencia_com_acumulado: CONSISTENCIAS.includes(d.consistencia_com_acumulado) ? d.consistencia_com_acumulado : 'consistente',
      justificativa: d.justificativa || '',
      trecho_cenario: d.trecho_cenario || '',
      evidencia_acumulada: d.evidencia_acumulada || '',
      limites_da_leitura: Array.isArray(d.limites_da_leitura) ? d.limites_da_leitura : [],
    };
  });
  const avg = (key: string) => {
    const vals = parsed.avaliacao_por_descritor.map((d: any) => d[key]).filter((v: any) => v != null);
    return vals.length ? Math.round((vals.reduce((a: number, b: number) => a + b, 0) / vals.length) * 10) / 10 : null;
  };
  if (typeof parsed.nota_media_pre !== 'number') parsed.nota_media_pre = avg('nota_pre');
  if (typeof parsed.nota_media_acumulada !== 'number') parsed.nota_media_acumulada = avg('nota_acumulada');
  if (typeof parsed.nota_media_cenario !== 'number') parsed.nota_media_cenario = avg('nota_cenario');
  if (typeof parsed.nota_media_pos !== 'number') parsed.nota_media_pos = avg('nota_pos');
  if (typeof parsed.delta_medio !== 'number') {
    parsed.delta_medio = parsed.nota_media_pre != null && parsed.nota_media_pos != null
      ? Math.round((parsed.nota_media_pos - parsed.nota_media_pre) * 10) / 10 : null;
  }
  if (parsed.resumo_avaliacao && typeof parsed.resumo_avaliacao === 'object') {
    parsed.resumo_avaliacao = {
      mensagem_geral: parsed.resumo_avaliacao.mensagem_geral || '',
      evidencias_citadas: Array.isArray(parsed.resumo_avaliacao.evidencias_citadas) ? parsed.resumo_avaliacao.evidencias_citadas : [],
      principal_avanco: parsed.resumo_avaliacao.principal_avanco || '',
      principal_ponto_de_atencao: parsed.resumo_avaliacao.principal_ponto_de_atencao || '',
    };
  } else if (typeof parsed.resumo_avaliacao === 'string') {
    parsed.resumo_avaliacao = {
      mensagem_geral: parsed.resumo_avaliacao,
      evidencias_citadas: [],
      principal_avanco: '',
      principal_ponto_de_atencao: '',
    };
  } else {
    parsed.resumo_avaliacao = {
      mensagem_geral: '',
      evidencias_citadas: [],
      principal_avanco: '',
      principal_ponto_de_atencao: '',
    };
  }
  if (!Array.isArray(parsed.alertas_metodologicos)) parsed.alertas_metodologicos = [];
  return parsed;
}
