import 'server-only';

import { tenantDb } from '@/lib/tenant-db';
import { carregarPanoramaRH, carregarRelatoriosGerenciais } from '@/lib/home/loaders';
import { aggregateDna, type DnaAggregate } from '@/lib/dna-organizacional/aggregate';
import { criarDnaOrganizacionalAcmeDemo } from '@/lib/demo/acme-organization-report-fixture';
import { DEMO_PRESENTATION_TENANT_SLUG } from '@/lib/demo/presentation';
import { colaboradoresComMapeamentoCompleto } from '@/lib/mapeamento-competencias';
import { listarTurmasDoTenant, type TurmaDoTenant } from '@/lib/turmas';
import { resolverEscopoDeLote } from '@/lib/turmas/escopo';
import {
  normalizeRhDescriptorAnalysis,
  normalizeRhReportInsight,
  type RhDescriptorAnalysis,
  type RhReportInsight,
} from './dashboard-insights';

export type RhReportKind =
  | 'rh'
  | 'perfil_org'
  | 'dna'
  | 'pulso_executivo'
  | 'pulso_complementar_nr1'
  | 'gestor'
  | 'individual';

export type RhReportDocument = {
  id: string;
  kind: RhReportKind;
  url: string;
  generatedAt: string | null;
  recipient: string | null;
  role: string | null;
};

/**
 * O recorte VIGENTE da leitura e, explicitamente, o que ele NÃO alcança.
 *
 * `insightScopeIsCompany` existe porque a narrativa executiva e as prioridades
 * nascem de um PDF consolidado da empresa: elas não podem ser recortadas sem
 * regerar o documento. Sem este sinal a tela ficaria pior que antes do filtro:
 * hoje o RH desconfia do número; com um seletor no topo ele confiaria, e leria
 * a análise dos 282 achando que fala dos 126 diretores.
 */
export type RhReportsScope = {
  turmas: TurmaDoTenant[];
  turmaId: string | null;
  turmaNome: string | null;
  /** Pessoas dentro do recorte (a empresa inteira quando `turmaId` é null). */
  pessoas: number;
  /**
   * Pessoas da empresa toda, sempre: é o que o chip "todas as turmas" mostra.
   *
   * Existe para que a conta FECHE à vista: se as turmas somam menos que este
   * número, há gente sem turma ativa, e a diferença aparece na própria barra de
   * filtro em vez de virar um mistério entre dois painéis.
   */
  pessoasEmpresa: number;
  /** true quando as seções vindas do PDF consolidado ignoram o recorte. */
  insightScopeIsCompany: boolean;
};

export type RhReportsCenter = {
  companyName: string | null;
  scope: RhReportsScope;
  dashboard: {
    panorama: {
      empresaNome: string | null;
      pessoas: number;
      comPerfil: number;
      comMapeamento: number;
      emJornada: number;
      emDia: number;
      atrasadas: number;
      jornadasEncerradas: number;
      indisponivel: boolean;
    };
    insight: RhReportInsight | null;
    descriptorAnalysis: RhDescriptorAnalysis | null;
    generatedAt: string | null;
    insightUnavailable: boolean;
  };
  organization: RhReportDocument[];
  managers: RhReportDocument[];
  people: RhReportDocument[];
};

const PDF_TYPES = [
  'individual',
  'gestor',
  'rh',
  'pulso_executivo',
  'pulso_complementar_nr1',
] as const;

async function carregarDnaDoDashboard(
  empresaId: string,
  slug: string | null,
  colaboradorIds: string[] | null,
): Promise<DnaAggregate> {
  const tdb = tenantDb(empresaId);
  if (slug !== DEMO_PRESENTATION_TENANT_SLUG) {
    return aggregateDna(tdb.raw, empresaId, colaboradorIds);
  }

  // O PDF demonstrativo da ACME usa um retrato organizacional sintético e
  // determinístico. Recriamos o mesmo agregado para o dashboard, mas a coorte
  // de 25 pessoas continua vindo das tabelas e da régua real de conclusão.
  const recortar = <T>(query: T, coluna: string): T =>
    colaboradorIds ? ((query as any).in(coluna, colaboradorIds) as T) : query;
  const [peopleResult, assessmentsResult, rolesResult] = await Promise.all([
    recortar(tdb.from('colaboradores').select('*').neq('role', 'rh'), 'id'),
    recortar(tdb.from('descriptor_assessments').select('colaborador_id,competencia'), 'colaborador_id'),
    tdb.from('cargos_empresa').select('nome,top5_workshop'),
  ]);
  if (peopleResult.error) throw new Error(`descritores RH: pessoas: ${peopleResult.error.message}`);
  if (assessmentsResult.error) throw new Error(`descritores RH: mapeamentos: ${assessmentsResult.error.message}`);
  if (rolesResult.error) throw new Error(`descritores RH: cargos: ${rolesResult.error.message}`);

  const people = peopleResult.data || [];
  const mappedPersonIds = colaboradoresComMapeamentoCompleto(
    people,
    rolesResult.data || [],
    assessmentsResult.data || [],
  );
  return criarDnaOrganizacionalAcmeDemo(people, mappedPersonIds, { includeRoles: true });
}

