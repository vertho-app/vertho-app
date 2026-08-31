import { notFound } from 'next/navigation';

/**
 * ⛔ Pulso — bloco OFF-LINE desde 31/08/2026 (`lib/blocos-offline.ts`).
 *
 * Fecha as 3 telas de operação do ciclo (lista, `[cicloId]/dashboard` e
 * `[cicloId]/enviar`) num ponto só. As páginas e o `actions/pulse/` seguem
 * intactos no repositório: religar é apagar este arquivo e devolver a entrada
 * do menu em `app/admin/_shell/nav-items.ts`.
 *
 * A evidência está no registro central — em resumo, as 5 tabelas de execução
 * nunca receberam uma linha e o único ciclo criado morreu em draft.
 */
export default function PulsoOfflineLayout() {
  notFound();
}
