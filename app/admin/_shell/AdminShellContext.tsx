'use client';

import { createContext, useContext } from 'react';
import type { PermissionKey } from '@/lib/permissions';
import type { EmpresaLite } from './actions';

export type AdminShellContextValue = {
  empresas: EmpresaLite[];
  empresaFiltro: string;                 // 'all' | empresaId
  setEmpresaFiltro: (id: string) => void;
  empresaSelecionada: EmpresaLite | null;
  collapsed: boolean;
  setCollapsed: (b: boolean) => void;
  // Papel + permissões efetivas do admin logado (Fase 5). É UX (filtrar nav,
  // desabilitar botões); o enforcement real segue nas server actions.
  // adminRole null = ainda carregando (ou erro) → UI se comporta como antes.
  adminRole: 'platform_admin' | 'socio' | null;
  podeVer: (permission?: PermissionKey | string) => boolean;
  // Páginas com dados client-side (ex. dashboard) registram seu reload aqui;
  // o botão de refresh do header chama isto (fallback: router.refresh()).
  registerRefresh: (fn: (() => void | Promise<void>) | null) => void;
  triggerRefresh: () => void;
  refreshing: boolean;
};

export const AdminShellContext = createContext<AdminShellContextValue | null>(null);

export function useAdminShell(): AdminShellContextValue {
  const ctx = useContext(AdminShellContext);
  if (!ctx) throw new Error('useAdminShell precisa estar dentro de <AdminShell>');
  return ctx;
}
