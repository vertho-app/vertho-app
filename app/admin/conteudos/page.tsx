'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Download, Sparkles, Edit2, Trash2, Check, X, Filter, Video, FileText, Headphones, BookOpen, FileType, Wand2, Copy, Plus, Upload, FileDown, ExternalLink, FileX, Loader2, Clapperboard, User, Users } from 'lucide-react';
import BackButton from '@/components/back-button';
import {
  importarVideosBunny, listarConteudos, atualizarConteudo,
  deletarConteudo, sugerirTagsIA, aplicarTagsIA, gerarConteudoIA, loadOpcoesGerar, uploadConteudo, gerarConteudoFinal, excluirConteudoFinal, gerarPodcastAudio, aprovarRoteiroPodcastEGerarAudio,
} from '@/actions/conteudos';
import { useAdminShell } from '@/app/admin/_shell/AdminShellContext';

const FORMAT_ICONS = {
  video: Video, audio: Headphones, texto: FileText, case: BookOpen, pdf: FileType,
};
const FORMAT_COLORS = {
  video: '#06B6D4', audio: '#A78BFA', texto: '#10B981', case: '#F59E0B', pdf: '#94A3B8',
};

function isPodcastDupla(c: any) {
  return c?.formato === 'audio' && /TTS MULTI-SPEAKER/i.test(c?.conteudo_inline || '');
}

function getFormatIcon(c: any) {
  if (c?.formato === 'audio') return isPodcastDupla(c) ? Users : User;
  return FORMAT_ICONS[c?.formato] || FileText;
}

function getFormatColor(c: any) {
  if (c?.formato === 'audio' && isPodcastDupla(c)) return '#67E8F9';
  return FORMAT_COLORS[c?.formato] || '#94A3B8';
}

function getFormatTitle(c: any, fallback: string) {
  if (c?.formato === 'audio') {
    return isPodcastDupla(c) ? 'Podcast em dupla' : 'Podcast solo';
  }
  return fallback;
}

function isUnclassified(value: any) {
  return value === 'Não classificado';
}

