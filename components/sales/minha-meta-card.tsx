'use client';

// Portal do RC: a meta do período (Anexo IV) e a provisão da indenização sobre
// as comissões pagas (cláusula 19). A ajuda de custo entra na base da
// indenização (19.3), mas o valor dela fica só com o admin.
import { useEffect, useState } from 'react';
import { Loader2, Target } from 'lucide-react';
import { getMinhaMeta } from '@/actions/sales/metas';
import MetaProgresso from '@/components/sales/meta-progresso';
import { fmtBRL } from '@/lib/sales/formatters';

type Dados = Extract<Awaited<ReturnType<typeof getMinhaMeta>>, { success: true }>;

export default function MinhaMetaCard() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const r = await getMinhaMeta();
      if (!vivo) return;
      if (r.success) setDados(r); else setErro(r.error);
    })();
    return () => { vivo = false; };
  }, []);

  if (erro) return <p className="mb-4 text-xs text-red-300">{erro}</p>;
  if (!dados) return <div className="mb-4 py-4 flex justify-center"><Loader2 size={16} className="animate-spin text-cyan-400" /></div>;

  return (
    <div className="mb-4 grid gap-3 lg:grid-cols-[2fr_1fr]">
      <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-3 flex items-center gap-1.5">
          <Target size={12} /> Meta do período
        </h2>
        {dados.progresso
          ? <MetaProgresso progresso={dados.progresso} pipelineAtual={dados.pipelineQualificadoAtual} />
          : <p className="text-xs text-gray-500">A meta do seu período ainda não foi registrada pela vertho.ai (Anexo IV do contrato).</p>}
      </div>
      <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-3">Provisão de indenização</h2>
        <p className="text-xl font-bold text-white">{fmtBRL(dados.provisaoSobreComissoes)}</p>
        <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
          1/12 das comissões pagas até hoje (Lei 4.886/65, art. 27, j; cláusula 19). A ajuda de custo fixa também entra na base, e o valor é atualizado na apuração.
        </p>
      </div>
    </div>
  );
}
