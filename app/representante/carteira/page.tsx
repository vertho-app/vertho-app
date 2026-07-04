'use client';

// Portal do Representante — Carteira ativa (contas com contrato vigente).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Briefcase, CalendarClock, ChevronRight } from 'lucide-react';
import { getPortfolio } from '@/actions/sales/accounts';
import { RENEWAL_SOON_DAYS } from '@/lib/sales/constants';
import PortfolioSummaryCards from '@/components/sales/portfolio-summary-cards';
import PortfolioTable, { daysToRenewal, type PortfolioEntry } from '@/components/sales/portfolio-table';

function Skeleton() {
  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 animate-pulse">
      <div className="h-9 w-64 max-w-full rounded-lg" style={{ background: 'rgba(255,255,255,.05)' }} />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-2xl" style={{ background: 'rgba(255,255,255,.04)' }} />
        ))}
      </div>
      <div className="h-72 rounded-2xl" style={{ background: 'rgba(255,255,255,.04)' }} />
    </div>
  );
}

/** Faixa "Renovações próximas": contas com renovação em 0–90 dias. */
function RenewalsBand({ data }: { data: PortfolioEntry[] }) {
  const soon = data
    .map((r) => ({ row: r, dias: r.days_to_renewal ?? daysToRenewal(r.renewal_date) }))
    .filter((x) => x.dias != null && x.dias >= 0 && x.dias <= RENEWAL_SOON_DAYS)
    .sort((a, b) => (a.dias! - b.dias!));

  if (soon.length === 0) return null;

  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.28)' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(245,158,11,.14)', color: '#F59E0B' }}>
          <CalendarClock size={15} />
        </span>
        <div>
          <p className="text-sm font-bold text-white">Renovações próximas</p>
          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,.55)' }}>
            {soon.length} conta{soon.length === 1 ? '' : 's'} com renovação nos próximos {RENEWAL_SOON_DAYS} dias
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {soon.map(({ row, dias }) => {
          const nome = row.account.trade_name || row.account.legal_name;
          return (
            <Link
              key={row.account.id}
              href={`/representante/carteira/${row.account.id}`}
              className="group flex items-center justify-between gap-3 rounded-lg px-3 py-2 transition-colors"
              style={{ background: 'rgba(255,255,255,.03)' }}
            >
              <span className="text-sm font-semibold text-white truncate">{nome}</span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-bold" style={{ color: dias! <= 30 ? '#EF4444' : '#F59E0B' }}>
                  {dias === 0 ? 'hoje' : `${dias} dia${dias === 1 ? '' : 's'}`}
                </span>
                <ChevronRight size={14} className="text-gray-500 group-hover:text-white transition-colors" />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function CarteiraPage() {
  const [data, setData] = useState<PortfolioEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getPortfolio()
      .then((res) => {
        if (!alive) return;
        if (res.success) setData(res.rows || []);
        else setError((res as any).error || 'Falha ao carregar a carteira');
      })
      .catch((e) => { if (alive) setError(e?.message || 'Falha ao carregar a carteira'); });
    return () => { alive = false; };
  }, []);

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-2xl p-6 text-center" style={{ background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.3)' }}>
          <p className="text-sm font-bold text-white">Não foi possível carregar a carteira</p>
          <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,.6)' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return <Skeleton />;

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-white">Carteira ativa</h1>
        <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,.55)' }}>
          Seus clientes com contrato vigente, comissões recorrentes e renovações à vista.
        </p>
      </div>

      {data.length === 0 ? (
        <div
          className="rounded-2xl p-8 text-center flex flex-col items-center gap-3"
          style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' }}
        >
          <span className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(52,197,204,.1)', color: '#34c5cc' }}>
            <Briefcase size={18} />
          </span>
          <p className="text-sm font-bold text-white">Sua carteira começa no primeiro contrato ganho</p>
          <p className="text-xs max-w-sm leading-relaxed" style={{ color: 'rgba(255,255,255,.55)' }}>
            Registre oportunidades no CRM — cada fechamento ganho ativa o cliente aqui, com a comissão recorrente correspondente.
          </p>
          <Link
            href="/representante/crm"
            className="inline-flex items-center justify-center mt-1 px-4 py-2 rounded-lg text-xs font-bold transition-colors"
            style={{ background: '#34c5cc', color: '#06172c' }}
          >
            Ir para o CRM
          </Link>
        </div>
      ) : (
        <>
          <PortfolioSummaryCards data={data} />
          <RenewalsBand data={data} />
          <PortfolioTable data={data} />
        </>
      )}
    </div>
  );
}
