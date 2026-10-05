/**
 * Marca do cliente service-role que o SERVIDOR criou.
 *
 * Todo export de arquivo `'use server'` é um endpoint HTTP e todo argumento chega do
 * CLIENTE, serializado. Algumas actions aceitavam um `sb` opcional "para o job em
 * background" e usavam `sbIn || await requireEmpresaSupabase(...)`: um `sb: {}`
 * qualquer era truthy e PULAVA o gate de permissão e de tenant, e a geração de
 * conteúdo chegava ao `callAI` (custo) antes de falhar na gravação (análise de
 * 05/10/2026). O guard `use-server-internal-guard` só procurava o nome `internal`.
 *
 * A marca é uma propriedade com chave SÍMBOLO e não enumerável, posta por
 * `createSupabaseAdmin()` (que repete a chave em `lib/supabase.ts`, sem importar este
 * módulo: ver o aviso lá) e conferida aqui. Um argumento de Server Action só carrega
 * dado serializável (chaves de texto, nunca símbolo), então um objeto vindo do
 * cliente não consegue ter a marca. Os gates (`requireEmpresaSupabase` e irmãos)
 * devolvem `createSupabaseAdmin()`, então o cliente que sai deles também é marcado.
 */
const MARCA = Symbol.for('vertho.cliente-do-servidor');

export function marcarClienteDoServidor<T extends object>(cliente: T): T {
  Object.defineProperty(cliente, MARCA, { value: true, enumerable: false });
  return cliente;
}

/** `true` só para um cliente que o servidor criou (ou que um teste marcou de propósito). */
export function ehClienteDoServidor(valor: unknown): boolean {
  return typeof valor === 'object' && valor !== null && (valor as Record<symbol, unknown>)[MARCA] === true;
}
