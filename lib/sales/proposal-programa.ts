// Números do PROGRAMA que o cliente pode ver, extraídos do orçamento vinculado.
//
// 🔴 FRONTEIRA DE CUSTO. `orcamento_cenarios.entradas` e `.resultado` são jsonb
// livres que carregam a precificação INTERNA: custo por pessoa, margem absoluta
// e percentual, desconto máximo concedível, preço de cluster, custo-hora, custo
// de IA, pior saldo de caixa. Nada disso pode chegar ao documento público.
//
// Este módulo é a ÚNICA porta desses dois jsonb para o VM do cliente, e ela é
// uma allowlist: o que não está nomeado abaixo não passa. Nunca devolva o
// objeto inteiro nem um spread — um campo novo no orçamento viraria vazamento
// silencioso. O teste `proposal-programa.test.ts` trava isso.
import { getProgramaConfigByModo } from '@/lib/season-engine/programa-config';

export type ProposalPrograma = {
  /** Participantes do programa. */
  pessoas: number | null;
  /** Cargos que serão mapeados (uma matriz de competências por cargo). */
  cargos: number | null;
  /** Ciclos do programa (cada ciclo = uma jornada completa por pessoa). */
  ciclos: number | null;
  /** Unidades/escolas atendidas. */
  unidades: number | null;
  /** Semanas de uma jornada (7 na Jornada, 14 na Regular, 10 no Onboarding). */
  semanasPorCiclo: number | null;
  /** Duração total do programa em meses. */
  mesesPrograma: number | null;
  /** Conteúdos por pessoa a cada ciclo (vídeo + podcast + texto + case). */
  conteudosPorPessoaCiclo: number | null;
};

/**
 * Rótulos de jornada que o orçamento sabe precificar.
 *
 * `getProgramaConfigByModo` é fail-safe: chave desconhecida devolve o Regular
 * DUO (14 semanas). Esse default serve à GERAÇÃO da trilha, onde cair no padrão
 * é melhor que quebrar — mas num documento comercial ele viraria uma promessa
 * de 14 semanas que ninguém precificou. Por isso a chave é conferida ANTES: se
 * não estiver nesta lista, `semanasPorCiclo` sai null e a página simplesmente
 * não fala em semanas.
 */
const JORNADAS_CONHECIDAS = new Set(['jornada', 'regular_duo', 'regular_single', 'onboarding', 'piloto']);

function inteiroPositivo(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** Linha do orçamento como ela sai do banco — só os dois jsonb interessam. */
export type OrcamentoVinculado = { entradas: unknown; resultado: unknown } | null | undefined;

/**
 * Extrai o resumo do programa do orçamento que gerou a proposta.
 *
 * Devolve `null` quando não há orçamento vinculado (proposta do fluxo do RC, que
 * não passa pelo deal desk) — o documento então omite as seções que dependem
 * desses números em vez de inventar um default.
 */
export function extrairProgramaDoOrcamento(orc: OrcamentoVinculado): ProposalPrograma | null {
  if (!orc || typeof orc !== 'object') return null;

  const r = (orc.resultado && typeof orc.resultado === 'object' ? orc.resultado : {}) as Record<string, unknown>;
  const e = (orc.entradas && typeof orc.entradas === 'object' ? orc.entradas : {}) as Record<string, unknown>;

  const jornada = typeof e.jornada === 'string' ? e.jornada : '';
  const semanasPorCiclo = JORNADAS_CONHECIDAS.has(jornada)
    ? inteiroPositivo(getProgramaConfigByModo(jornada).semanas)
    : null;

  const c = (e.conteudoColab && typeof e.conteudoColab === 'object' ? e.conteudoColab : {}) as Record<string, unknown>;
  const somaConteudos = ['video', 'podcast', 'texto', 'case']
    .reduce((acc, k) => acc + (inteiroPositivo(c[k]) ?? 0), 0);

  const programa: ProposalPrograma = {
    pessoas: inteiroPositivo(r.pessoas),
    cargos: inteiroPositivo(r.cargos),
    ciclos: inteiroPositivo(r.ciclos),
    unidades: inteiroPositivo(r.unidades),
    semanasPorCiclo,
    mesesPrograma: inteiroPositivo(r.mesesPrograma),
    conteudosPorPessoaCiclo: somaConteudos > 0 ? somaConteudos : null,
  };

  // Orçamento vazio/corrompido não vira seção de números em branco.
  const temAlgo = Object.values(programa).some((v) => v != null);
  return temAlgo ? programa : null;
}
