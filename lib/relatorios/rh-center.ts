import 'server-only';

import { tenantDb } from '@/lib/tenant-db';
import { carregarRelatoriosGerenciais } from '@/lib/home/loaders';

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

export type RhReportsCenter = {
  companyName: string | null;
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

/**
 * Central de leitura do RH. O tenant vem exclusivamente da sessão e todas as
 * tabelas de negócio passam por `tenantDb`; nenhum identificador de empresa é
 * aceito do browser. Assim a mesma rota serve todos os tenants sem abrir uma
 * consulta cross-tenant.
 */
export async function carregarCentralRelatoriosRH(empresaId: string): Promise<RhReportsCenter> {
  const tdb = tenantDb(empresaId);
  const [gerenciais, reportsResult, companyResult] = await Promise.all([
    carregarRelatoriosGerenciais(empresaId),
    tdb.from('relatorios')
      .select('id,colaborador_id,tipo,gerado_em')
      .in('tipo', [...PDF_TYPES])
      .order('gerado_em', { ascending: false }),
    tdb.raw.from('empresas').select('nome').eq('id', empresaId).maybeSingle(),
  ]);

  if (reportsResult.error) {
    throw new Error(`Falha ao carregar relatórios do RH: ${reportsResult.error.message}`);
  }
  if (companyResult.error) {
    throw new Error(`Falha ao carregar empresa do RH: ${companyResult.error.message}`);
  }

  const rows = reportsResult.data || [];
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
    organization,
    managers: rows.filter((row: any) => row.tipo === 'gestor').map(asDocument),
    people: rows.filter((row: any) => row.tipo === 'individual').map(asDocument),
  };
}
