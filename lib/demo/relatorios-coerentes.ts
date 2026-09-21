import type { SupabaseClient } from '@supabase/supabase-js';
import { nivelDaNota } from '@/lib/nivel-regua';
import { chaveMapeamento, colaboradoresComMapeamentoCompleto, type CargoMapeamento } from '@/lib/mapeamento-competencias';
import { rosterDemo } from '@/lib/demo/rosters';

export type PessoaLeituraDemo = { id: string; email: string; nome_completo: string; cargo: string; role: string; gestor_email?: string | null };
export type NotaLeituraDemo = { colaborador_id: string; competencia: string; descritor: string; nota: number; assessment_date?: string };
type Avaliacao = { pessoa: PessoaLeituraDemo; competencia: string; nota: number; nivel: number };
const media = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const decimal = (n: number) => Number(n.toFixed(2));
const notaPt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Uma única fonte para narrativa, cartões, distribuição e PDF; sem pontuação inventada. */
export function construirLeiturasDemo(marca: string, pessoas: PessoaLeituraDemo[], cargos: CargoMapeamento[], notas: NotaLeituraDemo[]) {
  const porId = new Map(pessoas.map(p => [p.id, p]));
  const top5 = new Map(cargos.map(c => [chaveMapeamento(c.nome), new Set((Array.isArray(c.top5_workshop) ? c.top5_workshop : []).map(chaveMapeamento))]));
  const validas = notas.filter(n => porId.has(n.colaborador_id) && Number.isFinite(Number(n.nota)) && Number(n.nota) >= 1 && Number(n.nota) <= 4
    && top5.get(chaveMapeamento(porId.get(n.colaborador_id)!.cargo))?.has(chaveMapeamento(n.competencia)));
  const completos = colaboradoresComMapeamentoCompleto(pessoas, cargos, validas);
  const grupos = new Map<string, { pessoa: PessoaLeituraDemo; competencia: string; notas: number[] }>();
  for (const n of validas) {
    const key = `${n.colaborador_id}:${chaveMapeamento(n.competencia)}`;
    const grupo = grupos.get(key) || { pessoa: porId.get(n.colaborador_id)!, competencia: n.competencia, notas: [] };
    grupo.notas.push(Number(n.nota)); grupos.set(key, grupo);
  }
  const avaliacoes: Avaliacao[] = [...grupos.values()].map(g => ({ pessoa: g.pessoa, competencia: g.competencia, nota: media(g.notas), nivel: nivelDaNota(media(g.notas)) }))
    .sort((a, b) => a.pessoa.nome_completo.localeCompare(b.pessoa.nome_completo, 'pt-BR') || a.competencia.localeCompare(b.competencia, 'pt-BR'));
  const frase = (a: Avaliacao) => `${a.pessoa.nome_completo}: ${a.competencia} em N${a.nivel}, nota ${notaPt(a.nota)}.`;
  const destaque = (a: Avaliacao) => ({ nome: a.pessoa.nome_completo, competencia: a.competencia, nivel: a.nivel,
    motivo_destaque: `${frase(a)} Ponto forte no mapeamento inicial; a evolução será comparada após a reavaliação.` });
  const distribuicao = (xs: Avaliacao[]) => Object.fromEntries([1, 2, 3, 4].map(n => [`n${n}`, xs.filter(a => a.nivel === n).length]));
  const gestores = pessoas.filter(p => p.role === 'gestor').map(gestor => {
    const equipe = pessoas.filter(p => p.id !== gestor.id && p.gestor_email?.toLowerCase() === gestor.email.toLowerCase());
    const ids = new Set(equipe.map(p => p.id));
    const medidas = avaliacoes.filter(a => ids.has(a.pessoa.id));
    const avaliados = new Set(medidas.map(a => a.pessoa.id));
    const melhores = [...medidas].sort((a, b) => b.nota - a.nota).slice(0, 3);
    const menores = [...medidas].sort((a, b) => a.nota - b.nota).slice(0, 3);
    const porComp = [...new Set(medidas.map(a => a.competencia))].sort().map(competencia => {
      const grupo = medidas.filter(a => a.competencia === competencia);
      return { competencia, media_nivel: decimal(media(grupo.map(a => a.nota))), distribuicao: distribuicao(grupo),
        padrao_observado: `${grupo.length} pessoas com esta competência avaliada. Média ${notaPt(media(grupo.map(a => a.nota)))} no mapeamento inicial.`,
        acao_gestor: 'Combinar uma aplicação prática e uma evidência observável para a próxima conversa.',
        impacto_se_nao_agir: 'Sem acompanhamento, o diagnóstico não se transforma em prática.' };
    });
    return { colaboradorId: gestor.id, tipo: 'gestor', conteudo: {
      demo_fixture: true, leitura_base: true,
      resumo_executivo: {
        leitura_geral: `A equipe de ${gestor.nome_completo} na organização ${marca} reúne ${equipe.length} pessoas do elenco demonstrativo. ${equipe.filter(p => completos.has(p.id)).length} concluíram o mapeamento do cargo; ${avaliados.size} têm ao menos uma competência avaliada. Esta leitura usa as avaliações atuais do elenco, sem incluir convidados da degustação.`,
        principal_avanco: melhores[0] ? `Ponto forte a reconhecer: ${frase(melhores[0])}` : 'Ainda não há avaliação para identificar um ponto forte.',
        principal_ponto_de_atencao: menores[0] ? `Prioridade para a conversa de desenvolvimento: ${frase(menores[0])}` : 'Acompanhar a conclusão do mapeamento.' },
      destaques_evolucao: melhores.map(destaque),
      ranking_atencao: menores.map(a => ({ nome: a.pessoa.nome_completo, competencia: a.competencia, nivel: a.nivel, urgencia: 'IMPORTANTE', motivo: frase(a), risco_se_nao_agir: 'A dificuldade pode se repetir sem prática e acompanhamento.' })),
      analise_por_competencia: porComp,
      acoes: { acao_principal: 'Transformar a prioridade do diagnóstico em um combinado de prática e acompanhamento.', esta_semana: ['Conversar sobre uma situação real ligada à competência prioritária.', 'Combinar uma ação, um prazo e a evidência esperada.'], proximas_semanas: ['Acompanhar a jornada e oferecer feedback sobre a aplicação.'], medio_prazo: ['Comparar o mapeamento inicial com a reavaliação ao concluir a jornada.'] },
      alertas_metodologicos: ['Notas são médias dos descritores por competência, na régua oficial N1–N4. Esta leitura do mapeamento inicial não comprova evolução.', 'Distribuições contam apenas pessoas com avaliação daquela competência; pendências não recebem nota zero.'],
      mensagem_final: 'Use o diagnóstico para orientar a conversa e a jornada para acompanhar a mudança.' } };
  });
  const base = avaliacoes.filter(a => completos.has(a.pessoa.id));
  const porCargo = [...new Set(base.map(a => a.pessoa.cargo))].sort().map(cargo => {
    const grupo = base.filter(a => a.pessoa.cargo === cargo);
    const porComp = [...new Set(grupo.map(a => a.competencia))].map(competencia => ({ competencia, nota: media(grupo.filter(a => a.competencia === competencia).map(a => a.nota)) })).sort((a,b) => a.nota-b.nota);
    return { cargo, media_nivel: decimal(media(grupo.map(a => a.nota))), leitura: `${new Set(grupo.map(a => a.pessoa.id)).size} pessoas com mapeamento completo; prioridade: ${porComp[0]?.competencia || 'acompanhar a jornada'}.`, principais_forcas: porComp.at(-1) ? [porComp.at(-1)!.competencia] : [], principais_riscos: porComp[0] ? [porComp[0].competencia] : [] };
  });
  const rh = { colaboradorId: null, tipo: 'rh', conteudo: {
    demo_fixture: true, leitura_base: true,
    resumo_executivo: {
      leitura_geral: `A leitura de ${marca} considera o elenco demonstrativo de ${pessoas.length} pessoas. ${completos.size} concluíram o mapeamento do cargo, totalizando ${base.length} avaliações de competências. Os indicadores abaixo usam apenas esse grupo completo; convidados da degustação e avaliações parciais ficam fora deste recorte.`,
      principal_forca_organizacional: 'O mapeamento permite comparar competências avaliadas com a mesma régua e orientar o apoio por cargo.',
      principal_risco_organizacional: 'O diagnóstico exige acompanhamento para se transformar em aplicação no trabalho. A evolução depende da comparação com a reavaliação.' },
    indicadores: { total_avaliados: completos.size, total_avaliacoes: base.length, media_geral: decimal(media(base.map(a => a.nota))), ...Object.fromEntries([1,2,3,4].map(n => [`pct_nivel_${n}`, base.length ? decimal(100*base.filter(a=>a.nivel===n).length/base.length) : 0])) },
    visao_por_cargo: porCargo,
    competencia_foco_por_cargo: porCargo.map(c => ({ cargo: c.cargo, competencia_recomendada: c.principais_riscos[0], horizonte_sugerido: 'próximo ciclo', justificativa: 'Menor média no mapeamento completo deste cargo.', expectativa_impacto: 'Direcionar prática e acompanhamento para a necessidade observada.' })),
    competencias_criticas: porCargo.map(c => ({ competencia: c.principais_riscos[0], criticidade: 'ATENCAO', justificativa: `Prioridade identificada para ${c.cargo}.`, impacto_organizacional: 'Orientar o desenvolvimento com base no diagnóstico.' })),
    treinamentos_sugeridos: porCargo.map(c => ({ competencia: c.principais_riscos[0], titulo: `Prática de ${c.principais_riscos[0]}`, prioridade: 'IMPORTANTE', publico: c.cargo, formato: 'Jornada prática', justificativa: 'Aplicar a competência em situações de trabalho e discutir evidências com a liderança.' })),
    plano_acao: { curto_prazo: ['Validar as prioridades por cargo e combinar evidências de aplicação.'], medio_prazo: ['Acompanhar engajamento, prática e conversas de desenvolvimento.'], longo_prazo: ['Comparar o diagnóstico com a reavaliação ao concluir cada jornada.'] },
    alertas_metodologicos: ['Dados fictícios do elenco demonstrativo. A leitura é do mapeamento inicial; evolução é apresentada nos relatórios de temporadas concluídas.', 'Médias calculadas por competência e pessoa; total de avaliações não é contagem de descritores.'],
    mensagem_final: 'Conecte diagnóstico, prática e reavaliação para acompanhar o desenvolvimento.' } };
  return [...gestores, rh];
}

