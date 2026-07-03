'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw, Loader2, AlertTriangle } from 'lucide-react';
import BackButton from '@/components/back-button';
import { resetarDemoAcme } from '@/actions/demo';

/**
 * Reset sob demanda do tenant ACME Demo (para os vendedores prepararem uma
 * demo limpa na hora, sem esperar o reset noturno). Tenant-safe.
 */
export default function AdminDemoPage() {
  const [busy, setBusy] = useState(false);
  const [ultimo, setUltimo] = useState<Record<string, number | null> | null>(null);

  async function resetar() {
    if (!confirm('Resetar o ambiente ACME Demo ao estado inicial? Todos os dados de demonstração criados hoje serão apagados e recriados.')) return;
    setBusy(true);
    try {
      const r = await resetarDemoAcme();
      if (r.success) {
        setUltimo(r.counts || null);
        toast.success('Demo resetada ao estado inicial.');
      } else {
        toast.error(`Falha ao resetar: ${r.error || 'erro'}`);
      }
    } catch (e: any) {
      toast.error(`Erro: ${e?.message || 'inesperado'}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-[600px] mx-auto px-4 py-6 sm:px-6">
      <BackButton href="/admin/dashboard" />

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 mt-4">
        <h1 className="text-lg font-bold text-white mb-1">Ambiente de Demonstração</h1>
        <p className="text-xs text-gray-400 mb-4">
          Tenant <span className="font-mono text-cyan-400">acme-demo</span> — usado pelos vendedores nas demos.
          Envios reais (e-mail/WhatsApp) estão desligados neste ambiente.
        </p>

        <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3 mb-4 flex gap-2">
          <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-[11px] text-amber-200/80 leading-relaxed">
            O ambiente também é resetado automaticamente toda madrugada. Use o botão abaixo para
            preparar uma demo limpa AGORA, sem esperar. Só afeta o tenant de demonstração.
          </p>
        </div>

        <button onClick={resetar} disabled={busy}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-[#0C1829] font-bold text-sm disabled:opacity-50">
          {busy ? <><Loader2 size={16} className="animate-spin" /> Resetando…</> : <><RefreshCw size={16} /> Resetar demo agora</>}
        </button>

        {ultimo && (
          <div className="mt-4 rounded-lg bg-white/[0.03] p-3">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-2">Estado recriado</p>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(ultimo).map(([tabela, n]) => (
                <div key={tabela} className="text-center rounded bg-white/[0.04] p-2">
                  <p className="text-sm font-bold text-white">{n ?? '—'}</p>
                  <p className="text-[9px] text-gray-500">{tabela}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
