import type { DemoGuestProgress } from '@/lib/demo/acme-prospect-config';
import { metricasDegustacao } from '@/lib/demo/degustacao-metricas';
export default function DemoFunnelSummary({ convidados }: { convidados: DemoGuestProgress[] }) {
  const m = metricasDegustacao(convidados);
  return <section className="mt-4 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.04] p-4" aria-label="Funil da degustação B">
    <p className="text-sm font-semibold text-cyan-100">Exploração relevante por convite aberto: {m.taxa === null ? '—' : `${m.taxa}%`}</p>
    <p className="mt-1 text-xs text-white/65">{m.exploraram} exploraram conteúdo / {m.abertos} abriram · {m.convites} convites · {m.contatos} clicaram no contato</p>
    <p className="mt-2 text-[11px] text-white/45">Todos os convites retidos neste ambiente: versão B com medição v1, sem testes internos. Os cartões abaixo mostram os 50 mais recentes. Conteúdo carregado e visível por 2 segundos conta uma vez por convite. Clique no contato indica intenção; não confirma envio. Convites anteriores à medição ficam fora da taxa.</p>
  </section>;
}
