'use client';

import { useState, useSyncExternalStore } from 'react';
import { ChevronDown, Eye, Loader2 } from 'lucide-react';
import {
  DEMO_PRESENTATION_ROLES,
  demoPresentationUrl,
  getDemoPresentationRoleFromHostname,
  type DemoPresentationRole,
  type DemoPresentationRoleKey,
} from '@/lib/demo/presentation';

const subscribeToHostname = () => () => {};
const getPresentationRoleSnapshot = () => getDemoPresentationRoleFromHostname(window.location.hostname);
const getPresentationRoleServerSnapshot = () => null;

/**
 * Dropdown da sala de apresentação. Ele só renderiza nos três aliases fixos;
 * no tenant canônico e em clientes reais não deixa qualquer vestígio visual.
 */
export function PresentationRoleSwitcher() {
  const currentRole = useSyncExternalStore<DemoPresentationRole | null>(
    subscribeToHostname,
    getPresentationRoleSnapshot,
    getPresentationRoleServerSnapshot,
  );
  const [switching, setSwitching] = useState(false);

  if (!currentRole) return null;

  function changeRole(nextRole: DemoPresentationRoleKey) {
    if (nextRole === currentRole?.key) return;
    setSwitching(true);
    // Cada destino tem a própria sessão real já preparada. Ir para a home do
    // papel evita carregar um deep-link que aquela função não pode acessar.
    window.location.assign(demoPresentationUrl(nextRole));
  }

  return (
    <div className="fixed right-3 top-[calc(var(--header-height)+0.5rem)] z-[60] md:right-5 md:top-4">
      <label className="group flex items-center gap-2 rounded-xl border border-white/15 bg-[#071321]/95 px-2.5 py-2 shadow-[0_12px_38px_rgba(0,0,0,0.34)] backdrop-blur-xl transition-colors hover:border-[var(--brand-300,#67e8f9)]/45 focus-within:border-[var(--brand-300,#67e8f9)]/60 focus-within:ring-2 focus-within:ring-[var(--brand-400,#22d3ee)]/25">
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
              onChange={(event) => changeRole(event.target.value as DemoPresentationRoleKey)}
              disabled={switching}
              aria-label="Trocar função apresentada"
              className="block min-w-[92px] cursor-pointer appearance-none bg-transparent pr-5 text-xs font-bold text-white outline-none disabled:cursor-wait sm:min-w-[116px]"
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
    </div>
  );
}
