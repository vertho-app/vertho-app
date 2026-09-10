import 'server-only';

/**
 * Resolve `gestor_email` -> nome e devolve a lista com `coordenador` em cada
 * pessoa. Devolve `null` se qualquer leitura falhar: a tela sabe agrupar em
 * "Sem coordenador", mas não sabe distinguir isso de uma consulta que não
 * respondeu — e um agrupamento inventado é pior que nenhum.
 */
export async function anexarCoordenador(sb: any, empresaId: string, pessoas: any[]): Promise<any[] | null> {
  const ids = [...new Set(pessoas.map((p: any) => p.colaboradorId).filter(Boolean))];
  if (!ids.length) return null;

  // `empresa_id` explícito nas duas cadeias: `sb` já é o `tenantDb`, mas o
  // filtro escrito aqui é o que torna o escopo legível no call-site — e é o que
  // o guard de leitura de tenant consegue ver.
  const { data: vinculos, error: vincErr } = await sb.from('colaboradores')
    .select('id, gestor_email').eq('empresa_id', empresaId).in('id', ids);
  if (vincErr) { console.error('[engajamento] vinculo com coordenador:', vincErr.message); return null; }

  const emails: string[] = [...new Set((vinculos || [])
    .map((v: any) => String(v.gestor_email || '').trim().toLowerCase())
    .filter(Boolean) as string[])];
  const nomePorEmail = new Map<string, string>();
  if (emails.length) {
    // `.in('email', ...)`, não `ilike`: `_` e `%` são curinga no Postgres, e um
    // e-mail com underscore casaria gente que não é a mesma pessoa. A primeira
    // versão lia a tabela INTEIRA para filtrar em código — funciona com 14
    // pessoas e é uma varredura de tenant com 282.
    //
    // O casamento é exato: se o `gestor_email` estiver gravado com outra
    // caixa, o nome não resolve e o bloco cai para o e-mail — degradação
    // visível na tela, não um agrupamento errado.
    const { data: gestores, error: gestErr } = await sb.from('colaboradores')
      .select('email, nome_completo').eq('empresa_id', empresaId).in('email', emails);
    if (gestErr) { console.error('[engajamento] nomes dos coordenadores:', gestErr.message); return null; }
    for (const g of (gestores || []) as any[]) {
      const e = String(g.email || '').trim().toLowerCase();
      if (e) nomePorEmail.set(e, g.nome_completo || e);
    }
  }

  const emailPorId = new Map<string, string>((vinculos || []).map((v: any) => [
    String(v.id),
    String(v.gestor_email || '').trim().toLowerCase(),
  ] as [string, string]));
  return pessoas.map((p: any) => {
    const email = emailPorId.get(p.colaboradorId) || '';
    return {
      ...p,
      coordenadorEmail: email || null,
      coordenadorNome: email ? (nomePorEmail.get(email) || email) : null,
    };
  });
}
