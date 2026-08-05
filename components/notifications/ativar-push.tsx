'use client';

/**
 * Botão de adesão ao push + instrumentação do funil.
 *
 * Cada degrau vira um evento em `notification_optin_events` porque, sem eles, um
 * resultado fraco é ambíguo entre "push não engaja" e "ninguém conseguiu
 * instalar". No iOS a diferença é concreta: só dá para pedir permissão DEPOIS
 * de a pessoa adicionar o app à tela de início — e ela chega aqui, na maioria
 * das vezes, pelo navegador in-app do WhatsApp, de onde isso é impossível.
 * Por isso o estado "precisa instalar" é uma tela própria, com instrução
 * literal, e não um botão desabilitado.
 *
 * Textos em pt-BR direto: este botão só aparece onde a flag
 * `sys_config.notificacoes_push` está ligada (hoje, só o tenant de teste).
 * Quando for para tenant real, as strings passam para os 4 locales — dívida
 * declarada, não esquecida.
 */
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { fetchAuth } from '@/lib/auth/fetch-auth';

type Estado = 'carregando' | 'sem-suporte' | 'precisa-instalar' | 'pode-ativar' | 'ativo' | 'negado';

const CHAVE_INSTALACAO = 'vertho:push:installation-id';

function obterInstallationId(): string {
  let id = localStorage.getItem(CHAVE_INSTALACAO);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CHAVE_INSTALACAO, id);
  }
  return id;
}

/** A chave VAPID viaja em base64url; o PushManager exige Uint8Array. */
function base64UrlParaUint8Array(base64: string): BufferSource {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normal = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normal);
  // Buffer explícito: `new Uint8Array(n)` infere ArrayBufferLike (que inclui
  // SharedArrayBuffer) e o tipo de `applicationServerKey` só aceita ArrayBuffer.
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function estaInstalado(): boolean {
  // iOS expõe `navigator.standalone`; os demais, o media query.
  const iosStandalone = (window.navigator as any).standalone === true;
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches;
}

function ehIOS(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua) || (/macintosh/.test(ua) && 'ontouchend' in document);
}

async function registrarEvento(step: string, detalhe?: Record<string, unknown>) {
  try {
    await fetchAuth('/api/notifications/optin-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step, detalhe: detalhe ?? null }),
    });
  } catch {
    // Telemetria nunca bloqueia a jornada da pessoa.
  }
}

export function AtivarPush() {
  const [estado, setEstado] = useState<Estado>('carregando');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      const suportado = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      if (!suportado) {
        if (!cancelado) setEstado('sem-suporte');
        return;
      }

      const instalado = estaInstalado();
      // No iOS, PushManager só existe dentro do app instalado — sem isso não há
      // o que ativar, e insistir num botão aqui só gera frustração.
      if (ehIOS() && !instalado) {
        if (!cancelado) setEstado('precisa-instalar');
        await registrarEvento('convite_exibido', { motivo: 'ios-nao-instalado' });
        return;
      }

      await registrarEvento('convite_exibido');
      if (instalado) await registrarEvento('instalado_detectado');

      if (Notification.permission === 'denied') {
        if (!cancelado) setEstado('negado');
        return;
      }

      const reg = await navigator.serviceWorker.getRegistration();
      const jaInscrito = reg ? await reg.pushManager.getSubscription() : null;
      if (!cancelado) setEstado(jaInscrito ? 'ativo' : 'pode-ativar');
    })().catch(() => {
      if (!cancelado) setEstado('sem-suporte');
    });

    return () => {
      cancelado = true;
    };
  }, []);

  const ativar = useCallback(async () => {
    setOcupado(true);
    try {
      const chave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!chave) {
        toast.error('Notificações indisponíveis no momento.');
        return;
      }

      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;

      await registrarEvento('permissao_solicitada');
      // A permissão PRECISA ser pedida dentro do gesto do usuário — pedir no
      // carregamento da página é negado direto pelo Safari.
      const permissao = await Notification.requestPermission();
      if (permissao !== 'granted') {
        await registrarEvento('permissao_negada');
        setEstado('negado');
        toast.error('Você recusou as notificações. Dá para liberar depois nos ajustes do navegador.');
        return;
      }
      await registrarEvento('permissao_concedida');

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlParaUint8Array(chave),
      });

      const res = await fetchAuth('/api/notifications/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          installationId: obterInstallationId(),
          subscription: subscription.toJSON(),
        }),
      });

      if (!res.ok) {
        // Inscrição existe no navegador mas não no nosso banco: é o pior estado
        // possível (parece ativo e nunca chega push). Desfaz para não mentir.
        await subscription.unsubscribe();
        toast.error('Não conseguimos concluir. Tente de novo em instantes.');
        return;
      }

      await registrarEvento('endpoint_registrado');
      setEstado('ativo');
      toast.success('Pronto! Você vai receber os avisos por aqui.');
    } catch (e) {
      toast.error('Não foi possível ativar as notificações.');
    } finally {
      setOcupado(false);
    }
  }, []);

  const desativar = useCallback(async () => {
    setOcupado(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) await sub.unsubscribe();
      await fetchAuth('/api/notifications/subscriptions/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installationId: obterInstallationId() }),
      });
      setEstado('pode-ativar');
      toast.success('Notificações desativadas neste aparelho.');
    } catch {
      toast.error('Não foi possível desativar.');
    } finally {
      setOcupado(false);
    }
  }, []);

  if (estado === 'carregando' || estado === 'sem-suporte') return null;

  const moldura = 'rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm';

  if (estado === 'precisa-instalar') {
    return (
      <div className={moldura}>
        <p className="text-sm font-medium text-slate-900">Receba os avisos no seu iPhone</p>
        <p className="mt-1 text-sm text-slate-600">
          Para isso, o app precisa estar na sua tela de início. No <strong>Safari</strong>, toque em
          {' '}<strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>. Abra o
          Vertho por lá e volte aqui.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Se você abriu este link pelo WhatsApp, toque em “Abrir no Safari” primeiro.
        </p>
      </div>
    );
  }

  if (estado === 'negado') {
    return (
      <div className={moldura}>
        <p className="text-sm font-medium text-slate-900">Notificações bloqueadas</p>
        <p className="mt-1 text-sm text-slate-600">
          Libere as notificações do Vertho nos ajustes do seu navegador e volte aqui.
        </p>
      </div>
    );
  }

  if (estado === 'ativo') {
    return (
      <div className={`${moldura} flex items-center justify-between gap-3`}>
        <p className="text-sm text-slate-700">Notificações ativas neste aparelho.</p>
        <button
          type="button"
          onClick={desativar}
          disabled={ocupado}
          className="text-sm text-slate-500 underline underline-offset-2 disabled:opacity-50"
        >
          Desativar
        </button>
      </div>
    );
  }

  return (
    <div className={moldura}>
      <p className="text-sm font-medium text-slate-900">Quer ser avisado quando chegar conteúdo novo?</p>
      <p className="mt-1 text-sm text-slate-600">
        A gente te avisa por aqui quando a semana abrir — sem depender do WhatsApp.
      </p>
      <button
        type="button"
        onClick={ativar}
        disabled={ocupado}
        className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {ocupado ? 'Ativando…' : 'Ativar notificações'}
      </button>
    </div>
  );
}
