'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Save, Loader2, CheckCircle, AlertTriangle, X,
  Brain, Clock, Mail, Eye, EyeOff, Palette, Upload, Trash2, Globe, Users
} from 'lucide-react';
import { loadConfig, salvarConfig, salvarBranding, salvarSlug, loadEquipe, atualizarRole } from './actions';
import { limparSessoesAntigas, limparSessoesTeste } from '@/app/actions/manutencao';

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
import { AI_TASKS, MODELOS_DISPONIVEIS } from '@/lib/ai-tasks';
const MODELOS = MODELOS_DISPONIVEIS;

const DEFAULT_CONFIG = {
  ai: { modelo_padrao: 'claude-sonnet-4-6', modelos: {}, anthropic_key: null, gemini_key: null, openai_key: null, thinking: false },
  cadencia: { fase4_dia_pilula: 1, fase4_dia_evidencia: 4, fase4_hora: 8, email_ativo: true, whatsapp_ativo: true },
  envios: { email_remetente: null, email_alias: null },
};

export default function ConfigPage({ params }) {
  const { empresaId } = use(params);
  const router = useRouter();
  const [empresa, setEmpresa] = useState(null);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [tab, setTab] = useState('equipe');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showKeys, setShowKeys] = useState({});

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

  useEffect(() => {
    loadConfig(empresaId).then(r => {
      if (r.success) {
        setEmpresa(r.empresa);
        setConfig({ ...DEFAULT_CONFIG, ...(r.empresa.sys_config || {}) });
        const ui = r.empresa.ui_config || {};
        setBranding(prev => ({ ...prev, ...ui }));
        setSlug(r.empresa.slug || '');
      }
      setLoading(false);
    });
    loadEquipe(empresaId).then(setEquipe);
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

  async function handleSave() {
    setSaving(true); setError('');
    if (tab === 'branding') {
      const [rBranding, rSlug] = await Promise.all([
        salvarBranding(empresaId, branding),
        slug ? salvarSlug(empresaId, slug) : { success: true },
      ]);
      setSaving(false);
      if (!rBranding.success) { setError(rBranding.error); return; }
      if (!rSlug.success) { setError(rSlug.error); return; }
      if (rSlug.slug) setSlug(rSlug.slug);
      setSuccess('Branding salvo!'); setTimeout(() => setSuccess(''), 3000);
    } else {
      const r = await salvarConfig(empresaId, config);
      setSaving(false);
      if (r.success) { setSuccess('Salvo!'); setTimeout(() => setSuccess(''), 3000); }
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
      const res = await fetch('/api/upload-logo', { method: 'POST', body: fd });
      const json = await res.json();
      if (json.success) {
        setBranding(prev => ({ ...prev, logo_url: json.url }));
        setSuccess('Logo enviado!'); setTimeout(() => setSuccess(''), 3000);
      } else { setError(json.error); }
    } catch (err) { setError(err.message); }
    setUploading(false);
  }

  if (loading) return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <img src="/logo-vertho.png" alt="Vertho" style={{ height: '26px' }} className="shrink-0" />
        <div className="text-center flex-1 px-4">
          <h1 className="text-lg font-bold text-white">Configurações</h1>
          <p className="text-xs text-gray-500">{empresa?.nome}</p>
        </div>
        <button onClick={() => router.push(`/admin/empresas/${empresaId}`)}
          className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-white transition-colors shrink-0">
          <ArrowLeft size={16} /> Voltar
        </button>
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
          { id: 'equipe', label: 'Equipe', icon: Users },
          { id: 'branding', label: 'Branding', icon: Palette },
          { id: 'ai', label: 'Inteligência Artificial', icon: Brain },
          { id: 'cadencia', label: 'Automações', icon: Clock },
          { id: 'envios', label: 'Envios', icon: Mail },
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
          <Panel title={`Colaboradores (${equipe.length})`}>
            <p className="text-[10px] text-gray-500 mb-3">Altere o papel de cada colaborador. O papel define o que ele ve no dashboard.</p>
            {equipe.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-4">Nenhum colaborador cadastrado</p>
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
                      <option value="colaborador">Colaborador</option>
                      <option value="gestor">Gestor</option>
                      <option value="rh">RH / Diretor</option>
                    </select>
                    {roleUpdating === c.id && <Loader2 size={14} className="animate-spin text-cyan-400 shrink-0" />}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* ═══ Tab: Branding ═══ */}
      {tab === 'branding' && (
        <div className="space-y-4">
          <Panel title="Subdomínio">
            <div className="flex items-center gap-2">
              <Globe size={14} className="text-cyan-400 shrink-0" />
              <div className="flex items-center flex-1 gap-0 rounded-lg border border-white/10 overflow-hidden" style={{ background: '#091D35' }}>
                <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="minha-empresa" className="flex-1 px-3 py-2.5 bg-transparent text-sm text-white outline-none placeholder:text-white/30" />
                <span className="px-3 py-2.5 text-sm text-gray-500 border-l border-white/10 whitespace-nowrap">.vertho.com.br</span>
              </div>
            </div>
            {slug && <p className="text-[10px] text-gray-500 mt-2">Login: <span className="text-cyan-400">{slug}.vertho.com.br/login</span></p>}
          </Panel>

          <Panel title="Logo da Empresa">
            <div className="flex items-start gap-4">
              <div className="w-20 h-20 rounded-xl border border-white/10 flex items-center justify-center shrink-0 overflow-hidden" style={{ background: '#091D35' }}>
                {branding.logo_url ? <img src={branding.logo_url} alt="Logo" className="w-full h-full object-contain p-1" /> : <span className="text-[10px] text-gray-600">Sem logo</span>}
              </div>
              <div className="flex-1 space-y-2">
                <label className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium border border-white/[0.06] text-gray-300 hover:border-cyan-400/30 hover:bg-cyan-400/5 transition-all cursor-pointer" style={{ background: '#091D35' }}>
                  {uploading ? <Loader2 size={14} className="animate-spin text-cyan-400" /> : <Upload size={14} className="text-cyan-400" />}
                  {uploading ? 'Enviando...' : 'Upload Logo'}
                  <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={handleLogoUpload} className="hidden" disabled={uploading} />
                </label>
                {branding.logo_url && (
                  <button onClick={() => updateBranding('logo_url', null)} className="flex items-center gap-1.5 text-[10px] text-red-400/70 hover:text-red-400"><Trash2 size={10} /> Remover logo</button>
                )}
                <p className="text-[10px] text-gray-600">PNG, JPG, SVG ou WebP. Max 2MB.</p>
              </div>
            </div>
          </Panel>

          <Panel title="Cores do Login">
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'font_color', label: 'Cor da Fonte' },
                { key: 'font_color_secondary', label: 'Fonte Secundária' },
                { key: 'primary_color', label: 'Cor do Botão (inicio)' },
                { key: 'primary_color_end', label: 'Cor do Botão (fim)' },
                { key: 'accent_color', label: 'Cor de Destaque' },
                { key: 'bg_gradient_start', label: 'Fundo (topo)' },
                { key: 'bg_gradient_end', label: 'Fundo (base)' },
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
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Subtítulo do Login</label>
              <input value={branding.login_subtitle || ''} onChange={e => updateBranding('login_subtitle', e.target.value)}
                placeholder="Sua jornada de desenvolvimento" className="w-full px-3 py-2.5 rounded-lg text-sm text-white border border-white/10 outline-none focus:border-cyan-400/40" style={{ background: '#091D35' }} />
            </div>
          </Panel>

          <Panel title="Preview do Login">
            <div className="rounded-xl overflow-hidden border border-white/10" style={{ background: `linear-gradient(180deg, ${branding.bg_gradient_start} 0%, ${branding.bg_gradient_end} 100%)`, minHeight: '200px' }}>
              <div className="flex flex-col items-center justify-center py-8 px-6">
                {branding.logo_url ? <img src={branding.logo_url} alt="Preview" className="h-10 object-contain mb-3" />
                  : <span className="text-2xl font-bold mb-2" style={{ color: branding.accent_color }}>{empresa?.nome || 'Empresa'}</span>}
                <p className="text-sm font-semibold mb-1" style={{ color: branding.font_color || '#FFFFFF' }}>{branding.login_subtitle || 'Sua jornada de desenvolvimento'}</p>
                <p className="text-[10px] mb-4" style={{ color: branding.font_color_secondary || '#FFFFFF99' }}>Digite seu e-mail para acessar</p>
                <div className="w-full max-w-[240px]">
                  <div className="w-full py-2.5 px-3 rounded-lg border border-white/15 bg-white/[0.08] text-white/40 text-xs text-center">seu@email.com</div>
                  <div className="w-full mt-2 py-2.5 rounded-lg text-white text-xs font-bold text-center"
                    style={{ background: `linear-gradient(135deg, ${branding.primary_color}, ${branding.primary_color_end})` }}>Entrar</div>
                </div>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {/* ═══ Tab: IA ═══ */}
      {tab === 'ai' && (
        <div className="space-y-4">
          <Panel title="Modelo Padrão">
            <p className="text-[11px] text-gray-500 mb-3">Usado em todas as tarefas que não têm um modelo específico configurado abaixo</p>
            <select value={config.ai.modelo_padrao} onChange={e => updateAI('modelo_padrao', e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-sm text-white border border-white/10 outline-none focus:border-cyan-400/40" style={{ background: '#091D35' }}>
              {MODELOS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </Panel>

          <Panel title="Modelos por Tarefa">
            <p className="text-[11px] text-gray-500 mb-3">Sobrescreva o modelo padrão em tarefas específicas. Deixe "Usar padrão" para herdar.</p>
            {(() => {
              const porFase = AI_TASKS.reduce((acc, t) => {
                (acc[t.fase] = acc[t.fase] || []).push(t);
                return acc;
              }, {});
              return Object.entries(porFase).map(([fase, tasks]) => (
                <div key={fase} className="mb-4 last:mb-0">
                  <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-2">{fase}</p>
                  <div className="space-y-1.5">
                    {tasks.map(t => {
                      const atual = config.ai.modelos?.[t.key] || '';
                      return (
                        <div key={t.key} className="flex items-center gap-2">
                          <span className="flex-1 text-xs text-gray-300">{t.label}</span>
                          <select value={atual}
                            onChange={e => {
                              const novo = { ...(config.ai.modelos || {}) };
                              if (e.target.value) novo[t.key] = e.target.value;
                              else delete novo[t.key];
                              updateAI('modelos', novo);
                            }}
                            className="px-2 py-1 rounded text-[11px] text-white border border-white/10 outline-none focus:border-cyan-400/40"
                            style={{ background: '#091D35', minWidth: 180 }}>
                            <option value="">Usar padrão ({MODELOS.find(m => m.id === config.ai.modelo_padrao)?.label || 'default'})</option>
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
          <Panel title="API Keys do Cliente (opcional)">
            <p className="text-[10px] text-gray-500 mb-3">Se preenchido, usa as chaves do cliente em vez das globais</p>
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
        <Panel title="Fase 4 — Cadência Semanal">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Dia da Pílula</label>
              <select value={config.cadencia.fase4_dia_pilula} onChange={e => updateCadencia('fase4_dia_pilula', parseInt(e.target.value))}
                className="w-full px-3 py-2.5 rounded-lg text-sm text-white border border-white/10 outline-none" style={{ background: '#091D35' }}>
                {DIAS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Dia da Evidência</label>
              <select value={config.cadencia.fase4_dia_evidencia} onChange={e => updateCadencia('fase4_dia_evidencia', parseInt(e.target.value))}
                className="w-full px-3 py-2.5 rounded-lg text-sm text-white border border-white/10 outline-none" style={{ background: '#091D35' }}>
                {DIAS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
          </div>
        </Panel>
      )}

      {/* ═══ Tab: Envios ═══ */}
      {tab === 'envios' && (
        <Panel title="E-mail Remetente">
          <div className="mb-3">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">E-mail</label>
            <input value={config.envios.email_remetente || ''} onChange={e => updateEnvios('email_remetente', e.target.value || null)}
              placeholder="diagnostico@vertho.ai" className="w-full px-3 py-2.5 rounded-lg text-sm text-white border border-white/10 outline-none focus:border-cyan-400/40" style={{ background: '#091D35' }} />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Nome (alias)</label>
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
        {saving ? 'Salvando...' : 'Salvar Configurações'}
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
