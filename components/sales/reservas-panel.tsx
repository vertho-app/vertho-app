'use client';

// Lista de reserva da vertho.ai (contrato do RC v6, 7.3). Registro de RC com o
// mesmo CNPJ básico ou INEP não é aceito na hora: vai para a fila de validação.
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { adicionarReserva, listarReservas, removerReserva, type ReservaRow } from '@/actions/sales/reservas';
import { useConfirm } from '@/components/admin/confirm-dialog';
import { fmtDate } from '@/lib/sales/formatters';

const INPUT_CLS = 'w-full rounded-lg px-3 py-2 text-xs text-white outline-none bg-white/5 border border-white/10 focus:border-cyan-400/60 placeholder:text-gray-600';
const VAZIO = { nome: '', cnpj: '', codigoInep: '', motivo: '' };

export default function ReservasPanel() {
  const confirm = useConfirm();
  const [rows, setRows] = useState<ReservaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState(VAZIO);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const r = await listarReservas();
    if (r.success) { setRows(r.data); setErro(null); } else setErro(r.error);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function adicionar() {
    setSalvando(true);
    const r = await adicionarReserva(form);
    setSalvando(false);
    if (!r.success) { toast.error(r.error); return; }
    toast.success('Cliente reservado');
    setForm(VAZIO);
    await carregar();
  }

  async function remover(row: ReservaRow) {
    const ok = await confirm({
      title: 'Tirar da lista de reserva',
      message: <>O registro de <b className="text-white">{row.nome}</b> por um representante passa a ser aceito na hora, se o cliente estiver livre.</>,
      severity: 'danger',
      confirmLabel: 'Tirar da reserva',
    });
    if (!ok) return;
    const r = await removerReserva(row.id);
    if (!r.success) { toast.error(r.error); return; }
    toast.success('Reserva removida');
    await carregar();
  }

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
      <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr_0.8fr_1.4fr_auto]">
        <input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Cliente" className={INPUT_CLS} />
        <input value={form.cnpj} onChange={(e) => setForm((f) => ({ ...f, cnpj: e.target.value }))} placeholder="CNPJ (ou 8 primeiras posições)" className={INPUT_CLS} />
        <input value={form.codigoInep} inputMode="numeric" maxLength={9} onChange={(e) => setForm((f) => ({ ...f, codigoInep: e.target.value.replace(/\D/g, '') }))} placeholder="INEP" className={INPUT_CLS} />
        <input value={form.motivo} onChange={(e) => setForm((f) => ({ ...f, motivo: e.target.value }))} placeholder="Motivo (cliente, lead próprio, negociação)" className={INPUT_CLS} />
        <button
          onClick={adicionar}
          disabled={salvando || !form.nome.trim() || (!form.cnpj.trim() && !form.codigoInep.trim())}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 disabled:opacity-50"
        >
          {salvando ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Reservar
        </button>
      </div>

      {loading ? (
        <div className="py-6 flex justify-center"><Loader2 size={18} className="animate-spin text-cyan-400" /></div>
      ) : erro ? (
        <p className="mt-3 text-xs text-red-300">{erro}</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-xs text-gray-500">Nenhum cliente reservado.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs min-w-[560px]">
            <thead>
              <tr className="text-left text-[10px] uppercase text-gray-500">
                <th className="px-2 py-1.5">Cliente</th>
                <th className="px-2 py-1.5">CNPJ básico</th>
                <th className="px-2 py-1.5">INEP</th>
                <th className="px-2 py-1.5">Motivo</th>
                <th className="px-2 py-1.5">Desde</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-2 py-2 font-semibold text-white">{r.nome}</td>
                  <td className="px-2 py-2 text-gray-300 tabular-nums">{r.cnpj_raiz || '—'}</td>
                  <td className="px-2 py-2 text-gray-300 tabular-nums">{r.codigo_inep || '—'}</td>
                  <td className="px-2 py-2 text-gray-400">{r.motivo || '—'}</td>
                  <td className="px-2 py-2 text-gray-400" title={r.criado_por || undefined}>{fmtDate(r.criado_em)}</td>
                  <td className="px-2 py-2 text-right">
                    <button onClick={() => remover(r)} className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-400/10" aria-label={`Tirar ${r.nome} da reserva`}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
