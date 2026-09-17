/**
 * A matriz de competências é gravada POR CARGO — fonte única de como lê-la.
 *
 * Por que existe (16/09/2026): `competencias` tem uma linha por descritor, com a
 * coluna `cargo`. "A mesma matriz em dois cargos" (professora e auxiliar com a
 * mesma régua, cada um com o seu cenário) são duas CÓPIAS com o mesmo `cod_comp`
 * na mesma empresa. Até então nenhum tenant tinha isso — medido: 1 `cod_comp` em
 * 2 cargos no banco inteiro, sem descritores —, e três lugares quebravam em
 * silêncio no primeiro que tivesse:
 *
 * - o import por CSV deduplicava por `cod_comp`+descritor e respondia
 *   "0 novas (todas já existiam)" para a matriz do 2º cargo;
 * - 8 leituras buscavam descritores só por `cod_comp`: a IA3 receberia
 *   "distribua os 12 descritores" em vez de 6, e a IA4 pontuaria contra régua
 *   repetida;
 * - o IA1 casava a seleção da IA contra a matriz da EMPRESA inteira e podia gravar
 *   em `top10_cargos` a linha de outro cargo — a pessoa ficava sem cenário.
 *
 * Guard: `tests/unit/security/descritor-sem-cargo-guard.test.ts`.
 *
 * O MÓDULO-BASE é feito uma vez POR MATRIZ (decisão do dono, 16/09/2026): serve a
 * todas as cópias idênticas, em qualquer cargo. O conteúdo que a pessoa recebe
 * (texto, kit, vídeo) continua por cargo. "Idêntica" é pela ASSINATURA, não pelo
 * código: dois cargos podem reusar `C001` com descritores diferentes, e o mesmo
 * NOME de competência já existe com réguas diferentes (Ibipeba, "Autocuidado e
 * resiliência emocional" em COO03 e DIR02: 5 descritores homônimos, 0 réguas iguais).
 */

import { chaveDescritor } from '@/lib/descritores';

/** Uma linha de `competencias` (competência ou descritor) com o que a escolha precisa. */
export interface LinhaDaMatriz {
  id?: string;
  cargo?: string | null;
  cod_comp?: string | null;
  cod_desc?: string | null;
  nome_curto?: string | null;
  n1_gap?: string | null;
  n2_desenvolvimento?: string | null;
  n3_meta?: string | null;
  n4_referencia?: string | null;
}

const normCargo = (s?: string | null) => String(s || '').trim().toLowerCase();
const normCodigo = (s?: string | null) => String(s || '').trim().toUpperCase();

/**
 * Assinatura de UMA cópia da matriz (as linhas de um cargo × `cod_comp`): o código
 * e, ordenados, os pares `cod_desc|nome do descritor normalizado`. Duas cópias são a
 * mesma matriz só com assinatura igual.
 */
export function assinaturaDaMatriz(linhas: LinhaDaMatriz[]): string {
  const cod = normCodigo(linhas.find((l) => l.cod_comp)?.cod_comp);
  const descritores = linhas
    .filter((l) => l.cod_desc)
    .map((l) => `${normCodigo(l.cod_desc)}|${chaveDescritor(l.nome_curto || '')}`)
    .sort();
  return `${cod}::${descritores.join(';')}`;
}

/** Agrupa linhas em cópias (cargo × código) com a assinatura de cada uma. */
function copiasDaMatriz<T extends LinhaDaMatriz>(linhas: T[]) {
  const grupos = new Map<string, T[]>();
  for (const l of linhas) {
    const chave = `${normCargo(l.cargo)}::${normCodigo(l.cod_comp)}`;
    const g = grupos.get(chave);
    if (g) g.push(l); else grupos.set(chave, [l]);
  }
  return [...grupos.values()].map((g) => ({ cargo: g[0].cargo ?? null, linhas: g, assinatura: assinaturaDaMatriz(g) }));
}

const porNomeDeCargo = (a?: string | null, b?: string | null) => String(a || '').localeCompare(String(b || ''), 'pt-BR');