export default function ConteudosAdminPage() {
  const t = useTranslations('AdminContent');
  const { empresaFiltro } = useAdminShell();
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterFormato, setFilterFormato] = useState('');
  const [filterSemClass, setFilterSemClass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState([]);
  const [editing, setEditing] = useState(null); // conteudo em edição
  const [iaSugestao, setIaSugestao] = useState(null); // {conteudoId, tags}
  const [showGerar, setShowGerar] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [roteiroGerado, setRoteiroGerado] = useState(null);

  const addLog = (msg, type = 'info') => {
    setLogs(prev => [{ msg, type, ts: Date.now() }, ...prev].slice(0, 10));
  };

  const carregar = useCallback(async () => {
    setLoading(true);
    const r = await listarConteudos({
      formato: filterFormato || undefined,
      semClassificacao: filterSemClass || undefined,
      empresaId: empresaFiltro,
    });
    setItems(r.items || []);
    setLoading(false);
  }, [filterFormato, filterSemClass, empresaFiltro]);

  useEffect(() => { carregar(); }, [carregar]);

  async function handleImportar() {
    setBusy(true);
    addLog(t('logs.importingBunny'), 'info');
    const r = await importarVideosBunny();
    if (r.ok) {
      addLog(`✅ ${t('logs.importedBunny', { imported: r.importados, total: r.total })}`, 'success');
      await carregar();
    } else {
      addLog(`❌ ${r.error}`, 'error');
    }
    setBusy(false);
  }

  async function handleSugerirIA(c) {
    setBusy(true);
    addLog(t('logs.askingAi', { title: c.titulo }), 'info');
    const r = await sugerirTagsIA(c.id);
    if (r.ok) {
      setIaSugestao({ conteudoId: c.id, conteudo: c, tags: r.sugestao });
      addLog(`✅ ${t('logs.aiSuggested', { competency: r.sugestao.competencia, confidence: r.sugestao.confianca })}`, 'success');
    } else {
      addLog(`❌ ${r.error}`, 'error');
    }
    setBusy(false);
  }

  async function handleAplicarSugestao() {
    if (!iaSugestao) return;
    const r = await aplicarTagsIA(iaSugestao.conteudoId, iaSugestao.tags);
    if (r.ok) {
      addLog(`✅ ${t('logs.tagsApplied')}`, 'success');
      setIaSugestao(null);
      await carregar();
    } else {
      addLog(`❌ ${r.error}`, 'error');
    }
  }

  async function handleSalvarEdicao(patch) {
    const r = await atualizarConteudo(editing.id, patch);
    if (r.ok) {
      addLog(`✅ ${t('logs.updated')}`, 'success');
      setEditing(null);
      await carregar();
    } else {
      addLog(`❌ ${r.error}`, 'error');
    }
  }

  async function handleGerarFinal(c) {
    setBusy(true);
    addLog(t('logs.generatingFinal', { title: c.titulo }), 'info');
    const r = await gerarConteudoFinal(c.id);
    if (r.success) {
      addLog(`✅ ${r.message}`, 'success');
      if (!r.coverGerada) addLog(`⚠️ ${t('logs.finalNoCover', { reason: r.coverErro || '—' })}`, 'error');
      if (r.url) window.open(r.url, '_blank', 'noopener');
      await carregar();
    } else {
      addLog(`❌ ${r.error}`, 'error');
    }
    setBusy(false);
  }

  // Baixa o arquivo gerado (PDF/áudio) forçando o save com nome a partir do
  // título. Fetch+blob contorna o atributo `download` ser ignorado cross-origin
  // (Storage do Supabase); se falhar (CORS), cai pra abrir em nova aba.
  async function handleDownload(c) {
    const isVideo = c.formato === 'video';
    if (!isVideo && !c.url) return;
    if (isVideo && !c.bunny_video_id) return;
    const ext = isVideo ? 'mp4' : c.formato === 'audio' ? 'mp3' : 'pdf';
    const base = (c.titulo || 'conteudo')
      .replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'conteudo';
    // Vídeo: a URL é a página de embed do Bunny, não um arquivo. Baixamos o MP4
    // via proxy server-side (resolve o melhor fallback + passa o Hotlink Referer).
    const src = isVideo
      ? `/api/video-download/${c.bunny_video_id}?name=${encodeURIComponent(base)}`
      : c.url;
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = `${base}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 2000);
    } catch {
      addLog(`⚠️ ${t('actions.downloadError')}`, 'info');
      window.open(c.url, '_blank', 'noopener');
    }
  }

  async function handleGerarAudio(c) {
    setBusy(true);
    addLog(t('logs.generatingAudio', { title: c.titulo }), 'info');
    const r = await gerarPodcastAudio(c.id);
    if (r.success) {
      addLog(`✅ ${r.message}`, 'success');
      if (r.url) window.open(r.url, '_blank', 'noopener');
      await carregar();
    } else {
      addLog(`❌ ${r.error}`, 'error');
    }
    setBusy(false);
  }

  async function handleExcluirFinal(c) {
    if (!confirm(t('confirm.deleteFinal', { title: c.titulo }))) return;
    setBusy(true);
    const r = await excluirConteudoFinal(c.id);
    if (r.success) {
      addLog(`✅ ${t('logs.finalDeleted')}`, 'success');
      await carregar();
    } else {
      addLog(`❌ ${r.error}`, 'error');
    }
    setBusy(false);
  }

  async function handleDeletar(c) {
    if (!confirm(t('confirm.delete', { title: c.titulo }))) return;
    const r = await deletarConteudo(c.id);
    if (r.ok) {
      addLog(`✅ ${t('logs.deleted')}`, 'success');
      await carregar();
    } else {
      addLog(`❌ ${r.error}`, 'error');
    }
  }

  const naoClassificados = items.filter(i => isUnclassified(i.competencia)).length;

  return (
    <div className="min-h-full bg-gradient-to-br from-[#0a0e1a] via-[#0d1426] to-[#0a0e1a] text-white">
      <div className="max-w-7xl mx-auto p-6">
        <BackButton />
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{t('title')}</h1>
            <p className="text-xs text-gray-400">{t('subtitle')}</p>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/20 hover:bg-white/10 disabled:opacity-50 text-sm font-bold"
          >
            <Plus size={16} />
            {t('actions.addManual')}
          </button>
          <button
            onClick={() => setShowGerar(true)}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-sm font-bold"
          >
            <Wand2 size={16} />
            {t('actions.generateAi')}
          </button>
          <button
            onClick={handleImportar}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-sm font-bold"
          >
            <Download size={16} />
            {t('actions.importBunny')}
          </button>
          <button
            onClick={() => {
              if (!empresaFiltro) { alert('Selecione uma empresa no topo para extrair vídeo.'); return; }
              router.push(`/admin/empresas/${empresaFiltro}/extracao-video`);
            }}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-700 disabled:opacity-50 text-sm font-bold"
          >
            <Clapperboard size={16} />
            Extrair de vídeo
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="rounded-xl bg-white/5 border border-white/10 p-4">
            <div className="text-xs text-gray-400">{t('stats.total')}</div>
            <div className="text-2xl font-bold text-white">{items.length}</div>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 p-4">
            <div className="text-xs text-gray-400">{t('stats.unclassified')}</div>
            <div className="text-2xl font-bold text-amber-400">{naoClassificados}</div>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 p-4">
            <div className="text-xs text-gray-400">{t('stats.active')}</div>
            <div className="text-2xl font-bold text-emerald-400">{items.filter(i => i.ativo).length}</div>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-3 mb-4">
          <Filter size={14} className="text-gray-500" />
          <select
            value={filterFormato}
            onChange={e => setFilterFormato(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white"
          >
            <option value="" className="bg-[#0d1426] text-white">{t('filters.allFormats')}</option>
            <option value="video" className="bg-[#0d1426] text-white">{t('formats.video')}</option>
            <option value="audio" className="bg-[#0d1426] text-white">{t('formats.audio')}</option>
            <option value="texto" className="bg-[#0d1426] text-white">{t('formats.text')}</option>
            <option value="case" className="bg-[#0d1426] text-white">{t('formats.case')}</option>
            <option value="pdf" className="bg-[#0d1426] text-white">PDF</option>
          </select>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
            <input type="checkbox" checked={filterSemClass} onChange={e => setFilterSemClass(e.target.checked)} />
            {t('filters.onlyUnclassified')}
          </label>
        </div>

        {/* Logs */}
        {logs.length > 0 && (
          <div className="mb-4 rounded-lg bg-black/30 border border-white/10 p-3 max-h-32 overflow-auto">
            {logs.map(l => (
              <div key={l.ts} className={`text-[11px] ${l.type === 'error' ? 'text-red-400' : l.type === 'success' ? 'text-emerald-400' : 'text-gray-400'}`}>
                {l.msg}
              </div>
            ))}
          </div>
        )}

        {/* Tabela */}
        {loading ? (
          <div className="text-center py-12 text-gray-500 text-sm">{t('loading')}</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">
            {t('empty')}
          </div>
        ) : (
          <div className="rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.04]">
                <tr className="text-left text-[10px] uppercase text-gray-500">
                  <th className="px-3 py-2">{t('table.format')}</th>
                  <th className="px-3 py-2">{t('table.title')}</th>
                  <th className="px-3 py-2">{t('table.competency')}</th>
                  <th className="px-3 py-2">{t('table.descriptor')}</th>
                  <th className="px-3 py-2 text-center">{t('table.level')}</th>
                  <th className="px-3 py-2">{t('table.role')}</th>
                  <th className="px-3 py-2">{t('table.company')}</th>
                  <th className="px-3 py-2 text-center">{t('table.rate')}</th>
                  <th className="px-3 py-2 text-center">{t('table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {items.map(c => {
                  const Icon = getFormatIcon(c);
                  const naoClass = isUnclassified(c.competencia);
                  return (
                    <tr key={c.id} className="hover:bg-white/[0.02]">
                      <td className="px-3 py-2">
                        <button
                          onClick={() => {
                            if (!c.conteudo_inline) return;
                            setRoteiroGerado({
                              titulo: c.titulo,
                              formato: c.formato,
                              roteiro: c.conteudo_inline,
                              precisaGravar: c.formato === 'video' || c.formato === 'audio',
                            });
                          }}
                          disabled={!c.conteudo_inline}
                          title={c.conteudo_inline ? getFormatTitle(c, 'Visualizar conteúdo') : 'Sem texto inline pra visualizar'}
                          className="p-1 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                          <Icon size={16} style={{ color: getFormatColor(c) }} />
                        </button>
                      </td>
                      <td className="px-3 py-2 text-xs text-white max-w-xs truncate">{c.titulo}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className={naoClass ? 'text-amber-400' : 'text-gray-300'}>{naoClass ? t('labels.unclassified') : c.competencia}</span>
                      </td>
                      <td className="px-3 py-2 text-[11px] text-gray-400">{c.descritor || '—'}</td>
                      <td className="px-3 py-2 text-[11px] text-center text-gray-400">{c.nivel_min}–{c.nivel_max}</td>
                      <td className="px-3 py-2 text-[11px] text-gray-400">{c.cargo}</td>
                      <td className="px-3 py-2 text-[11px]">
                        {c.empresa?.nome
                          ? <span className="text-gray-300">{c.empresa.nome}</span>
                          : <span className="text-white/30 italic">{t('labels.global')}</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {c.taxa_conclusao != null ? (
                          <span className={`text-[11px] font-bold ${c.taxa_conclusao >= 70 ? 'text-emerald-400' : c.taxa_conclusao >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                            {c.taxa_conclusao}%
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          {(c.formato === 'texto' || c.formato === 'case') && (
                            c.url ? (
                              <>
                                <a
                                  href={c.url} target="_blank" rel="noopener noreferrer"
                                  className="p-1.5 rounded hover:bg-emerald-500/20 text-emerald-400"
                                  title={t('actions.openFinal')}
                                >
                                  <ExternalLink size={14} />
                                </a>
                                <button
                                  onClick={() => handleDownload(c)}
                                  className="p-1.5 rounded hover:bg-sky-500/20 text-sky-400"
                                  title={t('actions.download')}
                                >
                                  <Download size={14} />
                                </button>
                                <button
                                  onClick={() => handleGerarFinal(c)}
                                  disabled={busy || !c.conteudo_inline}
                                  className="p-1.5 rounded hover:bg-cyan-500/20 text-cyan-400 disabled:opacity-30 disabled:cursor-not-allowed"
                                  title={t('actions.regenerateFinal')}
                                >
                                  <FileDown size={14} />
                                </button>
                                <button
                                  onClick={() => handleExcluirFinal(c)}
                                  disabled={busy}
                                  className="p-1.5 rounded hover:bg-red-500/20 text-red-400 disabled:opacity-30"
                                  title={t('actions.deleteFinal')}
                                >
                                  <FileX size={14} />
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleGerarFinal(c)}
                                disabled={busy || !c.conteudo_inline}
                                className="p-1.5 rounded hover:bg-emerald-500/20 text-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed"
                                title={t('actions.generateFinal')}
                              >
                                <FileDown size={14} />
                              </button>
                            )
                          )}
                          {c.formato === 'audio' && (
                            c.url ? (
                              <>
                                <a
                                  href={c.url} target="_blank" rel="noopener noreferrer"
                                  className="p-1.5 rounded hover:bg-emerald-500/20 text-emerald-400"
                                  title={t('actions.openAudio')}
                                >
                                  <ExternalLink size={14} />
                                </a>
                                <button
                                  onClick={() => handleDownload(c)}
                                  className="p-1.5 rounded hover:bg-sky-500/20 text-sky-400"
                                  title={t('actions.download')}
                                >
                                  <Download size={14} />
                                </button>
                                <button
                                  onClick={() => handleGerarAudio(c)}
                                  disabled={busy || !c.conteudo_inline}
                                  className="p-1.5 rounded hover:bg-cyan-500/20 text-cyan-400 disabled:opacity-30 disabled:cursor-not-allowed"
                                  title={t('actions.regenerateAudio')}
                                >
                                  <Headphones size={14} />
                                </button>
                                <button
                                  onClick={() => handleExcluirFinal(c)}
                                  disabled={busy}
                                  className="p-1.5 rounded hover:bg-red-500/20 text-red-400 disabled:opacity-30"
                                  title={t('actions.deleteAudio')}
                                >
                                  <FileX size={14} />
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleGerarAudio(c)}
                                disabled={busy || !c.conteudo_inline}
                                className="p-1.5 rounded hover:bg-emerald-500/20 text-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed"
                                title={t('actions.generateAudio')}
                              >
                                <Headphones size={14} />
                              </button>
                            )
                          )}
                          {/* Geração de vídeo via Veo descontinuada — abrir/baixar/excluir mantidos p/ vídeos existentes (importados do Bunny) */}
                          {c.formato === 'video' && c.url && (
                            <>
                              <a
                                href={c.url} target="_blank" rel="noopener noreferrer"
                                className="p-1.5 rounded hover:bg-emerald-500/20 text-emerald-400"
                                title={t('actions.openVideo')}
                              >
                                <ExternalLink size={14} />
                              </a>
                              {c.bunny_video_id && (
                                <button
                                  onClick={() => handleDownload(c)}
                                  className="p-1.5 rounded hover:bg-sky-500/20 text-sky-400"
                                  title={t('actions.download')}
                                >
                                  <Download size={14} />
                                </button>
                              )}
                              <button
                                onClick={() => handleExcluirFinal(c)}
                                disabled={busy}
                                className="p-1.5 rounded hover:bg-red-500/20 text-red-400 disabled:opacity-30"
                                title={t('actions.deleteVideo')}
                              >
                                <FileX size={14} />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleSugerirIA(c)}
                            disabled={busy}
                            className="p-1.5 rounded hover:bg-purple-500/20 text-purple-400"
                            title={t('actions.suggestAi')}
                          >
                            <Sparkles size={14} />
                          </button>
                          <button
                            onClick={() => setEditing(c)}
                            className="p-1.5 rounded hover:bg-cyan-500/20 text-cyan-400"
                            title={t('actions.edit')}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeletar(c)}
                            className="p-1.5 rounded hover:bg-red-500/20 text-red-400"
                            title={t('actions.delete')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de edição */}
      {editing && <EditModal conteudo={editing} onClose={() => setEditing(null)} onSave={handleSalvarEdicao} />}

      {/* Modal upload manual */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onSave={async (fd) => {
            setBusy(true);
            addLog(t('logs.uploadingContent'), 'info');
            const r = await uploadConteudo(fd);
            setBusy(false);
            if (r.success) {
              addLog(`✅ ${r.message}`, 'success');
              setShowUpload(false);
              await carregar();
            } else {
              addLog(`❌ ${r.error}`, 'error');
            }
          }}
          busy={busy}
        />
      )}

      {/* Modal gerar com IA — single OU lote (1 descritor por vez no client) */}
      {showGerar && (
        <GerarModal
          onClose={() => !busy && setShowGerar(false)}
          onGenerate={async (params) => {
            setBusy(true);
            try {
              if (params.descritor) {
                // single
                addLog(t('logs.generatingSingle', { format: params.formato, descriptor: params.descritor }), 'info');
                const r = await gerarConteudoIA(params);
                if (r.success) {
                  addLog(`✅ ${r.message}`, 'success');
                  if (r.roteiro) setRoteiroGerado({ ...r, formato: params.formato });
                  setShowGerar(false);
                  await carregar();
                } else {
                  addLog(`❌ ${r.error}`, 'error');
                }
              } else {
                // lote no client: descobre descritores e itera 1 por 1
                const opcoes = await loadOpcoesGerar(empresaFiltro);
                const comp = opcoes.competencias.find(c => c.nome === params.competencia);
                const descritores = comp?.descritores || [];
                if (descritores.length === 0) {
                  addLog(t('logs.noDescriptors', { competency: params.competencia }), 'error');
                  return;
                }
                addLog(t('logs.batchWillGenerate', { count: descritores.length, format: params.formato, competency: params.competencia }), 'info');
                let ok = 0, erros = 0;
                for (let i = 0; i < descritores.length; i++) {
                  const desc = descritores[i];
                  addLog(`[${i + 1}/${descritores.length}] ${desc}...`, 'info');
                  const r = await gerarConteudoIA({ ...params, descritor: desc });
                  if (r.success) { ok++; addLog(`  ✅ ${desc}`, 'success'); }
                  else { erros++; addLog(`  ❌ ${desc}: ${r.error}`, 'error'); }
                  await carregar(); // atualiza lista a cada um
                }
                addLog(t('logs.batchDone', { ok, total: descritores.length, errors: erros ? t('logs.errorCount', { count: erros }) : '' }), ok === descritores.length ? 'success' : 'info');
                setShowGerar(false);
              }
            } catch (e) {
              addLog(t('logs.unexpectedError', { error: e.message }), 'error');
            } finally {
              setBusy(false);
            }
          }}
          busy={busy}
        />
      )}

      {/* Modal roteiro gerado (copiar) */}
      {roteiroGerado && (
        <RoteiroModal
          item={roteiroGerado}
          onClose={() => setRoteiroGerado(null)}
          onApproveAudio={async (roteiroEditado) => {
            if (!roteiroGerado.conteudoId) {
              addLog('❌ Conteúdo sem ID para aprovar roteiro', 'error');
              return { success: false, error: 'Conteúdo sem ID para aprovar roteiro' };
            }
            addLog(`Gerando áudio aprovado de "${roteiroGerado.titulo}"...`, 'info');
            const r = await aprovarRoteiroPodcastEGerarAudio(roteiroGerado.conteudoId, roteiroEditado);
            if (r.success) {
              addLog(`✅ ${r.message}`, 'success');
              setRoteiroGerado(null);
              if (r.url) window.open(r.url, '_blank', 'noopener');
              await carregar();
            } else {
              addLog(`❌ ${r.error}`, 'error');
            }
            return r;
          }}
        />
      )}

      {/* Modal de sugestão IA */}
      {iaSugestao && (
        <SugestaoModal
          conteudo={iaSugestao.conteudo}
          tags={iaSugestao.tags}
          onApply={handleAplicarSugestao}
          onCancel={() => setIaSugestao(null)}
          onEdit={(novasTags) => setIaSugestao({ ...iaSugestao, tags: novasTags })}
        />
      )}
    </div>
  );
}

