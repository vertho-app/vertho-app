import React, { useState } from 'react';
import { PresentationControls } from '../../../components/dashboard/presentation-role-switcher';
import { getDemoPresentationRoom } from '../presentation';
import { ENVIRONMENT } from './environment';
import { currentLocation, switchRole, useLocation } from './runtime';

export function PresentationEnvironment({ children }: { children: React.ReactNode }) {
  useLocation();
  const { role } = currentLocation();
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const roles = { participant: 'usuario', manager: 'gestor', organization: 'rh' } as const;
  const currentRole = { ...getDemoPresentationRoom(ENVIRONMENT.tenant).roles.find(r => r.key === roles[role])!, tenantSlug: ENVIRONMENT.tenant };
  if (window.self !== window.top) return <>{children}</>;
  return <>
    <PresentationControls currentRole={currentRole} device={device} switching={false}
      onRoleChange={key => switchRole(key === 'rh' ? 'organization' : key === 'gestor' ? 'manager' : 'participant')}
      onDeviceChange={setDevice} />
    {device === 'mobile' ? <div className="flex min-h-dvh items-start justify-center bg-[#020711] p-6 pb-28">
      <iframe title="Apresentação no celular" src={window.location.href} className="h-[844px] w-[390px] max-w-full rounded-[32px] border border-white/20" />
    </div> : children}
  </>;
}
