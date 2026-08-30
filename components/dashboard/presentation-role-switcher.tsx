'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ChevronDown, Eye, Loader2, Monitor, Smartphone } from 'lucide-react';
import {
  DEMO_PRESENTATION_DEVICES,
  DEMO_PRESENTATION_DEVICE_PARAM,
  DEMO_PRESENTATION_DEVICE_STORAGE_KEY,
  DEMO_PRESENTATION_ROLES,
  DEMO_PRESENTATION_TICKET_PARAM,
  DEMO_PRESENTATION_TICKET_STORAGE_KEY,
  demoPresentationAuthUrl,
  demoPresentationUrl,
  getDemoPresentationDeviceQueryValue,
  getDemoPresentationRoleFromHostname,
  parseDemoPresentationDevice,
  type DemoPresentationDeviceKey,
  type DemoPresentationRole,
  type DemoPresentationRoleKey,
} from '@/lib/demo/presentation';

const subscribeToBrowserContext = () => () => {};
const getPresentationRoleSnapshot = () => getDemoPresentationRoleFromHostname(window.location.hostname);
const getPresentationRoleServerSnapshot = () => null;

function readStoredTicket(): string | null {
  try {
    return window.sessionStorage.getItem(DEMO_PRESENTATION_TICKET_STORAGE_KEY);
  } catch {
    return null;
  }
}

function readStoredDevice(): DemoPresentationDeviceKey | null {
  try {
    return parseDemoPresentationDevice(
      window.sessionStorage.getItem(DEMO_PRESENTATION_DEVICE_STORAGE_KEY),
    );
  } catch {
    return null;
  }
}

function storeDevice(device: DemoPresentationDeviceKey) {
  try {
    window.sessionStorage.setItem(
      DEMO_PRESENTATION_DEVICE_STORAGE_KEY,
      getDemoPresentationDeviceQueryValue(device),
    );
  } catch {}
}

