'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { AdminShellContext } from './AdminShellContext';
import { loadAdminShellEmpresas, type EmpresaLite } from './actions';
import AdminSidebar from './AdminSidebar';
import AdminHeader from './AdminHeader';

const FILTER_KEY = 'vertho-admin-filter-empresa';

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // empresaId da ROTA quando estamos numa página escopada (/admin/empresas/{id}/...).
  const routeEmpresaId = pathname?.match(/^\/admin\/empresas\/([^/]+)/)?.[1];
  const [empresas, setEmpresas] = useState<EmpresaLite[]>([]);
  const [empresaFiltro, setEmpresaFiltroState] = useState<string>('all');
  const [collapsed, setCollapsed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshHandlerRef = useRef<(() => void | Promise<void>) | null>(null);

  // Carrega filtro persistido + lista de empresas no mount.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(FILTER_KEY);
      if (saved) setEmpresaFiltroState(saved);
    } catch {}
    loadAdminShellEmpresas().then(setEmpresas).catch(() => {});
  }, []);

  // Persiste o filtro (mesma chave que as páginas já leem) e, se estamos numa rota
  // escopada por empresa, NAVEGA pra mesma subpágina da nova empresa. Fix num LUGAR SÓ:
  // todas as telas /admin/empresas/[empresaId]/* reagem ao filtro do header sem cada uma
  // precisar assinar (era o bug recorrente: b48fa97 calibração, 70048d9 ranking...).
  // Trunca ids aninhados (ex. .../pulso/{cicloId}/dashboard → .../pulso), que pertencem
  // à empresa antiga.
  const setEmpresaFiltro = useCallback((id: string) => {
    setEmpresaFiltroState(id);
    try { localStorage.setItem(FILTER_KEY, id); } catch {}
    if (id && id !== 'all' && pathname) {
      const m = pathname.match(/^\/admin\/empresas\/([^/]+)(\/[^/]+)?/);
      if (m && m[1] !== id) router.replace(`/admin/empresas/${id}${m[2] || ''}`);
    }
  }, [pathname, router]);

  // Sentido inverso: ao navegar direto pra uma empresa (link, voltar), o filtro do header
  // passa a refletir a empresa da rota. setState direto (sem navegar) p/ não recursar.
  useEffect(() => {
    if (routeEmpresaId && routeEmpresaId !== empresaFiltro && empresas.some((e) => e.id === routeEmpresaId)) {
      setEmpresaFiltroState(routeEmpresaId);
      try { localStorage.setItem(FILTER_KEY, routeEmpresaId); } catch {}
    }
  }, [routeEmpresaId, empresas, empresaFiltro]);

  // Se a empresa salva não existe mais (foi deletada), volta pra 'all'.
  useEffect(() => {
    if (empresaFiltro === 'all' || empresas.length === 0) return;
    if (!empresas.some((e) => e.id === empresaFiltro)) setEmpresaFiltro('all');
  }, [empresas, empresaFiltro, setEmpresaFiltro]);

  const empresaSelecionada =
    empresaFiltro === 'all' ? null : empresas.find((e) => e.id === empresaFiltro) || null;

  const registerRefresh = useCallback((fn: (() => void | Promise<void>) | null) => {
    refreshHandlerRef.current = fn;
  }, []);

  const triggerRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (refreshHandlerRef.current) await refreshHandlerRef.current();
      else router.refresh();
    } finally {
      setRefreshing(false);
    }
  }, [router]);

  return (
    <AdminShellContext.Provider
      value={{
        empresas, empresaFiltro, setEmpresaFiltro, empresaSelecionada,
        collapsed, setCollapsed, registerRefresh, triggerRefresh, refreshing,
      }}
    >
      <div
        className="min-h-dvh flex"
        style={{
          background:
            'radial-gradient(1100px 500px at 90% -5%, rgba(52,197,204,.07), transparent 55%), ' +
            'radial-gradient(900px 500px at -5% 30%, rgba(158,78,221,.1), transparent 60%), ' +
            'linear-gradient(180deg, #06172c 0%, #091d35 50%, #0a1f3a 100%)',
          color: '#d7e3ff',
        }}
      >
        <AdminSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <AdminHeader />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </AdminShellContext.Provider>
  );
}
