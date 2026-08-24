/**
 * Predicado de tenant DA LINHA, para tabelas MISTAS.
 *
 * Várias tabelas desta base guardam linhas de empresa (`empresa_id` preenchido)
 * E linhas do catálogo global (`empresa_id IS NULL`): `micro_conteudos`,
 * `banco_cenarios`, `competencias`. Numa mutação por id, repetir o tenant da
 * linha JÁ LIDA no WHERE elimina a janela entre a leitura e a escrita — se o id
 * mudar de dono no meio, a escrita casa 0 linhas em vez de acertar o alheio.
 *
 * Estava em `lib/repositories/conteudos-repo.ts`, onde nasceu; saiu de lá em
 * 24/08 (D2) porque cinco arquivos fora do domínio de conteúdo escreviam o
 * mesmo predicado à mão, cada um com uma forma diferente:
 *
 *     let q = sb.from('banco_cenarios').update(...).eq('id', id);
 *     q = linha.empresa_id ? q.eq('empresa_id', linha.empresa_id) : q.is('empresa_id', null);
 *
 * Correto, e invisível para o `tenant-mutation-guard`: o predicado sai do
 * statement da mutação, e o guard lê a cadeia. Cinco cópias da mesma regra
 * também são cinco lugares para uma delas divergir — que é como o kit e a
 * missão divergiram em 29/07.
 *
 * ⚠️ Ele escopa a ESCRITA ao tenant da linha. NÃO autoriza o chamador naquele
 * tenant — essa é a classe A5, e quem decide isso é `requireLinhaSupabase`
 * (`lib/admin-supabase.ts`). Os dois são necessários e nenhum substitui o outro.
 */
export function escopoTenantDaLinha(q: any, linha: { empresa_id?: string | null } | null | undefined) {
  return linha?.empresa_id ? q.eq('empresa_id', linha.empresa_id) : q.is('empresa_id', null);
}
