/**
 * A conta que o E2E usa para entrar no produto — e por que ela precisa de um
 * módulo só dela.
 *
 * O E2E (`.github/workflows/e2e-piloto.yml`) percorre telas AUTENTICADAS contra
 * produção, então precisa de uma conta real num tenant povoado. O tenant demo é
 * o único que se mantém assim, e ele é recomposto todas as noites às 07:00 UTC —
 * o reset apaga `colaboradores` inteiro.
 *
 * 🔴 `Medido: 01/09 a 09/09/2026` — **185 de 188 runs vermelhos**, todos pela
 * mesma causa. O commit `34ef4eef` (01/09) colocou o Grupo Sinal no reset
 * noturno, e a partir dali a conta era apagada toda madrugada. Ela sobrevivia em
 * `auth.users` (o reset não toca lá), então o LOGIN continuava funcionando e o
 * relatório do CI mostrava cinco falhas de locator em cinco telas diferentes —
 * sintomas, nunca a causa. O último verde foi 31/08, um dia antes.
 *
 * Repor à mão depois de cada reset era a instrução escrita em
 * `scripts/criar-smoke-e2e.ts`; dez dias de vermelho mostraram o que vale uma
 * instrução que depende de alguém lembrar. Hoje o próprio reset repõe (o último
 * passo de `resetDemoTenant`), e o script continua existindo para o que só ele
 * faz: rotacionar a senha e gravá-la no secret do GitHub.
 *
 * 🔑 A recomposição roda DEPOIS das asserções de elenco de propósito. Esta conta
 * é POPULAÇÃO do tenant, não ELENCO — a mesma distinção que derrubou o reset do
 * ACME em 09/09, quando o convidado de degustação passou a contar como
 * participante e a asserção lançou no meio do delete.
 */

/** O tenant onde a conta vive. Só ele recompõe. */
export const VERIFICACAO_TENANT_SLUG = 'gruposinal';

/**
 * A linha é CLONE do molde: herda as colunas de perfil sem depender do formato
 * do snapshot do reset, e o papel `rh` é o que dá à conta as três visões que o
 * E2E percorre (dashboard, gestor e pipeline em /admin/empresas).
 */
export const VERIFICACAO_MOLDE_EMAIL = 'helena.demo@vertho.ai';
export const VERIFICACAO_EMAIL = 'smoke-e2e.demo@vertho.ai';
export const VERIFICACAO_NOME = 'Smoke E2E';
export const VERIFICACAO_CARGO = 'E2E — Verificação Automática';

/**
 * Mesmo formato de `ResetDemoResult`, e pelo mesmo motivo técnico: com
 * `strict: false` no tsconfig, uma união discriminada por booleano **não
 * estreita** — `if (!r.ok)` não convence o compilador de que `motivo` existe.
 */
export type ReporContaResultado = { ok: boolean; motivo?: string };

/**
 * Repõe a linha em `colaboradores`, clonando o molde.
 *
 * NÃO toca em `auth.users`: a senha é rotacionada só pelo script, e sobreviver
 * ao reset é justamente o que permite que o secret do GitHub continue válido de
 * um dia para o outro.
 *
 * Devolve `{ ok: false }` em vez de lançar. Quem chama do reset noturno não pode
 * abortar o tenant por causa da conta de verificação: perder o E2E de um dia é
 * barato, deixar o ambiente de demonstração pela metade não é — e é exatamente
 * assim que o reset do ACME parou no meio em 09/09.
 */
export async function reporContaDeVerificacao(sb: any, empresaId: string): Promise<ReporContaResultado> {
  const { data: molde, error: moldeErro } = await sb.from('colaboradores')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('email', VERIFICACAO_MOLDE_EMAIL)
    .maybeSingle();
  if (moldeErro) return { ok: false, motivo: `ler o molde: ${moldeErro.message}` };
  if (!molde) return { ok: false, motivo: `molde ${VERIFICACAO_MOLDE_EMAIL} não existe no tenant` };

  const {
    id: _id, created_at: _criado, updated_at: _alterado, auth_user_id: _auth,
    ...colunas
  } = molde as Record<string, unknown>;

  const { error: delErro } = await sb.from('colaboradores')
    .delete().eq('empresa_id', empresaId).eq('email', VERIFICACAO_EMAIL);
  if (delErro) return { ok: false, motivo: `limpar a conta antiga: ${delErro.message}` };

  const { error: insErro } = await sb.from('colaboradores').insert({
    ...colunas,
    email: VERIFICACAO_EMAIL,
    nome_completo: VERIFICACAO_NOME,
    cargo: VERIFICACAO_CARGO,
  });
  if (insErro) return { ok: false, motivo: `inserir a conta: ${insErro.message}` };

  return { ok: true };
}
