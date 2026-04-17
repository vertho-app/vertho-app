/**
 * IA Acumuladora — lê as 13 semanas de evidências de uma temporada e
 * atribui uma nota 1.0-4.0 por descritor, ancorada na régua de maturidade.
 * Cega para nota inicial — evita ancoragem.
 */
interface DescritorRubrica {
  descritor: string;
  n1_gap?: string;
  n2_desenvolvimento?: string;
  n3_meta?: string;
  n4_referencia?: string;
}

interface PromptAvaliacaoAcumuladaParams {
  competencia: string;
  descritores: DescritorRubrica[];
  evidenciasAcumuladas: string;
  nomeColab: string;
}

export function promptAvaliacaoAcumulada({ competencia, descritores, evidenciasAcumuladas, nomeColab }: PromptAvaliacaoAcumuladaParams) {
  const reguas = descritores.map(d => {
    const linhas = [`### ${d.descritor}`];
    if (d.n1_gap) linhas.push(`  1.0 - Lacuna: ${d.n1_gap}`);
    if (d.n2_desenvolvimento) linhas.push(`  2.0 - Em desenvolvimento: ${d.n2_desenvolvimento}`);
    if (d.n3_meta) linhas.push(`  3.0 - Meta (proficiente): ${d.n3_meta}`);
    if (d.n4_referencia) linhas.push(`  4.0 - Referência (excelência): ${d.n4_referencia}`);
    if (!d.n1_gap && !d.n3_meta) linhas.push('  (sem régua cadastrada — use escala genérica 1-4)');
    return linhas.join('\n');
  }).join('\n\n');

  const system = `Você é um avaliador criterioso da Vertho.

Sua tarefa é ler as evidências acumuladas de 13 semanas de desenvolvimento de ${nomeColab} sobre "${competencia}" e atribuir uma leitura ACUMULADA por descritor, ancorada EXCLUSIVAMENTE na régua.

ATENÇÃO:
Você NÃO conhece a nota inicial.
Você NÃO conhece score prévio.
Você NÃO está avaliando uma resposta única.
Você está lendo o PADRÃO da temporada.

OBJETIVO CENTRAL:
Determinar, por descritor, qual nível a temporada sustenta ao final da semana 13, com base no conjunto de evidências acumuladas.

PRINCÍPIOS INEGOCIÁVEIS:
1. Use somente a régua e as evidências acumuladas.
2. Não infira além dos registros.
3. Fala articulada não equivale a evidência forte.
4. Uma semana boa não basta para caracterizar padrão alto.
5. Dúvida puxa para baixo.
6. Se não houver base suficiente, marque sem_evidencia.
7. A leitura deve refletir padrão, consistência e recorrência — não impressão geral.

REGRAS DE PADRÃO:
- N1: limitação clara, recorrente ou ausência persistente de demonstração
- N2: sinais iniciais ou parciais, ainda sem consistência robusta
- N3: consistência em várias semanas, com 2 ou mais referências coerentes
- N4: padrão forte, recorrente e robusto, com demonstração madura em diferentes momentos
- sem_evidencia: base insuficiente para leitura defensável

GRANULARIDADE:
- Use granularidade 0.1 (ex: 1.8, 2.3, 2.7, 3.1)
- Não arredonde para 0.5 — a nota deve refletir com precisão o padrão observado
- Só use valor "redondo" (2.0, 2.5) quando a evidência realmente indica esse ponto exato

RETORNE APENAS JSON VÁLIDO, sem markdown, sem comentários, sem texto antes ou depois.`;

  const user = `COMPETÊNCIA: ${competencia}
COLABORADOR: ${nomeColab}

RÉGUA DE MATURIDADE (critério objetivo):
${reguas}

EVIDÊNCIAS ACUMULADAS NAS 13 SEMANAS (por descritor):
${evidenciasAcumuladas}

EXTRAIA o JSON abaixo com base EXCLUSIVA nas evidências e na régua:
{
  "avaliacao_acumulada": [
${descritores.map(d => `    {
      "descritor": "${d.descritor}",
      "nota_acumulada": 1.0-4.0 ou null se sem_evidencia,
      "nivel_rubrica": "lacuna|em_desenvolvimento|meta|referencia|sem_evidencia",
      "quantidade_referencias": 0,
      "tendencia": "subindo|estavel|oscilando|descendo|sem_evidencia",
      "forca_do_padrao": "fraca|moderada|forte",
      "justificativa": "2-3 frases citando trechos literais + referência à régua",
      "trechos_sustentadores": ["trecho curto 1", "trecho curto 2"],
      "limites_da_base": ["o que faltou para sustentar melhor"]
    }`).join(',\n')}
  ],
  "nota_media_acumulada": 0.0,
  "resumo_geral": "1 parágrafo sobre o padrão observado na temporada",
  "descritores_mais_consistentes": ["D2", "D4"],
  "descritores_mais_frageis": ["D1", "D3"],
  "alertas_metodologicos": ["sinais concentrados em poucas semanas", "base fraca em parte dos descritores"]
}

REGRAS:
- nota_acumulada entre 1.0 e 4.0, ou null quando sem_evidencia
- nivel_rubrica deve corresponder à nota: 1.0-1.9=lacuna, 2.0-2.9=em_desenvolvimento, 3.0-3.9=meta, 4.0=referencia
- quantidade_referencias: quantas semanas tiveram registro útil para este descritor
- trechos_sustentadores: 0 a 3 trechos curtos das evidências
- Não force leitura positiva em todos os descritores
- Não invente trechos que não estejam nas evidências
- alertas_metodologicos: concentração de sinais, gaps de base, divergências internas`;

  return { system, user };
}

