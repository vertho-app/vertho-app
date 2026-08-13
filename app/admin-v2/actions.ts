'use server';

import { requireAdminAction } from '@/lib/auth/action-context';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { excludeInternalEmails } from '@/lib/internal-emails';
import { TRILHA } from '@/lib/status';
import { levantarPortfolioTurmas, type PortfolioTurmas } from '@/lib/turmas/portfolio';

/**
 * Dados reais de /admin-v2. Toda consulta a tabela tenant-owned vai com
 * `.eq('empresa_id', id)` na mesma cadeia — por empresa, não cross-tenant.
 * Isso satisfaz o `tenant-read-guard` sem entrada nova de allowlist E é o que a
 * fila precisa mostrar de qualquer forma: contagem COM denominador e por cliente.
 */

export type ItemFila = {
  empresaId: string;
  empresa: string;
  contagem: number;
  total: number | null;
  href: string;
};

export type Fila = {
  id: string;
  titulo: string;
  periodo: string;
  severidade: 'critica' | 'atencao' | 'informativa';
  total: number;
  itens: ItemFila[];
  vazio: string;
};

export type ClienteLinha = {
  id: string;
  nome: string;
  colaboradores: number;
  faseAtual: string;
  bloqueador: string | null;
  pendencias: number;
};

type EmpresaBase = { id: string; nome: string };

/** Conjunto de e-mails COM conta de acesso. Paginado: auth só sai pela admin API. */
async function emailsComConta(sb: Awaited<ReturnType<typeof requireAdminSupabase>>): Promise<Set<string>> {
  const set = new Set<string>();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await (sb as any).auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) break;
    for (const u of data.users) if (u.email) set.add(u.email.toLowerCase());
    if (data.users.length < 1000) break;
  }
  return set;
}

async function carregarEmpresas(sb: Awaited<ReturnType<typeof requireAdminSupabase>>): Promise<EmpresaBase[]> {
  const { data, error } = await sb.from('empresas').select('id, nome').order('nome');
  if (error) throw new Error(`empresas: ${error.message}`);
  return (data || []) as EmpresaBase[];
}

