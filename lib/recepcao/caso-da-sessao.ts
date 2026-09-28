/**
 * Qual versão publicada do catálogo corresponde ao atendimento que está na tela
 * (revisão de 27/09/2026, A-2). Módulo puro: roda na tela e nos testes.
 *
 * O mesmo caso (`ficha.cenarioId`, o `codigo` no banco) tem três degraus
 * publicados ao mesmo tempo. A tela casava só pelo `cenarioId` e o `find`
 * pegava o primeiro da lista, a Introdução: depois de um relatório do Limite,
 * o seletor voltava sozinho para a Introdução e "Praticar novamente" abria o
 * degrau errado.
 *
 * Ordem: o registro exato em que a sessão nasceu (`cenarioRegistroId`, no
 * snapshot desde a mig 241); se ele saiu do catálogo, a versão publicada do
 * MESMO caso e do MESMO degrau (uma versão nova do mesmo exercício); sem
 * nenhuma das duas, `null`: o caso saiu do catálogo, e a tela avisa em vez de
 * trocar de caso em silêncio.
 */
export interface RegistroPublicado {
  id: string;
  ficha: { cenarioId?: string; nivel?: string | null };
}
export interface SessaoNaTela {
  cenarioRegistroId?: string | null;
  cenario?: { cenarioId?: string; nivel?: string | null } | null;
}

export function registroDaSessao<T extends RegistroPublicado>(
  cenarios: readonly T[] | null | undefined,
  sessao: SessaoNaTela | null | undefined,
): T | null {
  if (!sessao || !cenarios?.length) return null;
  if (sessao.cenarioRegistroId) {
    const exato = cenarios.find((c) => c.id === sessao.cenarioRegistroId);
    if (exato) return exato;
  }
  const caso = sessao.cenario?.cenarioId;
  if (!caso) return null;
  const nivel = sessao.cenario?.nivel ?? null;
  return cenarios.find((c) => c.ficha.cenarioId === caso && (c.ficha.nivel ?? null) === nivel) ?? null;
}
