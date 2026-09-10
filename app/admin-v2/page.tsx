import Link from 'next/link';
import { ArrowRight, Check, CircleAlert, Clock3, ShieldAlert } from 'lucide-react';
import { carregarMeuTrabalho, type Fila } from './actions';

export const metadata = { title: 'Hoje · Admin por fluxo' };
export const dynamic = 'force-dynamic';

const ORDEM: Record<Fila['severidade'], number> = { critica: 0, atencao: 1, informativa: 2 };
const ETAPA: Record<string, string> = {
  cenarios: 'Fundação · Régua',
  ia4: 'Turma · Diagnóstico',
  cargos: 'Fundação · Base',
  acesso: 'Empresa · Pessoas',
  degradacao: 'Plataforma · Saúde',
  propostas: 'Negócios · Propostas',
};

const TOM: Record<Fila['severidade'], { borda: string; icone: typeof ShieldAlert; cor: string; rotulo: string }> = {
  critica: { borda: 'border-l-[var(--danger)]', icone: ShieldAlert, cor: 'text-[#ff9b90]', rotulo: 'bloqueia' },
  atencao: { borda: 'border-l-[var(--warning)]', icone: CircleAlert, cor: 'text-[var(--warning)]', rotulo: 'atenção' },
  informativa: { borda: 'border-l-[var(--cyan)]', icone: Clock3, cor: 'text-[var(--cyan)]', rotulo: 'fila' },
};

