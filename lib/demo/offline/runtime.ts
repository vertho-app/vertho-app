import { useSyncExternalStore } from 'react';
import { ENVIRONMENT, type OfflineRole } from './environment';
import type { OfflineData } from './types';

declare const __DEMO_DATA__: OfflineData;
declare const __OFFLINE_MEDIA__: string[];
export const demo = __DEMO_DATA__;
export const onlineOnly = 'Esta ação precisa da sala online. A apresentação offline não envia respostas nem altera os dados da demonstração.';
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());
if (typeof window !== 'undefined') window.addEventListener('hashchange', changed);
export function locationSnapshot() { return window.location.hash || '#/participant/dashboard'; }
export function useLocation() {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, locationSnapshot, () => '#/participant/dashboard');
}
export function currentLocation() {
  const match = locationSnapshot().match(/^#\/(participant|manager|organization)(\/.*)?$/);
  const role = (match?.[1] || 'participant') as OfflineRole;
  const url = new URL(match?.[2] || '/dashboard', 'https://offline.invalid');
  return { role, pathname: url.pathname, search: url.search, url };
}
export function localHref(path: string, role = currentLocation().role) { return `#/${role}${path}`; }
const pages = new Set(['/dashboard', '/dashboard/jornada', '/dashboard/temporada', '/dashboard/pdi', '/dashboard/perfil-comportamental', '/dashboard/perfil', '/dashboard/assessment', '/dashboard/gestor', '/dashboard/gestor/engajamento', '/dashboard/gestor/engajamento/relatorio', '/dashboard/gestor/equipe-evolucao', '/dashboard/gestor/ranking', '/dashboard/evolucao', '/dashboard/relatorios']);
export function navigate(path: string, replace = false) {
  const pathname = new URL(path, 'https://offline.invalid').pathname;
  if (!pages.has(pathname) && !/^\/dashboard\/temporada\/semana\/(?:[1-9]|1[0-4])$/.test(pathname)) { notifyOnlineOnly(); return; }
  const href = localHref(path);
  if (replace) { window.history.replaceState(null, '', href); changed(); }
  else window.location.hash = href;
  window.scrollTo(0, 0);
}
// Some shared views remove a consumed query parameter without navigating.
// Keep that cosmetic replacement inside the offline bookmark and current role.
export function replacePresentationHistory(state: unknown, unused: string, path: string) {
  window.history.replaceState(state, unused, localHref(path));
}
export function switchRole(role: OfflineRole) {
  window.location.hash = localHref(role === 'manager' ? '/dashboard/gestor' : '/dashboard', role);
  window.scrollTo(0, 0);
}
export function currentPerson(key?: string | null) {
  const role = currentLocation().role;
  return demo.people.find((person) => person.key === key)
    || demo.people.find((person) => person.name === ENVIRONMENT.names[role])
    || (role === 'organization' ? { key: 'organization', name: ENVIRONMENT.names.organization, role: ENVIRONMENT.roles.organization, unit: ENVIRONMENT.name, manager: null, disc: [0,0,0,0], profile: '', report: {}, assessments: [], details: {} } : null)
    || demo.people.find((person) => person.key === ENVIRONMENT.participantKey)!;
}
export function notifyOnlineOnly() { window.dispatchEvent(new Event('demo:online-only')); }

/** Installed only in this isolated bundle. Never intercepts the online application. */
export function installLocalTransport() {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.href);
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (!['GET', 'HEAD'].includes(method)) return Response.json({ error: onlineOnly }, { status: 503 });
    if (url.origin === window.location.origin && url.pathname === '/api/temporada/concluida/pdf') {
      const key = url.searchParams.get('email') || '';
      const path = demo.panels.team.rows.some(row => row.colabEmail === key) && demo.panels.details[key]?.pdfPath;
      return path ? realFetch(ENVIRONMENT.base + path, { signal: init?.signal }) : Response.json({ error: onlineOnly }, { status: 503 });
    }
    if (url.origin === window.location.origin && url.pathname === '/api/me') {
      const person = currentPerson();
      return Response.json({ nome_completo: person.name, role: currentLocation().role === 'organization' ? 'rh' : currentLocation().role === 'manager' ? 'gestor' : 'colaborador', temTrilhaPossivel: currentLocation().role === 'participant', treinoRecepcao: ENVIRONMENT.tenant === 'acme-demo', treinoVendas: ENVIRONMENT.tenant === 'acme-demo' });
    }
    if (url.protocol === 'blob:' || url.protocol === 'data:' || __OFFLINE_MEDIA__.includes(url.href) || (url.origin === window.location.origin && url.pathname.startsWith(ENVIRONMENT.base))) return realFetch(input, init);
    // No authenticated API, telemetry or third-party requests may escape the demo.
    return Response.json({ error: onlineOnly }, { status: 503 });
  };
}
