'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, Mail, Briefcase, Building2, LogOut, Shield, Camera, Palette, Trash2, Check, Languages } from 'lucide-react';
import { loadPerfil, salvarFotoPerfil, salvarAvatarPreset, removerAvatar, salvarLocalePerfil } from './perfil-actions';
import { PageContainer, PageHero, GlassCard } from '@/components/page-shell';
import { AVATAR_PRESETS, getPreset } from '@/lib/avatar-presets';
import { localeCookieName } from '@/lib/i18n';
import { locales } from '@/i18n/routing';

const ROLE_LABELS = {
  colaborador: { labelKey: 'colaborador', color: '#6B7280' },
  gestor: { labelKey: 'gestor', color: '#F59E0B' },
  rh: { labelKey: 'rh', color: '#00B4D8' },
};

// ── Avatar render ────────────────────────────────────────────────────────
// Prioridade: foto → preset → iniciais
function Avatar({ colab, size = 80 }) {
  const initials = (colab?.nome_completo || '').split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase() || 'U';

  if (colab?.foto_url) {
    return (
      <img src={colab.foto_url} alt={colab.nome_completo || 'Foto'}
        style={{ width: size, height: size }}
        className="rounded-full object-cover border-2 border-white/10 shrink-0" />
    );
  }

  if (colab?.avatar_preset) {
    const p = getPreset(colab.avatar_preset);
    return (
      <div style={{ width: size, height: size, background: p.bg, fontSize: size * 0.5 }}
        className="rounded-full flex items-center justify-center border-2 border-white/10 shrink-0">
        <span>{p.emoji}</span>
      </div>
    );
  }

  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-extrabold border-2 border-white/10 shrink-0"
      style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)', width: size, height: size, fontSize: size * 0.3 }}>
      {initials}
    </div>
  );
}

