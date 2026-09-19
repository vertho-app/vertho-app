/**
 * Semana 14 — cenário final que integra todos os descritores da temporada.
 * Após resposta, a IA pontua cada descritor por TRIANGULAÇÃO.
 */
import { nivelDaNota } from '@/lib/nivel-regua';
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

export function tomDevolutivaPorPerfil(perfil: string | null | undefined): string {
  const p = (perfil || '').toLowerCase();
  if (p.includes('d')) return 'Direto, objetivo. Nomeie resultado/ação específica. Evite floreios.';
  if (p.includes('i')) return 'Caloroso, reconheça esforço. Valide emoção sem enfeitar.';
  if (p.includes('s')) return 'Sereno, paciente. Reforce consistência e pontos sólidos antes de gaps.';
  if (p.includes('c')) return 'Estruturado, preciso. Explique critério e cite evidência literal.';
  return 'Tom neutro acolhedor.';
}

export interface RegrasDaDevolutivaParams {
  nomeColab: string;
  semanasEvidencia: number;
  /** Vazio fora do piloto; no piloto, liga as proibições de falar em evolução. */
  notaPrograma: string;
  tomDevol: string;
}

/**
 * Regras do texto que a pessoa LÊ (devolutiva, fecho e próximos passos).
 *
 * FONTE ÚNICA entre dois escritores (18/09/2026): o scorer, que escreve o
 * rascunho junto com a nota, e a redação final (`prompts/fechamento-redacao.ts`),
 * que reescreve o texto quando o código muda a nota DEPOIS dele (ajuste da
 * arguição, piso do piloto). Duas cópias destas regras divergiriam na primeira
 * edição, e a pessoa leria um fecho com regras diferentes conforme a nota mudou
 * ou não. O texto foi movido sem alteração: o golden do scorer prova.
 */
export function regrasDaDevolutiva({ nomeColab, semanasEvidencia, notaPrograma, tomDevol }: RegrasDaDevolutivaParams): string {
  return `DEVOLUTIVA (resumo_avaliacao):
- Tom adaptado ao DISC: ${tomDevol}
- Conteúdo NUNCA muda por perfil — o que muda é a forma.
- Cite ao menos 1 evidência das ${semanasEvidencia} semanas além do cenário.
- Seja honesto, construtivo e não inflado.
- A duração REAL do programa é ${semanasEvidencia} semanas de jornada + fechamento — NUNCA mencione outra duração.${notaPrograma ? `
- PROIBIDO na devolutiva: falar em "evolução", "regressão", "avanço" ou "estagnação" DA PESSOA, ou comparar antes→depois — a janela não mede evolução. Enquadre como DEMONSTRAÇÃO da avaliação e leitura do PONTO DE PARTIDA. Não trate a base curta de evidências como falha do colaborador.` : ''}

FECHO (mensagem_final) — a ÚLTIMA coisa que ${nomeColab} lê no relatório:
- Escreva PARA ${nomeColab}, em segunda pessoa. Nunca "a pessoa demonstrou", "a colaboradora apresenta" nem qualquer frase sobre ${nomeColab} dirigida a um terceiro.
- 3 a 5 frases. Diga o que ${nomeColab} construiu e leva consigo (nomeando a prática concreta, não a competência), o que isso destrava daqui em diante, e o que continua pedindo trabalho — nessa ordem, sem adjetivo inflado e sem promessa.
- PROIBIDO citar o INSTRUMENTO: as palavras "conversa", "microcaso", "entrevista", "evidência", "descritor", "avaliação", "nota", "relatório", "IA" e "simulador" não aparecem. A pessoa não tem que ler sobre a qualidade da própria entrevista.
- Nada de "parabéns pela jornada" genérico: se não houver o que nomear, diga o que ${nomeColab} sustentou.${notaPrograma ? `
- Nesta janela curta o fecho NÃO afirma evolução: fale do PONTO DE PARTIDA e do que ${nomeColab} pode levar adiante.` : ''}

PRÓXIMOS PASSOS (proximos_passos):
- 0 a 3 ações que ${nomeColab} pode começar na semana que vem, cada uma numa frase, começando por verbo.
- Cada passo nasce de algo que ${nomeColab} DEMONSTROU aqui e continua o movimento que já começou. Sem tarefa genérica de curso ("leia sobre", "faça um treinamento").
- Se o material não sustentar nenhum passo concreto, devolva **lista vazia**. Não complete para chegar a três.`;
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
  /** Semana do fechamento (regular=14, piloto=3). Default 14 (byte-idêntico). */
  semanaFinal?: number;
  /** Janela de evidências em semanas (regular=13, piloto=2). Default 13. */
  semanasEvidencia?: number;
  /** Nota de contexto do programa (ex.: aviso do piloto). Vazio no regular. */
  notaPrograma?: string;
}