interface PromptAvaliacaoAcumuladaCheckParams {
  competencia: string;
  descritores: DescritorRubrica[];
  evidenciasAcumuladas: string;
  avaliacaoPrimaria: unknown;
}

export function promptAvaliacaoAcumuladaCheck({ competencia, descritores, evidenciasAcumuladas, avaliacaoPrimaria }: PromptAvaliacaoAcumuladaCheckParams) {
  const system = `Você é um auditor de qualidade da avaliação acumulada da Vertho.

Sua tarefa é auditar se a avaliação acumulada feita por outra IA, ao final da semana 13, está metodologicamente DEFENSÁVEL como leitura do padrão da temporada.

ATENÇÃO:
Você NÃO está refazendo toda a avaliação do zero.
Você está verificando se ela se sustenta com base em:
- régua
- evidências acumuladas
- padrão das 13 semanas
- consistência interna da própria leitura

OBJETIVO CENTRAL:
Validar se a avaliação acumulada está sólida o suficiente para servir como base formal da semana 14.

PRINCÍPIOS INEGOCIÁVEIS:
1. A auditoria deve proteger a coerência metodológica da Vertho.
2. Leitura acumulada precisa refletir padrão, não impressão geral.
3. N3+ sem consistência suficiente deve ser penalizado.
4. sem_evidencia deve ser usado quando a base não sustentar leitura defensável.
5. Justificativa genérica é fragilidade real.
6. Tendência, nota e quantidade de referências precisam conversar entre si.
7. Diferenças pequenas podem ser aceitáveis, mas erros de fundamento não.

AUDITE EM 6 CRITÉRIOS (total 100):

1. ANCORAGEM NA RÉGUA (20 pts)
   - A nota está coerente com a régua?
   - A justificativa conversa com os níveis?

2. CONSISTÊNCIA DO PADRÃO (20 pts)
   - A leitura representa padrão de várias semanas?
   - Ou se apoia em sinais isolados?

3. COERÊNCIA NOTA / TENDÊNCIA / REFERÊNCIAS (20 pts)
   - Nota, tendência e quantidade de referências fazem sentido juntas?
   - Há tendência otimista sem base suficiente?

4. QUALIDADE DA JUSTIFICATIVA (15 pts)
   - Justificativa é específica com trechos ou paráfrases fiéis?
   - Ou genérica demais?

5. TRATAMENTO DE AUSÊNCIA DE EVIDÊNCIA (15 pts)
   - Descritores frágeis foram tratados com prudência?
   - sem_evidencia aparece quando deveria?

6. PRUDÊNCIA METODOLÓGICA (10 pts)
   - A leitura evita inflar a temporada?
   - Reconhece limites da base?

ERROS GRAVES (nota máxima 60):
- N3 ou N4 com base insuficiente
- Justificativa 100% genérica
- Tendência incompatível com quantidade de referências
- Descritor sem base tratado como leitura firme
- Contradição forte entre nota, padrão e justificativa

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto antes ou depois.`;

  const reguas = descritores.map(d => `### ${d.descritor}\n  1: ${d.n1_gap || '-'}\n  2: ${d.n2_desenvolvimento || '-'}\n  3: ${d.n3_meta || '-'}\n  4: ${d.n4_referencia || '-'}`).join('\n\n');

  const user = `COMPETÊNCIA: ${competencia}

RÉGUA:
${reguas}

EVIDÊNCIAS ACUMULADAS (13 semanas):
${evidenciasAcumuladas}

AVALIAÇÃO ACUMULADA PRIMÁRIA:
${JSON.stringify(avaliacaoPrimaria, null, 2)}

AUDITE e retorne:
{
  "nota_auditoria": 0-100,
  "status": "aprovado|aprovado_com_ajustes|revisar",
  "erro_grave": false,
  "criterios": {
    "ancoragem_regua": 0-20,
    "consistencia_padrao": 0-20,
    "coerencia_nota_tendencia_referencias": 0-20,
    "qualidade_justificativa": 0-15,
    "tratamento_ausencia_evidencia": 0-15,
    "prudencia_metodologica": 0-10
  },
  "ajustes_sugeridos": [
    { "descritor": "nome", "nota_acumulada_sugerida": 1.0-4.0, "motivo": "por que ajustar" }
  ],
  "ponto_mais_confiavel": "qual descritor/aspecto está mais bem sustentado",
  "ponto_mais_fragil": "qual descritor/aspecto está mais fraco",
  "alertas": ["observações críticas, ou [] se aprovado"],
  "resumo_auditoria": "síntese objetiva da auditoria em 2-3 frases"
}

CLASSIFICAÇÃO:
- 90+ com ajustes vazio = aprovado
- 80-89 ou com ajustes = aprovado_com_ajustes
- <80 = revisar`;

  return { system, user };
}