/**
 * Para GRAVAR matéria-prima de uma competência (import de manuscrito): escolhe a
 * cópia da matriz onde ancorar, e devolve as cópias idênticas que ela representa.
 * - `cargo` informado → a cópia daquele cargo;
 * - várias cópias idênticas → a do 1º cargo em ordem alfabética (determinístico:
 *   reimportar ancora no mesmo lugar);
 * - cópias DIFERENTES com o mesmo código e sem cargo → erro com os cargos, para a
 *   tela oferecer a escolha em vez de adivinhar.
 * `linhas` = as linhas do código na empresa, de todos os cargos, na ordem desejada.
 */
export function escolherCopiaDaMatriz<T extends LinhaDaMatriz>(
  linhas: T[],
  cargo?: string | null,
):
  | { linhas: T[]; cargos: string[]; idsPorDescritor: Map<string, string[]> }
  | { erro: string; cargosDisponiveis: string[] } {
  const copias = copiasDaMatriz(linhas);
  const cargosDisponiveis = copias.map((c) => String(c.cargo || '')).sort(porNomeDeCargo);
  let escolhida = copias[0];
  if (cargo) {
    escolhida = copias.find((c) => normCargo(c.cargo) === normCargo(cargo))!;
    if (!escolhida) {
      return { erro: `O cargo "${cargo}" não tem esta competência. Cargos que têm: ${cargosDisponiveis.join(', ')}.`, cargosDisponiveis };
    }
  } else if (copias.length > 1) {
    if (new Set(copias.map((c) => c.assinatura)).size > 1) {
      return {
        erro: `Esta competência existe em ${copias.length} cargos com descritores diferentes (${cargosDisponiveis.join(', ')}). Escolha o cargo.`,
        cargosDisponiveis,
      };
    }
    escolhida = [...copias].sort((a, b) => porNomeDeCargo(a.cargo, b.cargo))[0];
  }
  if (!escolhida) return { linhas: [], cargos: [], idsPorDescritor: new Map() };

  const equivalentes = copias.filter((c) => c.assinatura === escolhida.assinatura);
  const idsPorDescritor = new Map<string, string[]>();
  for (const c of equivalentes) {
    for (const l of c.linhas) {
      if (!l.cod_desc || !l.id) continue;
      const k = normCodigo(l.cod_desc);
      const ids = idsPorDescritor.get(k);
      if (ids) ids.push(l.id); else idsPorDescritor.set(k, [l.id]);
    }
  }
  const daEscolhida = new Set<T>(escolhida.linhas);
  return {
    linhas: linhas.filter((l) => daEscolhida.has(l)),
    cargos: equivalentes.map((c) => String(c.cargo || '')).filter(Boolean).sort(porNomeDeCargo),
    idsPorDescritor,
  };
}

const SEPARADOR_CARGOS = ' · ';

/** Linha de `competencias` com o que o catálogo da extração precisa. */
export interface LinhaDoCatalogo extends LinhaDaMatriz {
  id: string;
  nome?: string | null;
  pilar?: string | null;
  descricao?: string | null;
  descritor_completo?: string | null;
}

/** Uma MATRIZ no catálogo que a extração oferece à IA. */
export interface EntradaDoCatalogo {
  /** Linha onde o módulo ancora (determinística). */
  id: string;
  nome: string;
  pilar: string | null;
  descricao: string | null;
  descritor_completo: string | null;
  /** Cargos que têm esta matriz (cópias idênticas). */
  cargos: string[];
  /** Nome, com os cargos quando o nome se repete em matrizes diferentes. */
  rotulo: string;
  /** Descritores SÓ desta matriz: nome curto + descrição longa (contexto). */
  descritores: Array<{ nome_curto: string; descricao_longa: string | null }>;
}

const normNome = (s?: string | null) => String(s || '').trim().toLowerCase();

/**
 * Catálogo de competências da EMPRESA para a extração de material → módulo-base:
 * UMA ENTRADA POR MATRIZ, não por nome.
 *
 * Por que existe (16/09/2026): o catálogo agrupava por NOME, ficava com a 1ª linha
 * e juntava os descritores de todos os cargos daquele nome. Em Ibipeba
 * ("Autocuidado e resiliência emocional" em COO03 e DIR02, descritores homônimos
 * e réguas diferentes) o módulo ancorava num cargo qualquer e o descritor podia
 * sair da matriz do outro. Agora:
 * - cópias idênticas (a mesma matriz em vários cargos) são UMA entrada — o
 *   módulo-base é por matriz — ancorada na cópia do 1º cargo em ordem alfabética;
 * - mesmo nome com descritores diferentes são entradas SEPARADAS, cada uma com os
 *   seus descritores e o cargo no rótulo;
 * - `cargo` informado → só as matrizes desse cargo.
 * `nomeParaId` só resolve nome que aponta para UMA entrada: nome ambíguo não é
 * resolvido por nome.
 */
