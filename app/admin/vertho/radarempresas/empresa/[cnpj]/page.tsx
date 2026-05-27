'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, Building2, MapPin, Phone, Mail, Target, AlertTriangle } from 'lucide-react';
import BackButton from '@/components/back-button';
import { getFichaEmpresa } from '@/actions/radarempresas/busca';
import { RadarScoreCard } from '@/components/radarempresas/RadarScoreCard';
import { RADAR_DISCLAIMER } from '@/lib/radarempresas/segmentos';

const PORTES: Record<string, string> = { '01': 'Microempresa (ME)', '03': 'EPP', '05': 'Demais', '00': 'Não informado' };
const fmtBrl = (n: number | null, locale: string) => n == null ? '—' : new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Math.round(n));

export default function FichaEmpresaPage({ params }: { params: Promise<{ cnpj: string }> }) {
  const { cnpj } = use(params);
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('AdminCompanyRadarCompany');
  const [state, setState] = useState<{ tag: 'loading' } | { tag: 'error'; msg: string } | { tag: 'ok'; data: any }>({ tag: 'loading' });

  useEffect(() => {
    getFichaEmpresa(cnpj).then(r => {
      if (!r.ok) setState({ tag: 'error', msg: r.error });
      else setState({ tag: 'ok', data: r });
    });
  }, [cnpj]);

  if (state.tag === 'loading') return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;
  if (state.tag === 'error') return (
    <div className="max-w-md mx-auto px-5 py-10 text-center">
      <p className="text-sm text-red-400 mb-4">{state.msg}</p>
      <button onClick={() => router.back()} className="px-4 py-2 rounded-lg text-xs font-bold text-white border border-white/20">{t('back')}</button>
    </div>
  );

  const { estabelecimento: e, empresa: emp, score, segmento, insight } = state.data;
  const expl = score?.score_explanation;

  return (
    <div className="max-w-[1000px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      <BackButton href="/admin/vertho/radarempresas" />
      <div className="flex items-center gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">{e.nome_fantasia || emp?.razao_social || '—'}</h1>
          <p className="text-xs text-gray-500">{e.cnpj_completo} · {e.municipio_nome}/{e.uf}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Identificação */}
        <div className="rounded-xl border border-white/[0.06] p-5 space-y-2" style={{ background: '#0F2A4A' }}>
          <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1"><Building2 size={12} /> {t('sections.identification')}</p>
          <Linha l={t('fields.legalName')} v={emp?.razao_social} />
          <Linha l={t('fields.tradeName')} v={e.nome_fantasia} />
          <Linha l={t('fields.branch')} v={e.is_matriz ? t('values.headquarters') : t('values.branch')} />
          <Linha l={t('fields.size')} v={emp?.porte_empresa ? PORTES[emp.porte_empresa] : '—'} />
          <Linha l={t('fields.capital')} v={fmtBrl(emp?.capital_social ?? null, locale)} />
          <Linha l={t('fields.age')} v={e.company_age_years != null ? t('values.years', { count: e.company_age_years }) : '—'} />
          <Linha l={t('fields.cnae')} v={`${e.cnae_principal || '—'} ${e.cnae_principal_desc ? '· ' + e.cnae_principal_desc : ''}`} />
          <Linha l={t('fields.status')} v={e.situacao_cadastral === '02' ? t('values.active') : e.situacao_cadastral} />
        </div>

        {/* Contato + Segmento */}
        <div className="space-y-4">
          <div className="rounded-xl border border-white/[0.06] p-5 space-y-2" style={{ background: '#0F2A4A' }}>
            <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1"><MapPin size={12} /> {t('sections.contact')}</p>
            <Linha l="Email" v={e.email} icon={<Mail size={11} />} />
            <Linha l={t('fields.phone1')} v={e.telefone_1} icon={<Phone size={11} />} />
            <Linha l={t('fields.phone2')} v={e.telefone_2} icon={<Phone size={11} />} />
            <Linha l={t('fields.neighborhood')} v={e.bairro} />
            <Linha l="CEP" v={e.cep} />
          </div>
          {segmento && (
            <div className="rounded-xl border border-cyan-400/15 p-5" style={{ background: '#0F2A4A' }}>
              <p className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest mb-2 flex items-center gap-1"><Target size={12} /> {t('sections.segment')}</p>
              <p className="text-sm font-bold text-white mb-1">{segmento.nome}</p>
              <p className="text-[11px] text-gray-400 mb-2">{segmento.descricao}</p>
              <p className="text-[10px] text-gray-500 mb-1">{t('painHypotheses')}</p>
              <div className="flex flex-wrap gap-1.5">
                {segmento.painHypotheses.map((h: string) => (
                  <span key={h} className="text-[9px] px-2 py-1 rounded-full bg-amber-400/10 text-amber-300 border border-amber-400/20">{h}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Score */}
      <div className="mt-4">
        {score ? (
          <RadarScoreCard
            total={score.score_total} dor={score.score_dor_pessoas}
            capacidade={score.score_capacidade_compra} fit={score.score_fit_vertho}
            classificacao={score.classificacao} classificacaoLabel={null} />
        ) : (
          <div className="rounded-xl border border-white/[0.06] p-5 text-center" style={{ background: '#0F2A4A' }}>
            <p className="text-xs text-gray-500">{t('scoreMissing')}</p>
          </div>
        )}
      </div>

      {/* Explicação do score (auditável) */}
      {expl && (
        <div className="mt-4 rounded-xl border border-white/[0.06] p-5" style={{ background: '#0F2A4A' }}>
          <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-3">{t('scoreExplanation')}</p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-[10px]">
            {(['dor_pessoas','capacidade_compra','fit_vertho'] as const).map(dim => (
              <div key={dim}>
                <p className="text-cyan-400 font-bold mb-1 uppercase">{dim.replace('_',' ')}</p>
                {(expl[dim] || []).map((p: any, i: number) => (
                  <div key={i} className="flex justify-between gap-2 py-0.5 border-b border-white/[0.03]">
                    <span className="text-gray-500">{p.parcela}</span>
                    <span className="text-gray-300 font-semibold">{p.valor}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Insight IA (placeholder até Etapa 5) */}
      <div className="mt-4 rounded-xl border border-white/[0.06] p-5" style={{ background: '#0F2A4A' }}>
        <p className="text-xs font-bold text-white mb-2 flex items-center gap-1.5"><AlertTriangle size={12} className="text-purple-400" /> {t('commercialInsight')}</p>
        {insight ? (
          <pre className="text-[10px] text-gray-300 whitespace-pre-wrap">{JSON.stringify(insight, null, 2)}</pre>
        ) : (
          <p className="text-[11px] text-gray-500">{t('insightPlaceholder')}</p>
        )}
      </div>

      <p className="text-[9px] text-gray-600 mt-6 leading-relaxed border-t border-white/[0.04] pt-3">{RADAR_DISCLAIMER}</p>
    </div>
  );
}

function Linha({ l, v, icon }: { l: string; v: any; icon?: any }) {
  return (
    <div className="flex justify-between gap-3 text-[11px] py-1 border-b border-white/[0.03]">
      <span className="text-gray-500 flex items-center gap-1">{icon}{l}</span>
      <span className="text-gray-200 text-right">{v || '—'}</span>
    </div>
  );
}
