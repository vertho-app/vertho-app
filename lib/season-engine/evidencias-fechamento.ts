/**
 * Insumos de TRIANGULAÇÃO do fechamento (Cenário B) — extraídos byte-iguais
 * da rota /api/temporada/evaluation para servirem também à regeneração da
 * auditoria-sem14 (que mantinha uma cópia própria com semana 13 HARDCODED —
 * quebraria pra piloto/onboarding).
 *
 * A nota_pos NUNCA sai só do cenário: agrega evidências de TODAS as semanas
 * até a acumulada (conteúdo + prática + auto-percepção).
 */
import { linhasDaReflexaoSemanal } from '@/lib/season-engine/evidencia-semana';


/**
 * Normaliza o payload do acumulado (single OU multi-comp DUO) pro shape que
 * o prompt do scorer consome como referência estruturada.
 */
export function normalizarAcumuladoPrimaria(acumulado: any) {
  if (!acumulado) return null;
  if (acumulado.primaria) return acumulado.primaria;
  if (!Array.isArray(acumulado.por_competencia)) return null;
  const avaliacao_acumulada = acumulado.por_competencia.flatMap((item: any) =>
    (item.primaria?.avaliacao_acumulada || []).map((d: any) => ({
      ...d,
      competencia: item.competencia,
    })),
  );
  return {
    multi: true,
    competencias: acumulado.competencias,
    avaliacao_acumulada,
    resumo_geral: acumulado.por_competencia
      .map((item: any) => item.primaria?.resumo_geral ? `${item.competencia}: ${item.primaria.resumo_geral}` : null)
      .filter(Boolean)
      .join('\n'),
  };
}

/**
 * Agrega evidências qualitativas de TODAS as semanas até a acumulada numa
 * string estruturada por descritor.
 * A reflexão da semana evidencia TODOS os `descritores_cobertos` — a régua está
 * em `linhasDaReflexaoSemanal` (fonte única com `avaliacao-acumulada-core`).
 *
 * ⚠️ O parâmetro `evidenciaPorCobertos` foi REMOVIDO em 27/08/2026. Ele valia
 * `modo === 'piloto'` e era a única porta para creditar os dois descritores;
 * fora da degustação, o segundo de cada semana chegava aqui sem nada — 136 de
 * 364 pares em macae. Deixá-lo como parâmetro ignorado seria pior que removê-lo:
 * os chamadores continuariam passando um valor que não decide mais nada.
 */
export async function agregarEvidenciasAteAcumulada(
  sb: any,
  trilhaId: string,
  descritoresComRegua: any[],
  semAcumulada: number = 13,
) {
  const { data: progressos } = await sb.from('temporada_semana_progresso')
    .select('semana, tipo, descritor, reflexao, feedback, tira_duvidas')
    .eq('trilha_id', trilhaId).lte('semana', semAcumulada).order('semana');
  if (!progressos?.length) return '';

  // Mapa de temporada_plano pra saber qual descritor cada semana trabalhou
  const { data: trilhaPlan } = await sb.from('trilhas')
    .select('temporada_plano').eq('id', trilhaId).maybeSingle();
  const plano = Array.isArray(trilhaPlan?.temporada_plano) ? trilhaPlan.temporada_plano : [];
  const descritorPorSem = Object.fromEntries(plano.map((s: any) => [s.semana, s.descritor]));
  const descritoresCobertosPorSem = Object.fromEntries(plano.map((s: any) => [s.semana, s.descritores_cobertos || []]));

  const linhasPorDescritor: Record<string, string[]> = {};
  for (const d of descritoresComRegua) linhasPorDescritor[d.descritor] = [];

  for (const p of progressos) {
    // Conteúdo: reflexão socrática. Régua ÚNICA (`linhasDaReflexaoSemanal`),
    // compartilhada com `avaliacao-acumulada-core` — as duas tinham cópias com
    // formatação diferente e o mesmo defeito de creditar só o principal.
    if (p.tipo === 'conteudo' && p.reflexao) {
      const linhas = linhasDaReflexaoSemanal({
        semana: p.semana,
        reflexao: p.reflexao,
        descritorPrincipal: descritorPorSem[p.semana],
        descritoresCobertos: descritoresCobertosPorSem[p.semana],
      });
      for (const l of linhas) {
        if (!linhasPorDescritor[l.descritor]) continue;
        linhasPorDescritor[l.descritor].push(l.texto);
      }
    }
    // Prática (sems de missão): feedback analítico ou missão
    if (p.tipo === 'aplicacao' && p.feedback) {
      const cobertos = descritoresCobertosPorSem[p.semana] || [];
      const avals = Array.isArray(p.feedback.avaliacao_por_descritor) ? p.feedback.avaliacao_por_descritor : [];
      const modo = p.feedback.modo || 'cenario';
      const compromisso = p.feedback.compromisso;
      for (const desc of cobertos) {
        if (!linhasPorDescritor[desc]) continue;
        const aval = avals.find((a: any) => a.descritor === desc);
        const partes = [
          `Sem ${p.semana} (prática${modo === 'pratica' ? ' — missão real' : ' — cenário escrito'})`,
          modo === 'pratica' && compromisso && `compromisso: "${compromisso}"`,
          aval?.observacao && `avaliação: "${aval.observacao}"`,
          aval?.nota && `nota: ${aval.nota}`,
        ].filter(Boolean).join(' · ');
        if (partes) linhasPorDescritor[desc].push(partes);
      }
    }
    // Semana da acumulada: evolução percebida (auto-percepção)
    if (p.semana === semAcumulada && p.reflexao?.evolucao_percebida) {
      for (const ev of p.reflexao.evolucao_percebida) {
        if (!linhasPorDescritor[ev.descritor]) continue;
        const partes = [
          `Sem ${semAcumulada} (auto-percepção)`,
          ev.antes && `antes: "${ev.antes}"`,
          ev.depois && `depois: "${ev.depois}"`,
          ev.evidencia && `evidência: "${ev.evidencia}"`,
          ev.nivel_percebido != null && `nível percebido: ${ev.nivel_percebido}`,
        ].filter(Boolean).join(' · ');
        linhasPorDescritor[ev.descritor].push(partes);
      }
    }
  }

  const blocos = descritoresComRegua.map((d: any) => {
    const linhas = linhasPorDescritor[d.descritor] || [];
    if (!linhas.length) return `### ${d.descritor}\n(sem evidência registrada nas ${semAcumulada} semanas)`;
    return `### ${d.descritor}\n- ${linhas.join('\n- ')}`;
  });
  return blocos.join('\n\n');
}