export async function carregarMeuTrabalho(): Promise<{ filas: Fila[]; erro?: string }> {
  await requireAdminAction();
  const sb = await requireAdminSupabase();

  try {
    const empresas = await carregarEmpresas(sb);
    const contas = await emailsComConta(sb);

    const porEmpresa = await Promise.all(
      empresas.map(async (e) => {
        const [cenSemCheck, cenTotal, respSemIa4, respTotal, cargosSemDesc, cargosTotal, colabs, degr] = await Promise.all([
          sb.from('banco_cenarios').select('id', { count: 'exact', head: true }).eq('empresa_id', e.id).is('status_check', null),
          sb.from('banco_cenarios').select('id', { count: 'exact', head: true }).eq('empresa_id', e.id),
          sb.from('respostas').select('id', { count: 'exact', head: true }).eq('empresa_id', e.id).is('nivel_ia4', null),
          sb.from('respostas').select('id', { count: 'exact', head: true }).eq('empresa_id', e.id),
          sb.from('cargos_empresa').select('id', { count: 'exact', head: true }).eq('empresa_id', e.id).or('descricao.is.null,descricao.eq.'),
          sb.from('cargos_empresa').select('id', { count: 'exact', head: true }).eq('empresa_id', e.id),
          excludeInternalEmails(sb.from('colaboradores').select('email').eq('empresa_id', e.id)),
          sb.from('degradacao_log').select('ocorrencias').eq('empresa_id', e.id).gte('ultima_em', new Date(Date.now() - 86400000).toISOString()),
        ]);

        const listaColabs = (colabs.data || []) as { email: string | null }[];
        const semConta = listaColabs.filter((c) => c.email && !contas.has(c.email.toLowerCase())).length;

        return {
          empresa: e,
          cenSemCheck: cenSemCheck.count || 0,
          cenTotal: cenTotal.count || 0,
          respSemIa4: respSemIa4.count || 0,
          respTotal: respTotal.count || 0,
          cargosSemDesc: cargosSemDesc.count || 0,
          cargosTotal: cargosTotal.count || 0,
          colabTotal: listaColabs.length,
          semConta,
          degradacoes: ((degr.data || []) as { ocorrencias: number | null }[]).reduce((a, d) => a + (d.ocorrencias || 1), 0),
        };
      }),
    );

    const { data: propostas } = await sb
      .from('sales_proposals')
      .select('id, proposal_number, status')
      .in('status', ['submitted_for_approval', 'changes_requested']);

    const monta = (
      id: string,
      titulo: string,
      periodo: string,
      severidade: Fila['severidade'],
      pega: (r: (typeof porEmpresa)[number]) => { n: number; total: number | null },
      href: (empresaId: string) => string,
      vazio: string,
    ): Fila => {
      const itens = porEmpresa
        .map((r) => ({ r, v: pega(r) }))
        .filter(({ v }) => v.n > 0)
        .sort((a, b) => b.v.n - a.v.n)
        .map(({ r, v }) => ({
          empresaId: r.empresa.id,
          empresa: r.empresa.nome,
          contagem: v.n,
          total: v.total,
          href: href(r.empresa.id),
        }));
      return { id, titulo, periodo, severidade, total: itens.reduce((a, i) => a + i.contagem, 0), itens, vazio };
    };

    const filas: Fila[] = [
      monta('cenarios', 'Cenários aguardando revisão', 'curadoria humana de F1', 'informativa',
        (r) => ({ n: r.cenSemCheck, total: r.cenTotal }),
        (id) => `/admin/empresas/${id}/fase1?tab=cenarios`,
        'Nenhum cenário pendente de revisão.'),

      monta('ia4', 'Respostas aguardando avaliação da IA', 'F2 — diagnóstico', 'atencao',
        (r) => ({ n: r.respSemIa4, total: r.respTotal }),
        (id) => `/admin/empresas/${id}/fase2`,
        'Todas as respostas foram avaliadas.'),

      monta('cargos', 'Cargos sem descrição', 'bloqueia a geração do perfil ideal', 'critica',
        (r) => ({ n: r.cargosSemDesc, total: r.cargosTotal }),
        (id) => `/admin/cargos?empresa=${id}`,
        'Todos os cargos têm descrição.'),

      monta('acesso', 'Pessoas sem conta de acesso', 'importadas, sem login criado', 'critica',
        (r) => ({ n: r.semConta, total: r.colabTotal }),
        (id) => `/admin/empresas/gerenciar?empresa=${id}`,
        'Todo mundo importado tem conta.'),

      monta('degradacao', 'Degradações registradas', 'últimas 24 h', 'atencao',
        (r) => ({ n: r.degradacoes, total: null }),
        (id) => `/admin/empresas/${id}`,
        'Nenhuma degradação nas últimas 24 h.'),
    ];

    filas.push({
      id: 'propostas',
      titulo: 'Propostas aguardando decisão',
      periodo: 'canal comercial',
      severidade: 'informativa',
      total: (propostas || []).length,
      itens: (propostas || []).map((p: { id: string; proposal_number: string | null }) => ({
        empresaId: p.id,
        empresa: p.proposal_number || 'proposta',
        contagem: 1,
        total: null,
        href: `/admin/comercial/propostas/${p.id}`,
      })),
      vazio: 'Nenhuma proposta na fila.',
    });

    return { filas };
  } catch (e) {
    return { filas: [], erro: e instanceof Error ? e.message : 'falha ao carregar' };
  }
}

export type PassoRegua = {
  titulo: string;
  descricao: string;
  feitos: number;
  total: number;
  href: string;
};

export type FaseReal = {
  sigla: string;
  rotulo: string;
  titulo: string;
  meta: string;
  proximaAcao: string | null;
  href: string;
  estado: 'feito' | 'revisao' | 'bloqueado' | 'aguardando';
};

export type Workspace = {
  empresa: { id: string; nome: string };
  fases: FaseReal[];
  regua: PassoRegua[];
  cenariosSemCheck: number;
  cargosSemCenario: number;
  /**
   * Portfólio de turmas (mig 210). `null` = feature desligada para esta
   * empresa; a tela cai no comportamento anterior, byte-igual.
   *
   * ⚠️ F0/F1 continuam por EMPRESA de propósito: base, cargos, Top 10, gabarito
   * e cenários vivem em `cargos_empresa` — já são por cargo, e duas safras do
   * mesmo cargo devem compartilhar o perfil ideal. Só F2/F3/F4 são por turma.
   */
  portfolio: PortfolioTurmas | null;
};

