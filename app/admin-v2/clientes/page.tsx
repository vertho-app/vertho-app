import { TURMA_ENCERRADAS } from '@/lib/status';
import { carregarClientes } from '../actions';
import CarteiraOperacional from './CarteiraOperacional';

export const metadata = { title: 'Clientes e turmas · Admin por fluxo' };
export const dynamic = 'force-dynamic';

export default async function ClientesPage() {
  const { clientes, erro } = await carregarClientes();

  if (erro) {
    return (
      <div className="rounded-[16px] border border-red-400/35 bg-red-400/[0.06] px-5 py-4 text-sm text-red-200">
        A carteira não conseguiu carregar. {erro}
      </div>
    );
  }

  const turmasAtivas = clientes.reduce(
    (total, cliente) => total + cliente.portfolio.turmas.filter((turma) => !TURMA_ENCERRADAS.includes(turma.status)).length,
    0,
  );
  const semTurma = clientes.reduce((total, cliente) => total + cliente.portfolio.semTurma, 0);

  return (
    <div className="space-y-7">
      <section className="grid gap-6 border-b border-white/[0.08] pb-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <p className="font-[family-name:var(--font-manrope)] text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--cyan)]">Carteira operacional</p>
          <h1 className="mt-2 max-w-[820px] text-[clamp(30px,4vw,50px)] font-semibold leading-[1] tracking-[-0.045em]">
            Uma fundação, <span className="font-[family-name:var(--font-serif)] font-normal italic text-[var(--cyan-soft)]">vários relógios</span>
          </h1>
          <p className="mt-4 max-w-[72ch] text-[13.5px] leading-relaxed text-[var(--ink-dim)]">
            A empresa concentra base e régua. Cada turma aparece abaixo com sua própria distribuição e a ação que destrava o próximo avanço.
          </p>
        </div>
        <div className="flex gap-6 lg:pb-1">
          <Resumo valor={clientes.length} rotulo="empresas" />
          <Resumo valor={turmasAtivas} rotulo="turmas ativas" />
          <Resumo valor={semTurma} rotulo="pessoas sem turma" destaque={semTurma > 0} />
        </div>
      </section>

      <CarteiraOperacional clientes={clientes} />
    </div>
  );
}

function Resumo({ valor, rotulo, destaque }: { valor: number; rotulo: string; destaque?: boolean }) {
  return (
    <div className="min-w-[78px]">
      <div className={`font-[family-name:var(--font-serif)] text-[30px] leading-none ${destaque ? 'text-[var(--warning)]' : ''}`}>{valor}</div>
      <div className="mt-1 font-[family-name:var(--font-manrope)] text-[9px] uppercase tracking-[0.1em] text-[var(--ink-faint)]">{rotulo}</div>
    </div>
  );
}
