'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { AdminShellContext } from './AdminShellContext';
import { empresaDaNavegacao, empresaDaRotaParaAdotar } from './empresa-da-navegacao';
import { loadAdminShellEmpresas, loadAdminShellPermissoes, type EmpresaLite, type AdminShellPermissoes } from './actions';
import AdminSidebar from './AdminSidebar';
import AdminHeader from './AdminHeader';
import { ConfirmDialogProvider } from '@/components/admin/confirm-dialog';

const FILTER_KEY = 'vertho-admin-filter-empresa';

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // empresaId que a NAVEGAÇÃO pede: path escopado (/admin/empresas/{id}/...) OU
  // `?empresa=` (ver `empresa-da-navegacao.ts` para o porquê do query entrar).
  const routeEmpresaId = empresaDaNavegacao(pathname, searchParams?.get('empresa'));
  const [empresas, setEmpresas] = useState<EmpresaLite[]>([]);
  const [empresaFiltro, setEmpresaFiltroState] = useState<string>('all');
  const [collapsed, setCollapsed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [permissoes, setPermissoes] = useState<AdminShellPermissoes | null>(null);
  const refreshHandlerRef = useRef<(() => void | Promise<void>) | null>(null);
  // Última empresa da ROTA que o header já adotou (ver `empresaDaRotaParaAdotar`).
  const rotaSincronizadaRef = useRef<string | null>(null);

  // Carrega filtro persistido + lista de empresas + permissões no mount.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(FILTER_KEY);
      if (saved) setEmpresaFiltroState(saved);
    } catch {}
    loadAdminShellEmpresas().then(setEmpresas).catch(() => {});
    loadAdminShellPermissoes().then(setPermissoes).catch(() => {});
  }, []);

  // Enquanto carrega (ou em erro), comporta-se como antes (mostra tudo) —
  // o enforcement real é server-side; aqui é só UX.
  const podeVer = useCallback((permission?: string) => {
    if (!permission) return true;
    if (!permissoes?.role) return true;
    return permissoes.permissions.includes(permission as any);
  }, [permissoes]);

  // Persiste o filtro (mesma chave que as páginas já leem) e, se estamos numa rota
  // escopada por empresa, NAVEGA pra mesma subpágina da nova empresa. Fix num LUGAR SÓ:
  // todas as telas /admin/empresas/[empresaId]/* reagem ao filtro do header sem cada uma
  // precisar assinar (era o bug recorrente: b48fa97 calibração, 70048d9 ranking...).
  // Trunca ids aninhados (ex. .../pulso/{cicloId}/dashboard → .../pulso), que pertencem
  // à empresa antiga.
  const setEmpresaFiltro = useCallback((id: string) => {
    setEmpresaFiltroState(id);
    try { localStorage.setItem(FILTER_KEY, id); } catch {}
    if (!pathname) return;
    const m = pathname.match(/^\/admin\/empresas\/([^/]+)(\/[^/]+)?/);
    if (id && id !== 'all') {
      if (m && m[1] !== id) {
        router.replace(`/admin/empresas/${id}${m[2] || ''}`);
      } else if (pathname === '/admin/dashboard') {
        router.replace(`/admin/empresas/${id}`);
      } else if (!m) {
        // Páginas globais com ?empresa= na URL: o query param tem precedência no
        // useEmpresaContexto, então precisa acompanhar o filtro do header —
        // senão a tela ficaria presa na empresa antiga.
        const sp = new URLSearchParams(window.location.search);
        if (sp.get('empresa') !== id) {
          sp.set('empresa', id);
          router.replace(`${pathname}?${sp.toString()}`);
        }
      }
    } else if (id === 'all' && m) {
      // Rota escopada a UMA empresa não existe para "todas": sai para o painel global
      // (sem isto o filtro ficava preso na empresa da rota).
      router.replace('/admin/dashboard');
    } else if (id === 'all') {
      // "Todas as empresas": remove o ?empresa= para o contexto voltar a null.
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('empresa')) {
        sp.delete('empresa');
        const qs = sp.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname);
      }
    }
  }, [pathname, router]);

  // Sentido inverso: ao navegar direto pra uma empresa (link, voltar), o filtro do header
  // passa a refletir a empresa da rota. setState direto (sem navegar) p/ não recursar.
  // Adota só quando a NAVEGAÇÃO muda de empresa, não quando o filtro diverge dela: senão
  // escolher "Todas as empresas" era desfeito na hora (a URL ainda trazia a empresa).
  useEffect(() => {
    if (!routeEmpresaId) { rotaSincronizadaRef.current = null; return; }
    const adotar = empresaDaRotaParaAdotar(routeEmpresaId, rotaSincronizadaRef.current, empresas.map((e) => e.id));
    if (!adotar) return;
    rotaSincronizadaRef.current = adotar;
    setEmpresaFiltroState(adotar);
    try { localStorage.setItem(FILTER_KEY, adotar); } catch {}
  }, [routeEmpresaId, empresas]);

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
        adminRole: permissoes?.role ?? null, podeVer,
      }}
    >
      <div
        className="min-h-dvh flex admin-shell-root"
        style={{
          background:
            'radial-gradient(1100px 500px at 90% -5%, rgba(52,197,204,.07), transparent 55%), ' +
            'radial-gradient(900px 500px at -5% 30%, rgba(158,78,221,.1), transparent 60%), ' +
            'linear-gradient(180deg, #06172c 0%, #091d35 50%, #0a1f3a 100%)',
          color: '#d7e3ff',
        }}
      >
        <AdminSidebar />
        {/* Quem rola é a JANELA (a raiz é `min-h-dvh`, cresce com o conteúdo).
            Por isso nem a coluna nem o <main> podem ser contêiner de rolagem:
            `overflow-hidden`/`overflow-y-auto` aqui não rolavam nada e prendiam
            todo `sticky` das telas a um contêiner parado (a folha de decisão do
            orçamento, a coluna da empresa). `overflow-x-clip` corta o que vaza
            para o lado sem virar contêiner de rolagem. 02/10/2026. */}
        <div className="flex-1 flex flex-col min-w-0 overflow-x-clip admin-shell-column">
          <AdminHeader />
          <main className="flex-1 min-w-0 admin-shell-main">
            <ConfirmDialogProvider>{children}</ConfirmDialogProvider>
          </main>
        </div>
      </div>
    </AdminShellContext.Provider>
  );
}