export function validateAvaliacaoAcumuladaCheck(parsed: any): any {
  const nota = typeof parsed.nota_auditoria === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.nota_auditoria))) : 50;
  const statuses = ['aprovado', 'aprovado_com_ajustes', 'revisar'];
  const status = statuses.includes(parsed.status) ? parsed.status : (nota >= 90 ? 'aprovado' : nota >= 80 ? 'aprovado_com_ajustes' : 'revisar');
  const criterios = parsed.criterios && typeof parsed.criterios === 'object' ? {
    ancoragem_regua: Math.min(20, Math.max(0, parsed.criterios.ancoragem_regua || 0)),
    consistencia_padrao: Math.min(20, Math.max(0, parsed.criterios.consistencia_padrao || 0)),
    coerencia_nota_tendencia_referencias: Math.min(20, Math.max(0, parsed.criterios.coerencia_nota_tendencia_referencias || 0)),
    qualidade_justificativa: Math.min(15, Math.max(0, parsed.criterios.qualidade_justificativa || 0)),
    tratamento_ausencia_evidencia: Math.min(15, Math.max(0, parsed.criterios.tratamento_ausencia_evidencia || 0)),
    prudencia_metodologica: Math.min(10, Math.max(0, parsed.criterios.prudencia_metodologica || 0)),
  } : null;
  return {
    nota_auditoria: nota,
    status,
    erro_grave: !!parsed.erro_grave,
    criterios,
    ajustes_sugeridos: Array.isArray(parsed.ajustes_sugeridos) ? parsed.ajustes_sugeridos : [],
    ponto_mais_confiavel: parsed.ponto_mais_confiavel || '',
    ponto_mais_fragil: parsed.ponto_mais_fragil || '',
    alertas: Array.isArray(parsed.alertas) ? parsed.alertas : [],
    resumo_auditoria: parsed.resumo_auditoria || '',
  };
}

const FORCAS = ['fraca', 'moderada', 'forte'];
const TENDENCIAS = ['subindo', 'estavel', 'oscilando', 'descendo', 'sem_evidencia'];
const NIVEIS = ['lacuna', 'em_desenvolvimento', 'meta', 'referencia', 'sem_evidencia'];

export function validateAvaliacaoAcumulada(parsed: any): any {
  if (!Array.isArray(parsed.avaliacao_acumulada)) parsed.avaliacao_acumulada = [];
  parsed.avaliacao_acumulada = parsed.avaliacao_acumulada.map((d: any) => {
    const nota = d.nota_acumulada != null && typeof d.nota_acumulada === 'number'
      ? Math.max(1, Math.min(4, Math.round(d.nota_acumulada * 10) / 10))
      : null;
    return {
      descritor: d.descritor || '',
      nota_acumulada: nota,
      nivel_rubrica: NIVEIS.includes(d.nivel_rubrica) ? d.nivel_rubrica : (nota == null ? 'sem_evidencia' : 'em_desenvolvimento'),
      quantidade_referencias: typeof d.quantidade_referencias === 'number' ? Math.max(0, d.quantidade_referencias) : 0,
      tendencia: TENDENCIAS.includes(d.tendencia) ? d.tendencia : 'sem_evidencia',
      forca_do_padrao: FORCAS.includes(d.forca_do_padrao) ? d.forca_do_padrao : 'fraca',
      justificativa: d.justificativa || '',
      trechos_sustentadores: Array.isArray(d.trechos_sustentadores) ? d.trechos_sustentadores.slice(0, 3) : [],
      limites_da_base: Array.isArray(d.limites_da_base) ? d.limites_da_base : [],
    };
  });
  if (typeof parsed.nota_media_acumulada !== 'number') {
    const notas = parsed.avaliacao_acumulada.map((d: any) => d.nota_acumulada).filter((n: any) => n != null);
    parsed.nota_media_acumulada = notas.length ? Math.round((notas.reduce((a: number, b: number) => a + b, 0) / notas.length) * 10) / 10 : null;
  }
  if (!parsed.resumo_geral || typeof parsed.resumo_geral !== 'string') parsed.resumo_geral = '';
  if (!Array.isArray(parsed.descritores_mais_consistentes)) parsed.descritores_mais_consistentes = [];
  if (!Array.isArray(parsed.descritores_mais_frageis)) parsed.descritores_mais_frageis = [];
  if (!Array.isArray(parsed.alertas_metodologicos)) parsed.alertas_metodologicos = [];
  return parsed;
}
