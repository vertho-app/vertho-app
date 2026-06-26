'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Save, Loader2, CheckCircle, AlertTriangle, X,
  Brain, Clock, Mail, Eye, EyeOff, Palette, Upload, Trash2, Globe, Users, GraduationCap, Film, Sparkles
} from 'lucide-react';
import BackButton from '@/components/back-button';
import { loadConfig, salvarConfig, salvarBranding, salvarSlug, loadEquipe, atualizarRole, vincularDominioVercel, salvarLocaleEmpresa, resumirPPPEscola, listarPPPEscolas, gerarBriefDoPPP } from './actions';
import { limparSessoesAntigas, limparSessoesTeste } from '@/app/actions/manutencao';
import { fetchAuth } from '@/lib/auth/fetch-auth';
import { ROOT_DOMAIN } from '@/lib/domain';

import { AI_TASKS, MODELOS_DISPONIVEIS } from '@/lib/ai-tasks';
const MODELOS = MODELOS_DISPONIVEIS;

const DEFAULT_CONFIG = {
  ai: { modelo_padrao: 'claude-sonnet-4-6', modelos: {}, anthropic_key: null, gemini_key: null, openai_key: null, thinking: false },
  cadencia: { fase4_dia_pilula: 1, fase4_dia_pilula2: 2, fase4_dia_evidencia: 4, fase4_hora: 8, email_ativo: true, whatsapp_ativo: true },
  envios: { email_remetente: null, email_alias: null },
  programa_modo: 'regular' as 'regular' | 'onboarding',
  fase_carreira_default: null as null | 'junior' | 'pleno' | 'senior',
};