/** Gera uma URL limpa, da mesma origem, para a viewport real de 390 px. */
function currentMobilePreviewPath(): string {
  const url = new URL(window.location.href);
  url.searchParams.delete(DEMO_PRESENTATION_TICKET_PARAM);
  url.searchParams.delete(DEMO_PRESENTATION_DEVICE_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

type PresentationState = {
  device: DemoPresentationDeviceKey;
  frameUrl: string | null;
  ticket: string | null;
};

function readInitialPresentationState(): PresentationState {
  if (typeof window === 'undefined') {
    return { device: 'desktop', frameUrl: null, ticket: null };
  }

  const url = new URL(window.location.href);
  const device = parseDemoPresentationDevice(
    url.searchParams.get(DEMO_PRESENTATION_DEVICE_PARAM),
  ) || readStoredDevice() || 'desktop';
  const ticket = url.searchParams.get(DEMO_PRESENTATION_TICKET_PARAM) || readStoredTicket();

  return {
    device,
    frameUrl: device === 'mobile' ? currentMobilePreviewPath() : null,
    ticket,
  };
}

type PresentationControlsProps = {
  currentRole: DemoPresentationRole;
  device: DemoPresentationDeviceKey;
  switching: boolean;
  onRoleChange: (role: DemoPresentationRoleKey) => void;
  onDeviceChange: (device: DemoPresentationDeviceKey) => void;
};

function PresentationControls({
  currentRole,
  device,
  switching,
  onRoleChange,
  onDeviceChange,
}: PresentationControlsProps) {
  const DeviceIcon = device === 'mobile' ? Smartphone : Monitor;

  return (
    <div className="fixed right-3 top-[calc(var(--header-height)+0.5rem)] z-[90] max-w-[calc(100vw-1.5rem)] md:right-5 md:top-4">
      <div className="flex items-stretch overflow-hidden rounded-2xl border border-white/15 bg-[#071321]/95 p-1.5 shadow-[0_16px_46px_rgba(0,0,0,0.42)] backdrop-blur-xl">
        <label className="group flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-white/[0.05] focus-within:bg-white/[0.06] focus-within:ring-2 focus-within:ring-[var(--brand-400,#22d3ee)]/25">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--brand-400,#22d3ee)]/10 text-[var(--brand-300,#67e8f9)]" aria-hidden="true">
            {switching ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
          </span>

          <span className="min-w-0">
            <span className="hidden text-[8px] font-bold uppercase tracking-[0.18em] text-white/40 sm:block">
              Visão apresentada
            </span>
            <span className="relative block">
              <select
                value={currentRole.key}
                onChange={(event) => onRoleChange(event.target.value as DemoPresentationRoleKey)}
                disabled={switching}
                aria-label="Trocar função apresentada"
                className="block min-w-[80px] cursor-pointer appearance-none bg-transparent pr-5 text-xs font-bold text-white outline-none disabled:cursor-wait sm:min-w-[108px]"
              >
                {DEMO_PRESENTATION_ROLES.map((role) => (
                  <option key={role.key} value={role.key} className="bg-[#0b1a2b] text-white">
                    {role.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={12}
                className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-white/45"
                aria-hidden="true"
              />
            </span>
          </span>
        </label>

        <span className="my-1 w-px shrink-0 bg-white/10" aria-hidden="true" />

        <label className="group flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-white/[0.05] focus-within:bg-white/[0.06] focus-within:ring-2 focus-within:ring-[var(--brand-400,#22d3ee)]/25">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-white/65" aria-hidden="true">
            <DeviceIcon size={14} />
          </span>

          <span className="min-w-0">
            <span className="hidden text-[8px] font-bold uppercase tracking-[0.18em] text-white/40 sm:block">
              Dispositivo
            </span>
            <span className="relative block">
              <select
                value={device}
                onChange={(event) => onDeviceChange(event.target.value as DemoPresentationDeviceKey)}
                disabled={switching}
                aria-label="Trocar dispositivo apresentado"
                className="block min-w-[84px] cursor-pointer appearance-none bg-transparent pr-5 text-xs font-bold text-white outline-none disabled:cursor-wait sm:min-w-[104px]"
              >
                {DEMO_PRESENTATION_DEVICES.map((item) => (
                  <option key={item.key} value={item.key} className="bg-[#0b1a2b] text-white">
                    {item.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={12}
                className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-white/45"
                aria-hidden="true"
              />
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}

/**
 * Envolve o dashboard apenas nos aliases da sala de apresentação.
 *
 * Em "Celular", o dashboard roda num iframe de mesma origem com 390 px úteis.
 * Isso aciona os breakpoints reais da aplicação e mantém toda a navegação
 * interativa. Dentro do iframe, `window.self !== window.top` impede recursão.
 */
export function PresentationEnvironment({ children }: { children: ReactNode }) {
  const currentRole = useSyncExternalStore<DemoPresentationRole | null>(
    subscribeToBrowserContext,
    getPresentationRoleSnapshot,
    getPresentationRoleServerSnapshot,
  );
  const [embedded] = useState(
    () => typeof window !== 'undefined' && window.self !== window.top,
  );
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [presentation, setPresentation] = useState<PresentationState>(readInitialPresentationState);
  const [switching, setSwitching] = useState(false);
  const { device, frameUrl, ticket } = presentation;

  useEffect(() => {
    if (!currentRole || embedded) return;

    const url = new URL(window.location.href);
    const ticketFromUrl = url.searchParams.get(DEMO_PRESENTATION_TICKET_PARAM);
    const deviceFromUrl = parseDemoPresentationDevice(
      url.searchParams.get(DEMO_PRESENTATION_DEVICE_PARAM),
    );
    const resolvedDevice = deviceFromUrl || readStoredDevice() || 'desktop';

    if (ticketFromUrl) {
      try {
        window.sessionStorage.setItem(DEMO_PRESENTATION_TICKET_STORAGE_KEY, ticketFromUrl);
      } catch {}
    }
    storeDevice(resolvedDevice);

    // Passe e preferência viajam entre subdomínios, mas não ficam expostos na
    // barra, no histórico nem em uma captura feita durante a apresentação.
    const hadTransientParams = url.searchParams.has(DEMO_PRESENTATION_TICKET_PARAM)
      || url.searchParams.has(DEMO_PRESENTATION_DEVICE_PARAM);
    if (hadTransientParams) {
      url.searchParams.delete(DEMO_PRESENTATION_TICKET_PARAM);
      url.searchParams.delete(DEMO_PRESENTATION_DEVICE_PARAM);
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, [currentRole, embedded]);

  if (!currentRole || embedded) return <>{children}</>;

  function changeRole(nextRole: DemoPresentationRoleKey) {
    if (nextRole === currentRole?.key) return;
    setSwitching(true);

    // Cada papel usa uma sessão real em seu hostname. O passe prepara essa
    // sessão no servidor e `tela` leva junto a preferência do apresentador.
    const target = new URL(
      ticket
        ? demoPresentationAuthUrl(nextRole, ticket)
        : demoPresentationUrl(nextRole),
    );
    target.searchParams.set(
      DEMO_PRESENTATION_DEVICE_PARAM,
      getDemoPresentationDeviceQueryValue(device),
    );
    window.location.assign(target.toString());
  }

  function changeDevice(nextDevice: DemoPresentationDeviceKey) {
    if (nextDevice === device) return;
    storeDevice(nextDevice);

    if (nextDevice === 'mobile') {
      setPresentation((current) => ({
        ...current,
        device: 'mobile',
        frameUrl: currentMobilePreviewPath(),
      }));
      return;
    }

    // Se o apresentador navegou dentro do telefone, volta ao computador na
    // mesma tela em vez de retornar silenciosamente à página anterior.
    let frameLocation: URL | null = null;
    try {
      const href = frameRef.current?.contentWindow?.location.href;
      if (href) {
        const candidate = new URL(href);
        if (candidate.origin === window.location.origin) frameLocation = candidate;
      }
    } catch {}

    setPresentation((current) => ({ ...current, device: 'desktop', frameUrl: null }));
    if (frameLocation) {
      frameLocation.searchParams.delete(DEMO_PRESENTATION_TICKET_PARAM);
      frameLocation.searchParams.delete(DEMO_PRESENTATION_DEVICE_PARAM);
      window.location.assign(`${frameLocation.pathname}${frameLocation.search}${frameLocation.hash}`);
    }
  }

  const controls = (
    <PresentationControls
      currentRole={currentRole}
      device={device}
      switching={switching}
      onRoleChange={changeRole}
      onDeviceChange={changeDevice}
    />
  );

  if (device === 'desktop') {
    return (
      <>
        {controls}
        {children}
      </>
    );
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#020711]">
      {controls}

      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute left-[8%] top-[12%] h-80 w-80 rounded-full bg-cyan-400/[0.08] blur-[110px]" />
        <div className="absolute bottom-[4%] right-[5%] h-96 w-96 rounded-full bg-blue-600/[0.10] blur-[130px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(2,7,17,0.72)_76%)]" />
      </div>

      <div className="relative flex min-h-dvh items-start justify-center px-3 pb-4 pt-20 sm:px-6 sm:pb-6 sm:pt-24 md:pb-4 md:pt-4">
        <div className="relative h-[calc(100dvh-6rem)] max-h-[920px] w-[408px] max-w-full rounded-[2.9rem] border border-white/15 bg-[#02060b] p-[8px] shadow-[0_35px_90px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.04)] sm:h-[calc(100dvh-7.5rem)] md:h-[calc(100dvh-2rem)]">
          <span className="pointer-events-none absolute left-1/2 top-[3px] z-10 h-1 w-12 -translate-x-1/2 rounded-full bg-white/20" aria-hidden="true" />

          {frameUrl ? (
            <iframe
              ref={frameRef}
              src={frameUrl}
              title={`Prévia em celular — visão ${currentRole.label}`}
              loading="eager"
              className="h-full w-full rounded-[2.35rem] border-0 bg-[#091d35]"
            />
          ) : (
            <div className="grid h-full place-items-center rounded-[2.35rem] bg-[#091d35] text-cyan-200" role="status">
              <Loader2 size={24} className="animate-spin" />
              <span className="sr-only">Carregando prévia no celular</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
