/**
 * Cola entre o parser de manuscrito e a IA-autora: resolve os descritores no
 * catálogo certo, monta os prompts das 3 transições e persiste o módulo.
 *
 * Vive em `lib/` porque a task do Trigger (`gerar-modulos-manuscrito`) e a server
 * action (`criarModuloBaseDeManuscrito`) precisam do MESMO caminho de persistência
 * — duas versões do insert dos 4 blocos JSONB divergiriam em silêncio.
 *
 * Recebe o cliente Supabase por parâmetro (service-role na task, na action idem).
 * Espelha `lib/ia2-gabarito.ts`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { montarUserPrompt, SYSTEM_AUTOR, type Nivel } from '@/lib/modulo-base-autor';
import { TRANSICOES, type DescritorGroup, type ManuscritoParseResult } from '@/lib/manuscrito-parser';
import { escolherCopiaDaMatriz, chaveDoCodigoDescritor, rotuloDosCargos, caberNoLimite } from '@/lib/matriz-por-cargo';

/** As fatias por transição chegam a ~68k chars; 80k dá folga sem truncar. */
export const LIMITE_FONTE_MANUSCRITO = 80000;

/** Linha de `competencias` ou `competencias_base` — mesmos campos úteis. */
export interface CompetenciaRow {
  id: string;
  cod_comp: string;
  cod_desc: string;
  nome: string;
  nome_curto?: string | null;
  pilar?: string | null;
  cargo?: string | null;
  segmento?: string | null;
  descricao?: string | null;
  descritor_completo?: string | null;
  n1_gap?: string | null;
  n2_desenvolvimento?: string | null;
  n3_meta?: string | null;
  n4_referencia?: string | null;
  evidencias_esperadas?: string | null;
}

export interface DescritorResolvido {
  indice: number;
  /** Nome como veio do cabeçalho do microbloco. */
  descritorManuscrito: string;
  /** Linha do catálogo. */
  comp: CompetenciaRow;
  /** true = casou também pelo `nome_curto`, não só pela ordem. */
  matchExato: boolean;
  /**
   * Ids deste descritor em TODAS as cópias idênticas da matriz (inclui `comp.id`).
   * O módulo-base é por matriz: a idempotência tem de reconhecer o módulo ancorado
   * em qualquer cópia, senão copiar a matriz para outro cargo e reimportar duplica.
   */
  idsEquivalentes?: string[];
  /** Cargos que compartilham esta matriz (vazio/ausente = só o cargo da linha). */
  cargosDaMatriz?: string[];
  /**
   * true = modo DESCRITOR ÚNICO: o manuscrito inteiro é de UM descritor do modelo e os
   * capítulos são subtemas dele. Todos os capítulos compartilham a mesma `comp`.
   */
  descritorUnico?: true;
}

/**
 * Resolve os descritores do manuscrito contra o catálogo.
 *
 * `empresaId` preenchido → tabela `competencias` (modelo da empresa; é onde vivem
 * os manuscritos da rede, SED01-SED12). Nulo → `competencias_base` (canônico).
 *
 * O casamento é **por ordem de `cod_desc`**, não por nome: `WHERE cod_comp='SED08'`
 * devolve exatamente as 6 linhas, na ordem dos 6 capítulos. O `nome_curto` serve
 * de conferência — divergência vira aviso, não erro (a Ju pode ter reescrito o
 * título do descritor no manuscrito sem mexer no banco).
 */
