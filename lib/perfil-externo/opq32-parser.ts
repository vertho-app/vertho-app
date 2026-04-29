/**
 * Parser OPQ32 (SHL).
 *
 * O PDF do OPQ32 tem na página 3 um bloco com os 32 stens em formato
 * linear, ex:
 *   "RP1=7, RP2=7, RP3=7, RP4=6, RP5=9, RP6=9, RP7=6, RP8=1, RP9=6, RP10=8,
 *    TS1=4, TS2=3, ..., FE10=4, CNS=6"
 *
 * Extrai via regex (rápido e determinístico). Se falhar, chama IA com
 * fallback (chamador decide, este parser não importa SDK de IA).
 */

export type OPQ32Cluster = 'RP' | 'TS' | 'FE';

export type OPQ32Escala = {
  codigo: string;          // 'RP1', 'TS3', etc.
  cluster: OPQ32Cluster;
  posicao: number;         // 1-12
  nome: string;            // 'Persuasivo'
  sten: number;            // 1-10
  polo_baixo: string;      // descrição do polo baixo
  polo_alto: string;       // descrição do polo alto
};

export type OPQ32Profile = {
  fonte: 'opq32';
  versao: string;
  nome?: string;
  data_aplicacao?: string;
  grupo_comparacao?: string;
  cns: number | null;          // Consistência (1-10)
  escalas: OPQ32Escala[];
  // Resumo facilita prompts IA: dimensões altas (>=8) e baixas (<=3)
  resumo: {
    altas: { codigo: string; nome: string; sten: number }[];
    baixas: { codigo: string; nome: string; sten: number }[];
  };
};

// ── Catálogo das 32 escalas (Lei OPQ32) ──────────────────────────────
// Labels e descrições traduzidas oficialmente pela SHL pra português BR.
// Não inventar — esses textos vêm do relatório oficial.

