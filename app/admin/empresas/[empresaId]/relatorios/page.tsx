'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  Loader2, FileText, User, Users, Building2, ChevronDown,
  Target, AlertTriangle, CheckCircle, TrendingUp, Download, Dna, Fingerprint
} from 'lucide-react';
import BackButton from '@/components/back-button';
import { loadRelatoriosEmpresa } from '@/actions/relatorios-load';
import { gerarDnaOrganizacional } from '@/actions/dna-organizacional';
import { gerarPerfilOrganizacional } from '@/actions/perfil-organizacional';
import { gerarRelatorioAdequacao, listarCargosComGabarito } from '@/actions/adequacao-cargo';

const NIVEL_COLORS = { 1: 'text-red-400', 2: 'text-amber-400', 3: 'text-cyan-400', 4: 'text-green-400' };

function s(v: any): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}

function tryParseJsonLike(v: any): any {
  if (v == null || typeof v !== 'string') return v;
  const trimmed = v.trim();
  if ((!trimmed.startsWith('{') || !trimmed.endsWith('}')) && (!trimmed.startsWith('[') || !trimmed.endsWith(']'))) {
    return v;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return v;
  }
}

function getResumoGeralParts(v: any) {
  const parsed = tryParseJsonLike(v);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return {
    leitura: parsed.leitura || parsed.resumo || parsed.texto || '',
    principaisForcas: Array.isArray(parsed.principais_forcas) ? parsed.principais_forcas : [],
    pontoAtencao: parsed.principal_ponto_de_atencao || parsed.ponto_de_atencao || '',
  };
}

function ResumoGeral({ value }: { value: any }) {
  const t = useTranslations('AdminReports');
  const parts = getResumoGeralParts(value);
  if (!parts) return <p className="text-xs text-gray-300 leading-relaxed">{s(value)}</p>;

  return (
    <div className="space-y-2">
      {parts.leitura && <p className="text-xs text-gray-300 leading-relaxed">{s(parts.leitura)}</p>}
      {parts.principaisForcas.length > 0 && (
        <div className="space-y-1">
          {parts.principaisForcas.map((item: any, index: number) => (
            <p key={index} className="text-[10px] text-green-400">+ {s(item)}</p>
          ))}
        </div>
      )}
      {parts.pontoAtencao && <p className="text-[10px] text-amber-400">{t('labels.attentionPoint')}: {s(parts.pontoAtencao)}</p>}
    </div>
  );
}

function getResumoExecutivoParts(v: any) {
  const parsed = typeof v === 'object' && v !== null ? v : tryParseJsonLike(v);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return {
    leitura: parsed.leitura_geral || parsed.leitura || parsed.resumo || parsed.texto || '',
    principalAvanco: parsed.principal_avanco || parsed.principal_forca_organizacional || '',
    principalPontoAtencao: parsed.principal_ponto_de_atencao || parsed.principal_risco_organizacional || '',
  };
}

function ResumoExecutivo({ value }: { value: any }) {
  const t = useTranslations('AdminReports');
  const parts = getResumoExecutivoParts(value);
  if (!parts) return <p className="text-xs text-gray-300 leading-relaxed">{s(value)}</p>;

  return (
    <div className="space-y-2">
      {parts.leitura && <p className="text-xs text-gray-300 leading-relaxed">{s(parts.leitura)}</p>}
      {parts.principalAvanco && <p className="text-[10px] text-green-400">{t('labels.advance')}: {s(parts.principalAvanco)}</p>}
      {parts.principalPontoAtencao && <p className="text-[10px] text-amber-400">{t('labels.attentionPoint')}: {s(parts.principalPontoAtencao)}</p>}
    </div>
  );
}

function getDestaqueItem(v: any) {
  const parsed = typeof v === 'object' && v !== null ? v : tryParseJsonLike(v);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return {
    nome: parsed.nome || '',
    competencia: parsed.competencia || '',
    nivel: parsed.nivel,
    motivo: parsed.motivo_destaque || parsed.motivo || parsed.texto || '',
  };
}