function EditModal({ conteudo, onClose, onSave }) {
  const t = useTranslations('AdminContent');
  const [form, setForm] = useState({
    titulo: conteudo.titulo || '',
    competencia: conteudo.competencia || '',
    descritor: conteudo.descritor || '',
    nivel_min: conteudo.nivel_min || 1.0,
    nivel_max: conteudo.nivel_max || 4.0,
    contexto: conteudo.contexto || 'generico',
    cargo: conteudo.cargo || 'todos',
    setor: conteudo.setor || 'todos',
    tipo_conteudo: conteudo.tipo_conteudo || 'core',
    ativo: conteudo.ativo,
  });
  const [opcoes, setOpcoes] = useState({ competencias: [], cargos: [] });

  const { empresaFiltro } = useAdminShell();
  useEffect(() => { loadOpcoesGerar(empresaFiltro).then(setOpcoes); }, [empresaFiltro]);

  const compSel = opcoes.competencias.find(c => c.nome === form.competencia);
  const descritoresDisp = compSel?.descritores || [];
  // Inclui o descritor atual se ele não estiver na lista (caso o nome tenha mudado)
  const descritorOptions = form.descritor && !descritoresDisp.includes(form.descritor)
    ? [form.descritor, ...descritoresDisp]
    : descritoresDisp;
  const compOptions = form.competencia && !opcoes.competencias.some(c => c.nome === form.competencia)
    ? [form.competencia, ...opcoes.competencias.map(c => c.nome)]
    : opcoes.competencias.map(c => c.nome);
  const cargoOptions = ['todos', ...(opcoes.cargos || [])];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[#0d1426] rounded-2xl border border-white/10 max-w-lg w-full max-h-[90vh] overflow-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{t('modal.editTitle')}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10"><X size={18} /></button>
        </div>
        <div className="space-y-3 text-sm">
          <Field label={t('fields.title')} value={form.titulo} onChange={v => setForm({ ...form, titulo: v })} />
          <SelectField label={t('fields.competency')} value={form.competencia}
            onChange={v => setForm({ ...form, competencia: v, descritor: '' })}
            options={['', ...compOptions]} />
          <SelectField label={t('fields.descriptor')} value={form.descritor}
            onChange={v => setForm({ ...form, descritor: v })}
            options={['', ...descritorOptions]}
            disabled={!form.competencia} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('fields.levelMin')} type="number" step="0.1" value={form.nivel_min} onChange={v => setForm({ ...form, nivel_min: Number(v) })} />
            <Field label={t('fields.levelMax')} type="number" step="0.1" value={form.nivel_max} onChange={v => setForm({ ...form, nivel_max: Number(v) })} />
          </div>
          <SelectField label={t('fields.context')} value={form.contexto} onChange={v => setForm({ ...form, contexto: v })}
            options={['educacional', 'corporativo', 'generico']} />
          <SelectField label={t('fields.role')} value={form.cargo}
            onChange={v => setForm({ ...form, cargo: v })}
            options={cargoOptions} />
          <SelectField label={t('fields.sector')} value={form.setor} onChange={v => setForm({ ...form, setor: v })}
            options={['educacao_publica', 'saude', 'agro', 'todos']} />
          <SelectField label={t('fields.type')} value={form.tipo_conteudo} onChange={v => setForm({ ...form, tipo_conteudo: v })}
            options={['core', 'complementar']} />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.ativo} onChange={e => setForm({ ...form, ativo: e.target.checked })} />
            <span className="text-xs">{t('fields.active')}</span>
          </label>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={() => onSave(form)} className="flex-1 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-sm font-bold">{t('actions.save')}</button>
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm">{t('actions.cancel')}</button>
        </div>
      </div>
    </div>
  );
}

