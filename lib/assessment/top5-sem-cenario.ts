/**
 * Quais competências do Top 5 ainda NÃO têm cenário de rede servível (R-82, 03/10/2026).
 *
 * Existe para o aviso ao liberar o mapeamento de cenários: liberar não conferia se os
 * cenários existiam, e a pessoa só descobria na tela ("em preparação"). O critério é o
 * cenário de REDE (sem PPP) dentro do corte de nota da empresa: é ele que serve a todos
 * do cargo (a quem não tem escola, a escola sem PPP e a escola sem cenário próprio), e a
 * IA3 passou a gerá-lo sempre. O casamento nome do Top 5 x competência é sem caixa, a
 * mesma régua da fila da IA3 e do resolvedor da pessoa.
 *
 * Todas as leituras decidem por AUSÊNCIA, então são paginadas e falha de leitura volta
 * como erro (nunca como "falta tudo" nem como "não falta nada").
 */
import { lerTudoPaginado } from '@/lib/paginacao';
import { cenarioAtendeNotaMinima, notaMinimaDoTenant } from '@/lib/assessment/cenario-elegivel';

export type Top5SemCenario = { cargo: string; competencia: string };

export async function top5SemCenarioDeRede(
  tdb: any,
  sysConfig: unknown,
): Promise<{ faltam: Top5SemCenario[] } | { error: string }> {
  const { data: cargos, error: errCargos } = await tdb.from('cargos_empresa').select('nome, top5_workshop');
  if (errCargos) return { error: errCargos.message };
  const comTop5 = (cargos || []).filter((c: any) => Array.isArray(c.top5_workshop) && c.top5_workshop.length);
  if (!comTop5.length) return { faltam: [] };
  const nomesCargos = comTop5.map((c: any) => c.nome);

  const comps = await lerTudoPaginado((de, ate) => tdb.from('competencias')
    .select('id, nome, cargo').in('cargo', nomesCargos).order('id').range(de, ate));
  if (comps.error) return { error: comps.error };

  const cenarios = await lerTudoPaginado((de, ate) => tdb.from('banco_cenarios')
    .select('id, competencia_id, cargo, ppp_escola_id, nota_check')
    .in('cargo', nomesCargos)
    .is('ppp_escola_id', null)
    .or('tipo_cenario.is.null,tipo_cenario.neq.cenario_b')
    .order('id').range(de, ate));
  if (cenarios.error) return { error: cenarios.error };

  const notaMinima = notaMinimaDoTenant(sysConfig);
  const chave = (cargo: string, compId: string) => `${cargo}::${compId}`;
  const comCenario = new Set(
    cenarios.data
      .filter((c: any) => cenarioAtendeNotaMinima(c, notaMinima))
      .map((c: any) => chave(c.cargo, c.competencia_id)),
  );
  const mesmoNome = (a: unknown, b: unknown) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

  const faltam: Top5SemCenario[] = [];
  for (const cargo of comTop5) {
    for (const nome of cargo.top5_workshop as string[]) {
      const ids = comps.data.filter((c: any) => c.cargo === cargo.nome && mesmoNome(c.nome, nome)).map((c: any) => c.id);
      if (!ids.some((id: string) => comCenario.has(chave(cargo.nome, id)))) faltam.push({ cargo: cargo.nome, competencia: nome });
    }
  }
  return { faltam };
}
