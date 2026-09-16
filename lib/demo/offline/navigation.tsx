import React from 'react';
import { currentLocation, localHref, navigate, useLocation } from './runtime';

const router = { push: (path: string) => navigate(path), replace: (path: string) => navigate(path, true), back: () => window.history.back(), forward: () => window.history.forward(), refresh: () => {}, prefetch: () => Promise.resolve() };
export function useRouter() { return router; }
export function usePathname() { useLocation(); return currentLocation().pathname; }
export function useSearchParams() { const location = useLocation(); return React.useMemo(() => currentLocation().url.searchParams, [location]); }
export function redirect(path: string) { navigate(path, true); }
export default function Link({ href, children, prefetch: _prefetch, ...props }: any) {
  const path = typeof href === 'string' ? href : href.pathname;
  return <a {...props} href={localHref(path)} onClick={(event) => { props.onClick?.(event); if (!event.defaultPrevented) { event.preventDefault(); navigate(path); } }}>{children}</a>;
}
