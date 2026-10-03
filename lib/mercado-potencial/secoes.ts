import { blocoEstaOffline } from '@/lib/blocos-offline';

/**
 * Seções do workspace Mercado Potencial (`/admin/vertho/mercado-potencial`).
 *
 * A aba "Potencial por Cidade" (`unificado`) junta duas metades: ESCOLAS, das
 * views do Radar de escolas (no ar), e EMPRESAS, do snapshot
 * `radarempresas_cidades_agg`, que é acervo do Radar Empresas, bloco OFF-LINE
 * desde 31/08/2026 (`lib/blocos-offline.ts`). Até 03/10/2026 (R-108) a aba
 * continuava oferecida: lia o acervo do bloco desligado e o botão de XLSX
 * recusava no clique (`getCidadeXlsxUrl` já era gatado).
 *
 * Sem a metade de empresas a aba repete a de municípios, então ela sai
 * INTEIRA enquanto o bloco estiver off-line. Religar o Radar Empresas (tirar a
 * entrada do registro) devolve a aba, o atalho do painel e a action, sem tocar
 * em mais nada: por isso a régua mora aqui, e não num `if` em cada tela.
 */
export type SecaoMercado = 'mercado' | 'unificado';

/** A aba "Potencial por Cidade" pode ser oferecida? */
export function abaUnificadaDisponivel(): boolean {
  return !blocoEstaOffline('radarempresas');
}

/** As seções que o workspace desenha, na ordem. */
export function secoesDoMercado(): SecaoMercado[] {
  return abaUnificadaDisponivel() ? ['mercado', 'unificado'] : ['mercado'];
}

/**
 * A seção que abre. `?tab=unificado` vem de link salvo e do redirect da rota
 * antiga `/admin/vertho/potencial-cidades`; com a aba fora, abre o mercado de
 * escolas em vez de uma aba que lê bloco desligado.
 */
export function secaoInicialDoMercado(pedida: string | null | undefined): SecaoMercado {
  return pedida === 'unificado' && abaUnificadaDisponivel() ? 'unificado' : 'mercado';
}