function SugestaoModal({ conteudo, tags, onApply, onCancel, onEdit }) {
  const tLabel = useTranslations('AdminContent');
  const [t, setT] = useState(tags);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[#0d1426] rounded-2xl border border-purple-500/30 max-w-lg w-full p-6">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={18} className="text-purple-400" />
          <h2 className="text-lg font-bold">{tLabel('modal.aiSuggestion')}</h2>
        </div>
        <div className="text-xs text-gray-400 mb-4 truncate">{conteudo.titulo}</div>
        {tags.raciocinio && (
          <div className="mb-4 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs text-purple-200 italic">
            "{tags.raciocinio}" <span className="text-purple-400">· {tLabel('fields.confidence')} {Math.round((tags.confianca || 0) * 100)}%</span>
          </div>
        )}
        <div className="space-y-2 text-sm">
          <Field label={tLabel('fields.competency')} value={t.competencia} onChange={v => { const n = { ...t, competencia: v }; setT(n); onEdit(n); }} />
          <Field label={tLabel('fields.descriptor')} value={t.descritor || ''} onChange={v => { const n = { ...t, descritor: v }; setT(n); onEdit(n); }} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={tLabel('fields.levelMin')} type="number" step="0.1" value={t.nivel_min} onChange={v => { const n = { ...t, nivel_min: Number(v) }; setT(n); onEdit(n); }} />
            <Field label={tLabel('fields.levelMax')} type="number" step="0.1" value={t.nivel_max} onChange={v => { const n = { ...t, nivel_max: Number(v) }; setT(n); onEdit(n); }} />
          </div>
          <SelectField label={tLabel('fields.context')} value={t.contexto} onChange={v => { const n = { ...t, contexto: v }; setT(n); onEdit(n); }} options={['educacional', 'corporativo', 'generico']} />
          <Field label={tLabel('fields.role')} value={t.cargo} onChange={v => { const n = { ...t, cargo: v }; setT(n); onEdit(n); }} />
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onApply} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-bold">
            <Check size={14} /> {tLabel('actions.apply')}
          </button>
          <button onClick={onCancel} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm">{tLabel('actions.cancel')}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', step, name, required, defaultValue }: { label?: any; value?: any; onChange?: any; type?: string; step?: any; name?: any; required?: any; defaultValue?: any }) {
  // Se tem onChange, é controlado; senão é uncontrolled (para uso em <form>)
  const props: any = onChange != null
    ? { value: value ?? '', onChange: (e: any) => onChange(e.target.value) }
    : { defaultValue: defaultValue ?? value ?? '' };
  return (
    <div>
      <label className="block text-[10px] uppercase text-gray-500 mb-1">{label}</label>
      <input
        type={type} step={step} name={name} required={required}
        {...props}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:border-cyan-500 outline-none"
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options, disabled, name, defaultValue }: { label?: any; value?: any; onChange?: any; options: any[]; disabled?: any; name?: any; defaultValue?: any }) {
  const t = useTranslations('AdminContent');
  const optionLabels: Record<string, string> = {
    todos: t('optionLabels.all'),
    generico: t('optionLabels.generic'),
    educacional: t('optionLabels.educational'),
    corporativo: t('optionLabels.corporate'),
    educacao_publica: t('optionLabels.publicEducation'),
    saude: t('optionLabels.health'),
    agro: t('optionLabels.agro'),
    core: t('optionLabels.core'),
    complementar: t('optionLabels.complementary'),
    audio: t('formats.audio'),
    texto: t('formats.text'),
    case: t('formats.case'),
    pdf: t('formats.pdf'),
    video: t('formats.video'),
  };
  const props: any = onChange != null
    ? { value: value ?? '', onChange: (e: any) => onChange(e.target.value) }
    : { defaultValue: defaultValue ?? value ?? options[0] };
  return (
    <div>
      <label className="block text-[10px] uppercase text-gray-500 mb-1">{label}</label>
      <select
        {...props}
        name={name}
        disabled={disabled}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white outline-none disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {options.map((o: any) => <option key={o} value={o} className="bg-[#0d1426] text-white">{o ? (optionLabels[o] || o) : t('fields.selectPlaceholder')}</option>)}
      </select>
    </div>
  );
}

