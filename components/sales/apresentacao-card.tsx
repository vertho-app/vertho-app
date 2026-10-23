'use client';

// Bloco da apresentação personalizada na oportunidade (decisão de 23/10/2026).
// O RC confirma o contexto que o cliente vai ler (a necessidade identificada é
// nota interna e vem só como sugestão), gera o link e acompanha as aberturas.
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, ExternalLink, Loader2, Presentation } from 'lucide-react';
import {
  gerarApresentacao, getApresentacaoDaOportunidade, revogarApresentacao, type ApresentacaoDoRc,
} from '@/actions/sales/apresentacoes';
import { useConfirm } from '@/components/admin/confirm-dialog';
import { CONTEXTO_MAX } from '@/lib/sales/apresentacao';
import { fmtDateTime } from '@/lib/sales/formatters';

export default function ApresentacaoCard({ opportunityId, podeGerar }: { opportunityId: string; podeGerar: boolean }) {
  const confirm = useConfirm();
  const [apresentacao, setApresentacao] = useState<ApresentacaoDoRc | null>(null);
  const [contexto, setContexto] = useState('');
  const [editando, setEditando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const r = await getApresentacaoDaOportunidade(opportunityId);
    setCarregando(false);
    if (!r.success) { toast.error(r.error); return; }
    setApresentacao(r.apresentacao);
    setContexto(r.apresentacao?.contexto ?? r.sugestaoDeContexto ?? '');
  }, [opportunityId]);

  useEffect(() => { carregar(); }, [carregar]);

  const link = apresentacao && typeof window !== 'undefined' ? `${window.location.origin}/apresentacao/${apresentacao.token}` : '';

  async function gerar() {
    setSalvando(true);
    const r = await gerarApresentacao(opportunityId, { contexto });
    setSalvando(false);
    if (!r.success) { toast.error(r.error); return; }
    toast.success(r.novo ? 'Apresentação gerada' : 'Apresentação atualizada: o link continua o mesmo');
    setEditando(false);
    await carregar();
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copiado');
    } catch {
      toast.error('Não deu para copiar: selecione o link e copie à mão');
    }
  }

  async function desativar() {
    if (!apresentacao) return;
    const ok = await confirm({
      title: 'Desativar a apresentação',
      message: 'O link para de abrir para quem já o recebeu. Você pode gerar outro depois.',
      severity: 'danger',
      confirmLabel: 'Desativar',
    });
    if (!ok) return;
    const r = await revogarApresentacao(apresentacao.id);
    if (!r.success) { toast.error(r.error); return; }
    toast.success('Apresentação desativada');
    await carregar();
  }

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2 flex items-center gap-1.5">
        <Presentation size={12} /> Apresentação
      </h3>
      {carregando ? (
        <Loader2 size={14} className="animate-spin text-cyan-400" />
      ) : apresentacao && !editando ? (
        <div className="space-y-2">
          <input readOnly value={link} onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-lg px-2 py-1.5 text-[11px] text-gray-300 bg-white/5 border border-white/10" />
          <div className="flex flex-wrap gap-1.5">
            <button onClick={copiar} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10">
              <Copy size={11} /> Copiar
            </button>
            <a href={link} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-gray-300 border border-white/10 hover:bg-white/5">
              <ExternalLink size={11} /> Abrir
            </a>
            {podeGerar && (
              <button onClick={() => setEditando(true)} className="px-2 py-1 rounded-lg text-[11px] font-bold text-gray-300 border border-white/10 hover:bg-white/5">
                Editar contexto
              </button>
            )}
            <button onClick={desativar} className="px-2 py-1 rounded-lg text-[11px] font-bold text-red-300 border border-red-400/30 hover:bg-red-400/10">
              Desativar
            </button>
          </div>
          <p className="text-[10px] text-gray-500">
            {apresentacao.view_count
              ? `Aberta ${apresentacao.view_count} ${apresentacao.view_count === 1 ? 'vez' : 'vezes'}${apresentacao.last_viewed_at ? `, a última em ${fmtDateTime(apresentacao.last_viewed_at)}` : ''}.`
              : 'Ainda não foi aberta.'}
          </p>
        </div>
      ) : podeGerar ? (
        <div className="space-y-2">
          <p className="text-[11px] text-gray-500">
            A página conta a vertho.ai no segmento do cliente, com o nome dele e o seu contato, sem preço. Confira o contexto: é o texto que o cliente vai ler.
          </p>
          <textarea value={contexto} onChange={(e) => setContexto(e.target.value.slice(0, CONTEXTO_MAX))} rows={4}
            placeholder="O que vocês conversaram: o desafio da escola ou da empresa, em linguagem para o cliente"
            className="w-full rounded-lg px-2 py-1.5 text-xs text-white outline-none bg-white/5 border border-white/10 focus:border-cyan-400/60" />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-gray-600">{contexto.length}/{CONTEXTO_MAX}</span>
            <div className="flex gap-1.5">
              {apresentacao && (
                <button onClick={() => setEditando(false)} className="px-2 py-1 rounded-lg text-[11px] font-bold text-gray-400 border border-white/10">Cancelar</button>
              )}
              <button onClick={gerar} disabled={salvando}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-[#04121F] bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50">
                {salvando && <Loader2 size={11} className="animate-spin" />} {apresentacao ? 'Salvar' : 'Gerar apresentação'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-500">Sem apresentação.</p>
      )}
    </div>
  );
}
