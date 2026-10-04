/**
 * Os NÍVEIS do relatório consolidado do RH, sem nota decimal (R-32 e lote 5b,
 * 04/10/2026).
 *
 * O relatório de RH gerado por IA trazia `indicadores.media_geral` e, por cargo,
 * `media_nivel`: duas médias de níveis inteiros, o número que nenhuma pessoa tem
 * e que convida a comparar cargos por uma casa decimal. A decisão do dono é que
 * ninguém do cliente vê nota decimal. O Relatório do Gestor (lote 5) já falava em
 * "nível mais frequente" e "pessoas por nível"; este arquivo dá o mesmo vocabulário
 * ao do RH e é a ÚNICA leitura dos dois formatos que convivem no banco:
 *
 *  - NOVO: `distribuicao: {n1..n4}` e `nivel_mais_frequente` por cargo, e só
 *    `pct_nivel_1..4` nos indicadores (sem `media_geral`);
 *  - ANTIGO (relatórios já gravados, não regerados): `media_nivel` ou `media` por
 *    cargo e `media_geral` nos indicadores. Medido em 04/10/2026: 6 relatórios de
 *    RH, 4 deles com `media_nivel`, 1 com `media` e 1 demonstrativo.
 *
 * Quem lê (o PDF, a tela, o normalizador do painel) pergunta aqui; nenhum leitor
 * repete a conta e nenhum devolve a média ao cliente.
 */
import { nivelMaisFrequente } from '@/lib/nivel-frequente';
import { nivelDaNota, nivelOuNull, type Nivel } from '@/lib/nivel-regua';

export interface DistribuicaoDeNiveis {
  n1: number;
  n2: number;
  n3: number;
  n4: number;
}

const NIVEIS = [1, 2, 3, 4] as const;

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Conta quantas avaliações há em cada nível. Nível fora de 1 a 4 (ou fracionário) não entra. */
export function contarNiveis(niveis: ReadonlyArray<number | null | undefined>): DistribuicaoDeNiveis {
  const dist: DistribuicaoDeNiveis = { n1: 0, n2: 0, n3: 0, n4: 0 };
  for (const n of niveis) {
    const nivel = nivelOuNull(n);
    if (nivel != null) dist[`n${nivel}`]++;
  }
  return dist;
}

/** O nível em que mais gente está. Empate vai para o MENOR; `null` sem ninguém em nível nenhum. */
export function nivelDaDistribuicao(dist: DistribuicaoDeNiveis | null | undefined): Nivel | null {
  if (!dist) return null;
  return nivelMaisFrequente(NIVEIS.map((level) => ({ level, peso: dist[`n${level}`] })));
}

/**
 * `{ n1, n2, n3, n4 }` lido de um relatório gravado, ou `null` quando não há
 * distribuição para mostrar (relatório antigo, objeto vazio ou tudo zero).
 * Contagem é inteiro não negativo: lixo vira zero, nunca número negativo na tela.
 */
export function lerDistribuicao(valor: unknown): DistribuicaoDeNiveis | null {
  if (!ehObjeto(valor)) return null;
  const dist: DistribuicaoDeNiveis = { n1: 0, n2: 0, n3: 0, n4: 0 };
  for (const level of NIVEIS) {
    const n = Number(valor[`n${level}`]);
    dist[`n${level}`] = Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  }
  return dist.n1 + dist.n2 + dist.n3 + dist.n4 > 0 ? dist : null;
}

/** "N2", "2" ou 2 (como a IA às vezes devolve o inteiro) lido como nível, ou `null`. */
function lerNivel(valor: unknown): Nivel | null {
  if (typeof valor === 'string') {
    const m = valor.trim().match(/^N?\s*([1-4])$/i);
    return m ? (Number(m[1]) as Nivel) : null;
  }
  return nivelOuNull(valor);
}

/**
 * O nível GERAL da organização, do bloco `indicadores` do relatório: o mais
 * frequente entre `pct_nivel_1..4`. Esses percentuais existem nos dois formatos,
 * então o número vem sempre da distribuição e nunca do que a IA escreveu.
 */
export function nivelGeralDosIndicadores(indicadores: unknown): Nivel | null {
  if (!ehObjeto(indicadores)) return null;
  return nivelMaisFrequente(NIVEIS.map((level) => ({ level, peso: Number(indicadores[`pct_nivel_${level}`]) || 0 })));
}

