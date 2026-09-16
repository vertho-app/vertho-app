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
 */

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
