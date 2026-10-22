'use client';

// Fila de validação do registro de oportunidades (contrato do RC, 7.1 a 7.5).
// Validar atribui a oportunidade ao RC e começa os 90 dias de proteção; recusar
// tira a oportunidade do funil, e o RC lê o motivo.
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Check, Loader2, X } from 'lucide-react';
import { recusarRegistroOportunidade, validarRegistroOportunidade } from '@/actions/sales/opportunities';
import { useConfirm } from '@/components/admin/confirm-dialog';
import { ORIGIN_LABELS } from '@/lib/sales/constants';
import { fmtDate } from '@/lib/sales/formatters';

export type PendingRegistrationRow = {
  id: string;
  nome: string;
  repName: string;
  cliente: string;
  cnpj: string | null;
  cidade: string | null;
  contato: string | null;
  origem: string | null;
  necessidade: string | null;
  evidencia: string | null;
  created_at: string;
  outrosRcs: string[];
};

const CAMPO_CLS = 'mt-1 w-full rounded-lg px-3 py-2 text-sm text-white outline-none resize-none';
const CAMPO_STYLE = { background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.14)' };

export default function PendingRegistrationsTable({ rows, onDone }: { rows: PendingRegistrationRow[]; onDone: () => void }) {
  const confirm = useConfirm();
  const [busyId, setBusyId] = useState<string | null>(null);
  const textoRef = useRef<HTMLTextAreaElement>(null);

  async function validar(r: PendingRegistrationRow) {
    const ok = await confirm({
      title: 'Validar o registro',
      message: (
        <div>
          <p>
            <b className="text-white">{r.cliente}</b> passa a ser oportunidade atribuída a {r.repName}, com
            proteção de 90 dias a partir de hoje.
          </p>
          <label className="block mt-3 text-[11px] text-gray-400">
            Observação para o representante (opcional)
            <textarea ref={textoRef} rows={2} className={CAMPO_CLS} style={CAMPO_STYLE} />
          </label>
        </div>
      ),
      severity: 'normal',
      confirmLabel: 'Validar',
    });
    if (!ok) return;
    setBusyId(r.id);
    const res = await validarRegistroOportunidade(r.id, textoRef.current?.value?.trim() || undefined);
    setBusyId(null);
    if (!res.success) { toast.error(res.error || 'Falha ao validar'); return; }
    toast.success(`Registro validado: proteção até ${fmtDate(res.protecaoAte)}`);
    onDone();
  }

  async function recusar(r: PendingRegistrationRow) {
    const ok = await confirm({
      title: 'Recusar o registro',
      message: (
        <div>
          <p>A oportunidade sai do funil de {r.repName} e não gera comissão. O representante lê o motivo.</p>
          <label className="block mt-3 text-[11px] text-gray-400">
            Motivo (obrigatório)
            <textarea
              ref={textoRef}
              rows={3}
              className={CAMPO_CLS}
              style={CAMPO_STYLE}
              placeholder="Ex.: cliente já em negociação direta com a vertho.ai (cláusula 7.3)"
            />
          </label>
        </div>
      ),
      severity: 'danger',
      confirmLabel: 'Recusar registro',
      cancelLabel: 'Voltar',
    });
    if (!ok) return;
    const motivo = textoRef.current?.value?.trim() || '';
    if (!motivo) { toast.error('Informe o motivo da recusa'); return; }
    setBusyId(r.id);
    const res = await recusarRegistroOportunidade(r.id, motivo);
    setBusyId(null);
    if (!res.success) { toast.error(res.error || 'Falha ao recusar'); return; }
    toast.success('Registro recusado');
    onDone();
  }

  if (rows.length === 0) {
    return (
      <p className="text-xs text-gray-500 py-4 text-center rounded-xl bg-white/[0.03] border border-white/10">
        Nenhum registro aguardando validação.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="rounded-xl bg-white/[0.03] border border-amber-400/20 p-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">{r.cliente}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {r.nome} · {r.repName} · registrada em {fmtDate(r.created_at)}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {busyId === r.id ? (
                <Loader2 size={14} className="animate-spin text-cyan-400" />
              ) : (
                <>
                  <button
                    onClick={() => validar(r)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-emerald-400 border border-emerald-400/30 hover:bg-emerald-400/10"
                  >
                    <Check size={12} /> Validar
                  </button>
                  <button
                    onClick={() => recusar(r)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-red-400 border border-red-400/30 hover:bg-red-400/10"
                  >
                    <X size={12} /> Recusar
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="mt-2 grid gap-x-4 gap-y-1 text-[11px] sm:grid-cols-2">
            <p className="text-gray-400">CNPJ: <span className="text-gray-200">{r.cnpj || 'não informado'}</span></p>
            <p className="text-gray-400">Cidade: <span className="text-gray-200">{r.cidade || '—'}</span></p>
            <p className="text-gray-400">Contato: <span className="text-gray-200">{r.contato || 'não informado'}</span></p>
            <p className="text-gray-400">Origem: <span className="text-gray-200">{r.origem ? (ORIGIN_LABELS[r.origem] || r.origem) : '—'}</span></p>
          </div>
          {r.necessidade && <p className="mt-1.5 text-[11px] text-gray-400">Necessidade: <span className="text-gray-200">{r.necessidade}</span></p>}
          {r.evidencia && <p className="mt-1 text-[11px] text-gray-400">Evidência de interação: <span className="text-gray-200">{r.evidencia}</span></p>}
          {r.outrosRcs.length > 0 && (
            <p className="mt-2 rounded-lg px-2.5 py-1.5 text-[11px] bg-amber-500/10 border border-amber-500/25 text-amber-200">
              A mesma instituição já está com: {r.outrosRcs.join(', ')}. Vale o primeiro registro válido (cláusula 7.4).
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