function UploadModal({ onClose, onSave, busy }) {
  const t = useTranslations('AdminContent');
  const [formato, setFormato] = useState('audio');
  const [opcoes, setOpcoes] = useState({ competencias: [], cargos: [] });
  const [competencia, setCompetencia] = useState('');

  const { empresaFiltro } = useAdminShell();
  useEffect(() => { loadOpcoesGerar(empresaFiltro).then(setOpcoes); }, [empresaFiltro]);

  const precisaArquivo = formato === 'audio' || formato === 'pdf';
  const descritoresDisp = opcoes.competencias.find(c => c.nome === competencia)?.descritores || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <form action={onSave} className="bg-[#0d1426] rounded-2xl border border-cyan-500/30 max-w-2xl w-full max-h-[90vh] overflow-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Upload size={20} className="text-cyan-400" />
            <h2 className="text-lg font-bold">{t('modal.addManual')}</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/10"><X size={18} /></button>
        </div>

        <div className="space-y-4">
          <SelectField label={t('fields.format')} value={formato} onChange={setFormato}
            options={['audio', 'texto', 'case', 'pdf']} />
          <input type="hidden" name="formato" value={formato} />

          <Field label={t('fields.title')} name="titulo" required />

          <SelectField label={t('fields.competency')} value={competencia}
            onChange={v => setCompetencia(v)}
            options={['', ...opcoes.competencias.map(c => c.nome)]} />
          <input type="hidden" name="competencia" value={competencia} />

          <SelectField label={t('fields.descriptor')} name="descritor" options={['', ...descritoresDisp]} disabled={!competencia} />

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('fields.levelMin')} name="nivel_min" type="number" step="0.1" defaultValue="1.0" />
            <Field label={t('fields.levelMax')} name="nivel_max" type="number" step="0.1" defaultValue="2.0" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SelectField label={t('fields.role')} name="cargo" options={['todos', ...opcoes.cargos]} />
            <SelectField label={t('fields.context')} name="contexto" options={['educacional', 'corporativo', 'generico']} />
          </div>

          {precisaArquivo ? (
            <div>
              <label className="block text-[10px] uppercase text-gray-500 mb-1">{t('fields.file')} ({formato === 'audio' ? t('fileTypes.audio') : t('fileTypes.pdf')})</label>
              <input type="file" name="file" accept={formato === 'audio' ? 'audio/*' : 'application/pdf'}
                className="w-full text-xs text-gray-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-cyan-600 file:text-white file:font-bold file:cursor-pointer" required />
            </div>
          ) : (
            <div>
              <label className="block text-[10px] uppercase text-gray-500 mb-1">{t('fields.contentMarkdown')}</label>
              <textarea name="conteudo_inline" rows={10} required
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white font-mono outline-none focus:border-cyan-500"
                placeholder={formato === 'case' ? t('placeholders.caseContent') : t('placeholders.textContent')} />
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <button type="submit" disabled={busy}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-sm font-bold">
            {busy ? t('actions.sending') : <><Upload size={14} /> {t('actions.save')}</>}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm">{t('actions.cancel')}</button>
        </div>
      </form>
    </div>
  );
}

