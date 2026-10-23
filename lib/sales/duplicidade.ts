// Portal do Representante — a mesma escola (ou empresa) registrada por mais de um RC.
//
// Regra do canal (dono, 08/10/2026): vale o primeiro registro válido, e a
// vertho.ai decide o conflito. Desde o contrato v6 (23/10/2026), o BLOQUEIO
// por CNPJ básico ou INEP mora em `lib/sales/registro.ts`; este módulo segue
// com o aviso por nome e o painel de casos do admin. O nome não bloqueia
// porque erra para os dois lados (homônimos em cidades diferentes,
// abreviações), e um bloqueio errado tiraria do RC uma escola que é dele.
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
  codigo_inep?: string | null;
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

/**
 * CNPJ sem pontuação e em maiúsculas: 12 posições de letra ou dígito (o CNPJ
 * alfanumérico que a Receita emite desde julho de 2026) mais os 2 dígitos
 * verificadores. Qualquer outra coisa não serve para comparar. A coluna gerada
 * `sales_accounts.cnpj_raiz` (mig 298) segue a mesma regra.
 */
export function normalizarCnpj(cnpj: string | null | undefined): string | null {
  const s = String(cnpj || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  return /^[0-9A-Z]{12}\d{2}$/.test(s) ? s : null;
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
 *   · com INEP nas duas, o INEP decide (é a escola do Censo Escolar);
 *   · com CNPJ válido nas duas, o CNPJ BÁSICO (8 primeiros dígitos) decide:
 *     matriz e filiais são o mesmo cliente (contrato do RC, 10.6), e escolas
 *     diferentes de uma rede têm raízes diferentes;
 *   · sem isso, algum nome (razão social ou fantasia) igual e, se as duas
 *     informam cidade, a mesma cidade.
 */
export function mesmaInstituicao(a: ContaComparavel, b: ContaComparavel): boolean {
  if (a.codigo_inep && b.codigo_inep) return a.codigo_inep === b.codigo_inep;
  const ca = normalizarCnpj(a.cnpj);
  const cb = normalizarCnpj(b.cnpj);
  if (ca && cb) return ca.slice(0, 8) === cb.slice(0, 8);
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
