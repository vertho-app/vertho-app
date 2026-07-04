/**
 * Rota LEGADA (Fase 3 da reorganização do admin).
 *
 * O conteúdo de "Potencial por Cidade" foi fundido no workspace
 * /admin/vertho/mercado-potencial como tab `unificado`
 * (_components/unificado-tab.tsx). Este redirect server-side preserva
 * links salvos, nav antiga e testes que apontam pra rota original.
 *
 * As actions continuam em ./actions.ts (importadas pela tab nova).
 */
import { redirect } from 'next/navigation';

export default function PotencialCidadesRedirect() {
  redirect('/admin/vertho/mercado-potencial?tab=unificado');
}
