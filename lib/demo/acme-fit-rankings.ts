import type { SupabaseClient } from '@supabase/supabase-js';
import {
  aggregateAdequacao,
  type AdequacaoCargo,
  type PessoaAdequacao,
} from '@/lib/adequacao-cargo/aggregate';
import { excludeInternalEmails } from '@/lib/internal-emails';
import { calcularFitUnificado } from '@/lib/scoring/fit-v2-adapter';

/**
 * Ranking demonstrativo da ACME. Cada reset cria uma fotografia nova: o JSON
 * contém IDs de colaboradores recém-criados e, portanto, não pode reutilizar um
 * path que a CDN ainda esteja servindo em cache.
 */
export const ACME_DEMO_FIT_RANKING_ROLES = [
  { cargo: 'Representante Comercial', expectedPeople: 11 },
  { cargo: 'Gerente Comercial', expectedPeople: 2 },
  { cargo: 'Analista Financeiro', expectedPeople: 7 },
  { cargo: 'Coordenador de Operações', expectedPeople: 8 },
] as const;

/** Perfis sintéticos calibrados para a vitrine conter verde, amarelo e cinza. */
export const ACME_DEMO_FIT_VARIETY_KEYS = [
  'marcelo',
  'leandro',
  'natalia',
  'henrique',
  'larissa',
  'rodrigo',
] as const;

/**
 * O cargo do ranking é `string`: com mais de um ambiente demo, prendê-lo aos
 * quatro nomes comerciais faria o tipo recusar "Professor(a)" — e o ranking do
 * RH escolar nasceria vazio por decisão de tipo, não de produto.
 */
export type AcmeDemoFitRankingRole = string;

export type AcmeDemoFitRankingSnapshot = {
  data: AdequacaoCargo;
  empresaNome: string;
  dataISO: string;
  narrativas: Record<string, string>;
  demoFixture: true;
};

export type AcmeDemoFitRankingArtifact = {
  empresaId: string;
  cargo: AcmeDemoFitRankingRole;
  path: string;
  snapshot: AcmeDemoFitRankingSnapshot;
};

export type DemoFitPrecomputeResult = {
  total: number;
  byRole: Record<string, number>;
  failures: string[];
  removedStale: number;
};

const cargoEnc = (cargo: string) => encodeURIComponent(cargo).replace(/%/g, '');

export function acmeDemoFitRankingPath(empresaId: string, cargo: string, timestamp = Date.now()): string {
  return `final/adequacao-cargo/${empresaId}-${cargoEnc(cargo)}-${timestamp}.json`;
}

function strongestBlock(person: PessoaAdequacao): string {
  const blocks = [
    ['Competência', person.competencia],
    ['Liderança', person.lideranca],
    ['DISC', person.discScore],
    ['Mapeamento comportamental', person.mapeamento],
  ] as const;
  return blocks
    .filter(([, score]) => score?.aplicavel)
    .sort((a, b) => (b[1]?.pct || 0) - (a[1]?.pct || 0))[0]?.[0] || 'perfil avaliado';
}

function gateSummary(person: PessoaAdequacao): string {
  const gate = person.knockoutEvidencias?.[0];
  if (!gate) return 'um requisito eliminatório do cargo';
  if (gate.ehBloco) return `${gate.traco} (${Math.round(gate.medidoPct || 0)}%, mínimo de ${Math.round(gate.minPct || 0)}%)`;
  return `${gate.traco} (valor ${Math.round(gate.valorBruto || 0)}, piso ${Math.round(gate.piso || 0)})`;
}

/** Narrativas determinísticas: enriquecem o PDF sem consumir IA durante o reset. */
export function buildAcmeFitRankingNarratives(data: AdequacaoCargo): Record<string, string> {
  return Object.fromEntries(data.pessoas.map((person) => {
    const fit = Math.round(person.beta.pct);
    const strength = strongestBlock(person);
    const gap = person.gaps?.[0];

    if (person.status === 'bloqueado') {
      return [person.nome, `O perfil apresenta ${fit}% de aderência geral, mas não atende neste momento a ${gateSummary(person)}. O resultado deve permanecer no anexo de requisitos eliminatórios e ser validado pelo RH antes de qualquer decisão.`];
    }
    if (person.status === 'recomendado') {
      return [person.nome, `O perfil apresenta ${fit}% de aderência ao cargo, com destaque em ${strength}. A combinação dos blocos avaliados sustenta uma recomendação consistente para o contexto demonstrado.`];
    }
    if (person.status === 'recomendado_com_ressalvas') {
      const attention = gap ? `${gap.traco}, com ${Math.round(gap.fitPct)}% de aderência ao traço` : 'os pontos de atenção indicados no diagnóstico';
      return [person.nome, `O perfil apresenta ${fit}% de aderência e tem ${strength} como principal força. Recomenda-se validar ${attention} na entrevista e acompanhar esse aspecto no plano de desenvolvimento.`];
    }
    const attention = gap ? `${gap.traco}, com ${Math.round(gap.fitPct)}% de aderência ao traço` : 'os gaps apontados no diagnóstico';
    return [person.nome, `O perfil apresenta ${fit}% de aderência e ainda requer desenvolvimento antes de uma recomendação para o cargo. O principal ponto de atenção é ${attention}.`];
  }));
}

