import Link from 'next/link';
import { carregarMeuTrabalho, type Fila } from './actions';

export const metadata = { title: 'Meu trabalho' };
export const dynamic = 'force-dynamic';

const BORDA: Record<Fila['severidade'], string> = {
  critica: 'border-l-[var(--danger)]',
  atencao: 'border-l-[var(--warning)]',
  informativa: 'border-l-[var(--cyan)]',
};

const NUMERO: Record<Fila['severidade'], string> = {
  critica: 'text-[var(--danger)]',
  atencao: 'text-[var(--warning)]',
  informativa: 'text-[var(--cyan)]',
};

export default async function MeuTrabalhoPage() {
  const { filas, erro } = await carregarMeuTrabalho();

  if (erro) {
    return (
      <div className="rounded-2xl border border-red-400/40 bg-red-400/5 px-5 py-4 text-sm text-red-200">
        Não foi possível carregar as filas: {erro}
      </div>
    );
  }

  const totalPendencias = filas.reduce((a, f) => a + f.total, 0);
  const comPendencia = filas.filter((f) => f.total > 0);
  const limpas = filas.filter((f) => f.total === 0);

  return (
    <>
      <p className="max-w-[76ch] text-[13.5px] text-[var(--ink-dim)]">
        {totalPendencias === 0 ? (
          <>Nenhuma pendência aberta agora.</>
        ) : (
          <>
            <b className="text-[var(--ink)]">{totalPendencias}</b> pendências abertas. Cada linha diz o que travou, em
            qual cliente e quantas de quantas — e leva à tela que resolve.
          </>
        )}
      </p>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(330px,1fr))] gap-3.5">
        {comPendencia.map((fila) => (
          <section
            key={fila.id}
            className={`flex flex-col gap-3 rounded-2xl border border-l-2 border-white/[0.08] bg-[var(--navy-card)] p-4 shadow-[0_8px_20px_rgba(0,0,0,0.18)] ${BORDA[fila.severidade]}`}
          >
            <header className="flex items-center gap-2.5">
              <span className={`font-[family-name:var(--font-serif)] text-[27px] leading-none ${NUMERO[fila.severidade]}`}>
                {fila.total}
              </span>
              <span>
                <span className="block text-[13.5px] font-semibold">{fila.titulo}</span>
                <span className="mt-0.5 block font-mono text-[11.5px] text-[var(--ink-faint)]">{fila.periodo}</span>
              </span>
            </header>

            <ul className="flex flex-col gap-1.5">
              {fila.itens.slice(0, 6).map((item) => (
                <li key={item.empresaId + item.empresa} className="border-t border-white/[0.08] pt-1.5">
                  <Link
                    href={item.href}
                    className="flex items-baseline gap-2 text-[12.5px] text-[var(--ink-dim)] transition-colors hover:text-[var(--cyan)]"
                  >
                    <b className="font-medium text-[var(--ink)]">
                      {item.total !== null ? `${item.contagem} de ${item.total}` : item.contagem}
                    </b>
                    <span className="truncate">{item.empresa}</span>
                    <span className="ml-auto shrink-0 font-mono text-[10.5px] text-[var(--ink-faint)]">resolver →</span>
                  </Link>
                </li>
              ))}
              {fila.itens.length > 6 && (
                <li className="border-t border-white/[0.08] pt-1.5 font-mono text-[11px] text-[var(--ink-faint)]">
                  + {fila.itens.length - 6} outros clientes
                </li>
              )}
            </ul>
          </section>
        ))}
      </div>

      {limpas.length > 0 && (
        <div className="rounded-2xl border border-white/[0.08] bg-[var(--navy-card)] px-5 py-4">
          <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">Sem pendência</h2>
          <ul className="flex flex-wrap gap-x-6 gap-y-1.5">
            {limpas.map((f) => (
              <li key={f.id} className="text-[12.5px] text-[var(--ink-dim)]">
                <span className="text-[var(--success)]">✓</span> {f.titulo}{' '}
                <span className="text-[var(--ink-faint)]">— {f.vazio}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="font-mono text-[11px] text-[var(--ink-faint)]">
        Contagens lidas do banco a cada carregamento, por empresa. Nenhum número desta tela é estimado ou fixo.
      </p>
    </>
  );
}
