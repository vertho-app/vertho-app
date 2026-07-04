'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ShieldCheck, ClipboardCheck } from 'lucide-react';
import BackButton from '@/components/back-button';
import { useEmpresaContexto } from '@/app/admin/_shell/useEmpresaContexto';
import Sem13Tab from './_components/sem13-tab';
import Sem14Tab from './_components/sem14-tab';

/**
 * Workspace unificado de auditorias internas Vertho (Reorganização do admin, Fase 3).
 * Funde as antigas telas /admin/vertho/avaliacao-acumulada (sem 13) e
 * /admin/vertho/auditoria-sem14 (sem 14) em tabs (?tab=sem13|sem14).
 */
// Wrapper com Suspense: AuditoriasPageInner usa useSearchParams. Sem o boundary,
// chegar via redirect() (ex.: /vertho/avaliacao-acumulada → ?tab=sem13) causava
// hydration mismatch de hooks (React #310). (Reorganização, Fase 3.)
export default function AuditoriasPage() {
  return <Suspense fallback={<div className="min-h-dvh" />}><AuditoriasPageInner /></Suspense>;
}

function AuditoriasPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tTabs = useTranslations('AdminAuditorias');
  // Contexto de empresa resolvido UMA vez (path → ?empresa= → filtro do header) e passado às tabs
  const { empresaId } = useEmpresaContexto();

  const initialTab = searchParams.get('tab');
  const [tab, setTab] = useState(
    ['sem13', 'sem14'].includes(initialTab || '') ? (initialTab as string) : 'sem13'
  );

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6 sm:px-6 min-h-full">
      <BackButton onClick={() => router.push(empresaId ? `/admin/empresas/${empresaId}?fase=4` : '/admin/dashboard')} />

      {/* Tabs (mesmo padrão de empresas/[empresaId]/fase1) */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl border border-white/[0.06]" style={{ background: '#091D35' }}>
        {[
          { key: 'sem13', label: tTabs('tabs.sem13'), icon: ShieldCheck, color: 'text-purple-400' },
          { key: 'sem14', label: tTabs('tabs.sem14'), icon: ClipboardCheck, color: 'text-cyan-400' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              tab === t.key ? 'bg-white/[0.06] text-white' : 'text-gray-500 hover:text-gray-300'
            }`}>
            <t.icon size={14} className={tab === t.key ? t.color : ''} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'sem13' && <Sem13Tab empresaId={empresaId} />}
      {tab === 'sem14' && <Sem14Tab empresaId={empresaId} />}
    </div>
  );
}
