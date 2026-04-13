'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, Video, Eye, Clock, TrendingUp, Film, BarChart3,
  Users, AlertTriangle, Trophy, ArrowUpDown, ArrowUp, ArrowDown,
} from 'lucide-react';
import { loadBunnyVideosStats, loadBunnyHeatmap, loadBunnyLibraryStats } from '@/actions/bunny-stats';
import { loadEngajamentoEmpresa, loadAlertasInatividade, loadEmpresaInfo } from '@/actions/video-analytics';
import VideoModal from '@/components/video-modal';

const BUNNY_LIBRARY = 636615; // Coincide com /app/dashboard/page.js

function Avatar({ nome, fotoUrl, size = 32 }) {
  const initials = (nome || '').split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase() || '?';
  if (fotoUrl) {
    return <img src={fotoUrl} alt={nome} style={{ width: size, height: size }} className="rounded-full object-cover border border-white/10 shrink-0" />;
  }
  return (
    <div style={{ width: size, height: size, fontSize: size * 0.35 }}
      className="rounded-full flex items-center justify-center text-white font-extrabold border border-white/10 shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.35, background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
      {initials}
    </div>
  );
}

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
  const [empresaId, setEmpresaId] = useState(null);
  const [empresa, setEmpresa] = useState(null);
  const [stats, setStats] = useState(null);
  const [library, setLibrary] = useState(null);
  const [engajamento, setEngajamento] = useState(null);
  const [alertas, setAlertas] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('conteudo'); // conteudo | engajamento | alertas

  // Vídeo selecionado pro heatmap
  const [selectedId, setSelectedId] = useState(null);
  const [heatmap, setHeatmap] = useState(null);
  const [loadingHeatmap, setLoadingHeatmap] = useState(false);

  // Modal de play
  const [activeVideo, setActiveVideo] = useState(null);

  // Ordenação do ranking de engajamento
  const [sortBy, setSortBy] = useState('minutos'); // nome|cargo|videos|concluidos|minutos|ultimo
  const [sortDir, setSortDir] = useState('desc');

  function toggleSort(col) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir(col === 'nome' || col === 'cargo' ? 'asc' : 'desc'); }
  }

  // Lê ?empresa= da URL (sem useSearchParams pra evitar Suspense boundary)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const eid = params.get('empresa');
    setEmpresaId(eid || null);
  }, []);

  useEffect(() => {
    async function init() {
      const [a, b, c, d, e] = await Promise.all([
        loadBunnyVideosStats(),
        loadBunnyLibraryStats(),
        loadEngajamentoEmpresa(empresaId || null),
        loadAlertasInatividade(empresaId || null),
        empresaId ? loadEmpresaInfo(empresaId) : Promise.resolve(null),
      ]);
      if (a?.error) setError(a.error);
      else setStats(a);
      if (!b?.error) setLibrary(b);
      if (!c?.error) setEngajamento(c);
      if (!d?.error) setAlertas(d);
      setEmpresa(e);
      setLoading(false);
    }
    init();
    // Re-carrega quando empresaId muda (ex: query param)
  }, [empresaId]);

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
        <button onClick={() => router.push(empresaId ? `/admin/empresas/${empresaId}` : '/admin/dashboard')}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Film size={20} className="text-cyan-400" /> Métricas de Vídeos
          </h1>
          <p className="text-xs text-gray-500">
            {empresa
              ? <>Empresa: <span className="text-cyan-400 font-semibold">{empresa.nome}</span></>
              : 'Visão global — todas as empresas'}
          </p>
        </div>
        {empresaId && (
          <button onClick={() => router.push('/admin/videos')}
            className="text-[10px] font-bold text-gray-400 hover:text-cyan-400 uppercase tracking-widest px-3 py-2 rounded-lg border border-white/10">
            Ver global
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl border border-white/[0.06]" style={{ background: '#091D35' }}>
        {[
          { key: 'conteudo', label: `Conteúdo (${stats?.totalVideos || 0})`, icon: Film },
          { key: 'engajamento', label: `Engajamento (${engajamento?.colabsAtivos || 0})`, icon: Users },
          { key: 'alertas', label: `Alertas (${alertas?.alertas?.length || 0})`, icon: AlertTriangle, danger: (alertas?.alertas?.length || 0) > 0 },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              tab === t.key
                ? (t.danger ? 'bg-amber-400/15 text-amber-400' : 'bg-white/[0.06] text-white')
                : 'text-gray-500 hover:text-gray-300'
            }`}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'conteudo' && (<>

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

      </>)}

      {tab === 'engajamento' && (
        <div>
          {/* Cards de resumo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: '#0F2A4A' }}>
              <Users size={18} className="text-cyan-400 mb-2" />
              <p className="text-2xl font-extrabold text-white">{engajamento?.colabsAtivos || 0}</p>
              <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Colabs ativos</p>
            </div>
            <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: '#0F2A4A' }}>
              <Users size={18} className="text-gray-500 mb-2" />
              <p className="text-2xl font-extrabold text-white">{engajamento?.totalColabs || 0}</p>
              <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Total cadastrados</p>
            </div>
            <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: '#0F2A4A' }}>
              <Clock size={18} className="text-cyan-400 mb-2" />
              <p className="text-2xl font-extrabold text-white">{engajamento?.totalHoras || 0}h</p>
              <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Total consumido</p>
            </div>
            <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: '#0F2A4A' }}>
              <Trophy size={18} className="text-emerald-400 mb-2" />
              <p className="text-2xl font-extrabold text-white">{engajamento?.totalConcluidos || 0}</p>
              <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Vídeos concluídos</p>
            </div>
          </div>

          {/* Ranking por colab — clique no header ordena */}
          {(() => {
            const sortedRanking = (() => {
              if (!engajamento?.ranking) return [];
              const arr = [...engajamento.ranking];
              const dir = sortDir === 'asc' ? 1 : -1;
              const key = sortBy;
              arr.sort((a, b) => {
                let va, vb;
                switch (key) {
                  case 'nome': va = (a.nome || '').toLowerCase(); vb = (b.nome || '').toLowerCase(); break;
                  case 'cargo': va = (a.cargo || '').toLowerCase(); vb = (b.cargo || '').toLowerCase(); break;
                  case 'videos': va = a.videosDistintos; vb = b.videosDistintos; break;
                  case 'concluidos': va = a.videosConcluidos; vb = b.videosConcluidos; break;
                  case 'minutos': va = a.minutosAssistidos; vb = b.minutosAssistidos; break;
                  case 'ultimo': va = a.ultimoAcesso ? new Date(a.ultimoAcesso).getTime() : 0;
                                 vb = b.ultimoAcesso ? new Date(b.ultimoAcesso).getTime() : 0; break;
                  default: va = 0; vb = 0;
                }
                if (va < vb) return -1 * dir;
                if (va > vb) return 1 * dir;
                return 0;
              });
              return arr;
            })();

            const SortHeader = ({ col, label, align = 'left' }) => {
              const active = sortBy === col;
              const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
              return (
                <th className={`px-4 py-2 text-${align} select-none`}>
                  <button onClick={() => toggleSort(col)}
                    className={`inline-flex items-center gap-1 hover:text-white transition-colors ${
                      active ? 'text-cyan-400' : 'text-gray-500'
                    }`}>
                    {label}
                    <Icon size={11} className={active ? '' : 'opacity-40'} />
                  </button>
                </th>
              );
            };

            return (
          <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
            <div className="px-4 py-3 border-b border-white/[0.06]">
              <p className="text-sm font-bold text-white">Ranking de engajamento</p>
              <p className="text-[10px] text-gray-500">Clique nos cabeçalhos para ordenar</p>
            </div>
            {!sortedRanking.length ? (
              <div className="px-5 py-8 text-center text-sm text-gray-500">Sem dados de engajamento ainda.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-[10px] font-bold uppercase tracking-widest">
                      <th className="px-4 py-2 text-center w-10 text-gray-500">#</th>
                      <SortHeader col="nome" label="Colaborador" />
                      <SortHeader col="cargo" label="Cargo" />
                      <SortHeader col="videos" label="Vídeos" align="center" />
                      <SortHeader col="concluidos" label="Concluídos" align="center" />
                      <SortHeader col="minutos" label="Minutos" align="center" />
                      <SortHeader col="ultimo" label="Último acesso" align="center" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {sortedRanking.map((r, i) => (
                      <tr key={r.colabId} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 text-center text-xs text-amber-400 font-mono font-bold">{i + 1}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <Avatar nome={r.nome} fotoUrl={r.fotoUrl} size={28} />
                            <span className="text-white text-xs font-semibold truncate">{r.nome || '—'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-400">{r.cargo || '—'}</td>
                        <td className="px-4 py-2.5 text-center text-xs text-gray-300">{r.videosDistintos}</td>
                        <td className="px-4 py-2.5 text-center text-xs text-emerald-400 font-bold">{r.videosConcluidos}</td>
                        <td className="px-4 py-2.5 text-center text-sm text-cyan-400 font-bold">{r.minutosAssistidos}</td>
                        <td className="px-4 py-2.5 text-center text-[10px] text-gray-500">
                          {r.ultimoAcesso ? new Date(r.ultimoAcesso).toLocaleDateString('pt-BR') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
            );
          })()}
        </div>
      )}

      {tab === 'alertas' && (
        <div>
          <div className="rounded-xl border border-amber-400/30 p-4 mb-5"
            style={{ background: 'rgba(245,158,11,0.08)' }}>
            <p className="text-sm font-bold text-amber-400 flex items-center gap-2">
              <AlertTriangle size={14} /> Colaboradores inativos há {alertas?.dias || 14}+ dias
            </p>
            <p className="text-[11px] text-gray-400 mt-1">
              Lista de quem concluiu o mapeamento mas não assistiu nenhuma pílula recentemente
              (ou nunca). Considere um nudge via WhatsApp ou email.
            </p>
          </div>

          {!alertas?.alertas?.length ? (
            <div className="rounded-xl border border-white/[0.06] p-8 text-center" style={{ background: '#0F2A4A' }}>
              <Trophy size={32} className="text-emerald-400 mx-auto mb-2" />
              <p className="text-sm font-bold text-white">Ninguém inativo 🎉</p>
              <p className="text-[11px] text-gray-500 mt-1">Todos os colabs com mapeamento estão engajados nos últimos {alertas?.dias || 14} dias.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                      <th className="px-4 py-2 text-left">Colaborador</th>
                      <th className="px-4 py-2 text-left">Cargo / Área</th>
                      <th className="px-4 py-2 text-center">Status</th>
                      <th className="px-4 py-2 text-center">Última view</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {alertas.alertas.map(a => (
                      <tr key={a.colabId} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 text-white text-xs font-semibold">{a.nome || '—'}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-400">
                          {a.cargo || '—'}{a.area ? ` · ${a.area}` : ''}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {a.nuncaAssistiu ? (
                            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-red-400/10 text-red-400">
                              Nunca assistiu
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-400">
                              {a.diasSemAssistir}d sem assistir
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center text-[10px] text-gray-500">
                          {a.ultimaView ? new Date(a.ultimaView).toLocaleDateString('pt-BR') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
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
