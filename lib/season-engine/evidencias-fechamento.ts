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
import { DEGRADACAO, registrarDegradacao } from '@/lib/degradacao';


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
  degradacao?: { empresaId?: string | null; colaboradorId?: string | null },
) {
  /**
   * 🔴 O SELECT PEDIA UMA COLUNA QUE NUNCA EXISTIU (17/09/2026).
   *
   * Era `'semana, tipo, descritor, reflexao, feedback, tira_duvidas'`, e
   * `temporada_semana_progresso` não tem `descritor` — o descritor da semana vem
   * do `temporada_plano`, logo abaixo. Coluna inexistente no select derruba a
   * QUERY INTEIRA (400/`42703`), então `data` vinha `null`, o guard da linha
   * seguinte lia isso como "trilha sem progresso" e devolvia string vazia.
   *
   * O efeito: o prompt do scorer recebia "(sem evidência registrada nas N
   * semanas)" em todos os descritores, e a nota_pos — que existe justamente para
   * NÃO sair só do cenário — triangulava com duas pernas em vez de três.
   *
   * `Medido: 17/09/2026` — o select entrou em `f42fb93d` (03/07/2026) e desde
   * então rodaram **48 fechamentos, 100% dos que existem na base**. Nenhum deles
   * viu as evidências das semanas. `tira_duvidas` saiu junto: existe na tabela,
   * mas esta função nunca leu esse campo.
   */
  const { data: progressos, error } = await sb.from('temporada_semana_progresso')
    .select('semana, tipo, reflexao, feedback')
    .eq('trilha_id', trilhaId).lte('semana', semAcumulada).order('semana');
  /**
   * E o que deixou isso passar dois meses e meio foi o SILÊNCIO, não o typo: sem
   * ler o `{ error }`, falha de leitura e ausência de dado produzem a mesma
   * string vazia, e o fechamento segue com uma nota pior sem nada acusar. Agora
   * o erro fica no `degradacao_log`, que o health estrutural lê toda madrugada
   * (R10). Continua devolvendo '' de propósito: a pessoa acabou de responder o
   * cenário e não pode ficar sem nota por uma leitura que falhou.
   */
  if (error) {
    await registrarDegradacao({
      fluxo: 'trilha',
      tipo: DEGRADACAO.EVIDENCIAS_FECHAMENTO_NAO_LIDAS,
      chave: trilhaId,
      empresaId: degradacao?.empresaId ?? null,
      colaboradorId: degradacao?.colaboradorId ?? null,
      severidade: 'critico',
      // O `code` vai junto: `42703` (coluna inexistente) é a assinatura desta
      // classe, e é por ele que se distingue schema errado de queda de rede.
      detalhe: { erro: String(error.message || error).slice(0, 300), codigo: error.code ?? null, semana_acumulada: semAcumulada },
    });
    return '';
  }
  if (!progressos?.length) return '';

  // Mapa de temporada_plano pra saber qual descritor cada semana trabalhou.
  // Mesma classe da leitura acima, e o MESMO sintoma: sem o plano, nenhuma
  // semana casa com descritor nenhum e as evidências saem vazias por outro
  // caminho. Corrigir só a primeira deixaria a porta ao lado aberta.
  const { data: trilhaPlan, error: errPlano } = await sb.from('trilhas')
    .select('temporada_plano').eq('id', trilhaId).maybeSingle();
  if (errPlano) {
    await registrarDegradacao({
      fluxo: 'trilha',
      tipo: DEGRADACAO.EVIDENCIAS_FECHAMENTO_NAO_LIDAS,
      chave: trilhaId,
      empresaId: degradacao?.empresaId ?? null,
      colaboradorId: degradacao?.colaboradorId ?? null,
      severidade: 'critico',
      detalhe: { erro: String(errPlano.message || errPlano).slice(0, 300), codigo: errPlano.code ?? null, origem: 'temporada_plano' },
    });
    return '';
  }
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