export function montarCatalogoDaEmpresa(
  linhas: LinhaDoCatalogo[],
  opts: { cargo?: string | null } = {},
): { entradas: EntradaDoCatalogo[]; nomeParaId: Map<string, string> } {
  const doEscopo = opts.cargo ? linhas.filter((l) => normCargo(l.cargo) === normCargo(opts.cargo)) : linhas;
  const porMatriz = new Map<string, ReturnType<typeof copiasDaMatriz<LinhaDoCatalogo>>>();
  for (const copia of copiasDaMatriz(doEscopo)) {
    const lista = porMatriz.get(copia.assinatura);
    if (lista) lista.push(copia); else porMatriz.set(copia.assinatura, [copia]);
  }

  const entradas: EntradaDoCatalogo[] = [];
  for (const copias of porMatriz.values()) {
    const ordenadas = [...copias].sort((a, b) => porNomeDeCargo(a.cargo, b.cargo));
    const base = [...ordenadas[0].linhas].sort((a, b) => String(a.cod_desc || '').localeCompare(String(b.cod_desc || '')));
    // Âncora: a linha-competência (sem cod_desc) quando existe; senão o 1º descritor.
    const ancora = base.find((l) => !l.cod_desc) || base[0];
    const nome = String(ancora.nome || base.find((l) => l.nome)?.nome || '').trim();
    if (!nome) continue;
    const descritores: EntradaDoCatalogo['descritores'] = [];
    for (const l of base) {
      // Descritor oficial = nome_curto; cai para a descrição longa só se faltar.
      const curto = String(l.nome_curto || '').trim() || String(l.descritor_completo || '').trim();
      if (!curto || descritores.some((d) => d.nome_curto === curto)) continue;
      const longo = String(l.descritor_completo || '').trim();
      descritores.push({ nome_curto: curto, descricao_longa: longo && longo !== curto ? longo : null });
    }
    entradas.push({
      id: ancora.id,
      nome,
      pilar: base.find((l) => l.pilar)?.pilar ?? null,
      descricao: base.find((l) => l.descricao)?.descricao ?? null,
      descritor_completo: ancora.descritor_completo ?? base.find((l) => l.descritor_completo)?.descritor_completo ?? null,
      cargos: ordenadas.map((c) => String(c.cargo || '')).filter(Boolean),
      rotulo: nome,
      descritores,
    });
  }

  const porNome = new Map<string, EntradaDoCatalogo[]>();
  for (const e of entradas) {
    const k = normNome(e.nome);
    const lista = porNome.get(k);
    if (lista) lista.push(e); else porNome.set(k, [e]);
  }
  const nomeParaId = new Map<string, string>();
  for (const [k, lista] of porNome) {
    if (lista.length === 1) { nomeParaId.set(k, lista[0].id); continue; }
    for (const e of lista) e.rotulo = `${e.nome} (${e.cargos.join(', ') || 'sem cargo'})`;
  }
  entradas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
  return { entradas, nomeParaId };
}

/**
 * Nomes que, no catálogo, apontam para MAIS DE UMA matriz — com os cargos de cada.
 * Direcionar a extração para um desses nomes sem cargo é ambíguo.
 */
export function nomesAmbiguos(entradas: EntradaDoCatalogo[]): Map<string, string[]> {
  const porNome = new Map<string, EntradaDoCatalogo[]>();
  for (const e of entradas) {
    const k = normNome(e.nome);
    const lista = porNome.get(k);
    if (lista) lista.push(e); else porNome.set(k, [e]);
  }
  const out = new Map<string, string[]>();
  for (const [, lista] of porNome) {
    if (lista.length > 1) out.set(lista[0].nome, lista.flatMap((e) => e.cargos).sort(porNomeDeCargo));
  }
  return out;
}