function GerarModal({ onClose, onGenerate, busy }) {
  const t = useTranslations('AdminContent');
  const [form, setForm] = useState({
    formato: 'texto',
    competencia: '',
    descritor: '',
    nivelMin: 1.0,
    nivelMax: 2.0,
    cargo: 'todos',
    contexto: 'generico',
    duracaoMin: 3,
    duracaoSeg: 0,
    podcastFormato: 'solo',
  });
  const [opcoes, setOpcoes] = useState({ competencias: [], cargos: [] });

  useEffect(() => {
    loadOpcoesGerar().then(setOpcoes);
  }, []);

  const formatos = [
    { v: 'texto', label: t('generate.formats.text'), icon: FileText, cor: '#10B981', nota: t('generate.notes.ready') },
    { v: 'case', label: t('generate.formats.case'), icon: BookOpen, cor: '#F59E0B', nota: t('generate.notes.ready') },
    { v: 'video', label: t('generate.formats.video'), icon: Video, cor: '#06B6D4', nota: t('generate.notes.recordLater') },
    { v: 'audio', label: t('generate.formats.audio'), icon: Headphones, cor: '#A78BFA', nota: t('generate.notes.recordLater') },
  ];

  const precisaDuracao = form.formato === 'video' || form.formato === 'audio';
  const competenciaSel = opcoes.competencias.find(c => c.nome === form.competencia);
  const descritoresDisp = competenciaSel?.descritores || [];
  const podeGerar = form.competencia && !busy;
  const totalGerar = form.descritor ? 1 : descritoresDisp.length;

  function handleSubmit() {
    const duracaoSegundos = precisaDuracao ? (Number(form.duracaoMin) * 60 + Number(form.duracaoSeg)) : null;
    const { duracaoMin, duracaoSeg, podcastFormato, ...rest } = form;
    onGenerate({ ...rest, duracaoSegundos, ...(rest.formato === 'audio' ? { podcastFormato } : {}) });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[#0d1426] rounded-2xl border border-purple-500/30 max-w-2xl w-full max-h-[90vh] overflow-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wand2 size={20} className="text-purple-400" />
            <h2 className="text-lg font-bold">{t('modal.generateAi')}</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10"><X size={18} /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-[10px] uppercase text-gray-500 mb-2">{t('fields.format')}</label>
            <div className="grid grid-cols-2 gap-2">
              {formatos.map(f => {
                const Icon = f.icon;
                const ativo = form.formato === f.v;
                return (
                  <button key={f.v} onClick={() => setForm({ ...form, formato: f.v })}
                    className={`flex items-start gap-2 p-3 rounded-lg border text-left ${
                      ativo ? 'border-purple-400 bg-purple-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'
                    }`}>
                    <Icon size={16} style={{ color: f.cor }} className="mt-0.5" />
                    <div>
                      <div className="text-xs font-bold text-white">{f.label}</div>
                      <div className="text-[10px] text-gray-500">{f.nota}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <SelectField label={t('fields.competency')} value={form.competencia}
            onChange={v => setForm({ ...form, competencia: v, descritor: '' })}
            options={['', ...opcoes.competencias.map(c => c.nome)]} />
          <div>
            <label className="block text-[10px] uppercase text-gray-500 mb-1">
              {t('generate.descriptorOptional', { count: descritoresDisp.length })}
            </label>
            <select value={form.descritor}
              onChange={e => setForm({ ...form, descritor: e.target.value })}
              disabled={!form.competencia}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white outline-none disabled:opacity-50">
              <option value="" className="bg-[#0d1426] text-white">{t('generate.allDescriptors', { count: descritoresDisp.length })}</option>
              {descritoresDisp.map(d => <option key={d} value={d} className="bg-[#0d1426] text-white">{d}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('fields.levelMin')} type="number" step="0.1" value={form.nivelMin} onChange={v => setForm({ ...form, nivelMin: Number(v) })} />
            <Field label={t('fields.levelMax')} type="number" step="0.1" value={form.nivelMax} onChange={v => setForm({ ...form, nivelMax: Number(v) })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SelectField label={t('fields.targetRole')} value={form.cargo}
              onChange={v => setForm({ ...form, cargo: v })}
              options={['todos', ...opcoes.cargos]} />
            <SelectField label={t('fields.context')} value={form.contexto} onChange={v => setForm({ ...form, contexto: v })}
              options={['educacional', 'corporativo', 'generico']} />
          </div>
          {precisaDuracao && (
            <div>
              <label className="block text-[10px] uppercase text-gray-500 mb-1">{t('fields.duration')}</label>
              <div className="flex items-center gap-2">
                <input type="number" min="0" max="30" value={form.duracaoMin}
                  onChange={e => setForm({ ...form, duracaoMin: Number(e.target.value) })}
                  className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white outline-none text-center" />
                <span className="text-gray-500 font-bold">:</span>
                <input type="number" min="0" max="59" value={form.duracaoSeg}
                  onChange={e => setForm({ ...form, duracaoSeg: Number(e.target.value) })}
                  className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white outline-none text-center" />
                <span className="text-[10px] text-gray-500">{t('generate.wordEstimate', { count: Math.round((form.duracaoMin * 60 + Number(form.duracaoSeg)) * 2.5) })}</span>
              </div>
            </div>
          )}
          {form.formato === 'audio' && (
            <div>
              <label className="block text-[10px] uppercase text-gray-500 mb-2">{t('fields.podcastFormat')}</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { v: 'solo', label: t('generate.podcastFormats.solo'), nota: t('generate.podcastFormatNotes.solo'), icon: User },
                  { v: 'mentor_campo', label: t('generate.podcastFormats.mentorField'), nota: t('generate.podcastFormatNotes.mentorField'), icon: Users },
                ].map(opt => {
                  const Icon = opt.icon;
                  const ativo = form.podcastFormato === opt.v;
                  return (
                    <button key={opt.v} type="button" onClick={() => setForm({ ...form, podcastFormato: opt.v })}
                      className={`flex items-start gap-2.5 p-3 rounded-lg border text-left ${
                        ativo ? 'border-purple-400 bg-purple-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'
                      }`}>
                      <Icon size={16} className="mt-0.5 shrink-0" style={{ color: ativo ? '#C084FC' : '#A78BFA' }} />
                      <div>
                        <div className="text-xs font-bold text-white">{opt.label}</div>
                        <div className="text-[10px] text-gray-500">{opt.nota}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={handleSubmit} disabled={!podeGerar}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-sm font-bold">
            {busy ? t('actions.generatingCount', { count: totalGerar }) : <><Wand2 size={14} /> {t('actions.generateCount', { count: totalGerar })}</>}
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm">{t('actions.cancel')}</button>
        </div>

        <p className="text-[10px] text-gray-500 mt-4">
          {t('generate.tip')}
        </p>
      </div>
    </div>
  );
}

function RoteiroModal({ item, onClose, onApproveAudio }) {
  const t = useTranslations('AdminContent');
  const [roteiro, setRoteiro] = useState(item.roteiro || '');
  const [copiado, setCopiado] = useState(false);
  const [aprovando, setAprovando] = useState(false);
  const isPodcast = item.formato === 'audio';
  async function copiar() {
    try { await navigator.clipboard.writeText(roteiro); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch {}
  }
  async function aprovar() {
    if (!isPodcast || !onApproveAudio) return;
    setAprovando(true);
    const r = await onApproveAudio(roteiro);
    if (!r?.success) setAprovando(false);
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[#0d1426] rounded-2xl border border-emerald-500/30 max-w-3xl w-full max-h-[90vh] flex flex-col p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Check size={20} className="text-emerald-400" />
            <h2 className="text-lg font-bold">{t('modal.generatedContent', { format: item.formato })}</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10"><X size={18} /></button>
        </div>
        <div className="text-xs text-gray-400 mb-3">{item.titulo}</div>
        {isPodcast ? (
          <div className="mb-3 p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-[11px] text-cyan-200">
            Revise o roteiro abaixo. Ao aprovar, o texto editado será salvo e o podcast será gerado automaticamente.
          </div>
        ) : item.precisaGravar && (
          <div className="mb-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300">
            {t.rich('generate.recordingWarning', { strong: (chunks) => <strong>{chunks}</strong> })}
          </div>
        )}
        <textarea
          value={roteiro}
          onChange={e => setRoteiro(e.target.value)}
          readOnly={!isPodcast}
          className="flex-1 min-h-[420px] overflow-auto p-4 rounded-lg bg-black/40 border border-white/10 text-xs text-gray-200 whitespace-pre-wrap font-mono leading-relaxed outline-none focus:border-cyan-400/40 disabled:opacity-70"
        />
        <div className="flex gap-2 mt-4">
          <button onClick={copiar} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-bold">
            <Copy size={14} /> {copiado ? t('actions.copied') : t('actions.copyText')}
          </button>
          {isPodcast && (
            <button onClick={aprovar} disabled={aprovando || roteiro.trim().length < 20}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-sm font-bold">
              {aprovando ? <Loader2 size={14} className="animate-spin" /> : <Headphones size={14} />}
              {aprovando ? 'Gerando áudio...' : 'Aprovar e gerar podcast'}
            </button>
          )}
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm">{t('actions.close')}</button>
        </div>
      </div>
    </div>
  );
}
