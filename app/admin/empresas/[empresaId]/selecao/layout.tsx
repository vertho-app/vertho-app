import { notFound } from 'next/navigation';

/**
 * ⛔ Seleção de pessoas — bloco OFF-LINE desde 31/08/2026 (`lib/blocos-offline.ts`).
 *
 * Este era o que sobrava do módulo: a metade do RH (`/dashboard/gestor/selecao`)
 * já tinha sido aposentada em 24/08 pela decisão de que a Vertho opera e o
 * cliente consome — e o docstring de lá registra que a tela nem funcionava,
 * porque as actions pediam permissões que o papel `rh` não tem.
 *
 * O fluxo tem 3 passos e nunca passou do primeiro: 2 vagas criadas, nenhum
 * perfil ideal fechado, nenhum candidato avaliado.
 */
export default function SelecaoOfflineLayout() {
  notFound();
}
