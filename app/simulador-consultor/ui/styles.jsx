'use client';
import React from 'react';

/**
 * UIStyles — única fonte de CSS do design system do simulador.
 *
 * Faz a ponte com as CSS vars de tema (--accent, --card, --line, --ink, --dim,
 * --faint, --bg1) que o app define no root para o white-label; cada uma tem
 * fallback, então os componentes funcionam mesmo fora do app. Renderize UMA vez
 * perto da raiz. Classes prefixadas com `ds-` para não colidir com legado.
 */
export function UIStyles() {
  return (
    <style>{`
:where(.ds-root){
  --ds-accent: var(--accent, #34C5CC);
  --ds-accent-ink: var(--bg0, #06172C);
  --ds-card: var(--card, #0c2039);
  --ds-elev: var(--bg1, #091D35);
  --ds-line: var(--line, rgba(255,255,255,0.08));
  --ds-ink: var(--ink, #F3F7FB);
  --ds-dim: var(--dim, rgba(243,247,251,0.62));
  --ds-faint: var(--faint, rgba(243,247,251,0.38));
  --ds-radius: 14px;
  --ds-radius-sm: 10px;
  --ds-success: #2ECC71; --ds-warning: #F4B740; --ds-danger: #E74C3C; --ds-info: #5BA8F2;
}

/* ---- a11y utilities ---- */
.ds-sr-only{ position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden;
  clip:rect(0 0 0 0); white-space:nowrap; border:0; }
.ds-focusable:focus-visible, .ds-root :focus-visible{ outline:2px solid var(--ds-accent); outline-offset:2px; border-radius:6px; }

/* ---- surfaces ---- */
.ds-card{ background:var(--ds-card); border:1px solid var(--ds-line); border-radius:var(--ds-radius); }
.ds-card-pad{ padding:20px; }

/* ---- buttons ---- */
.ds-btn{ cursor:pointer; border:none; font-family:inherit; font-weight:600; border-radius:11px;
  display:inline-flex; align-items:center; justify-content:center; gap:8px; transition:filter .15s, background .15s, opacity .15s;
  white-space:nowrap; position:relative; }
.ds-btn[disabled], .ds-btn[aria-disabled="true"]{ opacity:.55; cursor:not-allowed; }
.ds-btn[data-busy="true"]{ cursor:progress; }
.ds-btn--md{ padding:11px 18px; font-size:14px; }
.ds-btn--sm{ padding:8px 13px; font-size:13px; }
.ds-btn--primary{ background:var(--ds-accent); color:var(--ds-accent-ink); }
.ds-btn--primary:not([disabled]):hover{ filter:brightness(1.07); }
.ds-btn--ghost{ background:rgba(255,255,255,0.05); color:var(--ds-ink); border:1px solid var(--ds-line); }
.ds-btn--ghost:not([disabled]):hover{ background:rgba(255,255,255,0.09); }
.ds-btn--subtle{ background:transparent; color:var(--ds-dim); }
.ds-btn--subtle:not([disabled]):hover{ background:rgba(255,255,255,0.06); color:var(--ds-ink); }
.ds-btn--danger{ background:color-mix(in srgb,var(--ds-danger) 18%,transparent); color:var(--ds-danger); border:1px solid color-mix(in srgb,var(--ds-danger) 40%,transparent); }
.ds-btn--danger:not([disabled]):hover{ background:color-mix(in srgb,var(--ds-danger) 26%,transparent); }
.ds-btn--block{ width:100%; }
.ds-btn__content{ display:inline-flex; align-items:center; gap:8px; }
.ds-btn[data-busy="true"] .ds-btn__content{ visibility:hidden; }
.ds-btn__spin{ position:absolute; display:inline-flex; }

.ds-iconbtn{ cursor:pointer; border:none; background:transparent; color:var(--ds-dim); display:inline-flex;
  align-items:center; justify-content:center; border-radius:10px; padding:8px; transition:background .15s,color .15s; }
.ds-iconbtn:not([disabled]):hover{ background:rgba(255,255,255,0.07); color:var(--ds-ink); }
.ds-iconbtn[disabled]{ opacity:.5; cursor:not-allowed; }

/* ---- badges / chips ---- */
.ds-badge{ font-size:12px; font-weight:600; padding:4px 10px; border-radius:999px; display:inline-flex;
  align-items:center; gap:6px; line-height:1.3; }
.ds-badge__dot{ width:6px; height:6px; border-radius:99px; background:currentColor; flex-shrink:0; }
.ds-badge--neutral{ background:rgba(255,255,255,0.06); color:var(--ds-dim); }

/* ---- meter / progress ---- */
.ds-meter-track{ height:7px; border-radius:99px; background:rgba(255,255,255,0.09); overflow:hidden; }
.ds-meter-fill{ height:100%; border-radius:99px; background:var(--ds-accent); transition:width .4s ease; }

/* ---- field ---- */
.ds-field{ display:flex; flex-direction:column; gap:7px; }
.ds-label{ font-size:12.5px; color:var(--ds-dim); font-weight:600; }
.ds-label__req{ color:var(--ds-danger); margin-left:3px; }
.ds-input{ width:100%; background:rgba(255,255,255,0.05); border:1px solid var(--ds-line); color:var(--ds-ink);
  border-radius:10px; padding:10px 13px; font-size:14px; outline:none; font-family:inherit; transition:border-color .15s; }
.ds-input::placeholder{ color:var(--ds-faint); }
.ds-input:focus{ border-color:var(--ds-accent); }
.ds-input[aria-invalid="true"]{ border-color:var(--ds-danger); }
.ds-input[disabled]{ opacity:.6; cursor:not-allowed; }
.ds-hint{ font-size:12px; color:var(--ds-faint); }
.ds-error{ font-size:12px; color:var(--ds-danger); display:flex; align-items:center; gap:5px; }

/* ---- tabs ---- */
.ds-tablist{ display:flex; gap:20px; border-bottom:1px solid var(--ds-line); flex-wrap:wrap; }
.ds-tab{ cursor:pointer; padding:9px 2px; font-size:14px; font-weight:600; color:var(--ds-dim);
  border:none; background:none; font-family:inherit; border-bottom:2px solid transparent; transition:color .15s; }
.ds-tab:hover{ color:var(--ds-ink); }
.ds-tab[aria-selected="true"]{ color:var(--ds-ink); border-color:var(--ds-accent); }
.ds-tab__sup{ font-size:9px; margin-left:4px; color:var(--ds-faint); font-weight:700; letter-spacing:.04em; }

/* ---- skeleton ---- */
.ds-skeleton{ background:linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.11) 37%, rgba(255,255,255,0.05) 63%);
  background-size:400% 100%; animation:ds-shimmer 1.4s ease infinite; border-radius:8px; }
@keyframes ds-shimmer{ 0%{ background-position:100% 0; } 100%{ background-position:0 0; } }

/* ---- spinner ---- */
.ds-spinner{ display:inline-block; border-radius:50%; border:2px solid rgba(255,255,255,0.25);
  border-top-color:currentColor; animation:ds-spin .7s linear infinite; }
@keyframes ds-spin{ to{ transform:rotate(360deg); } }

/* ---- stepper (jornada guiada) ---- */
.ds-stepper{ display:flex; gap:8px; overflow-x:auto; padding-bottom:4px; }
.ds-step{ flex:1 1 0; min-width:118px; display:flex; flex-direction:column; align-items:center; gap:8px;
  cursor:pointer; background:none; border:none; font-family:inherit; padding:10px 6px; border-radius:12px; color:var(--ds-dim); }
.ds-step:not(:disabled):hover{ background:rgba(255,255,255,0.04); color:var(--ds-ink); }
.ds-step:disabled{ cursor:not-allowed; }
.ds-step.on{ color:var(--ds-ink); }
.ds-step.on .ds-step__label{ font-weight:700; }
.ds-step__dot{ width:36px; height:36px; border-radius:999px; display:grid; place-items:center; font-weight:800; font-size:15px;
  border:1.5px solid var(--ds-line); transition:background .15s; }
.ds-step__dot--done{ background:var(--ds-success); color:#06231a; border-color:transparent; }
.ds-step__dot--current{ background:var(--ds-accent); color:var(--ds-accent-ink); border-color:transparent;
  box-shadow:0 0 0 4px color-mix(in srgb,var(--ds-accent) 22%,transparent); }
.ds-step__dot--locked{ background:rgba(255,255,255,0.04); color:var(--ds-faint); }
.ds-step__label{ font-size:12px; text-align:center; line-height:1.25; }

/* ---- disclosure (progressive detail) ---- */
.ds-details{ border-top:1px solid var(--ds-line); }
.ds-details > summary{ cursor:pointer; list-style:none; display:inline-flex; align-items:center; gap:7px;
  font-size:13px; font-weight:600; color:var(--ds-dim); padding:10px 0; }
.ds-details > summary::-webkit-details-marker{ display:none; }
.ds-details > summary:hover, .ds-details[open] > summary{ color:var(--ds-ink); }

/* ---- layout helpers ---- */
.ds-grid-2{ display:grid; grid-template-columns:1fr 1fr; gap:16px; align-items:start; }
.ds-shell{ display:flex; min-height:100vh; }
.ds-sidebar{ width:232px; flex-shrink:0; border-right:1px solid var(--ds-line); padding:22px 16px;
  display:flex; flex-direction:column; gap:6px; }

@media (max-width:920px){
  .ds-grid-portfolio{ grid-template-columns:1fr !important; }
}
@media (max-width:640px){
  .ds-step__label{ display:none; }
  .ds-step{ min-width:48px; flex:0 0 auto; }
}
@media (max-width:820px){
  .ds-grid-2{ grid-template-columns:1fr; }
  .ds-shell{ flex-direction:column; }
  .ds-sidebar{ width:auto; flex-direction:row; align-items:center; gap:10px; overflow-x:auto;
    border-right:none; border-bottom:1px solid var(--ds-line); padding:12px 14px; }
  .ds-sidebar > .ds-sidebar-brand{ margin-right:6px; }
  .ds-sidebar > .ds-sidebar-foot{ display:none; }
}

@media (prefers-reduced-motion: reduce){
  .ds-root *{ animation-duration:.001ms !important; transition:none !important; }
}
`}</style>
  );
}