export async function resolverDescritores(
  sb: SupabaseClient,
  parse: ManuscritoParseResult,
  empresaId?: string | null,
  opts?: { codCompAlvo?: string | null; cargo?: string | null; descritorUnico?: string | null },
): Promise<{ resolvidos?: DescritorResolvido[]; avisos: string[]; error?: string; cargosDisponiveis?: string[] }> {
  if (opts?.descritorUnico) {
    return resolverDescritorUnico(sb, parse, empresaId, opts.descritorUnico, opts.cargo);
  }
  const tabela = empresaId ? 'competencias' : 'competencias_base';
  // O código do manuscrito e o código do catálogo do tenant podem divergir: o
  // manuscrito de Gerenciamento de Conflitos vem como DIR08 (numeração do
  // material autoral do cargo) e a matriz de Macaé usa C007. O mapeamento é
  // EXPLÍCITO, nunca adivinhado por semelhança de nome — errar aqui grava 24
  // módulos ancorados na competência errada, e nada na tela acusaria.
  const codAlvo = opts?.codCompAlvo || parse.cod_comp;
  let q = sb.from(tabela).select('*').eq('cod_comp', codAlvo);
  if (empresaId) {
    q = q.eq('empresa_id', empresaId);
    // Linha SEM `cod_desc` não é descritor — é o registro antigo da competência
    // (formato pré-matriz, uma linha por competência), preservado porque
    // `respostas.competencia_id` aponta para ele. Contá-la faria a conferência
    // "manuscrito tem 8, banco tem 9" reprovar um casamento correto.
    q = q.not('cod_desc', 'is', null);
  }
  const { data, error } = await q.order('cod_desc');
  if (error) return { avisos: [], error: error.message };

  let linhas = (data || []) as CompetenciaRow[];
  // A matriz é gravada POR CARGO: a mesma matriz em 2 cargos devolve 12 linhas
  // para 6 descritores. O módulo-base é por matriz — ancora numa cópia e registra
  // as equivalentes; cópias DIFERENTES com o mesmo código pedem a escolha do cargo.
  let cargosDaMatriz: string[] = [];
  let idsPorDescritor = new Map<string, string[]>();
  if (empresaId && linhas.length) {
    const copia = escolherCopiaDaMatriz(linhas, opts?.cargo);
    if ('erro' in copia) return { avisos: [], error: `${codAlvo}: ${copia.erro}`, cargosDisponiveis: copia.cargosDisponiveis };
    linhas = copia.linhas;
    cargosDaMatriz = copia.cargos;
    idsPorDescritor = copia.idsPorDescritor;
  }
  if (!linhas.length) {
    return { avisos: [], error: `Competência ${codAlvo} não encontrada em ${tabela}${empresaId ? ' para esta empresa' : ''}.` };
  }
  if (linhas.length !== parse.descritores.length) {
    return {
      avisos: [],
      error: `O manuscrito tem ${parse.descritores.length} descritores, mas ${codAlvo} tem ${linhas.length} em ${tabela}. Corrija antes de gerar.`,
    };
  }

  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const avisos: string[] = [];
  if (codAlvo !== parse.cod_comp) {
    avisos.push(`Manuscrito ${parse.cod_comp} gravado sob a competência ${codAlvo} do catálogo (mapeamento explícito).`);
  }
  const resolvidos = parse.descritores.map((g, i) => {
    const comp = linhas[i];
    const matchExato = norm(comp.nome_curto || '') === norm(g.descritor);
    if (!matchExato) {
      avisos.push(`Descritor ${i + 1}: manuscrito diz "${g.descritor}", banco diz "${comp.nome_curto}" (${comp.cod_desc}). Casado pela ordem.`);
    }
    return {
      indice: g.indice, descritorManuscrito: g.descritor, comp, matchExato,
      idsEquivalentes: idsPorDescritor.get(chaveDoCodigoDescritor(comp.cod_desc)) ?? [comp.id],
      cargosDaMatriz,
    };
  });
  if (cargosDaMatriz.length > 1) {
    avisos.push(`Matriz compartilhada por ${cargosDaMatriz.length} cargos (${cargosDaMatriz.join(', ')}): os módulos servem a todos.`);
  }
  return { resolvidos, avisos };
}

/**
 * Modo DESCRITOR ÚNICO (02/10/2026): o manuscrito é de UM descritor do modelo da empresa e os
 * capítulos são SUBTEMAS dele (QPM01 → CN_01_06 "Questionamento propositivo…", 6 capítulos).
 *
 * O casamento normal é por ORDEM de `cod_desc` e exige capítulos == descritores da competência.
 * Num manuscrito de um descritor só isso ancora o capítulo 1 em CN_01_01, o 3 em CN_01_03… —
 * módulo no descritor errado, sem erro e sem sintoma até o conteúdo entregue meses depois.
 * Aqui o descritor é DECLARADO (nunca inferido), tem de existir exatamente uma vez no modelo
 * (depois da escolha da cópia da matriz) e recebe todos os capítulos.
 */