function urgenciaKey(v: any): 'urgent' | 'important' | 'followUp' {
  const raw = String(v || '').trim().toLowerCase();
  if (raw === 'urgente' || raw === 'alta') return 'urgent';
  if (raw === 'importante' || raw === 'media' || raw === 'média') return 'important';
  return 'followUp';
}

function ActionHorizon({
  label,
  value,
}: {
  label: string;
  value: any;
}) {
  if (!value) return null;

  return (
    <div className="mb-2 p-2 rounded-lg" style={{ background: '#091D35' }}>
      <p className="text-[9px] text-gray-500 font-bold uppercase">{label}</p>
      {Array.isArray(value) ? (
        value.map((item, index) => (
          <p key={index} className="text-[10px] text-gray-300">
            • {s(item)}
          </p>
        ))
      ) : (
        <>
          {value.titulo && <p className="text-xs text-white font-bold">{s(value.titulo)}</p>}
          {value.descricao && <p className="text-[10px] text-gray-400">{s(value.descricao)}</p>}
          {value.impacto && <p className="text-[10px] text-green-400 mt-0.5">{s(value.impacto)}</p>}
        </>
      )}
    </div>
  );
}

export default function RelatoriosPage({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = use(params);
  const router = useRouter();
  const t = useTranslations('AdminReports');
  const locale = useLocale();

  const [data, setData] = useState({ individuais: [], gestores: [], gestor: null, rh: null });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('individual');
  const [openId, setOpenId] = useState(null);
  const [gestorIdx, setGestorIdx] = useState(0);
  const [dnaBusy, setDnaBusy] = useState(false);
  const [dnaMsg, setDnaMsg] = useState<string | null>(null);
  const [dnaUrl, setDnaUrl] = useState<string | null>(null);
  const [poBusy, setPoBusy] = useState(false);
  const [poMsg, setPoMsg] = useState<string | null>(null);
  const [poUrl, setPoUrl] = useState<string | null>(null);
  // Adequação ao Cargo (por cargo, com perfil ideal/gabarito)
  const [cargosGab, setCargosGab] = useState<string[]>([]);
  const [adCargo, setAdCargo] = useState('');
  const [adIA, setAdIA] = useState(true);
  const [adBusy, setAdBusy] = useState(false);
  const [adMsg, setAdMsg] = useState<string | null>(null);
  const [adUrl, setAdUrl] = useState<string | null>(null);

  // gera um relatório (DNA de competências ou Perfil DISC), tratando o bloqueio
  // de pop-up: abre a aba no clique e navega quando pronto; senão mostra link.
  async function gerarRelatorio(
    fn: () => Promise<{ success: boolean; url?: string; error?: string }>,
    setBusy: (v: boolean) => void, setMsg: (v: string | null) => void, setUrl: (v: string | null) => void,
  ) {
    setBusy(true); setMsg(null); setUrl(null);
    const win = window.open('about:blank', '_blank');
    try {
      const r = await fn();
      if (r.success && r.url) { setUrl(r.url); if (win && !win.closed) win.location.href = r.url; }
      else { if (win && !win.closed) win.close(); setMsg(r.error || t('dna.error')); }
    } catch (e: any) {
      if (win && !win.closed) win.close();
      setMsg(e?.message || t('dna.error'));
    } finally { setBusy(false); }
  }
  const handleGerarDna = () => gerarRelatorio(() => gerarDnaOrganizacional(empresaId), setDnaBusy, setDnaMsg, setDnaUrl);
  const handleGerarPerfilOrg = () => gerarRelatorio(() => gerarPerfilOrganizacional(empresaId), setPoBusy, setPoMsg, setPoUrl);
  const handleGerarAdequacao = () => {
    if (!adCargo) { setAdMsg('Selecione um cargo.'); return; }
    return gerarRelatorio(() => gerarRelatorioAdequacao(empresaId, adCargo, { comAnaliseIA: adIA }), setAdBusy, setAdMsg, setAdUrl);
  };

  useEffect(() => {
    loadRelatoriosEmpresa(empresaId).then(d => { setData(d); setLoading(false); });
    listarCargosComGabarito(empresaId).then(r => setCargosGab(r.cargos || []));
  }, [empresaId]);

  if (loading) return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  const TABS = [
    { key: 'individual', label: `PDI (${data.individuais.length})`, icon: User },
    { key: 'gestor', label: `${t('tabs.manager')}${(data.gestores?.length || 0) > 1 ? ` (${data.gestores.length})` : ''}`, icon: Users, has: (data.gestores?.length || 0) > 0 },
    { key: 'rh', label: t('tabs.hr'), icon: Building2, has: !!data.rh },
  ];

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      {/* Header */}
      <BackButton onClick={() => router.push(`/admin/empresas/${empresaId}`)} />
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <FileText size={20} className="text-cyan-400" /> {t('title')}
          </h1>
          <p className="text-xs text-gray-500">{t('subtitle')}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-2">
            <button onClick={handleGerarPerfilOrg} disabled={poBusy}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap">
              {poBusy ? <Loader2 size={14} className="animate-spin" /> : <Fingerprint size={14} />}
              {poBusy ? t('po.generating') : t('po.button')}
            </button>
            <button onClick={handleGerarDna} disabled={dnaBusy}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap">
              {dnaBusy ? <Loader2 size={14} className="animate-spin" /> : <Dna size={14} />}
              {dnaBusy ? t('dna.generating') : t('dna.button')}
            </button>
          </div>
          {dnaMsg && <span className="text-[10px] text-amber-400 max-w-[260px] text-right">{dnaMsg}</span>}
          {poMsg && <span className="text-[10px] text-amber-400 max-w-[260px] text-right">{poMsg}</span>}
          {dnaUrl && (
            <a href={dnaUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 underline">
              <Download size={12} /> {t('dna.open')} — DNA de Competências
            </a>
          )}
          {poUrl && (
            <a href={poUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-semibold text-purple-300 hover:text-purple-200 underline">
              <Download size={13} /> {t('dna.open')} — Perfil Organizacional
            </a>
          )}
        </div>
      </div>

      {/* ═══ Adequação ao Cargo (perfil ideal × colaboradores) ═══ */}
      {cargosGab.length > 0 && (
        <div className="mb-5 p-4 rounded-xl border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
          <div className="flex items-center gap-2 mb-3">
            <Target size={15} className="text-emerald-400" />
            <span className="text-sm font-bold text-white">Adequação ao Cargo</span>
            <span className="text-[10px] text-gray-500">match dos colaboradores com o perfil ideal (gabarito)</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select value={adCargo} onChange={e => { setAdCargo(e.target.value); setAdMsg(null); setAdUrl(null); }}
              className="px-3 py-2 rounded-lg text-xs text-white border border-white/10 outline-none focus:border-emerald-400/40 min-w-[220px]" style={{ background: '#091D35' }}>
              <option value="">Selecione o cargo…</option>
              {cargosGab.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
              <input type="checkbox" checked={adIA} onChange={e => setAdIA(e.target.checked)} className="accent-emerald-500" />
              análise individual por IA
            </label>
            <button onClick={handleGerarAdequacao} disabled={adBusy || !adCargo}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
              {adBusy ? <Loader2 size={14} className="animate-spin" /> : <Target size={14} />}
              {adBusy ? 'Gerando…' : 'Gerar relatório'}
            </button>
            {adMsg && <span className="text-[10px] text-amber-400">{adMsg}</span>}
            {adUrl && (
              <a href={adUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300 hover:text-emerald-200 underline">
                <Download size={13} /> Abrir relatório
              </a>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl border border-white/[0.06]" style={{ background: '#091D35' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              tab === t.key ? 'bg-white/[0.06] text-white' : 'text-gray-500 hover:text-gray-300'
            }`}>
            <t.icon size={14} className={tab === t.key ? 'text-cyan-400' : ''} />
            {t.label}
            {t.has === false && <span className="text-[8px] text-gray-600">—</span>}
          </button>
        ))}
      </div>

      {/* ═══ INDIVIDUAL ═══ */}
      {tab === 'individual' && (
        <div>
          {data.individuais.length === 0 ? (
            <Empty text={t('emptyStates.individual')} />
          ) : data.individuais.map(rel => {
            const c = rel.conteudo;
            const isOpen = openId === rel.id;
            return (
              <div key={rel.id} className="mb-3 rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
                <button onClick={() => setOpenId(isOpen ? null : rel.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-2">
                    <User size={14} className="text-cyan-400" />
                    <span className="text-sm font-bold text-white">{rel.colaborador_nome}</span>
                    <span className="text-[10px] text-gray-500">{rel.colaborador_cargo}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <a href={`/api/relatorios/pdf?id=${rel.id}`} target="_blank" onClick={e => e.stopPropagation()}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 transition-all">
                      <Download size={10} /> {t('actions.pdf')}
                    </a>
                    <span className="text-[9px] text-gray-600">{new Date(rel.gerado_em).toLocaleDateString(locale)}</span>
                    <ChevronDown size={14} className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </div>
                </button>
                {isOpen && c && (
                  <div className="px-4 pb-4 border-t border-white/[0.04] space-y-4">
                    {/* Acolhimento */}
                    {c.acolhimento && <p className="text-xs text-gray-300 leading-relaxed mt-3 italic">{s(c.acolhimento)}</p>}

                    {/* Resumo */}
                    {c.resumo_geral && (
                      <div>
                        <SectionTitle>{t('sections.generalSummary')}</SectionTitle>
                        <ResumoGeral value={c.resumo_geral} />
                      </div>
                    )}

                    {/* Perfil */}
                    {c.perfil_comportamental && (
                      <div>
                        <SectionTitle color="purple">{t('sections.behaviorProfile')}</SectionTitle>
                        <p className="text-xs text-gray-300 leading-relaxed mb-2">{s(c.perfil_comportamental.descricao || c.perfil_disc?.descricao)}</p>
                        {(c.perfil_comportamental.pontos_forca || c.perfil_disc?.pontos_forca)?.map((p, i) => (
                          <p key={i} className="text-[10px] text-green-400">+ {s(p)}</p>
                        ))}
                        {(c.perfil_comportamental.pontos_atencao || c.perfil_disc?.pontos_atencao)?.map((p, i) => (
                          <p key={i} className="text-[10px] text-amber-400">{s(p)}</p>
                        ))}
                      </div>
                    )}

                    {/* Competências */}
                    {c.competencias?.length > 0 && (
                      <div>
                        <SectionTitle color="cyan">{t('sections.competencies')}</SectionTitle>
                        <div className="space-y-2">
                          {c.competencias.map((comp, i) => (
                            <div key={i} className="p-3 rounded-lg" style={{ background: '#091D35' }}>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-bold text-white">{comp.nome}</span>
                                <span className={`text-sm font-bold ${NIVEL_COLORS[comp.nivel || comp.nivel_atual] || 'text-gray-400'}`}>
                                  {t('labels.levelShort')}{comp.nivel || comp.nivel_atual || '?'}
                                </span>
                                {comp.nota_decimal && <span className="text-[10px] text-gray-500">({Number(comp.nota_decimal).toFixed(2)})</span>}
                                {comp.evolucao && <span className={`text-[9px] ${comp.evolucao === 'subiu' ? 'text-green-400' : comp.evolucao === 'desceu' ? 'text-red-400' : 'text-gray-500'}`}>{comp.evolucao}</span>}
                              </div>
                              {comp.analise && <p className="text-[10px] text-gray-400 mb-1">{s(comp.analise)}</p>}
                              {comp.evidencias_destaque?.map((e, j) => <p key={j} className="text-[10px] text-gray-500">• {s(e)}</p>)}
                              {comp.lacuna_principal && <p className="text-[10px] text-amber-400 mt-1">{t('labels.gap')}: {s(comp.lacuna_principal)}</p>}
                              {comp.acao_pratica && <p className="text-[10px] text-cyan-400 mt-1">{s(comp.acao_pratica)}</p>}
                              {comp.script_pratico && <p className="text-[10px] text-cyan-400">{s(comp.script_pratico)}</p>}
                              {comp.recomendacao && <p className="text-[10px] text-gray-400 mt-1">{s(comp.recomendacao)}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Próximos passos */}
                    {c.proximos_passos && (
                      <div>
                        <SectionTitle color="green">{t('sections.nextSteps')}</SectionTitle>
                        {(Array.isArray(c.proximos_passos) ? c.proximos_passos : Object.values(c.proximos_passos)).map((p, i) => (
                          <div key={i} className="p-2 rounded-lg mb-1" style={{ background: '#091D35' }}>
                            <p className="text-[10px] text-white font-bold">{s(p.competencia)}</p>
                            <p className="text-[10px] text-gray-300">{s(p.meta_primeira_pessoa)}</p>
                            {p.prazo && <span className="text-[9px] text-gray-500">{s(p.prazo)}</span>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Mensagem final */}
                    {c.mensagem_final && <p className="text-xs text-gray-400 italic pt-2 border-t border-white/[0.04]">{s(c.mensagem_final)}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ GESTOR ═══ */}
      {tab === 'gestor' && (
        <div>
          {(!data.gestores || data.gestores.length === 0) ? (
            <Empty text={t('emptyStates.manager')} />
          ) : (() => {
            const ativo = data.gestores[Math.min(gestorIdx, data.gestores.length - 1)];
            const c = ativo.conteudo;
            const gestorPdfLink = `/api/relatorios/pdf?id=${ativo.id}`;
            return (
              <div className="space-y-4">
                {data.gestores.length > 1 && (
                  <div className="flex items-center gap-2 flex-wrap p-3 rounded-xl border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t('labels.manager')}:</span>
                    {data.gestores.map((g, i) => (
                      <button key={g.id} onClick={() => setGestorIdx(i)}
                        className={`text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-all ${
                          i === gestorIdx ? 'bg-cyan-400/15 text-cyan-300 border-cyan-400/40' : 'text-gray-400 border-white/[0.08] hover:border-white/[0.2]'
                        }`}>
                        {g.gestor_nome}{g.equipe_size ? ` · ${t('labels.collaboratorsShort', { count: g.equipe_size })}` : ''}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex justify-end mb-3">
                  <a href={gestorPdfLink} target="_blank" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 transition-all">
                    <Download size={11} /> {t('actions.downloadPdf')}
                  </a>
                </div>

                {c.resumo_executivo && (
                  <div className="p-4 rounded-xl border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
                    <SectionTitle>{t('sections.executiveSummary')}</SectionTitle>
                    <ResumoExecutivo value={c.resumo_executivo} />
                  </div>
                )}

                {c.destaques_evolucao?.length > 0 && (
                  <div className="p-4 rounded-xl border border-green-400/10" style={{ background: '#0F2A4A' }}>
                    <SectionTitle color="green">{t('sections.evolutionHighlights')}</SectionTitle>
                    {c.destaques_evolucao.map((d, i) => {
                      const item = getDestaqueItem(d);
                      if (!item) return <p key={i} className="text-[10px] text-green-400">+ {s(d)}</p>;
                      return (
                        <div key={i} className="mb-2">
                          <p className="text-[10px] text-green-400 font-semibold">
                            + {item.nome}{item.competencia ? ` — ${item.competencia}` : ''}{item.nivel != null ? ` (${t('labels.levelShort')}${item.nivel})` : ''}
                          </p>
                          {item.motivo && <p className="text-[10px] text-gray-400">{s(item.motivo)}</p>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {c.ranking_atencao?.length > 0 && (
                  <div className="p-4 rounded-xl border border-amber-400/10" style={{ background: '#0F2A4A' }}>
                    <SectionTitle color="amber">{t('sections.attentionRanking')}</SectionTitle>
                    {c.ranking_atencao.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 py-1 text-[10px]">
                        <span className={`font-bold px-1.5 py-0.5 rounded ${urgenciaKey(r.urgencia) === 'urgent' ? 'bg-red-400/15 text-red-400' : urgenciaKey(r.urgencia) === 'important' ? 'bg-amber-400/15 text-amber-400' : 'bg-gray-400/15 text-gray-400'}`}>{t(`urgency.${urgenciaKey(r.urgencia)}`)}</span>
                        <span className="text-white font-medium">{s(r.nome)}</span>
                        <span className="text-gray-500">{s(r.competencia)} — {t('labels.levelShort')}{r.nivel || r.nivel_fase3}</span>
                        <span className="text-gray-600 truncate">{s(r.motivo || r.motivo_curto)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {c.analise_por_competencia?.length > 0 && (
                  <div className="p-4 rounded-xl border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
                    <SectionTitle color="cyan">{t('sections.competencyAnalysis')}</SectionTitle>
                    {c.analise_por_competencia.map((a, i) => (
                      <div key={i} className="mb-3 p-3 rounded-lg" style={{ background: '#091D35' }}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-white">{s(a.competencia)}</span>
                          <span className="text-[10px] text-gray-500">{t('labels.average')}: {s(a.media_nivel || a.media)}</span>
                        </div>
                        <p className="text-[10px] text-gray-400">{s(a.padrao_observado)}</p>
                        {a.acao_gestor && <p className="text-[10px] text-cyan-400 mt-1">{s(a.acao_gestor)}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {c.acoes && (
                  <div className="p-4 rounded-xl border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
                    <SectionTitle color="green">{t('sections.actions')}</SectionTitle>
                    <ActionHorizon label={t('horizons.thisWeek')} value={c.acoes.esta_semana} />
                    <ActionHorizon label={t('horizons.nextWeeks')} value={c.acoes.proximas_semanas} />
                    <ActionHorizon label={t('horizons.mediumTerm')} value={c.acoes.medio_prazo} />
                  </div>
                )}

                {c.mensagem_final && <p className="text-xs text-gray-400 italic">{s(c.mensagem_final)}</p>}
              </div>
            );
          })()}
        </div>
      )}

      {/* ═══ RH ═══ */}
      {tab === 'rh' && (
        <div>
          {!data.rh ? (
            <Empty text={t('emptyStates.hr')} />
          ) : (() => {
            const c = data.rh.conteudo;
            const rhPdfLink = `/api/relatorios/pdf?id=${data.rh.id}`;
            return (
              <div className="space-y-4">
                <div className="flex justify-end mb-3">
                  <a href={rhPdfLink} target="_blank" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 transition-all">
                    <Download size={11} /> {t('actions.downloadPdf')}
                  </a>
                </div>

                {c.resumo_executivo && (
                  <div className="p-4 rounded-xl border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
                    <SectionTitle>{t('sections.executiveSummary')}</SectionTitle>
                    <ResumoExecutivo value={c.resumo_executivo} />
                  </div>
                )}

                {c.indicadores && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: t('indicators.evaluated'), value: s(c.indicadores.total_avaliados), color: 'text-white' },
                      { label: t('indicators.average'), value: s(c.indicadores.media_geral), color: 'text-cyan-400' },
                      { label: 'N1-N2', value: `${(c.indicadores.pct_nivel_1 || 0) + (c.indicadores.pct_nivel_2 || 0)}%`, color: 'text-amber-400' },
                      { label: 'N3-N4', value: `${(c.indicadores.pct_nivel_3 || 0) + (c.indicadores.pct_nivel_4 || 0)}%`, color: 'text-green-400' },
                    ].map((ind, i) => (
                      <div key={i} className="text-center p-3 rounded-lg" style={{ background: '#0F2A4A' }}>
                        <div className={`text-xl font-bold ${ind.color}`}>{ind.value}</div>
                        <div className="text-[9px] text-gray-500">{ind.label}</div>
                      </div>
                    ))}
                  </div>
                )}

                {c.competencias_criticas?.length > 0 && (
                  <div className="p-4 rounded-xl border border-red-400/10" style={{ background: '#0F2A4A' }}>
                    <SectionTitle color="red">{t('sections.criticalCompetencies')}</SectionTitle>
                    {c.competencias_criticas.map((comp, i) => (
                      <div key={i} className="mb-2 flex items-start gap-2">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                          comp.criticidade === 'CRITICA' ? 'bg-red-400/15 text-red-400' : comp.criticidade === 'ATENCAO' ? 'bg-amber-400/15 text-amber-400' : 'bg-green-400/15 text-green-400'
                        }`}>{s(comp.criticidade)}</span>
                        <div>
                          <p className="text-xs text-white font-bold">{s(comp.competencia)}</p>
                          <p className="text-[10px] text-gray-400">{s(comp.motivo)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {c.treinamentos_sugeridos?.length > 0 && (
                  <div className="p-4 rounded-xl border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
                    <SectionTitle color="cyan">{t('sections.suggestedTrainings')}</SectionTitle>
                    {c.treinamentos_sugeridos.map((t, i) => (
                      <div key={i} className="mb-2 p-3 rounded-lg" style={{ background: '#091D35' }}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-white">{s(t.titulo)}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                            t.prioridade === 'URGENTE' ? 'bg-red-400/15 text-red-400' : t.prioridade === 'IMPORTANTE' ? 'bg-amber-400/15 text-amber-400' : 'bg-gray-400/15 text-gray-400'
                          }`}>{s(t.prioridade)}</span>
                          {t.custo && <span className="text-[9px] text-gray-500">{s(t.custo)}</span>}
                        </div>
                        <p className="text-[10px] text-gray-400">{s(t.publico)} · {s(t.formato)} · {s(t.carga_horaria)}</p>
                        {t.justificativa && <p className="text-[10px] text-gray-500 mt-0.5">{s(t.justificativa)}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {c.decisoes_chave?.length > 0 && (
                  <div className="p-4 rounded-xl border border-red-400/10" style={{ background: '#0F2A4A' }}>
                    <SectionTitle color="red">{t('sections.keyDecisions')}</SectionTitle>
                    {c.decisoes_chave.map((d, i) => (
                      <div key={i} className="mb-2 p-3 rounded-lg" style={{ background: '#091D35' }}>
                        <p className="text-xs text-white font-bold">{s(d.colaborador)}</p>
                        <p className="text-[10px] text-gray-400">{s(d.situacao)}</p>
                        <p className="text-[10px] text-cyan-400 mt-0.5">{s(d.acao || d.acao_imediata)}</p>
                      </div>
                    ))}
                  </div>
                )}

                {c.plano_acao && (
                  <div className="p-4 rounded-xl border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
                    <SectionTitle color="green">{t('sections.hrActionPlan')}</SectionTitle>
                    <ActionHorizon label={t('horizons.shortTerm')} value={c.plano_acao.curto_prazo} />
                    <ActionHorizon label={t('horizons.mediumTerm')} value={c.plano_acao.medio_prazo} />
                    <ActionHorizon label={t('horizons.longTerm')} value={c.plano_acao.longo_prazo} />
                  </div>
                )}

                {c.mensagem_final && <p className="text-xs text-gray-400 italic">{s(c.mensagem_final)}</p>}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function Empty({ text }) {
  return (
    <div className="text-center py-12">
      <FileText size={32} className="text-gray-600 mx-auto mb-3" />
      <p className="text-sm text-gray-500">{text}</p>
    </div>
  );
}

function SectionTitle({ color = 'white', children }) {
  const colors = { white: 'text-white', cyan: 'text-cyan-400', green: 'text-green-400', amber: 'text-amber-400', red: 'text-red-400', purple: 'text-purple-400' };
  return <p className={`text-[9px] font-bold uppercase tracking-widest mb-2 ${colors[color]}`}>{children}</p>;
}
