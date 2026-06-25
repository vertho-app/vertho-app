/**
 * Resolve o DESAFIO da semana a partir do KIT do colaborador (Fase 3): casa
 * (empresa × competência × descritor × DISC) → kits.desafio. Prefere o kit
 * exclusivo da empresa; cai no global. Retorna null se não houver kit publicado
 * — o chamador usa o desafio antigo (buildSeason) como fallback. Ver
 * docs/KIT-SEMANAL.md (Fase 3: cobrança de quinta cobra o desafio do kit).
 */
export async function resolverDesafioDoKit(
  sb: any,
  args: { empresaId: string | null; competencia: string | null; descritor: string | null; disc: string | null; cargo?: string | null },
): Promise<{ desafio_texto: string; acao_observavel?: string; criterio_de_execucao?: string; kitId: string } | null> {
  if (!args.competencia || !args.descritor || !args.disc) return null;
  const disc = String(args.disc).trim().charAt(0).toUpperCase();
  if (!['D', 'I', 'S', 'C'].includes(disc)) return null;

  let q = sb.from('kit_briefs').select('id, empresa_id, cargo').eq('competencia', args.competencia).eq('descritor', args.descritor);
  q = args.empresaId ? q.or(`empresa_id.eq.${args.empresaId},empresa_id.is.null`) : q.is('empresa_id', null);
  const { data: briefs } = await q;
  if (!briefs?.length) return null;

  // Preferência: (1) brief do CARGO do colaborador (registro certo p/ MEI vs
  // Empregabilidade), (2) brief EXCLUSIVO da empresa, (3) global/qualquer (fallback —
  // não quebra kits 'todos' do legado). cargo vazio → cai direto na regra de empresa.
  const cargoColab = String(args.cargo || '').trim().toLowerCase();
  briefs.sort((a: any, b: any) => {
    const ac = cargoColab && String(a.cargo || '').toLowerCase() === cargoColab ? 1 : 0;
    const bc = cargoColab && String(b.cargo || '').toLowerCase() === cargoColab ? 1 : 0;
    if (ac !== bc) return bc - ac;
    return (b.empresa_id ? 1 : 0) - (a.empresa_id ? 1 : 0);
  });
  for (const b of briefs) {
    const { data: kit } = await sb.from('kits')
      .select('id, desafio').eq('brief_id', b.id).eq('disc', disc).eq('status', 'published').maybeSingle();
    const d = kit?.desafio;
    if (d?.desafio_texto) {
      return { desafio_texto: d.desafio_texto, acao_observavel: d.acao_observavel, criterio_de_execucao: d.criterio_de_execucao, kitId: kit.id };
    }
  }
  return null;
}
