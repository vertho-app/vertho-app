import { notFound } from 'next/navigation';

/**
 * ⛔ Pulso — bloco OFF-LINE desde 31/08/2026 (`lib/blocos-offline.ts`).
 *
 * Lado do COLABORADOR: `/dashboard/pulso/[assignmentId]` é o link que chegava
 * por WhatsApp para responder o questionário. Fecha junto com a operação — uma
 * porta de resposta aberta sem ninguém para ler a resposta é pior do que
 * fechada, e o card que a alimentava já saiu de `lib/home/loaders.ts`.
 */
export default function PulsoColaboradorOfflineLayout() {
  notFound();
}
