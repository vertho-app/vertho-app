import { seedEngajamentoDemo } from './seed-engajamento';
import { criarPdiAcmeDemo } from './acme-rh-report-fixture';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { rosterDemo } from './rosters';
import { MIX_RESULTADOS_DEMO, notaPanoramaDemo } from './adocao-resultados-fixture';
import { construirEvolucao, construirFechamento, construirPercursoAnterior, distribuicaoPorCargo } from './evolucao-nucleo';
import { getProgramaConfigByModo } from '@/lib/season-engine/programa-config';
import { PROGRESSO, TRILHA } from '@/lib/status';

const checked = async (query: PromiseLike<any>) => {
  const { data, error } = await query;
  if (error) throw new Error(`adoção demo: ${error.message}`);
  return data;
};
const idEvento = (key: string) => {
  const h = createHash('sha256').update(`adocao-demo-v2:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

/** Atualização incremental do elenco editorial. Não apaga convites, conteúdo ou respostas.
 * O reset chama a mesma rotina, para não restaurar a fotografia antiga na noite seguinte.
 * Chamadas operacionais devem salvar backup antes; datas relativas recebem um único relógio.
 */
export async function sincronizarAdocaoDemo(sb: SupabaseClient, empresaId: string, agora = new Date()) {
  const empresa = await checked(sb.from('empresas').select('id,slug,is_demo').eq('id', empresaId).single());
  if (!empresa.is_demo || !['acme-demo', 'gruposinal', 'escolas-acme'].includes(empresa.slug)) throw new Error('Atualização permitida somente nos três ambientes fictícios.');
  const roster = rosterDemo(empresa.slug === 'escolas-acme' ? 'escolar' : 'comercial');
  const elenco = [...roster.personas, ...(roster.diretorio || [])];
  const pessoas = await checked(sb.from('colaboradores').select('id,email,cargo,nome_completo,gestor_email').eq('empresa_id', empresaId).in('email', elenco.map(p => p.email)));
  const porKey = new Map(elenco.map(p => [p.key, pessoas.find((row: any) => row.email === p.email)]));
  if (pessoas.length !== elenco.length) throw new Error('Elenco incompleto: revisão abortada antes das escritas.');
  const ids = pessoas.map((p: any) => p.id);
  async function listar(tabela: string, colunas: string, apenasElenco = false) {
    const rows: any[] = [];
    for (let offset = 0; ; offset += 500) {
      let query = sb.from(tabela).select(colunas).eq('empresa_id', empresaId);
      if (apenasElenco) query = query.in('colaborador_id', ids);
      const page = await checked(query.order('id').range(offset, offset + 499));
      rows.push(...page);
      if (page.length < 500) return rows;
    }
  }
  const [cargos, descritores, notas, trilhas, envios] = await Promise.all([
    listar('cargos_empresa', 'id,nome,top5_workshop'), listar('competencias', 'id,cargo,nome,nome_curto,cod_desc'),
    listar('descriptor_assessments', 'id,colaborador_id,competencia,descritor', true),
    listar('trilhas', 'id,colaborador_id,status,programa_modo,temporada_plano', true), listar('fase4_envios', 'id,colaborador_id', true),
  ]);
  const data = (dias: number) => new Date(agora.getTime() - dias * 86400000).toISOString();
  const top5 = (cargo: string): string[] => cargos.find(c => c.nome === cargo)?.top5_workshop || [];
  const baseNotas = new Map<string, any>();
  const salvarNota = (p: any, competencia: string, descritor: string, nota: number) => baseNotas.set(`${p.id}:${competencia}:${descritor}`, {
    empresa_id: empresaId, colaborador_id: p.id, cargo: p.cargo, competencia, descritor, nota,
    origem: 'demo_panorama', assessment_date: data(56).slice(0, 10),
  });
  for (const key of roster.panorama?.mapeados || []) {
    const p = porKey.get(key);
    if (!p) throw new Error(`Pessoa de apoio ausente: ${key}`);
    for (const n of notas.filter(n => n.colaborador_id === p.id && top5(p.cargo).includes(n.competencia))) {
      salvarNota(p, n.competencia, n.descritor, notaPanoramaDemo(p.email, n.competencia, n.descritor));
    }
    for (const d of descritores.filter(d => d.cargo === p.cargo && d.cod_desc && top5(p.cargo).includes(d.nome))) {
      salvarNota(p, d.nome, d.nome_curto, notaPanoramaDemo(p.email, d.nome, d.nome_curto));
    }
  }
  const concluidos = roster.panorama?.concluidos || [];
  const distribuicao = distribuicaoPorCargo(concluidos.map(chave => ({ chave, cargo: porKey.get(chave).cargo })));
  let concluidas = 0;
  for (const [index, key] of concluidos.entries()) {
    const p = porKey.get(key);
    const old = trilhas.find(t => t.colaborador_id === p.id);
    const modo = old?.programa_modo || (empresa.slug === 'gruposinal' ? 'regular_single' : 'jornada');
    const cfg = getProgramaConfigByModo(modo);
    const evolucao = construirEvolucao(p, MIX_RESULTADOS_DEMO[index % MIX_RESULTADOS_DEMO.length], roster.reguaEvolucao!, distribuicao.get(key));
    for (const d of evolucao.descritores) salvarNota(p, evolucao.competencia, d.descritor, d.nota_pre);
    const fechamento = construirFechamento(evolucao, data(3), { qualitativa: cfg.semanaAcumulada, cenario: cfg.semanaCenarioB });
    const percurso = construirPercursoAnterior(cfg.semanas, fechamento.map(f => f.semana), data(3));
    const row = {
      empresa_id: empresaId, colaborador_id: p.id, status: TRILHA.CONCLUIDA, programa_modo: modo,
      data_inicio: data(cfg.semanas * 7 + 3).slice(0, 10),
      temporada_plano: old?.temporada_plano?.length === cfg.semanas ? old.temporada_plano : percurso.plano,
      competencia_foco: evolucao.competencia, competencias_foco: [evolucao.competencia],
      descritores_selecionados: evolucao.descritores.map(d => ({ descritor: d.descritor, competencia: evolucao.competencia, nota_atual: d.nota_pre })),
      evolution_report: evolucao.evolution_report, evolution_generated_at: data(3),
    };
    const trilha = old ? (await checked(sb.from('trilhas').update(row).eq('id', old.id).eq('empresa_id', empresaId).select('id').single()))
      : await checked(sb.from('trilhas').insert(row).select('id').single());
    const progresso = [...percurso.progresso, ...fechamento].map(pr => ({ ...pr, empresa_id: empresaId, colaborador_id: p.id, trilha_id: trilha.id }));
    await checked(sb.from('temporada_semana_progresso').upsert(progresso, { onConflict: 'trilha_id,semana' }));
    const envio = envios.find(e => e.colaborador_id === p.id);
    const cadencia = { empresa_id: empresaId, colaborador_id: p.id, email: p.email, nome: p.nome_completo, cargo: p.cargo, gestor_email: p.gestor_email, data_inicio: row.data_inicio, semana_atual: cfg.semanas, status: 'Concluido' };
    await checked(envio ? sb.from('fase4_envios').update(cadencia).eq('id', envio.id).eq('empresa_id', empresaId) : sb.from('fase4_envios').insert(cadencia));
    concluidas++;
  }
  const rows = [...baseNotas.values()];
  for (let offset = 0; offset < rows.length; offset += 200) await checked(sb.from('descriptor_assessments').upsert(rows.slice(offset, offset + 200), { onConflict: 'colaborador_id,competencia,descritor' }));

  // Os PDIs editoriais do apoio também precisam refletir as notas atuais.
  // Relatórios ricos das personas e relatórios externos ficam preservados.
  const individuais = await listar('relatorios', 'id,colaborador_id,tipo,conteudo', true);
  const apoioIds = new Set((roster.panorama?.mapeados || []).map(k => porKey.get(k).id));
  for (const report of individuais.filter(r => r.tipo === 'individual' && r.conteudo?.demo_fixture === true && apoioIds.has(r.colaborador_id))) {
    const p = pessoas.find((p: any) => p.id === report.colaborador_id);
    const avaliacoes = top5(p.cargo).map(competencia => {
      const medidas = rows.filter(n => n.colaborador_id === p.id && n.competencia === competencia);
      return { competencia, nota: medidas.length ? medidas.reduce((n, a) => n + a.nota, 0) / medidas.length : 0 };
    }).filter(a => a.nota > 0);
    if (avaliacoes.length !== top5(p.cargo).length) throw new Error('PDI sem todas as notas do cargo.');
    const conteudo = criarPdiAcmeDemo(p, { avaliacoes, totalSemanas: report.conteudo.total_semanas, programaModo: report.conteudo.programa_modo });
    await checked(sb.from('relatorios').update({ conteudo, pdf_path: null, gerado_em: agora.toISOString() }).eq('id', report.id).eq('empresa_id', empresaId));
  }

  // Mantém a fotografia das duas personas navegáveis, inclusive mídia e evidências.
  // Reancora apenas o calendário à semana que já consta do progresso.
  const atuais = await listar('trilhas', 'id,colaborador_id,status', true);
  const progressos = await listar('temporada_semana_progresso', 'id,trilha_id,colaborador_id,semana,status', true);
  const atrasados = new Set((roster.panorama?.atrasados || []).map(k => porKey.get(k).id));
  for (const t of atuais.filter(t => t.status === TRILHA.ATIVA)) {
    const feitas = progressos.filter(pr => pr.trilha_id === t.id && pr.status === PROGRESSO.CONCLUIDO).length;
    await checked(sb.from('trilhas').update({ data_inicio: data(atrasados.has(t.colaborador_id) ? 28 : feitas * 7).slice(0, 10) }).eq('id', t.id).eq('empresa_id', empresaId));
  }
  const eventos = progressos.filter(pr => pr.status === PROGRESSO.CONCLUIDO).flatMap((pr, i) => {
    const formato = ['audio', 'texto', 'case', 'video'][i % 4];
    return ['abertura', 'formato', ...(formato === 'audio' ? ['audio_fim'] : [])].map(tipo => ({
      id: idEvento(`${empresaId}:${pr.trilha_id}:${pr.semana}:${tipo}`), empresa_id: empresaId,
      colaborador_id: pr.colaborador_id, trilha_id: pr.trilha_id, semana: pr.semana, pilula: 1,
      tipo, formato: tipo === 'abertura' ? null : formato, criado_em: data(3),
    }));
  });
  for (let offset = 0; offset < eventos.length; offset += 200) await checked(sb.from('trilha_eventos').upsert(eventos.slice(offset, offset + 200), { onConflict: 'id' }));
  await seedEngajamentoDemo(sb, empresaId, agora);
  return { pessoas: pessoas.length, notas: rows.length, concluidas, eventos: eventos.length };
}
