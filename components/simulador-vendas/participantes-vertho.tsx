'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchAuth } from '@/lib/auth/fetch-auth';
import { lerResposta } from '@/lib/simuladores/ler-resposta';
type Participante = {
  user_id: string;
  nome: string;
  tipo: string;
  ativo: boolean;
};
const endpoint = '/api/simulador-vendas/vertho/participantes';
export default function ParticipantesVertho() {
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [email, setEmail] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [salvo, setSalvo] = useState(false);
  async function consultar() {
    const r = await lerResposta(
      await fetchAuth(endpoint, { cache: 'no-store' }),
      {
        semCorpo: 'Resposta indisponível.',
        generica: 'Não foi possível consultar os participantes.',
      },
    );
    setParticipantes(r.participantes);
  }
  useEffect(() => {
    void consultar().catch((e) => setErro(e.message));
  }, []);
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setErro('');
    setSalvo(false);
    try {
      await lerResposta(
        await fetchAuth(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim().toLowerCase(), ativo }),
        }),
        {
          semCorpo: 'Resposta indisponível.',
          generica: 'Não foi possível salvar a liberação.',
        },
      );
      setSalvo(true);
      setEmail('');
      await consultar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setOcupado(false);
    }
  }
  return (
    <div className="max-w-4xl mx-auto p-6 text-white">
      <Link className="text-cyan-300" href="/admin/comercial/treinamento">
        ← Treinamento comercial
      </Link>
      <h1 className="text-2xl font-semibold mt-6">Acesso da equipe</h1>
      <p className="text-gray-400 mt-3">
        Cadastre o e-mail da conta confirmada de cada vendedor interno.
        Representantes ativos são vinculados no primeiro acesso. A suspensão no
        canal também bloqueia o treinamento.
      </p>
      <form
        onSubmit={salvar}
        className="mt-6 flex flex-wrap items-end gap-4 rounded-xl border border-white/10 p-5 bg-white/5"
      >
        <label className="flex-1 min-w-60">
          E-mail da conta
          <input
            type="email"
            required
            value={email}
            disabled={ocupado}
            onChange={(e) => setEmail(e.target.value)}
            className="block mt-2 w-full rounded border border-white/20 bg-[#091d35] px-3 py-2"
          />
        </label>
        <label>
          Acesso
          <select
            value={ativo ? 'ativo' : 'suspenso'}
            disabled={ocupado}
            onChange={(e) => setAtivo(e.target.value === 'ativo')}
            className="block mt-2 rounded border border-white/20 bg-[#091d35] px-3 py-2"
          >
            <option value="ativo">Liberado</option>
            <option value="suspenso">Suspenso</option>
          </select>
        </label>
        <button
          disabled={ocupado}
          className="px-4 py-2 rounded bg-cyan-300 text-slate-950 font-semibold"
        >
          {ocupado ? 'Salvando…' : 'Salvar acesso'}
        </button>
      </form>
      {erro && (
        <p role="alert" className="mt-4 text-red-300">
          {erro}
        </p>
      )}
      {salvo && (
        <p role="status" className="mt-4 text-cyan-300">
          Acesso atualizado. O histórico permanece na conta individual.
        </p>
      )}
      <ul className="mt-6 divide-y divide-white/10">
        {participantes.map((p) => (
          <li
            key={p.user_id}
            className="py-4 flex flex-wrap gap-3 justify-between"
          >
            <span>
              {p.nome}{' '}
              <span className="text-gray-400">
                · {p.tipo === 'interno' ? 'Equipe interna' : 'Representante'}
              </span>
            </span>
            <span className={p.ativo ? 'text-cyan-300' : 'text-gray-400'}>
              {p.ativo ? 'Liberado no treinamento' : 'Suspenso no treinamento'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
