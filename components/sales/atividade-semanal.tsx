'use client';

// Atividade semanal dos RCs, só no /admin/comercial (decisão de 23/10/2026).
// Acompanhamento, não meta: o representante autônomo organiza o próprio
// trabalho (contrato, 9.2 e 9.4), e ele não vê este painel.
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getAtividadeSemanal, type AtividadeDoRc } from '@/actions/sales/atividade';
import { fmtDia } from '@/lib/sales/formatters';

const ddmm = (iso: string) => iso.slice(5, 10).split('-').reverse().join('/');

export default function AtividadeSemanal() {
  const [linhas, setLinhas] = useState<AtividadeDoRc[] | null>(null);
  const [inicios, setInicios] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const r = await getAtividadeSemanal(4);
      if (!vivo) return;
      if (r.success) { setLinhas(r.linhas); setInicios(r.inicios); } else setErro(r.error);
    })();
    return () => { vivo = false; };
  }, []);

  if (erro) return <p className="text-xs text-red-300">{erro}</p>;
  if (!linhas) return <div className="py-6 flex justify-center"><Loader2 size={18} className="animate-spin text-cyan-400" /></div>;
  const visiveis = linhas.filter((l) => l.status !== 'inactive');
  if (!visiveis.length) return <p className="text-xs text-gray-500 py-4 text-center rounded-xl bg-white/[0.03] border border-white/10">Nenhum representante ativo.</p>;

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/10 overflow-x-auto">
      <table className="w-full text-xs min-w-[720px]">
        <thead className="bg-white/[0.04]">
          <tr className="text-left text-[10px] uppercase text-gray-500">
            <th className="px-3 py-2">Representante</th>
            {inicios.map((i, k) => (
              <th key={i} className="px-3 py-2">{k === inicios.length - 1 ? 'Esta semana' : `Semana de ${ddmm(i)}`}</th>
            ))}
            <th className="px-3 py-2 text-right">Última movimentação</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {visiveis.map((l) => (
            <tr key={l.representanteId}>
              <td className="px-3 py-2 font-semibold text-white">{l.nome}</td>
              {l.semanas.map((s) => {
                const vazia = !s.contatos && !s.registros && !s.mudancasDeEstagio && !s.propostasCriadas && !s.propostasEnviadas;
                return (
                  <td key={s.inicio} className={`px-3 py-2 ${vazia ? 'text-gray-600' : 'text-gray-300'}`}>
                    {vazia ? 'sem registro' : (
                      <span className="leading-relaxed">
                        {s.contatos} contato{s.contatos === 1 ? '' : 's'} · {s.registros} registro{s.registros === 1 ? '' : 's'}
                        <br />
                        {s.mudancasDeEstagio} estágio{s.mudancasDeEstagio === 1 ? '' : 's'} · {s.propostasCriadas} proposta{s.propostasCriadas === 1 ? '' : 's'} ({s.propostasEnviadas} enviada{s.propostasEnviadas === 1 ? '' : 's'})
                      </span>
                    )}
                  </td>
                );
              })}
              <td className="px-3 py-2 text-right text-gray-400">{l.ultimaMovimentacao ? fmtDia(l.ultimaMovimentacao) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
