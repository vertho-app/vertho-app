import React, { useEffect, useRef, useState } from 'react';
import { Check, Download, Settings2, WifiOff, X } from 'lucide-react';
import { BASE, installedPackage, preparePackage, verifyPackage, type InstalledPackage } from './cache';
import type { OfflinePackage } from './types';
export default function PackageControls() {
  const [open, setOpen] = useState(false);

  const [installed, setInstalled] = useState<InstalledPackage | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Conferindo o pacote neste aparelho…");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);

  const [latest, setLatest] = useState<OfflinePackage | null>(null);
  const abort = useRef<AbortController | null>(null);
  const version = document.documentElement.dataset.version;

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    void (async () => {
      try {
        if (!("serviceWorker" in navigator) || !("caches" in window))
          throw new Error(
            "Use um navegador atualizado para preparar a apresentação neste aparelho.",
          );
        const current = await installedPackage();
        setInstalled(current);
        if (current) {
          await verifyPackage(current);
          setReady(true);
          setMessage("Pacote completo neste aparelho.");
        } else { setMessage("Baixe o pacote pelo Wi-Fi antes de apresentar."); setOpen(true); }
      } catch (e) {
        setError((e as Error).message);
        setOpen(true);
        setMessage("O pacote precisa ser preparado.");
      }
    })();
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (!online) return;
    const controller = new AbortController();
    fetch(`${BASE}package.json`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(setLatest)
      .catch(() => {});
    return () => controller.abort();
  }, [online]);

  async function prepare() {
    if (busy) return;
    setBusy(true);
    setError("");
    setProgress(0);
    abort.current = new AbortController();
    try {
      const registration = await navigator.serviceWorker.register(
        `${BASE}sw.js`,
        { scope: BASE, updateViaCache: "none" },
      );
      if (!registration.active)
        await new Promise<void>((resolve, reject) => {
          const worker = registration.installing || registration.waiting;
          if (!worker)
            return reject(
              new Error(
                "Não foi possível preparar o modo offline. Recarregue a página.",
              ),
            );
          const timer = setTimeout(
            () =>
              reject(new Error("O preparo demorou demais. Tente novamente.")),
            30000,
          );
          worker.addEventListener("statechange", () => {
            if (worker.state === "activated") {
              clearTimeout(timer);
              resolve();
            }
            if (worker.state === "redundant") {
              clearTimeout(timer);
              reject(new Error("Falha ao preparar o modo offline."));
            }
          });
        });
      await navigator.storage?.persist?.().catch(() => false);
      const response = await fetch(`${BASE}package.json`, {
        cache: "no-store",
        signal: abort.current.signal,
      });
      if (!response.ok)
        throw new Error("Conecte ao Wi-Fi para baixar o pacote.");
      const pack: OfflinePackage = await response.json();
      const result = await preparePackage(
        pack,
        abort.current.signal,
        (done, total, name) => {
          setProgress(Math.round((done / total) * 100));
          setMessage(
            `Baixando ${name} · ${(done / 1048576).toFixed(1)} de ${(total / 1048576).toFixed(1)} MB`,
          );
        },
      );
      setInstalled(result);
      setReady(true);
      setMessage("Pacote completo neste aparelho.");
      if (
        pack.version !== version ||
        !navigator.serviceWorker.controller?.scriptURL.endsWith(`${BASE}sw.js`)
      )
        location.reload();
    } catch (e) {
      setError(
        (e as Error).name === "AbortError"
          ? "Download cancelado. Você pode preparar o pacote novamente."
          : (e as Error).name === "QuotaExceededError"
            ? "Faltou espaço no aparelho. Libere espaço e tente novamente."
            : (e as Error).message,
      );
      setMessage(
        installed && ready
          ? "O pacote anterior continua disponível."
          : "O pacote ainda não está completo.",
      );
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }

  async function verify() {
    if (!installed || busy) return;
    setBusy(true);
    setError("");
    setMessage("Conferindo todos os arquivos salvos…");
    try {
      await verifyPackage(installed);
      setReady(true);
      setMessage(
        "Conferido: telas e conteúdos completos. Desligue a internet e reabra este endereço para testar.",
      );
    } catch (e) {
      setReady(false);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const totalBytes = latest?.assets.reduce((sum, item) => sum + item.bytes, 0) || 0;
  return <>
    <button type="button" onClick={() => setOpen(true)} title="Preparo offline" aria-label="Preparo offline" className="fixed right-4 top-4 z-[45] grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-[#071321]/90 text-white/60 shadow-lg hover:text-cyan-300">
      {online ? <Settings2 size={16} /> : <WifiOff size={16} />}
    </button>
    {open && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Preparo offline">
      <section className="w-full max-w-lg rounded-2xl border border-cyan-300/20 bg-[#0b1a2b] p-6 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="text-lg font-bold">{busy ? 'Preparando apresentação' : ready ? 'Pronto para apresentar offline' : 'Prepare a apresentação offline'}</h2><p className="mt-2 text-sm text-white/60" role="status" aria-live="polite">{message}</p></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Fechar preparo offline" className="rounded-lg p-2 text-white/60 hover:bg-white/10"><X size={20} /></button>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button className="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-40" onClick={prepare} disabled={busy || !online}><Download size={16} />{ready ? latest && latest.version !== installed?.version ? 'Atualizar pacote' : 'Baixar novamente' : `Preparar apresentação${totalBytes ? ` · ${Math.ceil(totalBytes/1048576)} MB` : ''}`}</button>
          {ready && <button className="flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2.5 text-sm font-bold" onClick={verify} disabled={busy}><Check size={16} />Conferir pacote</button>}
          {busy && <button className="rounded-lg border border-white/15 px-4 py-2.5 text-sm" onClick={() => abort.current?.abort()}>Cancelar</button>}
        </div>
        {busy && <progress className="mt-4 w-full accent-cyan-400" max="100" value={progress} aria-label="Progresso do download" />}
        {error && <p className="mt-3 text-sm text-amber-300" role="alert">{error}</p>}
        {installed && <p className="mt-4 text-xs text-white/45">Salvo neste navegador em {new Date(installed.installedAt).toLocaleString('pt-BR')}. Salve este endereço nos favoritos e teste sem internet.</p>}
        <p className="mt-4 text-xs text-white/45">{online ? 'Com conexão' : 'Sem conexão'} · Dados fictícios de demonstração</p>
        {ready && <button className="mt-5 w-full rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-sm font-bold text-cyan-200" onClick={() => setOpen(false)}>Apresentar</button>}
      </section>
    </div>}
  </>;
}