export async function carregarClienteWorkspace(empresaId: string): Promise<{ ws?: Workspace; erro?: string }> {
  await requireAdminAction();
  if (!empresaId) return { erro: 'empresa não informada' };
  const sb = await requireAdminSupabase();

  try {
    const { data: empresa, error } = await sb.from('empresas').select('id, nome').eq('id', empresaId).single();
    if (error || !empresa) return { erro: error?.message || 'empresa não encontrada' };

    const [comp, colabs, cargosRows, top10, cen, cenAprov, cenSemCheck, resp, aval, trilhas, ppp] = await Promise.all([
      sb.from('competencias').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
      excludeInternalEmails(sb.from('colaboradores').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId)),
      sb.from('cargos_empresa').select('id, top5_workshop, gabarito, descricao').eq('empresa_id', empresaId),
      sb.from('top10_cargos').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
      sb.from('banco_cenarios').select('cargo_id', { count: 'exact' }).eq('empresa_id', empresaId),
      sb.from('banco_cenarios').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('status_check', 'aprovado'),
      sb.from('banco_cenarios').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).is('status_check', null),
      sb.from('respostas').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
      sb.from('respostas').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).not('nivel_ia4', 'is', null),
      sb.from('trilhas').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('status', TRILHA.ATIVA),
      sb.from('ppp_escolas').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    ]);

    const cargos = (cargosRows.data || []) as { id: string; top5_workshop: unknown; gabarito: unknown; descricao: string | null }[];
    const nCargos = cargos.length;
    const comTop5 = cargos.filter((c) => Array.isArray(c.top5_workshop) && c.top5_workshop.length > 0).length;
    const comGabarito = cargos.filter((c) => c.gabarito !== null).length;
    const comDescricao = cargos.filter((c) => c.descricao && c.descricao.trim().length > 0).length;
    const cargosComTop10 = Math.min(nCargos, Math.ceil((top10.count || 0) / 10));
    const cargosComCenario = new Set(((cen.data || []) as { cargo_id: string | null }[]).map((c) => c.cargo_id).filter(Boolean)).size;

    const nColab = colabs.count || 0;
    const nCen = cen.count || 0;
    const nResp = resp.count || 0;
    const nAval = aval.count || 0;

    const fases: FaseReal[] = [
      {
        sigla: 'F0', rotulo: 'base', titulo: 'Base da empresa',
        meta: `${nColab} colaboradores · ${nCargos} cargos · ${ppp.count || 0} PPPs`,
        proximaAcao: nColab === 0 ? 'cadastrar ou importar colaboradores' : comDescricao < nCargos ? `${nCargos - comDescricao} cargo(s) sem descrição` : null,
        href: `/admin/empresas/gerenciar?empresa=${empresaId}`,
        estado: nColab === 0 ? 'bloqueado' : comDescricao < nCargos ? 'revisao' : 'feito',
      },
      {
        sigla: 'F1', rotulo: 'régua', titulo: 'Perfil ideal',
        meta: `Top 10: ${cargosComTop10}/${nCargos} · Top 5: ${comTop5}/${nCargos} · Cenários: ${nCen} (${cenAprov.count || 0} aprovados)`,
        proximaAcao: (cenSemCheck.count || 0) > 0 ? `${cenSemCheck.count} cenário(s) aguardando revisão` : nCen === 0 ? 'gerar cenários' : null,
        href: `/admin/empresas/${empresaId}/fase1`,
        estado: nCen === 0 ? 'aguardando' : (cenSemCheck.count || 0) > 0 ? 'revisao' : 'feito',
      },
      {
        sigla: 'F2', rotulo: 'diag', titulo: 'Diagnóstico',
        meta: `${nResp} respostas · ${nAval} avaliadas pela IA`,
        proximaAcao: nResp === 0 ? 'ninguém respondeu o assessment ainda' : nAval < nResp ? `${nResp - nAval} resposta(s) sem avaliação` : null,
        href: `/admin/empresas/${empresaId}/fase2`,
        estado: nResp === 0 ? 'bloqueado' : nAval < nResp ? 'revisao' : 'feito',
      },
      {
        sigla: 'F3', rotulo: 'jornada', titulo: 'Temporadas',
        meta: `${trilhas.count || 0} trilhas ativas`,
        proximaAcao: (trilhas.count || 0) === 0 && nAval > 0 ? 'gerar as trilhas da turma' : null,
        href: `/admin/temporadas?empresa=${empresaId}`,
        estado: (trilhas.count || 0) > 0 ? 'feito' : nAval > 0 ? 'aguardando' : 'aguardando',
      },
      {
        sigla: 'F4', rotulo: 'evol', titulo: 'Evolução',
        meta: 'Reavaliação e cenários B',
        proximaAcao: null,
        href: `/admin/empresas/${empresaId}/fase4`,
        estado: 'aguardando',
      },
    ];

    const regua: PassoRegua[] = [
      { titulo: 'Banco de competências', descricao: 'Régua base e por cargo', feitos: comp.count || 0, total: comp.count || 0, href: `/admin/competencias?empresa=${empresaId}` },
      { titulo: 'Descrição dos cargos', descricao: 'Entrada da IA1 — sem ela o Top 10 não sai', feitos: comDescricao, total: nCargos, href: `/admin/cargos?empresa=${empresaId}` },
      { titulo: 'Top 10 por cargo', descricao: 'IA1 sobre a descrição do cargo', feitos: cargosComTop10, total: nCargos, href: `/admin/empresas/${empresaId}/fase1?tab=top10` },
      { titulo: 'Top 5 e votação', descricao: 'Curadoria humana + votação da equipe', feitos: comTop5, total: nCargos, href: `/admin/cargos?empresa=${empresaId}&tab=votacao` },
      { titulo: 'Perfil ideal (gabarito)', descricao: 'IA2 gera o nível esperado por descritor', feitos: comGabarito, total: nCargos, href: `/admin/empresas/${empresaId}/fase1?tab=gabarito` },
      { titulo: 'Cenários situacionais', descricao: 'IA3 · revisão humana antes de valer', feitos: cenAprov.count || 0, total: nCen, href: `/admin/empresas/${empresaId}/fase1?tab=cenarios` },
    ];

    // Feature flag: env global OU por empresa (`sys_config.turmas_ui`), mesmo
    // padrão de BLUEPRINT_DRIVES_TRILHA. Desligada, esta tela é byte-igual à
    // anterior — o que permite subir o código sem mexer no que está no ar.
    const { data: empCfg } = await sb.from('empresas').select('sys_config').eq('id', empresaId).maybeSingle();
    const turmasLigadas = process.env.TURMAS_UI === '1'
      || (empCfg?.sys_config as any)?.turmas_ui === true;
    const portfolio = turmasLigadas ? await levantarPortfolioTurmas(sb, empresaId) : null;

    return {
      ws: {
        empresa: { id: empresa.id as string, nome: empresa.nome as string },
        fases,
        regua,
        cenariosSemCheck: cenSemCheck.count || 0,
        cargosSemCenario: Math.max(0, nCargos - cargosComCenario),
        portfolio,
      },
    };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : 'falha ao carregar' };
  }
}

