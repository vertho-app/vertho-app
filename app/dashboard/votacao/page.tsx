'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, Check, GripVertical, Plus, X, Send } from 'lucide-react';
import { loadCompetenciasParaVotar, salvarVoto } from '@/actions/votacao';
import BackButton from '@/components/back-button';

export default function VotacaoPage() {
  const t = useTranslations('Voting');
  const locale = useLocale();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [sugestao, setSugestao] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const router = useRouter();
  const supabase = getSupabase();

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      const result = await loadCompetenciasParaVotar();
      if (result.error) setError(result.error);
      else {
        setData(result);
        // Se já votou, a tela read-only será exibida
      }
      setLoading(false);
    }
    init();
  }, []);

  function toggleComp(nome: string) {
    setSaved(false);
    setSelected(prev => {
      if (prev.includes(nome)) return prev.filter(n => n !== nome);
      if (prev.length >= 5) { toast(t('toast.max')); return prev; }
      return [...prev, nome];
    });
  }

  function moveUp(idx: number) {
    if (idx === 0) return;
    setSaved(false);
    setSelected(prev => {
      const arr = [...prev];
      [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
      return arr;
    });
  }

  function moveDown(idx: number) {
    if (idx >= selected.length - 1) return;
    setSaved(false);
    setSelected(prev => {
      const arr = [...prev];
      [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
      return arr;
    });
  }

  async function handleSalvar() {
    if (selected.length !== 5) { toast(t('toast.exactly')); return; }
    setSaving(true);
    const r = await salvarVoto(selected, sugestao);
    setSaving(false);
    if (r.error) { toast.error(r.error); }
    else { setSaved(true); toast.success(t('toast.saved')); setTimeout(() => router.push('/dashboard'), 1500); }
  }

  if (loading) return <div className="flex items-center justify-center h-[60dvh]"><Loader2 size={32} className="animate-spin text-brand-400" /></div>;
  if (error) return (
    <div className="max-w-[600px] mx-auto px-5 py-10 text-center">
      <p className="text-gray-400 mb-4">{error}</p>
      <button onClick={() => router.back()} className="text-brand-400 text-sm hover:underline">{t('back')}</button>
    </div>
  );
  if (!data) return null;

  const jaVotou = !!data.votoExistente;
  const available = (data.competencias || []).filter((c: any) => !selected.includes(c.nome));

  // Tela read-only se já votou
  if (jaVotou) return (
    <div className="max-w-[640px] mx-auto px-5 py-6">
      <BackButton />
      <div className="rounded-2xl border border-green-400/20 p-6 text-center" style={{ background: 'rgba(16,185,129,0.06)' }}>
        <Check size={48} className="text-green-400 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-white mb-1">{t('alreadyVoted.title')}</h2>
        <p className="text-sm text-gray-400 mb-5">
          {t('alreadyVoted.savedAt', { date: new Date(data.votoExistente.votado_em).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) })}
        </p>
        <div className="space-y-2 text-left mb-4">
          {(data.votoExistente.competencias_escolhidas || []).map((nome: string, idx: number) => (
            <div key={nome} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
              <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 ${
                idx === 0 ? 'bg-amber-400/20 text-amber-400' : 'bg-brand-400/15 text-brand-400'
              }`}>{idx + 1}</span>
              <span className="text-sm font-medium text-white">{nome}</span>
            </div>
          ))}
        </div>
        {data.votoExistente.sugestao_nova && (
          <p className="text-xs text-gray-500 text-left">{t('suggestionLabel')} <span className="text-amber-300">{data.votoExistente.sugestao_nova}</span></p>
        )}
      </div>
      <button onClick={() => router.push('/dashboard')}
        className="w-full mt-4 py-3 rounded-xl font-bold text-gray-300 border border-white/10 hover:bg-white/5 transition">
        {t('backDashboard')}
      </button>
    </div>
  );

  return (
    <div className="max-w-[640px] mx-auto px-5 py-6">
      <BackButton />

      <header className="mb-6">
        <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-brand-400 mb-2">{t('eyebrow')}</p>
        <h1 className="text-2xl font-bold text-white mb-1">{t('title', { name: data.colaborador.nome?.split(' ')[0] })}</h1>
        <p className="text-sm text-gray-400">
          {t('role')}: <span className="text-white font-medium">{data.colaborador.cargo}</span> · {t('subtitle')}
        </p>
      </header>

      {/* Selecionadas (ordenáveis com drag & drop) */}
      <section className="mb-6">
        <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-brand-400 mb-1">
          {t('selectedTitle', { count: selected.length })}
        </p>
        <p className="text-[11px] text-gray-500 mb-3">
          {t('selectedHelp')}
        </p>
        {selected.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-gray-500">
            {t('emptySelected')}
          </div>
        ) : (
          <div className="space-y-1.5">
            {selected.map((nome, idx) => (
              <div key={nome}
                draggable
                onDragStart={() => { setDragIdx(idx); setSaved(false); }}
                onDragOver={e => { e.preventDefault(); setDragOverIdx(idx); }}
                onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                onDrop={() => {
                  if (dragIdx === null || dragIdx === idx) return;
                  setSelected(prev => {
                    const arr = [...prev];
                    const [moved] = arr.splice(dragIdx, 1);
                    arr.splice(idx, 0, moved);
                    return arr;
                  });
                  setDragIdx(null);
                  setDragOverIdx(null);
                }}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all cursor-grab active:cursor-grabbing ${
                  dragOverIdx === idx && dragIdx !== idx ? 'border-brand-400 bg-brand-400/10' : 'border-brand-400/20'
                } ${dragIdx === idx ? 'opacity-40' : ''}`}
                style={{ background: dragOverIdx === idx && dragIdx !== idx ? undefined : '#0F2A4A' }}>
                <GripVertical size={14} className="text-gray-600 shrink-0" />
                <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 ${
                  idx === 0 ? 'bg-amber-400/20 text-amber-400' : 'bg-brand-400/15 text-brand-400'
                }`}>
                  {idx + 1}
                </span>
                <span className="flex-1 text-sm font-medium text-white">{nome}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => moveUp(idx)} disabled={idx === 0}
                    className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-white hover:bg-white/5 disabled:opacity-20 text-xs">▲</button>
                  <button onClick={() => moveDown(idx)} disabled={idx >= selected.length - 1}
                    className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-white hover:bg-white/5 disabled:opacity-20 text-xs">▼</button>
                  <button onClick={() => { setSaved(false); setSelected(prev => prev.filter(n => n !== nome)); }}
                    className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-red-400 hover:bg-red-400/10">
                    <X size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Todas as competências */}
      <section className="mb-6">
        <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-gray-400 mb-2">
          {t('availableTitle', { count: available.length })}
        </p>
        <div className="space-y-1">
          {available.map((c: any) => (
            <button key={c.nome} onClick={() => toggleComp(c.nome)}
              className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl border border-white/[0.06] hover:border-brand-400/30 hover:bg-white/[0.02] transition-all"
              style={{ background: '#091D35' }}>
              <div className="w-5 h-5 rounded border border-white/15 flex items-center justify-center shrink-0">
                {selected.includes(c.nome) && <Check size={12} className="text-brand-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{c.nome}</p>
                {c.descricao && <p className="text-[11px] text-gray-500 line-clamp-1">{c.descricao}</p>}
              </div>
              {c.cod_comp && <span className="text-[9px] font-mono text-gray-600 shrink-0">{c.cod_comp}</span>}
            </button>
          ))}
        </div>
      </section>

      {/* Sugestão de nova competência */}
      <section className="mb-6">
        <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-gray-400 mb-2 flex items-center gap-1.5">
          <Plus size={12} /> {t('suggestionTitle')}
        </p>
        <input
          type="text"
          value={sugestao}
          onChange={e => { setSugestao(e.target.value); setSaved(false); }}
          placeholder={t('suggestionPlaceholder')}
          className="w-full px-4 py-3 rounded-xl border border-white/10 bg-[#091D35] text-white text-sm outline-none focus:border-brand-400 placeholder:text-gray-600"
        />
      </section>

      {/* Botão enviar */}
      <button onClick={handleSalvar} disabled={saving || selected.length !== 5}
        className="w-full py-4 rounded-2xl font-bold text-base transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        style={{
          background: saved ? 'linear-gradient(135deg, #10B981, #059669)' : 'linear-gradient(135deg, #0D9488, #34C5CC)',
          color: '#062032',
        }}>
        {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <Check size={16} /> : <Send size={16} />}
        {saving ? t('saving') : saved ? t('savedButton') : t('submit', { count: selected.length })}
      </button>

    </div>
  );
}