export async function buildAcmeFitRankingArtifacts(
  sb: SupabaseClient,
  empresaId: string,
  empresaNome: string,
  generatedAt = Date.now(),
  /**
   * Cargos do ranking. O ACME declara os seus com a contagem esperada (o
   * fixture é fixo, então divergir é defeito). Outro ambiente passa a própria
   * lista, SEM contagem: o elenco dele muda com o roster, e um número cravado
   * aqui viraria falha de reset a cada pessoa a mais.
   */
  roles: ReadonlyArray<{ cargo: string; expectedPeople?: number }> = ACME_DEMO_FIT_RANKING_ROLES,
): Promise<AcmeDemoFitRankingArtifact[]> {
  const artifacts: AcmeDemoFitRankingArtifact[] = [];
  // A vitrine executiva separa "tem valores DISC de fixture" de "concluiu o
  // perfil" por `perfil_dominante`. Ana e Vanessa são os dois casos ainda não
  // concluídos: os valores-fonte existem para permitir uma futura simulação,
  // mas elas não podem aparecer num ranking pronto antes de concluir a etapa.
  const eligibleQuery = sb.from('colaboradores').select('id, cargo, email')
    .eq('empresa_id', empresaId)
    .not('perfil_dominante', 'is', null);
  const { data: eligiblePeople, error: eligibleError } = await excludeInternalEmails(eligibleQuery as any);
  if (eligibleError) throw new Error(`ranking ACME: pessoas elegíveis: ${eligibleError.message}`);
  const eligibleIds = new Set((eligiblePeople || []).map((person: any) => person.id));

  for (const role of roles) {
    const rawData = await aggregateAdequacao(sb, empresaId, role.cargo);
    const pessoas = rawData.pessoas.filter((person) => person.id && eligibleIds.has(person.id));
    const data = { ...rawData, pessoas, avaliados: pessoas.length };
    if (data.semGabarito) throw new Error(`ranking ACME: ${role.cargo} está sem perfil ideal`);
    if (data.semColaboradores) throw new Error(`ranking ACME: ${role.cargo} está sem pessoas com perfil`);
    if (role.expectedPeople != null && data.avaliados !== role.expectedPeople) {
      throw new Error(`ranking ACME: ${role.cargo} esperava ${role.expectedPeople} pessoas e encontrou ${data.avaliados}`);
    }

    artifacts.push({
      empresaId,
      cargo: role.cargo,
      path: acmeDemoFitRankingPath(empresaId, role.cargo, generatedAt),
      snapshot: {
        data,
        empresaNome,
        dataISO: new Date(generatedAt).toISOString(),
        narrativas: buildAcmeFitRankingNarratives(data),
        demoFixture: true,
      },
    });
  }

  return artifacts;
}

export async function uploadAcmeFitRankingArtifacts(
  sb: SupabaseClient,
  artifacts: AcmeDemoFitRankingArtifact[],
): Promise<void> {
  for (const artifact of artifacts) {
    const { error } = await sb.storage.from('conteudos').upload(
      artifact.path,
      Buffer.from(JSON.stringify(artifact.snapshot)),
      { contentType: 'application/json', cacheControl: '0', upsert: false },
    );
    if (error) throw new Error(`salvar ranking ACME de ${artifact.cargo}: ${error.message}`);
  }
  if (!artifacts.length) return;

  // Retenção fechada aos artefatos que este seed identifica como demo. Snapshots
  // manuais não têm `demoFixture: true` e são preservados. Sem esta limpeza, o
  // `list(... limit: 1000)` da tela alcançaria o teto após alguns meses de reset.
  const currentPaths = new Set(artifacts.map((artifact) => artifact.path));
  const prefixes = artifacts.map((artifact) => artifact.path.slice(
    'final/adequacao-cargo/'.length,
    artifact.path.lastIndexOf('-') + 1,
  ));
  const { data: files, error: listError } = await sb.storage.from('conteudos')
    .list('final/adequacao-cargo', { limit: 1000, search: artifacts[0].empresaId });
  if (listError) throw new Error(`listar rankings antigos da ACME: ${listError.message}`);

  const stalePaths: string[] = [];
  for (const file of files || []) {
    const path = `final/adequacao-cargo/${file.name}`;
    if (currentPaths.has(path) || !file.name.endsWith('.json') || !prefixes.some((prefix) => file.name.startsWith(prefix))) continue;
    const { data, error } = await sb.storage.from('conteudos').download(path);
    if (error || !data) continue;
    try {
      const snapshot = JSON.parse(await data.text());
      if (snapshot?.demoFixture === true) stalePaths.push(path);
    } catch { /* arquivo externo ou legado: preserva */ }
  }
  if (stalePaths.length) {
    const { error } = await sb.storage.from('conteudos').remove(stalePaths);
    if (error) throw new Error(`limpar rankings demonstrativos antigos: ${error.message}`);
  }
}

