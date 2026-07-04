'use client';

// Lista de atenção comercial (próximas ações) com empty state positivo.
import Link from 'next/link';
import { Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type SalesAlertItem = { texto: string; href?: string };

export default function SalesAlertCard({
  title, icon: Icon, items, accent = '#F59E0B', emptyText = 'Tudo em dia',
}: {
  title: string;
  icon: LucideIcon;
  items: SalesAlertItem[];
  accent?: string;
  emptyText?: string;
}) {
  const empty = items.length === 0;
  const color = empty ? 'rgba(255,255,255,.35)' : accent;

  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-3 min-w-0"
      style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' }}
    >
      <div className="flex items-center gap-2">
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: empty ? 'rgba(255,255,255,.05)' : `${accent}14`, color }}
        >
          <Icon size={14} />
        </span>
        <p className="text-xs font-bold text-white flex-1 min-w-0 truncate">{title}</p>
        {!empty && (
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0"
            style={{ background: `${accent}1a`, border: `1px solid ${accent}45`, color: accent }}
          >
            {items.length}
          </span>
        )}
      </div>

      {empty ? (
        <div className="flex items-center gap-2 py-1.5">
          <Check size={13} style={{ color: '#22C55E' }} />
          <p className="text-xs" style={{ color: 'rgba(255,255,255,.5)' }}>{emptyText}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.slice(0, 5).map((item, i) => (
            <li key={i} className="min-w-0">
              {item.href ? (
                <Link
                  href={item.href}
                  className="block text-xs truncate transition-colors hover:text-white"
                  style={{ color: 'rgba(255,255,255,.7)' }}
                  title={item.texto}
                >
                  {item.texto}
                </Link>
              ) : (
                <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,.7)' }} title={item.texto}>
                  {item.texto}
                </p>
              )}
            </li>
          ))}
          {items.length > 5 && (
            <li className="text-[11px]" style={{ color: 'rgba(255,255,255,.4)' }}>
              + {items.length - 5} outras
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
