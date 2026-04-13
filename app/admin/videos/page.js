'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, Video, Eye, Clock, TrendingUp, Film, BarChart3,
} from 'lucide-react';
import { loadBunnyVideosStats, loadBunnyHeatmap, loadBunnyLibraryStats } from '@/actions/bunny-stats';
import VideoModal from '@/components/video-modal';

const BUNNY_LIBRARY = 636615; // Coincide com /app/dashboard/page.js

function formatSec(s) {
  if (!s || s <= 0) return '0s';
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

function formatPct(pct) {
  return `${pct}%`;
}

function Heatmap({ points, length }) {
  if (!points?.length) {
    return <p className="text-xs text-gray-500 italic py-4">Sem dados de heatmap (pouquíssimas views).</p>;
  }
  const bucketSec = Math.max(1, Math.ceil(length / 40) || 1); // ~40 buckets
  const buckets = {};
  for (const p of points) {
    const b = Math.floor(p.sec / bucketSec);
    if (!buckets[b] || p.pct > buckets[b]) buckets[b] = p.pct;
  }
  const nBuckets = Math.max(1, Math.ceil(length / bucketSec));
  const series = Array.from({ length: nBuckets }, (_, i) => ({
    t: i * bucketSec,
    pct: buckets[i] || 0,
  }));
  const maxPct = Math.max(1, ...series.map(s => s.pct));

  return (
    <div>
      <div className="flex items-end gap-0.5 h-24">
        {series.map((s, i) => (
          <div key={i}
            title={`${s.t}s → ${s.pct}%`}
            className="flex-1 rounded-sm"
            style={{
              height: `${Math.max(2, (s.pct / maxPct) * 100)}%`,
              background: s.pct >= 75 ? '#00B4D8' : s.pct >= 40 ? 'rgba(0,180,216,0.5)' : 'rgba(0,180,216,0.2)',
            }}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-[10px] text-gray-500 mt-2">
        <span>0s</span>
        <span>{formatSec(length)}</span>
      </div>
    </div>
  );
}

export default function AdminVideosPage() {
  const router = useRouter();
  const [stats, setStats] = useState(null);
  const [library, setLibrary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Vídeo selecionado pro heatmap
  const [selectedId, setSelectedId] = useState(null);
  const [heatmap, setHeatmap] = useState(null);
  const [loadingHeatmap, setLoadingHeatmap] = useState(false);

  // Modal de play
  const [activeVideo, setActiveVideo] = useState(null);

  useEffect(() => {
    async function init() {
      const [a, b] = await Promise.all([
        loadBunnyVideosStats(),
        loadBunnyLibraryStats(),
      ]);
      if (a?.error) setError(a.error);
      else setStats(a);
      if (!b?.error) setLibrary(b);
      setLoading(false);
    }
    init();
  }, []);

  async function handleSelectVideo(videoId, length) {
    setSelectedId(videoId);
    setHeatmap(null);
    setLoadingHeatmap(true);
    const r = await loadBunnyHeatmap(videoId);
    setLoadingHeatmap(false);
    if (!r?.error) setHeatmap({ ...r, length });
  }

  if (loading) {
    return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;
  }

  if (error && !stats) {
    return (
      <div className="max-w-[1100px] mx-auto px-4 py-10 text-center">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  const selected = stats?.items?.find(v => v.videoId === selectedId);

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/admin/dashboard')}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Film size={20} className="text-cyan-400" /> Métricas de Vídeos
          </h1>
          <p className="text-xs text-gray-500">Dados agregados do Bunny Stream</p>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: '#0F2A4A' }}>
          <Video size={18} className="text-cyan-400 mb-2" />
          <p className="text-2xl font-extrabold text-white">{stats?.totalVideos || 0}</p>
          <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Vídeos ativos</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: '#0F2A4A' }}>
          <Eye size={18} className="text-cyan-400 mb-2" />
          <p className="text-2xl font-extrabold text-white">{stats?.totalViews || 0}</p>
          <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Views totais</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: '#0F2A4A' }}>
          <Clock size={18} className="text-cyan-400 mb-2" />
          <p className="text-2xl font-extrabold text-white">{stats?.totalHoras || 0}h</p>
          <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Horas assistidas</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: '#0F2A4A' }}>
          <TrendingUp size={18} className="text-cyan-400 mb-2" />
          <p className="text-2xl font-extrabold text-cyan-400">{stats?.mediaTaxaConclusao || 0}%</p>
          <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Taxa conclusão média</p>
        </div>
      </div>

      {/* Chart diário (library stats) */}
      {library?.series?.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] p-5 mb-6" style={{ background: '#0F2A4A' }}>
          <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase mb-3 flex items-center gap-2">
            <BarChart3 size={12} /> Views por dia (últimos {library.series.length} dias)
          </p>
          <div className="flex items-end gap-0.5 h-20">
            {library.series.map((s, i) => {
              const max = Math.max(1, ...library.series.map(x => x.views));
              const h = Math.max(2, (s.views / max) * 100);
              return (
                <div key={i}
                  title={`${s.date.slice(5, 10)}: ${s.views} views`}
                  className="flex-1 rounded-sm"
                  style={{
                    height: `${h}%`,
                    background: s.views > 0 ? '#00B4D8' : 'rgba(255,255,255,0.04)',
                  }} />
              );
            })}
          </div>
        </div>
      )}

      {/* Tabela de ranking */}
      <div className="rounded-xl border border-white/[0.06] overflow-hidden mb-6" style={{ background: '#0F2A4A' }}>
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <p className="text-sm font-bold text-white">Ranking por views</p>
          <p className="text-[10px] text-gray-500">Clique num vídeo pra ver o heatmap</p>
        </div>
        {stats?.items?.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-500">Nenhum vídeo ainda.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                  <th className="px-4 py-2 text-center w-10">#</th>
                  <th className="px-4 py-2 text-left">Título</th>
                  <th className="px-4 py-2 text-center">Duração</th>
                  <th className="px-4 py-2 text-center">Views</th>
                  <th className="px-4 py-2 text-center">T. médio</th>
                  <th className="px-4 py-2 text-center">Conclusão</th>
                  <th className="px-4 py-2 text-center">Play</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {stats?.items?.map((v, i) => {
                  const taxaColor = v.taxaConclusao >= 75 ? 'text-emerald-400'
                    : v.taxaConclusao >= 40 ? 'text-cyan-400'
                    : 'text-amber-400';
                  const active = selectedId === v.videoId;
                  return (
                    <tr key={v.videoId}
                      className={`hover:bg-white/[0.02] cursor-pointer ${active ? 'bg-cyan-400/5' : ''}`}
                      onClick={() => handleSelectVideo(v.videoId, v.length)}>
                      <td className="px-4 py-2.5 text-center text-gray-500 font-mono text-xs">{i + 1}</td>
                      <td className="px-4 py-2.5 text-white text-xs font-semibold">
                        <p className="truncate max-w-[240px]">{v.titulo}</p>
                        <p className="text-[9px] text-gray-500 font-mono">{v.videoId.slice(0, 8)}...</p>
                      </td>
                      <td className="px-4 py-2.5 text-center text-xs text-gray-400">{formatSec(v.length)}</td>
                      <td className="px-4 py-2.5 text-center text-sm font-bold text-white">{v.views}</td>
                      <td className="px-4 py-2.5 text-center text-xs text-gray-400">{formatSec(v.averageWatchTime)}</td>
                      <td className={`px-4 py-2.5 text-center text-sm font-bold ${taxaColor}`}>
                        {formatPct(v.taxaConclusao)}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          onClick={e => { e.stopPropagation(); setActiveVideo({ videoId: v.videoId, titulo: v.titulo }); }}
                          className="text-cyan-400 hover:text-cyan-300 text-xs font-bold">
                          ▶ Ver
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Heatmap do vídeo selecionado */}
      {selected && (
        <div className="rounded-xl border border-white/[0.06] p-5" style={{ background: '#0F2A4A' }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-bold text-white truncate">{selected.titulo}</p>
              <p className="text-[10px] text-gray-500">Retenção por momento do vídeo</p>
            </div>
            <span className="text-[10px] font-bold text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded-full">
              {selected.views} views · {formatSec(selected.length)}
            </span>
          </div>
          {loadingHeatmap ? (
            <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-cyan-400" /></div>
          ) : (
            <Heatmap points={heatmap?.points || []} length={selected.length} />
          )}
        </div>
      )}

      {/* Modal de reprodução */}
      {activeVideo && (
        <VideoModal
          libraryId={BUNNY_LIBRARY}
          videoId={activeVideo.videoId}
          title={activeVideo.titulo}
          onClose={() => setActiveVideo(null)}
        />
      )}
    </div>
  );
}
