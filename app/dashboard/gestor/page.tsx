'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users, AlertTriangle, ChevronRight, Loader2, ArrowRight,
  Calendar, TrendingUp, Activity, ClipboardCheck,
} from 'lucide-react';
import { PageContainer, GlassCard } from '@/components/page-shell';
import { getGestorHomeData, type GestorHomeData, type CheckpointPendenteDetalhado } from './actions';
import { salvarCheckpointGestor } from './equipe-evolucao/actions';

export default function GestorHomePage() {
  const router = useRouter();
  const [data, setData] = useState<GestorHomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [avaliando, setAvaliando] = useState<string | null>(null);
  const [modal, setModal] = useState<{ cp: CheckpointPendenteDetalhado; avaliacao: 'evoluindo' | 'estagnado' | 'regredindo' } | null>(null);
  const [observacao, setObservacao] = useState('');

  async function carregar() {
    setLoading(true);
    const r = await getGestorHomeData();
    setData(r);
    setLoading(false);
  }
  useEffect(() => { carregar(); }, []);

  async function aplicarAvaliacao() {
    if (!modal) return;
    const key = `${modal.cp.trilhaId}-${modal.cp.semana}`;
    setAvaliando(key);
    const r = await salvarCheckpointGestor({
      trilhaId: modal.cp.trilhaId,
      semana: modal.cp.semana,
      avaliacao: modal.avaliacao,
      observacao: observacao.trim() || null,
    });
    setAvaliando(null);
    if (r.error) { alert(r.error); return; }
    setModal(null);
    setObservacao('');
    await carregar();
  }

  if (loading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="animate-spin text-cyan-400" />
        </div>
      </PageContainer>
    );
  }

  if (!data?.ok) {
    return (
      <PageContainer>
        <GlassCard>
          <p className="text-red-400">{data?.error || 'Erro ao carregar'}</p>
        </GlassCard>
      </PageContainer>
    );
  }

  const k = data.kpis!;
  const alertas = data.alertas || [];
  const cps = data.checkpointsPendentes || [];
  const semLiderados = data.scope === 'gestor' && k.liderados.total === 0;

  return (
    <PageContainer>
      {/* Header */}
      <div className="flex items-baseline justify-between gap-3 mb-5 flex-wrap">
        <div>
          <p className="text-[10px] tracking-[0.2em] uppercase font-mono text-cyan-300/80 mb-1">
            {data.scope === 'rh' ? 'RH · empresa toda' : 'Gestor · sua área'}
          </p>
          <h1 className="text-white text-2xl font-bold flex items-center gap-2">
            <Users size={22} className="text-cyan-400" /> Minha equipe
          </h1>
        </div>
        <button onClick={() => router.push('/dashboard/gestor/equipe-evolucao')}
          className="text-[11px] font-bold text-cyan-300 hover:text-cyan-200 flex items-center gap-1">
          Ver evolução completa <ArrowRight size={11} />
        </button>
      </div>

      {/* Aviso: gestor sem liderados vinculados */}
      {semLiderados && (
        <div className="mb-5 rounded-2xl p-4 border border-amber-400/25"
          style={{ background: 'rgba(251,191,36,0.05)' }}>
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-[12px] font-bold text-amber-200 mb-1">
                Você ainda não tem liderados vinculados
              </p>
              <p className="text-[11px] text-amber-100/75 leading-relaxed">
                O vínculo gestor → liderado é feito via campo <code className="text-amber-200">gestor_email</code>{' '}
                em cada colaborador. Peça ao admin da empresa pra preencher esse campo com seu
                e-mail nos colaboradores que você lidera (na importação ou em <em>Gerenciar colaboradores</em>).
                Enquanto não houver vínculo, esta tela aparece zerada por segurança — gestores não
                veem dados de quem não é seu liderado direto.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Hero — 4 KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiCard
          icon={Users}
          label="Liderados"
          valor={k.liderados.total}
          subtitulo={`${k.liderados.em_trilha} em trilha · ${k.liderados.sem_trilha} sem trilha`}
        />
        <KpiCard
          icon={TrendingUp}
          label="Em andamento"
          valor={k.em_andamento.count}
          subtitulo={k.em_andamento.semana_media != null
            ? `semana média ${k.em_andamento.semana_media} de 14`
            : 'sem trilha ativa'}
        />
        <KpiCard
          icon={ClipboardCheck}
          label="Checkpoints"
          valor={k.checkpoints.pendentes}
          subtitulo={`${k.checkpoints.respondidos} já respondido${k.checkpoints.respondidos === 1 ? '' : 's'}`}
          acento={k.checkpoints.pendentes > 0 ? 'amber' : 'gray'}
          sufixo={k.checkpoints.pendentes > 0 ? 'pendentes' : ''}
        />
        <KpiCard
          icon={Activity}
          label="Atividade na semana"
          valor={k.atividade_semana.ativos}
          subtitulo={`de ${k.atividade_semana.total} ativos nos últ. 7 dias`}
          acento={k.atividade_semana.ativos > 0 ? 'cyan' : 'gray'}
          sufixo={`de ${k.atividade_semana.total}`}
        />
      </div>

      {/* Alertas */}
      {alertas.length > 0 && (
        <div className="mb-5 rounded-2xl border border-amber-400/25 overflow-hidden"
          style={{ background: 'rgba(251,191,36,0.05)' }}>
          <div className="px-4 py-2.5 border-b border-amber-400/15 flex items-center gap-2">
            <AlertTriangle size={13} className="text-amber-400" />
            <p className="text-[10px] tracking-[0.2em] uppercase font-mono text-amber-300">
              Sinais de atenção · {alertas.length}
            </p>
          </div>
          <ul className="px-4 py-2 space-y-1.5">
            {alertas.map((a) => (
              <li key={a.tipo} className="flex items-start gap-2 text-[12px] text-amber-100/85">
                <span className="text-amber-400 mt-0.5">·</span>
                <span>{a.mensagem}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Seção 1 — Ação esta semana (checkpoints pendentes) */}
      <section className="mb-6">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-white text-base font-bold flex items-center gap-2">
            <ClipboardCheck size={16} className="text-cyan-400" /> Ação esta semana
          </h2>
          {cps.length > 0 && <span className="text-[11px] text-white/50">{cps.length} pendente{cps.length === 1 ? '' : 's'}</span>}
        </div>

        {cps.length === 0 ? (
          <GlassCard>
            <p className="text-[12px] text-white/55 leading-relaxed text-center py-3">
              Nada pendente neste momento. Quando os liderados chegarem nas semanas 5 e 10 das trilhas,
              checkpoints aparecerão aqui pra avaliação.
            </p>
          </GlassCard>
        ) : (
          <div className="space-y-2">
            {cps.map((cp) => (
              <CheckpointCard key={`${cp.trilhaId}-${cp.semana}`} cp={cp}
                onAvaliar={(av) => setModal({ cp, avaliacao: av })}
                avaliando={avaliando === `${cp.trilhaId}-${cp.semana}`} />
            ))}
          </div>
        )}
      </section>

      {/* Próximas seções: Equipe em trilha, Mapa de perfis, Timeline — Etapas 2-4 */}
      <GlassCard>
        <p className="text-[11px] text-white/50 leading-relaxed">
          <span className="text-cyan-300 font-bold">Em construção:</span> tabela detalhada da equipe,
          mapa de perfis comportamentais, próximas trilhas concluindo. Por enquanto use{' '}
          <button onClick={() => router.push('/dashboard/gestor/equipe-evolucao')}
            className="underline text-cyan-300 hover:text-cyan-200">
            Evolução da equipe
          </button>{' '}para detalhes individuais.
        </p>
      </GlassCard>

      {/* Modal de avaliação */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setModal(null)}>
          <div className="w-full max-w-[480px] rounded-2xl border border-white/[0.08] p-5"
            style={{ background: '#0A1D35' }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-4">
              <p className="text-[10px] tracking-[0.2em] uppercase font-mono text-cyan-300 mb-1">
                Checkpoint semana {modal.cp.semana} · avaliação
              </p>
              <h3 className="text-white text-base font-bold">{modal.cp.colab}</h3>
              <p className="text-[11px] text-white/55 mt-0.5">
                {modal.cp.competenciaFoco || 'sem competência foco'}
              </p>
              <p className="text-[11px] mt-3" style={{
                color: modal.avaliacao === 'evoluindo' ? '#34D399'
                  : modal.avaliacao === 'estagnado' ? '#FCD34D' : '#F87171',
              }}>
                Avaliação: <strong>{
                  modal.avaliacao === 'evoluindo' ? 'Evoluindo'
                  : modal.avaliacao === 'estagnado' ? 'Estagnado' : 'Regredindo'
                }</strong>
              </p>
            </div>

            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder={modal.avaliacao === 'evoluindo' ? 'Observação (opcional)' : 'O que observou? (opcional, mas ajuda)'}
              rows={3}
              className="w-full rounded-lg border border-white/[0.08] px-3 py-2 text-[12px] text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-400/40"
              style={{ background: '#091D35' }}
            />

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { setModal(null); setObservacao(''); }}
                className="px-3 py-1.5 rounded-lg text-[11px] text-white/60 hover:text-white">
                Cancelar
              </button>
              <button onClick={aplicarAvaliacao} disabled={!!avaliando}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-cyan-400/15 text-cyan-300 border border-cyan-400/30 hover:bg-cyan-400/25 disabled:opacity-50">
                {avaliando ? <Loader2 size={11} className="animate-spin" /> : <ClipboardCheck size={11} />}
                Confirmar avaliação
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}

// ── Componentes auxiliares ──

function KpiCard({
  icon: Icon, label, valor, subtitulo, acento = 'gray', sufixo,
}: {
  icon: any;
  label: string;
  valor: number;
  subtitulo: string;
  acento?: 'gray' | 'cyan' | 'amber' | 'green';
  sufixo?: string;
}) {
  const cor = acento === 'cyan' ? '#34c5cc'
    : acento === 'amber' ? '#FCD34D'
    : acento === 'green' ? '#34D399'
    : '#cbd5e1';
  return (
    <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: '#0F2A4A' }}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon size={12} style={{ color: cor }} />
        <p className="text-[10px] tracking-[0.18em] uppercase font-mono text-white/45">{label}</p>
      </div>
      <p className="text-2xl font-bold" style={{ color: cor }}>
        {valor}
        {sufixo && <span className="text-[10px] text-white/40 font-mono ml-1.5">{sufixo}</span>}
      </p>
      <p className="text-[10px] text-white/45 leading-snug mt-1">{subtitulo}</p>
    </div>
  );
}

function CheckpointCard({
  cp, onAvaliar, avaliando,
}: {
  cp: CheckpointPendenteDetalhado;
  onAvaliar: (av: 'evoluindo' | 'estagnado' | 'regredindo') => void;
  avaliando: boolean;
}) {
  const inicial = cp.colab.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('');
  const corDias = cp.diasPendente >= 7 ? 'rgba(248,113,113,0.18)'
    : cp.diasPendente >= 3 ? 'rgba(252,211,77,0.18)'
    : 'rgba(255,255,255,0.06)';
  const textoDias = cp.diasPendente >= 7 ? 'text-red-300'
    : cp.diasPendente >= 3 ? 'text-amber-300'
    : 'text-white/60';

  return (
    <div className="rounded-xl border border-white/[0.06] p-3 flex items-center gap-3"
      style={{ background: '#0F2A4A' }}>
      <div className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
        style={{ background: 'linear-gradient(135deg, #34c5cc, #2aa8ae)' }}>
        {inicial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-white truncate">{cp.colab}</p>
          <span className="text-[9px] font-mono text-cyan-400/70 bg-cyan-400/10 px-1.5 py-0.5 rounded">
            sem {cp.semana}
          </span>
        </div>
        <p className="text-[11px] text-white/55 truncate">
          {cp.cargo || 'sem cargo'} {cp.competenciaFoco && <>· <span className="text-cyan-300/70">{cp.competenciaFoco}</span></>}
        </p>
      </div>
      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0 ${textoDias}`}
        style={{ background: corDias }}>
        {cp.diasPendente === 0 ? 'hoje' : `${cp.diasPendente}d`}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        <AvaliarBtn av="evoluindo" onClick={() => onAvaliar('evoluindo')} disabled={avaliando} />
        <AvaliarBtn av="estagnado" onClick={() => onAvaliar('estagnado')} disabled={avaliando} />
        <AvaliarBtn av="regredindo" onClick={() => onAvaliar('regredindo')} disabled={avaliando} />
      </div>
    </div>
  );
}

function AvaliarBtn({
  av, onClick, disabled,
}: {
  av: 'evoluindo' | 'estagnado' | 'regredindo';
  onClick: () => void;
  disabled?: boolean;
}) {
  const cfg = av === 'evoluindo'
    ? { color: '#34D399', bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.3)', label: '↑' }
    : av === 'estagnado'
    ? { color: '#FCD34D', bg: 'rgba(252,211,77,0.1)', border: 'rgba(252,211,77,0.3)', label: '→' }
    : { color: '#F87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.3)', label: '↓' };
  return (
    <button onClick={onClick} disabled={disabled}
      title={av === 'evoluindo' ? 'Evoluindo' : av === 'estagnado' ? 'Estagnado' : 'Regredindo'}
      className="w-7 h-7 rounded-lg border text-xs font-bold transition-colors disabled:opacity-40"
      style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}>
      {cfg.label}
    </button>
  );
}