export async function carregarClientes(): Promise<{ clientes: ClienteLinha[]; erro?: string }> {
  await requireAdminAction();
  const sb = await requireAdminSupabase();

  try {
    const empresas = await carregarEmpresas(sb);

    const clientes = await Promise.all(
      empresas.map(async (e): Promise<ClienteLinha> => {
        const [colabs, cargos, top10, cenarios, respostas, avaliadas, trilhas] = await Promise.all([
          excludeInternalEmails(sb.from('colaboradores').select('id', { count: 'exact', head: true }).eq('empresa_id', e.id)),
          sb.from('cargos_empresa').select('id', { count: 'exact', head: true }).eq('empresa_id', e.id),
          sb.from('top10_cargos').select('id', { count: 'exact', head: true }).eq('empresa_id', e.id),
          sb.from('banco_cenarios').select('id', { count: 'exact', head: true }).eq('empresa_id', e.id),
          sb.from('respostas').select('id', { count: 'exact', head: true }).eq('empresa_id', e.id),
          sb.from('respostas').select('id', { count: 'exact', head: true }).eq('empresa_id', e.id).not('nivel_ia4', 'is', null),
          sb.from('trilhas').select('id', { count: 'exact', head: true }).eq('empresa_id', e.id).eq('status', TRILHA.ATIVA),
        ]);

        const nColab = colabs.count || 0;
        const nCargos = cargos.count || 0;
        const nTop10 = top10.count || 0;
        const nCen = cenarios.count || 0;
        const nResp = respostas.count || 0;
        const nAval = avaliadas.count || 0;
        const nTrilhas = trilhas.count || 0;

        // A fase ATUAL é a primeira cujo pré-requisito ainda não fechou.
        let faseAtual = 'F0 · Base';
        let bloqueador: string | null = null;
        if (nColab === 0) bloqueador = 'nenhum colaborador cadastrado';
        else if (nCargos === 0) { faseAtual = 'F0 · Base'; bloqueador = 'nenhum cargo cadastrado'; }
        else if (nTop10 === 0) { faseAtual = 'F1 · Perfil ideal'; bloqueador = 'Top 10 não gerado'; }
        else if (nCen === 0) { faseAtual = 'F1 · Perfil ideal'; bloqueador = 'nenhum cenário gerado'; }
        else if (nResp === 0) { faseAtual = 'F2 · Diagnóstico'; bloqueador = 'ninguém respondeu o assessment'; }
        else if (nAval < nResp) { faseAtual = 'F2 · Diagnóstico'; bloqueador = `${nResp - nAval} de ${nResp} respostas sem avaliação`; }
        else if (nTrilhas === 0) { faseAtual = 'F3 · Temporadas'; bloqueador = 'nenhuma trilha ativa'; }
        else faseAtual = 'F3 · Temporadas';

        return {
          id: e.id,
          nome: e.nome,
          colaboradores: nColab,
          faseAtual,
          bloqueador,
          pendencias: (nResp - nAval) + (nCargos === 0 ? 1 : 0),
        };
      }),
    );

    return { clientes: clientes.sort((a, b) => b.colaboradores - a.colaboradores) };
  } catch (e) {
    return { clientes: [], erro: e instanceof Error ? e.message : 'falha ao carregar' };
  }
}