/** Rótulo dos cargos que uma matéria-prima serve (autoria e `contexto_pedagogico`). */
export function rotuloDosCargos(cargos: string[] | null | undefined, cargoDaLinha?: string | null): string {
  return (cargos && cargos.length ? cargos.join(SEPARADOR_CARGOS) : String(cargoDaLinha || '')).trim();
}

/**
 * Corta um rótulo de cargos num limite SEM partir nome de cargo: um nome pela
 * metade não casa com nada no bônus de cargo do resolver. Se nem o 1º cabe, corta
 * ele mesmo (melhor que vazio).
 */
export function caberNoLimite(rotulo: string, limite: number): string {
  const texto = String(rotulo || '').trim();
  if (texto.length <= limite) return texto;
  const partes = texto.split(SEPARADOR_CARGOS);
  let saida = '';
  for (const p of partes) {
    const candidato = saida ? `${saida}${SEPARADOR_CARGOS}${p}` : p;
    if (candidato.length > limite) break;
    saida = candidato;
  }
  return saida || texto.slice(0, limite);
}

/** Chave de um descritor por código, como `escolherCopiaDaMatriz` indexa. */
export function chaveDoCodigoDescritor(codDesc?: string | null): string {
  return normCodigo(codDesc);
}

/**
 * Ids de TODAS as cópias que são a mesma matriz do `cargo` (inclusive as de outros
 * cargos). `linhas` = as linhas da competência na empresa, de todos os cargos.
 * Cargo sem cópia → lista vazia: nada de outro cargo entra por aproximação.
 */
export function idsDasCopiasEquivalentes(linhas: LinhaDaMatriz[], cargo: string): string[] {
  const copias = copiasDaMatriz(linhas);
  const alvo = normCargo(cargo);
  const assinaturas = new Set(copias.filter((c) => normCargo(c.cargo) === alvo).map((c) => c.assinatura));
  return copias
    .filter((c) => assinaturas.has(c.assinatura))
    .flatMap((c) => c.linhas.map((l) => l.id))
    .filter((id): id is string => Boolean(id));
}

const mesmaRegua = (a: LinhaDaMatriz, b: LinhaDaMatriz) =>
  (a.n1_gap ?? null) === (b.n1_gap ?? null) && (a.n2_desenvolvimento ?? null) === (b.n2_desenvolvimento ?? null)
  && (a.n3_meta ?? null) === (b.n3_meta ?? null) && (a.n4_referencia ?? null) === (b.n4_referencia ?? null);

/**
 * Escolhe a linha de UM descritor entre as candidatas de mesmo nome, sem sortear:
 * 1. o descritor da trilha traz o código (`COO03_D1 — Consciência de limites`) →
 *    a linha daquele código;
 * 2. a linha do cargo da pessoa;
 * 3. todas as candidatas com a MESMA régua → qualquer uma (cópias idênticas);
 * 4. senão, nenhuma: réguas diferentes em cargos que não são o da pessoa são
 *    ambiguidade, e régua de outro cargo pontua contra o critério errado.
 *
 * Até 16/09 a leitura era "última linha vence": medido em Ibipeba, a coordenadora
 * recebia a régua de Gestão Escolar em 5 dos 6 descritores de Autocuidado.
 */
export function escolherLinhaDaRegua<T extends LinhaDaMatriz>(
  candidatas: T[],
  opts: { cargo?: string | null; descritor?: string | null },
): { linha: T | null; motivo?: 'sem-linha' | 'ambigua' } {
  if (!candidatas.length) return { linha: null, motivo: 'sem-linha' };
  // Token exato, não `includes`: `COO03_D1` não pode casar dentro de `COO03_D10`.
  const tokens = new Set(normCodigo(opts.descritor).split(/[^A-Z0-9_.]+/).filter(Boolean));
  const porCodigo = candidatas.filter((c) => c.cod_desc && tokens.has(normCodigo(c.cod_desc)));
  if (porCodigo.length === 1) return { linha: porCodigo[0] };
  const pool = porCodigo.length > 1 ? porCodigo : candidatas;
  const doCargo = opts.cargo ? pool.filter((c) => normCargo(c.cargo) === normCargo(opts.cargo)) : [];
  if (doCargo.length) return { linha: doCargo[0] };
  if (pool.every((c) => mesmaRegua(c, pool[0]))) return { linha: pool[0] };
  return { linha: null, motivo: 'ambigua' };
}

