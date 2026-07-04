'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useAdminShell } from './AdminShellContext';
import type { EmpresaLite } from './actions';

/**
 * Fonte ÚNICA do "qual empresa?" nas páginas do admin (Reorganização, Fase 2).
 *
 * Antes coexistiam 4 mecanismos que não interoperavam:
 *   1. path param [empresaId]              (subárvore /admin/empresas/[id]/*)
 *   2. useSearchParams().get('empresa')    (cargos, fit, whatsapp, ppp, ...)
 *   3. new URLSearchParams(location.search) cru (temporadas, evolucao, videos, ...)
 *   4. filtro do header (empresaFiltro)    (conteudos, kits, dashboard)
 *
 * Resultado: abrir uma tela pela sidebar sem ?empresa= dava tela vazia em umas
 * e funcionava em outras. Este hook resolve na ordem path → query → filtro do
 * header, então QUALQUER porta de entrada funciona.
 *
 * Retorna também `source` para telas que precisem distinguir contexto explícito
 * (rota/link) de contexto implícito (filtro global).
 */
export function useEmpresaContexto(): {
  empresaId: string | null;
  empresa: EmpresaLite | null;
  source: 'path' | 'query' | 'filter' | null;
} {
  const params = useParams();
  const searchParams = useSearchParams();
  const { empresaFiltro, empresas } = useAdminShell();

  const fromPath = typeof params?.empresaId === 'string' ? params.empresaId : null;
  const fromQuery = searchParams?.get('empresa') || null;
  const fromFilter = empresaFiltro && empresaFiltro !== 'all' ? empresaFiltro : null;

  const empresaId = fromPath ?? fromQuery ?? fromFilter;
  const source = fromPath ? 'path' : fromQuery ? 'query' : fromFilter ? 'filter' : null;
  const empresa = empresaId ? empresas.find((e) => e.id === empresaId) ?? null : null;

  return { empresaId, empresa, source };
}
