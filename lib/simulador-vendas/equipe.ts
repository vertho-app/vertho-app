import 'server-only';
import { can } from '@/lib/permissions';
import { canViewColabJourney } from '@/lib/authz';
import type { AuthenticatedContext } from '@/lib/auth/request-context';
import type { Contexto } from './access';
import { SimuladorError } from './core';
import {
  lerCursor,
  paginaDeHistorico,
  pontuacoesDaMatriz,
  type LinhaResumo,
} from './historico';
import { notaPacePublica, relatorioPacePublico } from './escala';
import { escalaNativa14 } from './matriz-avaliacao';
import { relatorioParaEquipe } from './visao-equipe';
import {
  agregarPainel,
  type PainelVendas,
  type PessoaPainel,
  type SessaoPainel,
} from './painel';
import {
  acessoDoCargo,
  idDoCargo,
  mapaDeCargos,
} from '@/lib/simuladores/acesso-cargo';
import { PAPEIS_QUE_SO_ACOMPANHAM } from '@/lib/simuladores/papel';
import { isInternalEmail } from '@/lib/internal-emails';

const MAX_COLABORADORES_ESCOPO = 10_000;
const LOTE_IDS = 100;

export async function podeVerEquipe(
  auth: AuthenticatedContext,
): Promise<boolean> {
  return (
    (auth.isPlatformAdmin || ['rh', 'gestor'].includes(auth.role)) &&
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
  const linhas = (data || []) as LinhaResumo[];
  // pace-4/pace-5: a nota da lista sai da matriz, como na devolutiva (V-5).
  const notasMatriz = await pontuacoesDaMatriz(
    (colunas) => c.tdb.from('sim_vendas_sessoes').select(colunas),
    linhas.slice(0, 50).map((r) => ({
      id: r.id,
      versaoRegua: r.resumo?.versaoRegua,
      comRelatorio: r.resumo?.temRelatorio === true,
    })),
  );
  return paginaDeHistorico(linhas, 50, { notasMatriz });
}

/** Linha do snapshot SQL de exportação (`sim_vendas_exportar`), notas como gravadas. */
export type LinhaExportada = {
  id: string;
  versaoRegua: string;
  P: number | null;
  A: number | null;
  C: number | null;
  E: number | null;
  Media: number | null;
  [campo: string]: unknown;
};
/**
 * Notas do CSV na escala 1 a 4, com a MESMA régua da devolutiva e da lista:
 * pace-4/pace-5 pela matriz (com Planejamento), pace-6 em diante como gravadas,
 * sem matriz pela conversão linear. Planejamento das versões nativas vem do
 * relatório, em lotes de 200 (o snapshot SQL não o traz).
 */
export async function linhasDeExportacao(c: Contexto, linhas: LinhaExportada[]) {
  const planos = new Map<string, number | null>();
  for (let i = 0; i < linhas.length; i += 200) {
    const { data: rows, error } = await c.tdb
      .from('sim_vendas_sessoes')
      .select('id,PL:estado->relatorio->PL')
      .in(
        'id',
        linhas.slice(i, i + 200).map((r) => r.id),
      );
    if (error)
      throw new SimuladorError(503, 'Não foi possível exportar o planejamento.');
    for (const row of (rows || []) as Array<{ id: string; PL: unknown }>)
      planos.set(row.id, typeof row.PL === 'number' ? row.PL : null);
  }
  const matrizes = await pontuacoesDaMatriz(
    (colunas) => c.tdb.from('sim_vendas_sessoes').select(colunas),
    linhas.map((r) => ({
      id: r.id,
      versaoRegua: r.versaoRegua,
      comRelatorio: r.Media != null,
    })),
  );
  return linhas.map((r) => {
    const m = matrizes.get(r.id);
    return {
      ...r,
      ...(m
        ? { PL: m.PL, P: m.P, A: m.A, C: m.C, E: m.E, Media: m.Media }
        : {
            PL: planos.get(r.id) ?? null,
            P: notaPacePublica(r.P, r.versaoRegua),
            A: notaPacePublica(r.A, r.versaoRegua),
            C: notaPacePublica(r.C, r.versaoRegua),
            E: notaPacePublica(r.E, r.versaoRegua),
            Media: notaPacePublica(r.Media, r.versaoRegua),
          }),
      escalaNota: '1-4' as const,
      escalaOriginal: escalaNativa14(r.versaoRegua) ? null : ('0-10' as const),
    };
  });
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
    c.tdb.raw
      .from('empresas')
      .select('sys_config')
      .eq('id', c.empresaId)
      .maybeSingle(),
    c.tdb.from('cargos_empresa').select('id,nome'),
  ]);
  if (empresa.error || cargos.error)
    throw new SimuladorError(
      503,
      'Não foi possível consultar os cargos da equipe.',
    );
  const sysConfig = (empresa.data?.sys_config ?? null) as Record<
    string,
    unknown
  > | null;
  const cargoId = mapaDeCargos(
    (cargos.data || []) as Array<{ id: string; nome: string }>,
  );
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
    if (error)
      throw new SimuladorError(503, 'Não foi possível consultar a equipe.');
    for (const p of (data || []) as any[]) {
      if (
        (PAPEIS_QUE_SO_ACOMPANHAM as readonly string[]).includes(
          String(p.role ?? ''),
        )
      )
        continue;
      if (isInternalEmail(p.email)) continue;
      if (!acessoDoCargo(sysConfig, idDoCargo(cargoId, p.cargo)).vendas)
        continue;
      if (!c.auth.isPlatformAdmin && !canViewColabJourney(c.auth, p)) continue;
      pessoas.push({
        id: p.id,
        nome: p.nome_completo || 'Colaborador',
        cargo: p.cargo || null,
      });
    }
    if ((data || []).length < 500) return pessoas;
  }
}