const ESCALAS: Array<{
  codigo: string;
  cluster: OPQ32Cluster;
  posicao: number;
  nome: string;
  polo_baixo: string;
  polo_alto: string;
  subcluster: string;
}> = [
  // RP — Relações com as Pessoas (Influência)
  { codigo: 'RP1', cluster: 'RP', posicao: 1, nome: 'Persuasivo', subcluster: 'Influência',
    polo_baixo: 'raramente pressiona os outros, não gosta de vender',
    polo_alto: 'gosta de vender, à vontade em negociação' },
  { codigo: 'RP2', cluster: 'RP', posicao: 2, nome: 'Organizador', subcluster: 'Influência',
    polo_baixo: 'prefere que outros dirijam, pouco provável que assuma a liderança',
    polo_alto: 'gosta de liderar e dirigir, assume o controlo' },
  { codigo: 'RP3', cluster: 'RP', posicao: 3, nome: 'Direto', subcluster: 'Influência',
    polo_baixo: 'raramente critica, não comunica opiniões',
    polo_alto: 'expressa livremente opiniões, deixa claro o desacordo' },
  { codigo: 'RP4', cluster: 'RP', posicao: 4, nome: 'Independente', subcluster: 'Influência',
    polo_baixo: 'aceita decisões da maioria, segue consensual',
    polo_alto: 'prefere seguir suas opiniões, não segue a maioria' },
  // RP — Sociabilidade
  { codigo: 'RP5', cluster: 'RP', posicao: 5, nome: 'Extrovertido', subcluster: 'Sociabilidade',
    polo_baixo: 'calado e reservado nos grupos',
    polo_alto: 'animado e jovial nos grupos, falador' },
  { codigo: 'RP6', cluster: 'RP', posicao: 6, nome: 'Afiliativo', subcluster: 'Sociabilidade',
    polo_baixo: 'gosta de passar tempo sozinho, raramente sente falta dos outros',
    polo_alto: 'gosta da companhia dos outros, sente falta dos outros' },
  { codigo: 'RP7', cluster: 'RP', posicao: 7, nome: 'Autoconfiante', subcluster: 'Sociabilidade',
    polo_baixo: 'prefere situações pouco formais',
    polo_alto: 'à vontade conhecendo novas pessoas, confortável em situações formais' },
  // RP — Empatia
  { codigo: 'RP8', cluster: 'RP', posicao: 8, nome: 'Modesto', subcluster: 'Empatia',
    polo_baixo: 'dá a conhecer seus pontos fortes e realizações',
    polo_alto: 'não gosta de falar das suas realizações' },
  { codigo: 'RP9', cluster: 'RP', posicao: 9, nome: 'Democrático', subcluster: 'Empatia',
    polo_baixo: 'toma decisões sem consultar os outros',
    polo_alto: 'consulta os outros, encoraja participação' },
  { codigo: 'RP10', cluster: 'RP', posicao: 10, nome: 'Humano', subcluster: 'Empatia',
    polo_baixo: 'seletivo na manifestação de simpatia',
    polo_alto: 'simpático, considera os outros, apoiante' },

  // TS — Estilo de Pensamento (Análise)
  { codigo: 'TS1', cluster: 'TS', posicao: 1, nome: 'Calculador', subcluster: 'Análise',
    polo_baixo: 'prefere sentimentos e opiniões a fatos e números',
    polo_alto: 'gosta de analisar números e estatística' },
  { codigo: 'TS2', cluster: 'TS', posicao: 2, nome: 'Crítico', subcluster: 'Análise',
    polo_baixo: 'não procura erros ou falhas',
    polo_alto: 'avalia criticamente, procura potenciais dificuldades' },
  { codigo: 'TS3', cluster: 'TS', posicao: 3, nome: 'Observador', subcluster: 'Análise',
    polo_baixo: 'não se interessa por motivos de comportamento',
    polo_alto: 'compreende motivos e comportamentos dos outros' },
  // TS — Criatividade e Mudança
  { codigo: 'TS4', cluster: 'TS', posicao: 4, nome: 'Convencional', subcluster: 'Criatividade e Mudança',
    polo_baixo: 'adere à mudança, prefere novos pontos de vista',
    polo_alto: 'prefere métodos estabelecidos, pontos de vista convencionais' },
  { codigo: 'TS5', cluster: 'TS', posicao: 5, nome: 'Conceptual', subcluster: 'Criatividade e Mudança',
    polo_baixo: 'prefere prática à teoria',
    polo_alto: 'interessado em teorias, gosta de conceitos abstratos' },
  { codigo: 'TS6', cluster: 'TS', posicao: 6, nome: 'Inovador', subcluster: 'Criatividade e Mudança',
    polo_baixo: 'pouco criativo, prefere ideias dos outros',
    polo_alto: 'tem ideias novas, gosta de ser criativo' },
  { codigo: 'TS7', cluster: 'TS', posicao: 7, nome: 'Procura da Variedade', subcluster: 'Criatividade e Mudança',
    polo_baixo: 'prefere a rotina, gosta de trabalho repetitivo',
    polo_alto: 'prefere variedade, gosta de novidade' },
  { codigo: 'TS8', cluster: 'TS', posicao: 8, nome: 'Adaptável', subcluster: 'Criatividade e Mudança',
    polo_baixo: 'age uniformemente, dificuldade em adaptar comportamento',
    polo_alto: 'modifica comportamento conforme situação' },
  // TS — Estrutura
  { codigo: 'TS9', cluster: 'TS', posicao: 9, nome: 'Planificador', subcluster: 'Estrutura',
    polo_baixo: 'foca curto prazo, pouca perspectiva estratégica',
    polo_alto: 'adota perspectiva de longo prazo, perspectiva estratégica' },
  { codigo: 'TS10', cluster: 'TS', posicao: 10, nome: 'Metódico', subcluster: 'Estrutura',
    polo_baixo: 'pouco organizado, não atento a detalhes',
    polo_alto: 'metódico, atento a pormenores, organizado' },
  { codigo: 'TS11', cluster: 'TS', posicao: 11, nome: 'Consciencioso', subcluster: 'Estrutura',
    polo_baixo: 'flexível com prazos, pode deixar tarefas por concluir',
    polo_alto: 'persistente na conclusão do trabalho' },
  { codigo: 'TS12', cluster: 'TS', posicao: 12, nome: 'Cumpridor', subcluster: 'Estrutura',
    polo_baixo: 'preparado para infringir regras, não gosta de burocracia',
    polo_alto: 'segue regras e procedimentos, prefere diretrizes claras' },

  // FE — Sentimentos e Emoções (Emoção)
  { codigo: 'FE1', cluster: 'FE', posicao: 1, nome: 'Tranquilo', subcluster: 'Emoção',
    polo_baixo: 'tende a ficar tenso, dificuldade em descontrair',
    polo_alto: 'descontrai facilmente, calmo e pouco perturbável' },
  { codigo: 'FE2', cluster: 'FE', posicao: 2, nome: 'Preocupado', subcluster: 'Emoção',
    polo_baixo: 'calmo antes de ocasiões importantes, livre de preocupações',
    polo_alto: 'tenso antes de ocasiões importantes, preocupa-se' },
  { codigo: 'FE3', cluster: 'FE', posicao: 3, nome: 'Imperturbável', subcluster: 'Emoção',
    polo_baixo: 'suscetível, ferido por críticas',
    polo_alto: 'não se ofende, ignora insultos' },
  { codigo: 'FE4', cluster: 'FE', posicao: 4, nome: 'Otimista', subcluster: 'Emoção',
    polo_baixo: 'foca aspectos negativos, espera que coisas corram mal',
    polo_alto: 'vê aspectos positivos, visão otimista' },
  { codigo: 'FE5', cluster: 'FE', posicao: 5, nome: 'Confiante', subcluster: 'Emoção',
    polo_baixo: 'cauteloso em relação aos outros, dificuldade em confiar',
    polo_alto: 'confia nas pessoas, considera-as honestas' },
  { codigo: 'FE6', cluster: 'FE', posicao: 6, nome: 'Emocionalmente Controlado', subcluster: 'Emoção',
    polo_baixo: 'expressa livremente sentimentos',
    polo_alto: 'oculta sentimentos, raramente mostra emoções' },
  // FE — Dinamismo
  { codigo: 'FE7', cluster: 'FE', posicao: 7, nome: 'Enérgico', subcluster: 'Dinamismo',
    polo_baixo: 'gosta de fazer com ritmo calmo',
    polo_alto: 'ativo, gosta de estar ocupado' },
  { codigo: 'FE8', cluster: 'FE', posicao: 8, nome: 'Competitivo', subcluster: 'Dinamismo',
    polo_baixo: 'participar é mais importante do que vencer',
    polo_alto: 'tem necessidade de vencer, gosta de competir' },
  { codigo: 'FE9', cluster: 'FE', posicao: 9, nome: 'Realizador', subcluster: 'Dinamismo',
    polo_baixo: 'objetivos alcançáveis em vez de ambiciosos',
    polo_alto: 'ambicioso, centrado em carreira' },
  { codigo: 'FE10', cluster: 'FE', posicao: 10, nome: 'Decidido', subcluster: 'Dinamismo',
    polo_baixo: 'cauteloso na decisão, gosta de tempo antes de concluir',
    polo_alto: 'toma decisões rápidas, tira conclusões rapidamente' },
];

