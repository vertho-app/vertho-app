/**
 * O que a conversa de UMA semana de conteúdo evidencia, POR DESCRITOR.
 *
 * 🔴 POR QUE ISTO EXISTE (medido 27/08/2026)
 * ─────────────────────────────────────────
 * A semana entrega 2 descritores, e a evidência da conversa era creditada só ao
 * `descritor` principal do slot. Creditar os dois dependia de `evidenciaPorCobertos`,
 * que valia `programaConfig.modo === 'piloto'` — ou seja, **só na degustação**.
 *
 * Em macae (jornada, 38 trilhas), dos **364** pares trilha×descritor selecionados,
 * **136 (37%)** chegavam ao fechamento com `"(sem evidência registrada)"`: são os
 * segundos descritores de cada semana. E a jornada não tem semana de missão
 * (`semanasMissao: []`), então não existia outra fonte que os alcançasse.
 *
 * Pior: mesmo onde creditava os dois, empurrava a MESMA linha (mesmo insight,
 * mesmo veredito) para ambos — o que não é avaliar dois descritores, é repetir
 * um. A régua vivia em DUAS cópias (`evidencias-fechamento.ts` e
 * `avaliacao-acumulada-core.ts`), com formatação diferente e o mesmo defeito.
 *
 * Aqui ela é uma só, e passa a ter dois caminhos:
 *
 *   1. **Conversa nova** — o extrator socrático emite `avaliacao_por_descritor`
 *      (mesma estrutura que as semanas de aplicação já produziam), e cada
 *      descritor recebe a leitura DELE, incluindo o veredito honesto de "não
 *      apareceu na conversa".
 *   2. **Conversa antiga** (as 86 já concluídas, sem o campo) — cai na leitura
 *      geral da semana, creditada a TODOS os descritores cobertos. É impreciso,
 *      e é dito na própria linha; "sem evidência registrada" seria pior, porque
 *      faz a acumulada avaliar no vácuo um descritor que foi, sim, trabalhado.
 */

export interface LinhaEvidencia {
  descritor: string;
  texto: string;
}

/** Uma leitura por descritor produzida pelo extrator (socrático ou analítico). */
export interface AvaliacaoDescritor {
  descritor?: string;
  apareceu?: boolean;
  forca_evidencia?: string;
  observacao?: string;
  trecho_sustentador?: string;
  limite?: string;
  nota?: number;
}

/**
 * Linhas que a reflexão de uma semana de CONTEÚDO produz, uma por descritor.
 *
 * `descritoresCobertos` é a lista da semana (o slot do plano). Descritor que a
 * trilha não avalia é filtrado pelo chamador — aqui devolvemos tudo o que a
 * semana evidencia, e quem agrega decide o que cabe na régua.
 */
export function linhasDaReflexaoSemanal(args: {
  semana: number | string;
  reflexao: any;
  /** `descritor` do slot — o principal, usado quando não há lista de cobertos. */
  descritorPrincipal?: string | null;
  descritoresCobertos?: string[] | null;
}): LinhaEvidencia[] {
  const { semana, reflexao } = args;
  if (!reflexao) return [];

  const cobertos = (args.descritoresCobertos?.length
    ? args.descritoresCobertos
    : [args.descritorPrincipal]).filter(Boolean) as string[];
  if (!cobertos.length) return [];

  const avals: AvaliacaoDescritor[] = Array.isArray(reflexao.avaliacao_por_descritor)
    ? reflexao.avaliacao_por_descritor
    : [];

  // ── Caminho 1: leitura POR DESCRITOR ──────────────────────────────────────
  if (avals.length) {
    return cobertos.map((desc) => {
      const a = avals.find((x) => x?.descritor === desc);
      // Descritor coberto pela semana que o extrator não devolveu: dizer que
      // não há leitura é mais honesto do que herdar a do outro descritor.
      if (!a) {
        return { descritor: desc, texto: `Sem ${semana} (conteúdo/reflexão) · sem leitura específica deste descritor na conversa` };
      }
      if (a.apareceu === false) {
        const partes = [
          `Sem ${semana} (conteúdo/reflexão)`,
          'NÃO apareceu na conversa',
          a.limite && `o que faltou: "${a.limite}"`,
        ].filter(Boolean);
        return { descritor: desc, texto: partes.join(' · ') };
      }
      const partes = [
        `Sem ${semana} (conteúdo/reflexão)`,
        a.forca_evidencia && `força: ${a.forca_evidencia}`,
        a.observacao && `leitura: "${a.observacao}"`,
        a.trecho_sustentador && `trecho: "${a.trecho_sustentador}"`,
        a.limite && `limite: "${a.limite}"`,
      ].filter(Boolean);
      return { descritor: desc, texto: partes.join(' · ') };
    });
  }

  // ── Caminho 2: transcript ANTIGO, sem leitura por descritor ───────────────
  // A mesma linha vai para todos os cobertos, e a linha DIZ que é leitura da
  // semana. Sem isso, o segundo descritor de cada semana chegava ao fechamento
  // como "(sem evidência registrada)" — 136 de 364 pares em macae.
  const geral = [
    `Sem ${semana} (conteúdo/reflexão)`,
    cobertos.length > 1 && 'leitura da SEMANA (cobre os dois assuntos, sem separar)',
    reflexao.insight_principal && `insight: "${reflexao.insight_principal}"`,
    reflexao.desafio_realizado && `desafio: ${reflexao.desafio_realizado}`,
    reflexao.qualidade_reflexao && `qualidade: ${reflexao.qualidade_reflexao}`,
    reflexao.sinais_extraidos?.exemplo_concreto && 'exemplo concreto: sim',
    reflexao.sinais_extraidos?.autopercepcao && 'autopercepção: sim',
  ].filter(Boolean).join(' · ');

  return cobertos.map((descritor) => ({ descritor, texto: geral }));
}
