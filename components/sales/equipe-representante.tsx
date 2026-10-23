'use client';

// Equipe do representante (contrato v6, 21.4): logins de integrantes que operam
// o mesmo portal. A comissão, a carteira e a proteção são do representante; o
// que cada integrante faz sai assinado com o e-mail dele.
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus } from 'lucide-react';
import { adicionarIntegrante, desativarIntegrante, listarEquipe, type IntegranteRow } from '@/actions/sales/representatives';
import { useConfirm } from '@/components/admin/confirm-dialog';

const INPUT = 'rounded-lg px-2.5 py-1.5 text-xs text-white outline-none bg-white/5 border border-white/10 focus:border-cyan-400/60';

export default function EquipeRepresentante({ repId, repNome }: { repId: string; repNome: string }) {
  const confirm = useConfirm();
  const [equipe, setEquipe] = useState<IntegranteRow[] | null>(null);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const r = await listarEquipe(repId);
    if (r.success) setEquipe(r.data); else toast.error(r.error);
  }, [repId]);
  useEffect(() => { carregar(); }, [carregar]);

  async function adicionar() {
    setSalvando(true);
    const r = await adicionarIntegrante(repId, { name: nome, email });
    setSalvando(false);
    if (!r.success) { toast.error(r.error); return; }
    toast.success('Integrante com acesso ao portal');
    setNome(''); setEmail('');
    await carregar();
  }

  async function desativar(i: IntegranteRow) {
    const ok = await confirm({
      title: 'Tirar o acesso',
      message: `${i.name} deixa de entrar no portal de ${repNome}. O que já fez fica no histórico.`,
      severity: 'danger',
      confirmLabel: 'Tirar o acesso',
    });
    if (!ok) return;
    const r = await desativarIntegrante(i.id);
    if (!r.success) { toast.error(r.error); return; }
    toast.success('Acesso retirado');
    await carregar();
  }

  return (
    <div className="space-y-2 py-1">
      <p className="text-[11px] text-gray-500">
        Equipe de {repNome} (cláusula 21.4): cada integrante entra com o próprio e-mail e opera o mesmo portal, inclusive comissões. A comissão é do representante.
      </p>
      {!equipe ? (
        <Loader2 size={14} className="animate-spin text-cyan-400" />
      ) : equipe.length === 0 ? (
        <p className="text-[11px] text-gray-500">Sem integrantes.</p>
      ) : (
        <ul className="space-y-1">
          {equipe.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2 text-xs">
              <span className={i.status === 'active' ? 'text-gray-200' : 'text-gray-600 line-through'}>{i.name} · {i.email}</span>
              {i.status === 'active' && (
                <button onClick={() => desativar(i)} className="text-[11px] font-bold text-red-300 hover:text-red-200">Tirar o acesso</button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome" className={INPUT} />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e-mail" className={INPUT} />
        <button onClick={adicionar} disabled={salvando || !nome.trim() || !email.trim()}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 disabled:opacity-50">
          {salvando ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Dar acesso
        </button>
      </div>
    </div>
  );
}