export default async function HojePage() {
  const { filas, erro } = await carregarMeuTrabalho();

  if (erro) {
    return (
      <div className="rounded-[16px] border border-red-400/35 bg-red-400/[0.06] px-5 py-4 text-sm text-red-200">
        A central não conseguiu ler as filas. {erro}
      </div>
    );
  }

  const abertas = filas.filter((fila) => fila.total > 0).sort((a, b) => ORDEM[a.severidade] - ORDEM[b.severidade]);
  const total = abertas.reduce((soma, fila) => soma + fila.total, 0);
  const criticas = abertas.filter((fila) => fila.severidade === 'critica').reduce((soma, fila) => soma + fila.total, 0);
  const limpas = filas.filter((fila) => fila.total === 0);

  return (
    <div className="space-y-7">
      <section className="grid gap-6 border-b border-white/[0.08] pb-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <p className="font-[family-name:var(--font-manrope)] text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--cyan)]">
            Central de operação
          </p>
          <h1 className="mt-2 max-w-[760px] text-[clamp(30px,4vw,52px)] font-semibold leading-[0.98] tracking-[-0.045em]">
            O que precisa <span className="font-[family-name:var(--font-serif)] font-normal italic text-[var(--cyan-soft)]">andar</span> hoje
          </h1>
          <p className="mt-4 max-w-[68ch] text-[13.5px] leading-relaxed text-[var(--ink-dim)]">
            Uma fila única entre clientes, turmas e áreas internas. Cada linha mostra o bloqueio, o escopo e a ação que resolve.
          </p>
        </div>
        <div className="flex gap-6 lg:pb-1">
          <Resumo valor={total} rotulo="itens abertos" />
          <Resumo valor={criticas} rotulo="bloqueadores" destaque={criticas > 0} />
          <Resumo valor={abertas.length} rotulo="filas ativas" />
        </div>
      </section>

      {abertas.length === 0 ? (
        <section className="rounded-[24px] border border-[#2ecc7133] bg-[#2ecc710b] px-6 py-10 text-center">
          <Check className="mx-auto text-[var(--success)]" size={28} />
          <h2 className="mt-3 text-lg font-semibold">Nenhuma pendência aberta</h2>
          <p className="mt-1 text-sm text-[var(--ink-dim)]">A operação está limpa neste momento.</p>
          <Link href="/admin-v2/clientes" className="mt-5 inline-flex items-center gap-2 rounded-[10px] bg-[var(--cyan)] px-4 py-2 text-xs font-semibold text-[#052227]">
            Ver clientes <ArrowRight size={13} />
          </Link>
        </section>
      ) : (
        <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_300px]">
          <section aria-labelledby="fila-titulo">
            <div className="mb-3 flex items-baseline justify-between gap-4">
              <div>
                <p className="font-[family-name:var(--font-manrope)] text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ink-faint)]">Agora</p>
                <h2 id="fila-titulo" className="mt-1 text-lg font-semibold tracking-[-0.02em]">Prioridade da equipe</h2>
              </div>
              <span className="font-[family-name:var(--font-manrope)] text-[10px] text-[var(--ink-faint)]">ordenado por impacto</span>
            </div>

            <div className="overflow-hidden rounded-[16px] border border-white/[0.08] bg-[var(--navy-card)]">
              {abertas.map((fila) => {
                const tom = TOM[fila.severidade];
                const Icone = tom.icone;
                return (
                  <div key={fila.id} className={`border-l-2 ${tom.borda}`}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/[0.06] bg-white/[0.018] px-4 py-2.5">
                      <Icone size={14} className={tom.cor} />
                      <span className="font-[family-name:var(--font-manrope)] text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--ink-faint)]">
                        {ETAPA[fila.id] ?? 'Operação'}
                      </span>
                      <span className="text-[12.5px] font-semibold">{fila.titulo}</span>
                      <span className={`ml-auto rounded-full border border-white/[0.08] px-2 py-0.5 font-[family-name:var(--font-manrope)] text-[9px] font-bold uppercase tracking-[0.1em] ${tom.cor}`}>
                        {fila.total} · {tom.rotulo}
                      </span>
                    </div>

                    {fila.itens.slice(0, 8).map((item) => (
                      <Link
                        key={`${fila.id}-${item.empresaId}`}
                        href={item.href}
                        className="group grid gap-2 border-b border-white/[0.05] px-4 py-3 transition-colors last:border-b-0 hover:bg-white/[0.025] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[var(--cyan)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium">{item.empresa}</span>
                          <span className="mt-0.5 block text-[11px] text-[var(--ink-faint)]">
                            {fila.periodo} · {item.total !== null ? `${item.contagem} de ${item.total}` : `${item.contagem} ocorrência(s)`}
                          </span>
                        </span>
                        <span className="flex items-center gap-2 text-[11px] font-semibold text-[var(--cyan)]">
                          Resolver <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </Link>
                    ))}
                  </div>
                );
              })}
            </div>
          </section>

          <aside className="space-y-5">
            <section className="rounded-[16px] border border-white/[0.08] bg-[#091d35] p-4">
              <p className="font-[family-name:var(--font-manrope)] text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ink-faint)]">Trilho operacional</p>
              <h2 className="mt-2 font-[family-name:var(--font-serif)] text-xl italic text-[var(--cyan-soft)]">Empresa alimenta turmas</h2>
              <div className="mt-4 space-y-2 text-[11.5px] text-[var(--ink-dim)]">
                <FluxoItem numero="1" titulo="Fundação" detalhe="Base e régua compartilhadas" />
                <FluxoItem numero="2" titulo="Diagnóstico e PDI" detalhe="Execução por turma" />
                <FluxoItem numero="3" titulo="Jornada e evolução" detalhe="Relógio próprio da safra" ultimo />
              </div>
              <Link href="/admin-v2/clientes" className="mt-4 flex items-center gap-2 text-xs font-semibold text-[var(--cyan)] hover:underline">
                Abrir carteira <ArrowRight size={12} />
              </Link>
            </section>

            <section>
              <p className="mb-2 font-[family-name:var(--font-manrope)] text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ink-faint)]">Sem pendência</p>
              <ul className="space-y-1.5">
                {limpas.map((fila) => (
                  <li key={fila.id} className="flex items-start gap-2 text-[11.5px] leading-snug text-[var(--ink-faint)]">
                    <Check size={12} className="mt-0.5 shrink-0 text-[var(--success)]" /> {fila.titulo}
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}

function Resumo({ valor, rotulo, destaque }: { valor: number; rotulo: string; destaque?: boolean }) {
  return (
    <div className="min-w-[74px]">
      <div className={`font-[family-name:var(--font-serif)] text-[30px] leading-none ${destaque ? 'text-[#ff9b90]' : 'text-[var(--ink)]'}`}>{valor}</div>
      <div className="mt-1 font-[family-name:var(--font-manrope)] text-[9px] uppercase tracking-[0.1em] text-[var(--ink-faint)]">{rotulo}</div>
    </div>
  );
}

function FluxoItem({ numero, titulo, detalhe, ultimo }: { numero: string; titulo: string; detalhe: string; ultimo?: boolean }) {
  return (
    <div className="grid grid-cols-[20px_1fr] gap-2.5">
      <span className="relative grid h-5 w-5 place-items-center rounded-full border border-[#34c5cc55] bg-[#34c5cc0f] font-[family-name:var(--font-manrope)] text-[9px] font-bold text-[var(--cyan)]">
        {numero}
        {!ultimo && <span className="absolute left-1/2 top-full h-[17px] w-px -translate-x-1/2 bg-[#34c5cc30]" />}
      </span>
      <span>
        <b className="block font-medium text-[var(--ink)]">{titulo}</b>
        <span className="text-[10.5px] text-[var(--ink-faint)]">{detalhe}</span>
      </span>
    </div>
  );
}