export function promptEvolutionScenarioScore({ competencia, descritores, cenario, resposta, nomeColab, perfilDominante, evidenciasAcumuladas, acumuladoPrimaria, semanaFinal = 14, semanasEvidencia = 13, notaPrograma = '' }: PromptEvolutionScenarioScoreParams) {
  const tomDevol = tomDevolutivaPorPerfil(perfilDominante);
  const system = `Você é um avaliador rigoroso e criterioso da Vertho.

Sua tarefa é calcular a AVALIAÇÃO FINAL da semana ${semanaFinal} por TRIANGULAÇÃO.
${notaPrograma ? `\nCONTEXTO DO PROGRAMA: ${notaPrograma}\n` : ''}
ATENÇÃO:
A semana ${semanaFinal} é o ponto de chegada.
Você NUNCA pontua só pela resposta ao cenário.
Você pontua pela triangulação entre:
- nota pré (baseline)
- avaliação acumulada das ${semanasEvidencia} semanas
- resposta ao cenário
- evidências acumuladas do programa

OBJETIVO CENTRAL:
Determinar, por descritor, qual é a leitura final mais defensável do estado atual do colaborador ao fim das ${semanasEvidencia} semanas do programa.

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

${regrasDaDevolutiva({ nomeColab, semanasEvidencia, notaPrograma, tomDevol })}

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

${acumuladoPrimaria ? `AVALIAÇÃO ACUMULADA (padrão das ${semanasEvidencia} semanas — USE como referência):
${JSON.stringify(acumuladoPrimaria, null, 2)}

` : ''}EVIDÊNCIAS DAS ${semanasEvidencia} SEMANAS (pra triangular):
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
      "evidencia_acumulada": "trecho curto ou síntese fiel das ${semanasEvidencia} semanas",
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
    "principal_ponto_de_atencao": "texto curto",
    "mensagem_final": "o fecho do relatório, escrito PARA ${nomeColab} em segunda pessoa: o que leva daqui, o que isso destrava, o que segue pedindo trabalho",
    "proximos_passos": ["ação que ${nomeColab} começa na semana que vem"]
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
- Não force todos os descritores a evoluir
- mensagem_final: 3 a 5 frases em segunda pessoa, sem citar conversa, evidência, nota, descritor, avaliação ou IA
- proximos_passos: 0 a 3, cada um começando por verbo; lista VAZIA quando o material não sustentar nenhum`;

  return { system, user };
}

const CLASSIFICACOES = ['evoluiu', 'manteve', 'regrediu'];
const NIVEIS = ['lacuna', 'em_desenvolvimento', 'meta', 'referencia'];
const CONSISTENCIAS = ['consistente', 'divergente_cenario_superior', 'divergente_cenario_inferior', 'sem_evidencia_acumulada'];

/**
 * A régua da `classificacao` por descritor (a mesma do REGRAS do prompt).
 * Fonte única entre o validador do scorer e a fusão da arguição, que muda o
 * delta depois do scorer e precisa reclassificar pela mesma régua.
 */
export function classificacaoDoDelta(delta: number): 'evoluiu' | 'manteve' | 'regrediu' {
  return delta > 0.3 ? 'evoluiu' : delta < -0.3 ? 'regrediu' : 'manteve';
}

const RUBRICA_POR_NIVEL = { 1: 'lacuna', 2: 'em_desenvolvimento', 3: 'meta', 4: 'referencia' } as const;

/**
 * O `nivel_rubrica` de uma nota pela régua OFICIAL (`nivelDaNota`: N3 vai de
 * 3,00 a 3,50). A fusão da arguição usa isto quando muda a nota: o nível que o
 * scorer escreveu era o da nota de antes. `Medido:` ensaio de 18/09, "Condução
 * de reuniões" com nota final 3,0 e nível "em_desenvolvimento" (o de 2,6), que o
 * auditor apontou como inconsistência.
 */
export function rubricaDaNota(nota: number): (typeof RUBRICA_POR_NIVEL)[keyof typeof RUBRICA_POR_NIVEL] {
  return RUBRICA_POR_NIVEL[nivelDaNota(nota)];
}

/**
 * Os "Próximos passos" que a pessoa lê: no máximo 3, sem item vazio.
 *
 * 🔑 O TETO É DO VALIDADOR, e a lista pode voltar VAZIA (17/09/2026). O prompt
 * pede "0 a 3, e vazio se não sustentar" justamente para não repetir o erro do
 * PDI, onde a cota `"2-3 áreas de atenção"` no schema venceu a prosa que proibia
 * inferir e o modelo passou a inventar para preencher o campo. Aqui o schema não
 * pode desmentir o prompt: ausência de passo é resposta legítima.
 */
export function normalizarPassos(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter((p) => p.length > 0)
    .slice(0, 3);
}

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
      classificacao: CLASSIFICACOES.includes(d.classificacao) ? d.classificacao : (delta != null ? classificacaoDoDelta(delta) : 'manteve'),
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
      mensagem_final: parsed.resumo_avaliacao.mensagem_final || '',
      proximos_passos: normalizarPassos(parsed.resumo_avaliacao.proximos_passos),
    };
  } else if (typeof parsed.resumo_avaliacao === 'string') {
    parsed.resumo_avaliacao = {
      mensagem_geral: parsed.resumo_avaliacao,
      evidencias_citadas: [],
      principal_avanco: '',
      principal_ponto_de_atencao: '',
      mensagem_final: '',
      proximos_passos: [],
    };
  } else {
    parsed.resumo_avaliacao = {
      mensagem_geral: '',
      evidencias_citadas: [],
      principal_avanco: '',
      principal_ponto_de_atencao: '',
      mensagem_final: '',
      proximos_passos: [],
    };
  }
  if (!Array.isArray(parsed.alertas_metodologicos)) parsed.alertas_metodologicos = [];
  return parsed;
}
