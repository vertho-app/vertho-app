/**
 * MATRIZ DE COMPETÊNCIAS DE LIDERANÇA, global e única.
 *
 * Fonte única do que o simulador de liderança mede, em TODOS os tenants. Antes
 * disso o instrumento era o `top5_workshop` do cargo-alvo de cada empresa, ou
 * seja, mudava de cliente para cliente e as notas não eram comparáveis entre
 * eles. Decisão do dono em 14/09/2026.
 *
 * O dado vive em `matriz-global.json` (gerado de
 * `Matriz_Competencias_Lideranca.xlsx` por `scripts/_importar-matriz-lideranca.mjs`,
 * que valida 5 competências × 6 descritores por variante antes de escrever).
 * Mesmo idioma de `lib/recepcao/competencias-base.ts`, a fixture versionada da
 * biblioteca do simulador de recepção.
 *
 * ⚠️ Global na ORIGEM, materializada POR TENANT. Três motores leem por empresa e
 * nenhum deles é opcional: a IA4 lê a régua com `tdb.from('competencias')`, a
 * fila da IA3 sai de `cargos_empresa.top5_workshop`, e o cenário é chaveado por
 * `(empresa_id, cargo, competencia_id)`. Por isso existe `./instalar.ts`: um
 * catálogo que vivesse só aqui não seria enxergado por nenhum dos três.
 */
import bruto from './matriz-global.json';

/**
 * As duas variantes. A régua é a MESMA (medido: os 30 pares e os textos de N1 a
 * N4 são idênticos entre elas); o que muda é o enquadramento de 7 das 30
 * `perguntas_alvo`, "falar com essa pessoa" contra "tirar uma conclusão".
 *
 * O valor de cada variante é o `cargo` com que as linhas são instaladas, porque
 * é por `cargo` que `competencias` e `banco_cenarios` são chaveadas.
 */
export const VARIANTES = {
  gestor: 'Gestor Comercial',
  potencial: 'Futuro Líder',
} as const;

export type VarianteLideranca = keyof typeof VARIANTES;

/**
 * O cargo é uma ÂNCORA da matriz, e não um cargo da empresa?
 *
 * `instalar.ts` cria duas linhas em `cargos_empresa` com o nome das variantes,
 * porque a fila da IA3 sai de `cargos_empresa.top5_workshop` e o cenário é
 * chaveado por `(empresa, cargo)`. O efeito colateral é que elas aparecem em
 * QUALQUER tela que liste os cargos do tenant, e não são cargos de ninguém.
 * Quem lista cargo para um operador escolher deve filtrar por aqui.
 */
export function ehCargoAncoraLideranca(nome: unknown): boolean {
  const n = String(nome ?? '').trim();
  return (Object.values(VARIANTES) as string[]).includes(n);
}

/** Quem OCUPA o cargo-alvo é gestor em exercício; quem não ocupa é potencial sucessor. */
export function varianteDe(ocupaCargoAlvo: boolean): VarianteLideranca {
  return ocupaCargoAlvo ? 'gestor' : 'potencial';
}

export interface LinhaMatriz {
  cod_comp: string;
  nome: string;
  pilar: string;
  cargo: string;
  descricao: string;
  cod_desc: string;
  nome_curto: string;
  descritor_completo: string;
  n1_gap: string;
  n2_desenvolvimento: string;
  n3_meta: string;
  n4_referencia: string;
  evidencias_esperadas: string;
  perguntas_alvo: string;
}

const LINHAS: readonly LinhaMatriz[] = Object.freeze((bruto as LinhaMatriz[]).map((l) => Object.freeze({ ...l })));

/** As 30 linhas (5 competências × 6 descritores) de uma variante, na ordem do arquivo. */
export function linhasDaVariante(variante: VarianteLideranca): LinhaMatriz[] {
  const cargo = VARIANTES[variante];
  return LINHAS.filter((l) => l.cargo === cargo).map((l) => ({ ...l }));
}

/**
 * As 5 competências do programa, na ordem do arquivo. Iguais nas duas variantes
 * de propósito: é o que torna as notas comparáveis entre os dois públicos.
 */
export const COMPETENCIAS_LIDERANCA: readonly string[] = Object.freeze(
  [...new Set(LINHAS.filter((l) => l.cargo === VARIANTES.gestor).map((l) => l.nome))],
);

/** Quantos descritores cada competência tem na matriz (a régua canônica tem 6). */
export const DESCRITORES_POR_COMPETENCIA = 6;
