'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { EtapaTurma, PessoaTurma } from '../../../../../actions';

function pertenceAEtapa(pessoa: PessoaTurma, etapa: EtapaTurma) {
  switch (etapa) {
    case 'preparar': return true;
    case 'diagnostico': return !pessoa.avaliado;
    case 'pdi': return pessoa.avaliado && !pessoa.temPdi;
    case 'lancamento': return pessoa.temPdi && !pessoa.temTrilha;
    case 'acompanhamento': return pessoa.temTrilha && !pessoa.trilhaConcluida;
    case 'evolucao': return pessoa.trilhaConcluida;
  }
}

function tomDoEstado(pessoa: PessoaTurma) {
  if (pessoa.trilhaConcluida) return 'border-[#2ecc7140] bg-[#2ecc710c] text-[var(--success)]';
  if (pessoa.temTrilha) return 'border-[#b888e840] bg-[#b888e80c] text-[#d8b8f5]';
  if (pessoa.temPdi) return 'border-[#7ba7e040] bg-[#7ba7e00c] text-[#a9c8ed]';
  if (pessoa.avaliado) return 'border-[#34c5cc40] bg-[#34c5cc0c] text-[var(--cyan)]';
  if (pessoa.respondeu) return 'border-[#f4b74040] bg-[#f4b7400c] text-[var(--warning)]';
  return 'border-white/[0.1] bg-white/[0.025] text-[var(--ink-dim)]';
}

export default function PessoasDaEtapa({ pessoas, etapa }: { pessoas: PessoaTurma[]; etapa: EtapaTurma }) {
  const [busca, setBusca] = useState('');
  const [mostrarTodas, setMostrarTodas] = useState(false);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    return pessoas.filter((pessoa) => {
      const casaEtapa = mostrarTodas || pertenceAEtapa(pessoa, etapa);
      const casaBusca = !termo
        || pessoa.nome.toLocaleLowerCase('pt-BR').includes(termo)
        || pessoa.cargo?.toLocaleLowerCase('pt-BR').includes(termo)
        || pessoa.email?.toLocaleLowerCase('pt-BR').includes(termo);
      return casaEtapa && !!casaBusca;
    });
  }, [busca, etapa, mostrarTodas, pessoas]);

  const nestaEtapa = pessoas.filter((pessoa) => pertenceAEtapa(pessoa, etapa)).length;

  return (
    <section className="overflow-hidden rounded-[16px] border border-white/[0.08] bg-[var(--navy-card)]">
      <header className="flex flex-wrap items-center gap-2 border-b border-white/[0.07] bg-white/[0.018] p-3">
        <div className="mr-auto">
          <h2 className="text-[13px] font-semibold">Pessoas nesta etapa</h2>
          <p className="mt-0.5 font-[family-name:var(--font-manrope)] text-[9px] uppercase tracking-[0.1em] text-[var(--ink-faint)]">
            {nestaEtapa} de {pessoas.length} no recorte atual
          </p>
        </div>
        <label className="flex min-w-[210px] items-center gap-2 rounded-[10px] border border-white/[0.08] bg-[#06172c] px-3 py-1.5 focus-within:border-[#34c5cc55]">
          <Search size={13} className="text-[var(--ink-faint)]" />
          <input
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar pessoa ou cargo"
            className="min-w-0 flex-1 bg-transparent text-[11.5px] outline-none placeholder:text-[var(--ink-faint)]"
          />
        </label>
        <button
          type="button"
          aria-pressed={mostrarTodas}
          onClick={() => setMostrarTodas((valor) => !valor)}
          className={`rounded-[10px] border px-3 py-1.5 text-[10.5px] transition-colors ${mostrarTodas ? 'border-[#34c5cc50] bg-[#34c5cc0d] text-[var(--cyan)]' : 'border-white/[0.08] text-[var(--ink-dim)]'}`}
        >
          {mostrarTodas ? 'Só desta etapa' : 'Mostrar todas'}
        </button>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className="font-[family-name:var(--font-manrope)] text-[8.5px] font-bold uppercase tracking-[0.1em] text-[var(--ink-faint)]">
              <th className="border-b border-white/[0.06] px-4 py-2.5 text-left">Pessoa</th>
              <th className="border-b border-white/[0.06] px-4 py-2.5 text-left">Cargo</th>
              <th className="border-b border-white/[0.06] px-4 py-2.5 text-left">Estado</th>
              <th className="border-b border-white/[0.06] px-4 py-2.5 text-left">Próximo passo</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.slice(0, 120).map((pessoa) => (
              <tr key={pessoa.id} className="border-b border-white/[0.05] text-[11.5px] last:border-b-0 hover:bg-white/[0.018]">
                <td className="px-4 py-2.5">
                  <span className="block font-medium text-[var(--ink)]">{pessoa.nome}</span>
                  <span className="mt-0.5 block text-[9.5px] text-[var(--ink-faint)]">{pessoa.email || 'sem e-mail cadastrado'}</span>
                </td>
                <td className="px-4 py-2.5 text-[var(--ink-dim)]">{pessoa.cargo || '—'}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex rounded-full border px-2 py-1 font-[family-name:var(--font-manrope)] text-[8.5px] font-bold uppercase tracking-[0.08em] ${tomDoEstado(pessoa)}`}>
                    {pessoa.estado}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-medium text-[var(--cyan)]">{pessoa.proximoPasso}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtradas.length === 0 && (
        <div className="px-5 py-10 text-center text-[12px] text-[var(--ink-faint)]">
          Ninguém está neste recorte. Mostre todas as pessoas ou escolha outro momento do trilho.
        </div>
      )}
      {filtradas.length > 120 && (
        <div className="border-t border-white/[0.06] px-4 py-2 text-center font-[family-name:var(--font-manrope)] text-[9px] text-[var(--ink-faint)]">
          Mostrando 120 de {filtradas.length} pessoas. Refine a busca para localizar as demais.
        </div>
      )}
    </section>
  );
}