export default function PerfilPage() {
  const t = useTranslations('Profile');
  const common = useTranslations('Common');
  const locale = useLocale();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userEmail, setUserEmail] = useState(null);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingLocale, setSavingLocale] = useState(false);
  const fileRef = useRef(null);
  const router = useRouter();
  const supabase = getSupabase();

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      setUserEmail(user.email);
      const result = await loadPerfil();
      if (result.error) setError(result.error);
      else setData(result);
      setLoading(false);
    }
    init();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  async function handleFotoChange(e) {
    const file = e.target.files?.[0];
    if (file) e.target.value = '';
    if (!file || !userEmail) return;
    const MAX = 2 * 1024 * 1024; // 2 MB
    if (file.size > MAX) { alert(t('photoTooLarge')); return; }

    setSaving(true);
    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(',')[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const result = await salvarFotoPerfil({ base64, mime: file.type });
      if (result.error) setError(result.error);
      else {
        setData(prev => ({ ...prev, colaborador: { ...prev.colaborador, foto_url: result.foto_url, avatar_preset: null } }));
        setShowPicker(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSelectPreset(id) {
    if (!userEmail) return;
    setSaving(true);
    const result = await salvarAvatarPreset(id);
    setSaving(false);
    if (result.error) setError(result.error);
    else {
      setData(prev => ({ ...prev, colaborador: { ...prev.colaborador, avatar_preset: id, foto_url: null } }));
      setShowPicker(false);
    }
  }

  async function handleRemoverAvatar() {
    if (!userEmail) return;
    setSaving(true);
    const result = await removerAvatar();
    setSaving(false);
    if (result.error) setError(result.error);
    else {
      setData(prev => ({ ...prev, colaborador: { ...prev.colaborador, avatar_preset: null, foto_url: null } }));
      setShowPicker(false);
    }
  }

  async function handleLocaleChange(nextLocale) {
    document.cookie = `${localeCookieName}=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
    setData(prev => prev ? ({ ...prev, colaborador: { ...prev.colaborador, locale: nextLocale } }) : prev);
    setSavingLocale(true);
    const result = await salvarLocalePerfil(nextLocale);
    setSavingLocale(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  if (loading) return <div className="flex items-center justify-center h-[60dvh]"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;
  if (error && !data) return <PageContainer><p className="text-center text-gray-400">{error}</p></PageContainer>;
  if (!data) return null;

  const { colaborador, empresaNome } = data;
  const role = ROLE_LABELS[colaborador.role] || ROLE_LABELS.colaborador;

  return (
    <PageContainer className="space-y-5 max-w-[720px]">
      <PageHero eyebrow={t('heroEyebrow')} title={colaborador.nome_completo} subtitle={colaborador.cargo} />

      {/* Avatar + role badge + ação de trocar */}
      <div className="flex items-center gap-4">
        <Avatar colab={colaborador} size={80} />
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full inline-flex items-center gap-1"
            style={{ color: role.color, background: role.color + '18' }}>
            <Shield size={11} /> {t(`roles.${role.labelKey}`)}
          </span>
          <button onClick={() => setShowPicker(v => !v)}
            className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300">
            <Camera size={12} /> {colaborador.foto_url || colaborador.avatar_preset ? t('changeAvatar') : t('addAvatar')}
          </button>
        </div>
      </div>

      {/* Picker de avatar */}
      {showPicker && (
        <GlassCard padding="p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-white flex items-center gap-2">
              <Palette size={14} className="text-cyan-400" /> {t('pickerTitle')}
            </p>
            {saving && <Loader2 size={14} className="animate-spin text-cyan-400" />}
          </div>

          {/* Upload */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <input ref={fileRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp" onChange={handleFotoChange} />
            <button onClick={() => fileRef.current?.click()}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-extrabold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
              <Camera size={13} /> {t('uploadPhoto')}
            </button>
            {(colaborador.foto_url || colaborador.avatar_preset) && (
              <button onClick={handleRemoverAvatar} disabled={saving}
                className="flex items-center gap-1 text-[11px] font-semibold text-red-400 hover:text-red-300 px-2 py-1">
                <Trash2 size={12} /> {t('remove')}
              </button>
            )}
          </div>

          {/* Grid de presets */}
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">{t('chooseAvatar')}</p>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
            {AVATAR_PRESETS.map(p => {
              const active = colaborador.avatar_preset === p.id && !colaborador.foto_url;
              return (
                <button key={p.id} onClick={() => handleSelectPreset(p.id)} disabled={saving}
                  className={`relative w-14 h-14 rounded-full flex items-center justify-center text-2xl transition-all hover:scale-110 active:scale-95 ${
                    active ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-[#0A1D35]' : 'ring-1 ring-white/10'
                  }`}
                  style={{ background: p.bg }}
                  title={p.id}>
                  <span>{p.emoji}</span>
                  {active && (
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-cyan-400 flex items-center justify-center ring-2 ring-[#0A1D35]">
                      <Check size={11} className="text-slate-900" strokeWidth={3} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </GlassCard>
      )}

      {error && (
        <p className="text-xs text-red-400 px-2">{error}</p>
      )}

      {/* Info card */}
      <GlassCard>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Mail size={16} className="text-gray-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">{t('fields.email')}</p>
              <p className="text-sm text-white truncate">{colaborador.email}</p>
            </div>
          </div>
          {colaborador.cargo && (
            <div className="flex items-center gap-3">
              <Briefcase size={16} className="text-gray-500 shrink-0" />
              <div>
                <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">{t('fields.role')}</p>
                <p className="text-sm text-white">{colaborador.cargo}</p>
              </div>
            </div>
          )}
          {colaborador.area_depto && (
            <div className="flex items-center gap-3">
              <Building2 size={16} className="text-gray-500 shrink-0" />
              <div>
                <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">{t('fields.department')}</p>
                <p className="text-sm text-white">{colaborador.area_depto}</p>
              </div>
            </div>
          )}
          {empresaNome && (
            <div className="flex items-center gap-3">
              <Building2 size={16} className="text-gray-500 shrink-0" />
              <div>
                <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">{t('fields.company')}</p>
                <p className="text-sm text-white">{empresaNome}</p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Languages size={16} className="text-gray-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">{t('fields.language')}</p>
              <div className="relative mt-1 max-w-xs">
                <select
                  value={colaborador.locale || locale}
                  onChange={e => handleLocaleChange(e.target.value)}
                  disabled={savingLocale}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 pr-9 text-sm text-white outline-none focus:border-cyan-400/60 disabled:opacity-60"
                >
                  {locales.map(item => (
                    <option key={item} value={item} className="bg-[#0d1426] text-white">
                      {common(`locales.${item}`)}
                    </option>
                  ))}
                </select>
                {savingLocale && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-cyan-400" />}
              </div>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Logout */}
      <button onClick={handleLogout}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-red-400 border border-red-400/20 hover:border-red-400/40 transition-all"
        style={{ background: 'rgba(239,68,68,0.06)' }}>
        <LogOut size={16} /> {t('logout')}
      </button>
    </PageContainer>
  );
}
