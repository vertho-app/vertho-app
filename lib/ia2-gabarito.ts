/**
 * IA2 (gabarito comportamental CIS/DISC) — helpers PUROS extraídos de
 * `actions/fase1.ts::rodarIA2`. Vivem aqui (e não em `fase1.ts`) porque
 * `fase1.ts` é `'use server'` e só pode exportar funções async — estes helpers
 * (montagem de prompt/validação sync + gatherers) precisam ser importáveis tanto
 * pelo caminho SÍNCRONO (rodarIA2) quanto pela task de LOTE (Batch API,
 * `trigger/gerar-ia2-batch.ts`). Nenhuma mudança de comportamento: é refactor puro.
 *
 * NÃO é `'use server'` de propósito (exporta consts + funções sync).
 */
import type { TenantDb } from '@/lib/tenant-db';
import { LATEST_SPEC_VERSION } from '@/lib/scoring/role-spec';
import { candidateColumns } from '@/lib/scoring/candidate';
import { medirColinearidadeMapDisc } from '@/lib/scoring/colinearidade';
import { isInternalEmail } from '@/lib/internal-emails';

// ── Referências comportamentais (idênticas ao GAS/fase1) ─────────────────────
export const PARES_DISC = [
  'Otimista × Realista (I)', 'Comunicativo × Analista (I)', 'Generalista × Detalhista (D)',
  'Estilo Agressivo × Estilo Consultivo (D)', 'Melhor em Falar × Melhor em Ouvir (I)',
  'Avesso a Rotina × Rotineiro (D)', 'Delega × Centraliza (D)', 'Compreensivo × Imparcial (S)',
  'Casual × Formal (C)', 'Foco em Relacionamentos × Foco nas Tarefas (S)',
  'Orientação a Resultados × Orientação a Processos (D)', 'Emocional × Racional (S)',
  'Dinâmico × Estável (D)', 'Age com Firmeza × Age com Consentimento (D)',
  'Comandante × Conciliador (D)', 'Assume Riscos × Prudente (D)',
  'Objetivo × Sistemático (D)', 'Cria do Zero × Aprimora o que já Existe (I)',
  'Multitarefas × Especialista (I)', 'Inspirador × Técnico (I)',
  'Extrovertido × Introvertido (I)', 'Ousado × Conservador (D)',
  'Age com Velocidade × Age com Planejamento (D)',
];

export const SUB_COMPETENCIAS_CIS = [
  { nome: 'Ousadia', dim: 'D' }, { nome: 'Comando', dim: 'D' },
  { nome: 'Objetividade', dim: 'D' }, { nome: 'Assertividade', dim: 'D' },
  { nome: 'Persuasão', dim: 'I' }, { nome: 'Extroversão', dim: 'I' },
  { nome: 'Entusiasmo', dim: 'I' }, { nome: 'Sociabilidade', dim: 'I' },
  { nome: 'Empatia', dim: 'S' }, { nome: 'Paciência', dim: 'S' },
  { nome: 'Persistência', dim: 'S' }, { nome: 'Planejamento', dim: 'S' },
  { nome: 'Organização', dim: 'C' }, { nome: 'Detalhismo', dim: 'C' },
  { nome: 'Prudência', dim: 'C' }, { nome: 'Concentração', dim: 'C' },
];

export const FAIXAS_VALIDAS = ['Muito baixo (0-20)', 'Baixo (21-40)', 'Alto (41-60)', 'Muito alto (61-80)', 'Extremamente alto (81-100)'];
export const NOMES_SUBCOMPS = new Set(SUB_COMPETENCIAS_CIS.map((s) => s.nome));

