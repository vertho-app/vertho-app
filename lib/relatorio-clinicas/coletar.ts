import 'server-only';

/**
 * Coleta do relatório por clínica (`montar.ts`): lê, da EMPRESA, as clínicas, as secretárias, o Top 5
 * de cada cargo, as respostas do diagnóstico, a turma ativa e a trilha de cada pessoa. Tudo por
 * `tenantDb` (o `empresa_id` vai em toda cadeia) e com o `{ error }` lido: uma falha de leitura LANÇA,
 * porque "não consegui ler" virando "ninguém fez o diagnóstico" mandaria ao RH uma cobrança falsa.
 */

import { tenantDb } from '@/lib/tenant-db';
import { excludeInternalEmails } from '@/lib/internal-emails';
import { lerTudoPaginado } from '@/lib/paginacao';
import { normalizeAssessmentCompetency, type AssessmentAnswerRef } from '@/lib/assessment/completion';
import type { CompetenciaContada } from '@/lib/assessment/competencias-do-mapeamento';
import { TRILHA, TURMA_MEMBRO } from '@/lib/status';
import type { DadosRelatorioClinicas, PessoaDaClinica, TrilhaDaPessoa } from './montar';

const lancar = (oque: string, error: any) => {
  if (error) throw new Error(`relatório das clínicas: ${oque}: ${error?.message || error}`);
};

export async function coletarDadosRelatorioClinicas(empresaId: string): Promise<DadosRelatorioClinicas> {
  const tdb = tenantDb(empresaId);

  const [escolas, pessoasRes, cargos, comps, membros, turmas, trilhas, envios] = await Promise.all([
    tdb.from('escolas').select('id, nome'),
    // Só a secretária (papel colaborador). As contas internas da vertho.ai ficam fora.
    excludeInternalEmails(tdb.from('colaboradores')
      .select('id, nome_completo, cargo, escola_id, perfil_dominante')
      .eq('role', 'colaborador')),
    tdb.from('cargos_empresa').select('nome, top5_workshop'),
    tdb.from('competencias').select('id, nome, cargo'),
    tdb.from('turma_membros').select('colaborador_id, turma_id').eq('status', TURMA_MEMBRO.ATIVO),
    tdb.from('turmas').select('id, data_inicio'),
    tdb.from('trilhas').select('colaborador_id, numero_temporada, status').order('numero_temporada', { ascending: false }),
    tdb.from('fase4_envios').select('colaborador_id, semana_atual'),
  ]);
  lancar('clínicas', escolas.error);
  lancar('secretárias', pessoasRes.error);
  lancar('cargos', cargos.error);
  lancar('competências', comps.error);
  lancar('turmas (participações)', membros.error);
  lancar('turmas', turmas.error);
  lancar('trilhas', trilhas.error);
  lancar('envios', envios.error);

  const pessoas: PessoaDaClinica[] = (pessoasRes.data || []).map((c: any) => ({
    id: c.id,
    nome: c.nome_completo,
    cargo: c.cargo,
    escolaId: c.escola_id || null,
    temPerfil: !!c.perfil_dominante,
  }));
  const ids = new Set(pessoas.map((p) => p.id));

  // A mesma régua do cabeçalho do diagnóstico (`competenciasParaContagem`): Top 5 do cargo, com as ids
  // das linhas de cada competência, casadas pelo nome normalizado.
  const idsPorCargoENome = new Map<string, string[]>();
  for (const c of comps.data || []) {
    const k = `${c.cargo}::${normalizeAssessmentCompetency(c.nome)}`;
    if (c.id) idsPorCargoENome.set(k, [...(idsPorCargoENome.get(k) || []), String(c.id)]);
  }
  const competenciasPorCargo = new Map<string, CompetenciaContada[]>();
  for (const cargo of cargos.data || []) {
    const top5: string[] = Array.isArray(cargo.top5_workshop) ? cargo.top5_workshop : [];
    competenciasPorCargo.set(String(cargo.nome || ''), top5.map((nome) => ({
      nome,
      ids: idsPorCargoENome.get(`${cargo.nome}::${normalizeAssessmentCompetency(nome)}`) || [],
    })));
  }

  // Respostas: paginadas (o PostgREST corta em 1.000 sem avisar) e só das secretárias do relatório.
  const respostas = await lerTudoPaginado((de, ate) => tdb.from('respostas')
    .select('colaborador_id, competencia_id, competencia_nome').order('id').range(de, ate));
  lancar('respostas', respostas.error);
  const respostasPorPessoa = new Map<string, AssessmentAnswerRef[]>();
  for (const r of respostas.data) {
    if (!ids.has(r.colaborador_id)) continue;
    respostasPorPessoa.set(r.colaborador_id, [...(respostasPorPessoa.get(r.colaborador_id) || []), r]);
  }

  const inicioDaTurma = new Map<string, string>((turmas.data || [])
    .filter((t: any) => t.data_inicio)
    .map((t: any) => [t.id, String(t.data_inicio).slice(0, 10)]));
  const inicioDaTurmaPorPessoa = new Map<string, string>();
  for (const m of membros.data || []) {
    const inicio = inicioDaTurma.get(m.turma_id);
    if (inicio && ids.has(m.colaborador_id)) inicioDaTurmaPorPessoa.set(m.colaborador_id, inicio);
  }

  const semanaPorPessoa = new Map<string, number>((envios.data || [])
    .map((e: any) => [e.colaborador_id, Number(e.semana_atual) || 0]));
  const trilhaPorPessoa = new Map<string, TrilhaDaPessoa>();
  // A mais recente por pessoa (a leitura vem por temporada decrescente).
  for (const t of trilhas.data || []) {
    if (!ids.has(t.colaborador_id) || trilhaPorPessoa.has(t.colaborador_id)) continue;
    trilhaPorPessoa.set(t.colaborador_id, {
      numeroTemporada: Number(t.numero_temporada) || 1,
      semanaAtual: semanaPorPessoa.get(t.colaborador_id) || null,
      ativa: t.status === TRILHA.ATIVA,
    });
  }

  return {
    clinicas: (escolas.data || []).map((e: any) => ({ id: e.id, nome: e.nome })),
    pessoas,
    competenciasPorCargo,
    respostasPorPessoa,
    inicioDaTurmaPorPessoa,
    trilhaPorPessoa,
  };
}
