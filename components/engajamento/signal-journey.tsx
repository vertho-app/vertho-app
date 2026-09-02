import { Fragment, type ReactNode } from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';

export type SignalTone = 'cyan' | 'teal' | 'emerald' | 'amber';

export type SignalJourneyStep = {
  label: string;
  value: number;
  detail: string;
  icon: LucideIcon;
  tone: SignalTone;
};

const TONE: Record<SignalTone, {
  icon: string;
  value: string;
  bar: string;
  halo: string;
}> = {
  cyan: {
    icon: 'border-brand-300/25 bg-brand-300/10 text-brand-300',
    value: 'text-brand-100',
    bar: 'bg-brand-400',
    halo: 'shadow-[0_0_22px_rgba(34,211,238,0.08)]',
  },
  teal: {
    icon: 'border-teal-300/25 bg-teal-300/10 text-teal-300',
    value: 'text-teal-100',
    bar: 'bg-teal-400',
    halo: 'shadow-[0_0_22px_rgba(45,212,191,0.08)]',
  },
  emerald: {
    icon: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-300',
    value: 'text-emerald-100',
    bar: 'bg-emerald-400',
    halo: 'shadow-[0_0_22px_rgba(52,211,153,0.08)]',
  },
  amber: {
    icon: 'border-amber-300/25 bg-amber-300/10 text-amber-300',
    value: 'text-amber-100',
    bar: 'bg-amber-400',
    halo: 'shadow-[0_0_22px_rgba(251,191,36,0.08)]',
  },
};

/**
 * Leitura acumulada da jornada. Os blocos são conectados porque os sinais têm
 * ordem real: entrar na cadência → abrir → consumir → entregar.
 */
export function SignalJourney({
  eyebrow = 'Trilha de sinais',
  title,
  description,
  total,
  steps,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  total: number;
  steps: SignalJourneyStep[];
  action?: ReactNode;
}) {
  return (
    <section
      aria-labelledby="signal-journey-title"
      className="overflow-hidden rounded-[24px] border border-white/[0.08]"
      style={{
        background:
          'radial-gradient(720px 220px at 12% -30%, rgba(52,197,204,.13), transparent 62%), rgba(255,255,255,.025)',
      }}
    >
      <div className="flex flex-col gap-3 border-b border-white/[0.07] px-4 py-4 sm:px-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-brand-300/75">
            {eyebrow}
          </p>
          <h2
            id="signal-journey-title"
            className="mt-1 text-[23px] leading-tight text-white"
            style={{ fontFamily: 'var(--font-serif, "Instrument Serif", serif)', fontStyle: 'italic' }}
          >
            {title}
          </h2>
          <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-white/45">
            {description}
          </p>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>

      <div className="grid grid-cols-2 gap-px bg-white/[0.07] lg:grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)_24px_minmax(0,1fr)_24px_minmax(0,1fr)]">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const pct = total > 0
            ? Math.min(100, Math.max(0, Math.round((step.value / total) * 100)))
            : 0;
          const tone = TONE[step.tone];

          return (
            <Fragment key={step.label}>
              <article className={`min-w-0 bg-[#081a2f]/90 p-4 sm:p-5 ${tone.halo}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`grid h-8 w-8 place-items-center rounded-[10px] border ${tone.icon}`}>
                    <Icon size={15} aria-hidden="true" />
                  </span>
                  <span className="font-mono text-[10px] font-semibold tabular-nums text-white/35">
                    {pct}%
                  </span>
                </div>
                <p className={`mt-4 text-[28px] font-semibold leading-none tabular-nums ${tone.value}`}>
                  {step.value}
                  <span className="ml-1 text-[12px] font-medium text-white/28">de {total}</span>
                </p>
                <p className="mt-2 text-[11px] font-bold text-white/80">{step.label}</p>
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.07]" aria-hidden="true">
                  <div
                    className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${tone.bar}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-white/35">{step.detail}</p>
              </article>
              {index < steps.length - 1 && (
                <div className="hidden items-center justify-center bg-[#081a2f]/90 text-white/18 lg:flex" aria-hidden="true">
                  <ChevronRight size={15} />
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </section>
  );
}