// ── Gatherers de contexto (PPP/valores) — verbatim do fase1 legado ───────────
export async function buscarContextoPPP(tdb: any, empresaNome: string, pppEscolaId: string | null | undefined = undefined) {
  try {
    // Cenário por PPP: pppEscolaId é o id do ppp_escolas a usar.
    //  - string → usa ESSE PPP.
    //  - undefined (IA1/IA2) ou null (cenário de rede no IA3) → PPP mais recente
    //    extraído (proxy de rede, comportamento histórico).
    let ppp: { extracao: any } | null = null;
    if (typeof pppEscolaId === 'string' && pppEscolaId) {
      const { data } = await tdb.from('ppp_escolas').select('extracao').eq('id', pppEscolaId).maybeSingle();
      ppp = data;
    } else {
      const { data } = await tdb.from('ppp_escolas')
        .select('extracao')
        .eq('status', 'extraido')
        .order('extracted_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      ppp = data;
    }

    if (!ppp?.extracao) return '';

    const ext = typeof ppp.extracao === 'string' ? JSON.parse(ppp.extracao) : ppp.extracao;

    // Formatar as seções mais relevantes (máx 4000 chars, como no GAS)
    const parts: string[] = [];
    let totalChars = 0;
    const MAX = 4000;

    const secoes = [
      { key: 'perfil_organizacional', label: 'PERFIL DA EMPRESA' },
      { key: 'perfil_instituicao', label: 'PERFIL DA INSTITUIÇÃO' },
      { key: 'comunidade_contexto', label: 'COMUNIDADE E CONTEXTO' },
      { key: 'mercado_stakeholders', label: 'MERCADO E STAKEHOLDERS' },
      { key: 'identidade_cultura', label: 'IDENTIDADE E CULTURA' },
      { key: 'identidade', label: 'IDENTIDADE' },
      { key: 'operacao_processos', label: 'OPERAÇÃO E PROCESSOS' },
      { key: 'praticas_descritas', label: 'PRÁTICAS DESCRITAS' },
      { key: 'desafios_estrategia', label: 'DESAFIOS E ESTRATÉGIA' },
      { key: 'desafios_metas', label: 'DESAFIOS E METAS' },
      { key: 'vocabulario_corporativo', label: 'VOCABULÁRIO' },
      { key: 'vocabulario', label: 'VOCABULÁRIO' },
      { key: 'modelo_pessoas', label: 'MODELO DE PESSOAS' },
    ];

    for (const sec of secoes) {
      if (totalChars >= MAX) break;
      let val = ext[sec.key];
      if (!val) continue;
      // Extrair conteudo se formato novo {conteudo, origem, confianca}
      if (val.conteudo !== undefined) val = val.conteudo;
      const texto = typeof val === 'string' ? val : JSON.stringify(val, null, 1);
      if (!texto || texto.length < 10) continue;
      const truncated = texto.length > 800 ? texto.substring(0, 800) + '...' : texto;
      const bloco = `## ${sec.label}\n${truncated}`;
      parts.push(bloco);
      totalChars += bloco.length;
    }

    return parts.join('\n\n');
  } catch {
    return '';
  }
}

/** Fallback quando a empresa não tem nenhum PPP extraído com valores. */
export const VALORES_DEFAULT = ['Ética e integridade', 'Respeito', 'Compromisso com resultados', 'Responsabilidade'];

/** Teto de valores no prompt: uma rede de 11 escolas soma ~86 valores (Ibipeba, 26/07). */
const MAX_VALORES_REDE = 10;

/** Chave de comparação: sem acento, sem caixa, sem pontuação. "Ética" ≡ "ETICA," */
function chaveValor(v: string): string {
  return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Entre grafias da MESMA chave, qual vai para o prompt. Determinístico e nesta
 * ordem: (1) não-gritada vence CAIXA ALTA; (2) mais curta ("Ética" > "ÉTICA,");
 * (3) capitalizada vence minúscula ("Ética" > "etica"); (4) alfabética.
 */
function melhorRotulo(a: string, b: string): string {
  const grita = (s: string) => (s === s.toUpperCase() && s !== s.toLowerCase() ? 1 : 0);
  const minuscula = (s: string) => (s[0] === s[0]?.toLowerCase() ? 1 : 0);
  const ga = grita(a), gb = grita(b);
  if (ga !== gb) return ga < gb ? a : b;
  if (a.length !== b.length) return a.length < b.length ? a : b;
  const ma = minuscula(a), mb = minuscula(b);
  if (ma !== mb) return ma < mb ? a : b;
  return a <= b ? a : b;
}

/**
 * Consolida os valores de N PPPs (1 lista por escola) no que representa a REDE.
 *
 * Ordena por em quantas ESCOLAS o valor aparece (o compartilhado define a rede;
 * a idiossincrasia de uma escola só, não), com desempate pela ordem de primeira
 * aparição — logo, para 1 PPP a saída é a lista original dedupada, e a ordem é
 * estável entre chamadas (o prompt é cacheado; ordem instável quebraria o cache).
 *
 * Dedup é lexical, não semântico: "Gestão democrática" e "Gestão democrática e
 * participativa" seguem como duas entradas. Resolver isso exigiria IA e não vale
 * o custo aqui — o contrato é uma lista curta de valores plausíveis para a rede.
 */
export function consolidarValoresDaRede(listas: string[][]): string[] {
  const acc = new Map<string, { escolas: number; rotulo: string; ordem: number }>();
  let ordem = 0;

  for (const lista of listas) {
    const vistosNestaEscola = new Set<string>(); // uma escola não conta o mesmo valor 2×
    for (const bruto of lista) {
      if (typeof bruto !== 'string') continue;
      const rotulo = bruto.trim();
      const chave = chaveValor(rotulo);
      if (!chave || vistosNestaEscola.has(chave)) continue;
      vistosNestaEscola.add(chave);

      const atual = acc.get(chave);
      if (!atual) {
        acc.set(chave, { escolas: 1, rotulo, ordem: ordem++ });
      } else {
        atual.escolas++;
        atual.rotulo = melhorRotulo(atual.rotulo, rotulo);
      }
    }
  }

  return [...acc.values()]
    .sort((a, b) => b.escolas - a.escolas || a.ordem - b.ordem)
    .slice(0, MAX_VALORES_REDE)
    .map((v) => v.rotulo);
}

/**
 * Valores institucionais da EMPRESA (não de uma escola).
 *
 * Empresa-rede tem 1 PPP por escola (Ibipeba: 11). Pegar o "mais recente"
 * autorava a régua do município inteiro com os valores de uma escola arbitrária
 * — mesmo erro que `lib/season-engine/kit/contexto-empresa.ts` já documenta e
 * resolve por consolidação. Aqui a consolidação é determinística (frequência
 * entre escolas), sem IA: são strings curtas, não texto corrido.
 */
export async function buscarValores(tdb: any, _empresaNome?: string): Promise<string[]> {
  try {
    const { data: ppps } = await tdb.from('ppp_escolas')
      .select('valores')
      .eq('status', 'extraido')
      .order('extracted_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: true });

    const listas = (ppps || [])
      .map((p: any) => (Array.isArray(p?.valores) ? p.valores : []))
      .filter((l: string[]) => l.length > 0);

    if (!listas.length) return VALORES_DEFAULT;

    const consolidados = consolidarValoresDaRede(listas);
    return consolidados.length ? consolidados : VALORES_DEFAULT;
  } catch {
    return VALORES_DEFAULT;
  }
}

// ── Contexto compartilhado do IA2 (empresa + PPP + valores + top10 + detalhe) ─
export interface ContextoIA2 {
  empresa: { nome: string; segmento?: string | null };
  contextoPPP: string;
  valores: string[];
  /** cargo (nome) → competências do Top 10 (nomes). */
  top10PorCargo: Record<string, string[]>;
  /** cargo.toLowerCase() → linha rica de cargos_empresa. */
  cargosDetalheMap: Record<string, any>;
  /** população real-only p/ a métrica de colinearidade Map×DISC. */
  colabsParaMetrica: any[];
}

/**
 * Reúne, 1×, todo o dado de tenant que a geração de gabarito consome. Espelha
 * os passos 1–4b do `rodarIA2` legado. Isolamento por `tdb` (tenant); `sbRaw` é o
 * client já resolvido (com gate no caminho síncrono OU service-role no lote) usado
 * SÓ para ler `empresas` (id é o próprio tenant). `opts.cargoNome` restringe a 1
 * cargo (modo por-cargo do runner síncrono).
 */
export async function carregarContextoIA2(
  empresaId: string,
  tdb: TenantDb,
  sbRaw: any,
  opts: { cargoNome?: string } = {},
): Promise<{ ctx?: ContextoIA2; error?: string }> {
  // 1. Buscar empresa (id é tenant — raw)
  let empresa: any;
  const { data: emp1 } = await sbRaw.from('empresas')
    .select('nome, segmento, ppp_texto').eq('id', empresaId).single();
  empresa = emp1 || (await sbRaw.from('empresas').select('nome, segmento').eq('id', empresaId).single()).data;
  if (!empresa) return { error: 'Empresa não encontrada' };

  // 2. PPP e valores
  const contextoPPP = await buscarContextoPPP(tdb, empresa.nome);
  const valores = await buscarValores(tdb, empresa.nome);

  // 3. Buscar top10 selecionadas por cargo
  const { data: top10All } = await tdb.from('top10_cargos')
    .select('cargo, competencia:competencias(nome)');

  const top10PorCargo: Record<string, string[]> = {};
  (top10All || []).forEach((t: any) => {
    if (!top10PorCargo[t.cargo]) top10PorCargo[t.cargo] = [];
    if (t.competencia?.nome) top10PorCargo[t.cargo].push(t.competencia.nome);
  });

  if (!Object.keys(top10PorCargo).length) {
    return { error: 'Nenhuma Top 10 selecionada. Rode IA1 primeiro.' };
  }

  // Modo POR-CARGO (evita timeout da Vercel em tenants com vários cargos): a UI
  // itera os cargos e chama 1 por request. Sem cargoNome, processa todos (legado).
  if (opts.cargoNome) {
    const alvo = Object.keys(top10PorCargo).find((c) => c.toLowerCase() === opts.cargoNome!.toLowerCase());
    if (!alvo) return { error: `Cargo "${opts.cargoNome}" não tem Top 10.` };
    for (const k of Object.keys(top10PorCargo)) if (k !== alvo) delete top10PorCargo[k];
  }

  // 4. Buscar dados ricos dos cargos
  const { data: cargosDetalhados } = await tdb.from('cargos_empresa').select('*');
  const cargosDetalheMap: Record<string, any> = {};
  (cargosDetalhados || []).forEach((c: any) => { cargosDetalheMap[c.nome.toLowerCase()] = c; });

  // 4b. População p/ a métrica de colinearidade Map×DISC (real-only: exclui
  // simulados e contas internas) — medida 1× e reusada por gabarito gerado.
  const { data: colabsRaw } = await tdb.from('colaboradores')
    .select(`${candidateColumns().join(', ')}, email, disc_resultados`)
    .not('d_natural', 'is', null);
  const colabsParaMetrica = (colabsRaw || []).filter((c: any) =>
    !isInternalEmail(c.email) && !String(c.disc_resultados || '').toLowerCase().includes('simulado'));

  return { ctx: { empresa, contextoPPP, valores, top10PorCargo, cargosDetalheMap, colabsParaMetrica } };
}

// ── Montagem do prompt (system + user) por cargo ─────────────────────────────
export interface MontarPromptIA2Args {
  cargoNome: string;
  /** competências priorizadas pela IA1 (nomes). */
  compNomes: string[];
  /** linha de cargos_empresa (ou {} se ausente). */
  detalhe: any;
  contextoPPP: string;
  valores: string[];
  empresa: { nome: string; segmento?: string | null };
}

/** Constrói o par (system, user) do gabarito CIS. PURA — sem I/O. */
export function montarPromptIA2({ cargoNome, compNomes, detalhe, contextoPPP, valores, empresa }: MontarPromptIA2Args): { system: string; user: string } {
  const system = `Você é um especialista em avaliação comportamental CIS/DISC com 20 anos de experiência.

TAREFA: Gerar o GABARITO COMPORTAMENTAL IDEAL para o cargo descrito.
O gabarito alimenta o assessment de competências (IA3) e o Fit v2 da Vertho.
Ele deve ser prudente, defensável e auditável.

═══ SEQUÊNCIA LÓGICA OBRIGATÓRIA ═══

Antes de montar as 4 telas, siga esta ordem mental:
1. SINAIS: Identifique 3-5 sinais explícitos do cargo (entregas, tensões, stakeholders)
2. HIPÓTESE-BASE: Forme uma leitura inicial do perfil comportamental ideal
3. INCERTEZAS: Declare onde faltam sinais ou onde há ambiguidade
4. TRADUÇÃO: Só então traduza a hipótese nas 4 telas

═══ HIERARQUIA DE FONTES ═══

1. Descrição do cargo, entregas, decisões, stakeholders, tensões (PRIMÁRIA)
2. Valores e contexto organizacional
3. Competências priorizadas pela IA1
4. Contexto PPP / dossiê institucional
5. Conhecimento comportamental geral (APENAS para refinar, NUNCA para sobrescrever sinais)

═══ REGRAS DE PRUDÊNCIA ═══

- NÃO gere perfis extremos sem evidência clara (ex: D=90 só porque "é gestor")
- Se faltar evidência para um fator, use intensidade MODERADA, não alta
- NÃO "feche demais" o perfil — incerteza é informação válida
- Cargos genéricos NÃO devem virar perfis artificialmente extremos
- Cargos diferentes na mesma empresa DEVEM ter perfis diferentes
- As 4 telas DEVEM ser coerentes entre si (ex: se tela1 indica perfil analítico, tela4 não pode ter C muito baixo sem justificativa)

═══ 4 TELAS DO GABARITO ═══

TELA 1 — Características do perfil ideal (pares de opostos)
Selecione até 20 da lista. Cada item = um polo do par:
${PARES_DISC.join(' | ')}

TELA 2 — Sub-competências CIS (6 a 10 das 16 disponíveis, NÃO todas)
${SUB_COMPETENCIAS_CIS.map((s) => `${s.nome} (${s.dim})`).join(', ')}
Faixas: "Muito baixo (0-20)" | "Baixo (21-40)" | "Alto (41-60)" | "Muito alto (61-80)" | "Extremamente alto (81-100)"
Para CADA sub-competência informe também "direcao" e "prioridade" (ver abaixo).

TELA 3 — Estilos de Liderança (soma EXATA = 100)
Executor, Motivador, Metódico, Sistemático

TELA 4 — Faixas DISC ideais (min e max pra D, I, S, C)
Mesmas faixas da Tela 2. min <= max sempre. Informe também "direcao" pra cada fator.

═══ DIREÇÃO DA FAIXA (campo "direcao" — Tela 2 e Tela 4) ═══
Como o scoring deve tratar quem fica FORA da faixa. Escolha um por item:
- "floor"   = quanto MAIS, melhor (penaliza só ABAIXO da faixa; ter de sobra é ok).
              Ex.: numa venda agressiva, Persuasão "Alto-Extremo" → floor.
- "target"  = o CENTRO é o ideal (penaliza dos DOIS lados; nem pouco, nem demais).
              Ex.: Paciência, Planejamento equilibrados → target. (use como padrão)
- "ceiling" = manter BAIXO/moderado (penaliza só ACIMA da faixa).
              Ex.: para um cargo dinâmico, Detalhismo/Concentração excessivos atrapalham → ceiling.
Na dúvida, use "target".

═══ FAMÍLIA COMANDO EM LIDERANÇA (regra dura) ═══
Aplica-se SÓ se eh_lideranca=true E SÓ aos traços da família comando: Comando,
Assertividade, Dominância (e o fator DISC "D"). Em liderança esses traços têm retorno
U-INVERTIDO — pouco E demais prejudicam; o extremo-alto vira dominação/autoritarismo,
não mais liderança ("mais é melhor" é FALSO para eles). Por isso:
1. NUNCA emita "target" + knockout no MESMO traço da família comando: o knockout sobre o
   fit de "target" elimina o extremo-ALTO como se fosse incompetência (Comando=100 → fit
   0% → reprova). Eliminatória na família comando, se houver, é só por AUSÊNCIA (lado
   baixo), JAMAIS por excesso.
2. Gate-low (knockout) na família comando SÓ onde o mínimo é categórico para a FUNÇÃO do
   cargo (ex.: um Diretor Geral sem comando não exerce o cargo → cabe; papel onde comando
   baixo é desenvolvível → NÃO use gate). Na dúvida, sem knockout (só score). Use "floor"
   como direção da família comando neste interim (o teto curvilíneo será adicionado depois).
3. FRONTEIRA — vale SÓ para a família comando. Empatia, Planejamento, Persistência,
   Organização etc. SEGUEM "floor" normal (retorno monotônico — não existe "empatia
   demais"). NÃO ponha teto/target nesses só por serem de liderança: liderança NÃO implica
   teto; só a família comando implica, porque só ela é curvilínea.

═══ PESOS DE BLOCO E ELIMINATÓRIAS (opcional, mas recomendado) ═══
- "pesos_blocos": importância relativa de cada bloco no score final. 4 números que
  SOMAM ~1.0: { "competencia", "lideranca", "disc", "mapeamento" }. Para cargo SEM
  gestão de pessoas, deixe "lideranca": 0. Calibre pelo que MAIS importa no cargo.
  ATENÇÃO: "mapeamento" é uma LENTE derivada do DISC (redundante com o bloco DISC) —
  use peso MODESTO (≤ 0,20); o peso de instrumento independente deve ir p/ competência.
- "knockouts": requisitos ELIMINATÓRIOS (use com parcimônia, só quando um bloco/traço
  é inegociável). Lista de { "scope": "block"|"trait", "key": <bloco ou nome>, "min": 0..1, "label": motivo }.
  Ex.: cargo de liderança → { "scope":"block", "key":"lideranca", "min":0.5, "label":"Aderência de liderança insuficiente" }.

═══ FORMATO JSON (APENAS JSON, sem markdown) ═══

{
  "gabarito": {
    "tela1": {
      "caracteristicas": [
        {"par": "NOME_DO_PAR", "polo_escolhido": "Comunicativo", "intensidade": "moderada", "justificativa": "frase específica", "confianca": 0.85}
      ],
      "confianca": 0.85
    },
    "tela2": {
      "subcompetencias": [
        {"nome": "Empatia", "dimensao": "S", "prioridade": "alta", "direcao": "floor", "faixa_min": "Alto (41-60)", "faixa_max": "Muito alto (61-80)", "justificativa": "Cargo exige..."}
      ],
      "confianca": 0.78
    },
    "tela3": {
      "executor": 10, "motivador": 40, "metodico": 35, "sistematico": 15,
      "estilo_predominante": "Motivador",
      "justificativa": "Entregas do cargo indicam...",
      "confianca": 0.82
    },
    "tela4": {
      "D": {"min": "Baixo (21-40)", "max": "Muito alto (61-80)", "direcao": "target"},
      "I": {"min": "Alto (41-60)", "max": "Extremamente alto (81-100)", "direcao": "floor"},
      "S": {"min": "Alto (41-60)", "max": "Muito alto (61-80)", "direcao": "target"},
      "C": {"min": "Muito baixo (0-20)", "max": "Alto (41-60)", "direcao": "ceiling"},
      "justificativa": "Perfil relacional com...",
      "confianca": 0.75
    },
    "pesos_blocos": { "competencia": 0.35, "lideranca": 0.25, "disc": 0.25, "mapeamento": 0.15 },
    "knockouts": [
      { "scope": "block", "key": "lideranca", "min": 0.5, "label": "Aderência de liderança insuficiente" }
    ]
  },
  "raciocinio_estruturado": {
    "sinais_do_caso": ["sinal 1 do contexto", "sinal 2"],
    "hipotese_base": "Leitura inicial do perfil ideal antes de traduzir nas telas",
    "incertezas": "O que faltou de informação ou onde houve ambiguidade",
    "diferenciais_vs_outros_cargos": "Como este perfil se diferencia de cargos similares"
  }
}

REGRAS DO JSON:
- confianca: 0.0 a 1.0 por tela (0.7+ = boa sustentação)
- tela2: 6 a 10 subcompetências, apenas nomes da lista oficial; cada uma com "prioridade" (alta|media|baixa) e "direcao" (floor|target|ceiling)
- tela3: executor + motivador + metodico + sistematico = EXATAMENTE 100
- tela4: min <= max pra cada fator DISC; cada fator com "direcao" (floor|target|ceiling)
- pesos_blocos: 4 números somando ~1.0 (lideranca=0 se cargo sem gestão de pessoas)
- knockouts: lista opcional de eliminatórias; use só quando um requisito é inegociável
- raciocinio_estruturado: obrigatório (auditoria humana lê isso)`;

  // ── User prompt estruturado ──
  const userBlocks: string[] = [];

  userBlocks.push(`═══ EMPRESA ═══
Nome: ${empresa.nome}
Segmento: ${empresa.segmento || 'Não informado'}`);

  userBlocks.push(`═══ CARGO-ALVO ═══
Cargo: ${cargoNome}`);

  if (detalhe.descricao || detalhe.principais_entregas || detalhe.stakeholders || detalhe.decisoes_recorrentes || detalhe.tensoes_comuns) {
    let ctx = '═══ CONTEXTO ORGANIZACIONAL ═══';
    if (detalhe.descricao) ctx += `\nDescrição do cargo: ${detalhe.descricao}`;
    if (detalhe.principais_entregas) ctx += `\nPrincipais entregas: ${detalhe.principais_entregas}`;
    if (detalhe.stakeholders) ctx += `\nStakeholders: ${detalhe.stakeholders}`;
    if (detalhe.decisoes_recorrentes) ctx += `\nDecisões recorrentes: ${detalhe.decisoes_recorrentes}`;
    if (detalhe.tensoes_comuns) ctx += `\nTensões e situações difíceis: ${detalhe.tensoes_comuns}`;
    userBlocks.push(ctx);
  }

  userBlocks.push(`═══ COMPETÊNCIAS PRIORIZADAS PELA IA1 ═══
${compNomes.join(', ')}`);

  if (contextoPPP) {
    userBlocks.push(`═══ CONTEXTO PPP / DOSSIÊ CORPORATIVO ═══\n${contextoPPP.slice(0, 2000)}`);
  }

  if (detalhe.contexto_cultural) {
    userBlocks.push(`═══ CONTEXTO CULTURAL DO CARGO ═══\n${detalhe.contexto_cultural}`);
  }

  userBlocks.push(`═══ VALORES ORGANIZACIONAIS ═══\n${valores.join(', ')}`);

  userBlocks.push(`═══ REFERÊNCIAS COMPORTAMENTAIS DISPONÍVEIS ═══
Pares: ${PARES_DISC.length} pares de opostos
Sub-competências CIS: ${SUB_COMPETENCIAS_CIS.map((s) => s.nome).join(', ')}
Estilos de Liderança: Executor, Motivador, Metódico, Sistemático
Fatores DISC: D (Dominância), I (Influência), S (Estabilidade), C (Conformidade)`);

  userBlocks.push(`═══ INSTRUÇÃO DE LEITURA ═══
1. Leia descrição e entregas. Identifique 3-5 SINAIS EXPLÍCITOS do que o cargo exige.
2. Forme HIPÓTESE-BASE do perfil ANTES de aplicar referência comportamental.
3. Declare INCERTEZAS onde faltam sinais ou há ambiguidade.
4. Use conhecimento CIS APENAS para refinar, nunca para sobrescrever sinais do caso.
5. Garanta que este perfil é DIFERENTE dos outros cargos desta empresa.
6. Tela 3: soma DEVE ser exatamente 100.
7. Tela 4: min DEVE ser <= max para cada fator.
8. Se faltar evidência para um fator, use intensidade moderada e confiança baixa.`);

  return { system, user: userBlocks.join('\n\n') };
}

// ── Validação do gabarito ────────────────────────────────────────────────────
/**
 * Valida a resposta parseada. `invalid` marca APENAS erros graves (soma da tela3
 * ≠ 100, tela4 min > max) — os que disparam o retry no caminho síncrono. `errors`
 * acumula TODOS os avisos (inclui subcomps fora da lista, contagem, confiança).
 * PURA — espelha 1:1 a validação inline do rodarIA2 legado.
 */
export function validarGabaritoIA2(resultado: any): { invalid: boolean; errors: string[] } {
  const errors: string[] = [];
  let invalid = false;
  const g = resultado?.gabarito;
  if (!g) return { invalid, errors };

  // Validar tela3: soma = 100
  const t3 = g.tela3 || {};
  const somaLid = (t3.executor || 0) + (t3.motivador || 0) + (t3.metodico || 0) + (t3.sistematico || 0);
  if (somaLid !== 100) { errors.push(`Tela3: soma liderança = ${somaLid}, deve ser 100`); invalid = true; }

  // Validar tela4: min <= max (comparar ordinal das faixas)
  const faixaOrd = (f: string) => FAIXAS_VALIDAS.indexOf(f);
  if (g.tela4) {
    for (const fator of ['D', 'I', 'S', 'C']) {
      const f = g.tela4[fator];
      if (f && faixaOrd(f.min) > faixaOrd(f.max)) {
        errors.push(`Tela4: ${fator} min (${f.min}) > max (${f.max})`);
        invalid = true;
      }
    }
  }

  // Validar tela2: subcompetências na lista oficial
  const subcomps = g.tela2?.subcompetencias || g.tela2 || [];
  if (Array.isArray(subcomps)) {
    const subNames = subcomps.map((s: any) => s.nome);
    const invalidas = subNames.filter((n: string) => !NOMES_SUBCOMPS.has(n));
    if (invalidas.length) { errors.push(`Tela2: subcompetências fora da lista: ${invalidas.join(', ')}`); }
    if (subNames.length < 6 || subNames.length > 10) { errors.push(`Tela2: ${subNames.length} subcomps (esperado 6-10)`); }
  }

  // Validar confianca
  for (const tela of ['tela1', 'tela2', 'tela3', 'tela4']) {
    const conf = g[tela]?.confianca;
    if (typeof conf === 'number' && (conf < 0 || conf > 1)) {
      errors.push(`${tela}: confiança ${conf} fora de 0-1`);
    }
  }

  return { invalid, errors };
}

// ── Persistência (validação + gravação em cargos_empresa) ────────────────────
export interface PersistirGabaritoIA2Args {
  tdb: TenantDb;
  cargoNome: string;
  /** resposta já parseada: { gabarito, raciocinio_estruturado }. */
  resultado: any;
  /** linha de cargos_empresa (ou {} se ausente). */
  detalhe: any;
  /** população real-only p/ a métrica de colinearidade. */
  colabsParaMetrica: any[];
}

/**
 * Carimba spec/colinearidade e GRAVA o gabarito em `cargos_empresa` (update por id
 * ou upsert por empresa_id,nome) — idêntico ao trecho final do rodarIA2 legado.
 * Grava sempre que houver `gabarito` (mesmo com aviso de validação, como o síncrono).
 * `ok=false` sinaliza ausência de gabarito OU validação grave (o lote registra e segue).
 */
export async function persistirGabaritoIA2({ tdb, cargoNome, resultado, detalhe, colabsParaMetrica }: PersistirGabaritoIA2Args): Promise<{ ok: boolean; error?: string; message?: string }> {
  if (!resultado?.gabarito) return { ok: false, error: 'resposta sem gabarito' };

  const { invalid, errors } = validarGabaritoIA2(resultado);

  // Calcular confiança média
  const g = resultado.gabarito;
  const confs = [g.tela1?.confianca, g.tela2?.confianca, g.tela3?.confianca, g.tela4?.confianca]
    .filter((c: any) => typeof c === 'number') as number[];
  const confMedia = confs.length ? Math.round((confs.reduce((a, b) => a + b, 0) / confs.length) * 100) / 100 : null;

  // v2 é o PADRÃO dos novos gabaritos (Mapeamento contínuo + cap de peso).
  // Legados ficam congelados (só esta geração carimba). E registra a
  // colinearidade Map×DISC medida AGORA no spec — base p/ peso adaptativo futuro.
  g.spec_version = LATEST_SPEC_VERSION;
  g.metrica_colinearidade = medirColinearidadeMapDisc(
    g, cargoNome, colabsParaMetrica, (detalhe as any).eh_lideranca,
  );

  const updateData: any = {
    gabarito: resultado.gabarito,
    raciocinio_ia2: resultado.raciocinio_estruturado || null,
    confianca_media_ia2: confMedia,
  };

  try {
    if (detalhe.id) {
      await tdb.from('cargos_empresa').update(updateData).eq('id', detalhe.id);
    } else {
      await tdb.from('cargos_empresa').upsert({
        nome: cargoNome,
        ...updateData,
      }, { onConflict: 'empresa_id,nome' });
    }
  } catch (err: any) {
    return { ok: false, error: `gravação falhou: ${err?.message || err}` };
  }

  if (invalid) return { ok: false, error: `gabarito gravado com ressalva: ${errors.join('; ')}`, message: 'gravado com aviso de validação' };
  return { ok: true, message: `gabarito de "${cargoNome}" gravado` };
}
