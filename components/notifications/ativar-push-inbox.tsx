'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { fetchAuth } from '@/lib/auth/fetch-auth';

const CHAVE_INSTALACAO = 'vertho:push:inbox:installation-id';

function obterInstallationId(): string {
  let id = localStorage.getItem(CHAVE_INSTALACAO);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(CHAVE_INSTALACAO, id); }
  return id;
}
function base64UrlParaUint8Array(base64: string): BufferSource {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normal = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normal);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function estaInstalado(): boolean {
  const iosStandalone = (window.navigator as any).standalone === true;
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches;
}
function ehIOS(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua) || (/macintosh/.test(ua) && 'ontouchend' in document);
}

type Estado = 'carregando' | 'precisa-instalar' | 'pode-ativar' | 'ativo' | 'negado' | 'sem-suporte' | 'desabilitado';

export function AtivarPushInbox() {
  const [estado, setEstado] = useState<Estado>('carregando');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      if (ehIOS() && !estaInstalado()) { if (!cancelado) setEstado('precisa-instalar'); return; }
      const tem = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      if (!tem) { if (!cancelado) setEstado('sem-suporte'); return; }
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (!sub) { if (!cancelado) setEstado(Notification.permission === 'denied' ? 'negado' : 'pode-ativar'); return; }
      // Reamarra ao admin logado agora (troca de dono no mesmo aparelho).
      try {
        const res = await fetchAuth('/api/notifications/admin/subscriptions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ installationId: obterInstallationId(), subscription: sub.toJSON() }),
        });
        if (!cancelado) setEstado(res.ok ? 'ativo' : 'pode-ativar');
      } catch { if (!cancelado) setEstado('pode-ativar'); }
    })().catch(() => { if (!cancelado) setEstado('sem-suporte'); });
    return () => { cancelado = true; };
  }, []);

  const ativar = useCallback(async () => {
    setOcupado(true);
    try {
      const chave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!chave) { toast.error('Notificações indisponíveis (VAPID).'); return; }
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setEstado('negado'); toast.error('Você recusou. Libere nos ajustes do navegador.'); return; }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlParaUint8Array(chave) });
      const res = await fetchAuth('/api/notifications/admin/subscriptions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installationId: obterInstallationId(), subscription: sub.toJSON() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j?.error || 'Não foi possível ativar.');
        return;
      }
      setEstado('ativo');
      toast.success('Push da inbox ativo — você será avisado de novas mensagens.');
    } catch { toast.error('Não foi possível ativar as notificações.'); }
    finally { setOcupado(false); }
  }, []);

  const desativar = useCallback(async () => {
    setOcupado(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) await sub.unsubscribe();
      await fetchAuth('/api/notifications/admin/subscriptions/disable', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installationId: obterInstallationId() }),
      });
      setEstado('pode-ativar');
      toast.success('Push da inbox desativado neste aparelho.');
    } catch { toast.error('Não foi possível desativar.'); }
    finally { setOcupado(false); }
  }, []);

  if (estado === 'carregando' || estado === 'sem-suporte') return null;

  const box = 'rounded-xl border border-white/[0.08] bg-[var(--navy-card)] px-4 py-3';

  if (estado === 'precisa-instalar') {
    return (
      <div className={box}>
        <p className="text-[13px] font-medium">Ativar aviso de nova mensagem no iPhone</p>
        <p className="mt-1 text-[12px] text-[var(--ink-dim)]">
          No <strong>Safari</strong>, toque em Compartilhar → <strong>Adicionar à Tela de Início</strong>. Abra o Vertho por lá e volte aqui.
        </p>
        <p className="mt-1 text-[11px] text-[var(--ink-faint)]">Se abriu pelo WhatsApp, toque em “Abrir no Safari” primeiro.</p>
      </div>
    );
  }
  if (estado === 'negado') {
    return (
      <div className={box}>
        <p className="text-[13px] font-medium">Notificações bloqueadas</p>
        <p className="mt-1 text-[12px] text-[var(--ink-dim)]">Libere o Vertho nos ajustes do navegador.</p>
      </div>
    );
  }
  if (estado === 'ativo') {
    return (
      <div className={`${box} flex items-center justify-between gap-3`}>
        <p className="text-[12px] text-[var(--ink-dim)]">Push da inbox ativo neste aparelho.</p>
        <button type="button" onClick={desativar} disabled={ocupado} className="text-[12px] underline underline-offset-2 opacity-70 hover:opacity-100 disabled:opacity-40">Desativar</button>
      </div>
    );
  }
  if (estado === 'desabilitado') {
    return (
      <div className={box}>
        <p className="text-[12px] text-[var(--ink-dim)]">Push da inbox desabilitado pela equipe (flag).</p>
      </div>
    );
  }
  return (
    <div className={box}>
      <p className="text-[13px] font-medium">Receber aviso quando chegar mensagem?</p>
      <p className="mt-1 text-[12px] text-[var(--ink-dim)]">Avisa mesmo com a aba fechada — sem depender de ficar atualizando.</p>
      <button type="button" onClick={ativar} disabled={ocupado} className="mt-2 rounded-lg bg-[var(--cyan)] px-3.5 py-1.5 text-[12px] font-medium text-[#0f2b54] disabled:opacity-40">
        {ocupado ? 'Ativando…' : 'Ativar aviso'}
      </button>
    </div>
  );
}
