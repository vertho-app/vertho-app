import 'server-only';
import { can } from '@/lib/permissions';
import { canViewColabJourney } from '@/lib/authz';
import type { AuthenticatedContext } from '@/lib/auth/request-context';
import type { Contexto } from './access';
import { SimuladorError } from './core';
import { lerCursor, paginaDeHistorico, type LinhaResumo } from './historico';
import { relatorioPacePublico } from './escala';
import { escalaNativa14 } from './matriz-avaliacao';
import { agregarPainel, type PainelVendas, type PessoaPainel, type SessaoPainel } from './painel';
import { acessoDoCargo, idDoCargo, mapaDeCargos } from '@/lib/simuladores/acesso-cargo';
import { PAPEIS_QUE_SO_ACOMPANHAM } from '@/lib/simuladores/papel';
import { isInternalEmail } from '@/lib/internal-emails';

const MAX_COLABORADORES_ESCOPO = 10_000;
const LOTE_IDS = 100;

export async function podeVerEquipe(
  auth: AuthenticatedContext,
): Promise<boolean> {
  return (
    (auth.isPlatformAdmin || ['rh', 'gestor', 'tutor'].includes(auth.role)) &&
    (await can(auth, 'journey.team.view')) &&
    (await can(auth, 'reports.individual.view'))
  );
}
export async function escopoEquipe(c: Contexto): Promise<string[] | null> {
  if (!(await podeVerEquipe(c.auth)))
    throw new SimuladorError(
      403,
      'Seu perfil não permite acompanhar esta equipe.',
    );
  if (c.auth.isPlatformAdmin) return null;
  const ids: string[] = [];
  for (let pagina = 0; pagina <= MAX_COLABORADORES_ESCOPO / 500; pagina++) {
    const { data, error } = await c.tdb
      .from('colaboradores')
      .select('id,empresa_id,gestor_email')
      .order('id')
      .range(
        pagina * 500,
        Math.min(pagina * 500 + 499, MAX_COLABORADORES_ESCOPO),
      );
    if (error)
      throw new SimuladorError(
        503,
        'Não foi possível consultar as permissões da equipe.',
      );
    if (pagina * 500 + data.length > MAX_COLABORADORES_ESCOPO)
      throw new SimuladorError(
        422,
        'A equipe excede o tamanho desta consulta. Solicite ao suporte uma exportação assistida; relatórios individuais continuam disponíveis.',
      );
    ids.push(
      ...data.filter((p) => canViewColabJourney(c.auth, p)).map((p) => p.id),
    );
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
  if (error)
    throw new SimuladorError(
      503,
      'Não foi possível consultar o histórico da equipe.',
    );
  return paginaDeHistorico(data as LinhaResumo[], 50);
}
/**
 * Quem PODERIA treinar e a pessoa que pergunta enxerga: colaboradores da
 * empresa com o cargo liberado para o vendas, fora quem só acompanha (gestor e
 * RH, decisão de 17/09) e as contas internas. Mesma régua de cargo do gate
 * (`acessoSimuladoresDoColaborador`: nome normalizado do cargo); "não começou" só é
 * justo para quem tinha acesso.
 */
async function populacaoDoVendas(c: Contexto): Promise<PessoaPainel[]> {
  const [empresa, cargos] = await Promise.all([
    c.tdb.raw.from('empresas').select('sys_config').eq('id', c.empresaId).maybeSingle(),
    c.tdb.from('cargos_empresa').select('id,nome'),
  ]);
  if (empresa.error || cargos.error)
    throw new SimuladorError(503, 'Não foi possível consultar os cargos da equipe.');
  const sysConfig = (empresa.data?.sys_config ?? null) as Record<string, unknown> | null;
  const cargoId = mapaDeCargos((cargos.data || []) as Array<{ id: string; nome: string }>);
  const pessoas: PessoaPainel[] = [];
  for (let pagina = 0; ; pagina++) {
    const de = pagina * 500;
    if (de >= MAX_COLABORADORES_ESCOPO)
      throw new SimuladorError(
        422,
        'A equipe excede o tamanho desta consulta. Solicite ao suporte uma exportação assistida; relatórios individuais continuam disponíveis.',
      );
    const { data, error } = await c.tdb
      .from('colaboradores')
      .select('id,empresa_id,nome_completo,cargo,email,role,gestor_email')
      .order('id')
      .range(de, de + 499);
    if (error) throw new SimuladorError(503, 'Não foi possível consultar a equipe.');
    for (const p of (data || []) as any[]) {
      if ((PAPEIS_QUE_SO_ACOMPANHAM as readonly string[]).includes(String(p.role ?? ''))) continue;
      if (isInternalEmail(p.email)) continue;
      if (!acessoDoCargo(sysConfig, idDoCargo(cargoId, p.cargo)).vendas) continue;
      if (!c.auth.isPlatformAdmin && !canViewColabJourney(c.auth, p)) continue;
      pessoas.push({ id: p.id, nome: p.nome_completo || 'Colaborador', cargo: p.cargo || null });
    }
    if ((data || []).length < 500) return pessoas;
  }
}

const COLUNAS_PAINEL =
  'id,colaborador_id,created_at,resumo,feedback:estado->feedback' +
  ',pl:estado->relatorio->PL,p:estado->relatorio->P,a:estado->relatorio->A,c:estado->relatorio->C,e:estado->relatorio->E';
const notaOuNulo = (n: unknown) => (typeof n === 'number' ? n : null);

/** Visão da equipe: quem tem acesso, quem começou, níveis por competência e a pesquisa. */
export async function painelEquipe(c: Contexto): Promise<PainelVendas> {
  if (!(await podeVerEquipe(c.auth)))
    throw new SimuladorError(403, 'Seu perfil não permite acompanhar esta equipe.');
  const pessoas = await populacaoDoVendas(c);
  const ids = pessoas.map((p) => p.id);
  const sessoes: SessaoPainel[] = [];
  for (let i = 0; i < ids.length; i += LOTE_IDS) {
    const lote = ids.slice(i, i + LOTE_IDS);
    for (let de = 0; ; de += 1000) {
      const { data, error } = await c.tdb
        .from('sim_vendas_sessoes')
        .select(COLUNAS_PAINEL)
        .in('colaborador_id', lote)
        .order('id')
        .range(de, de + 999);
      if (error) throw new SimuladorError(503, 'Não foi possível consultar os treinos da equipe.');
      for (const r of (data || []) as any[]) {
        const nativa = escalaNativa14(r.resumo?.versaoRegua);
        sessoes.push({
          colaboradorId: r.colaborador_id,
          criadoEm: r.created_at,
          status: String(r.resumo?.status ?? ''),
          competencias: nativa
            ? { PL: notaOuNulo(r.pl), P: notaOuNulo(r.p), A: notaOuNulo(r.a), C: notaOuNulo(r.c), E: notaOuNulo(r.e) }
            : null,
          feedback: r.feedback && typeof r.feedback === 'object' ? r.feedback : null,
        });
      }
      if ((data || []).length < 1000) break;
    }
  }
  return agregarPainel(pessoas, sessoes);
}

export async function relatorioEquipe(c: Contexto, id: string) {
  if (!(await podeVerEquipe(c.auth)))
    throw new SimuladorError(
      403,
      'Seu perfil não permite acompanhar esta equipe.',
    );
  const { data, error } = await c.tdb
    .from('sim_vendas_sessoes')
    .select('id,colaborador_id,resumo,relatorio:estado->relatorio')
    .eq('id', id)
    .maybeSingle();
  if (error)
    throw new SimuladorError(503, 'Não foi possível consultar o relatório.');
  if (!data?.relatorio)
    throw new SimuladorError(404, 'Relatório não encontrado na sua equipe.');
  if (!c.auth.isPlatformAdmin) {
    if (!data.colaborador_id)
      throw new SimuladorError(404, 'Relatório não encontrado na sua equipe.');
    const { data: pessoa, error: pessoaError } = await c.tdb
      .from('colaboradores')
      .select('id,empresa_id,gestor_email')
      .eq('id', data.colaborador_id)
      .maybeSingle();
    if (pessoaError)
      throw new SimuladorError(
        503,
        'Não foi possível consultar as permissões deste relatório.',
      );
    if (!canViewColabJourney(c.auth, pessoa))
      throw new SimuladorError(404, 'Relatório não encontrado na sua equipe.');
  }
  return {
    id: data.id,
    nomeVendedor: data.resumo.nomeVendedor,
    versaoRegua: data.resumo.versaoRegua,
    relatorio: relatorioPacePublico(data.relatorio, data.resumo.versaoRegua),
  };
}
