import './_env';
import { createSupabaseAdmin } from '@/lib/supabase';
import {
  ACME_DEMO_FIT_RANKING_ROLES,
  ACME_DEMO_FIT_VARIETY_KEYS,
  precomputeDemoFitResults,
  seedAcmeFitRankingSnapshots,
} from '@/lib/demo/acme-fit-rankings';
import { ACME_DEMO_REPORT_DIRECTORY } from '@/lib/demo/acme-rh-report-fixture';
import { computeDiscCompetenciesNatural } from '@/lib/disc-competencias';
import { deriveProfile } from '@/lib/disc-mapeamento';

function behaviorFields(D: number, I: number, S: number, C: number) {
  const comp = computeDiscCompetenciesNatural({ D, I, S, C });
  return {
    lid_executivo: Math.round((D / 2) * 10) / 10,
    lid_motivador: Math.round((I / 2) * 10) / 10,
    lid_metodico: Math.round(S / 2),
    lid_sistematico: Math.round(C / 2),
    comp_ousadia: comp.Ousadia,
    comp_comando: comp.Comando,
    comp_objetividade: comp.Objetividade,
    comp_assertividade: comp.Assertividade,
    comp_persuasao: comp['Persuasão'],
    comp_extroversao: comp['Extroversão'],
    comp_entusiasmo: comp.Entusiasmo,
    comp_sociabilidade: comp.Sociabilidade,
    comp_empatia: comp.Empatia,
    comp_paciencia: comp['Paciência'],
    comp_persistencia: comp['Persistência'],
    comp_planejamento: comp.Planejamento,
    comp_organizacao: comp['Organização'],
    comp_detalhismo: comp.Detalhismo,
    comp_prudencia: comp['Prudência'],
    comp_concentracao: comp['Concentração'],
  };
}

async function main() {
  const sb = createSupabaseAdmin();
  const { data: company, error: companyError } = await sb.from('empresas')
    .select('id,nome,slug,is_demo')
    .eq('slug', 'acme-demo')
    .single();
  if (companyError) throw companyError;
  if (!company.is_demo) throw new Error('ABORTADO: acme-demo não está marcado como tenant de demonstração');

  // Aplica na base já existente os mesmos perfis que o próximo reset passará a
  // inserir. Escopo fechado: seis e-mails fictícios do tenant `acme-demo`.
  for (const key of ACME_DEMO_FIT_VARIETY_KEYS) {
    const person = ACME_DEMO_REPORT_DIRECTORY.find((candidate) => candidate.key === key);
    if (!person) throw new Error(`perfil demonstrativo não encontrado: ${key}`);
    const D = person.d_natural, I = person.i_natural, S = person.s_natural, C = person.c_natural;
    const { error } = await sb.from('colaboradores').update({
      d_natural: D,
      i_natural: I,
      s_natural: S,
      c_natural: C,
      perfil_dominante: deriveProfile({ D, I, S, C }),
      ...behaviorFields(D, I, S, C),
    }).eq('empresa_id', company.id).eq('email', person.email);
    if (error) throw new Error(`atualizar perfil de ${person.nome_completo}: ${error.message}`);
  }

  const fit = await precomputeDemoFitResults(sb, company.id);
  if (fit.failures.length) throw new Error(`falhas ao gravar Fit v2: ${fit.failures.join(' | ')}`);

  const artifacts = await seedAcmeFitRankingSnapshots(sb, company.id, company.nome);
  const verified = [];
  for (const artifact of artifacts) {
    const { data, error } = await sb.storage.from('conteudos').download(artifact.path);
    if (error || !data) throw error || new Error(`snapshot não encontrado: ${artifact.path}`);
    const snapshot = JSON.parse(await data.text());
    const expected = ACME_DEMO_FIT_RANKING_ROLES.find((role) => role.cargo === artifact.cargo)?.expectedPeople;
    if (snapshot?.data?.avaliados !== expected || snapshot?.data?.pessoas?.length !== expected) {
      throw new Error(`snapshot inválido para ${artifact.cargo}`);
    }
    const statuses = snapshot.data.pessoas.reduce((out: Record<string, number>, person: any) => {
      out[person.status] = (out[person.status] || 0) + 1;
      return out;
    }, {});
    verified.push({
      cargo: artifact.cargo,
      pessoas: expected,
      statuses,
      ranking: snapshot.data.pessoas.map((person: any) => ({ nome: person.nome, aderencia: person.beta.pct, status: person.status })),
      path: artifact.path,
    });
  }

  const { count, error: countError } = await sb.from('fit_resultados')
    .select('*', { count: 'exact', head: true })
    .eq('empresa_id', company.id);
  if (countError) throw countError;
  const expectedTotal = ACME_DEMO_FIT_RANKING_ROLES.reduce((sum, role) => sum + role.expectedPeople, 0);
  if (count !== expectedTotal) throw new Error(`Fit v2 esperava ${expectedTotal} resultados e encontrou ${count}`);

  console.log(JSON.stringify({
    company: { id: company.id, name: company.nome },
    fit: { total: fit.total, stored: count, removedStale: fit.removedStale, byRole: fit.byRole },
    rankings: verified,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