async function resolverDescritorUnico(
  sb: SupabaseClient,
  parse: ManuscritoParseResult,
  empresaId: string | null | undefined,
  codDesc: string,
  cargo?: string | null,
): Promise<{ resolvidos?: DescritorResolvido[]; avisos: string[]; error?: string; cargosDisponiveis?: string[] }> {
  if (!empresaId) {
    return { avisos: [], error: `Modo descritor único exige empresa: ${codDesc} é do modelo do tenant, não do catálogo base.` };
  }
  const { data, error } = await sb.from('competencias').select('*').eq('empresa_id', empresaId).eq('cod_desc', codDesc);
  if (error) return { avisos: [], error: error.message };
  const encontradas = (data || []) as CompetenciaRow[];
  if (!encontradas.length) {
    return { avisos: [], error: `Descritor ${codDesc} não encontrado em competencias para esta empresa.` };
  }
  const copia = escolherCopiaDaMatriz(encontradas, cargo);
  if ('erro' in copia) return { avisos: [], error: `${codDesc}: ${copia.erro}`, cargosDisponiveis: copia.cargosDisponiveis };
  if (copia.linhas.length !== 1) {
    return { avisos: [], error: `${codDesc} resolve para ${copia.linhas.length} linhas depois de escolher a cópia da matriz; esperava exatamente 1.` };
  }
  const comp = copia.linhas[0];
  const ids = copia.idsPorDescritor.get(chaveDoCodigoDescritor(comp.cod_desc)) ?? [comp.id];
  const resolvidos: DescritorResolvido[] = parse.descritores.map((g) => ({
    indice: g.indice, descritorManuscrito: g.descritor, comp, matchExato: false,
    idsEquivalentes: ids, cargosDaMatriz: copia.cargos, descritorUnico: true,
  }));
  const avisos = [
    `Modo descritor único: os ${parse.descritores.length} capítulos do manuscrito ${parse.cod_comp} ficam TODOS ancorados em ${comp.cod_desc} "${comp.nome_curto}".`,
  ];
  if (copia.cargos.length > 1) {
    avisos.push(`Matriz compartilhada por ${copia.cargos.length} cargos (${copia.cargos.join(', ')}): os módulos servem a todos.`);
  }
  return { resolvidos, avisos };
}

export interface ReqModulo {
  customId: string;
  descritorIdx: number;
  nivel_entrada: Nivel;
  nivel_destino: Nivel;
  descritor: string;
  comp: CompetenciaRow;
  /** Ids do descritor em todas as cópias idênticas da matriz (idempotência). */
  idsEquivalentes: string[];
  /** Cargo(s) que o módulo serve — vai para a autoria e para `contexto_pedagogico`. */
  contextoCargo: string;
  /**
   * Só no modo descritor único: o título do capítulo. Vários módulos compartilham descritor e
   * transição, então é ele que distingue um do outro (título e idempotência).
   */
  tituloCapitulo?: string;
  microblocos: string[];
  system: string;
  user: string;
}

/**
 * Monta os 3 × N prompts (um por transição de cada descritor). O `customId` é
 * posicional (`d0t1`) porque nomes de descritor têm espaço e acento.
 */
