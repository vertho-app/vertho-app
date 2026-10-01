import { carregarAndamentoEmpresas, type AndamentoEmpresa } from '@/lib/admin/andamento-empresas';

export const metadata = { title: 'Andamento da base · Admin' };
export const dynamic = 'force-dynamic';

const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0);

export default async function AndamentoPage() {
  let linhas: AndamentoEmpresa[] = [];
  let erro: string | null = null;
  try {
    linhas = await carregarAndamentoEmpresas();
  } catch (e) {
    erro = e instanceof Error ? e.message : 'falha ao carregar';
  }

  if (erro) {
    return (
      <div className="m-6 rounded-xl border border-red-400/35 bg-red-400/[0.06] px-5 py-4 text-sm text-red-200">
        O andamento não conseguiu carregar. {erro}
      </div>
    );
  }

  const total = linhas.reduce((s, l) => s + l.pessoas, 0);
  const disc = linhas.reduce((s, l) => s + l.comPerfil, 0);
  const mapeamento = linhas.reduce((s, l) => s + l.comMapeamento, 0);
  const algumIndisponivel = linhas.some((l) => l.indisponivel);

  // BRT, nunca UTC: o número muda quando alguém roda um lote, então vai datado.
  const medidoEm = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short',
  }).format(new Date());

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <section className="border-b border-white/10 pb-6">
        <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">Andamento</p>
        <h1 className="mt-2 text-2xl font-bold text-white">
          Quem já fez o <span className="text-cyan-300">DISC e o mapeamento</span>
        </h1>
        <p className="mt-4 max-w-[72ch] text-sm leading-relaxed text-gray-400">
          Mesma régua da home do RH. Mapeamento conta só quem teve o Top 5 do cargo inteiro avaliado.
          Fora: empresas de demonstração e o papel Admin da empresa. Medido em {medidoEm} (Brasília).
        </p>
        <div className="mt-6 flex flex-wrap gap-8">
          <Resumo valor={total} rotulo="pessoas" />
          <Resumo valor={disc} rotulo={`fizeram o DISC · ${pct(disc, total)}%`} />
          <Resumo valor={mapeamento} rotulo={`fizeram o mapeamento · ${pct(mapeamento, total)}%`} />
        </div>
        {algumIndisponivel && (
          <p className="mt-4 text-xs text-amber-300">
            Uma consulta falhou para alguma empresa (marcada com ⚠). O número dela pode estar abaixo do real.
          </p>
        )}
      </section>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead className="text-[10px] uppercase tracking-widest text-gray-500">
            <tr className="border-b border-white/10">
              <th className="px-4 py-3 font-bold">Empresa</th>
              <th className="px-4 py-3 text-right font-bold">Pessoas</th>
              <th className="px-4 py-3 text-right font-bold">DISC</th>
              <th className="px-4 py-3 text-right font-bold">Mapeamento</th>
              <th className="px-4 py-3 text-right font-bold">Em jornada</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} className="border-b border-white/5 last:border-0">
                <td className="px-4 py-3 font-semibold text-white">
                  {l.nome}{l.indisponivel && <span title="consulta falhou"> ⚠</span>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{l.pessoas}</td>
                <Celula parte={l.comPerfil} total={l.pessoas} />
                <Celula parte={l.comMapeamento} total={l.pessoas} />
                <td className="px-4 py-3 text-right tabular-nums">{l.emJornada}</td>
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Nenhuma empresa com pessoas cadastradas.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Celula({ parte, total }: { parte: number; total: number }) {
  return (
    <td className="px-4 py-3 text-right tabular-nums">
      {parte} <span className="text-[11px] text-gray-500">({pct(parte, total)}%)</span>
    </td>
  );
}

function Resumo({ valor, rotulo }: { valor: number; rotulo: string }) {
  return (
    <div>
      <div className="text-3xl font-extrabold leading-none text-white">{valor}</div>
      <div className="mt-1 text-[10px] uppercase tracking-widest text-gray-500">{rotulo}</div>
    </div>
  );
}
