'use client';

// Metas (Anexo IV), ajuda de custo e provisão da indenização (cláusula 19) de
// cada RC. Só o admin: o RC vê a própria meta e a provisão sobre as comissões
// no portal, nunca a ajuda de custo (decisão do dono de 23/10/2026).
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Target } from 'lucide-react';
import { getMetasAdmin, salvarMeta, salvarRemuneracao, type LinhaMetasAdmin } from '@/actions/sales/metas';
import AdminPageHeader from '@/components/admin/page-header';
import MetaProgresso from '@/components/sales/meta-progresso';
import { COMPENSATION_MODEL_LABELS, type CompensationModel } from '@/lib/sales/constants';
import { fmtBRL, fmtDate } from '@/lib/sales/formatters';

const INPUT = 'w-full rounded-lg px-2.5 py-1.5 text-xs text-white outline-none bg-white/5 border border-white/10 focus:border-cyan-400/60';

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return <label className="block text-[10px] text-gray-400">{rotulo}<div className="mt-1">{children}</div></label>;
}

function FormMeta({ linha, onSalvo }: { linha: LinhaMetasAdmin; onSalvo: () => void }) {
  const m = linha.meta;
  const [f, setF] = useState({
    periodoInicio: m?.periodo_inicio ?? linha.remuneracao?.contrato_inicio ?? '',
    metaAnual: m?.meta_anual?.toString() ?? '',
    marcoT1: m?.marco_t1?.toString() ?? '',
    marcoT2: m?.marco_t2?.toString() ?? '',
    marcoT3: m?.marco_t3?.toString() ?? '',
    ativacaoPipeline: m?.ativacao_pipeline?.toString() ?? '',
    primeiroContratoMeses: m?.primeiro_contrato_meses?.toString() ?? '',
  });
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function salvar() {
    setSalvando(true);
    const r = await salvarMeta({ representanteId: linha.representanteId, ...f });
    setSalvando(false);
    if (!r.success) { toast.error(r.error); return; }
    toast.success('Meta registrada');
    onSalvo();
  }

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-4">
        <Campo rotulo="Início do período (assinatura)"><input type="date" value={f.periodoInicio} onChange={set('periodoInicio')} className={INPUT} /></Campo>
        <Campo rotulo="Marco 1º trimestre (R$)"><input inputMode="decimal" value={f.marcoT1} onChange={set('marcoT1')} className={INPUT} /></Campo>
        <Campo rotulo="Marco 2º trimestre (R$)"><input inputMode="decimal" value={f.marcoT2} onChange={set('marcoT2')} className={INPUT} /></Campo>
        <Campo rotulo="Marco 3º trimestre (R$)"><input inputMode="decimal" value={f.marcoT3} onChange={set('marcoT3')} className={INPUT} /></Campo>
        <Campo rotulo="Meta anual = 4º trimestre (R$) *"><input inputMode="decimal" value={f.metaAnual} onChange={set('metaAnual')} className={INPUT} /></Campo>
        <Campo rotulo="Pipeline qualificado até o 90º dia (R$)"><input inputMode="decimal" value={f.ativacaoPipeline} onChange={set('ativacaoPipeline')} className={INPUT} /></Campo>
        <Campo rotulo="1º contrato em até (meses)"><input inputMode="numeric" value={f.primeiroContratoMeses} onChange={set('primeiroContratoMeses')} className={INPUT} /></Campo>
        <div className="flex items-end">
          <button onClick={salvar} disabled={salvando}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[#04121F] bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50">
            {salvando && <Loader2 size={12} className="animate-spin" />} Salvar meta
          </button>
        </div>
      </div>
      <p className="text-[10px] text-gray-500">Marcos acumulados desde o início do período. Depois que o período começa, a meta não muda (cláusula 9.10).</p>
    </div>
  );
}