export function montarReqsManuscrito(opts: {
  parse: ManuscritoParseResult;
  resolvidos: DescritorResolvido[];
  termoCanonico?: string;
  /** Só estes descritores (1-based). Vazio/ausente = todos. */
  apenasDescritores?: number[];
}): ReqModulo[] {
  const { parse, resolvidos, termoCanonico, apenasDescritores } = opts;
  const filtro = new Set(apenasDescritores || []);
  const reqs: ReqModulo[] = [];

  parse.descritores.forEach((grupo: DescritorGroup, di) => {
    if (filtro.size && !filtro.has(grupo.indice)) return;
    const { comp } = resolvidos[di];
    // Com um cargo só, é exatamente `comp.cargo` (texto do prompt idêntico ao de antes).
    const contextoCargo = rotuloDosCargos(resolvidos[di].cargosDaMatriz, comp.cargo);
    grupo.transicoes.forEach((t, ti) => {
      reqs.push({
        customId: `d${di}t${ti}`,
        descritorIdx: di,
        nivel_entrada: t.nivel_entrada,
        nivel_destino: t.nivel_destino,
        descritor: grupo.descritor,
        comp,
        idsEquivalentes: resolvidos[di].idsEquivalentes ?? [comp.id],
        contextoCargo,
        tituloCapitulo: resolvidos[di].descritorUnico ? grupo.descritor : undefined,
        microblocos: t.microblocos,
        system: SYSTEM_AUTOR,
        user: montarUserPrompt(comp, t.nivel_entrada, t.nivel_destino, {
          docxTexto: t.textoFonte,
          termoCanonico,
          limiteFonte: LIMITE_FONTE_MANUSCRITO,
          contextoCargo: contextoCargo || undefined,
        }),
      });
    });
  });
  return reqs;
}

/** Confere `TRANSICOES` — se alguém mexer no parser, isto quebra alto. */
export const TRANSICOES_POR_DESCRITOR = TRANSICOES.length;

/**
 * Insere o módulo rascunho. Polimórfico: `empresaId` decide se a competência é
 * da empresa (`competencia_id`) ou canônica (`competencia_base_id`).
 */
export async function persistirModuloDeManuscrito(
  sb: SupabaseClient,
  args: {
    comp: CompetenciaRow;
    empresaId?: string | null;
    nivel_entrada: Nivel;
    nivel_destino: Nivel;
    locale: string;
    descritor: string;
    corpo: { conteudo_central: any; conteudo_aplicavel: any; guarda_corpos: any; adaptacao_por_formato: any };
    codManuscrito: string;
    microblocos: string[];
    createdBy: string;
    /** Cargo(s) que o módulo serve. Ausente = o cargo da linha (comportamento de antes). */
    contextoCargo?: string | null;
    /** Modo descritor único: título do capítulo. Ausente = título pelo descritor (comportamento de antes). */
    tituloCapitulo?: string | null;
  },
): Promise<{ id?: string; error?: string }> {
  const isEmpresa = !!args.empresaId;
  // O campo `descritor` é a ÂNCORA do resolver de conteúdo — recebe o
  // `nome_curto` da RÉGUA, não o rótulo do manuscrito. No DIR08 os dois
  // coincidem a menos de caixa/acento (e `norm()` do resolver absorve isso),
  // mas essa coincidência é sorte, não contrato: a autora pode reescrever o
  // título do capítulo sem mexer no banco — é justamente por isso que
  // `resolverDescritores` trata divergência de nome como aviso e casa por
  // ordem. Gravar o rótulo faria o conteúdo ancorar no descritor vizinho, e a
  // correção depois exige RECALCULAR `descritor_embedding` (F-I12).
  const ancora = (args.comp.nome_curto || args.descritor || '').trim() || args.descritor;
  const row = {
    empresa_id: args.empresaId || null,
    locale: args.locale,
    competencia_base_id: isEmpresa ? null : args.comp.id,
    competencia_id: isEmpresa ? args.comp.id : null,
    nivel_entrada: args.nivel_entrada,
    nivel_destino: args.nivel_destino,
    // Descritor único: 6 módulos dividem descritor e transição, então o título leva o CAPÍTULO.
    // O `descritor` segue sendo a âncora da régua — título editorial nunca vai nele.
    titulo: args.tituloCapitulo
      ? tituloDoModuloDeCapitulo(args.tituloCapitulo, args.nivel_entrada, args.nivel_destino)
      : `${ancora} · ${args.nivel_entrada}→${args.nivel_destino}`.slice(0, 120),
    descritor: ancora.slice(0, 200),
    finalidade: (args.tituloCapitulo
      ? `Matéria-prima pedagógica do manuscrito ${args.codManuscrito}, capítulo "${args.tituloCapitulo.trim()}", para a transição ${args.nivel_entrada}→${args.nivel_destino} em "${ancora}".`
      : `Matéria-prima pedagógica do manuscrito ${args.codManuscrito} para a transição ${args.nivel_entrada}→${args.nivel_destino} em "${args.comp.nome}".`).slice(0, 400),
    // Nomeia o cargo → a auditora aplica o gancho de contexto de cargo (exemplos
    // ancorados no cargo deixam de ser "falta de universalidade"). Matriz
    // compartilhada: todos os cargos, para o bônus de cargo do resolver valer a cada um.
    // CHECK da mig 122: no máximo 80 caracteres — só cargos INTEIROS que caibam.
    contexto_pedagogico: caberNoLimite(args.contextoCargo ?? args.comp.cargo ?? '', 80) || null,
    tags: ['importado-manuscrito', args.codManuscrito.slice(0, 40), ...args.microblocos.slice(0, 8)],
    conteudo_central: args.corpo.conteudo_central,
    conteudo_aplicavel: args.corpo.conteudo_aplicavel,
    guarda_corpos: args.corpo.guarda_corpos,
    adaptacao_por_formato: args.corpo.adaptacao_por_formato,
    created_by: args.createdBy,
    status: 'rascunho',
  };
  const { data, error } = await sb.from('modulos_base_conteudo').insert(row).select('id').single();
  if (error) return { error: error.message };
  return { id: data.id };
}