const ESCALA_BY_CODIGO = new Map(ESCALAS.map((e) => [e.codigo, e]));

/**
 * Parse a string codificada do bloco "Dados do Candidato" da página 3 do OPQ32.
 * Aceita formatos com vírgulas/quebras de linha/espaços.
 *
 * Exemplo: "RP1=7, RP2=7, ..., CNS=6"
 * Retorna Map de codigo → sten.
 */
export function parseOPQ32Stens(text: string): Map<string, number> {
  const map = new Map<string, number>();
  const re = /\b(RP\d{1,2}|TS\d{1,2}|FE\d{1,2}|CNS)\s*=\s*(\d{1,2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const sten = parseInt(m[2], 10);
    if (!Number.isFinite(sten) || sten < 1 || sten > 10) continue;
    map.set(m[1], sten);
  }
  return map;
}

/**
 * Constrói o profile completo a partir do texto extraído do PDF.
 * Procura o bloco de dados, valida cobertura mínima (>= 30 escalas das 32),
 * e enriquece com nomes/descrições do catálogo.
 */
export function montarOPQ32Profile(opts: {
  textoPdf: string;
  nome?: string;
  dataAplicacao?: string;
  grupoComparacao?: string;
}): OPQ32Profile | null {
  const stens = parseOPQ32Stens(opts.textoPdf);
  if (stens.size < 30) return null; // sanidade: precisa quase todas

  const escalas: OPQ32Escala[] = [];
  for (const cat of ESCALAS) {
    const sten = stens.get(cat.codigo);
    if (sten == null) continue;
    escalas.push({
      codigo: cat.codigo,
      cluster: cat.cluster,
      posicao: cat.posicao,
      nome: cat.nome,
      sten,
      polo_baixo: cat.polo_baixo,
      polo_alto: cat.polo_alto,
    });
  }

  const altas = escalas
    .filter((e) => e.sten >= 8)
    .map((e) => ({ codigo: e.codigo, nome: e.nome, sten: e.sten }))
    .sort((a, b) => b.sten - a.sten);
  const baixas = escalas
    .filter((e) => e.sten <= 3)
    .map((e) => ({ codigo: e.codigo, nome: e.nome, sten: e.sten }))
    .sort((a, b) => a.sten - b.sten);

  return {
    fonte: 'opq32',
    versao: 'v2.0',
    nome: opts.nome,
    data_aplicacao: opts.dataAplicacao,
    grupo_comparacao: opts.grupoComparacao,
    cns: stens.get('CNS') ?? null,
    escalas,
    resumo: { altas, baixas },
  };
}

/**
 * Heurísticas pra extrair nome/data/grupo do texto. Tolera variações de
 * formato. Se não encontrar, retorna undefined (chamador decide).
 */
export function extrairMetadadosOPQ32(textoPdf: string): {
  nome?: string;
  dataAplicacao?: string;
  grupoComparacao?: string;
} {
  const result: { nome?: string; dataAplicacao?: string; grupoComparacao?: string } = {};

  // Nome aparece geralmente após "Nome\n" na capa ou em "Dados do Candidato"
  // Padrão de capa: linha com "Nome" seguida da linha com o nome
  const mNomeBloco = textoPdf.match(/Nome\s*\n+\s*([A-ZÀ-ÿ][^\n]{2,80})/);
  if (mNomeBloco) result.nome = mNomeBloco[1].trim();

  // Data: "3 março 2026" ou similar
  const mData = textoPdf.match(/(\d{1,2})\s+(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+(\d{4})/i);
  if (mData) result.dataAplicacao = `${mData[3]}-${mesToNum(mData[2])}-${mData[1].padStart(2, '0')}`;

  // Grupo de comparação (norm group) — geralmente "OPQ32r ... 2012 (INT)"
  const mGrupo = textoPdf.match(/OPQ32r\s+([^\n]{5,150})/);
  if (mGrupo) result.grupoComparacao = mGrupo[1].trim();

  return result;
}

function mesToNum(mes: string): string {
  const map: Record<string, string> = {
    'janeiro': '01', 'fevereiro': '02', 'março': '03', 'abril': '04',
    'maio': '05', 'junho': '06', 'julho': '07', 'agosto': '08',
    'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12',
  };
  return map[mes.toLowerCase()] || '01';
}

export { ESCALAS as OPQ32_ESCALAS };
