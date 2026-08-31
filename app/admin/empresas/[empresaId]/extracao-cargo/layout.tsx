import { notFound } from 'next/navigation';

/**
 * ⛔ Seleção de pessoas — bloco OFF-LINE desde 31/08/2026 (`lib/blocos-offline.ts`).
 *
 * Esta rota é a porta de entrada da Seleção, não um utilitário geral: o título
 * é "Nova vaga — extração de descrição" e `actions/cargo-extracao.ts` grava
 * sempre com `eh_vaga: true`. Cargo operacional (o que tem colaborador) é
 * cadastrado em Colaboradores & Cargos, por outro caminho, e continua de pé.
 *
 * Deixá-la aberta seria manter a única forma de CRIAR vaga funcionando com o
 * resto do módulo fechado — dados novos entrando num fluxo que ninguém opera.
 */
export default function ExtracaoCargoOfflineLayout() {
  notFound();
}
