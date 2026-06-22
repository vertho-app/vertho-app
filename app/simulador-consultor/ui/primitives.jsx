'use client';
import React from 'react';

/* Tokens semânticos → cor. `accent` segue a marca (white-label). */
export const TONES = {
  accent: 'var(--ds-accent)',
  neutral: 'var(--ds-dim)',
  success: 'var(--ds-success)',
  warning: 'var(--ds-warning)',
  danger: 'var(--ds-danger)',
  info: 'var(--ds-info)',
};
const toneColor = (t) => TONES[t] || t || TONES.accent;

/* ----------------------------------------------------------------- *
 * VisuallyHidden — texto só para leitores de tela.
 * ----------------------------------------------------------------- */
export function VisuallyHidden({ children, as: As = 'span', ...rest }) {
  return <As className="ds-sr-only" {...rest}>{children}</As>;
}

/* ----------------------------------------------------------------- *
 * Spinner — decorativo por padrão; passe `label` para anunciar.
 * ----------------------------------------------------------------- */
export function Spinner({ size = 16, label }) {
  return (
    <span
      className="ds-spinner"
      style={{ width: size, height: size }}
      role={label ? 'status' : undefined}
      aria-hidden={label ? undefined : true}
    >
      {label && <VisuallyHidden>{label}</VisuallyHidden>}
    </span>
  );
}

/* ----------------------------------------------------------------- *
 * Button — variantes, tamanhos, loading (aria-busy) e ícone opcional.
 * Ícone é decorativo; o texto é o rótulo acessível.
 * ----------------------------------------------------------------- */
export const Button = React.forwardRef(function Button(
  { variant = 'ghost', size = 'md', icon: Icon, iconRight: IconRight, loading = false,
    disabled = false, block = false, type = 'button', children, className = '', ...rest },
  ref
) {
  const isDisabled = disabled || loading;
  const cls = `ds-btn ds-btn--${variant} ds-btn--${size}${block ? ' ds-btn--block' : ''} ${className}`.trim();
  return (
    <button
      ref={ref}
      type={type}
      className={cls}
      disabled={isDisabled}
      data-busy={loading || undefined}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className="ds-btn__spin"><Spinner size={size === 'sm' ? 14 : 16} /></span>}
      <span className="ds-btn__content">
        {Icon && <Icon size={size === 'sm' ? 14 : 16} aria-hidden="true" />}
        {children}
        {IconRight && <IconRight size={size === 'sm' ? 14 : 16} aria-hidden="true" />}
      </span>
    </button>
  );
});

/* ----------------------------------------------------------------- *
 * IconButton — botão só de ícone. `label` é OBRIGATÓRIO (a11y).
 * ----------------------------------------------------------------- */
export const IconButton = React.forwardRef(function IconButton(
  { icon: Icon, label, size = 18, disabled = false, type = 'button', className = '', ...rest },
  ref
) {
  if (process.env.NODE_ENV !== 'production' && !label) {
    console.warn('IconButton: prop `label` é obrigatória para acessibilidade.');
  }
  return (
    <button ref={ref} type={type} className={`ds-iconbtn ${className}`.trim()}
      aria-label={label} title={label} disabled={disabled} {...rest}>
      <Icon size={size} aria-hidden="true" />
    </button>
  );
});

/* ----------------------------------------------------------------- *
 * Card — superfície. `as` permite virar <section>, <li> etc.
 * ----------------------------------------------------------------- */
export const Card = React.forwardRef(function Card(
  { as: As = 'div', pad = true, className = '', style, children, ...rest },
  ref
) {
  return (
    <As ref={ref} className={`ds-card${pad ? ' ds-card-pad' : ''} ${className}`.trim()} style={style} {...rest}>
      {children}
    </As>
  );
});

/* ----------------------------------------------------------------- *
 * Badge — pílula com tom semântico. `dot` adiciona marcador.
 * Importante: o significado vem do TEXTO + tom, nunca só da cor.
 * ----------------------------------------------------------------- */