export async function seedAcmeFitRankingSnapshots(
  sb: SupabaseClient,
  empresaId: string,
  empresaNome: string,
  roles?: ReadonlyArray<{ cargo: string; expectedPeople?: number }>,
): Promise<AcmeDemoFitRankingArtifact[]> {
  const artifacts = await buildAcmeFitRankingArtifacts(sb, empresaId, empresaNome, Date.now(), roles);
  await uploadAcmeFitRankingArtifacts(sb, artifacts);
  return artifacts;
}

/**
 * Pré-computa o Fit v2 exibido no admin. O ranking do gestor usa os snapshots
 * acima, mas manter os dois derivados da mesma régua evita telas divergentes.
 */
export async function precomputeDemoFitResults(
  sb: SupabaseClient,
  empresaId: string,
): Promise<DemoFitPrecomputeResult> {
  const { data: cargos, error: cargoError } = await sb.from('cargos_empresa')
    .select('id, nome, gabarito, fit_perfil_ideal, eh_lideranca')
    .eq('empresa_id', empresaId);
  if (cargoError) throw new Error(`pré-computar Fit: cargos: ${cargoError.message}`);

  const colabQuery = sb.from('colaboradores').select('*')
    .eq('empresa_id', empresaId)
    .not('d_natural', 'is', null)
    .not('perfil_dominante', 'is', null);
  const { data: colabs, error: colabError } = await excludeInternalEmails(colabQuery as any);
  if (colabError) throw new Error(`pré-computar Fit: pessoas: ${colabError.message}`);

  const result: DemoFitPrecomputeResult = { total: 0, byRole: {}, failures: [], removedStale: 0 };
  for (const cargo of cargos || []) {
    const gab = cargo.gabarito
      ? (typeof cargo.gabarito === 'string' ? JSON.parse(cargo.gabarito) : cargo.gabarito)
      : null;
    if (!gab?.tela4 || cargo.fit_perfil_ideal) continue;

    for (const colab of (colabs || []).filter((person: any) => person.cargo === cargo.nome)) {
      const score = calcularFitUnificado(gab, colab, {
        ehLideranca: cargo.eh_lideranca,
        cargoNome: cargo.nome,
      });
      if (!score || score.success === false) {
        result.failures.push(`${cargo.nome}/${colab.nome_completo}: ${score?.error || 'motor sem resultado'}`);
        continue;
      }

      const { error } = await sb.from('fit_resultados').upsert({
        empresa_id: empresaId,
        colaborador_id: colab.id,
        cargo_id: cargo.id,
        cargo_nome: cargo.nome,
        versao_modelo: '2.0',
        fit_final: score.fit_final,
        classificacao: score.classificacao,
        recomendacao: score.recomendacao,
        score_base: score.score_base,
        fator_critico: score.fatores.fator_critico,
        fator_excesso: score.fatores.fator_excesso,
        score_mapeamento: score.blocos.mapeamento.score,
        score_competencias: score.blocos.competencias.score,
        score_lideranca: score.blocos.lideranca?.score ?? null,
        score_disc: score.blocos.disc.score,
        resultado_json: score,
        leitura_executiva: score.leitura_executiva,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'empresa_id,colaborador_id' });

      if (error) {
        result.failures.push(`${cargo.nome}/${colab.nome_completo}: ${error.message}`);
        continue;
      }
      result.total++;
      result.byRole[cargo.nome] = (result.byRole[cargo.nome] || 0) + 1;
    }
  }

  // Remove somente resultados órfãos da fotografia atual (por exemplo, Ana e
  // Vanessa, que ainda não concluíram o perfil). A busca resolve primeiro IDs
  // exatos dentro do tenant; não há delete amplo nem risco cross-tenant.
  const eligibleIds = new Set((colabs || []).map((person: any) => person.id));
  const { data: existingFits, error: existingError } = await sb.from('fit_resultados')
    .select('id, colaborador_id')
    .eq('empresa_id', empresaId);
  if (existingError) result.failures.push(`limpar Fits antigos: ${existingError.message}`);
  else {
    const staleIds = (existingFits || [])
      .filter((row: any) => !eligibleIds.has(row.colaborador_id))
      .map((row: any) => row.id);
    if (staleIds.length) {
      const { error: deleteError } = await sb.from('fit_resultados')
        .delete()
        .eq('empresa_id', empresaId)
        .in('id', staleIds);
      if (deleteError) result.failures.push(`limpar Fits antigos: ${deleteError.message}`);
      else result.removedStale = staleIds.length;
    }
  }

  return result;
}
