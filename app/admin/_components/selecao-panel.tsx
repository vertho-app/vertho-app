'use client';
/**
 * Módulo de SELEÇÃO — lista as VAGAS abertas da empresa (cargos_empresa com eh_vaga=true,
 * criadas pela tela de extração). Separado dos cargos operacionais. Mostra status
 * (descrição / gabarito) e leva à criação de nova vaga (tela de extração).
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Briefcase, Plus, FileText, Check, Clock, Crown } from 'lucide-react';
import { listarVagas } from '@/actions/cargo-extracao';

const fmtData = (iso: string | null) => { if (!iso) return ''; const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}`; };

export default function SelecaoPanel({ empresaId }: { empresaId: string }) {
  const [vagas, setVagas] = useState<any[] | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => { listarVagas(empresaId).then((r) => { setVagas(r.vagas); if (r.erro) setErro(r.erro); }); }, [empresaId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400 max-w-[520px]">Vagas abertas para recrutamento — perfis a preencher, sem colaboradores associados. Separadas dos cargos operacionais (Colaboradores &amp; Cargos).</p>
        <Link href={`/admin/empresas/${empresaId}/extracao-cargo`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-400/40 bg-brand-500/10 text-brand-200 hover:bg-brand-500/20 text-sm shrink-0">
          <Plus size={14} /> Nova vaga
        </Link>
      </div>

      {vagas === null && <div className="flex justify-center py-12"><Loader2 className="animate-spin text-brand-400" /></div>}
      {erro && <p className="text-xs text-amber-400">{erro}</p>}

      {vagas && vagas.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center">
          <Briefcase size={28} className="text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-300 mb-1">Nenhuma vaga aberta ainda.</p>
          <p className="text-xs text-slate-500 mb-4">Crie uma vaga extraindo a descrição de um documento (cole o texto ou envie um PDF).</p>
          <Link href={`/admin/empresas/${empresaId}/extracao-cargo`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-400/40 bg-brand-500/10 text-brand-200 hover:bg-brand-500/20 text-sm">
            <Plus size={14} /> Criar primeira vaga
          </Link>
        </div>
      )}

      {vagas && vagas.length > 0 && (
        <div className="space-y-2">
          {vagas.map((v) => (
            <div key={v.id} className="flex items-center gap-3 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
              <div className="w-9 h-9 rounded-lg bg-brand-500/10 flex items-center justify-center shrink-0"><Briefcase size={16} className="text-brand-300" /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-white truncate">{v.nome}</span>
                  {v.ehLideranca && <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-300"><Crown size={9} /> liderança</span>}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">{v.area || 'sem área'}{v.criadaEm ? ` · aberta em ${fmtData(v.criadaEm)}` : ''}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded ${v.temDescricao ? 'bg-emerald-400/10 text-emerald-300' : 'bg-white/5 text-slate-500'}`}>
                  {v.temDescricao ? <Check size={10} /> : <Clock size={10} />} Descrição
                </span>
                <span className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded ${v.temGabarito ? 'bg-emerald-400/10 text-emerald-300' : 'bg-white/5 text-slate-500'}`}>
                  {v.temGabarito ? <Check size={10} /> : <Clock size={10} />} Gabarito
                </span>
                <Link href={`/admin/empresas/${empresaId}/extracao-cargo`} className="text-[11px] text-brand-300 hover:text-brand-200 flex items-center gap-1"><FileText size={11} /> editar</Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {vagas && vagas.length > 0 && (
        <p className="text-[10px] text-slate-500">Avaliar candidatos contra a vaga (ranking de aderência) vem na próxima etapa do módulo.</p>
      )}
    </div>
  );
}