/** Reaplicada DEPOIS dos artefatos aquecidos: um PDF/texto antigo não pode vencer a fonte atual. */
export async function sincronizarLeiturasDemo(sb: SupabaseClient, empresaId: string, slug: string) {
  if (!['acme-demo', 'gruposinal', 'escolas-acme'].includes(slug)) throw new Error('Ambiente não permitido para leitura demonstrativa.');
  const empresa = await sb.from('empresas').select('id,nome,is_demo').eq('id', empresaId).eq('slug', slug).single();
  if (empresa.error || empresa.data?.is_demo !== true) throw new Error('Leitura demonstrativa exige tenant demo confirmado.');
  const roster = rosterDemo(slug === 'escolas-acme' ? 'escolar' : 'comercial');
  const emails = new Set([...roster.personas, ...(roster.diretorio || [])].map(p => p.email.toLowerCase()));
  const [p, c, existentes] = await Promise.all([
    sb.from('colaboradores').select('id,email,nome_completo,cargo,role,gestor_email').eq('empresa_id', empresaId),
    sb.from('cargos_empresa').select('nome,top5_workshop').eq('empresa_id', empresaId),
    sb.from('relatorios').select('id,tipo,colaborador_id,conteudo').eq('empresa_id', empresaId).in('tipo', ['gestor', 'rh']),
  ]);
  for (const result of [p,c,existentes]) if (result.error) throw new Error(result.error.message);
  const pessoas = (p.data || []).filter(p => emails.has(p.email.toLowerCase()));
  const notas: NotaLeituraDemo[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = await sb.from('descriptor_assessments').select('colaborador_id,competencia,descritor,nota,assessment_date').eq('empresa_id', empresaId).order('id').range(offset, offset + 499);
    if (page.error) throw new Error(page.error.message);
    notas.push(...(page.data || []));
    if ((page.data || []).length < 500) break;
  }
  const reports = construirLeiturasDemo(empresa.data.nome, pessoas, c.data || [], notas);
  for (const report of reports) {
    const old = existentes.data?.find(r => r.tipo === report.tipo && r.colaborador_id === report.colaboradorId);
    const row = { empresa_id: empresaId, colaborador_id: report.colaboradorId, tipo: report.tipo, conteudo: report.conteudo, pdf_path: null, gerado_em: new Date().toISOString() };
    const result = old ? await sb.from('relatorios').update(row).eq('id', old.id).eq('empresa_id', empresaId) : await sb.from('relatorios').insert(row);
    if (result.error) throw new Error(result.error.message);
  }
  return { reports: reports.length, pessoas: pessoas.length, mapeados: (reports.at(-1)!.conteudo as any).indicadores.total_avaliados };
}