/**
 * Módulos já existentes para esta competência, por transição. Chave natural:
 * (competência, nivel_entrada, nivel_destino, locale) — não há UNIQUE no banco
 * (só `(grupo_id, locale)`), então a idempotência mora aqui.
 */
export async function modulosExistentes(
  sb: SupabaseClient,
  opts: { compIds: string[]; empresaId?: string | null; locale: string },
): Promise<Set<string>> {
  const col = opts.empresaId ? 'competencia_id' : 'competencia_base_id';
  const { data, error } = await sb
    .from('modulos_base_conteudo')
    .select(`id, ${col}, nivel_entrada, nivel_destino, titulo`)
    .in(col, opts.compIds)
    .eq('locale', opts.locale)
    .neq('status', 'obsoleto');
  // O supabase-js RETORNA o erro. Sem esta checagem uma leitura que falha virava "nenhum módulo
  // existe", a idempotência abria e reimportar GERAVA (e pagava) tudo de novo, em duplicata.
  // Aqui é construção (admin/task, com retry): falha alto.
  if (error) throw new Error(`modulosExistentes: ${error.message}`);
  // Duas chaves por módulo: a antiga (competência|transição) e a COM TÍTULO. O modo descritor
  // único usa a segunda — a antiga colidiria (vários capítulos por transição).
  const chaves = new Set<string>();
  for (const m of (data || []) as any[]) {
    chaves.add(`${m[col]}|${m.nivel_entrada}|${m.nivel_destino}`);
    if (m.titulo) chaves.add(`${m[col]}|${m.nivel_entrada}|${m.nivel_destino}|${m.titulo}`);
  }
  return chaves;
}

export const chaveModulo = (compId: string, ne: string, nd: string, titulo?: string | null) =>
  titulo ? `${compId}|${ne}|${nd}|${titulo}` : `${compId}|${ne}|${nd}`;

/**
 * O módulo desta transição já existe em QUALQUER cópia idêntica da matriz? Com `titulo` (modo
 * descritor único), a pergunta é por CAPÍTULO: o título tem de ser o mesmo que `persistir…` grava.
 */
export const moduloJaExiste = (existentes: Set<string>, ids: string[], ne: string, nd: string, titulo?: string | null) =>
  ids.some((id) => existentes.has(chaveModulo(id, ne, nd, titulo)));

/** O título que `persistirModuloDeManuscrito` grava no modo descritor único (mesma conta, num lugar só). */
export const tituloDoModuloDeCapitulo = (capitulo: string, ne: string, nd: string) =>
  `${capitulo.trim()} · ${ne}→${nd}`.slice(0, 120);
