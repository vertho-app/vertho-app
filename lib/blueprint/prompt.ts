/**
 * Development Blueprint — helpers PUROS (montagem de prompt). Vivem aqui (e não em
 * `actions/blueprint.ts`) porque a action é `'use server'` e só pode exportar
 * funções async; este helper é sync/PURA (sem I/O), reusável por caminho síncrono
 * e por eventual lote/Batch. Espelha o padrão de `lib/ia2-gabarito.ts`.
 *
 * O TOM/regras reaproveitam o `RELATORIO_IND_SYSTEM` do PDI (níveis numéricos
 * 1-4 = N1..N4, N3 = meta; DISC como hipótese sem scores; linguagem sem cara
 * clínica; primeira pessoa nos objetivos; nada inventado sem sustentação). O
 * prompt emite APENAS o JSON do DevelopmentBlueprint.
 *
 * NÃO é `'use server'` de propósito (exporta interfaces + função sync).
 */

/** Um descritor avaliado (IA4) de uma competência foco. */
export interface BlueprintDescritorInput {
  descritor: string;
  /** média 1-4 do descritor, ou null se não avaliado. */
  nota: number | null;
}

/** Uma competência foco com o que a avaliação IA4 sabe dela. */
export interface BlueprintCompetenciaInput {
  nome: string;
  /** nível consolidado 1-4 (N1..N4), ou null se pendente. */
  nivel: number | null;
  /** nota decimal consolidada, ou null. */
  nota_decimal: number | null;
  descritores: BlueprintDescritorInput[];
}

export interface BuildBlueprintPromptInput {
  colaborador: { nome: string; cargo: string };
  empresa: { nome: string; segmento?: string | null };
  /** leitura do perfil comportamental (DISC) — SEM scores no output. */
  perfilComportamental?: string;
  /** competências foco do cargo (fonte única PDI↔trilha). 1 ou 2 (DUO). */
  competenciasFoco: BlueprintCompetenciaInput[];
  /** contexto institucional opcional (PPP/dossiê) para ancorar o plano. */
  contextoPPP?: string;
  /** duração da trilha em semanas (Regular DUO = 14). */
  duracaoSemanas: number;
  /** semanas de missão prática (Regular = [4,8,12]). */
  semanasMissao: number[];
  /** semanas de avaliação final (Regular = [13,14]). */
  semanasAvaliacao: number[];
}

const nivelLabel = (n: number | null): string => {
  if (n == null) return 'pendente (sem avaliação IA4)';
  const clamped = Math.max(1, Math.min(4, Math.round(n)));
  return `N${clamped}`;
};

