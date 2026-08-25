'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw, Loader2, AlertTriangle, KeyRound, Copy, Check } from 'lucide-react';
import BackButton from '@/components/back-button';
import { useConfirm } from '@/components/admin/confirm-dialog';
import { prepararAcessosTemporariosDemo, resetarDemoAcme } from '@/actions/demo';

type AcessosDemo = {
  url: string;
  senha: string;
  acessos: Array<{ visao: string; nome: string; email: string }>;
};

/**
 * Preparo do tenant ACME Demo: recompõe os dados e rotaciona as credenciais
 * temporárias usadas por prospects. As duas operações são tenant-safe.
 */
export default function AdminDemoPage() {
  const confirmDialog = useConfirm();
  const [busy, setBusy] = useState(false);
  const [ultimo, setUltimo] = useState<Record<string, number | null> | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [credenciais, setCredenciais] = useState<AcessosDemo | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function resetar() {
    const ok = await confirmDialog({
      title: 'Resetar ambiente de demonstração',
      message: 'Resetar o ambiente ACME Demo ao estado inicial? Todos os dados de demonstração criados hoje serão apagados e recriados.',
      severity: 'danger',
      scopeNote: 'Só afeta o tenant acme-demo',
    });
    if (!ok) return;
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

  async function prepararAcessos() {
    const ok = await confirmDialog({
      title: 'Preparar acessos temporários',
      message: 'Gerar uma nova senha para Participante, Liderança e RH? A senha anterior dessas três contas deixará de funcionar.',
      severity: 'normal',
      scopeNote: 'Só altera as três contas do tenant acme-demo',
    });
    if (!ok) return;
    setPreparando(true);
    setCredenciais(null);
    try {
      const r = await prepararAcessosTemporariosDemo();
      if (!r.success) {
        toast.error(`Falha ao preparar acessos: ${r.error || 'erro'}`);
        return;
      }
      setCredenciais({ url: r.url, senha: r.senha, acessos: r.acessos });
      toast.success('Acessos temporários preparados.');
    } catch (e: any) {
      toast.error(`Erro: ${e?.message || 'inesperado'}`);
    } finally {
      setPreparando(false);
    }
  }

  async function copiarAcessos() {
    if (!credenciais) return;
    const linhas = [
      `Endereço: ${credenciais.url}`,
      ...credenciais.acessos.map((a) => `${a.visao}: ${a.email}`),
      `Senha temporária: ${credenciais.senha}`,
      '',
      'Para trocar de visão, use Sair e entre com o próximo e-mail.',
    ];
    try {
      await navigator.clipboard.writeText(linhas.join('\n'));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error('Não foi possível copiar. Selecione as credenciais manualmente.');
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

        <div className="my-5 border-t border-white/10" />

        <h2 className="text-sm font-bold text-white mb-1">Acesso para prospect</h2>
        <p className="text-[11px] text-gray-400 leading-relaxed mb-3">
          Prepara as contas de Participante, Liderança e RH com uma única senha temporária.
          A senha só aparece aqui e não entra no log de auditoria.
        </p>
        <button onClick={prepararAcessos} disabled={preparando || busy}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-cyan-400/30 bg-cyan-400/[0.08] text-cyan-300 font-bold text-sm disabled:opacity-50">
          {preparando ? <><Loader2 size={16} className="animate-spin" /> Preparando…</> : <><KeyRound size={16} /> Preparar acessos temporários</>}
        </button>

        {credenciais && (
          <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] p-4">
            <div className="space-y-1 text-[11px] text-white/70">
              <p><span className="text-white/40">Endereço:</span> {credenciais.url}</p>
              {credenciais.acessos.map((a) => (
                <p key={a.email}><span className="text-white/40">{a.visao}:</span> {a.email}</p>
              ))}
              <p className="pt-1"><span className="text-white/40">Senha:</span> <span className="font-mono text-emerald-300">{credenciais.senha}</span></p>
            </div>
            <button onClick={copiarAcessos}
              className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-white/[0.06] text-white/80 text-xs font-bold hover:bg-white/[0.1]">
              {copiado ? <><Check size={14} className="text-emerald-400" /> Copiado</> : <><Copy size={14} /> Copiar acessos</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
