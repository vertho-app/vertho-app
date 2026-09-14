import 'server-only';
import { can } from '@/lib/permissions';
import { canViewColabJourney } from '@/lib/authz';
import type { AuthenticatedContext } from '@/lib/auth/request-context';
import type { Contexto } from './access';
import { SimuladorError } from './core';
import { lerCursor, paginaDeHistorico, type LinhaResumo } from './historico';

const MAX_COLABORADORES_ESCOPO = 10_000;

export async function podeVerEquipe(auth: AuthenticatedContext): Promise<boolean> {
  return (
    (auth.isPlatformAdmin || ['rh', 'gestor', 'tutor'].includes(auth.role)) &&
    (await can(auth, 'journey.team.view')) &&
    (await can(auth, 'reports.individual.view'))
  );
}
export async function escopoEquipe(c: Contexto): Promise<string[] | null> {
  if (!(await podeVerEquipe(c.auth)))
    throw new SimuladorError(403, 'Seu perfil não permite acompanhar esta equipe.');
  if (c.auth.isPlatformAdmin) return null;
  const ids: string[] = [];
  for (let pagina = 0; pagina <= MAX_COLABORADORES_ESCOPO / 500; pagina++) {
    const { data, error } = await c.tdb
      .from('colaboradores')
      .select('id,empresa_id,gestor_email')
      .order('id')
      .range(pagina * 500, Math.min(pagina * 500 + 499, MAX_COLABORADORES_ESCOPO));
    if (error) throw new SimuladorError(503, 'Não foi possível consultar as permissões da equipe.');
    if (pagina * 500 + data.length > MAX_COLABORADORES_ESCOPO)
      throw new SimuladorError(422, 'A equipe excede o tamanho desta consulta. Solicite ao suporte uma exportação assistida; relatórios individuais continuam disponíveis.');
    ids.push(...data.filter((p) => canViewColabJourney(c.auth, p)).map((p) => p.id));
    if (data.length < 500) return ids;
  }
}
export async function historicoEquipe(c: Contexto, cursor?: string | null) {
  const ids = await escopoEquipe(c);
  if (ids?.length === 0) return { historico: [], proximoCursor: null };
  const pagina = lerCursor(cursor);
  const { data, error } = await c.tdb.rpc('sim_vendas_historico_equipe', {
    p_empresa: c.empresaId,
    p_colaboradores: ids,
    p_em: pagina?.em || null,
    p_id: pagina?.id || null,
  });
  if (error) throw new SimuladorError(503, 'Não foi possível consultar o histórico da equipe.');
  return paginaDeHistorico(data as LinhaResumo[], 50);
}
export async function relatorioEquipe(c: Contexto, id: string) {
  if (!(await podeVerEquipe(c.auth)))
    throw new SimuladorError(403, 'Seu perfil não permite acompanhar esta equipe.');
  const { data, error } = await c.tdb
    .from('sim_vendas_sessoes')
    .select('id,colaborador_id,resumo,relatorio:estado->relatorio')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new SimuladorError(503, 'Não foi possível consultar o relatório.');
  if (!data?.relatorio)
    throw new SimuladorError(404, 'Relatório não encontrado na sua equipe.');
  if (!c.auth.isPlatformAdmin) {
    if (!data.colaborador_id) throw new SimuladorError(404, 'Relatório não encontrado na sua equipe.');
    const { data: pessoa, error: pessoaError } = await c.tdb
      .from('colaboradores')
      .select('id,empresa_id,gestor_email')
      .eq('id', data.colaborador_id)
      .maybeSingle();
    if (pessoaError) throw new SimuladorError(503, 'Não foi possível consultar as permissões deste relatório.');
    if (!canViewColabJourney(c.auth, pessoa))
      throw new SimuladorError(404, 'Relatório não encontrado na sua equipe.');
  }
  return {
    id: data.id,
    nomeVendedor: data.resumo.nomeVendedor,
    versaoRegua: data.resumo.versaoRegua,
    relatorio: data.relatorio,
  };
}