const COLUNAS_PAINEL =
  'id,colaborador_id,created_at,updated_at,resumo,feedback:estado->feedback' +
  ',pl:estado->relatorio->PL,p:estado->relatorio->P,a:estado->relatorio->A,c:estado->relatorio->C,e:estado->relatorio->E';
const notaOuNulo = (n: unknown) => (typeof n === 'number' ? n : null);

/** Visão da equipe: quem tem acesso, quem começou, níveis por competência e a pesquisa. */
export async function painelEquipe(c: Contexto): Promise<PainelVendas> {
  if (!(await podeVerEquipe(c.auth)))
    throw new SimuladorError(
      403,
      'Seu perfil não permite acompanhar esta equipe.',
    );
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
      if (error)
        throw new SimuladorError(
          503,
          'Não foi possível consultar os treinos da equipe.',
        );
      for (const r of (data || []) as any[]) {
        const nativa = escalaNativa14(r.resumo?.versaoRegua);
        sessoes.push({
          colaboradorId: r.colaborador_id,
          criadoEm: r.created_at,
          atualizadoEm: r.updated_at ?? null,
          status: String(r.resumo?.status ?? ''),
          competencias: nativa
            ? {
                PL: notaOuNulo(r.pl),
                P: notaOuNulo(r.p),
                A: notaOuNulo(r.a),
                C: notaOuNulo(r.c),
                E: notaOuNulo(r.e),
              }
            : null,
          feedback:
            r.feedback && typeof r.feedback === 'object' ? r.feedback : null,
        });
      }
      if ((data || []).length < 1000) break;
    }
  }
  return agregarPainel(pessoas, sessoes);
}

export async function relatorioEquipe(c: Contexto, id: string) {
  const data = await sessaoDaEquipe(c, id);
  return {
    id: data.id,
    nomeVendedor: data.resumo.nomeVendedor,
    versaoRegua: data.resumo.versaoRegua,
    // Sem o texto do plano (decisão 5 da revisão de 02/10/2026, R-42): a
    // projeção é feita AQUI, no servidor, para o plano nem sair na resposta.
    relatorio: relatorioParaEquipe(relatorioPacePublico(data.relatorio, data.resumo.versaoRegua)),
  };
}

/** Treino com relatório que quem pergunta enxerga na equipe; o resto é 404, sem dizer se existe. */
async function sessaoDaEquipe(c: Contexto, id: string) {
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
  return data as {
    id: string;
    colaborador_id: string | null;
    resumo: { nomeVendedor: string; versaoRegua?: string };
    relatorio: Parameters<typeof relatorioPacePublico>[0];
  };
}
