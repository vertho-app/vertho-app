'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft, Send, Loader2, MessageCircle, Mail, Activity,
  Users, AlertCircle, CheckCircle, RefreshCw,
} from 'lucide-react';
import { enviarConvitesPulso, statusEnviosCiclo, type EnvioStats } from '@/actions/pulse/envio';
import { listarCiclos } from '@/actions/pulse/admin';

type PulseMoment = 'T0' | 'T2';

export default function EnviarPulsoPage({
  params,
}: { params: Promise<{ empresaId: string; cicloId: string }> }) {
  const { empresaId, cicloId } = use(params);
  const router = useRouter();
  const t = useTranslations('AdminPulse.sendPage');

  const [loading, setLoading] = useState(true);
  const [ciclo, setCiclo] = useState<any>(null);
  const [moment, setMoment] = useState<PulseMoment>('T0');
  const [canal, setCanal] = useState<'whatsapp' | 'email' | 'ambos'>('whatsapp');
  const [mensagem, setMensagem] = useState(t('defaultMessage'));
  const [status, setStatus] = useState<any>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<EnvioStats | null>(null);
  const [forceResend, setForceResend] = useState(false);

  async function load() {
    setLoading(true);
    const ciclos = await listarCiclos(empresaId);
    const c = ciclos.find(x => x.id === cicloId);
    setCiclo(c);
    const st = await statusEnviosCiclo(empresaId, cicloId, moment);
    setStatus(st);
    setLoading(false);
  }

  useEffect(() => { load(); }, [empresaId, cicloId, moment]);

  async function handleEnviar() {
    if (!window.confirm(
      t('confirm.send', { moment, channel: canal.toUpperCase() })
    )) return;

    setSending(true); setResult(null);
    const r = await enviarConvitesPulso(empresaId, cicloId, {
      pulse_moment: moment,
      canal,
      mensagem_custom: mensagem,
      force_resend: forceResend,
    });
    setSending(false);
    if (r.ok === false) { alert(r.error); return; }
    setResult(r.stats);
    await load();
  }

  if (loading) return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  if (!ciclo) return <div className="p-10 text-sm text-red-400">{t('notFound')}</div>;

  const cicloAberto = (moment === 'T0' && ciclo.status === 't0_aberto')
    || (moment === 'T2' && ciclo.status === 't2_aberto');

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/admin/empresas/${empresaId}/pulso`)}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Send size={20} className="text-cyan-400" /> {t('title')}
            </h1>
            <p className="text-xs text-gray-500">{t('subtitle', { name: ciclo.nome, status: ciclo.status })}</p>
          </div>
        </div>
        <button onClick={load}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10">
          <RefreshCw size={11} /> {t('actions.refresh')}
        </button>
      </div>

      {/* Aviso quando ciclo está fechado pro momento */}
      {!cicloAberto && (
        <div className="mb-5 p-4 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] flex items-start gap-3">
          <AlertCircle size={18} className="text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-amber-300 mb-1">{t('warning.title', { moment })}</p>
            <p className="text-[11px] text-gray-300 leading-relaxed">
              {t.rich('warning.body', {
                status: ciclo.status,
                strong: chunks => <span className="font-bold">{chunks}</span>,
              })}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Coluna esquerda: configuração */}
        <div className="space-y-4">
          {/* Momento */}
          <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: '#0F2A4A' }}>
            <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2">{t('form.moment')}</p>
            <div className="flex gap-2">
              {(['T0', 'T2'] as PulseMoment[]).map(m => (
                <button key={m} onClick={() => setMoment(m)}
                  className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${
                    moment === m ? 'bg-cyan-400 text-[#0F2B54]' : 'text-gray-400 border border-white/10 hover:text-white'
                  }`}>
                  {m === 'T0' ? t('moments.t0') : t('moments.t2')}
                </button>
              ))}
            </div>
          </div>

          {/* Canal */}
          <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: '#0F2A4A' }}>
            <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2">{t('form.channel')}</p>
            <div className="flex gap-2">
              {([
                { v: 'whatsapp', label: t('channels.whatsapp'), icon: MessageCircle },
                { v: 'email', label: t('channels.email'), icon: Mail },
                { v: 'ambos', label: t('channels.both'), icon: Send },
              ] as const).map(o => (
                <button key={o.v} onClick={() => setCanal(o.v)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[10px] font-bold transition-all ${
                    canal === o.v ? 'bg-cyan-400 text-[#0F2B54]' : 'text-gray-400 border border-white/10 hover:text-white'
                  }`}>
                  <o.icon size={11} /> {o.label}
                </button>
              ))}
            </div>
            {canal !== 'whatsapp' && (
              <p className="text-[9px] text-gray-500 mt-2 leading-relaxed">
                {t('channelHint')}
              </p>
            )}
          </div>

          {/* Mensagem */}
          <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: '#0F2A4A' }}>
            <p className="text-xs font-bold text-white flex items-center gap-1.5 mb-2">
              <MessageCircle size={12} /> {t('message.title')}
            </p>
            <p className="text-[9px] text-gray-500 mb-2">
              {t('message.variables')} <code className="text-cyan-400">{'{{nome}}'}</code>, <code className="text-cyan-400">{'{{empresa}}'}</code>, <code className="text-cyan-400">{'{{link_pulso}}'}</code>
            </p>
            <textarea value={mensagem} onChange={e => setMensagem(e.target.value)}
              rows={10}
              className="w-full rounded-lg border border-white/10 bg-[#091D35] text-white text-xs px-3 py-2 focus:outline-none focus:border-cyan-400/50 resize-none font-mono" />
          </div>

          {/* Reenviar */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={forceResend} onChange={e => setForceResend(e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-[#091D35] accent-cyan-400" />
            <span className="text-[11px] text-gray-300">
              {t('forceResend')}
            </span>
          </label>

          {/* Botão */}
          <button onClick={handleEnviar} disabled={sending || status?.pending === 0}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold text-[#0F2B54] bg-cyan-400 hover:brightness-110 transition-all disabled:opacity-40">
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {sending ? t('actions.sending') : t('actions.sendPending', { count: status?.pending || 0 })}
          </button>

          {result && (
            <div className="p-4 rounded-xl border border-green-400/15 bg-green-400/[0.04]">
              <p className="text-[11px] text-green-400 font-bold mb-2 flex items-center gap-1.5">
                <CheckCircle size={11} /> {t('result.title')}
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-gray-300">
                <span>{t('result.sent')}: <span className="text-white font-bold">{result.enviados}</span></span>
                <span>{t('result.alreadySent')}: <span className="text-white">{result.ja_enviados}</span></span>
                <span>{t('result.noPhone')}: <span className="text-amber-400">{result.sem_telefone}</span></span>
                <span>{t('result.noEmail')}: <span className="text-amber-400">{result.sem_email}</span></span>
                <span>{t('result.errors')}: <span className={result.erros > 0 ? 'text-red-400' : 'text-gray-500'}>{result.erros}</span></span>
              </div>
              {result.ultimo_erro && (
                <p className="text-[10px] text-red-400 mt-2 break-all">{result.ultimo_erro}</p>
              )}
            </div>
          )}
        </div>

        {/* Coluna direita: status atual */}
        <div className="space-y-4">
          <div className="rounded-xl border border-white/[0.06] p-5" style={{ background: '#0F2A4A' }}>
            <p className="text-xs font-bold text-white mb-4 flex items-center gap-1.5">
              <Activity size={12} className="text-cyan-400" /> {t('status.title', { moment })}
            </p>
            {status && (
              <div className="grid grid-cols-2 gap-3">
                <StatCard label={t('status.total')} value={status.total} />
                <StatCard label={t('status.completed')} value={status.completos} color="green" />
                <StatCard label={t('status.whatsappSent')} value={status.enviados_wa} color="cyan" />
                <StatCard label={t('status.emailSent')} value={status.enviados_email} color="purple" />
                <StatCard label={t('status.pending')} value={status.pending} color="amber" />
              </div>
            )}
          </div>

          <div className="p-4 rounded-xl border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <Users size={11} /> {t('howItWorks.title')}
            </p>
            <ul className="space-y-1.5 text-[10px] text-gray-400 leading-relaxed">
              <li>• {t('howItWorks.magicLink')}</li>
              <li>• {t('howItWorks.validity')}</li>
              <li>• {t('howItWorks.whatsapp')}</li>
              <li>• {t('howItWorks.audit')}</li>
              <li>• {t('howItWorks.idempotent')}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color = 'white' }: any) {
  const colors: Record<string, string> = {
    white: 'text-white', green: 'text-green-400',
    cyan: 'text-cyan-400', amber: 'text-amber-400', purple: 'text-purple-400',
  };
  return (
    <div className="p-3 rounded-lg" style={{ background: '#091D35' }}>
      <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colors[color]}`}>{value}</p>
    </div>
  );
}
