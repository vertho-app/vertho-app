'use server';

import { tenantDb } from '@/lib/tenant-db';
import { findColabByEmail } from '@/lib/authz';
import { TRILHA } from '@/lib/status';
import { CONVERGENCIA } from '@/lib/season-engine/convergencia';

/**
 * Evolução da PESSOA, lida de `trilhas.evolution_report`.
 *
 * ⚠️ POR QUE A FONTE MUDOU (01/09/2026): esta action lia `evolucao`,
 * `evolucao_descritores` e `sessoes_avaliacao`. As três estavam com **zero
 * linhas em produção**, e não por falta de uso: o único escritor de
 * `evolucao_descritores` é `actions/evolucao-granular.ts::gerarEvolucaoDescritores`,
 * que NENHUMA tela, task ou script chama. A tela existia, funcionava e caía no
 * estado vazio para todo mundo, para sempre.
 *
 * Quem realmente grava evolução é `gerarEvolutionReportCore`, no fechamento da
 * temporada, em `trilhas.evolution_report`. É a mesma fonte que o painel do
 * gestor já lia — agora as duas telas contam a mesma história, e a régua de
 * classificação é a de `lib/season-engine/convergencia`, não uma cópia local.
 *
 * O formato de saída foi mantido (`competencias`, `descritores`, `metricas`)
 * para não reescrever a tela junto com a fonte.
 */
export async function loadEvolucao() {
  const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { error: 'Não autenticado' };

  const colab = await findColabByEmail(email, 'id, nome_completo, empresa_id');
  if (!colab) return { error: 'Colaborador não encontrado' };

  // tenantDb injeta .eq('empresa_id') em toda query: `colaborador_id` sozinho
  // não isola tenant (um id de outra empresa devolveria a linha dele).
  const tdb = tenantDb(colab.empresa_id);

  // O supabase-js RETORNA `{ error }` em vez de lançar: sem checar, uma falha
  // de leitura viraria "você ainda não concluiu nenhuma temporada" na tela de
  // alguém que concluiu — a mesma troca que já fez o certificado acusar
  // participação baixa quando quem falhou foi a query.
  const { data: trilhas, error } = await tdb.from('trilhas')
    .select('id, numero_temporada, competencia_foco, status, evolution_report, evolution_generated_at')
    .eq('colaborador_id', colab.id)
    .eq('status', TRILHA.CONCLUIDA)
    .not('evolution_report', 'is', null)
    .order('evolution_generated_at', { ascending: false });
  if (error) return { error: `Não foi possível carregar sua evolução: ${error.message}` };

  const comReport = (trilhas || []).filter((t: any) => Array.isArray(t.evolution_report?.descritores));

  // PILOTO NÃO MEDE EVOLUÇÃO — e isso não é uma limitação a contornar, é a
  // regra do produto: duas semanas não comportam um antes e um depois. O
  // relatório do piloto grava outra FORMA (`baseline`/`nota_avaliacao`, sem
  // `nota_pre`/`nota_pos`), então lê-lo com a régua regular produziria delta a
  // partir de campos ausentes, ou seja, "0,00 → 0,00" na tela de quem fez tudo
  // certo. Aqui ele entra como PONTO DE PARTIDA, sem delta e sem veredito.
  const pilotos = comReport.filter((t: any) => t.evolution_report?.modo === 'piloto');
  const regulares = comReport.filter((t: any) => t.evolution_report?.modo !== 'piloto');

  // Todos os descritores medidos, da temporada mais recente para a mais antiga.
  const descritores = regulares.flatMap((t: any) =>
    (t.evolution_report.descritores || []).map((d: any) => {
      const notaPre = Number(d.nota_pre ?? 0);
      const notaPos = Number(d.nota_pos ?? notaPre);
      return {
        descritor: d.descritor,
        competencia_nome: d.competencia || t.competencia_foco,
        nota_pre: notaPre,
        nota_pos: notaPos,
        delta: Number((notaPos - notaPre).toFixed(2)),
        // Veredito da régua de produção. A tela NÃO reclassifica por delta:
        // uma segunda régua na camada visual foi exatamente como o nível
        // exibido passou a contradizer o texto da própria avaliação.
        convergencia: d.convergencia || null,
        antes: d.antes || null,
        depois: d.depois || null,
        justificativa: d.justificativa_cenario || null,
        numero_temporada: t.numero_temporada,
      };
    }),
  );

  // Uma linha por competência, com a média de entrada e a de saída.
  const porCompetencia = new Map<string, { nome: string; pre: number[]; pos: number[]; numero_temporada: number }>();
  for (const d of descritores) {
    const chave = d.competencia_nome || 'Competência';
    const atual = porCompetencia.get(chave)
      || { nome: chave, pre: [], pos: [], numero_temporada: d.numero_temporada };
    atual.pre.push(d.nota_pre);
    atual.pos.push(d.nota_pos);
    porCompetencia.set(chave, atual);
  }
  const media = (valores: number[]) =>
    valores.length ? valores.reduce((total, v) => total + v, 0) / valores.length : 0;

  const competencias = [...porCompetencia.values()].map((c) => ({
    nome: c.nome,
    numero_temporada: c.numero_temporada,
    inicial: { nota_decimal: Number(media(c.pre).toFixed(2)) },
    reavaliacao: { nota_decimal: Number(media(c.pos).toFixed(2)) },
  }));

  // Competências do piloto: ponto de partida, `reavaliacao` NULA de propósito.
  // A tela já esconde delta e veredito quando ela falta, então a ausência é o
  // que comunica "aqui ainda não há evolução para afirmar".
  for (const t of pilotos) {
    const linhas = t.evolution_report.descritores || [];
    const porComp = new Map<string, number[]>();
    for (const d of linhas) {
      const chave = d.competencia || t.competencia_foco || 'Competência';
      porComp.set(chave, [...(porComp.get(chave) || []), Number(d.baseline ?? 0)]);
    }
    for (const [nome, notas] of porComp) {
      competencias.push({
        nome,
        numero_temporada: t.numero_temporada,
        inicial: { nota_decimal: Number(media(notas).toFixed(2)) },
        reavaliacao: null as any,
      });
    }
  }

  const notaMedia = media(descritores.map((d) => d.nota_pos));
  const deltaMedia = media(descritores.map((d) => d.delta));

  return {
    colaborador: colab,
    competencias,
    descritores,
    evolucao: comReport.map((t: any) => ({
      numero_temporada: t.numero_temporada,
      competencia_foco: t.competencia_foco,
      insight_geral: t.evolution_report.insight_geral || null,
      proximo_passo: t.evolution_report.proximo_passo || null,
      resumo: t.evolution_report.resumo || null,
      gerado_em: t.evolution_generated_at || null,
    })),
    metricas: {
      totalAvaliadas: competencias.length,
      comReavaliacao: competencias.length,
      notaMedia: Math.round(notaMedia * 10) / 10,
      deltaMedia: Math.round(deltaMedia * 10) / 10,
      confirmadas: descritores.filter((d) => d.convergencia === CONVERGENCIA.CONFIRMADA).length,
      parciais: descritores.filter((d) => d.convergencia === CONVERGENCIA.PARCIAL).length,
      estaveis: descritores.filter((d) => d.convergencia === CONVERGENCIA.ESTAVEL).length,
      atencao: descritores.filter((d) => d.convergencia === CONVERGENCIA.ATENCAO).length,
    },
  };
}