function FormRemuneracao({ linha, onSalvo }: { linha: LinhaMetasAdmin; onSalvo: () => void }) {
  const [ajuda, setAjuda] = useState(linha.remuneracao?.ajuda_custo_mensal?.toString() ?? '');
  const [inicio, setInicio] = useState(linha.remuneracao?.contrato_inicio ?? '');
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    const r = await salvarRemuneracao({ representanteId: linha.representanteId, ajudaCustoMensal: ajuda, contratoInicio: inicio || null });
    setSalvando(false);
    if (!r.success) { toast.error(r.error); return; }
    toast.success('Remuneração registrada');
    onSalvo();
  }

  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-end">
      <Campo rotulo="Ajuda de custo mensal (R$)"><input inputMode="decimal" value={ajuda} onChange={(e) => setAjuda(e.target.value)} placeholder={linha.modelo === 'com_ajuda' ? 'valor do Anexo II' : 'sem ajuda neste modelo'} className={INPUT} /></Campo>
      <Campo rotulo="Início do contrato"><input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={INPUT} /></Campo>
      <button onClick={salvar} disabled={salvando}
        className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 disabled:opacity-50">
        {salvando && <Loader2 size={12} className="animate-spin" />} Salvar
      </button>
    </div>
  );
}

export default function MetasAdminPage() {
  const [linhas, setLinhas] = useState<LinhaMetasAdmin[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novoPeriodo, setNovoPeriodo] = useState<Record<string, boolean>>({});

  const carregar = useCallback(async () => {
    const r = await getMetasAdmin();
    if (r.success) { setLinhas(r.linhas); setErro(null); } else setErro(r.error);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div className="min-h-full text-white">
      <div className="max-w-6xl mx-auto p-6">
        <AdminPageHeader icon={Target} title="Metas e remuneração" subtitle="Anexo IV, ajuda de custo e provisão da indenização" backHref="/admin/comercial" />
        {erro && <p className="text-sm text-red-300">{erro}</p>}
        {!linhas && !erro && <div className="py-10 flex justify-center"><Loader2 size={20} className="animate-spin text-cyan-400" /></div>}
        <div className="space-y-4">
          {(linhas || []).filter((l) => l.status !== 'inactive').map((l) => (
            <section key={l.representanteId} className="rounded-xl bg-white/[0.03] border border-white/10 p-4 space-y-4">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <h2 className="text-sm font-bold">{l.nome}</h2>
                <span className="text-[11px] text-gray-400">{COMPENSATION_MODEL_LABELS[l.modelo as CompensationModel] ?? l.modelo}</span>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-2">Meta do período</p>
                {l.meta && l.progresso && !(l.editavel || novoPeriodo[l.representanteId]) ? (
                  <>
                    <MetaProgresso progresso={l.progresso} pipelineAtual={l.pipelineQualificadoAtual} />
                    <button onClick={() => setNovoPeriodo((p) => ({ ...p, [l.representanteId]: true }))} className="mt-2 text-[11px] font-bold text-cyan-400 hover:text-cyan-300">
                      Registrar a meta do próximo período
                    </button>
                  </>
                ) : (
                  <>
                    {l.meta && l.progresso && <div className="mb-3"><MetaProgresso progresso={l.progresso} pipelineAtual={l.pipelineQualificadoAtual} /></div>}
                    <FormMeta linha={novoPeriodo[l.representanteId] ? { ...l, meta: null } : l} onSalvo={() => { setNovoPeriodo((p) => ({ ...p, [l.representanteId]: false })); carregar(); }} />
                  </>
                )}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-2">Remuneração fixa (só o admin vê)</p>
                  <FormRemuneracao linha={l} onSalvo={carregar} />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-2">Provisão da indenização (1/12, cláusula 19)</p>
                  <p className="text-lg font-bold">{fmtBRL(l.provisao.provisao)}</p>
                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    Base {fmtBRL(l.provisao.base)}: comissões pagas {fmtBRL(l.provisao.comissoes)} + ajuda de custo {fmtBRL(l.provisao.ajudaDeCusto)}
                    {l.remuneracao?.contrato_inicio ? ` (meses completos desde ${fmtDate(l.remuneracao.contrato_inicio)})` : ' (sem início de contrato registrado)'}.
                    Nominal: a atualização monetária entra na apuração da rescisão.
                  </p>
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
