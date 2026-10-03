import type { DemoGuestProgress } from '@/lib/demo/acme-prospect-config';
import { metricasDegustacao } from '@/lib/demo/degustacao-metricas';
export default function DemoFunnelSummary({ convidados }: { convidados: DemoGuestProgress[] }) {
  const m = metricasDegustacao(convidados);
  const c = metricasDegustacao(convidados, 'C');
  return <>
    <section className="mt-4 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.04] p-4" aria-label="Funil da degustação B">
      <p className="text-sm font-semibold text-cyan-100">Exploração relevante por convite aberto: {m.taxa === null ? '—' : `${m.taxa}%`}</p>
      <p className="mt-1 text-xs text-white/65">{m.exploraram} exploraram conteúdo / {m.abertos} abriram · {m.convites} convites · {m.contatos} clicaram no contato</p>
      <p className="mt-2 text-[11px] text-white/45">Todos os convites retidos neste ambiente: versão B com medição v1, sem testes internos. Os cartões abaixo mostram os 50 mais recentes. Conteúdo carregado e visível por 2 segundos conta uma vez por convite. Clique no contato indica intenção; não confirma envio. Convites anteriores à medição ficam fora da taxa.</p>
    </section>
    {c.convites > 0 && (
      <section className="mt-3 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.04] p-4" aria-label="Funil da degustação C">
        <p className="text-sm font-semibold text-emerald-100">Escolheram um desafio por convite aberto (versão C): {c.taxa === null ? 'sem dados' : `${c.taxa}%`}</p>
        <p className="mt-1 text-xs text-white/65">{c.exploraram} escolheram um desafio / {c.abertos} abriram · {c.convites} convites · {c.contatos} clicaram no contato</p>
        <p className="mt-2 text-[11px] text-white/45">Coorte própria da versão C (medição c1), sem testes internos. O desafio conta quando a tela da resposta fica visível por 2 segundos; é o primeiro escolhido, e o cartão do convite mostra qual foi. Clique no contato indica intenção; não confirma envio.</p>
      </section>
    )}
  </>;
}
