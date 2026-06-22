'use client';
import React from 'react';
import { IconButton } from './primitives';
import { X } from 'lucide-react';

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'textarea:not([disabled])',
  'input:not([disabled])', 'select:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Dialog acessível (modal).
 *
 *   <Dialog open={addColab} onClose={...} title="Adicionar colaborador" footer={...}>
 *     ...campos...
 *   </Dialog>
 *
 * - role=dialog, aria-modal, aria-labelledby (title) / aria-describedby (description)
 * - focus trap (Tab/Shift+Tab dão a volta), Escape fecha
 * - devolve o foco ao elemento que abriu o modal ao fechar
 * - trava o scroll do body enquanto aberto
 * - clique no overlay fecha (configurável)
 */
export function Dialog({
  open = true, onClose, title, description, children, footer,
  size = 440, closeOnOverlay = true, initialFocusRef,
}) {
  const dialogRef = React.useRef(null);
  const titleId = React.useId();
  const descId = React.useId();

  React.useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // foco inicial
    const node = dialogRef.current;
    const target = initialFocusRef?.current
      || node?.querySelector('[data-autofocus]')
      || node?.querySelector(FOCUSABLE)
      || node;
    target?.focus?.();

    function onKeyDown(e) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); return; }
      if (e.key !== 'Tab') return;
      const items = Array.from(node?.querySelectorAll(FOCUSABLE) || []).filter((el) => el.offsetParent !== null);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = prevOverflow;
      if (opener && typeof opener.focus === 'function') opener.focus();
    };
  }, [open, onClose, initialFocusRef]);

  if (!open) return null;

  return (
    <div
      onMouseDown={(e) => { if (closeOnOverlay && e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(3,10,20,0.66)', backdropFilter: 'blur(4px)',
        display: 'grid', placeItems: 'center', zIndex: 50, padding: 20,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        className="ds-card"
        style={{ width: '100%', maxWidth: size, padding: 24, background: 'var(--ds-elev)', maxHeight: '90vh', overflowY: 'auto' }}
      >
        {(title || onClose) && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, marginBottom: description ? 6 : 18 }}>
            {title && <h2 id={titleId} style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{title}</h2>}
            {onClose && <IconButton icon={X} label="Fechar" size={20} onClick={onClose} />}
          </div>
        )}
        {description && <p id={descId} style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--ds-dim)', lineHeight: 1.5 }}>{description}</p>}
        {children}
        {footer && <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>{footer}</div>}
      </div>
    </div>
  );
}
