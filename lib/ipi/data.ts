import 'server-only';
import type { AuthenticatedContext } from '@/lib/auth/request-context';
import type { PermissionKey } from '@/lib/permissions';
import { tenantDb } from '@/lib/tenant-db';
import { isIpiEmail, type IpiPlan, type IpiEvidence } from './contracts';

/** Catálogo fechado de SELECTs. O modelo nunca escolhe tabela, coluna, SQL ou empresa. */
export async function readIpiData(auth: AuthenticatedContext, permissions: Set<PermissionKey>, empresaId: string | null, plan: IpiPlan): Promise<IpiEvidence[]> {
  if (!isIpiEmail(auth.email)) throw new Error('IPI_FORBIDDEN');
  if (empresaId && !auth.isPlatformAdmin && empresaId !== auth.empresaId) throw new Error('IPI_FORBIDDEN');
  if (!plan.data.length) return [];
  if (!empresaId) return [{ id: 'D1', kind: 'dados', title: 'Empresa não selecionada', reference: 'Contexto da consulta', text: 'Nenhuma consulta foi executada. Peça para selecionar uma empresa no painel antes de conferir dados.' }];
  const tdb = tenantDb(empresaId);
  const evidence: IpiEvidence[] = [];
  function add(title: string, payload: unknown) {
    evidence.push({ id: `D${evidence.length + 1}`, kind: 'dados', title, reference: `Consulta de leitura · ${new Date().toISOString()}`, text: JSON.stringify(payload) });
  }
  if (!permissions.has('companies.view')) { add('Acesso aos dados', { aviso: 'Seu perfil não tem permissão para consultar empresas.' }); return evidence; }
  // Este catálogo consulta a empresa inteira, não equipes, tutorados ou registros próprios.
  if (!auth.isPlatformAdmin && auth.role !== 'rh') { add('Acesso aos dados', { aviso: 'Seu perfil tem acesso limitado à equipe ou aos próprios dados. Esta consulta da empresa inteira não foi executada; a orientação pelo manual e código continua disponível.' }); return evidence; }
  const company = await tdb.raw.from('empresas').select('id, nome').eq('id', empresaId).maybeSingle();
  if (company.error) { add('Empresa', { erro: 'Não foi possível consultar a empresa. Não concluir que ela não existe.' }); return evidence; }
  if (!company.data) { add('Empresa', { aviso: 'Empresa selecionada não encontrada.' }); return evidence; }
  add('Empresa selecionada', company.data);

  let personIds: string[] | undefined;
  if (plan.person.trim()) {
    if (!permissions.has('users.view')) { add('Colaboradores', { aviso: 'Sem permissão para consultar colaboradores.' }); return evidence; }
    const term = plan.person.trim().replace(/[%_\\]/g, '');
    if (term.length < 2) { add('Busca de pessoa', { aviso: 'Informe um nome com pelo menos dois caracteres.' }); return evidence; }
    const result = await tdb.from('colaboradores').select('id, nome_completo, cargo, perfil_dominante', { count: 'exact' }).ilike('nome_completo', `%${term}%`).order('nome_completo').limit(6);
    if (result.error) { add('Busca de pessoa', { erro: 'Consulta indisponível. Não concluir que a pessoa não existe.' }); return evidence; }
    add('Pessoas encontradas', { registros: result.data, total: result.count, limite: 6 });
    // Nome ambíguo não vira diagnóstico de uma pessoa escolhida pelo modelo.
    if (result.count !== 1 || result.data?.length !== 1) { add('Identificação da pessoa', { aviso: 'Peça o nome completo para identificar uma única pessoa; nenhum diagnóstico individual foi consultado.' }); return evidence; }
    personIds = [result.data[0].id];
  }

  for (const kind of [...new Set(plan.data)]) {
    try {
      if (kind === 'resumo') {
        const counts: Record<string, number | string> = {};
        for (const table of ['colaboradores', 'cargos_empresa', 'competencias', 'trilhas']) {
          if (table === 'colaboradores' && !permissions.has('users.view')) continue;
          if (table === 'trilhas' && !permissions.has('reports.aggregate.view')) continue;
          const result = await tdb.from(table).select('id', { count: 'exact', head: true });
          counts[table] = result.error ? 'consulta indisponível' : result.count;
        }
        add('Cadastros e trilhas da empresa', counts);
        continue;
      }
      if (kind === 'colaboradores') {
        if (!permissions.has('users.view')) { add('Colaboradores', { aviso: 'Sem permissão de leitura.' }); continue; }
        if (personIds) continue; // já consultado com identificação única
        const result = await tdb.from('colaboradores').select('id, nome_completo, cargo, perfil_dominante', { count: 'exact' }).order('nome_completo').limit(8);
        add('Colaboradores', result.error ? { erro: 'Leitura indisponível.' } : { registros: result.data, total: result.count, limite: 8 });
        continue;
      }
      if (kind === 'trilhas' || kind === 'relatorios') {
        const permission = personIds ? 'reports.individual.view' : 'reports.aggregate.view';
        if (!permissions.has(permission)) { add(kind, { aviso: 'Sem permissão de leitura para esses dados.' }); continue; }
        // Sem pessoa identificada: apenas contagem agregada, sem dados individuais.
        if (!personIds) {
          const result = await tdb.from(kind).select('id', { count: 'exact', head: true });
          add(kind, result.error ? { erro: 'Leitura indisponível.' } : { total: result.count, aviso: 'Para verificar uma pessoa, informe o nome completo.' });
          continue;
        }
        const columns = kind === 'trilhas' ? 'id, status, competencia_foco, programa_modo, criado_em' : 'id, tipo, gerado_em';
        const result = await tdb.from(kind).select(columns, { count: 'exact' }).in('colaborador_id', personIds).order(kind === 'trilhas' ? 'criado_em' : 'gerado_em', { ascending: false }).limit(8);
        add(kind, result.error ? { erro: 'Leitura indisponível.' } : { registros: result.data, total: result.count, limite: 8, aviso: 'Ausência nesta tabela não prova ausência de outros tipos de relatório ou artefato. Confira o código da tela correspondente.' });
        continue;
      }
      const table = kind === 'cargos' ? 'cargos_empresa' : 'competencias';
      const columns = kind === 'cargos' ? 'id, nome' : 'id, nome, cargo';
      const result = await tdb.from(table).select(columns, { count: 'exact' }).order('nome').limit(12);
      add(kind, result.error ? { erro: 'Leitura indisponível.' } : { registros: result.data, total: result.count, limite: 12 });
    } catch {
      add(kind, { erro: 'Falha ao consultar. Não interpretar como ausência de dados.' });
    }
  }
  return evidence;
}