export function Badge({ tone = 'neutral', dot = false, icon: Icon, children, style, ...rest }) {
  const c = toneColor(tone);
  const neutral = tone === 'neutral';
  return (
    <span
      className={`ds-badge${neutral ? ' ds-badge--neutral' : ''}`}
      style={neutral ? style : { background: `color-mix(in srgb, ${c} 16%, transparent)`, color: c, ...style }}
      {...rest}
    >
      {dot && <span className="ds-badge__dot" aria-hidden="true" />}
      {Icon && <Icon size={12} aria-hidden="true" />}
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------- *
 * Meter — barra de progresso ACESSÍVEL (role=progressbar).
 * Use para escalas 0–100 (%) ou 0–4 (níveis). `format` controla o texto.
 * ----------------------------------------------------------------- */
export function Meter({
  value, min = 0, max = 100, tone = 'accent', label, showValue = true,
  format = (v) => `${Math.round(v)}%`, hint, className = '', trackStyle,
}) {
  const safe = Number.isFinite(value) ? value : 0;
  const pct = max > min ? Math.max(0, Math.min(100, ((safe - min) / (max - min)) * 100)) : 0;
  const c = toneColor(tone);
  const valueText = format(safe);
  return (
    <div className={className} style={{ marginBottom: 12 }}>
      {(label || showValue) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5, gap: 8 }}>
          {label && <span>{label}</span>}
          {showValue && <span style={{ color: c, fontWeight: 700 }}>{valueText}</span>}
        </div>
      )}
      <div
        className="ds-meter-track"
        style={trackStyle}
        role="progressbar"
        aria-valuenow={Math.round(safe * 10) / 10}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={valueText}
        aria-label={label || undefined}
      >
        <div className="ds-meter-fill" style={{ width: `${pct}%`, background: c }} />
      </div>
      {hint && <div className="ds-hint" style={{ marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

/* ----------------------------------------------------------------- *
 * Skeleton / SkeletonText — placeholders de carregamento.
 * Marque o container com aria-busy="true" e esconda os skeletons de SR.
 * ----------------------------------------------------------------- */
export function Skeleton({ width = '100%', height = 14, radius = 8, style }) {
  return <span className="ds-skeleton" aria-hidden="true"
    style={{ display: 'block', width, height, borderRadius: radius, ...style }} />;
}

export function SkeletonText({ lines = 3, gap = 9 }) {
  return (
    <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={12} width={i === lines - 1 ? '62%' : '100%'} />
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- *
 * EmptyState — estados vazios / de erro / sem resultado.
 * ----------------------------------------------------------------- */
export function EmptyState({ icon: Icon, title, description, action, compact = false }) {
  return (
    <div role="status" style={{
      textAlign: 'center', padding: compact ? '28px 20px' : '52px 24px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    }}>
      {Icon && (
        <div style={{ width: 52, height: 52, borderRadius: 14, display: 'grid', placeItems: 'center',
          background: 'rgba(255,255,255,0.05)', color: 'var(--ds-faint)', marginBottom: 2 }}>
          <Icon size={24} aria-hidden="true" />
        </div>
      )}
      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ds-ink)' }}>{title}</div>
      {description && <div style={{ fontSize: 13, color: 'var(--ds-dim)', maxWidth: 360, lineHeight: 1.5 }}>{description}</div>}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  );
}

/* ----------------------------------------------------------------- *
 * KpiCard — número-chave. `loading` mostra skeleton.
 * ----------------------------------------------------------------- */
export function KpiCard({ label, value, sub, icon: Icon, tone = 'accent', loading = false }) {
  return (
    <Card style={{ flex: 1, minWidth: 0 }} aria-busy={loading || undefined}>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ds-dim)', fontSize: 13 }}>
        <span>{label}</span>
        {Icon && <Icon size={16} style={{ color: toneColor(tone) }} aria-hidden="true" />}
      </div>
      {loading ? (
        <div style={{ marginTop: 10 }}><Skeleton width={72} height={34} radius={8} /></div>
      ) : (
        <div className="serif" style={{ fontSize: 38, lineHeight: 1.1, marginTop: 6 }}>{value}</div>
      )}
      {sub && !loading && <div style={{ fontSize: 12, color: 'var(--ds-faint)', marginTop: 2 }}>{sub}</div>}
    </Card>
  );
}