export interface LeituraDoCargo {
  /** N1 a N4, ou `null` quando o relatório não traz nível nenhum para o cargo. */
  nivel: Nivel | null;
  /**
   * De onde veio o nível. `frequente` é o nível em que mais avaliações estão
   * (relatório novo). `media` é o nível da MÉDIA que um relatório antigo gravou,
   * que é outra pergunta: o PDF não o chama de "mais frequente".
   */
  origem: 'frequente' | 'media' | null;
  /** Avaliações por nível, só quando o relatório traz (os antigos não trazem). */
  distribuicao: DistribuicaoDeNiveis | null;
}

/**
 * A leitura de UM cargo da `visao_por_cargo`, na ordem de confiança:
 *  1. a distribuição, quando existe (o nível sai dela, não do que a IA copiou);
 *  2. `nivel_mais_frequente`, quando a IA o devolveu sem distribuição;
 *  3. o relatório antigo: nível da `media_nivel` ou `media` gravada (a nota fica
 *     no servidor, só o nível sai). Média abaixo de 1 não é nota da escala 1 a 4
 *     (a IA devolvia 0 quando não tinha dado): não vira N1.
 */
export function leituraDoCargo(item: unknown): LeituraDoCargo {
  const fonte = ehObjeto(item) ? item : {};
  const distribuicao = lerDistribuicao(fonte.distribuicao);
  const daDistribuicao = nivelDaDistribuicao(distribuicao);
  if (daDistribuicao != null) return { nivel: daDistribuicao, origem: 'frequente', distribuicao };

  const declarado = lerNivel(fonte.nivel_mais_frequente);
  if (declarado != null) return { nivel: declarado, origem: 'frequente', distribuicao };

  const bruta = fonte.media_nivel ?? fonte.media;
  const nota = bruta == null || bruta === '' ? Number.NaN : Number(bruta);
  if (Number.isFinite(nota) && nota >= 1) return { nivel: nivelDaNota(nota), origem: 'media', distribuicao };
  return { nivel: null, origem: null, distribuicao };
}

export interface CargoParaOPrompt {
  cargo: string;
  /** Pessoas distintas com avaliação neste cargo. */
  pessoas: number;
  /** Avaliações (uma por pessoa e competência) que entraram na distribuição. */
  avaliacoes: number;
  distribuicao: DistribuicaoDeNiveis;
  nivel_mais_frequente: Nivel | null;
}

/**
 * O que o prompt do RH recebe por cargo no lugar da média: a distribuição de
 * avaliações por nível, as pessoas e o nível mais frequente já calculado. A IA
 * copia o número; ela não faz a conta (nem a média, que o prompt não manda mais).
 * A ordem dos cargos é a de chegada.
 */
export function cargosParaOPrompt(
  avaliacoes: ReadonlyArray<{ cargo: string; colaboradorId: string; nivel: number | null | undefined }>,
): CargoParaOPrompt[] {
  const porCargo = new Map<string, { pessoas: Set<string>; niveis: Array<number | null | undefined> }>();
  for (const a of avaliacoes) {
    const grupo = porCargo.get(a.cargo) ?? { pessoas: new Set<string>(), niveis: [] };
    grupo.pessoas.add(a.colaboradorId);
    grupo.niveis.push(a.nivel);
    porCargo.set(a.cargo, grupo);
  }
  return [...porCargo.entries()].map(([cargo, grupo]) => {
    const distribuicao = contarNiveis(grupo.niveis);
    return {
      cargo,
      pessoas: grupo.pessoas.size,
      avaliacoes: distribuicao.n1 + distribuicao.n2 + distribuicao.n3 + distribuicao.n4,
      distribuicao,
      nivel_mais_frequente: nivelDaDistribuicao(distribuicao),
    };
  });
}

/**
 * As três linhas dos NÍVEIS GERAIS na mensagem do usuário do prompt do RH, no
 * lugar de `MEDIA GERAL`. Os percentuais saem daqui porque `pct_nivel_1..4` é
 * o que o PDF e a tela leem, e uma conta de cabeça da IA sobre contagens não tem
 * por que viajar até o cliente.
 */
export function linhasDeNiveisParaOPrompt(niveis: ReadonlyArray<number | null | undefined>): string {
  const dist = contarNiveis(niveis);
  const total = dist.n1 + dist.n2 + dist.n3 + dist.n4;
  const nivel = nivelDaDistribuicao(dist);
  const pct = (n: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);
  return [
    `NIVEL MAIS FREQUENTE: ${nivel != null ? `N${nivel}` : 'indisponível'}`,
    `DISTRIBUICAO (avaliações por nível): N1=${dist.n1} N2=${dist.n2} N3=${dist.n3} N4=${dist.n4}`,
    `PERCENTUAIS (de 0 a 100): N1=${pct(dist.n1)} N2=${pct(dist.n2)} N3=${pct(dist.n3)} N4=${pct(dist.n4)}`,
  ].join('\n');
}
