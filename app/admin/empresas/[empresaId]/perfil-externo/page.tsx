'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Loader2, Upload, RefreshCw, FileText, Eye, Trash2, X,
  CheckCircle, AlertTriangle, FileQuestion,
} from 'lucide-react';
import BackButton from '@/components/back-button';
import {
  listarPerfisExternos,
  uploadPerfilPdf,
  extrairPerfilExterno,
  deletarPerfilExterno,
  getEmpresaFonteExterna,
  setEmpresaFonteExterna,
  getPerfilPdfUrl,
  type ColaboradorPerfilExterno,
} from '@/actions/perfil-externo';

export default function PerfilExternoPage({ params }: { params: Promise<{ empresaId: string }> }) {
  const t = useTranslations('AdminExternalProfile');
  const { empresaId } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [colabs, setColabs] = useState<ColaboradorPerfilExterno[]>([]);
  const [fonte, setFonte] = useState<string | null>(null);
  const [acao, setAcao] = useState<{ id: string; tipo: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<{ colab: ColaboradorPerfilExterno; perfil: any } | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ colab: ColaboradorPerfilExterno; url: string } | null>(null);

  function flash(msg: string, ms = 3000) { setToast(msg); setTimeout(() => setToast(null), ms); }

  const refresh = useCallback(async () => {
    const r = await listarPerfisExternos(empresaId);
    setColabs(r.colaboradores);
    setFonte(r.fonte);
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function ativarFonte() {
    setAcao({ id: '_global', tipo: 'fonte' });
    const r = await setEmpresaFonteExterna(empresaId, 'opq32');
    setAcao(null);
    flash(r.success ? t('messages.opqEnabled') : t('messages.error', { error: r.error }));
    refresh();
  }

  async function desativarFonte() {
    if (!confirm(t('confirm.disableSource'))) return;
    setAcao({ id: '_global', tipo: 'fonte' });
    const r = await setEmpresaFonteExterna(empresaId, null);
    setAcao(null);
    flash(r.success ? t('messages.discEnabled') : t('messages.error', { error: r.error }));
    refresh();
  }

  async function handleUpload(colabId: string, file: File) {
    setAcao({ id: colabId, tipo: 'upload' });
    const fd = new FormData();
    fd.set('colab_id', colabId);
    fd.set('fonte', 'opq32');
    fd.set('file', file);
    const r = await uploadPerfilPdf(empresaId, fd);
    if (!r.success) { setAcao(null); flash(t('messages.error', { error: r.error }), 5000); return; }
    flash(t('messages.uploadExtracting'));

    // Encadeia extração
    const ex = await extrairPerfilExterno(empresaId, colabId);
    setAcao(null);
    flash(ex.success ? t('messages.extractedSuccess') : t('messages.extractionFailed', { error: ex.error }), 5000);
    refresh();
  }

  async function handleExtrair(colabId: string) {
    setAcao({ id: colabId, tipo: 'extrair' });
    const r = await extrairPerfilExterno(empresaId, colabId);
    setAcao(null);
    flash(r.success ? t('messages.extracted') : t('messages.error', { error: r.error }), 5000);
    refresh();
  }

  async function handleDelete(colab: ColaboradorPerfilExterno) {
    if (!confirm(t('confirm.removePdf', { name: colab.nome_completo }))) return;
    setAcao({ id: colab.id, tipo: 'delete' });
    const r = await deletarPerfilExterno(empresaId, colab.id);
    setAcao(null);
    flash(r.success ? t('messages.removed') : t('messages.error', { error: r.error }));
    refresh();
  }

  async function handleVerPdf(colab: ColaboradorPerfilExterno) {
    setAcao({ id: colab.id, tipo: 'preview' });
    const r = await getPerfilPdfUrl(empresaId, colab.id);
    setAcao(null);
    if (r.error || !r.url) { flash(t('messages.error', { error: r.error })); return; }
    setPdfPreview({ colab, url: r.url });
  }

  async function handleVerJson(colab: ColaboradorPerfilExterno) {
    // O JSON já vem em colab.resumo (parcial). Pra ver tudo, refaz query no servidor.
    // Por simplicidade, abrimos drawer com o que veio na listagem + chamamos servidor.
    setAcao({ id: colab.id, tipo: 'json' });
    const r = await listarPerfisExternos(empresaId);
    setAcao(null);
    const completo = r.colaboradores.find((c) => c.id === colab.id);
    // Carrega dados completos via re-query — precisa de helper específico, simplifico:
    // Usa campos resumidos. Pra ver completo, adicionar action depois.
    setDrawer({ colab: completo || colab, perfil: completo?.resumo });
  }

  if (loading) return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  const total = colabs.length;
  const comPdf = colabs.filter((c) => c.status !== 'sem_pdf').length;
  const extraidos = colabs.filter((c) => c.status === 'extraido').length;

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      {toast && <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold shadow-lg">{toast}</div>}

      {/* Header */}
      <BackButton onClick={() => router.push(`/admin/empresas/${empresaId}`)} />
      <div className="flex items-center gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <FileText size={20} className="text-cyan-400" /> {t('title')}
          </h1>
          <p className="text-xs text-gray-500">{t('subtitle')}</p>
        </div>
      </div>

      {/* Status fonte */}
      <div className={`rounded-xl p-4 mb-4 border ${fonte === 'opq32' ? 'border-cyan-400/30 bg-cyan-400/[0.06]' : 'border-white/[0.06] bg-white/[0.02]'}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs font-bold text-white">
              {fonte === 'opq32' ? t('source.opqActive') : t('source.discActive')}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
              {fonte === 'opq32'
                ? t('source.opqDescription')
                : t('source.discDescription')}
            </p>
          </div>
          {fonte === 'opq32' ? (
            <button onClick={desativarFonte} disabled={!!acao}
              className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-amber-300 border border-amber-400/30 hover:bg-amber-400/10 disabled:opacity-40">
              {t('source.useDisc')}
            </button>
          ) : (
            <button onClick={ativarFonte} disabled={!!acao}
              className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-cyan-300 border border-cyan-400/30 hover:bg-cyan-400/10 disabled:opacity-40">
              {t('source.activateOpq')}
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat label={t('stats.collaborators')} valor={total} />
        <Stat label={t('stats.withPdf')} valor={comPdf} acento={comPdf > 0 ? 'cyan' : undefined} />
        <Stat label={t('stats.extracted')} valor={extraidos} acento={extraidos > 0 ? 'green' : undefined} />
      </div>

      {/* Aviso sobre tipo de relatório */}
      <div className="rounded-xl p-3 mb-6 border border-amber-400/20 bg-amber-400/[0.04] text-[11px] text-amber-100/85 leading-relaxed">
        <strong className="text-amber-300">{t('warning.title')}</strong>{' '}
        <span className="text-amber-100/70">
          {t.rich('warning.body', {
            strong: chunks => <strong className="text-amber-100">{chunks}</strong>,
            code: chunks => <code className="text-amber-200">{chunks}</code>,
            mutedCode: chunks => <code className="text-amber-100/60">{chunks}</code>,
          })}
        </span>
      </div>

      {/* Tabela */}
      {colabs.length === 0 ? (
        <Empty />
      ) : (
        <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
          {colabs.map((c, i) => {
            const acaoAtiva = acao?.id === c.id;
            return (
              <div key={c.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-white/[0.04]' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white truncate">{c.nome_completo}</span>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="text-[11px] text-gray-500 truncate">
                    {c.cargo || '—'} · {c.email}
                    {c.resumo && (
                      <span className="text-cyan-400/70 ml-2">
                        · {t('row.summary', { high: c.resumo.altas, low: c.resumo.baixas, cns: c.resumo.cns ?? '—' })}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <FileInputButton onSelect={(f) => handleUpload(c.id, f)} disabled={acaoAtiva}
                    title={c.status === 'sem_pdf' ? t('row.uploadPdf') : t('row.replacePdf')}>
                    {acaoAtiva && acao?.tipo === 'upload' ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                    {c.status === 'sem_pdf' ? t('row.upload') : t('row.replace')}
                  </FileInputButton>

                  {c.status !== 'sem_pdf' && (
                    <>
                      <IconBtn title={t('row.reextract')} onClick={() => handleExtrair(c.id)} disabled={acaoAtiva}>
                        {acaoAtiva && acao?.tipo === 'extrair' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      </IconBtn>
                      <IconBtn title={t('row.viewPdf')} onClick={() => handleVerPdf(c)} disabled={acaoAtiva}>
                        {acaoAtiva && acao?.tipo === 'preview' ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}
                      </IconBtn>
                      <IconBtn title={t('row.remove')} onClick={() => handleDelete(c)} disabled={acaoAtiva} variant="danger">
                        <Trash2 size={12} />
                      </IconBtn>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* PDF preview */}
      {pdfPreview && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.85)' }} onClick={() => setPdfPreview(null)}>
          <div className="flex items-center justify-between p-4 text-white">
            <p className="text-sm font-bold truncate">PDF · {pdfPreview.colab.nome_completo}</p>
            <button onClick={() => setPdfPreview(null)} className="p-2 rounded-lg hover:bg-white/10"><X size={18} /></button>
          </div>
          <iframe src={pdfPreview.url} className="flex-1 w-full bg-white" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

// ── Componentes auxiliares ──

function Stat({ label, valor, acento }: { label: string; valor: number; acento?: 'cyan' | 'green' }) {
  const color = acento === 'cyan' ? '#34c5cc' : acento === 'green' ? '#34D399' : '#fff';
  return (
    <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: '#0F2A4A' }}>
      <p className="text-[10px] font-mono tracking-[0.2em] uppercase text-white/40 mb-1">{label}</p>
      <p className="text-2xl font-bold" style={{ color }}>{valor}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: ColaboradorPerfilExterno['status'] }) {
  const t = useTranslations('AdminExternalProfile');
  const cfg = {
    sem_pdf:        { label: t('badges.noPdf'),     icon: FileQuestion,  color: '#9ca3af', bg: 'rgba(156,163,175,0.1)', border: 'rgba(156,163,175,0.25)' },
    pdf_carregado:  { label: t('badges.pdfLoaded'), icon: AlertTriangle, color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)' },
    extraido:       { label: t('badges.extracted'),    icon: CheckCircle,   color: '#34d399', bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.3)' },
    erro_extracao:  { label: t('badges.error'),        icon: AlertTriangle, color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)' },
  }[status];
  const Icon = cfg.icon;
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-[0.06em]"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
      <Icon size={9} /> {cfg.label}
    </span>
  );
}

function FileInputButton({
  children, onSelect, disabled, title,
}: { children: React.ReactNode; onSelect: (f: File) => void; disabled?: boolean; title?: string }) {
  return (
    <label
      title={title}
      className={`relative inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
        disabled ? 'opacity-40 cursor-not-allowed border-white/[0.06]' : 'cursor-pointer text-cyan-300 border-cyan-400/30 hover:bg-cyan-400/10'
      }`}
    >
      {children}
      <input
        type="file"
        accept="application/pdf"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onSelect(f);
          e.target.value = '';
        }}
        className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
      />
    </label>
  );
}

function IconBtn({
  children, onClick, disabled, title, variant,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title: string;
  variant?: 'danger';
}) {
  const base = variant === 'danger'
    ? 'text-red-400/80 border-red-400/20 hover:bg-red-400/10 hover:border-red-400/40'
    : 'text-white/60 border-white/[0.06] hover:bg-white/[0.04] hover:text-white/85';
  return (
    <button title={title} onClick={onClick} disabled={disabled}
      className={`w-8 h-8 inline-flex items-center justify-center rounded-lg border transition-colors disabled:opacity-40 ${base}`}>
      {children}
    </button>
  );
}

function Empty() {
  const t = useTranslations('AdminExternalProfile');
  return (
    <div className="rounded-xl border border-white/[0.06] p-12 text-center" style={{ background: '#0F2A4A' }}>
      <FileQuestion size={32} className="mx-auto mb-3 text-gray-600" />
      <p className="text-sm text-gray-400">{t('empty.title')}</p>
      <p className="text-[11px] text-gray-500 mt-1">{t('empty.description')}</p>
    </div>
  );
}
