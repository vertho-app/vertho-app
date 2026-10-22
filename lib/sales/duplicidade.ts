// Portal do Representante — a mesma escola (ou empresa) registrada por mais de um RC.
//
// Regra do canal (dono, 08/10/2026): vale o primeiro registro válido, e a
// vertho.ai decide o conflito. O portal NÃO bloqueia (decisão de 21/10/2026,
// "só escola duplicada"): avisa o RC que cadastrou depois e lista os casos no
// admin. Não bloqueia porque a comparação por nome erra para os dois lados
// (homônimos em cidades diferentes, abreviações), e um bloqueio errado tiraria
// do RC uma escola que é dele.
//
// Módulo puro: a action (accounts.ts) e o painel do admin (admin-dashboard.ts)
// usam as mesmas funções.

export type ContaComparavel = {
  id: string;
  representante_id: string | null;
  legal_name: string | null;
  trade_name: string | null;
  cnpj: string | null;
  city: string | null;
  created_at?: string | null;
};

/** Minúsculas, sem acento e sem pontuação: "Colégio São José Ltda." → "colegio sao jose ltda". */
export function normalizarNomeConta(nome: string | null | undefined): string {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Só os 14 dígitos; qualquer outra coisa não serve para comparar. */
export function normalizarCnpj(cnpj: string | null | undefined): string | null {
  const d = String(cnpj || '').replace(/\D/g, '');
  return d.length === 14 ? d : null;
}

/** Nome curto demais ("Escola", "Colégio", "ABC") casaria com muita coisa: fica fora. */
const NOME_MINIMO = 8;

function nomesDa(conta: ContaComparavel): string[] {
  return [conta.legal_name, conta.trade_name]
    .map(normalizarNomeConta)
    .filter((n) => n.length >= NOME_MINIMO);
}

/**
 * As duas contas parecem a mesma instituição?
 *   · com CNPJ válido nas duas, só o CNPJ decide (rede com várias unidades tem
 *     o mesmo nome e CNPJs diferentes);
 *   · sem isso, algum nome (razão social ou fantasia) igual e, se as duas
 *     informam cidade, a mesma cidade.
 */
export function mesmaInstituicao(a: ContaComparavel, b: ContaComparavel): boolean {
  const ca = normalizarCnpj(a.cnpj);
  const cb = normalizarCnpj(b.cnpj);
  if (ca && cb) return ca === cb;
  const nomesB = new Set(nomesDa(b));
  if (!nomesDa(a).some((n) => nomesB.has(n))) return false;
  const cidadeA = normalizarNomeConta(a.city);
  const cidadeB = normalizarNomeConta(b.city);
  return !cidadeA || !cidadeB || cidadeA === cidadeB;
}

/** A conta nova coincide com alguma conta de OUTRO RC? Devolve as coincidências. */
export function coincidenciasDeOutrosRcs(nova: ContaComparavel, existentes: ContaComparavel[]): ContaComparavel[] {
  return existentes.filter((c) => c.id !== nova.id
    && c.representante_id && c.representante_id !== nova.representante_id
    && mesmaInstituicao(nova, c));
}

/**
 * Agrupa as contas que parecem a mesma instituição e estão com MAIS DE UM RC.
 * Cada grupo vem em ordem de cadastro: o primeiro é o candidato a dono pela
 * regra do primeiro registro válido (a vertho.ai confere a validade).
 */
export function gruposEmMaisDeUmRc(contas: ContaComparavel[]): ContaComparavel[][] {
  const pai = contas.map((_, i) => i);
  const raiz = (i: number): number => (pai[i] === i ? i : (pai[i] = raiz(pai[i])));
  for (let i = 0; i < contas.length; i++) {
    for (let j = i + 1; j < contas.length; j++) {
      if (mesmaInstituicao(contas[i], contas[j])) pai[raiz(i)] = raiz(j);
    }
  }
  const grupos = new Map<number, ContaComparavel[]>();
  contas.forEach((c, i) => {
    const r = raiz(i);
    grupos.set(r, [...(grupos.get(r) || []), c]);
  });
  return [...grupos.values()]
    .filter((g) => new Set(g.map((c) => c.representante_id).filter(Boolean)).size > 1)
    .map((g) => [...g].sort((x, y) => String(x.created_at || '').localeCompare(String(y.created_at || ''))));
}
