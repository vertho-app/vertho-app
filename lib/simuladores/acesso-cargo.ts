/** Permissões de treino por cargo. A habilitação do módulo na empresa continua obrigatória. */
export const SIMULADORES = ['vendas', 'atendimento', 'lideranca'] as const;
export type Simulador = (typeof SIMULADORES)[number];
export type AcessoSimuladores = Record<Simulador, boolean>;
export const CHAVE_ACESSO_SIMULADORES = 'simuladores_por_cargo';
export const ACESSO_ATUAL: AcessoSimuladores = { vendas: true, atendimento: true, lideranca: true };
export const SEM_ACESSO: AcessoSimuladores = { vendas: false, atendimento: false, lideranca: false };

/** Ausência de regra preserva a liberação existente; regra inválida nunca concede acesso. */
export function acessoDoCargo(sysConfig: Record<string, unknown> | null | undefined, cargoId?: string | null): AcessoSimuladores {
  const regras = sysConfig?.[CHAVE_ACESSO_SIMULADORES];
  if (regras === undefined) return { ...ACESSO_ATUAL };
  if (!regras || typeof regras !== 'object' || Array.isArray(regras)) return { ...SEM_ACESSO };
  if (!cargoId || !Object.hasOwn(regras, cargoId)) return { ...ACESSO_ATUAL };
  const regra = (regras as Record<string, unknown>)[cargoId];
  if (!regra || typeof regra !== 'object' || Array.isArray(regra)) return { ...SEM_ACESSO };
  const valor = regra as Record<string, unknown>;
  return { vendas: valor.vendas === true, atendimento: valor.atendimento === true, lideranca: valor.lideranca === true };
}

/**
 * Nome de cargo comparável (19/09/2026): sem acento, sem caixa, espaços
 * simples. O gate de acesso comparava o nome EXATO e, quando o cadastro da
 * pessoa trazia o cargo com outra caixa ou acento, não achava o cargo e caía
 * na liberação padrão (tudo liberado); as populações dos painéis comparavam de
 * outro jeito. Agora gate e painéis usam esta mesma régua.
 */
export const chaveCargo = (nome: unknown): string =>
  String(nome ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

export type IndiceDeCargos = { exato: Map<string, string>; normalizado: Map<string, string> };

/**
 * O nome EXATO vence: dois cargos que só diferem na caixa seguem cada um com a
 * sua regra, como no gate antigo. O normalizado cobre o cadastro da pessoa
 * grafado de outro jeito. Em colisão vale o menor id, para gate e painéis
 * responderem igual qualquer que seja a ordem da consulta.
 */
export function mapaDeCargos(cargos: ReadonlyArray<{ id: string | number; nome: string | null }>): IndiceDeCargos {
  const exato = new Map<string, string>();
  const normalizado = new Map<string, string>();
  const ordenados = cargos
    .map((c) => ({ id: String(c.id), nome: String(c.nome ?? '') }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const c of ordenados) {
    if (c.nome && !exato.has(c.nome)) exato.set(c.nome, c.id);
    const chave = chaveCargo(c.nome);
    if (chave && !normalizado.has(chave)) normalizado.set(chave, c.id);
  }
  return { exato, normalizado };
}

export const idDoCargo = (indice: IndiceDeCargos, nome?: string | null): string | null =>
  nome ? (indice.exato.get(nome) ?? indice.normalizado.get(chaveCargo(nome)) ?? null) : null;