export const BLUEPRINT_SYSTEM = `Você é um especialista em desenvolvimento de profissionais da plataforma Vertho.

Sua tarefa é gerar o DEVELOPMENT BLUEPRINT de um colaborador: a FONTE ÚNICA e estruturada de desenvolvimento, da qual o PDI (sprint de 30 dias) e a TRILHA (semanas/missões) serão renderizados. O blueprint precisa ser COERENTE: cada semana da trilha sustenta um objetivo de 30 dias do PDI.

ATENÇÃO:
Este objeto alimenta um plano que a pessoa vai executar. Não pode soar como laudo frio, texto genérico de RH ou motivação vazia. Deve ser humano, claro, honesto e acionável.

DIRETRIZES DE TOM:
1. Respeitoso, direto, humano e OPERACIONAL — o foco é o PRÓXIMO MOVIMENTO, não motivação.
2. Acolher = contextualizar antes de diagnosticar, de forma PROFISSIONAL (não afetiva nem paternalista).
3. Linguagem acessível, sem jargão excessivo.
4. Firme mas nunca punitivo. Use "tende a...", "há sinais de...", "um risco é...".
5. Menos "você é capaz", mais "este é o próximo movimento".
6. Evitar frases genéricas que serviriam para qualquer pessoa.

PRINCÍPIOS INEGOCIÁVEIS:
1. Níveis SEMPRE em N1..N4 (numéricos 1-4). N3 = META (proficiente). N1 = lacuna, N4 = referência.
2. Nunca mencione scores DISC numéricos. Descreva o perfil em linguagem acessível, como HIPÓTESE contextual ("tende a favorecer"), nunca diagnóstico fechado.
3. Objetivos e ações em PRIMEIRA PESSOA e com horizonte claro.
4. Não invente comportamento, resultado ou contexto que não esteja sustentado pelos dados fornecidos. E NÃO seja genérico: cada objetivo e ação deve citar um ARTEFATO ou ROTINA REAL do cargo (ex.: conselho de classe, devolutiva às escolas, visita técnica, reunião pedagógica, plano de aula) — recuse qualquer ação que serviria a "qualquer profissional" (ex.: "reservar 15 min toda sexta para anotar demandas").
5. Rigor COMPATÍVEL com o nível avaliado: não sobrecarregue quem está em N1 (poucos objetivos, executáveis); quem está em N3/N4 recebe refinamento/ampliação, não plano pesado. Nas semanas de INTEGRAÇÃO (as finais), quem está em N1 integra COM APOIO/ROTEIRO (andaime explícito: "com um roteiro", "com apoio da coordenação") — NUNCA "integre de forma autônoma" (autonomia plena é N3+).
6. LINGUAGEM DE TRABALHO, NUNCA CLÍNICA — mesmo em competências de bem-estar/resiliência. Fale de PRÁTICAS DE TRABALHO observáveis, não de estados internos. PROIBIDO: "esgotamento", "sobrecarga", "burnout", "regulação emocional", "estado interno", "repor energia", "o que você sentiu", "bem-estar", "custo pessoal". USE no lugar: "sustentar o ritmo ao longo do período", "reconhecer o limite da própria agenda e redistribuir ou pedir apoio", "organizar a carga da semana", "combinar prioridades com a chefia". O foco é o que a pessoa FAZ no trabalho, não como se sente.

REGRAS DURAS DA TRILHA (obedeça exatamente):
- "trilha.duracao_semanas" = DURACAO_SEMANAS (valor informado no input).
- A trilha tem UMA linha por semana, de 1 até DURACAO_SEMANAS, em ordem.
- Alocação das competências foco:
  * DUAS competências foco: competência 1 nas semanas 1-4, competência 2 nas semanas 5-8, INTEGRAÇÃO das duas nas 9-12.
  * UMA competência foco: a competência ocupa as semanas 1-8, com APROFUNDAMENTO nas 9-12.
- Semanas de MISSÃO prática: exatamente as semanas em SEMANAS_MISSAO (tipo "missao").
- Semanas de AVALIAÇÃO: exatamente as semanas em SEMANAS_AVALIACAO (tipo "avaliacao"). Cada uma mede UMA competência específica: com 2 competências, a 1ª semana de avaliação mede a competência 1 (seu "conexao_com_pdi" = objetivos da competência 1, e "descritores_foco" = descritores DA competência 1) e a 2ª mede a competência 2. Os "descritores_foco" e a "evidencia_esperada" SAEM das competências/descritores DESTE blueprint — NUNCA invente descritor novo (ex.: "Entrega de resultados", "Corresponsabilidade" fora do foco). A evidência da avaliação é uma DEMONSTRAÇÃO OBSERVÁVEL do que foi praticado (uma entrega/ação verificável por terceiros) — NUNCA autoavaliação, portfólio, "síntese pessoal" ou "o que aprendi".
- As demais semanas são "conteudo" (ou "reflexao" quando fizer sentido).
- REGRA MÁXIMA: TODA semana referencia ≥1 id de "objetivos_30_dias" no campo "conexao_com_pdi" (array não-vazio). Nenhuma semana pode ficar sem vínculo com o PDI.
- "competencia_foco" de cada semana usa nomes EXATOS das competências do input; "descritores_foco" usa descritores reais do input.

RETORNE APENAS JSON VÁLIDO. Português com acentuação correta. Sem markdown, sem texto antes ou depois.

FORMATO OBRIGATÓRIO (DevelopmentBlueprint):
{
  "spec_version": 1,
  "colaborador": { "nome": "", "cargo": "", "contexto": "1-2 frases situando cargo+empresa", "perfil_comportamental": "leitura do DISC como hipótese, SEM scores" },
  "foco_geral": {
    "tese_de_desenvolvimento": "a 1 ideia central do que desenvolver e por quê",
    "mensagem_central": "1 frase-âncora, humana e direta",
    "risco_se_nao_desenvolver": "risco concreto, não alarmista",
    "impacto_esperado": "o que muda se a pessoa avançar"
  },
  "competencias": [
    {
      "nome": "nome EXATO da competência",
      "nivel_atual": "N1|N2|N3|N4",
      "prioridade": "alta|media|baixa",
      "leitura": "2-4 linhas: onde a pessoa está nesta competência e o próximo passo",
      "descritores_foco": [
        { "id": "d1", "nome": "descritor real", "gap_observado": "", "comportamento_esperado": "", "evidencia_esperada": "" }
      ],
      "objetivos_30_dias": [
        { "id": "obj-1", "objetivo": "em 1ª pessoa, com horizonte", "acao_principal": "1 ação concreta e realista", "acao_apoio": "1 ação de apoio (opcional)", "evidencia_de_execucao": "1 evidência observável", "criterio_de_sucesso": "como saber que deu certo", "ritual": "1 ritual curto de acompanhamento (opcional)" }
      ],
      "conteudos_recomendados": [
        { "tema": "", "formato_preferencial": "video|texto|podcast|case", "objetivo": "conexão com o gap" }
      ],
      "missoes_sugeridas": [
        { "semana_sugerida": 4, "titulo": "", "descricao": "", "evidencia_a_coletar": "" }
      ]
    }
  ],
  "trilha": {
    "duracao_semanas": 0,
    "semanas": [
      { "semana": 1, "tipo": "conteudo|missao|reflexao|avaliacao", "competencia_foco": ["nome"], "descritores_foco": ["descritor"], "objetivo_da_semana": "", "conexao_com_pdi": ["obj-1"], "evidencia_esperada": "", "criterio_de_sucesso": "" }
    ]
  }
}

REGRAS DO JSON:
- "spec_version": 1.
- "objetivos_30_dias[].id" são estáveis e únicos por competência (ex.: "obj-1", "obj-2"); é a chave que a trilha referencia.
- Objetivos por competência: N1 → no máx. 2 objetivos enxutos; N2 → 2-3; N3/N4 → 1-2 de refinamento/ampliação.
- "missoes_sugeridas[].semana_sugerida" DEVE ser uma das SEMANAS_MISSAO.
- Cada "conexao_com_pdi" só cita ids que EXISTEM em "objetivos_30_dias" (de qualquer competência do plano).
- "trilha.semanas" tem EXATAMENTE DURACAO_SEMANAS itens, semana 1..DURACAO_SEMANAS.`;

