import { Fragment } from 'react';
import Link from 'next/link';
import {
  carregarAndamentoEmpresas,
  type AndamentoEmpresa,
  type AndamentoLinha,
  type RecorteAndamento,
} from '@/lib/admin/andamento-empresas';

export const metadata = { title: 'Andamento da base · Admin' };
export const dynamic = 'force-dynamic';

const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0);

const RECORTES: Array<{ valor: RecorteAndamento; rotulo: string }> = [
  { valor: 'empresa', rotulo: 'Só empresa' },
  { valor: 'cargo', rotulo: 'Por cargo' },
  { valor: 'turma', rotulo: 'Por turma' },
];

export default async function AndamentoPage({ searchParams }: { searchParams: Promise<{ por?: string }> }) {
  const { por: porParam } = await searchParams;
  // Valor vindo da URL: só os três conhecidos valem, o resto cai em "empresa".
  const por: RecorteAndamento = porParam === 'cargo' || porParam === 'turma' ? porParam : 'empresa';

  let linhas: AndamentoEmpresa[] = [];
  let erro: string | null = null;
  try {
    linhas = await carregarAndamentoEmpresas(por);
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
  const algumIndisponivel = linhas.some((l) => l.indisponivel || l.grupos.some((g) => g.indisponivel));

  // BRT, nunca UTC: o número muda quando alguém roda um lote, então vai datado.
  const medidoEm = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short',
  }).format(new Date());

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <section className="border-b border-white/10 pb-6">
        <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">Andamento</p>
        <h1 className="mt-2 text-2xl font-bold text-white">
          Quem já fez o <span className="text-cyan-300">perfil comportamental e o mapeamento</span>
        </h1>
        <p className="mt-4 max-w-[72ch] text-sm leading-relaxed text-gray-400">
          Mesma régua da home do RH. Mapeamento completo é ter o Top 5 do cargo inteiro avaliado; abaixo de cada linha,
          quantas pessoas estão em cada faixa (0 de 2, 1 de 2, ...) e o % sobre as pessoas daquela linha.
          O tamanho do Top 5 varia por cargo, então &ldquo;x de N&rdquo; só compara dentro do mesmo cargo.
          Fora: empresas de demonstração e o papel Admin da empresa. Medido em {medidoEm} (Brasília).
        </p>
        <div className="mt-6 flex flex-wrap gap-8">
          <Resumo valor={total} rotulo="pessoas" />
          <Resumo valor={disc} rotulo={`fizeram o perfil comportamental · ${pct(disc, total)}%`} />
          <Resumo valor={mapeamento} rotulo={`fizeram o mapeamento · ${pct(mapeamento, total)}%`} />
        </div>
        {algumIndisponivel && (
          <p className="mt-4 text-xs text-amber-300">
            Uma consulta falhou para alguma linha (marcada com ⚠). O número dela pode estar abaixo do real.
          </p>
        )}
        <nav aria-label="Recorte" className="mt-6 flex gap-2">
          {RECORTES.map((r) => (
            <Link
              key={r.valor}
              href={r.valor === 'empresa' ? '/admin/andamento' : `/admin/andamento?por=${r.valor}`}
              aria-current={por === r.valor ? 'page' : undefined}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                por === r.valor
                  ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-200'
                  : 'border-white/10 text-gray-400 hover:text-white'
              }`}
            >
              {r.rotulo}
            </Link>
          ))}
        </nav>
      </section>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead className="text-[10px] uppercase tracking-widest text-gray-500">
            <tr className="border-b border-white/10">
              <th className="px-4 py-3 font-bold">{por === 'cargo' ? 'Empresa / cargo' : por === 'turma' ? 'Empresa / turma' : 'Empresa'}</th>
              <th className="px-4 py-3 text-right font-bold">Pessoas</th>
              <th className="px-4 py-3 text-right font-bold">Perfil comportamental</th>
              <th className="px-4 py-3 text-right font-bold">Mapeamento</th>
              <th className="px-4 py-3 text-right font-bold">Em jornada</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <Fragment key={l.id}>
                <Linha rotulo={l.nome} dados={l} />
                {l.grupos.map((g) => (
                  <Linha key={g.rotulo} rotulo={g.rotulo} dados={g} sub />
                ))}
              </Fragment>
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

function Linha({ rotulo, dados, sub }: { rotulo: string; dados: AndamentoLinha; sub?: boolean }) {
  return (
    <>
      <tr className={sub ? 'border-t border-white/5' : 'border-t border-white/10'}>
        <td className={sub ? 'py-2 pl-9 pr-4 text-gray-200' : 'px-4 py-3 font-semibold text-white'}>
          {rotulo}{dados.indisponivel && <span title="consulta falhou"> ⚠</span>}
        </td>
        <td className="px-4 py-2 text-right tabular-nums">{dados.pessoas}</td>
        <Celula parte={dados.comPerfil} total={dados.pessoas} />
        <Celula parte={dados.comMapeamento} total={dados.pessoas} />
        <td className="px-4 py-2 text-right tabular-nums">{dados.emJornada}</td>
      </tr>
      <tr>
        <td colSpan={5} className={`pb-3 pr-4 text-[11px] text-gray-400 ${sub ? 'pl-9' : 'px-4'}`}>
          <span className="mr-2 text-gray-500">Mapeamento:</span>
          {dados.progressoMapeamento.map((f) => (
            <span key={`${f.feitas}/${f.total}`} className="mr-3 inline-block">
              {f.total === 0 ? 'sem Top 5 do cargo' : `${f.feitas} de ${f.total}`}:{' '}
              <b className="text-gray-200">{f.pessoas}</b>{' '}
              <span className="text-gray-500">({pct(f.pessoas, dados.pessoas)}%)</span>
            </span>
          ))}
        </td>
      </tr>
    </>
  );
}

function Celula({ parte, total }: { parte: number; total: number }) {
  return (
    <td className="px-4 py-2 text-right tabular-nums">
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
