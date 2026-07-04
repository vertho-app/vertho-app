'use client';

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui';

/**
 * Confirmação padronizada do admin, em 3 níveis de severidade
 * (Reorganização do admin, Fase 2 — substitui os window.confirm()):
 *
 *  - 'normal'   → decisão comum (ex.: regenerar um item)
 *  - 'danger'   → destrutiva recuperável (vai pra lixeira) ou operação cara de IA
 *  - 'critical' → destrutiva irrecuperável/em massa; exige digitar `typedConfirmation`
 *
 * Uso:
 *   const confirm = useConfirm();
 *   const ok = await confirm({ title, message, severity: 'danger' });
 *   if (!ok) return;
 *
 * O provider é montado uma vez no AdminShell.
 */
export type ConfirmOptions = {
  title: string;
  message?: ReactNode;
  severity?: 'normal' | 'danger' | 'critical';
  confirmLabel?: string;
  cancelLabel?: string;
  /** severity 'critical': texto exato que o usuário precisa digitar (ex.: nome da empresa). */
  typedConfirmation?: string;
  /** Escopo/custo em destaque (ex.: "Vai regenerar 42 cenários — operação cara de IA"). */
  scopeNote?: string;
};

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm precisa estar dentro de <ConfirmDialogProvider>');
  return ctx;
}

const SEVERITY = {
  normal:   { accent: '#34c5cc', Icon: AlertTriangle },
  danger:   { accent: '#F97354', Icon: AlertTriangle },
  critical: { accent: '#EF4444', Icon: ShieldAlert },
} as const;

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('Common');
  const [pending, setPending] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);
  const [typed, setTyped] = useState('');
  const cancelRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      setTyped('');
      setPending({ opts, resolve });
    });
  }, []);

  const close = useCallback((result: boolean) => {
    setPending((p) => {
      p?.resolve(result);
      return null;
    });
  }, []);

  // ESC cancela; foco inicial no cancelar (ou no input, se critical)
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(false); };
    window.addEventListener('keydown', onKey);
    const focusTarget = pending.opts.typedConfirmation ? inputRef.current : cancelRef.current;
    focusTarget?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, close]);

  const opts = pending?.opts;
  const severity = opts?.severity ?? 'normal';
  const { accent, Icon } = SEVERITY[severity];
  const needsTyping = severity === 'critical' && !!opts?.typedConfirmation;
  const typedOk = !needsTyping || typed.trim() === opts?.typedConfirmation;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && opts && createPortal(
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(3,12,26,.72)', backdropFilter: 'blur(3px)' }}
            onClick={() => close(false)}
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            className="relative w-full max-w-md rounded-2xl p-5"
            style={{
              background: 'rgba(9,29,53,.97)',
              border: `1px solid ${severity === 'normal' ? 'rgba(255,255,255,.1)' : `${accent}55`}`,
              boxShadow: '0 24px 64px rgba(0,0,0,.5)',
            }}
          >
            <div className="flex items-start gap-3">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${accent}1a`, color: accent }}
              >
                <Icon size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="confirm-dialog-title" className="text-sm font-bold text-white">{opts.title}</h2>
                {opts.message && (
                  <div className="mt-1.5 text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,.65)' }}>
                    {opts.message}
                  </div>
                )}
                {opts.scopeNote && (
                  <p
                    className="mt-2 rounded-lg px-3 py-2 text-xs font-semibold"
                    style={{ background: `${accent}14`, border: `1px solid ${accent}40`, color: accent }}
                  >
                    {opts.scopeNote}
                  </p>
                )}
                {needsTyping && (
                  <div className="mt-3">
                    <p className="text-[11px] mb-1" style={{ color: 'rgba(255,255,255,.5)' }}>
                      {t.rich('confirmDialog.typeToConfirm', {
                        text: opts.typedConfirmation!,
                        b: () => <span className="font-bold text-white select-all">{opts.typedConfirmation}</span>,
                      })}
                    </p>
                    <input
                      ref={inputRef}
                      value={typed}
                      onChange={(e) => setTyped(e.target.value)}
                      className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
                      style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.14)' }}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button ref={cancelRef} variant="ghost" size="sm" onClick={() => close(false)}>
                {opts.cancelLabel ?? t('actions.cancel')}
              </Button>
              <Button
                variant={severity === 'normal' ? 'primary' : 'danger'}
                size="sm"
                disabled={!typedOk}
                onClick={() => close(true)}
              >
                {opts.confirmLabel ?? t('actions.confirm')}
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </ConfirmContext.Provider>
  );
}