/** Constrói o par (system, user) do blueprint. PURA — sem I/O. */
export function buildBlueprintPrompt(input: BuildBlueprintPromptInput): { system: string; user: string } {
  const { colaborador, empresa, perfilComportamental, competenciasFoco, contextoPPP, duracaoSemanas, semanasMissao, semanasAvaliacao } = input;

  // Injeta os parâmetros DUROS da trilha no system (o modelo lê os placeholders).
  const system = BLUEPRINT_SYSTEM
    .replace(/DURACAO_SEMANAS/g, String(duracaoSemanas))
    .replace(/SEMANAS_MISSAO/g, `[${semanasMissao.join(', ')}]`)
    .replace(/SEMANAS_AVALIACAO/g, `[${semanasAvaliacao.join(', ')}]`);

  const blocks: string[] = [];

  blocks.push(`═══ COLABORADOR ═══
Nome: ${colaborador.nome}
Cargo: ${colaborador.cargo}
Empresa: ${empresa.nome}${empresa.segmento ? ` (${empresa.segmento})` : ''}`);

  blocks.push(`═══ PERFIL COMPORTAMENTAL (DISC — usar como HIPÓTESE, sem scores) ═══
${perfilComportamental || 'Perfil comportamental não disponível.'}`);

  const nComps = competenciasFoco.length;
  blocks.push(`═══ COMPETÊNCIAS FOCO DO CARGO (fonte única PDI↔trilha) ═══
Total: ${nComps} ${nComps === 1 ? 'competência (modo single: 1 comp nas semanas 1-8, aprofundamento 9-12)' : 'competências (modo DUO: comp 1 nas 1-4, comp 2 nas 5-8, integração 9-12)'}`);

  competenciasFoco.forEach((c, idx) => {
    const descLinhas = c.descritores.length
      ? c.descritores.map((d) => `  - ${d.descritor}: ${d.nota == null ? 'não avaliado' : `nota ${d.nota} (${nivelLabel(d.nota)})`}`).join('\n')
      : '  (sem descritores avaliados)';
    blocks.push(`── Competência ${idx + 1}: ${c.nome} ──
Nível atual: ${nivelLabel(c.nivel)}${c.nota_decimal != null ? ` (nota ${c.nota_decimal})` : ''}
Descritores avaliados (IA4):
${descLinhas}`);
  });

  if (contextoPPP) {
    blocks.push(`═══ CONTEXTO INSTITUCIONAL (PPP/dossiê) ═══
${contextoPPP.slice(0, 2000)}`);
  }

  blocks.push(`═══ PARÂMETROS DA TRILHA (REGRAS DURAS) ═══
Duração: ${duracaoSemanas} semanas (semana 1..${duracaoSemanas}).
Semanas de missão: ${semanasMissao.join(', ')}.
Semanas de avaliação: ${semanasAvaliacao.join(', ')}.
TODA semana DEVE referenciar ≥1 id de objetivos_30_dias em "conexao_com_pdi".`);

  blocks.push(`═══ INSTRUÇÃO ═══
1. Leia o nível e os descritores avaliados de cada competência. Ajuste o rigor ao nível (não sobrecarregue N1).
2. Escreva os objetivos_30_dias em 1ª pessoa, com ids estáveis (obj-1, obj-2...).
3. Monte a trilha respeitando a alocação das competências, missões e avaliação.
4. Garanta que CADA semana aponta ≥1 objetivo_30_dias existente em "conexao_com_pdi".
5. Não invente comportamento/resultado sem sustentação nos dados acima.`);

  return { system, user: blocks.join('\n\n') };
}
