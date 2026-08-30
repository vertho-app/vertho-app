'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, RotateCcw } from 'lucide-react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

let workerConfigured = false;

async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist');
  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
    workerConfigured = true;
  }
  return pdfjs;
}

function PdfCanvasPage({
  pdf,
  pageNumber,
  totalPages,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  totalPages: number;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const updateWidth = () => setAvailableWidth(Math.max(0, frame.clientWidth));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!availableWidth || !canvasRef.current) return;
    let cancelled = false;
    let renderTask: RenderTask | null = null;

    void (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled || !canvasRef.current) return;
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.max(0.35, Math.min(2.15, availableWidth / baseViewport.width));
      const viewport = page.getViewport({ scale });
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      setRendered(false);
      renderTask = page.render({
        canvas,
        viewport,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
      });
      await renderTask.promise;
      if (!cancelled) setRendered(true);
    })().catch((error: any) => {
      if (!cancelled && error?.name !== 'RenderingCancelledException') {
        console.error(`[pdf-reader] página ${pageNumber}:`, error);
      }
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [availableWidth, pageNumber, pdf]);

  return (
    <article className="mx-auto w-full max-w-[920px]">
      <div className="mb-2 flex items-center gap-3 px-1 text-[9px] font-bold uppercase tracking-[0.18em] text-white/35">
        <span>{String(pageNumber).padStart(2, '0')} / {String(totalPages).padStart(2, '0')}</span>
        <span className="h-px flex-1 bg-white/[0.08]" />
      </div>
      <div
        ref={frameRef}
        className="relative grid w-full place-items-center overflow-hidden rounded-[3px] bg-white shadow-[0_22px_65px_rgba(0,0,0,.34)] ring-1 ring-black/10"
      >
        {!rendered && <div className="absolute inset-0 animate-pulse bg-[#eef1f3]" />}
        <canvas ref={canvasRef} className="relative z-[1] block max-w-full" />
      </div>
    </article>
  );
}

export default function InAppPdfDocument({
  src,
  title,
  loadingLabel,
  errorLabel,
  retryLabel,
}: {
  src: string;
  title: string;
  loadingLabel: string;
  errorLabel: string;
  retryLabel: string;
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    let loadedDocument: PDFDocumentProxy | null = null;
    let loadingTask: ReturnType<Awaited<ReturnType<typeof loadPdfJs>>['getDocument']> | null = null;

    setPdf(null);
    setError(false);

    void (async () => {
      const response = await fetch(src, {
        credentials: 'same-origin',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`PDF HTTP ${response.status}`);
      const data = new Uint8Array(await response.arrayBuffer());
      if (cancelled) return;
      const pdfjs = await loadPdfJs();
      loadingTask = pdfjs.getDocument({ data });
      loadedDocument = await loadingTask.promise;
      if (!cancelled) setPdf(loadedDocument);
    })().catch((loadError: any) => {
      if (!cancelled && loadError?.name !== 'AbortError') {
        console.error('[pdf-reader] documento:', loadError);
        setError(true);
      }
    });

    return () => {
      cancelled = true;
      controller.abort();
      void loadingTask?.destroy();
      void loadedDocument?.destroy();
    };
  }, [attempt, src]);

  if (error) {
    return (
      <div className="grid min-h-[420px] place-items-center rounded-[22px] border border-white/[0.08] bg-[#071829] px-6 text-center">
        <div>
          <AlertCircle size={30} className="mx-auto text-amber-300" />
          <p className="mt-3 text-sm text-white/65">{errorLabel}</p>
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-xs font-bold text-white transition hover:bg-white/[0.09]"
          >
            <RotateCcw size={14} /> {retryLabel}
          </button>
        </div>
      </div>
    );
  }

  if (!pdf) {
    return (
      <div className="grid min-h-[420px] place-items-center rounded-[22px] border border-white/[0.08] bg-[#071829]" role="status" aria-label={loadingLabel}>
        <div className="flex flex-col items-center gap-3 text-[var(--brand-300,#67e8f9)]">
          <Loader2 size={28} className="animate-spin" />
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">{loadingLabel}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="space-y-8 rounded-[22px] border border-white/[0.08] bg-[radial-gradient(circle_at_top,rgba(34,211,238,.07),transparent_34%),#061421] p-3 sm:p-6 lg:p-8"
      aria-label={title}
    >
      {Array.from({ length: pdf.numPages }, (_, index) => (
        <PdfCanvasPage
          key={index + 1}
          pdf={pdf}
          pageNumber={index + 1}
          totalPages={pdf.numPages}
        />
      ))}
    </div>
  );
}
