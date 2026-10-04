'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowUpRight, ChevronDown, Copy } from 'lucide-react';
import type { ReportView } from '@/lib/engajamento/relatorio-model';
import { engagementDetailHref, type EngagementBlocker } from '@/lib/engajamento/prioridades';
import { engagementLinks, type EngagementSurface } from '@/lib/engajamento/surface';
import { useFormatadores } from './use-formatadores';

/** Prioridades e plano do relatório semanal. Texto em `EngagementWorkspace.report.priorities` (R-67). */
export default function ReportPriorities({ data, empresaId, surface = 'admin' }: { data: ReportView; empresaId: string; surface?: EngagementSurface }) {
  const t = useTranslations('EngagementWorkspace');
  const { num, pct: pctTexto } = useFormatadores();
  const links = engagementLinks(empresaId, surface);
  const [selected, setSelected] = useState<EngagementBlocker | null>(null);
  // O resultado da cópia fica como CHAVE: o texto sai do catálogo ao desenhar,
  // então trocar de idioma com a mensagem na tela não a deixa no idioma antigo.
  const [copyStatus, setCopyStatus] = useState<'' | 'copied' | 'failed'>('');
  const current = data.priorities.find((priority) => priority.key === selected);
  async function copyPlan() {
    try {
      await navigator.clipboard.writeText([
        t('report.priorities.copy.header', { scope: data.scope, week: data.week }), data.thesis, data.explanation,
        ...data.actionPlan.map((action, index) => t('report.priorities.copy.action', {
          n: index + 1, title: action.title, description: action.description, owner: action.owner, deadline: action.deadline,
        })),
      ].join('\n\n'));
      setCopyStatus('copied');
    } catch { setCopyStatus('failed'); }
  }
  return <section id="prioridades" aria-labelledby="prioridades-title" className="scroll-mt-6 py-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 id="prioridades-title" className="text-lg font-semibold text-white">{t('report.priorities.title')}</h3>
        <p className="mt-1 text-xs text-white/60">{t('report.priorities.subtitle', { week: data.week, eligible: data.eligible })}</p>
      </div>
      <button type="button" onClick={copyPlan} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/15 px-3 text-xs text-cyan-200 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-cyan-300"><Copy size={14} /> {t('report.priorities.copyPlan')}</button>
    </div>
    <p role="status" className="mt-1 text-xs text-cyan-200">{copyStatus ? t(`report.priorities.copyStatus.${copyStatus}`) : ''}</p>
    <div className={`mt-4 grid gap-3 ${data.priorities.length > 1 ? 'md:grid-cols-3' : 'md:max-w-md'}`}>
      {data.priorities.map((priority) => <button key={priority.key} type="button" aria-expanded={selected === priority.key} aria-controls="grupo-prioritario" onClick={() => setSelected(selected === priority.key ? null : priority.key)} className={`rounded-xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-cyan-300 ${selected === priority.key ? 'border-cyan-300/60 bg-cyan-300/10' : 'border-white/15 bg-white/[0.025] hover:bg-white/5'}`}>
        <span className="block text-xs font-semibold text-white/75">{priority.label}</span>
        <span className="mt-1 block text-2xl font-semibold tabular-nums text-white">{num(priority.count)} <span className="text-xs font-normal text-white/60">{t('report.priorities.peoplePct', { count: priority.count, pct: pctTexto(priority.pct) })}</span></span>
        <span className="mt-3 flex items-center justify-between gap-2 text-xs text-cyan-200">{t('report.priorities.viewGroup')} <ChevronDown size={14} /></span>
      </button>)}
    </div>
    <div id="grupo-prioritario" aria-live="polite">
      {current && <div className="mt-4 rounded-xl border border-cyan-300/20 p-4">
        <h4 className="text-sm font-semibold text-white">{current.action}</h4>
        <p className="mt-2 text-xs leading-relaxed text-white/65">{current.guidance}</p>
        <ul className="mt-4 divide-y divide-white/10">
          {current.members.map((member) => <li key={member.id || member.name} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0"><p className="break-words text-sm text-white">{member.name}</p><p className="text-xs text-white/55">{member.context}</p></div>
            {member.id && <Link href={engagementDetailHref(empresaId, member, surface)} className="inline-flex min-h-10 items-center gap-1 text-xs text-cyan-200 hover:underline">{t('report.focus.viewSignals')} <ArrowUpRight size={14} /></Link>}
          </li>)}
        </ul>
        {!current.members.length && <p className="mt-3 text-xs text-white/60">{t('report.priorities.noMembers')}</p>}
      </div>}
    </div>
    <div className="mt-5 divide-y divide-white/10 border-y border-white/10">
      {data.actionPlan.map((action, index) => <details key={action.title} className="group py-4" open={index === 0}>
        <summary className="flex cursor-pointer list-none items-start gap-3 focus-visible:outline-2 focus-visible:outline-cyan-300 [&::-webkit-details-marker]:hidden">
          <span className="pt-0.5 font-mono text-xs text-cyan-300">{index + 1}.</span>
          <span className="flex-1 text-sm font-semibold text-white">{action.title}<span className="mt-1 block text-xs font-normal text-white/60">{t('report.priorities.owner', { owner: action.owner, deadline: action.deadline })}</span></span>
          <ChevronDown size={16} className="text-white/60 group-open:rotate-180" />
        </summary>
        <div className="mt-3 pl-6 text-xs leading-relaxed text-white/70">
          <p>{action.description}</p>
          {links.reviewEnvios && index === 0 && data.priorities[0]?.key === 'ativacao' && <Link href={links.reviewEnvios} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-cyan-300/30 px-3 text-cyan-200 hover:bg-cyan-300/10">{t('actNow.reviewSends')} <ArrowUpRight size={14} /></Link>}
        </div>
      </details>)}
    </div>
  </section>;
}
