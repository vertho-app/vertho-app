import Link from 'next/link';
import { carregarClientes } from '../actions';

export const metadata = { title: 'Clientes' };
export const dynamic = 'force-dynamic';

/**
 * A lista de clientes é tela NOVA: hoje `/admin/empresas/gerenciar` gere pessoas
 * e cargos (não é lista de clientes) e `/admin/empresas/nova` só cria. Esta é a
 * porta que faltava — estado e bloqueador por cliente, não só nome e contagem.
 */
export default async function ClientesPage() {
  const { clientes, erro } = await carregarClientes();

  if (erro) {
    return (
      <div className="rounded-2xl border border-red-400/40 bg-red-400/5 px-5 py-4 text-sm text-red-200">
        Não foi possível carregar os clientes: {erro}
      </div>
    );
  }

  const travados = clientes.filter((c) => c.bloqueador).length;

  return (
    <>
      <p className="max-w-[76ch] text-[13.5px] text-[var(--ink-dim)]">
        <b className="text-[var(--ink)]">{clientes.length}</b> clientes · <b className="text-[var(--ink)]">{travados}</b>{' '}
        com algo travando o avanço de fase. A coluna “o que trava” é derivada do mesmo dado que o pipeline lê, não de um
        campo de status.
      </p>

      <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-[var(--navy-card)] shadow-[0_8px_20px_rgba(0,0,0,0.18)]">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-white/[0.03]">
              {['Cliente', 'Pessoas', 'Fase atual', 'O que trava', ''].map((h, i) => (
                <th
                  key={h || i}
                  className={`whitespace-nowrap border-b border-white/[0.08] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-faint)] ${
                    i === 1 ? 'text-right' : 'text-left'
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.id} className="border-b border-white/[0.08] last:border-b-0 hover:bg-white/[0.02]">
                <td className="px-4 py-3 font-medium">{c.nome}</td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--ink-dim)]">{c.colaboradores}</td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-[11.5px] text-[var(--cyan-soft)]">{c.faseAtual}</td>
                <td className="px-4 py-3 text-[12.5px]">
                  {c.bloqueador ? (
                    <span className="text-[var(--warning)]">{c.bloqueador}</span>
                  ) : (
                    <span className="text-[var(--success)]">nada — segue em regime</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <Link
                    href={`/admin-v2/cliente?empresa=${c.id}`}
                    className="font-mono text-[11px] text-[var(--cyan)] hover:underline"
                  >
                    abrir →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