export interface CompetenciaDaMatriz {
  cod_comp?: string | null;
  cargo?: string | null;
}

/**
 * Descritores de UMA competência, na matriz do cargo dela.
 *
 * O cargo é o da LINHA da competência (`comp.cargo`), nunca o do colaborador: o
 * trilho de liderança avalia contra a variante da matriz ("Futuro Líder"), não
 * contra o cargo da pessoa.
 *
 * Sem `order` de propósito: cenários já gravados citam os descritores por
 * POSIÇÃO (`descritores_primarios: [1, 3]` → D1, D3), e a IA4 numera a régua na
 * mesma ordem. Ordenar aqui renumeraria a régua dos cenários antigos.
 *
 * Falha alto: quem lê é construção ou admin (gerar/auditar cenário, avaliar
 * resposta), e régua vazia por erro de leitura viraria avaliação sem régua. Pelo
 * mesmo motivo, `cargo` AUSENTE (o select de quem chamou não pediu a coluna) é
 * erro, e não "sem cargo": `null` é dado, `undefined` é esquecimento — e cairia
 * calado no ramo `is null`, devolvendo régua vazia.
 */
export async function buscarDescritoresDaCompetencia(
  db: any,
  comp: CompetenciaDaMatriz | null | undefined,
  colunas: string,
): Promise<any[]> {
  if (!comp?.cod_comp) return [];
  if (comp.cargo === undefined) {
    throw new Error(`Descritores de ${comp.cod_comp}: a linha da competência veio sem a coluna "cargo" — inclua cargo no select`);
  }
  const doCargo = comp.cargo
    ? db.from('competencias').select(colunas).eq('cod_comp', comp.cod_comp).eq('cargo', comp.cargo)
    : db.from('competencias').select(colunas).eq('cod_comp', comp.cod_comp).is('cargo', null);
  const { data, error } = await doCargo.not('cod_desc', 'is', null);
  if (error) {
    throw new Error(`Descritores de ${comp.cod_comp} (${comp.cargo || 'sem cargo'}): ${error.message}`);
  }
  return data || [];
}

/**
 * Chave de uma linha da matriz para deduplicar import: cargo + competência +
 * descritor. Sem o cargo, a matriz do 2º cargo parecia repetida e não entrava.
 */
export function chaveDaLinhaDaMatriz(c: {
  cargo?: string | null; cod_comp?: string | null; nome?: string | null;
  cod_desc?: string | null; nome_curto?: string | null;
}): string {
  const cargo = String(c.cargo || '').trim();
  const comp = String(c.cod_comp || c.nome || '').trim();
  const desc = String(c.cod_desc || c.nome_curto || '').trim();
  return `${cargo}||${comp}||${desc}`.toLowerCase();
}

/**
 * Casa um item da seleção do IA1 (`{ id|cod_comp, nome }`) com uma linha da
 * matriz DO CARGO. Mesma cascata de antes — código exato, nome exato, nome
 * contido nos dois sentidos —, só que restrita ao cargo: a empresa inteira
 * oferecia a mesma competência de outro cargo, e o `competencia_id` gravado em
 * `top10_cargos` apontava para uma linha que a entrega (que filtra por cargo)
 * nunca encontra.
 */
export function casarSelecaoIA1<T extends { id: string; cod_comp?: string | null; nome?: string | null; cargo?: string | null }>(
  linhas: T[],
  cargo: string,
  sel: { id?: string | null; cod_comp?: string | null; nome?: string | null },
  usados: Set<string>,
): T | undefined {
  const doCargo = linhas.filter((c) => (c.cargo || '_sem_cargo') === cargo && !usados.has(c.id));
  const selId = String(sel.id || sel.cod_comp || '').trim().toLowerCase();
  const selNome = String(sel.nome || '').trim().toLowerCase();
  const nomeDe = (c: T) => String(c.nome || '').toLowerCase();
  return doCargo.find((c) => c.cod_comp && selId && c.cod_comp.toLowerCase() === selId)
    || doCargo.find((c) => selNome && nomeDe(c) === selNome)
    || doCargo.find((c) => selNome && nomeDe(c) && nomeDe(c).includes(selNome))
    || doCargo.find((c) => selNome && nomeDe(c) && selNome.includes(nomeDe(c)));
}
