import type { SupabaseClient } from '@supabase/supabase-js';
import { renderDnaPDF } from '@/lib/dna-organizacional-pdf';
import { renderPerfilOrgPDF } from '@/lib/perfil-organizacional-pdf';
import {
  criarDnaOrganizacionalAcmeDemo,
  criarNarrativaDnaAcmeDemo,
  criarPerfilOrganizacionalAcmeDemo,
} from '@/lib/demo/acme-organization-report-fixture';
import {
  ACME_DEMO_FUNNEL_TARGETS,
  ACME_DEMO_TEAM_SIZE,
} from '@/lib/demo/acme-rh-report-fixture';
import { colaboradoresComMapeamentoCompleto } from '@/lib/mapeamento-competencias';

export const ACME_DEMO_ORGANIZATION_REPORT_TIMESTAMP = Date.UTC(2026, 7, 30, 12, 0, 0);
export const ACME_DEMO_ORGANIZATION_REPORT_DATE = '30/08/2026';

export function acmeDemoOrganizationReportPaths(empresaId: string) {
  return {
    profile: `final/perfil-org/${empresaId}-${ACME_DEMO_ORGANIZATION_REPORT_TIMESTAMP}.pdf`,
    dna: `final/dna/${empresaId}-${ACME_DEMO_ORGANIZATION_REPORT_TIMESTAMP}.pdf`,
  };
}

export type AcmeOrganizationReportArtifacts = {
  profile: { path: string; buffer: Uint8Array; people: number };
  dna: { path: string; buffer: Uint8Array; people: number };
};

export async function buildAcmeOrganizationReportArtifacts(
  sb: SupabaseClient,
  empresaId: string,
  empresaNome: string,
): Promise<AcmeOrganizationReportArtifacts> {
  const [peopleResult, assessmentsResult, rolesResult] = await Promise.all([
    sb.from('colaboradores').select('*').eq('empresa_id', empresaId).neq('role', 'rh'),
    sb.from('descriptor_assessments').select('colaborador_id,competencia').eq('empresa_id', empresaId),
    sb.from('cargos_empresa').select('nome,top5_workshop').eq('empresa_id', empresaId),
  ]);
  if (peopleResult.error) throw new Error(`relatórios organizacionais ACME: pessoas: ${peopleResult.error.message}`);
  if (assessmentsResult.error) throw new Error(`relatórios organizacionais ACME: mapeamentos: ${assessmentsResult.error.message}`);
  if (rolesResult.error) throw new Error(`relatórios organizacionais ACME: cargos: ${rolesResult.error.message}`);

  const people = (peopleResult.data || []) as any[];
  // Usa a mesma régua do panorama do RH: ter iniciado alguma competência não
  // significa ter concluído o Top 5 do cargo (na ACME, são 26 iniciados e 25
  // concluídos). O número do PDF precisa fechar com o card executivo.
  const mappedPersonIds = colaboradoresComMapeamentoCompleto(
    people,
    rolesResult.data || [],
    assessmentsResult.data || [],
  );
  const profile = criarPerfilOrganizacionalAcmeDemo(people);
  const dna = criarDnaOrganizacionalAcmeDemo(people, mappedPersonIds);

  if (people.length !== ACME_DEMO_TEAM_SIZE) {
    throw new Error(`relatórios organizacionais ACME esperavam ${ACME_DEMO_TEAM_SIZE} pessoas e encontraram ${people.length}`);
  }
  if (profile.avaliados !== ACME_DEMO_FUNNEL_TARGETS.withProfile) {
    throw new Error(`Perfil Organizacional ACME esperava ${ACME_DEMO_FUNNEL_TARGETS.withProfile} perfis e encontrou ${profile.avaliados}`);
  }
  if (dna.avaliados !== ACME_DEMO_FUNNEL_TARGETS.withMapping) {
    throw new Error(`DNA Organizacional ACME esperava ${ACME_DEMO_FUNNEL_TARGETS.withMapping} mapeados e encontrou ${dna.avaliados}`);
  }

  const paths = acmeDemoOrganizationReportPaths(empresaId);
  const [profileBuffer, dnaBuffer] = await Promise.all([
    renderPerfilOrgPDF({
      empresaNome,
      dataRef: ACME_DEMO_ORGANIZATION_REPORT_DATE,
      solicitadoPor: 'RH',
      p: profile,
    }),
    renderDnaPDF({
      empresaNome,
      dataRef: ACME_DEMO_ORGANIZATION_REPORT_DATE,
      segmento: 'corporativo',
      dna,
      narrativa: criarNarrativaDnaAcmeDemo(dna),
    }),
  ]);

  return {
    profile: { path: paths.profile, buffer: profileBuffer, people: profile.avaliados },
    dna: { path: paths.dna, buffer: dnaBuffer, people: dna.avaliados },
  };
}

export async function uploadAcmeOrganizationReportArtifacts(
  sb: SupabaseClient,
  artifacts: AcmeOrganizationReportArtifacts,
) {
  const uploads = await Promise.all([
    sb.storage.from('conteudos').upload(artifacts.profile.path, Buffer.from(artifacts.profile.buffer), {
      contentType: 'application/pdf', cacheControl: '3600', upsert: true,
    }),
    sb.storage.from('conteudos').upload(artifacts.dna.path, Buffer.from(artifacts.dna.buffer), {
      contentType: 'application/pdf', cacheControl: '3600', upsert: true,
    }),
  ]);
  if (uploads[0].error) throw new Error(`salvar Perfil Organizacional ACME: ${uploads[0].error.message}`);
  if (uploads[1].error) throw new Error(`salvar DNA Organizacional ACME: ${uploads[1].error.message}`);
}

export async function seedAcmeOrganizationReports(
  sb: SupabaseClient,
  empresaId: string,
  empresaNome: string,
) {
  const artifacts = await buildAcmeOrganizationReportArtifacts(sb, empresaId, empresaNome);
  await uploadAcmeOrganizationReportArtifacts(sb, artifacts);
  return artifacts;
}