export default function ConfigPage({ params }: { params: Promise<{ empresaId: string }> }) {
  const t = useTranslations('AdminCompanySettings');
  const { empresaId } = use(params);
  const router = useRouter();
  const dias = t.raw('days') as string[];
  const [empresa, setEmpresa] = useState(null);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [tab, setTab] = useState('equipe');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showKeys, setShowKeys] = useState({});
  const [vinculando, setVinculando] = useState(false);
  const [vincularMsg, setVincularMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [defaultLocale, setDefaultLocale] = useState('pt-BR');

  // Branding state
  const DEFAULT_BRANDING = {
    logo_url: null,
    font_color: '#FFFFFF',
    font_color_secondary: '#FFFFFF99',
    primary_color: '#0D9488',
    primary_color_end: '#0F766E',
    accent_color: '#00B4D8',
    bg_gradient_start: '#091D35',
    bg_gradient_end: '#0F2A4A',
    login_subtitle: '',
  };
  const [branding, setBranding] = useState(DEFAULT_BRANDING);
  const [slug, setSlug] = useState('');
  const [uploading, setUploading] = useState(false);
  const [equipe, setEquipe] = useState([]);
  const [roleUpdating, setRoleUpdating] = useState(null);
  const [ppp, setPpp] = useState('');
  const [resumindo, setResumindo] = useState(false);
  const [pppEscolas, setPppEscolas] = useState<any[]>([]);
  const [pppEscolaSel, setPppEscolaSel] = useState('');
  const [gerandoPpp, setGerandoPpp] = useState(false);

  useEffect(() => {
    loadConfig(empresaId).then(r => {
      if (r.success) {
        setEmpresa(r.empresa);
        setConfig({ ...DEFAULT_CONFIG, ...(r.empresa.sys_config || {}) });
        setDefaultLocale(r.empresa.default_locale || 'pt-BR');
        const ui = r.empresa.ui_config || {};
        setBranding(prev => ({ ...prev, ...ui }));
        setSlug(r.empresa.slug || '');
      }
      setLoading(false);
    });
    loadEquipe(empresaId).then(setEquipe);
    listarPPPEscolas(empresaId).then(list => {
      setPppEscolas(list);
      if (list.length) setPppEscolaSel(list[0].id);
    });
  }, [empresaId]);

  async function handleRoleChange(colaboradorId, novoRole) {
    setRoleUpdating(colaboradorId);
    const r = await atualizarRole(colaboradorId, novoRole);
    if (r.success) {
      setEquipe(prev => prev.map(c => c.id === colaboradorId ? { ...c, role: novoRole } : c));
      setSuccess(r.message); setTimeout(() => setSuccess(''), 3000);
    } else { setError(r.error); }
    setRoleUpdating(null);
  }

  function updateAI(field, value) { setConfig(prev => ({ ...prev, ai: { ...prev.ai, [field]: value } })); }
  function updateCadencia(field, value) { setConfig(prev => ({ ...prev, cadencia: { ...prev.cadencia, [field]: value } })); }
  function updateEnvios(field, value) { setConfig(prev => ({ ...prev, envios: { ...prev.envios, [field]: value } })); }
  function updateBranding(field, value) { setBranding(prev => ({ ...prev, [field]: value })); }
  function updateBriefEscola(field, value) {
    setConfig(prev => ({ ...prev, video_escola: { ...(prev as any).video_escola, [field]: value } }));
  }

  async function handleResumirPPP() {
    setResumindo(true); setError('');
    const r = await resumirPPPEscola(empresaId, ppp);
    setResumindo(false);
    if (r.success) {
      setConfig(prev => ({ ...prev, video_escola: (r as any).brief }));
      setSuccess('PPP resumido e salvo'); setTimeout(() => setSuccess(''), 3000);
    } else { setError((r as any).error); }
  }

  async function handleGerarDoPPP() {
    setGerandoPpp(true); setError('');
    const r = await gerarBriefDoPPP(empresaId, pppEscolaSel || undefined);
    setGerandoPpp(false);
    if (r.success) {
      setConfig(prev => ({ ...prev, video_escola: (r as any).brief }));
      setSuccess((r as any).message || 'Brief gerado do PPP'); setTimeout(() => setSuccess(''), 3000);
    } else { setError((r as any).error); }
  }

  async function handleSave() {
    setSaving(true); setError('');
    if (tab === 'branding') {
      const [rBranding, rSlug] = await Promise.all([
        salvarBranding(empresaId, branding),
        slug ? salvarSlug(empresaId, slug) : { success: true },
      ]);
      setSaving(false);
      if (!rBranding.success) { setError((rBranding as any).error); return; }
      if (!rSlug.success) { setError((rSlug as any).error); return; }
      if ((rSlug as any).slug) setSlug((rSlug as any).slug);
      setSuccess(t('brandingSaved')); setTimeout(() => setSuccess(''), 3000);
    } else if (tab === 'idioma') {
      const r = await salvarLocaleEmpresa(empresaId, defaultLocale);
      setSaving(false);
      if (r.success) { setSuccess(t('localeSaved')); setTimeout(() => setSuccess(''), 3000); }
      else setError(r.error);
    } else {
      const r = await salvarConfig(empresaId, config);
      setSaving(false);
      if (r.success) { setSuccess(t('saved')); setTimeout(() => setSuccess(''), 3000); }
      else setError(r.error);
    }
  }

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('empresaId', empresaId);
      const res = await fetchAuth('/api/upload-logo', { method: 'POST', body: fd });
      const json = await res.json();
      if (json.success) {
        setBranding(prev => ({ ...prev, logo_url: json.url }));
        setSuccess(t('logoUploaded')); setTimeout(() => setSuccess(''), 3000);
      } else { setError(json.error); }
    } catch (err) { setError(err.message); }
    setUploading(false);
  }

  if (loading) return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 sm:px-6">
      {/* Header */}
      <BackButton onClick={() => router.push(`/admin/empresas/${empresaId}`)} />
      <div className="flex items-center justify-between mb-6">
        <img src="/logo-vertho.png" alt="Vertho" style={{ height: '26px' }} className="shrink-0" />
        <div className="text-center flex-1 px-4">
          <h1 className="text-lg font-bold text-white">{t('title')}</h1>
          <p className="text-xs text-gray-500">{empresa?.nome}</p>
        </div>
      </div>

      {/* Feedback */}
      {error && (
        <div className="flex items-center gap-2 mb-4 p-3 rounded-lg border border-red-400/20" style={{ background: 'rgba(239,68,68,0.06)' }}>
          <AlertTriangle size={14} className="text-red-400" />
          <p className="text-xs text-red-400 flex-1">{error}</p>
          <button onClick={() => setError('')}><X size={14} className="text-red-400" /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 mb-4 p-3 rounded-lg border border-green-400/20" style={{ background: 'rgba(34,197,94,0.06)' }}>
          <CheckCircle size={14} className="text-green-400" />
          <p className="text-xs text-green-400 font-semibold">{success}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-lg border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
        {[
          { id: 'equipe', label: t('tabs.team'), icon: Users },
          { id: 'programa', label: t('tabs.program'), icon: GraduationCap },
          { id: 'video', label: 'Vídeo', icon: Film },
          { id: 'idioma', label: t('tabs.language'), icon: Globe },
          { id: 'branding', label: t('tabs.branding'), icon: Palette },
          { id: 'ai', label: t('tabs.ai'), icon: Brain },
          { id: 'cadencia', label: t('tabs.cadence'), icon: Clock },
          { id: 'envios', label: t('tabs.sends'), icon: Mail },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-md text-xs font-semibold transition-colors ${
              tab === t.id ? 'bg-cyan-400/15 text-cyan-400' : 'text-gray-500 hover:text-gray-300'
            }`}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {/* ═══ Tab: Equipe ═══ */}
      {tab === 'equipe' && (
        <div className="space-y-4">
          <Panel title={t('team.title', { count: equipe.length })}>
            <p className="text-[10px] text-gray-500 mb-3">{t('team.desc')}</p>
            {equipe.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-4">{t('team.empty')}</p>
            ) : (
              <div className="space-y-2">
                {equipe.map(c => (
                  <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg border border-white/[0.04]" style={{ background: '#091D35' }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{c.nome_completo || c.email}</p>
                      <p className="text-[10px] text-gray-500 truncate">{c.email}{c.cargo ? ` — ${c.cargo}` : ''}</p>
                    </div>
                    <select
                      value={c.role}
                      onChange={e => handleRoleChange(c.id, e.target.value)}
                      disabled={roleUpdating === c.id}
                      className={`px-2 py-1.5 rounded-lg text-xs font-semibold border outline-none transition-colors ${
                        c.role === 'rh' ? 'border-purple-400/30 text-purple-400 bg-purple-400/10' :
                        c.role === 'gestor' ? 'border-amber-400/30 text-amber-400 bg-amber-400/10' :
                        'border-white/10 text-gray-400 bg-white/[0.03]'
                      }`}
                      style={{ minWidth: '120px' }}>
                      <option value="colaborador">{t('team.roles.colaborador')}</option>
                      <option value="tutor">{t('team.roles.tutor')}</option>
                      <option value="gestor">{t('team.roles.gestor')}</option>
                      <option value="rh">{t('team.roles.rh')}</option>
                    </select>
                    {roleUpdating === c.id && <Loader2 size={14} className="animate-spin text-cyan-400 shrink-0" />}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* ═══ Tab: Programa ═══ */}
      {tab === 'programa' && (
        <div className="space-y-4">
          <Panel title={t('program.title')}>
            <p className="text-[10px] text-gray-500 mb-3">
              {t('program.desc')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'regular', label: t('program.regular'), desc: t('program.regularDesc') },
                { id: 'onboarding', label: t('program.onboarding'), desc: t('program.onboardingDesc') },
              ].map(opt => (
                <button key={opt.id}
                  onClick={() => setConfig(prev => ({ ...prev, programa_modo: opt.id as any }))}
                  className={`flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-colors ${
                    config.programa_modo === opt.id
                      ? 'border-cyan-400/50 bg-cyan-400/10'
                      : 'border-white/10 hover:border-white/30'
                  }`}
                  style={{ background: config.programa_modo === opt.id ? undefined : '#091D35' }}>
                  <span className="text-sm font-bold text-white">{opt.label}</span>
                  <span className="text-[10px] text-gray-400">{opt.desc}</span>
                </button>
              ))}
            </div>
            {config.programa_modo === 'onboarding' && (
              <div className="flex items-start gap-2 mt-3 p-3 rounded-lg border border-cyan-400/20" style={{ background: 'rgba(6,182,212,0.06)' }}>
                <CheckCircle size={13} className="text-cyan-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-cyan-300/85 leading-relaxed">
                  {t.rich('program.onboardingNote', {
                    code: (chunks) => <code className="text-cyan-200">{chunks}</code>,
                  })}
                </p>
              </div>
            )}
          </Panel>

          <Panel title={t('program.careerTitle')}>
            <p className="text-[10px] text-gray-500 mb-3">
              {t.rich('program.careerDesc', { b: (chunks) => <b>{chunks}</b> })}
            </p>
            <select value={config.fase_carreira_default || ''}
              onChange={e => setConfig(prev => ({ ...prev, fase_carreira_default: (e.target.value || null) as any }))}
              className="w-full px-3 py-2.5 rounded-lg text-sm text-white border border-white/10 outline-none focus:border-cyan-400/40"
              style={{ background: '#091D35' }}>
              <option value="">{t('program.noBias')}</option>
              <option value="junior">{t('program.junior')}</option>
              <option value="pleno">{t('program.pleno')}</option>
              <option value="senior">{t('program.senior')}</option>
            </select>
            <p className="text-[10px] text-gray-600 mt-2">
              {t.rich('program.careerHint', { b: (chunks) => <b>{chunks}</b> })}
            </p>
          </Panel>
        </div>
      )}

      {/* ═══ Tab: Vídeo ═══ */}
      {tab === 'video' && (() => {
        const brief = (config as any).video_escola || {};
        const campos = [
          { key: 'etapas', label: 'Etapas / segmentos', ph: 'Educação Infantil e Fundamental I' },
          { key: 'rede', label: 'Rede / natureza', ph: 'Privada confessional / Pública municipal' },
          { key: 'contexto', label: 'Contexto', ph: 'Urbana, classe média, região metropolitana de SP' },
          { key: 'ambientes', label: 'Ambientes reais', ph: 'Pátio arborizado, biblioteca ampla, laboratório maker, quadra coberta' },
          { key: 'identidade', label: 'Identidade (PPP)', ph: 'Missão, abordagem pedagógica e valores em 2-3 linhas' },
          { key: 'tom', label: 'Tom da narração', ph: 'Acolhedor, sóbrio, foco em protagonismo estudantil' },
        ];
        return (
          <div className="space-y-4">
            {pppEscolas.length > 0 && (
              <Panel title="Gerar a partir do PPP existente">
                <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">
                  Esta empresa já tem PPP extraído. Selecione a escola e a IA gera o brief do vídeo direto do PPP — sem precisar colar o texto.
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  {pppEscolas.length > 1 && (
                    <select
                      value={pppEscolaSel}
                      onChange={e => setPppEscolaSel(e.target.value)}
                      className="flex-1 min-w-[180px] px-3 py-2 rounded-lg text-sm text-white border border-white/10 outline-none focus:border-cyan-400/40"
                      style={{ background: '#091D35' }}
                    >
                      {pppEscolas.map(p => (
                        <option key={p.id} value={p.id} disabled={p.status !== 'extraido'}>
                          {p.escola}{p.status !== 'extraido' ? ` (${p.status})` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    disabled={gerandoPpp || !pppEscolaSel}
                    onClick={handleGerarDoPPP}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold border border-cyan-400/30 text-cyan-300 hover:bg-cyan-400/10 disabled:opacity-50 transition-colors"
                  >
                    {gerandoPpp ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    {gerandoPpp ? 'Gerando...' : 'Gerar do PPP existente'}
                  </button>
                </div>
              </Panel>
            )}

            <Panel title="Brief da escola para o vídeo">
              <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">
                Cole o PPP (ou uma descrição livre) e clique em <b className="text-cyan-400">Resumir com IA</b>. O resumo ancora a bíblia visual (ambientes, persona) e o tom do voice-over nos vídeos de microlearning desta escola. Nomes próprios, logos e texto na tela continuam bloqueados.
              </p>
              <textarea
                value={ppp}
                onChange={e => setPpp(e.target.value)}
                placeholder="Cole aqui o Projeto Político-Pedagógico ou uma descrição da escola..."
                rows={8}
                className="w-full px-3 py-2.5 rounded-lg text-sm text-white border border-white/10 outline-none focus:border-cyan-400/40 resize-y"
                style={{ background: '#091D35' }}
              />
              <button
                type="button"
                disabled={resumindo || !ppp.trim()}
                onClick={handleResumirPPP}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold border border-cyan-400/30 text-cyan-300 hover:bg-cyan-400/10 disabled:opacity-50 transition-colors"
              >
                {resumindo ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                {resumindo ? 'Resumindo...' : 'Resumir com IA'}
              </button>
            </Panel>

            <Panel title="Brief estruturado (editável)">
              <p className="text-[10px] text-gray-500 mb-3">
                Gerado pela IA e ajustável. Clique em <b>Salvar</b> abaixo para persistir as edições.
              </p>
              <div className="space-y-3">
                {campos.map(c => (
                  <div key={c.key}>
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">{c.label}</label>
                    <textarea
                      value={brief[c.key] || ''}
                      onChange={e => updateBriefEscola(c.key, e.target.value)}
                      placeholder={c.ph}
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg text-sm text-white border border-white/10 outline-none focus:border-cyan-400/40 resize-y"
                      style={{ background: '#091D35' }}
                    />
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        );
      })()}

      {/* ═══ Tab: Idioma ═══ */}
      {tab === 'idioma' && (
        <div className="space-y-4">
          <Panel title={t('language.title')}>
            <p className="text-[10px] text-gray-500 mb-3">
              {t('language.desc')}
            </p>
            <select
              value={defaultLocale}
              onChange={e => setDefaultLocale(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-sm text-white border border-white/10 outline-none focus:border-cyan-400/40"
              style={{ background: '#091D35' }}
            >
              <option value="pt-BR">{t('language.ptBR')}</option>
              <option value="pt-PT">{t('language.ptPT')}</option>
              <option value="es-ES">{t('language.esES')}</option>
              <option value="en-US">{t('language.enUS')}</option>
            </select>
            <p className="text-[10px] text-gray-600 mt-2">
              {t('language.hint')}
            </p>
          </Panel>
        </div>
      )}

      {/* ═══ Tab: Branding ═══ */}
      {tab === 'branding' && (
        <div className="space-y-4">
          <Panel title={t('branding.subdomain')}>
            <div className="flex items-center gap-2">
              <Globe size={14} className="text-cyan-400 shrink-0" />
              <div className="flex items-center flex-1 gap-0 rounded-lg border border-white/10 overflow-hidden" style={{ background: '#091D35' }}>
                <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="minha-empresa" className="flex-1 px-3 py-2.5 bg-transparent text-sm text-white outline-none placeholder:text-white/30" />
                <span className="px-3 py-2.5 text-sm text-gray-500 border-l border-white/10 whitespace-nowrap">.{ROOT_DOMAIN}</span>
              </div>
            </div>
            {slug && <p className="text-[10px] text-gray-500 mt-2"><span className="text-cyan-400">{t('branding.loginUrl', { slug, root: ROOT_DOMAIN })}</span></p>}

            {/* Vincular ao Vercel — emite SSL e habilita o subdomínio em prod */}
            <div className="mt-4 pt-4 border-t border-white/[0.06]">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-[12px] text-white/85 font-medium">{t('branding.vercelTitle')}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{t('branding.vercelDesc')}</p>
                </div>
                <button
                  type="button"
                  disabled={vinculando || !slug}
                  onClick={async () => {
                    setVinculando(true);
                    setVincularMsg(null);
                    const r = await vincularDominioVercel(empresaId);
                    setVincularMsg({ ok: !!r.success, text: r.success ? r.message : (r.error || t('uploadFailed')) });
                    setVinculando(false);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold border border-cyan-400/30 text-cyan-300 hover:bg-cyan-400/10 disabled:opacity-50 transition-colors"
                >
                  {vinculando ? <Loader2 size={12} className="animate-spin" /> : <Globe size={12} />}
                  {vinculando ? t('branding.linking') : t('branding.linkVercel')}
                </button>
              </div>
              {vincularMsg && (
                <p className={`text-[11px] mt-2 ${vincularMsg.ok ? 'text-emerald-300/85' : 'text-red-300/85'}`}>
                  {vincularMsg.text}
                </p>
              )}
            </div>
          </Panel>

          <Panel title={t('branding.logoTitle')}>
            <div className="flex items-start gap-4">
              <div className="w-20 h-20 rounded-xl border border-white/10 flex items-center justify-center shrink-0 overflow-hidden" style={{ background: '#091D35' }}>
                {branding.logo_url ? <img src={branding.logo_url} alt="Logo" className="w-full h-full object-contain p-1" /> : <span className="text-[10px] text-gray-600">{t('branding.noLogo')}</span>}
              </div>
              <div className="flex-1 space-y-2">
                <label className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium border border-white/[0.06] text-gray-300 hover:border-cyan-400/30 hover:bg-cyan-400/5 transition-all cursor-pointer" style={{ background: '#091D35' }}>
                  {uploading ? <Loader2 size={14} className="animate-spin text-cyan-400" /> : <Upload size={14} className="text-cyan-400" />}
                  {uploading ? t('branding.uploading') : t('branding.uploadLogo')}
                  <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={handleLogoUpload} className="hidden" disabled={uploading} />
                </label>
                {branding.logo_url && (
                  <button onClick={() => updateBranding('logo_url', null)} className="flex items-center gap-1.5 text-[10px] text-red-400/70 hover:text-red-400"><Trash2 size={10} /> {t('branding.removeLogo')}</button>
                )}
                <p className="text-[10px] text-gray-600">{t('branding.logoHint')}</p>
              </div>
            </div>
          </Panel>

          <Panel title={t('branding.colorsTitle')}>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'font_color', label: t('branding.labels.font_color') },
                { key: 'font_color_secondary', label: t('branding.labels.font_color_secondary') },
                { key: 'primary_color', label: t('branding.labels.primary_color') },
                { key: 'primary_color_end', label: t('branding.labels.primary_color_end') },
                { key: 'accent_color', label: t('branding.labels.accent_color') },
                { key: 'bg_gradient_start', label: t('branding.labels.bg_gradient_start') },
                { key: 'bg_gradient_end', label: t('branding.labels.bg_gradient_end') },
              ].map(item => (
                <div key={item.key}>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">{item.label}</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={branding[item.key] || '#000000'} onChange={e => updateBranding(item.key, e.target.value)}
                      className="w-8 h-8 rounded-lg border border-white/10 cursor-pointer bg-transparent" />
                    <input type="text" value={branding[item.key] || ''} onChange={e => updateBranding(item.key, e.target.value)}
                      placeholder="#000000" className="flex-1 px-2 py-1.5 rounded-lg text-xs text-white border border-white/10 outline-none focus:border-cyan-400/40 font-mono" style={{ background: '#091D35' }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">{t('branding.subtitle')}</label>
              <input value={branding.login_subtitle || ''} onChange={e => updateBranding('login_subtitle', e.target.value)}
                placeholder={t('branding.subtitlePlaceholder')} className="w-full px-3 py-2.5 rounded-lg text-sm text-white border border-white/10 outline-none focus:border-cyan-400/40" style={{ background: '#091D35' }} />
            </div>
          </Panel>

          <Panel title={t('branding.previewTitle')}>
            <div className="rounded-xl overflow-hidden border border-white/10" style={{ background: `linear-gradient(180deg, ${branding.bg_gradient_start} 0%, ${branding.bg_gradient_end} 100%)`, minHeight: '200px' }}>
              <div className="flex flex-col items-center justify-center py-8 px-6">
                {branding.logo_url ? <img src={branding.logo_url} alt="Preview" className="h-10 object-contain mb-3" />
                  : <span className="text-2xl font-bold mb-2" style={{ color: branding.accent_color }}>{empresa?.nome || 'Empresa'}</span>}
                <p className="text-sm font-semibold mb-1" style={{ color: branding.font_color || '#FFFFFF' }}>{branding.login_subtitle || t('branding.subtitlePlaceholder')}</p>
                <p className="text-[10px] mb-4" style={{ color: branding.font_color_secondary || '#FFFFFF99' }}>{t('branding.previewSubtitle')}</p>
                <div className="w-full max-w-[240px]">
                  <div className="w-full py-2.5 px-3 rounded-lg border border-white/15 bg-white/[0.08] text-white/40 text-xs text-center">{t('branding.previewEmail')}</div>
                  <div className="w-full mt-2 py-2.5 rounded-lg text-white text-xs font-bold text-center"
                    style={{ background: `linear-gradient(135deg, ${branding.primary_color}, ${branding.primary_color_end})` }}>{t('branding.previewButton')}</div>
                </div>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {/* ═══ Tab: IA ═══ */}
      {tab === 'ai' && (
        <div className="space-y-4">
          <Panel title={t('ai.defaultModel')}>
            <p className="text-[11px] text-gray-500 mb-3">{t('ai.defaultModelDesc')}</p>
            <select value={config.ai.modelo_padrao} onChange={e => updateAI('modelo_padrao', e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-sm text-white border border-white/10 outline-none focus:border-cyan-400/40" style={{ background: '#091D35' }}>
              {MODELOS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </Panel>

          <Panel title={t('ai.taskModels')}>
            <p className="text-[11px] text-gray-500 mb-3">{t('ai.taskModelsDesc')}</p>
            {(() => {
              const porFase = AI_TASKS.reduce((acc: any, task: any) => {
                (acc[task.fase] = acc[task.fase] || []).push(task);
                return acc;
              }, {} as any);
              return Object.entries(porFase).map(([fase, tasks]: [string, any]) => (
                <div key={fase} className="mb-4 last:mb-0">
                  <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-2">{fase}</p>
                  <div className="space-y-1.5">
                    {tasks.map((task: any) => {
                      const atual = config.ai.modelos?.[task.key] || '';
                      return (
                        <div key={task.key} className="flex items-center gap-2">
                          <span className="flex-1 text-xs text-gray-300">{task.label}</span>
                          <select value={atual}
                            onChange={e => {
                              const novo = { ...(config.ai.modelos || {}) };
                              if (e.target.value) novo[task.key] = e.target.value;
                              else delete novo[task.key];
                              updateAI('modelos', novo);
                            }}
                            className="px-2 py-1 rounded text-[11px] text-white border border-white/10 outline-none focus:border-cyan-400/40"
                            style={{ background: '#091D35', minWidth: 180 }}>
                            <option value="">{t('ai.useDefault', { model: MODELOS.find(m => m.id === config.ai.modelo_padrao)?.label || 'default' })}</option>
                            {MODELOS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ));
            })()}
          </Panel>
          <Panel title={t('ai.apiKeys')}>
            <p className="text-[10px] text-gray-500 mb-3">{t('ai.apiKeysDesc')}</p>
            {[
              { key: 'anthropic_key', label: 'Anthropic (Claude)', placeholder: 'sk-ant-...' },
              { key: 'gemini_key', label: 'Google (Gemini)', placeholder: 'AIzaSy...' },
              { key: 'openai_key', label: 'OpenAI (GPT)', placeholder: 'sk-proj-...' },
            ].map(item => (
              <div key={item.key} className="mb-3">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">{item.label}</label>
                <div className="relative">
                  <input type={showKeys[item.key] ? 'text' : 'password'} value={config.ai[item.key] || ''} onChange={e => updateAI(item.key, e.target.value || null)}
                    placeholder={item.placeholder} className="w-full px-3 py-2.5 pr-10 rounded-lg text-sm text-white border border-white/10 outline-none focus:border-cyan-400/40" style={{ background: '#091D35' }} />
                  <button onClick={() => setShowKeys(prev => ({ ...prev, [item.key]: !prev[item.key] }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                    {showKeys[item.key] ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            ))}
          </Panel>
        </div>
      )}

      {/* ═══ Tab: Cadência ═══ */}
      {tab === 'cadencia' && (
        <Panel title={t('cadence.title')}>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">{t('cadence.pillDay')}</label>
              <select value={config.cadencia.fase4_dia_pilula} onChange={e => updateCadencia('fase4_dia_pilula', parseInt(e.target.value))}
                className="w-full px-3 py-2.5 rounded-lg text-sm text-white border border-white/10 outline-none" style={{ background: '#091D35' }}>
                {dias.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">{t('cadence.pill2Day')}</label>
              <select value={config.cadencia.fase4_dia_pilula2 ?? 2} onChange={e => updateCadencia('fase4_dia_pilula2', parseInt(e.target.value))}
                className="w-full px-3 py-2.5 rounded-lg text-sm text-white border border-white/10 outline-none" style={{ background: '#091D35' }}>
                {dias.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">{t('cadence.evidenceDay')}</label>
              <select value={config.cadencia.fase4_dia_evidencia} onChange={e => updateCadencia('fase4_dia_evidencia', parseInt(e.target.value))}
                className="w-full px-3 py-2.5 rounded-lg text-sm text-white border border-white/10 outline-none" style={{ background: '#091D35' }}>
                {dias.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
          </div>
          <p className="text-[11px] text-gray-500">A 2ª pílula só é enviada nas semanas DUO (2 descritores). Semanas de implementação (4, 8, 12) não têm pílula nova.</p>
        </Panel>
      )}

      {/* ═══ Tab: Envios ═══ */}
      {tab === 'envios' && (
        <Panel title={t('sends.title')}>
          <div className="mb-3">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">{t('sends.email')}</label>
            <input value={config.envios.email_remetente || ''} onChange={e => updateEnvios('email_remetente', e.target.value || null)}
              placeholder="diagnostico@vertho.ai" className="w-full px-3 py-2.5 rounded-lg text-sm text-white border border-white/10 outline-none focus:border-cyan-400/40" style={{ background: '#091D35' }} />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">{t('sends.alias')}</label>
            <input value={config.envios.email_alias || ''} onChange={e => updateEnvios('email_alias', e.target.value || null)}
              placeholder="Vertho Mentor IA" className="w-full px-3 py-2.5 rounded-lg text-sm text-white border border-white/10 outline-none focus:border-cyan-400/40" style={{ background: '#091D35' }} />
          </div>
        </Panel>
      )}

      {/* Salvar */}
      <button onClick={handleSave} disabled={saving}
        className="w-full mt-6 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold text-white disabled:opacity-40"
        style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        {saving ? t('saving') : t('save')}
      </button>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <h3 className="text-sm font-semibold text-gray-300">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