/**
 * Central de leitura do RH. O tenant vem exclusivamente da sessão e todas as
 * tabelas de negócio passam por `tenantDb`; nenhum identificador de empresa é
 * aceito do browser. Assim a mesma rota serve todos os tenants sem abrir uma
 * consulta cross-tenant.
 */
export async function carregarCentralRelatoriosRH(
  empresaId: string,
  opts: { turmaId?: string | null } = {},
): Promise<RhReportsCenter> {
  const tdb = tenantDb(empresaId);
  const companyResult = await tdb.raw.from('empresas').select('nome,slug').eq('id', empresaId).maybeSingle();
  if (companyResult.error) {
    throw new Error(`Falha ao carregar empresa do RH: ${companyResult.error.message}`);
  }

  // ── Recorte por turma ─────────────────────────────────────────────────────
  // `turmaId` vem da URL, ou seja, do CLIENTE. Só vale se for uma das turmas
  // ativas DESTE tenant: id de outra empresa, turma arquivada ou link velho
  // caem para "empresa inteira". E, como o seletor é desenhado a partir da
  // mesma lista, a tela mostra "Todas as turmas" selecionado. O que se lê no
  // filtro é sempre o que foi aplicado nos números.
  const turmas = await listarTurmasDoTenant(tdb.raw, empresaId);
  // Mesma régua do painel (`neq('role','rh')`), para o chip "todas as turmas"
  // dizer o mesmo número que o card "Pessoas" quando nada está filtrado.
  const pessoasEmpresaResult = await tdb.from('colaboradores')
    .select('id', { count: 'exact', head: true })
    .neq('role', 'rh');
  const turmaEscolhida = opts.turmaId ? turmas.find((t) => t.id === opts.turmaId) || null : null;
  const escopo = turmaEscolhida
    ? await resolverEscopoDeLote(tdb.raw, empresaId, { tipo: 'turma', turmaId: turmaEscolhida.id })
    : null;
  const colaboradorIds = escopo ? escopo.colaboradorIds : null;
  const idsNoEscopo = colaboradorIds ? new Set(colaboradorIds) : null;

  const [gerenciais, panorama, reportsResult, insightResult, descriptorResult] = await Promise.all([
    carregarRelatoriosGerenciais(empresaId),
    carregarPanoramaRH(empresaId, { colaboradorIds }),
    tdb.from('relatorios')
      .select('id,colaborador_id,tipo,gerado_em')
      .in('tipo', [...PDF_TYPES])
      .order('gerado_em', { ascending: false }),
    // Só o consolidado mais recente alimenta o dashboard. Não trazemos o
    // `conteudo` dos 30+ PDIs: além de desnecessário, isso faria a página pagar
    // pelo peso de todos os documentos para desenhar quatro gráficos.
    tdb.from('relatorios')
      .select('conteudo,gerado_em')
      .eq('tipo', 'rh')
      .order('gerado_em', { ascending: false })
      .limit(1)
      .maybeSingle(),
    carregarDnaDoDashboard(empresaId, companyResult.data?.slug || null, colaboradorIds)
      .then((dna) => ({ data: normalizeRhDescriptorAnalysis(dna), error: null }))
      .catch((error: unknown) => ({
        data: null,
        error: error instanceof Error ? error : new Error(String(error)),
      })),
  ]);

  if (reportsResult.error) {
    throw new Error(`Falha ao carregar relatórios do RH: ${reportsResult.error.message}`);
  }
  if (insightResult.error) {
    // Os números vivos e os PDFs continuam úteis. O estado de indisponibilidade
    // vai para a UI, em vez de transformar erro de leitura em relatório vazio.
    console.error('[central-rh] leitura analítica indisponível:', insightResult.error.message);
  }
  if (descriptorResult.error) {
    // O detalhamento é complementar: um erro nele não pode derrubar o pulso,
    // a narrativa nem o acesso aos documentos do RH.
    console.error('[central-rh] leitura por descritor indisponível:', descriptorResult.error.message);
  }

  // Documento de PESSOA fora do recorte não aparece; o organizacional (sem
  // `colaborador_id`) fica, porque o PDF de RH e o DNA descrevem a empresa e
  // não a turma. Escondê-los faria a aba Documentos parecer vazia.
  const rows = (reportsResult.data || []).filter(
    (row: any) => !idsNoEscopo || !row.colaborador_id || idsNoEscopo.has(row.colaborador_id),
  );
  const collaboratorIds = [...new Set(rows.map((row: any) => row.colaborador_id).filter(Boolean))];
  const collaboratorsResult = collaboratorIds.length
    ? await tdb.from('colaboradores')
        .select('id,nome_completo,cargo')
        .in('id', collaboratorIds)
    : { data: [], error: null };
  if (collaboratorsResult.error) {
    throw new Error(`Falha ao identificar os destinatários dos relatórios: ${collaboratorsResult.error.message}`);
  }

  const collaboratorById = new Map<string, any>(
    (collaboratorsResult.data || []).map((collaborator: any) => [collaborator.id, collaborator]),
  );
  const asDocument = (row: any): RhReportDocument => {
    const collaborator = row.colaborador_id ? collaboratorById.get(row.colaborador_id) : null;
    return {
      id: row.id,
      kind: row.tipo as RhReportKind,
      url: `/api/relatorios/pdf?id=${encodeURIComponent(row.id)}`,
      generatedAt: row.gerado_em || null,
      recipient: collaborator?.nome_completo || null,
      role: collaborator?.cargo || null,
    };
  };

  // O relatório de RH já está representado em `gerenciais.rh`; removê-lo das
  // linhas evita dois cards apontando para o mesmo PDF.
  const pulseDocuments = rows
    .filter((row: any) => row.tipo === 'pulso_executivo' || row.tipo === 'pulso_complementar_nr1')
    .map(asDocument);
  const organization: RhReportDocument[] = [
    gerenciais.rh && {
      id: 'organization-rh', kind: 'rh' as const, url: gerenciais.rh.url,
      generatedAt: gerenciais.rh.em, recipient: companyResult.data?.nome || null, role: null,
    },
    gerenciais.perfilOrg && {
      id: 'organization-profile', kind: 'perfil_org' as const, url: gerenciais.perfilOrg.url,
      generatedAt: gerenciais.perfilOrg.em, recipient: companyResult.data?.nome || null, role: null,
    },
    gerenciais.dna && {
      id: 'organization-dna', kind: 'dna' as const, url: gerenciais.dna.url,
      generatedAt: gerenciais.dna.em, recipient: companyResult.data?.nome || null, role: null,
    },
    ...pulseDocuments,
  ].filter(Boolean) as RhReportDocument[];

  return {
    companyName: companyResult.data?.nome || null,
    scope: {
      turmas,
      turmaId: turmaEscolhida?.id || null,
      turmaNome: turmaEscolhida?.nome || null,
      // Do PANORAMA, não de `escopo.total`: a resolução de escopo conta a
      // participação crua (a conta de RH inclusa), e o painel conta
      // participantes. Um número por pergunta.
      pessoas: panorama.pessoas,
      pessoasEmpresa: pessoasEmpresaResult.count ?? panorama.pessoas,
      insightScopeIsCompany: Boolean(turmaEscolhida),
    },
    dashboard: {
      panorama,
      insight: insightResult.error ? null : normalizeRhReportInsight(insightResult.data?.conteudo),
      descriptorAnalysis: descriptorResult.data,
      generatedAt: insightResult.data?.gerado_em || null,
      insightUnavailable: Boolean(insightResult.error),
    },
    organization,
    managers: rows.filter((row: any) => row.tipo === 'gestor').map(asDocument),
    people: rows.filter((row: any) => row.tipo === 'individual').map(asDocument),
  };
}
