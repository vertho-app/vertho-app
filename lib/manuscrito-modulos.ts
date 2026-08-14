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
  opts?: { codCompAlvo?: string | null },
): Promise<{ resolvidos?: DescritorResolvido[]; avisos: string[]; error?: string }> {
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

  const linhas = (data || []) as CompetenciaRow[];
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
    return { indice: g.indice, descritorManuscrito: g.descritor, comp, matchExato };
  });
  return { resolvidos, avisos };
}

export interface ReqModulo {
  customId: string;
  descritorIdx: number;
  nivel_entrada: Nivel;
  nivel_destino: Nivel;
  descritor: string;
  comp: CompetenciaRow;
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
    grupo.transicoes.forEach((t, ti) => {
      reqs.push({
        customId: `d${di}t${ti}`,
        descritorIdx: di,
        nivel_entrada: t.nivel_entrada,
        nivel_destino: t.nivel_destino,
        descritor: grupo.descritor,
        comp,
        microblocos: t.microblocos,
        system: SYSTEM_AUTOR,
        user: montarUserPrompt(comp, t.nivel_entrada, t.nivel_destino, {
          docxTexto: t.textoFonte,
          termoCanonico,
          limiteFonte: LIMITE_FONTE_MANUSCRITO,
          contextoCargo: comp.cargo || undefined,
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
    titulo: `${ancora} · ${args.nivel_entrada}→${args.nivel_destino}`.slice(0, 120),
    descritor: ancora.slice(0, 200),
    finalidade: `Matéria-prima pedagógica do manuscrito ${args.codManuscrito} para a transição ${args.nivel_entrada}→${args.nivel_destino} em "${args.comp.nome}".`.slice(0, 400),
    // Nomeia o cargo → a auditora aplica o gancho de contexto de cargo (exemplos
    // ancorados no cargo deixam de ser "falta de universalidade").
    contexto_pedagogico: (args.comp.cargo || '').slice(0, 80) || null,
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
  const { data } = await sb
    .from('modulos_base_conteudo')
    .select(`id, ${col}, nivel_entrada, nivel_destino`)
    .in(col, opts.compIds)
    .eq('locale', opts.locale)
    .neq('status', 'obsoleto');
  return new Set((data || []).map((m: any) => `${m[col]}|${m.nivel_entrada}|${m.nivel_destino}`));
}

export const chaveModulo = (compId: string, ne: string, nd: string) => `${compId}|${ne}|${nd}`;
