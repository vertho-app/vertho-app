import React, { Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import { Toaster } from 'sonner';
import { X } from 'lucide-react';
import messages from '../../../messages/pt-BR.json';
import DashboardShell from '../../../app/dashboard/dashboard-shell';
import Home from '../../../app/dashboard/page';
import Jornada from '../../../app/dashboard/jornada/page';
import Temporada from '../../../app/dashboard/temporada/page';
import Semana from '../../../app/dashboard/temporada/semana/[week]/page';
import Pdi from '../../../app/dashboard/pdi/page';
import Perfil from '../../../app/dashboard/perfil-comportamental/page';
import Conta from '../../../app/dashboard/perfil/page';
import Assessment from '../../../app/dashboard/assessment/page';
import Gestor from '../../../app/dashboard/gestor/page';
import Evolucao from '../../../app/dashboard/evolucao/page';
import Relatorios from '../../../app/dashboard/relatorios/relatorios-rh-view';
import PackageControls from './package-controls';
import { currentLocation, installLocalTransport, onlineOnly, useLocation } from './runtime';
import { rhReports } from './local-actions';
import './style.css';

installLocalTransport();
const weeks = new Map(Array.from({length: 14}, (_,i) => [String(i+1), Promise.resolve({week: String(i+1)})]));
const reports = rhReports();
function Routes() {
  const { pathname } = currentLocation();
  const week = pathname.match(/^\/dashboard\/temporada\/semana\/(\d+)$/)?.[1];
  if (week) return <Semana params={weeks.get(week)!} />;
  switch (pathname) {
    case '/dashboard': return <Home />;
    case '/dashboard/jornada': return <Jornada />;
    case '/dashboard/temporada': return <Temporada />;
    case '/dashboard/pdi': return <Pdi />;
    case '/dashboard/perfil-comportamental': return <Perfil />;
    case '/dashboard/perfil': return <Conta />;
    case '/dashboard/assessment': return <Assessment />;
    case '/dashboard/gestor': return <Gestor />;
    case '/dashboard/evolucao': return <Evolucao />;
    case '/dashboard/relatorios': return <Relatorios reports={reports as any} />;
    default: return <div className="mx-auto max-w-lg px-5 py-12 text-sm text-white/60">{onlineOnly}</div>;
  }
}
function App() {
  const location = useLocation();
  const { role } = currentLocation();
  const [notice, setNotice] = useState(false);
  useEffect(() => { const show = () => setNotice(true); window.addEventListener('demo:online-only', show); return () => window.removeEventListener('demo:online-only',show); }, []);
  return <NextIntlClientProvider locale="pt-BR" messages={messages} timeZone="America/Sao_Paulo">
    <DashboardShell key={role}><Suspense fallback={<div className="p-6 text-white/50">Carregando…</div>}><Routes key={location} /></Suspense></DashboardShell>
    <PackageControls />
    <Toaster richColors position="top-center" />
    {notice && <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-5" role="dialog" aria-modal="true" aria-label="Recurso online"><div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#0b1a2b] p-6"><button onClick={() => setNotice(false)} aria-label="Fechar aviso" className="float-right ml-3 text-white/60"><X size={20} /></button><h2 className="mb-3 font-bold">Recurso da sala online</h2><p className="text-sm leading-relaxed text-white/65">{onlineOnly}</p><button onClick={() => setNotice(false)} className="mt-5 rounded-lg bg-cyan-300/15 px-4 py-2 text-sm font-bold text-cyan-200">Continuar apresentação</button></div></div>}
  </NextIntlClientProvider>;
}
createRoot(document.getElementById('root')!).render(<App />);
